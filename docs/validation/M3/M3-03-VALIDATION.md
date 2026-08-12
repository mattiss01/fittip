# M3-03 validation record: selected-horizon plan proposal

**Ticket:** [M3-03](../../backlog/M3/M3-03-SELECTED-HORIZON-PLAN-PROPOSAL.md)

**Status:** **testable — exact commit independently approved with green CI,
READY Preview, and founder-hosted verification; awaiting product-owner
acceptance.** The first-builder foundation handoff remains below as permanent
history; the complete-ticket handoff and subsequent correction evidence follow
it.

**Branch:** `ticket/m3-03-selected-horizon-plan-proposal`

**Commits:**

- `0cf2eca190a912261730e2a41ab26b258c5a0eb8` (`0cf2eca`) — migration and pgTAP,
  the `fittip.seven-day-plan.v2` contract and validator, the selected-horizon
  derivation and context minimum, the v2 prompt and response grammar, the
  synthetic fixture body, and the composition wiring (first builder).

**Base for the diff:** `bd859db` — the approval commit that put the ticket into
development. `git diff bd859db..0cf2eca` is the complete first-builder range.

**Tier 1.** Schema, migration, RLS, an AI provider path, and spend.

## What this half delivers

Nothing a user can reach. Every deliverable here is a boundary the second
builder's repository, domain service, server actions, and interface stand on.

1. **Persistence.** Four owner-scoped tables and four `SECURITY DEFINER`
   functions that write them: the durable pre-call generation claim, the
   immutable proposal, its minimized source references, and one terminal
   rejection. Plus the plan-side memory-candidate route and an independent
   content floor.
2. **The contract.** `fittip.seven-day-plan.v1` → `v2`. A session gains a sport,
   a focus, a rationale, alternatives, and one primary goal with zero or more
   unweighted secondary goals; the proposal gains the coach's description of the
   week, assumptions, uncertainties, and safety considerations. It carries no
   activity, measurement mode, target, weight, share, or percentage at any
   level.
3. **The bounds decision 4 changed, in place.** `MAX_SESSIONS_PER_DAY` 2 → 3 and
   `MAX_SESSIONS` from a fixed 14 to `3 × dayCount`. No parallel limit was
   added. There is no minutes cap and no rest requirement, so a horizon with
   neither passes.
4. **The selected horizon.** One to seven consecutive owner-local dates derived
   from the owner's timezone and a start date that is today or later, with the
   day count remembered and the start date never remembered.
5. **The context minimum.** Below one active goal and a resolved timezone, the
   server refuses, names both missing requirements at once, reaches no provider,
   claims no idempotency key, and takes no reservation.
6. **The prompt and grammar** for the operation, and the fixture body that makes
   the surface reviewable on a Preview with no provider call.

## Mobile demo path

**None.** This half adds no route, no component, and no server action. There is
nothing to demonstrate at `390x844` until the second builder's commit. Claiming
a demo path here would be claiming behavior that does not exist.

## Changed files

`git diff --stat bd859db..0cf2eca`:

```text
 src/lib/supabase/database.types.ts                 |  295 +++++
 src/server/ai/coach-ai-service.test.ts             |  162 ++-
 src/server/ai/coach-ai-service.ts                  |   26 +-
 src/server/ai/composition.ts                       |   36 +-
 src/server/ai/context.test.ts                      |   50 +
 src/server/ai/context.ts                           |   98 +-
 src/server/ai/contracts.ts                         |   93 +-
 src/server/ai/errors.ts                            |    7 +
 src/server/ai/fixtures/fixture-adapter.ts          |   13 +-
 src/server/ai/fixtures/fixture-corpus.ts           |  479 +++++++-
 src/server/ai/fixtures/synthetic-plan.test.ts      |  100 ++
 src/server/ai/fixtures/synthetic-plan.ts           |  172 +++
 src/server/ai/openai-prompt.test.ts                |   93 ++
 src/server/ai/openai-prompt.ts                     |  236 +++-
 src/server/ai/output-validation.test.ts            |  186 ++-
 src/server/ai/output-validation.ts                 |  403 ++++++-
 src/server/ai/plan-horizon.test.ts                 |  157 +++
 src/server/ai/plan-horizon.ts                      |  133 +++
 .../20260812131303_m3_03_plan_proposals.sql        | 1248 ++++++++++++++++++++
 .../tests/database/m3_03_plan_proposals.test.sql   | 1012 ++++++++++++++++
 20 files changed, 4784 insertions(+), 215 deletions(-)
```

**Nothing was deleted or renamed.** Two files are new modules whose purpose is
not evident from the path, and four modified files changed for a reason the diff
alone does not explain:

- `src/server/ai/plan-horizon.ts` — new. The selected-horizon calendar: day-count
  bounds, the owner's local today, the consecutive-date derivation, and the
  day count a stored horizon describes. It is separate from `context.ts` because
  the second builder's compose step needs the dates before a context exists.
- `src/server/ai/fixtures/synthetic-plan.ts` — new. The plan twin of
  `synthetic-roadmap.ts`: a deterministic, structurally valid body derived from
  the request's own context, so a network-free Preview is reviewable against a
  real owner's goal ids and dates, which no corpus literal can be.
- `src/server/ai/coach-ai-service.ts` — the plan branch now goes through the
  two-section validator, so a plan response carries memory candidates on the
  same terms a roadmap response does (criterion 2d). `RoadmapMemoryCandidate`
  became `CoachAIMemoryCandidate` at the two use sites; the old name remains as
  an alias so M3-02's code is untouched.
- `src/server/ai/context.ts` — three separate changes: the horizon bound relaxed
  from "not longer than a day" to "ends before it starts" so a one-day plan is
  possible at all; the context minimum for `create_seven_day_plan`; and
  `timezoneName` added to the owned records as an optional field the roadmap
  path does not supply.
- `src/server/ai/errors.ts` — one new code, `context_below_minimum`, with its
  user-safe sentence.
- `src/lib/supabase/database.types.ts` — regenerated by the Supabase CLI after a
  clean reset, not hand-edited. Pure additions: the four new tables, the four new
  functions, and the four new composite types.

## Data, migration, API, privacy, and security effects

### Migration

`supabase/migrations/20260812131303_m3_03_plan_proposals.sql`, created through
the pinned CLI. It is additive: no existing table, policy, grant, function, or
row is altered or dropped.

**Tables.** `plan_generation_requests`, `plan_proposals`,
`plan_proposal_sources`, `plan_proposal_decisions`. Every one has `user_id` with
a `profiles` foreign key, a composite `(id, user_id)` unique key so a child row
cannot reference a parent recorded under another owner, RLS enabled, all
privileges revoked from `public`, `anon`, `authenticated` and `service_role`, and
exactly one owner `SELECT` policy using `(select auth.uid()) = user_id`. There is
no insert, update, or delete policy anywhere, and no direct write privilege: the
functions are the only write path.

`plan_generation_requests` gets a **column-level** `SELECT` grant that omits
`completion_token`. That token is the capability which permits finishing a
generation, and an owner who could read it could finish their own generation with
content the server never validated.

**Functions**, all `security definer`, `set search_path = ''`, schema-qualified
throughout, every lock wait bounded to three seconds, and **none taking an owner
argument** (ADR-015) — asserted by a pgTAP query over `proargnames`:

| Function | Grant |
| --- | --- |
| `begin_plan_generation(text,text,date,integer,text)` | `authenticated` |
| `finish_plan_generation(uuid,text,text,text,text,text,text,uuid,text,jsonb,jsonb,text)` | `authenticated` |
| `record_plan_memory_candidates(uuid,bigint,jsonb)` | `authenticated` |
| `reject_plan_proposal(uuid)` | `authenticated` |
| `plan_content_is_valid(jsonb,date,date)` | **nobody** |

`anon` and `PUBLIC` hold `EXECUTE` on none of them.

**Three functions are reused rather than re-declared**, and the reasoning is in
the migration header: `roadmap_normalize_owner_text` and
`roadmap_owner_text_hash` are the exact pair `normalizeOwnerText` must agree
with, and a second copy is a second thing that can drift by one collapsed
newline; `roadmap_technical_codes_are_accepted` is the approved
provider/model/rate-card list, and approving a model is a decision about FitTip
rather than about one operation. Their roadmap-prefixed names are now slightly
wrong, which is recorded rather than fixed, because renaming would rewrite
applied history for a cosmetic gain.

**What the database floor enforces**, independently of the application:
schema version, the 1–600 week description, the exact requested start and end
dates, one to seven days, one to `3 × dayCount` sessions, at most three on any
one date, session dates inside the horizon, durations 10–240 whole minutes, the
field allowlists at three levels, and array bounds. The allowlists are what make
"no weight, no percentage, no activities, no targets" mechanical.

**Spend.** `finish_plan_generation` requires a live result to carry a settled,
same-owner reservation recorded against `operation = 'create_seven_day_plan'` and
priced by the same rate card, so a real call cannot be recorded as a costless
fixture. `create_seven_day_plan` was already an accepted operation in the M3-01B
ledger; no ledger change was needed.

**Deliberately absent, because M3-04 owns it:** an accepted plan version, a head
pointer, an edit path, and an acceptance function.
`plan_proposal_decisions.decision` is constrained to `'rejected'` alone, so M3-04
widens a check constraint rather than reshaping a table.

### API and generated types

No HTTP route, server action, or client-visible API changed. The generated types
gained the four tables, four functions, and four composite types; nothing was
removed or altered. `npm run types:patch` restored the nine
`save_training_completion` nullable arguments, unchanged.

### Privacy

The owner's planning note travels to the provider and is stored on the proposal
that results. A pending or failed request holds **only** a 64-character SHA-256
hash of it — asserted by pgTAP both as a column-existence check and as a length
check — so a request that never produced a proposal retains no owner text.

Memory candidates created by `record_plan_memory_candidates` are always
`status = 'proposed'`, `provenance = 'inferred_proposed'`,
`author_class = 'system'`, with `user_confirmed_at` null. None of those is a
caller input. The candidate's text is an exact normalized substring of the stored
planning note, so no model-authored sentence can become memory.

No credential, secret, environment variable, remote resource, or external sink
was added. `resolveCoachAIRuntimeMode` is untouched and still returns `fixture`
with no `FITTIP_AI_*` variable set.

## Tests and final results

There is **no continuous-integration run for `0cf2eca` yet** — the lead pushes
the branch. When it exists, its URL and conclusion belong here, and it is the
automated-test evidence for lint, typecheck, `test:run`, `build`, the
migration/lint/advisor/pgTAP matrix, and the browser flows.

What was run locally while developing, honestly reported:

| Command or check | Result |
| --- | --- |
| `supabase db reset --local` from zero | pass — all 12 migrations applied |
| `supabase db lint --local --level warning --fail-on warning` | pass — no schema errors |
| `supabase db advisors --local --type all --level warn --fail-on warn` | pass — no issues |
| `supabase test db --local supabase/tests/database` | pass — 10 files, 704 assertions, 85 of them new |
| `npm run test:run` (whole suite) | 72 files / 787 tests pass |
| `npm run lint`, `npm run typecheck`, `npm run build` | pass |
| `git diff --check` | clean |

**One honest note on the suite.** The first whole-suite run failed one assertion
in `src/components/planning/activity-library.test.tsx` — a `waitFor` timeout on
an archive confirmation, in a file this commit does not touch. It passed in
isolation and the whole suite passed on an immediate re-run with no change in
between, so it is a load-related flake rather than a regression. It is recorded
because a failure observed is a failure reported; CI for this SHA is the
arbiter.

### Tests added or changed

- `supabase/tests/database/m3_03_plan_proposals.test.sql` — **new, 85
  assertions.** Structure, RLS state, the absence of any non-`SELECT` policy, the
  absence of every direct write privilege, the withheld completion token, the
  four function signatures, `security definer` with an empty search path, the
  ADR-015 no-owner-argument property, the execute matrix for `authenticated`,
  `anon` and `PUBLIC`, and the unreachable content validator. Then behavior:
  anonymous denial; claim, replay, and the same-key-different-fingerprint
  conflict; day counts of 0 and 8 and a past start date refused; an unapproved
  model and a live result with no reservation refused; a mismatched note hash
  refused; the content floor refusing an empty horizon, a fourth session on one
  date, a 601-character and an absent week description, a session carrying a
  weight, a session carrying activities, a session outside the horizon, and
  content that widens the horizon; three sessions on one date and a week with no
  rest day both accepted; a one-day horizon claimed and finished; four sessions
  over a one-day horizon refused; memory candidates rejected, accepted as
  `proposed`, and replayed idempotently; rejection recorded, replayed, and
  leaving the proposal and its note intact; full cross-owner denial; and a failed
  attempt storing only a safe code.
- `src/server/ai/plan-horizon.test.ts` — **new.** Exact date counts for 1, 2 and
  7 days; a one-day horizon starting and ending on the same date; day counts
  outside 1–7 refused; a past start date refused and a later one allowed;
  consecutive dates across both a spring-forward and a fall-back boundary; the
  owner's local date derived rather than the server's at 22:30 UTC; and a refusal
  rather than a UTC fallback when the zone is unusable.
- `src/server/ai/fixtures/synthetic-plan.test.ts` — **new.** The synthetic body
  passes the same validator a real response must, over 1, 2, 3 and 7 day
  horizons; is a pure function of its context; leaves explicit rest days;
  acknowledges a reported signal without inventing one; and quotes the note
  exactly.
- `src/server/ai/output-validation.test.ts` — the plan half rewritten for v2 and
  routed through the two-section validator. Adds the rebuilt-proposal shape, the
  server-owned horizon, section independence, four spellings of a weight field
  all rejected, and a **plan-side ADR-014 decision 4 block**: six injection cases
  covering horizon widening, schema addition, an excluded goal, relaxed safety,
  a claimed acceptance, and a raised limit.
- `src/server/ai/fixtures/fixture-corpus.ts` — the plan cases replaced with 25
  v2 cases against their own seven-day, one-day and safety-signal contexts.
- `src/server/ai/coach-ai-service.test.ts` — a new "plan context minimum" block:
  generation at the minimum; a refusal with no active goal that reaches no
  provider, takes no ledger reservation, spends nothing and records a null
  idempotency key; a refusal naming `resolved_timezone`; both requirements named
  at once; and proof the plan minimum does not apply to a roadmap.
- `src/server/ai/context.test.ts` — a same-date horizon accepted, and the plan
  minimum refused for no goal, no timezone, and an achieved-only goal set.
- `src/server/ai/openai-prompt.test.ts` — the plan prefix budget and its
  arithmetic, the shared cacheable half, the horizon and unweighted-allocation
  instructions, strict-mode conformance for the plan grammar, and the absence of
  every banned property name.

## Known limitations

1. **This is half a ticket.** No repository, domain service, safety-tier decision
   service, server action, route, component, or Playwright spec exists. Nothing
   calls `begin_plan_generation`, `finish_plan_generation`,
   `record_plan_memory_candidates`, or `reject_plan_proposal` from application
   code yet. Acceptance criteria 2a, 5b, 5c, 5e, 6a, 10 and the `390x844` flow
   are entirely the second builder's.
2. **The safety tier is not decided anywhere yet.** The validator enforces the
   *ordinary* tier's output requirement — a reported signal obliges at least one
   safety consideration — and the corpus proves both directions of it. The
   **severe/acute/worsening tier that pauses all generation** is a server
   decision service that does not exist in this commit, so criterion 6a is not
   met by this half. The seam it needs is open: `hasSafetySignal` already travels
   in the context, and a rest-focused response is a decision taken before the
   provider call rather than a shape in this schema.
3. **The plan prefix budget is 7,000 characters, not the roadmap's 6,000.** That
   is a derivation, recorded in `context.ts` and asserted in
   `openai-prompt.test.ts`: the plan's context allocation is 28,500 bytes against
   the roadmap's 33,700, and `ceil((7,000 + 64 + 28,500) / 4)` is 8,891 against a
   10,000-token ceiling. Today's plan prefix is 6,250 characters, so 750 remain.
   As with the roadmap, it is the test suite holding that margin, not arithmetic
   anyone recomputes.
4. **The M3-02 context allocation for `create_seven_day_plan` was adopted, not
   re-derived against a plan corpus.** M3-02 set those numbers provisionally and
   said M3-03 owned them. They are unchanged and the reasoning is now recorded,
   but no plan-specific measurement was taken: a week's context is strictly
   smaller than a roadmap's on every source, so the allocation is safe rather
   than tight.
5. **No live provider call was made and none is authorized.** The luna
   available-days re-test the ticket inherits needs a real call and separate
   product-owner approval with an exact call count. The availability *fixtures*
   the ticket asks for are not in this commit either: availability reaches the
   coach through accepted memory items, which the second builder's context source
   supplies, so the cold-start shape is testable once that exists.
6. **`plan_proposal_decisions` admits only `'rejected'`.** M3-04 must widen the
   check constraint and add its version reference in a forward migration. That is
   deliberate — there is nothing yet for an accepted proposal to become — but it
   is a constraint change M3-04 has to make rather than inherit.
7. **The hosted migration has not been applied to the founder project.** No
   Preview exists for this SHA. Both belong to the lead after the second
   builder's commit.
8. **The clean-tree test baseline in `CLAUDE.md` is stale.** It says 39 files /
   229 tests. The observed count on this commit is 72 files / 787 tests, and the
   pgTAP suite is at 10 files / 704 assertions. Not fixed here, because
   `CLAUDE.md` is not this ticket's file to change; the lead may want to correct
   it separately.

## Independent reviewer checklist

This commit is **not a reviewable ticket on its own**. If the lead wants a
foundation-only review before dispatching the second builder — as M3-02 did —
review exactly `git diff bd859db..0cf2eca`, and confirm the judgment CI cannot
supply:

1. **ADR-015 conformance.** No function takes an owner argument; every one
   derives `auth.uid()` and refuses `42501` without it; every one sets
   `search_path = ''` and schema-qualifies. The pgTAP file asserts all of this —
   confirm the assertions actually prove it rather than reading the claim.
2. **The write boundary.** No table has an insert, update, or delete policy or
   privilege. `completion_token` is unreadable. `plan_content_is_valid` is
   unreachable by any client role. A caller cannot substitute different owner
   content under an already-claimed key, and only the caller whose insert opened
   the attempt is told `claimed`.
3. **Decision 4, in place.** `MAX_SESSIONS_PER_DAY` is 3 and `MAX_SESSIONS` is
   gone, replaced by `maxSessionsForHorizon`. Confirm no parallel limit was added
   anywhere, and that nothing rejects a horizon for lacking a rest day or for
   total minutes.
4. **Decision 6.** No weight, share, or percentage exists in the TypeScript
   contract, the validator allowlists, the OpenAI grammar, or the database floor.
   The four-spelling test is a sample, not a proof — check the allowlists.
5. **Decision 5's cost.** The context-minimum refusal happens inside context
   assembly, which `CoachAIService.#run` calls before `idempotency.begin` and
   before `#attempt` reserves. Confirm that ordering in the service rather than
   trusting the test, because the test only proves today's ordering.
6. **The relaxed horizon bound.** `context.ts` now accepts
   `horizonEndDate === horizonStartDate`. Confirm this cannot let a roadmap
   through with a degenerate horizon: the roadmap's four-week minimum lives in
   the database and in the horizon the compose step derives, not here.
7. **The reused roadmap-prefixed functions.** Confirm that reusing
   `roadmap_normalize_owner_text`, `roadmap_owner_text_hash` and
   `roadmap_technical_codes_are_accepted` from the plan path is correct rather
   than merely convenient, and that the normalization still matches
   `normalizeOwnerText` exactly.
8. **The second builder's seams.** M3-03B adds regeneration and M3-03C adds a
   roadmap source. Confirm the request table, the proposal table, and the context
   assembler can take those without reshaping — an `origin` column with one value
   and a lineage nobody stores yet are the two places to look.

Do not re-run lint, typecheck, `test:run`, `build`, or the database matrix; cite
the CI run for `0cf2eca` once the branch is pushed.

---

## Second builder handoff: complete ticket

The first-builder record above remains the permanent foundation handoff. This
section supersedes only its **incomplete-ticket** warning: M3-03 now has its
remaining repository, orchestration, safety, server-action, surface, and mobile
test half. The ticket remains **in development** until the lead pushes it and
records green CI, a matching READY Preview, the founder-hosted migration and
security checks, independent review, and product-owner acceptance.

**Exact review target:**
`86aa31505985cb3b914513d2dd119bcc65722c67`

**Initial implementation commit:**
`0cf2eca190a912261730e2a41ab26b258c5a0eb8`

**Second implementation commit:**
`ac2f60339503f4ef9de84c15189962b63e4e8037`

**CI evidence-wiring correction:**
`112caa2b7c03866ecec4b3a2161de782f568af2b` - adds the missing isolated M3-03
390px browser step after M3-02 without changing any existing step or retry.

**Collapsed-disclosure assertion correction:**
`85d5052eff020c215dc827a76d8a5763cbe8f63e` - checks that roadmap copy inside
the collapsed `<details>` is not visible, while preserving the post-expand
visible assertion and all product behavior.

**Accessible day-radio locator correction:**
`e40c0b542ab4c58dc9d4ece8af8d481a0a14639e` - selects and verifies day 3 by
its exposed `radio "3"` role instead of searching for a nested label that does
not exist; all other assertions and product behavior remain unchanged.

**Day-radio touch-target correction:**
`b597ee017a377ce5418a280041f4b4f56aa5e8aa` - contains each invisible radio
inside its own positioned visible label so controls no longer overlap at 390px,
while keeping the radio directly operable and preserving focus-visible styling.

**Independent-review correction:**
`cf60ed64a29840da503fc8e52956f1db889a9e9a` - addresses the review-blocking
dialog, duration-contract/database, accepted-constraint fixture, local-date
rollover, and memory partial-success findings. The review of `b597ee0` requested
changes; it is superseded and is not approval of this target.

**Midnight-rollover test correction:**
`a70a4ef48a94b66b8ac03cc4e4ccc337cf7b7254` - awaits the next calculated
fake-timer boundary and React store flush deterministically, preserving the
exact new owner-local date assertion after CI exposed a fixed-delay race.

**Fixture planning-input correction:**
`86aa31505985cb3b914513d2dd119bcc65722c67` - applies accepted sport
preferences and recognized planning-note scheduling constraints behind hard
accepted constraints and server safety, while surfacing unrecognized accepted
wording as uncertainty instead of claiming it was applied.

**Branch:** `ticket/m3-03-selected-horizon-plan-proposal`

**Complete ticket range:**
`git diff bd859db..86aa31505985cb3b914513d2dd119bcc65722c67`

### Delivered behavior

- **Plan** now links to **Propose a plan**, a separate
  `/home/plan/proposal` route. Opening the route performs no generation.
- The compose screen always shows a 1-7 day selector, remembers the newest
  requested day count, resets start date to the browser-resolved local today,
  and opens the planning note empty. The collapsed context disclosure counts
  active goals, accepted memory, and recorded sessions; it does not require or
  warn about an absent roadmap.
- The authenticated action validates owner, timezone, horizon, note, and
  idempotency input server-side. It loads owner-scoped goals, memory,
  completions, and current-plan context in parallel. Context-minimum and safety
  refusals happen before the durable generation claim.
- The generation service uses the existing fixture composition explicitly with
  an empty environment, so no deployment setting can make this M3-03 surface
  live. It claims one database attempt, persists only a validated proposal and
  minimized sources, then records valid note excerpts as independent proposed
  memory candidates. Replays do not make another attempt.
- The server safety service never asks the model for a tier and ignores the
  planning note for classification. An accepted limitation follows the ordinary
  fixture branch: conflicting work is left out and non-conflicting recovery
  sessions continue. An eligible reported completion signal carries no accepted
  severity in today's schema, so its tier is uncertain and conservatively
  pauses all generation before a claim. The screen then gives a rest-focused,
  non-diagnostic stop-and-consult response.
- The proposal review renders every requested calendar date as its own indexed
  day card, including explicit planned rest. A session summary shows title,
  sport, minutes, and primary goal; focus, intent, rationale, alternatives, and
  unweighted secondary goals sit behind one disclosure.
- The owner can inspect assumptions, uncertainty and safety notes, continue to
  an honest M3-04 boundary notice, review proposed memory independently, or
  reject the proposal. This ticket has no accept, edit, lock, activity-detail,
  or regeneration operation.
- Compose and reject use the existing shared lost-render timing primitive. No
  fourth watchdog was added.

### Mobile demo path

For the product-owner Preview pass at `390x844`:

1. Open `/home/plan`, then choose **Propose a plan**.
2. Select 1, 2, or 7 days, confirm that start date is local today, expand
   **What the coach will use**, and optionally enter a planning note.
3. Choose **Generate plan proposal**. Confirm every selected date has a card,
   a rest day says **Planned rest**, and session detail is collapsed initially.
4. Expand one session and inspect focus, intent, rationale, alternatives, and
   unweighted secondary goals. Inspect assumptions, uncertainty, safety, and
   any memory-review link.
5. Choose **Continue** and confirm it says M3-04 owns editing, locking and
   acceptance. Close it, reject the proposal, and confirm the compose screen
   returns with the day count remembered, start date reset to today, and the
   note empty.

The local production configuration is
`e2e/m3-03.playwright.config.ts`, fixed to port `3018`, timezone
`Europe/Berlin`, and viewport `390x844`. With the local Supabase environment
available, run:

```powershell
npm.cmd run build
npm.cmd run start -- -p 3018
npx.cmd playwright test e2e/m3-03-plan-proposal.spec.ts --config=e2e/m3-03.playwright.config.ts
```

### Changed files: complete ticket

`git diff --stat bd859db..86aa31505985cb3b914513d2dd119bcc65722c67`:

```text
 .github/workflows/ci.yml                           |   10 +
 docs/validation/M3/M3-03-VALIDATION.md             |  962 +++++++++++++++
 docs/validation/README.md                          |    1 +
 e2e/m3-03-plan-proposal.spec.ts                    |  210 ++++
 e2e/m3-03.playwright.config.ts                     |   16 +
 src/app/home/plan/proposal/action-state.ts         |   26 +
 src/app/home/plan/proposal/actions.test.ts         |   97 ++
 src/app/home/plan/proposal/actions.ts              |  205 ++++
 src/app/home/plan/proposal/error.tsx               |   13 +
 src/app/home/plan/proposal/loading.tsx             |    7 +
 src/app/home/plan/proposal/page.tsx                |  131 ++
 src/app/home/plan/proposal/proposal.module.css     |  471 ++++++++
 .../plan-proposal/plan-proposal-days.test.tsx      |   57 +
 .../plan-proposal/plan-proposal-days.tsx           |  131 ++
 .../plan-proposal/plan-proposal-manager.test.tsx   |  122 ++
 .../plan-proposal/plan-proposal-manager.tsx        |  556 +++++++++
 src/components/planning/plan-editor.tsx            |    4 +
 src/features/plan-proposal/plan-proposal-copy.ts   |   17 +
 src/lib/supabase/database.types.ts                 |  295 +++++
 src/server/ai/coach-ai-service.test.ts             |  162 ++-
 src/server/ai/coach-ai-service.ts                  |   26 +-
 src/server/ai/composition.ts                       |   36 +-
 src/server/ai/context-source.ts                    |    3 +
 src/server/ai/context.test.ts                      |   50 +
 src/server/ai/context.ts                           |   98 +-
 src/server/ai/contracts.ts                         |   93 +-
 src/server/ai/errors.ts                            |    7 +
 src/server/ai/fixtures/fixture-adapter.ts          |   13 +-
 src/server/ai/fixtures/fixture-corpus.ts           |  499 +++++++-
 src/server/ai/fixtures/synthetic-plan.test.ts      |  312 +++++
 src/server/ai/fixtures/synthetic-plan.ts           |  543 +++++++++
 src/server/ai/openai-prompt.test.ts                |   93 ++
 src/server/ai/openai-prompt.ts                     |  238 +++-
 src/server/ai/output-validation.test.ts            |  196 ++-
 src/server/ai/output-validation.ts                 |  404 +++++--
 src/server/ai/plan-horizon.test.ts                 |  157 +++
 src/server/ai/plan-horizon.ts                      |  133 +++
 src/server/plan-proposal/plan-proposal-records.ts  |   60 +
 .../plan-proposal/plan-proposal-service.test.ts    |  211 ++++
 src/server/plan-proposal/plan-proposal-service.ts  |  220 ++++
 src/server/plan-proposal/plan-safety.test.ts       |   86 ++
 src/server/plan-proposal/plan-safety.ts            |   34 +
 .../repositories/plan-proposal-repository.test.ts  |  118 ++
 .../repositories/plan-proposal-repository.ts       |  263 +++++
 .../20260812131303_m3_03_plan_proposals.sql        | 1248 ++++++++++++++++++++
 ...60812191935_remove_plan_session_minutes_cap.sql |  185 +++
 .../m3_03_plan_duration_correction.test.sql        |   84 ++
 .../tests/database/m3_03_plan_proposals.test.sql   | 1012 ++++++++++++++++
 48 files changed, 9696 insertions(+), 219 deletions(-)
```

**Nothing was deleted or renamed.** Non-obvious purposes added by the second
builder:

- `src/server/ai/context-source.ts` - accepts an injected, server-validated
  browser timezone for the plan operation while leaving M3-02's default null.
- `src/server/ai/fixtures/synthetic-plan.ts` - the fixture now demonstrates the
  ordinary safety branch by continuing only generic, non-conflicting recovery
  work around an accepted constraint.
- `src/features/plan-proposal/plan-proposal-copy.ts` - keeps approved text in a
  client-safe module; importing the server-only domain record module into the
  client correctly failed the first production build.
- `src/components/planning/plan-editor.tsx` - adds only the explicit entry link;
  accepted manual-plan behavior is unchanged.

### Data, migration, API, privacy, and security effects

The first-builder migration, RLS, grants, RPCs, generated types, and privacy
effects remain exactly as recorded above. The correction adds the forward
`20260812191935_remove_plan_session_minutes_cap.sql` migration. It replaces
only the private `plan_content_is_valid(jsonb,date,date)` body so every positive
integer duration is valid and zero, negative, fractional, and all existing
schema/size/horizon violations remain invalid. It preserves the function's
signature, invoker security, empty search path, and revoked privileges. No
table, row, policy, grant, generated type, package, credential, environment
file, or client-visible API shape changed.

All proposal reads repeat `user_id` after verified claims and rely on owner
`SELECT` RLS. All mutations use the already committed `SECURITY DEFINER` RPCs;
none takes or receives an owner argument. Database errors collapse to bounded
authentication, conflict, or persistence errors. The browser receives only the
rendered proposal, goal title map, counts, and action state; it receives no
source records, reservation token, completion token, provider detail, or owner
id.

The browser supplies an IANA timezone discovered from `Intl`. The server
validates it by resolving the zone and recomputes owner-local today; the
database independently refuses a past start. The day count is remembered only
in the owner-scoped generation-request record that already exists. No browser
storage is used for request inputs or proposal data.

The planning note is returned only to the same compose surface after a rejected
submission so the in-progress correction is not lost. It starts empty on route
entry and after a completed or rejected proposal. The note never enters an
error, log, source reference, or pending request as plaintext; persistence and
memory-excerpt rules remain the first builder's database boundary.

No provider host, credential, live flag, or `FITTIP_AI_*` variable was added.
The plan composition receives `environment: {}` and resolves fixture even if a
deployment has live variables for another operation. The only service-role key
reference is the ticket Playwright harness, used to create and always delete a
synthetic local account; it is never imported by application code or persisted.

Relevant `vercel-react-best-practices` checks applied:

- `server-auth-actions`: both actions authenticate like public endpoints.
- `server-no-shared-module-state`: request, owner, timezone, idempotency, and
  safety state are local to one invocation.
- `server-serialization`: the page reduces repositories to displayed fields and
  counts before crossing the Server/Client boundary.
- `async-parallel` and `server-parallel-fetching`: independent repository
  construction and reads use `Promise.all`; the generation dependency chain
  remains ordered where claim, call, persistence, and memory require it.
- `bundle-barrel-imports`: client modules import direct, client-safe paths and
  no server domain or repository module.

### Tests and final local results

**CI for exact current review target
`86aa31505985cb3b914513d2dd119bcc65722c67` is pending the lead push.** The
green `a70a4ef` run and the earlier red `cf60ed6` run remain recorded below as
superseded history.

[Run 31633879309](https://github.com/mattiss01/fittip/actions/runs/31633879309)
failed only in Vitest at
`src/components/plan-proposal/plan-proposal-manager.test.tsx:102`: the
owner-local rollover test expected `2026-08-13` but observed the manually edited
`2026-08-15`. The database reset, lint, security/performance advisors, pgTAP,
concurrency harnesses, production build, and every 390px browser flow including
M3-03 passed. Vercel deployment completed. The test had advanced a fixed 101 ms
synchronously even though the component schedules the calculated next calendar
boundary and React's external-store update may flush asynchronously under suite
load. The correction awaits the next scheduled fake timer and React flush while
retaining the exact expected new local date.

[Run 31613150945](https://github.com/mattiss01/fittip/actions/runs/31613150945)
completed successfully on 12 August 2026. Its three jobs passed: lint, types,
unit tests and production build; migrations from zero, database lint, security
and performance advisors, pgTAP and concurrency; and every 390px production
browser flow, including the isolated M3-03 selected-horizon proposal step.

[Run 31612075271](https://github.com/mattiss01/fittip/actions/runs/31612075271)
for `e40c0b542ab4c58dc9d4ece8af8d481a0a14639e` was red because radio 7's
unbounded invisible input overlapped the selected radio 3 and intercepted its
pointer events at 390px. This was a real touch-target defect. All legacy browser
flows and the static and database jobs were green. Each input is now bounded to
its own visible label; that run is superseded and is not final evidence for this
ticket.

[Run 31610743244](https://github.com/mattiss01/fittip/actions/runs/31610743244)
for `85d5052eff020c215dc827a76d8a5763cbe8f63e` was red. Its M3-03 failure was
exactly the day-3 locator searching for a nested `label` beneath the labelled
group even though the accessibility snapshot exposes `radio "3"`. The static
and database jobs passed. The same run also had unrelated authentication and
onboarding lost-transition failures and an M1-04 timeout failure. No
known-defect exception is claimed. The M3-03 locator now uses the exposed radio;
that run is superseded and is not final evidence for this ticket.

[Run 31608863224](https://github.com/mattiss01/fittip/actions/runs/31608863224)
for `112caa2b7c03866ecec4b3a2161de782f568af2b` was red only because the new
M3-03 test asserted zero DOM matches for copy that correctly remains in a
collapsed `<details>` element. Static and database jobs passed. The assertion
now tests visibility instead; that run is superseded and is not final evidence
for this ticket. The still-earlier CI run for
`ac2f60339503f4ef9de84c15189962b63e4e8037` did not execute the M3-03
Playwright config because the workflow omitted that step, so it also remains
superseded. Do not treat the local checks below as the ticket's automated gate.

| Command or check | Result |
| --- | --- |
| `npx.cmd vitest run` with the two architecture tests and five focused M3-03 files | pass - 7 files, 32 tests |
| `npm.cmd run typecheck` | pass |
| `npm.cmd run lint` | pass |
| `npm.cmd run build` | pass; `/home/plan/proposal` compiled as a dynamic route |
| first `npm.cmd run build` | failed: the client imported `server-only` through `plan-proposal-records.ts`; copy was split into a client-safe feature module, then the build passed |
| ticket Playwright command | collected exactly 1 `390x844` test, **skipped** because the three local Supabase environment variables were absent |
| safe local environment injection attempt | blocked by command policy before execution; no key was printed or persisted |
| local screenshots and manual 390px observation | not captured because the browser test did not execute |
| `npx.cmd playwright test --config=e2e/m3-03.playwright.config.ts --list` after assertion correction | pass; collected exactly 1 test in 1 file |
| `npx.cmd playwright test --config=e2e/m3-03.playwright.config.ts --list` after radio-locator correction | pass; collected exactly 1 test in 1 file |
| `npx.cmd playwright test --config=e2e/m3-03.playwright.config.ts --list` after touch-target correction | pass; collected exactly 1 test in 1 file; the full local flow was not executed because the required Supabase environment variables remain absent |
| `git diff --check` | clean |

Tests added or changed by the second builder:

- `plan-proposal-service.test.ts` - fixture persistence with zero reservation,
  ordinary limitation continuation, uncertain signal pause before claim, and
  both context-minimum refusals before claim/read as applicable.
- `plan-safety.test.ts` - ordinary, uncertain-conservative, and planning-note
  non-inference branches.
- `plan-proposal-repository.test.ts` - no owner argument, nullable note omission,
  rejection RPC, bounded conflict/error mapping, and anonymous denial before RPC.
- `synthetic-plan.test.ts` - ordinary limitation continues only general recovery
  work and carries explicit conservative consideration; no limitation invents
  none.
- `plan-proposal-days.test.tsx` - exact day blocks, explicit rest, primary-goal
  labels, collapsed details, and no percentage text.
- `m3-03-plan-proposal.spec.ts` and config - one disposable-account production
  flow at exactly `390x844`: no roadmap, collapsed context disclosure, selected
  dates, empty note, every day/rest rendering, no overflow, Continue boundary,
  reject, remembered count/reset date/empty note, private no-store response,
  browser/page-error checks, and cleanup in `finally`.

### Hosted verification completed - 12 August 2026

The product owner ran the complete
`C:\Users\msche\AppData\Local\Temp\fittip-m3-03-hosted-check.md` runbook and
reported that every step worked as expected. This is product-owner-attested
evidence; raw SQL and CLI output was not pasted into the repository.

- The founder project was `mahhfyxhgcmcbqkvudcm`. The dry run identified only
  `20260812131303_m3_03_plan_proposals.sql`; the migration applied successfully,
  and local and remote history matched at all twelve repository versions through
  `20260812131303`.
- Hosted database lint was clean. Advisors produced no unexpected or new
  `plan_*` finding.
- The four plan tables existed with RLS enabled. The only client policies were
  the four authenticated owner-select policies; no client write policy or
  direct write privilege existed. `completion_token` was absent from the
  authenticated column-level SELECT grant.
- The four plan mutation functions were `SECURITY DEFINER`, had an empty search
  path, derived ownership from `auth.uid()`, accepted no owner argument, and
  were executable by `authenticated` but not by `anon` or `service_role`.
  `plan_content_is_valid` remained unreachable to all three client roles.
- On the matching READY Preview
  `https://fittip-nd4nacq3b-mattis-3657s-projects.vercel.app`, the founder
  completed the 390x844 fixture-only compose flow, selected three days, saw the
  expected date/rest cards and session-level disclosure, and reloaded the open
  proposal through the authenticated hosted read path. No live provider call
  was made.
- Under a simulated authenticated owner, hosted row counts matched the founder
  records. The fixed stranger UUID saw zero rows across requests, proposals,
  sources, and decisions. Selecting `completion_token` as the owner failed with
  the expected SQLSTATE `42501` permission denial.

This closes the hosted migration/history, schema, RLS/privilege, advisor,
authenticated-owner-read, denied-cross-user-read, and mobile Preview gates for
independent review. It does not replace exact-commit review or product-owner
acceptance.

### Remaining limitations and lead gates

1. Runs for `e40c0b5`, `85d5052`, `112caa2`, and `ac2f603` are superseded for
   the distinct reasons recorded above. Exact-target run 31613150945 is green;
   no CI exception is claimed.
2. The local Playwright flow was collected but skipped because the required
   Supabase environment was unavailable. CI executed the exact M3-03 390px
   flow, and the product owner completed the matching hosted Preview pass.
3. No live provider call was made or authorized. The proposal is a deterministic
   fixture, not evidence of model quality.
4. The safety schema has an explicit severe-fatigue flag but no accepted
   severity/acute/worsening field for pain, illness, or injury. Therefore any
   eligible reported completion signal has an uncertain tier and conservatively
   pauses all. The reviewer must judge that this correctly applies the approved
   uncertain-tier rule rather than inventing severity from completion text.
5. The fixture now deterministically applies explicit accepted constraint text
   for availability, time window, maximum duration, location, equipment and
   named activity restrictions. It remains a bounded fixture rather than a
   general natural-language planner; unrecognized wording is presented in the
   proposal assumptions instead of being silently treated as fully understood.
6. M3-03B regeneration, M3-03C roadmap input, M3-03D activity detail, and M3-04
   editing/locks/acceptance remain absent.

### Independent-review correction evidence

The independent review of `b597ee017a377ce5418a280041f4b4f56aa5e8aa`
requested changes for five product defects and this record's stale headline.
The exact implementation correction is
`cf60ed64a29840da503fc8e52956f1db889a9e9a`:

- Continue and Reject now move focus into their modal dialog, make the rest of
  the document inert, contain Tab and Shift+Tab, close on Escape, and restore
  focus to the invoking button. Focused component coverage exercises both
  dialogs and the outside-document inert boundary.
- TypeScript validation, fixture cases, the structured-output prompt, and the
  forward database validator now accept every positive safe integer duration,
  including 900 minutes. Zero, negative, fractional, and non-number durations
  remain invalid. The already-applied `20260812131303` migration was not edited.
- The deterministic fixture applies explicit accepted constraint records to
  session dates, time-window intent, duration, location, equipment, and named
  activity selection. Focused cases cover weekdays/before-work/30-minutes,
  home/no-equipment/no-pool, no-swimming, and an ordinary limitation removing
  only the affected activity while other work continues. Planning-note prose is
  still not used to decide a safety tier.
- The compose store schedules one owner-local date-boundary notification and
  also checks on window focus/visibility. A mounted compose resets its date
  input to the new local today across midnight without polling churn.
- Proposal persistence still completes before memory candidates are written.
  If that independent write fails, the domain returns a typed partial result and
  the action shows a sanitized warning that the proposal was saved but possible
  memory updates were not. Completed replays still do not call the provider,
  finish a second proposal, or repeat a memory write.

No file was deleted or renamed. New correction files whose purpose needs an
explicit note:

- `supabase/migrations/20260812191935_remove_plan_session_minutes_cap.sql` -
  forward replacement of the private content validator; no schema signature or
  privilege change.
- `supabase/tests/database/m3_03_plan_duration_correction.test.sql` - pgTAP
  proof for 900, 1, 0, -1, and 1.5 minute values.
- `src/app/home/plan/proposal/actions.test.ts` - proves the sanitized
  user-visible partial-success mapping.
- `src/components/plan-proposal/plan-proposal-manager.test.tsx` - proves the
  modal focus/inert contract and deterministic owner-local midnight rollover.

Focused correction results:

| Command or check | Result |
| --- | --- |
| first `npx.cmd supabase db reset --local` | timed out after about 124 seconds with no output; reported, then rerun |
| `npx.cmd supabase db reset --local` rerun | pass - all migrations applied from zero, including `20260812191935` |
| `npx.cmd supabase db lint --local --level warning --fail-on warning` | pass - no results |
| `npx.cmd supabase db advisors --local --type all --level warn --fail-on warn` | pass - no issues |
| `npx.cmd supabase test db --local supabase/tests/database` | pass - 11 files, 709 assertions |
| focused Vitest set for actions, dialogs/date rollover, validation, fixture constraints, prompt, orchestration, safety, and network gate | pass - 8 files, 126 tests; the final constraint-only rerun passed 11 tests and final dialog-only rerun passed 2 tests |
| `npm.cmd run typecheck` | pass |
| `npm.cmd run lint` | pass |
| `npx.cmd playwright test --config=e2e/m3-03.playwright.config.ts --list` | pass - exactly 1 test at `390x844` collected |
| full local M3-03 Playwright execution | not run; the required local Supabase environment variables were not improvised |
| generated-type comparison after clean reset and `types:patch` | no semantic diff; `database.types.ts` was not committed in this correction |
| `git diff --check` | clean |

The selected project skills affected the correction as follows:
`frontend-design` preserved the existing approved visual direction while fixing
keyboard/touch focus behavior; `vercel-react-best-practices` kept request state
isolated and the partial result serialized without shared mutable state;
`schema-change` required the forward migration plus clean reset, lint, advisors,
pgTAP, and generated-type comparison; `mobile-e2e` required the exact ticket
collection check and honest no-credential limitation; `validation-record`
required this append-only correction history and exact target reconciliation.

The earlier hosted verification covers only repository migration
`20260812131303`. It does **not** prove that the new forward migration
`20260812191935` ran. Before renewed independent review, the product owner must
apply that exact committed migration in timestamp order and the lead must record
matching remote history, the unchanged private-function privilege boundary,
and hosted validation that a proposal containing a positive integer duration
above 240 persists while a non-positive duration remains rejected. The Vercel
deployment for `cf60ed64a29840da503fc8e52956f1db889a9e9a` completed, but its CI
run was red and is superseded. CI and a matching READY Preview for
`a70a4ef48a94b66b8ac03cc4e4ccc337cf7b7254` are pending.

### Midnight-rollover CI correction evidence

The exact test-only correction is
`a70a4ef48a94b66b8ac03cc4e4ccc337cf7b7254`. It changes no production code,
schema, API, behavior, fixture, authorization, privacy boundary, or provider
path. The red-capable focused file passed alone before the correction, matching
the CI-only/order-sensitive symptom, and the first local whole-suite run also
passed. After the correction, the focused file passed ten consecutive runs and
the whole suite passed again: 78 files and 810 tests. The expected value remains
`2026-08-13`; no assertion or behavior was weakened. `git diff --check` is
clean.

### Independent reviewer checklist: complete ticket

Review exact pushed commit
`86aa31505985cb3b914513d2dd119bcc65722c67` and exact range
`git diff bd859db..86aa31505985cb3b914513d2dd119bcc65722c67`. Reconcile the
48-file manifest above against the diff. Use the lead-recorded CI run for this
SHA; do not use the superseded `a70a4ef`, `cf60ed6`, `b597ee0`, `e40c0b5`,
`85d5052`, `112caa2`, or `ac2f603` runs or re-run CI's suites.

Judge what CI cannot:

1. **The two foundation scope widenings.** Decide whether the plan
   `{plan, memoryCandidates}` envelope plus `validatePlanCandidate` route is
   required by criterion 2d, and whether the rejection record/RPC is required
   by criterion 10. Report either as out of scope if the diff does not justify
   it.
2. **The shared one-day bound.** Confirm changing context validation from `<=`
   to `<` enables a one-day plan without weakening M3-02's separately enforced
   28-day roadmap minimum.
3. **The plan prompt budget.** Recalculate the separate 7,000-character prefix:
   `ceil((7,000 + 64 + 28,500) / 4) = 8,891`, inside 10,000. Treat this as
   spend-adjacent and judge the arithmetic rather than this record.
4. **Safety ownership and order.** Confirm the server, not the model, decides
   the tier; planning-note prose has no classification authority; both the
   context minimum and pause-all branch happen before `beginGeneration`; an
   accepted limitation continues non-conflicting fixture work; and an eligible
   signal's missing severity resolves conservatively. Judge limitation 5 above
   explicitly.
5. **Fixture-only enforcement.** Confirm the surface passes `environment: {}`,
   constructs only `FixtureCoachAI`, reaches no provider host, takes no live
   reservation, and does not introduce a credential or live variable.
6. **Authorization and replay.** Confirm every repository call authenticates,
   reads repeat owner predicates, RPCs receive no owner, a reused key cannot buy
   another attempt, and no completion token or raw database/provider error
   reaches the browser.
7. **Proposal-only semantics.** Confirm there is no accept/edit/lock/detail/
   regeneration operation, no accepted-plan write, and Continue describes the
   M3-04 boundary without implying acceptance.
8. **CI evidence wiring.** Confirm the only workflow change adds the isolated
   M3-03 step after M3-02 on port 3018, using the ticket config, one worker,
   retain-on-failure trace, and separate report/output paths without changing
   any existing step or retry. Confirm the follow-up test-only correction uses
   visibility for pre-expand copy and retains the post-expand visible assertion;
   confirm day 3 is selected and remembered through the accessible radio; and
   confirm each invisible radio covers only its own visible label while direct
   touch and keyboard focus remain operable at 390px.
9. **390px judgment on the matching Preview.** Verify every requested date and
   explicit rest day, one-tap session details, visible primary/unweighted
   secondary goals, serious-coach tone, focus, touch targets, no horizontal
   overflow, reduced motion, honest loading/error/offline/reject/continue
   states, day-count memory/date reset/note reset, and no roadmap requirement.
10. **Hosted dependency.** Do not approve the Preview until the lead records the
   product-owner-run founder migration/history, RLS/privilege/advisor, and
   authenticated owner-read evidence for the exact committed migration.
11. **Modal accessibility.** Exercise Continue and Reject by keyboard: initial
    focus enters, both Tab directions stay contained, Escape closes, the full
    outside document is inert while open, and focus returns to the invoker.
12. **Uncapped duration parity.** Confirm the TypeScript validator, response
    schema/prompt, fixture corpus, forward SQL validator, and pgTAP agree on any
    positive integer including 900, while the previous migration is unchanged.
13. **Fixture planning inputs.** Confirm accepted hard constraints conservatively
    precede planning-note scheduling and accepted preferences; direct
    preferences affect eligible sports; the shipped weekday note caps weekday
    sessions at 45 minutes; prohibited swimming remains prohibited; note prose
    never decides safety; and unrecognized accepted wording appears as an
    uncertainty rather than an applied assumption.
14. **Owner-local rollover.** Confirm an open compose schedules the next local
    calendar boundary without polling and resets an edited start date to the new
    owner-local today, including focus/visibility recovery after suspension.
15. **Memory partial success.** Force candidate persistence failure after a
    valid proposal write and confirm proposal durability, a typed sanitized
    user-visible partial state, and no duplicate generation or memory write on
    completed replay.

### Corrected exact-commit CI, Preview, and hosted delta — 12 August 2026

The final review target is
`a70a4ef48a94b66b8ac03cc4e4ccc337cf7b7254`. Its exact-SHA
[CI run 31635932400](https://github.com/mattiss01/fittip/actions/runs/31635932400)
completed green across all three jobs: lint/types/unit/build; migrations, RLS,
advisors, pgTAP, and concurrency; and every 390px production browser flow,
including the isolated M3-03 flow. This supersedes red run 31633879309 without
claiming an exception.

The matching Vercel Preview reached READY at
`https://fittip-3phw9fkch-mattis-3657s-projects.vercel.app`.

The product owner ran the complete delta runbook at
`C:\Users\msche\AppData\Local\Temp\fittip-m3-03-duration-correction-hosted-check.md`
and reported all five parts passed. This is product-owner-attested evidence;
raw CLI and SQL output was not pasted into the repository.

- Founder migration history now contains the exact forward migration
  `20260812191935_remove_plan_session_minutes_cap.sql` after
  `20260812131303`; the dry-run/apply/history, database lint, and advisor checks
  passed with no reported drift or new `plan_*` warning.
- The hosted `plan_content_is_valid(jsonb,date,date)` signature, invoker
  security, empty search path, and denied execute grants remained unchanged.
- Through the authenticated `begin_plan_generation` and
  `finish_plan_generation` persistence path, a valid 900-minute proposal
  completed and its stored duration read back as 900; the transaction was
  rolled back afterward.
- A separate authenticated transaction with zero minutes failed with the
  expected invalid-plan boundary and did not persist a proposal.
- At 390x844 on the matching Preview, fixture generation/reload, Continue and
  Reject keyboard focus entry/containment/Escape/restoration, inert background,
  radio touch/keyboard operation, visible focus, and horizontal fit all passed.
  No live provider call was authorized or made.

This closes the corrected exact-commit CI, READY Preview, forward-migration
history, hosted validator parity, unchanged private-function boundary, and
manual keyboard/mobile delta gates for `a70a4ef`. Independent re-review then
requested the fixture planning-input correction below, so that commit and its
Preview are superseded for final review. Product-owner acceptance remains open.

### Fixture planning-input re-review correction

Independent re-review of `a70a4ef48a94b66b8ac03cc4e4ccc337cf7b7254`
requested changes because the deterministic fixture ignored accepted preference
memory, ignored recognized planning-note scheduling constraints, and claimed
all accepted constraint wording had been applied even when it was not
recognized. The exact implementation correction is
`86aa31505985cb3b914513d2dd119bcc65722c67`.

The fixture now uses this deterministic precedence:

1. Server-decided safety remains outside and before fixture generation.
2. Accepted hard constraints are combined conservatively: prohibited sports
   and unavailable days are unions, allowed-day sets intersect, duration caps
   take the lowest value, and an accepted setting/time window wins over a note.
3. Recognized planning-note content may further narrow ordinary scheduling,
   including the shipped `I only have 45 minutes on weekdays` note. It does not
   classify severity or turn safety off.
4. Recognized accepted sport preferences influence the remaining eligible
   sport. A preference never revives a prohibited sport or overrides a required
   setting.
5. Goal-derived and generic fixture defaults apply only after those inputs.

The recognition remains deliberately bounded rather than attempting general
natural-language interpretation. It covers the already-supported explicit
availability, time-window, duration, location, equipment, and named activity
forms, plus direct accepted sport preferences such as `Prefer swimming`.
Unrecognized accepted constraint or preference wording is no longer placed in
an `Applied accepted ...` assumption or given a constraint-aware session title.
It appears in the existing uncertainty surface with a direct request to compare
the proposal against that memory. Nothing is silently treated as understood.

Correction-only diff for `86aa31505985cb3b914513d2dd119bcc65722c67`:

```text
 src/server/ai/fixtures/synthetic-plan.test.ts | 130 ++++++++++++-
 src/server/ai/fixtures/synthetic-plan.ts      | 262 ++++++++++++++++++++++----
 src/server/plan-proposal/plan-safety.test.ts  |  21 +++
 3 files changed, 365 insertions(+), 48 deletions(-)
```

Nothing was deleted or renamed. All three paths state their purpose directly;
there is no non-obvious new file. The correction changes no schema, migration,
row, API shape, authorization/RLS path, credential, package, workflow, or
provider/spend behavior. It reuses the existing proposal assumptions,
uncertainties, safety considerations, and session fields, so no React, route,
or visible layout file changed. The selected frontend and React skills therefore
preserved the approved serious-coach 390px surface and server/client boundary
without introducing a new visual or bundle direction.

Focused local evidence:

| Command or check | Result |
| --- | --- |
| focused fixture, output-validation, proposal-service, and safety Vitest run | pass - 4 files, 107 tests |
| `npm.cmd run typecheck` | pass |
| `npm.cmd run lint` | pass |
| `npx.cmd playwright test --config=e2e/m3-03.playwright.config.ts --list` | pass - exactly 1 test at `390x844` collected |
| full local M3-03 Playwright execution | not run; no credential or local provider environment was improvised |
| `git diff --check` | clean |

New focused cases prove that accepted `Prefer swimming` selects swimming when
eligible, accepted `No swimming` wins over that preference, a safety signal
still pauses all despite the preference, the shipped weekday note caps weekday
sessions at 45 minutes without creating a safety consideration, a 30-minute
accepted cap and swimming prohibition win over looser note text, and
unrecognized accepted constraint wording is surfaced only as uncertainty.

CI and a matching READY Preview for
`86aa31505985cb3b914513d2dd119bcc65722c67` are pending the lead push. The
previous hosted migration and private-validator evidence remains applicable
because this correction has no database effect, but the matching fixture
behavior and visible uncertainty still require exact-commit CI, Preview, and
independent review before acceptance.

### Final exact-commit independent approval — 12 August 2026

The final implementation target is
`86aa31505985cb3b914513d2dd119bcc65722c67`. Its exact-SHA
[CI run 31639879356](https://github.com/mattiss01/fittip/actions/runs/31639879356)
completed green across lint/types/unit/build; migrations, RLS, advisors,
pgTAP, and concurrency; and every 390px production browser flow, including the
isolated M3-03 flow. The matching Vercel Preview reached READY at
`https://fittip-2lv3vdoy2-mattis-3657s-projects.vercel.app`.

The same independent reviewer who requested the earlier corrections re-read
the exact full `bd859db..86aa315` diff and returned **APPROVE** with zero
Standards findings and zero Spec findings. The reviewer reconciled all 48 files,
9,696 insertions, and 219 deletions with no omitted or unexpected file and no
deletion or rename.

The approval explicitly confirms:

- accepted sport preferences affect eligible fixture activity, while accepted
  prohibitions and server safety retain precedence;
- the shipped 45-minute weekday planning note constrains weekday sessions,
  accepted hard limits remain stricter, and planning-note prose never assigns
  safety severity;
- unrecognized accepted constraint or preference wording appears as bounded
  uncertainty and is never claimed as applied;
- modal accessibility, owner-local rollover, typed memory partial success,
  uncapped positive durations, fixture-only execution, proposal-only scope,
  authentication, RLS, owner-derived RPCs, replay, privacy, prompt budget, and
  the M3-03B/C seams remain correct;
- the earlier hosted migration, private-validator, authenticated 900-minute
  persistence, zero-minute rejection, RLS, privilege, and authenticated-owner
  evidence remains applicable because `a70a4ef..86aa315` changes no database,
  authorization, or persistence code.

The reviewer did not personally exercise an authenticated browser in this
focused final pass. Exact-SHA CI executed the M3-03 browser flow, and the product
owner's earlier matching hosted walkthrough supplies the manual visual,
keyboard, touch, and authenticated evidence. Product-owner acceptance of exact
commit `86aa31505985cb3b914513d2dd119bcc65722c67` remains the only open pre-merge
gate.
