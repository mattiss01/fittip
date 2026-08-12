# M3-03: Selected-horizon plan proposal

**Status:** proposed — not approved for implementation

**Triage:** needs-triage

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

**Split:** 12 August 2026 — see below. Regeneration and the roadmap input left
this ticket; the generation slice stayed.

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
[M3-04](M3-04-PLAN-EDIT-LOCK-ACCEPTANCE.md), and
[M3-05](M3-05-M3-VALIDATION-SLICE.md)

## Split into three tickets, 12 August 2026

This ticket carried plan generation, a schema version bump, sessions and
activities, safety, goal allocation, the roadmap-as-optional-input path with its
staleness rule, regeneration with mandatory feedback, the Progress reasoning
section, and a full 390px flow — 555 lines and **sixteen** open product
decisions. AGENTS.md requires an `## Agent brief` of about 40 lines and says a
ticket that cannot be summarized in one is usually too large to be one ticket.
This was.

The scope was divided at the two seams where the work is genuinely independent:

- **M3-03 (this ticket)** — generate, validate, persist, and display one plan
  proposal for the selected dates, from goals, memory, training history, and the
  planning note. Reject it. No roadmap, no regeneration.
- **[M3-03B](M3-03B-PLAN-REGENERATION.md)** — regeneration with mandatory
  feedback and the cap of 3.
- **[M3-03C](M3-03C-ROADMAP-AS-PLAN-INPUT.md)** — the accepted roadmap as an
  optional and possibly stale input, plus the Progress reasoning section.

The seams are real rather than administrative. Regeneration needs a proposal to
regenerate from, and the roadmap path needs a working generation to feed. Both
are additive to this ticket's output and neither changes its schema. That is why
each can be approved, built, and judged on its own.

Nothing was dropped. Every open decision, acceptance criterion, and test-plan
line moved to exactly one of the three, and the decided lines stayed here as
history with a pointer to their new owner.

## Outcome

Generate and display one sport-agnostic plan proposal for the user-selected next
1–7 days, based on active goals, active explicitly accepted coaching context,
training history within ADR-013's bounds, and the owner's planning note. The
proposal contains exactly the requested number of consecutive owner-local dates,
dated sessions and personal activity candidates, goal allocation,
duration/intensity targets, alternatives, concise reasoning, and conservative
safety behavior. It changes no plan until explicit acceptance in M3-04.

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

1. Define strict `DetailedPlanProposal`, session, activity, target,
   alternative, allocation, rationale, and safety schemas.
2. Build an owner-scoped context from active goals, eligible explicitly
   accepted memory, training history under ADR-013, the planning note under
   ADR-014, timezone, and approved generation date.
3. Add a compose step: day-count and start-date selection, an optional planning
   note, and a collapsed-by-default summary of what the coach will receive.
4. Accept an explicit user-selected `dayCount` from 1 through 7 and generate
   exactly that many consecutive owner-local calendar dates.
5. Enforce server-owned limits for sessions, daily/horizon time, activities,
   intensity/effort, target shape, and allowed context.
6. Support sport-agnostic personal activities without a global library.
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
- A session contains title, sport/domain, focus, expected duration, effort or
  recovery intent where applicable, ordered activities, goal allocation,
  alternatives, and concise rationale.
- An activity contains name, sport/domain, intent, optional instructions,
  estimated minutes, one approved measurement mode, validated target,
  alternatives, and a future lock field defaulting unlocked.
- Measurement modes remain sport-agnostic:
  `sets_reps_load`, `time_distance_pace`, `duration_intensity`,
  `skill_repetitions`, or `custom`.
- Custom targets use a bounded validated key/value shape; JSON is not an
  arbitrary escape hatch.
- Every referenced goal is active and owner-scoped. Core/supporting priorities
  and ranks remain visible in allocation.
- **The proposal carries a coach-authored description of the week as a whole**,
  separate from any per-session rationale. Added 9 August 2026 — see the schema
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

Everything else in the contract list above is also unrepresented in the shipped
stub — sport/domain, activities, measurement modes, allocation, alternatives,
locks. M3-01 shipped deliberate stubs and named them as such, so the schema work
here is substantially larger than wiring an existing type, and the version bump
covers all of it at once.

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
- fetch eligible M1 training/M2 context records;
- treat the planning note as context with no authority, per ADR-014 decision 4;
- enforce approved maximum session count, daily duration, horizon duration,
  activity count, target ranges, and intensity rules;
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
   1 through 7, confirms the start date, and may write a planning note. A
   disclosure — collapsed by default so the screen stays short at 390px —
   summarizes what the coach will receive: active goals, active constraints, and
   recent load.
4. The owner confirms, and a pending state states that no plan will change
   automatically.
5. The proposal shows the exact requested dates, daily sessions/rest, activities,
   duration/intensity, goal allocation, constraints, alternatives, and concise
   reasons.
6. The owner can inspect activity details and safety/uncertainty notes.
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
3. Sessions/activities are sport-agnostic, personal, structured, and contain
   no global exercise-library dependency.
4. The selected horizon respects approved availability, time, equipment, location,
   preference, limitation, session/activity, duration, intensity, and unit
   constraints.
5. Goal priorities and allocation are visible, and material tradeoffs/
   uncertainty have concise reasons or alternatives.
6. Safety behavior is conservative and non-diagnostic; unsafe or impossible
   output is rejected in full.
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
- Schema fixtures for all measurement modes, custom target bounds, alternatives,
  allocations, unknown fields, malformed values, excessive counts, and size.
- Constraint fixtures for availability, equipment, locations, time, goal
  conflicts, priorities, limitations, and insufficient context. The availability
  cases include the cold-start shape named above.
- Planning-note injection fixtures: one per escalation listed in ADR-014
  decision 4, each asserting the candidate is rejected by output validation
  rather than the note being filtered. Also empty note, maximum-length note,
  and over-length rejection at the compose step.
- Memory-extraction cases: valid candidates, an invalid memory section with a
  valid plan section, and proof that no candidate is ever created active.
- Safety cases for ordinary limitation, pain/illness/severe fatigue, and
  prohibited diagnosis/treatment/safety claims.
- Owner/anonymous/cross-user proposal/source/RLS tests.
- Idempotency, changed-source, concurrent request, provider failure, invalid
  output, and zero-direct-write tests.
- Fixture tests through M3-01 with token/cost cap evidence. A live test needs
  separate spend approval and is not assumed.
- Playwright `390x844` flow for compose screen, expand and collapse the context
  summary, write a planning note, generate, review requested dates, expand
  activity, alternatives/safety, review memory candidates, reject, continue,
  changed source, and safe failure.
- Content/secret scan across telemetry, logs, errors, HTML, snapshots,
  screenshots, URLs, and client bundles.

## Implementation guidance

Reuse M3-01's adapter/gate and M3-02's source model. Put calendar, constraints,
activity-target validation, allocation, and safety in server/domain services.
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

Eleven remain here. Five moved: 10 and 11 to M3-03C, 15 and 16 to M3-03B, and 18
to M3-03C. Decided lines stay below as history.

1. Day-count selector behavior: the approved range is 1–7. Recommendation:
   default first use to 7 and remember the last choice thereafter while always
   showing the selector.
2. ~~Start-date rule~~ — **decided 8 August 2026.** A proposal starts on the
   owner's local today or later, never in the past, so a proposal can never
   contain a day that has already happened. The owner may choose a later start
   date. Manual planning currently permits a past start; M3-06 changes that so
   the product has one rule.
3. Default units and unit-selection source.
4. Maximum sessions/day and horizon, activities/session, daily/horizon minutes,
   intensity bounds, and rest requirements.
5. Minimum required context and behavior when it is incomplete.
6. Goal-allocation representation and visible tradeoff copy.
7. Activity target limits and custom measurement schema.
8. Safety thresholds and whether a signal pauses all generation or only an
   affected activity.
9. Exact proposal layout, alternatives, and reasoning. The regeneration action
   in the original wording moved to M3-03B.
12. What happens to undecided memory candidates when the owner leaves the
    proposal screen — discarded, or retained as `proposed` for later review.
13. Whether the day-count and start-date selectors remember the last choice
    across requests, given that the planning note deliberately does not.
14. ~~The regeneration cap per horizon~~ — **decided 9 August 2026: 3**, as a
    product guardrail rather than a spend control. **Now owned by
    [M3-03B](M3-03B-PLAN-REGENERATION.md)**, together with the open question of
    the copy shown at the cap.
17. What the coach's description of the week should cover, and how long it may
    be. It is the v2 field behind the Progress section, and an unbounded one
    would grow output tokens on every request. The field is defined here even
    though M3-03C displays it.

## Approval gate

**Tier 1.** Schema, migration, RLS, an AI provider path, and spend: approved
ticket, distinct builder, distinct independent reviewer, hosted migration
evidence against the founder project, Preview verification, and product-owner
acceptance. The open decisions above are product-owner decisions and must be
answered before dispatch.
