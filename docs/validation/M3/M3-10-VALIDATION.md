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
`397441459c0d6a84327ded9910e5926465fcb062`

**Final validation evidence head:** the evidence-only commit containing this
record follows the implementation target and is reported in the builder
handoff; it is excluded from the implementation diff and CI target under the
evidence-commit exception.

**Initial implementation commit:**
`7248ad3d5c5407066dc06c9bc573b9dd516b8927`

**Builder correction commits:**
`f15f53b7973f5c4251e9b5813dd2940567ef1bc9` - isolated CI invocation,
package-script wiring, and repeatable harness cleanup diagnostics

`eec6e3c461be6a73713c40cc4a03eedce335ef35` - add the approved rolling-plan
atomic RPC to the retry-disabled architecture allowlist after the first CI run
exposed the stale five-seam assertion

`3fbc42ddd5d0bd2c0a2954553a90a93679753948` - return each bounded slice from
one database snapshot, align grouped final-position semantics, and run one
shared module contract against memory and real local Postgres

`5044668a577af752e61db410411bd5af9cd9d5bd` - isolated CI and package wiring
for the real Postgres adapter contract

`397441459c0d6a84327ded9910e5926465fcb062` - remove lower ticket sections that
duplicated the approved Agent brief while retaining approval/audit context

## Delivered behavior

The dormant foundation now stores one owner rolling plan with directly readable
one-off session/activity state, one monotonic revision, and append-only grouped
before/after history. A small `RollingPlan` interface exposes only bounded
`getPlanSlice` and atomic `applyChangeSet` operations. The in-memory and
Postgres adapters support add, edit, move, lock, and cancellation; cancellation
retains the stable session identity and its history.

The Postgres adapter receives plan revision, bounded sessions, and their
activities from one stable SQL statement rather than composing REST snapshots.
Grouped position changes are validated at their final state, so swaps and an
add-before-move reorder behave identically through both adapters.

There is no user-visible route or activated consumer. Existing bounded-plan
runtime behavior is unchanged.

## Mobile demo path

None for this ticket. M3-10 intentionally changes no visible Plan behavior.
The existing `390x844` CI flows must remain green as regression evidence.

## Changed files

`git diff --stat
ef1a0de4e0d4e8e5d2fe4d3d7a8ada056535dbb7..397441459c0d6a84327ded9910e5926465fcb062`:

```text
 .github/workflows/ci.yml                           |   6 +
 docs/backlog/M3/M3-10-ROLLING-PLAN-FOUNDATION.md   | 154 ++---
 docs/backlog/M3/M3-BACKLOG.md                      |   2 +-
 docs/validation/M3/M3-10-VALIDATION.md             | 179 ++++++
 docs/validation/README.md                          |   2 +
 package.json                                       |   2 +
 src/architecture/server-boundary.test.ts           |  20 +-
 src/lib/supabase/database.types.ts                 | 308 ++++++++-
 .../repositories/rolling-plan-repository.test.ts   | 162 +++++
 src/server/repositories/rolling-plan-repository.ts | 239 +++++++
 .../rolling-plan/in-memory-rolling-plan-adapter.ts | 142 +++++
 src/server/rolling-plan/rolling-plan-contract.ts   | 261 ++++++++
 src/server/rolling-plan/rolling-plan.test.ts       |  29 +
 src/server/rolling-plan/rolling-plan.ts            | 382 ++++++++++++
 ...0260814164502_m3_10_rolling_plan_foundation.sql | 691 +++++++++++++++++++++
 .../m3_10_rolling_plan_foundation.test.sql         | 459 ++++++++++++++
 .../m3_10_concurrent_rolling_plan_changes.mjs      | 192 ++++++
 .../m3_10_rolling_plan_postgres.test.ts            |  73 +++
 18 files changed, 3201 insertions(+), 102 deletions(-)
```

Navigation notes:

- `rolling-plan.ts` owns the validation boundary and the two-operation public
  module interface; persistence and authorization mechanics are absent from it.
- `in-memory-rolling-plan-adapter.ts` is the transactional test adapter behind
  the same interface as Postgres.
- `rolling-plan-contract.ts` registers the identical observable behavior for
  both adapters, including swaps and add-before-move ordering.
- `m3_10_rolling_plan_postgres.test.ts` uses the local service credential only
  to create and remove disposable owners; every contract operation uses an
  authenticated user client through the Postgres adapter and module seam.
- The concurrency harness uses two real requests at the same revision, verifies
  state/history/revision after every race, tests cross-owner denial, and fails
  if cleanup of either synthetic owner fails.
- `.github/workflows/ci.yml`, `package.json`, and the harness-only diagnostics
  are isolated in tooling commit `f15f53b`.
- The additional real-adapter CI invocation and package wiring are isolated in
  tooling commit `5044668`.
- `server-boundary.test.ts` still rejects every unlisted retry-disabled seam and
  now verifies the rolling-plan repository contains exactly one such call on
  `apply_rolling_plan_change_set`.

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
- `get_rolling_plan_slice(date, date)` is a stable, security-invoker SQL
  function. One statement returns the owner plan revision and bounded
  session/activity JSON from one MVCC snapshot. It accepts no owner parameter,
  observes table RLS, and grants execution only to `authenticated`; `anon` and
  `service_role` execution are revoked.
- Active position uniqueness uses a generated nullable key and a deferrable
  unique constraint. The write transaction explicitly checks it after all
  subchanges, preserving strict final uniqueness and atomic validation while
  permitting collision-free final swaps and add-before-move reorders.
- `apply_rolling_plan_change_set(bigint, uuid, text, jsonb)` is the only write
  API. It derives `auth.uid()`, uses an empty `search_path`, a bounded owner
  advisory lock, expected-revision and idempotency checks, and one transaction
  for current state, immutable before/after history, and revision advancement.
  Anonymous and service-role execution are revoked; no service-role application
  client was added.
- Generated database types include both receipt composites and RPCs. The
  Postgres adapter rejects nullable or malformed generated receipts rather than
  coercing incomplete persistence results. Rolling-plan validation reuses the
  exported accepted `TRAINING_MEASUREMENT_MODES` constant rather than carrying
  a duplicate literal list.
- No browser storage, route/API handler, external service, provider call, spend,
  old-data mutation, activation, or hosted command was introduced.

## Tests and final results

**Exact-commit CI:**
[GitHub Actions run 31827450187](https://github.com/mattiss01/fittip/actions/runs/31827450187)
passed all three jobs for correction target
`397441459c0d6a84327ded9910e5926465fcb062`.

**Matching Vercel Preview:**
`https://fittip-e02cd3p91-mattis-3657s-projects.vercel.app` reached `READY` as
deployment `dpl_E4QyWr74CP4kGZmYCjNu6w1ygvjW`. Vercel reports Git source SHA
`397441459c0d6a84327ded9910e5926465fcb062`.

The prior exact-head run for evidence commit `ad3b8428` is
[GitHub Actions run 31824328268](https://github.com/mattiss01/fittip/actions/runs/31824328268).
It concluded `cancelled`: the database job passed, the static job failed only
because the architecture test discovered six `.retry(false)` repositories but
still allowlisted five, and the browser job was cancelled. Prettier, ESLint,
and TypeScript had passed; the build was skipped after Vitest.

The corrected evidence head `7d29e146a40d80abbe2a5e8965768a0a123e8c5c`
then passed all three jobs in
[GitHub Actions run 31824854143](https://github.com/mattiss01/fittip/actions/runs/31824854143).
Its matching Vercel Preview reached `READY` at
`https://fittip-4pis99ttx-mattis-3657s-projects.vercel.app`. These results
predate the snapshot/order/real-contract correction commits above; a new exact
target run and Preview are therefore pending.

The first focused pgTAP pass after drafting the deferred constraint failed
24 of 66 assertions because `SET CONSTRAINTS` could not resolve its unqualified
name under the required empty `search_path`. Qualifying the constraint with
`public`, then resetting from zero, produced the final 66-of-66 result below.

| Command or check | Result |
|---|---|
| README type-generation sequence after clean reset | PASS; generated types committed |
| `npx supabase db reset --local` | PASS; every migration applied from zero |
| focused pgTAP file | PASS; 66 assertions |
| `npm run test:m3-10-concurrency` | PASS; 12 genuine races, owner cleanup verified |
| `npx supabase db lint --local --level warning --fail-on warning` | PASS; no issues |
| `npx supabase db advisors --local --type all --level warn --fail-on warn` | PASS; no issues |
| `npm run typecheck` | PASS |
| focused Vitest module/repository files | PASS; 2 files, 12 tests; memory contract included |
| `npm run test:m3-10-adapter-contract` | PASS; the same 5-case contract through authenticated local Postgres |
| `npm run test:run -- src/architecture/server-boundary.test.ts` | PASS; 1 file, 5 tests |
| focused ESLint for new TypeScript/JavaScript | PASS |
| focused Prettier checks for all correction files | PASS |
| `git diff --check` | PASS |
| Exact-SHA CI | PASS; run 31827450187, all three jobs green for `397441459c0d6a84327ded9910e5926465fcb062` |
| Earlier Vercel Preview | READY at the URL above for `7d29e146`; superseded by corrections |
| Correction Vercel Preview | READY at `https://fittip-e02cd3p91-mattis-3657s-projects.vercel.app`; deployment Git SHA matches `397441459c0d6a84327ded9910e5926465fcb062` |
| Founder migration/history/RLS verification | Pending independently reviewed commit |

The builder uses focused tests while implementing. The exact reviewed commit's
CI run is the recorded evidence for formatting, lint, TypeScript, Vitest, build,
clean migrations, database lint/advisors, pgTAP, concurrency, and browser flows.

## Known limitations

- The new model remains dormant; no application consumer may read or write it.
- No recurrence, saved-session library, Recovery day label, completion path,
  proposal behavior, AI call, migration of old data, activation, or cutover is
  part of M3-10.
- The correction implementation target is pushed with the green run and READY
  Preview recorded above. Hosted migration application and founder verification
  remain lead-owned gates after independent review.
- The builder deliberately did not run the complete application/browser suite;
  exact-commit CI after the lead push is the required full-suite evidence.

## Independent reviewer checklist

- Review the exact builder commit recorded above, not an uncommitted tree.
- Reconcile the complete manifest against `git diff
  ef1a0de4e0d4e8e5d2fe4d3d7a8ada056535dbb7..397441459c0d6a84327ded9910e5926465fcb062`
  and report every omitted, unexpected, out-of-scope, or inaccurately
  described file. Treat the later validation-only head as evidence, not as an
  implementation target.
- Apply `code-review` with separate Standards and Spec axes, using the M3-10
  Agent brief as the spec and the exact fixed point above.
- Confirm the module interface is small and both Postgres and in-memory adapters
  pass the same interface contract without leaking persistence mechanics.
- Confirm the read adapter makes one state RPC and its stable invoker SQL
  function returns revision plus bounded sessions/activities from one snapshot,
  with RLS and no elevated execution.
- Confirm the deferred generated-key constraint remains strict at final state
  while swap and add-before-move groups match in-memory semantics.
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
