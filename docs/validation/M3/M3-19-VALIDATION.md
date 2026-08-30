# M3-19 validation: delete a planned session

**Ticket:** [M3-19](../../backlog/M3/M3-19-DELETE-A-PLANNED-SESSION.md)
**Status:** testable — through five review rounds. Round 1 rejected `1e12dce`
on one blocking finding, which the product owner resolved by accepting the
behavior and requiring the surface to describe it honestly. Rounds 2 to 5 each
approved with findings and no blocking defect, and each round's findings are
closed in the commits above the target it reviewed; whether a sixth round
follows is the reviewer's to decide. The founder migration is applied. A fresh
CI run, re-review, a fresh Preview and product-owner acceptance are
outstanding.
**Tier:** 1
**Branch:** `ticket/m3-19-delete-a-planned-session`
**Base:** `37529e20ea373034d7ede6b64e0b6dfde8d5e940`
**Implementation review target:** `368f78caf6b21eb0aa1b4483a976f463591c91e3`
**Review range:**
`git diff 37529e20ea373034d7ede6b64e0b6dfde8d5e940..368f78caf6b21eb0aa1b4483a976f463591c91e3`
**Superseded targets:** `1e12dce8a5be752fac55525074c2e15da0e8710c` rejected in
round 1, `437d47078cea73a908c65d5d30fd09ee2428bfff` approved in round 2,
`d422f81675968f32cbe7240ffd8c392551b5cac3` approved in round 3,
`f2f71081788ed225a800479fa5ad76371fd7c07c` approved in round 4, and
`873e5e182f2fbd665434f0925ee1cfeb72315e61` approved in round 5. Each correction
range runs from one target to the next and carries the record commits sitting
between them, so the source change inside it is smaller than the range itself:
round 3's is `f2f7108` alone
(`git diff d422f81675968f32cbe7240ffd8c392551b5cac3..f2f71081788ed225a800479fa5ad76371fd7c07c`),
round 4's is `41fcbc0` alone and moves a comment
(`git diff f2f71081788ed225a800479fa5ad76371fd7c07c..41fcbc0db5e275fc2a2e0ea5376ad0a985073a97`),
and round 5's changes no source file at all
(`git diff 873e5e182f2fbd665434f0925ee1cfeb72315e61..368f78caf6b21eb0aa1b4483a976f463591c91e3`,
plus the record-only commits that follow it).

Implementation commits, in order:

| Commit | Purpose |
| --- | --- |
| `2a4b12d2a201dfa8dabce905c11b66c2e028b01a` | The forward migration and its pgTAP suite. |
| `07b223eeccb660394a08ea099e4608f00da81d65` | The domain seam: union, parser, rule reason, in-memory adapter, shared contract. |
| `1adfee12b4a03917eefa3902f8a97b5f506980b2` | The Plan surface: Cancel and Delete on the card, and the action layer behind them. |
| `a8710d355b436751133fe81b7c8ee3eb37029bbe` | The per-ticket 390px flow and its pinned config. |
| `18db449fbd0fdd9ffcb953cb21d5a43e81f16d27` | The CI step that runs that flow. |
| `1e12dce8a5be752fac55525074c2e15da0e8710c` | The four-control card layout at 390px, and the flow's evidence screenshots. |
| `437d47078cea73a908c65d5d30fd09ee2428bfff` | **Review correction round 1.** Honest copy and a toast for the accepted occurrence refill, and the contract test that pins it. |
| `d422f81675968f32cbe7240ffd8c392551b5cac3` | **Review correction round 2.** The divergence loss the occurrence warning omitted, the real name of the control it points at, and coverage of the unknown refill branch. |
| `f2f71081788ed225a800479fa5ad76371fd7c07c` | **Review correction round 3.** The occurrence warning is now conditioned on the rule date the materializer will actually refill, so it stops promising a refill that will not happen and stops naming a control that is not rendered. |
| `41fcbc0db5e275fc2a2e0ea5376ad0a985073a97` | **Review correction round 4.** The `DeleteSession` docblock, which round 3 left stranded on `occurrenceOf` when it inserted two helpers beneath it, is back on the component it describes. Comment placement only; no executable line moved. |

## Delivered behavior

An owner now has three distinct verbs over one planned session.

**Cancel** is unchanged from M3-12: the row survives with `status =
'cancelled'`, stays visible under **Cancelled**, and keeps its before/after
change entry. Only its label and copy changed.

**Delete** is new. It hard deletes the row. What survives is the dated `delete`
change entry M3-14 already defined for series removal, carrying the session's
before state and its local date but no session id — which is exactly what lets
the entry outlive the row whose own earlier entries the foreign key cascades
away. The plan revision advances once, as it does for every other operation.

Delete accepts an `active` or a `cancelled` session, because a session the
owner already cancelled is exactly what they may next want gone. A lock does
not refuse it: F-005's amendment of 19 August 2026 makes a lock a defence
against a sweep, not against the owner's own deliberate individual act. The
past boundary still holds, with the same `PT422` copy every other operation
uses.

A session carrying a completion cannot be deleted. `completions_plan_fkey`
would refuse it anyway, but the function raises `PT425` first, so the surface
shows the owner "You have logged training against this session, so it cannot be
deleted. Cancel it instead to keep the record." rather than a foreign-key
violation.

The card control that read **Remove** and performed a cancel now reads
**Cancel**. **Delete** sits beside it behind its own disclosure, so neither
destructive verb is one stray tap away. A cancelled session's card carries the
Delete control too.

**Whether deleting one occurrence of a recurring series keeps it deleted
depends on the occurrence's rule date**, and the surface says which case the
owner is in. While that date is still one the series fills — at or after today,
at or after the segment's start date, and not past its end date if it has one
— the delete does not stick: the top-up that follows every plan change sees the
date uncovered and writes the occurrence back in the same request, so deleting
a cancelled occurrence brings it back active. That is an accepted product
decision of 29 August 2026, described in limitation 1 and carried by the Delete
disclosure's own copy and by the toast. Let any one of those three conditions
fail — the date behind today, reachable by moving an occurrence forward and
waiting a day, or outside the segment, reachable by a locked occurrence
surviving past the end date its series was later given — and nothing refills
it, because the materializer writes only dates its segment covers, inside
`today .. today + 13`. There the delete is as permanent as a one-off's, and the
copy says so instead, naming no escape control, because the same predicate that
settles the scope has withheld the one the refill warning quotes.

## Mobile demo path

Local production run at `390x844`, on the ticket's own pinned port:

1. Docker running, then `npx.cmd supabase start` and
   `npx.cmd supabase db reset --local`.
2. `npm.cmd run build`.
3. Export `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   and `SUPABASE_SERVICE_ROLE_KEY` for the local stack, then
   `bash .github/scripts/with-server.sh 3023 npx.cmd playwright test
   --config=e2e/m3-19.playwright.config.ts --workers=1`.

By hand on the Preview, signed in at `390x844`:

1. Open `/home/plan` and confirm the time zone.
2. Create two sessions on today and one on tomorrow.
3. On a card, confirm the controls read **Edit**, **Cancel**, **Delete** and
   **Lock**, paired two to a row, and that no control reads "Remove".
4. Open **Cancel**. The copy says the session is kept on the record as
   cancelled. Submit; the session moves under **Cancelled**.
5. Open **Delete** on the second session. The copy says it is not kept on the
   record and that there is no undo. Submit; the session is gone, and no
   Cancelled entry appears for it.
6. Lock the third session, then delete it. The lock does not refuse it.
7. Open **Delete** on the cancelled session under **Cancelled**. Submit; the
   Cancelled section disappears with it.

The completion refusal has no hosted path yet, because the logging surface is
M3-15B. It is covered locally by the browser flow, which writes the completion
through M3-15A's own owner-derived function using the account's own access
token. See known limitations.

## Changed files

Exact base-to-implementation stat, base to `368f78c`:

```text
 .github/workflows/ci.yml                           |  10 +
 docs/validation/M3/M3-19-VALIDATION.md             | 679 +++++++++++++++++++++
 .../M3/evidence/M3-19-card-verbs-390x844.png       | Bin 0 -> 114936 bytes
 .../M3-19-founder-migration-list-before.txt        |  33 +
 .../M3/evidence/M3-19-founder-migration-push.txt   |  30 +
 .../M3/evidence/M3-19-founder-migration-runbook.md | 203 ++++++
 .../M3/evidence/M3-19-logged-refusal-390x844.png   | Bin 0 -> 105571 bytes
 docs/validation/README.md                          |  23 +
 e2e/m3-12-plan.spec.ts                             |   6 +-
 e2e/m3-14b-recurring-series.spec.ts                |   4 +-
 e2e/m3-19-delete-session.spec.ts                   | 316 ++++++++++
 e2e/m3-19.playwright.config.ts                     |  19 +
 src/app/home/plan/action-state.ts                  |  10 +-
 src/app/home/plan/actions.test.ts                  | 150 +++++
 src/app/home/plan/actions.ts                       | 151 ++++-
 src/app/home/plan/plan-manager.test.tsx            | 167 ++++-
 src/app/home/plan/plan-manager.tsx                 | 188 +++++-
 src/app/home/plan/plan.module.css                  |  21 +-
 src/app/home/plan/recurring-session-controls.tsx   |  49 +-
 src/server/repositories/rolling-plan-repository.ts |   2 +
 .../rolling-plan/in-memory-rolling-plan-adapter.ts |  25 +
 src/server/rolling-plan/rolling-plan-contract.ts   | 186 +++++-
 src/server/rolling-plan/rolling-plan.test.ts       |   2 +
 src/server/rolling-plan/rolling-plan.ts            |  17 +-
 ...260829135426_m3_19_delete_a_planned_session.sql | 656 ++++++++++++++++++++
 .../m3_19_delete_a_planned_session.test.sql        | 555 +++++++++++++++++
 .../m3_10_rolling_plan_postgres.test.ts            |  16 +
 27 files changed, 3463 insertions(+), 55 deletions(-)
```

That stat counts this record as it stood at `368f78c`; the record-only commits
that close round 5 add to its own row after that point.

Purpose notes for paths whose role is not evident from the path and diff:

- `supabase/migrations/20260829135426_m3_19_delete_a_planned_session.sql` is
  656 lines because PL/pgSQL has no partial replacement: the whole body of
  `apply_rolling_plan_change_set` is restated to change four things. It was
  generated by extracting M3-15A's emission of the function verbatim and
  applying exactly four textual substitutions, so the reviewer can diff it
  against lines 783-1345 of `20260829073444_m3_15a_completion_foundation.sql`
  and see four hunks and no other difference. Those four hunks are listed in
  the migration's own header comment.
- `e2e/m3-12-plan.spec.ts` and `e2e/m3-14b-recurring-series.spec.ts` change
  only because they asserted the retired "Remove" label and the summary text of
  the disclosure that is now "Cancel". No behavior of either ticket changed.
- `src/app/home/plan/recurring-session-controls.tsx` changes two strings. The
  occurrence-scoped button read "Remove only this session" while performing a
  cancel, which is the exact defect this ticket exists to fix; and one fallback
  sentence said "removed" of the same act. The series-scoped control beside
  them, which genuinely does remove, is untouched.
- `supabase/tests/integration/m3_10_rolling_plan_postgres.test.ts` gains the
  contract's new `completeSession` capability for the Postgres adapter. It
  calls `apply_completion_change` through the contract owner's own client, not
  a privileged one, so the refusal it sets up is the one a real owner meets.
- `src/server/rolling-plan/in-memory-rolling-plan-adapter.ts` gains a
  `recordCompletion` test seam. Completions live outside this seam; the only
  fact modelled is the one the plan side has to consult.

- `src/app/home/plan/actions.ts` carries three things beyond the delete branch.
  `occurrenceRefill` decides whether the top-up put a just-deleted occurrence
  straight back, from one bounded single-date read reached only when a delete
  was followed by a top-up that created something; `deleteCopy` turns its three
  outcomes into three toasts. `deletedOccurrence` finds the session that
  change set is about to delete — added in round 1 reading `formData`, changed
  in round 2 to read the id off the composed change instead, so the id it
  reports on is the id that was applied and the request is not read a third
  time. Its `find` predicate is deliberately *not* `requireSession`'s: that one
  filters on status and this one must not.
- `src/app/home/plan/recurring-session-controls.tsx` exports
  `occurrenceHasFutureRuleDate` as of round 3. It was the local `canChangeFuture`
  computation and is now shared with the Delete warning, which is what stops the
  warning naming a series-removal control the same predicate has withheld.
- `docs/validation/M3/evidence/M3-19-founder-migration-list-before.txt` and
  `M3-19-founder-migration-push.txt` are the unedited Supabase CLI output the
  hosted-migration section below quotes, captured so its history-alignment
  claim can be rechecked rather than taken on trust.

Nothing was deleted or renamed.

## Data, migration, API, privacy and security effects

- **One forward migration**,
  `20260829135426_m3_19_delete_a_planned_session.sql`. It `create or replace`s
  `apply_rolling_plan_change_set` and re-emits its `revoke`/`grant` pair.
  Nothing else runs.
- **No structural change at all.** No table, column, constraint, index, policy,
  trigger, grant or function signature is added, dropped or altered. No new
  change kind is introduced: `change_kind = 'delete'` and the target check that
  requires it to name a date and no session have existed since M3-14, and are
  reused exactly.
- **No generated-type change.** The function's signature is unchanged.
  Regenerating `src/lib/supabase/database.types.ts` from the reset local stack
  and formatting it produced a byte-identical file, so the committed file is
  untouched.
- **New owner-visible error code `PT425`**, raised only by that function and
  mapped in `PostgresRollingPlanAdapter` to
  `RollingPlanRuleError("session-completed")`. `PT402`, `PT409`, `PT422`,
  `PT423`, `PT424`, `PT428` and `PT429` were already in use; `PT425` was free.
- **Authorization is unchanged.** The function stays `security definer` with
  `set search_path = ''`, takes no owner argument, derives the owner from
  `auth.uid()`, and is executable by `authenticated` alone. Every statement in
  the new branch carries an explicit `user_id = v_user_id` predicate, so
  another owner's session is simply not found.
- **Concurrency.** The new branch takes `for update` on the session row before
  testing for a completion. `for update` conflicts with the `for key share` a
  concurrent completion insert's foreign key takes, so the check cannot be
  raced past. The existing per-owner advisory lock and ADR-010 bounded lock
  wait are unchanged.
- **No new browser storage, credential, package, external service, AI call or
  spend.** `SUPABASE_SERVICE_ROLE_KEY` is used only at test runtime by the
  browser flow, to create and delete its disposable account, exactly as the
  existing flows use it. The completion the flow logs is written with the
  disposable account's own access token, never the service role.
- **CI** gains one browser step on port 3023. No secret, hosted project,
  deployment step or paid resource is added.

## Tests added or changed

| Test | What it establishes |
| --- | --- |
| `supabase/tests/database/m3_19_delete_a_planned_session.test.sql` (new, 39 assertions) | The whole database contract: the delete itself, the surviving dated entry, the completion refusal, the lock, the cancelled target, the past boundary, the rejected unknown operation, and the cross-owner and anonymous cases against the privileged function. |
| `src/server/rolling-plan/rolling-plan-contract.ts` (5 new cases) | The same behavior at the seam, run against **both** adapters: delete beside cancel, a locked and a cancelled target, the completion refusal, the refusals a delete of no session or an unknown operation must produce, and — added in correction round 1 — that a deleted occurrence is written straight back by the next top-up, active even when it was cancelled first. |
| `src/app/home/plan/actions.test.ts` | The action composes `{operation: "delete", sessionId}`, takes a cancelled session as a target for a delete and for nothing else, reports `PT425` in the surface's own words, and reports a refilled occurrence from one bounded read of its rule date rather than claiming it was deleted. All three refill outcomes are covered, including the read that throws. |
| `src/app/home/plan/plan-manager.test.tsx` | The card exposes Edit, Cancel, Delete and the lock and no "Remove"; each verb's copy says what it keeps; and delete's copy follows the three-way scope — a one-off is described as permanent and says nothing about a series; an occurrence whose rule date is still ahead is not described as permanent, is told what the refill replaces, and is pointed at the control's real label; and — added in correction round 3 — a moved occurrence whose rule date has fallen behind today is described as permanent again, with the clause that its series will not write this date back, and names no control, because the same predicate that settles the scope has withheld the one the refill warning quotes. A cancelled occurrence is told that deleting undoes the cancellation, and a cancelled card carries Delete. |
| `e2e/m3-19-delete-session.spec.ts` (new, pinned config, port 3023) | The 390px flow: cancel, delete, the lock, the completion refusal, and deleting the cancelled session. |

## Results

A green run covers every implementation this ticket has had except the last,
whose run is recorded at acceptance for the reason given below the table. None
landed on the implementation commit itself, because a record cannot carry the
SHA of the commit that adds it, so each run lands on the documentation head
that follows.
Each row's reconciliation is one command, and the delta is documentation only
in every case.

| Implementation | Run | Head it ran on | Reconciliation |
| --- | --- | --- | --- |
| `1e12dce` | [33275082378](https://github.com/mattiss01/fittip/actions/runs/33275082378) `success` | `2d674e3` | `git diff --name-only 1e12dce..2d674e3` — this record and its index |
| `437d470` | [33276894567](https://github.com/mattiss01/fittip/actions/runs/33276894567) `success` | `433a75e` | `git diff --name-only 437d470..433a75e` — this record and its index |
| `d422f81` | [33277713636](https://github.com/mattiss01/fittip/actions/runs/33277713636) `success` | `dbaaa1c` | `git diff --name-only d422f81..dbaaa1c` — this record only |
| `f2f7108` | [33309063845](https://github.com/mattiss01/fittip/actions/runs/33309063845) `success` | `28d0bbe` | `git diff --name-only f2f7108..28d0bbe` — this record and its index |

The first row's working is set out at length in the lead agent's section at
the end of this record; the others are the same shape and are stated here
rather than pointed at.

The fourth row's run went red once before it went green, on an
`e2e/m3-14b-recurring-series.spec.ts` failure that belongs to neither this
ticket nor that spec's product behavior. It is diagnosed in full under
[the lead agent's section](#a-red-run-that-was-not-this-tickets-and-not-a-defect-in-what-it-tested)
and filed as
[M3-22](../../backlog/M3/M3-22-OFFLINE-CONSOLE-ASSERTION-FLAKE.md) on `master`
in `ae32d7e`, because a gate that fails at random is worse than no gate. The
`success` above is the rerun of the identical SHA.

**No run yet covers the round 4 implementation `41fcbc0`.** The final run — the
one covering whatever documentation head carries this paragraph — is the lead's
to record at acceptance under the evidence-commit exception, because no commit
can cite a run of itself.

What the builder observed locally while developing, against the local Supabase
stack with every migration applied from zero:

| Command or check | Result |
| --- | --- |
| `npx.cmd supabase db reset --local` | Applied every migration including `20260829135426` |
| `npx.cmd supabase test db --local supabase/tests/database` | `All tests successful. Files=13, Tests=848`; the M3-19 file passes 39/39 |
| `npx.cmd supabase db lint --local --level warning --fail-on warning` | No schema errors |
| `npx.cmd supabase db advisors --local --type all --level warn --fail-on warn` | No issues found |
| `npm.cmd run test:m3-10-adapter-contract` | 19 passed; the shared contract against the real Postgres adapter |
| `npm.cmd run test:run -- src/server/rolling-plan/rolling-plan.test.ts` | 22 passed; the same contract against the in-memory adapter |
| `npm.cmd run test:run -- src/app/home/plan` | 55 passed |
| `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd run build` | Clean |
| `.github/scripts/with-server.sh 3023` with `e2e/m3-19.playwright.config.ts` | 1 passed at `390x844`; both evidence screenshots captured |
| `git diff --check` | Clean on every commit |

Correction round 1 (`437d470`) was checked the same way, against the local
stack reset from zero: the shared contract passes 23 cases in-memory and 20
against the real Postgres adapter — one more each, the new refill case, and it
behaves identically in both; `src/app/home/plan`, `src/architecture` and
`src/server` pass 629 tests across 44 files; lint, typecheck and build are
clean; and the M3-19 browser flow passes on a freshly started server. The one
byte-level change it made to `M3-19-card-verbs-390x844.png` was a 139x1 pixel
caret artifact and was reverted rather than committed.

Correction round 2 (`d422f81`) closes four review findings and changes no
behavior. Locally: `src/app/home/plan` passes 57 tests across 7 files, lint,
typecheck and build are clean, `git diff --check` is clean, and the M3-19
browser flow passes on a freshly started server against the local stack reset
from zero. Both evidence screenshots are regenerated in that commit because
the run crossed owner-local midnight, so every date label in the window moved
on a day; the card layout and copy in them are unchanged, which a pixel diff
confirms.

One earlier iteration of the pgTAP suite failed one assertion honestly and was
corrected rather than deleted: it claimed a cancel entry would still be
recorded for a session that was later deleted. It is not — the entry names
that session, so the cascade takes it, and only the dated `delete` entry
survives.
The suite now asserts that truth explicitly and proves the cancel record on a
session that is not deleted.

Evidence CI does not produce:

- `docs/validation/M3/evidence/M3-19-card-verbs-390x844.png` — the card with
  Edit, Cancel, Delete and the lock at `390x844`, with the Cancel copy open.
- `docs/validation/M3/evidence/M3-19-logged-refusal-390x844.png` — the refusal
  a session with logged training produces.
- The builder's disposable local owners were deleted by the flows themselves,
  and every isolated local port was released.

## Known limitations

1. **Deleting a recurring occurrence the series still fills does not keep it
   deleted. Accepted product decision, 29 August 2026.** Materialization
   coverage is "a row exists for this series and rule date"
   (`20260819112410_m3_14_recurring_session_series.sql:1699-1703`). Cancel
   keeps the row, so cancel is stable. Delete removes it, so the date becomes
   uncovered and `topUpAfterPlanChange` — which runs after every successful
   change set — writes the occurrence back inside the same request, with the
   same deterministic id. Two consequences follow, and the product owner
   accepted both rather than withhold the control: deleting an active
   occurrence looks like a no-op, and **deleting a cancelled occurrence brings
   it back active, reversing a cancellation the owner already made**.

   **The refill is bounded by the materialization window.** It fills only
   `today .. today + 13`, and only between its segment's own dates. A moved
   occurrence keeps its original rule date, so once that date falls behind
   owner-local today the series stops filling it: the delete is permanent
   again, and the series-removal control is withheld from that card for the
   same reason. Round 3 made the warning say which of the two an owner is
   looking at, deciding it with the one predicate the control itself uses. That
   predicate slightly over-estimates the refill — a rule date inside the window
   whose day already holds ten sessions will not be refilled either — which
   errs toward warning that a delete may not stick, the safe direction for a
   destructive control.

   A **diverged** occurrence loses more than its place: it comes back as the
   rule describes it, so an edited title, note, duration or activity list is
   replaced, the lock is cleared, and an occurrence the owner had moved
   reappears on the series date rather than the date its card was sitting on.
   Correction round 2 added that to the warning, which had named only the lock.

   Nothing in the materializer, the migration or any change-entry shape was
   altered to accommodate this; the decision was to ship the behavior and
   describe it. What changed in correction round 1 is the description. The
   Delete disclosure now tells an occurrence owner that its series writes the
   date back, and tells a cancelled occurrence owner separately that deleting
   undoes their cancellation; the toast reports the refill from a bounded read
   of the rule date rather than claiming "Session deleted." over a session
   still on screen. `rolling-plan-contract.ts` pins both halves against both
   adapters so a later reader cannot mistake the behavior for a defect and
   "correct" the materializer.

   **M3-15B and M3-15C inherit this**, as does any F-005 copy pass: every
   surface that offers delete over a recurring occurrence has to carry the same
   warning, and Today in particular will show occurrences without the series
   context the Plan card gives them. The honest way out, if the product owner
   later wants one, is a change to what coverage means — a tombstone recording
   that a rule date was deleted, say — which is a schema decision and a ticket
   of its own, not a copy fix.

2. **The occurrence warning is proven by component test, not by the browser
   flow.** `e2e/m3-19-delete-session.spec.ts` exercises one-off sessions only,
   so the 390px proof of the occurrence and cancelled-occurrence copy is
   `plan-manager.test.tsx`. The product owner can see it on the Preview by
   creating a recurring session and opening Delete on one occurrence.

3. **The completion refusal has no hosted path in this ticket.** Nothing in the
   application writes a completion yet; the logging surface is M3-15B. The
   `PT425` path is proven in pgTAP, in the shared contract against both
   adapters, and in the local browser flow, which writes the completion through
   M3-15A's own owner-derived RPC. The product owner cannot reproduce that one
   refusal on the Preview by hand until M3-15B ships.
4. **The past-dated refusal is proven only in pgTAP.** A session dated before
   owner-local today cannot be created through any surface, so neither the
   contract nor the browser flow can construct one. The pgTAP suite inserts one
   directly with `reset role`, exactly as M3-12's suite does for cancel.
5. **The `Cancel` disclosure of a recurring occurrence still contains the
   series-wide removal**, whose button reads "Remove this and all future
   sessions". That is a series operation and an explicit non-goal here, so its
   label was left alone; only the occurrence-scoped button inside the same
   panel was corrected. A reader may find "Cancel" an imprecise summary for a
   panel that also offers a series deletion. Correcting it means touching a
   series operation's copy, which this ticket may not do.
6. **There is no undo, trash or restore**, by decision. A deleted session is
   recoverable only from the `delete` change entry's before state, which no
   surface reads.
7. **The founder migration is applied.** The product owner ran the runbook on
   29 August 2026 and `20260829135426` is on the founder project. This entry is
   kept rather than deleted because it was a gate: it is now met. The lead
   agent records the evidence — the pre-push history alignment and the push
   output — in its own section; this record does not restate it.

## Independent reviewer focus

Review exact implementation `368f78caf6b21eb0aa1b4483a976f463591c91e3`
against base `37529e20ea373034d7ede6b64e0b6dfde8d5e940`, reconcile the manifest
above, and confirm the fresh CI run for that SHA is green and its Vercel
Preview reached `READY`. Do not re-run
lint, typecheck, the Vitest suite, the build, the database matrix or the
browser flows; CI covers all of them.

The judgment CI cannot supply:

- **The migration is the whole review.** Diff
  `supabase/migrations/20260829135426_m3_19_delete_a_planned_session.sql`
  against lines 783-1345 of
  `supabase/migrations/20260829073444_m3_15a_completion_foundation.sql`.
  Exactly four hunks should appear, and the migration's header names them. Any
  fifth difference is unintended.
- **The fallthrough.** `cancel` is now an explicit `elsif` rather than the
  inner chain's fallthrough, so no operation reaches the cancel branch by
  default. The `else` that replaced it is **unreachable defence in depth, not
  the closing of a live hole**: the inner chain is entered only through
  `elsif v_operation in ('edit','move','set_lock','cancel')`, and the outer
  chain's own `else` already rejected an unknown operation before this ticket.
  An earlier draft of this record implied otherwise; the reviewer was right.
  What the change is worth is that a future fifth session operation cannot land
  in `cancel` by being written last, next to a branch that destroys a row.
- **Order of refusals in the delete branch**: shape, then ownership and status,
  then the past boundary, then the completion. Confirm `PT425` is raised before
  the delete statement, so no raw foreign-key violation can reach a surface,
  and that it is not swallowed by the function's trailing exception handler,
  which catches only `unique_violation`, `foreign_key_violation`,
  `check_violation` and `invalid_datetime_format`.
- **The audit entry.** A `delete` entry must carry `session_id` null,
  `series_id` null, a non-null `local_date`, the before state, and the same
  after-state shape `rolling_plan_sweep_series_occurrences` writes. Confirm no
  new change kind and no constraint change was smuggled in.
- **Correction round 5 (no source change).** Six findings, none behavioral and
  all against this record. The lead closed four in `368f78c`: the founder
  migration alignment check had anchored its grep on the capture's Local
  column and so compared the repository with itself, the new Results row's
  reconciliation names two files rather than one, the evidence-directory
  sentence is reworded to the property that matters, and M3-22 is linked. The
  builder closed two: this header, manifest and checklist, which still named
  round 3 as the last round and `f2f7108` as the target; and the
  delivered-behavior paragraph, which keyed the refill on today alone when
  `occurrenceHasFutureRuleDate` also requires the date to sit inside the series
  segment. Judge that paragraph against all three of the predicate's
  conditions, not the one it used to name.
- **Correction round 4 (`41fcbc0`).** The only source change is where a comment
  sits: round 3 inserted `occurrenceOf` and `deleteScope` between the
  `DeleteSession` docblock and the component, and this moves it back.
  `git show 41fcbc0` is one file and two hunks, and no line in it is outside a
  comment block. The record corrections are the `plan-manager.test.tsx` row in
  the tests table, which now describes all three delete scopes and the test
  round 3 added for the settled one, and the delivered-behavior paragraph,
  which round 5 corrected again.
- **Correction round 3 (`f2f7108`).** The only behavioral change is which
  warning an occurrence card shows. Judge whether `occurrenceHasFutureRuleDate`
  is the right predicate for both of its callers, whether the settled-occurrence
  wording is true in every state that selects it, and whether the restored
  toast can name the series-removal control in a state where that control is
  absent. The record corrections are the three CI rows, the account of
  `deletedOccurrence`, and limitation 7.
- **Correction round 2 (`d422f81`).** Four round 2 findings, none behavioral.
  Judge whether the occurrence warning is now complete — the refill, the loss
  of an edited title, note, duration or activity list, the cleared lock, a
  moved occurrence returning to the series date, and an escape route that
  quotes the control's real label — and whether the `unknown` refill branch's
  new test actually exercises the throw rather than the resolved path. The two
  record corrections are the Results opener and the `git diff --stat` range.
- **Correction round 1 (`437d470`).** The accepted occurrence refill is a
  product decision, not a defect to re-litigate. Judge only whether the
  surface now describes it truthfully in all three states — one-off, active
  occurrence, cancelled occurrence — and whether `occurrenceRefill` in
  `actions.ts` can report "restored" when it is not, or claim the plan change
  failed when it did not. Its extra read is reached only when a delete was
  followed by a top-up that created something.
- **Ownership.** Every statement in the new branch is owner-predicated, and the
  cross-owner and anonymous cases are asserted against the privileged function
  rather than against RLS on the table.
- **The seam.** Both adapters answer the shared contract identically, and the
  in-memory `recordCompletion` seam models only the fact the plan side
  consults; it does not model completions.
- **The surface.** Cancel's copy says the session is kept on the record and
  Delete's says it is not; both stay behind a disclosure; `requireSession`
  admits a cancelled session for a delete and for nothing else.
- **Scope.** M3-11's legacy-reset invariants are untouched;
  `materialize_rolling_plan_series`, `end_series`,
  `rolling_plan_sweep_series_occurrences` and every completion table and
  function are untouched.

The product owner, not the reviewer, performs the authenticated `390x844`
Preview interaction and visual acceptance.

## Lead agent: continuous integration, Preview, and the hosted gate

Recorded by the lead agent on 29 August 2026, after the builder handoff.

### The green run, and which commit it covers

**Run:** <https://github.com/mattiss01/fittip/actions/runs/33275082378> —
`success`, all three jobs: `Lint, types, unit tests, build`,
`Migrations, RLS, advisors, concurrency`, and `390px production browser flows`.
The M3-19 browser flow appears by name in the third job's log.

That run's head SHA is `2d674e3`, the branch head, not `1e12dce`, the reviewed
implementation. The seven commits were pushed together, so GitHub Actions ran
once, on the head. The two commits are not equivalent by assertion — they are
equivalent by check:

```
$ git diff --name-only 1e12dce..2d674e3
docs/validation/M3/M3-19-VALIDATION.md
docs/validation/README.md
```

The delta is two documentation files and nothing else: no source, no migration,
no test, no workflow. So the run executed exactly the implementation under
review. This is the evidence-commit exception used in the direction it was
written for — a record commit that needs no run of its own — with the run
landing on the record commit rather than before it. The reconciliation above is
the checkable justification `AGENTS.md` requires, and it is one command.

### Preview

| Head | Environment | State | URL |
| --- | --- | --- | --- |
| `2d674e3` | `Preview` | `success` | <https://fittip-aek3em2l0-mattis-3657s-projects.vercel.app> |
| `28d0bbe` | `Preview` | `success` | <https://fittip-e8u8hsbvl-mattis-3657s-projects.vercel.app> |

### A red run that was not this ticket's, and not a defect in what it tested

Run 33309063845 failed on its first attempt and passed on a rerun of the
identical SHA. That alone establishes non-determinism, but a rerun-until-green
habit is exactly what `AGENTS.md` keeps the known-defect exception narrow to
prevent, so the cause is set out here rather than waved at.

The failing assertion is `e2e/m3-14b-recurring-series.spec.ts:275`,
`expect(consoleErrors).toEqual([])`, which collects browser console errors for
the whole test. It caught three:

```
Failed to load resource: net::ERR_INTERNET_DISCONNECTED
```

The trace names the three requests, and none of them is a plan surface:
`/home/today`, `/home/progress` and `/home/you`, each carrying
`next-router-segment-prefetch: /_tree` with `Referer: /home/plan`. They are App
Router prefetches of the persistent bottom-navigation links, issued by the
shared home layout, which no ticket in this milestone has touched.

The timing, from the same trace, is what makes it a race:

| Time (ms) | Event |
| --- | --- |
| 10366.1 | `setOffline(true)` — the spec's deliberate offline check |
| 10428.2 | `setOffline(false)` |
| 10430.9 – 10431.4 | the three console errors |

The window the spec spends offline is **62 ms** wide. Whether a prefetch happens
to be in flight across it is chance; the likely trigger is the form submit just
before, whose Server Action calls `revalidatePath`, invalidating the client
router cache and re-queueing a prefetch for every visible link.

So the spec asserts that no console error occurred, having itself caused the
condition that produces one. That is a latent defect in the spec, not in the
product and not in this ticket: M3-19 round 3 changed plan-surface copy and one
exported predicate, neither of which can make a navigation prefetch fail. It
could only shift the preceding steps by a few milliseconds, which is all this
assertion needs to flip. `e2e/m3-11-maintenance.spec.ts:45,117` uses the same
collector and the same final assertion and carries the same latent defect.

This is **not** the known-defect exception. That exception is for a red run
being accepted as evidence; this run is green, on a rerun of the same commit,
with the first attempt's cause identified rather than assumed. It is recorded
because the next reader of run 33309063845 will see two attempts and deserves
to know why.

### The hosted migration, applied

Recorded by the lead agent on 30 August 2026. The product owner applied
`20260829135426_m3_19_delete_a_planned_session.sql` to the founder project
`mahhfyxhgcmcbqkvudcm` on 29 August 2026, following
[the runbook](evidence/M3-19-founder-migration-runbook.md). This section
separates what is **captured** — CLI output the lead read directly — from what
is **attested** by the product owner, because the two carry different weight
and a reader should not have to guess which is which.

Both captures are in the file, converted from the PowerShell console's UTF-16
to UTF-8 and otherwise unedited:
[`migration list`](evidence/M3-19-founder-migration-list-before.txt) and
[`db push`](evidence/M3-19-founder-migration-push.txt). Each opens with a
PowerShell `NativeCommandError` block, which is not a failure: `npx.cmd` writes
`Initialising login role...` to stderr and PowerShell renders any stderr from a
native command that way.

**Captured — history before the apply.** `supabase migration list --linked`
returned 19 remote entries aligned with the repository at every position, the
newest `20260829073444` (M3-15A), with `20260829135426` present locally and
blank on the remote side. No remote entry the repository lacks, so no history
drift. This is runbook step 1.2 and it is the check that matters most: it is
what rules out someone else having written to the project.

The lead checked that alignment against the repository rather than reading it
off the table, because "aligned at every position" is the one claim in this
section a mistake would hide rather than announce. The check extracts the
capture's **Remote** column — the middle field, hence the leading `|` in the
pattern — and compares it with the repository:

```
$ ls supabase/migrations/*.sql | sed 's#.*/##; s/_.*//' | sort > repo
$ grep -oE '\|\s*`[0-9]{14}`\s*\|' \
    evidence/M3-19-founder-migration-list-before.txt \
    | tr -d ' `|' | sort > remote
$ comm -13 repo remote          # remote entries the repository lacks: drift
$ comm -23 repo remote          # repository entries not yet applied
20260829135426
```

Twenty versions in the repository, nineteen on the founder project, **nothing
on the remote that the repository lacks**, and exactly one migration pending —
`20260829135426`, this ticket's. The first `comm` is the one that matters: an
empty result is what rules out someone else having written to the project.

An earlier version of this paragraph ran the same comparison against the
capture's *Local* column, which is derived from the same `supabase/migrations`
directory as the left-hand side. That check compared the repository with itself
and could not have detected drift. Corrected on 30 August 2026 after the
independent reviewer caught it; the conclusion is unchanged, but it now rests
on a check that could have failed.

**Captured — the apply.** `supabase db push --linked` offered exactly one
migration, `20260829135426_m3_19_delete_a_planned_session.sql`, and reported
`Applying migration ...` followed by `Finished supabase db push.` One migration
offered and one applied, which is what step 1.3 expects.

**Captured — a warning that is not a failure.** The push emitted
`failed to cache migrations catalog: error exporting pg-delta catalog` from a
missing `pgdelta-target-ca.crt` inside the CLI's edge-runtime container. This is
`pg-delta 1.0.0-alpha.27` failing to build its *diff catalog*, a convenience
cache, after the migration had already been applied — the ordering in the output
shows the apply completing first, and `Finished supabase db push.` is printed
regardless. It does not affect this migration. It may make the next ticket's
`supabase migration list` slower or noisier, and if a future run reports an
empty or stale catalog this warning is the reason; upgrading the CLI past
`v2.109.1` is the fix, not a repository change.

**Attested by the product owner:** *"i ran the migration and all the tests of
the runbook are working."* That covers runbook step 1.4 (history aligned at all
20 positions after the apply), step 1.5 (hosted advisors — no new category), the
four Part 2 SQL checks on `apply_rolling_plan_change_set` (`security definer`
with an empty `search_path`; `EXECUTE` to `authenticated` alone; the `delete`
branch, the explicit `cancel` branch and `PT425` all present in the deployed
body; M3-14's four audit constraints unmoved), and the Part 3 authenticated
hosted delete including the `delete` change entries carrying a null
`session_id`.

Under `AGENTS.md` the product owner may attest a hosted result directly and the
lead does not repeat it. The distinction is recorded here rather than smoothed
over so that a later reader can tell which line rests on captured output and
which on attestation, and can ask for the missing capture if a hosted question
ever turns on it. The two the lead would most want in the file are the
step 1.5 advisor output and the Part 2 privilege query, since those are the two
that speak to the security boundary rather than to behavior.

**Not closable on the Preview, by design.** The `PT425` completion refusal and
the past-dated refusal cannot be exercised by hand, because no surface can yet
create a completion or a past-dated session. Both are proven in pgTAP, in both
adapters, and in the local browser flow. M3-15B is the first ticket that can
close the first of them, and it should.

### Evidence corrected during the build

Four screenshots belonging to already-accepted tickets — `M3-12-confirm-zone`,
`M3-12-daily-limit`, `M3-12-plan-window`, and `M3-14B-390x844` — were modified
during the build and reverted by the lead before the branch was pushed. The
cause was benign and the builder identified it unprompted: it re-ran the M3-12
and M3-14B configs to confirm the relabelling had not broken them, and those
specs rewrite their own screenshots as a side effect of passing. Both suites
passed. The pushed branch only **adds** files under
`docs/validation/M3/evidence/` and modifies none, which `git diff --stat
origin/master..HEAD -- docs/validation/M3/evidence/` confirms: the two M3-19
screenshots and the runbook, plus the two founder-migration captures the lead
added later. No accepted ticket's evidence is touched, which is the property
that matters here.

This is a gap in the project's own guidance rather than a builder error:
`CLAUDE.md` forbids hand-editing accepted validation records but does not say
that per-ticket Playwright specs generate the evidence files in place, so
running an older ticket's config rewrites that ticket's accepted history. Worth
a line in `CLAUDE.md` under a later documentation ticket.
