# M2-01: Goal model and validation

**Status:** in development — product-owner approval recorded 29 July 2026

**Milestone:** M2 — goals, editable coaching context, and guided onboarding

**Priority:** P1

**Feature brief:** [F-003 draft; direction approved](../../product/F-003-GOALS-MEMORY-GUIDED-ONBOARDING.md)

**Implementation approval:** On 29 July 2026 the product owner approved M2-01
for implementation. The approval accepts the ticket's recommended product
direction for independent contiguous ranks, active-by-default creation,
explicit terminal-state reopening, archive-first deletion, and the proposed
390px flow within the existing owner-or-synthetic founder boundary.

**Depends on:** [M1 milestone closeout accepted](../../validation/M1/M1-MILESTONE-CLOSEOUT.md); [M0-03 / F-001 accepted](../../product/F-001-PUBLIC-ACCOUNT-AUTHENTICATION.md); [M0-02-C1 accepted](../M0/M0-02-C1-REMOVE-USERNAME.md); [ADR-002](../../decisions/ADR-002-M0-02-DATA-AUTHORIZATION-BOUNDARY.md); [ADR-004](../../decisions/ADR-004-USERNAME-FREE-ACCOUNT-PROFILE.md); [ADR-009](../../decisions/ADR-009-M2-GOAL-MUTATION-TRANSACTION.md)

**Hosted test dependency:** [M0-06A accepted](../M0/M0-06A-FOUNDER-HOSTED-STAGING.md)

**Founder staging boundary:** [ADR-006](../../decisions/ADR-006-LOCAL-OWNER-AI-MVP.md)
and [ADR-007](../../decisions/ADR-007-FOUNDER-HOSTED-STAGING.md);
product-owner or synthetic data only, local or founder-hosted

**Blocks:** [M2-03 Guided onboarding](M2-03-INTAKE-FACT-REVIEW.md) and [M2-04 targeted M2 closeout](M2-04-M2-VALIDATION-SLICE.md)

## Outcome

Give an authenticated user a mobile-first way to create, inspect, edit, pause,
resume, reorder, achieve, abandon, and remove or archive sport-agnostic goals.
The server and database must preserve explicit priority, keep core and
supporting goals distinct, and prevent more than three active core goals even
under concurrent requests.

This ticket defines goals only. It does not design training plans, create
sport-specific goal tables, generate coaching, or call an AI provider.

## Approval, environment, and external-use boundary

This brief is a proposal. Approval would authorize one local implementation
slice and, after M0-06A acceptance, its migration and release to the disposable
founder-staging project. It would not authorize production, public
registration, commercial use, analytics, friend data, or AI processing.

Before any external user enters goal data, all of the following must be
separately approved, implemented, validated, and accepted:

- M0-03B account recovery;
- the M0-04 privacy design **and** later implementation briefs for the
  user-facing notice, applicable data inventory/retention rules, account/data
  deletion operation, and any required access/export handling;
- M0-05 privacy-safe instrumentation and request-control contracts; and
- M0-06's exact hosted Supabase/Vercel environment, custom email delivery,
  registration-abuse control, CI/deployment, and hosted authorization checks.

M0-04 design acceptance alone does not authorize consent/deletion schema,
privacy UI, a privileged deletion operation, or external use. Goal records must
be added to the accepted inventory and deletion design before external
collection.

## Scope

1. Define and migrate a user-owned goal record with domain validation.
2. Add server-only goal repository and domain-service operations.
3. Add authenticated goal-management routes and forms at a 390px viewport.
4. Enforce core/supporting, lifecycle, rank, ownership, and concurrency rules
   at appropriate server and database boundaries.
5. Add direct database authorization/constraint tests, domain tests,
   integration tests, and a focused mobile walkthrough.
6. Update generated database types and developer documentation for the new
   migration and checks.

## Non-goals

- No roadmap, change to the accepted M1 detailed-plan/completion model, replan,
  proposal, lock behavior, activity catalog, logging, or progress behavior.
- No sport-specific goal table, measurement pack, exercise library, or
  strength-first default.
- No AI extraction, coaching, generation, provider call, prompt, or model.
- No memory creation from goal text and no silent side effect outside the goal
  records approved here.
- No analytics, remote migration, deployment, external service, or privacy
  schema/UI/operation.

## Proposed data contract

The implementation may choose normalized tables, constrained scalar columns,
or a small validated flexible field only where the approved behavior requires
it. The resulting contract must represent:

| Field | Proposed rule |
|---|---|
| Stable id | UUID primary key; never reused |
| Owner | Required immutable `user_id` tied to the verified current user |
| Title | Required, trimmed, meaningful text with an approved maximum length |
| Desired outcome | Required sport-agnostic description |
| Category | One of performance/event, skill, strength, endurance, mobility, body composition, recovery/general fitness, or other |
| Sports/activity areas | Zero or more user-entered free-text labels; no global sport or exercise catalog |
| Start date | Required owner-local calendar date |
| Target date | Optional owner-local calendar date, not earlier than start date |
| Target/event detail | Optional validated text |
| Target metric | Optional structured or textual target that does not assume sets/reps/load |
| Priority tier | Required `core` or `supporting` |
| Rank | Explicit order within the selected tier; active core rank is limited to 1–3 |
| Status | `active`, `paused`, `achieved`, or `abandoned` |
| Rationale/constraints | Optional user-provided text; not silently converted to memory |
| Concurrency token | Server-controlled revision/version or an equivalent reliable compare-and-swap value |
| Timestamps | UTC creation/update timestamps; calendar dates remain owner-local |

Exact column names, text limits, tag representation, target-metric shape, and
revision mechanism remain part of the decisions below. JSON must not become an
unvalidated escape hatch for sport-specific behavior.

## Goal and lifecycle rules

- A newly created goal is active unless the approved create flow explicitly
  lets the user create it paused.
- Only `active` goals count toward planning attention and the three-core limit.
  This ticket does not implement planning.
- Pausing preserves the goal and its position history. Resuming revalidates the
  core limit and current rank.
- `achieved` and `abandoned` are terminal historical outcomes in the default
  proposal. Reopening either requires an explicit user action and renewed
  validation; it must not happen as a side effect of editing.
- Core and supporting are different attention tiers, not labels that collapse
  into one undifferentiated list.
- Rank is unique within a user's active tier. Active core ranks are contiguous
  from 1 through the number of active core goals and may never exceed 3.
  Supporting goals use their own explicit order and never consume a core slot.
- A tier change or reorder is one domain operation. The user must never observe
  duplicate active ranks or a temporarily invalid fourth core goal.
- Editing a goal does not create or alter a plan, proposal, completion, memory,
  activity, or historical training record.
- Goal constraints/rationale remain part of the goal. Copying them into memory
  requires the explicit review behavior owned by M2-03.

## Maximum-three and concurrency requirements

The three-active-core invariant must survive two tabs, retries, and concurrent
requests. A client count and an ordinary row-level `CHECK` are insufficient
because PostgreSQL row checks cannot count other rows.

The implementation must:

1. validate the intended transition in the domain service;
2. execute all affected rank/tier/status changes atomically;
3. enforce or serialize the invariant at the database boundary with a reviewed
   transaction-safe mechanism;
4. return a stable domain conflict when the submitted revision is stale or the
   core limit changed; and
5. let the UI refresh current state without silently overwriting the other
   change.

[ADR-009](../../decisions/ADR-009-M2-GOAL-MUTATION-TRANSACTION.md) approves one
narrowly scoped authenticated `SECURITY DEFINER` goal-mutation function. It
uses an Auth-derived owner, empty search path, fully qualified objects,
revoked direct table writes, a per-owner transaction advisory lock, complete
ordering validation, and an expected collection revision. No other privileged
function, connection, credential, or write path is approved.

## Ownership, repository, and RLS rules

- Every goal has a required `user_id`; no route, action, or repository accepts a
  caller-supplied owner id.
- Browser components do not import repositories or contain core-count,
  lifecycle, or ranking rules.
- Server input and database-bound data are schema-validated.
- Repositories derive the verified current identity, filter every operation by
  that identity, and map constraint/conflict errors to safe domain results.
- In an exposed schema, revoke unintended privileges, enable RLS, and grant
  only the operations approved by the final deletion decision.
- Policies target `authenticated` and use explicit ownership predicates such
  as `(select auth.uid()) = user_id`. `TO authenticated` without ownership is
  not authorization.
- Update access requires the matching owner-select policy plus owner `USING`
  and `WITH CHECK`; `user_id` cannot be reassigned.
- Anonymous and cross-user select/insert/update/delete are denied and directly
  tested. User-editable Auth metadata is never authorization input.
- Index ownership and ordering fields that policies and normal list queries use
  when the primary key does not already provide the needed access path.
- No service-role or secret credential enters browser code or normal
  user-scoped CRUD.

The migration must be created with the installed Supabase CLI's supported
`migration new` flow, applied from a clean local reset, linted, checked by
database advisors, and followed by regenerated committed types. Remote
application remains separately gated.

## Deletion and archive effects

Recommendation:

- **Archive/remove from active use** is the normal action. It preserves a
  stable historical identity and removes the goal from active priority lists.
- **Permanent delete** is offered only when the goal has no historical plan,
  proposal, completion, audit, or other retained reference. Once referenced,
  the user receives an honest archive option rather than a destructive cascade.
- A future account-deletion operation may erase the owner and dependent goal
  data according to the accepted M0-04 implementation and retention design.
- No goal deletion cascades into plans, proposals, completions, personal
  activities, or memory. Those record types remain separate and permanent
  according to their own approved lifecycle.

Because the accepted M1 plan/completion model already preserves history, the
builder must integrate goal references without rewriting historical training
records. Exact hard-delete versus archive behavior remains an open
product/privacy decision.

## Proposed 390px user flows

### View and reorder

1. The user opens **You → Goals**.
2. Active core goals appear first with explicit ranks 1–3; active supporting
   goals appear in a separate labeled section.
3. Paused and historical goals are reachable without mixing them into active
   priorities.
4. The user chooses **Reorder**, changes order within a tier, reviews the new
   order, and saves once.
5. A stale update shows a concise conflict state and reload action; it never
   claims success.

### Create and edit

1. The user chooses **Add goal** and enters the approved general fields.
2. Sport/activity labels and target details are free-form and optional where
   appropriate; no strength-first defaults appear.
3. Selecting core shows the currently occupied core slots.
4. A fourth active core selection is blocked with a clear choice to make it
   supporting, pause another core goal, or cancel.
5. Save returns to the goal detail/list with the persisted values.

### Change lifecycle or remove

1. The goal detail offers explicit pause/resume, achieved, abandoned, archive,
   and approved delete actions.
2. Consequences are stated before a destructive action.
3. Resume and reopen operations revalidate tier/rank and may require the user to
   resolve a core conflict.
4. Success and failure states are announced accessibly and preserve typed input
   when safe.

All labels, routes, exact copy, rank controls, and destructive confirmation
patterns remain unapproved proposals until this brief's open decisions are
resolved.

## Acceptance criteria

1. An authenticated user can create, read, edit, reorder, pause, resume,
   achieve, abandon, and perform the approved archive/delete behavior at 390px.
2. Goal fields are sport-agnostic and contain no sport-specific table, global
   exercise library, or sets/reps/load assumption.
3. Active core and active supporting goals are visually and semantically
   distinct, with explicit rank in each approved ordering.
4. One user can never have more than three active core goals, including under
   two genuinely concurrent writes.
5. Rank/tier/status changes are atomic and cannot leave gaps, duplicates, or an
   invalid intermediate state visible after commit.
6. Stale revisions produce a safe conflict rather than last-write-wins data
   loss.
7. Target date, status transition, required text, rank, and target-metric
   validation agree at UI, server/domain, and database boundaries where
   applicable.
8. User A has only the approved access to user A's goals; user B and anonymous
   callers cannot read or mutate them through repository or Data API paths.
9. `user_id` is server-derived and immutable; no user metadata or email is used
   for authorization.
10. Archive/delete never alters another record category or invents plan
    behavior.
11. A clean migration reset, generated types, database lint/advisors, direct
    authorization tests, application quality gates, and production build pass.
12. No AI call, analytics event, remote migration, external service, secret,
    plan, activity catalog, or coaching behavior is added.

## Test and validation plan

### Database and repository

- Assert the exact approved columns, types, constraints, foreign keys, indexes,
  privileges, policies, and RLS state.
- Prove owner CRUD as approved plus anonymous and cross-user denial for every
  mutation.
- Prove ownership cannot be reassigned and update policies include both
  visibility and new-row checks.
- Exercise create, reorder, tier change, pause/resume, achieve/abandon,
  reopen-if-approved, archive, and delete-if-approved.
- Run two concurrent core promotions/creates from a state with two active core
  goals; exactly one may commit.
- Run stale revision and retry tests without duplicate effects.

### Domain and UI

- Boundary tests for every category, date rule, lifecycle transition, tier,
  rank, text limit, and target-metric form.
- Unit tests for deterministic reorder and stable domain error mapping.
- Integration tests proving all actions derive the owner from the verified
  session and preserve input on recoverable failure.
- Playwright at `390x844`: empty list → create three core plus supporting goal
  → reject fourth core → reorder → pause/resume conflict → edit → approved
  archive/delete behavior.
- Accessibility checks for labels, errors, focus movement, confirmation
  dialogs, status announcements, touch targets, and keyboard operation.

### Expected command families

The builder must verify exact CLI syntax with the installed versions:

```powershell
npx.cmd supabase migration new <approved_name>
npx.cmd supabase db reset --local
npx.cmd supabase db lint --local --level warning --fail-on warning
npx.cmd supabase db advisors --local --type all --level warn --fail-on warn
npx.cmd supabase test db --local
npx.cmd supabase gen types typescript --local
npm.cmd run format:check
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test:run
npm.cmd run test:e2e
npm.cmd run build
git diff --check
```

## Implementation sequence and file guidance

1. Re-read [AGENTS.md](../../../AGENTS.md), the
   [Product Plan](../../../REVISED_PRODUCT_PLAN.md), accepted authorization/auth
   artifacts, and current official Supabase/PostgreSQL guidance.
2. Resolve the open decisions and record any required ADR before schema work.
3. Create one forward migration through the supported CLI workflow.
4. Add direct schema, invariant, ownership, and concurrency tests before UI.
5. Add a narrow goal domain contract/service and owner-scoped repository,
   following the existing `src/server/` and `src/lib/supabase/` boundaries
   without treating suggested filenames as architecture approval.
6. Add only the approved goal routes/components under the authenticated shell.
7. Add unit, integration, and 390px end-to-end coverage.
8. Regenerate types from a clean reset and run all quality/security gates.
9. Hand off to an independent reviewer; any missing product behavior returns
   to this ticket rather than being added during M2-04.

Likely change areas are `supabase/migrations/`,
`supabase/tests/database/`, `src/server/`, authenticated `src/app/` routes,
focused `src/components/`, generated database types, tests, and validation
documentation. The builder may choose reversible names and decomposition after
approval; a new privileged database/API boundary is not reversible and needs
an ADR.

## Approved implementation decisions

1. **Rank semantics:** contiguous independent ordering for active core and
   active supporting goals.
2. **Create default:** new goals start active, with core slot availability
   visible before save.
3. **Terminal-state reopening:** explicit reopen with fresh validation and a
   minimal audit entry.
4. **Archive versus delete:** archive referenced goals and hard-delete only
   never-referenced eligible goals.
5. **Target metric:** use the minimum bounded sport-agnostic representation;
   do not default to strength measurements.
6. **Concurrency architecture:** use only the authenticated goal-mutation
   transaction approved in ADR-009.
7. **Visible flow and copy:** use the proposed **You → Goals** routes, explicit
   ranks, conflict state, and destructive confirmations at 390px.
8. **Goal text privacy:** treat content as private owner training data, exclude
   it from logs/analytics/external requests, and keep external collection
   blocked pending the M0 privacy implementation.

## Handoff

Before moving the ticket to testable, provide:

- exact branch and commit;
- changed files grouped by migration, domain/repository, UI, tests, and docs;
- approved data contract and actual privilege/policy matrix;
- clean-reset/type-generation evidence;
- owner, anonymous, cross-user, fourth-core concurrency, stale-write, and
  archive/delete evidence;
- exact commands and results;
- a `390x844` demo path and screenshots for the core/supporting, fourth-core,
  conflict, and destructive-action states;
- privacy/secret/remote-target scan results;
- known limitations and any approved deviations; and
- confirmation that no plan, AI, activity-library, analytics, or external
  behavior was added.

The lead agent then assigns an independent reviewer. The precise product-owner
decision after review is: **accept M2-01 as the goal-model slice, or return
focused corrections**.

## Current primary guidance

- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Data API security](https://supabase.com/docs/guides/api/securing-your-api)
- [Supabase database migrations](https://supabase.com/docs/guides/deployment/database-migrations)
- [PostgreSQL constraints](https://www.postgresql.org/docs/current/ddl-constraints.html)
- [PostgreSQL transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html)

## Approval gate

Product-owner implementation approval and the ADR-009 transaction approval are
recorded, so M2-01 remains **in development**. Reversible field names, bounded
text limits, and the minimum sport-agnostic target representation may be
finalized and evidenced within this ticket. No additional privileged function,
trigger, credential, connection, or write boundary is approved. M0-06A permits
only owner/synthetic founder staging; M0-06 remains a
pre-friends/public/commercial gate.
