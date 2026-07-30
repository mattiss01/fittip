# M2-01 builder validation: goal model and management

**Ticket:** [M2-01](../../backlog/M2/M2-01-GOAL-MODEL-VALIDATION.md)

**Lifecycle state:** testable. Acceptance was granted on 30 July 2026 against
the ticket's Vercel Preview with the required independent exact-commit
re-review explicitly waived, and the product owner withdrew that waiver later
the same day. The independent review is required before acceptance is granted
again. See
[Independent review and product-owner acceptance](#independent-review-and-product-owner-acceptance)
and [Acceptance withdrawn](#acceptance-withdrawn-30-july-2026).

**Branch:** `ticket/m2-01-goal-model`, pushed to
`origin/ticket/m2-01-goal-model`

**Exact implementation review target:**
`ae7d3104899fb93499fde5273cb7e372d2b2457e`

**Initial implementation commit:**
`d40df06a23519fd937ac2b38028d80410926a544`

**Independent-review correction implementation commit:**
`ae7d3104899fb93499fde5273cb7e372d2b2457e`

**Initial validation-record commit:**
`68ddd8722791f2247c957ac7893459b74431a7f0`

**Corrected-evidence documentation commit:**
`9a998b86e82dfe485309b18337ffb0d6d606d051`

The initial implementation commit introduced M2-01. The correction
implementation commit addresses every finding from the first independent
review without rewriting the already-applied migration, and is the last commit
containing runtime, migration, or test behavior. The initial validation-record
commit adds this handoff document; the corrected-evidence documentation commit
records the post-correction evidence and complete 32-file branch-diff
manifest. The documentation-only commit that moves this ticket to testable
carries no runtime change, and its exact SHA is reported in the builder
handoff because a commit cannot contain its own final SHA. The reviewer's
target is the implementation commit above within the complete branch range.

**Architecture:** [ADR-009](../../decisions/ADR-009-M2-GOAL-MUTATION-TRANSACTION.md)

## Delivered behavior

- Authenticated users manage sport-agnostic goals at **You → Goals**.
- Active core and supporting goals have independent contiguous ranks. Core
  attention is limited to three active records.
- Create, inspect, edit, reorder, pause, resume, achieve, abandon, explicit
  reopen, archive, and eligible permanent-delete operations are available.
- Recoverable validation and conflict responses preserve the submitted goal
  draft. A stale collection revision is never silently overwritten and exposes
  a visible, keyboard-usable **Reload current goals** action.
- Moving a goal to the other attention tier appends it to that tier instead of
  reusing its rank from the previous tier.
- Achieve, abandon, archive, and eligible permanent-delete actions require an
  explicit confirmation with the consequence shown before submission.
- Paused and terminal/archived records remain outside active ranks. Explicit
  terminal-state reopening creates a minimal retained lifecycle event.
- No plan, completion, activity definition, memory, AI, analytics, coaching,
  or external-service behavior was added.

## Implemented data and transaction contract

`goal_collections` stores one server-controlled revision per owner. `goals`
stores the bounded goal fields, tier, lifecycle, active rank, archive marker,
and timestamps. `goal_lifecycle_events` stores only the approved explicit
terminal-state reopen audit.

`public.apply_goal_change` is the only goal write boundary. It:

- is `SECURITY DEFINER`, owned by `postgres`, and has an empty search path;
- derives the owner only from `auth.uid()`;
- takes a namespaced per-owner transaction advisory lock;
- compares the submitted collection revision before writing;
- applies rank, tier, status, archive, and eligible-delete changes atomically;
- revalidates independent contiguous ordering and the maximum of three active
  core goals before commit; and
- returns stable safe conflicts without dynamic SQL.

The bounded contract is title 120, desired outcome 1000, at most ten
non-null activity-area labels of 60 characters each, target/event detail 500,
optional metric label/value/unit 80/120/40, rationale 500, and goal constraints
1000. Target dates cannot precede start dates. Categories are
performance/event, skill, strength, endurance, mobility, body composition,
recovery/general fitness, or other. The lifecycle foreign-key lookup has an
exact `(goal_id, user_id)` supporting index.

## Privilege and policy matrix

| Surface                 | Anonymous           | Authenticated owner             | Other authenticated owner           | Normal write path         |
| ----------------------- | ------------------- | ------------------------------- | ----------------------------------- | ------------------------- |
| `goal_collections`      | no table privileges | owner-only `SELECT` through RLS | denied by RLS                       | none directly             |
| `goals`                 | no table privileges | owner-only `SELECT` through RLS | denied by RLS                       | none directly             |
| `goal_lifecycle_events` | no table privileges | owner-only `SELECT` through RLS | denied by RLS                       | none directly             |
| `apply_goal_change`     | no execute          | execute with Auth-derived owner | cannot name or access another owner | sole approved transaction |

Direct authenticated insert, update, and delete grants are revoked. `PUBLIC`,
anonymous, and `service_role` execution of the goal mutation are revoked. The
local service-role credential appears only as an environment-variable
reference in synthetic test provisioning and never enters application source
or browser output.

## Validation evidence

### Database and concurrency

| Check                                                                          | Result                                                                                                             |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `npx.cmd supabase db reset --local`                                            | PASS — all seven migrations applied cleanly, including the forward review-correction migration                    |
| focused original `supabase/tests/database/m2_01_goals.test.sql`                | PASS — 55 assertions                                                                                               |
| focused correction `supabase/tests/database/m2_01_review_corrections.test.sql` | PASS — 40 assertions                                                                                               |
| complete `supabase test db --local supabase/tests/database`                    | PASS — 5 files, 272 assertions                                                                                     |
| `supabase db lint --local --level warning --fail-on warning`                   | PASS — no schema errors                                                                                            |
| `supabase db advisors --local --type all --level warn --fail-on warn`          | PASS — no security or performance findings                                                                         |
| `supabase gen types typescript --local`                                        | Not repeated — the correction adds only a constraint and index, so the generated TypeScript shape is unchanged     |
| `test:m2-01-concurrency` under Node 24.18                                      | PASS — simultaneous third-core creates returned exactly one `200` and one `409`; revision 3; core ranks 1–3        |
| `test:m2-01-concurrency-lifecycle` under Node 24.18                            | PASS — simultaneous reorder/lifecycle calls returned exactly one `200` and one `409`; revision 3; no partial state |

The original 55 assertions cover exact objects, function ownership/search
path, RLS, privileges, anonymous denial, direct-write denial, owner isolation,
independent ranking, lifecycle transitions, reopen audit, stale rollback,
fourth-core rejection, archive/delete behavior, and date validation. The 40
review-correction assertions add direct null-label rejection and rollback,
cross-tier append behavior in both directions, full-core rollback, stale
rollback for create/edit/archive/delete/reopen, direct user-A submission of
existing user-B goal IDs and reorder arrays, and exact index/constraint
inspection.

### Application and production browser

| Check                                                       | Result                                                      |
| ----------------------------------------------------------- | ----------------------------------------------------------- |
| full `npm.cmd run lint` under Node 24.18                    | PASS                                                        |
| final scoped ESLint after the draft-preservation correction | PASS                                                        |
| full `npm.cmd run typecheck` under Node 24.18               | PASS                                                        |
| full `npm.cmd run test:run` under Node 24.18                | PASS — 39 files, 229 tests                                  |
| final focused action/component/repository/domain rerun       | PASS — 4 files, 28 tests                                    |
| `npm.cmd run build` under Node 24.18                        | PASS — `/home/you/goals` is a dynamic route                 |
| bounded production Playwright flow                          | PASS — 1 test at exactly `390x844`, 9.5 seconds total        |
| scoped Prettier check/write                                 | PASS — no scoped formatting changes after final correction  |
| repository-wide `format:check`                              | known baseline — 108 older files remain outside this ticket |
| `git diff --check`                                          | PASS                                                        |

The production Playwright flow provisions and removes only a disposable
confirmed `example.test` account. It proves empty-state navigation, three core
plus one supporting goal, fourth-core rejection with draft preservation,
cross-tier append edits in both directions, stale-tab conflict and explicit
reload, reorder, edit, pause/resume, archive, achieve, abandon, eligible hard
delete, confirmation consequences, keyboard operation, no horizontal
overflow, and no page errors.

## Mobile demo path and screenshots

1. Start the local Supabase stack and expose its local public URL and
   publishable key to the application.
2. Build and start the app with Node 24.18.
3. Sign in with the founder or a disposable confirmed synthetic account.
4. Open **You → Manage goals** at `390x844`.
5. Create three core goals and one supporting goal.
6. Attempt a fourth core goal and confirm the draft remains editable beside
   the conflict.
7. Move a goal core → supporting → core and confirm it appends in each
   destination tier.
8. Open the route in another tab, mutate the first tab, confirm the stale tab
   refuses to overwrite it, and activate **Reload current goals** by keyboard.
9. Exercise reorder, edit, pause/resume, and the explicit confirmations for
   achieve, abandon, archive, and eligible delete.

Evidence:

- [core and supporting ranks](evidence/M2-01-core-supporting-390x844.png)
- [fourth-core conflict with retained draft](evidence/M2-01-fourth-core-390x844.png)
- [stale-tab conflict](evidence/M2-01-stale-conflict-390x844.png)
- [destructive-action consequences](evidence/M2-01-destructive-action-390x844.png)

All four images were visually inspected. They contain only the synthetic goal
titles and outcomes defined in the Playwright test; no founder account, email,
credential, real training data, or external target is visible.

## Corrections made during validation

- Database lint identified an implicitly typed empty text array. The migration
  uses an explicit `text[]` initializer; a second clean reset, all then-current
  database assertions, lint, and advisors passed.
- Production runtime validation identified a non-function export in a
  `"use server"` module. Action state was moved to a non-server module before
  the exact production rebuild and browser proof.
- Playwright selectors and the add-panel helper were narrowed to semantic,
  bounded checks. The final config limits individual actions to ten seconds
  and the complete ticket flow to 90 seconds.
- Screenshot review identified that React reset the fourth-core form after a
  recoverable conflict. The action state now returns a bounded draft and the
  form remounts from it; unit assertions, rebuild, E2E values, and the refreshed
  screenshot prove preservation.
- Independent review identified that an edit reused the source-tier rank in
  the destination tier. The action now omits that rank on a tier change, so the
  transaction appends safely; database, action, and browser tests cover both
  directions plus the full-core conflict.
- A new forward migration rejects null activity-area elements and adds the
  exact lifecycle foreign-key index. Direct constraint/function tests prove
  rejection and complete rollback; the already-applied original migration was
  not rewritten.
- Achieve, abandon, archive, and delete now use inline accessible confirmation
  controls with consequence copy, confirm/cancel actions, focus restoration,
  and keyboard/mobile coverage. Stale conflicts expose a visible reload link.
- Authorization evidence now creates user B's rows before user A submits B's
  scalar and array IDs. Additional stale-operation and genuine simultaneous
  reorder/lifecycle tests prove one success, one `PT409`, one revision
  increment, and no partial state.

## Privacy, secret, remote-target, and scope scan

- No embedded secret, JWT, provider key, Supabase hosted URL, Vercel URL, or
  non-local HTTP target was found in the ticket files.
- The service-role variable is referenced only by local synthetic provisioning
  and cleanup scripts. Its value is never committed or rendered.
- No remote migration, deployment, analytics, telemetry, AI provider, prompt,
  plan mutation, activity library, memory write, or coaching side effect was
  added.
- Goal content remains private owner training data and is not logged or sent to
  another service. External collection remains blocked by the ticket's M0
  privacy and public-release gates.

## Complete change manifest

### Created

- `docs/validation/M2/M2-01-VALIDATION.md` — persists the builder handoff,
  32-file branch-diff manifest, privilege matrix, validation evidence,
  screenshots, corrections, limitations, and exact implementation boundary.
- `docs/validation/M2/evidence/M2-01-core-supporting-390x844.png` — synthetic
  mobile evidence of independent core and supporting ranks.
- `docs/validation/M2/evidence/M2-01-destructive-action-390x844.png` —
  synthetic mobile evidence of permanent-delete consequence copy and explicit
  confirm/cancel controls.
- `docs/validation/M2/evidence/M2-01-fourth-core-390x844.png` — synthetic
  mobile evidence of the core-limit conflict and retained draft.
- `docs/validation/M2/evidence/M2-01-stale-conflict-390x844.png` — synthetic
  mobile evidence that a stale tab cannot overwrite newer goals and exposes a
  reload action.
- `e2e/m2-01-goals.spec.ts` — complete disposable-user mobile goal-management
  flow, tier-append/conflict/confirmation/keyboard proof, cleanup, overflow
  check, and screenshot capture.
- `e2e/m2-01.playwright.config.ts` — isolated port, exact viewport/timezone,
  and bounded Playwright timeouts.
- `src/app/home/you/goals/action-state.ts` — client-safe action result and
  recoverable goal-draft plus typed conflict contract.
- `src/app/home/you/goals/actions.test.ts` — server-action mapping, safe error,
  revalidation, retained-draft, conflict-kind, and tier-change tests.
- `src/app/home/you/goals/actions.ts` — authenticated server actions for the
  approved repository operations, safe result mapping, and destination-tier
  append semantics.
- `src/app/home/you/goals/error.tsx` — private read failure and retry state.
- `src/app/home/you/goals/goals.module.css` — mobile ledger layout, core-slot
  signal, confirmation/reload controls, focus, reduced-motion, and responsive
  treatment.
- `src/app/home/you/goals/loading.tsx` — honest private goal loading state.
- `src/app/home/you/goals/page.test.tsx` — owner-scoped page mapping and
  unavailable-read behavior.
- `src/app/home/you/goals/page.tsx` — authenticated server page and minimal
  serialized goal view.
- `src/components/goals/goal-manager.test.tsx` — tier separation, active-rank,
  historical-section, explicit confirmation, focus restoration, and stale
  reload coverage.
- `src/components/goals/goal-manager.tsx` — create/edit/reorder/lifecycle UI,
  independent lists, conflict announcements/reload, retained drafts, and
  explicit destructive/terminal confirmations.
- `src/server/goals/goal-records.test.ts` — bounded sport-agnostic domain input
  tests.
- `src/server/goals/goal-records.ts` — goal domain parsing, limits, dates,
  categories, tiers, metrics, order, and revisions.
- `src/server/repositories/goal-repository.test.ts` — auth-first reads, sole
  RPC write path, retry disabling, and safe conflict mapping tests.
- `src/server/repositories/goal-repository.ts` — server-only owner-scoped goal
  repository and approved transaction adapter.
- `supabase/migrations/20260729161854_m2_01_goal_model.sql` — normalized goal
  schema, RLS/grants, indexes, constraints, and the single ADR-009 transaction.
- `supabase/migrations/20260729174620_m2_01_review_corrections.sql` — forward
  correction rejecting null activity-area elements and adding the exact
  lifecycle foreign-key index.
- `supabase/tests/database/m2_01_goals.test.sql` — 55 direct schema,
  authorization, lifecycle, rank, conflict, archive, and delete assertions.
- `supabase/tests/database/m2_01_review_corrections.test.sql` — 40 direct
  review-regression assertions for constraints/indexes, tier appends, stale
  rollback, cross-owner IDs/arrays, and full-core rollback.
- `supabase/tests/integration/m2_01_concurrent_goal_mutations.mjs` — genuine
  simultaneous third-core write proof with synthetic cleanup.
- `supabase/tests/integration/m2_01_concurrent_reorder_lifecycle.mjs` — genuine
  simultaneous reorder/lifecycle proof with exact status and final-state
  assertions plus synthetic cleanup.

### Modified

- `docs/product/DATA-MODEL-OVERVIEW.md` — records the in-development goal,
  collection-revision, and lifecycle-event shape without marking it accepted.
- `package.json` — adds ticket-specific third-core and reorder/lifecycle
  concurrency commands.
- `src/app/home/you/page.tsx` — links the existing You surface to goal
  management without inventing memory/onboarding behavior.
- `src/architecture/server-boundary.test.ts` — permits and checks the one
  ADR-009 repository RPC boundary and its explicit retry behavior.
- `src/lib/supabase/database.types.ts` — regenerates local schema types for the
  goal tables, receipt, and mutation while retaining existing nullable M1 RPC
  arguments.

### Deleted

- None.

### Renamed

- None.

## Migration, data, API, and test effects

- The initial forward migration creates three owner-scoped record categories,
  one composite receipt type, and one privileged authenticated RPC. A second
  forward migration tightens the array constraint and adds one supporting
  index without rewriting deployed history.
- No existing training record is rewritten and no seed or remote data is
  changed.
- The application gains owner-only reads and proposal-free goal mutations; no
  browser credential or direct table write is introduced.
- Tests add 95 M2-01 pgTAP assertions, two genuine-concurrency integration
  tests, focused domain/repository/action/UI/architecture coverage within the
  229-test application suite, and one complete production browser flow.

## Independent review and product-owner acceptance

The first independent review of the initial implementation produced findings.
The builder committed the corrections as
`ae7d3104899fb93499fde5273cb7e372d2b2457e`. Under the delivery protocol that
correction invalidated the earlier approval until an independent re-review of
the exact corrected commit.

That re-review did not happen. On 30 July 2026 the product owner stated they
had personally tested M2-01 on the ticket's Vercel Preview and accepted the
slice, explicitly waiving the required independent exact-commit re-review. This
is a recorded conscious deviation from the AGENTS.md delivery protocol, not an
omitted step. The accepted behavior therefore rests on the builder's automated
evidence in this record plus the product owner's own Preview verification; no
second agent reconciled the corrected diff.

Preview evidence for the accepted runtime:

| Commit    | Contents                        | Vercel Preview                                                                   |
| --------- | ------------------------------- | -------------------------------------------------------------------------------- |
| `ae7d310` | last runtime/migration/test commit | build status remained `pending` and was superseded by the following commits     |
| `9a998b8` | documentation only              | `success` — `https://vercel.com/mattis-3657s-projects/fittip/6NRcBJdH9NfVSMXKKua17zyrYmZJ` |
| `5f97562` | documentation only              | `success` — `https://vercel.com/mattis-3657s-projects/fittip/jTuVd8tk9LXvQtUAEeAa4SkXfauU` |

`git diff ae7d310..5f97562` touches only the five documentation files listed in
this record, so every succeeded Preview deploys exactly the runtime, migration,
and test behavior of `ae7d3104899fb93499fde5273cb7e372d2b2457e`. That commit is
the accepted implementation.

The open reviewer items listed under known limitations were not closed before
acceptance. They remain the honest state of this record.

## Acceptance withdrawn (30 July 2026)

Later on 30 July 2026 the product owner withdrew the waiver recorded above,
stating that M2-01 should receive the full independent exact-commit review. The
acceptance rested on that waiver, so it is withdrawn with it and M2-01 returns
to **testable**.

Nothing above this section is rewritten. The waiver happened, and this record
continues to say so; this section records only what changed afterwards.

Required before acceptance is requested again:

- An independent exact-commit review of
  `ae7d3104899fb93499fde5273cb7e372d2b2457e`, reconciling the complete manifest
  against the real diff.
- Closure, or explicit re-acceptance, of the open reviewer items still listed
  below under known limitations.
- A conclusion on
  [M2-05](../../backlog/M2/M2-05-INTERMITTENT-GOAL-MUTATIONS.md), which records
  goal creates, reorders, and deletes intermittently failing to apply with no
  error shown, at a measured one-in-two rate in continuous integration. That
  behavior is inside this ticket's accepted contract and is exactly what an
  independent review of the corrected diff might have caught.
- A green continuous-integration run for the reviewed commit.

The implementation remains merged on `master` and deployed. Withdrawing
acceptance does not revert code; it reopens the gate that governs dependent
work, so M2-02 must not start until M2-01 is accepted again.

## Known limitations and next gate

- The corrected implementation was never independently re-reviewed. Acceptance
  waived that gate; no second agent reconciled the corrected diff, so this
  record's automated evidence and the product owner's Preview verification were
  the complete basis for that acceptance. The waiver was withdrawn on 30 July
  2026 and the review is now required; see
  [Acceptance withdrawn](#acceptance-withdrawn-30-july-2026).
- Every automated result in this record is from the local stack. Hosted
  migration, RLS, advisor, and security verification against the founder
  environment were not performed by this builder and remain required after the
  merge.
- This record does not yet list the `vercel-react-best-practices` rules checked
  or the `frontend-design` treatment applied, `supabase gen types typescript`
  was not repeated after the correction migration, and repository-wide
  `format:check` and root-config `npm run test:e2e` were not run as part of the
  final evidence. Those are open reviewer items rather than known product
  limitations.
- The normal delete action is intentionally narrow: retained lifecycle history
  requires archive. Future plan/proposal/completion references must preserve
  that same archive-first rule when separately approved.
- M2-02 memory and M2-03 onboarding/publication behavior remain absent.

The post-merge founder deployment and hosted verification are complete and
recorded below. M2-01 no longer blocks dependent M2 work.

## Post-merge record

The accepted branch was merged to `master` by fast-forward on 30 July 2026,
preserving the existing linear history. No merge commit was created.

- Resulting `master` SHA: `f380776fe0b97a7b5b3376e66dc02e6adf543bfe`, pushed to
  `origin/master` as `67427db..f380776`.
- Founder Vercel deployment for that SHA completed successfully:
  `https://vercel.com/mattis-3657s-projects/fittip/GwmdteSAn8i24z9xuQSoUaMMNtBB`.
- Founder alias: `https://fittip-gilt.vercel.app/`.

### Hosted checks performed

An anonymous boundary check ran against the founder alias on 30 July 2026:

| Request                       | Result                                                        |
| ----------------------------- | ------------------------------------------------------------- |
| `GET /`                       | `200` with `private, no-cache, no-store, max-age=0, must-revalidate` |
| `GET /home/you/goals`         | `303` to `/` with `private, no-cache, no-store, must-revalidate, max-age=0` |

The new authenticated goal route is therefore unreachable anonymously on the
founder deployment and is not cached by the edge.

On 30 July 2026 the product owner reported that `/home/you/goals` loads on the
founder deployment and that the `390x844` goal walkthrough recorded above
passes there. This is the product owner's own manual verification, not a
builder-run or automated hosted test.

### Hosted database

Read-only checks ran on 30 July 2026 against linked project
`FitTip Founder Staging`, `ACTIVE_HEALTHY` on PostgreSQL 17.6.1.147. No
migration was pushed and no hosted schema, data, or setting was changed.

`supabase migration list --linked` reported seven migrations with every local
timestamp matching its remote entry and no drift in either direction:

1. `20260723084625`
2. `20260727082635`
3. `20260728105226`
4. `20260728143000`
5. `20260728170000`
6. `20260729161854` — M2-01 goal model
7. `20260729174620` — M2-01 review corrections

Both M2-01 migrations were therefore already applied to the founder project
before this check, through the normal migration history rather than an
out-of-band schema change.

`supabase db lint --linked --level warning` reported no schema errors in the
`public` or `extensions` schemas.

### Advisor disposition

`supabase db advisors --linked --type performance --level warn` reported no
issues.

`supabase db advisors --linked --type security --level warn` reported exactly
four warnings, all previously classified or expected:

- `apply_goal_change` is executable by `authenticated` as a `SECURITY DEFINER`
  function. This is the intended and only approved goal write boundary under
  [ADR-009](../../decisions/ADR-009-M2-GOAL-MUTATION-TRANSACTION.md). It is the
  single new finding introduced by M2-01.
- `save_manual_plan_version` and `save_training_completion` carry the same
  warning as the accepted M1 transaction boundaries under
  [ADR-008](../../decisions/ADR-008-M1-TRAINING-RECORD-TRANSACTIONS.md),
  unchanged from the M1 closeout.
- Leaked-password protection remains disabled, as already accepted for the
  owner-only founder environment in M0-06A. It must be resolved through the
  separate external-use gates before friends, public registration, or
  commercial use.

No advisor reported a disabled-RLS, exposed-table, or anonymous-access finding
for `goals`, `goal_collections`, or `goal_lifecycle_events`. Those checks are
`ERROR` level and were within the requested threshold, so their absence is
positive evidence that RLS remained enabled on all three new tables after the
hosted migration.

No unexpected hosted finding was produced, so no M2-01 correction is required.
