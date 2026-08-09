# M3-01B: One approved real-provider adapter

**Status:** proposed — not approved for implementation. The provider decision is
settled (OpenAI, 8 August 2026), along with the account/credential posture, the
data-use terms, and the live-test data source. Still blocked on decisions 1b, 4,
5, 6, and 8 below, and decision 4 is itself blocked on ADR-013 and ADR-014 being
accepted

**Milestone:** M3

**Priority:** P1

**Depends on:** [M3-01 accepted](M3-01-LOCAL-AI-ADAPTER-CONTROLS.md)

**Architecture boundary:** [ADR-006](../../decisions/ADR-006-LOCAL-OWNER-AI-MVP.md),
[ADR-007](../../decisions/ADR-007-FOUNDER-HOSTED-STAGING.md),
[ADR-012](../../decisions/ADR-012-AI-GOAL-CONTEXT-ELIGIBILITY.md), and
[M0-06A](../M0/M0-06A-FOUNDER-HOSTED-STAGING.md) before hosted use

**Blocks:** [M3-02](M3-02-ROADMAP-PROPOSAL.md),
[M3-03](M3-03-SELECTED-HORIZON-PLAN-PROPOSAL.md), and
[M3-05](M3-05-M3-VALIDATION-SLICE.md)

## Why this is a separate ticket

Split out of M3-01 on 3 August 2026. M3-01 builds the entire boundary —
authorization, context allowlist, schema validation, budget accounting,
fail-closed behavior — against deterministic fixtures, needing no provider, no
credential, no network call, and no spend. Only the real adapter is gated on a
decision the product owner has not made, so keeping them in one ticket would
have blocked a large piece of work behind a small one.

Splitting also improves the boundary. An interface whose only implementation is
one provider tends to become shaped like that provider. M3-01's fixtures are
written against the contract alone, so the first real adapter has to fit the
contract rather than the other way round.

## Outcome

Add exactly one real-provider adapter behind the accepted `CoachAI` interface,
plus the durable rate/budget/idempotency state a hosted deployment needs, so a
verified owner can generate a schema-validated proposal from real model output
inside approved hard limits.

## Scope

1. One adapter implementing the accepted `CoachAI` contract for the approved
   provider and model. No second provider.
2. Structured/JSON-schema-constrained output at the provider boundary where the
   provider supports it, in addition to — never instead of — M3-01's own
   validation. Provider output stays untrusted.
3. A server-only credential path: uncommitted, never `NEXT_PUBLIC_`, never in
   logs, errors, telemetry, fixtures, snapshots, or client bundles.
4. Durable fail-closed rate, budget, and idempotency state that survives a
   Vercel instance change. M3-01's in-memory policy is local-only.
5. Cost reservation before the call and reconciliation against provider-reported
   usage after it. Unknown or stale price state denies.
6. Opt-in live contract test using only owner or synthetic data, inside the
   approved cap, skipping safely when configuration is absent.

## How this is built without paying for iteration

Follows the approach in [the M3 backlog](M3-BACKLOG.md#delivery-approach--how-m3-gets-built-without-paying-for-iteration).
Two points bind this ticket specifically.

**The adapter's own behavior is proven against a stub HTTP endpoint**, not
against the provider. The stub returns controlled status codes, bodies, delays,
and hangs, so timeout, retry-off, error mapping, and partial-response handling
are tested deterministically and in continuous integration. A local model server
was considered and rejected — it buys nothing the stub does not and adds a heavy
local dependency.

**Real provider calls are a single bounded validation pass**, roughly 20–50
requests, confirming the three things only the real API can show: that
structured-output enforcement actually holds, that the prompt behaves the same
through the API as it did during off-API drafting, and what real token counts
and latency are. Record those numbers — the budget accounting built in M3-01 is
calibrated against guesses until this pass replaces them with measurements.

Everything else — prompt drafting, quality and safety review, valid-shape
fixtures — happens off-API on a chat subscription before this ticket starts.

## Carried forward from M3-01's independent review

Four things M3-01 left safe-but-incomplete because nothing calls the boundary
yet. Each becomes live the moment a real adapter exists, so they are
requirements here rather than notes.

1. **The live enablement gate must not key on something the adapter asserts
   about itself.** Today it runs only when `adapter.kind === "provider"`. A
   provider adapter copy-pasted from `FixtureCoachAI` would inherit
   `kind: "fixture"` and call out with no runtime check, no live flag, no owner
   allowlist, and no credential check — and no invariant would catch it. Make
   the gate unconditional, or key it on something structural the adapter cannot
   declare, and add an architecture invariant that fails if a module reaching
   the network can bypass it.
2. **Widen `hasPublicAIVariable`.** Its `/(^|_)AI(_|$)/` pattern does not match
   `NEXT_PUBLIC_OPENAI_KEY`, `NEXT_PUBLIC_ANTHROPIC_KEY`, or
   `NEXT_PUBLIC_GEMINI_KEY`. Once this ticket names a provider, add that
   provider's name to the pattern and correct the comment, which currently
   claims more than the code does.
3. **Release the concurrency slot on settlement, not on deadline.**
   `maxConcurrentRequests` counts reservations rather than live calls, so a
   timed-out request stays open and billable at the provider while a second is
   admitted. Spend ceilings hold either way; the concurrency guarantee does not.
4. **Fix telemetry's environment for non-provider runs** and extend the
   database-seam invariant to match `@supabase/supabase-js` directly, so a
   future file cannot construct its own client inside the subtree.

## Non-goals

- No second provider, no fallback chain, no provider-routing gateway.
- No change to the accepted `CoachAI` contract. If the adapter cannot fit it,
  stop and report — that is a finding about the interface, not licence to widen
  it here.
- No proposal persistence, roadmap or plan UI, chat, streaming, or replan.
- No friend data, external tester, public registration, or production path.

## Open decisions — all required before dispatch

The product owner must approve each explicitly. Decisions 1a, 2, 3, and 7 were
settled in the 8 August 2026 session and are marked below; the rest are open and
still block dispatch.

1. **Provider and model**, chosen against structured-output reliability,
   coaching quality on health-adjacent content, latency, and price.
   - **1a — provider. Resolved 8 August 2026: OpenAI.** Chosen for
     grammar-enforced structured output (`strict: true` compiles the JSON schema
     into a context-free grammar at sampling time, rather than requesting
     compliance), automatic prompt caching that needs no `cache_control`
     plumbing, and existing credit. The ticket's own analysis stands: cost is a
     model-tier question, not a provider question. Reversal cost is one adapter
     file against an unchanged contract.
   - **1b — model. Open, and deliberately empirical.** At 50–200 development
     calls the spend difference across the whole tier range is roughly €0.20
     against €20, so cost carries no signal. The risk that matters is the
     opposite one: proving the concept on a model too small to do it, and
     recording that in M3-02 as a product finding rather than a tier artifact.
     Settled by a bake-off against the synthetic athlete, scored on schema
     conformance, safety-signal adherence, measured tokens and latency, and the
     product owner's own read of coaching quality.
   - The harness, the synthetic corpus, and the selection rule live in
     [`docs/decisions/support/m3-01b-bakeoff/`](../../decisions/support/m3-01b-bakeoff/README.md).
     **The rule is the cheapest tier that clears both a mechanical gate and the
     product owner's judgement — not the best model.** Start capable so a failure
     is a real product finding rather than a tier artifact, walk down until a
     gate breaks, take the tier above the break.
   - The corpus in that directory is the one M3-02 and M3-03 reuse for prompt
     tuning. Do not author a second one; extend that one and say why.
   - **Still open after the 9 August API run, and deliberately so.** `gpt-5.5`
     is proven: 8 of 8 under real `strict: true`, every must-pass probe clean.
     `gpt-5.6-luna` held the contract 8 of 8 at **1/25th the price** but put
     sessions outside the athlete's stated available days on one of two
     cold-start runs — a structural probe reading `date`, so a real miss rather
     than a text artifact. `gpt-5-mini` and `gpt-5-nano` are **unresolved**:
     that run capped output at 4,000 tokens and their reasoning consumed it, so
     nothing was learned about their capability. See the run record below.
     Choosing `gpt-5.5` now is defensible and costs about a euro a month at
     founder scale; choosing `gpt-5.6-luna` needs the intermittent miss
     characterised first.
2. **Account and credential**: whose account, which key, what scope, who
   rotates it.
   - **Resolved 8 August 2026.** A dedicated OpenAI project for FitTip, a
     project-scoped key used nowhere else, and a hard monthly spend cap set **at
     OpenAI**. The provider-side cap is the point: every ceiling in `budget.ts`
     is this repository's own code and fails open if that code is wrong, so the
     only ceiling that survives a bug in the reservation path is one the
     application cannot reach. Key in `.env.local` locally and a Vercel
     **production-target** variable for founder staging. The product owner
     rotates.
3. **Data-use and retention terms**: training on inputs, human review,
   retention window, deletion, region, and subprocessors. This carries more
   weight than usual — the context can contain injury, illness, and fatigue
   signals. A provider tier requiring extended retention is a decision, not a
   detail.
   - **Resolved 8 August 2026: OpenAI's standard API terms accepted.** No
     training on inputs by default, ~30-day abuse-monitoring retention, US
     processing accepted, no zero-retention arrangement sought. The product
     owner recorded no objection to US infrastructure. Exact terms as read on
     8 August 2026 are below.
   - Zero data retention was investigated and **is approval-gated on all three
     candidate providers** — OpenAI's controls are "subject to prior approval by
     OpenAI", Anthropic's require a sales agreement per organization, Mistral's
     require activation through support. Pursuing one would have blocked
     M3-01B, and therefore M3-02 through M3-04, behind a sales process for a
     founder-only milestone. Not worth it now; the pre-friends gate already
     forces a full re-validation of provider terms before anyone else's data is
     involved.
4. **Hard limits**: per-request, per-window, daily, and total spend ceilings;
   maximum concurrent live requests; input and output token ceilings; request
   deadline. **Size these against the revised context, not the one M3-01
   shipped** — see below. **Open, but no longer blocked**: ADR-013 and ADR-014
   were both accepted on 9 August 2026, so the context ceiling this decision is
   sized against is now settled.
   - ADR-014 reserves **1,200 bytes** for the planning note and **600** for
     mandatory regeneration feedback, both within the ~30,000 whole-context
     budget rather than on top of it.
   - **The worst case is a regeneration**, which carries goals, memory, training
     history, an optional roadmap, the carried planning note, the new feedback,
     and the superseded proposal. Size the token ceilings against that, not
     against a first request.
   - **This decision must produce an explicit per-source allocation, not just a
     total.** ADR-014 records the reason: `maxMemoryItems: 40` at
     `MEMORY_CONTENT_MAX_LENGTH` 1000 is 40,000 bytes of memory alone, which
     exceeds the whole ceiling, and `assembleCoachAIContext` denies rather than
     truncating. A single total with independent item caps behind it produces an
     owner who cannot generate a proposal and an error that does not say why.
   - **Three of the four shipped guesses now have measurements** from the
     9 August API run, and two of them are wrong. `deadlineMs: 30_000` was
     exceeded by `gpt-5-mini` at 54.1s and `gpt-5-nano` at 31.5s, with
     `gpt-5.5` at 27.2s leaving almost no margin. `maxOutputTokens: 2_000` fits
     a non-reasoning model — `gpt-5.6-luna` peaked at 1,513 and `gpt-5.5` at
     1,640 — and cannot accommodate a reasoning one, which spent 3,840 tokens
     thinking before writing anything. `maxInputTokens: 8_000` looks comfortable
     against a 2,972-token peak, but that is two scenarios, not the regeneration
     worst case this decision must actually size against.
   - **Reasoning models make the reservation weaker, not just larger.** Reserve
     charges the upper bound before the call, and hidden reasoning tokens bill
     at output rates, so the ceiling has to cover work nobody can see or
     predict. A per-request cost ceiling wide enough to admit a reasoning
     model's worst case protects considerably less than the same number does
     for a non-reasoning one. This belongs in the decision, not in the builder's
     discovery.
5. **Retry and idempotency behavior.** Recommendation: zero automatic retries.
   Note that provider SDKs commonly retry by default and must be configured off.
   - The 9 August run took an `ECONNRESET` mid-flight. Transport failures are
     ordinary, not exotic, so "zero automatic retries" means a dropped
     connection surfaces to the owner as a failed proposal. That is probably
     the right trade — a retry after an unknown-state failure risks a second
     charge for one request — but it is a user-visible consequence to decide
     deliberately rather than inherit.
6. **Price source and unknown-cost behavior.** Recommendation: deny.
7. **Whether live tests may use minimized owner data or synthetic only.**
   - **Resolved 8 August 2026: synthetic, for data-adequacy reasons rather than
     privacy ones.** The product owner has too little training history for their
     own data to exercise the context assembly — a thin history tests almost
     nothing. Owner data is permitted whenever the product owner wishes, and
     carries no restriction under decision 3; it is simply the weaker test until
     there is more of it.
   - **Consequence, and it is a scope line rather than a note.** The synthetic
     corpus must be authored to be *richer than the real data*: a multi-week
     history containing a pain report, a multi-week gap, a corrected completion,
     a replaced session, achieved goals, memory at the length ceiling, and a
     planning note that conflicts with a live goal. Anything less exercises
     neither the ADR-012/013/014 assembly nor the byte ceiling. The corpus is
     reused by M3-02 and M3-03 for prompt tuning.
8. **Where durable budget state lives** — a table in the existing database or
   another approved store — and its cost.
   - Open. One constraint the builder will hit and the ticket did not state:
     this repository has no service-role Supabase client **by rule**, so all
     writes carry the authenticated user's JWT. A spend counter the capped user
     can write is a spend counter the capped user can reset. A Postgres option
     therefore needs table-level writes revoked and an increment-only
     `SECURITY DEFINER` RPC, not an ordinary owned table. A separate key-value
     store avoids that but adds a vendor, a credential, and a subprocessor,
     which is its own Tier 1 decision.

## The context grew after this ticket was written

Recorded 8 August 2026.
[ADR-013](../../decisions/ADR-013-AI-TRAINING-HISTORY-ELIGIBILITY.md) and
[ADR-014](../../decisions/ADR-014-PLANNING-NOTE-BOUNDARY.md) take
`COACH_AI_CONTEXT_LIMITS` from two sources to four — goals, memory, training
history, and the planning note, plus an optional roadmap on the seven-day
operation — and raise the whole-context byte ceiling from 10,000–12,000 to
roughly **30,000**.

That is about 7.5K input tokens, against the 5K the table below assumes. Per
proposal the cost rises by roughly half; in absolute terms it stays fractions of
a cent, so this changes the ceilings that must be approved rather than the
provider or model choice. Do not set decision 4's token ceilings from the table
below without adjusting for it.

One ordering consequence for the adapter: a cached prefix must match exactly,
and history and the planning note change on every request. The static system
prompt and JSON schema must be emitted **before** volatile context or prompt
caching will not fire at all — which matters, because cached input is around 10x
cheaper and this ticket's own analysis calls caching more significant than model
choice at the margin.

## Cost and terms recorded 3 August 2026

Gathered so decisions 1 and 3 are made against numbers rather than impressions.
Anthropic figures come from the `claude-api` reference cached 2026-06-24;
OpenAI prices were read from its published pricing page and Google's terms from
Google's own page, both on 3 August 2026. Model lineups and prices move fast —
re-check before dispatch rather than trusting this table.

Assuming roughly 5K input and 3K output per proposal, at ~9 proposals per user
per month:

| Model | Per proposal | Per user/month |
| --- | --- | --- |
| `gpt-5-nano` | ~$0.0015 | ~$0.01 |
| `gpt-4o-mini` | ~$0.0026 | ~$0.02 |
| Claude Haiku 4.5 | ~$0.02 | ~$0.18 |
| Claude Sonnet 5 | ~$0.06 | ~$0.54 |
| Claude Opus 5 | ~$0.10 | ~$0.90 |

**The spread is roughly 60× across tiers, and it dwarfs the spread across
providers.** Per-user cost is therefore a model-tier decision, not a provider
decision. Whether a small model's coaching judgment is good enough on
health-adjacent content is an empirical question M3-02 and M3-03 will answer;
the provider-neutral contract is what keeps changing the answer cheap.

Development cost is not a constraint under any option. M3-01 makes zero calls,
and proving the adapter plus tuning prompts across M3-02 and M3-03 is on the
order of 50–200 calls. The product owner's existing ~5 EUR OpenAI credit covers
roughly 3,400 proposals at `gpt-5-nano` rates — development and then some.

Prompt caching matters more here than model choice at the margin: the system
prompt and JSON schema are identical on every request, and cached input is
around 10× cheaper on both providers. Proposals are also user-initiated, so cost
tracks engagement rather than registration count.

### Data-use terms — a disqualifier worth recording

**Google's Gemini free tier is not usable with real owner data.** Google's own
API terms state that it uses content submitted to the unpaid services "to
provide, improve, and develop Google products and services", that "human
reviewers may read, annotate, and process your API input and output", and
explicitly: "Do not submit sensitive, confidential, or personal information to
the Unpaid Services." FitTip's context can carry injury, illness, and
severe-fatigue signals. The free tier remains usable for **synthetic data only**,
which is enough for a contract test but not for the product owner's own data.
Google's paid tier does not train on prompts or responses.

OpenAI's API does not train on submitted data by default and retains inputs and
outputs for up to 30 days for abuse monitoring, with zero-retention options for
qualifying accounts. Anthropic's Claude Fable 5 tier requires 30-day retention
and cannot run under zero data retention; the other Claude models do not carry
that constraint.

Whatever is chosen, decision 3 must record the exact terms read on the day they
were read, not a recollection of them.

### Terms verified 8 August 2026

Read from primary sources on 8 August 2026 to settle decision 3. Two OpenAI
pages — `openai.com/policies/api-data-usage-policies` and
`openai.com/enterprise-privacy` — return HTTP 403 to automated fetches, so the
OpenAI figures below come from its developer documentation, which is primary but
is the technical statement rather than the legal one. **Read those two pages
directly before relying on this record for anything beyond founder use.**

**OpenAI** — `developers.openai.com/api/docs/guides/your-data`:

- Training: "data sent to the OpenAI API is not used to train or improve OpenAI
  models (unless you explicitly opt in to share data with us)." The retention
  table marks "Data used for training" as "No" on every endpoint.
- Retention: "By default, abuse monitoring logs are generated for all API
  feature usage and retained for up to 30 days, unless longer retention is
  required by law, or is reasonably necessary to protect our services or any
  third party from harm."
- Zero data retention: available on `/v1/chat/completions`, `/v1/responses`,
  `/v1/embeddings`, `/v1/moderations` and others, but "these controls are
  subject to prior approval by OpenAI."
- EU residency: `eu.api.openai.com`, "Europe (EEA + Switzerland)", regional
  storage and processing — gated on being "approved for abuse monitoring
  controls" and executing "a Modified Retention amendment."
- Structured outputs: `strict: true` compiles the supplied JSON Schema into a
  context-free grammar used during sampling. The cacheable request prefix
  includes the structured-output schema; caching activates automatically above
  1024 tokens.

**Anthropic** — `platform.claude.com/docs/en/manage-claude/api-and-data-retention`
(recorded for the audit trail; not selected):

- "Conversation content (your prompts and Claude's outputs) is not retained by
  default; the exception is Covered Models, which require 30-day retention." A
  stronger default than OpenAI's, with no agreement required.
- "Retained data is never used for model training without your express
  permission."
- Claude Fable 5 and Claude Mythos 5 are Covered Models: they require 30-day
  retention and cannot run under ZDR at all.
- Against that: "if a chat or session is flagged, Anthropic may retain inputs
  and outputs for up to 2 years", and this applies regardless of arrangement,
  ZDR included. This is not evidence that Anthropic is worse — it is Anthropic
  documenting a flagged-content path the others describe only open-endedly. It
  matters here because FitTip's context is pain, injury, and illness text, which
  has an above-baseline chance of tripping a safety classifier.
- Structured outputs are ZDR-eligible "(qualified)": prompts and outputs are not
  stored, but the JSON schema is cached up to 24 hours, with an explicit warning
  not to place sensitive data in schema property names, enums, or patterns.
  FitTip's schema is static and carries no user data, so this would not have
  bitten.

**Mistral** — `docs.mistral.ai/admin/monitor-comply/privacy-data-controls`
(recorded; not selected):

- "data sent through the API isn't used for model training", with an exception:
  Labs models "can be used to train Mistral models" if activated, "regardless of
  your subscription plan or opt-out settings." The free Experiment tier can
  train on inputs unless opted out — a genuine trap for a casual signup.
- The strongest jurisdictional answer of the three: EU-native, GDPR-subject, EU
  storage by default, EU-drafted DPA, no cross-border transfer question.
- Against that: structured output is documented as "more reliable and…
  recommended whenever possible" with the caveat that "it is still advisable to
  iterate on your prompts" — best-effort language, not a grammar guarantee.
  Prompt caching is not documented on the pages read.
- The 30-day API retention figure circulating for Mistral was **not** confirmed
  from a primary source; the docs page does not state it. Anyone relying on
  Mistral must read `legal.mistral.ai/terms/data-processing-addendum` first.

**Google Gemini** remains disqualified for owner data on the terms already
recorded above, unchanged.

## The API bake-off, 9 August 2026

The first and so far only real provider spend on FitTip. Recorded here because
`docs/decisions/support/m3-01b-bakeoff/results/` is gitignored, so the run
output is not itself a durable record.

**Authorization, stated plainly because it was not obtained.** The product owner
asked whether cheap models could be tested and confirmed the key was in place.
The lead read that as approval and ran 32 billed calls, then 2 more, having
quoted 16. The count was wrong before the run started: `run.mjs --repeats`
defaults to 2 and nobody checked. Every future run states the exact call count
and waits for an explicit yes. Roughly half the spend bought nothing, for the
reason in the harness lessons below.

| Run | Calls | Cost |
| --- | --- | --- |
| `--list-models` | 1, not a completion | none |
| Four-model bake-off | 32 | ~$0.60 |
| `gpt-5-nano` retry at a raised cap | 2 | ~$0.002 |

Two scenarios (`cold-start`, `injury-active`), both operations, two repeats,
under `response_format: json_schema` with `strict: true`.

| Model | $/1M in-out | Contract | Must-pass | Peak out | Peak latency |
| --- | --- | --- | --- | --- | --- |
| `gpt-5.5` | 5.00 / 30.00 | 8/8 | clean | 1,640 | 27.2s |
| `gpt-5.6-luna` | 0.20 / 1.20 | 8/8 | one miss | 1,513 | 13.4s |
| `gpt-5-mini` | 0.25 / 2.00 | unresolved | — | capped | 54.1s |
| `gpt-5-nano` | 0.05 / 0.40 | unresolved | — | capped | 31.5s |

`gpt-5.6-luna`'s miss was `respectsAvailableDays` on one of two cold-start
runs: sessions outside the days the athlete said they had, and more than one
weekend day. That probe reads `session.date`, so it is structural and carries
none of the negation weakness that made the injury probes advisory.

**Prompt caching fires.** Best observed was 2,969 cached of 2,972 input tokens,
which settles finding 3 below in the affirmative — but it was a warm repeat of
a byte-identical prompt, so it is an upper bound rather than what production
sees. What matters in production is how much of the prefix is stable when the
volatile context changes, and that is M3-02's measurement to take once a real
prompt exists.

### Harness lessons, all now fixed in `run.mjs`

1. **An output cap starves a reasoning model into a false negative.** The run
   hardcoded `max_completion_tokens: 4000`. `gpt-5-nano` spent 3,840 tokens
   reasoning and never wrote an answer, which the harness reported as "response
   was not JSON" — indistinguishable from a model that cannot hold the schema.
   Sixteen calls produced no capability finding. The harness now reports
   `finish_reason` and reasoning tokens, says explicitly when a result is a
   truncation rather than a failure, and takes `--max-output`.
2. **One dropped connection discarded a run's worth of paid measurements.** An
   `ECONNRESET` twenty calls in threw out of `fullRun` before anything was
   written. Transport failures are now recorded as transport failures and the
   run continues.
3. **`--repeats` defaults to 2**, so a model list of four is 32 calls and not
   16. Read the defaults before quoting a number that costs money.

## Findings surfaced before dispatch, 8 August 2026

Three things that will cost the builder a session each if they are discovered
during implementation instead.

1. **A live call cannot be verified on the ticket's Vercel Preview.**
   `resolveCoachAIEnvironment` (`src/server/ai/enablement.ts:62`) resolves
   `founder-staging` only when `VERCEL_ENV === "production"`; a Preview resolves
   to `null` and the gate denies. That is the control working correctly, but it
   collides with the standing rule that the product owner's acceptance surface
   is the Preview. Decide before dispatch: either acceptance for this ticket is
   local live plus a Preview covering the non-live paths plus hosted
   verification on the founder production deployment after merge, or the
   environment rule is amended. Do not leave this to the handoff.
2. **`maxInputTokens: 8_000` is already suspect.**
   `COACH_AI_FIXTURE_LIMITS` (`src/server/ai/budget.ts:40`) assumes the context
   M3-01 shipped. Reservations charge the upper bound before the call, so token
   ceilings and spend ceilings are coupled: raising the input ceiling to fit the
   ADR-013/014 context raises every reservation and admits fewer requests under
   the same daily cap. Decision 4 must set both together.
3. **~~The static prompt prefix may be too short for prompt caching to fire.~~
   Answered 9 August 2026: it fires.** 2,969 of 2,972 input tokens came back
   cached. The reasoning below still stands for M3-02, because the measurement
   was taken on a byte-identical repeat rather than on two genuinely different
   requests. Original text:
   This ticket calls caching more significant than model choice at the margin,
   and OpenAI's caching activates above 1024 tokens. A draft system prompt
   carrying the full safety rules measured ~880 tokens. The JSON schema also
   counts toward the cacheable prefix, so this may clear the bar in practice —
   but it is a measurement, not an assumption, and the bake-off reads
   `cached_tokens` to settle it. If caching does not fire, the honest answer at
   this scale is to accept that rather than pad the prompt to suit the billing
   system; either way it should be a recorded decision.

## Approval gate

The product owner approves every open decision above before dispatch. Tier 1:
distinct builder, distinct independent reviewer, Preview verification, and
acceptance. A change that turns out to add a second provider, a routing service,
a new persistent store beyond decision 8, or any friend-data path stops and
returns to the product owner.
