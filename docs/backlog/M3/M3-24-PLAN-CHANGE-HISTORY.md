# M3-24: Plan change history

**Status:** proposed — split out of [M3-15C](M3-15C-PROGRESS.md) on 31 August
2026 when the product owner scoped Progress to completions only. Not approved
for dispatch. It gains an `## Agent brief` when the product owner approves it.

**Triage:** needs-decision

**Milestone:** M3

**Priority:** P2

**Tier:** 2 — a new read over already-granted tables. It becomes Tier 1 if it
turns out to need a grant, a view, or a privileged function.

**Depends on:** [M3-15C](M3-15C-PROGRESS.md) accepted, so the Progress surface
this attaches to exists.

## Why this ticket exists

F-005 **Owner journeys → Review history** has four items. M3-15C covers 1 and
4, which are about completions. This ticket owns 2 and 3, which are about the
plan:

> 2. Plan history is organized by understandable changes, for example "Added
>    Tuesday swim series" or "Accepted two Coach sessions", rather than by a
>    sequence of entire short plans.
> 3. Opening a change shows the affected sessions and their before/after
>    values.

They were split off because they are a different product from the training
record, not because they are unimportant. Nothing in FitTip shows them today.

## What already exists, and what does not

**The data is there and readable.** `rolling_plan_change_sets` and
`rolling_plan_change_entries` both have RLS enabled, an owner-select policy,
and `grant select ... to authenticated`, from migration
`20260814164502_m3_10_rolling_plan_foundation.sql`. Each entry carries
`change_kind`, `before_state`, `after_state`, `local_date`, and a nullable
`session_id`. **No migration is expected.**

**The read path does not exist.** `RollingPlanAdapter` exposes `getPlanSlice`,
`listSeries`, `applyChangeSet`, and `materializeSeries`. Nothing reads either
change table from application code. This ticket adds that read, its parser, its
in-memory adapter counterpart, and the shared adapter contract both adapters
run.

## The hard part is not the read

**ADR-017 consequence 1 binds this ticket directly:**

> The change log is no longer purely owner-caused. It gains entries under a
> machine provenance that no owner action produced. Every history consumer,
> present and future, must distinguish them — a plan-history surface that
> renders them as things the owner did would be lying.

So materialization change sets must be visibly not the owner's doing, or
excluded. That is a product decision, not an implementation detail.

The second hard part is item 2's "understandable changes". A change set is a
list of operations; "Added Tuesday swim series" is a sentence. Turning one into
the other is copy design over a set of shapes — add, edit, cancel, remove,
lock, set recovery day, add/edit/end series, materialize — and it has to stay
honest when a set mixes several.

## Decisions the product owner owns

1. **Machine provenance.** Are materialization change sets hidden entirely,
   shown in a visibly different voice, or shown only inside an expanded change?
   ADR-017 forbids only presenting them as owner actions.
2. **Where it lives.** A second tab on `/home/progress`, a separate route, or
   somewhere on `/home/plan`. Progress is the F-005 home for Review history,
   but it now means "your training record", which this is not.
3. **How far back**, and on what bound. M3-15C settled a calendar month for
   completions; change sets are far sparser, so a month may be mostly empty.
4. **Whether a change can be undone from here**, or whether this is strictly a
   record. Strictly a record is the smaller and safer ticket, and nothing in
   F-005 asks for undo.

## Related

- [F-005](../../product/F-005-ROLLING-TRAINING-PLAN.md), Owner journeys →
  Review history, items 2 and 3.
- [ADR-017](../../decisions/ADR-017-RECURRENCE-MATERIALIZATION.md),
  consequence 1.
- [M3-15C](M3-15C-PROGRESS.md), which records why the two halves were split.
