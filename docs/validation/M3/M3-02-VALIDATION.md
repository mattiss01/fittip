# M3-02 validation record: high-level roadmap proposal

**Ticket:** [M3-02](../../backlog/M3/M3-02-ROADMAP-PROPOSAL.md)

**Status:** **complete — ready for independent review.** The whole ticket is
delivered: schema, AI boundary, repository, domain orchestration, server
actions, the `390x844` interface, and the Playwright flow.

**Branch:** `ticket/m3-02-roadmap-proposal`

**Commits:**

- `94880d6` — schema, `fittip.roadmap.v2` contract, context allocation, model
  binding (first builder).
- `8226887` — repository, domain operation, server actions, interface,
  Playwright flow, and the defect fixes below (second builder).
- `403e025` — the workflow steps that actually run the concurrency harness and
  the browser flow. Separately committed as a tooling change.

**Base:** `851378c` (the docs-only commit that moved the ticket to
`in development`)

**Tier:** 1

---

## Read this first: what the second builder changed

The first builder delivered `94880d6` and left the interface half in an
unscoped work-in-progress commit. That commit is not in the history; its
contents were reshaped into `8226887` together with the work below.

Two defects the first builder found and reported unfixed, plus four found while
finishing, are fixed here. Each has a test that fails without the fix.

1. **The screen did not advance after generating.** The owner stayed on the
   compose form with their proposal already generated and invisible below it.
   The screen is now derived from the last response rather than remembered
   separately, so the review takes the compose form's place.
2. **A regeneration lost its predecessor after a decline.** ADR-015 and
   decision 4 require a regeneration to carry its immediately previous proposal
   and record that link. The only proposal read was `getOpenProposal`, which by
   construction cannot return a decided one — and declining is exactly what
   makes a regeneration possible. The surface therefore sent no
   `previousProposalId`, and the action refused the request as a first request
   carrying feedback. `getReviewProposals` now returns the open proposal **and**
   the declined predecessor from one read, and the surface offers
   **Regenerate proposal** from that server state, so it also survives a reload
   rather than living in one browser session.
3. **A superseded proposal came back as open.** An edit creates a new proposal
   without deciding its source, so once the edit was accepted the source
   reappeared under **Direction, not a promise.** as if it were still awaiting a
   decision. A proposal that an edit came from is now history.
4. **A proposal's own memory candidate blocked its acceptance.** Source
   references were recorded for every goal and memory item read, not for the
   ones that actually travelled. Acceptance requires every recorded memory
   source to still be `active`, so the `proposed` candidate extracted from the
   planning note — created by the same generation — made the proposal
   permanently unacceptable with "Your memory changed". Sources are now taken
   from the same two eligibility selectors that decide what the coach sees.
5. **Decision 3's "When to reassess" was missing.** Review points were marked on
   the spine but the named section under it did not exist.
6. **The lost-render defect reproduces on this surface.** See "The transition
   that never commits" below.

---

## The transition that never commits (M2-05, on this surface)

Measured here, before any fix: **three of six** local compose runs left the
screen on "Building your roadmap proposal…" for ever. In every case the server
had already answered `200` in about 300 ms with a complete payload — the action
result *and* the revalidated page including the rendered spine — and a manual
reload showed the proposal every time. No page error, no failed request.

That is M2-05's documented defect verbatim: "the server answers, but React
renders nothing further". The goal surface met it first and M2-02 reused its
watchdog; this surface reuses the same module rather than inventing a third
copy.

One deliberate difference: only the "a reply arrived and never rendered" half
is used. `watchGoalMutation`'s ten-second confirmation budget belongs to a form
save, and a roadmap generation is one provider call with no honest fixed
deadline, so a silent request keeps waiting behind the pending copy instead of
being declared unconfirmed while it is still legitimately running.

After the fix, six of six diagnostic runs and four of four full flow runs
converged without manual intervention.

**New copy, not in the ticket's approved list**, mirroring the memory surface's
wording and claiming nothing about saving:

- `This roadmap step did not appear. Reloading to show what is saved.`
- `Your last roadmap step did not appear, so this page was reloaded. What you
  see below is what is saved.`

The product owner should confirm both at acceptance.

---

## Delivered behavior

- `/home/plan/roadmap`, reached from a **Roadmap →** link on the plan editor.
  Empty state, **Create roadmap** / **Propose a new roadmap**, the
  **Shape your roadmap** compose step with the decision 4a disclosure, the
  proposal review on the roadmap spine, **Accept roadmap** / **Edit proposal** /
  **Decline proposal**, the decline confirmation, the regeneration compose with
  required feedback and its three-round ceiling, the structured editor, the
  separate **Possible memory updates** panel, and superseded-version history.
- An owner-derived transaction boundary that claims one paid attempt, persists a
  validated proposal with its minimized provenance, records inferred memory
  candidates independently, edits or declines a proposal, and accepts one as an
  immutable current roadmap version.
- A coaching context assembled from four sources — goals, memory, ADR-013
  training history, and the owner's planning note — under an explicit per-source
  byte allocation.
- A composition root that constructs a live coaching service only for a
  provider/model pair this repository can price, and a fixture one otherwise.
  Without `FITTIP_AI_LIVE=enabled` every path is network-free, which is what
  makes the flow safe to run on every push.

## Mobile demo path

`390x844`, against `build` + `start` on port 3017:

1. `/home/you/goals` — create one active core goal.
2. `/home/plan` → **Roadmap →** → `/home/plan/roadmap`, empty state.
3. **Create roadmap** → expand **What the coach will use** → write a planning
   note → **Generate roadmap proposal**.
4. Review: **Direction, not a promise.**, the spine with its phases, milestones
   and checkpoints, **What this assumes**, **When to reassess**, and the
   separate **Possible memory updates** panel.
5. **Decline proposal** → confirm → **Regenerate proposal** → feedback →
   **Generate another proposal**.
6. **Edit proposal** → change the title → **Save as a new proposal**.
7. **Accept roadmap** → `Version 1` and the accepted title.

Screenshots for every step: `docs/validation/M3/evidence/M3-02-*-390x844.png`.

## Changed files

```
 docs/decisions/ADR-013-AI-TRAINING-HISTORY-ELIGIBILITY.md |   43 +
 src/lib/supabase/database.types.ts                        |  450 +++++
 src/server/ai/budget.test.ts                              |    7 +-
 src/server/ai/budget.ts                                   |   25 +-
 src/server/ai/coach-ai-service.test.ts                    |  177 +-
 src/server/ai/coach-ai-service.ts                         |   27 +-
 src/server/ai/composition.test.ts                         |  219 +++
 src/server/ai/composition.ts                              |  204 +++
 src/server/ai/context-source.ts                           |  179 +-
 src/server/ai/context.test.ts                             |  676 +++++---
 src/server/ai/context.ts                                  |  331 +++-
 src/server/ai/contracts.ts                                |  194 ++-
 src/server/ai/enablement.ts                               |   28 +
 src/server/ai/fixtures/fixture-corpus.ts                  |  649 +++++--
 src/server/ai/idempotency.ts                              |    7 +
 src/server/ai/model-binding.ts                            |  140 ++
 src/server/ai/openai-adapter.test.ts                      |   16 +
 src/server/ai/openai-prompt.test.ts                       |  170 ++
 src/server/ai/openai-prompt.ts                            |  299 +++-
 src/server/ai/output-validation.test.ts                   |  304 +++-
 src/server/ai/output-validation.ts                        |  671 +++++++-
 src/server/ai/owner-text.test.ts                          |  109 ++
 src/server/ai/owner-text.ts                               |   88 +
 src/server/training/training-history-context.ts           |  302 ++++
 supabase/migrations/20260810213904_m3_02_roadmap_proposals.sql | 1821 ++++++
 supabase/tests/database/m3_02_roadmap_proposals.test.sql       | 1314 ++++++
 26 files changed, 7793 insertions(+), 657 deletions(-)
```

`git diff --stat 94880d6 8226887 403e025` — the second half, excluding this
record and the seven screenshots:

```
 .github/workflows/ci.yml                           |  13 +
 e2e/m3-02-roadmap.spec.ts                          | 316 ++++++
 e2e/m3-02.playwright.config.ts                     |  19 +
 package.json                                       |   1 +
 src/app/home/plan/roadmap/action-state.ts          |  42 ++
 src/app/home/plan/roadmap/actions.test.ts          | 286 ++++++
 src/app/home/plan/roadmap/actions.ts               | 373 ++++++++
 src/app/home/plan/roadmap/error.tsx                |  21 +
 src/app/home/plan/roadmap/loading.tsx              |  13 +
 src/app/home/plan/roadmap/page.test.tsx            | 236 +++++
 src/app/home/plan/roadmap/page.tsx                 | 264 +++++
 src/app/home/plan/roadmap/roadmap.module.css       | 579 ++++++++++
 src/components/planning/plan-editor.tsx            |   6 +
 src/components/roadmap/roadmap-editor.tsx          | 364 +++++++
 src/components/roadmap/roadmap-manager.test.tsx    | 466 ++++++++
 src/components/roadmap/roadmap-manager.tsx         | 771 +++++++++++++
 src/components/roadmap/roadmap-spine.tsx           | 171 +++
 src/server/ai/coach-ai-service.ts                  |  75 +-
 src/server/ai/composition.ts                       |   9 +-
 src/server/ai/context-source.test.ts               | 222 ++++
 src/server/ai/context-source.ts                    |  66 +-
 src/server/ai/context.ts                           |   7 +
 src/server/ai/contracts.ts                         |  15 +
 src/server/ai/fixtures/fixture-adapter.ts          |  22 +
 src/server/ai/fixtures/synthetic-roadmap.ts        | 256 +++++
 src/server/repositories/completion-repository.test.ts |  99 ++
 src/server/repositories/completion-repository.ts   |  67 ++
 src/server/repositories/roadmap-repository.test.ts | 245 +++++
 src/server/repositories/roadmap-repository.ts      | 531 +++++++++
 src/server/roadmap/roadmap-edit.ts                 |  62 ++
 src/server/roadmap/roadmap-records.ts              | 260 +++++
 src/server/roadmap/roadmap-service.test.ts         | 283 ++++++
 src/server/roadmap/roadmap-service.ts              | 236 +++++
 supabase/tests/integration/m3_02_concurrent_acceptance.mjs | 401 ++++++
```

Nothing was deleted or renamed in either commit.

Files from the second half whose purpose is not evident from path and diff:

- `src/server/roadmap/roadmap-records.ts` — the domain: horizon rules, the
  parsing of everything an owner can send, and `ROADMAP_COPY`, the one place
  decisions 3, 4, 4a and 4b's exact strings live. It is `server-only`, so the
  client components inline the same strings; the reviewer should compare them.
- `src/server/roadmap/roadmap-edit.ts` — builds the validation context an owner
  edit is re-checked against, so an edit passes through the same validator the
  model's own output does.
- `src/server/ai/fixtures/synthetic-roadmap.ts` — a roadmap derived from the
  request's own context, used only when no fixture case is named. Every corpus
  body carries fixed dates and fixed goal ids, so a real owner rejects all of
  them; this is what makes the surface demonstrable and the flow testable
  without a provider. It is not a model and claims nothing about coaching
  quality.
- `src/app/home/plan/roadmap/action-state.ts` — separate from `actions.ts`
  because a `"use server"` module may export nothing but async functions, and
  the client needs the initial state.
- `src/server/repositories/completion-repository.ts` — adds
  `listCoachingCompletions`, the only read that joins the recorded activities.
  `listCurrentCompletions` deliberately does not: the three screens that call it
  show no activities and would pay for a second query for nothing.
- `supabase/tests/integration/m3_02_concurrent_acceptance.mjs` — the acceptance
  race, which pgTAP cannot express in one session. Four rounds of six
  contenders, plus replay and cross-owner isolation.
- `src/components/planning/plan-editor.tsx` — a six-line **Roadmap →** link.
  Nothing else in that file changed.

Files from the first half whose purpose is not evident from path and diff:

- `src/server/ai/model-binding.ts` — the model, its rate card, and its limits as
  one indivisible value. Exists solely to close M3-01B limitation 17; see below.
- `src/server/ai/owner-text.ts` — the normalization the memory-excerpt check
  depends on, and the paired half of
  `public.roadmap_normalize_owner_text`. The two must change together or a
  candidate the application accepts is rejected by the database for a reason the
  owner cannot see.
- `src/server/training/training-history-context.ts` — ADR-013 decision 7's
  `selectTrainingHistoryContext`, in `src/server/training/` as the ADR specifies.
- `src/server/ai/budget.ts` — the rate card was **removed** from this module. A
  price beside the mechanism that spends it can drift from the model it prices,
  which is the whole of limitation 17.
- `src/server/ai/enablement.ts` — gains `readCoachAICredential`. The gate still
  refuses to *return* the credential, but the composition root needs the value,
  and `ai-privacy.test.ts` asserts the variable is named in exactly one module.
  Naming it in the composition root instead would have widened that invariant.
- `docs/decisions/ADR-013-...md` — a new "Recorded amendments" section. ADR-013
  states its tuning parameters may be amended provided the amendment is recorded
  there; this ticket sets them for the first time. **No existing decision text
  was changed.** Flagged explicitly for the reviewer and product owner.

## Data, migration, API, privacy, and security effects

### Migration

One forward migration, `20260810213904_m3_02_roadmap_proposals.sql`, applied
from zero on a clean reset. It has been applied **only to the local stack**. It
has not been applied to the founder Supabase project, and no remote or hosted
CLI command was run.

### Schema and RLS matrix

| Table | RLS | `authenticated` grant | Policies | Direct writes |
| --- | --- | --- | --- | --- |
| `roadmap_generation_requests` | enabled | column-level `SELECT`, **excluding `completion_token`** | owner `SELECT` | revoked from `public`, `anon`, `authenticated`, `service_role` |
| `roadmap_proposals` | enabled | `SELECT` | owner `SELECT` | revoked |
| `roadmap_proposal_sources` | enabled | `SELECT` | owner `SELECT` | revoked |
| `roadmap_proposal_decisions` | enabled | `SELECT` | owner `SELECT` | revoked |
| `roadmap_versions` | enabled | `SELECT` | owner `SELECT` | revoked |
| `roadmap_heads` | enabled | `SELECT` | owner `SELECT` | revoked |

Every owner policy is `(select auth.uid()) = user_id`. No table carries an
`INSERT`, `UPDATE`, or `DELETE` policy, because no client role holds the
privilege such a policy would qualify. Every table cascades from
`public.profiles`, so account deletion purges requests, proposals, sources,
decisions, versions, and the head.

`completion_token` is withheld from the column-level grant for the same reason
`settlement_token` is in M3-01B: an owner who could read it could finish their
own generation with content the server never validated.

### Functions

Five `SECURITY DEFINER` functions, all `search_path = ''`, all deriving the
owner from `auth.uid()`, none taking an owner argument (asserted in pgTAP), all
bounding their lock wait to three seconds, `EXECUTE` granted to `authenticated`
only and revoked from `PUBLIC`, `anon`, and `service_role`:

`begin_roadmap_generation`, `finish_roadmap_generation`,
`record_roadmap_memory_candidates`, `apply_roadmap_proposal_change`,
`accept_roadmap_proposal`.

Four internal helpers — `roadmap_normalize_owner_text`,
`roadmap_owner_text_hash`, `roadmap_content_is_valid`,
`roadmap_technical_codes_are_accepted` — are executable by no client role, so a
caller cannot use the accepted-model list or the normalization as an oracle.

`roadmap_content_is_valid` is `STABLE`, not `IMMUTABLE`: a text-to-date cast
depends on `DateStyle`, and `db lint` correctly refused the stronger claim.

### Source-currency semantics on acceptance

`accept_roadmap_proposal` rechecks each recorded source. A memory source is
compared by **revision number** rather than revision id, because the item view
the application reads exposes the number and memory revisions are append-only
and monotonic per item. Unrelated new goals, memory items, or completions create
no conflict, because only what actually travelled is recorded.

### Privacy

- A pending or failed generation request holds **only a 64-character SHA-256
  hash** of the planning note and the feedback. pgTAP asserts the table has no
  column that could hold owner text. The content is stored only on a proposal
  that was successfully persisted.
- `roadmap_proposal_sources` stores ids, revision ids, and revision numbers.
  No source content is copied.
- No raw prompt, provider body, settlement token, credential, or content-bearing
  error is stored in any of these tables or returned in any receipt.
- Telemetry is unchanged and still carries counts, not content.

### Types and packages

`src/lib/supabase/database.types.ts` regenerated through the documented
three-step sequence. **No dependency was added or changed.**

### Credentials

None used. No `.env*` file was read.

## The per-source context allocation (M3-01B decision 4)

The product owner approves these numbers at acceptance, so here is the
derivation rather than the assertion.

### What actually binds

Not ADR-013's "roughly 30,000 bytes". The binding constraint is M3-01B's
approved `maxInputTokens: 8_000` together with the adapter's refusal guard,
which estimates four characters per token over the **whole message set**. That
is a 32,000-character budget. The measured static prompt prefix for
`create_roadmap` is **5,789 characters**, leaving roughly 26,100 for the
serialized context.

ADR-013 estimated 30,000 bytes of context and M3-01B set 8,000 tokens against
that estimate, but neither figure accounted for the static prompt or for JSON
punctuation. **The two do not fit together.** Raising `maxInputTokens` changes
the reservation price and is therefore a spend decision belonging to the product
owner, so this ticket sized the context to the approved ceiling and recorded the
gap as limitation 4.

### Measurements

Taken against the shared synthetic corpus at
`docs/decisions/support/m3-01b-bakeoff/scenarios/`:

| Scenario | goals | memory | training | compact bytes |
| --- | --- | --- | --- | --- |
| cold-start | 2 (329 B) | 3 (655 B) | 0 | 1,095 |
| injury-active | 4 (680 B) | 3 (707 B) | 6 (3,097 B) | 4,911 |
| returning-trail-runner | 5+2 (1,219 B) | 6 (2,527 B) | 12 (6,143 B) | 10,425 |
| strength-athlete | 4+1 (758 B) | 4 (996 B) | 6 (3,009 B) | 5,038 |

Per-item: a session is 393–625 bytes (mean 511); a memory item is 177–1,082
bytes (mean 420); a goal is about 170 bytes measured and 326 at maximum field
lengths.

Indented serialization measured 21–32% larger than compact across the four
scenarios, so the request now sends compact JSON. At an 8,000-token ceiling,
indentation was a fifth of the input budget spent on whitespace.

### The approved table

| Source | Max items | Bytes | Basis | On overflow |
| --- | --- | --- | --- | --- |
| Targetable goals | 12 | 4,000 | 12 × 326 worst case = 3,912 | deny, source named |
| Historical goals | 8 | 2,400 | 8 × 300; background only | deny, source named |
| Memory | 20 | 5,600 | mean 420 B/item; max item 1,082 | deny, source named |
| Training history | 20 sessions | 5,800 | mean 511 B/session | **trim + disclose** |
| Plan commitments | 12 | 1,400 | about 115 B/entry | **trim + disclose** |
| Planning note | 1 | 1,200 | ADR-014 decision 4, fixed | reject at compose |
| Regeneration feedback | 1 | 600 | ADR-014 decision 4, fixed | reject at compose |
| Previous proposal | 1 | 2,200 | reduced form, regeneration only | deny, source named |
| **Sum of parts** | | **23,200** | | |
| **Envelope + total** | | **24,000** | 800 for keys, dates, goal ids | |

Worst case: 5,789 + 64 + 24,000 = 29,853 characters ≈ 7,464 estimated tokens
against the 8,000 ceiling, about 7% headroom. A test asserts it.

### Two properties that matter more than the numbers

**The sum of the parts is below the total.** That is what makes the whole-context
check unable to fire before a per-source check has named a source. ADR-014's
finding was not only that 40 memory items at 1,000 characters was 40,000 bytes
against a 12,000-byte total — it was that assembly denied without saying which
source was at fault. `CoachAIContextTooLargeError` now carries the source.

**Training history reduces rather than denying.** It is the one source the owner
cannot see or curate; refusing to generate because they trained a lot would be a
refusal they could not act on. ADR-013 decisions 1 and 7 approve a bounded,
disclosed reduction, so sessions are added newest-first until either the count
cap or the allocation binds, and `sessionsIncluded` against `sessionsInWindow`
travels with them.

### ADR-013 tuning parameters set here

`note` truncation 2,000 → **400**; `replacement_description` and
`correction_reason` 500 → **240**; session cap **20**; forward locked-entry
window **180 days**. Twenty sessions at the drafted 2,000-character note
allowance is 40,000 bytes for one field, against a 5,800-byte allocation — the
drafted number cannot coexist with any session count worth having. 400 is two to
six times the longest note in the corpus, and decision 4's argument survives
because the explaining sentence comes first. Recorded in ADR-013 as that ADR
instructs.

## M3-01B limitation 17: the model bound to its rate card

**Closed.** `src/server/ai/model-binding.ts` holds the provider code, model
code, rate card, and limits as one `CoachAIModelBinding`. The rate card was
deleted from `budget.ts`; there is no longer a second constant to drift from the
first. A card cannot be obtained without naming the model it prices.

`createRoadmapCoachAIService` resolves the configured provider and model through
`requireLiveCoachAIModel`, which throws `provider_unconfigured` on any pairing
not in the approved list. This happens **before** an adapter is constructed and
**before** the credential is read, so a mismatch opens no socket and reads no
secret. It also refuses the fixture binding on a live path, so a real call
cannot be priced at zero.

`public.roadmap_technical_codes_are_accepted` repeats the check inside the
database, where the application cannot reach it, and additionally requires a
live result to carry a settled same-owner `create_roadmap` reservation priced by
the same rate card.

Proven by:

- `composition.test.ts` — "refuses to construct a service when the model is not
  the model its card prices" (`FITTIP_AI_MODEL=gpt-5.5` against an otherwise
  fully valid founder environment), plus provider mismatch, missing ledger, and
  fixture-on-live-path.
- pgTAP — "a model that is not the model its rate card prices is refused" and
  "a live result with no spend reservation is refused".

## Tests and final results

**CI run for the reviewed commit:**
<https://github.com/mattiss01/fittip/actions/runs/31499399415> for `403e025`.
Its result is recorded with acceptance under the evidence-commit exception: a
record cannot contain the run URL of the commit that adds it, and the commit
after this one changes only this record.

The first half's run remains
<https://github.com/mattiss01/fittip/actions/runs/31438850506> — **success**,
all three jobs green, for `dd95711` (`94880d6` plus its record).

Worth flagging to the reviewer: the branch's base commit `851378c` — docs-only,
containing none of this work — produced a **red** run (`31434464581`), an
`M1-04 Today and Progress` timeout at `apiRequestContext.delete`. The same flow
is green on the run above with this ticket's changes applied, so it was flaky
rather than a defect, and no known-defect exception is claimed or needed.

The table below records what CI does not cover, plus what was observed locally
while building. The database rows are from the first half and were re-checked
only where this half touched them.

| Command or check | Result |
| --- | --- |
| `npx supabase db reset --local` | all 11 migrations applied from zero |
| `npx supabase db lint --local --level warning --fail-on warning` | `No schema errors found` |
| `npx supabase db advisors --local --type all --level warn --fail-on warn` | `No issues found` |
| `npx supabase test db --local supabase/tests/database` | 9 files, 618 assertions, `Result: PASS` (106 new) |
| `npm run test:m3-02-concurrency` | `4 rounds of 6 contenders, replay, and cross-owner isolation all held` |
| `npm run lint` | clean |
| `npm run typecheck` | clean |
| `npm run test:run` | 70 files, 716 tests passed |
| `npm run build` | succeeded, with the known multiple-lockfile workspace-root warning |
| `git diff --check` | clean (line-ending warnings only) |
| Playwright `390x844`, `e2e/m3-02.playwright.config.ts`, port 3017, against `build` + `start` | **4 consecutive passes** after the fixes, ~8-11 s each; 7 screenshots captured |
| Hosted migration / Preview verification | **not done — the lead's step** |
| Live provider call | **none made.** `FITTIP_AI_LIVE` was never set, so every run resolved to the fixture composition. |

### Tests added or changed

New in the second half, each covering a defect above:

- `src/server/repositories/roadmap-repository.test.ts` (14) — the declined
  predecessor survives a decline, a superseded source is not open, an accepted
  proposal offers no predecessor, the `PT409`/`PT429` reason mapping, and that a
  database message never reaches the caller.
- `src/components/roadmap/roadmap-manager.test.tsx` (12) — the compose screen
  gives way to the review, the editor still opens with that result on screen,
  the regeneration carries `previousProposalId` with a prefilled editable note
  and empty feedback, the three-round ceiling, the exact decline confirmation,
  no percentage or confidence anywhere, and the lost-render reload.
- `src/app/home/plan/roadmap/page.test.tsx` (7) — one owner-scoped read pass,
  the predecessor handed to the surface after a decline, the remaining-round
  arithmetic, and the three redirect/boundary paths.
- `src/app/home/plan/roadmap/actions.test.ts` (13) — the regeneration reaches
  the domain with its predecessor and feedback, feedback without a predecessor
  and a predecessor without feedback are both refused before any provider call,
  the owner's draft comes back on a rejection, and every conflict maps to an
  honest state.
- `src/server/roadmap/roadmap-service.test.ts` (9) — only the immediately
  previous proposal travels and only in reduced form, a missing predecessor
  fails before a key is consumed, the fingerprint carries lengths not content, a
  completed claim calls no provider, and a memory-candidate conflict leaves the
  roadmap valid.
- `src/server/ai/context-source.test.ts` (4) — `sport` and `title` come from the
  recorded activity (limitation 5), sources are ids and revisions only, a record
  that never reached the coach is not recorded as a source (defect 4), and a
  today disagreement refuses.
- `src/server/repositories/completion-repository.test.ts` — one added case for
  `listCoachingCompletions`, asserting the activity join, its `sport`, and the
  owner predicate on all three reads.

New in the first half: `composition.test.ts` (11), `owner-text.test.ts` (11),
`openai-prompt.test.ts` (11), `m3_02_roadmap_proposals.test.sql` (106
assertions).

Substantially rewritten: `context.test.ts` (20, now covering the per-source
allocation, ADR-013 trimming and disclosure, and the flag-without-inference
rule), `output-validation.test.ts` (41, now covering the v2 contract, the
independent memory section, and a six-case ADR-014 decision-4 injection suite),
`fixture-corpus.ts` (32 authored cases).

Mechanically updated for the new context and compose shapes:
`coach-ai-service.test.ts`, `openai-adapter.test.ts`, `budget.test.ts`.

### Source selection and output schema versions

- `COACH_AI_SCHEMA_VERSIONS.create_roadmap`: `fittip.roadmap.v1` →
  **`fittip.roadmap.v2`**.
- `COACH_AI_PROMPT_VERSIONS.create_roadmap`: `roadmap-stub-v1` →
  **`roadmap-v2-2026-08-10`**. M3-01B recorded that real prompt text was
  shipping under a stub identifier; that is now corrected.
- Source selection: `selectActiveGoalContext` (ADR-012),
  `selectActiveMemoryContext` (M2-02), `selectTrainingHistoryContext`
  (ADR-013), plus the ADR-014 planning note.
- Seven-day plan is untouched at `fittip.seven-day-plan.v1`.

### Idempotency and transaction evidence

From pgTAP, all against a real Postgres:

- Same key and fingerprint replays the claim and creates no second request; a
  different fingerprint under the same key is `PT409`.
- Replaying a completion token returns the existing proposal; different content
  against a finished request is `PT409`.
- A memory-candidate batch replays to the same items rather than duplicating.
- Replaying a decline and an identical edit each return the existing receipt.
- Replaying acceptance returns the existing version and creates no second one.
- A proposal racing a stale expected head is `PT409` with no partial version.
- A regeneration requires an owned, declined, same-horizon predecessor and
  non-empty feedback; the fourth is refused with `PT429` **before any provider
  call**.
- A failed attempt records a bounded safe code, no proposal, and leaves the
  current roadmap unchanged.

The concurrency case a single-connection pgTAP file cannot prove — two genuinely
simultaneous acceptances — is **not covered**. See limitation 6.

### Leakage scan

- **Client bundles:** no client component was added. `npm run build` shows no
  new client entry. `src/architecture/server-boundary.test.ts` passes.
- **Telemetry:** `CoachAITelemetryRecord` is unchanged and copies field by field
  from an allowlist. `ai-privacy.test.ts` passes, including "names the
  credential variable in one place only" — which caught the composition root
  reading `FITTIP_AI_API_KEY` directly and led to `readCoachAICredential`.
- **Errors:** `CoachAIError` messages still come from a fixed table.
  `OwnerTextValidationError` never echoes the submitted text, asserted by test.
- **Database:** every function returns a content-free receipt except a proposal
  id. Owner text is hashed on a pending request.
- **URLs and snapshots:** no route or screenshot exists yet.
- **Prompt:** `openai-prompt.test.ts` asserts no owner content appears in the
  cacheable static prefix.

### Confirmation of what was not added

No detailed selected-horizon plan, session, or activity catalog. No direct model
write — the AI cannot persist, accept, or mutate anything, and
`roadmap_envelope_extra_field` proves a `goalUpdates` field is rejected in full.
No friend data, external user, or public registration. No non-M0-06A hosted
behavior. No analytics sink. No new secret, dependency, remote resource,
provider, model, or spend ceiling. **No provider API call was made** — not to
explore, not to sanity-check, not once.

## Known limitations

All nine were re-checked against what is true at `403e025`.

1. ~~**The ticket is roughly half delivered.**~~ **Closed.** The interface,
   actions, repository, domain operation and mobile flow are delivered, and the
   flow passes at `390x844`.
2. **The luna available-days defect is not re-tested.** M3-01B recorded that on
   one of two cold-start runs `gpt-5.6-luna` placed sessions outside the
   athlete's stated available days. M3-02 owns re-testing it against the real
   prompt. That belongs to the lead's single live validation pass under
   separately granted spend approval, and it has **not** happened.
3. **The v2 prompt has never met a model.** It was drafted off-API against the
   synthetic corpus, and every test runs against authored fixtures. Whether
   `gpt-5.6-luna` can actually hold contiguous non-overlapping phase coverage
   and exact planning-note excerpts is unproven.
4. **The context ceiling is tighter than ADR-013 anticipated.** 24,000 bytes,
   not 30,000, because `maxInputTokens: 8_000` and a 5,789-character prompt
   prefix do not leave 30,000. In a rich history this trims the window to
   roughly 11 sessions of the 20-session cap. The trim is disclosed and never
   denies, but the product owner may wish to raise `maxInputTokens` — a spend
   decision I did not make.
5. ~~**`sport` is null on every completion reference.**~~ **Closed, verified.**
   A completion still carries no sport column of its own — both `title` and
   `sport` live on `completed_activities` — so the coaching path now reads them
   through a join that `listCurrentCompletions` deliberately does not do.
   Verified by `completion-repository.test.ts` (the join, its `sport`, and the
   owner predicate on all three reads) and `context-source.test.ts` (the value
   reaching `training.completions`). A session logged as several activities is
   named by the first; the rest travel in `activityNames`.
6. ~~**No concurrency harness.**~~ **Closed, verified — but it did not work as
   delivered.** `m3_02_concurrent_acceptance.mjs` existed in the work-in-progress
   commit with no npm script and no workflow step, so it had never run. Run for
   the first time here, it failed immediately: it seeded its goal with a
   service-role insert into `goals`, which the grants refuse — `authenticated`
   has only `select` and the service role has no write at all. It now seeds
   through `apply_goal_change`, exactly as the application does. It then passed
   on every run: `4 rounds of 6 contenders, replay, and cross-owner isolation
   all held`. `npm run test:m3-02-concurrency` and a CI step were added so it
   keeps running.
7. **Adherence is judged by date, not by planned-session id.** The current-plan
   read does not expose planned-session ids, so a planned date with no
   completion on it counts as a miss. Coarser than an id join; it never invents
   a miss.
8. **ADR-013 was edited.** A new "Recorded amendments" section, which that ADR
   explicitly instructs. No existing decision text changed. The reviewer and the
   product owner should confirm they accept it being recorded that way.
9. **Nothing is deployed.** No push to the founder project, no Preview
   verification, no hosted migration. The lead's step, and the one that must
   happen before acceptance: this ticket adds a migration, so the Preview does
   not prove itself.

Raised while finishing this half:

10. **Completion source references are broader than what travels.** Goal and
    memory sources are now exactly the eligible records (defect 4), but every
    completion the owner has ever recorded is still listed, while ADR-013 sends
    only the bounded window. The context carries no completion ids, so filtering
    them would mean threading ids through the assembled context. The direction
    of the error is the safe one — acceptance re-checks more than it must, never
    fewer — but a correction to an old, unsent completion will conflict a
    pending proposal with "Your training history changed". Worth a follow-up
    ticket rather than a change here.
11. **The lost-render defect is mitigated, not fixed.** The surface recovers by
    reloading; the underlying transition failure is M2-05/M2-09's and is
    untouched. Three of six local compose runs hit it. An owner will
    occasionally see a brief notice and a reload where nothing should have
    happened at all.
12. **Two new copy strings** are not from the ticket's approved list. See "The
    transition that never commits" above. They need the product owner's word at
    acceptance.
13. **The synthetic fixture roadmap is not a coach.** Everything demonstrable on
    a Preview without `FITTIP_AI_LIVE` comes from
    `synthesizeRoadmapBody`: structurally valid, deterministic, and deliberately
    dull. It proves the surface and the transactions, and says nothing about
    whether a real proposal would be any good. Limitations 2 and 3 are what
    answer that.

## Independent reviewer checklist

Review `git diff 851378c..403e025`, and confirm the CI run above is green for
`403e025`. Do not re-run lint, typecheck, tests, or build — CI ran them.

Judgment CI cannot supply, on the second half:

1. **The predecessor rule.** `getReviewProposals` decides both what is open and
   what a regeneration may carry. Is "the newest proposal, if it is rejected"
   the right definition of the immediately previous proposal, given that
   `begin_roadmap_generation` independently requires an owned, rejected,
   same-horizon predecessor? Can a chain longer than one round leak through it?
2. **The superseded rule.** A proposal that an edit came from is treated as
   history. Check the twenty-row read window: can a real history push a still-open
   proposal past it?
3. **Source recording.** Sources now come from `selectActiveGoalContext` and
   `selectActiveMemoryContext` — the same selectors `buildCoachAIContext`
   applies. Are they genuinely the same set that travels, or can the assembler
   drop something afterwards that would then be recorded but unsent?
4. **The exact copy.** `ROADMAP_COPY` is `server-only`, so the client components
   inline the same strings. Compare them against decisions 3, 4, 4a and 4b
   character by character, and judge the two new watchdog strings, which no
   decision covers.
5. **The watchdog.** It reloads the page on the owner's behalf. Can it fire
   while a legitimate generation is still running? Does its notice claim
   anything about what was saved? Is the session-storage marker free of user
   content?
6. **Honest states.** Empty, pending, conflict, cap-reached, expired session,
   provider failure. Does any of them imply a roadmap was stored when it was
   not, or invent a training fact?

Judgment CI cannot supply, on the first half:

1. **The model/rate-card binding.** Is there genuinely one value, or two that
   agree? Can any path obtain a rate card without naming the model it prices?
   Does the refusal happen before a credential is read?
2. **The per-source allocation.** Check the arithmetic against the measurements.
   Is the sum of the parts really below the total, and does that hold if
   `create_seven_day_plan`'s table is used? Is the deny/reduce split defensible
   per source, or is training history's reduction a convenience?
3. **ADR-015 fidelity.** Compare the migration against the ADR function by
   function: signatures, arguments, idempotency keys, rollback boundaries. The
   memory source check departs from the ADR's "same current eligible revision"
   by comparing revision numbers rather than ids — is that equivalent?
4. **The narrow ADR-010 amendment.** Can `record_roadmap_memory_candidates`
   produce anything other than a `proposed` / `inferred_proposed` item? Can it
   accept, enable, edit, or delete one? Can feedback-only text reach memory
   through any path in either the function or the validator?
5. **ADR-014 decision 4.** The injection suite in `output-validation.test.ts`
   covers six escalations. Is any of the ADR's listed properties unproven?
6. **The ADR-013 amendment.** Is recording the tuning parameters in the ADR the
   right call, and are 400/240/240/20/180 defensible?
7. ~~**Limitation 5**~~ — closed above; confirm the fix rather than the gap.
