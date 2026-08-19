# ADR-016: Rolling-plan persistence and history

**Status:** accepted — approved by the product owner on 14 August 2026

**Date accepted:** 14 August 2026

**Legacy-reset ordering revised:** 14 August 2026

**Approved feature brief:**
[F-005](../product/F-005-ROLLING-TRAINING-PLAN.md)

**Would supersede for new planning writes:**
[ADR-008](ADR-008-M1-TRAINING-RECORD-TRANSACTIONS.md)

**Recurrence representation superseded by:**
[ADR-017](ADR-017-RECURRENCE-MATERIALIZATION.md) — the paragraph below
beginning "Represent recurrence as effective-dated series" is superseded for
how an occurrence is stored. Effective-dated series, this-and-future
successors, and bounded owner-local expansion are unchanged; an occurrence
inside the Plan window is now a real session row rather than a projection. No
other part of this ADR is affected, and its text is not edited.

## Context

ADR-008 stores planning as immutable versions of an owner-selected 1–7-day
plan. Adding or changing one session therefore creates another whole-plan
version.

F-005 instead approves one continuous rolling training plan; only an AI request
is bounded to 1–7 dates. The replacement needs directly readable current state
without sacrificing concurrency control, planned-versus-actual separation, or
an immutable account of what changed.

## Proposed decision

Give each owner one stable rolling-plan identity. Store every planned session
under a stable identity in one directly readable current row.

Apply each owner-approved action in one server-controlled transaction that:

1. changes the affected current session, series, occurrence-exception, or
   day-label rows;
2. appends one immutable plan change set containing before/after entries and
   provenance; and
3. advances one monotonic owner plan revision.

Cancellation marks current state cancelled and records the transition; it does
not erase the planned-session history. Completed sessions remain separate
factual records and retain immutable planned snapshots.

Represent recurrence as effective-dated series plus explicit occurrence
exceptions. Expand occurrences only for a bounded owner-local date slice. A
this-and-future change closes the previous effective segment and creates a
successor, preserving earlier meaning.

Saved sessions are owner-scoped current templates copied by value. A planned
session created from one has no continuing dependency on the library record.
AI proposals remain immutable records outside the Plan; **Finish review** can
change the Plan only by submitting the selected items as one plan change set.

Put recurrence expansion, change logging, conflict detection, ownership, and
atomic persistence behind one server-side rolling-plan module. Callers do not
construct owner identities, split current-state writes from history, or write
the underlying Plan tables directly. Same-owner constraints, explicit
privileges, RLS, owner-derived transactions, bounded lock waits, idempotency,
and stale-revision checks remain mandatory; no service-role application client
is introduced.

Use the one-way legacy training reset approved in F-005 before building the
replacement user-facing paths. Do not backfill or dual-write the old
bounded-plan records. Delete their data and remove their tables, functions, and
runtime modules rather than retaining a dormant compatibility model. F-005
remains the source of truth for product behavior, deleted and preserved data,
delivery order, and the destructive execution protocol.

## Considered options

### Keep bounded immutable plan versions

Rejected. They preserve history but make continuous and recurring planning look
like repeated replacement of short plans. The 1–7-day boundary belongs to the
AI operation, not the Plan identity.

### Use mutable session rows without first-class history

Rejected. This is simplest to read and write but erases what was planned and
allows retries or AI-driven changes to silently rewrite history.

### Snapshot the entire rolling plan after every change

Rejected. It copies an ever-growing calendar for small edits and represents
open-ended recurrence as artificial whole-plan snapshots.

### Preserve and backfill the old runtime records

Rejected. It would retain the bounded-plan model and unwanted founder/test
history. F-005 approves an empty operational start.

### Current rows plus an atomic append-only change log

Selected. It provides simple current reads and granular immutable history
without session-revision chains, current-head pointers, whole-plan snapshots,
or full event-sourcing infrastructure.

## Consequences

- Current Plan reads are direct; historical reconstruction uses the append-only
  before/after change log.
- One owner revision supplies optimistic concurrency across grouped changes.
- Recurrence requires bounded expansion, effective-date, exception, and
  owner-local calendar logic.
- The replacement remains Tier 1 because it changes schema, authorization, RLS,
  concurrency, accepted-data routing, and a destructive migration boundary.
- This ADR supersedes ADR-008 only for new planning writes; earlier governance
  and validation remain historical evidence.

## Approval boundary

The product owner approved F-005 and this persistence and history architecture
on 14 August 2026. This approval does not dispatch a ticket, apply a migration,
change the founder database, call a provider, incur spend, or authorize wider
use.

Every implementation slice still requires its own approved ticket and delivery
gates. The early destructive founder reset additionally requires the F-005
runbook, the exact reviewed commit, a maintenance-safe founder deployment, and
explicit final confirmation. The product owner revised the one-time
working-agreement exception on 14 August 2026; F-005 records its exact text and
limits.
