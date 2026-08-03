---
title: "When The Scheduler Can Fire Twice: Claiming Scheduled Work With One UPDATE … RETURNING"
description: "When a scheduled job can be invoked more than once at the same time, the reliable fix is not a distributed lock. It is one UPDATE … RETURNING that claims a row by flipping its status, plus a lease that recovers work if a run stalls."
date: "2026-04-19"
tags: ["cron", "distributed-systems", "leaderless-coordination", "backend", "reliability"]
published: true
---

A lot of scheduled work looks safe right up until the scheduler fires twice.

I had a job like that. It ran on a schedule, syncing a batch of per-account records to an external API. The per-account work was ordinary. The awkward part was the substrate: it was a serverless function invoked on a schedule, and nothing prevented two invocations from overlapping. The scheduler could fire again before the previous run finished. A manual trigger could land on top of a scheduled one. The platform did not promise exactly-once invocation, and it would have been a mistake to build as if it did.

Two runs picking up the same accounts at the same time means duplicate upstream calls, double writes, and confusion that is hard to unwind. The fix had to make sure each unit of work was claimed by exactly one run, without assuming the scheduler would cooperate.

## Why not a lock

The obvious reach is a distributed lock: put a Redis lock around "this account is being synced," and let the second run see it and skip. I have used that pattern before, and it works, but it was the wrong fit here.

The database was already the source of truth for which accounts existed and what state they were in. Adding Redis meant the truth about "who is working on what" lived in two places, and if they ever disagreed, the job would duplicate work or strand it with no obvious debugging path.

There was also a lifecycle cost. A serverless function starts cold with no Redis connection, has to acquire one, hold the lock across the whole run, and release it cleanly. If the run is killed mid-flight, the lock is left behind, so now you need TTLs, refresh logic, and a recovery story for abandoned locks — a lot of machinery for a job whose work is just "sync some records." I wanted the coordination to live where the data already lived, and a crashed run to recover without anyone having to go clean it up.

## A status column and a timestamp

Each account had its own configuration row in a table. Two columns turned that row into a small coordination state machine:

- `status` — one of `IDLE`, `IN_PROGRESS`, or `FAILED`
- `started_at` — the moment the current run claimed this row

`IDLE` means nobody is working on it. `IN_PROGRESS` means a run owns it. `FAILED` means a run tried and gave up, so it is safe to retry. `started_at` is the lease, more on that below.

With those columns in place, claiming a row stops being a read followed by a write. It becomes one statement.

## Claiming a row

Instead of selecting eligible rows, marking them in a second step, and hoping nothing changed in between, the claim is a single `UPDATE` that flips the status to `IN_PROGRESS`, stamps `started_at` to now, and returns the rows it touched:

```ts
const staleThresholdSeconds = SCHEDULE_INTERVAL_SECONDS + 2 * 60;

// Eligible: idle, previously failed, or claimed so long ago it must be stuck.
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
  { status: Status.IN_PROGRESS, started_at: Sequelize.fn('now') },
  { where: { enabled: true, ...eligible }, returning: true }
);

// Only this run received rows back. A concurrent run got [] and exits.
if (claimed.length === 0) return;
```

Because the database applies the `UPDATE` and the `RETURNING` in one atomic step, two runs hitting this at the same instant cannot both win. The first one's status change makes the row ineligible for the second. One run gets the row back. The other gets nothing and stops.

That's the whole coordination scheme: a status column and a statement that's atomic by definition, with no lock and no Redis involved.

## Recovering from a stalled run

A run is not guaranteed to finish. The process can be killed, time out, or hit a fatal error. When that happens, the row is left in `IN_PROGRESS` forever, and the next scheduled run skips it as "already being worked on" — the classic stuck-lock problem.

The fix is the lease, and it is already in the eligibility clause above. A row is claimable again if its `started_at` is older than a threshold — the schedule interval plus a buffer:

```ts
const staleThresholdSeconds = SCHEDULE_INTERVAL_SECONDS + 2 * 60;
```

The buffer matters. The schedule interval alone is too aggressive — a run that is legitimately still working, just running a little long, could get re-claimed and duplicated anyway. The extra buffer trusts the current run past the next schedule tick, and only re-claims when it's reasonably confident the previous one is dead.

With that clause, a stalled row heals itself on the next scheduled run, which sees it as stale, claims it through the same atomic path, and picks the work back up.

`status` and `started_at` have to land in the same `UPDATE`, though. If they were two statements, a run could die between them and leave a row `IN_PROGRESS` with a stale or null `started_at`, and the recovery logic above stops working. Keeping them together means a claimed row always carries an honest lease, even if the run crashes a millisecond after claiming it.

## Failures shouldn't abort the batch

The claim gives you the rows. The processing loop is where a second discipline matters: if a batch contains several accounts and one throws, the wrong behavior is to let that exception escape and kill the run. The accounts that were claimed but never reached would get left in `IN_PROGRESS`, relying entirely on the lease to recover them later, which works but is wasteful and noisy.

Each account runs in its own try/catch instead. On success it goes back to `IDLE`. On failure it goes to `FAILED`, the error is logged, and the loop moves on:

```ts
for (const config of claimed) {
  try {
    await runSyncFor(config);
    await config.update({ status: Status.IDLE, last_success: Sequelize.fn('now') });
  } catch (err) {
    logger.error('Sync failed for account', { accountId: config.account_id, err });
    await config
      .update({ status: Status.FAILED })
      .catch((updateErr) => logger.error('Failed to mark config as FAILED', { updateErr }));
  }
}
```

The `FAILED` status does double duty: it records that something went wrong, and it makes the row eligible again next time, so a transient upstream blip gets retried automatically instead of stranding the account.

The `.catch` on the failure update isn't paranoia, either. If the database itself is flaky, the last thing you want is the error-handling path throwing and taking the whole loop down with it.

## The manual trigger

The job could also be triggered manually, for a specific account, outside the schedule. The tempting shortcut is a separate, simpler path that skips the claim, but that's how you end up with two code paths that drift apart, and a manual run that double-claims because it never went through the same check.

Instead, the manual trigger runs the exact same claim logic, with the `where` narrowed to the target account. If that account is already being worked on by a scheduled run, the eligibility clause excludes it, and the manual trigger gets an empty result and exits.

## Locking vs. state machines

Framing this as a state-machine question instead of a locking question is what made it easy to get right. A lock asks "is someone allowed to do this right now?" An atomic claim asks "did this run win responsibility for this row?" The second question is easier to answer correctly, because the database is already good at making a single `UPDATE` atomic, and it's already the source of truth for everything else the job cares about.

The scheduler can fire twice, or five times, and it doesn't matter: only one run can ever flip a given row to `IN_PROGRESS`, and a row that gets abandoned mid-flight finds its way back to `IDLE` or `FAILED` on its own.
