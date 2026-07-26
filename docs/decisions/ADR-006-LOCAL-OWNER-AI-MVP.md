# ADR-006: Local owner AI for the MVP

**Status:** accepted

**Date:** 26 July 2026

**Approval:** Product owner explicitly approved the local-owner AI staging
principle in this task

**Scope:** local development only; product-owner data or synthetic data only

## Context

AI-generated training proposals are core to FitTip's value. Waiting for the
complete privacy, recovery, deployment, and external-use program before making
any real model call would prevent the product owner from testing the central
MVP loop. At the same time, that program remains necessary before another
person's data is processed or FitTip is hosted for external use.

This ADR records only the approved staging principle. It does not select a
provider, model, account, key, prompt, retention term, data-use term, region,
rate, budget, or spend.

## Decision

- A real AI-provider call may be made from the local development MVP.
- Before the privacy and hosted-environment gates are accepted, provider-bound
  input is limited to the product owner's own data or synthetic data.
- Friend data and any other external user's data are prohibited. Hosted
  deployment, external-user access, and an external analytics sink are also
  prohibited under this local exception.
- Calls run server-side only. The provider credential is uncommitted, never
  exposed through `NEXT_PUBLIC_` or another client path, and never written to
  logs, telemetry, snapshots, fixtures, screenshots, or validation artifacts.
- The implementation proposal must use an explicit local enable flag and an
  owner allowlist or equivalent deny-by-default server boundary. Missing,
  malformed, ambiguous, or non-owner configuration fails closed before a
  provider call.
- The server sends only an operation-specific allowlisted context. Every model
  result is untrusted, strictly schema-validated, and returned as a proposal.
  AI never writes user data directly or silently changes an accepted plan.
- Pain, illness, injury, and severe-fatigue behavior remains concise,
  conservative, and non-diagnostic. The model must not claim diagnosis,
  treatment, rehabilitation, or safety.
- Local technical telemetry is limited to provider/model codes, prompt and
  schema versions, timing, token usage when reported, cost estimate/state,
  validation outcome, and coarse error/control outcomes. Raw prompts, user
  content, model output, secrets, headers, URLs, and raw provider errors are
  forbidden.
- Hard request, concurrency, token/cost budget, and fail-closed rules must be
  proposed and explicitly approved before any implementation ticket may make a
  real call.
- Provider, model, key creation/use, pricing, spend, prompt content, data-use
  terms, retention, region, and quality threshold are not approved by this ADR.
  Each requires a separate product-owner decision in the implementation gate.
- M0-03B recovery, M0-04 privacy design and its later implementation, M0-05
  production-shaped instrumentation/request controls, and M0-06 hosted quality
  and deployment remain mandatory before any friend's real data or any hosted
  or external use.

## Alternatives considered

### Wait for every privacy and hosted gate before testing real AI

Not selected for owner-only local MVP development because it prevents
validation of the product's central capability. It remains the required path
for friends, external users, and hosted operation.

### Use fixtures only until external beta

Fixtures remain mandatory for deterministic tests, but they cannot establish
the usefulness, latency, structured-output reliability, or cost of a real
model.

### Permit trusted friends under the local exception

Rejected. The approved exception is limited to the product owner and synthetic
data. Relationship or informal consent does not widen it.

## Consequences

- Local M1 and M2 work no longer depends on completing M0-03B through M0-06,
  provided each ticket is independently approved and preserves this boundary.
- A separately approved M2 adapter ticket may prove one real provider locally
  after its provider/model/budget/data-use/retention decisions are resolved.
- Tests must default to fixtures/mocks. Live-provider tests are explicit,
  opt-in, owner-only, budget-capped, content-minimized, and safe to skip when
  local enablement is absent.
- The local exception is not a privacy implementation, consent record, hosted
  readiness claim, or permission to collect another person's data.

## Reversal

The provider-neutral server interface, explicit enablement, and deny-by-default
owner boundary allow the real adapter to be disabled without changing proposal
records or accepted plan history. A provider/model change requires a new
approved decision and adapter evidence; it does not rewrite this ADR.

## Approval boundary

This ADR is accepted only for the principle above. It authorizes no
implementation ticket, provider account, API key, provider/model selection,
remote resource, hosted deployment, analytics sink, external user, or spend.
