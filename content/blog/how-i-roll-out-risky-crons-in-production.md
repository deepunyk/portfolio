---
title: "Rolling Out Risky Crons In Production"
description: "A practical pattern for dangerous cron jobs: do not trust staging alone, start with a tiny allowlist, and widen the blast radius in phases."
date: "2022-09-14"
tags: ["cron", "production", "data-safety", "operations"]
published: true
---

Cron jobs are some of the scariest code paths in an application. A regular request path usually touches one user, one account, one action. A cron wakes up and can touch a lot of entities at once, often with nobody watching it closely. If that cron is doing something destructive, a retention cleanup or a deletion flow, the blast radius gets uncomfortable fast.

There was a case where one query inside a cron behaved badly for a particular set of data and ended up removing data from the database that shouldn't have been touched. Recovery was possible because backups existed and the data could be backfilled, but it was the kind of incident that changes how you look at these jobs afterward. Cron safety stopped being about "did this pass testing" and started being about how contained the damage is when production still finds a way to surprise you.

Cron logic still needs to be tested locally and in staging. That catches the obvious mistakes and the simple bugs that shouldn't ship in the first place. But staging doesn't have the real combinations that production has: years of migrations, partial failures, and human behavior have left accounts in awkward states that a clean staging setup never reproduces. A cron that looks fine against staging data can still misbehave the first time it meets a weird slice of a real account. "Works in staging" is where a careful production rollout can begin, not where the safety work ends.

The pattern that has worked better is rolling the cron out in phases. Instead of enabling it for every account at once, we keep an explicit allowlist of accounts or entities in the database, and the cron only processes what's on that list. The code ships without exposing the whole system, the first production run can be intentionally tiny, and if something looks wrong the damage is limited to whatever was in that small batch. The first rollout is usually one or two accounts. If that goes fine, the list grows a little, then a little more, until enough runs across enough different kinds of data make it reasonable to open it up to everyone.

The small sets should not be random, though. Deletion and retention jobs are only really being tested if the early batches include records that should be deleted and records that look similar but must survive. Pick only obvious positive cases and you haven't tested the part that actually matters, which is usually the false positive. So the early accounts get chosen for a reason: an internal or test account first, then a low-risk account with real but non-critical data, then accounts known to carry edge cases, ideally ones where both outcomes, delete and no-delete, show up in the same run. A cron can look correct when every row in a batch should be deleted. Confidence goes up a lot more once a run includes rows it has to leave alone.

Order matters here more than the raw count does. The rough progression is local and staging first, then internal test accounts in production, then low-criticality customer accounts, then broader batches with more variation, and only then global enablement. None of this is elegant. It's mostly just refusing to open a large blast radius before you've earned the right to.

The rollout doesn't happen in one leap. After each run, the allowlist in the database gets updated and the set widens for the next one, and that update is a deliberate step, not an automatic one — it forces a pause to look at what happened before deciding whether the cron has earned more scope. If the batch behaved, the rollout moves forward. If anything looks off, it stops right there. That pause is where most of the actual safety work happens; it turns the rollout into a series of small decisions instead of one irreversible bet made on day one.

Crons don't stop being scary just because they're tested. They run outside the normal feedback loop — nobody clicks a button, nobody is watching the screen at the moment they wake up, and they're often working over old or cross-account data that nobody has looked at closely in years. So the safety story can't just be "the query looked right in review." It has to be tested logic, backups as a fallback, a first run kept deliberately small, and expansion only after clean results, stacked on top of each other rather than any one of them carrying the whole weight.

None of this makes a risky cron feel safe on day one, and it shouldn't. The point is just to make sure it never gets a chance to discover the full dataset before it's earned that.
