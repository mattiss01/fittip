# M2-03 builder validation: guided onboarding and context review

**Ticket:** [M2-03](../../backlog/M2/M2-03-INTAKE-FACT-REVIEW.md)

**Lifecycle state:** in development; builder handoff is complete, independent
exact-commit review, branch CI, Vercel Preview verification, and product-owner
acceptance remain required.

**Implementation correction commit:**
`2bb141f65066ff4ff4cb1b4b87485e71e3611844`

**Final re-review correction commit:**
`bdada36a671e56d0e6389e57e87abcbd92c6cf9b`

**Branch:** `ticket/m2-03-guided-onboarding`

**Base:** `7d066fc157e7acad7a7cd97f32d3da59a4cfb99c`

**Architecture decision:**
[ADR-011](../../decisions/ADR-011-M2-ONBOARDING-PUBLICATION-BOUNDARY.md)

## Approved cleanup clarification — 3 August 2026

The product owner approved automatic expired-draft cleanup once daily inside
PostgreSQL. ADR-011 fixes the job at `03:17 UTC`, accepts up to 24 hours of
deletion lag after the 30-day expiry, and permits no HTTP, Edge Function,
network credential, external provider, or remote command. Governance commit
`e3db3b1` records that approval before implementation.

## Delivered behavior

- A verified owner can start, explicitly save, leave, resume, cancel, restart,
  and publish a six-step setup at `/home/you/onboarding`.
- Home offers the one-time optional invitation and **Not now** dismissal; You
  keeps the permanent guided-setup entry.
- Deterministic structured answers create review-only goal and Memory
  candidates. Every candidate requires an accept or reject decision, with an
  explicit create, keep, or update conflict resolution where applicable.
- Publication applies the accepted subset through the accepted M2-01 and M2-02
  mutation boundaries in one owner-scoped, revision-checked, idempotent
  transaction. It deletes the draft and candidates and retains one
  content-free receipt.
- Draft rows expire after 30 inactive days. One private `pg_cron` job purges
  expired rows daily at `03:17 UTC`; the next owner touch is a second
  deterministic purge path. Cancel and successful publication purge them
  immediately.
- The database exposes owner reads under RLS but no direct authenticated
  writes. The only authenticated write entry is
  `apply_onboarding_change(...)`; private validation helpers grant no API-role
  execution.
- Intake-confirmed Memory preserves accepted provenance. A later owner edit
  clears confidence without rewriting origin or confirmation history.
- The Constraints step repeats the approved non-diagnostic safety notice.
  Optional health-adjacent answers infer no severity and block no publication.
- The 390px continuation is part of the already CI-invoked
  `e2e/auth.spec.ts`; no `.github/**` change was needed.

## Migration, data, and API effects

- Migration `20260802201214_m2_03_guided_onboarding.sql` creates six
  owner-scoped onboarding tables, their constraints, indexes, RLS policies,
  explicit privileges, private helpers, a content-free receipt type, and the
  single public mutation function.
- `memory_items.intake_field_key` supplies owner-scoped exact intake
  deduplication. A private trigger observes revisions written by the unchanged
  accepted Memory boundary and clears confidence only after owner-authored
  `edit` or `edit_and_accept` content changes. Unchanged acceptance preserves
  inference confidence and provenance.
- Review targets and allowed resolutions are recomputed from current owned
  Goal and Memory state inside `apply_onboarding_change`; submitted target
  UUIDs are never trusted merely because the owner owns them.
- Inactive exact Memory matches are surfaced as conflicts. Explicit acceptance
  activates proposed, archived, or rejected content through forward-preserved
  M2-02 operations on the deterministic existing item ID.
- `pg_cron` owns exactly one named daily job. Its private cleanup function has
  no API-role execution grant and uses no HTTP, credential, provider, or remote
  command.
- Publication takes onboarding, goal-collection, then Memory-collection locks
  with bounded lock and statement timeouts. Any downstream failure rolls the
  mixed goal-and-Memory publication back.
- No completed activity, past plan, or accepted historical version is changed.
- No production AI call, external provider, service-role application client,
  analytics, email, browser persistence, or remote database mutation was
  added.

## Changed files

`git diff --stat 7d066fc157e7acad7a7cd97f32d3da59a4cfb99c..17cbea2657c4b2b0308f99d362238d19c94ef05b`

```text
 e2e/auth.spec.ts                                   |  136 +-
 src/app/home/home.module.css                       |   11 +
 src/app/home/today/page.test.tsx                   |   27 +-
 src/app/home/today/page.tsx                        |   18 +-
 src/app/home/you/onboarding/action-state.ts        |   22 +
 src/app/home/you/onboarding/actions.ts             |  199 +++
 src/app/home/you/onboarding/error.tsx              |   30 +
 src/app/home/you/onboarding/loading.tsx            |   13 +
 src/app/home/you/onboarding/onboarding.module.css  |  650 ++++++++
 src/app/home/you/onboarding/page.tsx               |   52 +
 src/app/home/you/page.tsx                          |   11 +
 .../onboarding/onboarding-home-invitation.tsx      |   52 +
 .../onboarding/onboarding-manager.test.tsx         |  168 ++
 src/components/onboarding/onboarding-manager.tsx   | 1004 +++++++++++
 src/lib/supabase/database.types.ts                 |  358 ++++
 src/server/onboarding/onboarding-privacy.test.ts   |   37 +
 src/server/onboarding/onboarding-records.test.ts   |  186 +++
 src/server/onboarding/onboarding-records.ts        |  375 +++++
 .../repositories/onboarding-repository.test.ts     |  158 ++
 src/server/repositories/onboarding-repository.ts   |  489 ++++++
 .../20260802201214_m2_03_guided_onboarding.sql     | 1743 ++++++++++++++++++++
 supabase/tests/database/m2_03_onboarding.test.sql  | 1015 ++++++++++++
 22 files changed, 6742 insertions(+), 12 deletions(-)
```

Purpose notes for paths whose role is not self-evident:

- `e2e/auth.spec.ts` extends the existing confirmed-account journey with the
  CI-invoked 390px onboarding path, so no service-role test credential is
  introduced.
- `src/app/home/home.module.css`, `src/app/home/today/page.tsx`, and its test
  add and prove the optional Home invitation without changing other Today
  behavior.
- `src/app/home/you/page.tsx` adds the permanent guided-review entry.
- `src/lib/supabase/database.types.ts` records the migration's generated
  tables, composite receipt, RPC, and Memory intake key. Existing GraphQL
  schema types and nullable completion arguments were preserved.
- `src/server/onboarding/onboarding-privacy.test.ts` scans the runtime
  onboarding modules for prohibited browser storage, logging, analytics,
  external-send, and service-role sinks.

No file was deleted or renamed.

## Tests and builder results

- `npx.cmd supabase db reset --local --no-seed` — **pass**; every migration
  applied from zero through M2-03.
- `npx.cmd supabase test db --local supabase/tests/database/m2_03_onboarding.test.sql`
  — **pass**, 70 assertions. Coverage includes grants/RLS, owner/anonymous and
  cross-owner isolation, explicit decisions, 30-day purge, cancel, provenance,
  context exclusion, idempotent retry, fourth-core rejection, and injected
  mixed-publication failure rollback.
- `npx.cmd supabase db lint --local --level warning --fail-on warning` —
  **pass**, no schema warnings.
- `npx.cmd supabase db advisors --local --type all --level warn --fail-on warn`
  — **pass**, no security or performance advisor findings.
- Focused Prettier write over all changed TypeScript, TSX, and CSS — **pass**
  with the checked-in local formatter.
- Focused ESLint over all changed TypeScript and TSX — **pass**.
- `tsc --noEmit` — **pass**. It passed under the pinned Node 24 runtime before
  the final SQL-only test addition and again under the installed local runtime
  after formatting and generated-type reconciliation.
- Focused Vitest — **pass**, 5 files and 19 tests:
  onboarding parsing, privacy sinks, repository behavior, manager behavior,
  and the Today invitation.
- `git diff --check` and staged secret-pattern scan — **pass**.

Project skill checks applied:

- `frontend-design`: serious-coach hierarchy, Context map destination stamp,
  explicit storage/no-AI and safety copy, keyboard focus, touch sizing,
  reduced motion, honest empty/error/result states, and 390px reflow.
- `vercel-react-best-practices`: authenticated server reads, parallel
  owner-scoped snapshot reads, server/client serialization boundary, no
  client-side secret or data fetch, and effects limited to router/DOM
  synchronization.
- `supabase:supabase` and
  `supabase:supabase-postgres-best-practices`: explicit privileges, owner RLS,
  security-definer search path, owner-derived identity, composite foreign-key
  indexes, canonical bounded locking, and transaction-level reuse of accepted
  goal and Memory invariants.

## First branch CI correction

Branch CI
[run 30768073121](https://github.com/mattiss01/fittip/actions/runs/30768073121)
against `8eeadf2ec6dfe1c0c96928bb1f99cfcb8b2f90c0` was **red** and
invalidated that review target and its Preview. Correction commit
`1c0f6b6292ffbb7fabdfca7b6d287f8dff6a705c` addresses every reported failure:

- Client onboarding code now imports constants and serializable view types
  from `src/lib/onboarding/onboarding-contract.ts`, not a server module.
- The architecture contract explicitly names `apply_onboarding_change` as the
  fifth approved atomic RPC whose client retry is disabled.
- M2-03 no longer moves or wraps the accepted public M2-02 Memory function.
  Its bounded lock wait, explicit PT409 lock-conflict mapping, and accepted
  edit-and-accept provenance, confidence, and confirmation behavior remain
  unchanged. Confidence clearing occurs inside reviewed onboarding updates,
  and the M2-03 pgTAP case now proves that exact path.
- The onboarding continuation explicitly sets the existing authenticated page
  to `390x844` before asserting the viewport and beginning the flow. The CI
  production build had passed; only the shared browser invocation's inherited
  `1280x720` viewport caused this browser failure.

Post-correction local results:

- Full Vitest: **pass**, 49 files and 346 tests.
- From-zero migration reset: **pass**.
- Combined pgTAP: **pass**, 7 files and 438 assertions, including all unchanged
  M2-02 tests and the corrected M2-03 suite.
- Full ESLint and `tsc --noEmit`: **pass**.
- Database lint and security/performance advisors: **pass**, no findings.
- Focused Prettier check and `git diff --check`: **pass**.

## Second branch CI correction

Branch CI
[run 30768498948](https://github.com/mattiss01/fittip/actions/runs/30768498948)
against `4666fbdc7f762f7ff09917c54f7acfe4380d13a5` was **red only in
the 390px authentication/onboarding flow**. The app, full database, and every
other browser job were green. After the first Goals step selected **Save and
finish later**, the page correctly stayed on onboarding because the action had
returned validation instead of the approved `/home/you` redirect.

Correction commit `b47c11a45ad9f8da2f9c3a97d1353aa566fc9ca0` fixes both
causes in the form-to-RPC boundary:

- Dynamic Goals and Current training parsers skip rows that were not rendered;
  they no longer treat the absent second through maximum rows as malformed
  submitted content.
- Validated blank optional goal fields become explicit empty values before the
  RPC. JSON serialization therefore preserves the exact key set required by
  the privileged database function.
- Action tests prove that the real one-rendered-goal payload returns the named
  finish redirect, and that database validation instead returns the visible,
  content-safe actionable state with no redirect.
- The 390px flow still requires the exact `/home/you` destination. Its polling
  diagnostic now reports any rendered action alert, rather than hiding the
  reason behind a URL-only timeout.

Post-correction local results:

- Focused action/parser/manager tests: **pass**, 3 files and 12 tests.
- Full Vitest: **pass**, 50 files and 348 tests.
- Full ESLint and `tsc --noEmit`: **pass**.
- Focused Prettier and diff/scope checks: **pass**.

## Third branch CI correction

Branch CI
[run 30769063418](https://github.com/mattiss01/fittip/actions/runs/30769063418)
against `ac69443e67c45201398699a9e0f5211c9426d598` was **red only in
the 390px authentication/onboarding flow**. App and database jobs were green.
The named save persisted successfully, but the production Server Action
revalidation replaced the rendered tree before the client effect reliably
observed its returned `redirectTo`; the page therefore stayed on onboarding.
The first diagnostic also matched Next's blank route-announcer `role=alert`
instead of the FitTip notice.

Correction commit `6be2ffcd471c8b591a9309117f0e2509d95de258` makes the
navigation boundary deterministic:

- After the persistence/error-mapping resolver succeeds, the Server Action
  calls Next's `redirect("/home/you")` outside the resolver's `try/catch`.
  Successful finish and cancel therefore use the framework's Server Action 303
  instead of a client effect.
- Validation, conflict, session, and persistence failures still return their
  content-safe actionable states and never call redirect.
- The client redirect effect is removed. The app notice now has a dedicated
  `data-onboarding-notice` marker, and Playwright diagnostics scope only to its
  error states rather than any framework alert.
- Action tests prove successful finish invokes the framework redirect,
  validation does not redirect, and the framework redirect throw escapes the
  persistence error mapper.

Post-correction local results:

- Focused action/parser/manager tests: **pass**, 3 files and 13 tests.
- Full Vitest: **pass**, 50 files and 349 tests.
- Full ESLint and `tsc --noEmit`: **pass**.
- Focused Prettier, secret, diff, and scope checks: **pass**.

## Fourth branch CI correction

Branch CI
[run 30769658497](https://github.com/mattiss01/fittip/actions/runs/30769658497)
against `ee60cfc2dae41fa2591a734e7477ef1b135bbb61` was **red only at
a post-publication Playwright assertion**. App and database jobs were green,
the full onboarding flow published successfully, and Memory contained the
accepted `I am not training currently.` item. The locator was ambiguous because
the same legitimate text appears in current content, the edit textarea, and
version history.

Correction commit `b09e4191e949542f84ea22835fccc9b668343313` keeps the exact
text assertion but scopes it to `[data-memory-content="true"]`, the semantic
marker for current Memory content. It does not use `.first()` or weaken the
assertion. The adjacent goal-title assertion is not equivalent: the title
renders once as the card heading, and it had already passed in this run.

Post-correction local results:

- Focused Prettier and ESLint: **pass**.
- Playwright discovery: **pass**, the mobile Chromium auth flow loads as one
  valid test.
- `tsc --noEmit`, diff, and scope checks: **pass**.

## Independent-review correction pass

The independent review of the pushed implementation found six blocking gaps:

1. `save_review` accepted any same-owner Goal or Memory UUID instead of
   proving it was the deterministic comparison target and that the submitted
   resolution was valid for that comparison.
2. Expired content had only owner-touch cleanup, before the product owner
   separately approved the single daily in-Postgres cleanup.
3. Confidence clearing was limited to onboarding publication instead of the
   accepted ordinary Memory edit boundary.
4. An exact Memory match could be proposed, archived, or rejected while the UI
   still called it already saved and publication could leave it inactive.
5. The full-rank preview included pending, rejected, and keep-existing
   candidates that would not change the published order.
6. The action notice received focus and was immediately overwritten by the
   step-heading effect; validation copy also claimed a highlighted step that
   the UI did not render.

The correction implements and proves the following:

- Trusted comparison enforcement is now transaction-local, deterministic by
  exact match then conflict target, and rejects forged same-owner targets with
  `PT409`. New accepts only `create`, active exact accepts only `keep`, active
  conflicts accept `keep` or `update`, and inactive Memory conflicts accept
  only the activating `update`.
- A single named `pg_cron` job calls only
  `private.purge_expired_onboarding_drafts()` at `03:17 UTC`. Reapplying the
  name leaves one job; API roles cannot execute the function; cascade deletion
  removes health-adjacent candidate content and creates no receipt.
- A forward trigger on the accepted M2-02 Memory write path clears obsolete
  confidence for ordinary `edit` and `edit_and_accept` revisions while
  preserving provenance, history, bounded locking, and conflict behavior.
- The repository and UI distinguish inactive exact Memory from active exact
  Memory, display the saved status, remove the inactive **Keep** option, and
  publish accepted proposed, archived, and rejected wording to active Memory
  deterministically.
- Rank preview applies only accepted `create` and `update` decisions. Rejected,
  pending, exact keep, and conflict keep decisions have no preview effect.
- Actionable errors retain focus on the notice; the step heading no longer
  overrides it. Validation copy now truthfully asks the owner to review the
  current step without claiming field highlighting.

Correction manifest:

`git diff --stat e3db3b1..2bb141f65066ff4ff4cb1b4b87485e71e3611844`

```text
 docs/validation/M2/M2-03-VALIDATION.md             | 109 +++++-
 src/app/home/you/onboarding/actions.test.ts        |   2 +-
 src/app/home/you/onboarding/actions.ts             |   2 +-
 .../onboarding/onboarding-manager.test.tsx         | 153 +++++++-
 src/components/onboarding/onboarding-manager.tsx   | 102 ++++--
 src/lib/onboarding/onboarding-contract.ts          |   1 +
 src/server/repositories/onboarding-repository.ts   |  47 ++-
 .../20260802201214_m2_03_guided_onboarding.sql     | 347 ++++++++++++++++--
 supabase/tests/database/m2_02_memory.test.sql      |   4 +-
 supabase/tests/database/m2_03_onboarding.test.sql  | 401 +++++++++++++++++++--
 10 files changed, 1048 insertions(+), 120 deletions(-)
```

No file was deleted or renamed. The migration adds no exposed write surface,
external service, credential, network call, `.github/**` change, or remote
database mutation.

Purpose notes for paths whose role is not self-evident:

- The accepted `m2_02_memory.test.sql` expectation changes because the approved
  forward trigger now clears confidence after `edit_and_accept`; all other
  M2-02 lock, conflict, provenance, history, and unchanged-acceptance tests
  remain intact.
- `onboarding-contract.ts` carries only the serialized existing-status value
  needed to make inactive Memory honest at the client boundary.

Post-correction local results:

- From-zero migration reset: **pass**.
- Complete pgTAP: **pass**, 7 files and 456 assertions.
- Full Vitest: **pass**, 50 files and 352 tests.
- Full ESLint and `tsc --noEmit`: **pass**.
- Database lint and security/performance advisors: **pass**, no findings.
- Pinned Node `24.18.0` production build: **pass**.
- Focused changed-file Prettier: **pass**. Repository-wide Prettier remains the
  unchanged CRLF/baseline failure across 143 pre-existing files; no unrelated
  formatting was committed.

## Final independent re-review correction

Independent re-review rejected evidence head
`4e2f85da75dc2c529c589bddc9f1a44f2d0892f3` for two remaining gaps:

1. The persisted-decision rank helper was correct after a save, but the
   uncontrolled Step 6 selects did not recompute the preview during the first
   review before submission.
2. Accepted exact rejected Memory created a second identical item instead of
   reactivating the deterministic existing target with ID continuity.

The builder correction resolves both without changing the approved cleanup,
authorization, privacy, or external-use boundaries:

- Step 6 owns one bounded selection map keyed by the current candidate IDs.
  Decision and resolution controls use that same state for form submission and
  preview derivation. A refreshed snapshot preserves still-valid live choices;
  changed candidate sets are reconciled and pruned on the next interaction.
- The preview starts from the complete active Goal order and applies accepted
  candidates sequentially by position. `create` inserts at the proposed rank;
  `update` removes the deterministic target then inserts the candidate; exact
  keep, conflict keep, reject, and pending make no change.
- The visible preview updates before submit and reports when current choices
  would exceed the maximum three core goals.
- A guarded forward `CREATE OR REPLACE` keeps the accepted M2-02 public
  function, signature, owner-derived identity, bounded lock, grants, receipt,
  and history behavior. It broadens only unchanged `accept` and
  `edit_and_accept` from proposed to proposed-or-rejected.
- Exact rejected onboarding publication now accepts the existing target.
  Changed rejected conflicts edit-and-accept that target. Both preserve the
  item ID and revision chain; unchanged wording preserves provenance and
  confidence, while the existing owner-edit trigger clears confidence only
  when wording changes.

Final correction manifest:

`git diff --stat 4e2f85da75dc2c529c589bddc9f1a44f2d0892f3..bdada36a671e56d0e6389e57e87abcbd92c6cf9b`

```text
 docs/validation/M2/M2-03-VALIDATION.md             |  71 ++++++-
 .../onboarding/onboarding-manager.test.tsx         | 150 +++++++++++++-
 src/components/onboarding/onboarding-manager.tsx   | 224 +++++++++++++++++----
 .../20260802201214_m2_03_guided_onboarding.sql     | 102 +++++++---
 supabase/tests/database/m2_03_onboarding.test.sql  |  56 ++++++
 5 files changed, 538 insertions(+), 65 deletions(-)
```

No file is deleted or renamed. No `.github/**`, credential, external service,
network call, remote database command, exposed write surface, or cleanup
schedule changes.

Final-correction local results:

- Focused interactive manager test: **pass**, including pending first-review
  selection changes, snapshot refresh preservation, keep/reject no-ops, update
  replacement, sequential rank insertion, and the fourth-core warning.
- Focused M2-02 plus M2-03 pgTAP: **pass**, 189 assertions.
- From-zero migration reset: **pass**.
- Complete pgTAP: **pass**, 7 files and 461 assertions.
- Full Vitest: **pass**, 50 files and 353 tests.
- Full ESLint and `tsc --noEmit`: **pass**.
- Database lint and security/performance advisors: **pass**, no findings.
- Pinned Node `24.18.0` production build: **pass** from the existing package
  cache. The first pinned attempt timed out without a build artifact; its
  workers exited, and the exact offline-cache retry completed successfully.

**Builder re-review verdict:** both findings are corrected at exact pushed
commit `bdada36a671e56d0e6389e57e87abcbd92c6cf9b`. Branch CI, its matching
Preview, and independent re-review remain required before the ticket can be
testable.

## Exact-commit review and hosted migration incident — 3 August 2026

- Exact evidence commit
  `d56c5f2b9cff4de70d4e23383e947b1c6eb0205f` passed branch CI:
  <https://github.com/mattiss01/fittip/actions/runs/30797771265>.
- Vercel deployment `dpl_4oFWTYHFrBnuWcetDLyjZihkd8if` reached `READY`
  for that exact commit at
  <https://fittip-n3nqyma5k-mattis-3657s-projects.vercel.app>.
- The independent reviewer approved the exact code and manifest with no
  remaining findings. Anonymous `390x844` verification passed, including the
  authenticated-route redirect, viewport width, absence of browser-storage
  keys, and absence of page errors.
- The first product-owner authenticated check exposed a delivery failure:
  `/home/today` showed **The records could not load** and
  `/home/you/onboarding` showed its error boundary. Hosted Supabase migration
  history ended at `20260801085404_m2_02_memory_model`; the committed
  `20260802201214_m2_03_guided_onboarding` migration had never been applied.
  API evidence matched the failure: onboarding-table reads returned `404` and
  the new `memory_items.intake_field_key` projection returned `400`.
- Root cause: CI applied every migration only to its disposable local Supabase
  stack. The Vercel Git deployment built application code but had no database
  deployment step. The lead requested acceptance after checking CI, the
  deployment SHA, and anonymous behavior without first comparing founder
  Supabase migration history or exercising the authenticated database-backed
  route.

### Hosted repair evidence

- The product owner explicitly authorized applying the migration and recording
  a preventive delivery gate.
- The reviewed migration file SHA-256 is
  `3B5D2361F5B9D050810334D5B9A1633F37781814F388FF23503E99F961F7137B`.
- An initial connector submission was rejected before execution because its
  SQL transport was truncated. A post-failure check proved that migration
  history, `onboarding_drafts`, and `memory_items.intake_field_key` remained
  unchanged.
- The lead reconstructed all `63,403` migration characters across eight
  bounded chunks, verified the first, cron, and final SQL markers, and applied
  the complete SQL successfully to **FitTip Founder Staging**.
- The connector initially recorded generated version `20260803090555`.
  After successful schema verification, the lead guardedly reconciled that
  single entry to repository version `20260802201214`; hosted migration history
  now matches the committed file name and version.
- Hosted schema verification found all six onboarding tables,
  `memory_items.intake_field_key`, and `pg_cron`. All six tables have RLS, the
  six owner-select policies are present, `authenticated` has select but no
  direct insert/update/delete, and `anon` has no table access.
- `authenticated` alone can execute the guarded public onboarding mutation;
  `anon` cannot. Neither `authenticated` nor `anon` can execute the private
  purge function.
- Exactly one active `fittip-onboarding-expiry-cleanup` job runs
  `select private.purge_expired_onboarding_drafts()` at `17 3 * * *`.
- Hosted advisors reported the intentional authenticated
  `SECURITY DEFINER` mutation-boundary warnings already covered by the ticket,
  the existing founder-staging leaked-password warning, pre-existing
  unindexed-foreign-key notices, and expected unused-index notices immediately
  after migration. No new authorization or migration correction was made from
  those notices.

## Product-owner acceptance and master closeout — 3 August 2026

- After the hosted migration repair, the product owner stated
  **“i accept m2-03”** against exact independently reviewed branch head
  `2dd7824c21057cf441ba70d68a460d0ba0522a8c` and its repaired Preview.
- Remote `master` was still at the approved ticket base
  `7d066fc157e7acad7a7cd97f32d3da59a4cfb99c`. The accepted history was a
  strict fast-forward with no intervening master work and was pushed directly
  to `master` at `2dd7824c21057cf441ba70d68a460d0ba0522a8c`.
- Exact master CI run
  <https://github.com/mattiss01/fittip/actions/runs/30801368695> completed
  successfully. All three jobs passed: application checks and production
  build; migrations, RLS, advisors, pgTAP, and concurrency; and the `390px`
  production browser flows.
- Founder deployment `dpl_EY2PcT1H2y96CVR4TJKFUxQuaNUc` reached `READY`,
  targets `production`, maps exactly to `2dd7824`, and owns the
  <https://fittip-gilt.vercel.app> alias.
- Post-merge hosted migration history ends at exact repository version
  `20260802201214_m2_03_guided_onboarding`; the temporary connector-generated
  version is absent.
- Post-merge hosted database checks reconfirmed all six onboarding tables,
  their six owner-select policies, RLS, authenticated select without direct
  table writes, no anonymous table access, the guarded authenticated mutation,
  no anonymous mutation access, no authenticated access to the private purge,
  and exactly one active `03:17 UTC` cleanup job.
- Hosted advisors still show only the intentional authenticated
  `SECURITY DEFINER` mutation boundaries, the previously accepted
  founder-staging leaked-password warning, pre-existing unindexed foreign keys,
  and expected unused indexes. The onboarding advisor entry is the approved
  public mutation boundary; there is no RLS or exposed-table finding.
- Anonymous fetches of `/`, `/home/today`, and `/home/you/onboarding` on the
  founder alias all returned the sign-in surface with `private, no-cache,
  no-store`, HSTS, and `noindex, nofollow, noarchive`.
- The exact founder deployment produced no error or fatal runtime logs during
  the closeout window. The only grouped onboarding persistence error in the
  preceding hour belongs to the pre-repair ticket Preview
  `dpl_4oFWTYHFrBnuWcetDLyjZihkd8if`, not the founder deployment.

M2-03 is **accepted**, merged, pushed, deployed, and hosted-verified. M2-04 is
now dependency-ready for a separate product-owner approval and dispatch.
