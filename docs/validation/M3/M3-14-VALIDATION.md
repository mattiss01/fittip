# M3-14 validation: recurring session series foundation

**Status:** in development — builder handoff complete. Independent review,
the continuous-integration run for the reviewed commit, the founder migration,
Vercel Preview verification, and product-owner acceptance are all pending.

**Tier:** 1 — two new owner-scoped tables, an alteration to
`rolling_plan_sessions`, replaced history constraints, a new `SECURITY DEFINER`
function, and a reshaped receipt type. Dispatched by the product owner on
19 August 2026 against the `## Agent brief` in
[`docs/backlog/M3/M3-14-RECURRING-SESSION-SERIES.md`](../../backlog/M3/M3-14-RECURRING-SESSION-SERIES.md)
and [ADR-017](../../decisions/ADR-017-RECURRENCE-MATERIALIZATION.md).

**Branch:** `ticket/m3-14-recurring-series-foundation`, from `master` at
`fc547e9123130c7196035a820188f15e5d680f17`.

**Implementation review target:**
`15e3f3cfcceeb2a4d15046bf9d167a2923b7bb40`.

**Review range:** `git diff fc547e9..15e3f3c`. Every commit after `15e3f3c` is
documentation only: `git diff 15e3f3c..HEAD` touches
`docs/validation/M3/M3-14-VALIDATION.md` and `docs/validation/README.md` and
nothing else. They are covered by the evidence-commit exception in `AGENTS.md`
— a record cannot carry the SHA of the commit that adds it — so the reviewed
code and the branch head are identical.

| Commit | Purpose |
| --- | --- |
| `0b5dd126a76e2a203d6719b47c2e88651310eec3` | **Not this builder's work.** The preserved, never-executed draft of a stopped builder: the migration and the first pass at the two rolling-plan modules. It is inside the review range and must be reviewed, but see [What was inherited](#what-was-inherited) before reading it as delivered work. |
| `48241c70301ea0a27abb1d25898e6d2560294c48` | The one correctness defect found in that draft: the weekly interval was anchored on a different week boundary than its own weekday numbers. |
| `dfb48419aa56e10d3ba3f4920df3fa5c0c883de8` | The pgTAP suite, 94 assertions. |
| `c4d27648076f23b2d19ed3a5c3805e2c4e61fcdf` | The regenerated `database.types.ts`. |
| `559ebfc775bfbf36981683c3ddda239f04299108` | The module, repository, adapter-contract, and copy-seam work, with their tests. |
| `6fedec563923f711fd9d1dae95091b1d2b49e9d8` | The materialization concurrency harness and its npm script. |
| `15e3f3cfcceeb2a4d15046bf9d167a2923b7bb40` | The one `.github/workflows/ci.yml` step, committed separately because `.github/**` is a tooling and supply-chain change. |

## What was inherited

This ticket was picked up mid-flight. Commit `0b5dd12` preserves what a
previous builder had written and was stopped before running: a ~1750-line
migration and ~600 lines across two rolling-plan modules. Nothing in it had
ever been executed — no reset, no pgTAP, no unit test, no typecheck.

It was verified rather than trusted, and the outcome is worth stating plainly
because it shapes what the reviewer should scrutinise:

- **The migration was kept, with one substantive fix.** It applied from a clean
  reset on the first attempt, passed db lint and both local advisors with no
  finding, and left the existing 620-assertion pgTAP suite green. Every
  operation was then exercised by hand against the local stack before any test
  was written: creation, materialization, re-materialization, divergence,
  cancellation, the cap collision, `end_series`, the this-and-future split, the
  PT424 refusal, cross-owner denial, anonymous denial, direct-write denial, and
  the owner-immutability triggers all behaved as the brief specifies.
- **The one real defect was in weekly expansion** and is described in the
  section below. It is the only behavioral change made to the draft migration.
- **The TypeScript draft was kept and finished.** It carried the domain types,
  the parser, and the in-memory adapter, but no Postgres adapter
  implementation, no `session-copy.ts` work, no contract coverage, and no
  tests. Those are `559ebfc`.
- **Nothing was discarded.** No file, function, table, or column from the draft
  was removed, and apart from the weekly fix its behavior is unchanged. Twice
  during testing the draft's behavior turned out to be defensible and this
  builder's own expectation was the thing that was wrong — both times the
  choice was left standing and written down instead, under
  [Judgment calls](#judgment-calls) 1 and 2.

## The one defect found in the inherited migration

`rolling_plan_series_dates` counted "every N weeks" from
`date_trunc('week', ...)`, which starts a week on **Monday**, while the weekday
set is stored and matched with `extract(dow from ...)`, which numbers **Sunday**
as 0. The two disagree about where a week begins, so every Sunday fell into the
previous cycle.

Concretely, "every two weeks on Sunday and Monday" starting Sunday 2026-08-23
expanded to `2026-08-23, 2026-08-31, 2026-09-06, 2026-09-14, 2026-09-20` —
Monday arriving eight days after Sunday, then Sunday six days after Monday.
After `48241c7` it expands to `2026-08-23, 2026-08-24, 2026-09-06, 2026-09-07,
2026-09-20`.

The fix anchors the cycle on the Sunday of the week holding the start date, so
the week the interval counts is the week the weekday numbers describe.
`weekStart` in the in-memory adapter carried the identical bug and got the
identical fix in `559ebfc`.

**Correction, independent review.** An earlier version of this paragraph claimed
both fixes were covered by tests. Only the SQL one is. The pgTAP suite asserts
the corrected weekly expansion for that exact case; the shared adapter contract
holds both adapters to the same **daily** dates only, because every contract
case uses a `daily` template. **The in-memory adapter's weekly expansion —
`seriesDates`' weekly branch and `weekStart`, the exact code that carried this
defect — is asserted by nothing.** That is test-double fidelity rather than
shipped behavior, since the in-memory adapter is imported only by
`rolling-plan.test.ts`, but the claim as written was not supported. Recorded as
limitation 12.

## Delivered behavior

No user-visible behavior. This ticket makes nothing visible and adds no route,
page, Server Action, or activation switch; M3-14B owns the surface. What now
exists behind the seam:

- An owner can hold any number of effective-dated recurring series, each a rule
  (daily every 1–365 days, or weekly every 1–52 weeks on named weekdays) plus a
  session template with its own activities.
- `materialize_rolling_plan_series` writes the occurrences the owner's
  fourteen-day owner-local window is missing, as ordinary
  `rolling_plan_sessions` rows carrying their series identity and rule date,
  under the machine provenance `series_expansion`. It returns `unchanged`
  without advancing the revision when nothing is missing, and returns the rule
  dates it had to skip.
- Series creation, whole-series editing, this-and-future splitting, and ending
  a series all go through `apply_rolling_plan_change_set` unchanged: one
  transaction, one grouped change set, one revision advance, one honest stale
  loser.
- Ending a series deletes every occurrence of that segment from the effective
  rule date forward, keeps every locked one active, never touches anything
  before the effective date, and reports the deleted, already-changed, and
  locked-kept counts. Each deletion leaves a `delete` change entry that outlives
  the row.

## Mobile demo path

**There is none, and none should be produced.** The ticket's acceptance
criteria state that there is no 390px pass because nothing here is visible, and
that a surface must not be invented to produce a screenshot. M3-10 set that
precedent. The product owner's acceptance is on schema, authorization, and
evidence.

## Changed files

`git diff --stat fc547e9..15e3f3c`:

```
 .github/workflows/ci.yml                           |    3 +
 package.json                                       |    1 +
 src/app/home/plan/actions.ts                       |   23 +-
 src/app/home/plan/saved/actions.ts                 |   21 +-
 src/lib/supabase/database.types.ts                 |  234 ++-
 .../repositories/rolling-plan-repository.test.ts   |  150 ++
 src/server/repositories/rolling-plan-repository.ts |  128 ++
 .../rolling-plan/in-memory-rolling-plan-adapter.ts |  341 +++-
 src/server/rolling-plan/rolling-plan-contract.ts   |  226 +++
 src/server/rolling-plan/rolling-plan.ts            |  278 +++-
 src/server/saved-sessions/session-copy.test.ts     |  104 +-
 src/server/saved-sessions/session-copy.ts          |   37 +
 ...260819112410_m3_14_recurring_session_series.sql | 1756 ++++++++++++++++++++
 .../m3_14_recurring_session_series.test.sql        |  975 +++++++++++
 .../m3_14_concurrent_materialization.mjs           |  330 ++++
 15 files changed, 4584 insertions(+), 23 deletions(-)
```

Of that, `0b5dd12` — the inherited draft — accounts for 2353 lines across the
migration and the two rolling-plan modules. `git diff --stat 0b5dd12..15e3f3c`
is this builder's own work and totals 2247 insertions across the same 15 files.

Files whose purpose is not evident from path and diff:

- `src/server/rolling-plan/rolling-plan-contract.ts` — the adapter contract
  shared by the in-memory adapter and, through
  `supabase/tests/integration/m3_10_rolling_plan_postgres.test.ts`, the real
  Postgres one. The four cases added here are the main cross-adapter evidence:
  both implementations are held to the same materialization, divergence,
  removal, and split behavior, not merely to the same types.
- `src/app/home/plan/actions.ts` and `src/app/home/plan/saved/actions.ts` — the
  only changes outside the rolling-plan and series work. Neither composes a
  series change, so neither can receive the new `series-already-started` rule
  reason; each now forwards only the two reasons it can actually produce
  instead of letting an unknown one inherit that action's wording. No user-
  visible behavior changes. Widening `action-state.ts` was rejected because
  that is M3-14B's surface decision to make, not this ticket's.
- `src/server/saved-sessions/session-copy.ts` — gains
  `toRollingPlanSeriesInput`, the saved-session-to-series-template copy. It
  lives here rather than in a new module because this file is where what a copy
  carries is decided, and the brief forbids a parallel module or second copy
  path.
- `package.json` — one npm script for the new harness.

Nothing was deleted or renamed.

## Data, migration, API, privacy, and security effects

**One forward migration**,
`supabase/migrations/20260819112410_m3_14_recurring_session_series.sql`, never
applied to any hosted project. It has not reached a remote environment, so the
weekly-anchoring correction was made in place rather than as a second file; the
file's timestamp and name are unchanged from `0b5dd12`.

**New tables.** `rolling_plan_series` and `rolling_plan_series_activities`.
Both mirror M3-13's shape: `user_id not null`, a same-owner composite foreign
key, `personal_activity_id` constrained to the same owner, RLS enabled, all
privileges revoked from `public`, `anon`, `authenticated` and `service_role`,
then `select` granted to `authenticated` alone, exactly one owner-bound select
policy each and no mutation policy, and a `before update` trigger refusing any
reassignment of `user_id`.

**Altered tables.**

- `rolling_plan_sessions` gains `series_id` (nullable), `occurrence_date`
  (nullable), and `has_diverged` (`not null default false`), a same-owner
  foreign key to the series, a `unique (series_id, occurrence_date)` key, and a
  check that the three are all absent or coherently present. Every session
  written before this migration is untouched.
- `rolling_plan_change_entries` gains a nullable `series_id` with a same-owner
  foreign key. Its `kind_check`, `target_check`, and `states_check` are dropped
  and replaced to admit `add_series`, `edit_series`, `end_series`, and
  `delete`, and to require that exactly one of session, series, or date is the
  entry's target. **`rolling_plan_change_entries_session_fkey` is unchanged and
  still `on delete cascade`** — that is deliberate, and the null `session_id` on
  a `delete` entry is what lets the record outlive the row.

**New and replaced functions.** New: `rolling_plan_weekday_set_is_valid`,
`rolling_plan_series_dates`, `rolling_plan_series_state`,
`rolling_plan_series_activity_input_is_valid`,
`rolling_plan_series_input_is_valid`, `rolling_plan_sweep_series_occurrences`,
`rolling_plan_occurrence_id`, `rolling_plan_weekday_set`,
`rolling_plan_replace_series_activities`, and
`materialize_rolling_plan_series`. Replaced in place:
`rolling_plan_session_state`, `rolling_plan_session_input_is_valid`,
`get_rolling_plan_slice`, and `apply_rolling_plan_change_set`. Every one of the
new internal helpers is revoked from all four roles; only
`materialize_rolling_plan_series` is granted to `authenticated`.

**One new privileged boundary.** `materialize_rolling_plan_series` is
`security definer` with `set search_path = ''`. It takes exactly two arguments,
`p_expected_plan_revision` and `p_idempotency_key`, and **no owner argument**:
the owner comes from `auth.uid()` and the window from `profiles.timezone_name`,
neither of which a caller can supply. pgTAP asserts the argument list, the
`security definer` flag, and the empty search path, so a later widening cannot
pass silently. ADR-017 is the approving decision for it.

**Two dropped-and-recreated types.** `rolling_plan_change_receipt` gains
`series_effects jsonb`; `rolling_plan_materialization_receipt` is new. Dropping
and recreating the receipt type follows the precedent M3-12 set for
`rolling_plan_slice_receipt`.

**Privacy.** No new personal data category. A series carries the same content a
planned session does — title, sport, intent, duration, note, activities — under
the same owner scoping. No credential, secret, or external service is
introduced. Nothing new reaches the browser: this ticket adds no client code.

**Packages.** None added, removed, or upgraded.

**Test-runtime credentials.** The concurrency harness uses
`SUPABASE_SERVICE_ROLE_KEY` only to create and delete two disposable local
accounts, exactly as the five existing harnesses do. It never reaches
application code and both accounts are deleted in a `finally` block.

## Judgment calls

Recorded because a reviewer should be able to disagree with them explicitly
rather than discover them.

1. **`set_lock` and `cancel` mark an occurrence as diverged**, alongside `edit`
   and `move`. Every owner-targeted change on an occurrence sets
   `has_diverged`. The alternative — restricting divergence to content edits —
   would make the flag mean "edited" rather than "the owner has touched this",
   and would need a second rule for what the materializer may revisit. The
   consequence is that the `divergedDeleted` count in a removal receipt counts
   any occurrence the owner had changed, not only ones they had rewritten. The
   contract test and the pgTAP suite both assert the resulting counts, so the
   choice is visible rather than implied.
2. **The removal sweep is keyed on `occurrence_date`, not `local_date`.** An
   occurrence the owner moved to an earlier date is still an occurrence of the
   rule date the sweep is removing from, so it goes. The past boundary is
   separately enforced on `local_date`, so nothing already past is ever swept.
3. **The whole-series edit sweeps too.** The brief only requires that such an
   edit be refused once the segment has started, but a segment starting
   tomorrow can already have materialized occurrences, and they were produced by
   the rule that just changed. They are swept under the same three exclusions
   and the next top-up rebuilds them.
4. **Retries are left enabled on the materialization RPC.** The other five
   atomic RPCs carry `.retry(false)`; this one does not, because it is
   idempotent under its own key — a replayed call recomputes, finds the
   occurrences already present, and reports `unchanged` rather than writing
   twice. `src/architecture/server-boundary.test.ts` is therefore **deliberately
   untouched** and still names exactly one atomic RPC in
   `rolling-plan-repository.ts`. If the reviewer disagrees, the fix is one line
   plus a deliberate invariant update, not a silent widening.
5. **The two M3-12/M3-13 plan actions were narrowed rather than widened.** See
   the changed-files note above.

## Tests and final results

**CI:** https://github.com/mattiss01/fittip/actions/runs/32263435295 —
**SUCCESS** on all three jobs for `76f0d29`, which is code-identical to the
reviewed `15e3f3c`; `git diff 15e3f3c..76f0d29` touches only this record and the
validation index. The run includes the `M3-10 real Postgres adapter contract`
and the new `M3-14 concurrent series materialization` steps, and the 390px
browser job the builder could only predict would pass. This is the
automated-test evidence for this ticket.

**One earlier run on this branch is red and is not a blocker.**
https://github.com/mattiss01/fittip/actions/runs/32259783464 for `0b5dd12`
failed its static and browser jobs. `0b5dd12` is the lead's preservation commit
holding the stopped builder's never-executed draft; a red run is exactly what
unrun work produces. It is not the reviewed commit and nothing depends on it.
It is named here so a reader of the branch history does not have to guess.

What follows is what the builder observed locally, kept because it is what
actually ran, not because it substitutes for the run above.

What follows is what was observed locally, and is reported only because it is
what this builder actually ran. The clean-reset row is the full gate sequence
from `.claude/rules/supabase-migrations.md`, executed end to end after the last
code commit.

| Command or check | Result |
| --- | --- |
| `npx supabase db reset --local` | PASS — all 18 migrations applied from zero |
| `npx supabase db lint --local --level warning --fail-on warning` | PASS — no schema errors |
| `npx supabase db advisors --local --type all --level warn --fail-on warn` | PASS — no issues found, so no new advisor category |
| `npx supabase test db --local supabase/tests/database` | PASS — 11 files, 714 tests (M3-14 contributes 94) |
| `npm run test:m3-10-adapter-contract` | PASS — 13 cases against the real Postgres adapter, including the four new series cases |
| `npm run test:m3-14-concurrency` | PASS — five consecutive runs, the last on a clean reset |
| `npm run test:m3-10-concurrency` | PASS |
| `npm run test:m3-12-concurrency` | PASS |
| `npm run test:m3-13-concurrency` | PASS |
| `npm run test:run -- src/server src/app/home/plan src/architecture` | PASS — 38 files, 571 tests |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run build` | PASS — the production build compiles; no route added or removed |
| `git diff --check` | PASS — no whitespace error |

**Not run by this builder, and not claimed:** the complete `npm run test:run`
and every Playwright flow. CI covers both on the pushed branch, and the working
agreement says the builder should let it. The Vitest run above covers
`src/server`, `src/app/home/plan` and `src/architecture`, which is every
directory this ticket touches; nothing outside them imports the changed modules.
The 390px browser job is expected to pass unchanged because this ticket adds no
client code, but that is an expectation, not an observation.

**Also not done, and out of this builder's remit:** the founder migration has
not been applied or verified, no Vercel Preview exists, and no hosted read path
has been exercised. Acceptance criterion 10 is therefore open.

### What the pgTAP suite proves

94 assertions across five owners, one narrative each. Two notes on how it is
written, both of which cost real time to discover:

- Receipts are captured into temporary tables because `(f()).*` evaluates the
  function **once per output column**. Written the obvious way, a single line
  applies a change set five times. The first exploratory run of this migration
  reported `replayed` for a first-ever call for exactly that reason.
- Daylight saving is proved on `rolling_plan_series_dates` with fixed dates
  spanning both 2026 European transitions rather than end to end. Owner-local
  today is real time and cannot be moved onto a transition from inside a
  transaction. That function is the whole of the date-producing logic; the only
  part outside it is `today + 13`, which is separately asserted to be `date`
  arithmetic. This is a deliberate and stated narrowing of acceptance criterion
  3's DST clause, not an oversight — see limitation 6.

### Acceptance criteria

| # | Criterion | State |
| --- | --- | --- |
| 1 | Migrations apply from zero; lint and local advisors clean | Met locally; **hosted advisors pending** |
| 2 | Privilege/policy matrix, owner immutability, cross-owner and direct-write denial, PT424, diverged and cancelled never revisited | Met — pgTAP |
| 3 | Daily and weekly expansion on correct owner-local dates, including across DST | Met, with the DST clause proved on the expansion function rather than end to end (limitation 6) |
| 4 | A capped date yields no occurrence, the series survives, skipped dates returned | Met — pgTAP |
| 5 | Re-running changes nothing and does not advance the revision | Met — pgTAP and the shared adapter contract |
| 6 | Concurrency harness: one writer, no duplicate, no blended row | Met — `m3_14_concurrent_materialization.mjs` |
| 7 | This-and-future produces a successor; earlier occurrences byte-identical | Met — pgTAP compares `to_jsonb` of every row before and after |
| 8 | `end_series` deletes forward, keeps locked active, reports three counts | Met for the two enforced exclusions. **The "completed untouched" clause is vacuous, not enforced** — the sweep has no completed predicate, and `rolling_plan_sessions.status` is only `active`/`cancelled` with no completion linkage today. Nothing is at risk now; it becomes a data-loss hazard the moment M3-15 links completions. See limitation 13 |
| 9 | Each deletion leaves a `delete` entry that survives the row | Met — pgTAP asserts the entries are present, carry the full session and its activities, and that no entry references a vanished session |
| 10 | Founder migration applied and verified | **Open** — lead/product-owner step |

## Known limitations

1. **Nothing bounds series count or reclaims occurrence rows.** ADR-017
   consequence 2 and ticket decision 6. An open-ended daily series is roughly
   365 session rows per year and an owner may create any number of them.
2. **Coverage still depends on someone calling the top-up.** ADR-017
   consequence 3. Today, Progress, and AI context will each read an incomplete
   Plan until M3-15 tops up before reading. This ticket does not close it and
   does not pretend to.
3. **A skipped date is reported only to the caller.** A background top-up has
   nobody to tell. M3-14B shows skips at creation; a later cap collision during a
   routine top-up is silent.
4. **One change set can only carry 100 entries.** A series operation writes its
   own entry plus one `delete` per swept occurrence, so at most 15 for a
   fourteen-day window. Seven series removals in a single change set would
   exceed the ordinal range and fail the whole transaction as
   `22023 Invalid rolling plan change set.` It fails safely and atomically, and
   M3-14B sends one series operation at a time, but the ceiling is real and
   undocumented anywhere else.
5. **An authenticated owner calling the RPC directly can stamp occurrence
   identity onto their own session.** The TypeScript parser rejects `seriesId`
   and `occurrenceDate` on an `add`, but `apply_rolling_plan_change_set` accepts
   them because the materializer composes changes through it. The series must
   still belong to the caller, and the cap, past-date, RLS, and ownership rules
   all still apply, so the blast radius is the owner's own plan. Gating it on
   provenance would not help: a caller can name any provenance.
6. **The daylight-saving proof is on the expansion function, not end to end.**
   See above. What is not directly proved is a materialization whose real
   fourteen-day window happens to contain a transition.
7. **`end_series` with an effective date before the segment's start date fails
   with `22023` rather than emptying the segment**, because the resulting
   `end_date` would violate the range check. It is unreachable from M3-14B,
   whose effective date is always an existing occurrence's rule date, so it was
   left alone rather than given invented clamping semantics.
8. **Activities still cannot be created or edited anywhere** (M3-13 limitation
   1), so a template's activities are proved by pgTAP and the adapter contract
   rather than by clicking.

Raised by the independent review of `15e3f3c` on 19 August 2026. All are
non-blocking; the reviewer approved the commit with none of them outstanding as
a defect in what the ticket claims to deliver.

9. **`end_series` and the this-and-future split could lengthen a segment.**
   **Fixed** — see [Round 1 correction](#round-1-correction). Both set
   `end_date = v_effective_date - 1` unconditionally, so a segment that already
   ended earlier had its end date pushed *out*, and the next top-up
   materialized occurrences into the resurrected gap. Unreachable today because
   no surface exists, but it resurrected deleted occurrences, which is the one
   finding the reviewer most wanted closed. Both sites now clamp with
   `least(coalesce(end_date, 'infinity'), v_effective_date - 1)`, and the
   in-memory adapter, which carried the same defect, clamps with them.
10. **The sweep has no completed predicate.** See acceptance criterion 8 above.
    Vacuous today; a data-loss hazard the moment M3-15 links completions.
11. **The materializer's position allocation can hard-fail.** It takes
    `max_position + 1`, so an active session at position 99 on a window date
    makes the whole top-up raise `22023`. The Plan's own `nextPlanPosition`
    allocates the lowest free slot instead. The two allocators disagree and the
    materializer's is the fragile one.
12. **The in-memory adapter's weekly expansion is asserted by nothing.** See the
    correction under "The one defect found in the inherited migration". A weekly
    case in `rolling-plan-contract.ts` would run against both adapters in CI.
13. **`lockedKept` counts a locked-but-cancelled occurrence**, while the SQL
    comment and `RollingPlanSeriesEffect`'s documentation both describe it as
    "kept and left active". `set_lock` then `cancel` produces exactly that row,
    and M3-14B's consequence copy would be slightly wrong as a result.
14. **Divergence flips before the state comparison**, so a no-op `set_lock` on
    an occurrence passes the "must change current state" guard where the same
    call on a one-off session still fails. A small occurrence-only behavior
    difference from M3-12.
15. **Two cross-owner existence probes omit `user_id`.** They only convert a
    `23505` into a `22023` on an unguessable primary key, so nothing leaks, but
    they are the one place in the diff a same-owner predicate was not written.
16. **`database.types.ts` lost its UTF-8 BOM on regeneration.** Incidental,
    harmless, and unaccounted for until the review found it.
17. **An `add` may place an occurrence outside its series' date range.** The
    validation at migration lines 1358-1363 checks only that the owner owns the
    `seriesId`; no constraint ties `occurrence_date` to the segment's
    `start_date`/`end_date`. Pre-existing, and slightly amplified by the clamp:
    such a row past `end_date` now survives a refused `end_series` where the
    corrupting close would at least have swept it. M3-14B must not create the
    situation. Raised by the round 2 review.
18. **A locked survivor cannot be removed through "this and all future".** The
    path in the round 1 correction above. M3-14B must either withhold the
    remove-and-future scope on an occurrence dated past its series' `end_date`,
    or map the refusal to honest copy — and it cannot branch on SQLSTATE,
    because the outer handler at migration line 1553 already remaps every check
    violation to `22023`, so only the message separates the two. Removing that
    one session directly is unaffected, which is what decision 4 intends: a lock
    constrains bulk operations, not deliberate individual ones.

## Independent review

**Round 1: APPROVED** — `15e3f3c`, on 19 August 2026, against green CI run
32263435295. The reviewer read all 1756 migration lines, the full pgTAP suite,
the concurrency harness, and every TypeScript diff, and independently confirmed
the documentation-only claim for the trailing commits and that
`src/architecture/**` is byte-untouched.

It ruled on all three flagged judgment calls: leaving `.retry(false)` alone is
correct because no path double-writes and the invariant should not have been
edited; acceptance criterion 3's DST proof is a complete decomposition rather
than a shortcut, since the materializer's only date-producing inputs are
`rolling_plan_series_dates` and `today + 13` and both are asserted; and
narrowing the two plan actions was the right seam because widening
`action-state.ts` would have pre-committed M3-14B's copy decision.

It also corrected two overstated claims in this record, both fixed above by the
**Round 2: APPROVED, with findings** — the correction range
`git diff 21e30d6..0afb6f9`, on 20 August 2026, against green CI run
32345200583 for `69f345a`. A different agent from the correction's builder.
Approval of `15e3f3c` stands for everything outside that range.

It confirmed there is no third unclamped closing site — every `end_date` write
on `rolling_plan_series` is at migration lines 1178, 1223, 1263, 1271, and 1319,
of which only the two closing sites needed the clamp and the whole-series edit
at 1319 correctly writes the caller's value — and that the clamp cannot newly
violate `rolling_plan_series_range_check`, since its result is either the stored
`end_date` or the byte-identical pre-fix value.

It checked the two implementations case by case and found them equivalent, and
established something the correction did not claim: the two new contract cases
run against real Postgres as well as in memory, because
`supabase/tests/integration/m3_10_rolling_plan_postgres.test.ts` registers the
same contract and the repository maps `22023` to `RollingPlanValidationError`.
The `rejects.toThrow` assertion is therefore a genuine cross-implementation
check rather than an in-memory tautology.

On the `predecessorEndDate` change it confirmed `v_series` is re-populated
`for update` on every iteration, so the mutation cannot leak into a later change
in the same set, and that the `returning` cannot yield null. It independently
agreed the new refusal is consistent with how the function treats every other
no-op, and verified the negative control's "7 of 8" arithmetic against the
assertions themselves.

Its findings were four documentation defects, all fixed above by the lead — the
false "unreachable from any surface" claim, a cited CI run that will never
exist, the missing `git diff --stat`, and the stale reviewer checklist — plus
limitations 17 and 18. None was a code defect. It did not re-execute the
suites, so this record's local results remain the builder's word, corroborated
by the green CI run.

It also corrected two overstated claims in this record, both fixed above by the
lead: the in-memory weekly coverage claim, and acceptance criterion 8's
"completed untouched" clause.

## Round 1 correction

The product owner chose to close limitation 9 before the migration reaches the
founder database. The migration has never been applied to a hosted project, so
it was corrected in place rather than by a second forward migration; its
filename and timestamp are unchanged.

**New review target:** `0afb6f939b5253678c3d168c867d057146542f5d`, range
`git diff 21e30d6..0afb6f9`. The approval of `15e3f3c` stands for everything
outside that range.

| Commit | Purpose |
| --- | --- |
| `03f8782e34c78e1d4e30613282adee149e9356e2` | The clamp at both closing sites in `apply_rolling_plan_change_set`, and eight pgTAP assertions that pin it. |
| `0afb6f939b5253678c3d168c867d057146542f5d` | The same clamp in the in-memory adapter, and two adapter-contract cases that pin the two implementations together. |

```
$ git diff --stat 21e30d6..0afb6f9
 .../rolling-plan/in-memory-rolling-plan-adapter.ts |  21 ++-
 src/server/rolling-plan/rolling-plan-contract.ts   |  82 +++++++++++
 ...260819112410_m3_14_recurring_session_series.sql |  22 ++-
 .../m3_14_recurring_session_series.test.sql        | 159 ++++++++++++++++++++-
 4 files changed, 275 insertions(+), 9 deletions(-)
```

Two helpers carry the new coverage and are not obvious from their paths:
`pg_temp.bounded_series_payload` in the pgTAP suite and `boundedSeries()` in
`rolling-plan-contract.ts` both build an explicitly bounded segment, which is
the only shape on which a clamp is observable. A sixth seeded owner, F, holds
them. Nothing was deleted or renamed.

**What changed.** Both sites now write
`least(coalesce(end_date, 'infinity'::date), v_effective_date - 1)` instead of
`v_effective_date - 1`. `coalesce(end_date, 'infinity')` leaves an open-ended
segment behaving exactly as before, which is every segment reachable today. An
effective date before the segment start still violates
`rolling_plan_series_range_check` and still surfaces as `22023`; limitation 7 is
unchanged.

The split branch additionally reports the end date the predecessor actually
kept — `returning end_date into v_series.end_date`, then
`'predecessorEndDate', v_series.end_date::text` — because after the clamp that
is no longer always the day before the split date, and a change entry that
claims otherwise would be a false record.

**The in-memory adapter carried the identical defect** at both of its closing
paths and now clamps in the same place, through one `clampEnd` helper.

**One behavior consequence, deliberate.** Clamped, ending a segment that
already ends on or before the day before the effective date leaves it
unchanged, so `apply_rolling_plan_change_set` refuses the change set through the
pre-existing `'A plan change must change current state.'` guard rather than
writing a no-op. The adapter now refuses it too, for the same reason and with
the same `RollingPlanValidationError`. This is a new refusal on a path that
previously "succeeded" by corrupting the segment. A split is never affected,
because it always creates a successor.

**That refusal is reachable from M3-14B**, which the correction first claimed it
was not. The round 2 reviewer found the path and the lead confirmed it against
the sweep at migration lines 822-838. `end_series` at date X keeps every locked
occurrence on a date at or after X alive, with its `series_id` intact, while the
segment's `end_date` becomes X-1 — so a locked occurrence outlives its own
series' end date by construction, because ADR-017 says it must. M3-14B renders
it as a recurring occurrence and offers "remove this and all future" on it,
producing an effective date past `end_date`, which the clamp turns into a no-op
and the guard then refuses. It is recorded as limitation 18 and as a constraint
on M3-14B rather than changed here: refusing is the correct behavior, and
pre-fix that same action corrupted the segment instead.

**Coverage added.** A sixth pgTAP owner, F, holds a segment bounded at
`today + 3`: it materializes no further than its own end date; ending it from
`today + 8` is refused and leaves the end date where it was; a subsequent
`materialize_rolling_plan_series` writes nothing past `today + 3`; splitting it
from `today + 6` leaves the predecessor's end date at `today + 3` and records
that same date as `predecessorEndDate`; and the following materialization gives
the predecessor no occurrence in the gap. The suite plan moves from 94 to 102.
`rolling-plan-contract.ts` gains the ending case and the split case, so both
adapters are held to the invariant.

**Local results.**

- `npx.cmd supabase db reset --local` from clean, then
  `npx.cmd supabase test db --local supabase/tests/database`: **PASS**, 11
  files, 722 assertions, `m3_14_recurring_session_series.test.sql` 102/102.
- Negative control: the same suite against the pre-fix migration file from
  `21e30d6`, with the new assertions in place, fails 7 of the 8 new
  assertions (94-100). The pre-fix function accepts the close, reports the
  predecessor's end date as `today + 5` where it must stay `today + 3`, and the
  following materialization writes 2 occurrences into the gap. Only the first
  new assertion, which is about the bounded rule and not the clamp, passes both
  ways.
- `npm.cmd run test:run -- src/server/rolling-plan/rolling-plan.test.ts`: 18
  passed, including the two new contract cases.
- `npm.cmd run typecheck`, `npx.cmd eslint src/server/rolling-plan/`, and
  `git diff --check`: clean. Prettier reports no change on either TypeScript
  file.

**Continuous integration.** The branch was pushed once, after the docs commit,
so no run exists for `03f8782` or `0afb6f9` and none ever will. The evidence is
[run 32345200583](https://github.com/mattiss01/fittip/actions/runs/32345200583)
for `69f345a`, **success on all three jobs** — static, database, and browser.
`git diff 0afb6f9..69f345a` touches only this record, so that run is
code-identical to the reviewed range; this is the same evidence-commit reasoning
already applied to `76f0d29` against `15e3f3c`. Nothing hosted was touched, and
no migration was applied anywhere but the local stack.

## Independent reviewer checklist

**Superseded for the correction.** Round 2 reviewed `21e30d6..0afb6f9` and
approved it; see "Round 2: APPROVED" above. What follows is the round 1
checklist, kept as written.

**Review `15e3f3cfcceeb2a4d15046bf9d167a2923b7bb40`, range
`git diff fc547e9..15e3f3c`.** Confirm the CI run for that exact SHA is green
before anything else; do not re-run lint, typecheck, `test:run`, `build`, or the
browser flows.

Read [What was inherited](#what-was-inherited) first. `0b5dd12` is inside your
range and was written by a different, stopped builder. It has been verified and
one defect fixed, but **it deserves the scrutiny of unreviewed code**, because
that is what it is.

Judgment CI cannot supply:

1. **The privileged boundary.** `materialize_rolling_plan_series` derives the
   owner from `auth.uid()` alone, takes no owner argument, and reads its window
   from `profiles.timezone_name`. Check that no argument, JSON key, or
   provenance value can widen who or what it writes for.
2. **The cascade decision.** `rolling_plan_change_entries_session_fkey` is still
   `on delete cascade`, and a `delete` entry's null `session_id` is the only
   reason the record survives. Confirm nothing in the diff weakens that key, and
   that ADR-017's stated cost — the deleted row's earlier entries cascade away —
   is what the schema actually produces.
3. **The three absolute exclusions in the sweep**: locked kept and active,
   completed untouched, nothing before the effective date. Read
   `rolling_plan_sweep_series_occurrences` against ADR-017's table directly.
   Judgment call 2 (keying on `occurrence_date`) is the one most worth
   disagreeing with.
4. **`unchanged` without a revision advance**, including at a stale expected
   revision. Two open tabs depend on it. Check that the missing set is computed
   before any revision comparison and that no path can advance the revision with
   nothing to write.
5. **The invariant that was not changed.** Judgment call 4: retries stay enabled
   on the materialization RPC and `server-boundary.test.ts` is untouched. Decide
   whether you agree; it is a deliberate choice, not an omission.
6. **The two plan-action files.** They are the only changes outside the series
   work. Confirm they change no user-visible behavior and that narrowing rather
   than widening was the right call.
7. **The weekly anchoring fix** in `48241c7`, and that the migration and the
   in-memory adapter now agree. The shared adapter contract is the cross-check;
   confirm it genuinely runs against both.
8. **Honest states.** A cap collision returns the series intact and names the
   skipped dates; a cross-owner or unknown series is refused as `22023` with no
   information about what exists; an anonymous caller is refused before anything
   is read.

Not in scope for this review: any surface, route, Server Action, or 390px pass.
There is none, deliberately.
