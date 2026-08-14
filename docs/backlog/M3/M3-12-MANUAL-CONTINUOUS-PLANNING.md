# M3-12: Manual continuous planning

**Status:** proposed — not approved for implementation

**Triage:** needs-triage

**Milestone:** M3

**Priority:** P1

**Tier:** 1 — owner-scoped writes, history, authorization, RLS, and visible behavior

**Depends on:** M3-11 accepted and the destructive founder reset recorded.

**Blocks:** M3-13 and every later F-005 replacement slice.

## Outcome

Let an owner use one continuous **Plan** without selecting or creating bounded
plan versions. They can add, edit, move, duplicate, lock, unlock, or cancel an
eligible one-off session on owner-local today or a future date and inspect the
resulting understandable plan history.

This is the first user-visible client of the M3-10 foundation after M3-11 has
removed the legacy training model. It replaces `/home/plan` directly; there is
no parallel review route or compatibility path.

## Scope to preserve when this ticket is drafted for approval

- Bounded date-slice Plan reads with empty dates represented honestly.
- One-off session creation and eligible future changes through the M3-10 atomic
  change-set and expected-revision boundary.
- Manual **Recovery day** labels as independent day-level Plan content that can
  coexist with sessions and do not count toward the daily session limit.
- Owner-local today/future validation, the 10-active-sessions-per-date limit,
  locks, conflict results, idempotency, and understandable before/after history.
- A serious-coach mobile Plan surface at `390x844`, including loading, empty,
  stale, invalid, offline-safe failure, and keyboard/focus behavior.
- Owner/anonymous/cross-owner authorization, RLS, grants, and direct tests for
  every new record or function required beyond M3-10.

## Non-goals

- No saved-session library, recurrence, replacement logging, Progress, AI
  proposal, regeneration, or additional destructive reset.
- No past planning, completion mutation, whole-plan version, or legacy
  compatibility path.
- No global activity or exercise library.

## Approval boundary

This shell records the approved F-005 decomposition only. After M3-11 is
accepted and its reset is recorded, the lead must turn it into one exact
dispatch-ready contract, add the
required `## Agent brief`, name all applicable project skills, and obtain
separate product-owner approval before a Tier 1 builder is dispatched.
