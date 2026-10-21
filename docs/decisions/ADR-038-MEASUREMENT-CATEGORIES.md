# ADR-038: Measurement categories

**Status:** accepted — the product owner decided it on 21 October 2026.

**Date:** 21 October 2026

**Ticket:** "Measurement categories" in [`docs/backlog/NEXT.md`](../backlog/NEXT.md)

**Builds on:** A2c (set groups, 25 September 2026) and
[ADR-037](ADR-037-A-WORKOUT-IN-PROGRESS.md) (live tracking). It changes what every
activity can be measured in, rewrites stored measurements, and changes the coach's
output grammar, which is why it is recorded.

## Context

Six ways to measure an activity existed: Sets, reps and load; Time, distance and pace;
Duration and intensity; Repetitions; Custom; Nothing to count. Tracking sessions live
showed what was missing: a plank or a hang is held, not counted, and a track session is
repeats with rest, neither of which had a shape. Two existing categories earned nothing:
Repetitions was one set of reps under another name, and Custom's free label, value and
unit could never be read back as a number.

## Decision

1. **Five categories:** Nothing to count, **Sets**, Time, distance and pace, Duration and
   intensity, and **Intervals**. Keys are unchanged where the meaning is (`sets_reps_load`
   stays the stored name of Sets).
2. **A set is counted or held.** A set group carries `reps` or `seconds`, never both, with
   an optional weight either way. A circuit can mix the two across groups. Live, each set
   row counts reps or a time, switched per activity.
3. **Intervals are blocks**, as sets are groups: each block is `repeats` of a `distance`
   and/or `seconds`, with optional `rest_seconds`; the distance unit sits once at the top,
   present exactly when a block has a distance. Live, blocks expand to one tickable row per
   repeat and fold back into blocks at Finish. There is still no timer (ADR-037).
4. **Repetitions folds into Sets** as one set of its count; the counted word is dropped,
   since the activity's name says what is counted. **Custom is removed.**
5. **Stored data is rewritten, not kept readable.** The owner decided no stored data needs
   keeping. Every row and every embedded activity (logs' planned snapshots, change
   entries, proposals) in a removed category is converted: Repetitions to one set of n,
   Custom to Nothing to count with its value dropped. The guard on `planned_snapshot` is
   switched off for that one update, in the same transaction. A workout in progress holding
   one is deleted. No reader keeps a path for the removed shapes; the flat legacy Sets shape
   (A2c) stays readable, as before.
6. **One list of modes in the database**, `is_training_measurement_mode`, which the five
   input validators now ask instead of each listing the modes.
7. **The coach's grammar follows**: group `seconds`, interval `blocks`, the removed keys
   gone. The schema version stays `fittip.session-activities.v1` (pinned in the database);
   the prompt version moves to `session-activities-v1.1-2026-10-21`. The fill's fixed
   prompt grew to within an 8,300-character budget, still inside the 15,000-token sizing.

## Consequences

- A measurement that is a held time or a set of repeats can be planned, logged, suggested
  by the coach and tracked live, and a later Progress can chart all five categories.
- Anything once recorded as Custom has lost its value; Repetitions read as one set.
- Heart rate or effort beside time and distance, elevation, and laps or lengths were
  offered and not chosen; adding one later is a field or a mode in this same shape.
