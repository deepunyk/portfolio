---
title: "Making Cron Jobs Boring In Distributed Systems"
description: "Once scheduled work runs across multiple app instances and tenant data, the hard part stops being cron syntax and starts being coordination."
date: "2023-04-19"
tags: ["cron", "distributed-systems", "backend", "reliability"]
published: true
---

This is not really a post about how to use cron in Node.

The syntax is the easy part. The interesting part starts later, when the job is no longer a single timer inside a single process.

In one backend, cron jobs started out the way they usually do. A few scheduled cleanups. A few periodic syncs. A few "run this every day" tasks. Nothing especially dramatic.

Then the system grew up a little.

The app could run on multiple nodes. Some jobs needed to run per account instead of globally. Some of them touched a lot of data. Some could take a while. Some needed to stop cleanly if the process was shutting down. At that point cron stopped being a scheduling problem and turned into a coordination problem.

That is the part worth writing down, because a lot of cron examples stop too early. They show the schedule expression and a callback. They do not spend much time on the boring reliability work that makes scheduled jobs survivable in production.

In this backend, that boring layer lived in a shared cron coordinator, and that shape was much healthier than scattering ad hoc safety logic through every service.

## The Failure Modes Show Up Quickly

Once scheduled work is running in a real backend, the obvious problems are not very exotic:

- two app instances run the same job at the same time
- every node wakes up on the same second and creates a small thundering herd
- tenant-scoped jobs treat every account uniformly when they should not
- one bad account aborts the whole run
- the process starts shutting down halfway through a large batch
- an exception escapes a cron callback and takes down more than it should

None of these are about whether the cron expression itself was valid.

They are about policy. Who should run. When should they run. How much work should happen in parallel. What happens when the environment is unhealthy. What happens when the app is going away.

That is why reliable cron design in a distributed backend is mostly about coordination policy, not scheduling syntax.

## A Small Coordinator Changes The Shape Of The Problem

The useful move here was putting the reliability logic in one place instead of rebuilding it job by job.

The shared utility in this backend handles a few things:

- duplicate suppression across instances
- exception containment and logging
- per-account eligibility checks
- bounded concurrent fan-out
- shutdown-aware batch execution

Once that exists, individual jobs can stay closer to their actual job logic.

The cleanup code can focus on deleting old rows. The announcement code can focus on collapsing announcements. The automation code can focus on scheduling automation work. The cron coordinator handles the "how do we run this safely enough?" part.

## Duplicate Suppression With A TTL Is Simple And Good Enough

The first thing a multi-node cron setup needs is protection against duplicate execution.

In this backend, a shared helper used the cache as a distributed "recently ran" lock. The shape is simple:

```ts
if (await cacheManager.get(jobName)) return true;
await cacheManager.set(jobName, true, { ttl });
return false;
```

If one node gets there first, the others see the key and skip the run.

That is not a perfect lock. It is a time-based guardrail. But for a lot of cron jobs, especially cleanup and scheduling work, that is exactly the right level of machinery. You do not always need leader election or a heavyweight job runner. Sometimes a TTL-backed "someone already did this recently" check is enough.

The more important detail is the failure policy.

If cache access throws, the method logs the error and returns `true`, which means "treat this as already run and skip it." That is conservative by design. The code is choosing skipped runs over duplicate runs.

That is the right tradeoff for many scheduled jobs. A missed cleanup or delayed scheduler pass is usually easier to tolerate than two nodes both deciding they own the same work.

## Randomized Schedules Matter More Than They Look

A lot of cron jobs get scheduled on clean wall-clock boundaries because that is how people naturally think about time.

Midnight.

2 AM.

Every 30 minutes on the hour and half hour.

That is tidy, but it is also how you get a whole fleet waking up together.

This backend avoided that in a few places by randomizing the exact schedule inside a safe window:

- a log cleanup job picked a random second and minute in its maintenance window
- an announcement cleanup job ran at a random time in the first hour after midnight
- a billing cleanup flow used a randomized schedule inside a longer cadence
- an automation scheduler started at a random offset a few minutes after boot

This helps for two reasons.

The obvious reason is load spreading. If every instance or every related subsystem wakes up on the exact same second, you get unnecessary spikes.

The less obvious reason is that randomization also reduces synchronized duplicate behavior across replicas. Even if duplicate suppression exists, it is better when the whole cluster is not racing for the same cache key at the same instant every time.

This is one of those tiny production details that looks unimportant when reading the code for the first time, then feels completely reasonable once you have seen a few scheduled systems pile onto the same boundary.

## Tenant-Scoped Jobs Need A Policy Layer

Another place where cron examples usually stay too shallow is tenancy.

Many real jobs should not run uniformly for every account. Some tenants may not have the feature enabled. Some may need the job paused. Some may still be in rollout. Some may be excluded while debugging a production issue.

That is why a tenant-selection step matters in this kind of utility.

It reads the account list, checks whether the specific job is enabled for each tenant, filters out the ones that should not run, logs the skipped ones, and then shuffles the remaining list before returning it.

That last part is subtle and good.

Shuffling means the same tenants do not always sit at the front of the batch order. Over time that gives a fairer distribution, especially when runs can be interrupted or cut short. It is a small thing, but it shows the code is treating per-tenant cron work as a scheduling policy problem, not just a loop.

The log cleanup job is a good example of this shape. It gets all accounts, asks the cron utility which ones should actually participate, and only then starts deleting old rows account by account.

That is a much better boundary than hiding the tenant policy down inside the cleanup query itself.

## Fan-Out Work Should Usually Isolate Failures

Once a job becomes "run this for many accounts," concurrency becomes the next design question.

In this backend, the account-processing helper reads a concurrency limit from configuration, chunks the accounts into batches, and runs each batch with `Promise.allSettled`.

That combination matters.

The concurrency limit is configurable, so the pressure the job puts on the system can be tuned without rewriting the job logic.

And `Promise.allSettled` is the right fit for tenant fan-out work. If one account fails, the entire cron run usually should not fail fast and abandon the rest of the batch. The bad account should be logged and the rest of the accounts should keep going.

That is a better fit than `Promise.all` for this class of work.

The utility also wraps each account run in its own try/catch with job and account metadata in the logs. That means the batch executor and the per-account handler are both designed around containment instead of optimistic success.

Again, this is not glamorous code. It is just the kind of code that makes operations quieter.

## Shutdown Behavior Is Part Of The Design

One of the more practical details in the account-processing helper is that it checks whether shutdown has started before launching each batch.

If shutdown has started, it logs the list of unprocessed account IDs and exits early.

This does not get talked about enough in cron posts.

In production, jobs do not run in a timeless vacuum. Processes restart. Deployments happen. nodes drain. Containers get replaced. If scheduled work can run for a while, then graceful shutdown behavior is part of the cron design whether you planned for it or not.

The nice thing about checking between batches is that the system gets a clean compromise:

- it does not start fresh work when shutdown is already underway
- it still finishes the work already in the current batch
- it leaves a clear log trail for what did not get processed

That is the sort of boring behavior infrastructure code needs.

## Crash Containment Should Be Boring Too

The utility also puts a wrapper around the cron callback itself.

One layer logs the start and finish of the job and catches errors so the exception does not leak out of the scheduled callback. Then the scheduler adds a second defensive catch around that wrapper with a comment that basically says, "this should not happen, but if it does, the app still should not crash."

That reflects the right attitude.

Cron code is not special in a good way. It is special in the sense that it often runs outside the main user request path and wakes up when nobody is looking directly at it. That is a good reason to be extra defensive.

Given the choice between a little duplicated catching and a mysterious process-level failure during scheduled work, the boring extra catch wins every time.

## Observability Still Needs Job Identity

Another useful detail in this backend is that some jobs write their flow name into the execution context store before doing work.

For example, one billing archival path sets a flow name before the cron starts touching records. That context then follows the async execution path and gives logs and error reporting a clearer job identity.

This matters because cron observability often degrades into vague background-noise logging unless the job identity is carried explicitly. Once the logs can say which flow is running, the scheduled work becomes easier to reason about alongside the rest of the system.

That is especially helpful when the backend is doing both request-driven work and background work in the same service.

## This Stops Feeling Like One-Off Logic

The strongest signal that this pattern is worth having is that it stopped being tied to one specific cleanup task.

There was a growing list of cron job names, and the utility was reused across log cleanup, announcements, automation scheduling, billing work, trial notifications, sync jobs, and more.

That is usually the point where a team should admit they do not have "some cron jobs" anymore.

They have cron infrastructure.

Not a huge platform. Not a separate service. Just a small, shared coordination layer that encodes the rules the backend keeps needing.

That is the sweet spot for a lot of applications.

## What Good Enough Looks Like

This is not a perfect scheduler, and it does not need to be sold as one.

It is a practical set of policies for making scheduled work less dramatic:

- use a TTL-backed duplicate suppression check across instances
- prefer skipping to double-running when the coordination layer is unhealthy
- randomize execution windows so replicas do not line up on the same boundary
- gate tenant work through account-level settings
- shuffle the tenant list so ordering stays fairer over time
- batch the work with a configurable concurrency limit
- use `Promise.allSettled` so one tenant failure does not abort the run
- stop taking new batches when shutdown starts
- wrap the cron callback so exceptions stay contained and logged

That is the kind of design worth trusting more than a fancy scheduler story built on fragile assumptions.

It is also the kind of code that gets more valuable as the backend gets messier. The more tenants, more replicas, and more background work you have, the less appealing it is to let every service reinvent its own cron safety rules.

## If I Were Building This Again

If I were setting up scheduled work in another multi-tenant backend, I would keep the bar pretty similar from the beginning:

1. Treat duplicate execution as a first-class problem as soon as more than one node can run the app.
2. Do not schedule everything on perfect wall-clock boundaries if a randomized window would work just as well.
3. Put tenant eligibility behind settings or policy checks instead of assuming every account should always participate.
4. Use bounded concurrency and failure isolation for fan-out jobs.
5. Decide explicitly what the job should do during shutdown instead of discovering that behavior during a deploy.
6. Make sure logs and error reports carry the job identity cleanly.

And I would test it with the awkward scenarios, not just the happy path:

1. Start two app instances and verify only one of them actually takes a given job run.
2. Break cache access and confirm the system skips safely instead of double-running.
3. Force one tenant in a batch to fail and verify the rest still complete.
4. Trigger shutdown during a large run and check that no new batches start.
5. Inspect the logs and error reports to make sure the job name and account context are obvious.

That is the work that turns cron from "hopefully this script runs on time" into something much more boring.

And for scheduled infrastructure, boring is exactly the goal.
