# M3-15B validation: today and logging

**Ticket:** [M3-15B](../../backlog/M3/M3-15B-TODAY-AND-LOGGING.md)
**Status:** testable — awaiting independent review and product-owner
acceptance.
**Tier:** 2
**Branch:** `ticket/m3-15b-today-and-logging`
**Base:** `8d01bb2b6c6d948a3c519ae1be32c5e13a76e3b4`
**Implementation review target:**
`d35856cf99bbe6c993b75c4a47685a266e13fb8b`
**Review range:**
`git diff 8d01bb2b6c6d948a3c519ae1be32c5e13a76e3b4..d35856cf99bbe6c993b75c4a47685a266e13fb8b`

Implementation commits, in order:

| Commit | Purpose |
| --- | --- |
| `77a786330155acc011de3fa0642600350731200c` | `completedKept` on the end_series receipt view and in its copy. |
| `bb7700817cbc39ce65133bac56c6de5889decb94` | The plan-manager fixture that carries the new count. |
| `f687ad7cb17dd4667cbf86642cec7624e0c166b7` | Today reopened as one owner-local day, plus the shared completion vocabulary. |
| `4bfc9fafeaf81e43e16df420c8947b44ef37fe9b` | The completion write action and the log form. |
| `ebec31fde40d36b7bb219c82f7e05ca89eedb6e7` | The `/home/log` route, its stylesheet, and the rest of the architecture invariant move. |
| `0bab28aa24d92907ab59845749fe27db9cc64aaf` | Prettier wrap of one link in the log form. |
| `3ec9c43644c9dafdcaf089297e103677d1a24cc8` | Unit tests for the write action and the three form entries. |
| `0f7d72e52b9e86e7a02f62fe7954085ab8a55662` | The pinned 390px flow and its config. |
| `d35856cf99bbe6c993b75c4a47685a266e13fb8b` | The additive CI step on port 3024. |

The middle commits are deliberately small. `4bfc9fa` in particular commits the
action and the form before their stylesheet and route exist, so the build is
briefly broken at that commit and whole again at `ebec31f`; a transport failure
mid-ticket is the reason that trade was taken.

## Delivered behavior

**Today shows one owner-local day.** `/home/today` reads the plan content on a
single date and the completions written for it. The date is a `date` search
parameter, so the view is addressable, shareable within the owner's own
session, and the browser's back button steps through the days actually visited.
An absent, malformed, or impossible date (`2026-02-30`) falls back to
owner-local today, never to a server-local date. An owner with no confirmed
time zone is told to confirm it on the Plan rather than being shown a guessed
day.

The day carries every kind of plan content: one-off sessions, recurring
occurrences marked `Recurring`, locked sessions marked `Locked`, cancelled
sessions marked `Cancelled, kept on the record`, and the Recovery day label. A
day with nothing on it says `Nothing is planned on this day.`, in the past
tense for a past day.

**The plan window is topped up, and says when it could not be.** The read goes
through `readPlanWindowToppedUp`, which ADR-017 consequence 3 requires of every
consumer that is not the Plan. This ticket is that function's first caller,
closing M3-15A limitation 7. When the top-up cannot run the surface says the
day may be missing occurrences a series would produce and is not necessarily
empty, rather than drawing a short window as an empty day. A date past
`today + 13` is labelled unfilled rather than empty for the same reason, and
says which of the two it is.

**Logging writes a completion.** `/home/log` opens in one of three ways: for a
planned session named by a day-bounded link from Today, for unplanned training
on a day, or for a completion that already exists. One form serves all three.
It records the outcome, the date the training happened on, duration, perceived
effort, how it felt, a note, the description that `replaced` requires, and the
four conservative signals — pain, illness, injury, severe fatigue — recorded as
facts the owner reported, with the surface saying plainly that FitTip does not
diagnose and that nothing on the plan changes because one is ticked.

**Skip is a completion status.** It is one of the four outcomes a planned
session may have, written through the same completion path as any other. It
never reaches `apply_rolling_plan_change_set`, and the planned session stays on
the plan, uncancelled, after a skip.

**A mistaken log is corrected, including to skipped.** `Edit log` reopens the
record against the revision the owner read. No completion is deleted; M3-15A
limitation 2 stands and this ticket did not invent a delete.

**The end_series receipt reports a completed survivor.** `SeriesEffectView`
carries `completedKept` and the `end_series` copy reports it beside the removed
and locked-kept counts. This closes M3-15A limitation 3, and the count stops
being zero the moment an owner logs training against a recurring occurrence.

**Today reads; Log writes.** Today renders no form and dispatches no Server
Action; every write on it is a link. The log surface makes exactly one write,
through `createCompletionLog()`, and reads the plan only to confirm which day a
named session sits on.

## Mobile demo path

At 390px on the Vercel Preview, signed in as the owner:

1. Open `/home/plan`. Confirm the time zone if asked. Create three sessions on
   today — say `Tempo run`, `Easy spin`, `Core circuit` — and one on tomorrow.
   Lock `Core circuit`. Cancel one session. Mark the day after tomorrow as a
   Recovery day. Optionally create a daily recurring session starting today.
2. Open `/home/today`. The day shows every session, with `Locked`,
   `Cancelled, kept on the record`, and `Recurring` marks where they apply.
3. Tap **Next day** twice. The Recovery day appears with `Recovery day` and
   `Nothing is planned on this day.` Tap **Back to today**.
4. Tap **Previous day** once. Yesterday says `Nothing was planned on this day.`
   Use the browser back button twice and confirm it walks back through the days
   you visited.
5. Edit the address to `/home/today?date=` plus a date fourteen or more days
   ahead. The day says it is unfilled rather than empty, and names the last
   date FitTip fills ahead.
6. Back on today, tap **Log this session** on `Tempo run`. Choose
   **Completed**, enter 42 minutes, effort 7, `Good`, a note, and tick
   `I felt pain`. Tap **Save log**, then **Back to that day**. The card is
   stamped `Completed`, shows `42 min`, and says `You reported: Pain.` The
   `Log this session` link is gone.
7. Tap **Log this session** on `Easy spin`, choose **Skipped**, save, and
   return. The card is stamped `Skipped` and is still a planned session — it is
   not marked cancelled.
8. Tap **Log unplanned training**, enter 30 minutes and a note, save, and
   return. It appears under **Also logged**, stamped `Unplanned`.
9. Tap **Edit log** on `Tempo run`, choose **Skipped**, save. The receipt says
   `Log updated.` and the card is stamped `Skipped`.
10. Back on `/home/plan`, if you created a recurring session, log it as
    completed from Today, then open that occurrence's **Cancel** disclosure and
    tap **Remove this and all future sessions**. The receipt reports
    `1 completed kept`.

Check throughout that nothing scrolls sideways, that every control is reachable
by keyboard with a visible focus ring, and that the copy reads as a serious
coach's record rather than a scoreboard.

## Changed files

```
 .github/workflows/ci.yml                    |  10 +
 e2e/m3-11-maintenance.spec.ts               |  10 +-
 e2e/m3-15b-today-and-logging.spec.ts        | 441 ++++++++++++++++++++++++++++
 e2e/m3-15b.playwright.config.ts             |  21 ++
 src/app/home/log/actions.test.ts            | 269 +++++++++++++++++
 src/app/home/log/actions.ts                 | 235 +++++++++++++++
 src/app/home/log/error.tsx                  |  18 ++
 src/app/home/log/loading.tsx                |  13 +
 src/app/home/log/log-action-state.ts        | 133 +++++++++
 src/app/home/log/log-form.tsx               | 269 +++++++++++++++++
 src/app/home/log/log.module.css             | 322 ++++++++++++++++++++
 src/app/home/log/page.test.tsx              | 297 +++++++++++++++++++
 src/app/home/log/page.tsx                   | 331 ++++++++++++++++++++-
 src/app/home/plan/plan-manager.test.tsx     |   9 +-
 src/app/home/plan/series-action-state.ts    |   7 +
 src/app/home/plan/series-actions.test.ts    |   9 +-
 src/app/home/plan/series-actions.ts         |   2 +-
 src/app/home/today/error.tsx                |  18 ++
 src/app/home/today/loading.tsx              |  13 +
 src/app/home/today/page.test.tsx            | 246 ++++++++++++++++
 src/app/home/today/page.tsx                 | 230 ++++++++++++++-
 src/app/home/today/today-day.tsx            | 350 ++++++++++++++++++++++
 src/app/home/today/today.module.css         | 338 +++++++++++++++++++++
 src/architecture/m3-11-legacy-reset.test.ts |  15 +-
 24 files changed, 3587 insertions(+), 19 deletions(-)
```

Nothing was deleted or renamed. Both route modules that were four-line
`TrainingMaintenance` stubs — `src/app/home/today/page.tsx` and
`src/app/home/log/page.tsx` — were rewritten in place, which is why they show
as modified rather than added.
`src/components/home/training-maintenance.tsx` is untouched: Progress, the
roadmap, and the proposal route still use it.

Files whose purpose is not evident from the path and diff:

- `src/app/home/log/log-action-state.ts` — the completion vocabulary both
  surfaces speak, not only the action-state types. It holds the outcome labels
  and hints, the feeling labels, the signal field names, and the short stamps
  Today prints, so one outcome can never acquire two names across the flow.
  Today imports it, which is why a file in the log folder is loaded by the
  Today component.
- `src/app/home/today/today-day.tsx` — the presentational half of Today. It is
  a synchronous server component taking plain props, which is what lets
  `page.tsx` be rendered whole in a unit test; it reaches no repository and no
  Supabase client of its own.
- `src/app/home/today/page.tsx` — does all of its own fetching rather than
  delegating to a nested async component, deliberately: an async child cannot
  be rendered by the jsdom test harness, so the page would otherwise have been
  untestable at this level.
- `src/architecture/m3-11-legacy-reset.test.ts` — the deliberate invariant
  move. `log/actions.ts` leaves `legacyModules`, both routes leave
  `maintenancePages`, and all three new modules join `rollingPlanSurface`, so
  they remain constrained to the rolling-plan and completion seams instead of
  becoming unchecked.
- `e2e/m3-11-maintenance.spec.ts` — consequential, not incidental: the two
  routes it asserted are stubs are no longer stubs, so it would fail as
  written. Its remaining three routes are unchanged.
- `src/app/home/plan/series-actions.ts` — a one-line copy change. The rest of
  the file is untouched.

## Data, migration, API, privacy and security effects

**No migration, and no schema change of any kind.** No SQL file was added or
edited, no grant changed, no privileged function changed, no completion schema
changed. This ticket is the first consumer of a seam M3-15A already accepted
and shipped. The database and the RLS boundary at
`d35856c` are byte-identical to those at `8d01bb2`.

**No new persistence path.** Writes go only through `createCompletionLog()`
(`src/server/repositories/completion-log-repository.ts`), which reaches
`apply_completion_change`. Plan reads go only through `createRollingPlan()`.
`src/architecture/m3-11-legacy-reset.test.ts` asserts this for all three new
modules and would fail if any of them imported a Supabase client, a legacy
repository, or a removed table or RPC.

Per read and write:

| Path | Owner | Anonymous | Cross-owner |
| --- | --- | --- | --- |
| Today: plan slice for one date | `createRollingPlan()` derives the user from the session cookie; the repository repeats the `user_id` predicate and RLS is the backstop. | `RollingPlanAuthenticationError` → redirect to `/`; the route is also behind `src/proxy.ts`. | The slice is owner-scoped in both the query and the policy; another owner's session id is simply absent from the result. |
| Today: completions for one date | `CompletionLog.list()` → `PostgresCompletionLogAdapter.list()`, which resolves the verified user itself, filters `user_id`, and bounds `actual_local_date` to the single day. | `CompletionAuthenticationError` → redirect to `/`. | Same `user_id` predicate plus RLS. |
| Log: one completion by id | `CompletionLog.get()` resolves the verified user and filters `user_id` and `id`. A row that is not the owner's returns `null`, and the surface says the log is not there rather than that it belongs to someone else. | `CompletionAuthenticationError` → redirect to `/`. | Indistinguishable from "not found", so the route leaks no existence signal. |
| Log: planned session lookup | `getPlanSlice(date, date)`, bounded by the day the link named, so a session id alone cannot be used to sweep the plan. | Redirect to `/`. | Owner-scoped; a foreign id is simply not in the slice and the surface says the session is not on this day. |
| Log: the write | `logCompletionAction` re-derives the owner through the repository; the RPC is owner-derived and captures the planned snapshot itself. | The action returns the `session` state and writes nothing. | The RPC refuses a plan session that is not the caller's; the surface's day-bounded pre-check refuses it earlier with better copy. |

**No snapshot is ever composed by a caller.** The create sends the planned link
and an empty activity list; the write function captures the snapshot from the
plan row. The edit sends facts only — no planned link, no snapshot, no
activities — which is what makes the planned link immutable. A test pins that
an edit's payload contains neither key.

**Privacy.** No new data leaves the server beyond what the two surfaces render.
`toSessionView` and `toCompletionView` project only the fields drawn; ids are
the plan session id and the completion id, both already the owner's own. No AI
provider is called, no analytics added, no third-party request made. The four
health signals are stored exactly as the owner ticked them and are never
interpreted; the surface says so in the form.

**Spend and secrets.** None. No secret, hosted project, or paid resource was
added to CI. The new CI step reuses the existing disposable local stack on a
new port.

**Search parameters are treated as untrusted input.** The date parameter is
format-checked and round-tripped before use; the two identifiers are matched
against a UUID pattern before any lookup, so a malformed value is never sent to
the database. All three fall back to a safe default rather than erroring.

## Tests added or changed

`src/app/home/today/page.test.tsx` — new, 9 tests.

| Test | What it would catch |
| --- | --- |
| reads owner-local today through the ADR-017 top-up when no date is given | Today reading the plan directly, skipping the top-up ADR-017 consequence 3 requires — the exact defect M3-15A limitation 7 left open. |
| falls back to owner-local today when the date parameter is unusable | An impossible date such as `2026-02-30` reaching the query, or an error page where a day should be. |
| bounds both reads by the requested day and offers the way back | A read widening beyond the selected day, or a paged-away owner being stranded with no route back to today. |
| says the window is short rather than drawing an empty day | `toppedUp: false` being swallowed, which would show a plan as empty when it is only unextended. |
| says a date past the materialization window is unfilled, not empty | A day past `today + 13` reading as "nothing planned" when nothing has been written there yet. |
| stamps a logged session and links its edit instead of a second log | A logged session still offering `Log this session`, which would invite a duplicate the write function refuses. |
| offers the log link on a planned session that has none | The log entry point disappearing, leaving a planned session unloggable. |
| keeps a completion no card on this day carries | A completion silently dropped because its planned session is not on the day it was logged. |
| refuses to guess a day for an owner with no stored zone | A server-local day being shown to an owner whose zone is unknown. |

`src/app/home/log/actions.test.ts` — new, 11 tests.

| Test | What it would catch |
| --- | --- |
| writes a planned completion through the completion seam only | A write reaching persistence any way other than `createCompletionLog()`, or a field being mangled between the form and the seam. |
| writes skip as a completion status and never as a plan change | Skip being implemented as a plan operation — the ticket's sharpest constraint. It asserts `applyChangeSet` is never called. |
| refuses a planned create whose session is not on the named day | The day bound being dropped, letting a session id alone be probed against the whole plan. |
| writes unplanned training with no planned session and no plan read | An unplanned log acquiring a planned link, or a pointless plan read on a path that has no session. |
| edits a mistaken log to skipped against the revision it was read at | An edit losing its optimistic revision, which would let one tab silently overwrite another. |
| never sends a planned snapshot or an activity list on an edit | A caller composing a snapshot, which would let the record lie about what it was measured against. |
| reports a conflict, a missing time zone, a validation failure, and an ended session in the owner's own words (4 cases) | An error surfacing as a stack trace or a wrong instruction, and a failed write being followed by a revalidation that implies success. |
| refuses an operation it does not offer | A third operation name being accepted and reaching the seam. |

`src/app/home/log/page.test.tsx` — new, 10 tests.

| Test | What it would catch |
| --- | --- |
| opens a planned session bounded by the day its link named | The plan lookup widening past the single day, or the hidden day bound going missing from the form. |
| offers skip as one outcome among the four a planned session may have | Skip disappearing from the form, or `unplanned` being offered for a session that has a plan link — a combination the write function refuses. |
| says so when the named session is not on that day | A moved or deleted session producing a crash or an empty form instead of an honest state. |
| logs unplanned training without reading the plan at all | An unplanned log requiring plan content it has no business reading. |
| reopens an existing log against the revision it was read at | An edit form losing the completion id or the revision, turning a correction into a conflict or a second record. |
| says so when the log behind the link is not there | A missing or foreign completion producing an error page rather than a truthful state — and, because the two are indistinguishable, an existence leak. |
| ignores a malformed identifier rather than looking it up | An unvalidated identifier reaching the database. |
| refuses to anchor a day for an owner with no stored zone | A form that writes a date against a zone nobody confirmed. |
| asks what was done instead only once replaced is chosen | The `replaced` description going missing, which the domain refuses, or being demanded when it does not apply. |
| replaces the form with a receipt that leads back to the day | A saved write leaving a stale form on screen whose next submit would carry a spent revision. |

`e2e/m3-15b-today-and-logging.spec.ts` — new, 1 flow at 390x844 on port 3024.
It arranges a day carrying one-off, recurring, locked, cancelled, and Recovery
day content; asserts the private, no-store headers; pages forward twice, back
to today, and back one day; sees the unfilled-day notice past the window; logs
a planned session and checks the stamp, the duration, and the reported signal;
skips another and checks the plan was not touched; logs unplanned training;
corrects the first log to skipped; and finishes on the Plan asserting the
`end_series` receipt reports `1 completed kept`. It would catch any of the
above breaking together in a real browser, plus horizontal overflow and any
uncaught page error. It creates a disposable confirmed account and deletes it
in a `finally` block.

Changed tests:

| File | Change | What it would catch |
| --- | --- | --- |
| `src/app/home/plan/series-actions.test.ts` | The end_series fixture carries `completedKept: 1` and the message assertion requires `1 completed kept`. | The completed survivor silently dropping out of the receipt copy again. |
| `src/app/home/plan/plan-manager.test.tsx` | The same count in the surface's own receipt fixture. | A type-level drift between the action result and what the surface renders. |
| `src/architecture/m3-11-legacy-reset.test.ts` | Three modules move from the legacy and maintenance lists into `rollingPlanSurface`. | Any of the three new modules reaching persistence outside the rolling-plan and completion seams, or importing a Supabase client directly. |
| `e2e/m3-11-maintenance.spec.ts` | Drops the two routes that are no longer stubs. | Nothing new; without the change the suite would assert maintenance copy on live routes. |

## Results

- `npm.cmd run typecheck` — clean.
- `npm.cmd run build` — succeeds; both routes build as dynamic (`ƒ /home/log`,
  `ƒ /home/today`).
- `npx.cmd eslint` on every changed source, test, and e2e file — clean.
- `npx.cmd prettier --write` on every changed file — no remaining differences.
- `npm.cmd run test:run -- src/architecture src/app/home/today/page.test.tsx
  src/app/home/log/actions.test.ts src/app/home/log/page.test.tsx
  src/app/home/plan/series-actions.test.ts
  src/app/home/plan/plan-manager.test.tsx` — 9 files, 70 tests, all passing.

The builder did not run the full Vitest suite, the local Supabase stack, the
pgTAP suite, or any Playwright flow to produce evidence. `AGENTS.md` assigns
that to continuous integration, and the green run for `d35856c` is the
automated-test evidence for this ticket. Its run URL belongs in this record
once the lead has pushed the branch.

## Known limitations

1. **No completion can be deleted.** M3-15A limitation 2 stands: the write
   function offers `create` and `edit` only. A log that should not exist is
   edited to `skipped`, which is what the ticket's non-goals specify. An owner
   who logged unplanned training that never happened has no way to remove the
   record at all — editing it to `skipped` is available but reads oddly for
   training that was never planned.
2. **No actual measurement and no activity capture.** Every create sends
   `activities: []`. M3-15A limitation 4 stands; the columns exist and the
   write function accepts a list, but no editor does.
3. **No start time.** `actualStartedAt` is accepted by the domain and stored by
   the schema; the form offers no field for it, so it is always absent.
4. **No new date rule, deliberately.** Backward paging is unbounded and the
   `date` parameter is only checked for being a well-formed, real ISO date —
   there is no range clamp. A date in 1970 or 2170 opens as an empty day.
   Inventing a cutoff would smuggle a product decision into a Tier 2 ticket;
   M3-15A limitation 5 is still the open question.
5. **A lost session does not return the owner to the day they were on.**
   `safeAuthReturn` allows `/home/today` with no query and `/home/log` with
   exactly one parameter, so neither `/home/today?date=…` nor the two-parameter
   `/home/log?plannedSession=…&date=…` survives a re-authentication; both fall
   back to `/home/today`. Widening that allowlist is an auth-surface change
   this ticket did not make.
6. **Today's top-up is a whole-window side effect.** `readPlanWindowToppedUp`
   is called with a single-day range, but the materialization it triggers fills
   the plan's own fourteen-day window. Opening a day far in the future
   therefore extends the plan around today, not around the day being viewed —
   which is exactly why such a day is labelled unfilled.
7. **The log page does not top up.** It reads the planned session with a plain
   `getPlanSlice`. Nothing is reachable-but-unreadable, because Today only
   links to sessions its own topped-up read returned, but the asymmetry is
   deliberate rather than incidental and is worth knowing.
8. **A late log lives on the day it happened, not the day it was planned.** A
   completion whose planned session sits on another date appears under
   **Also logged** on the day it was logged, titled from its snapshot and
   labelled with the day it was planned for. It does not appear on the planned
   session's own day, where the session card still offers `Log this session` —
   and a second log there is refused by the write function's unique index with
   a validation message rather than an explanation. This is the least
   satisfying edge in the ticket.
9. **No stall or recovery machinery on the log form.** The Plan surface carries
   `transition-watchdog` handling for lost Server Action renders; the log form
   has a pending label and a receipt only. If a response is lost the owner sees
   a stuck `Saving…` and must reload to learn what was written.
10. **An edit cannot cross the planned/unplanned boundary.** The write function
    refuses it and the form does not offer it. There is no path from a
    mislinked log to a correctly linked one other than logging the other kind
    separately and editing the first to `skipped`.
11. **`edit_series` still does not report its completed count.** The receipt
    carries `completedKept` for both series operations; only the `end_series`
    copy reports it, because that is the copy the brief named. The
    `edit_series` message stays generic.
12. **No hosted or database evidence in this record.** No migration was made,
    so there is nothing to apply to the founder project, but the founder
    smoke pass over the two reopened routes is still the product owner's to
    perform on the Preview.

## Judgment calls the brief did not settle

1. **Skip is an outcome in the form, not a button on the card.** The product
   owner decided on 30 August that "Today lists and links; the log form does
   not open inline on the card". A one-tap Skip control on a Today card would
   have made Today a write surface with its own Server Action and pending
   state, contradicting that decision and the ticket's own "Today reads; Log
   writes" framing. Skip is therefore one of the four outcomes a planned
   session may have. If the product owner wants one-tap skipping, it is a small
   follow-up, not a rework.
2. **The existing visual language was extended rather than replaced.** Both
   surfaces reuse the FitTip ledger the Plan established — cream stock, deep
   green ink, hard edges, offset shadow, Courier stamps — because a second
   design language inside one app costs the owner more than novelty gains them.
   The one new signature is the tilted, outlined **outcome stamp** struck
   across a card once training has been logged against it: a day of planning is
   a page of intentions, and the stamp is the only thing on it that is a fact.
   Nothing scores, ranks, or streaks.
3. **The log link carries two parameters.** `plannedSession` plus `date`, so
   the plan lookup can be bounded by the day rather than searching for a
   session id. The cost is limitation 5.
4. **The action re-reads the day before a planned create.** One extra
   owner-scoped query, repeating the ownership predicate at the surface and
   producing an honest "that session is not on this day" instead of a generic
   validation failure from the database.
5. **A completion the day's cards do not carry is listed rather than dropped.**
   See limitation 8 for what that costs.
6. **`e2e/m3-11-maintenance.spec.ts` was edited although the brief did not list
   it.** It asserts maintenance copy on `/home/today` and `/home/log`, which
   would fail the moment those routes reopened. Dropping exactly those two
   routes is the minimum consequential change.

## Independent reviewer focus

The diff is the source of truth; this record is for navigation. Worth the
reviewer's judgment rather than CI's:

1. **`skipped` never becomes a plan operation.** Read
   `src/app/home/log/actions.ts` end to end and confirm there is no path from
   any status to `applyChangeSet`. The only rolling-plan call in the file is
   the read in `assertSessionOnDay`.
2. **The architecture invariant was moved deliberately and completely.** All
   three modules are in `rollingPlanSurface`; none was dropped from a list
   without being added to another.
3. **Ownership on every new read and write**, against the table above. In
   particular, that a foreign completion id is indistinguishable from a missing
   one.
4. **The snapshot is never composed by a caller**, on both the create and the
   edit path.
5. **`toppedUp: false` and the beyond-window state are honest** — that neither
   can be mistaken for an empty day, and that the copy says which is which.
6. **The completions/plan matching in `renderDay`** — specifically that no
   completion returned by the day's read can be dropped from the render, and
   that limitation 8 is an accurate description of what the code does.
7. **Copy and consent tone on the four health signals**, against the F-005
   conservative, non-diagnostic requirement.

The 390px visual pass, the hosted Preview interaction, and acceptance remain
the product owner's.
