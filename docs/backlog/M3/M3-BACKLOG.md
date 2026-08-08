# M3 backlog

**Planning state:** ADR-006 accepts the local-owner AI staging principle and
ADR-007 accepts the separate founder-hosted topology. M3-01 was accepted on
4 August 2026. The remaining tickets stay proposed and require their own
product-owner approval. No provider, model, account, key, prompt,
data-use/retention term, price, spend, friend data, external user, public
registration, commercial use, or analytics sink is approved.

**Two context ADRs now gate M3-02 and M3-03.**
[ADR-013](../../decisions/ADR-013-AI-TRAINING-HISTORY-ELIGIBILITY.md) (training
history) was revised on 8 August 2026 with its four open questions answered;
[ADR-014](../../decisions/ADR-014-PLANNING-NOTE-BOUNDARY.md) (the planning note
and owner free text as prompt input) was drafted the same day and carries four
open questions. Neither is accepted. Together they take the AI context from two
sources to four and raise the byte ceiling from ~12,000 to ~30,000, which
M3-01B's spend and token ceilings must be sized against.

**M3-03 no longer requires a roadmap at runtime.** Decided 8 August 2026: M3-02
still ships first, but an owner must be able to generate a weekly plan from
goals alone. Where a current roadmap covers the dates it is used automatically,
and a stale one is used and marked stale rather than dropped or blocking.

**Founder boundary:** product-owner data or synthetic data only; local or
accepted M0-06A founder staging; server-side, explicitly enabled,
deny-by-default, budget-capped AI. M0-03B, M0-04 and its later implementation,
M0-05, and M0-06 remain mandatory before friends, public registration,
commercial use, or production.

| Priority | Ticket | Status | Depends on | Scope | Approval gate |
|---|---|---|---|---|---|
| P1 | [M3-01 Server-only AI boundary and fixture adapters](M3-01-LOCAL-AI-ADAPTER-CONTROLS.md) | proposed | M2-01 through M2-04 accepted; ADR-006, ADR-007, ADR-012 | Provider-neutral `CoachAI` contract, deterministic fixture adapters, owner allowlist/enable flag, ADR-012 goal and memory context allowlist, schema validation, in-memory rate/concurrency/budget/idempotency policy, content-free telemetry. No provider, credential, network call, or spend | Approve the dispatch; no provider decision required |
| P1 | [M3-01B One approved real-provider adapter](M3-01B-REAL-PROVIDER-ADAPTER.md) | proposed | M3-01 accepted; M0-06A accepted for hosted use | One real adapter behind the accepted contract, server-only credential path, durable fail-closed rate/budget/idempotency state, cost reservation and reconciliation, opt-in live test | Approve every provider/model/account/data-use/retention/limit/spend value before dispatch |
| P1 | [M3-02 Roadmap proposal](M3-02-ROADMAP-PROPOSAL.md) | proposed | M3-01 accepted and accepted M2 foundations | Owner-scoped structured high-level roadmap proposal with phases, milestones, uncertainty, review points, source versions, edit/reject/accept boundary; no detailed plan | Approve horizon, schema, uncertainty/review UX, safety, versioning, retention, and transaction choices |
| P1 | [M3-03 Selected-horizon plan proposal](M3-03-SELECTED-HORIZON-PLAN-PROPOSAL.md) | proposed | M3-01 and M3-02 accepted | User-selected 1–7 consecutive owner-local dates, structured sport-agnostic sessions and personal activity candidates, goal allocation, constraints, alternatives, reasoning, conservative safety; no acceptance | Approve day-count default/remembering, date/unit/session/activity/time/intensity/allocation/safety/UX limits |
| P1 | [M3-04 Plan edit, lock, and acceptance](M3-04-PLAN-EDIT-LOCK-ACCEPTANCE.md) | proposed | M3-02 and M3-03 accepted | Structured edits, session/activity locks, side-by-side review, reuse of the M1 personal-activity/version model, transactional immutable roadmap/detailed-plan acceptance; no change to logging and no replan | Approve editable fields, lock inheritance, diff/copy, activity reuse/snapshot, version/current-pointer, transaction, and retention decisions |
| P1 | [M3-07 Replanning an accepted horizon](M3-07-REPLAN-ACCEPTED-HORIZON.md) | proposed | M3-04 accepted | Ask the coach for a new plan over dates that already have an accepted version; new immutable version supersedes, locks survive, completed history untouched. No structured reporting UX, alternatives, or clarifying questions — those stay M4 | Approve five open decisions, then Tier 1 builder, reviewer, Preview, acceptance |
| P2 | [M3-06 A plan never starts in the past](M3-06-PAST-DATED-PLAN-HORIZONS.md) | proposed | none | Change accepted M1 behaviour so a plan version's start date is owner-local today or later; horizon shrinks as the week passes and superseded versions retain past content | Approve the four open questions, then Tier 1 builder, reviewer, Preview, acceptance |
| P1 | [M3-05 Consolidated M3 validation](M3-05-M3-VALIDATION-SLICE.md) | proposed | M3-01 through M3-04 accepted | Independent clean local validation, mock and opt-in live evidence, cost/token cap, schema failures, authorization, proposals/versioning/locks/acceptance, 390px accessibility, secret/content-log scan; no new behavior | Approve validator, exact commits, fixtures/live cap, evidence retention, accessibility checklist, and blocker statement |

## Dependency chain

```text
Accepted M2 goals + coaching context + guided onboarding + targeted closeout
  -> M3-01 server-only AI boundary and fixture adapters   (no provider needed)
    -> M3-01B one approved real-provider adapter          (provider decision)
      -> M3-02 high-level roadmap proposal
        -> M3-03 exact selected 1–7-day plan proposal
          -> M3-04 edit, locks, and transactional acceptance
            -> M3-07 replan an accepted horizon
              -> M3-05 independent validation

M3-06 (a plan never starts in the past) sits outside this chain, blocks
nothing, and changes accepted M1 behaviour rather than adding an M3 slice.
```

M3-01 was split on 3 August 2026. The boundary — authorization, context
allowlist, schema validation, budget accounting, fail-closed behavior — needs no
provider, credential, network call, or spend, so it starts immediately; only the
real adapter waits on a provider decision. The split also improves the contract,
because fixtures written against the interface alone cannot quietly shape it
around one provider's API.

M3-03 ships after M3-02 so the roadmap surface exists and has been judged before
detailed planning builds on it. That is a build dependency only — revised
8 August 2026, a weekly plan generates with no roadmap in existence, and that
path is first-class rather than a fallback. M3-04 depends on both proposal
slices because it accepts the reviewed roadmap/detailed-plan pair and creates
their immutable versions; it must also accept a week with no roadmap behind it
without treating that as a stale-source conflict.

M3-07 was added on 8 August 2026 after the product owner observed that the
"re-proposing versus replanning" distinction the lead had drawn did not survive
the same session's decisions: ADR-013 already puts completions and safety flags
in context and ADR-014's planning note already carries "I got sick Tuesday", so
there was one capability, not two. Regeneration and replanning are separated
structurally instead — regeneration refines a proposal that was never accepted,
replanning supersedes an accepted version. M3-07 takes M4's version-supersession
groundwork, which the product plan's M4 entry asks to be built first anyway, and
leaves M4 the structured reporting UX, alternatives, and clarifying questions.

M3-05 starts only after every owning slice is accepted.

## Delivery approach — how M3 gets built without paying for iteration

Approved by the product owner on 3 August 2026. This is the canonical statement;
tickets reference it rather than restating it.

M3 is the first milestone that can spend money, and the naive path — wire a
provider early, then iterate prompts against it — is where the spend actually
goes. Prompt tuning is hundreds of calls; the finished product is a handful.
So the work is ordered to keep the provider out of the loop until there is
something worth validating.

**1. Boundary and fixtures cost nothing.** M3-01 builds the whole server-side
boundary against deterministic fixtures. No provider, no credential, no network
call, no spend — and that is a permanent property of the ticket, not a phase.

**2. Fixtures are authored, not generated.** The corpus a builder needs — valid,
truncated, schema-violating, impossible-date, unowned-goal-reference, and
unsafe-phrasing responses — is written deliberately as an enumerated checklist.
Do not reach for a model to produce malformed output: random garbage gives a
flaky test and no guarantee the case that matters is covered. Realistic *valid*
shapes may be drafted in a chat product and saved as files.

**3. Prompt iteration happens off-API.** Draft and refine prompts in a chat
subscription against synthetic athlete profiles, reading the output and tuning
by hand. This is where the cost would otherwise land, and it is where a chat
product is genuinely the better tool. Manually copying output into fixtures is
ordinary use; wiring the application to a chat product is not, and is not
permitted.

**4. The adapter is tested against a stub HTTP endpoint.** M3-01B's client,
timeout, retry-off, and error-mapping behavior are proven against a local stub
that returns controlled status codes, bodies, delays, and hangs. That is
deterministic, runs in continuous integration, and tests timeout behavior
precisely. A local model server was considered and rejected: it buys nothing the
stub does not, and costs a heavy local dependency on hardware already running
Docker, Supabase, and the dev server.

**5. Real provider calls happen once, bounded.** A single validation pass of
roughly 20–50 calls confirms what only the real API can: that schema enforcement
actually holds, that the prompt behaves the same through the API as it did in the
chat window, and what the true token counts and latency are. That is the only
place real spend occurs across the entire milestone.

The resulting spend for all of M3 is under a euro at nano-tier pricing, or a few
euros at a mid tier — against credit the product owner already holds. Cost is
therefore not a reason to compromise on model choice; see the verified figures in
[M3-01B](M3-01B-REAL-PROVIDER-ADAPTER.md).

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
