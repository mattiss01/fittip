# M3-15F validation: roadmap generation, acceptance, and privilege re-grant

**Ticket:** [M3-15F](../../backlog/M3/M3-15F-ROADMAP-GENERATION.md)
**Status:** in development. Builder handoff complete. Still outstanding:
independent review, the continuous-integration run for the reviewed SHA, the
hosted founder apply, the Vercel Preview pass, and product-owner acceptance.
**Tier:** 1
**Branch:** `ticket/m3-15f-roadmap-generation`
**Base:** `45acd9b`
**Implementation review target:** `68958dad9d0610ca7d0b05ef174b67920f98a324`
(`68958da`). This is the last source commit. The commit that adds this record
and the four evidence images changes no application file, which is the
evidence-commit exception in `AGENTS.md`.
**Review range:** `git diff 45acd9b..68958da`

Implementation commits, in order:

| Commit    | Purpose                                                                     |
| --------- | --------------------------------------------------------------------------- |
| `ef74712` | Migration: the five grants, the M3-09 fix, and a working acceptance body.    |
| `a507e33` | Concurrency harness that reproduces M3-09 and proves the fix.                |
| `b9b321d` | Write surface, example label, and the two copy defects M3-15E deferred.      |
| `0874a94` | Unit tests for generation, the actions, and the provenance read.             |
| `51e4cc9` | CI wiring for the harness and the 390px flow (tooling only).                 |
| `8dfbbdd` | Edit moved to a form action; Playwright config and spec. **Insufficient.**   |
| `c953e11` | Successful writes redirect. **Insufficient.**                                |
| `7630b4f` | Decision dock keyed by proposal. **Insufficient.**                           |
| `f83f213` | Edit awaited directly, then a document reload. **Worked for the edit.**      |
| `68958da` | All four writes go through `useRoadmapWrite`. **Flow passes, 3 of 3 runs.**  |

Commits `8dfbbdd` through `68958da` are one defect and the attempts to fix it.
They are kept as history rather than squashed, because the record of what did
not work is what justifies the final design. See *The defect the browser flow
found*.

## Delivered behavior

An owner can now do all of the following from `/home/plan/roadmap` at 390px:

- **Generate** a roadmap proposal for a horizon of four to fifty-two weeks,
  with an optional planning note.
- **Read** the whole proposal: the spine, the assumptions, the uncertainties,
  and anything the coach held back. It sits above the roadmap it would replace,
  and that roadmap stays unchanged until the owner accepts.
- **Edit** the proposal. This creates a new proposal; the source stays in
  history exactly as it was written.
- **Decline** the proposal after a confirmation. It stays in history and never
  becomes current.
- **Regenerate** from the declined proposal with feedback, within the existing
  limit of three regenerations per horizon.
- **Accept** the proposal. It becomes the current roadmap, and every earlier
  version stays readable under *Superseded roadmaps*.

No provider credential is configured, so the built-in example coach answers and
nothing is spent. Everything it writes is labelled **Example** wherever it
appears: on the open proposal, the current roadmap, every superseded version,
and every proposal record. The open proposal also carries a sentence explaining
what the label means. The label is read from the stored `provider_code`, so a
roadmap written by a real coach carries no label.

After a write lands, the page reloads and shows the result. There is no success
sentence; the reload shows what changed. A refused write stays on screen and
says why, and whatever the owner typed is kept.

The two copy defects M3-15E deferred are fixed:

- Uncertainty entries show their "Why it matters:" and "Watch for:" labels
  again.
- The M3-02 wordings still written inside `page.tsx`, `roadmap-screen.tsx`,
  `roadmap-detail.tsx` and `roadmap-spine.tsx` now come from `ROADMAP_COPY`,
  unchanged.

## Mobile demo path

These steps run against the local stack at `390x844`. The hosted pass is the
product owner's, on the Vercel Preview.

```bash
npx.cmd supabase start
npx.cmd supabase db reset --local
# NEXT_PUBLIC_* values are inlined at build time, so export them before building.
npm.cmd run build
npm.cmd run start -- -p 3026
```

1. Sign in, open **Plan**, and confirm the offered time zone. The coach reads
   the owner's weeks from it and refuses to generate without one.
2. Open **You → Manage goals** and create one active core goal.
3. Open **Plan → roadmap**. The screen says there is no roadmap yet and offers
   **Shape your roadmap**.
4. Write a planning note and press **Generate roadmap proposal**. The page
   reloads. The proposal sits above the still-empty roadmap, marked **Example**
   and *Awaiting your decision*.
5. Press **Edit proposal**, change the roadmap title, and press **Save as a new
   proposal**. The review shows the new title. The proposal it came from is
   listed under *Proposals* as **Superseded**.
6. Press **Decline proposal** and confirm. The proposal shows as **Declined**,
   and **Ask for another proposal** appears. Its dates are fixed, feedback is
   required, and it reads *3 regenerations left*. The count is three because
   the declined proposal is an edit, and an edit shares the generation request
   of the proposal it came from.
7. Write feedback, press **Generate another proposal**, then press **Accept
   roadmap**. The roadmap becomes *Version 1*.
8. Generate and accept once more. The masthead reads *Version 2*, and
   *Superseded roadmaps* lists *Version 1*.

The same steps run unattended with
`npx.cmd playwright test --config=e2e/m3-15f.playwright.config.ts` on port 3026.
That run needs `SUPABASE_SERVICE_ROLE_KEY` and **silently skips itself without
it**, so read the skipped count before calling a run green.

## Changed files

`git diff --stat 45acd9b..68958da`:

```
 .github/workflows/ci.yml                           |  13 +
 .../M3/evidence/M3-15F-compose-390x844.png         | Bin 0 -> 63893 bytes
 .../M3/evidence/M3-15F-proposal-390x844.png        | Bin 0 -> 189834 bytes
 e2e/m3-15f-roadmap.spec.ts                         | 311 +++++++++
 e2e/m3-15f.playwright.config.ts                    |  31 +
 package.json                                       |   1 +
 src/app/home/plan/roadmap/action-state.ts          |  60 ++
 src/app/home/plan/roadmap/actions.test.ts          | 562 +++++++++++++++++
 src/app/home/plan/roadmap/actions.ts               | 398 ++++++++++++
 src/app/home/plan/roadmap/page.test.tsx            | 201 +++++-
 src/app/home/plan/roadmap/page.tsx                 |  40 +-
 src/app/home/plan/roadmap/roadmap.module.css       | 213 +++++++
 src/architecture/m3-11-legacy-reset.test.ts        | 111 +++-
 src/components/roadmap/roadmap-body.tsx            | 131 ++++
 src/components/roadmap/roadmap-composer.tsx        | 222 +++++++
 src/components/roadmap/roadmap-decision-dock.tsx   | 148 +++++
 src/components/roadmap/roadmap-detail.tsx          |  75 +--
 src/components/roadmap/roadmap-editor.tsx          | 385 ++++++++++++
 .../roadmap/roadmap-proposal-record.test.tsx       |  29 +-
 src/components/roadmap/roadmap-proposal-record.tsx |  34 +-
 src/components/roadmap/roadmap-proposal-review.tsx |  80 +++
 src/components/roadmap/roadmap-screen.tsx          |  83 ++-
 src/components/roadmap/roadmap-spine.tsx           |   6 +-
 src/components/roadmap/use-roadmap-write.ts        |  96 +++
 src/lib/roadmap/roadmap-control-copy.ts            | 173 +++++
 src/server/repositories/roadmap-repository.test.ts |  83 +++
 src/server/repositories/roadmap-repository.ts      |  35 +-
 src/server/roadmap/roadmap-generation.test.ts      | 271 ++++++++
 src/server/roadmap/roadmap-generation.ts           | 255 ++++++++
 src/server/roadmap/roadmap-records.ts              | 131 ++--
 .../20260916075522_m3_15f_roadmap_generation.sql   | 582 +++++++++++++++++
 .../database/m3_11_legacy_training_reset.test.sql  | 137 +---
 .../database/m3_15f_roadmap_generation.test.sql    | 699 +++++++++++++++++++++
 .../integration/m3_15f_concurrent_generation.mjs   | 291 +++++++++
 34 files changed, 5541 insertions(+), 346 deletions(-)
```

Nothing was deleted or renamed. The two images in the range come from an early,
failing run. The record commit replaces them and adds `M3-15F-accepted` and
`M3-15F-history`, all four from the passing run.

These files have a purpose that the path and diff do not make obvious:

- `src/components/roadmap/use-roadmap-write.ts` submits all four roadmap
  writes. It awaits the action from the submit handler, outside any transition.
  If the write landed, it reloads the document; if not, it returns the refusal.
  The file's header comment records the browser evidence behind this design,
  and the defect section below repeats it.
- `src/lib/roadmap/roadmap-control-copy.ts` holds every roadmap wording that a
  Client Component renders. `src/architecture/server-boundary.test.ts` forbids a
  `"use client"` file from importing `@/server/**`, and the compose form, the
  decision dock and the editor all hold state, so their strings cannot live in
  `ROADMAP_COPY` directly. `ROADMAP_COPY` spreads this module in, just as it
  already does for `ROADMAP_ROUTE_STATE_COPY`, so every roadmap string is still
  reachable from that one constant. Most of the content is M3-02's, unchanged.
  The refusal outcomes are new, because M3-11 deleted the module that held them.
- `src/server/roadmap/roadmap-generation.ts` runs ADR-015's four steps in
  order: claim the request durably, call the coach outside any transaction,
  persist the validated proposal, then create memory candidates in a separate
  transaction. That last transaction can fail without invalidating the roadmap.
  This is **not** the deleted `roadmap-service.ts` restored. The context comes
  from M3-15D's `OwnedRecordsCoachAIContextSource` through the composition root,
  so nothing here reads a repository to build a coaching request, and nothing
  here receives one that would allow it.
- `src/components/roadmap/roadmap-body.tsx` renders one roadmap end to end, for
  both the accepted version and the open proposal. They are the same document at
  two moments, and showing a proposal in less detail than the version it would
  become would ask the owner to decide on less than what gets written. It also
  exports `ExampleTag`, the only place that checks for `fixture`.
- `src/components/roadmap/roadmap-proposal-review.tsx` renders the open proposal
  in full, with the decision dock. It is a Server Component rendering a client
  dock, so the only roadmap content sent to the browser is the body the editor
  needs. The dock is keyed by proposal id, which `7630b4f` added. That key did
  not fix the defect, but it is correct and is kept: a dock belongs to one
  proposal.
- `src/app/home/plan/roadmap/action-state.ts` holds the action result type and
  its initial value. It is separate from `actions.ts` because a `use server`
  module may export only async functions, and the client components need both.
- `supabase/tests/database/m3_11_legacy_training_reset.test.sql` loses sixteen
  roadmap assertions: the fifteen privilege assertions and the check that
  acceptance names no legacy relation. Those were M3-11's statement of a
  boundary that M3-15F deliberately changes. The whole set moved to
  `m3_15f_roadmap_generation.test.sql` rather than being split across two files.
  `plan(49)` becomes `plan(33)`, and everything M3-11 permanently established
  stays.
- `src/architecture/m3-11-legacy-reset.test.ts` carries the deliberate
  invariant change. See *The invariant that changed*.

## Data, migration, API, privacy, and security effects

### The migration, exactly

The migration is
`supabase/migrations/20260916075522_m3_15f_roadmap_generation.sql`. It changes
no table, column, constraint, index, policy, table grant, type, or RPC
signature. It does three things.

**1. It replaces `begin_roadmap_generation` to fix M3-09.** The function reads
`roadmap_generation_requests` for the caller's key before it takes the
per-owner advisory lock. That order is correct, because a replay must not wait
behind an unrelated generation, but it leaves a window:

1. Two callers with the same key both read "not found".
2. They serialize on the lock. The winner inserts and commits.
3. The loser hits `roadmap_generation_requests_key_key`.

That `unique_violation` escaped unmapped. The repository reported a persistence
failure, so the owner was told their generation had failed while the generation
from their other tab was running normally.

The insert now has an exception block that treats the collision as a replay.
It re-reads the committed row, compares the fingerprint the same way the
sequential replay path does, and returns the stored receipt. Three properties
are preserved on purpose:

- The stored status on this path can only be `pending`. It never reports
  `claimed`, so it never authorizes a second coaching call.
- A different fingerprint is still a `PT409` conflict. A reused key with
  different input cannot silently replay someone else's question.
- A unique violation on anything other than this key is re-raised untouched,
  because nothing about it is understood.

**2. It gives `accept_roadmap_proposal` a working body again.** M3-11 had
replaced this function with a stub that raises `42501`, because the original
body named `detailed_plan_heads` and `completion_heads`, which M3-11 dropped.
M3-11 also recorded the intent that M3-15 would replace the implementation.
Re-granting `execute` on a function that refuses every call would deliver
nothing, so the grant and the new body are one change.

The rest of M3-02's logic is unchanged: the advisory lock, the acceptance
replay, the goal and memory rechecks, the head compare-and-set, the version
insert, and the append-only decision. Two source kinds differ:

- A `completion` source is rechecked against M3-15A's `public.completions` by
  `id` and `revision`. Those are exactly the values
  `OwnedRecordsCoachAIContextSource` records as a source. `revision_id` is not
  compared: the new model has no per-revision row to name, and `revision`
  already changes on every correction.
- A `plan_version` source is **refused**. Nothing writes that source kind any
  more, and M3-11 marked every stored proposal that carries one as `expired`,
  so no undecided proposal can reach this branch. The branch refuses rather
  than being removed, because a source this function cannot verify must never
  be treated as verified.

**3. It restores the privilege boundary M3-02 set.** `execute` on all five
functions goes to `authenticated` and to nobody else. Each grant comes after a
full revoke from `public, anon, authenticated, service_role`, so the final ACL
is stated rather than inherited. This matters because `public` gets `execute`
on a replaced function by default, and the two `create or replace` statements
above would otherwise have restored that silently.

| Function                           | `public` | `anon` | `authenticated` | `service_role` |
| ---------------------------------- | -------- | ------ | --------------- | -------------- |
| `begin_roadmap_generation`         | —        | —      | `EXECUTE`       | —              |
| `finish_roadmap_generation`        | —        | —      | `EXECUTE`       | —              |
| `record_roadmap_memory_candidates` | —        | —      | `EXECUTE`       | —              |
| `apply_roadmap_proposal_change`    | —        | —      | `EXECUTE`       | —              |
| `accept_roadmap_proposal`          | —        | —      | `EXECUTE`       | —              |

All five remain `SECURITY DEFINER` with `search_path = ''`, which is what makes
`execute` the whole boundary. `m3_15f_roadmap_generation.test.sql` asserts
that. It reads the ACL from `information_schema.role_routine_grants` rather
than through `has_function_privilege`, because that function reports a role's
effective privilege, and a stray `public` grant would make every role report
true.

### Generated types

`src/lib/supabase/database.types.ts` is **unchanged**, which is the expected
result: no signature, table, or column moved. This was verified by running the
README sequence against a clean reset (generate, format, `types:patch`) and
diffing the output against the committed file. They are byte-identical, and
the patch script reported that the file needs no post-generation patch.

### Authorization and ownership

- Every write goes through `createRoadmapRepository()`, and therefore through
  one of the five `SECURITY DEFINER` functions. There is no new SQL, no `.rpc(`
  call outside the repository, and no owner id passed in by a caller; none of
  the five functions accepts one. `src/architecture/m3-11-legacy-reset.test.ts`
  asserts all of this.
- Each Server Action derives the owner again from verified Auth claims and
  invalidates `/home/plan/roadmap`.
- The owner's "today" comes from their confirmed time zone, not from a hidden
  form field. A wrong or hostile value therefore cannot move the horizon that
  every later check is measured against. This is a deliberate change from the
  pre-M3-11 action, which took `today` from the browser.
- `expectedHeadRevision` *is* a form field on the accept path. A tampered value
  can only be stale: the database compares it against the real head under a
  lock and refuses a mismatch. The worst it can do is refuse the tamperer's own
  acceptance.
- Both views read `provider_code` from the stored row. A version has no
  provider column of its own, so its provider is read through
  `source_proposal_id`, under the owner `SELECT` policy on `roadmap_proposals`
  like any other proposal read. If that read fails, the value becomes the empty
  string, never `"fixture"`. Labelling a coach-written roadmap an example is the
  one error the label itself could introduce.

### Privacy and what reaches the browser

- The only roadmap content sent to the browser is the open proposal's
  `content`, which the editor needs. The owner's planning note is a separate
  column and never leaves the server. Everything else on the surface is
  server-rendered: the spine, the history, and the example label.
- No refusal on this surface includes a provider message, a database message,
  or the owner's own text. Even `CoachAIError`'s user-safe copy is not passed
  through as-is; the owner reads the roadmap's own wording.
- The request fingerprint carries the *lengths* of the planning note and the
  feedback, never their content, because a hash of the content would leak
  information through comparison. `roadmap-generation.test.ts` asserts this.
- The browser stores nothing. No file in this diff writes `localStorage`,
  `sessionStorage`, or a cookie.

### Spend

None, in any environment. This diff does not touch `FITTIP_AI_LIVE`,
`src/server/ai/enablement.ts`, the owner allowlist, the rate cards, or the
model bindings. `roadmap-generation.ts` reads no flag and does not branch on
the result: it asks the composition root for a service and records whichever
provider and model the resolved binding names. Without live enablement, that
is `FixtureCoachAI`. If the recorded provider, model, and rate-card combination
is ever not an approved one, `roadmap_technical_codes_are_accepted` refuses it
in the database. No live provider call was made at any point during this
ticket.

## The defect the browser flow found

This section is recorded in full for three reasons: the unit tests could not
have caught the defect, three fixes were committed before one worked, and the
final design depends on the evidence.

**What was seen.** In `b9b321d`, the browser flow failed right after an edit.
The edit had committed: the dock showed its success sentence, and the memory
candidate panel appeared. But the review still showed the proposal the edit
came from, and *Proposals* still listed one proposal where there were now two.

**Instrumentation showed the server was right every time.**

- Every write committed.
- Reloading the page always showed the correct state immediately.
- With redirects in place, the trace shows the server answering both the
  generation and the edit with `303` and
  `x-action-redirect: /home/plan/roadmap;push`.

The failure was always on the client. The page kept the submitting control
disabled with its submission pending, and polling without a reload for up to
45 seconds, the page never updated.

**What was tried, and what happened:**

| Commit    | Attempt                                                      | Result                                                            |
| --------- | ------------------------------------------------------------ | ----------------------------------------------------------------- |
| `b9b321d` | Edit called inside `useTransition`, then `router.refresh()`  | Promise resolved; page never updated                              |
| `8dfbbdd` | Edit as a form action, like accept and decline               | Pending never cleared; generation also failed on some runs        |
| `c953e11` | Every successful write redirects to the route                | Generation passed; the edit still hung                            |
| (none)    | `useActionState` moved into the editor                       | No change                                                         |
| `7630b4f` | Decision dock keyed by proposal id                           | No change                                                         |
| (none)    | Wait for network idle plus 3 s before editing                | No change                                                         |
| `f83f213` | Edit awaited directly, then a document reload                | Edit and decline passed; the regeneration after them hung         |
| `68958da` | All four writes submitted the way `f83f213` submits the edit | **Passed 3 of 3 runs**                                            |

**The pattern.** After the redirect change, every run behaved the same way.
The first same-route redirect after a document load landed, and the next one
hung:

- goto → generate ✓ → edit ✗
- goto → generate ✓ → edit with reload ✓ → decline ✓ → regenerate ✗

This is Next.js App Router behaviour on this route, not a data defect.

**The fix.** Two things were each proven to work, and `useRoadmapWrite` does
exactly those two:

1. It awaits the action directly from the submit handler, outside any
   transition. That promise resolved reliably in every attempt, including the
   first.
2. When the write landed, it loads the document again. A full reload cannot be
   served a stale tree or left mid-transition.

The actions return `proposal`, `accepted`, `declined` or `edited`, and still
invalidate the route. None of them redirects, and `actions.test.ts` asserts
that. A refusal renders in place with whatever the owner typed.

**What it costs.**

- There is a full document load after each write, on a route that is already
  dynamic, private, and read in one owner-scoped pass.
- The four approved success sentences are gone. They were removed from
  `ROADMAP_CONTROL_COPY` rather than left orphaned. Every one of these writes
  visibly changes the screen, so nothing about what happened goes unsaid, but
  this is still a reduction against the ticket's copy. It is listed as a known
  limitation below.
- The root cause inside Next.js is not identified. See the known limitations.

## The invariant that changed

`src/architecture/m3-11-legacy-reset.test.ts` asserted that the reopened
roadmap surface reaches no revoked function, declares no action, and
invalidates nothing. That was M3-15E's boundary. M3-15F changes it deliberately,
and only for `src/app/home/plan/roadmap/actions.ts`. `plan/proposal/page.tsx`
stays on the maintenance stub, because that route is M3-16.

The replacement is stricter than simply removing the old checks. It asserts
that:

- no file on the surface, including `actions.ts`, names one of the five
  functions or calls `.rpc(` directly. The repository is the only application
  path to them and the only place that maps their conflicts.
- any file that calls a roadmap write method is `actions.ts`. A component cannot
  reach a write and bypass the module that re-derives the owner.
- `actions.ts` declares `"use server"` and invalidates `/home/plan/roadmap`, so a
  write cannot leave the owner reading a stale roadmap.
- no other non-test file on the surface declares an action or invalidates the
  route.
- exactly one write entry point exists.

`actions.ts` also joins the route's import allowlist, extended only with the
coaching and roadmap domain modules it needs. This is an allowlist rather than a
pattern, so the surface cannot reach a provider adapter, a spend ledger, a
Supabase client, or a plan or training repository.

## Tests and final results

The builder does not push, so **there is no continuous-integration run for
`68958da` yet**. The lead pushes this branch. The run URL and conclusion for the
exact reviewed SHA belong in this section and are not yet available. That run is
the automated evidence for lint, typecheck, `test:run`, `build`, the migration,
lint, advisor and pgTAP checks, both concurrency harnesses, and the 390px browser
flows.

These checks were run locally during implementation, with these results:

| Command or check                                                                                                                                   | Result                                                                                                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm.cmd run typecheck`                                                                                                                            | Pass                                                                                                                                                                                                                  |
| `npm.cmd run lint`                                                                                                                                 | Pass                                                                                                                                                                                                                  |
| `npm.cmd run build`                                                                                                                                | Pass                                                                                                                                                                                                                  |
| `npm.cmd run test:run -- src/app/home/plan/roadmap src/components/roadmap src/architecture src/server/roadmap src/server/repositories/roadmap-repository.test.ts` | 10 files, 96 tests, pass                                                                                                                                                                                              |
| `npx.cmd supabase db reset --local`                                                                                                                | Every migration applied from zero                                                                                                                                                                                     |
| `npx.cmd supabase db lint --local --level warning --fail-on warning`                                                                               | "No schema errors found"                                                                                                                                                                                              |
| `npx.cmd supabase db advisors --local --type all --level warn --fail-on warn`                                                                      | "No issues found"                                                                                                                                                                                                     |
| `npx.cmd supabase test db --local supabase/tests/database`                                                                                         | 14 files, 884 tests, all pass                                                                                                                                                                                         |
| `node supabase/tests/integration/m3_15f_concurrent_generation.mjs`                                                                                 | `{"result":"PASS","defect":"M3-09","rounds":6,"callersPerRound":4,"claimedPerRound":1,"replayedPerRound":3,"roundsWhereAReplayOutlastedTheClaim":6,"reusedKeyRefusedCode":"PT409"}`                                |
| The same harness against M3-02's original `begin_roadmap_generation`                                                                               | Fails in round 1 with `23505 duplicate key value violates unique constraint "roadmap_generation_requests_key_key"`, which is the defect                                                                               |
| Committed types compared with a clean regeneration                                                                                                 | Byte-identical; no schema-visible change                                                                                                                                                                              |
| `npx.cmd playwright test --config=e2e/m3-15f.playwright.config.ts` (port 3026), against `68958da`                                                  | **1 passed**, then with `--repeat-each=2` **2 passed**; 0 skipped, 0 failed                                                                                                                                           |
| The same flow against `b9b321d` through `f83f213`                                                                                                  | Failed each time, as described in *The defect the browser flow found*                                                                                                                                                 |
| `git diff --check`                                                                                                                                 | Clean                                                                                                                                                                                                                 |

The local Supabase and Playwright runs above were for development and debugging;
the handoff evidence is the continuous-integration run for the reviewed SHA.
Two of these results are still worth reading as evidence:

- The negative control on the concurrency harness. Running it against M3-02's
  original function reproduces M3-09 in the first round, which shows the harness
  tests the fix rather than the scheduler.
- Three consecutive passes of the browser flow after five configurations that
  failed.

### Project-skill rules applied

**`schema-change`:**

- One forward migration, created with the pinned CLI. No applied migration was
  edited.
- Verified from zero with `db reset`, `db lint`, `db advisors` and the pgTAP
  suite. All four passed on a clean reset.
- pgTAP asserts the actual privileges and the definer and `search_path`
  settings. It tests owner, anonymous and cross-owner calls against each
  function directly, not only through table RLS.
- The concurrency invariant is tested with genuinely simultaneous calls in which
  one must lose.
- The committed types were regenerated through the README sequence.

**`vercel-react-best-practices`.** These rules changed a decision here:

- `server-serialization`: three components are client components, and the only
  roadmap content they receive is the open proposal's body, which the editor
  cannot work without. The spine, the history and the labels stay on the server.
- `server-auth-actions`: every action authenticates first and derives the owner
  from verified claims. A Server Action is treated as a public endpoint.
- `async-parallel`: the compose action issues its owner, repository and profile
  reads together, not one after another.
- `async-cheap-condition-before-await`: `generateRoadmapProposal` claims the
  request before it builds any context, so a replay costs one statement and no
  reads.
- `rendering-conditional-render`: ternaries throughout, never `&&`.
- `rerender-lazy-state-init`: the editor copies the draft through a lazy
  initializer, so abandoning an edit leaves the proposal under review untouched.
- `rendering-usetransition-loading` was **deliberately not followed**. The
  browser evidence above shows that transition-wrapped and form-action
  submission did not reliably resolve on this route. `useRoadmapWrite` keeps a
  plain `saving` flag instead.

**`frontend-design`:**

- The surface keeps M3-02's surveyed route line as its signature, and the new
  controls stay quiet around it: hairline rules, the band colour, monospace
  labels in the same register as the existing state chips, square corners, and
  one filled primary button.
- The only colour spent is the existing checkpoint terracotta, reused for the
  example tag. That tag is the one piece of metadata that changes how the words
  under it should be read, so it shares a visual class with "Awaiting your
  decision" instead of getting a new one.
- No meter, percentage or confidence badge was added.
- Visible focus rings, a reduced-motion path, 44px touch targets and the 390px
  gutter are preserved. The browser flow asserts no horizontal overflow at four
  points.
- Copy is factual and names what each control does. The decision dock states
  what accepting and declining each keep, rather than issuing a warning.

**`validation-record`:** this file, plus its entry in
`docs/validation/README.md`.

## Hosted evidence: the commands only

The builder cannot apply the migration or reach the founder database, and must
not try. ADR-007 gates the founder project. The project ref is the product
owner's to supply and is deliberately not written anywhere in this repository.
On 16 September 2026 the product owner asked for the fewest possible terminal
commands and no SQL verification. This ticket therefore ships **no script, no
runbook, and no verification queries**.

The product owner runs exactly these commands from Git Bash at the repository
root:

```bash
npx.cmd supabase link --project-ref <founder project ref>   # only if not already linked
npx.cmd supabase db push --linked
npx.cmd supabase db advisors --linked --type security --level warn
```

- `db push --linked` applies `20260916075522_m3_15f_roadmap_generation.sql` in
  timestamp order. Its own output is the apply evidence: it lists the migration
  versions it is about to apply, and a clean exit means those versions are now
  in remote history. Paste that output here.
- `db advisors --linked --type security --level warn` is the security evidence.
  Locally it reports "No issues found". Any other result on the founder project
  is a blocker, not a note. Paste that output here.
- The authenticated hosted read is the product owner's own pass on the Preview:
  signing in and opening `/home/plan/roadmap`. It is not a query.

**Known limitation, in the brief's words:** the privilege boundary is proven by
the pgTAP suite in continuous integration instead of against the hosted
database. This is narrower than the hosted verification `AGENTS.md` asks for.
Remote migration history, the schema and privilege boundary, and the
authenticated read are no longer checked against the founder database by query.
Instead they rest on `db push`'s own output, the security advisors, the pgTAP
suite in continuous integration, and the product owner's pass on the Preview.
The product owner chose this narrowing deliberately, and it is recorded on the
ticket; it is not an omission.

## Known limitations

1. **The privilege boundary is proven by the pgTAP suite in continuous
   integration instead of against the hosted database.** *Hosted evidence*
   above describes what that narrows and what covers it instead.
2. **After each successful write the page reloads, and there is no success
   sentence.** The four approved success sentences were removed. Every write
   visibly changes the screen, but this is still a reduction against the
   ticket's copy, and it is the product owner's decision whether to accept it.
   *The defect the browser flow found* explains why.
3. **The root cause inside Next.js is not identified.** The evidence
   establishes the pattern (the first same-route action redirect after a
   document load lands, the next hangs) and establishes that a direct await
   plus a document reload avoids it. It does not establish why the router
   behaves this way. If a later Next.js version fixes the behaviour,
   `useRoadmapWrite` is the one place to change back. The other surfaces in
   this application submit Server Actions differently and were not
   investigated here.
4. **The failure was intermittent before the fix.** One run of an earlier
   configuration passed generation and failed on the next write, and one failed
   on the first generation. Three consecutive passes against `68958da` are good
   evidence, not proof. The CI run adds a fourth run on a different machine.
5. **No live provider call was made in any environment.** Generation used the
   fixture coach throughout. Whether a real coach would propose anything like
   what the surface shows is unanswered by this ticket, and trying it is a
   separate spend decision.
6. **A fixture generation writes a canned roadmap into permanent history.** The
   product owner chose visible, working controls over hidden ones, knowing this.
   The example label is the mitigation, and it rests entirely on the stored
   `provider_code`.
7. **An owner's edit of an example is still labelled an example.**
   `apply_roadmap_proposal_change` copies the source's provider code onto the
   edit. That is what the database records and what the brief requires, but an
   owner who rewrote every sentence would still see the label.
8. **The compose form is hidden while a proposal is open.** This is not an
   environment gate. A second concurrent request would create a second proposal
   for the same horizon, and the repository would have to pick one of them to
   call open. The order is decide, then ask again. The database enforces that
   order by refusing a regeneration whose predecessor has not been declined.
9. **There is no context summary.** `contextSummaryLabel`,
   `contextSummaryHelper`, `contextEmptyGroup`, `createAction` and
   `proposeAction` in `ROADMAP_COPY` are still unused, as they were before this
   ticket. M3-02's disclosure listed exact counts of goals, memory items and
   recent sessions. This route reads goals and completions but not memory, and
   adding a read only to fill a disclosure was out of scope. A disclosure with
   vague counts would be less honest than none. The brief named only
   `reviewPointsHeading`, which was removed.
10. **`reviewPointsHeading` was removed rather than used.** M3-02 marked review
    points on the spine and also listed them again under "When to reassess".
    M3-15E's spine places each review point where it falls and deliberately
    dropped the separate list. Restoring the list would repeat content the spine
    already shows in the right place, so the unused string was removed.
11. **`plan_version` sources always fail acceptance.** No such proposal can be
    undecided today, because M3-11 expired all of them, so no owner can reach
    this refusal. If one ever existed, its owner would be told their plan
    changed and would have no way to accept it.
12. **The 390px visual pass is the product owner's.** The browser flow asserts
    that the page does not overflow horizontally and that every control is
    present and reachable. It cannot judge whether the surface looks or feels
    right. In the full-page evidence images, the fixed primary navigation
    appears mid-page. That is how a full-page screenshot captures a fixed
    element; it is not a layout defect.
13. **The decline confirmation is `window.confirm`.** It matches the
    surrounding surfaces and works from the keyboard, but it is unstyled, and it
    is the one part of this surface that does not look like FitTip.

## Independent reviewer checklist

Review `68958dad9d0610ca7d0b05ef174b67920f98a324`, using
`git diff 45acd9b..68958da`. Confirm that the continuous-integration run for
that exact SHA is green and that the matching Vercel Preview reached `READY`.
Do not re-run lint, typecheck, `test:run`, `build` or the browser flow; the CI
run covers them.

These need judgment that CI cannot supply:

1. **The migration is the whole Tier 1 surface.** Read
   `20260916075522_m3_15f_roadmap_generation.sql` against
   `20260810213904_m3_02_roadmap_proposals.sql:674-911` and `:1599-1829`.
   - Is `begin_roadmap_generation` identical to M3-02's above the insert?
   - Does the new exception block keep the distinction between `claimed` and
     `pending` and keep the fingerprint conflict?
   - Is `accept_roadmap_proposal` otherwise M3-02's, with only the two
     source-kind branches changed?
   - Is `execute` granted to `authenticated` and nobody else?
2. **Two function bodies were replaced, which the brief's wording does not
   literally cover.** The brief says "no other schema change". Judge whether
   replacing the M3-11 stub in `accept_roadmap_proposal` is required by the
   ticket's own Tier line ("replaces an accepted function body") and by
   acceptance criterion 1, or is scope that should have been raised first.
3. **`useRoadmapWrite` and the document reload.** Read the table in *The defect
   the browser flow found* and the commits it cites. Then check the following.
   - Does the evidence support the design?
   - Is any refusal path lost, meaning a status that reloads when it should
     render?
   - Is `saving` held until the reload, so a second press cannot start a second
     write?
   - Should losing the four success sentences go to the product owner?
4. **The example label.** Is it read from `provider_code` everywhere and never
   inferred from `origin`? Does the version path read it through
   `source_proposal_id` under the owner policy? Does a failed read produce no
   label rather than a wrong one?
5. **Ownership and the client boundary.** Does any Client Component import
   `@/server/**`? Does any component call a repository write? Is
   `expectedHeadRevision` the only owner-supplied value that reaches a write,
   and is it safe for it to be?
6. **What reaches the browser.** The open proposal's `content` does. Is anything
   else sent that should not be, such as a planning note, regeneration feedback,
   or a source id?
7. **Product invariants.** Replanning must change no completed history.
   Acceptance appends a version and never rewrites one; an edit creates a
   proposal and never rewrites its source; a decline is append-only. Check this
   against the diff, not against this summary.
8. **Honest states.** Empty, pending, conflict, regeneration-limit,
   session-ended and validation states should each say what happened and what
   to do. None may invent a training fact or imply something was saved when it
   was not.
9. **The invariant change** in `src/architecture/m3-11-legacy-reset.test.ts`. Is
   the replacement stricter in each of the ways *The invariant that changed*
   claims, and does anything in the diff get past it?
10. **The removed M3-11 pgTAP assertions.** Confirm that each of the sixteen has
    an equal or stronger assertion in `m3_15f_roadmap_generation.test.sql`, and
    that nothing M3-11 permanently established was removed with them.

## Correction after the first continuous-integration run

The first CI run for `68958da`'s tree — run
[35206994777](https://github.com/mattiss01/fittip/actions/runs/35206994777), for
`c70780e` — was red on exactly one step: **M3-11 seeded legacy reset**, in the
`database` job. Everything else passed: the `static` job, the `browser` job,
every migration from zero, db lint, both advisors, pgTAP, and the new M3-15F
concurrency harness.

**Root cause.** `supabase/tests/fixtures/m3_11_post_reset_verify.sql` asserted
that `accept_roadmap_proposal(uuid,bigint)` was executable by no role at all,
which is what M3-11 left behind when it revoked a function whose body named
tables the reset had removed. M3-15F rewrote that body and deliberately
re-granted execute to `authenticated`, so the fixture failed for a change the
ticket made on purpose. The branch had updated the parallel TypeScript guard in
`src/architecture/m3-11-legacy-reset.test.ts` — see *The invariant that
changed* — but not this SQL one.

**Fix.** Commit `74c2391`, one file:
`supabase/tests/fixtures/m3_11_post_reset_verify.sql`.
The privilege guard now asserts only that `anon`
and `service_role` cannot execute the function, with a comment naming M3-15F so
the next reader sees a deliberate narrowing rather than a weakened check.
`authenticated` access is proved by the M3-15F pgTAP suite, which covers owner,
anonymous and cross-owner behaviour on all five roadmap functions, so widening
this fixture to the other four re-granted functions would duplicate it. The
migration was not touched; it is committed and correct. Nothing else changed.

The legacy-dependency assertion immediately below it is unchanged and still
passes. The new function body names neither `detailed_plan` nor
`completion_heads`; the only occurrences in the migration are the file-level
`--` comments at lines 8, 325 and 332, which `pg_get_functiondef` does not
return.

**Local evidence**, against the running local stack:

| Command or check                                                                      | Result                                                        |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `npm.cmd run test:m3-11-seeded-reset`, with the corrected fixture                     | "M3-11 seeded legacy reset passed." Exit 0                     |
| The pre-fix fixture (`git show HEAD:…`) piped into `psql` against that same database  | `ERROR: roadmap acceptance remains callable`, exit 3           |
| `has_function_privilege` for the three roles, queried directly on that database       | `authenticated` t, `anon` f, `service_role` f                  |
| `pg_get_functiondef(…) ~ '(detailed_plan\|completion_heads)'`                          | `f`                                                            |
| `git diff --check`                                                                     | Clean                                                          |

The second and third rows are the negative control: the same database state that
the corrected fixture accepts still fails the old one at the same line, so the
change narrows the guard rather than disabling the harness.

`74c2391` supersedes `68958da` as the implementation review target, and
approval of `68958da` — and of any Preview built from it — does not carry over.
The CI run for `74c2391` is the automated evidence and is not yet available at
the time of writing.
