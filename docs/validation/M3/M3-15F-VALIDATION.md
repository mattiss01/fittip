# M3-15F validation: roadmap generation, acceptance, and privilege re-grant

**Ticket:** [M3-15F](../../backlog/M3/M3-15F-ROADMAP-GENERATION.md)
**Status:** in development. Builder handoff complete. Still outstanding:
independent review, the continuous-integration run for the reviewed SHA, the
hosted founder apply, the Vercel Preview pass, and product-owner acceptance.
**Tier:** 1
**Branch:** `ticket/m3-15f-roadmap-generation`
**Base:** `45acd9b`
**Implementation review target:**
`ba665b031edb2f36a096d72ed85518a144a2ee4d` (`ba665b0`). This is the last source
commit. The commit that updates this record changes no application file, which
is the evidence-commit exception in `AGENTS.md`.
**Review range:** `git diff 45acd9b..ba665b0`

Implementation commits, in order:

| Commit    | Purpose                                                                    |
| --------- | -------------------------------------------------------------------------- |
| `ef74712` | Migration: the five grants, the M3-09 fix, and a working acceptance body.  |
| `a507e33` | Concurrency harness that reproduces M3-09 and proves the fix.              |
| `b9b321d` | Write surface, example label, and the two copy defects M3-15E deferred.    |
| `0874a94` | Unit tests for generation, the actions, and the provenance read.           |
| `51e4cc9` | CI wiring for the harness and the 390px flow (tooling only).               |
| `8dfbbdd` | Edit moved to a form action; Playwright config and spec. **Insufficient.** |
| `c953e11` | Successful writes redirect. **Insufficient.**                              |
| `7630b4f` | Decision dock keyed by proposal. **Insufficient.**                         |
| `f83f213` | Edit awaited directly, then a document reload. **Worked for the edit.**    |
| `68958da` | All four writes go through `useRoadmapWrite`. **Superseded by `9267d94`.** |
| `74c2391` | M3-11 seeded-reset fixture narrowed to `anon` and `service_role`.          |
| `5a23a9e` | pgTAP for the rewritten source recheck, against real completions.          |
| `9267d94` | The writes go back on this repository's own transition watchdog.           |
| `a29edf2` | The roadmap Supabase import ban narrowed rather than deleted.              |
| `49a9bd0` | Unreadable roadmap provenance fails closed.                                |
| `ba665b0` | The recovery marker no longer outlives a cancelled reload.                 |

Commits `8dfbbdd` through `68958da` are one defect and the attempts to fix it.
They are kept as history rather than squashed, because the record of what did
not work is what justifies the final design. `9267d94` then replaced that
design after the independent review; see *Correction after the independent
review*, which is the authority on how the write path works today. The
narrative in *The defect the browser flow found* is kept for its evidence, and
its conclusion is superseded.

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

A write that lands renders its approved sentence over the screen it produced,
without a document load, with the owner's scroll position and focus where they
left them: "A proposal is ready below.", "Saved as a new proposal. Review it
below.", "Declined. It stays in your history.", "Accepted. This is your roadmap
now." A refused write stays on screen beside the control that refused and says
why, and whatever the owner typed is kept.

Behind that sits `@/lib/app-router/transition-watchdog`, as on the goal, memory
and recurrence surfaces. When a reply arrives and never reaches the screen, the
surface says so and reloads to show what is stored. It never says the write
saved, because a resource-timing entry cannot prove what a 200 contained.

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
4. Write a planning note and press **Generate roadmap proposal**. The page does
   not reload. *A proposal is ready below.* appears at the top, and the proposal
   sits above the still-empty roadmap, marked **Example** and *Awaiting your
   decision*.
5. Press **Edit proposal**, change the roadmap title, and press **Save as a new
   proposal**. *Saved as a new proposal. Review it below.* appears and the
   review shows the new title. The proposal it came from is listed under
   *Proposals* as **Superseded**.
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

`git diff --stat 45acd9b..ba665b0`:

```
 .github/workflows/ci.yml                           |  13 +
 docs/backlog/M3/M3-15F-ROADMAP-GENERATION.md       |  51 +-
 docs/validation/M3/M3-15F-VALIDATION.md            | 744 ++++++++++++++++++
 .../M3/evidence/M3-15F-accepted-390x844.png        | Bin 0 -> 183054 bytes
 .../M3/evidence/M3-15F-compose-390x844.png         | Bin 0 -> 63721 bytes
 .../M3/evidence/M3-15F-history-390x844.png         | Bin 0 -> 198781 bytes
 .../M3/evidence/M3-15F-proposal-390x844.png        | Bin 0 -> 191897 bytes
 docs/validation/README.md                          |  18 +
 e2e/m3-15f-roadmap.spec.ts                         | 336 ++++++++
 e2e/m3-15f.playwright.config.ts                    |  31 +
 package.json                                       |   1 +
 src/app/home/plan/roadmap/action-state.ts          |  62 ++
 src/app/home/plan/roadmap/actions.test.ts          | 612 +++++++++++++++
 src/app/home/plan/roadmap/actions.ts               | 409 ++++++++++
 src/app/home/plan/roadmap/page.test.tsx            | 201 ++++-
 src/app/home/plan/roadmap/page.tsx                 |  40 +-
 src/app/home/plan/roadmap/roadmap.module.css       | 216 ++++++
 src/architecture/m3-11-legacy-reset.test.ts        | 138 +++-
 src/components/roadmap/roadmap-body.tsx            | 134 ++++
 src/components/roadmap/roadmap-composer.tsx        | 236 ++++++
 src/components/roadmap/roadmap-decision-dock.tsx   | 187 +++++
 src/components/roadmap/roadmap-detail.tsx          |  75 +-
 src/components/roadmap/roadmap-editor.tsx          | 385 ++++++++++
 src/components/roadmap/roadmap-outcome.tsx         |  82 ++
 .../roadmap/roadmap-proposal-record.test.tsx       |  29 +-
 src/components/roadmap/roadmap-proposal-record.tsx |  34 +-
 src/components/roadmap/roadmap-proposal-review.tsx |  77 ++
 src/components/roadmap/roadmap-screen.tsx          |  90 ++-
 src/components/roadmap/roadmap-spine.tsx           |   6 +-
 src/components/roadmap/roadmap-watch-notice.tsx    |  38 +
 src/components/roadmap/use-roadmap-write.ts        | 247 ++++++
 src/lib/roadmap/roadmap-control-copy.ts            | 194 +++++
 src/server/repositories/roadmap-repository.test.ts |  89 +++
 src/server/repositories/roadmap-repository.ts      |  50 +-
 src/server/roadmap/roadmap-generation.test.ts      | 271 +++++++
 src/server/roadmap/roadmap-generation.ts           | 255 ++++++
 src/server/roadmap/roadmap-records.ts              | 156 +++-
 .../20260916075522_m3_15f_roadmap_generation.sql   | 582 ++++++++++++++
 .../database/m3_11_legacy_training_reset.test.sql  | 137 +---
 .../database/m3_15f_roadmap_generation.test.sql    | 855 +++++++++++++++++++++
 .../tests/fixtures/m3_11_post_reset_verify.sql     |  13 +-
 .../integration/m3_15f_concurrent_generation.mjs   | 291 +++++++
 42 files changed, 7010 insertions(+), 375 deletions(-)
```

Nothing was deleted or renamed. The four evidence images come from the current
passing runs; three of them were regenerated by `ba665b0` and now show the
restored success sentences.

Four paths in the range are not application code and are accounted for here
rather than left to the diff. `docs/validation/M3/M3-15F-VALIDATION.md` is this
record and `docs/validation/README.md` its index entry.
`docs/backlog/M3/M3-15F-ROADMAP-GENERATION.md` is the brief correction the
product owner made in `8d8da9f`, which carried the hosted-evidence narrowing
into the ticket. `.github/workflows/ci.yml` and `package.json` are `51e4cc9`'s
tooling: the concurrency harness and the 390px roadmap flow added to the
pipeline, and the npm script that runs the harness.

These files have a purpose that the path and diff do not make obvious:

- `src/components/roadmap/use-roadmap-write.ts` submits all four roadmap writes.
  Each is an ordinary form action through `useActionState`, watched from outside
  React by `@/lib/app-router/transition-watchdog`: a reply that arrives and never
  renders reloads the document behind a readable notice. Its header comment
  records why, and *Correction after the independent review* below is the
  authority on it.
- `src/components/roadmap/roadmap-outcome.tsx` holds the last landed outcome
  beside React and renders it once, from `RoadmapScreen`. It exists because
  every control on this surface is removed by the write it performs, so a
  success sentence returned to the control that submitted is unmounted before
  it can be read. It carries no roadmap content, only the sentence.
- `src/components/roadmap/roadmap-watch-notice.tsx` is the only place the
  watchdog's two sentences are written, so the compose form, the dock and the
  editor cannot drift apart in how they explain a stalled reply.
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
  needs. `7630b4f`'s `key={proposal.id}` on the dock is **removed** by
  `9267d94`: an edit replaces the open proposal at that position, and remounting
  the dock there discards the sentence the edit earned. The dock now says in its
  own comment how it stays correct across an edit without the key.
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
  like any other proposal read. `49a9bd0` changed what an unreadable embed
  reports: it is `UNKNOWN_PROVIDER_CODE`, and the one `isExampleAuthored`
  predicate both label sites use treats that as an example. The direction
  matters. An accepted fixture-authored roadmap rendering as a real one, with no
  error anywhere, is the failure the label exists to prevent; an example label on
  a coach-written roadmap costs a second look.

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

**Its conclusion is superseded by `9267d94`.** The evidence below is accurate
and is kept, because it is what a later reader needs in order to judge the
design that replaced it; the design it argues for — a document load after every
write — is no longer what ships. *Correction after the independent review*,
section 2, is the authority on the write path.

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
pattern, so the surface cannot reach a provider adapter, a spend ledger, or a
plan or training repository.

`a29edf2` corrects the one thing this test had lost. M3-15F's first pass deleted
`not.toMatch(/@\/lib\/supabase/)` from the roadmap allowlist, because
`actions.ts` legitimately imports `server-user-client`, and put nothing in its
place — while this section and the doc comment beside the test both went on
claiming the surface could reach no Supabase client. It now holds in two halves:
the route allowlist names that one specifier and refuses any other
`@/lib/supabase` import, and the surface sweep bans every `@/lib/supabase`
import from every other non-test file in `src/app/home/plan/roadmap` and
`src/components/roadmap`. A component holding a client could read or write
around the endpoint that re-derives the owner, which is what the deleted line
was protecting.

## Tests and final results

The builder does not push, so **there is no continuous-integration run for
`ba665b0` yet**. The lead pushes this branch. The run URL and conclusion for the
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
| The same flow against `ba665b0`, against `build` + `start`                                                                                         | **1 passed**, **1 passed**, then `--repeat-each=2` **2 passed**. Four consecutive runs, 0 skipped, 0 failed, 11-15 s each. The run before `ba665b0` failed on the false recovery notice it fixes.                      |
| `npx.cmd supabase test db --local supabase/tests/database/m3_15f_roadmap_generation.test.sql`, against `5a23a9e`                                    | 56 tests, all pass                                                                                                                                                                                                    |
| `npm.cmd run test:run` (whole suite), against `49a9bd0`                                                                                            | 82 files, 969 passed, 2 skipped                                                                                                                                                                                       |
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
npx.cmd supabase link --project-ref <founder project ref>   # only if not linked
npx.cmd supabase db push --linked
npx.cmd supabase migration list --linked
npx.cmd supabase db advisors --linked --type security --level warn
```

These are the four commands the brief carries, and this record claims no
authorization beyond them.

- `db push --linked` applies `20260916075522_m3_15f_roadmap_generation.sql` in
  timestamp order. Paste its output here.
- `migration list --linked` is what proves the migration actually applied: the
  remote column must show `20260916075522` beside the local one. The product
  owner accepted this command on 17 September 2026 for exactly that reason.
  Paste its output here.
- `db advisors --linked --type security --level warn` is the security evidence.
  Locally it reports "No issues found". Any other result on the founder project
  is a blocker, not a note. Paste that output here.
- The authenticated hosted read is the product owner's own pass on the Preview:
  signing in and opening `/home/plan/roadmap`. It is not a query.

**What this narrows, in the brief's words.** Nothing queries the hosted
privilege boundary, and the authenticated hosted read is the product owner's
acceptance pass rather than a scripted check. `AGENTS.md` asks for both by
query. What covers them instead is `migration list`'s remote history, `db
push`'s own output, the security advisors, the pgTAP suite in continuous
integration, and the product owner's pass on the Preview. The product owner
chose this narrowing deliberately on 16 and 17 September 2026 and it is written
into the brief; it is a decision, not an omission.

## Known limitations

1. **The privilege boundary is proven by the pgTAP suite in continuous
   integration instead of against the hosted database.** *Hosted evidence*
   above describes what that narrows and what covers it instead.
2. **A stalled reply still costs a document reload, and the surface cannot say
   whether the write saved.** That is the whole of what the watchdog can
   observe: a resource-timing entry proves a response arrived, never what it
   contained, and these actions answer 200 for a conflict, a validation failure
   and an expired session too. So the notice says the step did not appear and
   the page is reloading, and the reload is what shows the owner where their
   roadmap stands. This is the same bargain the goal, memory and recurrence
   surfaces make.
3. **The root cause is upstream and identified, but not fixed here.**
   `src/lib/app-router/transition-watchdog.ts` names it: React's
   `useDeferredValue` can stick on a stale value (facebook/react#35821), and
   `layout-router` routes every segment's payload through it. M2-11 took the
   framework fix and re-measured *navigation* at 0 lost renders in 250; what
   this surface watches is an in-flight *mutation reply*, a different transition
   class that has never been measured on either version. What would license
   removing the watchdog is that measurement — extending
   `e2e/m2-09-lost-render.probe.ts` with a phase per surface — and it does not
   exist yet. Three other surfaces keep the watchdog for the same reason.
4. **The watchdog's render grace is 750 ms, and this is the heaviest of the four
   surfaces.** A commit slower than that is read as a lost render. The recovery
   is safe — the reload shows exactly what is stored — but a spurious reload is
   a visible flash, and one local run tripped it on a regeneration before
   `ba665b0`. Raising `RENDER_GRACE_MS` would change the goal, memory and
   recurrence surfaces too, which is out of this ticket's scope.
5. **The flow passed four consecutive local runs, which is evidence rather than
   proof.** The defect it guards against is intermittent by nature. The CI run
   adds a fifth on a different machine.
6. **No live provider call was made in any environment.** Generation used the
   fixture coach throughout. Whether a real coach would propose anything like
   what the surface shows is unanswered by this ticket, and trying it is a
   separate spend decision.
7. **A fixture generation writes a canned roadmap into permanent history.** The
   product owner chose visible, working controls over hidden ones, knowing this.
   The example label is the mitigation, and it rests entirely on the stored
   `provider_code`.
8. **An owner's edit of an example is still labelled an example.**
   `apply_roadmap_proposal_change` copies the source's provider code onto the
   edit. That is what the database records and what the brief requires, but an
   owner who rewrote every sentence would still see the label.
9. **The compose form is hidden while a proposal is open.** This is not an
   environment gate. A second concurrent request would create a second proposal
   for the same horizon, and the repository would have to pick one of them to
   call open. The order is decide, then ask again. The database enforces that
   order by refusing a regeneration whose predecessor has not been declined.
10. **There is no context summary.** `contextSummaryLabel`,
    `contextSummaryHelper`, `contextEmptyGroup`, `createAction` and
    `proposeAction` in `ROADMAP_COPY` are still unused, as they were before this
    ticket. M3-02's disclosure listed exact counts of goals, memory items and
    recent sessions. This route reads goals and completions but not memory, and
    adding a read only to fill a disclosure was out of scope. A disclosure with
    vague counts would be less honest than none. The brief named only
    `reviewPointsHeading`, which was removed.
11. **`reviewPointsHeading` was removed rather than used.** M3-02 marked review
    points on the spine and also listed them again under "When to reassess".
    M3-15E's spine places each review point where it falls and deliberately
    dropped the separate list. Restoring the list would repeat content the spine
    already shows in the right place, so the unused string was removed.
12. **`plan_version` sources always fail acceptance.** No such proposal can be
    undecided today, because M3-11 expired all of them, so no owner can reach
    this refusal. If one ever existed, its owner would be told their plan
    changed and would have no way to accept it.
13. **The 390px visual pass is the product owner's.** The browser flow asserts
    that the page does not overflow horizontally and that every control is
    present and reachable. It cannot judge whether the surface looks or feels
    right. In the full-page evidence images, the fixed primary navigation
    appears mid-page. That is how a full-page screenshot captures a fixed
    element; it is not a layout defect.
14. **The decline confirmation is `window.confirm`.** It matches the
    surrounding surfaces and works from the keyboard, but it is unstyled, and it
    is the one part of this surface that does not look like FitTip.

## Independent reviewer checklist

Review `ba665b031edb2f36a096d72ed85518a144a2ee4d`, using
`git diff 45acd9b..ba665b0`. Confirm that the continuous-integration run for
that exact SHA is green and that the matching Vercel Preview reached `READY`.
Do not re-run lint, typecheck, `test:run`, `build` or the browser flow; the CI
run covers them.

Round two. The migration is unchanged since the first review read it, so items
1, 2 and 10 stand as already-answered unless the diff says otherwise; items 11
to 13 are the corrections made since.

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
3. **`useRoadmapWrite` and the watchdog.** Read *Correction after the
   independent review*, section 2, then check the following.
   - Does the surface ever claim a write saved on evidence that only proves a
     response arrived?
   - Is any refusal path lost — a status that reaches `roadmap-outcome.tsx`
     when it should render beside its control, or the reverse?
   - Can a second press start a second write while one is pending?
   - The decision dock is no longer keyed by its proposal. Can a stale editor,
     a stale draft or a stale reply survive an edit that lands?
4. **The example label.** Is it read from `provider_code` everywhere and never
   inferred from `origin`? Does the version path read it through
   `source_proposal_id` under the owner policy? Does an unreadable read now fail
   closed, and is `isExampleAuthored` the only predicate that decides it?
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
11. **The new source-recheck pgTAP** (`5a23a9e`). Would each of the three cases
    fail if the predicate in the migration were wrong in the direction it
    covers? Is the recorded-source assertion enough to prove the loop iterates?
    Do the completions written above the role switch, and the one `reset role`
    inside the owner section, leave the suite's privilege story intact?
12. **`roadmap-outcome.tsx`.** It is module-level mutable state in a
    `"use client"` module. Is it unreachable from server rendering, can it
    mismatch on hydration, and can a sentence from one write outlive the
    surface it belongs to?
13. **The recovery marker** (`ba665b0`). Does a reload that actually fires still
    leave an explanation for the document it produces, and does a cancelled one
    leave none?

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

## Correction after the independent review

The independent review of `2fb0755` did not approve it. It found no defect in
the migration. What it found was a missing test, a design the product owner
chose to replace, and documentation that said things that were not true. Five
corrections followed, in `5a23a9e`, `9267d94`, `a29edf2`, `49a9bd0` and
`ba665b0`.

### 1. The rewritten source recheck had no behavioural test

Every acceptance case in `m3_15f_roadmap_generation.test.sql` was set up with
`p_sources => '[]'::jsonb`, so the `for v_source in …` loop in
`accept_roadmap_proposal` never iterated once in the whole suite. The only
assertions touching the rewrite were three regex checks on
`pg_get_functiondef`, which prove the body's *text* names `public.completions`
and not `completion_heads` — not that the recheck decides anything correctly.

It is the live path. `src/server/context/coach-ai-context-source.ts` emits a
`completion` source with `recordId` and `revisionNumber` for every session in
the owner's training window, and `finish_roadmap_generation` writes each into
`roadmap_proposal_sources`, so any founder with logged training accepts through
this loop. A wrong predicate gives exactly what the function exists to prevent:
a spurious `PT409` nobody can clear, or an acceptance built on training data
that has since been corrected.

`5a23a9e` adds three cases, on completions written above the role switch because
`authenticated` holds only `select` on `public.completions`:

- a source still at its recorded revision verifies, and the acceptance lands;
- the same source refuses with the approved "Your training history changed.
  Review the proposal again." after `public.completions.revision` is bumped;
- a source naming another owner's completion never verifies.

The recorded source row is asserted before the first acceptance, so the success
case cannot pass with an empty loop. `plan(52)` becomes `plan(56)`, and the two
trailing owner-history assertions move to three versions and four decisions,
which is what the new acceptance leaves behind.

### 2. The write path is back on this repository's own watchdog

The document load after every successful write was the wrong answer to a defect
this repository had already diagnosed and answered four times.
`src/lib/app-router/transition-watchdog.ts` describes the symptom verbatim,
names the upstream cause — React's `useDeferredValue` sticking on a stale value,
facebook/react#35821, routed through `layout-router` — and is used by
`plan-manager.tsx`, `series-transition-watch.ts`, `goal-manager.tsx` and
`memory-manager.tsx`. Its own doc comment says the roadmap takes the "a reply
arrived and never rendered" half alone, with the reasoning: a ten-second
confirmation budget suits a form save, while a provider call has no honest fixed
deadline and must not be declared unconfirmed while it is still legitimately
running. M3-15F had removed the roadmap's use of it and left that comment naming
a consumer that did not exist.

The product owner decided on 17 September 2026 to rewire the writes onto it.
`9267d94` does that. The normal path is an ordinary form action again: the reply
carries the revalidated tree, the surface renders both in one commit, scroll
position and focus are preserved, and there is no document load. The watchdog
covers only the case it can observe, and its copy says the step did not appear
and the page is reloading — never that anything saved.

The four approved success sentences and `pendingElsewhere` come back with it.
`pendingElsewhere` also fixes the second contract defect the review found: a
`pending` reply was routed into the refusal slot, so a tab that could never
update showed "Building your roadmap proposal…" as a static notice with no
recovery action.

**Where a success sentence can live.** Every control on this surface is removed
by the write it performs — a generation replaces the compose form with the
proposal, acceptance and decline remove the review the buttons sat in, and an
edit replaces the open proposal under the dock. A sentence returned to the
control that submitted is therefore unmounted before anybody reads it, which is
why the sentences went missing rather than because the state change was thought
sufficient. `roadmap-outcome.tsx` holds the last landed outcome beside React and
is reported to from the browser the moment the server answers, before the commit
that removes the control. It is rendered once, by `RoadmapScreen`, at a stable
position, so the revalidated tree reconciles onto the same instance. A refusal
is deliberately not routed there; it belongs next to the control the owner has
to act on.

`7630b4f`'s `key={proposal.id}` on the decision dock is removed for the same
reason: it would remount the dock on a successful edit and discard that edit's
sentence. What the key was reaching for is covered by closing the editor during
the render that sees its own reply come back `edited`, and by the watchdog for a
reply that never renders at all.

`RoadmapActionState` loses `proposalId` and `memoryCandidateCount`, the first
contract defect the review found: no action ever set either. `draft` stays and
is genuinely used again, because a form action resets an uncontrolled form and
the two counted fields are re-seeded from it during render.

**`vercel-react-best-practices`, re-checked on the new write path.**

- `server-auth-actions` — unchanged and still true: every action derives the
  owner from verified claims before touching the repository.
- No double submit: each control is disabled while any write in its component is
  pending, and `useActionState` queues rather than racing.
- No lost update: accept still carries `expectedHeadRevision`, which the
  database compares against the real head under a lock.
- Failures still surface honestly: `isRefusal` routes every non-landed status to
  the control that produced it, with the draft intact.
- `rerender-derived-state-no-effect` — the editor close and the draft re-seed
  are derived during render, not in effects.
- `rendering-usetransition-loading` is now **followed** rather than deliberately
  declined: `useActionState`'s own pending flag drives the disabled state.

**What the browser flow then caught.** A watchdog verdict arms a reload behind a
readable notice and sets the session marker that explains it afterwards. When
the lost transition landed inside that half-second window the timeout was
cleared and no reload happened — but the marker stayed set, so the next control
to mount with nothing submitted told the owner "this page was reloaded" when it
had not been. The regeneration's own success sentence and that false explanation
were on screen together. `ba665b0` drops the marker with the cancelled timeout;
only a reload that actually fired leaves it standing, and that path replaces the
document rather than running the cleanup.

### 3. The deleted architecture invariant is narrowed, not gone

`a29edf2`. See *The invariant that changed*, which it corrects along with this
record.

### 4. Unreadable provenance now fails closed

`49a9bd0`. See *Authorization and ownership*. This was the review's "consider,
and tell me what you decide". The decision was to fail closed: the unsafe
direction for an invariant about labelling examples is the one where an example
renders as a real roadmap with nothing to say otherwise. Raising a persistence
error instead was considered and rejected —
`roadmap_versions.source_proposal_id` is `not null` with a foreign key, so this
is not a state the database can be in, and turning an impossible shape surprise
into a failed read of the whole roadmap page is a worse trade than an extra
label on a record that deserves a second look.

### 5. What this record said that was not true

Corrected in place, because this record has not been accepted and a record that
misdescribes what shipped is worse than one carrying its own correction:

- Known limitation 3 said the root cause was unidentified and that other
  surfaces "submit Server Actions differently and were not investigated here".
  Both were false; `transition-watchdog.ts` identifies it and four surfaces use
  it.
- *The invariant that changed* claimed the surface could reach no Supabase
  client while nothing constrained which `@/lib/supabase` module it imported.
- *Authorization and ownership* said an unreadable provenance produces no label.
- The manifest showed `45acd9b..68958da` rather than the ticket's whole range,
  and accounted for no documentation path in it.
- The header and `docs/validation/README.md` still named `68958da` as the review
  target after `74c2391` superseded it.
- *Hosted evidence* listed three commands where the corrected brief carries
  four.

`ba665b0` supersedes `74c2391` as the implementation review target. Approval of
any earlier commit on this branch, and of any Preview built from one, does not
carry over. The continuous-integration run for `ba665b0` is the automated
evidence and is not yet available at the time of writing; the commit that adds
this correction changes no application file, which is the evidence-commit
exception in `AGENTS.md`.
