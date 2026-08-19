# ADR-017: Recurrence materialization

**Status:** proposed — awaiting product-owner approval

**Date proposed:** 19 August 2026

**Approved feature brief:**
[F-005](../product/F-005-ROLLING-TRAINING-PLAN.md)

**Supersedes for recurrence only:**
[ADR-016](ADR-016-ROLLING-TRAINING-PLAN.md)

**Implemented by:**
[M3-14](../backlog/M3/M3-14-RECURRING-SESSION-SERIES.md)

## Context

ADR-016 decided how the rolling plan persists current state and history, and it
answered recurrence in one paragraph:

> Represent recurrence as effective-dated series plus explicit occurrence
> exceptions. Expand occurrences only for a bounded owner-local date slice.

Read literally that makes a future occurrence a projection rather than a row: a
`rolling_plan_sessions` row exists only once the owner diverges from the rule.
F-005 says the same in product language — "expand only the requested date
slice", and "Saving one session creates an exception."

Drafting M3-14 forced the question the paragraph leaves open, because the two
readings produce different schemas, different reads, and different work for
every consumer M3-15 and M3-16 restore.

Three facts constrain the answer, all established from the shipped code rather
than from intent:

1. `authenticated` holds `SELECT` and nothing else on all five rolling-plan
   tables. The only write path is `apply_rolling_plan_change_set`.
2. That function always appends one immutable change set and always advances
   the owner's monotonic revision. There is no write that does not become
   history.
3. `get_rolling_plan_slice` — the single seam every Plan read passes through —
   is declared `stable` and `security invoker`. It cannot write, and a version
   that could would no longer be a read.

So "materialize an occurrence" is not a caching detail. It is a write, it must
be recorded as one, and the decision is really about who causes that write.

## Decision

**An occurrence is an ordinary `rolling_plan_sessions` row.** A recurring series
is a first-class effective-dated record, and its occurrences are written ahead
for the owner-local fourteen-day Plan window by a dedicated owner-derived
function, recorded in the permanent change log under a distinct machine
provenance.

Specifically:

- A series is stored as an effective-dated rule plus a session template. A
  this-and-future change closes the current segment's end date and creates a
  successor, preserving what earlier occurrences meant. This is unchanged from
  ADR-016.
- Occurrences inside the Plan's fourteen-day owner-local window are real
  sessions, carrying their series identity and the rule date that produced
  them. Every existing rule — the ten-per-date cap, the past-date boundary,
  locks, ordering, cancellation, and the completion snapshot — applies to them
  with no new concept and no second code path.
- Materialization runs in one `SECURITY DEFINER` function that derives the
  owner from `auth.uid()` alone, writes its additions as one change set with a
  machine provenance distinct from any owner action, and **returns unchanged
  without advancing the revision when nothing is missing**.
- Materialization is invoked from a Server Action only. It never runs during
  render, so a page read never performs a write and `get_rolling_plan_slice`
  stays `stable`.
- An occurrence the owner has changed is marked as diverged and the materializer
  never revisits it. This preserves ADR-016's exception semantics; what changes
  is that the exception is a flag on an existing row rather than the only row
  that exists.

The product owner made this decision on 19 August 2026, against the recorded
objection below and with the consequences in this ADR stated before approval.

## Considered options

### Series plus projected occurrences, as ADR-016 wrote it

Rejected by the product owner. A future occurrence is not a row;
`get_rolling_plan_slice` expands the rule across the requested dates and merges
the result with real sessions; a row appears only when the owner diverges.

It is the stronger option on every architectural measure, and this ADR should
say so plainly rather than pretend the decision was close. Reads stay reads.
The change log keeps meaning exactly one thing — what the owner did. The
revision advances only on owner action. An open-ended series costs nothing,
because expansion is always bounded by the dates asked for.

Its real price is that an un-materialized occurrence has no database identity,
so acting on one means deriving a deterministic identity from the series and
the rule date and materializing inside the same transaction as the change. That
is genuine complexity concentrated in the hardest part of the system, and it is
the price the product owner declined to pay in exchange for the uniformity the
selected option gives every later consumer.

### Materialize during the Plan read

Rejected. It is the obvious way to keep coverage current, and it is the reason
the selected option needs a Server Action instead. Making
`get_rolling_plan_slice` a writer means opening the Plan appends entries to the
owner's permanent history that no owner action produced, consumes revision
numbers on a page view, and makes two open tabs collide with each other over
the revision. A GET that mutates also breaks every reasonable assumption about
prefetch and retry.

### A second write path that skips the change log

Rejected. Writing session rows without appending history would keep the log
purely owner-caused, which is exactly what the selected option gives up. It
does so by breaking something worse: ADR-016's rule that callers never split
current-state writes from history, and the select-only grant posture that makes
that rule enforceable in the database rather than by convention.

### Materialize only when the owner next changes something

Rejected. It avoids the read-triggered write, but the Plan must still display
occurrences that are not yet rows between the window rolling and the owner's
next change — so it requires the projected-occurrence machinery of the first
option *and* a materializer on top of it.

## Consequences

The first four are costs the selected option accepts. They are stated here so
that a future reader finds them in the decision rather than discovering them in
the schema.

1. **The change log is no longer purely owner-caused.** It gains entries under a
   machine provenance that no owner action produced. Every history consumer,
   present and future, must distinguish them — a plan-history surface that
   renders them as things the owner did would be lying.
2. **Row growth is unbounded over time.** Bounded per roll of the window, not in
   total. An open-ended daily series accumulates roughly 365 session rows per
   year of active use, plus their activities and change entries, and nothing in
   this decision reclaims them.
3. **Coverage depends on the Plan being opened.** An owner who does not visit
   has no materialized occurrences past their last visit. M3-15's Today,
   Progress, and AI context must each top up before reading, or knowingly read
   an incomplete plan. This is the consequence most likely to surface as a
   defect in a later slice, because it is invisible until a consumer that is not
   the Plan reads the Plan.
4. **One owner action can cost two revisions**, because materialization is its
   own change set rather than part of the owner's.
5. Every downstream consumer reads occurrences as ordinary sessions, with no new
   concept, no derived identity, and no second code path. This is the benefit
   the four costs above buy, and it is a real one.
6. Recurrence still requires owner-local calendar logic, effective-date
   handling, and correct behavior across daylight-saving transitions. Storing
   dates as `date` rather than as timestamps keeps that arithmetic DST-free by
   construction, as it already does for one-off sessions.

## Approval boundary

This ADR records an architecture decision only. It does not dispatch a ticket,
apply a migration, change the founder database, or authorize spend. M3-14
requires its own approved Tier 1 dispatch, a distinct builder, a distinct
independent reviewer, Preview verification, and product-owner acceptance.

ADR-016 remains authoritative for everything except the recurrence paragraph
this ADR supersedes. Its text is not edited; accepted decisions are permanent
history.
