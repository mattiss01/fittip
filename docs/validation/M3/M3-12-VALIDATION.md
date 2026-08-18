# M3-12 validation: manual continuous planning

**Status:** accepted — the product owner accepted `093b21d` on 18 August 2026.
Merged to `master` as `a1aada9`, pushed, and deployed to the founder
environment. Every gate is closed; see "Acceptance, merge, and founder
deployment" at the end of this record.

**Tier:** 1 — schema, migration, authorization, RLS, privileged writes, and
visible behavior. Dispatched by the product owner on 17 August 2026 against the
`## Agent brief` in
[`docs/backlog/M3/M3-12-MANUAL-CONTINUOUS-PLANNING.md`](../../backlog/M3/M3-12-MANUAL-CONTINUOUS-PLANNING.md).

**Branch:** `ticket/m3-12-manual-continuous-planning`, from `master` at
`cbf271a94886d2a73e9f9b6b1e2a435cf82cee68`.

**Implementation review target:** `093b21d`. The first review round rejected
`2a09b6c`; these corrections invalidate approval of every earlier commit.

| Commit | Purpose |
| --- | --- |
| `d00885f` | The migration, the module and repository changes, the `/home/plan` surface, and every test that goes with them. |
| `2a09b6c` | The two `.github/workflows/ci.yml` steps. Committed separately because `.github/**` is a tooling and supply-chain change. |
| `029936a` | **Correction, round 1.** B1: `/home/plan` removed from the M3-11 maintenance spec's route list. B2: Prettier failure in `src/app/home/plan/actions.test.ts`. |
| `da9963b` | **Correction, round 1.** N1 form reset key, N3 pgTAP clock divergence, N5 adapter ordering. |
| `093b21d` | **Correction, round 1.** The three 390px screenshots regenerated against the corrected surface. |

**Review range:** `git diff cbf271a..093b21d`. The branch head is `857b2f1`,
two commits further on. Both add only this record, under the evidence-commit
exception in `AGENTS.md`; `git diff 093b21d..857b2f1` touches
`docs/validation/M3/M3-12-VALIDATION.md` and `docs/validation/README.md` and
nothing else. The reviewed code and the branch head are therefore identical,
which is what lets the head's CI run and Preview stand as evidence for
`093b21d`.

**Independent review:** the reviewer approved `093b21d` in round 2 on the green
run 32069448152. Round 1 had rejected `2a09b6c`; the corrections in `029936a`,
`da9963b` and `093b21d` answer it, and every finding's disposition is in the
table below.

**CI:**

| Run | Head | Result |
| --- | --- | --- |
| [32045649999](https://github.com/mattiss01/fittip/actions/runs/32045649999) | `2a09b6c` | **FAILURE** — the rejected round-1 commit. Recorded because it is what the corrections answer. Prettier is the first step of the static job, so ESLint, TypeScript, Vitest and the build never executed; it establishes nothing about four of the five static gates. |
| [32069448152](https://github.com/mattiss01/fittip/actions/runs/32069448152) | `0bef7c7` | **SUCCESS** — the run the reviewer approved on. |
| [32070789464](https://github.com/mattiss01/fittip/actions/runs/32070789464) | `857b2f1` | **SUCCESS** — the branch head, code-identical to `093b21d`. |

Both green runs executed the Vitest step, which the rejected run never reached.
The B3 flake predicted below did not reproduce on either.

**Preview:** https://fittip-4wjo8eu01-mattis-3657s-projects.vercel.app —
deployment `5951611516` for `857b2f1`, state `success`. This is the acceptance
surface; it serves the reviewed code, and it reads the founder database with
the migration applied.

## First review round: what was rejected and what changed

The reviewer examined the schema, authorization, rule enforcement and atomicity
and found nothing blocking; all five judgment calls flagged in the original
handoff were verified and accepted. What blocked was the delivery gate and three
real defects in the new code.

| Finding | Resolution |
| --- | --- |
| **B1** `e2e/m3-11-maintenance.spec.ts` still listed `/home/plan` and asserted it renders the stub heading. | Removed from `routes`, with a comment saying why and pointing at the spec that now owns the route. The other five stub routes are untouched. I had updated the architecture counterpart and missed the browser one. |
| **B2** `src/app/home/plan/actions.test.ts` failed Prettier — a real failure, not the CRLF artifact. | Formatted. See the note on verification below: the local `prettier --check` could not have caught this, and now there is a check that does. |
| **B3** the local `test:run` flake was unadjudicated because Vitest never ran behind B2. | Diagnosed below with 12 further runs. |
| **N1** the uncontrolled forms were keyed on the global submission counter. | Keyed per target. A regression test pins the repro and fails against the old key. |
| **N3** `pg_temp.owner_day` used `now()` while the function uses `clock_timestamp()`. | Both sides read the same clock, and the owner's stored zone is chosen so its local time is mid-day. |
| **N5** the two adapters ordered the zone check and the replay lookup differently. | In-memory now matches Postgres, and the shared contract pins the ordering rather than leaving it unspecified. |
| **N4, N6, N7, N8, N9** | Recorded as limitations, not fixed. See below. |

## Delivered behavior

An owner opening `/home/plan` for the first time is asked to confirm their time
zone. The surface reads the browser's zone and proposes it; nothing is stored
until the owner presses the button. Until a zone is stored, no plan change is
possible at all — the change function refuses with `PT428` and the surface says
what to fix.

With a zone stored, the surface shows a fourteen-day window beginning at
owner-local today. On any of those dates the owner can:

- add a one-off session with a title, sport, expected minutes, intent, and note;
- edit a session's content;
- move a session to another date in the window;
- duplicate a session onto a date they choose — a new identity carrying the
  content and activities, unlocked, with no history;
- lock and unlock a session (lock constrains later AI replacement only; it never
  blocks the owner's own edit, move, or cancel);
- cancel a session, which records cancelled state and history and keeps the
  identity visible under "Cancelled" rather than deleting it;
- mark or clear a **Recovery day** on a date.

No past date is offered anywhere on the surface, and the two rules are enforced
in the database regardless of what a caller sends: a change targeting a date
before owner-local today is refused (`PT422`), and a change set that would leave
more than ten active sessions on one date is refused (`PT423`). A Recovery day
label is not a session and never counts toward that cap.

Every write is one change set at one expected revision: one winner, one honest
stale loser, no partial state. An empty unlabelled date reads "Nothing planned."
Nothing on the surface scores, ranks, streaks, or implies completion.

## Mobile demo path

Local production build, port 3020, viewport `390x844`.

```powershell
npx supabase start
npx supabase db reset --local
npm.cmd run build
npm.cmd run start -- -p 3020
```

1. Sign in as a confirmed local user and open `/home/plan`.
2. The page asks you to confirm your time zone. Press **Use &lt;zone&gt;**.
3. The fourteen-day window appears, starting at today. Today carries a vermilion
   rail and a `TODAY` stamp.
4. On today, open **Add a session**, enter a title and sport, press **Add
   session**. It appears with its sport and minutes.
5. Open **Edit** on that session, change the title and minutes, press **Save
   session**.
6. Press **Lock**. A `LOCKED` stamp appears and the edit controls still work.
   Press **Unlock**.
7. Open **Duplicate**, pick tomorrow, press **Duplicate session**. The copy
   appears tomorrow, unlocked.
8. Open **Move** on the copy, pick the day after, press **Move session**.
9. On a later date press **Mark recovery day**. The rail turns to a hatched band
   with a `RECOVERY` stamp. Press **Clear recovery day** to remove it.
10. Open **Cancel** on the first session and press **Cancel session**. It moves
    to the "Cancelled" list on the same date and the date reads "Nothing
    planned." again.
11. Add ten sessions to one date, then try an eleventh. The surface refuses with
    "A date holds at most ten sessions. Cancel or move one first." and gives the
    typed draft back.

Visual evidence at `390x844`:

- [`evidence/M3-12-confirm-zone-390x844.png`](evidence/M3-12-confirm-zone-390x844.png)
- [`evidence/M3-12-plan-window-390x844.png`](evidence/M3-12-plan-window-390x844.png)
- [`evidence/M3-12-daily-limit-390x844.png`](evidence/M3-12-daily-limit-390x844.png)

## Changed files

`git diff --stat cbf271a..093b21d` (this record's own line counts are from the
commit before the one that updates it):

```
 .github/workflows/ci.yml                           |  13 +
 docs/validation/M3/M3-12-VALIDATION.md             | 492 +++++++++++++++
 .../M3/evidence/M3-12-confirm-zone-390x844.png     | Bin 0 -> 41535 bytes
 .../M3/evidence/M3-12-daily-limit-390x844.png      | Bin 0 -> 157046 bytes
 .../M3/evidence/M3-12-plan-window-390x844.png      | Bin 0 -> 122237 bytes
 docs/validation/README.md                          |   6 +
 e2e/m3-11-maintenance.spec.ts                      |   4 +-
 e2e/m3-12-plan.spec.ts                             | 358 +++++++++++
 e2e/m3-12.playwright.config.ts                     |  20 +
 package.json                                       |   1 +
 src/app/home/plan/action-state.ts                  |  56 ++
 src/app/home/plan/actions.test.ts                  | 328 ++++++++++
 src/app/home/plan/actions.ts                       | 423 +++++++++++++
 src/app/home/plan/error.tsx                        |  18 +
 src/app/home/plan/loading.tsx                      |  13 +
 src/app/home/plan/page.tsx                         | 118 +++-
 src/app/home/plan/plan-manager.test.tsx            | 249 ++++++++
 src/app/home/plan/plan-manager.tsx                 | 670 +++++++++++++++++++++
 src/app/home/plan/plan.module.css                  | 421 +++++++++++++
 src/app/home/plan/timezone-confirmation.tsx        |  69 +++
 src/architecture/m3-11-legacy-reset.test.ts        |  27 +-
 src/lib/date/local-date.test.ts                    |  21 +-
 src/lib/date/local-date.ts                         |  14 +
 src/lib/supabase/database.types.ts                 |  46 +-
 src/server/repositories/profile-repository.test.ts |  77 ++-
 src/server/repositories/profile-repository.ts      |  54 +-
 .../repositories/rolling-plan-repository.test.ts   |  25 +
 src/server/repositories/rolling-plan-repository.ts |  13 +-
 .../rolling-plan/in-memory-rolling-plan-adapter.ts |  74 ++-
 src/server/rolling-plan/rolling-plan-contract.ts   | 242 ++++++--
 src/server/rolling-plan/rolling-plan.test.ts       |  77 ++-
 src/server/rolling-plan/rolling-plan.ts            |  45 +-
 ...0817125029_m3_12_manual_continuous_planning.sql | 587 ++++++++++++++++++
 .../tests/database/m0_02_authorization.test.sql    |  13 +-
 .../m3_10_rolling_plan_foundation.test.sql         |  34 +-
 .../m3_12_manual_continuous_planning.test.sql      | 498 +++++++++++++++
 .../m3_10_concurrent_rolling_plan_changes.mjs      |  13 +-
 .../m3_10_rolling_plan_postgres.test.ts            |  16 +-
 .../integration/m3_12_concurrent_plan_rules.mjs    | 320 ++++++++++
 39 files changed, 5377 insertions(+), 78 deletions(-)
```

Nothing was deleted or renamed.

Files whose purpose is not evident from the path and diff:

- `src/app/home/plan/plan-manager.test.tsx` — added in the correction round. Its
  fourth case is the N1 regression: it types into the twelfth date's add form,
  resolves a recovery-day submission on the first date, and asserts the typed
  value and the open disclosure both survive. It fails against the old key,
  which was checked by reverting the key and re-running.
- `e2e/m3-11-maintenance.spec.ts` — `/home/plan` removed from the stub route
  list. This is the browser counterpart of the architecture invariant below;
  both assert that the reset routes stayed stubs, and M3-12 reopened exactly
  one of them.

- `src/app/home/plan/action-state.ts` — the types and initial states shared by
  the `"use server"` actions and the `"use client"` manager. It exists so
  neither imports the other's module graph, and it carries `PLAN_WINDOW_DAYS`,
  the one place the fourteen-day window is defined.
- `src/architecture/m3-11-legacy-reset.test.ts` — M3-11's repo-wide invariant
  pinned `/home/plan` to the maintenance stub and asserted that
  `src/app/home/plan/actions.ts` did not exist. M3-12 reopens both paths against
  the rolling-plan model, so the invariant is **deliberately** narrowed: the
  legacy server modules stay asserted deleted, no application code may call a
  removed table or RPC, and a new assertion requires the reopened surface to
  reach persistence only through `@/server/rolling-plan` or
  `@/server/repositories` and never through a legacy module or
  `@/lib/supabase`. Reviewer: this is the invariant change to scrutinize.
- `supabase/tests/database/m0_02_authorization.test.sql` — M0-02 asserted that
  `profiles` had exactly two columns and two policies and that `authenticated`
  had no UPDATE privilege. Both counts are now three. The UPDATE assertion is
  unchanged and still passes, because a column-scoped grant leaves
  `has_table_privilege(...,'UPDATE')` false; that was verified against the
  running database before the assertion was kept, and its description was
  narrowed to "no table-wide UPDATE privilege" so it cannot be misread.
- `supabase/tests/database/m3_10_rolling_plan_foundation.test.sql` — its fixed
  dates sat on and around the real current date, which the new past-date rule
  would have decided. They are shifted a century forward so that suite keeps
  testing M3-10's behavior rather than M3-12's clock, and its two profiles now
  carry a zone. A header comment says so and points at the M3-12 suite for the
  rule itself.
- `supabase/tests/integration/m3_10_concurrent_rolling_plan_changes.mjs` — same
  reason: its rounds planned fixed August 2026 dates, now `today + round + 1`,
  and both owners confirm `UTC`.
- `src/server/rolling-plan/rolling-plan-contract.ts` — the shared adapter
  contract now takes `today` from the subject and expresses every date relative
  to it, and gains three cases: the past boundary, the label lifecycle, and the
  per-date cap. Both adapters run it unchanged.

## Data, migration, API, privacy, and security effects

One forward migration,
`supabase/migrations/20260817125029_m3_12_manual_continuous_planning.sql`. No
applied migration was edited.

**`public.profiles.timezone_name`** — nullable `text`. Constraint
`profiles_timezone_name_check` allows null, or a 1–100 character name that
`public.is_iana_timezone_name(text)` finds in `pg_catalog.pg_timezone_names`.

A check constraint cannot contain a subquery, so the catalog lookup is wrapped
in a `stable`, `security invoker`, empty-`search_path` function. Constraint
expressions are evaluated as the *writing* role, so `authenticated` must hold
`EXECUTE` on it or its own write fails with `permission denied for function`;
this was confirmed empirically before the grant was written. `public`, `anon`,
and `service_role` are revoked. The function reads nothing but a catalog view
every role can already read.

**Privilege matrix, `public.profiles`:**

| Role | SELECT | INSERT | UPDATE (table) | UPDATE (`timezone_name`) | DELETE |
| --- | --- | --- | --- | --- | --- |
| `anon` | no | no | no | no | no |
| `authenticated` | yes | yes | **no** | **yes** | no |
| `service_role` | no | no | no | no | no |

The UPDATE grant is column-scoped, so `user_id` cannot be reassigned and
`created_at` cannot be rewritten; M0-02's `update ... set created_at` denial
still raises `42501`. The new `profiles_owner_update_timezone` policy is the
third policy on the table and uses `(select auth.uid()) = user_id` in both
`USING` and `WITH CHECK`. A cross-owner write matches no row rather than
erroring, which the pgTAP suite asserts together with the fact that the other
owner still has no stored zone afterwards.

**`public.rolling_plan_recovery_days`** — `id`, `user_id`, `plan_id`,
`local_date`, `created_at`. One row per owner-date
(`rolling_plan_recovery_days_owner_date_key`, which is also the owner/date
access path, so no redundant index was added). Same-owner composite FK to
`rolling_plans (id, user_id)` with `on delete cascade`. RLS enabled; one owner
`SELECT` policy; `SELECT` granted to `authenticated` only; no role has INSERT,
UPDATE, or DELETE, so every write arrives through the change function. A
`before update` trigger refuses an owner change even from a privileged path.

**`public.rolling_plan_change_entries`** — `session_id` becomes nullable and a
`local_date` column is added, so a recovery-day change records like any other.
`rolling_plan_change_entries_kind_check` gains `set_recovery_day`, and
`rolling_plan_change_entries_target_check` requires exactly one of a session
identity or a date. The existing before/after-state constraint is unchanged: a
label change carries a non-null `before_state`
(`{"localDate": …, "isRecoveryDay": false}`), so setting a label that is already
set is refused as "A plan change must change current state."

**`public.get_rolling_plan_slice(date, date)`** — dropped and recreated, along
with the `rolling_plan_slice_receipt` composite type, which gains
`recovery_dates jsonb`. Still `stable`, `security invoker`, empty search path,
no owner parameter, `EXECUTE` to `authenticated` only. One read returns the plan
id, the revision, the sessions, and the labels together.

**`public.apply_rolling_plan_change_set(bigint, uuid, text, jsonb)`** — replaced
in place, so its grants and its `SECURITY DEFINER` boundary are unchanged and no
new privileged boundary is introduced. It now:

- reads `timezone_name` for `auth.uid()` and raises `PT428` if it is null;
- derives owner-local today as `timezone(<stored zone>, clock_timestamp())::date`
  — from the stored profile value and `auth.uid()` only, never from anything a
  caller can send;
- raises `PT422` for any date the change touches that is before owner-local
  today: an `add`'s target, a `move`'s source **and** target, the current date of
  an `edit`, `set_lock`, or `cancel`, and a `set_recovery_day`'s date;
- carries the new `set_recovery_day` operation, which takes `localDate` and
  `isRecoveryDay` and no session id;
- after applying the whole change set and making the ordering constraint
  immediate, raises `PT423` if any date the set touched now holds more than ten
  active sessions. It is judged on the state left behind, so a swap or a
  cancel-then-add that stays within ten is accepted, and a label never
  contributes.

New owner-visible SQLSTATEs and their domain mapping in
`rolling-plan-repository.ts`: `PT422` → `RollingPlanRuleError("past-date")`,
`PT423` → `RollingPlanRuleError("daily-session-limit")`, `PT428` →
`RollingPlanTimezoneRequiredError`. `PT409` and `22023` are unchanged. No
Postgres message text reaches the UI; each maps to fixed copy.

**Privacy and browser storage.** The browser stores one key,
`fittip.plan.recovered:v1` in session storage, holding `"1"`. It carries no plan
content, only the fact that a reload was self-triggered — the same shape the
goals, memory, roadmap, and proposal surfaces already use. Only what the surface
renders crosses to the client: `page.tsx` maps each session to a view with an
activity **count** rather than the activity records. The browser's time zone is
proposed and only stored after the owner presses the button.

**Credentials.** None added. `SUPABASE_SERVICE_ROLE_KEY` is used only at test
runtime by the concurrency harness and the Playwright spec to create and delete
a disposable confirmed user; it never reaches application code and is not
logged or persisted. No package was added or changed. No hosted Supabase
command was run and no spend was incurred.

## Tests and final results

CI is the automated-test evidence. The run for the rejected `2a09b6c` failed at
Prettier and therefore never reached ESLint, TypeScript, Vitest or the build;
the run for `093b21d` is what must be green. The results below are what was
observed locally after the corrections, recorded honestly and **not** offered as
a substitute for that run.

| Command or check | Result |
| --- | --- |
| `npm.cmd run lint` | pass |
| `npm.cmd run typecheck` | pass |
| `npm.cmd run test:run` | 58 files, 701 tests, 1 skipped, pass — 12 consecutive runs, see below |
| `npm.cmd run build` | pass, 19 routes |
| `npx.cmd supabase db reset --local` | every migration applied from zero, pass |
| `npx.cmd supabase db lint --local --level warning --fail-on warning` | no schema errors |
| `npx.cmd supabase db advisors --local --type all --level warn --fail-on warn` | no issues found |
| `npx.cmd supabase test db --local supabase/tests/database` | 9 files, 549 assertions, pass |
| `npm.cmd run test:m3-10-adapter-contract` | 9 tests, pass — the real Postgres adapter on the shared contract, including the new ordering case |
| `npm.cmd run test:m3-10-concurrency` | pass |
| `npm.cmd run test:m3-12-concurrency` | pass |
| `npx.cmd playwright test --config=e2e/m3-11.playwright.config.ts` | 1 test, pass, 0 skipped — the route B1 removed |
| Prettier over the LF-normalized staged blobs | 29 files, all clean |
| `npx.cmd playwright test --config=e2e/m3-12.playwright.config.ts` | 2 tests, pass, 11.9s, 0 skipped |
| `git diff --check` | clean |

### B3: the intermittent local suite timeout, adjudicated

The first handoff reported `test:run` failing 3 times in 11 on this branch and
could not say why. The Vitest step never ran in CI because Prettier failed ahead
of it, so the question was still open at review. It has now been chased down.

**Shape.** Every failure was `Error: Test timed out in 5000ms` on the **first**
test of a pre-existing jsdom component file this ticket does not touch:
`mobile-navigation.test.tsx`, `goal-manager.test.tsx`, `memory-manager.test.tsx`
and, once, `onboarding-manager.test.tsx`. No assertion ever failed — the worker
never reached one.

**Cause.** `vitest.config.ts` sets `environment: "jsdom"` for every file and no
`testTimeout`, so the default 5000 ms budget covers the first test *and* the
jsdom environment creation in front of it. The run summaries put cumulative
environment setup at 130–350 s. When this machine is also running the Docker
Supabase stack, a Next production server, and back-to-back suites, that setup
crosses 5 s and the first test in a file is recorded as a timeout.

**Evidence.** All three failures fell inside one five-minute window of exactly
that contention. With the server stopped and no build running, the full suite is
now green **12 consecutive times** at 58 files / 701 tests / 1 skipped, on top of
8 green runs earlier — 20 green, 0 failed, once nothing else was competing.

**What I did not do.** I did not raise `testTimeout`. That is a repo-wide tooling
decision outside this ticket, and here it would hide the symptom rather than
address it. Nothing in this ticket's diff was ever the failing test.

**What the lead must still check.** CI runs the static job on a dedicated runner
that does not host the Docker stack, so the contention that reproduces this
locally should not exist there. That is a prediction, not a result. Read the
Vitest step for `093b21d`: if it flakes, it is an undiagnosed failure and a
blocker in its own right, not a known-defect exception.

### How B2 escaped, and the check that now catches it

`npm.cmd run format:check` reports ~130 false failures on this checkout because
`core.autocrlf=true` gives CRLF working files while Prettier writes LF, so a
real failure is invisible in the noise. That is why a genuine Prettier failure in
one file reached CI and cost four of five static gates.

The reliable local equivalent of CI's Linux checkout is to run Prettier over the
**staged blobs**, which Git has already normalized to LF:

```
git show ":<path>" | node node_modules/prettier/bin/prettier.cjs \
  --check --stdin-filepath <path>
```

Run across all 29 formattable files in this ticket's range, that reports them
all clean. Fed the pre-fix `actions.test.ts` blob from `d00885f`, it exits 1 —
so it would have caught B2 before the push. This costs one command and is worth
folding into the documented workflow.

Related and worth fixing separately: the README's type-regeneration sequence
tells you to run `npm run format`, which rewrites **185 files** to LF on this
checkout. Every one of them is content-identical after Git's normalization, so
`git diff` shows only the genuinely changed files, but the working tree is left
churned and `git status` lists all 185 until they are restored. That instruction
needs a narrower form.

Tests added or changed:

- `supabase/tests/database/m3_12_manual_continuous_planning.test.sql` — 58
  assertions. Structure, types, constraints, the owner/date unique key, the
  same-owner FK, the immutability trigger, the RLS state, the policy count, the
  exact table and column privilege matrix for `authenticated` and `anon`, the
  validator's execute privileges, and the receipt's new attribute. Then
  behavior: the missing-zone refusal, an invented zone name refused by the
  constraint, the column-scoped grant proven not to reach `created_at`, a
  cross-owner zone write reaching no row, past-date refusal for an add, a label,
  a cancel of a directly seeded past session, and a move in each direction, the
  label lifecycle with its history entry, the ten-session ceiling and the
  eleventh refusal, the cap judged on the whole change set, a label on a full
  date, cross-owner and anonymous denial, and the owner-immutability trigger.

  Dates follow the wall clock deliberately, because the past boundary is
  defined against owner-local today and a fixed literal would test something
  else. The correction round fixed how: `pg_temp.owner_day` previously read
  `now()` while `apply_rolling_plan_change_set` reads `clock_timestamp()`, and
  freezing one side manufactures a UTC-midnight divergence rather than
  preventing it. Both sides now read the same clock, and the owner is given a
  stored zone whose local time is currently between 08:00 and 15:00, chosen at
  run time from six zones spanning UTC-8 to UTC+13. A first assertion proves
  one qualifies; that at least one qualifies at **every** UTC hour was verified
  separately over all 24. A suite that runs in about a second therefore cannot
  straddle an owner-local midnight whatever time it is started.
- `supabase/tests/integration/m3_12_concurrent_plan_rules.mjs` — twelve rounds
  racing a session change against a recovery-day change at the same expected
  revision; each round must produce exactly one 200 and one `PT409`, and the
  loser must leave nothing. Then two concurrent eleventh sessions against a full
  date, neither of which may commit and at least one of which must cite
  `PT423`; a label accepted on that same full date; a past-date attempt
  answering `PT422` with HTTP 422; a zone-less owner answering `PT428` with
  HTTP 428 and no plan materialized; and cross-owner label invisibility.
- `src/server/rolling-plan/rolling-plan-contract.ts` — four new contract cases
  run by **both** adapters, plus every existing case re-expressed relative to
  the subject's own `today`. The fourth was added in the correction round and
  pins the N5 ordering: it applies a change, replays it, clears the stored zone,
  and requires the same replay to raise `RollingPlanTimezoneRequiredError`. The
  subject type now requires a `clearTimezone` hook so this cannot be skipped;
  the Postgres subject implements it with the owner's own column-scoped grant
  and no privileged client. Reverting the in-memory ordering makes this case
  fail, which was checked.
- `src/server/rolling-plan/rolling-plan.test.ts` — the in-memory subject now
  supplies a fixed zone and clock; two new cases cover the zone-less refusal and
  that today is derived in the owner's zone rather than the runtime's
  (23:30 UTC is already tomorrow in Auckland).
- `src/app/home/plan/plan-manager.test.tsx` — added in the correction round. Six
  cases: the window starts at today and offers no past date, an unlabelled empty
  date reads as unplanned while a labelled one reads as recovery and neither
  implies completion or a streak, a cancelled session stays visible on the
  record, the N1 regression, the clear-on-save and re-seed-on-refusal behavior
  that keying exists for, and the reload link appearing only on a known stale
  state. It follows the established surface-test shape of mocking
  `useActionState` so the result state is driven directly.
- `src/app/home/plan/actions.test.ts` — 12 cases: position selection, duplicate
  producing an `add` under a new identity, activities carried through an edit,
  a date outside the window refused before persistence, each rule and conflict
  mapped to its copy with the draft preserved, a stale revision short-circuited,
  the zone-less refusal, and the zone confirmation path.
- `src/server/repositories/profile-repository.test.ts` — `confirmTimezone`
  writing only `timezone_name` against the verified identity, rejecting five
  unusable values before any query, and mapping `23514` to a validation failure.
- `src/server/repositories/rolling-plan-repository.test.ts` — the three new
  SQLSTATE mappings and a malformed `recovery_dates` refused.
- `src/lib/date/local-date.test.ts` — `shiftIsoDate` across month, year, and
  daylight-saving boundaries.
- `e2e/m3-12-plan.spec.ts` with `e2e/m3-12.playwright.config.ts` (port 3020,
  `390x844`, `Europe/Berlin`, `testMatch` pinned). Two flows: the full operation
  set including a recovery day, and the per-date ceiling. Both assert
  `private`/`no-store` on the authenticated response, no horizontal overflow, no
  page errors, keyboard reach into the add form, and delete their disposable
  account in a `finally`.

## Founder project: migration application and hosted verification

Applied by the product owner on 18 August 2026 to the founder Supabase project
`mahhfyxhgcmcbqkvudcm`, from the repository at `857b2f1`, using
`npx supabase db push --linked`. The lead did not run any hosted command; every
result below was produced by the product owner and read back from its output.

**Migration history.** `npx supabase migration list --linked` returns sixteen
versions, each with `local` equal to `remote`, ending at `20260817125029`. That
set is identical to `supabase/migrations/` in this repository — same count, same
versions, no entry on either side that the other lacks. There is no drift in
either direction.

**Schema, RLS, and privilege boundary.** Verified against
`npx supabase db dump --linked --schema public`, which reports the live remote
DDL rather than what the migration intended to do.

| Assertion | Remote state |
| --- | --- |
| `profiles.timezone_name` exists with its constraint | `profiles_timezone_name_check`: null, or length 1–100 **and** `public.is_iana_timezone_name(timezone_name)` |
| The privilege widening is column-scoped | `authenticated` holds `SELECT, INSERT` table-wide and `UPDATE("timezone_name")` and nothing more. No unscoped UPDATE exists, so `user_id` cannot be reassigned. |
| The new policy is owner-bound | `profiles_owner_update_timezone`, `FOR UPDATE TO authenticated`, `auth.uid() = user_id` in both `USING` and `WITH CHECK` |
| `is_iana_timezone_name` is minimal | `LANGUAGE sql STABLE`, `SET search_path TO ''`, **not** `SECURITY DEFINER`, body reads only `pg_catalog.pg_timezone_names`. `REVOKE ALL FROM PUBLIC`, `EXECUTE` to `authenticated` alone. |
| `rolling_plan_recovery_days` is owner-scoped | RLS enabled; `SELECT` to `authenticated` only; **nothing granted to `anon` or `service_role`**; `rolling_plan_recovery_days_owner_select` on `auth.uid() = user_id` |
| Its constraints are present | PK on `id`; unique `(user_id, local_date)`; unique `(id, user_id)`; composite FK `(plan_id, user_id)` → `rolling_plans (id, user_id)` `ON DELETE CASCADE` |
| The owner-immutability trigger is live | `rolling_plan_recovery_days_owner_immutable`, `BEFORE UPDATE ... FOR EACH ROW` |
| History carries recovery days | `rolling_plan_change_entries.session_id` is nullable, `local_date` added, `kind_check` includes `set_recovery_day`, and `target_check` enforces exactly one of the two targets |
| The bounded read carries labels | `rolling_plan_slice_receipt` has `recovery_dates jsonb`; `get_rolling_plan_slice(date, date)` recreated, `EXECUTE` to `authenticated` alone |
| Both new rules are in the function | `PT422`, `PT423` and `PT428` all present in `apply_rolling_plan_change_set` |

**Advisors.** `npx supabase db advisors --linked --type all --level warn`
returns seven warnings, none of them attributable to this ticket:

- Six `authenticated_security_definer_function_executable`, on
  `apply_goal_change` (M2-01), `apply_memory_change` (M2-02),
  `apply_onboarding_change` (M2-03), `reserve_ai_spend` and `settle_ai_spend`
  (M3-01B), and `apply_rolling_plan_change_set` (M3-10). Every one predates
  M3-12. They describe the deliberate privileged-write boundary this codebase
  is built on: a `SECURITY DEFINER` function is exactly how an owner's write is
  mediated rather than granted directly. M3-12 replaced
  `apply_rolling_plan_change_set` in place and did not change its security
  mode, so it adds no seventh.
- One `auth_leaked_password_protection`, an Auth project setting unrelated to
  any schema this ticket touches.

**M3-12's own two new functions are `SECURITY INVOKER`** and neither is
flagged. No `unindexed_foreign_key` warning appeared for the recovery-days FK
noted in limitation 11, which is consistent with what that limitation claims.

Worth recording for whoever reads the next advisor run: the **local** advisors
reported "no issues found" while the **hosted** run reports these seven. The
local Supabase container does not run the hosted lint set that produces
`0029_authenticated_security_definer_function_executable`, and it has no Auth
project settings to inspect. A local "no issues found" therefore does not
predict a clean hosted advisor run, and the hosted one is the one that counts.

**Authenticated hosted read path.** The product owner exercised `/home/plan` on
the Preview against the founder database and reported it working. The surface
cannot render at all without the recreated `get_rolling_plan_slice` returning
the new four-field receipt, so that read path is exercised by the page loading.

**Safety of the drop.** The migration drops and recreates
`get_rolling_plan_slice(date, date)` and `rolling_plan_slice_receipt`. On
founder production at the time of application (`cbf271a`), nothing reached that
RPC: `src/server/repositories/rolling-plan-repository.ts` was referenced only
by its own test, and no route or server module imported it. The drop could not
affect the deployment then serving the founder alias.

## Project skills applied

`schema-change` — forward migration, revoked-then-granted privileges, explicit
owner policies, the ownership/ordering index, pgTAP before the UI, all four
clean-reset checks, and the three-step type regeneration.

`codebase-design` — the two rules live behind the existing
`RollingPlanAdapter` seam rather than above it, because they need stored state
and owner-local today atomically. That keeps the interface the same size and
lets the shared contract test both adapters through it. The `today` the contract
needs is supplied by the subject, not read from the clock inside the test.

`vercel-react-best-practices` — rules checked: `server-serialization` (only
rendered fields cross to the client; activity records become a count),
`server-auth-actions` (both actions derive the owner from verified claims and
never accept a caller-supplied identity), `rerender-no-inline-components` (every
component is module-level), `rendering-conditional-render` (ternaries, not
`&&`), `rerender-lazy-state-init`, and `client-localstorage-schema` (one
versioned, non-personal session-storage key). The client bundle imports no
`@/server/**` module, asserted by `src/architecture/server-boundary.test.ts`.

`frontend-design` — the surface extends FitTip's existing ledger identity rather
than inventing a second one, which is what the brief's serious-coach and M3-18
constraints pin down. Its one signature is the day rail: a fixed left column
carrying the date stamp, the `TODAY` marker, and a hatched band for a Recovery
day. The rail encodes the only structure that is actually true here — dates are
a sequence, and today is the boundary before which nothing may be planned. Copy
is active-voice and names the consequence before a destructive control. Focus
uses the M3-18 `var(--ledger-ink)` ring; neither `#efaa84` nor `#f4cba0` appears
anywhere in the new CSS.

`mobile-e2e` — the flow runs against `build` + `start` on its own port with its
own pinned `testMatch`, at exactly `390x844`, and cleans up its accounts.

## Known limitations

1. **This surface plans sessions, not their activities.** There is no activity
   editor. The change function replaces a session's whole activity list on an
   `edit`, so the action reads the current list and sends it back unchanged
   rather than erasing it; `duplicate` copies it. Activities reach a session
   from AI proposals in later F-005 slices.
2. **No visible plan history**, by the product owner's decision 1 of 17 August
   2026. Change sets keep recording; nothing displays them.
3. **The window is fourteen days from owner-local today**, defined once in
   `PLAN_WINDOW_DAYS`. That bound is a product choice this ticket made; the
   brief said "a bounded date slice" without fixing the number.

   The reviewer's N4: it is a **write** boundary as well as a read boundary, and
   that is not stated anywhere the owner can see. `readPlannableDate` refuses any
   date outside `[today, today + 13]`, so a session that exists on day 20 —
   which nothing in this ticket can create, but a later AI proposal or a
   widened window could — would be invisible here and unreachable by move,
   edit, lock, or cancel from this surface. The database imposes no such bound;
   only this surface does. A later ticket that widens the horizon or introduces
   another writer must decide whether the Plan surface paginates, states the
   bound in the interface, or both.
4. **Reordering within a date is not exposed.** `move` targets another date and
   the server picks the first free position, so the owner never types one.
   Position is still a first-class field in the model, so a later ticket can add
   reordering without a migration.
5. **The idempotency key is generated per submission on the server.** A genuinely
   retried submission therefore does not replay; it is caught by the expected
   revision instead and reported as a stale conflict. That is the safe direction
   but it is weaker than a client-held key.
6. **M2-03's onboarding transaction still discards the collected time zone.**
   This ticket adds the profile column and captures the value on the Plan
   surface, as the brief required. Wiring onboarding to populate the column is a
   separate change against an accepted transaction.
7. **`src/server/ai/context.ts` still has no `timezoneName` supplier.** M3-16
   can now read the column this ticket adds.
8. **The lost-render watchdog is a fourth per-surface copy of the React glue**
   over the shared, tested primitives in `@/lib/app-router/transition-watchdog`.
   That follows the goals/memory/roadmap precedent exactly rather than
   introducing a fifth shape, but consolidating all four is still owed work and
   is not this ticket's to do.
9. **`e2e/m3-12-plan.spec.ts` skips silently** without
   `SUPABASE_SERVICE_ROLE_KEY`. Read the skipped count before calling a run
   green; the local run above reported 2 passed, 0 skipped.

Raised by the first review round and deliberately not fixed here:

10. **A future non-superuser writer of `profiles` will need `EXECUTE` on
    `is_iana_timezone_name`** — possibly even for a row that never sets
    `timezone_name`. The builder and the reviewer disagreed on the mechanism:
    the builder read the constraint as short-circuiting on null so the function
    is never called for such a row, the reviewer read Postgres as ACL-checking
    a function referenced in a CHECK constraint at expression-initialization
    time, which would require `EXECUTE` regardless. **Neither demonstrated it**,
    and this record does not settle it — assume the stricter reading until
    someone verifies it with a throwaway role. The conclusion is the same under
    both: the requirement is a property of the constraint rather than of the
    column, and it is easy to trip over.

    **Corrected 18 August 2026 against the founder schema dump.** This
    limitation previously claimed that "only `authenticated` can write
    `profiles` at all" and that "`service_role` has no INSERT or UPDATE there."
    Both are false. The hosted dump shows
    `GRANT ALL ON TABLE "public"."profiles" TO "service_role"` — Supabase's
    default, which M0-02 never removed because its revoke names only
    `public, anon, authenticated`. `service_role` also bypasses RLS. So a
    second writer of `profiles` already exists, and it does **not** hold
    `EXECUTE` on `is_iana_timezone_name`, which this migration granted to
    `authenticated` alone. Under the reviewer's stricter reading, a
    service-role INSERT or UPDATE on `profiles` would fail on that ACL even if
    it never touches `timezone_name`.

    This is latent, not live: there is no service-role Supabase client
    anywhere in `src/`, `profile-repository.ts` uses the authenticated client,
    and the service-role key is used only by the test harnesses against
    `auth.users`. It is also not drift — the remote grants match the
    repository's migrations exactly. The wrong sentence was in this record,
    not in the database. It is corrected here because its whole purpose is to
    warn the next writer, and as written it reassured them the trap was
    unreachable. (Reviewer's N6 and O1.)
11. **The recovery-days foreign key `(plan_id, user_id)` has no index, and the
    `(id, user_id)` unique key is referenced by nothing.** The FK is unindexed,
    so a cascading delete of a plan scans; with one plan row per owner and one
    label row per owner-date that is negligible today, and the advisors flagged
    neither. The unique key exists for symmetry with the other rolling-plan
    tables, where it is the same-owner FK target. Both are cheap to correct in a
    later migration and neither is worth one now. (Reviewer's N7.)
12. **`e2e/m3-12-plan.spec.ts` writes its screenshots into the tracked
    `docs/validation/M3/evidence/` path**, so every run — local or CI — leaves
    the working tree dirty with re-encoded PNGs. That is how the evidence in
    this record is produced, and it follows what `e2e/m2-01-goals.spec.ts` and
    `e2e/m3-11-maintenance.spec.ts` already do, so changing it for one spec
    would split the convention. It should be fixed for all of them at once:
    write to `testInfo.outputPath` and copy deliberately when capturing
    evidence. (Reviewer's N8.)
13. **Pre-existing: `e2e/m2-09.playwright.config.ts` and
    `e2e/m3-11.playwright.config.ts` both claim port 3019.** Latent because only
    the M3-11 config runs in CI, and this ticket's config takes 3020, clear of
    both. Not this ticket's to fix, but it is a live collision waiting for
    whoever re-enables the M2-09 probe. (Reviewer's N9.)

## Independent reviewer checklist

Review commit **`093b21d`** on `ticket/m3-12-manual-continuous-planning`, range
`git diff cbf271a..093b21d`. Confirm the CI run for that exact SHA is green
before anything else, and specifically that the **Vitest step executed** — the
rejected run never reached it. Do not re-run lint, typecheck, the Vitest suite,
the build, the database matrix, or the browser flows.

Round 2 is a re-review: the corrections invalidate approval of `2a09b6c`. The
schema, authorization, rule-enforcement and atomicity work is unchanged from
round 1 apart from N5, so items 1–7 below can be read against round 1's
conclusions. The correction commits are `029936a`, `da9963b` and `093b21d`, and
these are the parts that are new:

- **N1** (`plan-manager.tsx`, `plan-manager.test.tsx`) — check that
  `useTargetedResetKey` adjusts state during render rather than in an effect,
  that it is monotonic per form, and that the regression test would actually
  fail against the old key. It does; I verified by reverting the key.
- **N3** (`m3_12_manual_continuous_planning.test.sql`) — check that the zone
  selection genuinely removes the midnight window rather than narrowing it, and
  that the header comment now describes what the code does.
- **N5** (`in-memory-rolling-plan-adapter.ts`, `rolling-plan-contract.ts`,
  `m3_10_rolling_plan_postgres.test.ts`) — check that the in-memory order now
  matches the SQL, and that `clearTimezone` on the Postgres subject uses the
  owner's own grant rather than a privileged client.

Judgment this ticket needs and CI cannot supply:

1. **The privilege widening on `profiles`.** A column-scoped UPDATE grant plus a
   third policy on the table M0-02 established. Satisfy yourself that no other
   column becomes writable, that `user_id` cannot be reassigned, and that the
   M0-02 assertions that were changed were changed because the fact changed, not
   because they failed.
2. **`is_iana_timezone_name` holding `EXECUTE` for `authenticated`.** It is the
   one new function the owner's own role can call. Confirm the reasoning — a
   check constraint evaluates as the writing role — and that the function can do
   nothing but read `pg_catalog.pg_timezone_names`.
3. **Owner-local today.** Confirm that nothing a caller sends can move it: not a
   form field, not a header, not the browser zone before the owner has confirmed
   it. The read window in `page.tsx` and in `actions.ts` both derive from the
   stored profile value.
4. **Both rules inside the function, not only the UI.** Check every date the
   change set touches is bounded, including a `move`'s source date and an
   `edit`/`cancel` on an already-past session, and that the cap is evaluated
   after the whole set rather than per subchange.
5. **The M3-11 invariant narrowing**, now in two places:
   `src/architecture/m3-11-legacy-reset.test.ts` and
   `e2e/m3-11-maintenance.spec.ts`. Both assert that the routes M3-11 reset
   stayed stubs; M3-12 reopened exactly one of them. Confirm the narrowing is
   exactly what M3-12 requires in each, that the other five routes are still
   covered by both, and that nothing else slipped through. Missing the browser
   half of this pair is what failed round 1.
6. **The M3-10 test date shift.** Confirm the century shift and the added zones
   preserve what those suites were asserting rather than papering over a
   regression the new rule introduced.
7. **Product invariants.** Cancellation records state and history and never hard
   deletes. Duplicate carries no lock and no history. A lock never blocks the
   owner. An unlabelled empty date reads as unplanned and nothing implies
   completion, streak, trend, or judgment.
8. **The `390x844` Preview**, once the lead has pushed and the migrations have
   been applied to the founder project in timestamp order. The visual pass is
   the product owner's.
9. **The B3 flake diagnosis.** It is now attributed to jsdom environment setup
   crossing the default 5000 ms test budget under local machine contention, with
   20 green runs and 0 failures once nothing else competed. That diagnosis
   predicts CI is unaffected; it does not prove it. Read the Vitest step for this
   SHA rather than accepting the prediction.

## Acceptance, merge, and founder deployment

**Product-owner acceptance.** Accepted on 18 August 2026 against the
independently reviewed commit `093b21d` and the Preview
https://fittip-4wjo8eu01-mattis-3657s-projects.vercel.app, deployed from
`857b2f1`. That Preview serves the reviewed code unchanged: every commit
between the two is documentation only. It is also the build the product owner
exercised against the founder database after the migration was applied, which
is why acceptance was requested against it rather than a later docs-only
redeploy.

**Merge.** `a1aada9`, a `--no-ff` merge of
`ticket/m3-12-manual-continuous-planning` into `master` at `cbf271a`. `master`
was an ancestor of the branch head, so nothing was resolved and the merged tree
is byte-identical to the accepted head `921b621`. Under the `AGENTS.md` rule on
clean merges, the local suite was not re-run by hand; the `master` run below is
the post-merge evidence.

The merge was made in the primary checkout `C:/Users/msche/dev/fittip`, which
holds `master`; this ticket's Orca worktree holds the ticket branch and cannot
check `master` out at the same time.

**`master` CI.** https://github.com/mattiss01/fittip/actions/runs/32127732724 —
**SUCCESS** for `a1aada9`.

**Founder deployment.** Vercel production deployment `5960976665` for
`a1aada9`, state `success`. The founder alias `https://fittip-gilt.vercel.app`
was confirmed to be serving `a1aada9` by reading the most recent Production
deployment's SHA, rather than assuming the alias had moved.

**Hosted smoke and security checks**, anonymous, against the founder alias:

| Check | Result |
| --- | --- |
| `/` | HTTP 200 |
| `/home/plan` — the route this ticket reopened | HTTP 303 to `/`. The new surface is not readable without a session. |
| `/home` | HTTP 303 to `/` |
| `/home/plan` response headers | `Cache-Control: private, no-cache, no-store, must-revalidate, max-age=0`; `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` |
| `/` response headers | `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate` |

The anonymous redirect is the check that matters most here: M3-12 reopened a
route that M3-11 had reduced to a stub, and it now serves owner data. The
authenticated hosted behavior was exercised by the product owner before
acceptance and is recorded in the founder-verification section above.

**Follow-up raised by this closeout, not fixed here.** The correction to
limitation 10 established that `service_role` holds `GRANT ALL` on
`public.profiles` while lacking `EXECUTE` on `is_iana_timezone_name`. Nothing
exercises that path today, so it is latent rather than a defect, but it is a
trap for the next writer of that table and wants a small forward migration —
either revoking `service_role` from `profiles` or granting it the `EXECUTE`.
That is a schema change and belongs to its own ticket.
