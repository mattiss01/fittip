# M1-05: Consolidated M1 manual plan-and-track validation

**Status:** proposed — not approved to start

**Milestone:** M1 — manual training planning and tracking

**Priority:** P1

**Feature brief:** [F-002 proposed](../product/F-002-MANUAL-TRAINING-PLANNING-TRACKING.md)

**Depends on:** [M1-01 accepted](M1-01-TRAINING-RECORDS-FOUNDATION.md), [M1-02 accepted](M1-02-SELECTABLE-HORIZON-PLANNING.md), [M1-03 accepted](M1-03-QUICK-TRAINING-LOGGING.md), and [M1-04 accepted](M1-04-TODAY-HISTORY-NAVIGATION.md)

## Outcome

An independent reviewer proves the complete founder flow:

> select the next 1–7 days → create a sport-agnostic plan → see today's training → log what
> actually happened → compare planned with actual → inspect preserved history.

This ticket changes no product or schema behavior. Findings return to the
owning M1 ticket as focused corrections.

## Dispatch prerequisites

- Exact accepted commits for M1-01 through M1-04.
- Clean integration on the review target.
- Product-owner or synthetic data only.
- No unresolved material decision or undocumented deviation.
- Independent validator who did not build the four feature slices.

## Validation matrix

### Data and authorization

- Clean migration from zero and generated types.
- Privilege/RLS matrix for every new table.
- Owner access plus anonymous and cross-user denial.
- No service-role/browser business-rule path.

### Core invariants

- Plans, completions, and future proposals remain separate.
- Manual edits create new accepted plan versions.
- Previous versions and completion/correction history remain available.
- Logging never changes planned records.
- Personal-activity edits never alter historical snapshots.
- Locks, date ranges, timezone, ordering, units, stale writes, and idempotency
  follow their accepted contracts.

### Mobile flow

- `390x844` first plan creation with selectable 1–7-day horizons and
  multi-sport sessions.
- Today before and after logging.
- Completed, partial, skipped, replaced, rest, and unplanned outcomes.
- Plan-versus-actual history and correction history.
- Empty, loading, error, offline, conflict, expiry, and sign-out states.
- Keyboard, focus, touch, contrast, accessible names, and no horizontal
  overflow.

### Security and privacy

- Notes/sensitive fields absent from logs, analytics, snapshots, and external
  requests.
- No secret, owner UUID, credential, or unrelated remote target exposed.
- Founder-staging restrictions remain fail closed.
- No friend/public/commercial/production claim.

### Repository quality

- Lint, typecheck, deterministic tests, database tests, build, E2E, whitespace,
  link, and documented formatting-baseline checks.
- Regression of accepted M0 authentication and founder staging.
- Exact changed files, commands, results, limitations, and mobile demo path.

## Acceptance criteria

1. Every dispatch prerequisite is evidenced.
2. All owner/cross-user/RLS checks pass.
3. The full plan → Today → log → history flow passes at `390x844`.
4. At least five different sport/measurement examples remain representable.
5. Historical plans and actuals remain separate after edits, logging, and
   corrections.
6. Every failure/recovery state is honest and accessible.
7. No unapproved M2/M3, AI, analytics, external-user, or production behavior
   exists.
8. All blocking findings are corrected and re-reviewed in their owning ticket.
9. `docs/validation/M1-05-VALIDATION.md` contains the consolidated evidence.

## Handoff

The validation record must state:

- exact branch and commits;
- changed data and policy matrix;
- commands and results;
- screenshots/demo paths;
- security/privacy/secret scans;
- known limitations;
- confirmation that the validator added no product behavior; and
- the precise decision: **accept M1 as the manual planning-and-tracking
  milestone, or return focused corrections**.

## Approval gate

The product owner approves the validator, exact integrated commits, scenario
matrix, evidence retention, and accessibility checklist. Dispatch starts only
after M1-01 through M1-04 are individually accepted. Until then M1-05 remains
**proposed**.
