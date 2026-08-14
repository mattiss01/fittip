# M3-16: AI proposal application

**Status:** proposed — not approved for implementation

**Triage:** needs-triage

**Milestone:** M3

**Priority:** P1

**Tier:** 1 — AI calls and spend, proposal persistence, atomic Plan writes, and visible behavior

**Depends on:** M3-15 accepted.

**Blocks:** rewritten M3-03B and M3-17.

**Absorbs:** the relevant roadmap-input and visible-reasoning behavior from
retired M3-03C.

## Outcome

Generate a fresh Coach proposal for 1–7 owner-local dates and review it in one
day-by-day timeline with the current Plan. Only explicitly staged **Will be
added** items enter the Plan, together in one atomic **Finish review** action.

## Scope to preserve when this ticket is drafted for approval

- Fresh schema-validated proposals against the replacement consumer context,
  with current Plan sessions and labels shown as **Already planned** rather than
  copied into the proposal.
- Automatically use a covering accepted roadmap and mark stale roadmap context
  honestly without blocking; preserve the goals-only path as ordinary.
- Show proposal-level Coach reasoning during review and retain it as immutable
  proposal evidence, never as a description of the later current Plan.
- Per-session and **Recovery day** choices: **Proposed**, **Will be added**, and
  **Rejected**. Finish only when every item is resolved.
- One atomic, idempotent finish that revalidates current revision, locks,
  ownership, safety, conflicts, and daily caps and applies only **Will be added**
  items in one understandable Plan change set.
- Discard with no Plan write and an exact confirmation count when staged items
  would be lost.
- Edit **Already planned** sessions through the normal Plan editor within review;
  save immediately, preserve staged choices, refresh current Plan content, show
  a non-blocking stale-context warning, and revalidate on finish.
- Owner/RLS/source/lineage/spend/concurrency tests and the complete `390x844`
  review flow with honest loading, failure, stale, and conflict states.

## Non-goals

- No Coach-driven replacement, movement, or cancellation of existing Plan
  sessions; the owner edits those directly.
- No regeneration, recurrence mutation, old-data deletion, session
  detailing, or automatic save to the private library.

## Approval boundary

This shell records the approved F-005 behavior and M3-03C merge only. After
M3-15 is accepted, roadmap staleness, persistence, UI, spend, and transaction
details require one exact Agent brief and separate product-owner approval before
Tier 1 implementation.
