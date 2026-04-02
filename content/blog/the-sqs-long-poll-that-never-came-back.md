---
title: "The SQS Long Poll That Never Came Back"
description: "A debugging story about a poller that looked healthy for years, then started hanging forever when the network dropped at exactly the wrong moment."
date: "2023-11-17"
tags: ["aws", "sqs", "long-polling", "debugging"]
published: false
---

We hit a bug that was frustrating for a long time partly because nothing looked obviously broken.

We had a poller service reading events from an SQS queue using long polling. The shape was simple: call `ReceiveMessage`, wait up to 10 seconds, process whatever came back, then poll again.

That had been running fine for more than two years.

Then sometime around November 2023, a strange thing started happening. Very occasionally, one of these pollers would just stop polling. No clear crash. No useful error. It would simply stall.

At first we treated it like a one-off. Later it was clear something was seriously wrong, but the bug still felt slippery because it almost never showed up when we were looking at it directly.

## Why It Was So Confusing

The part that misled me early was the mental model I had for SQS long polling.

I assumed `WaitTimeSeconds` would also behave like a timeout for the request itself. If the poll was configured for 10 seconds, I expected the whole thing to return or fail within something close to that window.

That is not what it does.

`WaitTimeSeconds` controls how long SQS can wait before responding when there are no messages. It is not a client-side network timeout.

So if the request reaches the server and the connection gets into a bad state after that, you can end up in a much stranger place: the long poll does not finish, but it also does not error in the way your application expects.

I went through the AWS JavaScript SDK code looking for a default timeout on the `ReceiveMessage` request and could not find anything that gave me confidence this path was protected by default. That was the point where the bug stopped looking like "we probably missed an exception" and started looking like a transport-level edge we had never tested properly.

## The Symptom In Production

In our case, the service was event-driven through this poller. If the poller stopped, the rest of the system slowly went quiet.

The hardest part was that the code path did not look obviously unsafe. We had not really planned for "the request has already reached SQS, but the client loses connectivity in the middle and never comes back."

That gap mattered because nothing in that loop forced the process to recover.

So the first fix we shipped was a practical one, not a satisfying one.

If a long poll took more than 20 seconds, even though the configured SQS wait was 10 seconds, we treated that as suspicious and restarted the poller loop. In code, the idea was basically a `Promise.race` around the poll request with a 20-second watchdog.

That stabilized things for us, but it did not explain the bug. It just kept the service from sitting there forever.

## How We Finally Reproduced It

The breakthrough came when we stopped trying to reason about production symptoms and forced the exact failure locally.

This was the replication flow that finally worked:

1. boot the app server locally
2. start polling a test or staging SQS queue
3. wait until a `ReceiveMessage` request is in flight
4. disconnect the internet after the request has already gone out
5. watch whether the poller throws or just hangs

That last detail was the whole trick.

Disconnecting before the request was sent was not the same thing. The interesting case was disconnecting after the request had already hit the server.

Once we tested that exact timing, we could reproduce the stall.

That was a very satisfying moment, mostly because the bug had felt half imaginary up to then. We knew services were randomly stopping their polls, but we did not have a clean story for why. After enough dead ends, getting a local reproduction felt like finally grabbing something solid.

## What Was Actually Going Wrong

The useful conclusion was narrower than "SQS long polling is broken."

The real issue was this:

- the application was relying on long polling without an explicit client-side timeout
- `WaitTimeSeconds` was only telling SQS how long to wait for messages
- when connectivity dropped after the request had already reached the server, the client could hang indefinitely instead of failing fast

That combination is what made the bug so awkward.

From the application's point of view, the poll was still in progress. From the system's point of view, the worker was effectively dead.

## What I Learned

The first lesson was very simple: long polling is still network I/O, and network I/O needs an explicit timeout if you want a reliable service boundary.

The second lesson was about testing.

We had good coverage for obvious failure modes. We did not have a test for "the request is already in flight, and the connection breaks mid-poll." That turned out to be the failure mode that mattered.

The third lesson was that a watchdog can be a perfectly reasonable production fix even before you fully understand the underlying transport behavior. I do not love shipping band-aids as the final answer, but in this case the watchdog bought us safety while we kept digging.

## If You Want To Try This Yourself

If you have a service doing SQS long polling, I would test this path on purpose:

1. start a real long poll against a disposable queue
2. wait until the request is already in flight
3. cut the network
4. see whether your process errors, retries, or hangs
5. add an explicit client-side timeout if the behavior is ambiguous
6. add a second watchdog at the poller-loop level so one stuck request cannot silently kill the worker

The part I liked most about this bug, once the frustration wore off, was the path to understanding it.

There was no neat article sitting on the internet with the exact answer we needed. We had to build the reproduction ourselves, challenge a bad assumption about `WaitTimeSeconds`, and force the system into the exact broken state.

That is the kind of debugging work I still enjoy. Not because it is pleasant while you are in it, but because once you finally see the shape clearly, the system feels much more honest than it did before.
