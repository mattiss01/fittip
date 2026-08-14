# M3-14: Replacement consumer readiness

**Status:** proposed — not approved for implementation

**Triage:** needs-triage

**Milestone:** M3

**Priority:** P1

**Tier:** 1 — completion history, consumer boundaries, schema, authorization, and RLS

**Depends on:** M3-13 accepted.

**Blocks:** M3-15 and every later F-005 replacement slice.

**Absorbs:** the still-valid exact-source behavior from retired M3-08.

## Outcome

Prepare Plan, Today, logging, Progress, and AI context to use only the rolling
plan at activation. Create the replacement factual completion/correction path
needed after legacy completion records are deleted, while keeping every new
consumer dormant until M3-16 activates them together.

## Scope to preserve when this ticket is drafted for approval

- One consistent owner-local dated view of one-off, recurring, cancelled,
  locked, and **Recovery day** Plan content for every replacement consumer.
- Replacement completion, completed-activity snapshot, head, and correction
  persistence linked safely to stable rolling-plan sessions or valid unplanned
  logging, with permanent append-only factual history after activation.
- Logging and Progress behavior that keeps planned-versus-actual records
  separate and never lets recurrence or replanning rewrite a completion.
- Date-bounded AI context containing the exact current Plan slice plus the
  separately bounded eligible completion history.
- A proposal source records only completions actually transmitted to the Coach;
  byte-trimmed or otherwise unsent eligible completions are not sources. A
  correction to a sent completion conflicts; correction of an unsent one does
  not. Existing honest conflict copy remains unless the dispatch contract
  demonstrates a reason to change it.
- Owner/anonymous/cross-owner RLS and grants, source minimization, consumer
  parity, history integrity, query bounds, and dormant-path integration tests.

## Non-goals

- No activation, old-data deletion, compatibility synchronization, dual write,
  AI proposal review, regeneration, or founder cutover.
- No change to the accepted training-history eligibility window or byte budget.

## Approval boundary

This shell records the approved decomposition and M3-08 merge only. After
M3-13 is accepted, the exact replacement completion and dormant-consumer
architecture requires an Agent brief and separate product-owner approval before
Tier 1 implementation.
