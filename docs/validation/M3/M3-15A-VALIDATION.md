# M3-15A validation: replacement completion foundation

**Status:** testable — builder handoff complete. Independent review, the CI run
for the reviewed commit, Vercel Preview verification, founder migration
application, and product-owner acceptance are all open.

**Tier:** 1 — two new owner-scoped tables, a new `SECURITY DEFINER` write
function, and a replacement of two accepted M3-14 privileged functions.
Dispatched by the product owner on 20 August 2026 against the `## Agent brief`
in
[`docs/backlog/M3/M3-15A-COMPLETION-FOUNDATION.md`](../../backlog/M3/M3-15A-COMPLETION-FOUNDATION.md),
the 20 August owner-mutable-completion amendment in
[F-005](../../product/F-005-ROLLING-TRAINING-PLAN.md#recorded-amendments), and
the matching amendment in
[ADR-013](../../decisions/ADR-013-AI-TRAINING-HISTORY-ELIGIBILITY.md#recorded-amendment-to-decisions-2-and-4-20-august-2026).

**Branch:** `ticket/m3-15a-completion-foundation`, from `master` at
`c4de8a9`.

**Implementation review target:**
`7ecb2e0a2ba19e9b986d6de3a080a42b39d31fad`.

**Review range:** `git diff c4de8a9..7ecb2e0`. Every commit after `7ecb2e0` is
documentation only — this record and the validation index — and is covered by
the evidence-commit exception in `AGENTS.md`, because a record cannot carry the
SHA of the commit that adds it.

| Commit | Purpose |
| --- | --- |
| `51464a9d7ff888a350c08600c24fabad8d14f8d6` | The migration: both tables, their privileges, policies and immutability triggers, the owner-derived write, and the two replaced M3-14 functions. |
| `16e2e007b4a52a5b69a5c9bb3910c8c7e3ad36bf` | The pgTAP suite, 87 assertions, plus the one M3-11 assertion this ticket changes. |
| `869b0cc66c9fe91d6116ef14fcd15f82d619f8a9` | The regenerated `database.types.ts`. |
| `40c6ea0753eeff21fc2781d0c50b4fa8af76b899` | The module, its two adapters, the shared contract, the repository, the ADR-017 top-up, and the two architecture invariants this ticket changes deliberately. |
| `7ecb2e0a2ba19e9b986d6de3a080a42b39d31fad` | The Postgres contract harness, the concurrency harness, their npm scripts, and the two `.github/workflows/ci.yml` steps. Committed separately from product code because `.github/**` is a tooling and supply-chain change. |

## Delivered behavior

Nothing is visible. This ticket rebuilds the factual completion record M3-11
deleted, on the rolling-plan foundation, with no surface — M3-15 owns that.

What now exists, behind an owner-derived write that no client can bypass:

- One completion per record, owner-editable in place. Correcting a mistyped
  duration takes no reason and leaves no trail, because the product amendment
  of 20 August 2026 retired the correction chain that had no consumer.
- The planned session and its activities as they stood when the completion was
  written, stored on the completion. Editing, cancelling, or diverging the plan
  session afterwards leaves that snapshot byte-identical, which is what makes
  F-005 Review history step 4 true against a mutable plan.
- A per-activity snapshot with a validated `actual_measurement` column. Nothing
  captures an actual yet; the schema is complete so the editor ticket does not
  have to migrate again.
- A planned session that carries a completion is never hard deleted. The
  foreign key restricts it, and `end_series` and
  `rolling_plan_sweep_series_occurrences` now keep a completed occurrence
  active exactly as they keep a locked one, reporting it as `completedKept`
  beside `lockedKept`.
- `readPlanWindowToppedUp`, the ADR-017 consequence 3 top-up, ships with no
  caller. M3-15 is its first consumer.

## Mobile demo path

**There is none, and none should be produced.** The ticket's acceptance
criteria state that there is no 390px pass because nothing here is visible, and
M3-10 and M3-14 set that precedent. Acceptance is on schema, authorization, and
evidence.

## Changed files

```
 .github/workflows/ci.yml                           |    6 +
 package.json                                       |    2 +
 src/architecture/m3-11-legacy-reset.test.ts        |    7 +-
 src/architecture/server-boundary.test.ts           |   20 +-
 src/lib/supabase/database.types.ts                 |  172 +++
 src/server/completions/completion-log-contract.ts  |  366 ++++++
 src/server/completions/completion-log.test.ts      |  153 +++
 src/server/completions/completion-log.ts           |  463 +++++++
 .../in-memory-completion-log-adapter.ts            |  147 +++
 src/server/completions/plan-window-top-up.test.ts  |  126 ++
 src/server/completions/plan-window-top-up.ts       |   65 +
 .../repositories/completion-log-repository.test.ts |  334 +++++
 .../repositories/completion-log-repository.ts      |  400 ++++++
 src/server/repositories/rolling-plan-repository.ts |    4 +-
 .../rolling-plan/in-memory-rolling-plan-adapter.ts |    3 +
 src/server/rolling-plan/rolling-plan-contract.ts   |    1 +
 src/server/rolling-plan/rolling-plan.ts            |    4 +
 ...20260829073444_m3_15a_completion_foundation.sql | 1345 ++++++++++++++++++++
 .../database/m3_11_legacy_training_reset.test.sql  |   11 +-
 .../database/m3_15a_completion_foundation.test.sql |  736 +++++++++++
 .../integration/m3_15a_completion_postgres.test.ts |  139 ++
 .../m3_15a_concurrent_completion_edits.mjs         |  291 +++++
 22 files changed, 4791 insertions(+), 4 deletions(-)
```

**Nothing was deleted or renamed.** Every changed file is either new or an
additive edit.

Files whose purpose is not evident from the path and diff:

- `supabase/migrations/20260829073444_m3_15a_completion_foundation.sql` — 1345
  lines, of which **557 are `apply_rolling_plan_change_set` re-emitted from
  M3-14 verbatim**. PL/pgSQL has no partial replacement, so adding one key to
  the series-effect object it composes requires restating the whole body. The
  diff against M3-14 lines 1000–1556 is exactly two changes: `create function`
  becomes `create or replace function`, and `'lockedKept', …` gains
  `'completedKept', v_sweep->'completedKept'`. Section 4's leading comment says
  so, and a reviewer can confirm it mechanically rather than by reading 557
  lines: extract M3-14 lines 1000-1556 and diff them against the
  `create or replace function public.apply_rolling_plan_change_set(` block in
  section 4. The result is two hunks and three changed lines.
- `src/server/completions/completion-log-contract.ts` — the shared adapter
  contract, run against the in-memory adapter by `completion-log.test.ts` and
  against the real Postgres adapter by the integration harness. It is a
  non-test `.ts` file that imports Vitest, exactly as
  `rolling-plan-contract.ts` is.
- `src/server/completions/plan-window-top-up.ts` — the ADR-017 consequence 3
  top-up. It is about the plan, not about completions, and lives here because
  the brief places it here and because every M3-15 consumer that needs it reads
  the two together. See [Judgment calls](#judgment-calls) 4.
- `src/architecture/m3-11-legacy-reset.test.ts` and
  `supabase/tests/database/m3_11_legacy_training_reset.test.sql` — both
  asserted that `completed_activities` no longer exists. The brief names that
  table, so the assertions now prove the M1-01 *shape* stays removed rather
  than the name. `completed_sessions` and `completion_heads` are untouched and
  still asserted absent. See [Judgment calls](#judgment-calls) 5.
- `src/architecture/server-boundary.test.ts` — the `.retry(false)` allowlist
  goes from five approved atomic RPCs to six. This is a deliberate
  architectural change, not an incidental one: a completion create is not
  idempotent and a completion edit answers to a revision the owner read, so an
  automatic retry of a dropped response would either write a second record or
  reapply a change the owner was told to review.

## Data, migration, API, privacy, and security effects

### Schema

One forward migration, `20260829073444_m3_15a_completion_foundation.sql`. It is
additive except for the two `create or replace` function bodies in section 4.

`public.completions` — one owner-editable factual record. `plan_session_id` is
nullable and references `rolling_plan_sessions (id, user_id)` **`on delete
restrict`**. `revision bigint` is an optimistic token on M3-13's precedent, not
a chain. `timezone_name` is stored per record. `planned_snapshot jsonb` holds
the output of the existing `rolling_plan_session_state`, which is the same shape
`rolling_plan_change_entries.after_state` carries.

Four constraints carry the vocabulary and the two structural equivalences:

| Constraint | Rule |
| --- | --- |
| `completions_status_check` | exactly `completed`, `partially_completed`, `skipped`, `replaced`, `unplanned`. No `rest`. |
| `completions_unplanned_check` | `unplanned` ⟺ `plan_session_id is null` |
| `completions_replacement_check` | `replaced` ⟺ a 1–500 character `replacement_description` |
| `completions_snapshot_check` | a planned link ⟺ a `planned_snapshot` object |

`public.completed_activities` — the per-activity snapshot. Same-owner foreign
keys to `completions` (cascade) and `personal_activities`. `actual_measurement`
is validated by the surviving `is_valid_training_measurement`. It deliberately
holds **no** reference to `rolling_plan_activities`: an edit replaces a
session's activities wholesale, so a live reference would dangle or lie.

`completions_plan_session_key` is a partial unique index making one planned
session carry at most one completion; `unplanned` rows are excluded, so a day
may hold any number of them. See [Judgment calls](#judgment-calls) 1.

**No column of the retired M1-01 model is rebuilt**: no `completion_group_id`,
`revision_number`, `previous_completion_id`, `previous_revision_number`,
`correction_reason`, and no `completion_heads` table.

### Authorization

Both tables mirror M3-13's `saved_sessions` shape exactly: RLS enabled, all
privileges revoked from `public`, `anon`, `authenticated` and `service_role`,
then `select` re-granted to `authenticated` alone, with one owner-bound select
policy each and no mutation policy. `service_role` gains nothing.

Two `before update` triggers state what no path may move. `user_id` cannot be
reassigned on either table; `plan_session_id`, `planned_snapshot` and
`timezone_name` cannot be rewritten on a completion; and a completed activity
cannot move to another owner or another completion. These are enforced against
the table owner as well as against a client, so they hold for a future
privileged path that does not exist yet.

### The write function

`public.apply_completion_change(p_operation text, p_completion_id uuid,
p_expected_revision bigint, p_completion jsonb)` returns the composite
`public.completion_receipt`. It is `security definer` with
`set search_path = ''`, takes **no owner argument**, derives the owner from
`auth.uid()` alone, and is executable by `authenticated` only. Its two
validators are executable by no client role.

- `create` requires the profile time zone and stores it on the record; without
  one it raises `PT428` before writing anything. When the completion names a
  planned session it captures `rolling_plan_session_state` itself, so no caller
  can compose or forge a snapshot, and a session belonging to another owner is
  simply not there.
- `edit` sets a 3-second `lock_timeout` (ADR-010), takes `for update` on the
  one row, and raises `PT409` on a lock timeout, a missing record, another
  owner's record, or a stale revision — all with the same message, which is
  honest and leaks nothing. It never touches the planned link, the snapshot,
  the stored zone, or the activities.
- There is no `delete` operation. See
  [Known limitations](#known-limitations) 2.
- The function advances no plan revision and writes to no plan table. The
  pgTAP suite asserts both.

### The two replaced M3-14 functions

`rolling_plan_sweep_series_occurrences` gains a fourth exclusion: an occurrence
carrying a completion is kept and left active. `lockedKept` keeps the M3-14
predicate unchanged, so every count an occurrence *without* a completion
produces is identical; `completedKept` counts the unlocked survivors, so the two
never double-count one occurrence. A kept occurrence leaves no
`rolling_plan_change_entries` row, because nothing happened to it, and
`rolling_plan_change_entries_session_fkey` is untouched.

`apply_rolling_plan_change_set` is re-emitted to add `completedKept` to the
series-effect object. No other behavior changes.

### API and types

`src/lib/supabase/database.types.ts` regenerated by the pinned CLI after a clean
reset, then formatted and patched in the documented order. Not hand-edited; the
patch script reported it needs no post-generation patch.

`RollingPlanSeriesEffect` gains `completedKept: number`. The M3-14B surface type
`SeriesEffectView` is structurally satisfied by the wider object and is
unchanged, so no route, page, or Server Action is touched. The owner-facing
`end_series` copy still names only the locked survivors — a deliberate
non-change, recorded in [Known limitations](#known-limitations) 3.

### Privacy

No new field crosses the AI boundary; `src/server/ai/**` is untouched. Nothing
is stored in the browser. No new environment variable, credential, package, or
external service. The concurrency harness uses the local Supabase service-role
key at test runtime only, as the four existing harnesses do; it is never logged
or persisted.

## Judgment calls

Each of these is a decision the brief did not settle. They are listed so the
reviewer can overturn them rather than discover them.

1. **One completion per planned session, enforced by a partial unique index.**
   The brief did not say. Without it, "the completion of this session" is not a
   well-defined thing for M3-15 to read, and criterion 7's "an owner may edit
   their own completion in place" implies a single record. A second logging of
   the same session is therefore an edit. An owner who genuinely trained twice
   records the second as `unplanned`.
2. **No future-date rule on `actual_local_date`.** The date is validated as a
   date and anchored to the stored zone, but nothing refuses a completion dated
   after owner-local today. Acceptance criterion 3 enumerates exactly which
   rejections the database must make and this is not among them, so inventing
   the rule here would pre-empt an M3-15 product decision. Recorded as a
   limitation rather than silently added.
3. **`timezone_name` is write-once.** The brief says to keep it per record
   because the profile zone changes and past dates must not. Read literally
   that is about the profile moving; the trigger goes further and refuses any
   rewrite, including by the owner's own edit, so the anchor of a recorded date
   never moves. An edit may still change the date itself.
4. **The ADR-017 top-up lives in `src/server/completions/`.** The brief places
   it there. It is a plan concern, not a completion concern, so it is a
   standalone module rather than a method on the completion interface, and it
   takes a `RollingPlan` rather than creating one. No repository wrapper was
   added around it: that would be a pass-through with nothing behind it.
5. **The M3-11 reset assertions were narrowed, not deleted.** Both the
   architecture test and the pgTAP suite asserted `completed_activities` was
   gone. The brief names that table, so the name is back. The pgTAP assertion
   now proves the M1-01 shape stays removed — no `completed_session_id`, no
   `planned_activity_id` — and the architecture test still bans every other
   legacy table and RPC.
6. **File names avoid the two paths M3-11 keeps reserved.** The module is
   `src/server/completions/completion-log.ts` and the repository is
   `src/server/repositories/completion-log-repository.ts`, because
   `completion-records.ts` and `completion-repository.ts` are named in
   `m3-11-legacy-reset.test.ts` as legacy entry points that stay deleted. That
   invariant is left exactly as it was. The domain type is `CompletionLog`, so
   the names are consistent rather than merely test-driven.

## Tests and final results

**CI:** _pending — the lead fills in the run URL and conclusion for the exact
reviewed SHA._ That run is the automated-test evidence for this ticket: it
covers Prettier, ESLint, TypeScript, the Vitest suite, the production build,
every migration from zero, db lint, both advisors, the pgTAP suite, all seven
concurrency and adapter harnesses including the two added here, and the 390px
browser flows.

**Vercel Preview:** _pending — the lead pushes the branch and records the
Preview URL and its `READY` state._

**Founder migration application and hosted verification:** _pending — the lead
applies `20260829073444` to the founder project in timestamp order, confirms
remote migration history contains the repository's exact versions, verifies the
schema and the RLS/privilege boundary, runs the hosted advisors, and exercises
an authenticated hosted read path._

What follows is what this builder actually observed locally. It is reported
because it is what ran, not as a substitute for the CI run.

| Command or check | Result |
| --- | --- |
| `npx supabase db reset --local` | PASS — all 19 migrations applied from zero |
| `npx supabase db lint --local --level warning --fail-on warning` | PASS — no schema errors |
| `npx supabase db advisors --local --type all --level warn --fail-on warn` | PASS — no issues found, so no new advisor category |
| `npx supabase test db --local supabase/tests/database` | PASS — 12 files, 809 assertions, of which M3-15A contributes 87 |
| `npm run test:m3-15a-adapter-contract` | PASS — 9 contract cases against the real Postgres adapter |
| `npm run test:m3-15a-concurrency` | PASS — 12 correction races plus the duplicate-create race |
| `npm run test:m3-10-adapter-contract` | PASS — 15 cases, including the `completedKept` receipt |
| `npm run test:run` | PASS — 69 files, 797 tests, 2 skipped (both integration harnesses self-skip without Supabase coordinates) |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run build` | PASS — the production build compiles; no route added or removed |
| `git diff --check` | PASS — no whitespace error |
| `npx prettier --write <changed files>` | PASS — no diff, so the repository-wide `format:check` warning is line endings only |

**Not run by this builder, and not claimed:** every Playwright flow, and the
`m2_01`, `m3_01b`, `m3_11`, `m3_12`, `m3_13`, `m3_14` concurrency harnesses.
CI covers all of them on the pushed branch. The browser job is expected to pass
unchanged because this ticket adds no client code, but that is an expectation
rather than an observation.

### What the pgTAP suite proves

87 assertions in
`supabase/tests/database/m3_15a_completion_foundation.test.sql`, against three
owners — one with a stored zone, one outsider with a zone, and one with none —
and dates taken from the wall clock, because every planning rule reached is
defined against owner-local today.

| Acceptance criterion | Where it is proved |
| --- | --- |
| 1. migrations from zero, lint, advisors | the local gate table above; CI repeats it |
| 2. privilege and policy matrix, owner immutability, anonymous and cross-owner denial, direct-write denial | pgTAP, the privileges and policies block plus the cross-owner and privileged-path blocks |
| 3. status vocabulary at the database | pgTAP, the vocabulary block: `rest`, `unplanned` with a session, non-`unplanned` without one, `replaced` without a description, and a description on any other status are each refused |
| 4. planned snapshot survives a replan | pgTAP compares the stored `planned_snapshot` jsonb before and after an `edit` plus a `cancel` of the session, and the shared contract compares the projected snapshot on both adapters |
| 5. `end_series` keeps a completed occurrence and reports it; M3-14 counts unchanged | pgTAP asserts `deleted: 3`, `lockedKept: 1`, `completedKept: 1`, `divergedDeleted: 0`, the two survivors, and that three `delete` entries survive; the M3-14 suite is unchanged and still green |
| 6. hard delete refused by the database | pgTAP attempts the delete as the table owner and catches `23503` |
| 7. edit in place, no trail, stale `revision` is `PT409` | pgTAP and the shared contract |
| 8. two adapters, one contract; simultaneous writes produce one writer | `m3_15a_completion_postgres.test.ts` runs the same nine cases as the in-memory suite; `m3_15a_concurrent_completion_edits.mjs` races twelve same-revision corrections and asserts one 200, one `PT409`, no blended row and no second record |
| 9. no plan revision advanced, no plan table written | pgTAP captures the plan revision and the change-entry count before and after a completion and asserts both are unchanged |

## Known limitations

1. **Nothing is visible.** Today, logging, Progress, roadmap, and AI context
   stay on the maintenance module until M3-15. No route, page, or Server Action
   was added or changed.
2. **There is no way to remove a completion.** The write function offers
   `create` and `edit` only. `AGENTS.md` states that actual completions are
   separate *permanent* records and the 20 August amendment authorized editing,
   not deletion, so a delete path was not invented here. An owner who logged
   something that did not happen edits it to `skipped`. If M3-15 needs a real
   delete, it is a product decision and its own ticket.
3. **The `end_series` copy does not mention a completed survivor.** The
   receipt carries `completedKept` and the surface still says only how many
   locked occurrences were kept. Changing that copy is a surface change this
   ticket's non-goals exclude, and no completion can exist to be kept until
   M3-15 ships a way to write one, so the count is always zero in the interim.
4. **No actual measurement can be captured.** `completed_activities` has the
   full column and the write function accepts an activity list, but no editor
   exists and no caller sends one. Activities remain fixture-backed and
   read-only, as M3-14B recorded.
5. **No future-date rule**, as recorded in
   [Judgment calls](#judgment-calls) 2.
6. **A duplicate create loses its specific message under a race.** Serially,
   a second completion of one planned session is refused with `That session
   already has a completion.`; when two arrive simultaneously the loser trips
   the unique index and gets the generic `Invalid completion change.` Both are
   `22023` and both map to `CompletionValidationError`, so no caller behaves
   differently, but the message is less useful in the racing case.
7. **The ADR-017 top-up has no caller.** `readPlanWindowToppedUp` is exercised
   only by its own unit tests. M3-15 is its first consumer.
8. **No AI context wiring, roadmap re-grant, or backfill**, as the ticket's
   non-goals state. `ADR-013`'s send rules are unaffected; nothing new reaches
   a provider.

## Independent reviewer checklist

Review the exact commit `7ecb2e0a2ba19e9b986d6de3a080a42b39d31fad`, over
`git diff c4de8a9..7ecb2e0`. Confirm the CI run for that SHA is green; do not
re-run lint, typecheck, tests, build, or the browser flows.

The section above is navigation. The diff is the record. Judgment CI cannot
supply:

1. **The re-emitted `apply_rolling_plan_change_set`.** Confirm that
   `git diff` of migration section 4 against
   `20260819112410_m3_14_recurring_session_series.sql` lines 1000–1556 is the
   two hunks this record claims and nothing else. This is the single riskiest
   part of the ticket.
2. **The sweep's fourth exclusion.** Confirm `lockedKept` keeps the M3-14
   predicate exactly, that `completedKept` cannot double-count a locked
   occurrence, that a kept occurrence writes no change entry, and that
   `rolling_plan_change_entries_session_fkey` is unchanged.
3. **Ownership and the owner-derived write.** No owner argument, owner from
   `auth.uid()` alone, `set search_path = ''`, no privilege granted to
   `anon` or `service_role`, and the snapshot captured by the function rather
   than accepted from the caller.
4. **The product invariants.** Planned and actual stay separate permanent
   streams: nothing here advances a plan revision or writes a plan table, and
   nothing but the owner can alter a completion. Confirm the retired revision
   chain is genuinely absent rather than renamed.
5. **The six judgment calls above**, particularly 1 (one completion per planned
   session), 2 (no future-date rule), and 5 (the narrowed M3-11 assertions).
   Each is a decision the brief left open and any of them can be overturned.
6. **The two architecture invariants.** The `.retry(false)` allowlist widening
   and the M3-11 reset narrowing are both deliberate; confirm neither is wider
   than it needed to be.
7. **Honest states.** `PT409` says the same thing for a stale revision, a
   missing record, and another owner's record; `PT428` refuses before writing;
   every persistence guard refuses a row it cannot read rather than returning
   half of one.
