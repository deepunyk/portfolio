---
title: "When The Scheduler Can Fire Twice: Claiming Scheduled Work With One UPDATE … RETURNING"
description: "When a scheduled job can be invoked more than once at the same time, the reliable fix is not a distributed lock. It is one UPDATE … RETURNING that claims a row by flipping its status, plus a lease that recovers work if a run stalls."
date: "2026-06-24"
tags: ["cron", "distributed-systems", "leaderless-coordination", "backend", "reliability"]
published: true
---

A lot of scheduled work looks safe right up until the scheduler fires twice.

I had a job like that. It ran on a schedule, syncing a batch of per-account records to an external API. The shape was ordinary: pull the accounts that need syncing, call the upstream for each one, write the results back. Nothing about the per-account work was exotic.

The awkward part was the substrate. The job was a serverless function invoked on a schedule, and there was nothing preventing two invocations from overlapping. The scheduler could fire again before the previous run finished. A manual trigger could land on top of a scheduled one. The platform did not promise exactly-once invocation, and it would have been a mistake to build as if it did.

That is the whole problem. Two runs picking up the same accounts at the same time means duplicate upstream calls, double writes, and confusion that is hard to unwind later. The fix had to make sure each unit of work was claimed by exactly one run, without assuming the scheduler would cooperate.

## The First Instinct Is A Lock. I Did Not Use One.

The obvious reach here is a distributed lock. Put a Redis lock around "this account is being synced," and let the second run see the lock and skip.

That works. I have used it before, and it is a fine answer for a lot of systems. But it was the wrong fit here for a few reasons.

The database was already the source of truth for which accounts existed and which state they were in. Adding a second coordination system, Redis, meant the truth about "who is working on what" now lived in two places. If Redis and the database ever disagreed, the job would either duplicate work or strand it, and the debugging path would not be obvious.

There was also a lifecycle cost. A serverless function starts cold with no Redis connection, has to acquire one, hold the lock across the whole run, and release it cleanly at the end. If the run is killed mid-flight, the lock is left behind. Now you need lock TTLs, lock-refresh logic, and a recovery story for abandoned locks. That is a lot of machinery to layer on top of a job whose actual work is "sync some records."

So I wanted the coordination to live where the data already lived, and I wanted a run that crashed to recover without a human touching anything.

## The Shape That Worked: A Status Column And A Timestamp

Each account had its own configuration row in a table. The useful move was to add two columns to that row and treat them as a tiny coordination state machine:

- `status` — one of `IDLE`, `IN_PROGRESS`, or `FAILED`
- `started_at` — the moment the current run claimed this row

That is all the state the coordination needs. `IDLE` means nobody is working on it. `IN_PROGRESS` means a run owns it. `FAILED` means a run tried and gave up, so it is safe to retry. `started_at` is the lease, which I will come back to.

Once those columns exist, claiming a row is not a read followed by a write. It is one statement.

## The Claim Is One UPDATE … RETURNING

This is the part that took the problem from fragile to boring.

Instead of selecting eligible rows, marking them in a second step, and hoping nothing changed in between, the claim is a single `UPDATE` that flips the status to `IN_PROGRESS`, stamps `started_at` to now, and returns the rows it touched:

```ts
const staleThresholdSeconds = SCHEDULE_INTERVAL_SECONDS + 2 * 60;

// Eligible to claim: idle, previously failed, or claimed so long ago it must be stuck.
const eligible = {
  [Op.or]: [
    { status: Status.IDLE },
    { status: Status.FAILED },
    {
      status: Status.IN_PROGRESS,
      started_at: {
        [Op.lt]: Sequelize.literal(`NOW() - interval '${staleThresholdSeconds} seconds'`)
      }
    }
  ]
};

// The claim: set status AND stamp the lease in the same statement.
const [, claimed] = await Config.update(
  {
    status: Status.IN_PROGRESS,
    started_at: Sequelize.fn('now')
  },
  {
    where: { enabled: true, ...eligible },
    returning: true
  }
);

// Only this run received rows back. A concurrent run got [] and exits.
if (claimed.length === 0) return;
```

Because the database applies the `UPDATE` and the `RETURNING` in one atomic step, two runs hitting this at the same instant cannot both win. The first one's status change makes the row ineligible for the second. One run gets the row back. The other gets nothing and stops.

That is the entire coordination scheme. No lock. No leader election. No Redis. Just a status column and a statement that is atomic by definition.

## Why The Timestamp Has To Ride In The Same Query

It is tempting to set `started_at` after the claim, in a separate write. That is a mistake.

If the status flip and the lease stamp are two statements, a run can die between them. Now you have a row marked `IN_PROGRESS` with a stale or null `started_at`, and no honest way to tell how long it has actually been running. The lease becomes unreliable, and the recovery logic in the next section stops working correctly.

Keeping `status` and `started_at` in the same `UPDATE` means a claimed row always carries an honest lease. If the run crashes a millisecond after claiming, the lease still tells the truth about when the claim happened. That invariant is what makes the recovery path safe.

## The Lease Is What Saves You When A Run Stalls

This is the part I would design for early, because it is what separates a coordination scheme that needs babysitting from one that does not.

A run is not guaranteed to finish. The process can be killed, time out, or hit a fatal error. When that happens, the row is left in `IN_PROGRESS` forever, and the next scheduled run would skip it as "already being worked on."

That is the classic stuck-lock problem. The fix is the lease, and it is already in the eligibility clause above.

A row is claimable again if its `started_at` is older than a threshold. I used the schedule interval plus a safety buffer:

```ts
const staleThresholdSeconds = SCHEDULE_INTERVAL_SECONDS + 2 * 60;
```

The buffer matters more than it looks. The schedule interval alone is too aggressive. A run that is legitimately still working, just running a little long, could get re-claimed by the next invocation and end up duplicated anyway. The extra buffer says: trust the current run for a while past the next schedule tick, and only re-claim when you are confident it is actually dead.

With that clause, a stalled row heals itself. The next scheduled run sees it as stale, claims it through the same atomic path, and picks the work back up. No one has to manually unstick anything.

So the three statuses are doing real, distinct work:

- `IDLE` — ready to be claimed
- `IN_PROGRESS` — owned by a run, with an honest lease
- `FAILED` — a run tried and explicitly gave up, so it is eligible for retry

## One Account's Failure Must Not Abort The Batch

The claim gives you the rows. The processing loop is where a second, separate discipline matters.

If a batch contains several accounts and one of them throws, the wrong behavior is to let that exception escape and kill the whole run. Now the accounts that were claimed but never reached are left in `IN_PROGRESS`, relying entirely on the lease to recover them on the next tick. That works, but it is wasteful and noisy.

The better shape is per-row containment. Each account is processed in its own try/catch. On success, the row goes back to `IDLE`. On failure, it goes to `FAILED`, the error is logged and reported, and the loop moves on:

```ts
for (const config of claimed) {
  try {
    await runSyncFor(config);
    await config.update({
      status: Status.IDLE,
      last_success: Sequelize.fn('now')
    });
  } catch (err) {
    // One bad account fails only itself. The rest of the batch keeps going.
    logger.error('Sync failed for account', { accountId: config.account_id, err });
    await config
      .update({ status: Status.FAILED })
      .catch((updateErr) => logger.error('Failed to mark config as FAILED', { updateErr }));
  }
}
```

The `FAILED` status is doing double duty here. It records that something went wrong, and it makes the row eligible again on the next run, so a transient upstream blip gets retried automatically instead of stranding the account until a human notices.

The `.catch` on the failure update is not paranoia. If the database itself is flaky, the one thing you do not want is the error-handling path to throw and take down the loop. Failure handling should be the most boring, most defensive code in the job.

## The Manual Trigger Reuses The Exact Same Claim

There was one more requirement that shaped the design. The job could also be triggered manually, for a specific account, outside the normal schedule.

The tempting shortcut is to write a separate, simpler path for the manual trigger that skips the claim and just runs. That is how you get two code paths that drift apart, and eventually a manual run that double-claims because it did not go through the same eligibility check.

Instead, the manual trigger runs the exact same claim logic, just with the `where` clause narrowed to the target account:

```ts
const [, claimed] = await Config.update(
  { status: Status.IN_PROGRESS, started_at: Sequelize.fn('now') },
  {
    where: { account_id: targetAccountId, enabled: true, ...eligible },
    returning: true
  }
);
```

If the target account is already being worked on by a scheduled run, the eligibility clause excludes it, and the manual trigger gets an empty result and exits. The manual path can never trample a run that is legitimately in progress, because it has to win the same atomic claim everyone else does.

One claim mechanism. Two entry points. No drift.

## What I Like About This Shape Now

The thing I like most is what it does not have.

There is no leader. Any invocation, scheduled or manual, can claim work. There is no Redis dependency, so there is no second system whose state has to agree with the database. There is no lock to refresh, leak, or release. There is no recovery job that a human has to run when something gets stuck.

The coordination is three things, all of them boring:

- a status column with three values
- a timestamp that rides in the same statement as the claim
- a lease threshold that turns stuck rows into claimable rows on the next tick

And it fails in safe directions. A crash leaves a row leased, and the lease expires. A double invocation gets deduplicated by the atomic claim. A bad account fails only itself and gets retried. A manual trigger cannot trample a running job.

## If I Were Building This Again

If I were setting up scheduled work that can be invoked concurrently, I would make a few rules explicit from the beginning:

1. Treat the scheduler as a system that can fire more than once. Do not design around the hope of exactly-once invocation.
2. Put the coordination state in the same database that already owns the data, instead of introducing a second system to agree with.
3. Make the claim one atomic statement, not a read followed by a write. `UPDATE … RETURNING` is the whole answer.
4. Stamp the lease in the same statement as the status flip, so a claimed row always carries an honest start time.
5. Make stuck work self-healing with a lease threshold, and pad that threshold past the schedule interval so a slow run is not re-claimed prematurely.
6. Contain failures per row so one bad account cannot abort the batch or strand its neighbors.

And I would test it with the awkward scenarios, not the happy path:

1. Fire two invocations at the same instant and confirm each account is claimed by exactly one of them.
2. Kill a run mid-batch and confirm its rows are re-claimed on the next tick once the lease expires.
3. Make one account throw and confirm it lands in `FAILED` while the rest of the batch completes.
4. Trigger a manual run for an account that a scheduled run is currently processing, and confirm the manual run is rejected, not duplicated.
5. Run the lease logic across a clock or interval boundary and confirm the threshold math still excludes legitimately-running work.

## The Main Lesson

The useful shift here was stopping thinking about this as a locking problem and starting to think about it as a state-machine problem.

A lock asks, "is someone allowed to do this right now?" A status column with an atomic claim asks, "did this run win responsibility for this row?" The second question is easier to answer correctly, because the database is already good at making a single `UPDATE` atomic, and it is already the source of truth for everything else the job cares about.

Once the claim is atomic and the lease is honest, the rest of the reliability falls out for free. Concurrent runs deduplicate themselves. Stuck work recovers on the next tick. Failures stay contained. The scheduler can fire twice, or five times, and it does not matter, because only one run can flip a given row to `IN_PROGRESS`.

That is the kind of coordination I trust more than a lock. Not because it is clever, but because there is almost nothing left to go wrong.
