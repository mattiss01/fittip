# M3-19 validation: delete a planned session

**Ticket:** [M3-19](../../backlog/M3/M3-19-DELETE-A-PLANNED-SESSION.md)
**Status:** testable — builder handoff complete. Independent review, the CI
run for the reviewed SHA, the Vercel Preview, the founder migration and
product-owner acceptance are all outstanding.
**Tier:** 1
**Branch:** `ticket/m3-19-delete-a-planned-session`
**Base:** `37529e20ea373034d7ede6b64e0b6dfde8d5e940`
**Implementation review target:**
`1e12dce8a5be752fac55525074c2e15da0e8710c`
**Review range:**
`git diff 37529e20ea373034d7ede6b64e0b6dfde8d5e940..1e12dce8a5be752fac55525074c2e15da0e8710c`

Implementation commits, in order:

| Commit | Purpose |
| --- | --- |
| `2a4b12d2a201dfa8dabce905c11b66c2e028b01a` | The forward migration and its pgTAP suite. |
| `07b223eeccb660394a08ea099e4608f00da81d65` | The domain seam: union, parser, rule reason, in-memory adapter, shared contract. |
| `1adfee12b4a03917eefa3902f8a97b5f506980b2` | The Plan surface: Cancel and Delete on the card, and the action layer behind them. |
| `a8710d355b436751133fe81b7c8ee3eb37029bbe` | The per-ticket 390px flow and its pinned config. |
| `18db449fbd0fdd9ffcb953cb21d5a43e81f16d27` | The CI step that runs that flow. |
| `1e12dce8a5be752fac55525074c2e15da0e8710c` | The four-control card layout at 390px, and the flow's evidence screenshots. |

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

Exact base-to-implementation stat:

```text
 .github/workflows/ci.yml                           |  10 +
 .../M3/evidence/M3-19-card-verbs-390x844.png       | Bin 0 -> 115204 bytes
 .../M3/evidence/M3-19-logged-refusal-390x844.png   | Bin 0 -> 105882 bytes
 e2e/m3-12-plan.spec.ts                             |   6 +-
 e2e/m3-14b-recurring-series.spec.ts                |   4 +-
 e2e/m3-19-delete-session.spec.ts                   | 316 ++++++++++
 e2e/m3-19.playwright.config.ts                     |  19 +
 src/app/home/plan/action-state.ts                  |  10 +-
 src/app/home/plan/actions.test.ts                  |  70 +++
 src/app/home/plan/actions.ts                       |  50 +-
 src/app/home/plan/plan-manager.test.tsx            |  90 ++-
 src/app/home/plan/plan-manager.tsx                 |  84 ++-
 src/app/home/plan/plan.module.css                  |  21 +-
 src/app/home/plan/recurring-session-controls.tsx   |   4 +-
 src/server/repositories/rolling-plan-repository.ts |   2 +
 .../rolling-plan/in-memory-rolling-plan-adapter.ts |  25 +
 src/server/rolling-plan/rolling-plan-contract.ts   | 131 +++-
 src/server/rolling-plan/rolling-plan.test.ts       |   2 +
 src/server/rolling-plan/rolling-plan.ts            |  17 +-
 ...260829135426_m3_19_delete_a_planned_session.sql | 656 +++++++++++++++++++++
 .../m3_19_delete_a_planned_session.test.sql        | 555 +++++++++++++++++
 .../m3_10_rolling_plan_postgres.test.ts            |  16 +
 22 files changed, 2040 insertions(+), 48 deletions(-)
```

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
| `src/server/rolling-plan/rolling-plan-contract.ts` (4 new cases) | The same behavior at the seam, run against **both** adapters: delete beside cancel, a locked and a cancelled target, the completion refusal, and the refusals a delete of no session or an unknown operation must produce. |
| `src/app/home/plan/actions.test.ts` | The action composes `{operation: "delete", sessionId}`, takes a cancelled session as a target for a delete and for nothing else, and reports `PT425` in the surface's own words. |
| `src/app/home/plan/plan-manager.test.tsx` | The card exposes Edit, Cancel, Delete and the lock and no "Remove"; each verb's copy says what it keeps; the occurrence variant says only this occurrence goes; a cancelled card carries Delete. |
| `e2e/m3-19-delete-session.spec.ts` (new, pinned config, port 3023) | The 390px flow: cancel, delete, the lock, the completion refusal, and deleting the cancelled session. |

## Results

The CI run for `1e12dce8a5be752fac55525074c2e15da0e8710c` is **not yet
recorded** — the lead pushes the branch. It is the automated-test evidence for
this ticket and must be green before review.

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

1. **The completion refusal has no hosted path in this ticket.** Nothing in the
   application writes a completion yet; the logging surface is M3-15B. The
   `PT425` path is proven in pgTAP, in the shared contract against both
   adapters, and in the local browser flow, which writes the completion through
   M3-15A's own owner-derived RPC. The product owner cannot reproduce that one
   refusal on the Preview by hand until M3-15B ships.
2. **The past-dated refusal is proven only in pgTAP.** A session dated before
   owner-local today cannot be created through any surface, so neither the
   contract nor the browser flow can construct one. The pgTAP suite inserts one
   directly with `reset role`, exactly as M3-12's suite does for cancel.
3. **The `Cancel` disclosure of a recurring occurrence still contains the
   series-wide removal**, whose button reads "Remove this and all future
   sessions". That is a series operation and an explicit non-goal here, so its
   label was left alone; only the occurrence-scoped button inside the same
   panel was corrected. A reader may find "Cancel" an imprecise summary for a
   panel that also offers a series deletion. Correcting it means touching a
   series operation's copy, which this ticket may not do.
4. **There is no undo, trash or restore**, by decision. A deleted session is
   recoverable only from the `delete` change entry's before state, which no
   surface reads.
5. **The founder migration is not applied.** `20260829135426` must be applied
   to the founder Supabase project in timestamp order, with remote history, the
   replaced function and an authenticated hosted read verified, before
   acceptance is requested.

## Independent reviewer focus

Review exact implementation `1e12dce8a5be752fac55525074c2e15da0e8710c`
against base `37529e20ea373034d7ede6b64e0b6dfde8d5e940`, reconcile the 22-file
manifest above, and confirm the CI run for that SHA is green and its Vercel
Preview reached `READY`. Do not re-run lint, typecheck, the Vitest suite, the
build, the database matrix or the browser flows; CI covers all of them.

The judgment CI cannot supply:

- **The migration is the whole review.** Diff
  `supabase/migrations/20260829135426_m3_19_delete_a_planned_session.sql`
  against lines 783-1345 of
  `supabase/migrations/20260829073444_m3_15a_completion_foundation.sql`.
  Exactly four hunks should appear, and the migration's header names them. Any
  fifth difference is unintended.
- **The fallthrough.** `cancel` is now an explicit `elsif` and the inner
  chain's `else` refuses. Confirm no operation string can reach the delete
  branch or the cancel branch by falling through, and that the outer chain's
  own `else` is untouched.
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
