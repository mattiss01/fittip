# M3-10 validation record: rolling-plan foundation

**Ticket:**
[M3-10](../../backlog/M3/M3-10-ROLLING-PLAN-FOUNDATION.md)

**Lifecycle state:** in development

**Tier:** 1 — schema, authorization, RLS, privileged writes, and concurrency

**Product-owner approval:** 14 August 2026

**Branch:** `ticket/m3-10-rolling-plan-foundation`

**Implementation base:**
`ef1a0de4e0d4e8e5d2fe4d3d7a8ada056535dbb7`

**Exact implementation review target:**
`f15f53b7973f5c4251e9b5813dd2940567ef1bc9`

**Initial implementation commit:**
`7248ad3d5c5407066dc06c9bc573b9dd516b8927`

**Builder correction commits:**
`f15f53b7973f5c4251e9b5813dd2940567ef1bc9` - isolated CI invocation,
package-script wiring, and repeatable harness cleanup diagnostics

## Delivered behavior

The dormant foundation now stores one owner rolling plan with directly readable
one-off session/activity state, one monotonic revision, and append-only grouped
before/after history. A small `RollingPlan` interface exposes only bounded
`getPlanSlice` and atomic `applyChangeSet` operations. The in-memory and
Postgres adapters support add, edit, move, lock, and cancellation; cancellation
retains the stable session identity and its history.

There is no user-visible route or activated consumer. Existing bounded-plan
runtime behavior is unchanged.

## Mobile demo path

None for this ticket. M3-10 intentionally changes no visible Plan behavior.
The existing `390x844` CI flows must remain green as regression evidence.

## Changed files

`git diff --stat
ef1a0de4e0d4e8e5d2fe4d3d7a8ada056535dbb7..f15f53b7973f5c4251e9b5813dd2940567ef1bc9`:

```text
 .github/workflows/ci.yml                           |   3 +
 docs/backlog/M3/M3-10-ROLLING-PLAN-FOUNDATION.md   |  62 ++-
 docs/backlog/M3/M3-BACKLOG.md                      |   2 +-
 docs/validation/M3/M3-10-VALIDATION.md             |  90 ++++
 docs/validation/README.md                          |   2 +
 package.json                                       |   1 +
 src/lib/supabase/database.types.ts                 | 290 +++++++++-
 .../repositories/rolling-plan-repository.test.ts   | 184 +++++++
 src/server/repositories/rolling-plan-repository.ts | 218 ++++++++
 .../rolling-plan/in-memory-rolling-plan-adapter.ts | 142 +++++
 src/server/rolling-plan/rolling-plan.test.ts       | 133 +++++
 src/server/rolling-plan/rolling-plan.ts            | 384 +++++++++++++
 ...0260814164502_m3_10_rolling_plan_foundation.sql | 597 +++++++++++++++++++++
 .../m3_10_rolling_plan_foundation.test.sql         | 382 +++++++++++++
 .../m3_10_concurrent_rolling_plan_changes.mjs      | 192 +++++++
 15 files changed, 2673 insertions(+), 9 deletions(-)
```

Navigation notes:

- `rolling-plan.ts` owns the validation boundary and the two-operation public
  module interface; persistence and authorization mechanics are absent from it.
- `in-memory-rolling-plan-adapter.ts` is the transactional test adapter behind
  the same interface as Postgres.
- The concurrency harness uses two real requests at the same revision, verifies
  state/history/revision after every race, tests cross-owner denial, and fails
  if cleanup of either synthetic owner fails.
- `.github/workflows/ci.yml`, `package.json`, and the harness-only diagnostics
  are isolated in tooling commit `f15f53b`.

No file was deleted or renamed.

## Data, migration, API, privacy, and security effects

- One new forward migration creates `rolling_plans`, current session/activity
  tables, and append-only change-set/change-entry history. No existing table or
  row is changed, backfilled, synchronized, or deleted.
- Composite foreign keys enforce same-owner plan, session, activity, personal
  activity, change-set, and history relationships. Account teardown cascades
  owned history with its plan; authenticated application roles have no direct
  mutation privilege, so this cannot become an ordinary Plan deletion path.
- RLS is enabled on all five exposed owned tables. Authenticated owners receive
  direct `SELECT` only; anonymous and cross-owner access is denied. Direct
  application-role `INSERT`, `UPDATE`, and `DELETE` are revoked.
- `apply_rolling_plan_change_set(bigint, uuid, text, jsonb)` is the only write
  API. It derives `auth.uid()`, uses an empty `search_path`, a bounded owner
  advisory lock, expected-revision and idempotency checks, and one transaction
  for current state, immutable before/after history, and revision advancement.
  Anonymous and service-role execution are revoked; no service-role application
  client was added.
- Generated database types include the new tables, receipt composite, and RPC.
  The Postgres adapter rejects nullable or unknown generated receipt fields
  rather than coercing incomplete persistence results.
- No browser storage, route/API handler, external service, provider call, spend,
  old-data mutation, activation, or hosted command was introduced.

## Tests and final results

**Exact-commit CI:** pending lead push for
`f15f53b7973f5c4251e9b5813dd2940567ef1bc9`.

| Command or check | Result |
|---|---|
| README type-generation sequence after clean reset | PASS; generated types committed |
| `npx supabase db reset --local` | PASS; every migration applied from zero |
| focused pgTAP file | PASS; 56 assertions |
| `npm run test:m3-10-concurrency` twice consecutively | PASS; 12 genuine races per run, owner cleanup verified |
| `npx supabase db lint --local --level warning --fail-on warning` | PASS; no issues |
| `npx supabase db advisors --local --type all --level warn --fail-on warn` | PASS; no issues |
| `npm run typecheck` | PASS |
| focused Vitest module/repository files | PASS; 2 files, 10 tests |
| focused ESLint for new TypeScript/JavaScript | PASS |
| focused Prettier check for tooling files | PASS |
| `git diff --check` | PASS |
| Exact-SHA CI | Pending lead push; this is the full-suite evidence |
| Hosted Vercel Preview | Pending lead push and deployment |
| Founder migration/history/RLS verification | Pending independently reviewed commit |

The builder uses focused tests while implementing. The exact reviewed commit's
CI run is the recorded evidence for formatting, lint, TypeScript, Vitest, build,
clean migrations, database lint/advisors, pgTAP, concurrency, and browser flows.

## Known limitations

- The new model remains dormant; no application consumer may read or write it.
- No recurrence, saved-session library, Recovery day label, completion path,
  proposal behavior, AI call, migration of old data, activation, or cutover is
  part of M3-10.
- Builder work is local and branch-only. Hosted migration application and
  founder verification remain lead-owned gates after independent review.
- The builder deliberately did not run the complete application/browser suite;
  exact-commit CI after the lead push is the required full-suite evidence.

## Independent reviewer checklist

- Review the exact builder commit recorded above, not an uncommitted tree.
- Reconcile the complete manifest against `git diff
  ef1a0de4e0d4e8e5d2fe4d3d7a8ada056535dbb7..<review-target>` and report every
  omitted, unexpected, out-of-scope, or inaccurately described file.
- Apply `code-review` with separate Standards and Spec axes, using the M3-10
  Agent brief as the spec and the exact fixed point above.
- Confirm the module interface is small and both Postgres and in-memory adapters
  exercise the same behavior without leaking persistence mechanics to callers.
- Confirm ownership derives from verified Auth, direct mutation cannot bypass
  atomic history, and RLS/grants/same-owner constraints deny anonymous and
  cross-owner access.
- Confirm cancellation, rollback, idempotency, stale revision, and genuine
  same-revision concurrency preserve current state, history, and revision as one
  atomic unit.
- Confirm no legacy table/data, visible route, consumer, AI/provider path,
  remote resource, secret, or later F-005 slice changed.
- Use the exact-SHA CI run for automated suites; do not duplicate those suites
  during review. Judge the diff, authorization boundary, evidence honesty, and
  matching Vercel Preview.
