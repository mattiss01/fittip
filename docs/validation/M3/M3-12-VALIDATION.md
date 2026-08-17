# M3-12 validation: manual continuous planning

**Status:** in development — builder handoff complete. Independent exact-commit
review, the CI run for the reviewed SHA, founder-project migration application,
Preview verification, and product-owner acceptance are all pending.

**Tier:** 1 — schema, migration, authorization, RLS, privileged writes, and
visible behavior. Dispatched by the product owner on 17 August 2026 against the
`## Agent brief` in
[`docs/backlog/M3/M3-12-MANUAL-CONTINUOUS-PLANNING.md`](../../backlog/M3/M3-12-MANUAL-CONTINUOUS-PLANNING.md).

**Branch:** `ticket/m3-12-manual-continuous-planning`, from `master` at
`cbf271a94886d2a73e9f9b6b1e2a435cf82cee68`.

**Implementation review target:** `2a09b6c` — the branch head. Two commits, both
in scope:

| Commit | Purpose |
| --- | --- |
| `d00885f` | The migration, the module and repository changes, the `/home/plan` surface, and every test that goes with them. |
| `2a09b6c` | The two `.github/workflows/ci.yml` steps. Committed separately because `.github/**` is a tooling and supply-chain change. |

**Review range:** `git diff cbf271a..2a09b6c`. The branch head is one commit
further on and adds only this record and its three screenshots, under the
evidence-commit exception in `AGENTS.md`; it changes no code.

**CI:** not yet run — this branch has not been pushed. The lead pushes; the run
for `2a09b6c` is the automated-test evidence and must be recorded here before
acceptance.

**Preview:** pending the push.

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

`git diff --stat cbf271a..2a09b6c`:

```
 .github/workflows/ci.yml                           |  13 +
 e2e/m3-12-plan.spec.ts                             | 358 ++++++++++++
 e2e/m3-12.playwright.config.ts                     |  20 +
 package.json                                       |   1 +
 src/app/home/plan/action-state.ts                  |  56 ++
 src/app/home/plan/actions.test.ts                  | 330 +++++++++++
 src/app/home/plan/actions.ts                       | 423 ++++++++++++++
 src/app/home/plan/error.tsx                        |  18 +
 src/app/home/plan/loading.tsx                      |  13 +
 src/app/home/plan/page.tsx                         | 118 +++-
 src/app/home/plan/plan-manager.tsx                 | 643 +++++++++++++++++++++
 src/app/home/plan/plan.module.css                  | 421 ++++++++++++++
 src/app/home/plan/timezone-confirmation.tsx        |  69 +++
 src/architecture/m3-11-legacy-reset.test.ts        |  27 +-
 src/lib/date/local-date.test.ts                    |  21 +-
 src/lib/date/local-date.ts                         |  14 +
 src/lib/supabase/database.types.ts                 |  46 +-
 src/server/repositories/profile-repository.test.ts |  77 ++-
 src/server/repositories/profile-repository.ts      |  54 +-
 .../repositories/rolling-plan-repository.test.ts   |  25 +
 src/server/repositories/rolling-plan-repository.ts |  13 +-
 .../rolling-plan/in-memory-rolling-plan-adapter.ts |  56 +-
 src/server/rolling-plan/rolling-plan-contract.ts   | 211 +++++--
 src/server/rolling-plan/rolling-plan.test.ts       |  71 ++-
 src/server/rolling-plan/rolling-plan.ts            |  45 +-
 ...0817125029_m3_12_manual_continuous_planning.sql | 587 +++++++++++++++++++
 .../tests/database/m0_02_authorization.test.sql    |  13 +-
 .../m3_10_rolling_plan_foundation.test.sql         |  34 +-
 .../m3_12_manual_continuous_planning.test.sql      | 458 +++++++++++++++
 .../m3_10_concurrent_rolling_plan_changes.mjs      |  13 +-
 .../m3_10_rolling_plan_postgres.test.ts            |   7 +-
 .../integration/m3_12_concurrent_plan_rules.mjs    | 320 ++++++++++
 32 files changed, 4500 insertions(+), 75 deletions(-)
```

Nothing was deleted or renamed. Three evidence screenshots are added under
`docs/validation/M3/evidence/` in this record's own commit.

Files whose purpose is not evident from the path and diff:

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

CI is the automated-test evidence and has not run yet — the branch is
unpushed. The results below are what was observed locally while developing,
recorded honestly and **not** offered as a substitute for the run on `2a09b6c`.

| Command or check | Result |
| --- | --- |
| `npm.cmd run lint` | pass |
| `npm.cmd run typecheck` | pass |
| `npm.cmd run test:run -- src/app/home/plan src/server src/lib/date src/architecture` | 33 files, 520 tests, pass |
| `npm.cmd run build` | pass, 19 routes |
| `npx.cmd supabase db reset --local` | every migration applied from zero, pass |
| `npx.cmd supabase db lint --local --level warning --fail-on warning` | no schema errors |
| `npx.cmd supabase db advisors --local --type all --level warn --fail-on warn` | no issues found |
| `npx.cmd supabase test db --local supabase/tests/database` | 9 files, 548 assertions, pass |
| `npm.cmd run test:m3-10-adapter-contract` | 8 tests, pass — the real Postgres adapter on the shared contract |
| `npm.cmd run test:m3-10-concurrency` | pass |
| `npm.cmd run test:m3-12-concurrency` | pass |
| `npx.cmd playwright test --config=e2e/m3-12.playwright.config.ts` | 2 tests, pass, 11.9s, 0 skipped |
| `git diff --check` | clean |

### One thing to be honest about: an intermittent local suite timeout

While finishing this ticket the full `test:run` failed three times out of eleven
on this branch, and was green the other eight. Every failure was identical in
shape: `Error: Test timed out in 5000ms` on the **first** test of a pre-existing
jsdom component file this ticket does not touch —
`src/components/home/mobile-navigation.test.tsx`,
`src/components/goals/goal-manager.test.tsx`,
`src/components/memory/memory-manager.test.tsx`, and in one run
`src/components/onboarding/onboarding-manager.test.tsx`. No assertion ever
failed; the worker never reached one.

All three failing runs fell inside one five-minute window in which this machine
was also running the Docker Supabase stack and a Next production server, and in
which suites were being run back to back. The eight runs after that window
settled were green, including four consecutive ones. `src/components` alone was
green 3/3, and the unchanged `cbf271a` baseline was green 5/5 — but every one of
those baseline runs was in the settled window, so that comparison does not by
itself prove the branch is not implicated, and I am not claiming it does.

What is established: no test in this ticket's diff failed at any point, and the
failures are environment-setup timeouts rather than behavior. What is not
established: whether the extra test file this ticket adds (58 files instead of
57) contributes measurably to worker contention on a loaded machine. CI runs on
a clean runner and is the authority; if its `test:run` step flakes on this SHA,
that is a blocker to resolve rather than a known-defect exception, because
nobody has diagnosed it.

Tests added or changed:

- `supabase/tests/database/m3_12_manual_continuous_planning.test.sql` — 57
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
  Dates follow the wall clock deliberately, frozen to the transaction timestamp
  so a run spanning UTC midnight stays consistent.
- `supabase/tests/integration/m3_12_concurrent_plan_rules.mjs` — twelve rounds
  racing a session change against a recovery-day change at the same expected
  revision; each round must produce exactly one 200 and one `PT409`, and the
  loser must leave nothing. Then two concurrent eleventh sessions against a full
  date, neither of which may commit and at least one of which must cite
  `PT423`; a label accepted on that same full date; a past-date attempt
  answering `PT422` with HTTP 422; a zone-less owner answering `PT428` with
  HTTP 428 and no plan materialized; and cross-owner label invisibility.
- `src/server/rolling-plan/rolling-plan-contract.ts` — three new contract cases
  run by **both** adapters, plus every existing case re-expressed relative to
  the subject's own `today`.
- `src/server/rolling-plan/rolling-plan.test.ts` — the in-memory subject now
  supplies a fixed zone and clock; two new cases cover the zone-less refusal and
  that today is derived in the owner's zone rather than the runtime's
  (23:30 UTC is already tomorrow in Auckland).
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
   `PLAN_WINDOW_DAYS`. Dates outside it are neither read nor writable from this
   surface. That bound is a product choice this ticket made; the brief said
   "a bounded date slice" without fixing the number.
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

## Independent reviewer checklist

Review commit **`2a09b6c`** on `ticket/m3-12-manual-continuous-planning`, range
`git diff cbf271a..2a09b6c`. Confirm the CI run for that exact SHA is green
before anything else; do not re-run lint, typecheck, the Vitest suite, the
build, the database matrix, or the browser flows.

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
5. **The M3-11 invariant narrowing** in
   `src/architecture/m3-11-legacy-reset.test.ts`. This is a repo-wide invariant
   changed deliberately; confirm the narrowing is exactly what M3-12 requires and
   that nothing else slipped through it.
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
9. **The intermittent local suite timeout** recorded above. Check the CI
   `test:run` step for this SHA specifically rather than assuming the local
   observation carries over.
