---
title: "Business-Context Logging With async_hooks, Not Just Request IDs"
description: "We wanted logs to carry business identifiers automatically, not just request IDs. The useful lesson was that async context propagation is also a lifecycle problem, and a naive map-based store can quietly turn observability code into a memory leak."
date: "2022-12-14"
tags: ["nodejs", "async-hooks", "logging", "observability"]
published: true
---

Request IDs are useful, but they stop one step short of the questions I usually end up asking in production.

When debugging a flow, I'm rarely just asking "which request was this?" It's usually some combination of: which account this belonged to, which customer or collection was involved, which workflow or entity we were processing, which background flow or queue handler owned the work.

Passing those values through every function works, but it gets ugly fast. So like a lot of teams, we wanted a context mechanism that could attach that metadata once and make it available everywhere else automatically.

That part worked. The first version also helped create a memory leak in production.

I'll write about the leak hunt itself separately. This post is about the design lesson that came out of it: propagating async context is a lifecycle problem as much as an observability one, and getting that wrong can make your logging layer the thing destabilizing the app.

## Business context, not just correlation

Most writing on request context in Node stops at a familiar pattern: use `AsyncLocalStorage` or `async_hooks`, attach a `requestId`, read it later in the logger. That's a fine starting point, but it wasn't quite what we needed.

We wanted the logger to pick up business identifiers automatically. Things like `accountId`, `customerId`, `entityId`, and flow-level markers mattered more to day-to-day debugging than a generic correlation ID on its own. Logs should include those identifiers without plumbing them through every call. Sentry events should carry the same context. Code running in HTTP handlers, queue consumers, and other async flows should all get the same behavior for free, without every service having to wire it up itself.

## The first version

The first store was basically the default thing you build the first time you reach for `async_hooks`. We kept a `Map<number, Record<string, unknown>>`, keyed by async execution. When a new async resource was created, we copied the parent context forward. Later, the logger would read whatever context was associated with the current execution.

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

Attach metadata once, copy it to child async resources, read it later from anywhere in the call chain. On the surface that feels complete. It only models half the lifecycle, though: we'd written the part where async resources are born, and hadn't been disciplined about the part where they die.

## Ownership, not just get and set

Passing IDs through every function is ugly, but replacing that ugliness with hidden async state isn't free. Writing `set()` and `get()` isn't the hard part. Knowing when data stops being owned is.

If you keep per-async-resource state in a map, you've also taken on responsibility for the lifetime of those entries. When cleanup is incomplete or inconsistent, those records accumulate quietly, and nothing in the API shape warns you that your observability layer is now holding memory on behalf of async resources you stopped thinking about a long time ago. Observability code lives on hot paths. If it leaks, it leaks everywhere.

## Reading the platform more closely

This was the kind of bug that forces a closer read of platform internals instead of trusting the simple shape of the abstraction. Closing the gap meant fixing my mental model of async resource lifecycles, not the logger API.

`async_hooks` lets you observe when new resources are initialized, but if you're storing per-resource data you also need to care about cleanup events, and about the difference between the currently executing async resource, the resource that triggered a child resource, and the moment that resource is actually destroyed. Once I looked at the problem through that lens it stopped feeling mysterious. We were managing state whose lifetime was coupled to async resources, which meant cleanup belonged in the core design, not an afterthought.

## Modeling the full lifecycle

The fix wasn't fancy. We kept the propagation behavior on `init`, but paired it with explicit cleanup on `destroy`.

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

That `destroy` hook is the real lesson: if you store context per async resource, you need a cleanup strategy tied to that resource's lifecycle. Without it, you don't have context propagation. You have context retention.

## Once it was safe

Once the lifecycle was handled properly, the pattern became genuinely useful. The store wasn't only carrying request IDs anymore, it had helpers for domain identifiers that mattered to the actual product, and that changed the quality of the logs quite a bit. Instead of a log line that only said "request `abc123` failed," we could see the identifiers that made the event mean something to whoever was debugging it. The logger could inject a shared `_context` block into every log record without every service having to pass those values around manually.

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

Application code stays focused on behavior, and logs pick up the surrounding business context automatically.

## Sentry got the same context

One part I liked about the final design: the context mechanism wasn't only for local logs. The logger reused the same context when sending errors to Sentry, so if an exception bubbled up in a queue consumer or an HTTP path, the error event carried the same account, customer, or flow metadata that was already showing up in logs.

Sentry is good at telling you something failed. Logs are better for the surrounding sequence of events. Sharing business context between the two beats having one request ID in logs, a different event ID in Sentry, and no obvious way to connect either back to the domain object you actually care about.

## Flow boundaries, not just request boundaries

Request middleware is the common example for this kind of context, but some of the more useful cases are background or event-driven flows with no request middleware shape to lean on. In one consumer path, the code sets `accountId` at the start of handling a message, does the work, and clears it in a `finally` block. That's a small detail, but it makes the flow boundary explicit: context enters at the start of the async workflow, child async work inherits it automatically, and flow-specific values clear when the workflow ends. The same idea holds up in cron jobs and other queue handlers, where the useful boundary isn't an HTTP request at all but just "this unit of business work."

## What I'd keep from this

The convenience is easy to sell: you stop threading IDs through every function, logs get more domain-aware, Sentry gets better context for free, and downstream services that persist application logs can fall back to execution context when needed.

The discipline side matters more and is less obvious: async context storage is stateful infrastructure, and cleaning it up is part of correctness, not an optimization you can defer. That's what the first version taught me, at the cost of a memory leak I'll write up separately. If I were setting this up again, I'd test it more like infrastructure than a helper library — nested promise chains, timers, queue consumers, cleanup under sustained load — and I'd watch memory while doing it, not just whether the log lines look right. The happy path on something like this always looks great. Whether it stays invisible under pressure is the real question.
