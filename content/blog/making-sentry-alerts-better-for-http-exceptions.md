---
title: "Making Sentry Alerts Better For HTTP Exceptions"
description: "Default Sentry alerts for outbound HTTP failures were too generic to act on quickly. This is a pattern that works well: group by method, URL, and status, carry over the useful response body, and scrub the sensitive parts before the event leaves the process."
date: "2023-02-01"
tags: ["sentry", "http", "observability", "error-handling"]
published: true
---

One thing that shows up with Sentry is that an alert can be technically correct and still not be very useful.

HTTP client failures are a good example.

If an application throws because an outbound request failed, Sentry will usually capture it just fine. You get a stack trace. You get the exception name. You get enough context to know something broke.

But the grouping is often not shaped around the question you actually want answered.

When looking at an HTTP failure, the useful questions are usually some combination of:

- which upstream call failed
- what method we were using
- whether it was a 401, 404, 429, 500, or a network failure
- what the upstream actually sent back

The default event shape does not always make those distinctions obvious. Different HTTP failures can collapse into one noisy issue. Or the issue title can stay tied to the client library instead of the failing request. That is enough to create alert fatigue pretty quickly.

## The Small Change That Helped

In our case the fix was not a new monitoring product or a big wrapper around the HTTP client. It was a small `beforeSend` hook in Sentry.

That hook runs right before the event is sent. It is a good place to look at the original exception, recognize that it came from an HTTP client, and reshape the event into something more useful.

The useful version has three jobs:

- fingerprint the event based on the HTTP request and outcome
- rename the exception so the issue title reads like the failed request
- attach the response body when that body is what actually explains the failure

That gives Sentry a better idea of what counts as the same problem.

## What I Group By

For HTTP exceptions, the most useful grouping key has usually been:

- request method
- request URL
- response status, or the network error code if there was no response

That gives a grouping like this:

```ts
event.fingerprint = [method, url, String(status ?? code)];
```

This works better than relying on the raw client exception name alone.

A `GET /users` 404 and a `POST /users` 500 are not the same problem, even if both came from the same call site and the same HTTP library. Grouping them separately makes the alert much more honest.

It also helps when the same endpoint fails in different ways. A 401 usually points to auth. A 429 points to rate limiting. A 500 points to an upstream bug or outage. If those all land in one Sentry issue, the thread becomes hard to reason about.

## The Issue Title Matters More Than People Think

It also helps to rewrite the exception type for these events.

Instead of keeping a generic exception name from the HTTP client, it is better when the issue title says something closer to:

`GET /api/accounts 403`

or

`POST https://service.example.com/v1/jobs 500`

That is much easier to scan in a Sentry list view than a wall of `AxiosError`, `FetchError`, or some other library-specific wrapper.

This is a small ergonomics improvement, but it pays back every time you are triaging production noise. A good alert title lets you decide whether to dig in without opening every issue first.

## The Response Body Is Often The Real Error Message

Another thing that helped was carrying over the upstream response payload when it exists.

A lot of HTTP failures are not really explained by the stack trace. The real explanation is in the response body:

- validation details from another API
- an auth error message
- a rate-limit response
- a business rule rejection
- some plain-text failure from a legacy service

If that body is missing from the event, the alert can feel one step removed from the real problem. You know the request failed, but you still have to go hunting for the actual reason.

So when there is a response object, it helps to add the response data into Sentry event extras and, when it makes sense, into the captured exception value as well.

That gets the alert closer to the thing a human actually needs to read.

## The Part Worth Not Skipping

If you enrich Sentry events from HTTP exceptions, you also need to think about what else is riding along with that request.

Headers, tokens, cookies, and request bodies can slip into captured events surprisingly easily.

In our setup we already had a sanitization step that removes sensitive headers from Sentry events. The HTTP-specific enrichment still runs before that final sanitization, and then the sanitization step runs before the event leaves the process.

That ordering matters.

The point of adding more context is to make alerts easier to act on, not to leak credentials into the error tracker.

## A Trimmed Example

This is the code shape that works well. It uses Axios because that is what we were using in the app, but the pattern is not Axios-specific.

```ts
beforeSend: (event, hint) => {
  const error = hint.originalException;

  if (error && axios.isAxiosError(error)) {
    const method = error.config?.method?.toUpperCase() ?? "UNKNOWN";
    const url = error.config?.url ?? "unknown-url";
    const statusOrCode = String(error.response?.status ?? error.code ?? "unknown");

    event.fingerprint = [method, url, statusOrCode];

    if (event.exception?.values?.[0]) {
      event.exception.values[0].type = `${method} ${url} ${statusOrCode}`;
    }

    if (error.response?.data) {
      event.extra = {
        ...event.extra,
        error_response: error.response.data,
      };

      if (event.exception?.values?.[0]) {
        event.exception.values[0].value =
          typeof error.response.data === "string"
            ? error.response.data
            : JSON.stringify(error.response.data);
      }
    }
  }

  sanitizeSentryEvent(event);
  return event;
};
```

The important part is not the exact syntax. The important part is that the event gets reshaped around the failing HTTP call instead of being left in the default client-library shape.

## Why This Made The Alerts Better

The improvement was mostly about reducing ambiguity.

After this kind of change, a Sentry issue starts answering the first few debugging questions on its own:

- which outbound call failed
- whether it was a method mismatch, auth problem, missing resource, rate limit, or upstream crash
- what the upstream actually said
- whether this looks like the same recurring failure or a different class of problem

That means less time opening logs just to identify the category of failure.

It also makes issue grouping calmer. Instead of one big bucket of "HTTP client errors," you get issues that line up with the boundary where the real debugging work happens: the specific endpoint and outcome.

## Where I Would Keep This Generic

Even though this came out of a real code path in a production server, the pattern itself should stay fairly generic.

It applies anywhere you have all three of these conditions:

- outbound HTTP calls matter to the product
- your error tracker captures the raw client exception
- the default grouping is too coarse or too library-shaped

That could be Axios, `fetch`, `got`, a GraphQL client, or a homegrown wrapper. The core idea is the same: failures from remote calls often need their own grouping rules because the stack trace is only part of the story.

## One Caution About URL Cardinality

There is one sharp edge here.

If you fingerprint on the full raw URL and that URL contains IDs, query strings, timestamps, or other high-cardinality values, you can end up with too many separate issues.

For example, these might really be the same failure shape:

- `GET /users/123`
- `GET /users/456`
- `GET /users/789`

If the only difference is the resource ID, splitting them into separate Sentry issues may create noise instead of clarity.

So if your URLs are highly dynamic, normalize them before using them in the fingerprint. Strip query parameters, replace IDs with placeholders, or use a route template if your HTTP client has one.

That is one of those details worth deciding deliberately. The right grouping key is specific enough to separate different classes of failure, but not so specific that every request becomes its own issue.

## Another Caution About Response Bodies

Response bodies are useful, but they are not automatically safe.

Before attaching them to the event, think about:

- whether the payload can include tokens or personal data
- whether the payload is large enough to make Sentry noisy
- whether the payload is structured JSON, plain text, or HTML error pages
- whether you really want the entire body or just a few fields

A good default is to include only what helps answer "why did the upstream reject this request?" and to keep the sanitization step in place.

## How I Would Test This

This kind of change is easy to feel good about and still get wrong, so I would test it with a few deliberately different failure modes:

1. Trigger the same endpoint with two different statuses, like `401` and `500`, and make sure Sentry creates separate issues.
2. Trigger two different endpoints with the same status and make sure they do not collapse into one issue.
3. Check that the response payload is visible in the event extras when it is actually useful.
4. Verify that auth headers or other sensitive fields are not present in the captured event.
5. If the URL is dynamic, confirm that your normalization strategy does not explode the number of issues.

That last check matters more than it sounds. It is very easy to improve grouping in theory and accidentally make it too granular in practice.

## The Main Lesson

The useful part of this pattern is that it treats HTTP exceptions as their own observability shape.

They are not just ordinary exceptions that happened to involve the network. They usually carry a request, a response, a status code, and a remote system boundary. If you preserve that shape in Sentry, the alert becomes much more actionable.

A good Sentry alert should tell you what failed in a way that matches how you would explain the incident to another engineer.

For HTTP exceptions, `AxiosError at line 184` is usually not that description.

`POST /billing/subscriptions 422` is a lot closer.
