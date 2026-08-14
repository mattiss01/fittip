# M3-10: Rolling-plan foundation

**Status:** testable — independently approved and hosted-verified on 14 August
2026; awaiting product-owner acceptance

## Agent brief

**Outcome.** Introduce the dormant owner-scoped persistence and deep module for
one rolling training plan: directly readable one-off session state, atomic
before/after history, and one monotonic owner revision. **Tier 1.** Schema,
authorization, RLS, privileged writes, and concurrency are involved.

**Hard constraints.**

- Implement F-005 and ADR-016 only through this ticket's dormant foundation.
  Add one forward migration; never edit applied migrations or touch a hosted
  project as the builder.
- Every owned row has immutable `user_id`; enforce same-owner references, RLS,
  deliberate grants, and owner/date/history indexes. Derive the owner from
  `auth.uid()` and accept no browser-supplied owner identity.
- One owner-derived transaction changes current state, appends one grouped
  immutable before/after change set, and advances exactly one revision. Revoke
  direct authenticated mutation paths that could split those effects.
- Any privileged function has an empty `search_path`, explicit least-privilege
  grants, bounded lock behavior, and no service-role application client.
- Stable one-off session identities support add, edit, move, lock, and
  cancellation. Cancellation records current cancelled state and history; it
  never hard-deletes the identity.
- An expected-revision race has one winner and one honest stale loser with no
  partial state, history, or revision write, proven by genuine concurrency.
- Keep the rolling-plan module deep: a small bounded-read/change-set interface,
  with Postgres and in-memory adapters tested through the same interface.

**Non-goals.** No visible UI; recurrence, saved sessions, Recovery day labels,
completion consumers, proposals, AI calls/spend, legacy-data mutation,
activation, dual write, compatibility synchronization, or founder cutover.

**Acceptance.** Clean-reset migration; pgTAP for schema, constraints, indexes,
privileges, RLS, owner access, anonymous/cross-owner denial; interface parity;
same-revision concurrency; generated types; green exact-commit CI. Existing
bounded-plan runtime and visible flows remain unchanged.

**Expected to change.** One migration and focused pgTAP/concurrency harness;
`src/server/rolling-plan/**`;
`src/server/repositories/rolling-plan-repository.ts`; generated database types;
CI invocation only if the dedicated harness is not already discovered; this
ticket's validation record.

**Skills.** Builder: `schema-change`, `codebase-design`, `validation-record`.
Reviewer: `code-review`, `schema-change`, `codebase-design`.

Read only this section unless you hit an ambiguity it does not resolve.

**Triage:** ready-for-agent

**Milestone:** M3

**Priority:** P1

**Tier:** 1 — schema, authorization, RLS, concurrency, and privileged writes

**Depends on:** approved
[F-005](../../product/F-005-ROLLING-TRAINING-PLAN.md), accepted
[ADR-016](../../decisions/ADR-016-ROLLING-TRAINING-PLAN.md), and the separately
authorized one-time working-agreement exception recorded in F-005.

**Blocks:** every later F-005 replacement slice.

## Approval record

The product owner approved this exact Tier 1 ticket on 14 August 2026. That
approval authorizes the ticket branch and distinct builder/reviewer delivery;
it does not accept the implementation, apply a hosted migration, activate the
new model, or authorize any later F-005 slice.
