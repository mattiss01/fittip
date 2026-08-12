# M3-03: Selected-horizon plan proposal

**Status:** in development — approved by the product owner on 12 August 2026

**Triage:** ready-for-agent

**Milestone:** M3

**Priority:** P1

**Depends on:** [M3-01 accepted](M3-01-LOCAL-AI-ADAPTER-CONTROLS.md),
[M3-02 accepted](M3-02-ROADMAP-PROPOSAL.md), and
[ADR-013](../../decisions/ADR-013-AI-TRAINING-HISTORY-ELIGIBILITY.md) plus
[ADR-014](../../decisions/ADR-014-PLANNING-NOTE-BOUNDARY.md) — **both accepted
9 August 2026**

**Revised:** 8 August 2026 — the roadmap became an optional input rather than a
precondition; compose step, planning note, memory extraction, and regeneration
with feedback added

**Revised:** 9 August 2026 — ADR-014's answers landed here. Regeneration takes
two owner-text fields with feedback **mandatory**; the cap is 3 and is a product
guardrail, not a spend control; the plan schema bumps to
`fittip.seven-day-plan.v2` for a coach-authored description of the week; and
Progress gains a collapsible "why does this plan look like this" section

**Split:** 12 August 2026 — see below. Regeneration, the roadmap input, and
activity detail all left this ticket; the session-level generation slice stayed.

**Sequencing note:** M3-02 ships first so that the roadmap surface exists and
has been judged before detailed planning is built on it. That is a **build**
dependency, not a runtime one. Changed on 8 August 2026: an owner must be able
to generate a weekly plan from goals alone, with no accepted roadmap in
existence. After the split that is the *only* path this ticket builds. M3-01 may
not be bypassed under any circumstances.

**Architecture boundary:** ADR-006 and ADR-007 accepted; M0-06A accepted before
founder-hosted use

**Blocks:** [M3-03B](M3-03B-PLAN-REGENERATION.md),
[M3-03C](M3-03C-ROADMAP-AS-PLAN-INPUT.md),
[M3-03D](M3-03D-ON-DEMAND-SESSION-DETAIL.md),
[M3-04](M3-04-PLAN-EDIT-LOCK-ACCEPTANCE.md), and
[M3-05](M3-05-M3-VALIDATION-SLICE.md)

## Agent brief

**Outcome.** Generate, validate, persist, and display one **session-level** plan
proposal covering 1-7 owner-selected consecutive local dates, built from active
goals, eligible accepted memory, ADR-013 training history, and the owner's
planning note. The owner can reject it. Nothing is accepted.

**Tier 1** - schema, migration, RLS, an AI provider path, and spend.

**Hard constraints**

- **Session-level only.** A session has title, sport/domain, focus, expected
  minutes, intent, one primary goal, zero or more unweighted secondary goals,
  alternatives, rationale. **No activities, measurement modes, or targets**, and
  no weight or percentage anywhere in the schema or the surface.
- **Bounds:** at most 3 sessions on a date and `3 x dayCount` per horizon. No
  minutes cap and no rest requirement - a horizon with neither is valid.
- `fittip.seven-day-plan.v1` -> **`v2`**. In `output-validation.ts` change
  `MAX_SESSIONS_PER_DAY` 2 -> 3 and `MAX_SESSIONS` 14 -> `3 x dayCount` **in
  place**; do not add a parallel limit. Add the week description, 1-600 chars.
- **Context minimum:** at least one active goal and a resolved timezone. Below
  it, refuse before any provider call, naming what is missing, consuming no
  idempotency key and no spend reservation.
- **Safety is tiered and server-decided.** Ordinary limitation pauses only the
  affected activity and the rest of the horizon generates; severe, acute, or
  worsening pauses all generation with a rest-focused response. The model never
  decides the tier; an uncertain tier resolves to the conservative one.
- `startDate` is owner-local today or later. Day count is remembered across
  requests; **start date always resets to today**. The planning note is never
  prefilled.
- Undecided memory candidates are retained as `proposed` on M2-02's surface and
  are never active without explicit review.
- ADR-014: the planning note carries no authority. ADR-015: `SECURITY DEFINER`
  RPCs take no owner argument and derive it from `auth.uid()`.
- Fixture-only. No `FITTIP_AI_*` variable is set anywhere and no live call is
  authorized; `resolveCoachAIRuntimeMode` must still return `fixture`.

**Non-goals** - activities and targets (M3-03D), roadmap input (M3-03C),
regeneration (M3-03B), acceptance/editing/locks (M3-04). Do not widen into any
of them; stop and report instead.

**Acceptance criteria** are the numbered list under "Acceptance criteria" below.
The four that most often go wrong: exact date-count for 1, 2, and 7 days with
DST; the context-minimum refusal spending nothing; both safety tiers proven by
fixture rather than asserted; and every requested date rendering as its own
block with rest days explicit.

**Expected to change.** `src/server/ai/{contracts,output-validation,context,
context-source,openai-prompt,composition}.ts`; a new `src/server/plan-proposal/`
domain module and `src/server/repositories/plan-proposal-repository.ts`; a new
surface under `src/app/home/plan/`; one forward migration in
`supabase/migrations/` with pgTAP; a per-ticket Playwright spec and config.

**Project skills**, read from `.agents/skills/<name>/SKILL.md` - Claude Code does
not auto-discover them: `vercel-react-best-practices` and `frontend-design`.
Decision 9 fixes the layout shape; the skill governs styling, not structure.

Read only this section unless you hit an ambiguity it does not resolve.

## Split into four tickets, 12 August 2026

This ticket carried plan generation, a schema version bump, sessions and
activities, safety, goal allocation, the roadmap-as-optional-input path with its
staleness rule, regeneration with mandatory feedback, the Progress reasoning
section, and a full 390px flow — 555 lines and **sixteen** open product
decisions. AGENTS.md requires an `## Agent brief` of about 40 lines and says a
ticket that cannot be summarized in one is usually too large to be one ticket.
This was.

The scope was divided at the seams where the work is genuinely independent:

- **M3-03 (this ticket)** — generate, validate, persist, and display one
  **session-level** plan proposal for the selected dates, from goals, memory,
  training history, and the planning note. Reject it. No roadmap, no
  regeneration, no activity detail.
- **[M3-03B](M3-03B-PLAN-REGENERATION.md)** — regeneration with mandatory
  feedback and the cap of 3.
- **[M3-03C](M3-03C-ROADMAP-AS-PLAN-INPUT.md)** — the accepted roadmap as an
  optional and possibly stale input, plus the Progress reasoning section.
- **[M3-03D](M3-03D-ON-DEMAND-SESSION-DETAIL.md)** — the activities, measurement
  modes, and targets for one session, generated on demand. Added 12 August 2026
  when the product owner chose a session-level plan over a fully detailed one.

The seams are real rather than administrative. Regeneration needs a proposal to
regenerate from, the roadmap path needs a working generation to feed, and the
detail operation needs a session to detail. All three are additive to this
ticket's output. That is why each can be approved, built, and judged on its own.

Nothing was dropped. Every open decision, acceptance criterion, and test-plan
line moved to exactly one of the four, and the decided lines stayed here as
history with a pointer to their new owner.

## Outcome

Generate and display one sport-agnostic plan proposal for the user-selected next
1–7 days, based on active goals, active explicitly accepted coaching context,
training history within ADR-013's bounds, and the owner's planning note. The
proposal contains exactly the requested number of consecutive owner-local dates,
dated sessions described at session level, goal allocation, expected duration,
alternatives, concise reasoning, and conservative safety behavior. It changes no
plan until explicit acceptance in M3-04.

**A plan generates from goals alone.** With the roadmap path in M3-03C, that is
not a fallback or a degraded state in this ticket — it is the whole product. The
compose screen must not imply that something is missing.

## Local-owner and pre-friends boundary

Provider calls are local or M0-06A founder-hosted and limited to the product
owner's data or synthetic data through M3-01. Friend data, public registration,
commercial/production use, new remote resources, and external analytics remain
prohibited. The full recovery/privacy/instrumentation/deployment gates remain
mandatory before those uses.

## Scope

1. Define strict `DetailedPlanProposal`, session, alternative, allocation,
   rationale, and safety schemas. No activity, measurement, or target schema —
   that is M3-03D.
2. Build an owner-scoped context from active goals, eligible explicitly
   accepted memory, training history under ADR-013, the planning note under
   ADR-014, timezone, and approved generation date.
3. Add a compose step: day-count and start-date selection, an optional planning
   note, and a collapsed-by-default summary of what the coach will receive.
4. Accept an explicit user-selected `dayCount` from 1 through 7 and generate
   exactly that many consecutive owner-local calendar dates.
5. Enforce server-owned limits for session count per day and per horizon, and
   for allowed context. No minutes cap and no rest rule (decision 4).
6. Keep sessions sport-agnostic and personal, with no global library anywhere
   in the contract.
7. Show priority allocation, constraints used, alternatives, uncertainty, and
   concise visible reasoning.
8. Extract memory candidates from the planning note in the same response.
   Sections validate independently; an invalid memory section is discarded and
   the plan still returns.
9. Persist an immutable owner-scoped proposal, the planning note, and minimized
   source references.
10. Provide reject. Editing, locking, and acceptance belong to M3-04;
    regeneration belongs to M3-03B.
11. Add AI-output, domain, authorization, safety, mobile, and leakage tests,
    including planning-note injection cases under ADR-014 decision 4.

## Prompt work happens off-API

Per [the M3 delivery approach](M3-BACKLOG.md#delivery-approach--how-m3-gets-built-without-paying-for-iteration),
draft and iterate this operation's prompt in a chat subscription against
synthetic athlete profiles and across several planning notes. Judge session
quality, goal allocation, and above all the conservative pain, illness, injury,
and severe-fatigue behavior by reading real output — that judgment is the point
of this ticket and needs no API key to exercise.

Save the good shapes as fixtures. The provider is reached only inside M3-01B's
bounded validation budget, once the prompt is settled.

## Inherited 12 August 2026: the luna available-days defect

M3-01B found that on one of two cold-start runs, `gpt-5.6-luna` placed sessions
outside the athlete's stated available days. The M3 backlog assigned the re-test
to M3-02, and M3-02 recorded it as its limitation 2 without being able to run
it: `fittip.roadmap.v2` has no session, no weekday, and no availability field,
and its validator rejects any field not on the schema's list. The defect cannot
occur in a roadmap, so it cannot be re-tested against one.

**It is re-tested here**, because `fittip.seven-day-plan` is where a session
first carries a `date` and where availability is an input. Acceptance criterion
4 already requires the selected horizon to respect approved availability; this
note records that the criterion is also discharging a known, named model defect
rather than only asserting a general property. Two consequences for whoever
builds this:

- The availability fixtures in the test plan must include the shape that
  provoked it — a cold start, no prior context, availability stated only in
  constraints — and not merely a well-formed happy path.
- A model that fails it is a model decision, not a prompt bug to iterate away.
  `gpt-5.5` is the recorded fallback at 25× the price and half the speed, and
  that trade is the product owner's to make.

**No live provider call is authorized.** The product owner declined one on
12 August 2026. Off-API prompt work against the synthetic corpus is unaffected;
the re-test needs a real call and therefore needs separate approval with an
exact call count and cost before it happens.

## Non-goals

- **No roadmap input.** Reading, using, or marking an accepted roadmap belongs
  to M3-03C. This ticket generates from goals, memory, history, and the note.
- **No regeneration.** The second owner-text field, the previous proposal as
  context, and the cap belong to M3-03B.
- **No activity detail.** Activities, measurement modes, targets, and locks
  belong to M3-03D, generated per session on demand.
- No accepted plan version, editing, locks, personal-activity persistence, or
  transactional acceptance; those belong to M3-04.
- No completion/logging, plan-versus-actual history, replan, diff, coaching
  chat, progress metric, or pattern inference.
- No global exercise/activity catalog, strength-first schema, hidden sport
  template, diagnosis, treatment, rehabilitation, or safety guarantee.
- No provider/model/key/spend decision, new remote resource, friend/external
  data, public registration, commercial use, production, or analytics sink.

## Exact selected-horizon contract

- The proposal has one requested `dayCount` from 1 through 7, one `startDate`,
  one derived `endDate`, and exactly `dayCount` consecutive owner-local dates
  inclusive.
- `startDate` is the owner's local today or later. A proposal never contains a
  past date, so no proposal can propose over a day that already happened, and
  the only completed session that can fall inside a horizon is today's.
- The model cannot choose, extend, shorten, or silently pad the requested
  horizon.
- Every session is assigned to one of those dates; rest/no-session days remain
  explicit in the selected-horizon representation.
- **A session is session-level only.** It contains title, sport/domain, focus,
  expected duration in minutes, effort or recovery intent where applicable,
  **one primary goal and any number of unweighted secondary goals**,
  alternatives, and concise rationale. Attention is never expressed as a
  percentage (decision 6). It carries **no activities,
  no measurement modes, and no targets** — those are
  [M3-03D](M3-03D-ON-DEMAND-SESSION-DETAIL.md), generated per session on demand.
- **At most 3 sessions on any one date**, and at most `3 × dayCount` across the
  horizon. No cap on total minutes per day or per horizon, and no required rest
  day (decision 4).
- Every referenced goal is active and owner-scoped. Core/supporting priorities
  and ranks remain visible in allocation.
- **The proposal carries a coach-authored description of the week as a whole**,
  1 to 600 characters, separate from any per-session rationale (decision 17). Added 9 August 2026 — see the schema
  bump below. The field is written here; the Progress surface that displays it
  is M3-03C.

### The shipped plan schema needs a version bump

`SevenDayPlanProposal` in `src/server/ai/contracts.ts` is currently
`schemaVersion`, `startDate`, and `sessions[]`, where a session carries only
`date`, `title`, `intent`, `durationMinutes`, and `goalId`. There is **no
top-level field for the coach to explain the week**; the only reasoning lives in
each session's `intent`.

ADR-014's accepted Progress surface needs one, so this ticket bumps
`fittip.seven-day-plan.v1` to **`fittip.seven-day-plan.v2`**. Note the asymmetry
with M3-02: `RoadmapProposal` already has `summary` and needs no equivalent
bump for this reason.

Several other fields in the contract list above are also unrepresented in the
shipped stub — sport/domain, focus, allocation, alternatives, rationale. M3-01
shipped deliberate stubs and named them as such, so the version bump covers all
of it at once.

**The v2 bump got smaller on 12 August 2026.** With activities, measurement
modes, targets, and locks moved to M3-03D, v2 stays session-level: it adds the
coach's description of the week, sport/domain, focus, allocation, alternatives,
and rationale, and it changes the two session-count limits below. The detail
operation gets its own schema rather than extending this one.

The same commit also changes shipped validation: `MAX_SESSIONS_PER_DAY` moves
from 2 to **3** and `MAX_SESSIONS` from a fixed 14 to **`3 × dayCount`**. Update
`output-validation.ts` and its tests; do not add a parallel limit beside them.

**The schema bump stays in this ticket even though M3-03B and M3-03C consume
it.** One version bump owned by one ticket is the point; three tickets each
adding a field to the same contract is how a schema becomes incoherent.

**M3-01B does not do this.** Its non-goal 2 forbids changing the accepted
`CoachAI` contract, so a builder on that ticket who finds the schema
insufficient must stop and report rather than widen it.

## Server constraints

The server—not the model—must:

- derive owner, timezone, generation date, requested day count, and exact date
  range;
- refuse before calling the provider when the context minimum is not met — at
  least one active goal and a resolved owner timezone — naming exactly what is
  missing (decision 5);
- fetch eligible M1 training/M2 context records;
- decide the safety tier from the approved rule rather than leaving it to the
  model (decision 8);
- treat the planning note as context with no authority, per ADR-014 decision 4;
- enforce the approved session-count bound,
  and the structural session-count bound of 3 per day and `3 x dayCount` per
  horizon;
- verify dates, ranks, allocations, references, and personal ownership;
- reject impossible overlaps and constraints that the model silently ignores;
- apply the approved conservative safety rule; and
- reject the whole candidate on unknown fields, partial invalidity, unsafe
  content, unsupported units, or an unapproved measurement form.

The exact numeric limits and default unit behavior require product-owner
approval before implementation.

## Priorities, possibilities, and visible reasoning

- The proposal shows which goals each session serves and the relative attention
  given to core versus supporting goals.
- It explains material tradeoffs when available time cannot serve every goal.
- Availability, time, equipment, locations, preferences, dislikes, limitations,
  target dates, and the planning note are treated as constraints, not optional
  prompt decoration.
- Material uncertainty is visible and may produce focused alternatives instead
  of false precision.
- Reasoning is concise by default and contains no hidden chain-of-thought
  promise. A later chat feature may offer deeper explanation.

## Safety behavior

**The rule is tiered by severity**, decided 12 August 2026 (decision 8). An
ordinary limitation or mild signal pauses **only the affected activity** and the
rest of the horizon still generates with reduced load, rest, or non-conflicting
alternatives. A severe, acute, or worsening signal pauses **all generation** and
returns a rest-focused response. The server decides the tier against the
approved rule, from explicitly accepted context and the planning note; the model
never decides it, and an uncertain tier resolves to the more conservative one.

- Plans are suggestions and remain unaccepted.
- Pain, illness, injury, or severe fatigue yields rest, reduced load, pause, or
  non-conflicting alternatives as allowed by the approved rule.
- Severe, acute, or worsening signals show concise advice to stop the relevant
  activity and consult a qualified professional.
- The plan never diagnoses, prescribes treatment/rehabilitation, claims safety,
  or overrides a limitation.
- If safe generation is not possible within approved facts, fail closed and
  request review; do not invent missing medical facts.

## Proposal and authorization rules

- Proposal, goals, memory, and onboarding drafts/candidates remain separate
  records.
- A proposal stores owner, schema/prompt versions, generation status,
  idempotency reference, source ids/versions, validation state, the structured
  proposed horizon, and the planning note.
- The planning note is never reused on a later request and is never prefilled
  into a later compose screen (ADR-014 decision 2); M3-03B's regeneration is the
  one exception. Both remaining questions were settled on 9 August 2026: the note
  **is retained** against a rejected proposal, because a rejected proposal
  without its note is evidence nobody can interpret; and it **is visible** in
  Progress inside the collapsible section, which M3-03C builds. Retention against
  a rejected proposal is conditional on this ticket's own decision to retain
  rejected proposals at all — if they are discarded, there is nothing for the
  note to be retained with, and that is a question this ticket still owns.
- It is not the operational plan used by Today/logging until M3-04 accepts it.
- RLS and repositories enforce immutable `user_id`, owner predicates, explicit
  grants, and anonymous/cross-user denial.
- Retry returns the same validated proposal when idempotent; changed source
  versions require review.

## Proposed 390px flow

1. The owner opens **Plan**.
2. The owner chooses the explicit **Propose a plan** action. This opens the
   compose screen; it does not start generation.
3. On the compose screen the owner selects how many next days to generate, from
   1 through 7 — defaulting to 7 first time and to their last count after —
   confirms the start date, which always opens on today, and may write a
   planning note. A
   disclosure — collapsed by default so the screen stays short at 390px —
   summarizes what the coach will receive: active goals, active constraints, and
   recent load.
4. The owner confirms, and a pending state states that no plan will change
   automatically.
5. The proposal shows every requested date as its own block, rest days included
   and explicit. Each session shows title, sport, duration, and its primary
   goal; focus, reasoning, alternatives, and secondary goals are one tap away.
   See decision 9 for the shape.
6. The owner can inspect safety and uncertainty notes. Generating the detail of
   a session is M3-03D and is not part of this flow.
7. Any memory candidates extracted from the planning note are presented for
   explicit accept, edit-and-accept, or reject on the accepted M2-02 review
   surface. They are independent of the plan decision.
8. The owner may continue to the M3-04 edit/lock/accept flow or reject the
   proposal.
9. Invalid/provider/control failure shows a safe retry/review state without
   saving an accepted plan.

Exact labels, date-start default, units, density, and review presentation
require approval.

## Acceptance criteria

1. The user can request 1, 2, or 7 days; the validated proposal covers exactly
   that requested number of consecutive owner-local dates.
2. Requests below 1 or above 7, model attempts to alter the horizon, and
   request/output date-count mismatches are rejected in full.
2a. A plan generates correctly with **no accepted roadmap in existence**, and
    that path is exercised at `390x844` end to end. It is not a fallback state,
    an empty state, or a warning. In this ticket it is the only path.
2c. A planning note cannot alter the horizon, the schema, context eligibility,
    the safety rule, any limit, or cause a write. Proven by fixtures that
    attempt each escalation in ADR-014 decision 4, not asserted.
2d. Memory candidates from the note are created `inferred_proposed` /
    `proposed` and are never active without explicit owner review. An invalid
    memory section is discarded and the plan still returns.
3. Sessions are sport-agnostic, personal, structured, and contain no global
   exercise-library dependency. No session carries activities or targets.
4. The selected horizon respects approved availability, time, equipment,
   location, preference, limitation, and duration constraints.
4a. No date carries more than 3 sessions and the horizon carries no more than
    `3 x dayCount`. There is no minutes cap and no required rest day; a
    proposal is not rejected for lacking one.
5. Goal priorities and allocation are visible, and material tradeoffs/
   uncertainty have concise reasons or alternatives.
5d. Each session carries exactly one primary goal and zero or more unweighted
    secondary goals. No percentage or weight appears anywhere in the schema or
    the surface.
5e. Every requested date renders as its own block including rest days, and a
    rest day reads as planned rather than as missing data.
5a. Below the context minimum — no active goal, or no resolved timezone — the
    server refuses before any provider call, names what is missing, and consumes
    no idempotency key or spend reservation. At or above it, the plan generates
    and discloses what the coach did not have.
5b. The day-count selector defaults to 7 on first use and remembers the last
    count; the start date resets to owner-local today on every request and is
    never remembered.
5c. Undecided memory candidates survive the owner leaving the proposal screen,
    remain `proposed`, and appear on M2-02's review surface. None is ever active
    without explicit review.
6. Safety behavior is conservative and non-diagnostic; unsafe or impossible
   output is rejected in full.
6a. An ordinary limitation pauses only the affected activity and the rest of the
    horizon still generates. A severe, acute, or worsening signal pauses all
    generation and returns a rest-focused response advising a qualified
    professional. The tier is decided by the server, proven by fixtures at both
    tiers rather than asserted.
7. The model cannot choose owner/date limits, access records directly, persist
   a plan, or accept its own output.
8. Proposal/source records are owner-scoped, immutable as generated evidence,
   and denied to anonymous/cross-user callers.
9. Retry/concurrency does not duplicate provider attempts, proposals, or
   budget usage.
10. The 390px proposal flow has honest loading/error/reject/continue states and
   never implies acceptance.
11. No accepted plan, lock, completion, replan, friend/non-M0-06A-hosted behavior,
    external sink, secret, or unapproved spend is added.

Criterion 2b — roadmap present and stale — moved to M3-03C with the behavior it
describes.

## Test plan

- Date/timezone/DST fixtures for 1, 2, and 7 local dates; rejection of 0, 8,
  mismatched counts, gaps, duplicates, and model-expanded horizons.
- Schema fixtures for alternatives, allocations, unknown fields, malformed
  values, excessive counts, and size.
- Goal references: a session with one primary and three secondaries validates;
  a session with no primary is rejected; a secondary naming an inactive or
  unowned goal is rejected; no weight field is accepted anywhere.
- The description of the week: 1 character passes, 600 passes, 601 is rejected,
  and an absent description is rejected.
- Session-count bound: 3 on one date passes, 4 is rejected; `3 x dayCount`
  passes and one more is rejected. A horizon with no rest day and a horizon of
  very long sessions both pass, because neither is a rule.
- Constraint fixtures for availability, equipment, locations, time, goal
  conflicts, priorities, limitations, and insufficient context. The availability
  cases include the cold-start shape named above.
- Planning-note injection fixtures: one per escalation listed in ADR-014
  decision 4, each asserting the candidate is rejected by output validation
  rather than the note being filtered. Also empty note, maximum-length note,
  and over-length rejection at the compose step.
- Memory-extraction cases: valid candidates, an invalid memory section with a
  valid plan section, and proof that no candidate is ever created active.
- Safety cases at **both tiers**: an ordinary limitation leaves the rest of the
  horizon generating with an alternative, a severe/acute/worsening signal pauses
  all generation, an ambiguous signal resolves to the conservative tier, and
  prohibited diagnosis/treatment/safety claims are rejected.
- Context-minimum cases: no active goal and no timezone each refuse before the
  provider call with no key or reservation consumed; one active goal plus a
  timezone and nothing else generates and discloses what was thin.
- Selector memory: the day count persists across requests and the start date
  resets to today, including across a date change while the app is open.
- An undecided memory candidate survives navigation away from the proposal and
  is still `proposed`, not active.
- Owner/anonymous/cross-user proposal/source/RLS tests.
- Idempotency, changed-source, concurrent request, provider failure, invalid
  output, and zero-direct-write tests.
- Fixture tests through M3-01 with token/cost cap evidence. A live test needs
  separate spend approval and is not assumed.
- Playwright `390x844` flow for compose screen, expand and collapse the context
  summary, write a planning note, generate, review requested dates, expand
  alternatives/safety, review memory candidates, reject, continue, changed
  source, and safe failure.
- Content/secret scan across telemetry, logs, errors, HTML, snapshots,
  screenshots, URLs, and client bundles.

## Implementation guidance

Reuse M3-01's adapter/gate and M3-02's source model. Put calendar, constraints,
allocation, and safety in server/domain services.
Persist only the immutable proposal in this slice. Create any schema through a
supported forward migration with explicit RLS and direct owner/cross-user tests.

**Leave the seams open.** M3-03B adds a second owner-text field and a previous
proposal as a context source; M3-03C adds a roadmap source and a staleness
marker. Neither should require reshaping what this ticket builds. A context
assembler that cannot take another source, or a proposal record with no room for
one, will be paid for twice.

## Required handoff

Provide exact branch/commit, changed files, final schemas and limits, RLS/
privilege matrix, selected-horizon/DST evidence, constraint/safety/idempotency
tests, fixture token-cost evidence, `390x844` demo, leakage scan, limitations,
and confirmation that no acceptance/logging/replan/regeneration/roadmap-input/
friend/non-M0-06A-hosted/external behavior was added.

## Open decisions

**None remain open.** Every decision this ticket owns was answered on 12 August
2026 - 1, 3, 4, 5, 6, 7, 8, 9, 12, 13, and 17 - with 3 and 7 answered by moving
them to M3-03D with the detail they govern. Five others moved out in the earlier
split: 10, 11, and 18 to M3-03C; 15 and 16 to M3-03B. Decision 2 was already
decided on 8 August 2026 and 14 on 9 August 2026.

The ticket is decision-complete and ready for the product owner to move to
`approved`. It is **not** approved by the decisions being answered; that is a
separate act.

1. ~~Day-count selector behavior~~ — **decided 12 August 2026, together with
   decision 13.** The selector is always visible and the approved range stays
   1–7. It defaults to 7 on first use and **remembers the day count** across
   requests. The **start date always resets to the owner's local today**, and is
   never remembered. The asymmetry is deliberate: a remembered day count is
   still correct next week, but a remembered start date is not — last week's
   "next Monday" is a past or wrong date today, and a silently stale start date
   is the kind of error nobody notices until the plan covers the wrong days.
2. ~~Start-date rule~~ — **decided 8 August 2026.** A proposal starts on the
   owner's local today or later, never in the past, so a proposal can never
   contain a day that has already happened. The owner may choose a later start
   date. Manual planning currently permits a past start; M3-06 changes that so
   the product has one rule.
3. ~~Default units and unit-selection source~~ — **decided 12 August 2026:
   moved to [M3-03D](M3-03D-ON-DEMAND-SESSION-DETAIL.md)** with the activity
   detail it belongs to, and answered there by reusing M1's accepted contract.
   Units are per-value in `is_valid_training_measurement` (`kg`/`lb`, distance
   and pace units, a free unit string on `custom`), so there is no global unit
   setting to decide. A session in this ticket carries minutes, which need no
   unit choice.
4. ~~Maximum sessions/day and horizon, activities/session, daily/horizon
   minutes, intensity bounds, and rest requirements~~ — **decided 12 August
   2026.**

   - **Maximum 3 sessions per day.** Raised from the shipped
     `MAX_SESSIONS_PER_DAY = 2`, because a real day can hold a short morning
     mobility or yoga session, a run, and a gym session. The horizon maximum
     follows as `3 × dayCount`, replacing the shipped `MAX_SESSIONS = 14`.
   - **No daily or horizon minutes cap**, and **no rest requirement**. Neither
     is a rule the server should own. The coach decides, and the tiered safety
     rule in decision 8 is the guard.
   - The 3-per-day limit is a **structural output bound, not a training rule**.
     It exists so a malformed or runaway response is rejected rather than
     parsed. It is set where an owner would not meet it in ordinary use.
   - **Activities per session and intensity bounds moved to
     [M3-03D](M3-03D-ON-DEMAND-SESSION-DETAIL.md)** with the detail operation.

   Changing `MAX_SESSIONS_PER_DAY` and `MAX_SESSIONS` alters validation that
   already ships for `fittip.seven-day-plan.v1`. That is deliberate and is part
   of the v2 bump; the builder must update `output-validation.ts` and its tests
   rather than adding a parallel limit.
5. ~~Minimum required context and behavior when it is incomplete~~ — **decided
   12 August 2026: a threshold, then disclosure.** Below the minimum the server
   refuses to generate and names exactly what is missing, pointing the owner at
   goals or onboarding; it does not call the provider. At or above it, the plan
   generates and the response discloses what the coach did not have.

   **The minimum is at least one active goal and a resolved owner timezone.**
   Training history, accepted memory, and a planning note are all optional — an
   owner with one goal and nothing else must be able to plan their first week,
   which is the case a threshold set any higher would block.

   The refusal is a server decision made before the call, not a model judgement,
   and it is not a safety failure: it says the coach has nothing to work from,
   in those terms.
6. ~~Goal-allocation representation and visible tradeoff copy~~ - **decided
   12 August 2026: one primary goal, optional unweighted secondaries.**

   Each session names **one primary goal** it serves and may name any number of
   **secondary goals**, all unweighted. This changes the v1 shape, which carried
   a single `goalId`.

   **Weights were considered and rejected.** A coach claiming a run is "70%
   endurance, 30% weight loss" has invented those numbers, the owner cannot
   check them, and a percentage invites being read as measurement. Unweighted
   primary-plus-secondary says the true thing - this session mainly serves that
   goal and also helps these - without manufacturing precision.

   Tradeoff copy is prose, not numbers: where available time cannot serve every
   goal, the proposal says which goal gave way and why, in the session or
   horizon rationale.
7. ~~Activity target limits and custom measurement schema~~ — **decided
   12 August 2026: reuse M1's accepted contract verbatim, in
   [M3-03D](M3-03D-ON-DEMAND-SESSION-DETAIL.md).** The AI is bound by exactly
   `is_valid_training_measurement` — the same five modes, the same key sets, the
   same bounds — with nothing added and nothing tightened. A target the AI
   proposes is therefore a target M1 can already store, so acceptance in M3-04
   cannot fail on a shape the coach was allowed to produce. This ticket carries
   no activity, so the decision travels with the detail operation.
8. ~~Safety thresholds and whether a signal pauses all generation or only an
   affected activity~~ — **decided 12 August 2026: tiered by severity.**

   - **An ordinary limitation or mild signal pauses only the affected
     activity.** The rest of the horizon still generates, with reduced load,
     rest, or non-conflicting alternatives. A sore knee must not stop the owner
     planning a swim.
   - **A severe, acute, or worsening signal pauses all generation.** The
     response is rest-focused, states plainly that it is not planning training
     right now, and advises stopping the relevant activity and consulting a
     qualified professional.

   Both tiers stay non-diagnostic. The tier is decided by the server against the
   approved rule, from explicitly accepted context and the planning note — never
   by the model, and never inferred from free text the owner has not had
   reviewed. Where the tier is uncertain, take the more conservative one.

   The numeric thresholds that separate the tiers are part of decision 4 and are
   still open.
9. ~~Exact proposal layout, alternatives, and reasoning~~ - **decided
   12 August 2026: day cards with a session summary.** The regeneration action
   in the original wording moved to M3-03B.

   Every date in the horizon gets a block, **rest days included and explicit**.
   Each session shows title, sport, duration, and its primary goal. Focus,
   reasoning, and alternatives are one tap away rather than inline.

   ```text
   +-----------------------------+
   | Mon 18 Aug                  |
   | +-------------------------+ |
   | | Easy aerobic run        | |
   | | Running - 45 min        | |
   | | * Sub-50 10k            | |
   | +-------------------------+ |
   | +-------------------------+ |
   | | Mobility                | |
   | | Yoga - 20 min           | |
   | | * Stay injury-free      | |
   | +-------------------------+ |
   +-----------------------------+
   | Tue 19 Aug                  |
   |   No session planned        |
   +-----------------------------+
   | Wed 20 Aug                  |
   | +-------------------------+ |
   | | Threshold intervals     | |
   | | Running - 60 min        | |
   | | * Sub-50 10k            | |
   | | tap for focus and why   | |
   | +-------------------------+ |
   +-----------------------------+
   ```

   The two alternatives were a fully expanded proposal, rejected because a
   seven-day week becomes a very long page on a phone and the shape of the week
   is lost in prose; and one compact row per day, rejected because judging a
   proposal would mean opening every day one at a time.

   This is the shape, not the styling. Spacing, type, and exact controls are the
   builder's, under the `frontend-design` project skill and the product owner's
   `390x844` acceptance pass.
12. ~~What happens to undecided memory candidates when the owner leaves the
    proposal screen~~ — **decided 12 August 2026: retained as `proposed`.** They
    stay on M2-02's memory review surface for later decision. Candidates are
    already independent of the plan decision, and a durable constraint the owner
    mentioned is worth keeping whether or not they liked that week's plan.
    Retention never makes a candidate active — explicit owner review is still
    the only path to that, exactly as acceptance criterion 2d requires.
13. ~~Whether the day-count and start-date selectors remember the last choice
    across requests~~ — **decided 12 August 2026 with decision 1.** Day count is
    remembered; start date is not. The planning note continues not to be, per
    ADR-014 decision 2.
14. ~~The regeneration cap per horizon~~ — **decided 9 August 2026: 3**, as a
    product guardrail rather than a spend control. **Now owned by
    [M3-03B](M3-03B-PLAN-REGENERATION.md)**, together with the open question of
    the copy shown at the cap.
17. ~~What the coach's description of the week should cover, and how long it
    may be~~ - **decided 12 August 2026: 1 to 600 characters**, matching the
    roadmap's existing `summary` bound rather than inventing a second one. It
    covers what the week is trying to achieve, how it serves the goals, and the
    main tradeoff or thing to watch. That is four or five lines on a phone. The
    field is defined here even though M3-03C displays it.

## Approval gate

**Tier 1.** Schema, migration, RLS, an AI provider path, and spend: approved
ticket, distinct builder, distinct independent reviewer, hosted migration
evidence against the founder project, Preview verification, and product-owner
acceptance.

**All open decisions were answered on 12 August 2026**, so the remaining gate is
the product owner moving this to `approved`, after which the lead writes the
`## Agent brief` against the scope actually dispatched and spawns a distinct
builder.
