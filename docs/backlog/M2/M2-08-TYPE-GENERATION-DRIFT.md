# M2-08: Regenerating database types breaks typecheck

**Status:** testable — dispatched Tier 1 on 3 August 2026, then **re-scoped to
Tier 3** the same day when the builder proved the prescribed migration is not
executable. Delivered as `e945ed912b54b452917906c335dbfe98019fb576` on
`ticket/m2-08-type-generation-drift`. Evidence is in the
[M2 milestone closeout](../../validation/M2/M2-MILESTONE-CLOSEOUT.md#m2-08--type-generation-reproduces-the-committed-file);
awaiting product-owner acceptance

**Superseded by delivery:** the Agent brief below prescribes a forward
migration adding `default null` to nine parameters. That is **not executable** —
PostgreSQL requires every parameter after a defaulted one to have a default,
and the nine are interspersed with parameters that must stay required. The
brief is left unedited as the record of what was dispatched; the closeout entry
records what was actually built and why. Do not implement the brief.

**Milestone:** M2 — goals, editable coaching context, and guided onboarding

**Priority:** P2

**Owning accepted work:** [M1-03 quick training logging](../M1/M1-03-QUICK-TRAINING-LOGGING.md)
and [ADR-008](../../decisions/ADR-008-M1-TRAINING-RECORD-TRANSACTIONS.md)

**Depends on:** nothing

**Source:** reported by the M2-02 builder on 2 August 2026 and reproduced on
unchanged `master`

**Blocks:** nothing today, but it silently taxes every future schema ticket.

## Agent brief

**Outcome.** After `supabase db reset --local` and the documented type
generation, the working tree is clean and `typecheck` is green — the generator
reproduces the committed `src/lib/supabase/database.types.ts` exactly, with no
hand-preserved lines.

**Tier 1.** A forward migration to an accepted `security definer` RPC that
carries M1-03's atomic completion write.

**Cause.** Already identified — see "Lead diagnosis" below, and confirm it in
five minutes before building. In short: the generator never emits `| null` on
RPC arguments, so the nine `| null` annotations on `save_training_completion`
in the committed file were hand-written and every regeneration correctly
removes them. Nothing is wrong with the CLI.

**Expected change.**

- A new forward migration adding `default null` to exactly these nine
  parameters of `public.save_training_completion`, body and grants otherwise
  unchanged: `p_completion_group_id`, `p_planned_session_id`,
  `p_actual_started_at`, `p_duration_minutes`, `p_perceived_effort`,
  `p_feeling`, `p_note`, `p_replacement_description`, `p_correction_reason`.
- `src/server/repositories/completion-repository.ts` — `toRpcInput` omits those
  keys when the value is absent instead of passing `null`. Follow the accepted
  precedent at `src/server/repositories/goal-repository.ts:163`
  (`...(id ? { p_goal_id: id } : {})`). Runtime behavior is identical: an
  omitted argument resolves to the parameter's `default null`.
- `src/lib/supabase/database.types.ts` — regenerated, never hand-edited. The
  nine arguments become optional (`p_note?: string`), not nullable.

**Hard constraints.**

- Forward-only. Do not edit `20260728143000_m1_03_completion_writes.sql`.
- Do not change the function body, its grants, its revokes, or any RLS policy.
- Do not touch `apply_goal_change` or `apply_memory_change`.
- Preserve the `.retry(false)` call in `completion-repository.ts`.
  `src/architecture/server-boundary.test.ts` asserts exactly two such calls.
- No suppression: no `any`, no `@ts-expect-error`, no loosened `tsconfig`.
- No Supabase CLI bump and no other dependency change.
- Completion, planning, and training behavior must not change.

**Acceptance criteria.**

1. `db reset --local` then the documented generation leaves the tree clean.
2. `typecheck` passes with no hand-preserved lines in the generated file.
3. The completion pgTAP suite and the concurrency harness pass unchanged.
4. A green continuous-integration run for the reviewed commit.

**Project skills.** Invoke `schema-change` for the migration, reset, pgTAP, and
regeneration sequence, and `validation-record` for the handoff. Both are
auto-discovered under `.claude/skills/`; no `.agents/skills/` skill applies,
because this ticket changes no React, Next.js, or user-visible surface.

Read only this section unless you hit an ambiguity it does not resolve.

## Observed behavior

The documented schema workflow ends by regenerating the committed types from a
clean reset:

```powershell
npx.cmd supabase db reset --local
npx.cmd supabase gen types typescript --local
```

With the pinned Supabase CLI 2.109.1, that regeneration **drops `| null` from
nine `save_training_completion` parameters** in
`src/lib/supabase/database.types.ts`.

`src/server/repositories/completion-repository.ts` passes `null` for them, so
the narrowed types make `npm.cmd run typecheck` fail on a tree whose only
change was running the documented command.

The M2-02 builder reproduced this on unchanged `master` by removing its own
migration and pgTAP file, resetting, and regenerating — the same nine-line
delta appeared with no M2-02 code present. It is therefore pre-existing and
unrelated to the memory model.

## Why this matters more than it looks

Every schema ticket is told to regenerate types and commit the result. Today
that instruction produces a red typecheck, so each builder must notice the
narrowing, understand it is a generator artifact rather than a real type
correction, and hand-preserve nine lines — while a project rule correctly says
never to hand-edit that file.

The M2-02 builder did exactly that and disclosed it, which is why the M2-02
diff to `database.types.ts` is `+214/-0`. A builder who instead accepted the
generator output would have committed types that contradict the database, and a
builder who "fixed" the resulting type errors in `completion-repository.ts`
would have removed correct `null` handling from accepted completion behavior.
Neither is a mistake anyone should have to avoid by being careful.

## Lead diagnosis — 3 August 2026

The ticket asked whether this was a wrong RPC signature, a CLI regression, or
something else. It is the first, with a twist: the signature never told the
generator anything, and the committed types have been wrong since they were
introduced.

Four pieces of evidence, all static and cheap to re-check:

1. **`save_training_completion` declares no parameter defaults.** All nineteen
   parameters in `20260728143000_m1_03_completion_writes.sql:32` are plain
   required arguments, and the function is not `strict`.
2. **`apply_goal_change` does declare them.** Its parameters are
   `default null` (`20260729161854_m2_01_goal_model.sql:201`), and the
   generator emits them as `p_goal_id?: string` — optional, and **not**
   `| null`.
3. **The generator therefore never emits `| null` on an RPC argument.** It
   emits `name?: T` for a defaulted parameter and `name: T` otherwise.
   PostgreSQL has no per-argument nullability to read: every argument of a
   non-`strict` function accepts `NULL`, so no generator could single out nine
   of nineteen.
4. **The annotations arrived with the function.** `git log -S` puts them in
   `d9e2e57`, the M1-03 commit that created the RPC, and the CLI has been
   pinned at `2.109.1` since. The committed file has never been reproducible;
   the drift is a regeneration correctly reverting a hand-edit, and it will
   recur on every schema ticket until the signature says what the application
   means.

This is why the fix is a migration rather than the CLI bump the ticket
allowed for, and why the tier is 1 rather than 3.

The builder should still confirm point 2 by regenerating once before changing
anything — it is the load-bearing observation, and it costs one reset.

## Approval gate

The product owner approves the dispatch. The lead diagnosis fixes the tier at
**Tier 1**: the change is a forward migration to a `security definer` RPC
behind accepted completion behavior, so it takes a distinct builder and a
distinct independent reviewer. If the builder's confirmation contradicts the
diagnosis, stop and return to the product owner rather than re-planning inside
the ticket.
