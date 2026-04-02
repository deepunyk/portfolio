---
title: "Business-Context Logging With async_hooks, Not Just Request IDs"
description: "We wanted logs to carry business identifiers automatically, not just request IDs. The useful lesson was that async context propagation is also a lifecycle problem, and a naive map-based store can quietly turn observability code into a memory leak."
date: "2022-12-14"
tags: ["nodejs", "async-hooks", "logging", "observability"]
published: true
---

Request IDs are useful, but they stop one step short of the questions I usually end up asking in production.

When debugging a flow, the useful question is rarely only "which request was this?" It is usually some combination of:

- which account this belonged to
- which customer or collection was involved
- which workflow or entity we were processing
- which background flow or queue handler owned the work

Passing those values through every function works, but it gets ugly fast. So like a lot of teams, we wanted a context mechanism that could attach that metadata once and make it available everywhere else automatically.

That part worked.

The first version also helped create a memory leak in production.

I will write about the leak hunt separately. This post is about the design lesson that came out of it: async context propagation is not just an observability feature. It is also a lifecycle problem, and if you get that wrong, your logging layer can become the thing destabilizing the app.

## The Goal Was Business Context, Not Just Correlation

Most writing on request context in Node stops at a familiar pattern:

- use `AsyncLocalStorage` or `async_hooks`
- attach a `requestId`
- read it later in the logger

That is a fine starting point, but it was not quite what we needed.

We wanted the logger to pick up business identifiers automatically. Things like `accountId`, `customerId`, `entityId`, and flow-level markers mattered more to day-to-day debugging than a generic correlation ID on its own.

The payoff we were after was simple:

- logs should include those identifiers without plumbing them through every call
- Sentry events should carry the same context
- code running in HTTP handlers, queue consumers, and other async flows should all get the same behavior

In other words, we wanted context propagation to feel like infrastructure instead of repeated application code.

## The First Version Looked Harmless

The first store was basically the default naive thing you build when you first reach for `async_hooks`.

We kept a `Map<number, Record<string, unknown>>`, keyed by async execution. When a new async resource was created, we copied the parent context forward. Later, the logger would read whatever context was associated with the current execution.

At a high level, the shape looked like this:

```ts
const store = new Map<number, Record<string, unknown>>();

createHook({
  init(asyncId, _type, triggerAsyncId) {
    const parentContext = store.get(triggerAsyncId);

    if (parentContext) {
      store.set(asyncId, { ...parentContext });
    }
  },
}).enable();
```

On the surface, that feels reasonable.

Attach metadata once. Copy it to child async resources. Read it later from anywhere in the call chain. Done.

The problem is that this only models half the lifecycle.

We had written the part where async resources are born. We had not been disciplined enough about the part where they die.

## The Hard Part Is Not `set()` And `get()`

Passing IDs through every function is ugly, but replacing that ugliness with hidden async state is not free.

The hard part of async context is not writing `set()` and `get()`. It is understanding when data stops being owned.

That was the piece that had been underestimated.

If you keep per-async-resource state in a map, you are also taking responsibility for the lifetime of those entries. If cleanup is incomplete or inconsistent, those records can accumulate quietly over time.

That is exactly the kind of problem that slips past you early on, because the abstraction feels so convenient. The logger still works. The context still shows up. Nothing in the API shape warns you that the observability layer is now also holding memory on behalf of async resources you stopped thinking about a long time ago.

In production, that subtlety matters.

Observability abstractions live on hot paths. If they leak, they leak everywhere.

## Reading The Platform More Closely Changed My Mental Model

This was the kind of bug that forces a closer read of platform internals and open source code instead of trusting the nice, simple shape of the abstraction.

The gap was not in our logger API. The gap was in my mental model of async resource lifecycles.

`async_hooks` does let you observe when new resources are initialized. But if you are storing per-resource data, you also need to care about cleanup events and about the difference between:

- the currently executing async resource
- the resource that triggered a child resource
- the moment when that resource is actually destroyed

Once I looked at the problem through that lens, the bug stopped feeling mysterious.

We were not just "tracking context." We were managing state whose lifetime was coupled to async resources. That made the cleanup path part of the core design, not an implementation detail.

## The Fix Was To Model The Full Lifecycle

The fix was not especially fancy. It was just more honest about ownership.

We kept the propagation behavior on `init`, but we paired it with explicit cleanup on `destroy`.

The corrected shape looked like this:

```ts
const store = new Map<number, Record<string, unknown>>();

createHook({
  init(asyncId, _type, triggerAsyncId) {
    const parentContext = store.get(triggerAsyncId);

    if (parentContext) {
      store.set(asyncId, { ...parentContext });
    }
  },

  destroy(asyncId) {
    store.delete(asyncId);
  },
}).enable();
```

That `destroy` hook is the real lesson here.

The important takeaway is not "put stuff in a map." It is "if you store context per async resource, you need a cleanup strategy tied to that resource's lifecycle."

Without that, you do not really have context propagation. You have context retention.

## The Store Became More Useful Once It Was Safe

Once the lifecycle was handled properly, the pattern became genuinely useful.

The store was not only carrying request IDs. It had helpers for domain identifiers that mattered to the actual product. That changed the quality of the logs quite a bit.

Instead of having log lines that only said "request `abc123` failed," we could automatically see the identifiers that made the event meaningful to the people debugging it.

That meant the logger could inject a shared `_context` block into every log record without every service having to pass those values around manually.

Conceptually, it looked like this:

```ts
function getContextData() {
  return {
    requestId: executionContext.get("requestId"),
    accountId: executionContext.get("accountId"),
    customerId: executionContext.get("customerId"),
    entityId: executionContext.get("entityId"),
    flowName: executionContext.get("flowName"),
  };
}
```

That is where the abstraction starts paying rent.

Application code gets to stay focused on behavior, while logs pick up the surrounding business context automatically.

## The Same Context Powered Sentry Too

One part I liked about the final design was that the context mechanism was not only for local logs.

The logger could also reuse the same context when sending errors to Sentry. So if an exception bubbled up in a queue consumer or an HTTP path, the error event still carried the same account, customer, or flow metadata that was already showing up in logs.

That matters because logs and error trackers are usually most useful together.

Sentry is good at telling you that something failed. Logs are better for seeing the surrounding sequence of events. If both systems carry the same business context, moving between them becomes much less annoying.

That is a much better outcome than having one request ID in logs, a different event ID in Sentry, and no obvious way to connect the two to the actual domain object you care about.

## Flow Boundaries Matter More Than Request Boundaries

Another reason I like this pattern is that it works outside HTTP request handling.

Request middleware is the common example, but some of the more useful cases are actually background or event-driven flows.

For example, in one consumer path, the code sets `accountId` at the start of handling a message, does the work, and then clears it in a `finally` block. That is a small detail, but it is an important one.

It makes the flow boundary explicit:

- context is entered at the beginning of the async workflow
- child async work inherits it automatically
- flow-specific values are cleared when the workflow ends

That same idea also helps in cron jobs, queue handlers, and other places where there is no neat request middleware shape to lean on.

This is why I think of async context as broader than request context. The useful boundary is not always an HTTP request. Sometimes it is "this unit of business work."

## What I Like About This Pattern Now

The interesting part of this design is not the API. It is the combination of convenience and discipline.

The convenience is obvious:

- you stop threading IDs through every function
- logs become more domain-aware
- Sentry gets better context for free
- downstream services that persist application logs can fall back to execution context when needed

The discipline is less obvious, but more important:

- async context storage is stateful infrastructure
- stateful infrastructure needs explicit ownership rules
- async resource cleanup is part of correctness, not an optimization

That second list is what the first version taught me.

## If I Were Building This Again

If I were setting this up from scratch today, I would keep a few rules explicit from the beginning.

1. Decide early whether the context you care about is technical, business, or both. A `requestId` alone is often not enough.
2. Treat per-async-resource storage as a memory-management problem, not just a convenience layer.
3. If you propagate context on `init`, make the cleanup path on `destroy` equally explicit.
4. Enter and clear context at real workflow boundaries, especially in consumers, jobs, and other non-HTTP paths.
5. Reuse the same context source for logs and error reporting so you do not build two parallel observability systems.

I would also test it more like infrastructure than like a helper library.

That means checking:

- nested promise chains
- timers
- database calls
- outbound HTTP
- queue or event consumers
- cleanup behavior under sustained load

And I would look at memory while doing it, not just whether the log lines look correct.

That is the part I would stress most now. A context propagation layer is easy to judge by ergonomics alone because the happy path feels great. But the real question is whether it stays invisible under pressure.

## The Main Lesson

The end result of this pattern is still useful.

Having logs and Sentry events automatically carry `accountId`, `entityId`, `customerId`, or `flowName` is genuinely useful. It makes production debugging much closer to the shape of the actual business workflow, and it removes a lot of boring plumbing from application code.

But the abstraction is only trustworthy when the harder lesson behind it is handled explicitly.

Async context propagation is not only about correlation. It is also about lifecycle.

If you do not model cleanup explicitly, the convenience can come with a hidden bill. If you do, the pattern becomes one of the more practical observability tools you can add to a Node backend.
