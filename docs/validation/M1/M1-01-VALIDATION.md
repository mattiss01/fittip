# M1-01 validation: training-record and ownership foundation

**Status:** accepted — product-owner acceptance recorded 28 July 2026

**Date:** 28 July 2026

**Ticket:** [M1-01](../../backlog/M1/M1-01-TRAINING-RECORDS-FOUNDATION.md)

**Feature brief:** [F-002](../../product/F-002-MANUAL-TRAINING-PLANNING-TRACKING.md)

**Architecture:** [ADR-008](../../decisions/ADR-008-M1-TRAINING-RECORD-TRANSACTIONS.md)

**Ticket branch:** `ticket/m1-01-training-records`

**Reviewed implementation commit:** `96c185a`

**Governing documentation commit:** `6d3cc71`

**Master integration commit:** `b495829` (fast-forwarded 28 July 2026)

## Builder outcome

M1-01 establishes the local database, domain-validation, and server-repository
foundation for manual training plans, personal activities, and factual
completion history. It deliberately adds no planning, Today, logging, or
history UI.

The implementation preserves these approved boundaries:

- every owned row has an explicit `user_id`;
- accepted plans and their children are immutable permanent versions;
- planned and completed records remain separate;
- a completion may reference but never mutate its planned source;
- editable personal definitions never replace plan or completion snapshots;
- plans cover an explicit owner-selected 1–7-day range;
- the atomic plan-save function derives ownership from `auth.uid()` and
  rejects stale revisions as PostgREST HTTP 409 / error code `PT409`;
- the repository explicitly disables retries only for this atomic plan-save
  RPC and maps only `PT409` to the plan-conflict result;
- no global activity library, service-role credential, AI provider, analytics,
  or remote schema change was added.

## Complete M1-01 change manifest

This manifest records ticket-owned implementation plus the planning and
governance artifacts that directly govern this delivery. Authorship is stated
where a file was prepared by the lead in the shared worktree before or during
the builder assignment.

### Created

- `docs/backlog/M1/M1-01-TRAINING-RECORDS-FOUNDATION.md` — defines the approved
  ticket contract, acceptance criteria, validation requirements, and
  implementation boundary; created by the lead before builder dispatch.
- `docs/product/F-002-MANUAL-TRAINING-PLANNING-TRACKING.md` — records the
  approved M1 feature behavior that M1-01 must support without implementing
  the later UI; created by the lead before builder dispatch.
- `docs/decisions/ADR-008-M1-TRAINING-RECORD-TRANSACTIONS.md` — records the
  approved immutable-version, current-head, stale-write, privilege, and atomic
  RPC architecture and the separately approved `PT409`/no-retry correction;
  created by the lead before builder dispatch and amended by the builder.
- `docs/product/DATA-MODEL-OVERVIEW.md` — provides the requested conceptual
  visual and distinguishes the M1 records from later proposed M2/M3 records;
  created during the preceding planning revision.
- `supabase/migrations/20260728105226_m1_01_training_records_foundation.sql` —
  creates the owner-scoped training schema, constraints, indexes, RLS,
  privileges, measurement validator, and atomic manual-plan RPC; the approved
  concurrency correction raises `PT409` for a stale revision.
- `supabase/tests/database/m1_01_training_records.test.sql` — adds 103 pgTAP
  assertions for schema, grants, RLS, ownership, history, snapshots,
  measurements, horizons, invalid payloads, and stale writes.
- `src/server/training/training-records.ts` — adds server-only, strict
  database-boundary parsers for personal activities, plans, sessions,
  activities, dates, timezones, and sport-neutral measurements.
- `src/server/training/training-records.test.ts` — tests valid 1/2/7-day
  horizons, date/timezone boundaries, duplicate positions, activity
  normalization, every measurement mode, malformed units, and unknown fields.
- `src/server/repositories/training-record-repository.ts` — adds the
  verified-user repository for plan heads, atomic manual plan saves, and
  owner-scoped personal-activity lifecycle operations; the atomic save alone
  disables retry and maps `PT409` to the conflict error.
- `src/server/repositories/training-record-repository.test.ts` — tests
  Auth-derived ownership, RPC payload mapping, stale-write mapping, validation
  before persistence, owner predicates, founder-staging denial, and the exact
  `.retry(false)` call.
- `supabase/tests/integration/m1_01_concurrent_data_api.mjs` — provisions a
  disposable local confirmed user, sends two simultaneous authenticated plan
  RPCs, verifies one success and one prompt HTTP 409 / `PT409` conflict, and
  proves exactly one version and head before cleanup.
- `docs/validation/M1/M1-01-VALIDATION.md` — persists this builder manifest,
  migration/API effects, commands, evidence, and limitations for review.

### Modified

- `src/lib/supabase/database.types.ts` — regenerated from the clean local
  public schema so the eight training tables, relationships, generated
  predecessor columns, and two functions are represented in TypeScript.
- `package.json` — adds the deterministic
  `test:m1-01-concurrency` command for the local Data API race proof.
- `src/architecture/server-boundary.test.ts` — enforces that application
  `.retry(false)` appears exactly once and only on
  `save_manual_plan_version`.
- `AGENTS.md` — the lead strengthened delivery governance during this work to
  require distinct builder/reviewer agents and a persisted, reconciled change
  manifest; this is process governance, not product implementation.
- `README.md` — the preceding planning revision linked the split milestone
  backlogs and visual data model; it supplies repository orientation but is not
  an M1-01 implementation edit.
- `REVISED_PRODUCT_PLAN.md` — the preceding planning revision made manual
  training planning/tracking the M1 milestone and recorded the selected
  1–7-day horizon and training-record model; it is governing context rather
  than builder-authored implementation.

### Deleted

- None for M1-01.

### Renamed

- None for M1-01.

## Shared-worktree reconciliation

The builder inherited a dirty shared worktree containing the broader M0/M1
backlog split and M1–M3 roadmap reorganization. Those edits were preserved and
are not claimed as M1-01 implementation. The independent reviewer should not
attribute the following files to this builder slice.

### Pre-existing modified planning files

- `docs/backlog/M0/M0-05-PRIVACY-SAFE-INSTRUMENTATION-AI-CONTROLS.md`
- `docs/backlog/M0/M0-06-QUALITY-DEPLOYMENT-BASELINE.md`
- `docs/backlog/M0/M0-06A-FOUNDER-HOSTED-STAGING.md`
- `docs/backlog/archive/M0-M1-BACKLOG.md`
- `docs/backlog/M1/M1-05-M1-VALIDATION-SLICE.md`
- `docs/backlog/M2/M2-BACKLOG.md`
- `docs/decisions/ADR-006-LOCAL-OWNER-AI-MVP.md`
- `docs/decisions/ADR-007-FOUNDER-HOSTED-STAGING.md`

### Pre-existing created planning files

- `docs/backlog/M0/M0-BACKLOG.md`
- `docs/backlog/M1/M1-02-SELECTABLE-HORIZON-PLANNING.md`
- `docs/backlog/M1/M1-03-QUICK-TRAINING-LOGGING.md`
- `docs/backlog/M1/M1-04-TODAY-PROGRESS-NAVIGATION.md`
- `docs/backlog/M1/M1-BACKLOG.md`
- `docs/backlog/M2/M2-01-GOAL-MODEL-VALIDATION.md`
- `docs/backlog/M2/M2-02-MEMORY-MODEL-MANAGEMENT.md`
- `docs/backlog/M2/M2-03-INTAKE-FACT-REVIEW.md`
- `docs/backlog/M2/M2-04-M2-VALIDATION-SLICE.md`
- `docs/backlog/M3/M3-01-LOCAL-AI-ADAPTER-CONTROLS.md`
- `docs/backlog/M3/M3-02-ROADMAP-PROPOSAL.md`
- `docs/backlog/M3/M3-03-SELECTED-HORIZON-PLAN-PROPOSAL.md`
- `docs/backlog/M3/M3-04-PLAN-EDIT-LOCK-ACCEPTANCE.md`
- `docs/backlog/M3/M3-05-M3-VALIDATION-SLICE.md`
- `docs/backlog/M3/M3-BACKLOG.md`

### Pre-existing deleted or logically relocated planning files

Git currently represents these unstaged logical moves as deleted tracked files
plus untracked destinations, not as staged renames:

- `M1-01-GOAL-MODEL-VALIDATION.md` → `M2-01-GOAL-MODEL-VALIDATION.md`
- `M1-02-MEMORY-MODEL-MANAGEMENT.md` →
  `M2-02-MEMORY-MODEL-MANAGEMENT.md`
- `M1-03-INTAKE-FACT-REVIEW.md` → `M2-03-INTAKE-FACT-REVIEW.md`
- `M1-04-MOBILE-NAVIGATION-EMPTY-STATES.md` →
  `M1-04-TODAY-PROGRESS-NAVIGATION.md` as a rewritten M1 navigation ticket
- `M2-01-LOCAL-AI-ADAPTER-CONTROLS.md` →
  `M3-01-LOCAL-AI-ADAPTER-CONTROLS.md`
- `M2-02-ROADMAP-PROPOSAL.md` → `M3-02-ROADMAP-PROPOSAL.md`
- `M2-03-SEVEN-DAY-PLAN-PROPOSAL.md` →
  `M3-03-SELECTED-HORIZON-PLAN-PROPOSAL.md`
- `M2-04-PLAN-EDIT-LOCK-ACCEPTANCE.md` →
  `M3-04-PLAN-EDIT-LOCK-ACCEPTANCE.md`
- `M2-05-M2-VALIDATION-SLICE.md` →
  `M3-05-M3-VALIDATION-SLICE.md`

The builder did not delete, rename, stage, revert, or otherwise normalize
these planning changes.

## Migration and data effects

The forward local migration creates eight `public` tables:

1. `personal_activities`
2. `detailed_plan_versions`
3. `detailed_plan_heads`
4. `planned_sessions`
5. `planned_activities`
6. `completed_sessions`
7. `completion_heads`
8. `completed_activities`

Every table has a required `user_id`, an owner relationship to
`public.profiles`, enabled RLS, explicit privileges, and owner-filtered
policies. Composite foreign keys repeat `user_id` so a child cannot reference
another owner's parent. Foreign-key and owner/date access paths are indexed.

Plan and correction chains use generated predecessor revision numbers and
composite foreign keys. A head's current record, owner, group where applicable,
and revision must all identify the same stored version. This prevents a head
from pointing to another owner, group, or revision.

Accepted plans are inserted only through
`public.save_manual_plan_version(integer, integer, date, text, jsonb)`. The
function:

- is intentionally `SECURITY DEFINER` under ADR-008;
- uses an empty `search_path` and schema-qualified objects;
- is revoked from `PUBLIC` and `anon`, then granted only to `authenticated`;
- derives the owner from `auth.uid()` and requires an existing profile;
- validates the 1–7-day range, IANA timezone, payload size and shape,
  session/activity limits, integer positions, measurements, and active
  same-owner personal-activity references;
- takes a per-owner transaction advisory lock;
- atomically inserts the immutable plan and children and advances the head;
- rejects stale expected revisions with SQLSTATE `PT409`, which PostgREST
  returns as HTTP 409 with error code `PT409`.

`public.is_valid_training_measurement(text, jsonb)` validates the five
sport-neutral measurement modes. It is immutable and security-invoker.

No existing row is rewritten by the migration. No seed data, remote data
migration, service-role client, secret, external call, view, trigger, storage
object, or Auth setting is added.

## Data API and repository access matrix

| Object | `anon` | `authenticated` |
|---|---|---|
| `personal_activities` | no privileges | owner-only `SELECT`, `INSERT`, `UPDATE`, and `DELETE` through explicit RLS |
| plan/version/head tables | no privileges | owner-only `SELECT`; no direct mutation |
| completion/version/head tables | no privileges | owner-only `SELECT`; no direct mutation |
| `save_manual_plan_version` | no execute | execute; function still derives and validates the caller |
| `is_valid_training_measurement` | no execute | execute for table-constraint validation |

The server repository exposes no HTTP route by itself. Its operations are:

- read the verified user's current plan head;
- save one validated manual plan through the atomic RPC;
- list active personal activities with an explicit owner filter;
- create/update/archive an owned personal activity; and
- delete an owned unreferenced personal activity, mapping FK failure to an
  archive-required error.

Only the `save_manual_plan_version` repository call uses `.retry(false)`.
`PT409` maps to `TrainingPlanConflictError`; every other RPC error remains a
generic persistence failure.

Completion insertion/correction is intentionally not exposed by the
repository in M1-01; M1-03 owns that separately approved write transaction.

## Tests added or changed

### Database

`m1_01_training_records.test.sql` contains 103 assertions. Together with the
41 retained M0 authorization assertions, the clean database suite runs 144
assertions. It covers:

- existence, required ownership columns, RLS, grants, policies, and hardened
  function ACL/search path;
- owner and cross-user CRUD behavior across all exposed training tables;
- anonymous and missing-identity denial;
- one-, two-, and seven-day plans plus zero, eight, null, out-of-range-date,
  fractional-position, malformed, and stale payload rejection;
- four immutable accepted plan versions, exact parent chain, current head, and
  no orphan version after failure;
- editable/archiveable personal definitions and immutable plan/completion
  snapshots;
- same-owner foreign keys and denial of archived/cross-owner references;
- separate planned, completed, and unplanned factual records;
- contiguous correction history and an exact completion head; and
- valid and unit-ambiguous examples for every measurement mode.

### Application

The two new Vitest files contain seven domain test declarations, including
parameterized cases, and six repository tests. The final full suite contains
17 files and 113 tests after the focused retry architecture assertion.

The local Data API integration test sends two RPC requests in one
`Promise.all` against the same authenticated user and expected revision. It
requires exactly one HTTP 200 success, one HTTP 409 / `PT409` conflict in under
five seconds, one stored `detailed_plan_versions` row, and one revision-one
`detailed_plan_heads` row pointing at the successful version.

## Commands and results

| Command | Result |
|---|---|
| `npm.cmd exec supabase -- --version` | PASS — exact-pinned Supabase CLI `2.109.1` |
| `docker version --format '{{.Server.Version}}'` | PASS — Docker `28.1.1` |
| `npm.cmd exec supabase -- db reset --local --no-seed` | PASS — recreated the database and applied all three migrations from zero |
| `npm.cmd exec supabase -- test db supabase/tests/database --local` | PASS — 2 files, 144 assertions |
| `npm.cmd exec supabase -- db lint --local --schema public --level warning --fail-on warning` | PASS — no schema errors |
| `npm.cmd exec supabase -- migration list --local` | PASS — local database contains `20260723084625`, `20260727082635`, and `20260728105226` |
| `npm.cmd exec supabase -- gen types typescript --local --schema public` | PASS — regenerated `database.types.ts` from the clean schema |
| `npm.cmd run test:m1-01-concurrency` | PASS — two simultaneous authenticated Data API requests produced one success, one HTTP 409 / `PT409` conflict in 44 ms, one plan version, and one revision-one head |
| `npm.cmd run test:run -- src/server/training/training-records.test.ts src/server/repositories/training-record-repository.test.ts src/architecture/server-boundary.test.ts` | PASS — 3 files, 29 tests |
| `npm.cmd run test:run` | PASS — 17 files, 113 tests |
| `npm.cmd run typecheck` | PASS |
| `npm.cmd run lint` | PASS |
| `npm.cmd run build` | PASS — Next.js production build and route generation completed without errors |
| targeted `npm.cmd exec prettier -- --check ...` | PASS — M1-01 TypeScript, generated types, and governing docs match Prettier |
| `git diff --check` plus an untracked-file trailing-whitespace scan | PASS — no whitespace error; Git emitted only existing LF/CRLF conversion warnings |

The initial inherited partial implementation also passed a clean reset, 120
database assertions, 28 focused Vitest tests, typecheck, and lint. The first
expanded pgTAP run exposed two expected-message mismatches and a nested
data-modifying CTE in the test harness. The builder moved numeric position
validation before integer conversion, replaced the invalid test query with
top-level `is_empty` statements, reran from a clean reset, and obtained the
final 144-assertion pass above.

## Builder evidence

- The checked-in schema types contain all eight tables, their composite
  relationships, generated predecessor columns, and both database functions.
- The fourth accepted plan retains the first three versions and its parent is
  exactly version three.
- Stale, archived-reference, malformed, and cross-owner saves leave the plan
  version count unchanged.
- Two simultaneous authenticated Data API saves from revision zero produce
  exactly one success and one prompt HTTP 409 / `PT409` conflict, with one
  version and one matching revision-one head.
- User B sees zero of every populated User A training-record type and cannot
  update or delete User A's personal definition.
- Anonymous roles have no CRUD privilege on any training table and cannot call
  the plan-save function.
- A completion and its activity snapshot remain independent from their source
  plan and editable personal definition.
- The full repository scan and build introduced no browser import of the
  server-only repository and no service-role or secret client.

## Known limitations

- M1-01 has no user-visible screen or mobile demo path. M1-02 through M1-04 own
  those separately approved flows, so a `390x844` product walkthrough is not
  applicable yet.
- Completion tables and correction constraints exist, but authenticated
  completion writes remain deliberately unavailable until M1-03 supplies its
  approved atomic repository operation.
- Database isolation remains primarily covered by Postgres role/JWT claims and
  object privileges. The focused local HTTP Data API test covers authenticated
  simultaneous plan saves, but not a second-user HTTP isolation matrix.
- The concurrency harness obtains the local stack's secret key dynamically
  from `supabase status` only to provision and remove its disposable confirmed
  Auth user. No key value is printed, persisted, committed, or used by
  application code.
- Local schema lint passed. Hosted security/performance advisors were not run
  because this migration was not applied remotely and no remote mutation was
  authorized.
- No migration, function, or generated type from this ticket has been deployed
  to founder staging.
- The original review occurred in a shared dirty worktree. Before committing,
  the lead backed up and removed the incomplete M1-02-only changes, committed
  the governing roadmap separately, and confirmed that no M1-02 UI or read
  model was present in the M1-01 implementation commit.

## Handoff boundary

## Independent re-review

The independent reviewer reconciled this manifest with the actual diff and
approved M1-01 for `testable` status on 28 July 2026. The reviewer independently
verified the concurrent Data API race, clean migration, 144 pgTAP assertions,
database lint, generated types, 113 Vitest tests, typecheck, ESLint, targeted
formatting, and `git diff --check`.

The reviewer confirmed one prompt HTTP 409 / `PT409` conflict and one success
under simultaneous saves, with exactly one resulting version and revision-one
head. The corrected RPC alone disables retries and maps the conflict to
`TrainingPlanConflictError`.

After the commit-process correction, the same independent reviewer inspected
exact commit `96c185a` and confirmed that it contains the previously approved
M1-01 implementation unchanged and no M1-02 UI/read-model work. Focused
validation passed again with 29 tests, and the reviewer reran TypeScript
checking under exact Node `24.18.0`.

After fast-forwarding the reviewed ticket branch to `master` at `b495829`, the
lead reran the complete Vitest suite under Node `24.18.0` (17 files, 113
tests), TypeScript checking, and ESLint. All passed.

One independent build rerun encountered an ignored `.next` OneDrive file lock
after the builder's corrected production build and the reviewer's earlier
production build had both passed. This is recorded as an environment
limitation, not a source failure.

The product owner accepted M1-01 on 28 July 2026. M1-02 may now use this
foundation under its separately approved scope. This acceptance authorizes no
hosted migration or M1-03 completion implementation.
