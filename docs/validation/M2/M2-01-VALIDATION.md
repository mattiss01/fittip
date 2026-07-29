# M2-01 builder validation: goal model and management

**Ticket:** [M2-01](../../backlog/M2/M2-01-GOAL-MODEL-VALIDATION.md)

**Lifecycle state:** builder implementation complete; awaiting independent
exact-commit review

**Branch:** `ticket/m2-01-goal-model`

**Exact implementation commit:**
`d40df06a23519fd937ac2b38028d80410926a544`

**Initial validation-record commit:**
`68ddd8722791f2247c957ac7893459b74431a7f0`

The implementation commit contains all runtime, migration, test, generated
type, developer-documentation, and screenshot changes. The initial
validation-record commit adds this handoff document. A later
documentation-only branch-head correction adds the validation record to its
own 29-file branch-diff manifest; its exact SHA is reported in the builder
handoff because a commit cannot contain its own final SHA. No implementation
behavior changed after `d40df06a23519fd937ac2b38028d80410926a544`.

**Architecture:** [ADR-009](../../decisions/ADR-009-M2-GOAL-MUTATION-TRANSACTION.md)

## Delivered behavior

- Authenticated users manage sport-agnostic goals at **You → Goals**.
- Active core and supporting goals have independent contiguous ranks. Core
  attention is limited to three active records.
- Create, inspect, edit, reorder, pause, resume, achieve, abandon, explicit
  reopen, archive, and eligible permanent-delete operations are available.
- Recoverable validation and conflict responses preserve the submitted goal
  draft. A stale collection revision is never silently overwritten.
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
activity-area labels of 60 characters each, target/event detail 500, optional
metric label/value/unit 80/120/40, rationale 500, and goal constraints 1000.
Target dates cannot precede start dates. Categories are performance/event,
skill, strength, endurance, mobility, body composition, recovery/general
fitness, or other.

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

| Check                                                                           | Result                                                                                                             |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `npx.cmd supabase db reset --local`                                             | PASS — all six migrations applied cleanly, including `20260729161854_m2_01_goal_model.sql`                         |
| focused `supabase test db --local supabase/tests/database/m2_01_goals.test.sql` | PASS — 55 assertions                                                                                               |
| complete `supabase test db --local supabase/tests/database`                     | PASS — 4 files, 232 assertions                                                                                     |
| `supabase db lint --local --level warning --fail-on warning`                    | PASS — no schema errors                                                                                            |
| `supabase db advisors --local --type all --level warn --fail-on warn`           | PASS — no security or performance findings                                                                         |
| `supabase gen types typescript --local`                                         | PASS — committed types regenerated; existing nullable M1 RPC compatibility retained and the PowerShell BOM removed |
| `test:m2-01-concurrency` under Node 24.18                                       | PASS — simultaneous third-core creates returned exactly one `200` and one `409`; revision 3; core ranks 1–3        |

The 55 focused assertions cover exact objects, function ownership/search path,
RLS, privileges, anonymous denial, direct-write denial, cross-owner
isolation, independent ranking, lifecycle transitions, reopen audit, stale
rollback, fourth-core rejection, archive/delete behavior, and date validation.

### Application and production browser

| Check                                                       | Result                                                      |
| ----------------------------------------------------------- | ----------------------------------------------------------- |
| full `npm.cmd run lint` under Node 24.18                    | PASS                                                        |
| final scoped ESLint after the draft-preservation correction | PASS                                                        |
| full `npm.cmd run typecheck` under Node 24.18               | PASS                                                        |
| full `npm.cmd run test:run` under Node 24.18                | PASS — 39 files, 226 tests                                  |
| final focused action/component rerun                        | PASS — 2 files, 9 tests                                     |
| `npm.cmd run build` under Node 24.18                        | PASS — `/home/you/goals` is a dynamic route                 |
| bounded production Playwright flow                          | PASS — 1 test at exactly `390x844`, 5.9 seconds             |
| scoped Prettier check/write                                 | PASS — no scoped formatting changes after final correction  |
| repository-wide `format:check`                              | known baseline — 108 older files remain outside this ticket |
| `git diff --check`                                          | PASS                                                        |

The production Playwright flow provisions and removes only a disposable
confirmed `example.test` account. It proves empty-state navigation, three core
plus one supporting goal, fourth-core rejection with draft preservation,
stale-tab conflict, reorder, edit, pause/resume, archive, eligible hard delete,
no horizontal overflow, and no page errors.

## Mobile demo path and screenshots

1. Start the local Supabase stack and expose its local public URL and
   publishable key to the application.
2. Build and start the app with Node 24.18.
3. Sign in with the founder or a disposable confirmed synthetic account.
4. Open **You → Manage goals** at `390x844`.
5. Create three core goals and one supporting goal.
6. Attempt a fourth core goal and confirm the draft remains editable beside
   the conflict.
7. Open the route in another tab, mutate the first tab, and confirm the stale
   tab refuses to overwrite it.
8. Exercise reorder, edit, pause/resume, archive, and eligible delete.

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
  now uses an explicit `text[]` initializer; a second clean reset, all 232
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
  29-file branch-diff manifest, privilege matrix, validation evidence,
  screenshots, corrections, limitations, and exact implementation boundary.
- `docs/validation/M2/evidence/M2-01-core-supporting-390x844.png` — synthetic
  mobile evidence of independent core and supporting ranks.
- `docs/validation/M2/evidence/M2-01-destructive-action-390x844.png` —
  synthetic mobile evidence of archive/delete consequence copy.
- `docs/validation/M2/evidence/M2-01-fourth-core-390x844.png` — synthetic
  mobile evidence of the core-limit conflict and retained draft.
- `docs/validation/M2/evidence/M2-01-stale-conflict-390x844.png` — synthetic
  mobile evidence that a stale tab cannot overwrite newer goals.
- `e2e/m2-01-goals.spec.ts` — complete disposable-user mobile goal-management
  flow, conflict proof, cleanup, overflow check, and screenshot capture.
- `e2e/m2-01.playwright.config.ts` — isolated port, exact viewport/timezone,
  and bounded Playwright timeouts.
- `src/app/home/you/goals/action-state.ts` — client-safe action result and
  recoverable goal-draft contract.
- `src/app/home/you/goals/actions.test.ts` — server-action mapping, safe error,
  revalidation, and retained-draft tests.
- `src/app/home/you/goals/actions.ts` — authenticated server actions for the
  approved repository operations and safe result mapping.
- `src/app/home/you/goals/error.tsx` — private read failure and retry state.
- `src/app/home/you/goals/goals.module.css` — mobile ledger layout, core-slot
  signal, controls, focus, reduced-motion, and responsive treatment.
- `src/app/home/you/goals/loading.tsx` — honest private goal loading state.
- `src/app/home/you/goals/page.test.tsx` — owner-scoped page mapping and
  unavailable-read behavior.
- `src/app/home/you/goals/page.tsx` — authenticated server page and minimal
  serialized goal view.
- `src/components/goals/goal-manager.test.tsx` — tier separation, active-rank,
  and historical-section component coverage.
- `src/components/goals/goal-manager.tsx` — create/edit/reorder/lifecycle UI,
  independent lists, conflict announcements, and retained drafts.
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
- `supabase/tests/database/m2_01_goals.test.sql` — 55 direct schema,
  authorization, lifecycle, rank, conflict, archive, and delete assertions.
- `supabase/tests/integration/m2_01_concurrent_goal_mutations.mjs` — genuine
  simultaneous third-core write proof with synthetic cleanup.

### Modified

- `docs/product/DATA-MODEL-OVERVIEW.md` — records the in-development goal,
  collection-revision, and lifecycle-event shape without marking it accepted.
- `package.json` — adds the ticket-specific concurrency test command.
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

- One forward local migration creates three owner-scoped record categories,
  one composite receipt type, and one privileged authenticated RPC.
- No existing training record is rewritten and no seed or remote data is
  changed.
- The application gains owner-only reads and proposal-free goal mutations; no
  browser credential or direct table write is introduced.
- Tests add 55 pgTAP assertions, one genuine-concurrency integration test, 29
  focused domain/repository/action/UI/architecture tests within the 226-test
  suite, and one complete production browser flow.

## Known limitations and next gate

- The exact implementation commit has not been pushed, preview-deployed, or
  independently reviewed by this builder. Those are lead/reviewer workflow
  gates.
- Hosted migration, RLS, security, and mobile verification remain required on
  the ticket preview before product-owner acceptance.
- The normal delete action is intentionally narrow: retained lifecycle history
  requires archive. Future plan/proposal/completion references must preserve
  that same archive-first rule when separately approved.
- M2-02 memory and M2-03 onboarding/publication behavior remain absent.

The independent reviewer must reconcile this manifest against the exact diff,
review `d40df06a23519fd937ac2b38028d80410926a544`, and verify the matching Vercel
Preview before the lead requests product-owner acceptance.
