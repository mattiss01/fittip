# M3-11: Legacy training reset

**Status:** proposed — clean-break direction approved; exact ticket not approved

**Triage:** needs-triage

**Milestone:** M3

**Priority:** P1

**Tier:** 1 — destructive migration, permanent data deletion, schema removal,
authorization, and founder deployment

**Depends on:** M3-10 accepted.

**Blocks:** M3-12 and every later F-005 replacement slice.

## Outcome

Remove the complete legacy training-record model before building its
replacements. The founder environment keeps the accepted M3-10 rolling-plan
foundation and preserved non-training domains, but all old plan, proposal,
completion, and correction data and runtime machinery are permanently removed.

Plan, Today, logging, Progress, roadmap, and plan-proposal surfaces show an
honest maintenance state or are unavailable until their replacement ticket
lands. Roadmap records remain preserved while their completion-dependent
runtime is unavailable.

## Scope to preserve when this ticket is drafted for approval

- One forward migration deletes the approved legacy rows and then drops their
  tables, functions, triggers, policies, grants, indexes, constraints, and
  database types after verifying the exact dependency closure. Applied
  migrations remain untouched.
- Remove application modules, routes, actions, components, tests, fixtures, and
  generated database types that exist only for bounded plans, legacy plan
  proposals, completions, or completion corrections. Do not leave callable or
  dead compatibility paths.
- Preserve authentication/profiles, goals, explicit memory, onboarding,
  roadmaps, personal activities, AI spend/accounting, security/audit evidence,
  and the complete M3-10 rolling-plan foundation.
- Preserve roadmap records, but expire each undecided roadmap proposal whose
  recorded sources depend on removed plan or completion records. It must remain
  impossible to accept and must not reinterpret a missing source as current.
- Keep shared training validation needed by personal activities or the rolling
  plan; remove only objects proven to belong exclusively to the legacy model.
- Replace affected owner routes and navigation affordances with a small,
  accessible maintenance state. They must not query removed schema or imply
  that historical training remains available.
- Prove the migration from zero and from a seeded pre-reset database, including
  exact removed-object absence, preserved-domain counts, no dangling
  references, M3-10 schema/RLS/grants/function behavior, and database advisors.
- Record non-content row counts before execution. Create no export, backfill,
  archive, compatibility view, restore path, or manual backup.
- Preview and independent review are non-destructive. After acceptance, deploy
  the reviewed maintenance-safe application before database deletion. Applying
  the founder migration still requires the explicit **Run the destructive
  cutover** confirmation against the exact reviewed commit and runbook.

## Expected implementation areas

- `supabase/migrations/`, `supabase/tests/database/`, the seeded migration
  harness, and generated Supabase types.
- Legacy training, completion, and plan-proposal repositories/modules plus their
  callers and tests.
- `/home/plan`, `/home/today`, `/home/log`, `/home/progress`,
  `/home/plan/roadmap`, and `/home/plan/proposal`.
- Mobile navigation, architecture guards, CI harness registration if required,
  and `docs/validation/M3/M3-11-VALIDATION.md`.

## Non-goals

- No manual rolling-plan editor, saved-session library, recurrence, replacement
  completion/logging, Progress, AI proposal, regeneration, or new provider use.
- No deletion of M3-10 rolling-plan data or schema, personal activities,
  roadmaps, goals, memory, onboarding, accounting, audit evidence, auth, or
  profiles.
- No dual write, compatibility synchronization, legacy archive, data export,
  or temporary legacy read path.

## Approval boundary

The product owner approved the clean-break direction and revised sequence on
14 August 2026. This proposed ticket still needs its short `## Agent brief` and
separate explicit approval before a Tier 1 builder may be dispatched. Approval
of the ticket will not itself authorize the hosted deletion; execution requires
the later exact confirmation stated above.
