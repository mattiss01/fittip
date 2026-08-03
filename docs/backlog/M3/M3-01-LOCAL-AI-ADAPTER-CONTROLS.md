# M3-01: Server-only AI boundary and fixture adapters

**Status:** proposed — brief written 3 August 2026; awaiting product-owner
approval to dispatch

**Scope split, 3 August 2026.** This ticket originally covered both the
provider-neutral boundary and one real-provider adapter. The boundary needs no
provider, no credential, no network call, and no spend, so it is dispatchable
now; the real adapter is gated on a provider decision the product owner has not
made. Scope item 3, the opt-in live test, and open decisions 1, 2, 3, 5, 6, 7,
and 8 moved to
[M3-01B](M3-01B-REAL-PROVIDER-ADAPTER.md). Everything below the Agent brief is
the original text and still describes both halves; the brief is authoritative
for what is being built here.

**Milestone:** M3

**Priority:** P1

**Depends on:** [M2-01 accepted](../M2/M2-01-GOAL-MODEL-VALIDATION.md),
[M2-02 accepted](../M2/M2-02-MEMORY-MODEL-MANAGEMENT.md),
[M2-03 accepted](../M2/M2-03-INTAKE-FACT-REVIEW.md), and
[M2-04 accepted](../M2/M2-04-M2-VALIDATION-SLICE.md)

**Architecture boundary:** [ADR-006 accepted](../../decisions/ADR-006-LOCAL-OWNER-AI-MVP.md),
[ADR-007 accepted](../../decisions/ADR-007-FOUNDER-HOSTED-STAGING.md),
[ADR-012 accepted](../../decisions/ADR-012-AI-GOAL-CONTEXT-ELIGIBILITY.md), and
[M0-06A accepted](../M0/M0-06A-FOUNDER-HOSTED-STAGING.md) before hosted use

**Additional dependency before implementation:** explicit product-owner
approval of the exact provider, model, account/key use, prompt/data-use and
retention terms, price/rate card, hard request/token/cost limits, and maximum
spend

**Blocks:** [M3-02](M3-02-ROADMAP-PROPOSAL.md),
[M3-03](M3-03-SELECTED-HORIZON-PLAN-PROPOSAL.md), and
[M3-05](M3-05-M3-VALIDATION-SLICE.md)

## Agent brief

**Outcome.** A provider-neutral, server-only `CoachAI` boundary with
deterministic fixture adapters. Every gate that must stand between a user and a
provider exists, is tested, and fails closed — before any provider exists to
call. No network call, no credential, no dependency on any AI SDK, no spend.

**Tier 1.** It defines what user data may ever leave this system.

**Hard constraints.**

- **No AI provider dependency.** Nothing added to `package.json`. If you find
  yourself needing one, you are building M3-01B — stop and report.
- **No network call anywhere**, including tests. Fixtures are pure functions.
- The adapter never queries the database. The domain service builds context
  from the accepted M1 training and M2 goal/memory repositories and hands the
  adapter an already-authorized payload.
- Goal eligibility is decided by
  [ADR-012](../../decisions/ADR-012-AI-GOAL-CONTEXT-ELIGIBILITY.md), not by you:
  implement `selectActiveGoalContext` in `src/server/goals/` mirroring
  `selectActiveMemoryContext`, exposing **targetable** and **historical** goals
  as separate fields, with per-status tests. Memory uses the existing
  `selectActiveMemoryContext`.
- Rate, budget, concurrency, and idempotency state is **injected policy, held
  in memory**. No migration, no new table. Durable hosted state belongs to
  M3-01B.
- Unknown or stale cost/token state denies the call. Never treat unknown as
  zero.
- Server-only modules import `server-only`. Extend
  `src/architecture/server-boundary.test.ts` so a `"use client"` file importing
  `@/server/ai/**` fails the build.

**Fixtures are an enumerated checklist, not sampled output.** Author each
failure mode deliberately: truncated JSON, valid JSON violating the schema,
schema-valid but an impossible date or duration, a goal reference the owner does
not hold, oversized payload, extra fields, and unsafe medical phrasing. Do not
generate malformed output from a model — random garbage produces a flaky test
and no guarantee the case that matters is covered.

**Module location.** `src/server/ai/`, not `src/lib/ai/`.
`src/architecture/server-boundary.test.ts` guards `@/server/**` and not
`@/lib/**`, so only the former is actually protected from client import.
`REVISED_PRODUCT_PLAN.md` §10.5 still says `src/lib/ai/` and predates that
invariant; this brief wins, and the plan line is flagged for correction.

**Non-goals.** No real provider adapter, no provider or model selection, no
credential reading beyond a presence check, no prompt content beyond fixture
stubs, no proposal persistence, no UI, no migration, no live test.

**Acceptance criteria.** Criteria 1, 2, 3, 4, 5, 6, 7, 8, 9, and 11 from the
list below, scoped to fixtures. Criterion 10 (live evidence) and the provider
half of 12 belong to M3-01B. Plus: a green continuous-integration run for the
reviewed commit.

**Expected change.** A new `src/server/ai/` subtree (contracts, gates, context
assembly, budget/idempotency policy, output validation, content-free
telemetry, fixture adapters) with tests alongside; `selectActiveGoalContext`
added to `src/server/goals/goal-records.ts`; one extension to
`src/architecture/server-boundary.test.ts`.

**Project skills.** Invoke `validation-record` for the handoff. No
`.agents/skills/` skill applies — this ticket changes no React, Next.js, or
user-visible surface.

Read only this section unless you hit an ambiguity it does not resolve.

## Outcome

Create a provider-neutral, server-only AI boundary with deterministic fixtures
and one separately approved real-provider adapter for owner/synthetic local or
founder-hosted MVP validation. Every request must prove owner authorization, explicit
enablement, allowlisted context, available budget, and idempotency before the
adapter runs. Every response is size-bounded, schema-validated, and returned
only as a proposal.

This brief does not approve a provider, model, key, account, prompt, price,
retention/data-use term, external resource, call, or spend.

## Local-owner and pre-friends boundary

- Local development or the accepted M0-06A founder-staging environment only.
- Provider-bound data may be the product owner's own data or synthetic data.
- Friend and other external-user data are denied even if the caller is
  authenticated.
- Tests use fixtures/mocks by default. Live tests are explicit opt-in and
  skipped safely when the approved enablement/configuration is absent.
- M0-03B, M0-04 and its later implementation, M0-05, and M0-06 remain mandatory
  before friend data, public registration, commercial use, or production.
  M3-01 does not replace them.

## Scope

1. Define a server-only `CoachAI` interface and operation-specific
   request/response contracts.
2. Add deterministic fixture/mock adapters with no network dependency.
3. Add exactly one real-provider adapter only after the separate provider/model
   decision is approved.
4. Enforce local environment, explicit enable flag, and deny-by-default owner
   allowlist before any real call.
5. Resolve all context references under verified `user_id`; accept no
   caller-supplied ownership.
6. Build a minimal operation-specific context from goals and memory the user
   explicitly accepted. Goal eligibility is already decided by
   [ADR-012](../../decisions/ADR-012-AI-GOAL-CONTEXT-ELIGIBILITY.md): implement
   `selectActiveGoalContext` in `src/server/goals/` mirroring
   `selectActiveMemoryContext`, exposing targetable and historical goals as
   separate fields, with per-status tests. Do not redecide the policy.
7. Enforce schema, size, rate, concurrency, deadline, retry, idempotency, token,
   cost, and environment limits.
8. Validate structured output and map failures to safe domain errors.
9. Emit content-free local technical telemetry and no external analytics.
10. Add architecture, authorization, budget, leakage, fixture, and opt-in live
    validation.

## Non-goals

- No provider/model/key/account selection in this document.
- No credential creation, setup instructions, committed value, new remote
  resource, environment, or deployment; M0-06A's existing Vercel secret store
  is the only permitted hosted key location after separate approval.
- No direct AI database access or writes, proposal acceptance, roadmap/plan UI,
  chat, streaming, replan, logging, or memory inference.
- No external analytics/monitoring sink, persistent product analytics, or
  production limiter.
- No friend data, external tester, shared account, production AI path, or
  privacy-gate bypass.
- No global exercise library or sport-specific provider contract.

## Proposed server contract

The exact reversible names may change, but the boundary must support:

```ts
interface CoachAI {
  createRoadmap(input: RoadmapInput): Promise<RoadmapOutput>;
  createSevenDayPlan(input: SevenDayPlanInput): Promise<SevenDayPlanOutput>;
}
```

The domain service—not UI and not provider code—owns authentication, context
selection, business constraints, safety checks, validation, and persistence.
Provider adapters receive only an already-authorized, operation-specific
payload and return an untrusted candidate.

## Request and context rules

- Server derives request id, owner id, operation, timestamps, schema versions,
  prompt version, environment, and context references.
- Context uses only operation-required active goals and active/non-expired
  memory records that are user-created or explicitly accepted by the user.
- Proposed, rejected, archived, expired, cross-user, raw unbounded history, and
  unrelated records are excluded.
- Raw Auth tokens, email, password data, internal secrets, arbitrary database
  rows, and caller metadata never enter provider input.
- Each operation has an exact field allowlist, maximum serialized size, maximum
  reference count, and stable schema version.
- The server records which owner-scoped record ids/versions informed a
  proposal, without placing those ids in product analytics.

## Local enablement and secret boundary

A real call is possible only when all approved controls agree:

1. runtime is the approved local environment;
2. the explicit live-AI flag is enabled;
3. the verified current `user_id` appears in the approved owner allowlist;
4. the operation is enabled;
5. provider/model configuration matches the approved decision;
6. a server-only credential is available through an ignored local secret;
7. limits and current cost rate are present and valid; and
8. owner authorization, schema, budget, and idempotency gates pass.

Any missing, ambiguous, stale, or malformed value denies the call. The key is
never accepted from the browser, never uses `NEXT_PUBLIC_`, never appears in
logs/errors/tests/snapshots, and is never serialized into client code.

## Rate, concurrency, budget, and fail-closed behavior

The product owner must approve exact numbers before implementation. The brief
requires:

- per-owner and per-operation request ceilings;
- one explicit maximum concurrent live request unless another value is
  approved;
- input/output token ceilings and a maximum request deadline;
- zero automatic provider retries by default; any retry requires approved
  idempotency and billing behavior;
- an estimated upper-bound cost reservation before the call;
- per-request, daily, and total local-MVP spend ceilings;
- reconciliation with provider-reported usage when available;
- unknown price/token state treated as unknown, never zero; and
- immediate fail-closed behavior at or near hard limits, while non-AI features
  remain available.

In-memory limits are acceptable only for local deterministic tests. A
founder-hosted implementation must use an approved shared fail-closed
rate/budget/idempotency state that survives Vercel instance changes; the exact
schema/service and cost require the M3-01 approval decision.

## Idempotency and safe errors

- Idempotency keys are opaque, bounded, and scoped to owner, operation, schema,
  and relevant input version; they are not hashes of user content.
- Concurrent duplicates create at most one provider attempt and one budget
  reservation.
- A completed identical request may return the prior validated result; a
  changed operation/schema/context is a conflict.
- Invalid input, denied owner, exhausted limit, timeout, provider failure, and
  schema-invalid output return stable safe codes.
- No raw provider body/error, prompt, content, secret, token, header, stack with
  user content, or cost-account detail reaches the browser or ordinary logs.

## Output validation and proposal boundary

- Provider output is untrusted and size-bounded before parsing.
- Only strict JSON/structured output matching the operation schema is accepted.
- Unknown fields, partial invalidity, impossible dates/durations, invalid goal
  references, unsafe content, and business-rule violations reject the whole
  candidate.
- Prose fallback is not parsed into a plan.
- A validated result remains a proposal. The adapter cannot call a repository
  that creates/updates goals, memory, roadmaps, plans, activities, or history.

## Content-free technical telemetry

Local records may include request/correlation/idempotency ids, environment,
operation, provider/model codes, prompt/schema versions, timestamps/latency,
attempt count, reported token counts, estimated/reported cost and currency,
rate-card version, validation outcome, and coarse gate/provider/error codes.

They must exclude raw input/output/prompt, goals, memory, intake, activity
names, health content, Auth identity/email, secrets, headers, URLs, raw errors,
and database rows. No external sink is added.

## UX and user-visible error rules

M3-01 adds no standalone product screen. A consuming proposal flow may show
only stable states such as disabled, generating, limit reached, budget
unavailable, validation failed, and temporarily unavailable. Copy must not
expose provider identity unless separately approved, raw errors, secret/config
state, another user, detailed budget/account data, or imply that a proposal was
saved. Non-AI account, M1 training, and M2 goal/memory functions remain usable
when AI fails closed.

## Acceptance criteria

1. Browser-reachable code cannot import the real adapter, credential reader,
   owner allowlist, budget state, or raw telemetry.
2. Fixture/mock tests are deterministic and make no network call.
3. A real call is impossible unless every local flag, owner, operation,
   provider/model, key-presence, rate, concurrency, budget, and schema gate
   passes.
4. Anonymous, non-owner, friend, cross-user, non-M0-06A hosted,
   preview/production, and malformed-context attempts stop before adapter
   invocation.
5. Context contains only operation-approved owner records and respects active,
   status, expiry, size, and reference limits.
6. Concurrent/replayed requests cannot duplicate a provider attempt or charge.
7. Token/cost uncertainty, stale price data, exhausted budget, or control
   outage fails closed.
8. Every output is strictly validated; invalid or unsafe output creates no
   proposal and writes no user data.
9. Technical telemetry proves provider/model/prompt/schema/token/cost/
   validation outcomes without raw content or secrets.
10. Opt-in live evidence uses only the product owner's approved data or
    synthetic data and remains within the approved cap.
11. Existing authentication, RLS, M1, formatting, lint, typecheck, unit,
    browser, and build tests pass.
12. No provider/account/key/spend, new remote resource, friend data, public
    registration, commercial use, production, or external sink exists unless
    separately and explicitly approved.

## Test plan

- Architecture/import tests for server-only modules and client bundles.
- Gate matrix: environment, flag, owner allowlist, operation, config, key
  presence, auth, ownership, schema, limit, concurrency, and budget.
- Two-user and anonymous context-reference tests.
- Fixture contract tests for valid, malformed, oversized, extra-field,
  business-invalid, and safety-invalid outputs.
- Idempotency replay/concurrency, timeout, cancellation, rate reservation,
  budget reservation/reconciliation, and no-double-charge tests.
- Leakage corpus across logs, telemetry, HTML, errors, snapshots, fixtures,
  committed files, and built client assets.
- Opt-in live contract test: one bounded synthetic/owner request, validated
  output, recorded token/cost state, and proof that disabled mode makes zero
  network attempts.

## Implementation guidance

Keep contracts under a provider-neutral AI module and real adapters in a
server-only subtree. Inject clocks, ids, rate/budget policies, and adapters so
tests are deterministic. Reuse accepted M1 training and M2 goal/memory
repositories for owner-scoped context; do not let the adapter query the
database. Keep proposal persistence out of this ticket.

## Required handoff

Report the exact branch/commit, changed files, separately approved decision
values (never secret values), interface/schema versions, gate matrix, fixture
and opt-in live results, provider-attempt/token/cost evidence, leakage scan,
full commands/results, known limitations, and confirmation of no
non-M0-06A-hosted, external, friend-data, analytics-sink, or direct-write
behavior.

## Open decisions

1. Exact provider and model, chosen against quality, structured-output
   reliability, latency, and price.
2. Provider data-use/training, human review, retention/deletion, region,
   subprocessors, terms, and account ownership.
3. Exact local key source and operator without documenting a key value.
4. Prompt versions and the minimum quality/safety fixture set.
5. Per-request, short-window, daily, concurrent, token, deadline, and total
   spend caps.
6. Price-source/rate-card update owner and unknown-cost behavior
   (recommendation: deny).
7. Whether live tests may use minimized owner data or synthetic data only.
8. Any provider-specific retry/idempotency behavior; recommendation: no
   automatic retry in the first slice.

## Approval gate

The product owner must approve this brief and every open provider, model,
quality, data-use, retention, key-use, rate, token, cost, and spend decision.
Approval is owner/synthetic local or M0-06A founder-hosted only and does not
authorize friends, external users, public registration, commercial use,
production, analytics, new remote resources, or any other M3 ticket.
