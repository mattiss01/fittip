# M2-05 validation: intermittent goal mutations that do not apply

**Ticket:** [M2-05](../../backlog/M2/M2-05-INTERMITTENT-GOAL-MUTATIONS.md)

**Lifecycle state:** testable — awaiting independent exact-commit review

**Branch:** `ticket/m2-05-goal-mutation-lock`

**Base:** `c33fbc66faa15133dfa0b79aa097f693429dba7d` — `origin/master` at dispatch

**Implementation commit:** `1be0525bfc4e937eca7c506d12830f2e8b1d012c`

**Review target:** the head of `ticket/m2-05-goal-mutation-lock` — the evidence
commit recorded under "Commit and continuous integration", which adds nothing
but this file's run URLs

**Related decision:** [ADR-009](../../decisions/ADR-009-M2-GOAL-MUTATION-TRANSACTION.md)
— unchanged by this ticket.

## Summary

The failure was reproduced, diagnosed, and corrected. The leading hypothesis in
the ticket — an unbounded `pg_advisory_xact_lock` — was **refuted by
measurement**. No migration was written and the ADR-009 transaction boundary is
untouched.

The mutation always reaches the database and commits. What is lost is the
render: the App Router transition that carries both the typed action result and
the revalidated server tree intermittently never commits, so the surface stays
on "Saving goal change…" for ever, showing stale content, with no error.

## Reproduction and evidence

### Reproduced locally

Against the unmodified base build, `e2e/m2-01-goals.spec.ts` was run repeatedly
on a local production build (port 3015, local Supabase stack):

| Batch                    | Result                          |
| ------------------------ | ------------------------------- |
| `--repeat-each=6`        | 2 failed, 4 passed              |
| `--repeat-each=8`        | 2 failed, 6 passed              |
| `--repeat-each=8`        | 2 failed, 6 passed              |
| **Measured rate**        | **6 failures in 22 runs (27%)** |

The six local failures landed on four different assertions: the tier-change
edit (spec line 84, twice), the tier change back to core (line 94), the resume
(line 164) and the abandon status message (line 213). Continuous integration
had separately recorded the reorder (line 120), the delete (line 237) and the
create (line 271). Seven distinct assertions, one defect — not seven.

### The advisory-lock hypothesis is refuted

Two independent measurements rule it out.

1. The retained trace of the continuous-integration failure on
   `ad2c9009ce682d6398e8616503919df574dc5a53`
   (run [30597619157](https://github.com/mattiss01/fittip/actions/runs/30597619157))
   shows every Server Action POST returning `200` in **18–35 ms**, including
   the one whose result never appeared. Nothing waited.
2. Locally, across hundreds of mutations, no `apply_goal_change` call exceeded
   **120 ms**. The failing mutation is indistinguishable in timing from the
   passing ones.

No mutation ever blocked. The unbounded wait at
`supabase/migrations/20260729161854_m2_01_goal_model.sql:266` is a real latent
risk and is recorded as such below, but it is **not** the cause of M2-05 and was
deliberately not corrected here — the ticket requires confirmation before
correction.

### The write is applied; the render is lost

A throwaway instrumented Playwright probe (not committed) drove goal creates in
a loop and, on a stall, reloaded the page and re-read the collection revision:

```
>>> submit create Probe 10 (ui rev Collection 9)
     dispatch type=server-action queueBusy=false
     render pending=true
     action-promise-resolve revalidationKind=1 hasFlight=true hasSearch=true
     branch=navigateToKnownRoute
     resolve type=server-action
     ACTION-RESPONSE 200
     Collection 9 | status="Saving goal change…" | formRevision=9   <- frozen
AFTER RELOAD rev=Collection 10
```

The instrumentation was three temporary `console.log` calls added to the
installed `next` runtime plus one `useEffect` in `GoalManager`; all were
reverted and `npm ci` restored the exact dependency tree before any measurement
that this record cites.

That timeline establishes all of the following:

- The mutation committed. The collection revision advanced from 9 to 10.
- The server responded, and Next's own reducer resolved both the Server Action
  promise and the router state.
- **React then never rendered again.** No further render of `GoalManager`
  occurred, so `useActionState` stayed `pending` and the tree stayed stale.

### It is a lost render, not a slow one

Running the flow with a 60 s `expect` budget still failed 2 of 8 times. The
update never arrives. This also settles the ticket's open question 6: raising
the 5 s budget would not have helped, and the budget is unchanged.

### What was ruled out

| Candidate                                          | Result                                                            |
| -------------------------------------------------- | ----------------------------------------------------------------- |
| Unbounded `pg_advisory_xact_lock` (the hypothesis)  | Refuted — no mutation exceeded 120 ms                             |
| Lost write / rolled-back transaction                | Refuted — the revision advances and the record is present         |
| Server error swallowed by the repository            | Refuted — every action POST returned `200`                        |
| Slow runner or marginal timing                      | Refuted — a 60 s budget still fails                               |
| `next@16.2.12` + `react@19.2.8` patch upgrade       | Tried and reverted — 4 failures in 16 runs, no improvement        |
| Removing `revalidatePath` and refreshing client-side| Tried and reverted — **worse**: 7 failures in 16 runs             |
| Disabling navigation `<Link>` prefetching           | Tried and reverted — 1 failure in 24; narrows the race, no fix    |

## The correction

The defect lives in the framework, in the App Router transition that delivers a
Server Action result. FitTip cannot fix that transition, so the goals surface
stops trusting it silently and now observes its own mutations from outside
React.

1. `src/features/goals/mutation-watchdog.ts` holds the timing rules, free of
   React so they are tested directly.
2. `GoalManager` records, through a `PerformanceObserver`, when a response to
   the Server Action's POST arrives. While a mutation is pending it compares
   that against the clock every 250 ms:
   - **Response arrived, surface still pending after 750 ms** — the change is
     committed and only the render was lost. The surface says so and reloads
     the committed collection. After the reload it explains why, so the reload
     is not an unexplained flash.
   - **No response within 10 s** — the outcome is genuinely unknown, so the
     surface says exactly that and offers the existing reload action. It never
     claims the change was saved.
3. `changeGoalAction` no longer revalidates `/home/you`. Only `/home/you/goals`
   renders goal data; the second call invalidated the whole client router cache
   again on every mutation, re-prefetching all four navigation routes and
   widening the window in which the result was lost.

Ticket scope item 4 is met in both directions: a mutation that cannot be
confirmed now renders a visible message with a real recovery action, and one
that was applied but not rendered no longer leaves a frozen page.

## Result after the correction

`e2e/m2-01-goals.spec.ts` on a local production build:

| Batch              | Result           |
| ------------------ | ---------------- |
| `--repeat-each=20` | 20 passed        |
| `--repeat-each=20` | 20 passed        |
| **Total**          | **40 consecutive passes** |

The second batch counted document loads per run to show that the underlying
race still occurs and is being recovered rather than merely absent: 18 runs
loaded 2 documents (the baseline), one loaded 3 and one loaded 4 — **three
recovery reloads across 20 flows, all of which still passed**.

At the measured 27% baseline failure rate, 40 consecutive passes has a
probability of roughly 0.000004.

## Delivered behavior

- A goal create, edit, reorder, tier change, lifecycle change, archive, or
  delete that is applied but not rendered no longer leaves the page frozen.
  The surface reports it and reloads the saved collection, then explains the
  reload until the next change.
- A goal mutation the surface cannot confirm within 10 s reports that honestly
  and offers "Reload current goals" instead of showing "Saving goal change…"
  indefinitely.
- No change to the goal model, rank rules, lifecycle states, the three-core
  constraint, authorization, or the transaction.

## Mobile demo path

Local production build with the local Supabase stack:

```powershell
npx.cmd supabase start
npx.cmd supabase db reset --local
npm.cmd run build
npm.cmd run start -- -p 3015
npx.cmd playwright test --config=e2e/m2-01.playwright.config.ts
```

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY` must be exported from `npx.cmd supabase status`
first; the specs skip silently without the service-role key.

By hand at `390x844` on `/home/you/goals`:

1. Create a supporting goal and confirm it appears with its rank.
2. Reorder two core goals and confirm both ranks change.
3. To see the unconfirmed state without waiting for the race, throttle the
   network to "Offline" in the browser devtools, submit a goal change, and wait
   ten seconds. The notice must read "This goal change has not been confirmed.
   Reload to see whether it was saved." with a working reload link.

The unconfirmed state at `390x844` is captured in
[evidence/M2-05-unconfirmed-390x844.png](evidence/M2-05-unconfirmed-390x844.png).

## Changed files

`git diff --stat c33fbc66faa15133dfa0b79aa097f693429dba7d..1be0525bfc4e937eca7c506d12830f2e8b1d012c`:

```
 docs/validation/M2/M2-05-VALIDATION.md             | 407 +++++++++++++++++++++
 .../M2/evidence/M2-05-unconfirmed-390x844.png      | Bin 0 -> 85995 bytes
 docs/validation/README.md                          |   1 +
 e2e/m2-01-goals.spec.ts                            | 116 +++++-
 src/app/home/you/goals/actions.test.ts             |  32 +-
 src/app/home/you/goals/actions.ts                  |   5 +-
 src/app/home/you/goals/goals.module.css            |   5 +-
 src/components/goals/goal-manager.test.tsx         |  56 ++-
 src/components/goals/goal-manager.tsx              | 158 +++++++-
 src/features/goals/mutation-watchdog.test.ts       | 101 +++++
 src/features/goals/mutation-watchdog.ts            |  74 ++++
 11 files changed, 939 insertions(+), 16 deletions(-)
```

The follow-up commit that records the run URLs below touches only this file.
Nothing was deleted or renamed, and the ticket's own lifecycle line was left
to the lead.

Files whose purpose is not evident from the path and diff:

- `src/features/goals/mutation-watchdog.ts` — the timing rules that decide
  whether an in-flight goal mutation is still waiting, was applied without
  rendering, or cannot be confirmed. Kept out of the component so the decision
  is testable without a browser.
- `e2e/m2-01-goals.spec.ts` — besides the new `M2-05 unconfirmed goal mutation`
  test, three lifecycle assertions changed from the transient status message to
  the committed record, because the recovery reload discards the message. The
  message copy moved to `actions.test.ts`, which now asserts it for all seven
  lifecycle operations. The reorder step also gained the assertions the ticket's
  open question 7 asked for: the previous check that Swim endurance still held
  rank 1 was already true before the move and could not detect a failed reorder.

## Data, migration, API, privacy, and security effects

- **No migration.** No schema, policy, grant, index, constraint, or RPC change.
  `supabase/migrations/` is untouched and `src/lib/supabase/database.types.ts`
  did not need regenerating.
- **No change to ADR-009.** The per-owner advisory lock, the collection
  revision check, `PT409` mapping, `SECURITY DEFINER` hardening, and the
  revoked direct table writes are all as accepted.
- **No API or authorization change.** `changeGoalAction` keeps the same
  signature, the same typed states, and the same repository calls. Ownership is
  still derived from `auth.uid()` inside the function.
- **Browser storage:** one new `sessionStorage` key,
  `fittip.goals.recovered:v1`, holding the constant `"1"`. It carries only the
  fact that a reload was self-triggered, contains no personal or training data,
  is removed on the next render, and dies with the tab. Both reads and writes
  are wrapped, so private browsing or disabled storage costs the explanation
  and never the recovery.
- **Caching:** `revalidatePath("/home/you")` removed. `/home/you` renders no
  goal data and both routes are `dynamic = "force-dynamic"`, so a visit still
  reads fresh state.
- **No credential, service, provider, or spend change.** The service-role key
  remains a test-harness-only value supplied at Playwright runtime.

## Tests and final results

The continuous-integration run for the reviewed commit is the automated
evidence. See "Commit and continuous integration" below for the run URL and
conclusion; it covers Prettier, ESLint, TypeScript, Vitest, the production
build, every migration from zero, database lint, the advisors, pgTAP, the
concurrency harnesses, and the 390px browser flows.

What CI does not cover, run locally and reported honestly:

| Command or check                                                        | Result                                             |
| ----------------------------------------------------------------------- | -------------------------------------------------- |
| `git diff --check`                                                       | Clean                                              |
| Baseline reproduction, `m2-01` flow ×22 on the unmodified base           | 6 failed, 16 passed                                |
| Same flow ×8 with a 60 s `expect` budget (throwaway config, not committed)| 2 failed, 6 passed — the update is lost, not slow  |
| `next@16.2.12` + `react@19.2.8` trial (reverted, `npm ci` restored)      | 4 failed, 12 passed — not a fix                    |
| `m2-01` flow ×40 after the correction                                    | 40 passed, 3 self-recoveries observed              |
| Both tests in `e2e/m2-01-goals.spec.ts` ×8 on the final build            | 16 passed (3.6 min)                                |
| `npm.cmd run test:run`, files this ticket touches                        | 4 files, 32 tests passed                           |
| 390×844 unconfirmed-state screenshot                                     | Captured; no horizontal overflow asserted in-spec  |

One honest caveat on the local Vitest suite. A whole-suite run on this machine
finished 245 of 247 with two failures in
`src/components/planning/activity-library.test.tsx` and
`src/components/planning/plan-editor.test.tsx`, both `waitFor` timeouts. The
same two fail on the **unmodified base** (`git stash` → 227 of 229), and both
pass when `src/components/planning` is run on its own. They are load-induced
flakes on this machine, unrelated to this ticket and not introduced by it. A
whole-suite run earlier in the session passed 247 of 247 on this branch. Trust
the continuous-integration run over any of these local numbers.

Regression coverage added:

- `src/features/goals/mutation-watchdog.test.ts` — nine cases over the timing
  rules, including that a response belonging to an earlier mutation is ignored
  and that router prefetches of the same route are not mistaken for the action.
- `src/components/goals/goal-manager.test.tsx` — the surface stays quiet while
  a mutation is genuinely in flight, and reports the unconfirmed state with its
  reload action once the budget is spent.
- `e2e/m2-01-goals.spec.ts` — a new `M2-05 unconfirmed goal mutation` test holds
  the Server Action response open so the frozen shape is reproduced
  deterministically, then asserts the honest message and recovery action at
  `390x844`. It runs under the existing `e2e/m2-01.playwright.config.ts`, so no
  workflow change was needed.
- The three lifecycle assertions now prove the committed record rather than a
  transient message, and the reorder step proves both moved ranks.

## Known limitations

- **The underlying framework defect is not fixed.** The App Router transition
  in `next@16.2.11` / `react@19.2.7` still intermittently fails to commit; this
  ticket makes the goals surface detect and recover from it. Three recoveries
  in twenty flows shows the race is still live. A user affected by it sees a
  brief self-reload and an explanation, not a frozen page.
- **The recovery costs the result message.** A reload discards
  "Goal archived." and its siblings. The saved state is correct and explained,
  but the specific confirmation wording is lost in that path.
- **Only the goals surface is protected.** `/home/plan` and `/home/log` use the
  same App Router mechanism and were not measured under this ticket. Neither
  has failed in continuous integration, but neither is immune. This is worth a
  separate ticket rather than a silent widening of scope here.
- **The unbounded advisory wait remains.** `pg_advisory_xact_lock` at
  `supabase/migrations/20260729161854_m2_01_goal_model.sql:266` still has no
  `lock_timeout` or `statement_timeout`. It is not the cause of M2-05 and this
  ticket deliberately did not correct on sight, but a genuinely contended owner
  would still wait without bound. It deserves its own ticket, with the pgTAP
  proof and forward migration that a Tier 1 schema change requires.
- **The 750 ms and 10 s budgets are judgement, not measurement of a hosted
  environment.** They were chosen against locally measured latencies of
  20–400 ms and CI latencies of 18–60 ms. A hosted mutation slower than 750 ms
  would trigger a recovery reload; that is safe, because the response had
  already been received and the reload shows the committed truth, but it would
  be visible. Worth re-checking against the Vercel Preview.
- **Hosted verification not performed by this builder.** The Vercel Preview
  check for this commit is still required.
- **The plan-page render failure (M2-06) is untouched**, as the ticket
  requires.

## `vercel-react-best-practices` rules checked

`.agents/skills/vercel-react-best-practices/AGENTS.md` was read for this change.
The rules that applied:

- **3.1 Authenticate Server Actions like API routes** — unchanged and still
  correct. `changeGoalAction` derives the user inside the repository and the
  RPC derives the owner from `auth.uid()`. No client value influences it.
- **3.6 Minimize serialization at RSC boundaries** — no new prop crosses the
  boundary. The watchdog state is entirely client-side.
- **4.4 Version and minimize storage data** — the recovery marker is versioned
  (`:v1`), holds one constant character, carries no user data, and both read
  and write are wrapped in `try`/`catch` because storage throws in private
  browsing.
- **5.1 Calculate derived state during rendering** — the notice text and its
  `data-state` are derived during render from the stall verdict, the pending
  flag, and the action state. Nothing is mirrored into state by an effect, and
  ESLint's `react-hooks/set-state-in-effect` passes. The stall verdict is keyed
  by the submission it describes so a later mutation cannot inherit an earlier
  verdict, which is what removes the need for a reset-in-effect.
- **5.15 Use `useRef` for transient values** — the observed response time is a
  ref, not state; it must not cause a render.
- **6.5 Prevent hydration mismatch without flickering** — the recovery marker
  is read through `useSyncExternalStore` with a server snapshot of `false`,
  the same pattern `ConnectionNotice` already uses on this shell.
- **8.2 Initialize once, not per mount** — the `PerformanceObserver` is created
  in a mount-only effect and disconnected on unmount; the poll interval is
  created per submission and always cleared.
- Server/client boundary unchanged. `GoalManager` remains the only client
  component on the route, no `@/server/**` import crossed into it, and
  `src/architecture/server-boundary.test.ts` still passes.
- No server-rendered data moved into client state; the goal list is still
  rendered from the Server Component's props. No new dependency and no new
  client-side data fetching.

## Independent reviewer checklist

Review the exact pushed commit named below, against
`git diff c33fbc66faa15133dfa0b79aa097f693429dba7d..<review target>`.

Confirm the continuous-integration run for that SHA is green. Do not re-run
lint, typecheck, Vitest, the build, or the browser flows.

Judgement this record asks for:

1. **Is the diagnosis sound?** The claim is that the write commits and the
   render is lost. The evidence is the collection revision advancing across a
   reload while the surface stayed pending. Challenge it if the reasoning does
   not hold.
2. **Is the advisory-lock refutation adequate?** It rests on measured POST
   latencies, not on reading the function. Decide whether that is enough to
   close the ticket's leading hypothesis, and whether the residual unbounded
   wait should block acceptance rather than become a follow-up ticket.
3. **Is a self-triggered page reload acceptable product behavior?** It is the
   central choice in this diff. It recovers a committed change but discards the
   result message and, in principle, could interrupt a user mid-interaction.
4. **Are the changed browser assertions a strengthening or a weakening?** Three
   lifecycle steps moved from asserting a status message to asserting the
   committed record, and the message copy moved to `actions.test.ts`. Verify
   nothing is now unchecked.
5. **Is the honest-message copy correct and non-diagnostic?** "This goal change
   has not been confirmed. Reload to see whether it was saved." must not claim
   more than is known.
6. **Is dropping `revalidatePath("/home/you")` safe?** Confirm no route other
   than `/home/you/goals` renders goal data.
7. **Ownership and authorization are unchanged** — confirm the diff contains no
   change to the repository, the RPC arguments, or the derived user.
8. **Hosted:** verify the Vercel Preview for this SHA loads `/home/you/goals`,
   that a create and a reorder apply, and that `390x844` layout, focus, and
   reduced-motion behavior are intact.

## Commit and continuous integration

| Commit | Contents | CI run | Conclusion |
| ------ | -------- | ------ | ---------- |
| `1be0525bfc4e937eca7c506d12830f2e8b1d012c` | The correction, its tests, and this record | [30632462684](https://github.com/mattiss01/fittip/actions/runs/30632462684) | **success** — all three jobs |
| `6c34f1c5ec88879033b480b4d7ccc55c84834fec` | This section only: the SHA and run URL above | [30632818567](https://github.com/mattiss01/fittip/actions/runs/30632818567) | **failure** — see below |

Run `30632462684` is green on `Lint, types, unit tests, build`,
`Migrations, RLS, advisors, concurrency`, and `390px production browser flows`,
which includes both tests in `e2e/m2-01-goals.spec.ts`.

The evidence commit that follows changes only this file, because a record
cannot contain its own commit hash. Review the branch head; its diff against
`1be0525` is this section alone.

Recorded by the lead on 31 July 2026: run `30632818567` on `6c34f1c` failed,
and **not on this ticket's behavior**. `Lint, types, unit tests, build`,
`Migrations, RLS, advisors, concurrency`, `M1-03`, `M1-04`, and
`M2-01 goal management` all passed. The single failure was
`Authentication and planning flows`, which is
[M2-06](../../backlog/M2/M2-06-PLAN-PAGE-RENDER-TIMEOUT.md) — a separate
approved defect that predates this branch, fails on unchanged `master`, and
that this ticket was explicitly forbidden to touch.

That leaves an unresolved governance question rather than a technical one. The
working agreement says a red run for the reviewed commit is a delivery blocker,
and it does not yet distinguish a regression from a known defect tracked under
its own ticket. The product owner decides whether to accept against `1be0525`
with this exception recorded, or to require M2-06 to be corrected first.

This final commit records the result above; its own run is verified by the lead
rather than recorded here, to avoid an endless chain of evidence commits.

## Review corrections (31 July 2026)

The independent review of `1be0525` did not approve. It confirmed the
investigation, the diagnosis, the advisory-lock refutation, the changed-files
manifest, and that no instrumentation residue survived in `package-lock.json`
or `node_modules/next`. It raised three must-fix corrections and four optional
ones. The narrative above is left as it was written; this section records what
changed and why.

### 1. The lost-render notice claimed a change was saved — corrected

The reviewer was right, and this was the most serious finding. The watchdog's
only evidence is a resource-timing entry: it proves a reply arrived, not what
the reply said. `changeGoalAction` answers 200 for validation failure, stale
conflict, core-limit conflict, archive-required conflict, expired session, and
persistence error alike. On the exact race this ticket documents, the surface
could therefore have told a user their change was saved when it had been
rejected, and then reloaded away the conflict guidance that would have
explained it.

The notice now reads "This goal change did not appear. Reloading your goals to
show what is saved." — it asserts only that nothing rendered, and leaves the
reload to settle what is true. The same inference was corrected in the module
header of `src/features/goals/mutation-watchdog.ts`, in the hook comment above
`useMutationStall`, and at the reload site. `RECOVERED_NOTICE` was already
accurate and is unchanged.

The claim "the change is committed and only the render was lost" in the
correction narrative above is wrong in the same way. The accurate statement is
that a reply arrived and never rendered.

### 2. The recovery reload timer is now cancelled

`window.setTimeout(...)` for the reload was never cleared. Its id is now kept
and cleared in the effect cleanup beside the interval. Cleanup runs only on
unmount or when the mutation settles, so cancelling there is always correct:
either the user navigated away during the 500 ms notice, or the lost
transition landed inside that window and the result is already on screen.
`goal-manager.test.tsx` covers the second case explicitly.

### 3. Automated coverage of the lost-render and recovered paths — added

Four jsdom tests now cover what was previously only observed:

- a reply that arrived and never rendered produces the corrected copy,
  `data-state="lost-render"`, the `sessionStorage` marker, and a reload that
  fires only after the notice window;
- a router prefetch of the same route is not mistaken for that reply;
- a mutation that settles inside the notice window cancels the reload and
  shows its own result;
- a document that starts with the marker present explains itself, and a later
  mutation replaces that explanation with its own outcome.

**Writing these found a real defect that the reviewer's item 3 predicted.**
The marker was cleared by an effect in `useRecoveredReload`, which runs in the
*same* document that set it — so the explanation would never have survived the
reload, and the recovery would have looked like an unexplained flash. Consuming
the marker moved to the start of the next mutation instead. The record above
claims this notice worked; it did not, and it does now. This is exactly the
gap the reviewer identified: the path had been observed, not tested.

### Optional items

| # | Disposition |
| - | ----------- |
| 4 | Applied. The comment in `actions.ts` now states that the widening is reasoning from the traces rather than an isolated A/B, and that removing a revalidation of a route with no goal data is justified on its own. |
| 5 | Applied. The action URL now includes `search`, so a future query on the route neither misses the response nor matches the `_rsc` prefetches. Documented in `latestActionResponseAt`. |
| 6 | Applied, and more thoroughly than suggested. Rather than moving the timestamp, `watchGoalMutation` now compares the observed response against `consumedAt` — the newest response the *previous* mutation accounted for — instead of against `submittedAt`. A reply that beats the pending render is therefore still claimed, because it is newer than anything the last mutation saw. `submittedAt` still bounds only the ten-second unconfirmed path, where being conservative is correct. Covered by a test named for that case. |
| 7 | Applied. The browser test asserts `data-state="unconfirmed"` and the absence of the `srOnly` class instead of `toBeVisible`, which a 1×1 clipped element would satisfy. |

### Verification of the corrections

| Check | Result |
| ----- | ------ |
| `npm.cmd run lint`, `npm.cmd run typecheck` | Clean |
| `npm.cmd run test:run` (whole suite) | 40 files, 254 tests passed |
| `git diff --check` | Clean |
| Both tests in `e2e/m2-01-goals.spec.ts` ×10, local production build | 20 passed (4.1 min) |

No migration, no ADR-009 change, no change to authorization or to the action's
signature. The planning flow and M2-06 were not touched.

## Independent review and product-owner acceptance (31 July 2026)

The independent reviewer withheld approval of `1be0525` and returned three
must-fix corrections and four optional ones: a lost-render notice that claimed
a change was saved on the strength of a response merely having arrived, an
uncancelled reload timer, and no automated coverage of the lost-render or
recovered paths.

Writing the missing coverage exposed a further defect that was not on the
reviewer's list. The `sessionStorage` marker was cleared by an effect in the
same document that set it, so the recovered explanation could never have
survived the reload. This record had claimed a behavior that did not work. It
does now, and the earlier claim is retracted in the corrections section above
rather than edited away.

All seven items were applied in `97679ee08219138b3d931f9afeb0f18f2cdef1cd`. The
reviewer then approved that exact commit, confirming that the false-success
inference is gone from the copy, the comments, and this record rather than
reworded; that the `consumedAt` rewrite is correct and cannot misattribute one
mutation's response to another; and that the record was appended to rather than
rewritten, at 82 insertions and 0 deletions.

Evidence for the accepted commit:

| Gate | Result |
| --- | --- |
| CI run [30653424875](https://github.com/mattiss01/fittip/actions/runs/30653424875) on `97679ee` | **success** — three jobs, all four browser flows |
| Vercel Preview | **success** — `https://vercel.com/mattis-3657s-projects/fittip/4ndXNvpkYXovoJTnVTCW1Xph2JoK` |
| Independent exact-commit review | approved with no unresolved findings |

Because the planning flow passed on that run, the known-defect exception for
M2-06 was not needed for this acceptance.

The product owner accepted `97679ee` on 31 July 2026 and it was merged to
`master` as `e438a7e`.

## Deferred, not fixed

- **The framework defect remains.** This ticket detects and recovers from it on
  the goals surface only.
- **The unbounded `pg_advisory_xact_lock`** at
  `supabase/migrations/20260729161854_m2_01_goal_model.sql:266` still has no
  `lock_timeout` or `statement_timeout`. It is not the cause of M2-05 and was
  deliberately not corrected on sight. It needs its own Tier 1 ticket.
- **A cancelled reload leaves the recovery marker set.** If a slow transition
  lands inside the 500 ms notice window, a later remount with no intervening
  mutation can show the recovery explanation when no reload occurred. It makes
  no claim about saved data and self-clears at the next mutation. The reviewer
  raised it as non-blocking and recommended folding it into the hosted-latency
  follow-up; one line in the cleanup would remove it.
- **Hosted Preview behavior of the 750 ms and 10 s budgets** has not been
  measured against founder staging.
