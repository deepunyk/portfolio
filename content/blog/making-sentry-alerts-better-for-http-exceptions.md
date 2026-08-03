---
title: "Making Sentry Alerts Better For HTTP Exceptions"
description: "Default Sentry alerts for outbound HTTP failures were too generic to act on quickly. This is a pattern that works well: group by method, URL, and status, carry over the useful response body, and scrub the sensitive parts before the event leaves the process."
date: "2023-02-01"
tags: ["sentry", "http", "observability", "error-handling"]
published: true
---

One thing that shows up with Sentry is that an alert can be technically correct and still not be very useful.

HTTP client failures are a good example. If an application throws because an outbound request failed, Sentry captures it fine, a stack trace, the exception name, enough to know something broke. But the grouping is rarely built around the question you actually want answered. When an HTTP call fails, what you want to know is which upstream call it was, what method, whether it came back 401, 404, 429, 500, or never came back at all, and what the upstream actually sent. The default event doesn't make those distinctions. Different failures collapse into one noisy issue, or the title stays tied to the client library instead of the failing request, and alert fatigue sets in fast.

## Fixing it in beforeSend

The fix here wasn't a new tool or a wrapper around the HTTP client. It was a small `beforeSend` hook in Sentry, which runs right before the event goes out, and is a fine place to look at the original exception, recognize it came from an HTTP client, and reshape the event before it leaves.

There were three things worth doing there: fingerprint the event on the request and outcome, rename the exception so the issue title reads like the failed request, and attach the response body when it's what actually explains the failure.

## Grouping by method, URL, and status

For HTTP exceptions the grouping key that's worked best is request method, request URL, and response status (or the network error code if there was no response):

```ts
event.fingerprint = [method, url, String(status ?? code)];
```

That beats relying on the raw client exception name alone. A `GET /users` 404 and a `POST /users` 500 aren't the same problem even if they came from the same call site and the same library, and grouping them separately makes the alert honest about that. It also helps when one endpoint fails in more than one way over time — a 401 points somewhere different than a 429 or a 500, and if they all land in the same Sentry issue the thread gets hard to follow.

## Rewriting the issue title

It also helps to rewrite the exception type. Instead of a generic name from the HTTP client, the issue title should say something closer to:

`GET /api/accounts 403`

or

`POST https://service.example.com/v1/jobs 500`

That's a lot easier to scan in a list view than a wall of `AxiosError`, `FetchError`, or whatever wrapper the library uses. It's a small ergonomics change, but it pays off every time you're triaging noise — a good title lets you decide whether to open the issue at all.

## Carrying the response body over

A lot of HTTP failures aren't really explained by the stack trace. The explanation is in the response body — validation details from another API, an auth error message, a rate-limit response, a business rule rejection, sometimes plain text from a legacy service. Without that body in the event, you know the request failed and then have to go hunting for why.

So when there's a response object, it's worth adding the response data to the Sentry event extras, and where it makes sense, into the captured exception value too.

## Sanitization still has to run

Once you're enriching events from HTTP exceptions, you have to think about what else is riding along on that request. Headers, tokens, cookies, and bodies slip into captured events more easily than you'd expect.

We already had a sanitization step that strips sensitive headers from Sentry events. The HTTP enrichment runs before that step, and sanitization runs last, right before the event leaves the process. Getting that order right matters — the point of adding context is to make alerts easier to act on, not to leak credentials into the error tracker.

## The code

This is the shape that works. It's written against Axios because that's what the app used, but the pattern isn't Axios-specific.

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

The exact syntax matters less than the fact that the event gets rebuilt around the failing call instead of being left in whatever shape the client library handed it.

## What changes

After this, a Sentry issue answers most of the first debugging questions on its own: which call failed, whether it was auth, a missing resource, a rate limit, or an upstream crash, what the upstream actually said, and whether this looks like the same recurring failure or a new one. That's less time spent opening logs just to figure out what category of failure you're even looking at. And instead of one bucket labeled "HTTP client errors," the issues line up with where the debugging actually happens — the endpoint and the outcome.

## Staying generic

This came out of a real code path in a production server, but the pattern itself isn't specific to it. It applies anywhere outbound HTTP calls matter to the product, your error tracker captures the raw client exception, and the default grouping is too coarse or too tied to the library. Axios, `fetch`, `got`, a GraphQL client, a homegrown wrapper — doesn't matter. Failures from remote calls usually need their own grouping because the stack trace is only part of the story.

## A sharp edge with URL cardinality

If you fingerprint on the raw URL and that URL has IDs, query strings, or timestamps in it, you can end up with far too many issues. `GET /users/123`, `GET /users/456`, and `GET /users/789` are probably the same failure shape, and splitting them into separate issues just because the resource ID differs creates noise instead of clarity. If your URLs are dynamic, normalize them first — strip query params, swap IDs for placeholders, or use a route template if your client exposes one. The grouping key needs to be specific enough to separate real classes of failure without turning every request into its own issue.

## Response bodies aren't automatically safe

Before attaching a response body to an event, it's worth checking whether the payload can carry tokens or personal data, whether it's large enough to make Sentry noisy, whether it's JSON, plain text, or an HTML error page, and whether you actually want the whole thing or just a couple of fields. A good default is to keep only what answers "why did the upstream reject this," and to leave the sanitization step in place regardless.

## How I'd test this

This kind of change is easy to feel good about and still get wrong. A few things worth checking deliberately:

1. Trigger the same endpoint with two different statuses, like `401` and `500`, and confirm Sentry creates separate issues.
2. Trigger two different endpoints with the same status and confirm they don't collapse into one.
3. Check that the response payload shows up in event extras when it's actually useful.
4. Verify auth headers and other sensitive fields aren't present in the captured event.
5. If the URL is dynamic, confirm the normalization doesn't explode the issue count.

That last one matters more than it sounds — it's easy to improve grouping on paper and make it too granular in practice.

HTTP exceptions carry a request, a response, a status code, and a remote system boundary, and preserving that in Sentry is most of what makes the alert usable. A good alert should read like how you'd describe the incident to another engineer. `AxiosError at line 184` doesn't do that. `POST /billing/subscriptions 422` does.
