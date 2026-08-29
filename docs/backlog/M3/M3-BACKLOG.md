# M3 backlog

**Planning state:** M3-01, M3-01B, M3-02, and M3-03 are accepted. F-005 and
ADR-016 replace the bounded-plan destination with the eight-ticket rolling-plan
chain recorded below. Every proposed replacement ticket still requires its own
product-owner approval; retired tickets must not be dispatched.

**The provider decision was made on 8 August 2026: OpenAI**, together with the
account/credential posture and the data-use terms. **The model was chosen on
10 August 2026: `gpt-5.6-luna`**, provisionally. See
[M3-01B](M3-01B-REAL-PROVIDER-ADAPTER.md) for the resolutions and the exact
provider terms as read that day. **M3-01B's remaining decisions — hard limits,
retry, price source, and durable budget state — were all resolved on 10 August
2026 and the ticket was accepted that day.** M3-02 was accepted on 12 August
2026 and M3-03 on 13 August 2026. Still not approved: any new prompt, friend data, external user,
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
| P1 | [M3-03 Selected-horizon plan proposal](M3-03-SELECTED-HORIZON-PLAN-PROPOSAL.md) | accepted 13 Aug 2026 | M3-01 and M3-02 accepted | **Split 12 Aug 2026.** User-selected 1–7 consecutive owner-local dates, the `fittip.seven-day-plan.v2` bump, **session-level** sport-agnostic sessions with goal allocation, constraints, alternatives, reasoning, tiered safety, memory extraction, reject; no activity detail, no roadmap input, no regeneration, no acceptance | Accepted exact `86aa315`; merged as `2714fba`. Master CI, founder Production deployment, hosted database/security evidence, and authenticated 390px smoke passed |
| P1 | [M3-10 Rolling-plan foundation](M3-10-ROLLING-PLAN-FOUNDATION.md) | accepted | F-005 approved; ADR-016 accepted; one-cutover exception authorized | Dormant owner-scoped rolling-plan identity, current planned-session state, atomic before/after change log, owner revision, RLS/grants/indexes, and concurrency; no UI, activation, old-data mutation, or AI | Accepted by the product owner on 14 Aug 2026 against reviewed implementation `3974414`, green CI, matching Preview, and founder Supabase migration/security evidence |
| P1 | [M3-11 Legacy training reset](M3-11-LEGACY-TRAINING-RESET.md) | accepted — cutover complete | M3-10 accepted | Permanently delete old training records and remove their exclusive schema/runtime; preserve M3-10 and named non-training domains behind maintenance-safe routes | Implementation accepted 15 Aug 2026 against reviewed `ce14576`, green exact-SHA CI, and its matching Preview. The founder database cutover is **not** accepted and still requires explicit **Run the destructive cutover** confirmation at runbook step B3. That confirmation was given on 17 Aug 2026 and the founder cutover was executed and verified the same day; A1-A9, B1-B6, and C1-C7 all passed |
| P1 | [M3-12 Manual continuous planning](M3-12-MANUAL-CONTINUOUS-PLANNING.md) | accepted | M3-11 accepted and founder reset recorded; M3-18 accepted and merged | Restore `/home/plan` directly with one-off Plan changes, Recovery day labels, the owner-local past boundary and 10-per-date cap enforced server-side, locks, and conflicts. No visible plan-history surface | Dispatched 17 Aug 2026; accepted 18 Aug 2026 against `093b21d` after two review rounds, merged as `a1aada9`. Added `profiles.timezone_name` and `rolling_plan_recovery_days`, and replaced `apply_rolling_plan_change_set` to enforce the two rules M3-10 left out. Founder migration `20260817125029` applied and verified. Unblocks M3-13 |
| P1 | [M3-13 Private saved-session library](M3-13-PRIVATE-SAVED-SESSION-LIBRARY.md) | accepted | M3-12 accepted | Owner-only reusable session templates at `/home/plan/saved`, explicit save, copy-by-value reuse, edit/delete, and mobile review; no sharing, live link, versioning, or dedupe | Contract drafted and Tier 1 dispatch approved 18 Aug 2026. Adds `saved_sessions` and `saved_session_activities` with an optimistic revision token; `apply_rolling_plan_change_set` is deliberately untouched — reuse composes as a plain `add`. Accepted 19 Aug 2026 against independently reviewed `46c09c0`, merged as `5e765fe`. Founder migration `20260818143303` applied and verified. Unblocks M3-14 |
| P1 | [M3-14 Recurring session series foundation](M3-14-RECURRING-SESSION-SERIES.md) | accepted | M3-13 accepted; ADR-017 accepted | Series schema, template, three change operations, and the owner-derived materializer that fills the fourteen-day window. **No UI**, on M3-10's precedent | Contract drafted and split 19 Aug 2026 against [ADR-017](../../decisions/ADR-017-RECURRENCE-MATERIALIZATION.md), which supersedes ADR-016's recurrence paragraph and carries a matching F-005 amendment. Tier 1 dispatch approved 19 Aug 2026. No 390px pass — nothing is visible until M3-14B. Accepted 20 Aug 2026 against independently reviewed `0afb6f9` after two review rounds, merged as `4b85b55`. Founder migration `20260819112410` applied after the review and verified. Limitations 17 and 18 constrain M3-14B. Unblocks M3-14B |
| P1 | [M3-14B Recurring series surface](M3-14B-RECURRING-SERIES-SURFACE.md) | accepted | M3-14 accepted | Create and review a series, only-this and this-and-future edit scopes, end a series, the honest pending top-up state, and the 390px flow | Corrected Tier 2 contract and dispatch approved 20 Aug 2026. Consequences precede future-series removal; exact counts follow success; the locked-survivor no-op is withheld. Accepted 20 Aug 2026 against independently reviewed `49ae94b`, merged as `b49c58d`, closed out as `e0dea04`. No hosted migration was needed. Unblocks M3-15A |
| P1 | [M3-15A Replacement completion foundation](M3-15A-COMPLETION-FOUNDATION.md) | in development | M3-14B accepted and merged | One owner-editable completion, its activity snapshot, the immutable planned snapshot, the owner-derived write function, the completion-blocks-deletion rule over M3-14's two sweeping functions, and the ADR-017 top-up wrapper. **No UI**, on M3-10 and M3-14's precedent | Split out of M3-15 on 20 Aug 2026 because the combined scope could not fit a 40-line brief. Tier 1 dispatch approved 20 Aug 2026 against [the F-005 and ADR-013 owner-mutable-completion amendments](../../decisions/ADR-013-AI-TRAINING-HISTORY-ELIGIBILITY.md): no revision chain, no `completion_heads`, no `correction_reason`, and no `rest` status |
| P1 | [M3-15 Replacement consumer readiness](M3-15-REPLACEMENT-CONSUMER-READINESS.md) | proposed | M3-15A accepted | Restore Today/logging/Progress/roadmap on the replacement completion record, re-grant the five roadmap RPCs M3-11 revoked, wire bounded AI completion history, and apply M3-08's exact-source rule | Narrowed to the consumer surfaces on 20 Aug 2026; the foundation is M3-15A. Keeps its number because ADR-017, F-005, and M3-16 already say "M3-15" to mean Today, Progress, and AI context. Draft the exact contract after M3-15A acceptance, then separately approve Tier 1 dispatch |
| P1 | [M3-16 AI proposal application](M3-16-AI-PROPOSAL-APPLICATION.md) | proposed | M3-15 accepted | Fresh 1–7-day Coach proposals composed with current Plan content, M3-03C roadmap input, per-item choices, direct Plan edits, atomic Finish review, discard, locks, and conflicts | Draft the exact contract after M3-15 acceptance, then separately approve Tier 1 dispatch |
| P1 | [M3-03B Rolling-plan proposal regeneration](M3-03B-PLAN-REGENERATION.md) | proposed — paused for rewrite | M3-16 accepted | Historical pre-F-005 draft; retain the identifier but replace the contract with F-005 preservation, omission, feedback, predecessor, charge, and cap rules | Do not dispatch the current text. Rewrite and separately approve it only after M3-16 acceptance |
| P1 | [M3-17 Final rolling-plan closeout](M3-17-FINAL-ROLLING-PLAN-CLOSEOUT.md) | proposed | M3-10 through M3-16 and rewritten M3-03B accepted | Narrow integrated founder verification and evidence reconciliation; no cutover, activation switch, or data change | Draft the smallest closeout contract after all dependencies; re-tier any discovered implementation work |
| P2 | [M3-03C Roadmap as a plan input](M3-03C-ROADMAP-AS-PLAN-INPUT.md) | retired — merged into M3-16 | — | Historical standalone draft; relevant roadmap input and visible reasoning move into M3-16 | Do not dispatch |
| P2 | [M3-03D On-demand session detail](M3-03D-ON-DEMAND-SESSION-DETAIL.md) | proposed — deferred | M3-17 accepted before rewrite | Optional later Coach detail for one stable proposed or rolling-plan session | Rewrite after closeout and obtain separate approval if still wanted |
| P1 | [M3-04 Plan edit, lock, and acceptance](M3-04-PLAN-EDIT-LOCK-ACCEPTANCE.md) | retired — superseded | — | Historical whole-version draft replaced by M3-12 and M3-16 | Do not dispatch |
| P1 | [M3-05 Consolidated M3 validation](M3-05-M3-VALIDATION-SLICE.md) | retired — replaced | — | Historical exhaustive validation draft; M3-17 owns the narrow final hosted closeout | Do not dispatch |
| P2 | [M3-06 A plan never starts in the past](M3-06-PAST-DATED-PLAN-HORIZONS.md) | retired — absorbed by F-005 | — | Historical bounded-plan draft; F-005 owns today/future-only planning | Do not dispatch |
| P1 | [M3-07 Replanning an accepted horizon](M3-07-REPLAN-ACCEPTED-HORIZON.md) | retired — no replacement | — | Historical whole-version replan draft; current Coach planning adds suggestions and never modifies existing sessions | Do not dispatch; any future AI modification capability requires a new approved feature |
| P2 | [M3-08 Bounded completion source references](M3-08-BOUNDED-COMPLETION-SOURCES.md) | retired — merged into M3-15 | — | Historical legacy-path defect; exact sent-completion source behavior moves into replacement context | Do not dispatch separately |
| P3 | [M3-09 Simultaneous same-key submit](M3-09-SIMULTANEOUS-SAME-KEY-SUBMIT.md) | proposed — parked | none | Real roadmap same-key concurrency copy defect, outside the F-005 chain; no duplicate spend or data | Reconsider after closeout; separate Tier 1 approval remains required |
| P2 | [M3-18 Residual focus-ring contrast](M3-18-RESIDUAL-FOCUS-RING-CONTRAST.md) | accepted | M3-11 accepted and merged | Goals, memory, and onboarding painted a 1.92:1 focus ring, and every text input a 1.51:1 one, against the 3:1 WCAG 2.2 SC 1.4.11 minimum; M3-11's `var(--ledger-ink)` treatment applied. Presentation only | Raised by M3-11 independent review (NEW-2). Tier 3 confirmed and dispatched 17 Aug 2026 ahead of M3-12; accepted the same day against `5f78071` with green CI and a confirmed Preview. Every ring now computes 11.39:1 or better |

## Dependency chain

```text
Accepted M2 goals + coaching context + guided onboarding + targeted closeout
  -> M3-01 server-only AI boundary and fixture adapters   (no provider needed)
    -> M3-01B one approved real-provider adapter          (provider decision)
      -> M3-02 high-level roadmap proposal
        -> M3-03 exact selected 1–7-day plan proposal
          -> F-005 + ADR-016 approved replacement
            -> M3-10 rolling-plan foundation
              -> M3-11 legacy training reset
                -> M3-12 manual continuous planning
                  -> M3-13 private saved-session library
                    -> M3-14 recurring series foundation   (schema, no UI)
                      -> M3-14B recurring series surface
                        -> M3-15A replacement completion foundation (no UI)
                          -> M3-15 replacement consumers (+ M3-08 rule)
                            -> M3-16 AI proposal application (+ M3-03C behavior)
                              -> rewritten M3-03B regeneration
                                -> M3-17 final rolling-plan closeout

M3-03C, M3-04, M3-05, M3-06, M3-07, and M3-08 are retired standalone
contracts. M3-03C's relevant behavior moves into M3-16, M3-08's exact-source
rule moves into M3-15, and M3-17 replaces M3-05's duplicate validation pass.
M3-07 has no replacement: the approved Coach flow adds selected suggestions and
does not modify existing Plan sessions.

M3-03B keeps its identifier but its current pre-F-005 contract must be rewritten
only after M3-16 is accepted. M3-03D is an optional post-closeout enhancement and
must then target a stable proposed or rolling-plan session.

M3-09 remains a parked P3 roadmap defect outside the replacement chain. It is
real, but does not duplicate spend or data and does not block rolling-plan
delivery.
```

**M3-03 was split on 12 August 2026**, on the same reasoning that split M3-01.
It carried plan generation, a schema bump, sessions and activities, safety, goal
allocation, the roadmap input with its staleness rule, regeneration with
mandatory feedback, the Progress reasoning section, and a full 390px flow — 555
lines and sixteen open product decisions, against an `## Agent brief` limit of
about 40 lines. M3-03 keeps the generation slice and its number, so every
existing link stays valid; regeneration became M3-03B, the roadmap input
became M3-03C, and activity detail became M3-03D once the product owner chose a
session-level plan over a fully detailed one. The seams are real: regeneration needs a proposal to regenerate
from, the roadmap path needs a working generation to feed, and both are additive
to M3-03's output without changing its schema. Nothing was dropped — every open
decision, acceptance criterion, and test-plan line moved to exactly one of the
four, and the decided lines stayed in M3-03 as history with a pointer to their
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
path is first-class rather than a fallback. F-005 later replaced the bounded
destination and retired M3-04; M3-16 now owns applying selected suggestions to
the rolling Plan without requiring a roadmap.

M3-07 was added on 8 August 2026 after the product owner observed that the
"re-proposing versus replanning" distinction the lead had drawn did not survive
the same session's decisions: ADR-013 already puts completions and safety flags
in context and ADR-014's planning note already carries "I got sick Tuesday", so
there appeared to be one capability. The rolling-plan decision on 14 August
removed the structure M3-07 depended on: there is no accepted horizon to
supersede. M3-16 shows existing content, adds only explicitly selected Coach
suggestions, and leaves changes to existing sessions to the owner. M3-07 is
therefore retired without replacement; a future AI modification capability is
a new product decision rather than an edit to this historical draft.

M3-05 is retired under the same non-duplicative validation principle previously
used for M1-05. M3-17 owns the narrow integrated hosted closeout after every
replacement slice is independently accepted.

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
Provider output is always a proposal. Under F-005, only M3-16's explicit atomic
**Finish review** action may add selected Coach suggestions to the rolling Plan.
The one-time M3-11 reset deletes the specifically approved legacy training
records and exclusive schema/runtime; every replacement record remains
permanent from its model's first write onward.
