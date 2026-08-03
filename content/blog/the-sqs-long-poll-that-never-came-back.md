---
title: "The SQS Long Poll That Never Came Back"
description: "A debugging story about a poller that looked healthy for years, then started hanging forever when the network dropped at exactly the wrong moment."
date: "2023-11-17"
tags: ["aws", "sqs", "long-polling", "debugging"]
published: true
---

We had a poller service reading events from an SQS queue using long polling: call `ReceiveMessage`, wait up to 10 seconds, process whatever came back, poll again. Nothing exotic. It had run fine for more than two years.

Then sometime around November 2023, one of these pollers would occasionally just stop. No crash, no useful error, no stack trace to chase. It would poll, and then it simply wouldn't poll again. We treated it as a one-off the first couple of times. It kept happening, and it almost never happened while we were watching, which made it worse than a normal bug — there was nothing to look at.

## Why it was so confusing

Part of the problem was a wrong assumption baked into how we thought about `WaitTimeSeconds`. It seemed reasonable to expect that a poll configured for 10 seconds would return, one way or another, somewhere close to that window. `WaitTimeSeconds` only controls how long SQS itself waits before responding when the queue is empty. It says nothing about the client connection.

So if the request reaches SQS and the connection goes bad after that point, you land somewhere stranger than a normal timeout: the poll doesn't finish, and it doesn't fail in any way the application is prepared to handle either. We went looking through the AWS JavaScript SDK for a default timeout on `ReceiveMessage` and didn't find much reassurance that this path was covered. That's roughly where the bug stopped feeling like a missed exception and started feeling like a transport edge nobody had ever exercised.

## The symptom in production

The service was event-driven end to end through this poller, so when it stalled, the rest of the pipeline went quiet with it — slowly, not with an alarm. Nothing in the loop forced recovery; the process was just sitting there, alive, doing nothing.

The first fix we shipped was practical rather than satisfying. If a poll ran past 20 seconds — double the configured SQS wait — we treated that as suspicious and restarted the loop, a `Promise.race` around the request with a 20-second watchdog. It stopped the pager. It explained nothing.

## How we finally reproduced it

We stopped trying to infer the failure from production symptoms and instead tried to force it locally. The sequence that worked:

1. boot the app server locally
2. start polling a test or staging SQS queue
3. wait until a `ReceiveMessage` request is in flight
4. disconnect the internet after the request has already gone out
5. watch whether the poller throws or just hangs

Timing mattered more than anything else here. Disconnecting before the request left the machine did nothing interesting — the SDK just retried or errored normally. The case that mattered was cutting the connection after the request had already reached the server. Once we got that timing right, the stall reproduced on demand, and after a lot of guessing, having something we could trigger at will felt like real progress.

## What was actually going wrong

The application relied on long polling with no explicit client-side timeout of its own, on the assumption that `WaitTimeSeconds` covered that job. It doesn't — it only tells SQS how long to wait for messages before responding. When connectivity dropped after the request had already landed server-side, the client had nothing telling it to give up, so it just hung. From the application's side, the poll was still "in progress." From everyone else's side, the worker was dead.

We had decent coverage for the failure modes we'd thought of — connection refused, DNS failure, malformed response. We had nothing for a request that's already in flight when the network dies underneath it, and that was the one that actually happened in production.

The watchdog we'd shipped as a stopgap turned out to be a reasonable permanent answer too, not because it was elegant, but because long polling is still network I/O, and network I/O without an explicit timeout will eventually find the one connection state you didn't plan for.

## If you want to try this yourself

If you have a service doing SQS long polling, worth testing on purpose:

1. start a real long poll against a disposable queue
2. wait until the request is already in flight
3. cut the network
4. see whether your process errors, retries, or hangs
5. add an explicit client-side timeout if the behavior is ambiguous
6. add a watchdog at the poller-loop level so one stuck request can't silently take the worker down

There was no article anywhere with this exact answer in it. We had to build the reproduction ourselves and sit with a wrong assumption about `WaitTimeSeconds` long enough to notice it was wrong.
