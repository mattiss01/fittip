# M3-14B validation: recurring series surface

**Status:** in development — Tier 2 builder handoff complete. Independent
review, exact-commit CI, Vercel Preview verification, hosted verification and
product-owner acceptance are pending.

**Tier:** 2 — this is the user-visible surface over M3-14's accepted schema,
authorization and recurrence operations. It adds no schema, migration, grant,
RLS policy, privileged function, external service or spend.

**Branch:** `ticket/m3-14b-recurring-series-surface`, from `master` at
`2e2c1be4cb44f9591a6d7e0219a7ded28de547e1`.

**Implementation review target:**
`0c59b6cd95ae051d0961a696d77b4fe63337d235`.

**Review range:**
`git diff 2e2c1be4cb44f9591a6d7e0219a7ded28de547e1..0c59b6cd95ae051d0961a696d77b4fe63337d235`.
The later validation-record commit contains this record, its index entry and
the local screenshot only; it is documentation/evidence under the
evidence-commit exception in `AGENTS.md` and does not change the reviewed
application or CI workflow.

| Commit | Purpose |
| --- | --- |
| `29c246965eb0c24278ab5acf8978bcdc34554d9d` | Owner-scoped reads, Server Actions, review-first recurrence builder, scoped Plan controls, materialization recovery and focused unit/component coverage. |
| `3da3fb02d70877ed8bf0ced93efcc85fddaca682` | Dedicated 390x844 production Playwright flow and a correction that keeps authoritative series-operation receipts visible after deleted cards leave the render tree. |
| `0c59b6cd95ae051d0961a696d77b4fe63337d235` | Separate CI/tooling commit adding the pinned M3-14B browser flow to the existing browser job. |

## Delivered behavior

- **One review-first creation path.** Repeat from either a current Plan session
  or a saved session opens `/home/plan/series/new`, copies the source by value,
  accepts daily intervals 1–365 or weekly intervals 1–52 with selected
  weekdays, and supports a bounded or open end. The first occurrences are
  reviewed before the Server Action writes anything. The Server Action rereads
  the selected owner source, so browser-supplied session content is not trusted.
- **Honest creation results.** A successful creation returns to the Plan with
  the series materialized. Cap collisions are reported afterward as the exact
  skipped dates returned by materialization; they do not prevent creation of
  the series.
- **Scoped changes.** “Only this session” uses the existing Plan edit path and
  leaves that occurrence visibly changed. “This and all future sessions” uses
  M3-14's split operation and leaves earlier, diverged, locked and completed
  history alone.
- **Scoped removal.** “Only this session” uses the existing Plan cancellation
  path. Before “this and all future sessions” the page states that the action
  is permanent, removes future unlocked occurrences including changed ones,
  keeps locked sessions and does not alter completed training. It shows no
  forecast count. After success, the shared Plan status region reports only
  the operation's authoritative unchanged-deleted, changed-deleted and
  locked-kept counts.
- **Bounded-segment safety.** The bulk future scopes are withheld when an
  occurrence lies past its segment end. The existing move surface now rereads
  the owner's segments and refuses any recurring occurrence placement before
  its segment start or after its segment end. No path branches on SQLSTATE or
  database error text.
- **Action-only materialization.** Materialization runs after successful Plan,
  saved-reuse and series Server Actions. On Plan visits a small client trigger
  invokes a Server Action once only when the rendered window is incomplete.
  Render, GET and prefetch paths remain read-only. Pending, slow, unconfirmed,
  recovered, offline and skipped-date states use accessible status copy.
- **Existing design language.** The new surfaces use the current cream,
  deep-green, ledger-card and day-rail system, retain visible keyboard focus
  and reduced-motion behavior, and introduce no new visual direction.

## Mobile demo path

Use the exact Preview supplied by the lead after push, at a 390x844 viewport:

1. Sign in, confirm an owner time zone, open `/home/plan`, add a session and
   select **Repeat**.
2. Create a bounded daily rule, review its first occurrences, then create it.
3. Change the first occurrence with **Only this session**, then change a later
   one with **This and all future sessions**.
4. Open **Remove recurring session** on a later occurrence. Confirm the
   consequence copy carries no projected count, perform the future removal,
   and check the exact returned count receipt in the Plan status region.
5. Open `/home/plan/saved`, repeat a saved session as an open weekly rule, and
   confirm any cap collision is reported after creation.

Local visual evidence:
[M3-14B 390x844 production flow](evidence/M3-14B-390x844.png). The screenshot is
full-page while the Playwright context itself is pinned to 390x844. The product
owner's acceptance surface remains the exact Vercel Preview, not this image.

## Changed files

Exact implementation stat, `git diff --stat
2e2c1be4cb44f9591a6d7e0219a7ded28de547e1..0c59b6cd95ae051d0961a696d77b4fe63337d235`:

```text
 .github/workflows/ci.yml                           |  10 +
 e2e/m3-14b-recurring-series.spec.ts                | 447 +++++++++++++++++++
 e2e/m3-14b.playwright.config.ts                    |  17 +
 src/app/home/plan/actions.test.ts                  |   5 +
 src/app/home/plan/actions.ts                       |  45 +-
 src/app/home/plan/page.tsx                         |  42 +-
 src/app/home/plan/plan-manager.test.tsx            |  88 ++++
 src/app/home/plan/plan-manager.tsx                 | 306 +++++++++----
 src/app/home/plan/plan.module.css                  | 313 +++++++++++++
 src/app/home/plan/recurrence-fields.tsx            | 126 ++++++
 src/app/home/plan/recurring-session-controls.tsx   | 246 +++++++++++
 src/app/home/plan/saved/actions.ts                 |  11 +-
 src/app/home/plan/saved/saved-library.tsx          |  10 +
 src/app/home/plan/saved/saved.module.css           |  18 +
 src/app/home/plan/series-action-state.ts           |  50 +++
 src/app/home/plan/series-actions.test.ts           | 336 ++++++++++++++
 src/app/home/plan/series-actions.ts                | 487 +++++++++++++++++++++
 src/app/home/plan/series-materialization.ts        |  40 ++
 src/app/home/plan/series-materializer.tsx          | 132 ++++++
 src/app/home/plan/series-recurrence.test.ts        |  66 +++
 src/app/home/plan/series-recurrence.ts             | 119 +++++
 src/app/home/plan/series-transition-watch.ts       | 125 ++++++
 src/app/home/plan/series/new/page.tsx              | 191 ++++++++
 src/app/home/plan/series/new/series-builder.tsx    | 286 ++++++++++++
 src/app/home/plan/session-fields.tsx               |  67 +++
 .../repositories/rolling-plan-repository.test.ts   |  63 +++
 src/server/repositories/rolling-plan-repository.ts | 130 ++++++
 .../rolling-plan/in-memory-rolling-plan-adapter.ts |  10 +
 src/server/rolling-plan/rolling-plan.ts            |  11 +
 src/server/saved-sessions/session-copy.ts          |  32 ++
 30 files changed, 3742 insertions(+), 87 deletions(-)
```

Files whose purpose is not evident from path and diff:

- `src/app/home/plan/actions.ts` validates recurring moves against the current
  owner segment and tops up only after an accepted Plan mutation.
- `src/app/home/plan/saved/actions.ts` tops up after a saved-session reuse so
  that action and the generic Plan action have the same recurrence behavior.
- `src/app/home/plan/series-materialization.ts` is the shared Server-Action-only
  top-up helper; no page or GET imports it to perform a write.
- `src/app/home/plan/series-transition-watch.ts` is the deliberately separate
  fifth transition-recovery copy required by the approved brief; this ticket
  does not consolidate the existing four copies.
- `src/server/saved-sessions/session-copy.ts` adds the Plan-session-to-series
  copy boundary and strips dated identity, row identity, lock and cancellation
  state while preserving session content by value.
- `src/server/repositories/rolling-plan-repository.ts` implements the accepted
  owner-scoped select for series and parses its nested activity values; it adds
  no mutation path.
- `src/server/rolling-plan/in-memory-rolling-plan-adapter.ts` and
  `src/server/rolling-plan/rolling-plan.ts` expose the same series read through
  the existing domain seam for application and focused tests.
- `.github/workflows/ci.yml` is the separately committed tooling change that
  runs this ticket's pinned browser config on port 3022.

Nothing was deleted or renamed. The screenshot, this record and the validation
index are evidence-only additions after the implementation review target.

## Data, API, privacy and security effects

**Schema and authorization:** none. No migration, generated database type,
grant, RLS policy, privileged function or role changed. The surface uses
M3-14's accepted `apply_rolling_plan_change_set` and
`materialize_rolling_plan_series` RPCs. Series are read through the accepted
authenticated `select` grant, with both RLS and an explicit `user_id` predicate
after verified-user authentication.

**API:** authenticated Server Actions are the only mutation entrypoints. They
accept source identifiers, recurrence fields, operation scope and optimistic
revision values; they reread the owner source and segment before composing the
existing domain operation. No route handler, public API, provider call or
client-side database mutation was added.

**Data:** creation and materialization add only the existing M3-14 series,
series-activity and occurrence records. Edits, splits and ending operations use
the already accepted permanent history semantics. The surface creates no
parallel plan, proposal or completion record and cannot rewrite completed
history.

**Privacy and cost:** the browser receives only the signed-in owner's Plan,
saved-session and series values needed by these screens. Server-only imports do
not cross into client modules, no service-role credential enters application
code, and no external service, AI call, package or spend was introduced. The
Playwright service-role key is confined to local test setup/cleanup for one
disposable account.

## Tests and builder results

No CI run or Vercel Preview exists yet; neither is claimed. The lead owns push,
exact-SHA CI, Preview readiness and hosted gates.

| Command or check | Result |
| --- | --- |
| `npm.cmd run test:run -- src/architecture/server-boundary.test.ts src/app/home/plan/series-recurrence.test.ts src/app/home/plan/series-actions.test.ts src/app/home/plan/actions.test.ts src/app/home/plan/plan-manager.test.tsx src/server/repositories/rolling-plan-repository.test.ts src/server/rolling-plan/rolling-plan.test.ts src/server/saved-sessions/session-copy.test.ts` | PASS — 8 files, 77 tests |
| `npx.cmd eslint src/app/home/plan/plan-manager.tsx src/app/home/plan/recurring-session-controls.tsx e2e/m3-14b-recurring-series.spec.ts e2e/m3-14b.playwright.config.ts` | PASS |
| `npm.cmd run typecheck` | PASS |
| `npm.cmd run build` | PASS — Next.js 16.2.11 production build, including dynamic `/home/plan/series/new` |
| local Supabase production build/start plus `npx.cmd playwright test --config=e2e/m3-14b.playwright.config.ts --workers=1 --trace=retain-on-failure --output=test-results/m3-14b-local` | PASS — 1 test, 9.8 seconds test time / 11.4 seconds run; disposable local user deleted in `finally` |
| Playwright assertions beyond behavior | PASS — 390x844 viewport, private/no-store Plan headers, no horizontal overflow, no page or console error, offline and invalid-source recovery surfaces |
| `npx.cmd prettier --check .github/workflows/ci.yml` | PASS after formatting |
| `git diff --check` | PASS |

The builder deliberately did not run the complete local suite merely to create
evidence. CI will run it after the lead pushes the exact branch head.

## Vercel React rules checked

- `server-auth-actions`: every series mutation and materialization entrypoint
  is an authenticated Server Action and owner values are reread server-side.
- `server-no-shared-module-state` and request isolation: no owner, repository,
  revision or action result is cached in module state.
- `server-serialization`: client props contain only the Plan/series values and
  actions required by the visible controls; repositories and Supabase clients
  stay server-side.
- `server-parallel-fetching`: independent owner reads on the Plan page are
  started together rather than added as a serial waterfall.
- Client modules import no server repository or Supabase module. Imports remain
  direct and the new controls add no package or broad client dependency.

## Known limitations and remaining gates

1. Activity rows remain fixture-backed and read-only, as approved; this ticket
   adds no activity editor or global activity library.
2. The fifth transition-recovery copy is intentionally recorded rather than
   consolidated. A broader recovery refactor is outside M3-14B.
3. A full-page evidence image is long because the flow intentionally leaves a
   dense 14-day Plan, including a synthetic ten-session cap date. The pinned
   viewport and overflow assertion passed; visual acceptance still belongs to
   the 390x844 Vercel Preview.
4. Exact-commit CI, distinct independent review, Preview readiness, hosted
   verification and product-owner acceptance are pending. No hosted database
   or deployment was touched by the builder.

## Independent reviewer focus

Review exact commit `0c59b6cd95ae051d0961a696d77b4fe63337d235`
over range `2e2c1be4cb44f9591a6d7e0219a7ded28de547e1..0c59b6cd95ae051d0961a696d77b4fe63337d235`.
Use the Git diff as the source of truth and confirm the matching CI run is green
for that exact application/tooling result; do not rerun suites CI already ran.

Human judgment should concentrate on: owner-source rereads and explicit
ownership predicates; the absence of render/GET/prefetch writes; move and bulk
scope withholding at segment bounds; permanent-removal copy before the action
and authoritative counts only after it; preservation of earlier, diverged,
locked and completed records; minimal client serialization and server/client
boundaries; honest pending/offline/recovery states; and the 390x844 Preview's
spacing, focus, touch and serious-coach tone.
