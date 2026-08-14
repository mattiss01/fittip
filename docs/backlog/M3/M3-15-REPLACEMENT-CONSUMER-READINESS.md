# M3-15: Replacement consumer readiness

**Status:** proposed — not approved for implementation

**Triage:** needs-triage

**Milestone:** M3

**Priority:** P1

**Tier:** 1 — completion history, consumer boundaries, schema, authorization, and RLS

**Depends on:** M3-14 accepted.

**Blocks:** M3-16 and every later F-005 replacement slice.

**Absorbs:** the still-valid exact-source behavior from retired M3-08.

## Outcome

Restore Today, logging, Progress, and the roadmap operation on the rolling plan and create the
replacement factual completion/correction path after M3-11 removed the legacy
records. Prepare the bounded completion-history interface that M3-16 will use
for AI context. Plan itself is already active from M3-12.

## Scope to preserve when this ticket is drafted for approval

- One consistent owner-local dated view of one-off, recurring, cancelled,
  locked, and **Recovery day** Plan content for every replacement consumer.
- Replacement completion, completed-activity snapshot, head, and correction
  persistence linked safely to stable rolling-plan sessions or valid unplanned
  logging, with permanent append-only factual history from the first write.
- Logging and Progress behavior that keeps planned-versus-actual records
  separate and never lets recurrence or replanning rewrite a completion.
- Date-bounded AI context containing the exact current Plan slice plus the
  separately bounded eligible completion history.
- Restore roadmap generation/review against replacement completion context
  without changing the accepted roadmap product contract or preserved records.
- A proposal source records only completions actually transmitted to the Coach;
  byte-trimmed or otherwise unsent eligible completions are not sources. A
  correction to a sent completion conflicts; correction of an unsent one does
  not. Existing honest conflict copy remains unless the dispatch contract
  demonstrates a reason to change it.
- Owner/anonymous/cross-owner RLS and grants, source minimization, consumer
  parity, history integrity, query bounds, and replacement-path integration tests.

## Non-goals

- No old-data deletion, compatibility synchronization, dual write, AI proposal
  review, regeneration, or additional founder reset.
- No change to the accepted training-history eligibility window or byte budget.

## Approval boundary

This shell records the approved decomposition and M3-08 merge only. After
M3-14 is accepted, the exact replacement completion and consumer
architecture requires an Agent brief and separate product-owner approval before
Tier 1 implementation.
