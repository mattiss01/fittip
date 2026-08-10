# M3-02 validation record: high-level roadmap proposal

**Ticket:** [M3-02](../../backlog/M3/M3-02-ROADMAP-PROPOSAL.md)

**Status:** **incomplete — not ready for independent review or acceptance.**
The data and coaching-boundary half of the ticket is delivered and green. The
repository, domain orchestration, server actions, `390x844` interface, and
Playwright flow are **not delivered**. See "What is not delivered" below before
reading anything else.

**Branch:** `ticket/m3-02-roadmap-proposal`

**Commit:** `94880d6b415d0479668f4e4d121f98f1ef37a829`

**Base:** `851378c` (the docs-only commit that moved the ticket to
`in development`)

**Tier:** 1

---

## Read this first: the ticket is not finished

M3-02 was dispatched as one slice covering schema, AI boundary, and user
interface. This commit delivers the first two. It delivers no user-visible
behavior at all.

**Delivered:**

- The complete ADR-015 schema: six tables, five `SECURITY DEFINER` functions,
  grants, RLS, and a 106-assertion pgTAP suite.
- `fittip.roadmap.v2` as an accepted contract, with its validator, its prompt,
  its response grammar, and an authored fixture corpus.
- The four-source context assembly ADR-013 and ADR-014 require, with the
  per-source byte allocation M3-01B decision 4 deferred to this ticket.
- The live composition root, closing M3-01B limitation 17.

**Not delivered:**

- `src/server/repositories/roadmap-repository.ts` — no application code calls
  any of the five functions. They are exercised only by pgTAP.
- The domain operation that sequences claim → provider call → persist →
  memory candidates.
- `src/app/home/plan/roadmap/` — page, actions, error and loading states.
- Every component: compose screen, roadmap spine, structured edit form, decline
  confirmation, regeneration compose, memory-candidate panel, history.
- `e2e/m3-02-roadmap.spec.ts` and its Playwright config.
- The `390x844` demo path, which cannot exist without the above.

The honest reason is scope against a single builder session, not a blocker: no
decision was missing and nothing was ambiguous. The work below is complete on
its own terms and is a usable foundation, but the ticket's acceptance criteria
1, 4a's compose disclosure, 4b's review panel, and the whole "User flow at
390px" section are untouched.

**Recommendation to the lead:** do not request independent review or
product-owner acceptance against this commit. Either dispatch a second builder
for the remaining half on this branch, or ask the product owner to split the
ticket. The product owner explicitly chose "one ticket, not a data/UI split" at
dispatch, so splitting it now is their decision to reverse, not mine.

One thing genuinely does not need to wait: the **per-source context allocation**
below is the deferred M3-01B decision 4, and it is implemented, measured, and
tested. It can be reviewed and approved independently of the interface.

---

## Delivered behavior

No user-visible behavior. What exists is the boundary an interface would call:

- An owner-derived transaction boundary that can claim one paid attempt, persist
  a validated proposal with its minimized provenance, record inferred memory
  candidates independently, edit or decline a proposal, and accept one as an
  immutable current roadmap version.
- A coaching context assembled from four sources — goals, memory, ADR-013
  training history, and the owner's planning note — under an explicit per-source
  byte allocation.
- A composition root that constructs a live coaching service only for a
  provider/model pair this repository can price, and a fixture one otherwise.

## Mobile demo path

**None.** There is no route, no page, and no component. Nothing can be
demonstrated at `390x844`.

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

Nothing was deleted or renamed.

Files whose purpose is not evident from path and diff:

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

There is no CI run URL yet: the commit was pushed at the moment this record was
written. `.github/workflows/ci.yml` runs on `ticket/**`, so a run exists for
`94880d6b415d0479668f4e4d121f98f1ef37a829` and **the lead must record its URL
and conclusion here before any review.** Everything below is a local observation
made while building, not a substitute for that run.

| Command or check | Result |
| --- | --- |
| `npx supabase db reset --local` | all 11 migrations applied from zero |
| `npx supabase db lint --local --level warning --fail-on warning` | `No schema errors found` |
| `npx supabase db advisors --local --type all --level warn --fail-on warn` | `No issues found` |
| `npx supabase test db --local supabase/tests/database` | 9 files, 618 assertions, `Result: PASS` (106 new) |
| `npm run lint` | clean |
| `npm run typecheck` | clean |
| `npm run test:run` | 64 files, 655 tests passed |
| `npm run build` | succeeded, with the known multiple-lockfile workspace-root warning |
| `git diff --check` | clean |
| Playwright `390x844` | **not run — no flow exists** |
| Hosted migration / Preview verification | **not done — lead's step, and premature** |
| Live provider call | **none made** |

### Tests added or changed

New: `composition.test.ts` (11), `owner-text.test.ts` (11),
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

1. **The ticket is roughly half delivered.** Everything in "What is not
   delivered" above remains. This is the limitation that matters.
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
5. **`sport` is null on every completion reference.** A completion carries no
   sport of its own in the current model; the first activity's name stands in
   for `title`. ADR-013 decision 4 lists session `title` and `sport` as sendable,
   so this is a real gap against the ADR, not a design choice.
6. **No concurrency harness.** M1-01, M2-01, and M3-01B each have one under
   `supabase/tests/integration/`. Two genuinely simultaneous acceptances against
   the same head are proven only by the advisory lock and the `for update`, not
   by a test.
7. **Adherence is judged by date, not by planned-session id.** The current-plan
   read does not expose planned-session ids, so a planned date with no
   completion on it counts as a miss. Coarser than an id join; it never invents
   a miss.
8. **ADR-013 was edited.** A new "Recorded amendments" section, which that ADR
   explicitly instructs. No existing decision text changed. The reviewer and the
   product owner should confirm they accept it being recorded that way.
9. **Nothing is deployed.** No push to the founder project, no Preview
   verification, no hosted migration.

## Independent reviewer checklist

**Do not review this commit for acceptance.** It does not deliver the ticket.
If the lead wants an early read on the delivered half, review
`git diff 851378c..94880d6b415d0479668f4e4d121f98f1ef37a829` and confirm CI is
green for `94880d6b415d0479668f4e4d121f98f1ef37a829` before anything below. Do
not re-run lint, typecheck, tests, or build.

Judgment CI cannot supply:

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
7. **Limitation 5** — `sport` always null — is a real ADR-013 gap. Confirm
   whether it blocks.
