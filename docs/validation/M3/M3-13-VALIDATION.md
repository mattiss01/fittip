# M3-13 validation: private saved-session library

**Status:** testable — the independent reviewer approved `46c09c0` in round 2,
and CI is green for that code on all three jobs. **The founder-project
migration, Preview verification, and product-owner acceptance remain pending.**

**Independent review:** round 1 rejected `9c27a98` on one blocking regression;
round 2 approved `46c09c0` on the green run 32167697854. The reviewer recorded
that the round-1 judgments — the `SECURITY DEFINER` boundary against ADR-016,
the revision token, copy-by-value in both directions, RLS and ownership, M3-12
rule enforcement, the `.retry(false)` widening, and the honest states — carry
forward unchanged, because `git diff 9c27a98..e95c832` touches only two
Playwright specs and two documentation files.

**CI:**

| Run | Head | Result |
| --- | --- | --- |
| [32153286060](https://github.com/mattiss01/fittip/actions/runs/32153286060) | `54bbdbc` | **FAILURE** — the rejected round-1 code. Static and database jobs green; the 390px browser job failed on the M3-12 flow. |
| [32167697854](https://github.com/mattiss01/fittip/actions/runs/32167697854) | `e95c832` | **SUCCESS** — all three jobs, code-identical to `46c09c0`. |

The M3-12 browser flow did not merely stop failing. At `9c27a98` it died at
`e2e/m3-12-plan.spec.ts:76`, so move, duplicate, lock, unlock and cancel never
executed; in the green run both its tests pass, so those operations genuinely
ran.

**Tier:** 1 — new owner-scoped tables, RLS, grants, an owner-derived write, and
visible behavior. Dispatched by the product owner on 18 August 2026 against the
`## Agent brief` in
[`docs/backlog/M3/M3-13-PRIVATE-SAVED-SESSION-LIBRARY.md`](../../backlog/M3/M3-13-PRIVATE-SAVED-SESSION-LIBRARY.md).

**Branch:** `ticket/m3-13-private-saved-session-library`, from `master` at
`ca4719c87a70b46e6658707f763a6d5c4e847928`.

**Implementation review target:**
`46c09c0b1a328a3a32fbb8110aa9593b39665e4a`. The first review round rejected
`9c27a98`; this correction invalidates approval of every earlier commit.

| Commit | Purpose |
| --- | --- |
| `1cdc8f5e55bf2c7069d58a0934dcef82f7a1e8bb` | The migration, the pgTAP suite, the server module and repository, the `/home/plan/saved` surface, both copy entry points, and every test that goes with them. |
| `9c27a9807b2824d7e63bcea4ba88c7924bb5a981` | The two `.github/workflows/ci.yml` steps. Committed separately because `.github/**` is a tooling and supply-chain change. |
| `46c09c0b1a328a3a32fbb8110aa9593b39665e4a` | **Correction, round 1.** The blocking browser regression: both Playwright specs now anchor their disclosure filters on `:scope > summary` instead of the whole `details` subtree. |

**Review range:** `git diff ca4719c..46c09c0`. The branch carries these commits
in order: `1cdc8f5`, `9c27a98`, `54bbdbc`, `46c09c0`, `e95c832`, and any
further documentation commit recorded below. Two of them are documentation only
and carry no code — `54bbdbc` added this record and falls *inside* the review
range, and `e95c832` added the round-1 corrections to it. Both are covered by
the evidence-commit exception in `AGENTS.md`; `git diff 46c09c0..HEAD` touches
`docs/validation/M3/M3-13-VALIDATION.md` and `docs/validation/README.md` and
nothing else. The reviewed code and the branch head are therefore identical.

An earlier version of this paragraph named the head as `10daaa4`, a dangling
object left by an amend that no ref can reach. A record cannot name the SHA of
the commit that writes it, so this paragraph names the last commit that exists
when it is written and describes the rest by role rather than inventing a
number. Raised by the round-2 review as a non-blocking finding.

## Delivered behavior

An owner can now:

- open **Saved sessions** from the Plan, at `/home/plan/saved`;
- open any active planned session, choose **Save to library**, name it, and get
  a copy in the library while the planned session stays exactly as it was;
- see every saved entry with its own name, its title, sport, minutes, intent,
  note, and the activities it carries;
- edit an entry's name, title, sport, minutes, intent and note;
- add an entry to the Plan on any date inside the Plan's own fourteen-day
  window, as a new unlocked one-off session;
- delete an entry permanently, having been told before the button that there is
  no archive and no undo.

Both copy directions are by value. Editing or deleting a library entry changes
nothing already planned from it; editing or cancelling a planned session changes
nothing in the library. An empty library reads as empty.

## Mobile demo path

Local production build, port 3021, `390x844`, `Europe/Berlin`.

```powershell
npm.cmd run build
npm.cmd run start -- -p 3021
npx.cmd playwright test --config=e2e/m3-13.playwright.config.ts
```

For the Preview, at `390x844`:

1. Sign in. Open **Plan**. Confirm the offered time zone if asked.
2. Add a session on today — title, sport, minutes.
3. Open the session, expand **Save to library**, name it, submit. The notice
   reads "Saved to your library." and the planned session is unchanged.
4. Tap **Saved sessions** under the masthead. The entry appears as a card whose
   top tab carries the name you gave it.
5. Expand **Edit**, change the name and the title, save. The card updates.
6. Return to the Plan. The session you saved from still reads as it did.
7. Back in the library, expand **Use in plan**, pick a later date, **Add to
   plan**. Open the Plan: a new unlocked session sits on that date.
8. Back in the library, expand **Delete**, read the consequence, delete. The
   library reads "Nothing saved yet." Both planned sessions are still there.

## Changed files

The code manifest is `git diff --stat ca4719c..9c27a98` — everything the ticket
delivered, before review. The round-1 correction is listed separately below it.

```
 .github/workflows/ci.yml                           |  13 +
 .../M3/evidence/M3-13-empty-library-390x844.png    | Bin 0 -> 44251 bytes
 .../M3/evidence/M3-13-library-390x844.png          | Bin 0 -> 38004 bytes
 .../M3/evidence/M3-13-reused-390x844.png           | Bin 0 -> 108877 bytes
 .../M3/evidence/M3-13-save-to-library-390x844.png  | Bin 0 -> 117589 bytes
 e2e/m3-13-saved-sessions.spec.ts                   | 357 ++++++++++++
 e2e/m3-13.playwright.config.ts                     |  20 +
 package.json                                       |   1 +
 src/app/home/plan/actions.ts                       |  63 +-
 src/app/home/plan/page.tsx                         |   4 +
 src/app/home/plan/plan-manager.test.tsx            |   4 +-
 src/app/home/plan/plan-manager.tsx                 |   3 +
 src/app/home/plan/plan-window.ts                   |  65 +++
 src/app/home/plan/plan.module.css                  |  22 +
 src/app/home/plan/saved/action-state.ts            |  49 ++
 src/app/home/plan/saved/actions.test.ts            | 357 ++++++++++++
 src/app/home/plan/saved/actions.ts                 | 342 +++++++++++
 src/app/home/plan/saved/error.tsx                  |  18 +
 src/app/home/plan/saved/loading.tsx                |  13 +
 src/app/home/plan/saved/page.tsx                   | 156 +++++
 src/app/home/plan/saved/save-to-library.tsx        |  69 +++
 src/app/home/plan/saved/saved-library.test.tsx     | 162 ++++++
 src/app/home/plan/saved/saved-library.tsx          | 365 ++++++++++++
 src/app/home/plan/saved/saved.module.css           | 322 +++++++++++
 src/architecture/server-boundary.test.ts           |  20 +-
 src/lib/supabase/database.types.ts                 | 140 +++++
 .../repositories/saved-session-repository.test.ts  | 266 +++++++++
 .../repositories/saved-session-repository.ts       | 262 +++++++++
 src/server/saved-sessions/saved-sessions.test.ts   | 263 +++++++++
 src/server/saved-sessions/saved-sessions.ts        | 324 +++++++++++
 src/server/saved-sessions/session-copy.test.ts     | 170 ++++++
 src/server/saved-sessions/session-copy.ts          |  80 +++
 ...8143303_m3_13_private_saved_session_library.sql | 381 +++++++++++++
 .../m3_13_private_saved_session_library.test.sql   | 631 +++++++++++++++++++++
 .../m3_13_concurrent_saved_session_edits.mjs       | 248 ++++++++
 35 files changed, 5135 insertions(+), 55 deletions(-)
```

**Round-1 correction**, `git diff --stat 9c27a98..46c09c0 -- e2e`:

```
 e2e/m3-12-plan.spec.ts           | 24 ++++++++++++++----------
 e2e/m3-13-saved-sessions.spec.ts | 12 +++++++++++-
 2 files changed, 25 insertions(+), 11 deletions(-)
```

The rest of `git diff 9c27a98..46c09c0` is `54bbdbc`, this record and its index
entry. Nothing else changed.

Nothing was deleted or renamed.

Files whose purpose is not evident from the path and diff:

- **`src/server/saved-sessions/session-copy.ts`** — the copy seam itself, both
  directions in one module. `toSavedSessionDraft` decides what a save keeps and
  what it drops; `toRollingPlanSessionInput` turns an entry into the Plan's own
  `add`. The contract that nothing links the two records is expressed here
  rather than by a foreign key, which is why it is a module and not two inline
  object literals.
- **`src/app/home/plan/plan-window.ts`** — new, and the only change to already
  accepted M3-12 behavior. Three helpers were private to
  `src/app/home/plan/actions.ts`; reuse must land on exactly the dates and
  positions the Plan itself offers, so they moved to a shared server-only
  module and `actions.ts` now imports them. **Two were renamed in the move:**
  `readWindow` → `readPlanWindow` and `nextPosition` → `nextPlanPosition`;
  `readPlannableDate` kept its name. The bodies are character-for-character
  unchanged and no reference to the old names survives. `MAX_POSITION` moved
  with `nextPlanPosition`.
- **`src/app/home/plan/saved/save-to-library.tsx`** — the save entry point,
  rendered inside each planned session on `/home/plan` rather than on the
  library route. It holds its own `useActionState`, so saving never touches the
  Plan's change machinery or its notice.
- **`src/architecture/server-boundary.test.ts`** — the `.retry(false)`
  allowlist deliberately widens from four RPCs to five. See "Data, migration,
  API, privacy, and security effects".
- **`src/app/home/plan/plan-manager.test.tsx`** — one assertion changed from
  `getByRole("status")` to `getAllByRole("status")[0]`. The save control adds a
  second live region inside each session card, so the unqualified query now
  matches more than one element. The manager's own notice is the first in DOM
  order.

## Data, migration, API, privacy, and security effects

**Migration** `supabase/migrations/20260818143303_m3_13_private_saved_session_library.sql`,
purely additive. It touches no existing table, function, type, policy or grant.
`apply_rolling_plan_change_set` and `rolling_plan_change_receipt` are not
modified, and no plan change operation is added — the pgTAP suite asserts the
recorded change kinds are unchanged.

Two tables:

| Table | Columns |
| --- | --- |
| `public.saved_sessions` | `id`, `user_id`, `name`, `title`, `sport`, `intent`, `expected_duration_minutes`, `note`, `revision`, `created_at`, `updated_at` |
| `public.saved_session_activities` | `id`, `user_id`, `saved_session_id`, `personal_activity_id`, `position`, `name`, `sport`, `instructions`, `measurement_mode`, `target`, `created_at`, `updated_at` |

Neither carries `local_date`, `position` on the session, `is_locked`, `status`,
`cancelled_at`, `plan_id`, occurrence identity, completion state, proposal
decision, or any source reference. The saved activity carries no `is_locked`,
because a lock is a Plan fact. pgTAP asserts the absence of all of these by
name, and asserts that no foreign key runs between the library tables and the
rolling-plan tables in either direction.

**Privilege and policy matrix** (asserted by pgTAP):

| Role | `saved_sessions` | `saved_session_activities` | `apply_saved_session_change` | `saved_session_activity_input_is_valid` |
| --- | --- | --- | --- | --- |
| `authenticated` | SELECT only | SELECT only | EXECUTE | none |
| `anon` | none | none | none | none |
| `service_role` | none | none | none | none |
| `public` | none | none | none | none |

RLS is enabled on both tables with exactly one policy each:
`for select to authenticated using ((select auth.uid()) = user_id)`. There is no
mutation policy, because no client role holds a mutation privilege.

**Ownership.** `apply_saved_session_change` is `security definer`,
`set search_path = ''`, and takes its owner from `auth.uid()` alone. It accepts
no owner argument, and a call without a verified subject is refused `42501`
before anything is written. A `before update` trigger on both tables refuses any
change to `user_id` even from a privileged path.

**Concurrency.** Each library record carries a `revision`. Edit and delete send
back the revision the surface read; the function takes a bounded `for update`
row lock (`lock_timeout` 3s, ADR-010) and refuses `PT409` if the record is gone
or the revision has moved. Locking the one row rather than the whole library
lets two different entries be edited at the same time. A record that belongs to
another owner is reported identically to one that never existed, so the refusal
leaks nothing.

**The `.retry(false)` allowlist widens from four RPC calls to five.** A library
create is not idempotent — it carries no idempotency key and duplicates are
deliberately allowed — so an automatic client retry of a dropped response would
save the same session twice. `src/architecture/server-boundary.test.ts` was
updated deliberately, and still pins the exact set, the exact count per file,
and the exact RPC name each one guards.

**Types.** `src/lib/supabase/database.types.ts` regenerated with the CLI, then
formatted, then patched, in that order. The diff is additive: the two tables,
the two functions, and the `saved_session_receipt` composite type.

**Browser storage.** Nothing new. This surface writes no `localStorage` or
`sessionStorage` key.

**Credentials.** `SUPABASE_SERVICE_ROLE_KEY` is used only by the Playwright
spec and the concurrency harness, only to create and delete a disposable
confirmed user. It never reaches application code and is never logged.

**Packages.** None added or changed.

## Tests and final results

The CI run for `46c09c0` is the automated-test evidence for this ticket. That
run does not exist yet: the lead pushes the correction and records its URL and
conclusion here.

**The rejected run.** https://github.com/mattiss01/fittip/actions/runs/32153286060
for `9c27a98` — static green, database green, **browser red** on the
`M3-12 manual continuous planning` step. `e2e/m3-12-plan.spec.ts` filtered
`details` by `hasText`, a case-insensitive substring match over the whole
subtree; M3-13's save-to-library consequence copy ends "will not follow later
edits", so a filter for the `Edit` disclosure matched two elements and strict
mode threw at line 76. Nothing in the M3-12 flow past that line ran, so move,
duplicate, lock, unlock and cancel were unexercised at that SHA. The
known-defect exception does not apply: `master` at the branch base `ca4719c` is
green (run 32148259497), and the failure is in behavior this ticket changed.
`46c09c0` anchors the filter on the summary and both flows now pass locally in
full, including every step after line 76.

Everything below is what was observed locally, not a substitute for the CI run
for `46c09c0`.

| Command or check | Result |
| --- | --- |
| `npx.cmd supabase db reset --local` | Every migration applied from zero, including this one. |
| `npx.cmd supabase db lint --local --level warning --fail-on warning` | No schema errors. |
| `npx.cmd supabase db advisors --local --type all --level warn --fail-on warn` | No issues found. |
| `npx.cmd supabase test db --local supabase/tests/database` | 10 files, 620 tests, all passing. This ticket's file contributes 71. |
| `npm.cmd run test:m3-13-concurrency` | PASS. 12 same-revision edit races each produced one winner and one `PT409` stale loser with no blended row; a delete raced against an edit resolved the same way; a cross-owner edit and a direct table write were both refused. |
| `npx.cmd playwright test --config=e2e/m3-13.playwright.config.ts` | 1 passed, 0 skipped, 10.1s, against `build` + `start` on port 3021 at `390x844`. Re-run at `46c09c0` after a clean `db reset`. |
| `npx.cmd playwright test --config=e2e/m3-12.playwright.config.ts` | 2 passed, 0 skipped, 13.5s, on port 3020. Run at `46c09c0` to confirm the regression is gone and that the whole M3-12 flow — including the move, duplicate, lock, unlock and cancel steps that never ran at `9c27a98` — passes. |
| `npm.cmd run lint`, `npm.cmd run typecheck` | Clean. |
| `npm.cmd run test:run` | 63 files passed, 1 skipped; 736 tests passed, 1 skipped. |
| `git diff --check` | No whitespace errors. |
| Prettier over the staged blobs | Clean for every file in the commit. |

The first full `test:run` of the session reported five unrelated jsdom render
timeouts at the default 5000 ms budget while the production server was still
serving port 3021 on the same machine. They are the contention flake M3-12's
record describes; with the server stopped the same command passed with zero
failures. That is stated here because it happened, not as a claim about CI.

**What the pgTAP suite proves** beyond structure and privileges:

- a create copies every activity, its target, and its same-owner
  `personal_activity_id`, and refuses one that names a personal activity the
  owner does not hold;
- a reuse composed from the stored values reaches the Plan through the
  unchanged change function, lands unlocked, and is refused `PT422` on a past
  date and `PT423` on a date already holding ten active sessions;
- editing the library entry leaves the planned session made from it byte-for-
  byte as it was, and editing that planned session leaves the entry alone;
- deleting the entry removes it and its activities permanently and leaves every
  planned session standing;
- a write at a stale revision, a write against a deleted record, and a write
  from another owner all raise the same `PT409`;
- direct authenticated insert on either table is denied, anonymous reads and
  calls are denied, and the owner column cannot be reassigned even as the
  table owner.

**390px evidence** (`docs/validation/M3/evidence/`):

- `M3-13-save-to-library-390x844.png` — the save control open inside a planned
  session, with the consequence copy and the "Saved to your library." notice.
- `M3-13-library-390x844.png` — the library with one entry: the name tab, the
  title, the meta line, the intent, and the two copied activities.
- `M3-13-reused-390x844.png` — the Plan after a reuse, with the copy unlocked
  on the chosen date carrying both activities.
- `M3-13-empty-library-390x844.png` — the empty state, and the ledger-ink focus
  ring on "Back to the plan".

**Project skills applied.** `schema-change` (the local migration → clean reset →
pgTAP → regenerate-types sequence, run in that order). `codebase-design` (the
library is one deep module behind `list` / `get` / `applyChange`; the copy seam
is a second small module; the Postgres adapter sits at the seam).
`vercel-react-best-practices` — rules checked: `server-auth-actions` (every
server action derives the owner through the repository's verified-user check),
`server-serialization` (only `SavedSessionView` crosses to the client; no
`revision` chain, no adapter, no repository), `async-parallel` (the library page
reads the profile and the library with one `Promise.all`), `bundle-barrel-imports`
(direct module imports throughout), `rerender-derived-state-no-effect` (the form
reset key is adjusted during render, not in an effect), and the server/client
boundary rule (no `"use client"` file imports `@/server/**`, asserted by
`src/architecture/server-boundary.test.ts`). `frontend-design` (the catalog-card
signature, the archival blue-black accent that distinguishes reference material
from the Plan's action orange, the M3-18 focus ring, reduced-motion guard, and
copy that states consequences before actions). `mobile-e2e` (390x844 against a
production build on an isolated port, with the disposable account deleted on
every path). `validation-record` (this document).

## Known limitations

1. **A saved session's activities cannot be edited.** The library's `edit`
   carries no activity list and the function refuses one that does; the copied
   activities stay exactly as saved. That is honest today because nothing in
   the product can create or edit an activity at all — M3-12 shipped no activity
   editor and proposals are M3-16. To change an entry's activities an owner
   must delete it and save again. When an activity editor exists, the library
   edit will need a deliberate decision about replacing the list atomically.
2. **The e2e flow seeds its activities through the owner's own change
   function**, not through the UI, because no UI can create one. It signs in
   over the API with the same account's password and calls
   `apply_rolling_plan_change_set` with an activity list. That uses no
   privileged credential and no grant the owner does not already hold, but it
   is still a fixture, and the activity copy path is therefore demonstrated
   rather than reachable by a product owner clicking through the Preview.
3. **The library is unbounded.** There is no cap on how many entries one owner
   may save and no pagination; the page lists all of them. The brief set no
   cap and duplicates are deliberately allowed, so none was invented. A later
   ticket that expects large libraries needs a bound, a search, or both.
4. **A library create has no idempotency key.** `.retry(false)` stops the
   client library retrying, and the submit button is disabled while pending,
   but a genuinely double-submitted save produces two entries. Duplicates are
   permitted by the ticket, so this is a nuisance rather than a defect; the
   Plan's own change set has an idempotency key and this does not.
5. **Reuse is bounded by the Plan's fourteen-day write window**, inherited from
   M3-12 through `readPlanWindow`. The library offers exactly the dates the
   Plan offers and no others. M3-12's limitation 3 about that window being a
   write boundary as well as a read boundary applies here unchanged.
6. **The library page reads the plan revision only to hold it for a reuse.**
   If the plan changes in another tab after the page renders, the reuse is
   refused as a stale conflict with a reload link rather than retried. That is
   the safe direction and matches the Plan surface, but it means a reuse can be
   refused for a reason that has nothing to do with the library.
7. **No lost-render watchdog on this surface.** `/home/plan` carries the
   fourth copy of the transition-watchdog glue; the library does not. Its
   writes are single-row and its notice states pending honestly, but a reply
   that never arrives shows a stuck "Saving change…" rather than a recovery.
   Adding a fifth copy would have widened the consolidation debt M3-12's
   limitation 8 already records.
8. **`e2e/m3-13-saved-sessions.spec.ts` skips silently** without
   `SUPABASE_SERVICE_ROLE_KEY`. Read the skipped count before calling a run
   green; the local run above reported 1 passed, 0 skipped.
9. **The spec writes its screenshots into the tracked
   `docs/validation/M3/evidence/` path**, so every run leaves the working tree
   dirty with re-encoded PNGs. That follows the existing convention rather than
   splitting it for one spec; M3-12's limitation 12 records the fix that is
   owed for all of them at once.
10. **`service_role` still holds `GRANT ALL` on `public.profiles` while lacking
    `EXECUTE` on `is_iana_timezone_name`** (M3-12's limitation 10). Unrelated to
    these tables — `service_role` holds nothing at all on them — but unchanged.

Raised by the first review round:

11. **A library card renders `intent` and `note` as two indistinguishable
    unlabeled paragraphs.** `saved-library.tsx` prints each as a bare
    `<p className={styles.body}>`, so an entry carrying both shows two blocks of
    body copy with nothing saying which is the intent and which is the note.
    The Plan surface does the same thing, so this is consistent rather than
    novel, and it is deliberately not restyled here: it is a visible-design
    question for the product owner's 390px pass, not a correctness defect. If
    they want them distinguished, that is a small follow-up on both surfaces at
    once rather than on this one alone. (Reviewer's observation.)
12. **The migration uses bare `trunc(...)` at line 196 where most other
    builtins in the file are `pg_catalog.`-prefixed.** Left as is, deliberately.
    It is safe — `pg_catalog` is searched first whatever `search_path` says —
    and the file also uses bare `nullif`, `coalesce` and `exists` throughout.
    That is exactly the convention of
    `20260814164502_m3_10_rolling_plan_foundation.sql`, which the brief told
    this migration to mirror and which contains the identical bare
    `trunc(v_position)` line. "Fixing" it here would make the mirror diverge
    from the thing it mirrors. (Reviewer's optional note, declined with reason.)

## Judgment calls the brief did not settle

Stated plainly so the reviewer can check them rather than discover them.

1. **Writes go through one owner-derived `security definer` function, and the
   tables grant only SELECT to `authenticated`.** The brief required
   "owner-scoped, immutable `user_id`, RLS, deliberate grants" and "library
   writes derive the owner from `auth.uid()`" without saying whether that meant
   direct table grants under a `with check` policy or an owner-derived
   transaction. I chose the transaction for three reasons: a save copies a
   record and its activities and must be all-or-nothing, which two PostgREST
   requests cannot be; the revision token is unbypassable only if no client can
   write the row directly; and every other multi-table owner write in this
   repository already has this exact shape. The cost is one more
   `SECURITY DEFINER` boundary, which is not reversible.

   **On the ADR gate:** the `schema-change` skill requires that a new
   privileged boundary already have an ADR. I did not write one — a builder
   cannot approve one — and I read ADR-016 as already covering it: it names
   saved sessions explicitly ("owner-scoped current templates copied by
   value"), and it makes "same-owner constraints, explicit privileges, RLS,
   owner-derived transactions, bounded lock waits, idempotency, and
   stale-revision checks" mandatory for F-005 persistence. If the reviewer or
   the product owner reads that as not covering a new function, this is the
   thing to reject, and the alternative — table-level INSERT/UPDATE/DELETE
   grants with owner policies, as `personal_activities` has — is a real
   design that would need the atomicity limitation written down instead.
2. **`readPlanWindow`, `readPlannableDate` and `nextPlanPosition` moved out of
   M3-12's `actions.ts` into `plan-window.ts`.** Reuse must land on the same
   dates and positions the Plan offers, and duplicating three functions to
   avoid touching an accepted file would have created two definitions of the
   plan window. The bodies are unchanged. This is the only edit to accepted
   M3-12 logic.
3. **The library page and the reuse action tolerate an owner with no stored
   time zone.** The entries are still listed, inspectable, editable and
   deletable; only the date picker is replaced with a line saying to confirm
   the zone on the Plan first. Refusing the whole page would have been the
   other reasonable reading.
4. **`edit` refuses an activity list rather than accepting and ignoring one.**
   Silently dropping a field a caller sent is the failure mode the working
   agreement objects to, so the function raises `22023` instead.
5. **A missing record and another owner's record both answer `PT409`, not a
   distinct not-found.** Two open tabs where one deletes and the other edits is
   the real case, and "it changed" is the honest thing to say. It also means
   the refusal cannot be used to probe whether an id exists.
6. **`saved_session_activity_input_is_valid` accepts an explicit `"target":
   null` as well as an absent key**, where M3-10's equivalent validator rejects
   the explicit null. That is a deliberate one-line divergence from the mirror,
   not an oversight: the two mean the same thing and the stricter reading is a
   trap for the next caller.
7. **No per-owner cap on library size**, see limitation 3.
8. **Adding a second disclosure and a second live region inside an existing
   session card changed what two existing selectors matched.** The live-region
   collision was caught while building, in `plan-manager.test.tsx`; the
   disclosure collision was not, and it is what failed review. Both are the
   same class: an existing selector that matched a whole subtree when it meant
   to match a label. After the correction, every disclosure lookup in both
   specs is anchored on `:scope > summary`, and I have re-checked the rest of
   what M3-13 adds inside the Plan's session card against the M3-12 spec — the
   `Name it` label, the `Save to library` button, the consequence copy and the
   status paragraph collide with none of the labels, button names, headings,
   `[data-plan-date]` counts or `li` filters that spec relies on. The reviewer
   should still treat that as a claim to check rather than a guarantee.
9. **The Vitest fake adapter in `saved-sessions.test.ts` is not a shared
   contract.** Unlike the rolling plan, there is no
   `saved-session-contract.ts` run against both an in-memory and a real
   Postgres adapter, because there is only one production adapter. The real
   database behavior is proved by pgTAP and by the concurrency harness instead.

## Independent reviewer checklist

Review commit **`9c27a9807b2824d7e63bcea4ba88c7924bb5a981`** on
`ticket/m3-13-private-saved-session-library`, range `git diff ca4719c..9c27a98`.
Confirm the CI run for that exact SHA is green before anything else, and that
the Vitest, pgTAP, advisor, concurrency and browser steps all executed. Do not
re-run lint, typecheck, the Vitest suite, the build, the database matrix, or the
browser flows.

Judgment this ticket needs and CI cannot supply:

1. **The new privileged boundary.** `apply_saved_session_change` is a
   `SECURITY DEFINER` function and is not reversible. Decide whether ADR-016
   covers it, as judgment call 1 argues, or whether this needs its own ADR
   before it can be accepted. Then check the function itself: that it takes the
   owner from `auth.uid()` and nowhere else, that `search_path` is empty, that
   every catalog reference is schema-qualified, that the `create` branch cannot
   be given an id or a revision, and that the exception handler cannot swallow
   the `PT409` raise.
2. **The copy-by-value contract.** Read `session-copy.ts` against the brief's
   list of excluded fields, and satisfy yourself that the pgTAP assertions
   about editing and deleting in both directions actually prove independence
   rather than restating it. The round-trip test in `session-copy.test.ts` is
   the place a dropped field would show up.
3. **That `apply_rolling_plan_change_set` and its receipt are untouched**, that
   no change operation was added, and that a reuse is genuinely a plain `add`.
   The brief fixes this; the diff should contain no SQL touching that function.
4. **The `.retry(false)` widening from four to five.** Confirm the reason given
   is the real one and that the invariant still pins the exact set and count.
5. **The `plan-window.ts` extraction.** Compare the moved bodies against
   `ca4719c`'s `actions.ts` — where two of them are spelled `readWindow` and
   `nextPosition` — and confirm nothing changed but the location and those two
   names, and that the Plan surface still bounds every write the same way it
   did.
6. **Product invariants.** Nothing here is shared, global, coach-authored, or
   cross-owner. Deleting is permanent and says so first. An empty library reads
   as empty rather than as a prompt or something to earn. No copy implies a
   completion, a score, a streak, or a judgment.
7. **The honest states.** Loading, empty, invalid, stale conflict, plan
   conflict, expired session, and offline-safe failure each have copy and a
   real recovery. Check the missing-time-zone path in particular: it is the one
   state where part of the surface is deliberately unavailable.
8. **The `390x844` Preview**, once the lead has pushed and applied the
   migration to the founder project in timestamp order. The visual pass is the
   product owner's.
