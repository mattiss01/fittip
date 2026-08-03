# M3-01B: One approved real-provider adapter

**Status:** proposed — not approved for implementation; blocked on the provider
decision below

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

## Non-goals

- No second provider, no fallback chain, no provider-routing gateway.
- No change to the accepted `CoachAI` contract. If the adapter cannot fit it,
  stop and report — that is a finding about the interface, not licence to widen
  it here.
- No proposal persistence, roadmap or plan UI, chat, streaming, or replan.
- No friend data, external tester, public registration, or production path.

## Open decisions — all required before dispatch

The product owner must approve each explicitly. None is settled.

1. **Provider and model**, chosen against structured-output reliability,
   coaching quality on health-adjacent content, latency, and price.
2. **Account and credential**: whose account, which key, what scope, who
   rotates it.
3. **Data-use and retention terms**: training on inputs, human review,
   retention window, deletion, region, and subprocessors. This carries more
   weight than usual — the context can contain injury, illness, and fatigue
   signals. A provider tier requiring extended retention is a decision, not a
   detail.
4. **Hard limits**: per-request, per-window, daily, and total spend ceilings;
   maximum concurrent live requests; input and output token ceilings; request
   deadline.
5. **Retry and idempotency behavior.** Recommendation: zero automatic retries.
   Note that provider SDKs commonly retry by default and must be configured off.
6. **Price source and unknown-cost behavior.** Recommendation: deny.
7. **Whether live tests may use minimized owner data or synthetic only.**
8. **Where durable budget state lives** — a table in the existing database or
   another approved store — and its cost.

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

## Approval gate

The product owner approves every open decision above before dispatch. Tier 1:
distinct builder, distinct independent reviewer, Preview verification, and
acceptance. A change that turns out to add a second provider, a routing service,
a new persistent store beyond decision 8, or any friend-data path stops and
returns to the product owner.
