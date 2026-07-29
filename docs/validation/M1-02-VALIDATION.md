# M1-02 builder validation: manual selectable-horizon planning

**Ticket:** [M1-02](../backlog/M1-02-SELECTABLE-HORIZON-PLANNING.md)

**Builder state:** complete and awaiting independent review

**Initial implementation commit:** `ccffa4db6ac0fa37bd9c57ef10d575b61ccb7af2`

**Review-correction commits:**

- `d7ac12a5aef4208125ad18c0e92a57eb449b2111` - enforces past-plan,
  modal-accessibility, and Back-navigation safeguards.
- `37f41b65f08953b8644ef6caac4572650adec84a` - prevents duplicate History
  API guard entries when returning to Plan.
- `92f878d34000726bdde0f9ad878198a6dd7879fa` - freezes the component-test
  owner date so current/future behavior does not age with the calendar.

**Exact implementation review target:** `92f878d34000726bdde0f9ad878198a6dd7879fa`

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
- Every save reloads the current accepted plan on the server and compares
  owner-local past content using the accepted plan timezone. Forged,
  replayed, inserted, removed, or changed past sessions and activity snapshots
  are rejected before the save RPC.
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
  Unsaved link, unload, browser Back/history, and range-reduction navigation
  require confirmation.
- The session editor is a complete modal dialog: the background is inert,
  initial focus enters the title, Tab and Shift+Tab remain contained, Escape
  closes, and focus returns to the exact button that opened it.
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

The checked browser proof exercised modal keyboard behavior, created a
three-day plan with locked Running content and a reusable Mobility activity,
saved version one, edited the plan to a two-day horizon, saved version two,
queried the authenticated Data API to prove both version rows remained, and
proved that mobile Back first preserves then leaves a dirty draft according to
the confirmation decision.

## Complete change manifest

### Created

- `e2e/planning.spec.ts` - exercises the real authenticated mobile planning
  flow at an explicit `390x844`, including multi-sport content, locks, personal
  activity creation/reuse, two immutable saves, owner-visible database
  history, modal focus containment/Escape/restoration, browser Back draft
  protection, no horizontal overflow, console errors, and disposable-user
  cleanup.
- `src/app/home/plan/actions.test.ts` - verifies repository delegation,
  revalidation, personal-activity mutations, safe action error mapping, and
  the read-only response to a forged past-session mutation.
- `src/app/home/plan/actions.ts` - exposes server actions for explicit plan
  saves and personal-activity create/update/archive operations without
  bypassing the accepted repository, including an explicit safe response when
  server-side past-plan protection rejects untrusted input.
- `src/app/home/plan/error.tsx` - provides an honest route error boundary that
  says the accepted plan was not changed.
- `src/app/home/plan/loading.tsx` - provides the route-level loading state.
- `src/app/home/plan/page.test.tsx` - covers server data mapping and anonymous
  versus denied-owner redirects.
- `src/app/home/plan/page.tsx` - loads the current accepted plan and active
  personal activities server-side, then passes a serializable editor snapshot.
- `src/components/planning/activity-library.test.tsx` - covers personal
  definition creation, future-only edits, explicit archive confirmation, and
  no-global-catalog copy.
- `src/components/planning/activity-library.tsx` - implements personal activity
  creation, editing, archiving, and reuse management.
- `src/components/planning/plan-editor.test.tsx` - covers remembered horizons,
  three-day plan construction, explicit save payloads, conflicts, ordering,
  moves, removal, locks, read-only past sessions, UI-only identifier removal,
  complete modal keyboard behavior, browser Back confirmation decisions,
  History API guard reuse, and date-frozen current/future behavior.
- `src/components/planning/plan-editor.tsx` - implements the mobile horizon,
  dated session ledger, version state, offline/unsaved/conflict handling, plan
  operations, explicit save dock, inert modal background/focus restoration,
  dirty-draft browser Back/history protection, and guard reuse when returning
  to Plan so repeated visits do not stack redundant sentinels.
- `src/components/planning/session-composer.test.tsx` - proves Running,
  Football, Mobility, Strength, and custom activities fit the same editor and
  that incomplete targets remain unsaved.
- `src/components/planning/session-composer.tsx` - implements a complete
  accessible modal session editor with initial focus, Tab/Shift+Tab
  containment, Escape close, ordered-activity editing for the five accepted
  measurement contracts, personal reuse, alternatives, and locks.
- `src/features/planning/planning-types.ts` - defines serializable client-side
  planning, action-result, and personal-activity view types without importing
  server-only modules.
- `src/features/planning/planning-utils.ts` - creates UI-only draft identifiers
  that are removed before persistence.
- `src/server/training/past-plan-protection.test.ts` - proves accepted-timezone
  owner-local date handling and rejects forged changes, removals, insertions,
  activity snapshot changes, and new backdated content while allowing
  future-only edits.
- `src/server/training/past-plan-protection.ts` - canonicalizes accepted and
  proposed past plan snapshots and enforces their immutability server-side
  before persistence.
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
  and activities, plus a forged past-session save that is rejected before the
  RPC.
- `src/server/repositories/training-record-repository.ts` - adds the
  authenticated current accepted-plan read model and invokes server-side past
  snapshot protection before the accepted atomic save. It does not broaden
  mutation privileges.

### Deleted

- None.

### Renamed

- None.

## Data, migration, and API effects

- No migration, table, policy, grant, generated database type, secret-bearing
  client, or remote database was changed.
- The repository uses the current accepted-plan read composition over the
  `detailed_plan_heads`, `detailed_plan_versions`, `planned_sessions`, and
  `planned_activities` tables. Every query derives the verified user and
  repeats the `user_id` predicate while remaining subject to RLS.
- Before every write, the repository compares the proposal with that accepted
  plan using the accepted timezone and the owner-local current date. This
  server boundary does not trust the browser's disabled past-date controls.
- Plan writes continue to use only the accepted
  `save_manual_plan_version` RPC, including its `PT409` stale conflict and
  request-scoped retry disablement.
- Personal activity writes continue through the accepted owner-scoped M1-01
  repository methods.
- The Playwright harness obtains the local stack's test credential only at test
  runtime to create and delete one disposable confirmed Auth user. It never
  prints, persists, bundles, or exposes that credential to application code.
- The only client persistence remains the non-sensitive remembered day count
  in local storage plus a same-URL History API guard entry. Plan content is
  never stored in either location.

## Tests added or changed

- Six planning/action/component/domain test files cover route access, server
  actions, 1-7 day UI behavior, remembered selection, plan payload
  normalization, multi-sport measurement modes, target validation, personal
  definitions, ordering, move/remove/copy/locks, past read-only behavior,
  unsaved state, conflict recovery, error mapping, server-side past-snapshot
  immutability, modal keyboard behavior, browser Back protection, History API
  guard reuse, and calendar-independent current/future fixtures.
- The M1-01 repository suite gained a current-plan read test with explicit
  ownership predicates and immutable snapshot reconstruction, plus a forged
  repository save that proves the save RPC is never reached.
- The Playwright test covers the complete synthetic authenticated path through
  the production build at `390x844`, then confirms version one (`day_count=3`)
  and version two (`day_count=2`) both remain available through owner-scoped
  Data API reads. It also exercises initial focus, both focus-loop directions,
  Escape, focus restoration, and both Back-confirmation outcomes.

## Commands and final results

| Command | Result |
|---|---|
| targeted `npm.cmd exec prettier -- --check ...` | PASS - all M1-02 implementation/test files match Prettier |
| `npm.cmd run typecheck` | PASS |
| `npm.cmd run lint` | PASS |
| Node 24 focused `vitest run src/components/planning/plan-editor.test.tsx` | PASS - 1 file, 9 tests on 29 July 2026 |
| Node 24 full `vitest run` | PASS - 23 files, 147 tests on 29 July 2026 |
| `npm.cmd run build` | PASS - production build includes dynamic `/home/plan` |
| `npm.cmd exec supabase -- db reset --local --yes` | PASS - clean local schema aligned to the three migrations on this branch |
| `npm.cmd exec supabase -- test db supabase/tests/database --local` | PASS - 2 files, 144 pgTAP assertions |
| `npm.cmd exec supabase -- db lint --local` | PASS - no database lint findings |
| `npm.cmd run test:m1-01-concurrency` | PASS - 2 simultaneous saves produced exactly 1 success and 1 `PT409`; one version/head at revision 1 |
| `npm.cmd run test:e2e -- e2e/planning.spec.ts` with runtime-only local test credential | PASS - 1 Chromium test at explicit `390x844`; real sign-in, modal keyboard behavior, plan v1/v2, personal reuse, locks, owner-visible version history, dirty Back protection, no overflow, no page errors |
| `git diff --check` and staged `git diff --cached --check` | PASS - no whitespace errors; only Windows LF/CRLF conversion warnings |

## Browser evidence

- Viewport is explicitly overridden in the test to `390x844`; this avoids the
  repository's Desktop Chrome project preset replacing the global viewport.
- The final run used a fresh `next build` followed by `next start`.
- The browser opened the session dialog twice to prove initial focus, forward
  and reverse focus containment, Escape close, and opener focus restoration.
- The full-page screenshot shows two visible horizon days, Running and
  Mobility sessions, the locked-session indicator, owner-created **Hip flow**
  definition, version `v2`, and the immutable-history success message.
- The browser asserted
  `document.documentElement.scrollWidth <= window.innerWidth`.
- After capturing the clean accepted state, the browser made the horizon dirty:
  dismissing Back confirmation kept `/home/plan` and the draft; accepting the
  next Back confirmation navigated to `/home`.
- The synthetic Auth user and all cascade-owned records were deleted in the
  test's `finally` cleanup.

## Known limitations and environment notes

- The shared Docker-backed stack was reset after the M1-03 reviewer completed
  its work, using only this branch's three migrations. Both inherited pgTAP
  files and the accepted M1-01 concurrency proof then passed cleanly. M1-02
  still adds no migration and does not touch completion records.
- `npm.cmd ci` used the host's Node `22.14.0` and reported the existing engine
  mismatch because this repository declares Node `>=24.18.0 <25`; the locked
  install and every recorded validation command completed. Resolving the
  workstation's default Node selection is shared tooling scope, not M1-02.
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

1. Review exact implementation head
   `92f878d34000726bdde0f9ad878198a6dd7879fa`. This includes the initial
   implementation plus review corrections `d7ac12a`, `37f41b6`, and
   `92f878d`; it supersedes every earlier review target until independently
   reviewed.
2. Reconcile every created/modified file above against the implementation
   range through that exact head plus this validation/evidence commit; report
   omissions, extras, or inaccurate descriptions.
3. Confirm no M1-03 file, migration, completion write, or logging behavior is
   present.
4. Confirm client inputs are parsed again by the server repository and every
   database read/write remains verified-user scoped and RLS protected.
5. Forge changed, removed, inserted, and replayed past content at the domain,
   repository, and action boundaries; confirm the accepted timezone determines
   the protected owner-local date and the save RPC is not reached.
6. Re-run the focused planning tests, full Vitest suite, typecheck, lint,
   targeted formatting, build, pgTAP suite, and M1-01 concurrency proof.
7. Re-run the Playwright flow at an explicit `390x844` against an aligned
   local stack.
8. Inspect the mobile screenshot and keyboard/focus/touch behavior, including
   session-dialog initial focus, focus containment, Escape, restoration,
   inert background, dirty browser Back, sticky save control, range-removal
   confirmation, conflict state, and past read-only state.
## Handoff boundary

The builder requests independent re-review of exact implementation head
`92f878d34000726bdde0f9ad878198a6dd7879fa` and this separate
validation/evidence commit. M1-02 should become `testable` only after that
reviewer reconciles the manifest, reruns the scoped checks, and reports no
unresolved findings.
