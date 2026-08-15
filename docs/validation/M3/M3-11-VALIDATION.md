# M3-11 validation record: legacy training reset

**Ticket:**
[M3-11](../../backlog/M3/M3-11-LEGACY-TRAINING-RESET.md)

**Lifecycle state:** accepted — implementation only; the founder database
cutover is not authorized

**Tier:** 1 — destructive schema/data, authorization, and founder deployment

**Product-owner acceptance:** 15 August 2026, against reviewed implementation
`ce1457683d29df87501b4cdf1371ff64c05710ed`, its green exact-SHA CI run
[31845125396](https://github.com/mattiss01/fittip/actions/runs/31845125396), and
the matching Preview `https://fittip-qyyfg9caj-mattis-3657s-projects.vercel.app`
(deployment `5914126429`).

**Scope of that acceptance.** It covers the implementation and its merge to
`master`, which is runbook step B1. It is explicitly **not** the destructive
authorization. Runbook step B3 requires the exact phrase **Run the destructive
cutover** and says in terms that product-owner acceptance of the ticket must not
be treated as that phrase. No hosted Supabase migration, deletion, or preflight
query has been run; sections A, B3-B6, and C of the runbook remain unexecuted.

**Branch:** `ticket/m3-11-legacy-training-reset`

**Approved implementation base:**
`cc60c11357cbeae1fa14b2fbe3293384d79945f7`

**Exact implementation review target:**
`ce1457683d29df87501b4cdf1371ff64c05710ed`

**Exact-target CI run:**
[31845125396](https://github.com/mattiss01/fittip/actions/runs/31845125396) —
`headSha` is exactly `ce1457683d29df87501b4cdf1371ff64c05710ed`, green on all
three jobs: static (lint, types, unit tests, build), database (migrations from
zero, RLS, advisors, concurrency), and the 390px production browser flows. The
lead pushed that commit as `ticket/m3-11-review-target` to obtain a run at the
implementation SHA. The evidence head `3bd980f` has its own green run,
[31845102708](https://github.com/mattiss01/fittip/actions/runs/31845102708).

The database job is the one that matters this round: it applies the corrected
migration from zero against the widened fixtures, which is the case that
reproduced the duplicate-key abort before the fix.

**Matching Vercel Preview:**
`https://fittip-qyyfg9caj-mattis-3657s-projects.vercel.app`
(deployment `5914126429`, state `success`).

As in the previous round, the deployment's reported Git SHA is the evidence head
`3bd980f`, **not** `ce14576`; Vercel does not build the `ticket/m3-11-review-target`
ref. `git diff --stat ce14576..3bd980f` is 1 file changed, 255 insertions, 71
deletions — this record alone, under `docs/`. No runtime, schema, migration,
fixture, route, style, or test change, so the deployed application is
byte-identical to the review target. Recorded as an exact statement of what was
verified rather than as a claim of SHA equality.

**Helper ref cleanup.** The two stale refs named in the previous round are
deleted from `origin`: `ticket/m3-11-implementation-review` (pointed at the
rejected `60583aa`) and the earlier `ticket/m3-11-review-target` (pointed at the
rejected `312a8ba`). The name `ticket/m3-11-review-target` now exists again,
created fresh at `ce14576`. No ref was force-updated; the old ones were deleted
and the new one created, so no history was rewritten. Still resolve the target
by SHA, never by ref.

**Invalidated evidence.** Independent review rejected
`312a8ba36c3af0c8fe9a1551f26394fcaf2e3a46` on the Spec axis. Its green CI run
[31842432354](https://github.com/mattiss01/fittip/actions/runs/31842432354) and
its matching Preview `https://fittip-eekbx1f3a-mattis-3657s-projects.vercel.app`
(deployment `5913704119`) approve nothing and are invalidated by the second
correction round. The evidence head `0df233b` and its run
[31842418730](https://github.com/mattiss01/fittip/actions/runs/31842418730) are
invalidated with it. Run `31838200437` belongs to the earlier rejected `60583aa`
and was already withdrawn.

CI was green on `312a8ba` because every seeded roadmap proposal carried exactly
one provenance source, which is precisely the case the defect does not reach.
A green run is evidence that the asserted cases hold, not that the unasserted
one does; the second round widens the fixture so the case is asserted.

The builder's local `auth.spec.ts` failure remains a Node 22.14.0 environment
artifact against the repository's `>=24.18.0` requirement and does not reproduce
in CI.

**Preview database state:** the Preview runs against the founder Supabase
project with the 11 legacy tables still present; the M3-11 migration has not
been applied to any hosted project. This is the intended order, not a gap. The
maintenance routes are static and query-free, so they must render correctly
before the destructive migration runs — exactly what runbook steps B1-B2
require and what the Preview is there to demonstrate.

**Independent review — round two: APPROVED on both axes.** A fresh reviewer,
distinct from both builders and from the round-one reviewer, reviewed exactly
`ce1457683d29df87501b4cdf1371ff64c05710ed` against base `cc60c11`.

It confirmed the round-one Spec defect is fixed structurally rather than patched
around, and independently verified: no semantic drift from the rewrite (the
folded `user_id` predicate selects an identical set because the original was an
inner join; `not exists` equals the old anti-join because `proposal_id` is
`NOT NULL` as that table's primary key); the new fixture genuinely exercises the
previously-broken path and carries an anti-erosion assertion; **no other
volatile-under-`DISTINCT` or fan-out pattern exists** anywhere in the migration,
fixtures, pgTAP, or runbook SQL; no dropped relation leaves an orphaned function
behind; the 11-table closure is unchanged; and the manifest reconciles exactly.

It answered the direct question — it would authorize this irreversible migration
against real founder data — subject to two conditions that are the lead's to
satisfy:

1. **The operator must work from this record at `3266a58` or later.** The
   migration SHA-256 changed with the fix. The copy of this record *inside the
   review target* `ce14576` still carries the superseded `bdf8eee6…`, so an
   operator comparing against that copy at runbook step A1 would abort on a
   false mismatch mid-preflight. Step A1 reads the value from this record's
   header rather than repeating a literal, so there is exactly one authoritative
   value and it is correct from `3266a58` onward.
2. **B1 and B2 must be genuinely completed and recorded before the phrase is
   requested at B3.** The runbook enforces that ordering in prose only; nothing
   mechanical prevents jumping to B3.

Three findings were raised as explicitly non-blocking: the live 1.51:1
`input:focus` ring (recorded under Known limitations and carried by M3-18), the
`mobile-navigation.tsx` line citation (corrected under Known limitations), and
an advisory to extend `src/architecture/m3-11-legacy-reset.test.ts` to the five
revoked roadmap RPCs alongside the six dropped ones. The advisory is not taken
in this ticket: no live call path exists today, and widening an architecture
invariant is a deliberate change rather than an incidental one. It belongs with
the M3-15 seam work that reconnects those RPCs.

**Superseded review targets:**

- `60583aab45dfb87d34eef89f0cbc49f5358d2373` — rejected on both Standards and
  Spec axes.
- `312a8ba36c3af0c8fe9a1551f26394fcaf2e3a46` — rejected on the Spec axis for the
  duplicate-key defect described under "Second correction round".

Their CI runs and `READY` Previews are historical only and approve nothing.

**Helper refs.** Resolved — see "Helper ref cleanup" in the header block. One
ref, `ticket/m3-11-review-target`, exists on `origin` at the current target
`ce14576`, solely to trigger exact-SHA CI. The two stale refs that pointed at
rejected commits are deleted. Still resolve the target by SHA, never by ref.

**Implementation commit:**
`e370dbe20d410488b13fd7ecd69a39f7f741314e`

**Isolated CI/tooling commit:**
`8486fa35b40a8512fc634590a2125cf18d783668`

**Builder correction commits:**

- `60583aab45dfb87d34eef89f0cbc49f5358d2373` — updates the preserved
  authentication browser journey for the maintenance heading and the permanent
  onboarding entry under You.
- `312a8ba36c3af0c8fe9a1551f26394fcaf2e3a46` — resolves the six
  independent-review findings recorded under "Review corrections applied".
- `ce1457683d29df87501b4cdf1371ff64c05710ed` — resolves the four findings
  recorded under "Second correction round". It is the new exact review target.

**Final validation evidence head:** the evidence-only commit that follows
`ce14576` records the target SHA and the reconciled manifest, and is where the
lead writes the exact-SHA CI URL and the matching Preview. It changes only this
document — no runtime, schema, or CI behavior — and so claims the
evidence-commit exception in `AGENTS.md`.

**Mobile evidence:**
[390x844 maintenance screenshot](evidence/M3-11-maintenance-390x844.png) —
refreshed after the contrast and focus correction; the primary action is
focused in the capture so the indicator is visible in the evidence.

**Exact-commit CI, Vercel Preview, independent review, hosted cutover, and
product-owner acceptance:** pending lead handoff. The builder did not contact a
hosted Supabase project or execute the founder runbook.

## Delivered behavior

- One forward migration deletes and drops the approved 11 legacy tables and
  their exclusive trigger, functions, four receipt types, policies, grants,
  indexes, and constraints without `CASCADE`.
- Legacy training, completion, manual planning, plan-proposal, and affected
  roadmap UI/runtime modules are removed. Static checks reject reintroduction
  of removed database calls and named server entry points.
- `/home/plan`, `/home/today`, `/home/log`, `/home/progress`,
  `/home/plan/roadmap`, and `/home/plan/proposal` render one shared, static,
  accessible maintenance presentation and perform no Supabase read or write.
- Preserved roadmap rows stay readable. Undecided proposals sourced from a
  legacy plan version or completion receive an explicit `expired` decision,
  and all five roadmap mutation RPCs are revoked until M3-15 replaces their
  context.
- `personal_activities`, the shared training-measurement validator, every
  M3-10 rolling-plan object, auth/profiles, goals, memory, onboarding, roadmap
  records, and AI accounting remain in place.
- Pure local-date and training-measurement helpers moved out of deleted legacy
  modules so preserved M3-10 and future AI plan contracts do not depend on the
  removed model.

The maintenance surface stays within the existing FitTip ledger typography,
colors, navigation, and reduced-motion rules. Its one orange left rail marks
the reset state without establishing a new product direction. It is a static
Server Component, so it adds no client bundle, serialized data, request
waterfall, or cross-request state. The primary action and the shared home focus
outline now use the ledger ink/paper pair rather than the signal orange; see
"Review corrections applied" for the measured ratios and the blast radius of
that shared rule.

## Review corrections applied

Independent review rejected `60583aa` on both axes. Each finding and its
resolution:

1. **`README.md` overstated browser CI coverage.** The table row now names the
   four flows `.github/workflows/ci.yml` actually runs — authentication, M2-01
   goals, M2-02 memory, and M3-11 maintenance — instead of the planning, M1-03,
   and M1-04 flows this ticket deleted.
2. **Maintenance primary action contrast (3.89:1) and focus-outline adjacent
   contrast (1.92:1).** `.primaryAction` changes from `--ledger-signal` on
   white to `--ledger-paper` on `--ledger-ink`, measuring 14.0:1 for normal
   text. The shared focus outline changes from `#efaa84` to `--ledger-ink`,
   measuring 14.0:1 against the `--ledger-paper` surface the 2px offset exposes
   on both sides of the ring. `e2e/m3-11-maintenance.spec.ts` now computes both
   ratios in the page and asserts >= 4.5 and >= 3 rather than trusting a colour
   literal, and asserts the control has no outline at rest and a solid 3px 2px
   offset ring when focused, so the indicator is proven visible and not merely
   present. The 390x844 screenshot is refreshed with the action focused.

   Blast radius, stated precisely — the earlier wording overstated it and is
   corrected here. The changed rule is
   `.navigation a:focus-visible, .shell a:focus-visible,
   .shell button:focus-visible, .card summary:focus-visible` at
   `src/app/home/home.module.css:97-102`. Its reach is two different things:

   - `.navigation a:focus-visible` reaches the bottom navigation, which the
     home layout renders on **every** home route.
   - `.shell` and `.card` are consumed by
     `src/components/home/training-maintenance.tsx` (the six maintenance
     routes) and `src/app/home/you/page.tsx`, and `.shell` is also the `<main>`
     wrapper on the You goals, memory, and onboarding routes and their
     `loading`/`error` states.

   It does **not** follow that the `#efaa84` ring is gone from the product. The
   identical 1.92:1 ring is still present and untouched at
   `src/app/home/you/goals/goals.module.css:387`,
   `src/app/home/you/memory/memory.module.css:430`, and
   `src/app/home/you/onboarding/onboarding.module.css:181`, and
   `src/app/globals.css:212` still carries `#f4cba0` on the now-unused
   `.plan-shell`. Those three modules declare their own focus rules for the
   controls inside their managers. For `input`, `textarea`, and `select` the
   home-shell rule has no matching selector at all, so `#efaa84` unambiguously
   still applies; for `button`, `a`, and `summary` the two rules tie on
   specificity and the winner depends on stylesheet order in the bundle. Either
   way the defect survives on those surfaces.

   Leaving them alone is deliberate: goals, memory, and onboarding are
   preserved domains outside M3-11's approved scope, and widening a Tier 1
   destructive ticket to restyle them is the wrong place to take that risk. The
   residual ring is recorded under "Known limitations" and needs its own
   follow-up ticket, which this builder did not create. No other visual rule
   changed.
3. **The runbook requested the destructive phrase too early.** The phrase was
   preflight step A8, before the founder application had been deployed or
   verified. It is now section B3, an explicit authorization gate that comes
   after the maintenance deployment is live and verified (B1-B2) and
   immediately before the final state recheck (B4) and `db push` (B5).
   Preflight now ends with comprehension only, and says so.
4. **The runbook was not executable.** Sections A and C now carry copy-paste
   `psql` heredocs for the count snapshot, the decision fingerprint, the
   dependency-closure and inbound-foreign-key inventory, the catalog
   absence/presence checks, the RLS and table-privilege sweep, the function
   privilege matrix, and the `diff -u` comparisons between preflight and
   post-reset. Every query emits counts, catalog names, boolean privilege
   flags, or an md5 of identifiers and timestamps; none selects or prints row
   content. Each was executed against the local stack in both the pre-M3-11 and
   post-M3-11 schema states, so the runbook does not ship unverified SQL. A
   `begin; … rollback;` rehearsal of the migration against the founder database
   is deliberately excluded and the reason is written into the runbook.
5. **The seeded proof was too narrow.** `m3_11_pre_reset.sql` now also seeds an
   `auth.audit_log_entries` row, `goal_collections` with a goal and a lifecycle
   event, `memory_collections` with an item and revision, and three roadmap
   cases: one undecided proposal sourced from a legacy plan version, one
   accepted proposal with its roadmap version and head, and one rejected
   proposal sourced from a legacy completion. `m3_11_post_reset_verify.sql`
   asserts the preserved counts, the same-owner joins, that the accepted and
   rejected decisions keep their exact `decision`, `accepted_version_id`, and
   `decided_at`, that only the undecided source-dependent proposal becomes
   `expired`, and that the auth audit payload is unchanged.
6. **The record must carry the new evidence.** The header now separates the
   superseded target from the target the evidence-only commit records, and
   names the exact-SHA CI URL and matching `READY` Preview/deployment SHA as
   fields that commit must fill.

The review's advisory-only note — dead legacy selectors remaining in
`home.module.css` — is not addressed. Removing them is not required by any
correction above, and speculative CSS deletion inside a Tier 1 destructive
ticket is the wrong place to take that risk. It belongs in a Tier 3 cleanup.

## Second correction round

Independent review rejected `312a8ba` on the Spec axis. Four findings, and what
this round does about each.

1. **Blocking, Spec: the migration aborted on a duplicate key.** The statement
   that expires source-dependent roadmap proposals read
   `select distinct proposal.id, …, pg_catalog.clock_timestamp()` from
   `roadmap_proposals` joined to `roadmap_proposal_sources`. `clock_timestamp()`
   is `VOLATILE` and is evaluated per input row beneath the unique step, so
   `DISTINCT` deduplicated a tuple that included the differing timestamp and
   never collapsed the join's fan-out. A proposal with N matching legacy sources
   produced up to N rows for one `proposal_id`, which is the primary key of
   `roadmap_proposal_decisions` — see
   `20260810213904_m3_02_roadmap_proposals.sql:225`, "One terminal decision per
   proposal, enforced by the primary key".

   Real data reaches it. At the approved base,
   `src/server/ai/context-source.ts` emitted one `completion` source per
   completion group **plus** a `plan_version` source, so a real undecided
   proposal carries at least two legacy sources. The failure would have landed
   at runbook step B5 (`supabase db push --linked`), after the destructive
   authorization had already been given — the migration is one transaction, so
   it would have changed nothing, but it would have stalled the cutover at its
   least recoverable moment.

   The statement now selects from `roadmap_proposals` alone and expresses both
   predicates as `exists` / `not exists` subqueries. That removes the fan-out
   and the need for `DISTINCT` at once, and emits exactly one row per proposal
   by construction because `roadmap_proposals.id` is a primary key. Semantics
   are unchanged: only proposals holding a `plan_version` or `completion`
   source, only those with no existing decision, `decision = 'expired'`,
   `accepted_version_id` null, and the widened check constraint still satisfied.
   No `CASCADE`, no change to the 11-table scope, and no change to the accepted
   fail-closed `accept_roadmap_proposal` shim.

   Editing the migration file in place is correct here: it has not been applied
   to any hosted project, so the forward-only rule does not bind. Its SHA-256
   changes accordingly and is restated below.

2. **Blocking, Standards: no regression coverage.** Every proposal in
   `m3_11_pre_reset.sql` had exactly one source, which is exactly why a green CI
   run missed the defect. The fixture now seeds a second completion group
   (`completed_sessions` + `completion_heads`, an `unplanned` revision-1 row)
   and a fourth roadmap case: an undecided proposal with four provenance rows —
   one `goal`, one `plan_version`, and two `completion` — so three of them are
   legacy kinds and the fan-out is N=3.
   `m3_11_post_reset_verify.sql` asserts that this proposal ends with exactly
   one decision row, that it is `expired` with a null `accepted_version_id`,
   and that it still carries three legacy sources, so the case cannot be
   silently narrowed back to N=1 without the assertion failing.

   The coverage was checked for teeth rather than assumed. Run against the
   **old** statement with the new fixtures, `npm run test:m3-11-seeded-reset`
   fails at statement 4 of the migration, and the same statement executed
   directly reports `duplicate key value violates unique constraint
   "roadmap_proposal_decisions_pkey"` with
   `DETAIL: Key (proposal_id)=(31100000-0000-4000-8000-0000000000b2) already
   exists.` Against the corrected statement the same harness passes.

3. **Standards: an unsupported accessibility claim.** The previous record
   claimed the old `#efaa84` ring "failed WCAG 1.4.11 everywhere it applied" and
   that scoping the fix would have "left the same defect on the surfaces that
   remain in use". The diff does not support that: the identical ring is still
   present on the goals, memory, and onboarding modules, which declare their own
   focus rules. The claim and the "all home routes" radius description are
   rewritten under "Review corrections applied" item 2 to state the actual
   reach, and the surviving ring is now a known limitation needing its own
   follow-up ticket. Those three files are deliberately not touched — they are
   preserved domains outside this ticket's approved scope — and this builder did
   not create the follow-up ticket, which is the product owner's call.

4. **Minor: two undisclosed consequences.** The deleted
   `src/app/home/progress/[id]` deep link and the retained-but-unreferenced
   roadmap server modules are now recorded under "Known limitations".

## Complete change manifest

`git diff --stat
cc60c11357cbeae1fa14b2fbe3293384d79945f7..ce1457683d29df87501b4cdf1371ff64c05710ed`:

```text
 .github/workflows/ci.yml                           |   81 +-
 README.md                                          |   26 +-
 docs/validation/M3/M3-11-VALIDATION.md             |  979 +++++++++++++++
 .../M3/evidence/M3-11-maintenance-390x844.png      |  Bin 0 -> 56491 bytes
 docs/validation/README.md                          |    2 +
 e2e/auth.spec.ts                                   |   14 +-
 e2e/m1-03-quick-log.spec.ts                        |  244 ----
 e2e/m1-03.playwright.config.ts                     |   14 -
 e2e/m1-04-today-progress.spec.ts                   |  192 ---
 e2e/m2-09-lost-render.probe.ts                     |  407 ------
 e2e/m3-02-roadmap.spec.ts                          |  320 -----
 e2e/m3-02.playwright.config.ts                     |   19 -
 e2e/m3-03-plan-proposal.spec.ts                    |  210 ----
 e2e/m3-03.playwright.config.ts                     |   16 -
 e2e/m3-11-maintenance.spec.ts                      |  232 ++++
 ...wright.config.ts => m3-11.playwright.config.ts} |   10 +-
 e2e/planning.spec.ts                               |  322 -----
 package.json                                       |    3 +-
 scripts/patch-database-types.mjs                   |  152 +--
 scripts/patch-database-types.test.mjs              |  120 +-
 src/app/home/home.module.css                       |   17 +-
 src/app/home/log/actions.test.ts                   |  128 --
 src/app/home/log/actions.ts                        |  157 ---
 src/app/home/log/error.tsx                         |   26 -
 src/app/home/log/loading.tsx                       |   12 -
 src/app/home/log/log.module.css                    |  519 --------
 src/app/home/log/page.tsx                          |  134 +-
 src/app/home/plan/actions.test.ts                  |  169 ---
 src/app/home/plan/actions.ts                       |  179 ---
 src/app/home/plan/error.tsx                        |   19 -
 src/app/home/plan/loading.tsx                      |   12 -
 src/app/home/plan/page.test.tsx                    |  107 --
 src/app/home/plan/page.tsx                         |   87 +-
 src/app/home/plan/proposal/action-state.ts         |   26 -
 src/app/home/plan/proposal/actions.test.ts         |   97 --
 src/app/home/plan/proposal/actions.ts              |  205 ---
 src/app/home/plan/proposal/error.tsx               |   13 -
 src/app/home/plan/proposal/loading.tsx             |    7 -
 src/app/home/plan/proposal/page.tsx                |  132 +-
 src/app/home/plan/proposal/proposal.module.css     |  471 -------
 src/app/home/plan/roadmap/action-state.ts          |   42 -
 src/app/home/plan/roadmap/actions.test.ts          |  304 -----
 src/app/home/plan/roadmap/actions.ts               |  373 ------
 src/app/home/plan/roadmap/error.tsx                |   21 -
 src/app/home/plan/roadmap/loading.tsx              |   13 -
 src/app/home/plan/roadmap/page.test.tsx            |  236 ----
 src/app/home/plan/roadmap/page.tsx                 |  265 +---
 src/app/home/plan/roadmap/roadmap.module.css       |  584 ---------
 src/app/home/progress/[id]/page.test.tsx           |  150 ---
 src/app/home/progress/[id]/page.tsx                |  436 -------
 src/app/home/progress/error.tsx                    |   21 -
 src/app/home/progress/loading.tsx                  |   13 -
 src/app/home/progress/page.tsx                     |  226 +---
 src/app/home/today/error.tsx                       |   21 -
 src/app/home/today/loading.tsx                     |   13 -
 src/app/home/today/page.test.tsx                   |  157 ---
 src/app/home/today/page.tsx                        |  274 +---
 src/architecture/m3-11-legacy-reset.test.ts        |   88 ++
 src/architecture/server-boundary.test.ts           |   41 +-
 src/components/completions/quick-log-form.test.tsx |  167 ---
 src/components/completions/quick-log-form.tsx      |  405 ------
 .../completions/revision-history.test.tsx          |   83 --
 src/components/completions/revision-history.tsx    |  116 --
 src/components/home/browser-local-date.tsx         |    2 +-
 src/components/home/mobile-navigation.tsx          |    1 +
 src/components/home/training-maintenance.test.tsx  |   24 +
 src/components/home/training-maintenance.tsx       |   45 +
 .../plan-proposal/plan-proposal-days.test.tsx      |   57 -
 .../plan-proposal/plan-proposal-days.tsx           |  131 --
 .../plan-proposal/plan-proposal-manager.test.tsx   |  122 --
 .../plan-proposal/plan-proposal-manager.tsx        |  556 --------
 src/components/planning/activity-library.test.tsx  |  106 --
 src/components/planning/activity-library.tsx       |  258 ----
 src/components/planning/plan-editor.test.tsx       |  404 ------
 src/components/planning/plan-editor.tsx            |  869 -------------
 src/components/planning/session-composer.test.tsx  |  128 --
 src/components/planning/session-composer.tsx       |  892 -------------
 src/components/roadmap/roadmap-editor.tsx          |  364 ------
 src/components/roadmap/roadmap-manager.test.tsx    |  518 --------
 src/components/roadmap/roadmap-manager.tsx         |  799 ------------
 src/components/roadmap/roadmap-spine.tsx           |  174 ---
 src/features/completions/completion-types.ts       |  105 --
 src/features/completions/status-label.test.ts      |   16 -
 src/features/completions/status-label.ts           |   17 -
 src/features/plan-proposal/plan-proposal-copy.ts   |   17 -
 src/features/planning/planning-types.ts            |   93 --
 src/features/planning/planning-utils.ts            |    6 -
 .../completions => lib/date}/local-date.test.ts    |    2 +-
 .../completions => lib/date}/local-date.ts         |    0
 src/lib/supabase/database.types.ts                 |  960 +-------------
 src/server/ai/context-source.test.ts               |  222 ----
 src/server/ai/context-source.ts                    |  246 +---
 src/server/ai/plan-horizon.ts                      |    2 +-
 src/server/ai/spend.ts                             |    2 +-
 src/server/completions/completion-records.test.ts  |  157 ---
 src/server/completions/completion-records.ts       |  287 -----
 src/server/plan-proposal/plan-proposal-records.ts  |   60 -
 .../plan-proposal/plan-proposal-service.test.ts    |  211 ----
 src/server/plan-proposal/plan-proposal-service.ts  |  220 ----
 src/server/plan-proposal/plan-safety.test.ts       |   86 --
 src/server/plan-proposal/plan-safety.ts            |   34 -
 .../repositories/completion-repository.test.ts     |  309 -----
 src/server/repositories/completion-repository.ts   |  404 ------
 .../repositories/plan-proposal-repository.test.ts  |  118 --
 .../repositories/plan-proposal-repository.ts       |  263 ----
 src/server/repositories/rolling-plan-repository.ts |    2 +-
 .../training-record-repository.test.ts             |  471 -------
 .../repositories/training-record-repository.ts     |  629 ----------
 src/server/roadmap/roadmap-service.test.ts         |  306 -----
 src/server/roadmap/roadmap-service.ts              |  243 ----
 src/server/rolling-plan/rolling-plan.ts            |    6 +-
 src/server/training/past-plan-protection.test.ts   |  129 --
 src/server/training/past-plan-protection.ts        |   95 --
 src/server/training/training-measurements.test.ts  |   39 +
 src/server/training/training-measurements.ts       |  234 ++++
 src/server/training/training-records.test.ts       |  183 ---
 src/server/training/training-records.ts            |  527 --------
 .../20260814195107_m3_11_legacy_training_reset.sql |  154 +++
 .../tests/database/m1_01_training_records.test.sql | 1195 ------------------
 .../database/m1_03_completion_writes.test.sql      |  409 ------
 .../database/m3_02_roadmap_proposals.test.sql      | 1321 --------------------
 .../m3_03_plan_duration_correction.test.sql        |   84 --
 .../tests/database/m3_03_plan_proposals.test.sql   | 1012 ---------------
 .../database/m3_11_legacy_training_reset.test.sql  |  219 ++++
 .../tests/fixtures/m3_11_post_reset_verify.sql     |  217 ++++
 supabase/tests/fixtures/m3_11_pre_reset.sql        |  491 ++++++++
 .../integration/m1_01_concurrent_data_api.mjs      |  209 ----
 .../integration/m3_02_concurrent_acceptance.mjs    |  401 ------
 supabase/tests/integration/m3_11_seeded_reset.mjs  |   55 +
 129 files changed, 2943 insertions(+), 24904 deletions(-)
```

The review corrections alone, `git diff --stat
60583aab45dfb87d34eef89f0cbc49f5358d2373..312a8ba36c3af0c8fe9a1551f26394fcaf2e3a46`:

```text
 README.md                                          |  10 +-
 docs/validation/M3/M3-11-VALIDATION.md             | 727 ++++++++++++++++++---
 .../M3/evidence/M3-11-maintenance-390x844.png      | Bin 57513 -> 56491 bytes
 e2e/m3-11-maintenance.spec.ts                      |  91 ++-
 src/app/home/home.module.css                       |   6 +-
 .../tests/fixtures/m3_11_post_reset_verify.sql     |  89 ++-
 supabase/tests/fixtures/m3_11_pre_reset.sql        | 118 ++++
 7 files changed, 920 insertions(+), 121 deletions(-)
```

No file is added, deleted, or renamed by those corrections; all seven were
already in the ticket's scope. The migration, generated types, server modules,
`.github/**`, and `package.json` were untouched, and the migration SHA-256 was
unchanged from `60583aa`.

The second correction round alone, `git diff --stat
312a8ba36c3af0c8fe9a1551f26394fcaf2e3a46..ce1457683d29df87501b4cdf1371ff64c05710ed`:

```text
 docs/validation/M3/M3-11-VALIDATION.md             | 110 ++++++++++++++++-----
 .../20260814195107_m3_11_legacy_training_reset.sql |  30 ++++--
 .../tests/fixtures/m3_11_post_reset_verify.sql     |  37 ++++++-
 supabase/tests/fixtures/m3_11_pre_reset.sql        |  86 ++++++++++++++++
 4 files changed, 225 insertions(+), 38 deletions(-)
```

That range spans three commits: the lead's evidence-only `0df233b` and
`7757b3b`, which touch this document alone, and the builder's `ce14576`, which
touches only the three `supabase/**` files. No file is added, deleted, or
renamed, and all four were already in the ticket's scope. Application source,
generated types, `.github/**`, `package.json`, the Playwright specs, and the
screenshot are untouched. The migration file itself does change, so its SHA-256
changes with it; the new value is recorded below and supersedes the old one
everywhere, including runbook step A1.


Navigation notes for non-obvious files:

- `m3_11_pre_reset.sql`, `m3_11_post_reset_verify.sql`, and
  `m3_11_seeded_reset.mjs` form the local-only proof: reset to M3-10, seed at
  least one row through all 11 removed tables plus representative preserved
  domains, apply only M3-11, then assert absence, counts, references,
  expiration, and grants. The seed deliberately includes an undecided roadmap
  proposal with three legacy provenance sources, which is the regression case
  for the duplicate-key defect described under "Second correction round".
- `training-measurements.ts` retains only the shared validation used by M3-10;
  it contains no legacy persistence model.
- `local-date.ts` retains the pure timezone helper used by the AI horizon and
  browser-local date. Git records this and its test as renames out of the
  deleted completion feature.
- `patch-database-types.mjs` is now a no-op guard that fails if the removed
  completion RPC type ever reappears.
- `.github/workflows/ci.yml` is isolated in `8486fa3`; it replaces checks for
  intentionally deleted surfaces with the seeded reset and six-route mobile
  maintenance checks. It removes no still-supported domain gate.

Deletion note: every deletion is named in the stat above. They are limited to
legacy training/completion/manual-plan/plan-proposal runtime and tests, the
affected roadmap mutation UI/service, and tests/harnesses whose asserted
objects are deliberately removed. Rename note: Git detects the new M3-11
Playwright config as a 53% rename of the removed M1-04 config; the two
`local-date` files are intentional moves to a preserved shared module. No
other file is renamed.

## Data, migration, API, privacy, and security effects

- Migration `20260814195107_m3_11_legacy_training_reset.sql` is one-way. It
  explicitly deletes rows child-to-parent and drops the 11 approved tables
  without `CASCADE`: `plan_proposal_decisions`, `plan_proposal_sources`,
  `plan_proposals`, `plan_generation_requests`, `completed_activities`,
  `completion_heads`, `completed_sessions`, `planned_activities`,
  `planned_sessions`, `detailed_plan_heads`, and `detailed_plan_versions`.
- The committed migration SHA-256 is
  `5a243042c1862faf91fc80502d8590d82bb7d686b5f57f1a4a3b461b8609a735`, taken over
  the Git blob content (LF endings) so it reproduces on any checkout. It
  replaces `bdf8eee66e1ebe471ce23e354a07f58eb2fc2ef3740f08bbee073562b5036951`,
  which belongs to the rejected `312a8ba`; runbook step A1 must compare against
  the new value.
- It also drops the exclusive completion/manual-plan/plan-proposal functions,
  one completion trigger/function, and four plan receipt types. The generated
  TypeScript surface contains none of those names.
- It preserves roadmap proposals, sources, decisions, versions, and receipt
  types. A source-dependent undecided proposal becomes `expired`; already
  accepted or rejected decisions are unchanged.
- `begin_roadmap_generation`, `finish_roadmap_generation`,
  `record_roadmap_memory_candidates`, `apply_roadmap_proposal_change`, and
  `accept_roadmap_proposal` deny `EXECUTE` to `authenticated`, `anon`, and
  `service_role`. The retained acceptance signature is a fail-closed shim with
  empty `search_path` and no reference to a legacy relation.
- M3-10 authenticated owner reads/writes, same-owner references, RLS, grants,
  empty-slice behavior, and 12-way concurrency contract remain green.
- No remote data, backup, export, browser storage, analytics, AI provider,
  external service, credential, or paid resource was read or changed. The
  local service credential was supplied only to disposable test harnesses and
  was neither printed nor persisted.
- Current official Supabase guidance was checked before implementation:
  [changelog](https://supabase.com/changelog),
  [database migrations](https://supabase.com/docs/guides/deployment/database-migrations),
  and [function privileges](https://supabase.com/docs/guides/database/functions#function-privileges).
  The migration explicitly revokes function execution because functions are
  executable by `PUBLIC` by default unless privileges are tightened.

## Tests and builder results

Second correction round, run against this round's tree. The first two rows are
the negative control: they are supposed to fail, and they are what proves the
new fixture case exercises the previously broken path rather than passing
vacuously.

| Command or check | Result |
|---|---|
| `npm run test:m3-11-seeded-reset` with the new fixtures against the **old** `select distinct … join` statement | FAILS as intended; `supabase migration up` aborts at statement 4, which is the expiry insert, and the whole migration rolls back |
| that same old statement run directly inside `begin; … rollback;` on the seeded database | FAILS with `duplicate key value violates unique constraint "roadmap_proposal_decisions_pkey"`, `DETAIL: Key (proposal_id)=(31100000-0000-4000-8000-0000000000b2) already exists` |
| `npm run test:m3-11-seeded-reset` with the new fixtures against the **corrected** statement | PASS; the same fixture case now yields exactly one `expired` decision and every earlier assertion still holds |
| `npx supabase db reset --local --no-seed` | PASS; every migration applied from zero through the corrected M3-11 |
| `npx supabase test db --local supabase/tests/database/m3_11_legacy_training_reset.test.sql` | PASS; 49 assertions |
| `npx supabase db lint --local --level warning --fail-on warning` | PASS; no issues |
| `npx supabase db advisors --local --type all --level warn --fail-on warn` | PASS; no issues |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `git diff --check` | PASS |

Not re-run this round. It changes one SQL statement inside the migration, the
two seeded fixtures, and this document — no application source, generated type,
route, style, or Playwright spec — so the build, the 390x844 flow, the Vitest
files, the type-generation guard, and the runbook SQL are unaffected. CI re-runs
all of them for the new target, and that run is the authoritative evidence.

First correction round, run against `312a8ba`:

| Command or check | Result |
|---|---|
| `npx supabase db reset --local --no-seed` | PASS; all migrations applied from zero through M3-11 |
| `npm run test:m3-11-seeded-reset` | PASS with the expanded fixtures; all 11 removed tables plus the widened preserved domains seeded before reset, then absence, counts, same-owner references, accepted/rejected immutability, expiration, and the auth audit payload verified after |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npx prettier --check` on the changed non-documentation files | PASS |
| `npm run build` | PASS; all six maintenance routes compiled as dynamic authenticated routes |
| M3-11 production Playwright at `390x844` | PASS; 1 test, no skip, 1.6s; run against `build` + `start` on port 3019 with the local stack |
| mobile cache/overflow/console/page/legacy-request assertions | PASS |
| maintenance contrast and focus assertions | PASS; no outline at rest, solid 3px/2px-offset ink ring when focused, label contrast >= 4.5 and outline contrast >= 3 computed in the page |
| focused Vitest maintenance/architecture files | PASS; 3 files, 9 tests |
| every runbook `psql` block, executed against the local stack | PASS; run in both the pre-M3-11 (`20260814164502`) and post-M3-11 schema states, no SQL error, all heredocs terminate |
| runbook dependency-closure negative control | PASS; returns no row for the approved 11-table closure, and returns the three inbound roadmap foreign keys when pointed at `roadmap_proposals`, so the empty result is not vacuous |
| `git diff --check` | PASS |
| preserved production auth journey | STILL INCOMPLETE locally; see the note below |

Carried forward from `60583aa` and not re-run, because the corrections change
no migration, schema, generated type, or server module. CI re-runs all of them
for the new target:

| Command or check | Result |
|---|---|
| full local database pgTAP directory | PASS; 8 files, 491 assertions |
| M3-11 focused pgTAP | PASS; 49 assertions |
| database lint at warning/fail-on-warning | PASS; no issues |
| security and performance advisors at warn/fail-on-warn | PASS; no issues |
| generated types plus no-op patch guard | PASS; removed names absent, M3-10/personal activity names present |
| M3-10 real Postgres adapter contract | PASS; 5 tests, no skip |
| M3-10 concurrency harness | PASS; 12 races, each one winner/one `PT409`, cleanup verified |

Still pending, by design:

| Command or check | Result |
|---|---|
| exact-review-target CI | Pending lead push |
| matching Vercel Preview | Pending lead push |
| hosted migration/security/owner verification | Not run; deliberately blocked on review, acceptance gates, and exact founder phrase |

The builder used focused application checks while implementing; exact-target CI
remains the full automated-suite evidence.

**On the incomplete auth journey.** `e2e/auth.spec.ts` failed on both local
attempts, at a *different* onboarding step each time — once with the "Start
setup" Server Action still pending, once at the step 1 to step 2 transition —
and the previous builder recorded a third failure point at the step 5 save. No
server log line, browser console error, or page error accompanied any of them;
each was the spec's 5-second `expect` timeout elapsing while a Server Action was
in flight. Three different failure points across three runs is a slow
environment, not a deterministic break, and the guided-onboarding flow is
outside everything M3-11 changes. The concrete environmental cause is on record:
this machine runs Node 22.14.0 while `package.json` requires `>=24.18.0 <25`.
The same spec is green in CI on the pinned Node version — run
[31838200437](https://github.com/mattiss01/fittip/actions/runs/31838200437) for
`60583aa` reports `success` for all three jobs including "390px production
browser flows". The reviewer should treat exact-target CI, not this row, as the
evidence for that flow, and should treat a *red* browser job on the new target
as a real blocker rather than the same environmental noise.

## Non-executed founder cutover runbook

This runbook is a future lead/founder procedure, not builder evidence. Nothing
in it has been executed. It is ordered so the founder application is already
serving the reviewed maintenance surface before anyone is asked to authorize an
irreversible database change: preflight and the maintenance deployment are both
reversible, so they happen first, and the exact phrase
**Run the destructive cutover** is requested only at step B3, immediately
before the final state recheck and `db push`.

Every command below emits counts, catalog names, privilege flags, or hashes.
None of them selects, exports, or prints a user row.

Steps are written as headings rather than a numbered list so every fenced block
starts at column 0. That matters: an indented `SQL` line does not terminate a
`<<'SQL'` heredoc, so an indented block would hang the shell on paste.

Run from Git Bash, and hold the founder connection string in an environment
variable that is never echoed:

```bash
read -rs PGURI && export PGURI   # paste the founder connection string; no echo
export SNAPSHOTS="$(mktemp -d)"  # local, non-repository, deleted at C7
```

Every `psql` invocation uses `-v ON_ERROR_STOP=1` so a failed check aborts the
step instead of scrolling past.

### A. Preflight — read-only, reversible, no export

**A1. Identify the target.** Record the exact reviewed implementation target,
evidence head, CI URL, Preview URL/deployment Git SHA, founder project ref, and
the migration SHA-256 from the header of this record. Abort on any mismatch or
dirty checkout.

**A2. Confirm the destination.** The linked project must be the owner-approved
FitTip founder project and `git remote get-url origin` must be exactly
`https://github.com/mattiss01/fittip.git`. Do not print credentials.

**A3. Compare migration history.** Run `npx supabase migration list --linked`.
Remote and repository history must match through `20260814164502`;
`20260814195107` must be the only local pending version. Abort on drift.

**A4. Dry-run the push.**

```bash
npx supabase db push --linked --dry-run | tee "$SNAPSHOTS/dry-run-preflight.txt"
```

It must name only `20260814195107_m3_11_legacy_training_reset.sql`. Abort if any
other migration or destructive object appears.

**A5. Snapshot the counts.** Covers every `public` table, `auth.users`, and the
undecided source-dependent roadmap proposals the migration will expire.

```bash
psql "$PGURI" -v ON_ERROR_STOP=1 -A -F',' \
  > "$SNAPSHOTS/counts-preflight.csv" <<'SQL'
select 'public.' || c.relname as relation,
       (xpath('/row/c/text()',
              query_to_xml(
                format('select count(*) as c from public.%I', c.relname),
                false, true, '')))[1]::text::bigint as row_count
  from pg_catalog.pg_class as c
 where c.relnamespace = 'public'::regnamespace
   and c.relkind = 'r'
union all
select 'auth.users', count(*) from auth.users
union all
select 'derived.undecided_source_dependent_roadmap_proposals',
       count(distinct proposal.id)
  from public.roadmap_proposals as proposal
  join public.roadmap_proposal_sources as source
    on source.proposal_id = proposal.id
   and source.user_id = proposal.user_id
  left join public.roadmap_proposal_decisions as decision
    on decision.proposal_id = proposal.id
 where source.source_kind in ('plan_version', 'completion')
   and decision.proposal_id is null
 order by 1;
SQL
```

Record the resulting numbers in this document. Do not create a manual backup,
archive, dump, CSV of row content, or compatibility copy.

**A6. Fingerprint the decisions that must not change.** The hash covers
identifiers and timestamps only, so the C3 comparison needs no row content.

```bash
psql "$PGURI" -v ON_ERROR_STOP=1 -A -F',' \
  > "$SNAPSHOTS/decisions-preflight.csv" <<'SQL'
select decision,
       count(*) as decisions,
       md5(string_agg(proposal_id::text
                      || '|' || coalesce(accepted_version_id::text, '-')
                      || '|' || decided_at::text,
                      ',' order by proposal_id)) as fingerprint
  from public.roadmap_proposal_decisions
 group by decision
 order by decision;
SQL
```

**A7. Prove the dependency closure.** This lists every object *outside* the
approved closure holding a normal dependency on something the migration drops.
It must return no row; any row is an abort. Objects owned by a doomed table —
its own constraints, policies, defaults, triggers — are excluded, because the
migration drops them with their parent.

```bash
psql "$PGURI" -v ON_ERROR_STOP=1 -A -F',' <<'SQL'
with doomed as (
  select c.oid as oid, 'pg_class'::regclass as classid
    from pg_catalog.pg_class as c
   where c.relnamespace = 'public'::regnamespace
     and c.relname = any (array[
           'plan_proposal_decisions', 'plan_proposal_sources',
           'plan_proposals', 'plan_generation_requests',
           'completed_activities', 'completion_heads',
           'completed_sessions', 'planned_activities', 'planned_sessions',
           'detailed_plan_heads', 'detailed_plan_versions'])
  union all
  select p.oid, 'pg_proc'::regclass
    from pg_catalog.pg_proc as p
   where p.pronamespace = 'public'::regnamespace
     and p.proname = any (array[
           'reject_inactive_completion_activity',
           'save_training_completion', 'save_manual_plan_version',
           'reject_plan_proposal', 'record_plan_memory_candidates',
           'finish_plan_generation', 'begin_plan_generation',
           'plan_content_is_valid'])
  union all
  select t.oid, 'pg_type'::regclass
    from pg_catalog.pg_type as t
   where t.typnamespace = 'public'::regnamespace
     and t.typname = any (array[
           'plan_proposal_decision_receipt',
           'plan_memory_candidate_receipt', 'plan_generation_result',
           'plan_generation_receipt'])
),
dependent as (
  select d.classid, d.objid, d.objsubid,
         d.refclassid, d.refobjid, d.refobjsubid,
         coalesce(
           (select k.conrelid from pg_catalog.pg_constraint as k
             where d.classid = 'pg_constraint'::regclass and k.oid = d.objid),
           (select pol.polrelid from pg_catalog.pg_policy as pol
             where d.classid = 'pg_policy'::regclass and pol.oid = d.objid),
           (select g.tgrelid from pg_catalog.pg_trigger as g
             where d.classid = 'pg_trigger'::regclass and g.oid = d.objid),
           (select a.adrelid from pg_catalog.pg_attrdef as a
             where d.classid = 'pg_attrdef'::regclass and a.oid = d.objid),
           (select r.ev_class from pg_catalog.pg_rewrite as r
             where d.classid = 'pg_rewrite'::regclass and r.oid = d.objid),
           case when d.classid = 'pg_class'::regclass then d.objid end
         ) as owner_relation
    from pg_catalog.pg_depend as d
    join doomed as target
      on target.oid = d.refobjid
     and target.classid = d.refclassid
   where d.deptype = 'n'
)
select pg_catalog.pg_describe_object(
         classid, objid, objsubid) as dependent_object,
       pg_catalog.pg_describe_object(
         refclassid, refobjid, refobjsubid) as depends_on
  from dependent
 where not exists (select 1 from doomed as owner
                    where owner.classid = 'pg_class'::regclass
                      and owner.oid = dependent.owner_relation)
   and not exists (select 1 from doomed as self
                    where self.oid = dependent.objid
                      and self.classid = dependent.classid)
 order by 1, 2;
SQL
```

To confirm the query is not silently returning nothing, re-run it with the
`doomed` table array replaced by the single name `roadmap_proposals`. It must
then report the three inbound foreign keys from `roadmap_proposal_decisions`,
`roadmap_proposal_sources`, and `roadmap_versions`. If that control also returns
no row, the query is broken and the closure is unproven.

Then take the inventory the migration's named drops must account for. Every
`inbound_foreign_keys` reference must originate from another table in the same
list, which is exactly what the query above proves.

```bash
psql "$PGURI" -v ON_ERROR_STOP=1 -A -F',' \
  > "$SNAPSHOTS/closure-preflight.csv" <<'SQL'
select c.relname as legacy_table,
       (select count(*) from pg_catalog.pg_index as i
         where i.indrelid = c.oid) as indexes,
       (select count(*) from pg_catalog.pg_constraint as k
         where k.conrelid = c.oid) as constraints,
       (select count(*) from pg_catalog.pg_policy as pol
         where pol.polrelid = c.oid) as policies,
       (select count(*) from pg_catalog.pg_trigger as t
         where t.tgrelid = c.oid and not t.tgisinternal) as triggers,
       (select count(*) from pg_catalog.pg_constraint as k
         where k.confrelid = c.oid) as inbound_foreign_keys
  from pg_catalog.pg_class as c
 where c.relnamespace = 'public'::regnamespace
   and c.relname = any (array[
         'plan_proposal_decisions', 'plan_proposal_sources',
         'plan_proposals', 'plan_generation_requests',
         'completed_activities', 'completion_heads', 'completed_sessions',
         'planned_activities', 'planned_sessions', 'detailed_plan_heads',
         'detailed_plan_versions'])
 order by 1;
SQL
```

The authoritative closure proof remains the migration itself: it uses no
`CASCADE`, so an unexpected dependency aborts the whole transaction inside
`db push` and changes nothing. A `begin; … rollback;` rehearsal of the migration
against the founder database is deliberately **not** part of this runbook — one
mistyped `commit` would perform the destructive change outside migration
history, which is a worse risk than the one it would retire.

**A8. Record the privilege baseline** for the five roadmap mutation RPCs, so C2
is a comparison rather than a fresh judgement.

```bash
psql "$PGURI" -v ON_ERROR_STOP=1 -A -F',' \
  > "$SNAPSHOTS/privileges-preflight.csv" <<'SQL'
select p.oid::regprocedure::text as function_signature,
       grantee.rolname,
       pg_catalog.has_function_privilege(
         grantee.rolname, p.oid, 'EXECUTE') as can_execute,
       p.proacl is null as defaults_to_public_execute
  from pg_catalog.pg_proc as p
  cross join (values ('anon'), ('authenticated'), ('service_role'))
         as grantee(rolname)
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('begin_roadmap_generation',
                     'finish_roadmap_generation',
                     'record_roadmap_memory_candidates',
                     'apply_roadmap_proposal_change',
                     'accept_roadmap_proposal')
 order by 1, 2;
SQL
```

**A9. Confirm comprehension, not authorization.** The product owner must
understand that accepted plans, completions, and the named legacy history will
not be preserved, and that provider-managed retention/point-in-time recovery is
outside this ticket and has not been independently verified. This step asks for
understanding only. The authorization gate is B3, and preflight ends here.

Stop if any preflight check aborted. Everything above is read-only.

### B. Execution — maintenance first, authorize second, migrate last

**B1. Deploy the maintenance application.** Promote/merge the exact accepted
application result and wait for the founder Vercel deployment to reach `READY`.
This step is reversible: the database is untouched and the deployment can be
rolled back.

**B2. Verify the founder application before anything irreversible.** All six
affected routes must show the reviewed maintenance surface, make no legacy
call, and return `private` plus `no-store`; You, goals, memory, and onboarding
must still load. Abort and roll back the deployment if any route still calls a
legacy object. A failure here costs nothing, because no authorization has been
requested and no data has changed.

**B3. Authorization gate.** Only now — with the founder application already
maintenance-safe and every preflight check recorded — request the exact chat
phrase **Run the destructive cutover** from the product owner. Any paraphrase
is insufficient. Record the phrase verbatim, who sent it, and when, in this
document. Do not proceed on an inferred or implied approval, and do not treat
product-owner acceptance of the ticket as this phrase.

**B4. Final state recheck**, immediately after the phrase is recorded.

```bash
npx supabase migration list --linked
npx supabase db push --linked --dry-run > "$SNAPSHOTS/dry-run-final.txt"
diff -u "$SNAPSHOTS/dry-run-preflight.txt" "$SNAPSHOTS/dry-run-final.txt"
```

Abort if anything changed since preflight.

**B5. Migrate.** Run exactly `npx supabase db push --linked`. Do not pass an
option that repairs, squashes, includes an unreviewed migration, or resets
history.

**B6. On failure, stop.** Keep the maintenance application active and capture
the failure. The migration is one transaction, so a failure leaves the schema
unchanged. Do not improvise a partial manual drop and do not restore old
application code against a partially reset schema.

### C. Verification — fail closed before reopening delivery

**C1. Align history.** Run `npx supabase migration list --linked`; local and
remote must align through `20260814195107` exactly once.

**C2. Prove the catalog state.** Every `still_present` must be empty in the
first three queries; every `present` must be non-empty in the fourth.

```bash
psql "$PGURI" -v ON_ERROR_STOP=1 -A -F',' <<'SQL'
select name, pg_catalog.to_regclass('public.' || name) as still_present
  from unnest(array[
         'plan_proposal_decisions', 'plan_proposal_sources',
         'plan_proposals', 'plan_generation_requests',
         'completed_activities', 'completion_heads', 'completed_sessions',
         'planned_activities', 'planned_sessions', 'detailed_plan_heads',
         'detailed_plan_versions']) as name
 order by 1;

select signature,
       pg_catalog.to_regprocedure(signature) as still_present
  from unnest(array[
         'public.reject_inactive_completion_activity()',
         'public.save_training_completion(uuid,uuid,integer,uuid,date,timestamptz,text,integer,text,integer,text,text,text,boolean,boolean,boolean,boolean,text,jsonb)',
         'public.save_manual_plan_version(integer,integer,date,text,jsonb)',
         'public.reject_plan_proposal(uuid)',
         'public.record_plan_memory_candidates(uuid,bigint,jsonb)',
         'public.finish_plan_generation(uuid,text,text,text,text,text,text,uuid,text,jsonb,jsonb,text)',
         'public.begin_plan_generation(text,text,date,integer,text)',
         'public.plan_content_is_valid(jsonb,date,date)']) as signature
 order by 1;

select name, pg_catalog.to_regtype('public.' || name) as still_present
  from unnest(array[
         'plan_proposal_decision_receipt', 'plan_memory_candidate_receipt',
         'plan_generation_result', 'plan_generation_receipt']) as name
 order by 1;

select name, pg_catalog.to_regclass('public.' || name) as present
  from unnest(array[
         'profiles', 'personal_activities',
         'goals', 'goal_collections', 'goal_lifecycle_events',
         'memory_items', 'memory_revisions', 'memory_collections',
         'memory_deletion_events',
         'onboarding_drafts', 'onboarding_goal_candidates',
         'onboarding_memory_candidates', 'onboarding_prompt_states',
         'onboarding_publication_receipts', 'onboarding_training_activities',
         'roadmap_generation_requests', 'roadmap_proposals',
         'roadmap_proposal_sources', 'roadmap_proposal_decisions',
         'roadmap_versions', 'roadmap_heads',
         'ai_spend_reservations',
         'rolling_plans', 'rolling_plan_sessions', 'rolling_plan_activities',
         'rolling_plan_change_sets', 'rolling_plan_change_entries']) as name
 order by 1;

select pg_catalog.to_regprocedure(
         'public.is_valid_training_measurement(text,jsonb)')
       as shared_validator_present;
SQL
```

That fourth query must return 27 rows. Then prove RLS and the table boundary:
every remaining table must report `rls_enabled` true with at least one policy,
and `anon_select` must be false everywhere.

```bash
psql "$PGURI" -v ON_ERROR_STOP=1 -A -F',' <<'SQL'
select c.relname,
       c.relrowsecurity as rls_enabled,
       (select count(*) from pg_catalog.pg_policy as pol
         where pol.polrelid = c.oid) as policies,
       pg_catalog.has_table_privilege('anon', c.oid, 'SELECT') as anon_select,
       pg_catalog.has_table_privilege('authenticated', c.oid, 'SELECT')
         as authenticated_select
  from pg_catalog.pg_class as c
 where c.relnamespace = 'public'::regnamespace
   and c.relkind = 'r'
 order by 1;
SQL
```

Then re-take the privilege matrix and diff it against the A8 baseline. Every
`can_execute` must read `f`, and every `defaults_to_public_execute` must read
`f` — a null ACL would mean `PUBLIC` regained the default `EXECUTE`.

```bash
psql "$PGURI" -v ON_ERROR_STOP=1 -A -F',' \
  > "$SNAPSHOTS/privileges-postreset.csv" <<'SQL'
select p.oid::regprocedure::text as function_signature,
       grantee.rolname,
       pg_catalog.has_function_privilege(
         grantee.rolname, p.oid, 'EXECUTE') as can_execute,
       p.proacl is null as defaults_to_public_execute
  from pg_catalog.pg_proc as p
  cross join (values ('anon'), ('authenticated'), ('service_role'))
         as grantee(rolname)
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('begin_roadmap_generation',
                     'finish_roadmap_generation',
                     'record_roadmap_memory_candidates',
                     'apply_roadmap_proposal_change',
                     'accept_roadmap_proposal')
 order by 1, 2;
SQL
diff -u "$SNAPSHOTS/privileges-preflight.csv" \
        "$SNAPSHOTS/privileges-postreset.csv"
```

**C3. Compare the counts.** Re-run the A5 and A6 queries into
`counts-postreset.csv` and `decisions-postreset.csv`, then diff:

```bash
diff -u "$SNAPSHOTS/counts-preflight.csv" "$SNAPSHOTS/counts-postreset.csv"
diff -u "$SNAPSHOTS/decisions-preflight.csv" \
        "$SNAPSHOTS/decisions-postreset.csv"
```

The only acceptable count differences are: the 11 legacy relations disappear
from the listing entirely; `public.roadmap_proposal_decisions` grows by exactly
the preflight `derived.undecided_source_dependent_roadmap_proposals` value; and
that derived value itself becomes `0`. Every other row must be identical. In the
decision diff, the `accepted` and `rejected` rows — counts and fingerprints
alike — must be unchanged, and the only new line is the `expired` row. Any other
difference is a failure; investigate before reopening delivery.

**C4. Lint and advisors.** Run both without suppressing findings:

```bash
npx supabase db lint --linked --level warning --fail-on warning
npx supabase db advisors --linked --type all --level warn --fail-on warn
```

Record all results and explain any project-wide warning; do not weaken a check.

**C5. Prove the authenticated boundary.** With disposable authenticated owner A,
verify profile/goals/memory/onboarding/roadmap/personal-activity reads and an
empty M3-10 rolling-plan slice. Verify the rolling-plan write/read contract
still succeeds inside a rollback-only probe. As authenticated owner B and as
anonymous, prove owner-A rows and rolling-plan slice are denied. Verify direct
mutation is still denied. Roll back and prove no probe row remains.

**C6. Exercise the hosted routes.** All six affected routes at `390x844`: HTTP
200 after auth, `private` plus `no-store`, shared maintenance copy, keyboard
focus, no overflow, no console/page error, no legacy database/RPC request.
Recheck You, goals, memory, and onboarding.

**C7. Record and clean up.** Write the hosted evidence, exact master SHA, Vercel
deployment URL/ID, remote migration history, the count/decision/privilege diffs,
advisor output, authenticated owner/cross-owner results, and route evidence into
this record before declaring the cutover complete or dispatching M3-12. Then:

```bash
rm -rf "$SNAPSHOTS"
unset PGURI SNAPSHOTS
```

## Known limitations

- This intentionally removes all old accepted-plan and completion history;
  there is no archive, export, backfill, compatibility view, restore UI, or
  dual-write path.
- Plan, Today, logging, Progress, roadmap editing, and Coach plan proposals are
  temporarily unavailable. Goals, memory, onboarding, profile, personal
  activity definitions, roadmap records, AI accounting, and dormant M3-10
  storage remain.
- Saved sessions, recurrence, replacement completion/Progress/AI behavior, and
  activation of the continuous plan are later F-005 tickets.
- The builder did not contact hosted Supabase, inspect remote row counts,
  verify provider-managed retention, run a provider, incur spend, push, deploy,
  or execute any destructive hosted operation.
- The runbook's SQL is proven to run and to be non-vacuous against a local
  Postgres holding the same committed migrations. It has never been run against
  the founder project, so the numbers it will report there are unknown.
- The focus-outline correction changes the shared home-shell rule. Through
  `.navigation a:focus-visible` it alters the bottom-navigation focus colour on
  every home route; through `.shell`/`.card` it reaches the six maintenance
  routes, `/home/you`, and the You goals/memory/onboarding wrappers. The 390px
  screenshot covers the maintenance route only.
- **The 1.92:1 `#efaa84` focus ring survives outside this ticket's scope.** It
  is untouched at `src/app/home/you/goals/goals.module.css:387`,
  `src/app/home/you/memory/memory.module.css:430`, and
  `src/app/home/you/onboarding/onboarding.module.css:181`, and `#f4cba0`
  remains at `src/app/globals.css:212` on the now-unused `.plan-shell`.

  A second, **live** ring of the same class is recorded here after independent
  review: `src/app/globals.css:94-95` gives every `input:focus` a `#f4cba0`
  outline against the `#fff` input background set at `:90`, measuring
  **1.51:1** — worse than the 1.92:1 above, and present on every route with a
  text input, including the goals, memory, and onboarding surfaces. It is
  pre-existing and untouched by M3-11. It is called out explicitly because the
  earlier wording named `#f4cba0` only at `:212` and so read as though the
  surviving `#f4cba0` were confined to dead code; a follow-up scoped from that
  reading would fix the three module rules and still leave every input focusing
  at 1.51:1. M3-18 carries this case.

  Those modules declare their own focus rules for the controls inside their
  managers,
  so the home-shell fix does not reliably reach them — definitively not for
  `input`/`textarea`/`select`, and only by stylesheet order for
  `button`/`a`/`summary`. Goals, memory, and onboarding are preserved domains
  outside M3-11's approved scope, so this was left alone deliberately. It needs
  a follow-up ticket, which this builder did not create.
- `src/app/home/progress/[id]/page.tsx` is deleted with no maintenance
  replacement, so a previously reachable authenticated deep link now returns
  404 rather than the maintenance surface. It is not one of the brief's six
  routes, and no in-app link to it survives.
- `src/server/repositories/roadmap-repository.ts`,
  `src/server/roadmap/roadmap-edit.ts`, and
  `src/server/roadmap/roadmap-records.ts` survive the reset but are imported by
  nothing outside themselves and `roadmap-repository.test.ts`. They are
  retained on purpose as the M3-15 seam, not by oversight. Relatedly,
  `src/components/home/mobile-navigation.tsx:25-26` keeps a now-dead
  `pathname.startsWith("/home/progress/")` branch, since no `/home/progress/*`
  child route remains. The citation previously read `:24`, which is the
  **`/home/plan/` branch and is still live** — `/home/plan/roadmap` and
  `/home/plan/proposal` both survive as maintenance routes. Corrected after
  independent review: a cleanup ticket following the old citation would have
  deleted the live branch and silently broken `aria-current` on those two
  routes.
- `e2e/auth.spec.ts` could not be completed on this machine. See the note under
  "Tests and builder results".
- Dead legacy selectors remain in `home.module.css`. That was the review's
  advisory-only note and is deliberately left for a separate Tier 3 cleanup.

## Independent reviewer checklist

- Review exact implementation target `ce1457683d29df87501b4cdf1371ff64c05710ed`
  against approved base `cc60c11357cbeae1fa14b2fbe3293384d79945f7`; treat the
  later validation-only commit as evidence. `60583aa` and `312a8ba` are both
  superseded: their reviews, CI runs, and Previews approve nothing.
- Confirm each of the four findings under "Second correction round" is resolved
  in the diff. For finding 1, read the expiry statement itself and satisfy
  yourself that it cannot emit two rows for one `proposal_id`; for finding 2,
  check that the fixture's fan-out case really carries more than one legacy
  source and that the post-reset assertion would fail if it did not.
- Confirm each of the six findings under "Review corrections applied" is
  actually resolved in the diff, not merely described. In particular, check that
  the destructive phrase is requested only at runbook step B3, after B1-B2 have
  deployed and verified the maintenance application.
- Check the runbook is executable as written: every fenced block starts at
  column 0 so `<<'SQL'` terminates, and no query returns row content.
- Reconcile the complete stat, deletions, renames, and navigation notes against
  the actual diff. Report any omitted, unexpected, or inaccurately described
  file.
- Apply `code-review` on separate Standards and Spec axes and independently
  apply the ticket's schema, Supabase, React, frontend, mobile, and validation
  skills.
- Confirm every destructive object is in the approved 11-table closure, no
  `CASCADE` widens scope, and an unexpected dependency aborts the migration.
- Confirm preserved row counts/references, roadmap expiration, privilege
  matrix, M3-10 ownership/RLS/concurrency, and removed generated types from the
  actual tests and migration.
- Confirm all six routes are static-query-free maintenance wrappers and the
  screenshot/Playwright assertions cover the approved 390px behavior, including
  the corrected contrast and the visible focus indicator.
- Judge the shared focus-outline change on its actual blast radius, restated
  under "Review corrections applied" item 2, and check the recorded residual
  `#efaa84` ring on the goals, memory, and onboarding modules against the
  files. Those three are deliberately unchanged and have no follow-up ticket
  yet; that is a product-owner decision, not a builder one.
- Use exact-SHA CI for the complete automated suite. Do not run the founder
  cutover, contact hosted Supabase, or request the destructive phrase during
  independent review.
