# M3-11: Legacy training reset

**Status:** in development — approved by the product owner on 14 August 2026

**Triage:** ready

**Milestone:** M3

**Priority:** P1

**Depends on:** M3-10 accepted.

**Blocks:** M3-12 and every later F-005 replacement slice.

## Agent brief

Remove the legacy training-record model, preserving M3-10 and named
non-training domains; leave affected owner surfaces in accessible maintenance.

**Tier:** 1 — destructive schema/data, authorization, and founder deployment.
Use `schema-change`, `codebase-design`, `frontend-design`,
`vercel-react-best-practices`, `mobile-e2e`, `validation-record`, and the
Supabase skill with current official guidance.

**Hard constraints:**

- Add one forward migration; never edit an applied migration. Delete legacy
  rows, then drop the 11 F-005 legacy tables and their exclusive functions,
  trigger, composite types, policies, grants, indexes, and constraints.
- Prove the dependency closure. Preserve `personal_activities`,
  `is_valid_training_measurement`, every M3-10 object, auth/profiles, goals,
  memory, onboarding, roadmaps, AI accounting, and security/audit evidence.
- Preserve roadmap records; expire source-dependent undecided proposals and
  revoke affected roadmap mutation RPCs until M3-15 replaces their context.
- Remove legacy-only repositories, modules, actions, components, fixtures,
  tests, architecture allowlists, and generated type surface. No compatibility
  implementation or callable legacy write remains.
- `/home/plan`, `/home/today`, `/home/log`, `/home/progress`,
  `/home/plan/roadmap`, and `/home/plan/proposal` must make no legacy call and
  use one small maintenance presentation in the existing FitTip visual system.
- Preview and review are non-destructive. Do not contact hosted Supabase, run a
  remote migration, delete hosted data, use a provider, or incur spend.
- Write the exact founder preflight/execution/verification runbook, but stop
  before execution. Hosted deletion still requires the later exact phrase
  **Run the destructive cutover** from the product owner.
- If a seeded-reset harness needs `.github/**`, isolate that tooling change in
  its own commit and do not weaken any existing CI check.

**Non-goals:** no manual Plan, saved sessions, recurrence, replacement
completion/Progress/AI behavior, backfill, export, archive, backup, dual write,
second Plan route, new provider, or deletion outside the approved legacy model.

**Acceptance criteria:**

1. Clean-from-zero and seeded-pre-reset tests prove exact removed-object
   absence, preserved counts/references, expired roadmap decisions, and no
   dangling dependency; lint, advisors, pgTAP, and generated types pass.
2. M3-10's authenticated owner interface, RLS, grants, concurrency, and empty
   slice behavior remain intact; anonymous and cross-owner access stay denied.
3. Every affected route is truthful at `390x844`, keyboard accessible, has no
   horizontal overflow or console/page error, and performs no legacy query.
4. Static/runtime tests prove deleted server modules and database RPCs cannot
   be imported or called, while preserved domains remain usable or readable as
   specified.
5. The validation record contains the exact diff/manifest, deletion and rename
   notes, seeded migration proof, privilege matrix, CI, Preview, limitations,
   and the non-executed founder runbook.

**Expected areas:** one `supabase/migrations/` file, database/integration tests,
generated types, legacy training/completion/plan-proposal modules and callers,
the six routes above, navigation/architecture/E2E coverage, and
`docs/validation/M3/M3-11-VALIDATION.md`.

Read only this section unless you hit an ambiguity it does not resolve.

## Approval and execution boundary

The product owner approved the clean-break direction and revised ticket order,
then explicitly approved this M3-11 contract on 14 August 2026. That approval
authorizes one ticket branch, a distinct builder, an independent reviewer, and
non-destructive Preview verification. It does not authorize the founder
database reset.

The one-time working-agreement exception is recorded verbatim in F-005. The
founder migration may run only after the exact implementation and runbook pass
independent review, the maintenance-safe application is deployed, and the
product owner provides the separate execution phrase named in the brief.

## Rationale and dependency notes

M3-10 is accepted and already supplies the isolated rolling-plan schema and
interface that must survive this ticket. Removing the old model now avoids a
second Plan route, dual writes, compatibility synchronization, and months of
dead schema while the replacement tickets are built.

Roadmap records belong to a preserved domain, but the current roadmap operation
reads legacy completion context. Its runtime therefore joins the maintenance
window and its mutation privileges fail closed; M3-15 later restores it against
replacement completion context without erasing its records.
