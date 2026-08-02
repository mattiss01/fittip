# M2-08: Regenerating database types breaks typecheck

**Status:** proposed — not approved for implementation

**Milestone:** M2 — goals, editable coaching context, and guided onboarding

**Priority:** P2

**Owning accepted work:** [M1-03 quick training logging](../M1/M1-03-QUICK-TRAINING-LOGGING.md)
and [ADR-008](../../decisions/ADR-008-M1-TRAINING-RECORD-TRANSACTIONS.md)

**Depends on:** nothing

**Source:** reported by the M2-02 builder on 2 August 2026 and reproduced on
unchanged `master`

**Blocks:** nothing today, but it silently taxes every future schema ticket.

## Observed behavior

The documented schema workflow ends by regenerating the committed types from a
clean reset:

```powershell
npx.cmd supabase db reset --local
npx.cmd supabase gen types typescript --local
```

With the pinned Supabase CLI 2.109.1, that regeneration **drops `| null` from
nine `save_training_completion` parameters** in
`src/lib/supabase/database.types.ts`. Those parameters are genuinely nullable:
`p_actual_started_at`, `p_completion_group_id`, `p_correction_reason`,
`p_duration_minutes`, `p_feeling`, `p_note`, and the remaining three the
generator narrows the same way.

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

## Investigation first

The cause is not known. Do not guess at a fix.

Establish which is true before proposing anything:

1. The RPC's declared parameter defaults or signature no longer tell the
   generator those arguments are optional, in which case the correction is a
   forward migration and the generator is behaving correctly.
2. The pinned CLI version has a regression in nullable-parameter emission, in
   which case the correction is a version bump with its own verification, or an
   accepted documented deviation.
3. Something else.

Option 1 and option 2 lead to completely different changes, and option 1 would
mean the committed types are currently wrong rather than the generator.

## Non-goals

- No change to completion, planning, or training behavior.
- No hand-edit of `src/lib/supabase/database.types.ts` as the fix. Regenerating
  must produce the committed file.
- No suppression: no `any`, no `@ts-expect-error`, no loosened `tsconfig`.
- No unrelated dependency bumps bundled with a CLI bump.

## Acceptance criteria

1. The cause is identified and recorded, or explicitly recorded as unidentified
   with what was ruled out.
2. After `db reset --local` followed by the documented type generation, the
   working tree is clean — the generator reproduces the committed file exactly.
3. `npm.cmd run typecheck` passes on that tree with no hand-preserved lines.
4. If the fix is a migration, it is forward-only and no applied migration is
   edited. If it is a CLI bump, it is committed separately as a tooling change
   with the full database matrix re-run.
5. A green continuous-integration run for the reviewed commit.

## Approval gate

The product owner approves the investigation. Tier depends on the cause: a CLI
bump is **Tier 3** tooling the lead may implement; a migration correcting the
RPC signature is **Tier 1** and needs a distinct builder and reviewer. Stop and
re-dispatch if the investigation crosses that line.
