# M1-04 builder validation: Today, factual Progress, and mobile navigation

**Ticket:** [M1-04](../backlog/M1-04-TODAY-PROGRESS-NAVIGATION.md)

**Lifecycle state:** in development — builder handoff ready for independent
review

**Exact implementation review target:**
`aead708f520c061b851974c29c20291e8de2eb4a`

**Initial implementation commit:**
`3ea1f3b456a45b3490d290213a4e6db5ba102915`

**Builder correction commits:**

- `c968635535a9ba41a5955c5e08d34250b165bd4e` — uses the browser-local
  date and timezone before an accepted plan or actual supplies an owner
  timezone.
- `e860fabe8622961f841786d8c00d40c37b2100dd` — removes a timer from that
  local-date subscription so the complete parallel component suite remains
  isolated and deterministic.
- `aead708f520c061b851974c29c20291e8de2eb4a` — normalizes received HTTP
  response header names before comparison while preserving exact private-cache
  values and the complete production You, sign-out, and sign-in flow.

**Branch:** `ticket/m1-04-today-progress-navigation`

**Worktree:** `.worktrees/m1-04`

**Mobile evidence:** [390x844 factual detail screenshot](evidence/M1-04-390x844.png)

**Independent review:** requested header-name normalization; correction
implemented and re-review pending

## Delivered behavior

- `/home` resolves to the authenticated default `/home/today`.
- The authenticated application shell exposes exactly **Today**, **Plan**,
  **Progress**, and **You**. The approved label is Progress; Coach and a
  History tab are absent.
- Today uses the current accepted plan timezone, or the latest factual
  completion timezone, to derive the owner-local date. Before either exists,
  the browser supplies its local date and timezone without persisting personal
  data.
- Today preserves same-day plan order, renders every planned session, keeps
  planned and actual labels separate, links an unlogged session to quick log,
  and links a logged session to factual Progress detail.
- No-plan and no-session states provide explicit Plan and unplanned-log
  actions. Time passing never implies completion.
- Progress merges immutable accepted plan versions and current factual
  completion heads into a chronological ledger. It makes no score, streak,
  trend, or coaching claim.
- Plan-version detail preserves source-session order and displays each source
  session beside only its linked factual actuals. An absent actual is labeled
  **Not logged**.
- Completion detail separates **Planned** from **Actual**, displays current
  facts and activity results, and keeps every correction revision and reason
  visible.
- Quick-log success now offers **View in Progress** while retaining an
  explicit correction route.
- Loading, empty, unavailable-record, route error, offline, and expired-session
  states use factual copy and an available recovery action. Offline is an
  honest notice, not a write queue.
- Only allowlisted relative application destinations can be restored after
  sign-in. An expired protected deep link returns to generic sign-in without
  echoing the private path.
- Authenticated routes remain dynamic and carry the accepted
  `private, no-store` response policy. The production browser test verifies
  these headers on a private detail response.
- The bottom navigation has safe-area padding, visible text labels, current
  state, touch-sized targets, and focus treatment. It is layered below the
  planning dialog and above ordinary content; the plan save dock is positioned
  above it.

## Mobile demo path

1. Start the accepted local Supabase stack and expose only its local public URL
   and publishable key to the application.
2. Run `npm.cmd run build`, then `npm.cmd run start -- -p 3014`.
3. Sign in with the product owner or a disposable confirmed synthetic account.
4. Open `/home`; it resolves to `/home/today`.
5. At `390x844`, confirm the no-plan state, then choose **Plan**.
6. Select 1–7 days, add a session, and explicitly save the plan.
7. Choose **Today**, open **Log training**, record the factual outcome, and
   save.
8. Choose **View in Progress**. Confirm separate Planned and Actual panels and
   the preserved revision history.
9. Open **Progress** to inspect the accepted plan version and factual actual in
   chronological order. Open either detail route and test refresh plus browser
   back/forward.
10. Open **You** for the existing account/sign-out surface.

## Complete change manifest

### Created

- `docs/validation/M1-04-VALIDATION.md` — persists the builder handoff,
  complete manifest, evidence, commands, limitations, and reviewer checklist.
- `docs/validation/evidence/M1-04-390x844.png` — captures the production
  factual Planned-versus-Actual detail at the exact mobile acceptance viewport.
- `e2e/m1-04-today-progress.spec.ts` — covers no-plan recovery, planning,
  Today, quick log, Progress, navigation, responsive overflow, offline notice,
  deep links, back/forward, refresh, session expiry, safe sign-in return,
  private cache headers, console errors, and synthetic-user cleanup.
- `e2e/m1-04.playwright.config.ts` — fixes the M1-04 production browser run to
  `390x844`, Europe/Berlin, and the isolated local port `3014`.
- `src/app/home/home.module.css` — defines the restrained factual training
  ledger, responsive page/card layouts, fixed safe-area navigation, accessible
  focus states, reduced motion, desktop adaptation, and dialog/save-dock
  stacking.
- `src/app/home/layout.tsx` — adds the authenticated application shell, skip
  link, connection notice, and mobile primary navigation.
- `src/app/home/progress/[id]/page.test.tsx` — proves completion correction
  separation and immutable plan-version detail without inferred actuals.
- `src/app/home/progress/[id]/page.tsx` — renders owner-scoped plan-version and
  completion detail with separate Planned, Actual, and revision records.
- `src/app/home/progress/error.tsx` — provides factual Progress load failure
  copy and retry.
- `src/app/home/progress/loading.tsx` — provides an explicit Progress loading
  state without inferred metrics.
- `src/app/home/progress/page.tsx` — builds the chronological accepted-plan and
  current-actual ledger.
- `src/app/home/today/error.tsx` — provides factual Today failure copy and
  retry.
- `src/app/home/today/loading.tsx` — states that no completion is inferred
  during the Today read.
- `src/app/home/today/page.test.tsx` — proves multiple-session plan order,
  per-session factual actions, unplanned actuals, and the no-plan recovery
  route.
- `src/app/home/today/page.tsx` — aggregates the accepted current plan and
  factual completion heads for the owner-local date.
- `src/app/home/you/page.tsx` — retains the verified private profile and
  sign-out surface without inventing Goals or Memory behavior.
- `src/components/home/browser-local-date.tsx` — supplies a browser-local date
  and timezone before FitTip has an accepted owner timezone, refreshing on
  focus or visibility changes without persistence.
- `src/components/home/connection-notice.tsx` — exposes an accessible,
  non-persistent offline notice.
- `src/components/home/mobile-navigation.test.tsx` — proves exactly four
  approved destinations, the Progress label/current state, and no Coach or
  History tab.
- `src/components/home/mobile-navigation.tsx` — implements visible,
  current-route-aware Today/Plan/Progress/You navigation.
- `src/features/completions/status-label.test.ts` — locks all six factual
  completion labels.
- `src/features/completions/status-label.ts` — centralizes factual outcome
  labels for Today and Progress.
- `src/lib/auth/safe-return.test.ts` — proves allowlisted application returns
  and rejects external, malformed, unknown, or query-expanded destinations.
- `src/lib/auth/safe-return.ts` — validates sign-in return paths without
  reflecting a private expired path or accepting an open redirect.

### Modified

- `e2e/auth.spec.ts` — follows the new Today default and reaches sign-out
  through You; compares received HTTP header names case-insensitively while
  retaining exact cache-control, expires, and pragma value assertions.
- `e2e/m1-03-quick-log.spec.ts` — follows the renamed explicit correction link
  and new Today sign-in default.
- `e2e/planning.spec.ts` — enters Plan through the approved navigation and
  returns to Today.
- `src/app/auth/auth-routes.test.ts` — updates the accepted default and tests
  safe allowlisted versus rejected sign-in returns.
- `src/app/auth/callback/route.ts` — sends a newly confirmed account to Today.
- `src/app/auth/signin/route.ts` — restores only a validated application
  destination and otherwise uses Today.
- `src/app/home/log/page.tsx` — adds the authenticated shell skip target.
- `src/app/home/page.test.tsx` — locks `/home` to the Today redirect.
- `src/app/home/page.tsx` — replaces the former placeholder surface with the
  approved Today redirect.
- `src/app/page.tsx` — accepts the optional safe-return query for the sign-in
  form.
- `src/components/auth-form.tsx` — carries only a validated return value in the
  credential form.
- `src/components/completions/quick-log-form.tsx` — routes a saved actual to
  factual Progress and keeps correction explicit.
- `src/components/planning/plan-editor.tsx` — integrates the skip target and
  returns to Today through the app shell.
- `src/server/repositories/completion-repository.test.ts` — proves current
  completion-head ordering, current-row composition, and repeated owner
  predicates.
- `src/server/repositories/completion-repository.ts` — adds the authenticated
  current factual-completion read while reusing accepted M1-03 rows and RLS.
- `src/server/repositories/training-record-repository.test.ts` — proves
  immutable plan-version history ordering and owner scoping.
- `src/server/repositories/training-record-repository.ts` — adds immutable
  plan-version/current-plan snapshots with planned record identifiers needed
  for Today and Progress.

### Deleted

- None.

### Renamed

- None.

## Data, migration, API, privacy, and security effects

- No migration, table, column, policy, grant, RPC, generated database type,
  package, secret, external service, analytics request, AI call, or hosted
  environment was added or changed.
- Reads reuse the accepted `detailed_plan_heads`,
  `detailed_plan_versions`, `planned_sessions`, `planned_activities`,
  `completion_heads`, `completed_sessions`, and `completed_activities`
  contracts.
- Every added repository read first derives the verified user from Auth claims,
  repeats `user_id` predicates on exposed owner tables, and remains subject to
  the accepted RLS policies. Caller-supplied ownership is never accepted.
- Current completion reads follow `completion_heads.current_completion_id`;
  prior revisions remain append-only and are loaded only for the selected
  owner-scoped completion group.
- Plans, planned sessions, current actuals, and prior corrections stay separate
  in both data access and visible presentation.
- The browser stores no Today or Progress record. The offline notice uses only
  `navigator.onLine`; the first-use local date uses only browser time APIs.
- Safe return accepts only the approved application routes and UUID-shaped log
  or detail paths. The protected-route proxy continues to erase an expired
  session and return generic sign-in with private response headers.
- The local Playwright harness receives the local service-role credential only
  at test runtime to create and remove a disposable confirmed user. It never
  prints, persists, bundles, or exposes that credential to application code.

## Tests and final results

| Command or check | Result |
|---|---|
| `npm.cmd run lint` | PASS |
| `npm.cmd run typecheck` | PASS |
| `npm.cmd run test:run` | PASS — 34 files, 199 tests |
| focused auth/security Node suites | PASS — 3 files, 29 tests |
| focused Today, Progress detail, navigation, safe-return, auth-route, and repository suites | PASS — route/data/security assertions |
| `npm.cmd run build` | PASS — all authenticated routes compiled dynamic |
| production `playwright test e2e/m1-04-today-progress.spec.ts --config=e2e/m1-04.playwright.config.ts` | PASS — 1 full mobile flow at exactly `390x844` |
| production `playwright test e2e/auth.spec.ts` | PASS — full signup, confirmation, Today, You, sign-out, and sign-in flow |
| production private response header assertion | PASS — `private` and `no-store` |
| mobile horizontal-overflow assertion | PASS |
| browser console/page errors | PASS — none |
| `git diff --check` | PASS |
| React/App Router review | PASS — server reads, async params, narrow client boundaries, parallel independent reads, no avoidable serialization or independent-read waterfalls |
| Supabase security review | PASS — verified claims, repeated owner predicates, accepted RLS, no schema or key exposure |

The final browser run passed in 19.8 seconds against the production build. Two
earlier attempts exposed real stacking problems: navigation initially covered
the session-dialog footer and then the plan save dock. The final CSS places the
dialog above the save dock, the save dock above navigation, and navigation
above ordinary content. The passing run proves both actions at `390x844`.
Two disposable accounts left by those timed-out attempts were explicitly
removed; the passing run removed its own account.

After the independent reviewer requested case-insensitive response-header name
comparison, the corrected production auth flow passed in 7.7 seconds and the
M1-04 mobile production flow passed again in 6.9 seconds. Exact header values
remain asserted. The disposable auth account was explicitly removed.

## Known limitations

- M1 remains local/founder staging only. This ticket does not authorize a
  hosted deployment, public registration, production data, friends, analytics,
  AI, or spend.
- Progress is a factual chronological ledger. It intentionally has no trend,
  score, streak, performance judgment, filter, export, or pagination.
- Offline support is detection and honest recovery copy only. There is no
  offline write queue or cached-data guarantee.
- Before the first accepted plan or actual exists, the server has no stored
  owner timezone. The visible date is therefore hydrated from the browser
  timezone; there is no server-side session query to perform in that empty
  state.
- The accepted quick-log activity result editor remains JSON-based from M1-03;
  M1-04 does not broaden that approved ticket.
- `next build` reports the known isolated-worktree root-inference warning
  because both the repository and ticket worktree contain lockfiles. The build
  and every route succeed; no product code or package resolution failed.
- No schema changes were made, so this builder did not create a migration or
  rerun the already accepted M1-01/M1-03 database migration/advisor matrix.
  The real local-stack browser run exercised the accepted schema, Auth, RPC,
  ownership, and RLS paths.

## Independent reviewer checklist

- Review exact implementation commit
  `aead708f520c061b851974c29c20291e8de2eb4a`, not an uncommitted tree.
- Reconcile this manifest against `git diff
  c99eb8a3d845dffb8e0518c0c6a23111a2fb985a..aead708f520c061b851974c29c20291e8de2eb4a`
  and report omitted, unexpected, or inaccurate files.
- Confirm `/home`, Today, Plan, Progress, detail, You, quick-log, callback,
  sign-in, expiry, and sign-out routing.
- Confirm an external, protocol-relative, malformed, unknown, or
  query-expanded sign-in return cannot become a redirect target.
- Confirm every added data read authenticates and repeats the verified
  `user_id` predicate while relying on accepted RLS.
- Confirm Today preserves multiple-session order and never infers a completion.
- Confirm plan versions, source sessions, completion heads, and correction
  revisions stay visibly and structurally separate.
- Confirm the navigation label is **Progress**, not History, and that Coach is
  absent.
- Confirm loading, empty, unavailable, error, offline, and expired states do
  not invent training facts or metrics.
- Confirm authenticated responses are dynamic, private, and no-store.
- Re-run lint, typecheck, all 199 component/domain/route tests, build, and the
  production Playwright path at exactly `390x844`.
- Inspect `docs/validation/evidence/M1-04-390x844.png` for overflow, content
  separation, focus/touch affordances, and bottom-navigation obstruction.
- Confirm there are no M2/M3 behaviors, AI calls, analytics, external
  requests, secrets, or remote mutations.
