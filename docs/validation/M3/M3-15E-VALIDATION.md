# M3-15E validation: roadmap surface restoration, read-only

**Ticket:** [M3-15E](../../backlog/M3/M3-15E-ROADMAP-RESTORATION.md)
**Status:** accepted by the product owner on 15 September 2026 against
`693bd46`; merged to `master` as `3570c25`, whose CI run is green and whose
founder deployment succeeded (see *Acceptance*). Round 3 of independent review
approved `693bd46` with two copy findings deferred to M3-15F.
**Tier:** 2
**Branch:** `ticket/m3-15e-roadmap-read`
**Base:** `899fc1f`
**Implementation review target:** `693bd46d1e37776d12628f87648367666be0878c`
(`693bd46`) — the last source commit. The record commit that follows it changes
no application file (the evidence-commit exception in `AGENTS.md`).
**Review range:** `git diff 899fc1f..693bd46`
**Previously reviewed:** `7f0eb24` (round 1) and `05ad741` (round 2). The
round 2 correction range alone is `git diff 05ad741..693bd46`.

Implementation commits, in order:

| Commit    | Purpose                                                                               |
| --------- | ------------------------------------------------------------------------------------- |
| `ac05473` | `expired` becomes a state the type system and a repository read can express.          |
| `0622aee` | The route, its components, its stylesheet, and the deliberate invariant change.       |
| `b1ef91f` | The tests.                                                                            |
| `c82de23` | `e2e/m3-11-maintenance.spec.ts` stops asserting a stub on the reopened route.         |
| `7f0eb24` | The Plan links to the reopened route.                                                 |
| `4ee7565` | **Round 1, finding 1.** The provider session cap stops suppressing the safety notice. |
| `05ad741` | **Round 1, finding 2.** An undecidable proposal stops claiming a decision is awaited. |
| `645520d` | **Round 2, finding 1.** A superseded undecided proposal stops reading as open.        |
| `332165c` | **Round 2, finding 2.** The surface's inlined copy moves into `ROADMAP_COPY`.         |
| `693bd46` | **Round 2, note 3.** Two loosened repository assertions are exact again.              |

Record-only commits `6dbbb91` and `e9d2367` sit between them and change no
application file.

## Round 3 review: approved, two copy findings deferred

A third independent reviewer approved `693bd46`. It confirmed CI run
34957935928 and Preview deployment 6456750046 for `e5f4c37`, that `e5f4c37`
changes no application file, all three round 2 corrections (including that the
superseded derivation cannot mismatch `open` under the 20-row read limit), and
every brief constraint across the whole ticket. No correctness, authorization
or safety defect was found.

The product owner chose to accept rather than correct the two should-fix
findings, and routed both to M3-15F, which reworks the same components:

1. **Approved M3-02 wordings remain inlined** in `page.tsx`,
   `roadmap-screen.tsx`, `roadmap-detail.tsx` and `roadmap-spine.tsx`, against
   the brief's "do not inline a string". Rendered text matches `e370dbe~1`
   exactly. **Waived for this ticket by the product owner**; moving them into
   `ROADMAP_COPY` is recorded on M3-15F.
2. **Uncertainty entries lost their M3-02 labels.** `roadmap-detail.tsx:71-72`
   renders `whyItMatters` and `whatToWatch` without the "Why it matters:" and
   "Watch for:" prefixes that `roadmap-manager.tsx` carried at `e370dbe~1`.
   Present since `0622aee` and missed in rounds 1 and 2. The earlier claim in
   this record that the M3-02 direction was restored rather than replaced does
   not hold for these two lines. Accepted as a known limitation; restoring them
   is recorded on M3-15F.

Two notes, not acted on: the M3-02 "When to reassess" section is gone, so
`ROADMAP_COPY.reviewPointsHeading` is unused (each checkpoint on the spine still
reads "Review on/when …", so nothing is lost); and a source whose edit was
later declined reads "A later proposal replaced this one", which is a slight
stretch rather than untrue.

## Round 2 review: approved with findings, corrected

The reviewer approved `05ad741`. The product owner approved correcting findings
1 and 2 and two notes now; the remaining notes are recorded under Known
limitations rather than acted on.

1. **Two records could both read "Awaiting your decision".**
   `RoadmapProposalRecord` treated every `decision === null` as open. But
   `getReviewProposals` returns `history` as every proposal it read, including
   an undecided proposal that an owner edit superseded — which `open`
   deliberately excludes. Such a proposal was labelled as awaiting a decision
   nothing can ever make. This **subsumes the round 1 third finding** that was
   routed to M3-15F; it is fixed here instead, and M3-15F no longer carries it.

   `645520d` passes `openProposal`'s id down from the screen and derives
   `decision ?? (id === openProposalId ? "open" : "superseded")`. A superseded
   record carries its own label and sentence, no summary, and no control. The
   state labels moved into `ROADMAP_COPY` in the same commit, because the new
   label had to be added there. New copy, the product owner's to confirm:

   - `proposalStateLabels.superseded` — "Superseded"
   - `proposalSuperseded` — "A later proposal replaced this one before it was
     decided. It stays here, unchanged."

   The sentence names "a later proposal" rather than "your edit" because the
   repository's `open` is the newest undecided proposal no other proposal names
   as its source; any older undecided proposal also falls outside it, and the
   sentence is true for both. It promises no future control. The new component
   test was run against the unfixed component first and failed there (two of
   its four tests, receiving `open` where `superseded` was expected).

   The same commit corrects the `RoadmapScreenState.proposalHistory` doc
   comment, which claimed the open proposal is always the first entry. Nothing
   enforces that: a newer decided or edited proposal can precede it. The
   comment now says consumers compare ids with `openProposal`, never position.

2. **Copy was inlined despite the brief.** The origin and state label maps, the
   empty state, the proposal and superseded-version section copy, the masthead
   intro, the memory-count sentence, and the whole of `error.tsx` and
   `loading.tsx` were written in components. `332165c` moves them into
   `ROADMAP_COPY`, wording byte-identical. It also moves the "Version N" label,
   which was not named but was inlined in three places. The memory sentence,
   which interpolates, became a function entry; its exact rendered text was
   verified by running the new literal assertion against the pre-change
   `roadmap-screen.tsx`, where it passes.

   `error.tsx` must be a Client Component, and `roadmap-records.ts` imports
   `server-only` and lives under `@/server/**`, which
   `src/architecture/server-boundary.test.ts` refuses in a client file. So the
   error and loading copy lives in `src/lib/roadmap/roadmap-route-state-copy.ts`,
   which imports nothing, and `ROADMAP_COPY` spreads it in. `error.tsx` imports
   that module; `loading.tsx`, a Server Component, reads `ROADMAP_COPY`.

   **The frontend-design section below was wrong** when it said only two
   headings sat outside `ROADMAP_COPY`. It has been corrected.

3. **Note: two repository assertions had been loosened.** `toEqual` became
   `toMatchObject` when `getReviewProposals` gained `history`, so an unexpected
   field or entry would have passed. `693bd46` restores `toEqual` with `history`
   written out in full.

4. **Note: the `proposalHistory` doc comment** — corrected in `645520d`; see
   finding 1.

Reviewer notes not acted on, recorded as known limitations 8 to 10.

## Round 1 review: two findings, both corrected

Neither was disputed. The product owner approved both for correction rather
than deferring them, and both invalidate approval of `7f0eb24`.

1. **A provider cap was silently suppressing the safety notice.**
   `hasRecentSafetySignal` called `selectTrainingHistoryContext` with no
   `limits`, so it inherited `TRAINING_HISTORY_MAX_SESSIONS`. That selector
   filters to the window, sorts newest-first, truncates at the cap, and *then*
   computes `hasSafetySignal` over what survived. So a symptom reported three
   weeks ago — still well inside the 56-day window — dropped out of the
   computation as soon as twenty later sessions were logged, and the notice
   stopped rendering with nothing on screen to say it had. Twenty completions in
   56 days is about two and a half a week: an ordinary trainee, not an edge
   case.

   The cap is correct where it was set. It bounds a paid provider payload, and
   ADR-013 decision 1 discloses the trim to the coach so a model that saw a
   subset does not reason as though it saw everything. None of that applies to a
   local read that transmits nothing and has nobody to disclose a trim to, where
   the cap bounds no cost and only decides which reported symptoms the owner is
   allowed to be reminded of. `4ee7565` passes an explicit named uncapped
   session count at the call site. The 56-day window is untouched and still
   M3-15D's, and `training-history-context.ts` is not modified at all.

   Verified rather than assumed: the new test was run against the unfixed call
   site and fails there, then against the fix and passes.

   This was the lead's error rather than a deviation from the brief — the brief
   named the selector and did not anticipate that a transmission cap would carry
   into a read — but the notice it governs is a safety surface, so it is
   recorded here in full rather than as a tidy-up.

2. **An undecidable proposal claimed a decision was awaited.** The record
   labelled `decision === null` "Awaiting your decision" and, unlike the
   `expired` branch, said nothing further. A pre-M3-11 proposal carrying only
   goal and memory sources was not touched by the expiry backfill, so it is
   still open — and an owner reading that label would go looking for a control
   that does not exist on this screen or anywhere in the application, because
   all five functions stay revoked until M3-15F. That is the brief's "absent,
   not present and inert" constraint failing in copy rather than in a button.

   `05ad741` adds one sentence to the open branch, matched in tone to the
   expired one. Both sentences now live in `ROADMAP_COPY` rather than inlined in
   the component — the expired one moved there too, so the two are reviewable
   together. **Both are new user-visible strings rather than M3-02 decisions,
   and are the product owner's to confirm:**

   - `proposalDecisionUnavailable` — "Deciding on a proposal is not available
     yet. This one stays here, unchanged, and nothing happens to it in the
     meantime."
   - `proposalExpired` — "This proposal can no longer be accepted. It stays
     here, unchanged, with everything it was built on." (Unchanged wording;
     only its location moved.)

A third finding — two records both reading "Awaiting your decision" when an
edit and its source are both open — was routed to M3-15F at the time. Round 2
finding 1 subsumed it and it is fixed in `645520d`; see above.

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
  decision, accepted, declined, the `expired` M3-11 wrote, or superseded. Only
  the repository's `open` proposal reads as awaiting a decision; any other
  undecided proposal reads as superseded. The open, expired and superseded
  states each carry one sentence saying what can and cannot happen to it.
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
Steps 3 and 4 are the whole pass on the founder account. It carries no
pre-M3-11 roadmap data, so the empty state is all there is to see and the
proposal record cannot be exercised there — see known limitation 2, which the
product owner should read before accepting.

There is no per-ticket Playwright flow; see known limitation 1.

## Changed files

```
 docs/validation/M3/M3-15E-VALIDATION.md            | 488 +++++++++++++++++++++
 docs/validation/README.md                          |  11 +
 e2e/m3-11-maintenance.spec.ts                      |  11 +-
 src/app/home/plan/page.tsx                         |  11 +-
 src/app/home/plan/plan.module.css                  |  14 +
 src/app/home/plan/roadmap/error.tsx                |  24 +
 src/app/home/plan/roadmap/loading.tsx              |  14 +
 src/app/home/plan/roadmap/page.test.tsx            | 413 +++++++++++++++++
 src/app/home/plan/roadmap/page.tsx                 | 191 +++++++-
 src/app/home/plan/roadmap/roadmap.module.css       | 434 ++++++++++++++++++
 src/architecture/m3-11-legacy-reset.test.ts        | 102 ++++-
 src/components/roadmap/roadmap-detail.tsx          |  90 ++++
 .../roadmap/roadmap-proposal-record.test.tsx       | 115 +++++
 src/components/roadmap/roadmap-proposal-record.tsx |  80 ++++
 src/components/roadmap/roadmap-screen.tsx          | 118 +++++
 src/components/roadmap/roadmap-spine.tsx           | 178 ++++++++
 src/lib/roadmap/roadmap-route-state-copy.ts        |  22 +
 src/server/repositories/roadmap-repository.test.ts |  50 ++-
 src/server/repositories/roadmap-repository.ts      |  10 +
 src/server/roadmap/roadmap-records.ts              |  93 +++-
 src/server/roadmap/roadmap-safety.test.ts          |  95 ++++
 src/server/roadmap/roadmap-safety.ts               |  97 ++++
 22 files changed, 2645 insertions(+), 16 deletions(-)
```

`git diff --stat 899fc1f..693bd46`. Nothing was deleted or renamed. The two
`docs/validation/**` counts are this record and its index as they stood at
`693bd46`; the commit that adds this round's text grows them and changes no
application file. The round 2 correction range is
`git diff --stat 05ad741..693bd46`: eleven source and test files, listed under
Round 2 above, plus this record and its index from `e9d2367`.

Files whose purpose is not evident from the path and diff:

- `src/lib/roadmap/roadmap-route-state-copy.ts` — added in round 2. The
  `error.tsx` and `loading.tsx` copy, in a module with no imports so that a
  Client Component may read it; `ROADMAP_COPY` spreads it in. It sits outside
  the brief's expected file list because the brief's copy rule and the client
  import boundary cannot both be met from `roadmap-records.ts`.
- `src/components/roadmap/roadmap-proposal-record.test.tsx` — added in round 2.
  The component test for the open, superseded and decided states.

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
  transmitted, or displayed. Round 1 finding 1 lives here too: the call site
  now passes an explicit uncapped session count, and `NO_SESSION_CAP` carries
  the reasoning for why a provider cap does not travel into a local read.
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
  `proposalHistory`. `ROADMAP_COPY` gains every new wording this surface
  shows; see Copy for the product owner to confirm.
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

- `src/components/roadmap/roadmap-proposal-record.test.tsx` (new in round 2,
  4 tests) — the open proposal reads as awaiting a decision with the
  unavailable sentence; an undecided proposal that is not the open one reads as
  superseded, with its sentence, no "Awaiting your decision", and no button,
  link or form; an undecided proposal is superseded when nothing is open; a
  decided proposal keeps its own state whatever is open. Written first and run
  red against the unfixed component.
- `src/app/home/plan/roadmap/page.test.tsx` (new, 12 tests; round 1 added two
  assertions to existing tests, for the two sentences below; round 2 added one
  test proving the screen passes the open id down, so an edit and its source
  read `open` and `superseded` with exactly one "Awaiting your decision", and
  one assertion pinning the memory sentence's exact rendered text) — the current
  roadmap and its spine; the honest empty state; superseded versions listed
  under the current one; an expired proposal rendering with its state and no
  control; an open proposal rendering as a record, not a prompt; **no
  action-bearing control anywhere on the surface**, asserted both structurally
  (no button, no form, exactly one link) and by each removed wording; the safety
  notice present on a reported flag and absent without one; the completion read
  bounded to a 56-day window; the memory link pointing at the surface that owns
  the candidate; and both redirect paths.
- `src/server/roadmap/roadmap-safety.test.ts` (new, 8 tests) — each of the four
  flags, the empty case, that the window boundary is M3-15D's constant rather
  than a number copied into this ticket, and — added in round 1 — that a
  symptom buried under more than `TRAINING_HISTORY_MAX_SESSIONS` later sessions
  is still reported. That last one was run against the unfixed call site and
  fails there, so it is known to be a real guard rather than one that passes
  either way.
- `src/server/repositories/roadmap-repository.test.ts` (15 tests) — one new
  test that a settled proposal comes back as history with the state it carries.
  Two existing assertions were moved from `toEqual` to `toMatchObject` in the
  first handoff; round 2 restored `toEqual` on both with `history` written out
  in full.
- `src/architecture/m3-11-legacy-reset.test.ts` — two new invariants, described
  under Changed files.

Round 1, run locally, narrow: `npm.cmd run test:run -- src/architecture`,
`src/app/home/plan`, `src/server/roadmap/roadmap-safety.test.ts`,
`src/server/repositories/roadmap-repository.test.ts`. All green.
`npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build` and
`git diff --check` are clean. `npx.cmd prettier --write` was run over the
changed files only and left no diff.

Round 2, at `693bd46`, run locally and narrow:

- `npm.cmd run test:run -- src/components/roadmap/roadmap-proposal-record.test.tsx`
  before the fix: red as intended, 2 failed and 2 passed.
- `npm.cmd run test:run -- src/components/roadmap src/app/home/plan
  src/architecture src/server/roadmap
  src/server/repositories/roadmap-repository.test.ts`: 15 files, 118 tests
  passed.
- `npm.cmd run typecheck`, `npm.cmd run lint` and
  `git diff --check 899fc1f..693bd46`: clean.
- `npx.cmd prettier --write` over each commit's changed files: line endings
  only; `git diff` was empty after staging.
- `npm.cmd run build`: not run in round 2. CI's `static` job covers it.

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
  requires, and it takes `reset` alone. Since round 2 it imports
  `src/lib/roadmap/roadmap-route-state-copy.ts`, a module of six string
  constants with no imports, so no server code enters the client bundle.
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
- Copy: active voice, sentence case, no apology in the failure state. **As
  first handed off, this bullet said only two headings sat outside
  `ROADMAP_COPY`. That was wrong:** the label maps, the empty state, the section
  copy, the masthead intro, the memory sentence, and all of `error.tsx` and
  `loading.tsx` were inlined too (round 2 finding 2). Since `332165c`, every
  string this ticket introduced comes from `ROADMAP_COPY`. A grep of the route
  and `src/components/roadmap` at `693bd46` finds these literals remaining, each
  restored unchanged from the M3-02 surface at `e370dbe~1` rather than written
  by this ticket: "← Plan", "FitTip / plan / roadmap", "Where this is going.",
  the stamp "No roadmap yet", "Superseded roadmaps", "Held back for now",
  "Phase N of M", "Review on …" / "Review when …", and the "Goal" fallback for
  an unreadable goal title. Moving those is not in the approved correction.
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
2. **No roadmap content has ever been rendered from real data, and the Preview
   cannot change that.** The five ADR-015 functions are revoked, so nothing can
   create a roadmap version or a proposal, and no fixture in the repository
   produces one either. Every assertion about the spine, the milestones and the
   proposal records is made against authored fixtures in the unit tests.

   The product owner has confirmed directly that **their founder account holds
   no pre-M3-11 roadmap data at all.** So the Preview will show the empty state
   and nothing else. Concretely:

   - The 390px acceptance pass exercises the empty state, the masthead, the
     Plan link row, and the navigation back — and nothing else on the surface.
   - **Acceptance criterion 2 is unobservable on the Preview.** An expired
     proposal appearing as history with its state cannot be seen there, because
     there is no expired proposal to see.
   - The spine, the milestone and attention rendering, the superseded-version
     list, the proposal records, and all three proposal sentences therefore
     ship verified by unit fixtures alone.

   **This is the largest gap in the evidence and I could not close it from
   here:** creating the data would require the revoked functions, which is
   M3-15F. It is a fact to decide against, not a hedge — the product owner is
   accepting a surface whose main content they will not have seen rendered.
3. **Both proposal-record sentences are claims this diff cannot enforce.**
   `proposalExpired` — "This proposal can no longer be accepted" — is true by
   construction, because the decision row is terminal and
   `accept_roadmap_proposal` refuses a decided proposal.
   `proposalDecisionUnavailable` — "Deciding on a proposal is not available
   yet" — is true because all five functions are revoked. Neither is enforced
   by anything here; both are asserted in copy. M3-15F is where deciding
   becomes reachable again, and it must retire the second sentence when it
   does, or the screen will keep saying a decision is unavailable after it is
   not. **That is a real trap for the next ticket and the reviewer should
   confirm it is written into M3-15F's brief.** `proposalSuperseded`, added in
   round 2, claims only that a later proposal replaced this one before it was
   decided; that is true of every undecided proposal `open` excludes.
4. **`hasSafetySignal` deliberately applies neither transmission limit, and can
   therefore disagree with a generation's own value.** This surface passes an
   explicit uncapped session count and no byte budget; the AI path passes both
   `TRAINING_HISTORY_MAX_SESSIONS` and a byte sub-budget, either of which trims
   the set the flag is computed over. An owner training a lot will therefore see
   the notice where a generation would not.

   That direction is the correct one and is the point of the difference. Both
   limits bound a paid provider payload and are disclosed to the coach under
   ADR-013 decision 1 so a model that saw a subset does not reason as though it
   saw everything. This read transmits nothing, costs nothing, and has no one to
   disclose a trim to, so applying either would not bound anything — it would
   only decide which reported symptoms the owner is allowed to be reminded of.
   Only the 56-day window is shared, and that is what the brief meant by
   agreeing on "recent".

   Round 1 of review found this the hard way: the first commit inherited the
   session cap by calling the selector with no limits, and because the selector
   sorts newest-first and truncates *before* computing the flag, a symptom
   reported three weeks ago vanished from the screen as soon as twenty later
   sessions were logged — roughly two and a half a week, an ordinary trainee.
   The notice would have gone quiet with nothing on screen to say so. `4ee7565`
   fixes it at the call site; `training-history-context.ts` is unchanged,
   because the constant is right for the AI path and is an ADR-013 tuning
   parameter. The regression test was verified to fail without the fix.
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
8. **The page reads through `createProfileRepository` and
   `createCompletionLog`, beyond the brief's list** of roadmap, goal and memory
   repositories (round 2 reviewer note). Both were disclosed in the first
   handoff and are necessary: the profile supplies the owner's time zone for
   today, and the completion log supplies the 56-day window
   `hasRecentSafetySignal` reads. Both are accepted owner-scoped factories, and
   `allowedRoadmapModules` names them explicitly.
9. **No automated browser or hosted evidence exists for acceptance criteria 1
   and 2** (round 2 reviewer note). Criterion 1's 390px render and criterion
   2's expired record are asserted only in jsdom unit tests; see limitations 1
   and 2.
10. **The open-proposal chip reads "Awaiting your decision" directly above
    "Deciding on a proposal is not available yet."** (round 2 reviewer note).
    The sentence stops the chip being an inert affordance, but the pairing may
    still read as contradictory. That is a product-owner copy call and is not
    changed here; see Copy for the product owner to confirm.
11. **Uncertainty entries render without "Why it matters:" and "Watch for:"**
    (round 3 finding 2). Accepted by the product owner as a limitation; the fix
    is recorded on M3-15F.
12. **Approved M3-02 wordings remain inlined in four roadmap components**
    (round 3 finding 1). The brief's no-inline rule is waived for them in this
    ticket by the product owner; the move is recorded on M3-15F.
13. **`ROADMAP_COPY.reviewPointsHeading` is unused**, because the M3-02 "When
    to reassess" section was folded into the spine's checkpoints (round 3 note).

## Copy for the product owner to confirm

Every user-visible string this ticket introduced, as it stands at `693bd46`.
All are in `ROADMAP_COPY` (`src/server/roadmap/roadmap-records.ts`), with the
error and loading entries spread in from
`src/lib/roadmap/roadmap-route-state-copy.ts`. None is an M3-02 decision.
Confirm or reword each; on the founder account the Preview can show only the
masthead intro and the empty state (known limitation 2).

- `routeIntro` — "Months of direction, not a week of sessions. This is the
  roadmap you have now, every version before it, and what was proposed along
  the way."
- `emptyRoadmapTitle` — "No roadmap yet." (M3-02 used "No roadmap yet" only as
  the masthead stamp, which is unchanged.)
- `emptyRoadmapBody` — "A roadmap is months of direction rather than a week of
  sessions. Once you have one it stays here, with every version before it."
- `supersededRoadmapsSupport` — "Earlier versions stay readable and
  unchanged." (Replaces M3-02's counted "N earlier versions stay readable and
  unchanged.", now that the versions are listed.)
- `versionLabel` — "Version N": M3-02's stamp wording, now also on the current
  roadmap's horizon line and on each superseded version's chip.
- `proposalsHeading` — "Proposals"
- `proposalsSupport` — "What was proposed, and what became of it."
- `proposalStateLabels` — "Awaiting your decision", "Accepted", "Declined",
  "Expired", and, new in round 2, "Superseded".
- `proposalOriginLabels` — "From the coach", "Regenerated", "Your edit".
- `proposalDecisionUnavailable` — "Deciding on a proposal is not available
  yet. This one stays here, unchanged, and nothing happens to it in the
  meantime."
- `proposalExpired` — "This proposal can no longer be accepted. It stays
  here, unchanged, with everything it was built on."
- `proposalSuperseded` (round 2) — "A later proposal replaced this one before
  it was decided. It stays here, unchanged."
- `stateKicker` — "Roadmap" (error and loading states; M3-02 used
  "Plan / roadmap").
- `errorTitle` — "Your roadmap could not be read."
- `errorBody` — "Nothing was lost and nothing was changed. This surface only
  reads, so it is safe to try again."
- `errorRetry` — "Retry" (M3-02's wording).
- `loadingTitle` — "Loading your roadmap."
- `loadingBody` — "Nothing is proposed or changed while this loads."

`memoryCandidatesWaiting` ("N item(s) from a planning note are waiting for
you. …") moved into `ROADMAP_COPY` in round 2 but is M3-02's wording, restored
unchanged, as are `memoryPanelTitle` and `memoryReviewLink`.

## Independent reviewer checklist

Round 3. Review the exact commit `693bd46` on `ticket/m3-15e-roadmap-read`,
over `git diff 899fc1f..693bd46`. Rounds 1 and 2 reviewed `7f0eb24` and
`05ad741`; neither commit nor its preview stands. The round 2 correction range
alone is `git diff 05ad741..693bd46` (the record commit `e9d2367` falls inside
it and changes no application file). Confirm the CI run for `693bd46` is green
and its Vercel Preview reached `READY`. Do not re-run lint, typecheck, the unit
suite, the build, or the browser matrix; CI covers all of them.

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
   tests round 2 restored to `toEqual` assert the whole result, `history`
   included, with expected values written out rather than derived.
   `open` is what M3-15F will accept against, so a change in its meaning here
   would be a defect there.
5. **`RoadmapDecision` gaining `expired`.** Confirm this matches the check
   constraint in `20260814195107_m3_11_legacy_training_reset.sql` and that
   widening it cannot make an expired proposal look acceptable anywhere.
6. **The out-of-brief file, and round 1 finding 1 inside it.** Judge
   `src/server/roadmap/roadmap-safety.ts` on its stated reason: the alternative
   was importing the AI context source into a route. Confirm its mapping is
   faithful to `toTrainingHistoryCompletion` and that nothing it produces is
   serialized or shown. Then confirm the correction: that `NO_SESSION_CAP`
   genuinely disables the count trim in `selectTrainingHistoryContext` rather
   than merely raising it somewhere the byte path could still trim; that the
   56-day window is still M3-15D's and was not forked; that nothing in
   `training-history-context.ts` changed; and that the new test fails without
   the fix. Known limitation 4 records where this surface can now legitimately
   disagree with a generation, and why that direction is the correct one.
7. **Round 1 finding 2, and the two new strings.** Confirm the open branch's
   sentence removes the inert affordance rather than restating it, that both
   sentences come from `ROADMAP_COPY` and neither is inlined, and that no
   approved M3-02 wording was altered while `proposalExpired` was moved there.
   Both strings are new and user-visible; flag them to the product owner as a
   copy decision, not as an implementation detail. Known limitation 3 records
   that M3-15F must retire `proposalDecisionUnavailable` when deciding becomes
   possible.
8. **Round 2 finding 1: superseded proposals.** Confirm that only the proposal
   whose id equals `openProposal`'s reads `open`; that every other undecided
   proposal reads `superseded` with no summary and no control; that a decided
   proposal keeps its own state regardless; and that the corrected
   `proposalHistory` doc comment claims nothing the repository does not do.
   Judge whether "A later proposal replaced this one before it was decided." is
   true for every undecided proposal `getReviewProposals` excludes from `open`.
9. **Round 2 finding 2: copy.** Confirm no string this ticket introduced
   remains inlined in the route or `src/components/roadmap`, that every moved
   wording is byte-identical to what it replaced, and that the remaining
   literals listed under Project skills applied are M3-02's at `e370dbe~1`.
   Confirm `src/lib/roadmap/roadmap-route-state-copy.ts` imports nothing, that
   `error.tsx` imports nothing under `@/server/**`, and that spreading it into
   `ROADMAP_COPY` cannot shadow an existing key.
10. **The Plan link.** Judge whether adding an entry point belongs in this
    ticket. It is `7f0eb24` alone and reverts cleanly.
11. **Honest states.** Confirm the empty state, `error.tsx`, `loading.tsx`,
    and the expired and superseded sentences each say a different true thing,
    that none invents a training fact or a capability that does not exist, and
    that the empty state does not imply a roadmap can be generated today.
12. **Product invariants.** Confirm nothing totals, scores, ranks, streaks or
    charts; that goal attention is rendered as an ordinal level and never as a
    share; that the safety notice is the server-owned copy and nothing near it
    assesses a symptom; and that no preserved record is rewritten.
13. **Scope.** Confirm nothing outside the brief changed beyond the items
    called out under Changed files (the Plan link, `roadmap-safety.ts`, and
    round 2's `src/lib/roadmap/roadmap-route-state-copy.ts`), and that the
    `e2e/m3-11-maintenance.spec.ts` edit is the minimum needed to stop it
    asserting a stub on a reopened route.

## Acceptance

**Accepted by the product owner on 15 September 2026**, against the
independently reviewed `693bd46d1e37776d12628f87648367666be0878c` and its
Vercel Preview at https://fittip-4qbp0vqju-mattis-3657s-projects.vercel.app
(deployed for the record-only `e5f4c37` on top of it). The acceptance includes
the copy listed under *Copy for the product owner to confirm*, the product
owner's waiver of the no-inline rule recorded under *Round 3 review*, and known
limitations 11–13, whose fixes are carried on M3-15F.

**Hosted read, attested by the product owner.** Limitation 2 expected the
Preview to hold no roadmap data. It did: the product owner found a roadmap they
had generated earlier and reviewed it on the Preview, reporting that it all
looks good. So the authenticated hosted read path — the current roadmap on the
founder Supabase project, under RLS — was exercised on real data, not only the
empty state. This is the product owner's attestation; the lead cannot reach the
hosted database or pass Vercel deployment protection.

| Step | Result |
| --- | --- |
| Merge to `master` | `3570c252a55772eef9858fccc1df7c2f21c4bda4`, a `--no-ff` merge of the ticket branch at `d2882ff` |
| `master` continuous integration | [34961870036](https://github.com/mattiss01/fittip/actions/runs/34961870036) — success |
| Founder deployment | `6457463933`, Production, state `success`, https://fittip-kay0pm5kk-mattis-3657s-projects.vercel.app |
| Hosted database migration | Not applicable — nothing under `supabase/` changed |

**The lead's hosted smoke is limited to the protection boundary.** An
unauthenticated request to `/home/plan/roadmap` on the founder deployment is
answered `302` to `vercel.com/sso-api` before the application runs, as with
M3-15D. That is evidence about Vercel, not FitTip. The route's behaviour on the
merged code is carried by the green `master` run above and the product owner's
authenticated Preview pass on the identical application tree.
