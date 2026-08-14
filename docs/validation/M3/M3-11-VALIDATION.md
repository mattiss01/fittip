# M3-11 validation record: legacy training reset

**Ticket:**
[M3-11](../../backlog/M3/M3-11-LEGACY-TRAINING-RESET.md)

**Lifecycle state:** in development; builder handoff complete

**Tier:** 1 — destructive schema/data, authorization, and founder deployment

**Branch:** `ticket/m3-11-legacy-training-reset`

**Approved implementation base:**
`cc60c11357cbeae1fa14b2fbe3293384d79945f7`

**Exact implementation review target:**
`8486fa35b40a8512fc634590a2125cf18d783668`

**Implementation commit:**
`e370dbe20d410488b13fd7ecd69a39f7f741314e`

**Isolated CI/tooling commit:**
`8486fa35b40a8512fc634590a2125cf18d783668`

**Final validation evidence head:** the evidence-only commit containing this
record follows the implementation target and changes no runtime, schema, or CI
behavior.

**Mobile evidence:**
[390x844 maintenance screenshot](evidence/M3-11-maintenance-390x844.png)

**Exact-commit CI, Vercel Preview, independent review, hosted cutover, and
product-owner acceptance:** pending lead handoff. The builder did not contact a
hosted Supabase project or execute the founder runbook.

## Delivered behavior

- One forward migration deletes and drops the approved 11 legacy tables and
  their exclusive trigger, functions, four receipt types, policies, grants,
  indexes, and constraints without `CASCADE`.
- Legacy training, completion, manual planning, plan-proposal, and affected
  roadmap UI/runtime modules are removed. Static checks reject reintroduction
  of removed database calls and named server entry points.
- `/home/plan`, `/home/today`, `/home/log`, `/home/progress`,
  `/home/plan/roadmap`, and `/home/plan/proposal` render one shared, static,
  accessible maintenance presentation and perform no Supabase read or write.
- Preserved roadmap rows stay readable. Undecided proposals sourced from a
  legacy plan version or completion receive an explicit `expired` decision,
  and all five roadmap mutation RPCs are revoked until M3-15 replaces their
  context.
- `personal_activities`, the shared training-measurement validator, every
  M3-10 rolling-plan object, auth/profiles, goals, memory, onboarding, roadmap
  records, and AI accounting remain in place.
- Pure local-date and training-measurement helpers moved out of deleted legacy
  modules so preserved M3-10 and future AI plan contracts do not depend on the
  removed model.

The maintenance surface stays within the existing FitTip ledger typography,
colors, navigation, focus treatment, and reduced-motion rules. Its one orange
left rail marks the reset state without establishing a new product direction.
It is a static Server Component, so it adds no client bundle, serialized data,
request waterfall, or cross-request state.

## Complete change manifest

`git diff --stat
cc60c11357cbeae1fa14b2fbe3293384d79945f7..8486fa35b40a8512fc634590a2125cf18d783668`:

```text
 .github/workflows/ci.yml                           |   81 +-
 README.md                                          |   16 +-
 .../M3/evidence/M3-11-maintenance-390x844.png      |  Bin 0 -> 57513 bytes
 e2e/m1-03-quick-log.spec.ts                        |  244 ----
 e2e/m1-03.playwright.config.ts                     |   14 -
 e2e/m1-04-today-progress.spec.ts                   |  192 ---
 e2e/m2-09-lost-render.probe.ts                     |  407 ------
 e2e/m3-02-roadmap.spec.ts                          |  320 -----
 e2e/m3-02.playwright.config.ts                     |   19 -
 e2e/m3-03-plan-proposal.spec.ts                    |  210 ----
 e2e/m3-03.playwright.config.ts                     |   16 -
 e2e/m3-11-maintenance.spec.ts                      |  145 +++
 ...wright.config.ts => m3-11.playwright.config.ts} |   10 +-
 e2e/planning.spec.ts                               |  322 -----
 package.json                                       |    3 +-
 scripts/patch-database-types.mjs                   |  152 +--
 scripts/patch-database-types.test.mjs              |  120 +-
 src/app/home/home.module.css                       |   11 +
 src/app/home/log/actions.test.ts                   |  128 --
 src/app/home/log/actions.ts                        |  157 ---
 src/app/home/log/error.tsx                         |   26 -
 src/app/home/log/loading.tsx                       |   12 -
 src/app/home/log/log.module.css                    |  519 --------
 src/app/home/log/page.tsx                          |  134 +-
 src/app/home/plan/actions.test.ts                  |  169 ---
 src/app/home/plan/actions.ts                       |  179 ---
 src/app/home/plan/error.tsx                        |   19 -
 src/app/home/plan/loading.tsx                      |   12 -
 src/app/home/plan/page.test.tsx                    |  107 --
 src/app/home/plan/page.tsx                         |   87 +-
 src/app/home/plan/proposal/action-state.ts         |   26 -
 src/app/home/plan/proposal/actions.test.ts         |   97 --
 src/app/home/plan/proposal/actions.ts              |  205 ---
 src/app/home/plan/proposal/error.tsx               |   13 -
 src/app/home/plan/proposal/loading.tsx             |    7 -
 src/app/home/plan/proposal/page.tsx                |  132 +-
 src/app/home/plan/proposal/proposal.module.css     |  471 -------
 src/app/home/plan/roadmap/action-state.ts          |   42 -
 src/app/home/plan/roadmap/actions.test.ts          |  304 -----
 src/app/home/plan/roadmap/actions.ts               |  373 ------
 src/app/home/plan/roadmap/error.tsx                |   21 -
 src/app/home/plan/roadmap/loading.tsx              |   13 -
 src/app/home/plan/roadmap/page.test.tsx            |  236 ----
 src/app/home/plan/roadmap/page.tsx                 |  265 +---
 src/app/home/plan/roadmap/roadmap.module.css       |  584 ---------
 src/app/home/progress/[id]/page.test.tsx           |  150 ---
 src/app/home/progress/[id]/page.tsx                |  436 -------
 src/app/home/progress/error.tsx                    |   21 -
 src/app/home/progress/loading.tsx                  |   13 -
 src/app/home/progress/page.tsx                     |  226 +---
 src/app/home/today/error.tsx                       |   21 -
 src/app/home/today/loading.tsx                     |   13 -
 src/app/home/today/page.test.tsx                   |  157 ---
 src/app/home/today/page.tsx                        |  274 +---
 src/architecture/m3-11-legacy-reset.test.ts        |   88 ++
 src/architecture/server-boundary.test.ts           |   41 +-
 src/components/completions/quick-log-form.test.tsx |  167 ---
 src/components/completions/quick-log-form.tsx      |  405 ------
 .../completions/revision-history.test.tsx          |   83 --
 src/components/completions/revision-history.tsx    |  116 --
 src/components/home/browser-local-date.tsx         |    2 +-
 src/components/home/mobile-navigation.tsx          |    1 +
 src/components/home/training-maintenance.test.tsx  |   24 +
 src/components/home/training-maintenance.tsx       |   45 +
 .../plan-proposal/plan-proposal-days.test.tsx      |   57 -
 .../plan-proposal/plan-proposal-days.tsx           |  131 --
 .../plan-proposal/plan-proposal-manager.test.tsx   |  122 --
 .../plan-proposal/plan-proposal-manager.tsx        |  556 --------
 src/components/planning/activity-library.test.tsx  |  106 --
 src/components/planning/activity-library.tsx       |  258 ----
 src/components/planning/plan-editor.test.tsx       |  404 ------
 src/components/planning/plan-editor.tsx            |  869 -------------
 src/components/planning/session-composer.test.tsx  |  128 --
 src/components/planning/session-composer.tsx       |  892 -------------
 src/components/roadmap/roadmap-editor.tsx          |  364 ------
 src/components/roadmap/roadmap-manager.test.tsx    |  518 --------
 src/components/roadmap/roadmap-manager.tsx         |  799 ------------
 src/components/roadmap/roadmap-spine.tsx           |  174 ---
 src/features/completions/completion-types.ts       |  105 --
 src/features/completions/status-label.test.ts      |   16 -
 src/features/completions/status-label.ts           |   17 -
 src/features/plan-proposal/plan-proposal-copy.ts   |   17 -
 src/features/planning/planning-types.ts            |   93 --
 src/features/planning/planning-utils.ts            |    6 -
 .../completions => lib/date}/local-date.test.ts    |    2 +-
 .../completions => lib/date}/local-date.ts         |    0
 src/lib/supabase/database.types.ts                 |  960 +-------------
 src/server/ai/context-source.test.ts               |  222 ----
 src/server/ai/context-source.ts                    |  246 +---
 src/server/ai/plan-horizon.ts                      |    2 +-
 src/server/ai/spend.ts                             |    2 +-
 src/server/completions/completion-records.test.ts  |  157 ---
 src/server/completions/completion-records.ts       |  287 -----
 src/server/plan-proposal/plan-proposal-records.ts  |   60 -
 .../plan-proposal/plan-proposal-service.test.ts    |  211 ----
 src/server/plan-proposal/plan-proposal-service.ts  |  220 ----
 src/server/plan-proposal/plan-safety.test.ts       |   86 --
 src/server/plan-proposal/plan-safety.ts            |   34 -
 .../repositories/completion-repository.test.ts     |  309 -----
 src/server/repositories/completion-repository.ts   |  404 ------
 .../repositories/plan-proposal-repository.test.ts  |  118 --
 src/server/repositories/plan-proposal-repository.ts|  263 ----
 src/server/repositories/rolling-plan-repository.ts |    2 +-
 .../training-record-repository.test.ts             |  471 -------
 .../repositories/training-record-repository.ts     |  629 ----------
 src/server/roadmap/roadmap-service.test.ts         |  306 -----
 src/server/roadmap/roadmap-service.ts              |  243 ----
 src/server/rolling-plan/rolling-plan.ts            |    6 +-
 src/server/training/past-plan-protection.test.ts   |  129 --
 src/server/training/past-plan-protection.ts        |   95 --
 src/server/training/training-measurements.test.ts  |   39 +
 src/server/training/training-measurements.ts       |  234 ++++
 src/server/training/training-records.test.ts       |  183 ---
 src/server/training/training-records.ts            |  527 --------
 .../20260814195107_m3_11_legacy_training_reset.sql |  140 +++
 .../tests/database/m1_01_training_records.test.sql | 1195 ------------------
 .../database/m1_03_completion_writes.test.sql      |  409 ------
 .../database/m3_02_roadmap_proposals.test.sql      | 1321 --------------------
 .../m3_03_plan_duration_correction.test.sql        |   84 --
 .../tests/database/m3_03_plan_proposals.test.sql   | 1012 ---------------
 .../database/m3_11_legacy_training_reset.test.sql  |  219 ++++
 .../tests/fixtures/m3_11_post_reset_verify.sql     |  107 ++
 supabase/tests/fixtures/m3_11_pre_reset.sql        |  287 +++++
 .../integration/m1_01_concurrent_data_api.mjs      |  209 ----
 .../integration/m3_02_concurrent_acceptance.mjs    |  401 ------
 .../integration/m3_11_seeded_reset.mjs             |   55 +
 126 files changed, 1534 insertions(+), 24887 deletions(-)
```

Navigation notes for non-obvious files:

- `m3_11_pre_reset.sql`, `m3_11_post_reset_verify.sql`, and
  `m3_11_seeded_reset.mjs` form the local-only proof: reset to M3-10, seed one
  row through all 11 removed tables plus representative preserved domains,
  apply only M3-11, then assert absence, counts, references, expiration, and
  grants.
- `training-measurements.ts` retains only the shared validation used by M3-10;
  it contains no legacy persistence model.
- `local-date.ts` retains the pure timezone helper used by the AI horizon and
  browser-local date. Git records this and its test as renames out of the
  deleted completion feature.
- `patch-database-types.mjs` is now a no-op guard that fails if the removed
  completion RPC type ever reappears.
- `.github/workflows/ci.yml` is isolated in `8486fa3`; it replaces checks for
  intentionally deleted surfaces with the seeded reset and six-route mobile
  maintenance checks. It removes no still-supported domain gate.

Deletion note: every deletion is named in the stat above. They are limited to
legacy training/completion/manual-plan/plan-proposal runtime and tests, the
affected roadmap mutation UI/service, and tests/harnesses whose asserted
objects are deliberately removed. Rename note: Git detects the new M3-11
Playwright config as a 53% rename of the removed M1-04 config; the two
`local-date` files are intentional moves to a preserved shared module. No
other file is renamed.

## Data, migration, API, privacy, and security effects

- Migration `20260814195107_m3_11_legacy_training_reset.sql` is one-way. It
  explicitly deletes rows child-to-parent and drops the 11 approved tables
  without `CASCADE`: `plan_proposal_decisions`, `plan_proposal_sources`,
  `plan_proposals`, `plan_generation_requests`, `completed_activities`,
  `completion_heads`, `completed_sessions`, `planned_activities`,
  `planned_sessions`, `detailed_plan_heads`, and `detailed_plan_versions`.
- The committed migration SHA-256 is
  `bdf8eee66e1ebe471ce23e354a07f58eb2fc2ef3740f08bbee073562b5036951`.
- It also drops the exclusive completion/manual-plan/plan-proposal functions,
  one completion trigger/function, and four plan receipt types. The generated
  TypeScript surface contains none of those names.
- It preserves roadmap proposals, sources, decisions, versions, and receipt
  types. A source-dependent undecided proposal becomes `expired`; already
  accepted or rejected decisions are unchanged.
- `begin_roadmap_generation`, `finish_roadmap_generation`,
  `record_roadmap_memory_candidates`, `apply_roadmap_proposal_change`, and
  `accept_roadmap_proposal` deny `EXECUTE` to `authenticated`, `anon`, and
  `service_role`. The retained acceptance signature is a fail-closed shim with
  empty `search_path` and no reference to a legacy relation.
- M3-10 authenticated owner reads/writes, same-owner references, RLS, grants,
  empty-slice behavior, and 12-way concurrency contract remain green.
- No remote data, backup, export, browser storage, analytics, AI provider,
  external service, credential, or paid resource was read or changed. The
  local service credential was supplied only to disposable test harnesses and
  was neither printed nor persisted.
- Current official Supabase guidance was checked before implementation:
  [changelog](https://supabase.com/changelog),
  [database migrations](https://supabase.com/docs/guides/deployment/database-migrations),
  and [function privileges](https://supabase.com/docs/guides/database/functions#function-privileges).
  The migration explicitly revokes function execution because functions are
  executable by `PUBLIC` by default unless privileges are tightened.

## Tests and builder results

| Command or check | Result |
|---|---|
| `npx supabase db reset --local --no-seed` | PASS; all migrations applied from zero through M3-11 |
| `npm run test:m3-11-seeded-reset` | PASS; all 11 removed tables seeded before reset; preserved counts/references and expiration verified after |
| full local database pgTAP directory | PASS; 8 files, 491 assertions |
| M3-11 focused pgTAP | PASS; 49 assertions |
| database lint at warning/fail-on-warning | PASS; no issues |
| security and performance advisors at warn/fail-on-warn | PASS; no issues |
| generated types plus no-op patch guard | PASS; removed names absent, M3-10/personal activity names present |
| `npm run typecheck` | PASS |
| focused Vitest architecture/UI/shared/M3-10 files | PASS; 8 files, 36 tests |
| `npm run lint` | PASS |
| M3-10 real Postgres adapter contract | PASS; 5 tests, no skip |
| M3-10 concurrency harness | PASS; 12 races, each one winner/one `PT409`, cleanup verified |
| `npm run build` | PASS; all six maintenance routes compiled as dynamic authenticated routes |
| M3-11 production Playwright | PASS; 1 test at exactly `390x844`, all six routes, no skip |
| mobile cache/overflow/focus/console/page/legacy-request assertions | PASS |
| `git diff --check` | PASS |
| exact-review-target CI | Pending lead push |
| matching Vercel Preview | Pending lead push |
| hosted migration/security/owner verification | Not run; deliberately blocked on review, acceptance gates, and exact founder phrase |

The builder used focused application checks while implementing; exact-target
CI remains the full automated-suite evidence. The local machine runs Node
22.14.0 while the repository requires Node 24.18.0; exact-target CI will use
the pinned Node version.

## Non-executed founder cutover runbook

This runbook is a future lead/founder procedure, not builder evidence. Stop at
the end of preflight unless the product owner sends the exact phrase
**Run the destructive cutover** after independently reviewed commit, green CI,
matching Preview, and explicit product acceptance are recorded.

### A. Preflight — read-only, no export

1. Record exact reviewed implementation
   `8486fa35b40a8512fc634590a2125cf18d783668`, evidence head, CI URL, Preview
   URL/deployment Git SHA, founder project ref, and migration SHA-256. Abort on
   any mismatch or dirty checkout.
2. Confirm the linked project is the owner-approved FitTip founder project and
   `git remote get-url origin` is exactly
   `https://github.com/mattiss01/fittip.git`. Do not print credentials.
3. Run `npx supabase migration list --linked`. Remote and repository history
   must match through `20260814164502`; `20260814195107` must be the only local
   pending version. Abort on drift.
4. Run `npx supabase db push --linked --dry-run`. It must name only
   `20260814195107_m3_11_legacy_training_reset.sql`. Save the output as
   evidence. Abort if any other migration or destructive object appears.
5. Through an encrypted `psql` session with `ON_ERROR_STOP=1`, record row
   counts only — never row content — for all 11 removed tables; the nine
   preserved domain groups (profiles, goals, memory, onboarding, roadmap,
   AI-spend, personal activities, M3-10 current/history, auth users); and the
   count of undecided roadmap proposals with a `plan_version` or `completion`
   source. Save the numbers in this record. Do not create a manual backup,
   archive, dump, CSV, or compatibility copy.
6. In the same read-only session, prove every dropped table/function/type has
   exactly the dependencies named by the reviewed migration and no preserved
   object depends on it. Abort on an unexpected dependency.
7. Confirm the product owner understands that accepted plans, completions, and
   the named legacy history will not be preserved, and that provider-managed
   retention/point-in-time recovery is outside this ticket and has not been
   independently verified.
8. Obtain and record the exact chat phrase **Run the destructive cutover**.
   Any paraphrase is insufficient.

### B. Execution — maintenance first, then one migration

1. Promote/merge the exact accepted application result and wait for the
   founder Vercel deployment to reach `READY`. Verify all six affected routes
   show the reviewed maintenance surface before touching the database. Abort
   if any route still calls a legacy object.
2. Re-run the migration-list and dry-run checks immediately before execution.
   Abort if state changed.
3. Run exactly `npx supabase db push --linked`. Do not pass an option that
   repairs, squashes, includes an unreviewed migration, or resets history.
4. If the push fails, keep the maintenance application active, capture the
   failure, and stop. Do not improvise a partial manual drop or restore old
   application code against a partially reset schema.

### C. Verification — fail closed before reopening delivery

1. Run `npx supabase migration list --linked`; local and remote must align
   through `20260814195107` exactly once.
2. Query `pg_class`, `pg_proc`, `pg_type`, `pg_policy`, and privileges. Prove
   the 11 tables, exclusive functions/trigger, and four plan receipt types are
   absent; all named preserved objects still exist; M3-10 RLS remains enabled;
   and the five roadmap mutation RPCs deny all three application roles.
3. Compare preserved-domain row counts with preflight. They must be identical
   except for the expected new `expired` roadmap decisions. Verify each such
   decision matches a formerly undecided source-dependent proposal and that no
   accepted/rejected decision changed.
4. Run linked database lint and both advisors without suppressing findings:
   `npx supabase db lint --linked --level warning --fail-on warning` and
   `npx supabase db advisors --linked --type all --level warn --fail-on warn`.
   Record all results and explain any project-wide warning; do not weaken a
   check.
5. With disposable authenticated owner A, verify profile/goals/memory/
   onboarding/roadmap/personal-activity reads and an empty M3-10 rolling-plan
   slice. Verify the rolling-plan write/read contract still succeeds inside a
   rollback-only probe. As authenticated owner B and as anonymous, prove
   owner-A rows and rolling-plan slice are denied. Verify direct mutation is
   still denied. Roll back and prove no probe row remains.
6. Exercise all six founder-hosted routes at `390x844`: HTTP 200 after auth,
   `private` plus `no-store`, shared maintenance copy, keyboard focus, no
   overflow, console/page error, or legacy database/RPC request. Recheck You,
   goals, memory, and onboarding.
7. Record hosted evidence, exact master SHA, Vercel deployment URL/ID, remote
   migration history, row-count comparison, privilege matrix, advisor output,
   authenticated owner/cross-owner results, and route evidence here before
   declaring the cutover complete or dispatching M3-12.

## Known limitations

- This intentionally removes all old accepted-plan and completion history;
  there is no archive, export, backfill, compatibility view, restore UI, or
  dual-write path.
- Plan, Today, logging, Progress, roadmap editing, and Coach plan proposals are
  temporarily unavailable. Goals, memory, onboarding, profile, personal
  activity definitions, roadmap records, AI accounting, and dormant M3-10
  storage remain.
- Saved sessions, recurrence, replacement completion/Progress/AI behavior, and
  activation of the continuous plan are later F-005 tickets.
- The builder did not contact hosted Supabase, inspect remote row counts,
  verify provider-managed retention, run a provider, incur spend, push, deploy,
  or execute any destructive hosted operation.

## Independent reviewer checklist

- Review exact implementation target
  `8486fa35b40a8512fc634590a2125cf18d783668` against approved base
  `cc60c11357cbeae1fa14b2fbe3293384d79945f7`; treat the later validation-only
  commit as evidence.
- Reconcile the complete stat, deletions, renames, and navigation notes against
  the actual diff. Report any omitted, unexpected, or inaccurately described
  file.
- Apply `code-review` on separate Standards and Spec axes and independently
  apply the ticket's schema, Supabase, React, frontend, mobile, and validation
  skills.
- Confirm every destructive object is in the approved 11-table closure, no
  `CASCADE` widens scope, and an unexpected dependency aborts the migration.
- Confirm preserved row counts/references, roadmap expiration, privilege
  matrix, M3-10 ownership/RLS/concurrency, and removed generated types from the
  actual tests and migration.
- Confirm all six routes are static-query-free maintenance wrappers and the
  screenshot/Playwright assertions cover the approved 390px behavior.
- Use exact-SHA CI for the complete automated suite. Do not run the founder
  cutover, contact hosted Supabase, or request the destructive phrase during
  independent review.
