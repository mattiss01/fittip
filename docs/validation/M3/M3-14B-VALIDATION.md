# M3-14B validation: recurring series surface

**Status:** in development — test-only CI correction complete locally at
`235fdea2ab43d929ccb8ddd80626dff149edef22`. CI run
[32392022206](https://github.com/mattiss01/fittip/actions/runs/32392022206)
and Vercel deployment `dpl_Br6gMKzT1DseDVzaMrgWrgswfft6` failed TypeScript
on evidence head `91de7c4`; a fresh exact-SHA CI run, Preview and independent
review are required.

**Tier:** 2 — this is the user-visible surface over M3-14's accepted schema,
authorization and recurrence operations. It adds no schema, migration, grant,
RLS policy, privileged function, external service or spend.

**Branch:** `ticket/m3-14b-recurring-series-surface`, from `master` at
`2e2c1be4cb44f9591a6d7e0219a7ded28de547e1`.

**Implementation review target:**
`235fdea2ab43d929ccb8ddd80626dff149edef22`.

**Review range:**
`git diff 2e2c1be4cb44f9591a6d7e0219a7ded28de547e1..235fdea2ab43d929ccb8ddd80626dff149edef22`.
The validation-record commits contain this record, its index entry and the
local screenshot only; they are documentation/evidence under the
evidence-commit exception in `AGENTS.md` and do not change the application or
CI workflow.

| Commit | Purpose |
| --- | --- |
| `29c246965eb0c24278ab5acf8978bcdc34554d9d` | Owner-scoped reads, Server Actions, review-first recurrence builder, scoped Plan controls, materialization recovery and focused unit/component coverage. |
| `3da3fb02d70877ed8bf0ced93efcc85fddaca682` | Dedicated 390x844 production Playwright flow and a correction that keeps authoritative series-operation receipts visible after deleted cards leave the render tree. |
| `0c59b6cd95ae051d0961a696d77b4fe63337d235` | Separate CI/tooling commit adding the pinned M3-14B browser flow to the existing browser job. |
| `3ffdfba063b17c0beaa6d8aaca4274d8a788a08b` | Evidence-only builder validation record, index entry and local screenshot. |
| `6939857370286f5aa82f4d74e4d88a34b6ba2dd8` | Prettier-only correction to `series-actions.test.ts` after the first exact-branch-head CI run failed formatting. |
| `1372501341ee17cfc52aa6414520d75c8d8d9913` | Evidence-only update recording the formatting correction and its failed predecessor run. |
| `09d6e223c96058dc928d91ac5ebb619475c48c68` | Refreshes the saved-session reuse test fixture with the materialization receipt and method added by M3-14B; application behavior is unchanged. |
| `0796a53e36b9bfd71fa354cd9a161596d620e280` | Evidence-only head for implementation `09d6e223`; records its green CI and READY Preview under the evidence-commit exception. |
| `a87a7df617bf9703367b6dbcedae111e71bf10db` | Corrects cross-channel Plan feedback ordering and recovered idle materialization copy, with component regressions for both review findings. |
| `5f60b7055bf8b73ebf459f9db0ae4d66bc1cb537` | Evidence-only head for corrected implementation `a87a7df`; records the rejected target and correction handoff before the corrected CI and re-review completed. |
| `bf4c2a20e27568fe863e09b3e38860871f7fdcfe` | Evidence-only record of the corrected CI, Preview and remaining hosted-review gate for the superseded creation model. |
| `dd1a0f32d6fef596d365c1a11bce00f864173b1a` | Approved governance correction replacing source-session Repeat with one Plan-level Create session contract. |
| `243b3a0f950e59253c002438b5356ed6754712ef` | Revised implementation and tests: unified single/recurring creation, limited card controls, nested session editors, removed recurrence shortcuts and updated mobile flows. |
| `91de7c49984e90b71c3342f6e90b23467a03101e` | Evidence-only builder handoff for `243b3a0`; its CI and Vercel deployment both failed the same four test-code TypeScript errors. |
| `235fdea2ab43d929ccb8ddd80626dff149edef22` | Test-only correction preserving locator and assertion semantics while supplying the Locator and HTMLElement types TypeScript requires. |

## Delivered behavior

- **One Plan-level creation path.** The empty and populated Plan expose exactly
  one **Create session** entry. It selects the owner-local date and ordinary
  session fields first. With **Repeat this session** off, it uses M3-12's
  owner-scoped add. With it on, it reveals daily intervals 1–365 or weekly
  intervals 1–52 with selected weekdays and a bounded or open end. The first
  occurrences are reviewed before the existing M3-14 `add_series` operation
  writes anything. New sessions have no activities because the approved Plan
  surface has no activity editor.
- **No recurrence shortcuts.** Plan cards and saved-library entries no longer
  offer **Repeat**. `/home/plan/series/new` redirects to the unified Plan flow.
  Existing saved-session **Use in plan** remains ordinary M3-13 copy behavior.
- **Card action boundary.** A Plan session card exposes only **Edit**,
  **Remove**, and **Lock** or **Unlock**, plus informational recurring, changed
  and locked markers. Session saving, move, duplicate, library save,
  consequence copy and both recurrence scopes live inside Edit or Remove.
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
  recovered, offline and skipped-date states use accessible status copy. A
  recovered receipt takes precedence over idle extension copy when no dates
  remain uncovered.
- **Latest-action feedback.** The shared visible and polite-live Plan status
  keeps an authoritative future-removal receipt after its source cards unmount,
  then yields to a newer ordinary Plan submission and its returned feedback.
- **Existing design language.** The revised surface uses the current cream,
  deep-green, ledger-card and day-rail system, retain visible keyboard focus
  and reduced-motion behavior, and introduce no new visual direction.

## Mobile demo path

Use the exact Preview supplied by the lead after push, at a 390x844 viewport:

1. Sign in, confirm an owner time zone and open `/home/plan`. Confirm the empty
   Plan has one **Create session** entry and no per-date create controls.
2. Create one ordinary session with **Repeat this session** off. Open **Edit**
   to save it to the library, then confirm saved **Use in plan** remains
   ordinary reuse and has no **Repeat** shortcut.
3. Use **Create session** again, enable recurrence, create a bounded daily rule,
   review its first occurrences, then create it.
4. Open **Edit** on the first occurrence and use **Only this session**, then
   change a later one with **This and all future sessions**.
5. Open **Remove** on a later occurrence. Confirm the
   consequence copy carries no projected count, perform the future removal,
   and check the exact returned count receipt in the Plan status region.
6. Create an open weekly rule through the same Plan entry and confirm any cap
   collision is reported after creation.

Local visual evidence:
[M3-14B 390x844 production flow](evidence/M3-14B-390x844.png). The screenshot is
full-page while the Playwright context itself is pinned to 390x844. The product
owner's acceptance surface remains the exact Vercel Preview, not this image.

## Changed files

Exact review-range stat, `git diff --stat
2e2c1be4cb44f9591a6d7e0219a7ded28de547e1..235fdea2ab43d929ccb8ddd80626dff149edef22`:

```text
 .github/workflows/ci.yml                           |  10 +
 docs/backlog/M3/M3-14B-RECURRING-SERIES-SURFACE.md | 108 ++--
 docs/product/F-005-ROLLING-TRAINING-PLAN.md        |  17 +-
 docs/validation/M3/M3-14B-VALIDATION.md            | 419 +++++++++++++++
 docs/validation/M3/evidence/M3-14B-390x844.png     | Bin 0 -> 149931 bytes
 docs/validation/README.md                          |   6 +
 e2e/m3-12-plan.spec.ts                             |  48 +-
 e2e/m3-13-saved-sessions.spec.ts                   |   1 +
 e2e/m3-14b-recurring-series.spec.ts                | 482 +++++++++++++++++
 e2e/m3-14b.playwright.config.ts                    |  17 +
 src/app/home/plan/actions.test.ts                  |   5 +
 src/app/home/plan/actions.ts                       |  45 +-
 src/app/home/plan/create-session.tsx               | 285 ++++++++++
 src/app/home/plan/page.tsx                         |  42 +-
 src/app/home/plan/plan-manager.test.tsx            | 301 ++++++++++-
 src/app/home/plan/plan-manager.tsx                 | 571 +++++++++++++--------
 src/app/home/plan/plan.module.css                  | 383 ++++++++++++++
 src/app/home/plan/recurrence-fields.tsx            | 126 +++++
 src/app/home/plan/recurring-session-controls.tsx   | 248 +++++++++
 src/app/home/plan/saved/actions.test.ts            |  12 +-
 src/app/home/plan/saved/actions.ts                 |  11 +-
 src/app/home/plan/saved/saved-library.test.tsx     |   1 +
 src/app/home/plan/saved/saved.module.css           |  18 +
 src/app/home/plan/series-action-state.ts           |  50 ++
 src/app/home/plan/series-actions.test.ts           | 387 ++++++++++++++
 src/app/home/plan/series-actions.ts                | 493 ++++++++++++++++++
 src/app/home/plan/series-materialization.ts        |  40 ++
 src/app/home/plan/series-materializer.test.tsx     |  50 ++
 src/app/home/plan/series-materializer.tsx          | 132 +++++
 src/app/home/plan/series-recurrence.test.ts        |  66 +++
 src/app/home/plan/series-recurrence.ts             | 119 +++++
 src/app/home/plan/series-transition-watch.ts       | 125 +++++
 src/app/home/plan/series/new/page.tsx              |   8 +
 src/app/home/plan/series/new/series-builder.tsx    | 286 +++++++++++
 src/app/home/plan/session-fields.tsx               |  67 +++
 .../repositories/rolling-plan-repository.test.ts   |  63 +++
 src/server/repositories/rolling-plan-repository.ts | 130 +++++
 .../rolling-plan/in-memory-rolling-plan-adapter.ts |  10 +
 src/server/rolling-plan/rolling-plan.ts            |  11 +
 src/server/saved-sessions/session-copy.ts          |  32 ++
 40 files changed, 4909 insertions(+), 316 deletions(-)
```

Initial revised-contract implementation stat, `git diff --stat
dd1a0f32d6fef596d365c1a11bce00f864173b1a..243b3a0f950e59253c002438b5356ed6754712ef`:

```text
 e2e/m3-12-plan.spec.ts                           |  48 ++-
 e2e/m3-13-saved-sessions.spec.ts                 |   1 +
 e2e/m3-14b-recurring-series.spec.ts              | 131 ++++---
 src/app/home/plan/create-session.tsx             | 285 ++++++++++++++
 src/app/home/plan/plan-manager.test.tsx          | 121 ++++--
 src/app/home/plan/plan-manager.tsx               | 457 ++++++++++-------------
 src/app/home/plan/plan.module.css                |  70 ++++
 src/app/home/plan/recurring-session-controls.tsx | 104 +++---
 src/app/home/plan/saved/saved-library.test.tsx   |   1 +
 src/app/home/plan/saved/saved-library.tsx        |  10 -
 src/app/home/plan/series-actions.test.ts         |  53 +++
 src/app/home/plan/series-actions.ts              |   6 +
 src/app/home/plan/series/new/page.tsx            | 189 +---------
 13 files changed, 879 insertions(+), 597 deletions(-)
```

CI type-correction stat, `git diff --stat
91de7c49984e90b71c3342f6e90b23467a03101e..235fdea2ab43d929ccb8ddd80626dff149edef22`:

```text
 e2e/m3-14b-recurring-series.spec.ts     | 6 +++---
 src/app/home/plan/plan-manager.test.tsx | 4 +++-
 2 files changed, 6 insertions(+), 4 deletions(-)
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
- `src/app/home/plan/create-session.tsx` owns the one Plan-level form, switches
  between the existing ordinary and series Server Actions, and requires an
  occurrence review before recurring submission.
- `src/app/home/plan/plan-manager.tsx` removes per-date creation and card
  shortcuts, then nests existing move, duplicate, library-save and recurrence
  operations under the two session editors.
- `src/app/home/plan/series-actions.ts` accepts validated new session content as
  an activity-free source for the accepted `add_series` operation; plan and
  saved source-copy branches remain unchanged internally.
- `src/app/home/plan/series/new/page.tsx` redirects the superseded standalone
  creation URL to the unified Plan surface.
- `e2e/m3-12-plan.spec.ts` and `e2e/m3-13-saved-sessions.spec.ts` follow the
  revised control nesting while preserving those tickets' existing behavior.

Nothing was deleted or renamed. The screenshot, this record and the validation
index are evidence-only additions inside the review range; they do not change
application behavior or CI.

## Data, API, privacy and security effects

**Schema and authorization:** none. No migration, generated database type,
grant, RLS policy, privileged function or role changed. The surface uses
M3-14's accepted `apply_rolling_plan_change_set` and
`materialize_rolling_plan_series` RPCs. Series are read through the accepted
authenticated `select` grant, with both RLS and an explicit `user_id` predicate
after verified-user authentication.

**API:** authenticated Server Actions are the only mutation entrypoints. They
accept validated new-session content or retained internal source identifiers,
recurrence fields, operation scope and optimistic revision values; they reread
the owner Plan, source and segment as applicable before composing the existing
domain operation. No route handler, public API, provider call or client-side
database mutation was added.

**Data:** creation and materialization add only the existing M3-14 series,
series-activity and occurrence records. Edits, splits and ending operations use
the already accepted permanent history semantics. The surface creates no
parallel plan, proposal or completion record and cannot rewrite completed
history.

**Privacy and cost:** the browser receives only the signed-in owner's Plan,
saved-session and series values needed by these screens. Server-only imports do
not cross into client modules, no service-role credential enters application
code, and no external service, AI call, package or spend was introduced. The
Playwright service-role key is confined to local test setup/cleanup for each
disposable account.

## Tests and builder results

Exact evidence-head CI run
[32392022206](https://github.com/mattiss01/fittip/actions/runs/32392022206)
for `91de7c49984e90b71c3342f6e90b23467a03101e` failed TypeScript before Vitest,
the production build and browser flow could run. Its matching Vercel deployment
`dpl_Br6gMKzT1DseDVzaMrgWrgswfft6` failed on the same compilation step. The
four errors were test code only: three Plan-root calls passed `Page` to a
helper intentionally typed for `Locator`, and one DOM query inferred `Element`
where `toContainElement` requires `HTMLElement | SVGElement | null`.

Correction `235fdea2ab43d929ccb8ddd80626dff149edef22` scopes those three calls through
`page.locator("body")` and types the existing action-area query as
`HTMLElement`. It does not change locator meaning, assertion strength, runtime
code or user behavior. The lead must push it and record fresh exact-SHA CI and
Preview evidence before re-review.

| Revised-contract command or check | Result |
| --- | --- |
| `npm.cmd run test:run -- src/architecture/server-boundary.test.ts src/app/home/plan/actions.test.ts src/app/home/plan/plan-manager.test.tsx src/app/home/plan/series-actions.test.ts src/app/home/plan/series-recurrence.test.ts src/app/home/plan/saved/actions.test.ts src/app/home/plan/saved/saved-library.test.tsx` | PASS — 7 files, 52 tests before the final create-reset hardening |
| exact final `npm.cmd run test:run -- src/app/home/plan/plan-manager.test.tsx src/app/home/plan/series-actions.test.ts` | PASS — 2 files, 17 tests after the final create-reset hardening |
| changed-file `npx.cmd eslint` for the revised Plan, saved-library and three affected Playwright files | PASS — after replacing one effect-driven preview reset with response-versioned derived state |
| `npx.cmd playwright test --config=e2e/m3-14b.playwright.config.ts --list` | PASS — exactly one pinned M3-14B mobile test |
| `npm.cmd run build` | PASS — Next.js 16.2.11 production build and TypeScript, including dynamic redirect route `/home/plan/series/new` |
| local Supabase production start plus `npx.cmd playwright test --config=e2e/m3-14b.playwright.config.ts --workers=1 --trace=retain-on-failure --output=test-results/m3-14b-revised-local` | PASS — exact implementation `243b3a0`, 1 test, 15.2 seconds test / 16.5 seconds total at exactly 390x844 |
| revised Playwright assertions beyond behavior | PASS — private/no-store headers, no horizontal overflow, no page or console error, offline notice, legacy-route redirect and disposable-user cleanup |
| manual inspection of `evidence/M3-14B-390x844.png` | PASS — single Plan create card and Edit/Remove/Lock card controls are legible in the existing ledger/day-rail system; the full-page image remains long because it includes the deliberate ten-session cap fixture |
| first revised Playwright attempt | FAIL — singular text counted the Create summary and its hidden submit button; the assertion was narrowed to the Plan-level summary |
| second revised Playwright attempt | FAIL — saved-reuse success is intentionally in the library's shared status region rather than the entry card; the assertion now follows the accepted M3-13 surface |
| third revised Playwright attempt | FAIL — non-exact `Repeat` matched both the opt-in checkbox and frequency select; the frequency selectors now use exact labels |
| `git diff --check` | PASS |

Focused correction checks:

| Correction command or check | Result |
| --- | --- |
| `npm.cmd run typecheck` | PASS |
| `npm.cmd run test:run -- src/app/home/plan/plan-manager.test.tsx` | PASS — 1 file, 11 tests |
| `npx.cmd playwright test --config=e2e/m3-14b.playwright.config.ts --list` | PASS — exactly one pinned M3-14B mobile test |
| `npx.cmd prettier --check e2e/m3-14b-recurring-series.spec.ts src/app/home/plan/plan-manager.test.tsx` | PASS |
| `git diff --check` | PASS |

The correction changes only compile-time types around unchanged test queries,
so the production E2E was not rerun. The last production E2E remains behavioral
evidence for implementation `243b3a0`; fresh CI must compile and run the same
pinned flow for corrected target `235fdea`.

The three failed browser attempts reached only selector assertions; each
disposable local user was deleted by the test's `finally` cleanup. The final
run exercised single and recurring creation, saved reuse, card action limits,
both recurrence scopes, authoritative removal counts, cap skips and recovery
states. The builder deliberately did not run the complete local suite; CI owns
that gate after the lead pushes.

Historical evidence for the superseded existing-session Repeat model follows.
It does not validate the revised implementation:

The exact branch-head CI run
[32360915486](https://github.com/mattiss01/fittip/actions/runs/32360915486)
for `3ffdfba063b17c0beaa6d8aaca4274d8a788a08b` failed only at Prettier. Its job
log named `src/app/home/plan/series-actions.test.ts`. Commit
`6939857370286f5aa82f4d74e4d88a34b6ba2dd8` formats only that file. The
sequential ESLint, TypeScript, Vitest and production-build steps were skipped;
the browser and database jobs passed.

The next exact branch-head CI run
[32361390209](https://github.com/mattiss01/fittip/actions/runs/32361390209)
for `1372501341ee17cfc52aa6414520d75c8d8d9913` passed Prettier, ESLint and
TypeScript, then failed one Vitest assertion in
`src/app/home/plan/saved/actions.test.ts`. The implementation correctly topped
up recurring sessions after reuse, but that pre-M3-14B test fixture returned no
`planRevision` and supplied no `materializeSeries` method. The shared recovery
copy therefore honestly appended that recurring sessions could not be
extended. Commit `09d6e223c96058dc928d91ac5ebb619475c48c68`
updates only the fixture and asserts that the applied revision reaches
materialization. The production-build step was skipped after Vitest failed;
the browser and database jobs passed.

[CI run 32362050214, attempt
2](https://github.com/mattiss01/fittip/actions/runs/32362050214) is green on
evidence head `0796a53e36b9bfd71fa354cd9a161596d620e280`. That head changes only this
validation record relative to implementation
`09d6e223c96058dc928d91ac5ebb619475c48c68`, so the evidence-commit exception
applies. Its exact Vercel Preview reached `READY` at
<https://fittip-er8ro3ndm-mattis-3657s-projects.vercel.app>. The independent
reviewer could not perform an authenticated hosted browser pass because the
Preview redirected to Vercel SSO.

Independent review rejected `09d6e223c96058dc928d91ac5ebb619475c48c68`:
the retained series receipt masked feedback from every newer ordinary Plan
action, and a recovered idle materialization with no uncovered dates displayed
permanent false pending copy. Correction
`a87a7df617bf9703367b6dbcedae111e71bf10db` addresses both findings. It
invalidates the earlier review target, CI evidence and Preview for acceptance;
the lead owns push, new exact-SHA CI and the matching Preview.

[CI run 32365738735](https://github.com/mattiss01/fittip/actions/runs/32365738735)
is green across formatting, ESLint, TypeScript, 764 Vitest tests, the production
build, migrations from zero, database lint, security and performance advisors,
pgTAP, concurrency harnesses and all pinned 390px production browser flows. Its
head is evidence-only commit `5f60b7055bf8b73ebf459f9db0ae4d66bc1cb537`
over implementation `a87a7df617bf9703367b6dbcedae111e71bf10db`, so the
evidence-commit exception applies. The exact matching Vercel Preview reached
`READY` at <https://fittip-r3il6m0oj-mattis-3657s-projects.vercel.app>.

Fresh independent re-review found both rejected feedback-state defects fixed,
reconciled the full 35-file manifest, found no new implementation, security or
scope issue, and confirmed the exact-head CI plus matching deployment. Approval
is nevertheless withheld: desktop Chrome could pass Vercel protection, but the
exact Preview redirected `/home/plan` to FitTip's sign-in surface because that
browser has no authenticated FitTip application session. The only authenticated
Plan tab belonged to a different M3-13 deployment and was not accepted as
evidence. The desktop provider also reports no resize capability, so neither
`/home/plan` nor `/home/plan/series/new` received an authenticated exact-Preview
390x844 inspection.

| Command or check | Result |
| --- | --- |
| `npm.cmd run test:run -- src/architecture/server-boundary.test.ts src/app/home/plan/series-recurrence.test.ts src/app/home/plan/series-actions.test.ts src/app/home/plan/actions.test.ts src/app/home/plan/plan-manager.test.tsx src/server/repositories/rolling-plan-repository.test.ts src/server/rolling-plan/rolling-plan.test.ts src/server/saved-sessions/session-copy.test.ts` | PASS — 8 files, 77 tests |
| `npx.cmd eslint src/app/home/plan/plan-manager.tsx src/app/home/plan/recurring-session-controls.tsx e2e/m3-14b-recurring-series.spec.ts e2e/m3-14b.playwright.config.ts` | PASS |
| `npm.cmd run typecheck` | PASS |
| `npm.cmd run build` | PASS — Next.js 16.2.11 production build, including dynamic `/home/plan/series/new` |
| local Supabase production build/start plus `npx.cmd playwright test --config=e2e/m3-14b.playwright.config.ts --workers=1 --trace=retain-on-failure --output=test-results/m3-14b-local` | PASS — 1 test, 9.8 seconds test time / 11.4 seconds run; disposable local user deleted in `finally` |
| Playwright assertions beyond behavior | PASS — 390x844 viewport, private/no-store Plan headers, no horizontal overflow, no page or console error, offline and invalid-source recovery surfaces |
| `npx.cmd prettier --check .github/workflows/ci.yml` | PASS after formatting |
| `npx.cmd prettier --check src/app/home/plan/series-actions.test.ts` | PASS after the Prettier-only correction |
| `npm.cmd run test:run -- src/app/home/plan/saved/actions.test.ts src/app/home/plan/actions.test.ts src/app/home/plan/series-actions.test.ts` | PASS — 3 files, 26 tests after the saved-reuse fixture correction |
| `npx.cmd prettier --check src/app/home/plan/saved/actions.test.ts` | PASS after the fixture correction |
| first focused correction Vitest run | FAIL — 1 of 10 assertions used a singular text query for copy intentionally rendered once visibly and once in the live region; the component behavior was correct and the assertion was narrowed to the visible heading |
| `npm.cmd run test:run -- src/app/home/plan/plan-manager.test.tsx src/app/home/plan/series-materializer.test.tsx` | PASS — 2 files, 10 tests after the review correction |
| `npx.cmd prettier --write src/app/home/plan/plan-manager.tsx src/app/home/plan/plan-manager.test.tsx src/app/home/plan/series-materializer.tsx src/app/home/plan/series-materializer.test.tsx` | PASS — focused correction files formatted; resulting changes are in the implementation correction commit |
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
4. Exact corrected target `235fdea2ab43d929ccb8ddd80626dff149edef22`
   is local-only because the lead owns push. CI run 32392022206 and deployment
   `dpl_Br6gMKzT1DseDVzaMrgWrgswfft6` failed on superseded evidence head
   `91de7c4`; no fresh CI, Preview or independent review exists yet. No hosted
   database was touched because this correction contains no migration.

## Independent reviewer focus

The next reviewer must inspect exact implementation
`235fdea2ab43d929ccb8ddd80626dff149edef22` against base
`2e2c1be4cb44f9591a6d7e0219a7ded28de547e1`, reconcile the complete ticket
manifest, and use its new green CI run and matching Preview. Earlier targets,
runs, Previews and reviews are history only and are not acceptance evidence.

Human judgment should concentrate on: owner-source rereads and explicit
ownership predicates; the absence of render/GET/prefetch writes; move and bulk
scope withholding at segment bounds; permanent-removal copy before the action
and authoritative counts only after it; preservation of earlier, diverged,
locked and completed records; minimal client serialization and server/client
boundaries; honest pending/offline/recovery states; and the 390x844 Preview's
spacing, focus, touch and serious-coach tone. Specifically confirm that the
future-removal receipt survives card unmount, a later ordinary Plan action owns
both visible and assistive feedback from pending through completion, and a
recovered idle materialization with no uncovered dates never says it is still
extending. Confirm one Plan-level **Create session** entry exists in both empty
and populated Plans, repeat-off uses ordinary add, repeat-on requires occurrence
review, Plan and saved entries have no recurrence shortcut, and each session
card exposes only Edit, Remove and its lock control with all other operations
inside those editors.
