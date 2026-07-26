# M2-05: Consolidated local M2 validation slice

**Status:** proposed — not approved to start

**Milestone:** M2

**Priority:** P1

**Type:** independent validation and evidence only; no new product behavior

**Depends on:** [M2-01 accepted](M2-01-LOCAL-AI-ADAPTER-CONTROLS.md),
[M2-02 accepted](M2-02-ROADMAP-PROPOSAL.md),
[M2-03 accepted](M2-03-SEVEN-DAY-PLAN-PROPOSAL.md), and
[M2-04 accepted](M2-04-PLAN-EDIT-LOCK-ACCEPTANCE.md)

**Architecture boundary:** ADR-006 and ADR-007 accepted; M0-06A accepted before
founder-hosted validation

**Blocks:** M2 founder milestone acceptance; does not authorize M3, friends,
public registration, commercial use, production, or external use

## Outcome

Independently validate the complete local owner/synthetic M2 path: controlled
AI adapter, roadmap proposal, exact seven-day proposal, editing, locks,
personal activities, and transactional acceptance. Produce evidence for mock
and opt-in live-provider behavior, token/cost caps, schema failure,
authorization, proposal/versioning invariants, 390px UX, accessibility, and
absence of secrets/content logs.

M2-05 adds no behavior and fixes no finding. Failures return to their owning
M2 or M1/M0 ticket.

## Local-owner and pre-friends boundary

- Validation uses synthetic fixtures by default.
- Any live-provider evidence is explicit opt-in, limited to one approved owner
  or synthetic input, and stays inside the approved request/token/cost cap.
- Friend/external data, non-M0-06A hosted deployment, external
  analytics/monitoring, remote resource changes, and unapproved spend are
  prohibited.
- M0-03B, M0-04 and its later implementation, M0-05, and M0-06 remain
  unresolved pre-friends/public/commercial gates unless separately accepted. A
  M2 PASS is not external-use readiness.

## Readiness criteria

The independent validator starts only when:

1. M2-01 through M2-04 and their material decisions are accepted;
2. exact reviewed commits are integrated with no unreviewed behavior;
3. provider/model/account/key-use, data-use/retention, price/rate card, quality
   threshold, and hard budget values have a traceable product-owner approval;
4. live testing is disabled by default and the fixture path passes without
   network access;
5. local Auth/Supabase fixtures are synthetic and resettable;
6. no friend/external data exists in the test environment; and
7. the validator did not build M2-01 through M2-04.

If readiness fails, stop and route the missing item to its owner.

## Scope

1. Reproduce clean migrations, generated types, grants, policies, constraints,
   and accepted M2 records.
2. Validate server-only adapter boundaries and the complete local
   flag/owner/operation/config/rate/concurrency/budget/idempotency gate.
3. Validate every schema and deterministic business/safety constraint.
4. Run mock/fixture flows and one approved opt-in live-provider contract test.
5. Verify roadmap and seven-day proposal source/version/uncertainty/allocation
   semantics.
6. Verify proposal editing, locks, personal activities, transactional
   acceptance, immutable versions, stale state, and retries.
7. Validate owner/anonymous/cross-user/cross-owner denial.
8. Walk the accepted `390x844` story and perform accessibility review.
9. Inspect logs, telemetry, errors, screenshots, snapshots, URLs, client
   bundles, and Git for secrets or raw content.
10. Create one consolidated M2 validation record with PASS or routed findings.

## Non-goals

- No migration, policy, repository, schema, prompt, adapter, route, component,
  copy, test expectation, limit, or behavior change.
- No correction while testing, provider/model change, higher budget, retry,
  new prompt, second adapter, or new external resource.
- No logging/completion, plan-versus-actual history, replan, coaching chat,
  pattern detection, progress, analytics, new hosted resource, or external
  user.
- No claim of legal/privacy compliance or external readiness.

## Validation matrix

### Adapter and control boundary

- Client import/bundle inspection proves provider code, key reader, owner
  allowlist, budget state, and raw telemetry are server-only.
- Default test run makes zero external AI calls.
- Every denied gate stops before adapter invocation.
- Anonymous, second local user, non-allowlisted user, friend data marker,
  preview/production environment, disabled flag, invalid config, missing key,
  unknown/stale price, exceeded limit, and unavailable control fail closed.
- Concurrency and replay create at most one attempt and reservation.
- Timeout/cancellation/provider failure returns a safe stable error.

### Schema and safety

- Valid and invalid fixture corpus covers unknown fields, malformed JSON,
  oversize, every measurement mode, invalid date/range, excessive volume,
  missing goal, stale source, unsafe prescription, and prohibited diagnosis/
  treatment/safety claims.
- Every invalid candidate is rejected in full and writes no proposal or
  accepted record.
- Exactly seven owner-local dates survive timezone and DST cases.
- Roadmap uncertainty/review points and plan goal allocation/tradeoffs are
  present and validated.

### Authorization and persistence

- Direct grants/RLS/repository tests cover owner access, anonymous denial,
  user A versus user B, owner reassignment, and cross-owner references for
  proposals, sources, roadmap versions, weekly versions, sessions, activities,
  personal activities, and current pointers.
- Authentication alone never counts as ownership.
- Accepted M1 owner/active/status/expiry selection is preserved.
- Proposal generation cannot write accepted data; acceptance makes no provider
  call.

### Proposal, acceptance, versioning, and locks

- Generated, edited, rejected, and accepted records remain distinct.
- Source revisions and current-pointer conflicts fail without overwrite.
- Fault injection at every acceptance step rolls back all writes.
- Double submit/retry/concurrent acceptance creates one accepted version and no
  duplicate activity definitions.
- Prior accepted versions and generated proposal evidence remain immutable.
- Session/activity locks persist exactly as reviewed.
- Personal activity reuse is owner-scoped and near duplicates never silently
  merge.
- No completed-history/log/replan record or behavior exists.

### Mock and opt-in live evidence

- Fixture adapter passes deterministically with recorded schema/validation
  versions and synthetic telemetry.
- Live test is skipped when explicit enablement is absent.
- When separately approved and enabled, run the smallest accepted request with
  synthetic or approved owner context.
- Record provider/model codes, prompt/schema versions, latency, token counts
  when reported, estimated/reported cost state, rate-card version, validation
  result, and remaining cap without content or secret.
- Prove the attempt stayed below the per-request and total validation cap.
- Do not commit provider output or raw prompt as evidence.

### Mobile and accessibility

At `390x844`, independently run:

1. accepted M1 context → generate/review/accept roadmap;
2. generate exact seven-day proposal;
3. inspect allocation, uncertainty, alternatives, and safety state;
4. edit session/activity, add/remove/reorder within limits, and set locks;
5. review side-by-side changes and accept;
6. reopen accepted immutable plan and prior/source versions;
7. exercise reject, stale conflict, provider failure, schema failure, budget
   denial, transaction failure, and repeated submit.

Check headings, labels, focus, errors, live regions, keyboard use, touch
targets, contrast, zoom/reflow, safe area, loading, and non-color-only status.

### Leakage and external-boundary review

Search committed files, Git diff, built client assets, rendered HTML, URLs,
logs, telemetry, errors, stack traces, snapshots, screenshots, fixtures, test
reports, and browser storage for:

- API/provider keys, tokens, Auth values, cookies, connection strings, headers,
  environment values, and raw provider errors;
- raw prompts/model output, goals, memory, intake, activities, plan content,
  health-adjacent text, email, and owner identifiers; and
- external analytics calls, hosted endpoints, remote database links, friend
  data, or unapproved network resources.

## Acceptance criteria

1. Readiness proves accepted M2-01 through M2-04 commits and approved
   provider/model/data-use/retention/quality/budget decisions.
2. Clean migrations, generated types, database lint/advisors, direct RLS tests,
   formatting, lint, typecheck, unit/integration, browser tests, and build pass.
3. Fixture tests are deterministic/network-free and live tests are opt-in.
4. All local enable/owner/auth/context/rate/concurrency/token/cost/idempotency
   controls fail closed before provider invocation.
5. One approved live test, if enabled, stays under the recorded hard cap and
   yields only schema-validated proposal output.
6. Malformed/unsafe/provider-failed output writes no proposal/accepted data and
   exposes no raw error/content.
7. Owner/anonymous/cross-user/cross-owner tests pass for every M2 record.
8. Roadmap and exact seven-day proposals preserve sources, uncertainty,
   priorities, constraints, sport-agnostic activities, and conservative safety.
9. Editing/locks/activities/acceptance are transactional, idempotent, and
   versioned; prior accepted/source history remains immutable.
10. The accepted `390x844` flow and manual/automated accessibility checks pass
    or findings are routed before acceptance.
11. Secret/content/external-request inspection finds no leak, friend data,
    non-M0-06A hosted use, analytics sink, or unapproved resource/spend.
12. The diff contains validation artifacts only; no product behavior or test
    expectation is changed.

## Expected commands and evidence

Discover exact supported commands from installed scripts/CLI help. The expected
families are clean install, local database start/reset/lint/advisors/tests,
generated types, format, lint, typecheck, unit/integration, Playwright at 390px,
production build, dependency/secret scans, and `git diff --check`.

Create `docs/validation/M2-05-VALIDATION.md` only during approved validation.
Record exact source commits, tool versions, commands/results, schema/RLS
matrix, fixture/live call count and cap evidence, test matrix, screenshots with
synthetic content, accessibility results, leakage scan, limitations,
  pre-friends/public/commercial blockers, and independent verdict.

## Finding ownership

| Finding | Return to |
|---|---|
| Adapter, owner gate, secrets, rate/concurrency/budget, telemetry, provider errors | M2-01 |
| Roadmap schema/source/version/uncertainty/review UX | M2-02 |
| Seven-day dates/constraints/activities/allocation/safety/reasoning UX | M2-03 |
| Edit/diff/lock/activity/transaction/version/acceptance UX | M2-04 |
| Goal/memory/intake provenance or ownership regression | Owning M1 ticket |
| Auth/profile/RLS foundation regression | Owning M0 ticket |
| Privacy/recovery/hosted/external readiness gap | M0-03B, M0-04 implementation, M0-05, or M0-06 |
| New behavior or material decision | New proposed brief/ADR |

## Required handoff

Provide exact validation branch/commit and source commits, changed validation
files, readiness result, commands/results, schema/RLS matrix, fixture/live call
count and token/cost-cap evidence, schema/safety failure evidence,
authorization/versioning/locks/transaction results, `390x844` evidence,
accessibility and leakage findings, known limitations, explicit
`owner/synthetic local or founder-hosted only — friends and public/external use blocked`
statement, and one verdict: **PASS** or **BLOCKED with routed findings**.

## Open validation decisions

1. Exact integrated commit set and independent validator.
2. Synthetic fixture set and whether any minimized owner input is permitted in
   the single live test.
3. Maximum live-validation request/token/cost allowance, within M2-01's
   approved hard limits.
4. Evidence/screenshot retention and redaction.
5. Automated accessibility tool plus manual checklist.
6. Exact external-use blocker statement based on actual M0 gate status.

## Approval gate

M2-05 may be approved only after M2-01 through M2-04 are accepted and an
independent validator is named. Approval authorizes validation/evidence only.
It does not authorize fixes, M3, new calls, higher spend, friends, new hosted
resources, public registration, commercial use, production, analytics, or
privacy implementation.
