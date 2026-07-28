# M2-04: Consolidated goals, memory, and intake validation

**Status:** proposed — not approved to start

**Milestone:** M2 — goals, possibilities, and editable memory

**Priority:** P1

**Depends on:** [M2-01 accepted](M2-01-GOAL-MODEL-VALIDATION.md), [M2-02 accepted](M2-02-MEMORY-MODEL-MANAGEMENT.md), and [M2-03 accepted](M2-03-INTAKE-FACT-REVIEW.md)

**Blocks:** [M3-01](M3-01-LOCAL-AI-ADAPTER-CONTROLS.md)

## Outcome

An independent reviewer proves that the owner can define prioritized goals and
inspectable constraints/preferences, then use structured intake to review and
explicitly publish facts without AI silently treating candidates as truth.

This ticket adds no behavior. Findings return to M2-01, M2-02, or M2-03.

## Validation scope

- Clean migrations and generated types.
- Owner, anonymous, and cross-user privilege/RLS matrix.
- Maximum three active core goals, supporting-goal ordering, lifecycle,
  archive/delete, concurrency, and stale writes.
- Memory class, status, provenance, confidence, expiry, revision, disable,
  delete, and sensitive-content behavior.
- Intake drafts/candidates, explicit accept/edit/reject, partial selection,
  duplicate/conflict handling, atomic publication, resume/retry/cancel, and
  conservative safety copy.
- Integration with the accepted M1 **You** destination without changing M1
  planning/logging/history rules.
- `390x844` goal, memory, and intake flows plus accessibility.
- Privacy, content-log, analytics, secret, and external-request scans.
- Existing quality, database, build, E2E, and M0/M1 regression commands.

## Acceptance criteria

1. M2-01 through M2-03 exact accepted commits are integrated.
2. Owner access and cross-user denial pass for every new owned record.
3. A fourth active core goal fails safely under concurrent requests.
4. Proposed/inferred memory cannot become active without the approved explicit
   review path.
5. Intake publication is atomic and preserves candidate/review history.
6. Sensitive text does not enter logs, analytics, or external services.
7. All mobile and accessibility scenarios pass at `390x844`.
8. No AI provider, plan generation, external user, or production behavior is
   introduced.
9. `docs/validation/M2-04-VALIDATION.md` records the complete evidence.

## Handoff

Provide exact commits, changed data/policies, commands/results, mobile demo
paths/screenshots, privacy/security scans, limitations, and the precise
decision: **accept M2 as the goals/memory/intake foundation, or return focused
corrections**.

## Approval gate

The product owner approves the independent validator, exact commits, scenario
matrix, evidence retention, and accessibility checklist. Dispatch begins only
after M2-01 through M2-03 are individually accepted.
