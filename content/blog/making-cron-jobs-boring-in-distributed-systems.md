---
title: "Making Cron Jobs Boring In Distributed Systems"
description: "Once scheduled work runs across multiple app instances and tenant data, the hard part stops being cron syntax and starts being coordination."
date: "2023-04-19"
tags: ["cron", "distributed-systems", "backend", "reliability"]
published: true
---

This is not really a post about how to use cron in Node.

The syntax is the easy part. It gets interesting once the job stops being a single timer inside a single process.

In one backend, cron jobs started out the way they usually do: a few scheduled cleanups, a few periodic syncs, a "run this every day" task or two. Then the system grew up. The app ran on multiple nodes. Some jobs needed to run per account instead of globally, some touched a lot of data, some had to stop cleanly if the process was shutting down. At that point cron stopped being a scheduling problem and became a coordination problem, and it got a shared cron coordinator instead of ad hoc safety logic scattered through every service.

## The Failure Modes Show Up Quickly

Once scheduled work is running in a real backend, the problems aren't exotic:

- two app instances run the same job at the same time
- every node wakes up on the same second and creates a small thundering herd
- tenant-scoped jobs treat every account uniformly when they should not
- one bad account aborts the whole run
- the process starts shutting down halfway through a large batch
- an exception escapes a cron callback and takes down more than it should

None of these are about whether the cron expression was valid. They're about policy: who should run, when, how much in parallel, and what happens when the app is unhealthy or going away.

## One Shared Utility Instead Of Job-By-Job Logic

Rather than rebuild the reliability logic in every job, this backend put it in one place. The shared utility handles duplicate suppression across instances, exception containment and logging, per-account eligibility checks, bounded concurrent fan-out, and shutdown-aware batch execution.

With that in place, individual jobs stay close to their actual logic. The cleanup code focuses on deleting old rows. The announcement code focuses on collapsing announcements. The automation code focuses on scheduling automation work. The coordinator handles the "how do we run this safely enough" part.

## Duplicate Suppression With A TTL

The first thing a multi-node cron setup needs is protection against duplicate execution. A shared helper uses the cache as a distributed "recently ran" lock:

```ts
if (await cacheManager.get(jobName)) return true;
await cacheManager.set(jobName, true, { ttl });
return false;
```

If one node gets there first, the others see the key and skip the run. It's not a real lock, just a time-based guardrail, but for cleanup and scheduling work that's usually enough — leader election would be overkill.

The more interesting detail is the failure policy. If cache access throws, the method logs the error and returns `true`, meaning "treat this as already run and skip it." That's a deliberate choice to prefer skipped runs over duplicate runs. A missed cleanup pass is easier to live with than two nodes both deciding they own the same work.

## Randomized Schedules

Cron jobs tend to get scheduled on clean wall-clock boundaries because that's how people think about time — midnight, 2 AM, every 30 minutes on the hour. That's tidy, but it's also how a whole fleet ends up waking up together.

This backend avoided that in a few places by randomizing the exact schedule inside a safe window: a log cleanup job picked a random second and minute in its maintenance window, an announcement cleanup ran at a random time in the first hour after midnight, a billing cleanup flow used a randomized schedule inside a longer cadence, and an automation scheduler started at a random offset a few minutes after boot.

The obvious benefit is load spreading. The less obvious one is that randomization also cuts down on synchronized duplicate behavior across replicas — even with duplicate suppression in place, it helps when the cluster isn't racing for the same cache key at the same instant every time.

## Tenant-Scoped Jobs Need A Policy Layer

Many jobs shouldn't run uniformly for every account. Some tenants don't have the feature enabled, some need the job paused, some are still in rollout, some are excluded while debugging a production issue. So there's a tenant-selection step: read the account list, check whether the job is enabled for each tenant, filter out the ones that shouldn't run, log the skipped ones, and shuffle the remaining list before returning it.

The shuffle is a small thing but worth calling out — it keeps the same tenants from always sitting at the front of the batch order, which matters when runs can be interrupted or cut short. The log cleanup job follows this shape: it fetches all accounts, asks the cron utility which ones should actually participate, and only then starts deleting old rows account by account. That's a cleaner boundary than hiding the tenant policy inside the cleanup query itself.

## Fan-Out Should Isolate Failures

Once a job becomes "run this for many accounts," concurrency is the next question. The account-processing helper reads a concurrency limit from configuration, chunks the accounts into batches, and runs each batch with `Promise.allSettled`. The limit is configurable so the load a job puts on the system can be tuned without touching job logic, and `Promise.allSettled` means one bad account gets logged while the rest of the batch keeps going instead of the whole run failing fast.

Each account run is also wrapped in its own try/catch with job and account metadata in the logs, so both the batch executor and the per-account handler are built around containment rather than assuming success.

## Shutdown And Crash Containment

The account-processing helper checks whether shutdown has started before launching each batch. If it has, it logs the unprocessed account IDs and exits early — no new work starts, whatever's already running in the current batch finishes, and there's a clear log trail for what didn't get processed. Processes restart, deployments happen, containers get replaced; if scheduled work can run for a while, shutdown behavior is part of the design whether you planned for it or not.

The utility also wraps the cron callback itself in two layers: one that logs start and finish and catches errors so nothing leaks out of the scheduled callback, and a second defensive catch around that wrapper — the kind of comment that says "this shouldn't happen, but if it does, the app still shouldn't crash." Cron code runs outside the normal request path, often when nobody's watching, which is reason enough to be a little paranoid about it.

## Job Identity In The Logs

Some jobs write their flow name into the execution context store before doing work — one billing archival path sets a flow name before touching records, and that context follows the async execution path into logs and error reports. Without that, cron observability tends to degrade into vague background noise, especially in a service that's doing both request-driven and background work at once.

## From One-Off Logic To Infrastructure

The clearest sign this pattern was worth having is that it stopped being tied to one cleanup task. The same utility ended up reused across log cleanup, announcements, automation scheduling, billing work, trial notifications, and sync jobs. That's usually the point where "some cron jobs" quietly becomes cron infrastructure — not a platform, not a separate service, just a small shared layer encoding the rules the backend kept needing.

## What This Adds Up To

None of this is a perfect scheduler, and it doesn't need to be. It's a TTL-backed duplicate check, a bias toward skipping over double-running when the cache is unhealthy, randomized windows so replicas don't line up, tenant eligibility gated through settings, shuffled batch order, bounded concurrency with `Promise.allSettled`, shutdown checks between batches, and a callback wrapped so exceptions stay contained and logged. It gets more valuable as the backend gets messier — the more tenants, replicas, and background work you have, the less you want every service reinventing its own cron safety rules.

If I were setting this up again, I'd test the awkward scenarios early rather than after something broke: two instances racing for the same job, cache access failing mid-run, one tenant failing inside a batch, shutdown triggered mid-run, and whether the logs actually make the job and account identifiable. That's the difference between a script that hopefully runs on time and infrastructure you don't have to think about.
