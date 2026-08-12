# M3-03 validation record: selected-horizon plan proposal

**Ticket:** [M3-03](../../backlog/M3/M3-03-SELECTED-HORIZON-PLAN-PROPOSAL.md)

**Status:** **incomplete — first of two builder handoffs.** This record covers
the foundation half only. The commit below delivers no user-visible behavior and
is **not ready for independent review as a ticket** or for product-owner
acceptance; the second builder's commit completes it. M3-02 was delivered the
same way (`94880d6` then `8226887`).

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
