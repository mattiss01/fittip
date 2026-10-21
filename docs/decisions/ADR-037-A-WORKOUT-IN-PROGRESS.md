# ADR-037: A workout in progress is a draft, not a log

**Status:** accepted — the product owner decided it on 21 October 2026.

**Date:** 21 October 2026

**Ticket:** "Log a session live" in [`docs/backlog/NEXT.md`](../backlog/NEXT.md)

**Builds on:** [ADR-031](ADR-031-DELETING-A-LOG.md) (a log is removed only by the owner's
own delete). It adds a fourth kind of training record beside plans, proposals and logs, and
a function that writes a log and removes another record in one transaction, which is why it
is recorded.

## Context

A log was written once, after the training, in the log steps. On 21 October 2026 the
owner asked to track a session while doing it, judged a clickable prototype
(`prototype/live-workout`, variant A, "one list"), and decided: one clock for the whole
workout and no rest or per-activity timers; every activity's measurement can be changed
while training; a workout is started from a planned session or from scratch; an unfinished
one is kept **in the database**, so it survives a reload, a sleeping phone or another
device; and a clock on every page leads back to it. Distance by GPS was left for a native
app: a browser loses the position once the screen locks.

## Decision

1. **A running workout is its own record, `live_workouts`, and never a log.** Nothing
   reads it as training that happened: not Today, not Progress, not the coach, whose
   context source does not read it. It becomes a log only through the ordinary log steps.
2. **One per owner** (`live_workouts_owner_one_key`). A second start leads back to the
   one running.
3. **The owner writes it directly under RLS**, as `weight_entries` is: insert of its
   content, update of the columns a running workout changes, delete to discard. The owner
   and the start time are set by the database and cannot be written by a client, so the
   clock runs on the server's time. Pause and continue are stamped by the server too.
   Every change answers to the revision the screen read.
4. **It is a draft's shape, bounded rather than validated.** `state` is the activity list
   as the screen holds it, strings as a form holds them, bounded in count and size by the
   table and parsed by the server on every read and write. What it becomes is decided
   again by `apply_completion_change` when the log is saved, exactly as for a log written
   afterwards.
5. **Finishing opens the log steps filled in** with the time trained (pauses left out)
   and what was done: ticked sets collapsed into the log's groups, every other mode from
   its fields. "How did it go?" and "Anything off?" are still asked; the pain, illness and
   fatigue question is never skipped.
6. **`apply_live_workout_log` writes the log and removes the workout together.** It runs
   with the caller's rights, deletes the workout first and then calls
   `apply_completion_change('create', …)`. A second finish of the same workout waits for
   the first, finds nothing and is refused (`PT409`) rather than writing a second log; a
   log refused for any reason rolls the whole call back and leaves the workout to correct
   and finish. Because the delete makes a repeat harmless, the call keeps the client's
   transport retry, and `.retry(false)` stays on the `apply_*_change` calls alone.
7. **A planned session's activities are copied by value** at the start; the plan is never
   written. If that session is deleted, the link is cleared (`on delete set null`) and the
   workout is logged as unplanned training.

## Consequences

- The planned/proposed/logged separation holds: a workout in progress changes no plan
  and is no log, and Discard leaves nothing behind.
- Deleting an account takes its workout with it (`on delete cascade` from `profiles`).
- A workout left running is shown on every page until it is finished or discarded; nothing
  ends one on its own.
- A workout's measurement edits are as loose as a form's until the log is saved; a value
  the log refuses is corrected in the log steps, not on the live screen.
