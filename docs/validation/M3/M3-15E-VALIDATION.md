# M3-15E validation: roadmap surface restoration, read-only

**Ticket:** [M3-15E](../../backlog/M3/M3-15E-ROADMAP-RESTORATION.md)
**Status:** builder handoff. Independent review, the continuous-integration
result for the reviewed SHA, the Vercel Preview, and product-owner acceptance
are all outstanding.
**Tier:** 2
**Branch:** `ticket/m3-15e-roadmap-read`
**Base:** `899fc1f`
**Implementation review target:** `7f0eb24` — the last source commit. The
record commit that adds this file changes no application file (the
evidence-commit exception in `AGENTS.md`).
**Review range:** `git diff 899fc1f..7f0eb24`

Implementation commits, in order:

| Commit    | Purpose                                                                                       |
| --------- | --------------------------------------------------------------------------------------------- |
| `ac05473` | `expired` becomes a state the type system and a repository read can express.                    |
| `0622aee` | The route, its components, its stylesheet, and the deliberate invariant change.                 |
| `b1ef91f` | The tests.                                                                                      |
| `c82de23` | `e2e/m3-11-maintenance.spec.ts` stops asserting a stub on the reopened route.                    |
| `7f0eb24` | The Plan links to the reopened route.                                                           |

## Delivered behavior

`/home/plan/roadmap` leaves the M3-11 `TrainingMaintenance` stub. It reads, in
one owner-scoped pass, and shows:

- The current roadmap: title, summary, horizon and version number, then the
  M3-02 spine — phases as bands hung off a drawn rule, review points cutting
  that rule open where they fall, milestones marked with `Aim for by`, and
  ordinal goal attention naming each goal from the goal read rather than from
  the roadmap body. Underneath it, what the coach qualified the direction with:
  what it assumes, what could change it, and what it held back.
- Every superseded version, listed with its number and horizon.
- Every recent proposal as a record carrying the state it ended in — awaiting a
  decision, accepted, declined, or the `expired` M3-11 wrote. An expired one
  also says, in one sentence, that it can no longer be accepted.
- The static server-owned safety notice when an eligible completion carries one
  of the four flags. The flag is reported, never classified.
- A link to the memory surface when a planning note left candidates undecided,
  separate from the roadmap as M3-02 decision 4b requires.
- An honest empty state for an owner with neither a roadmap nor a proposal.

The surface reads and nothing else. There is no Server Action, no form, no
button, and no cache invalidation anywhere in the diff; the only link out of
the roadmap route is the way back to the Plan. No control from the deleted
surface is present and inert: "Generate roadmap proposal", "Accept roadmap",
"Decline proposal", "Edit proposal" and "Regenerate proposal" are absent, and a
test asserts each of those wordings does not appear.

## Mobile demo path

At `390x844`, signed in:

1. `npm.cmd run build` then `npm.cmd run start -- -p 3000`.
2. Open `/home/plan`. The link row under the masthead now carries **Saved
   sessions** and **Roadmap**. Follow Roadmap.
3. A new account sees "No roadmap yet." and the stamp "No roadmap yet". No
   section offers to create one, because nothing can.
4. `← Plan` returns.
5. An owner carrying an M3-11-expired proposal sees it under **Proposals**,
   stamped `Expired`, with no control beside it.

There is no per-ticket Playwright flow; see known limitation 1.

## Changed files

```
 e2e/m3-11-maintenance.spec.ts                      |  11 +-
 src/app/home/plan/page.tsx                         |  11 +-
 src/app/home/plan/plan.module.css                  |  14 +
 src/app/home/plan/roadmap/error.tsx                |  26 ++
 src/app/home/plan/roadmap/loading.tsx              |  13 +
 src/app/home/plan/roadmap/page.test.tsx            | 376 ++++++++++++++++++
 src/app/home/plan/roadmap/page.tsx                 | 194 +++++++++-
 src/app/home/plan/roadmap/roadmap.module.css       | 423 +++++++++++++++++++++
 src/architecture/m3-11-legacy-reset.test.ts        | 102 ++++-
 src/components/roadmap/roadmap-detail.tsx          |  90 +++++
 src/components/roadmap/roadmap-proposal-record.tsx |  69 ++++
 src/components/roadmap/roadmap-screen.tsx          | 115 ++++++
 src/components/roadmap/roadmap-spine.tsx           | 178 +++++++++
 src/server/repositories/roadmap-repository.test.ts |  25 +-
 src/server/repositories/roadmap-repository.ts      |  10 +
 src/server/roadmap/roadmap-records.ts              |  21 +-
 src/server/roadmap/roadmap-safety.test.ts          |  73 ++++
 src/server/roadmap/roadmap-safety.ts               |  69 ++++
 18 files changed, 1802 insertions(+), 18 deletions(-)
```

`git diff --stat 899fc1f..7f0eb24`. Nothing was deleted or renamed.

Files whose purpose is not evident from the path and diff:

- `src/server/roadmap/roadmap-safety.ts` — the `hasSafetySignal` predicate,
  and the one file in the diff not named in the brief's expected list. It exists
  because the brief requires the flag to come from M3-15D's
  `selectTrainingHistoryContext` rather than from a fresh predicate over
  completions, and that selector takes `TrainingHistoryCompletion` records. The
  only function that produces those is `toTrainingHistoryCompletion`, private to
  `src/server/context/coach-ai-context-source.ts` — importing that module into a
  route would pull `plan-window-top-up` and the whole AI context graph into a
  read surface, which is the write-by-side-effect M3-15C refused. The mapping is
  therefore written here, field by field, and its header says plainly that it is
  **not** ADR-013's provider allowlist: nothing it produces is serialized,
  transmitted, or displayed.
- `src/components/roadmap/roadmap-screen.tsx` — the whole surface rendered from
  one `RoadmapScreenState`. It is where the decision to keep every component a
  Server Component is recorded: no roadmap content, and therefore no planning
  note, crosses a client boundary.
- `src/server/repositories/roadmap-repository.ts` — `getReviewProposals` gains a
  third field, `history`, and issues no additional query. `open` excludes every
  decided proposal and `declinedPredecessor` only ever holds a rejected one, so
  before this an `expired` proposal was unreachable from any read and acceptance
  criterion 2 could not have been satisfied honestly.
- `src/server/roadmap/roadmap-records.ts` — `RoadmapDecision` gains `"expired"`,
  which the `roadmap_proposal_decisions` check constraint has permitted since
  M3-11; the type had not caught up, so the repository was casting a real value
  to a type that could not name it. `RoadmapScreenState` gains
  `proposalHistory`.
- `src/architecture/m3-11-legacy-reset.test.ts` — the deliberate invariant
  change the brief asked for. `roadmap/page.tsx` leaves `maintenancePages`;
  `actions.ts` stays on `legacyModules`, because this ticket creates none. It
  does **not** join `rollingPlanSurface`: that list shares
  `allowedServerModules` with the Plan and Today, and adding the roadmap, goal
  and completion modules there would have handed those routes a roadmap
  repository. It gets `roadmapReadSurface` and `allowedRoadmapModules` instead,
  plus a new assertion over the route directory and `src/components/roadmap`
  that nothing there names one of the five revoked functions, calls one of the
  seven repository methods that reach them, declares `"use server"`, or
  invalidates a cache. Every other entry in the file is untouched.
- `e2e/m3-11-maintenance.spec.ts` — `/home/plan/roadmap` is dropped from that
  flow's stub route list. Without it the flow's "One plan is taking shape."
  assertion would fail on this branch, which would make this ticket a regression
  in another ticket's evidence. The same correction M3-15B and M3-15C made.
  `/home/plan/proposal` is the last stub and stays.
- `src/app/home/plan/page.tsx` and `plan.module.css` — **outside the brief's
  expected file list**, and flagged here rather than buried. Nothing in the
  application linked to `/home/plan/roadmap`: the M3-11 stub was reachable only
  by typing the URL, and restoring the surface without an entry point would have
  left the product owner unable to reach it on the Preview. The Plan's existing
  single "Saved sessions" link becomes a two-item row. The page gains a `Link`
  and no server import, so its `rollingPlanSurface` invariants are unchanged.
  A one-line revert if the lead judges it out of scope.

## Data, migration, API, privacy, and security effects

- **No migration, no schema change, no new grant, no RPC change, no privilege
  re-grant.** No file under `supabase/` is touched and
  `src/lib/supabase/database.types.ts` is unchanged. The five ADR-015 functions
  stay revoked from every role, and an architecture assertion now proves this
  surface cannot reach one.
- **No provider call, prompt, model, rate card, or spend change.** No
  `FITTIP_AI_*` variable is read and no adapter is constructed. Nothing in the
  diff can cost money.
- **No write path of any kind.** No Server Action, no form, no mutation, and no
  cache invalidation. Every read goes through an accepted owner-scoped factory
  that derives its own owner from the verified session; no function in the diff
  accepts or passes an owner id, and none could.
- **Reads added:** `roadmap_heads`, `roadmap_versions` and `roadmap_proposals`
  (with their decision and generation-request rows) under the owner `SELECT`
  policy, the existing memory-candidate count, the goal collection, the profile,
  and 56 days of completions. All are existing, accepted, RLS-backed reads; the
  repository repeats the `user_id` predicate on each.
- **Privacy.** The whole surface is Server Components, so no roadmap content
  reaches a client payload — including the owner's planning note, which is read
  as part of `RoadmapProposalView` and rendered nowhere.
- **`fittip.roadmap.v2` is unchanged,** as is every preserved record.
  `/home/plan/proposal` stays on the maintenance stub.

## Tests and final results

Added or changed:

- `src/app/home/plan/roadmap/page.test.tsx` (new, 11 tests) — the current
  roadmap and its spine; the honest empty state; superseded versions listed
  under the current one; an expired proposal rendering with its state and no
  control; an open proposal rendering as a record, not a prompt; **no
  action-bearing control anywhere on the surface**, asserted both structurally
  (no button, no form, exactly one link) and by each removed wording; the safety
  notice present on a reported flag and absent without one; the completion read
  bounded to a 56-day window; the memory link pointing at the surface that owns
  the candidate; and both redirect paths.
- `src/server/roadmap/roadmap-safety.test.ts` (new, 7 tests) — each of the four
  flags, the empty case, and that the window boundary is M3-15D's constant
  rather than a number copied into this ticket.
- `src/server/repositories/roadmap-repository.test.ts` — one new test that a
  settled proposal comes back as history with the state it carries. Two existing
  assertions move from `toEqual` to `toMatchObject` because the return type
  gained a field; neither loses an assertion it was making.
- `src/architecture/m3-11-legacy-reset.test.ts` — two new invariants, described
  under Changed files.

Run locally, narrow: `npm.cmd run test:run -- src/architecture`,
`src/app/home/plan`, `src/server/roadmap/roadmap-safety.test.ts`,
`src/server/repositories/roadmap-repository.test.ts`. All green.
`npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build` and
`git diff --check` are clean. `npx.cmd prettier --write` was run over the
changed files only and left no diff.

The complete suite was not run by hand and neither the database nor the browser
matrix was run locally: CI owns that, and running another ticket's Playwright
config would have rewritten its accepted screenshot evidence. **The green CI run
for the reviewed SHA is the automated-test evidence and is outstanding.**

## Project skills applied

`vercel-react-best-practices`, rules actually checked:

- `server-serialization` — nothing in this diff crosses the server/client
  boundary. Every roadmap component is a Server Component, so the full
  `RoadmapScreenState` can be handed down without any of it being serialized
  into a client payload. The only client file is the `error.tsx` boundary Next
  requires, and it takes `reset` alone.
- `server-auth-actions` — no Server Action exists to authenticate. Every read
  authenticates through its repository's own verified-user check, and the page
  maps all four authentication errors to the same two redirects `/home` uses.
- `async-parallel` / `server-parallel-fetching` — the three factories are
  created together, then six reads are issued together. The seventh, the
  completion window, is genuinely dependent: it is bounded by the owner's own
  today, which comes from the profile. No parallelizable pair was left
  sequential and no waterfall was added.
- `server-no-shared-module-state` — the only module-level values are frozen
  label maps and the imported copy constant.
- `bundle-barrel-imports` / `bundle-analyzable-paths` — direct, statically
  analyzable imports throughout; no barrel file and no dynamic specifier.
- `rendering-conditional-render` — every conditional is a ternary, never `&&`,
  so an empty list cannot render a stray `0`.
- `js-early-exit` — `redirectOnAuthError` returns on the non-auth case before
  testing a reason.
- The re-render, client-fetching and advanced rules do not apply: this ticket
  adds no stateful client component.

`frontend-design`, applied:

- The M3-02 direction is restored rather than replaced, and no new visible
  direction is introduced — that would need product-owner approval before it
  shipped. The spine is the surface's one loud element and stays the signature:
  a drawn rule with phase bands, milestone markers ticked back to it, and a
  review point cutting it open. It encodes something true, which is why it is
  an ordered list and why review points interleave with the phases rather than
  being pulled into a section of their own.
- Everything else stays quiet. Every rule that styled a control — the compose
  form, the action dock, the dialog, the pending state — is gone from the
  stylesheet, so nothing here can dress one up. The new record chips are set as
  labels, not status lights: no colour ranks one outcome above another, because
  a declined proposal is a decision the owner made.
- No meter, percentage, confidence score, or progress badge anywhere. A roadmap
  contains no training volume, so anything that looked measurable would be
  measuring nothing.
- Copy: active voice, sentence case, no apology in the failure state. Every
  approved wording is imported from `ROADMAP_COPY`, and the two headings that
  are not in it — "Held back for now" and "Superseded roadmaps" — are the
  accepted M3-02 wordings rather than new ones.
- Quality floor: 390px first, the cards and lists reflow with no fixed width,
  a visible 3px focus ring on every link, `:focus-within` on the phase band, and
  the one transition in the stylesheet is disabled under
  `prefers-reduced-motion`.

## Known limitations

1. **There is no Playwright flow for this surface, and no 390px automated
   check.** The brief's expected-file list does not include one, and adding one
   would also mean a `.github/workflows/ci.yml` step, which AGENTS.md requires
   to be committed separately as a tooling change. So the only 390px evidence
   this ticket will have is the product owner's manual pass on the Preview. The
   lead should decide whether that is sufficient for a Tier 2 read surface or
   whether a follow-up ticket adds the flow.
2. **No roadmap content has ever been rendered from real data.** The five
   ADR-015 functions are revoked, so nothing can create a roadmap version or a
   proposal, and no fixture in the repository produces one either. Every
   assertion about the spine, the milestones and the proposal records is made
   against authored fixtures in the unit tests. On the Preview, an owner will
   see the empty state and nothing else unless their account already carries
   M3-11-expired rows. **This is the largest gap in the evidence and I could not
   close it from here:** creating the data would require the revoked functions,
   which is M3-15F.
3. **The `expired` sentence is a claim about the future.** "This proposal can no
   longer be accepted" is true by construction — the decision row is terminal
   and `accept_roadmap_proposal` refuses a decided proposal — but it is asserted
   in copy rather than enforced by anything in this diff. M3-15F is where that
   refusal becomes reachable again and should be checked then.
4. **`hasSafetySignal` may disagree with a generation's own value.** This
   surface calls `selectTrainingHistoryContext` with the default session cap and
   no byte budget; the AI path passes a byte sub-budget that can trim further.
   Two owners with a great deal of recent training could therefore see the
   notice while a generation computed the flag over a smaller included set. The
   window and the cap are shared, which is what the brief asked for; the byte
   budget is not, because this surface transmits nothing and has no budget.
5. **An unconfirmed time zone falls back to UTC** for the 56-day safety window
   rather than gating the surface behind a zone prompt as Progress does. A
   roadmap spans months, so the only thing the fallback can shift is which day
   that window ends on, and hiding an accepted roadmap over that would be the
   larger error. It does mean an owner in a far-eastern zone who logs a symptom
   late in their own day may not see the notice until the next UTC day.
6. **`getReviewProposals` reads at most 20 proposals**, which is the limit that
   read already had. An owner with more sees the twenty most recent. Nothing
   tells them there are more, because nothing counts them.
7. **Not verified by me:** the hosted Preview, any authenticated hosted read,
   the 390px visual pass, and the CI result for the reviewed SHA. I have no
   reach to the hosted database and did not attempt one.

## Independent reviewer checklist

Review the exact commit `7f0eb24` on `ticket/m3-15e-roadmap-read`, over
`git diff 899fc1f..7f0eb24`. Confirm the CI run for `7f0eb24` is green and its
Vercel Preview reached `READY`. Do not re-run lint, typecheck, the unit suite,
the build, or the browser matrix; CI covers all of them.

What needs judgment CI cannot supply:

1. **The revoked five.** Confirm no code path from this route reaches
   `begin_roadmap_generation`, `finish_roadmap_generation`,
   `record_roadmap_memory_candidates`, `apply_roadmap_proposal_change` or
   `accept_roadmap_proposal`, and that the new architecture assertion is a real
   guard rather than one that passes vacuously — it names both the SQL functions
   and the repository methods, so check the method list is complete against
   `roadmap-repository.ts`.
2. **No inert control.** Confirm every action-bearing control from the deleted
   surface is absent rather than disabled, and that the test asserting this
   cannot pass on a surface that merely hides them behind a `disabled`
   attribute.
3. **Authorization.** Confirm the route cannot be reached anonymously or
   cross-owner, that no owner id is taken from a caller anywhere, and that all
   four authentication errors map to the same two redirects the rest of `/home`
   uses.
4. **The repository change.** Confirm `history` adds no query, that `open` and
   `declinedPredecessor` keep their exact previous semantics, and that the two
   tests moved from `toEqual` to `toMatchObject` have not lost an assertion.
   `open` is what M3-15F will accept against, so a change in its meaning here
   would be a defect there.
5. **`RoadmapDecision` gaining `expired`.** Confirm this matches the check
   constraint in `20260814195107_m3_11_legacy_training_reset.sql` and that
   widening it cannot make an expired proposal look acceptable anywhere.
6. **The out-of-brief file.** Judge `src/server/roadmap/roadmap-safety.ts` on
   its stated reason: the alternative was importing the AI context source into a
   route. Confirm its mapping is faithful to `toTrainingHistoryCompletion` and
   that nothing it produces is serialized or shown. Known limitation 4 records
   where it can disagree with a generation.
7. **The Plan link.** Judge whether adding an entry point belongs in this
   ticket. It is `7f0eb24` alone and reverts cleanly.
8. **Honest states.** Confirm the empty state, `error.tsx`, `loading.tsx` and
   the expired sentence each say a different true thing, that none invents a
   training fact or a capability that does not exist, and that the empty state
   does not imply a roadmap can be generated today.
9. **Product invariants.** Confirm nothing totals, scores, ranks, streaks or
   charts; that goal attention is rendered as an ordinal level and never as a
   share; that the safety notice is the server-owned copy and nothing near it
   assesses a symptom; and that no preserved record is rewritten.
10. **Scope.** Confirm nothing outside the brief changed beyond the two items
    called out above, and that the `e2e/m3-11-maintenance.spec.ts` edit is the
    minimum needed to stop it asserting a stub on a reopened route.
