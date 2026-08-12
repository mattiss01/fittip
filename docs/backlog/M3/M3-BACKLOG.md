# M3 backlog

**Planning state:** ADR-006 accepts the local-owner AI staging principle and
ADR-007 accepts the separate founder-hosted topology. M3-01 was accepted on
4 August 2026. The remaining tickets stay proposed and require their own
product-owner approval.

**The provider decision was made on 8 August 2026: OpenAI**, together with the
account/credential posture and the data-use terms. **The model was chosen on
10 August 2026: `gpt-5.6-luna`**, provisionally. See
[M3-01B](M3-01B-REAL-PROVIDER-ADAPTER.md) for the resolutions and the exact
provider terms as read that day. **M3-01B's remaining decisions — hard limits,
retry, price source, and durable budget state — were all resolved on 10 August
2026 and the ticket was accepted that day.** M3-02 is in development from
10 August 2026. Still not approved: any prompt, friend data, external user,
public registration, commercial use, or analytics sink.

**The authoritative spend ceiling is the product owner's €10/month cap on the
OpenAI project**, not a constant in this repository. It is provider-side, so it
survives a bug in FitTip's own accounting — which is why decision 2 required it.
The in-app daily and total ceilings are defence in depth and must be revisited
when there is a second user, since a provider cap cannot tell whose spending it
is.

**The model was chosen empirically, and the synthetic corpus is shared.** The
bake-off harness, the authored synthetic athlete, and the selection rule are in
[`docs/decisions/support/m3-01b-bakeoff/`](../../decisions/support/m3-01b-bakeoff/README.md).
M3-02 and M3-03 reuse that corpus for off-API prompt tuning rather than
authoring their own — the product owner has too little real training history for
their own data to exercise the ADR-012/013/014 context assembly.

**`gpt-5.6-luna` ships with a known defect that M3-02 owns.** On one of two
cold-start runs it placed sessions outside the athlete's stated available days.
That is a structural probe, so the finding is real. M3-02 must re-test it
against the real prompt before the roadmap surface is accepted; `gpt-5.5` is
the fallback at 25× the price and half the speed.

**Correction, 12 August 2026 — the re-test moves to M3-03.** The paragraph above
stands as the decision that was taken, and it was taken before the roadmap
contract existed. The contract that emerged cannot express the defect.
`fittip.roadmap.v2` validates `schemaVersion`, `title`, `summary`, `startDate`,
`endDate`, `phases`, `assumptions`, `uncertainties`, `reviewPoints`, and
`safetyConsiderations`; a phase carries `title`, `focus`, `startDate`,
`endDate`, `goalAttention`, and `milestones`. There is no session, no weekday,
and no availability anywhere in it, and `findUnknownField` rejects any field not
on those lists — so the model cannot place a session on a day even if it tries.
Sessions with dates first exist in `fittip.seven-day-plan`, which is
[M3-03](M3-03-SELECTED-HORIZON-PLAN-PROPOSAL.md)'s output. The defect is a
session-placement defect and it is re-tested there, against M3-03's acceptance
criterion 4. M3-02 was accepted on 12 August 2026 with it open as that ticket's
limitation 2; nothing was skipped, the check was simply assigned to a surface
that could not perform it.

**No live provider call is authorized as of 12 August 2026.** The product owner
declined one for M3-02 on the same day, once it was established that the only
thing it could still close there was limitation 3 — whether `gpt-5.6-luna` holds
the v2 roadmap contract. The adapter and composition root exist and are wired;
`resolveCoachAIRuntimeMode` returns `fixture` because none of the six
`FITTIP_AI_*` variables is set anywhere, so every path is fixture-only and no
spend is possible. M3-03 needs a key and configuration, not adapter work.

**Both context ADRs are accepted as of 9 August 2026.**
[ADR-013](../../decisions/ADR-013-AI-TRAINING-HISTORY-ELIGIBILITY.md) (training
history) and [ADR-014](../../decisions/ADR-014-PLANNING-NOTE-BOUNDARY.md) (the
planning note and owner free text as prompt input) together take the AI context
from two sources to four and raise the byte ceiling from ~12,000 to ~30,000.
M3-01B decision 4 is no longer blocked.

Two ADR-014 answers land as new M3-03 scope rather than in M3-01B: a schema bump
to `fittip.seven-day-plan.v2` adding a coach-authored description of the week,
and a second free-text field for **mandatory** regeneration feedback. Memory
extraction must treat the two owner-text fields differently — the planning note
can propose durable constraints, regeneration feedback never can.

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
| P1 | [M3-01 Server-only AI boundary and fixture adapters](M3-01-LOCAL-AI-ADAPTER-CONTROLS.md) | accepted 4 Aug 2026 | M2-01 through M2-04 accepted; ADR-006, ADR-007, ADR-012 | Provider-neutral `CoachAI` contract, deterministic fixture adapters, owner allowlist/enable flag, ADR-012 goal and memory context allowlist, schema validation, in-memory rate/concurrency/budget/idempotency policy, content-free telemetry. No provider, credential, network call, or spend | Approve the dispatch; no provider decision required |
| P1 | [M3-01B One approved real-provider adapter](M3-01B-REAL-PROVIDER-ADAPTER.md) | accepted 10 Aug 2026 | M3-01 accepted; M0-06A accepted for hosted use | One real adapter behind the accepted contract, server-only credential path, durable fail-closed rate/budget/idempotency state via a revoked-write table and an increment-only `SECURITY DEFINER` function, cost reservation and reconciliation, opt-in live test | All values approved; dispatched 10 Aug 2026. Remaining gate: independent review, Preview, and acceptance |
| P1 | [M3-02 Roadmap proposal](M3-02-ROADMAP-PROPOSAL.md) | accepted 12 Aug 2026 | M3-01B accepted and accepted M2 foundations | Owner-scoped structured high-level roadmap proposal with phases, milestones, uncertainty, review points, source versions, edit/reject/accept boundary; no detailed plan | Accepted against `d55c343`, merged as `04cebc8`. Three review passes; the per-source context allocation and the raised input ceiling are approved and recorded |
| P1 | [M3-03 Selected-horizon plan proposal](M3-03-SELECTED-HORIZON-PLAN-PROPOSAL.md) | proposed | M3-01 and M3-02 accepted | **Split 12 Aug 2026.** User-selected 1–7 consecutive owner-local dates, the `fittip.seven-day-plan.v2` bump, structured sport-agnostic sessions and personal activity candidates, goal allocation, constraints, alternatives, reasoning, conservative safety, memory extraction, reject; no roadmap input, no regeneration, no acceptance | Answer 11 open decisions, then Tier 1 builder, reviewer, hosted migration evidence, Preview, acceptance |
| P1 | [M3-03B Plan regeneration](M3-03B-PLAN-REGENERATION.md) | proposed | M3-03 accepted | Reject and regenerate on the same operation: prefilled planning note plus a mandatory 500-character feedback field, only the immediately previous proposal travels, cap of 3 per horizon. Feedback never produces a memory candidate | Answer 3 open decisions, then Tier 1 builder, reviewer, Preview, acceptance |
| P2 | [M3-03C Roadmap as a plan input](M3-03C-ROADMAP-AS-PLAN-INPUT.md) | proposed | M3-02 and M3-03 accepted; the Progress section also needs M3-04 | An accepted roadmap covering the requested dates is used with no extra owner action and named in the context summary; a stale one is used and marked, never dropped or blocking. Plus the collapsible "why does this plan look like this" section | Answer 4 open decisions — including whether the Progress section belongs here or in M3-04 — then Tier 2, or Tier 1 if it needs a migration |
| P1 | [M3-04 Plan edit, lock, and acceptance](M3-04-PLAN-EDIT-LOCK-ACCEPTANCE.md) | proposed | M3-02 and M3-03 accepted | Structured edits, session/activity locks, side-by-side review, reuse of the M1 personal-activity/version model, transactional immutable roadmap/detailed-plan acceptance; no change to logging and no replan | Approve editable fields, lock inheritance, diff/copy, activity reuse/snapshot, version/current-pointer, transaction, and retention decisions |
| P1 | [M3-07 Replanning an accepted horizon](M3-07-REPLAN-ACCEPTED-HORIZON.md) | proposed | M3-04 accepted | Ask the coach for a new plan over dates that already have an accepted version; new immutable version supersedes, locks survive, completed history untouched. No structured reporting UX, alternatives, or clarifying questions — those stay M4 | Approve five open decisions, then Tier 1 builder, reviewer, Preview, acceptance |
| P2 | [M3-06 A plan never starts in the past](M3-06-PAST-DATED-PLAN-HORIZONS.md) | proposed | none | Change accepted M1 behaviour so a plan version's start date is owner-local today or later; horizon shrinks as the week passes and superseded versions retain past content | Approve the four open questions, then Tier 1 builder, reviewer, Preview, acceptance |
| P2 | [M3-08 Bounded completion source references](M3-08-BOUNDED-COMPLETION-SOURCES.md) | proposed | none | Record only the completions that reached the coach as proposal sources, so correcting an old unsent completion stops falsely conflicting a pending proposal; no ADR-013 window or schema change | Answer the two open questions, then Tier 2 builder, reviewer, Preview, acceptance |
| P3 | [M3-09 Simultaneous same-key submit](M3-09-SIMULTANEOUS-SAME-KEY-SUBMIT.md) | proposed | none | Two truly concurrent same-key roadmap requests make the loser report a persistence failure that did not happen; fold the `23505` into the existing replay path via a forward migration. Not a spend or data defect | Approve dispatch, then Tier 1 builder, reviewer, hosted migration evidence, Preview, acceptance |
| P1 | [M3-05 Consolidated M3 validation](M3-05-M3-VALIDATION-SLICE.md) | proposed | M3-01 through M3-04 accepted | Independent clean local validation, mock and opt-in live evidence, cost/token cap, schema failures, authorization, proposals/versioning/locks/acceptance, 390px accessibility, secret/content-log scan; no new behavior | Approve validator, exact commits, fixtures/live cap, evidence retention, accessibility checklist, and blocker statement |

## Dependency chain

```text
Accepted M2 goals + coaching context + guided onboarding + targeted closeout
  -> M3-01 server-only AI boundary and fixture adapters   (no provider needed)
    -> M3-01B one approved real-provider adapter          (provider decision)
      -> M3-02 high-level roadmap proposal
        -> M3-03 exact selected 1–7-day plan proposal
          -> M3-03B regeneration with mandatory feedback
          -> M3-03C the roadmap as an optional, possibly stale input
          -> M3-04 edit, locks, and transactional acceptance
            -> M3-07 replan an accepted horizon
              -> M3-05 independent validation

M3-06 (a plan never starts in the past) sits outside this chain, blocks
nothing, and changes accepted M1 behaviour rather than adding an M3 slice.

M3-08 and M3-09 also sit outside it. Both are M3-02 follow-ups filed from that
ticket's known limitations on 12 August 2026; neither blocks M3-03.

M3-03B and M3-03C both branch from M3-03 rather than chaining after it. They are
independent of each other and neither blocks M3-04.
```

**M3-03 was split on 12 August 2026**, on the same reasoning that split M3-01.
It carried plan generation, a schema bump, sessions and activities, safety, goal
allocation, the roadmap input with its staleness rule, regeneration with
mandatory feedback, the Progress reasoning section, and a full 390px flow — 555
lines and sixteen open product decisions, against an `## Agent brief` limit of
about 40 lines. M3-03 keeps the generation slice and its number, so every
existing link stays valid; regeneration became M3-03B and the roadmap input
became M3-03C. The seams are real: regeneration needs a proposal to regenerate
from, the roadmap path needs a working generation to feed, and both are additive
to M3-03's output without changing its schema. Nothing was dropped — every open
decision, acceptance criterion, and test-plan line moved to exactly one of the
three, and the decided lines stayed in M3-03 as history with a pointer to their
new owner.

M3-02's remaining limitations did not all become tickets. Limitation 11, the
App Router transition that never commits, already has
one — [M2-09](../M2/M2-09-APP-ROUTER-LOST-RENDER.md), where M3-02's measurement is
recorded as the third and worst-affected surface. Limitations 2, 3, and 13 close
with a live provider call rather than with code, limitation 9 with the hosted
checks in
[`M3-02-hosted-check-runbook.md`](../../validation/M3/evidence/M3-02-hosted-check-runbook.md),
and limitation 15 with a one-line correction to ADR-013's recorded amendment
under separate product-owner approval. Limitation 7 folds into M3-03 or M3-04,
which expose planned-session ids anyway.

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
