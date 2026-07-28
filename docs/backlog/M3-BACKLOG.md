# M3 backlog

**Planning state:** ADR-006 accepts the local-owner AI staging principle and
ADR-007 accepts the separate founder-hosted topology. All five M3 tickets
remain proposed and require their own product-owner approval. No provider,
model, account, key, prompt, data-use/retention term, price, spend, friend data,
external user, public registration, commercial use, or analytics sink is
approved.

**Founder boundary:** product-owner data or synthetic data only; local or
accepted M0-06A founder staging; server-side, explicitly enabled,
deny-by-default, budget-capped AI. M0-03B, M0-04 and its later implementation,
M0-05, and M0-06 remain mandatory before friends, public registration,
commercial use, or production.

| Priority | Ticket | Status | Depends on | Scope | Approval gate |
|---|---|---|---|---|---|
| P1 | [M3-01 Local AI adapter and controls](M3-01-LOCAL-AI-ADAPTER-CONTROLS.md) | proposed | M2-01, M2-02, M2-03, and M2-04 accepted; M0-06A accepted for hosted use; ADR-006 and ADR-007; explicit provider/model/key-use/data-use/retention/quality/rate/token/budget/spend approval | Provider-neutral server interface, fixtures/mocks, one separately approved real adapter, owner allowlist/enable flag, allowlisted context, schema validation, rate/concurrency/budget/idempotency, content-free telemetry, opt-in live tests | Approve every provider/model/data-use/retention/key-use/quality/cost value and exact hard limits; owner/synthetic local or founder-hosted only |
| P1 | [M3-02 Roadmap proposal](M3-02-ROADMAP-PROPOSAL.md) | proposed | M3-01 accepted and accepted M2 foundations | Owner-scoped structured high-level roadmap proposal with phases, milestones, uncertainty, review points, source versions, edit/reject/accept boundary; no detailed plan | Approve horizon, schema, uncertainty/review UX, safety, versioning, retention, and transaction choices |
| P1 | [M3-03 Selected-horizon plan proposal](M3-03-SELECTED-HORIZON-PLAN-PROPOSAL.md) | proposed | M3-01 and M3-02 accepted | User-selected 1–7 consecutive owner-local dates, structured sport-agnostic sessions and personal activity candidates, goal allocation, constraints, alternatives, reasoning, conservative safety; no acceptance | Approve day-count default/remembering, date/unit/session/activity/time/intensity/allocation/safety/UX limits |
| P1 | [M3-04 Plan edit, lock, and acceptance](M3-04-PLAN-EDIT-LOCK-ACCEPTANCE.md) | proposed | M3-02 and M3-03 accepted | Structured edits, session/activity locks, side-by-side review, reuse of the M1 personal-activity/version model, transactional immutable roadmap/detailed-plan acceptance; no change to logging and no replan | Approve editable fields, lock inheritance, diff/copy, activity reuse/snapshot, version/current-pointer, transaction, and retention decisions |
| P1 | [M3-05 Consolidated M3 validation](M3-05-M3-VALIDATION-SLICE.md) | proposed | M3-01 through M3-04 accepted | Independent clean local validation, mock and opt-in live evidence, cost/token cap, schema failures, authorization, proposals/versioning/locks/acceptance, 390px accessibility, secret/content-log scan; no new behavior | Approve validator, exact commits, fixtures/live cap, evidence retention, accessibility checklist, and blocker statement |

## Dependency chain

```text
Accepted M2 goal + memory + intake + validation foundations
  -> M3-01 local AI adapter and controls
    -> M3-02 high-level roadmap proposal
      -> M3-03 exact selected 1–7-day plan proposal
        -> M3-04 edit, locks, and transactional acceptance
          -> M3-05 independent validation
```

M3-03 depends on M3-02 because the first detailed horizon must be traceable to a
reviewed high-level direction, rather than inventing a standalone plan with no
roadmap source. M3-04 depends on both proposal slices because it accepts the
reviewed roadmap/detailed-plan pair and creates their immutable versions. M3-05 starts
only after every owning slice is accepted.

## Pre-friends/public gate

A local or founder-hosted M3 acceptance proves only the
product-owner/synthetic MVP path. Before any friend's real data, external user,
public registration, commercial use, production claim, or external analytics:

1. M0-03B account recovery must be accepted.
2. M0-04 privacy design and its required implementation slices must be
   accepted, including notice, consent/withdrawal before AI transfer,
   inventory/retention, deletion, and applicable access/export behavior.
3. M0-05 production-shaped instrumentation and AI request controls must be
   accepted with any required persistent dependencies.
4. M0-06 full quality/deployment, environment, email, abuse, backup,
   monitoring, cost, and validation gates must be accepted.
5. Exact provider terms, region, retention/deletion, subprocessors, data use,
   quality, and cost must be revalidated for the external scope.

No relationship, informal permission, public founder-staging URL, or small
tester count bypasses this gate.

## Ticket rule

Each M3 ticket is independently approved, implemented, reviewed, and accepted.
Approval of ADR-006, ADR-007, M0-06A, or an earlier M3 ticket does not approve a
later one.
Provider output is always a proposal; only the approved M3-04 transaction can
create an accepted plan. M3 reuses but does not rewrite accepted M1
completions, logging, or plan-versus-actual history, and it does not implement
replanning.
