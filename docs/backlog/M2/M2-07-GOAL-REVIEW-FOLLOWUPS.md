# M2-07: Goal review follow-ups

**Status:** proposed — not approved for implementation

**Milestone:** M2 — goals, editable coaching context, and guided onboarding

**Priority:** P2

**Owning accepted work:** [M2-01 goal model and validation](M2-01-GOAL-MODEL-VALIDATION.md)

**Depends on:** M2-01 accepted

**Source:** the
[second independent exact-commit review](../../validation/M2/M2-01-VALIDATION.md#second-independent-exact-commit-review-1-august-2026)
of 1 August 2026

**Blocks:** nothing. M2-02 and M2-03 proceed without this ticket.

## Why this ticket exists

The second independent review of M2-01 returned "approved for re-acceptance"
and found no authorization or correctness defect. It did find eight things
worth correcting. The product owner accepted M2-01 on 1 August 2026 with all
eight open, as an explicit separate decision, and collected them here so they
are tracked rather than forgotten.

Findings 1 and 2 below are the reason this ticket is not merely cosmetic. Both
are guards that cannot fail, which is worse than an absent guard: a reader who
sees a green suite reasonably concludes the property is proven, and it is not.

## Findings

### 1. A pgTAP assertion that can never fail

`supabase/tests/database/m2_01_goals.test.sql:185-195` searches
`pg_get_functiondef` for `EXECUTE IMMEDIATE`. That is Oracle and SQL-PSM
syntax; PL/pgSQL dynamic SQL is `EXECUTE <string>`. The searched substring
cannot appear in any PL/pgSQL function definition, so the assertion returns
true unconditionally.

It is the only assertion guarding ADR-009 decision 8's no-dynamic-SQL
hardening. A future migration introducing `execute format(...)` in
`apply_goal_change` would keep the suite and continuous integration green.

The reviewer read all 711 lines of the function and confirms it contains no
dynamic SQL today, so the evidence is what is broken, not the behavior.

### 2. RLS policy predicates are never asserted

Neither M2-01 pgTAP file contains a `pg_policies` inspection, `has_column`,
`col_type_is`, `has_index`, `has_pk`, or `has_fk`. The three tables are covered
only by `relrowsecurity` being true plus table-privilege checks. Specifically
missing:

- no assertion that the three owner-select policies exist, are `SELECT`, target
  `authenticated`, or use `(select auth.uid()) = user_id`;
- no assertion of the exact policy count per table, which is what would catch a
  later migration adding a permissive policy beside the owner policy;
- no behavioral cross-user read denial for `goal_collections` or
  `goal_lifecycle_events` — every query against those two tables carries an
  explicit own-owner `where` clause, so RLS is never the thing under test;
- no assertion of column types, the deferrable `goals_active_rank_key` unique
  constraint the function depends on, `goals_owner_key`, `goals_owner_list_idx`,
  or either foreign key, despite the M2-01 test plan requiring them.

Failure scenario: a later migration adds
`create policy goals_shared_select on public.goals for select to authenticated using (true);`.
RLS stays enabled, every privilege assertion still passes, all 95 M2-01
assertions stay green, and user A can read user B's goal titles and rationale
through the Data API.

`supabase/tests/database/m0_02_authorization.test.sql:32-66` is the stronger
in-repo precedent and asserts each policy's name, command, target roles, and
exact count. Match it.

### 3. A tautological cross-user assertion

`supabase/tests/database/m2_01_goals.test.sql:285-293` asserts as user A that
user B owns zero visible goal rows. User B's first goal is not created until
line 641, so at line 285 the assertion holds with RLS disabled, with the policy
deleted, or with `using (true)`.

The substance is covered at `:655-659` and in the corrections file at
`:503-551`, so this is a misleading assertion rather than the sole basis for
the claim. Move it after line 654 or delete it.

### 4. An unrelated mutation silently wipes a typed create draft

`src/components/goals/goal-manager.tsx:194` keys the create form on
`create-${state.submission}`, but `state.submission` increments on every action
result, not only creates (`src/app/home/you/goals/actions.ts:37`). Any mutation
remounts the create form, and because `draft` is supplied only when
`state.operation === "create"`, the remount clears every uncontrolled input.

Failure scenario: the user opens **Add goal**, types a 400-character desired
outcome, notices core ranks 2 and 3 are the wrong way round, and taps **Move
up**. The reorder succeeds. The `<details>` panel is not keyed so it stays
open, every field inside it is now blank, and no message explains it.

The edit form already has the correct guard at `:277-281`, falling back to `0`
unless the last action edited that same goal. Apply the same shape to the
create key.

### 5. An expired-session message renders on the success background

`src/app/home/you/goals/goals.module.css:349-356` gives the warning background
to `conflict`, `validation`, `error`, `lost-render`, `recovered`, and
`unconfirmed`. `session` is a real status produced from
`GoalAuthenticationError` at `actions.ts:169-175` and is absent from that list,
so "Your session ended. Sign in again before changing goals." renders on the
same green card as "Goal created."

Color is not the only signal — the copy is explicit — so this is a polish
defect rather than a WCAG failure.

### 6. Reorder controls have no per-goal accessible name

`src/components/goals/goal-manager.tsx:255-272` and `:549` render **Move up**
and **Move down** for every active goal with no `aria-label`. A screen-reader
user tabbing the list hears the same two labels repeated with nothing
distinguishing them; the goal title is in a sibling `<h3>`, reachable in browse
mode but not announced on focus.

Lower, in the same area: the `<span aria-label="N core slots open">` at
`:127-134` puts `aria-label` on a generic role, where exposure is unreliable.
The same information is in the visible "Primary attention / N of 3" text, so
nothing is currently lost.

### 7. A self-triggered reload can re-explain itself later

`src/components/goals/goal-manager.tsx:791-801`. `RECOVERY_FLAG` is written
before the recovery reload and cleared only at the start of the next mutation,
and `useRecoveredReload` returns true whenever the flag is present and
`submission === 0`.

Failure scenario: a lost render triggers the recovery reload, the user reads
the explanation, navigates to **You**, then returns to **Goals** without
mutating anything. The component remounts with `submission === 0` and the flag
still set, so "Your last goal change did not appear, so these goals were
reloaded" reappears, describing an event several navigations old. Clear the
flag on unmount, or stamp it with the collection revision.

### 8. Permanent delete is asserted only by absence

`e2e/m2-01-goals.spec.ts:258-260` asserts the heading is hidden after a
permanent delete. That is equally satisfied by a goal that was archived. Also
assert the title is absent from the history and archive sections.

## Explicitly out of scope

- **Focus-outline contrast.** `#efaa84` on `--ledger-paper` computes to 1.92:1,
  below the 3:1 of WCAG 2.2 SC 1.4.11. This is not an M2-01 regression —
  `src/app/home/home.module.css:97-102` applies the identical rule
  repository-wide and predates the ticket. It needs its own ticket covering
  every surface, not a goals-only patch.
- **The offline banner covering the sticky goal notice.** A hypothesis the
  reviewer could not settle by reading: `.notice` is `z-index: 20` sticky and
  `.offlineNotice` is `z-index: 60` fixed and present on this route. The more
  urgent message wins and the reload link below stays visible, so no action is
  proposed. Confirm at 390px on a Preview if it is ever observed.
- **Verifying the Vitest bodies against their titles.** The reviewer read the
  test titles but not the bodies and explicitly reported the Vitest suites as
  not independently verified. That is the same class of gap as findings 1 and 2
  and deserves its own scoped pass rather than being folded in here.
- **The `frontend-design` treatment applied to M2-01**, still unrecorded in the
  validation record. It is documentation of past work, not a code change.

## Acceptance criteria

1. The no-dynamic-SQL guard fails when dynamic SQL is present. Prove it by
   temporarily introducing dynamic SQL locally and recording that the assertion
   goes red, then removing it.
2. Each of the three tables asserts its policy names, commands, target roles,
   predicates, and exact policy count, matching the `m0_02_authorization`
   precedent.
3. Cross-user read denial is proven behaviorally for `goal_collections` and
   `goal_lifecycle_events`, without an own-owner `where` clause masking RLS.
4. Column types, the deferrable unique constraint, both named indexes, and both
   foreign keys are asserted.
5. Findings 3 through 8 are corrected, each with a test that fails without the
   correction.
6. No migration is edited. Any schema correction is a new forward migration —
   though none is expected, since every finding is in tests or the client.
7. A green continuous-integration run for the reviewed commit.

## Approval gate

The product owner approves the scope before implementation. The likely tier is
**Tier 2** — it changes test evidence and user-visible client behavior on an
already accepted schema and authorization boundary. Escalate to Tier 1 and stop
if any correction turns out to need a migration, a policy change, or a change
to `apply_goal_change`.
