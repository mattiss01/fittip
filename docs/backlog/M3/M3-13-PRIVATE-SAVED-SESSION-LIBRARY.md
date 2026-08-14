# M3-13: Private saved-session library

**Status:** proposed — not approved for implementation

**Triage:** needs-triage

**Milestone:** M3

**Priority:** P1

**Tier:** 1 — private owner data, schema, authorization, RLS, and visible behavior

**Depends on:** M3-12 accepted.

**Blocks:** M3-14 and every later F-005 replacement slice.

## Outcome

Give each owner a private library of reusable saved sessions. Saving and reuse
are explicit copy operations: library changes never alter planned, recurring,
proposed, or completed training that already exists.

## Scope to preserve when this ticket is drafted for approval

- One mutable current record per owner-owned saved session, with create, list,
  inspect, edit, and delete behavior and no revision chain or archive state.
- Explicit save from an eligible owned planned session or Coach suggestion
  without adding, accepting, moving, or otherwise changing Plan content.
- Reuse into a reviewed one-off session now, and a stable copy boundary that
  M3-14 can use for recurring-series templates.
- Reusable sport-agnostic session and activity fields only; exclude dates,
  occurrences, completion state, Plan locks, proposal decisions, and source
  history.
- Duplicate entries allowed, with no automatic matching, merging, deduplication,
  global catalog, sharing, or cross-owner discovery.
- Same-owner references, owner-derived writes, RLS, grants, direct denial tests,
  and the complete mobile save/select/review flow at `390x844`.

## Non-goals

- No live link, versioning, archive, synchronization, sharing, global library,
  recommendation engine, or automatic save of AI output.
- No recurring-series behavior, replacement consumers, AI generation,
  regeneration, or destructive reset.

## Approval boundary

This shell records the approved F-005 decomposition only. After M3-12 is
accepted, the lead must create the exact dispatch contract and Agent brief and
obtain separate product-owner approval before Tier 1 implementation.
