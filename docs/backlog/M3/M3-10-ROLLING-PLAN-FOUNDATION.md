# M3-10: Rolling-plan foundation

**Status:** in development — approved by the product owner and dispatched on
14 August 2026

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

## Outcome

Introduce the dormant persistence and server-module foundation for one
owner-scoped rolling training plan. Current session state, its append-only
before/after history, and one monotonic owner revision change atomically behind
a small interface.

The accepted bounded-plan runtime remains unchanged. This ticket creates no
visible Plan behavior, activates no replacement consumer, migrates or deletes
no old data, and calls no AI provider.

## Scope

- Add one forward migration for the new owner-scoped rolling-plan identity,
  directly readable current planned-session state, atomic plan change sets and
  before/after entries, and monotonic owner plan revision.
- Give every owned row immutable owner scope and enforce same-owner references,
  RLS, deliberate grants, and indexes for expected owner/date/history reads.
- Add the owner-derived database transaction needed to apply one change set.
  Direct authenticated writes must not let a caller change current state without
  matching history or construct another owner's identity.
- Support additions, edits, moves, locks, and cancellation of dormant one-off
  session state. Cancellation records the transition rather than erasing
  history.
- Reject stale expected revisions atomically. Two simultaneous changes using
  the same expected revision produce exactly one success and one honest stale
  result, with no partial current-state or history write.
- Add a deep rolling-plan module with a small interface for bounded reads and
  atomic change sets, plus real Postgres and in-memory adapters exercised through
  that interface.
- Regenerate and commit Supabase database types through the documented sequence.

## Expected seams and files

- `supabase/migrations/<timestamp>_m3_10_rolling_plan_foundation.sql`
- `supabase/tests/database/m3_10_rolling_plan_foundation.test.sql`
- a dedicated simultaneous-change harness and matching CI invocation
- `src/server/rolling-plan/**` for the module interface, domain results, and
  in-memory adapter
- `src/server/repositories/rolling-plan-repository.ts` for the Postgres adapter
- `src/lib/supabase/database.types.ts` generated from the migration

Exact table, function, and internal type names are implementation details. The
public module interface should remain close to the F-005 operations
`getPlanSlice(startDate, endDate)` and
`applyChangeSet(changes, expectedPlanRevision)`.

## Acceptance criteria

1. A clean reset creates the dormant rolling-plan foundation solely through a
   new forward migration; no applied migration is edited.
2. One owner-approved change atomically updates current state, appends one
   immutable grouped change set with before/after entries and provenance, and
   advances exactly one owner revision.
3. Cancellation remains readable as current cancelled state and in history; it
   does not hard-delete the planned-session identity.
4. A stale revision, invalid input, anonymous request, cross-owner request, or
   failed sub-change writes no current state, history entry, or revision.
5. A genuine same-owner concurrency test proves one winner and one stale loser
   for the same expected revision.
6. Authenticated direct mutation grants are revoked where the owner-derived
   transaction is required. pgTAP proves schema, constraints, indexes,
   privileges, RLS, owner access, and anonymous/cross-owner denial.
7. The Postgres and in-memory adapters satisfy the same module-interface tests
   for bounded reads, atomic success, validation failure, and stale results.
8. Database lint, security and performance advisors, pgTAP, the concurrency
   harness, generated-type checks, and the exact-commit CI run are green.
9. Existing bounded-plan tables, data, repositories, routes, and visible flows
   behave exactly as before; no new runtime consumer reads or writes the dormant
   model.

## Non-goals

- No manual Plan UI or replacement route behavior.
- No saved-session library, recurring series, occurrence expansion, or
  Recovery-day interaction.
- No Today, logging, Progress, completion, or AI-context consumer migration.
- No proposal decisions, Finish review, regeneration, provider call, or spend.
- No old-model backfill, compatibility synchronization, dual write, deletion,
  activation, or founder-database cutover.

## Required skills when approved

- `schema-change`
- `codebase-design`

No React or user-visible UI is in scope, so `frontend-design` and
`vercel-react-best-practices` are not required unless implementation discovers
a scope change and stops for re-dispatch.

## Approval record

The product owner approved this exact Tier 1 ticket on 14 August 2026. That
approval authorizes the ticket branch and distinct builder/reviewer delivery;
it does not accept the implementation, apply a hosted migration, activate the
new model, or authorize any later F-005 slice.
