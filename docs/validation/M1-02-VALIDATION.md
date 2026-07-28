# M1-02 builder validation: manual selectable-horizon planning

**Ticket:** [M1-02](../backlog/M1-02-SELECTABLE-HORIZON-PLANNING.md)

**Builder state:** complete and awaiting independent review

**Implementation commit:** `ccffa4db6ac0fa37bd9c57ef10d575b61ccb7af2`

**Branch:** `ticket/m1-02-selectable-horizon`

**Worktree:** `.worktrees/m1-02`

**Mobile evidence:** [390x844 full-page screenshot](evidence/M1-02-390x844.png)

## Delivered behavior

- The authenticated owner can open `/home/plan`, select an explicit 1-7 day
  horizon, choose a start date, and see exactly that many consecutive date
  sections.
- A first plan defaults to seven days. The browser remembers the last valid
  selection under the versioned local key `fittip.plan.day-count.v1`.
- The owner can create, edit, copy, reorder, move, lock, unlock, and remove
  current or future sessions. Accepted past sessions render read-only.
- A session can contain ordered, lockable activities using all five accepted
  sport-neutral measurement modes. Instructions can include an optional
  alternative.
- The owner can create, edit, archive, and reuse personal activity definitions.
  The UI explicitly explains that these are personal definitions, not a global
  catalog, and that saved snapshots are unchanged by definition edits.
- Save is explicit. The client removes UI-only identifiers, assigns stable
  per-date/per-session positions, and writes through the accepted M1-01 atomic
  repository operation with the observed revision.
- Loading, empty, validation, offline, save-in-progress, save-failure,
  session-expiry, success, and stale-version conflict states are explicit.
  Unsaved navigation and range reductions require confirmation.
- A successful save identifies the new accepted version and states that earlier
  versions remain unchanged. A stale save keeps the draft and offers an
  explicit reload.
- No M1-03 completion write, logging UI, AI call, external analytics, global
  exercise library, friend behavior, or hosted mutation was added.

## Mobile demo path

1. Start the accepted local Supabase stack and provide only its public URL and
   publishable key through ignored local environment configuration.
2. Run `npm.cmd run build`, then `npm.cmd run start`.
3. Sign in with a product-owner or synthetic confirmed account.
4. Open `/home`, choose **Open training plan**, and use `/home/plan`.
5. Set the viewport to `390x844`.
6. Select 1-7 days, add sessions and activities, optionally create/reuse a
   personal activity, and choose **Save plan**.
7. Edit the accepted plan and save again. The version badge increments and the
   earlier database version remains queryable.

The checked browser proof created a three-day plan with locked Running content
and a reusable Mobility activity, saved version one, edited the plan to a
two-day horizon, saved version two, and queried the authenticated Data API to
prove both version rows remained.

## Complete change manifest

### Created

- `e2e/planning.spec.ts` - exercises the real authenticated mobile planning
  flow at an explicit `390x844`, including multi-sport content, locks, personal
  activity creation/reuse, two immutable saves, owner-visible database
  history, no horizontal overflow, console errors, and disposable-user
  cleanup.
- `src/app/home/plan/actions.test.ts` - verifies repository delegation,
  revalidation, personal-activity mutations, and safe action error mapping.
- `src/app/home/plan/actions.ts` - exposes server actions for explicit plan
  saves and personal-activity create/update/archive operations without
  bypassing the accepted repository.
- `src/app/home/plan/error.tsx` - provides an honest route error boundary that
  says the accepted plan was not changed.
- `src/app/home/plan/loading.tsx` - provides the route-level loading state.
- `src/app/home/plan/page.test.tsx` - covers server loading and anonymous versus
  denied-owner redirects.
- `src/app/home/plan/page.tsx` - loads the current accepted plan and active
  personal activities server-side, then passes a serializable editor snapshot.
- `src/components/planning/activity-library.test.tsx` - covers personal
  definition creation, future-only edits, explicit archive confirmation, and
  no-global-catalog copy.
- `src/components/planning/activity-library.tsx` - implements personal activity
  creation, editing, archiving, and reuse management.
- `src/components/planning/plan-editor.test.tsx` - covers remembered horizons,
  three-day plan construction, explicit save payloads, conflicts, ordering,
  moves, removal, locks, read-only past sessions, and UI-only identifier
  removal.
- `src/components/planning/plan-editor.tsx` - implements the mobile horizon,
  dated session ledger, version state, offline/unsaved/conflict handling, plan
  operations, and explicit save dock.
- `src/components/planning/session-composer.test.tsx` - proves Running,
  Football, Mobility, Strength, and custom activities fit the same editor and
  that incomplete targets remain unsaved.
- `src/components/planning/session-composer.tsx` - implements accessible session
  and ordered-activity editing for the five accepted measurement contracts,
  personal reuse, alternatives, and locks.
- `src/features/planning/planning-types.ts` - defines serializable client-side
  planning, action-result, and personal-activity view types without importing
  server-only modules.
- `src/features/planning/planning-utils.ts` - creates UI-only draft identifiers
  that are removed before persistence.
- `docs/validation/M1-02-VALIDATION.md` - persists this implementation manifest,
  evidence, commands, limitations, and reviewer checklist.
- `docs/validation/evidence/M1-02-390x844.png` - captures the accepted version
  two mobile plan from the clean production-build browser run.

### Modified

- `src/app/globals.css` - adds the scoped editorial training-ledger design,
  responsive `390px` composition, focus states, touch targets, dialog,
  read-only history, state banners, and safe-area-aware sticky save control.
- `src/app/home/page.tsx` - replaces the placeholder coaching message with the
  approved entry link to `/home/plan`.
- `src/server/repositories/training-record-repository.test.ts` - verifies the
  new owner-filtered current-plan read across head, immutable version, sessions,
  and activities.
- `src/server/repositories/training-record-repository.ts` - adds the
  authenticated current accepted-plan read model. It does not broaden mutation
  privileges or change the accepted atomic save.

### Deleted

- None.

### Renamed

- None.

## Data, migration, and API effects

- No migration, table, policy, grant, generated database type, secret-bearing
  client, or remote database was changed.
- The repository adds one read composition over the existing
  `detailed_plan_heads`, `detailed_plan_versions`, `planned_sessions`, and
  `planned_activities` tables. Every query derives the verified user and
  repeats the `user_id` predicate while remaining subject to RLS.
- Plan writes continue to use only the accepted
  `save_manual_plan_version` RPC, including its `PT409` stale conflict and
  request-scoped retry disablement.
- Personal activity writes continue through the accepted owner-scoped M1-01
  repository methods.
- The Playwright harness obtains the local stack's test credential only at test
  runtime to create and delete one disposable confirmed Auth user. It never
  prints, persists, bundles, or exposes that credential to application code.
- The only new client persistence is the non-sensitive remembered day count in
  local storage. Plan content is never stored there.

## Tests added or changed

- Five planning/action/component test files cover route access, server actions,
  1-7 day UI behavior, remembered selection, plan payload normalization,
  multi-sport measurement modes, target validation, personal definitions,
  ordering, move/remove/copy/locks, past read-only behavior, unsaved state,
  conflict recovery, and error mapping.
- The M1-01 repository suite gained a current-plan read test with explicit
  ownership predicates and immutable snapshot reconstruction.
- The Playwright test covers the complete synthetic authenticated path through
  the production build at `390x844`, then confirms version one (`day_count=3`)
  and version two (`day_count=2`) both remain available through owner-scoped
  Data API reads.

## Commands and final results

| Command | Result |
|---|---|
| targeted `npm.cmd exec prettier -- --check ...` | PASS - all M1-02 implementation/test files match Prettier |
| `npm.cmd run typecheck` | PASS |
| `npm.cmd run lint` | PASS |
| `npm.cmd run test:run` | PASS - 22 files, 133 tests |
| `npm.cmd run build` | PASS - production build includes dynamic `/home/plan` |
| production `agent-browser` load/snapshot checks | PASS - meaningful signup content, zero Next.js error dialogs, expected interactive elements |
| `npm.cmd run test:e2e -- e2e/planning.spec.ts` with runtime-only local test credential | PASS - 1 Chromium test at explicit `390x844`; real sign-in, plan v1/v2, personal reuse, locks, owner-visible version history, no overflow, no page errors |
| `git diff --check` and staged `git diff --cached --check` | PASS - no whitespace errors; only Windows LF/CRLF conversion warnings |
| `npm.cmd exec supabase -- test db supabase/tests/database --local` | NOT CLEANLY RE-RUNNABLE IN PARALLEL STACK - see limitation below |
| accepted M1-01 concurrency harness | NOT RE-RUNNABLE FROM THIS WORKTREE - its nested local-status subprocess did not discover the already-running stack; the M1-02 real save path and v1/v2 history passed through Playwright |

## Browser evidence

- Viewport is explicitly overridden in the test to `390x844`; this avoids the
  repository's Desktop Chrome project preset replacing the global viewport.
- The final run used a fresh `next build` followed by `next start`.
- The full-page screenshot shows two visible horizon days, Running and
  Mobility sessions, the locked-session indicator, owner-created **Hip flow**
  definition, version `v2`, and the immutable-history success message.
- The browser asserted
  `document.documentElement.scrollWidth <= window.innerWidth`.
- The synthetic Auth user and all cascade-owned records were deleted in the
  test's `finally` cleanup.

## Known limitations and environment notes

- The shared Docker-backed Supabase stack was changed concurrently by the
  isolated M1-03 builder. It currently contains M1-03's new non-null
  `completed_sessions.idempotency_key`, while this M1-02 branch correctly does
  not contain or own the M1-03 migration/test-fixture updates. Running the
  inherited M1-01 pgTAP file against that ahead-of-branch schema caused 11
  completion-fixture failures because those older fixtures do not provide the
  new M1-03 field. The 41 M0 assertions passed. The builder did not reset,
  alter, or repair the shared stack because doing so could disrupt M1-03.
- M1-02 adds no schema and does not touch completion records. The lead's
  recorded post-merge integration run must execute the aligned M1-01/M1-03
  database suite after both ticket commits are merged.
- The accepted M1-01 concurrency proof remains the governing race evidence.
  This branch additionally exercised two sequential real RPC saves and
  owner-scoped immutable history through the production browser flow.
- History browsing remains M1-04 scope. M1-02 states that earlier versions
  remain unchanged and proves their rows through tests, but it does not add a
  history screen.
- Locks are stored and visible but have no automated replan behavior until a
  separately approved AI/replanning ticket exists.
- The remembered horizon is browser-local and non-sensitive. It does not roam
  across devices.
- Offline editing is in-memory only. M1-02 deliberately adds no offline write
  queue.
- Nothing was deployed to founder staging and no hosted database was modified.
- Next.js emits the existing nested-worktree root-inference warning during
  build. The production source, route, tests, and build complete successfully;
  changing shared `next.config.ts` was outside M1-02 ownership.
- An ignored `.env.local` containing only local public Supabase coordinates was
  created in the isolated worktree so its dev/production server could be
  verified. It is not included in either commit.

## Independent reviewer checklist

1. Review exact implementation commit
   `ccffa4db6ac0fa37bd9c57ef10d575b61ccb7af2`.
2. Reconcile every created/modified file above against that commit plus this
   validation/evidence commit; report omissions, extras, or inaccurate
   descriptions.
3. Confirm no M1-03 file, migration, completion write, or logging behavior is
   present.
4. Confirm client inputs are parsed again by the server repository and every
   database read/write remains verified-user scoped and RLS protected.
5. Re-run the focused planning tests, full Vitest suite, typecheck, lint,
   targeted formatting, and build.
6. Re-run the Playwright flow at an explicit `390x844` against a clean or
   otherwise aligned local stack.
7. Inspect the mobile screenshot and keyboard/focus/touch behavior, including
   the session composer, sticky save control, range-removal confirmation,
   conflict state, and past read-only state.
8. Treat the currently ahead-of-branch M1-03 database state as shared external
   test contamination, not as authorization to edit M1-03 from this branch.

## Handoff boundary

The builder requests independent review of the exact implementation commit
above and this separate validation/evidence commit. M1-02 should become
`testable` only after that reviewer reconciles the manifest, reruns the scoped
checks, and reports no unresolved findings.
