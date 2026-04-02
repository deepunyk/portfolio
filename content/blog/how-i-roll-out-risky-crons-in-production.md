---
title: "Rolling Out Risky Crons In Production"
description: "A practical pattern for dangerous cron jobs: do not trust staging alone, start with a tiny allowlist, and widen the blast radius in phases."
date: "2022-09-14"
tags: ["cron", "production", "data-safety", "operations"]
published: true
---

Cron jobs are some of the scariest code paths in an application.

Regular request paths usually affect one user, one account, one action. A cron is different. It can wake up and touch a lot of entities at once, often without a human watching it closely. If that cron is doing something destructive, like a retention cleanup or deletion flow, the blast radius gets uncomfortable very quickly.

That is not just theory.

There was a case where one query inside a cron behaved badly for one particular set of data and ended up removing important data from the database. Recovery was possible because backups existed and the data could be backfilled, but it was still the kind of incident that changes how these jobs are viewed. After that, cron safety stopped looking like "did this pass testing?" and started looking more like "how is the damage contained if production still surprises us?"

## Why Staging Is Not Enough

Cron logic still needs to be tested locally and in staging. That is necessary. It catches obvious mistakes, broken assumptions, and the simple bugs that should not be shipping in the first place.

But for this kind of job, staging only gets you part of the way.

The hard part is that production has the real combinations. More accounts. More old data. More awkward states created by years of product changes, migrations, partial failures, and human behavior. A cron that looks perfectly fine in a clean staging setup can still behave badly when it meets one weird slice of real production data.

That is why "works in staging" should not be treated as the final safety check for dangerous cron jobs. It is better treated as the point where production rollout can begin carefully.

## The Pattern That Works Better

The main thing to do is roll the cron out in phases.

Instead of enabling it for every account at once, we keep an explicit set of accounts or entities in the database that the cron is allowed to run against. The cron reads that allowlist and only processes that subset.

That gives us a much safer operating model:

- the code can be deployed without exposing the whole system
- the first production run can be intentionally tiny
- after each run, we can inspect what happened and then widen the scope
- if something looks wrong, the damage is limited to a very small set

The first rollout is usually just one or two accounts. If that looks right, we expand a little. Then a little more. Eventually, after enough runs across enough different kinds of data, we can be comfortable enabling it for everything.

This approach works because it accepts a simple truth: for some cron jobs, production itself is part of the test surface. The goal is not to pretend otherwise. The goal is to make that exposure gradual.

## Picking The First Accounts Matters

The small sets should not be random.

The early batches should include both kinds of cases:

- the entities that really should be touched by the cron
- the entities that look similar but absolutely should not be touched

For deletion or retention jobs, that means the tiny test set should include records that should be deleted and records that should survive. If only obvious positive cases are picked, the dangerous part is not really being tested. The dangerous part is often the false positive.

So those early accounts need to be chosen carefully. Not just "something small," but "something representative."

That usually means looking for:

- an internal or test account first
- a low-risk account with real but non-critical data
- accounts that contain known edge cases
- accounts where both delete and no-delete outcomes exist side by side

That last one matters a lot. A cron can look correct when every row in the batch should be deleted. Confidence goes up much more when the same run includes rows it must skip.

## The Rollout Order That Usually Works Best

The order is usually more important than the total number.

The first runs should happen where the cost of being wrong is lowest. So the progression is usually something like this:

1. local and staging for the obvious checks
2. internal test accounts in production
3. low-criticality customer accounts
4. broader batches with more variation
5. global enablement only after enough clean runs

This is not elegant, but it is practical.

A lot of production safety work is just refusing to create a large blast radius before you have earned the right to do that.

## What Changes After Each Run

The important part is that the rollout does not happen in one leap.

After each cron run, the allowlist in the database gets updated and the set expands for the next run. That update is a deliberate step. It forces a pause to inspect what happened and decide whether the cron has earned more scope.

If the previous batch behaved correctly, the rollout moves forward.

If anything looks suspicious, it stops there.

That pause between runs is doing a lot of work. It turns the rollout into a sequence of small decisions instead of one big irreversible bet.

## Why Crons Still Feel Uncomfortable

Cron jobs do not stop being scary just because they are tested.

They stay scary because they usually run outside the normal human feedback loop. No one clicks a button. No one is staring at the screen at the exact moment they wake up. They often run over old data, messy data, or cross-account data. And if they are destructive, they can be wrong in a very expensive way.

That is why the main safety story should not be "the query looked right when it was reviewed."

The safety story should be layered:

- we tested the logic before shipping
- we had backups in case reality still hurt us
- we limited the first production runs to a very small set
- we expanded only after seeing clean results

That combination feels much more honest than trying to be overly confident about staging coverage.

## If A Dangerous Cron Is Shipping

This is the checklist worth coming back to:

1. test the logic locally and in staging, but assume production can still surprise you
2. make the cron read from a database-controlled allowlist of accounts or entities
3. start with one or two carefully chosen accounts, not a random sample
4. include both positive cases and negative cases in the first batches
5. begin with internal or low-criticality accounts before touching important customer data
6. inspect each run, then expand the allowlist gradually
7. keep backups and a recovery path ready before the cron is allowed to do destructive work everywhere

The main lesson is simple: do not let a risky cron discover the full production dataset on day one.

Let it earn its reach in phases.
