# M3-03: Selected-horizon plan proposal

**Status:** proposed — not approved for implementation

**Milestone:** M3

**Priority:** P1

**Depends on:** [M3-01 accepted](M3-01-LOCAL-AI-ADAPTER-CONTROLS.md),
[M3-02 accepted](M3-02-ROADMAP-PROPOSAL.md), and
[ADR-013](../../decisions/ADR-013-AI-TRAINING-HISTORY-ELIGIBILITY.md) plus
[ADR-014](../../decisions/ADR-014-PLANNING-NOTE-BOUNDARY.md) accepted

**Revised:** 8 August 2026 — the roadmap became an optional input rather than a
precondition; compose step, planning note, memory extraction, and regeneration
with feedback added

**Sequencing note:** M3-02 ships first so that the roadmap surface exists and
has been judged before detailed planning is built on it. That is a **build**
dependency, not a runtime one. Changed on 8 August 2026: an owner must be able
to generate a weekly plan from goals alone, with no accepted roadmap in
existence. See "The roadmap is an optional input" below. M3-01 may not be
bypassed under any circumstances.

**Architecture boundary:** ADR-006 and ADR-007 accepted; M0-06A accepted before
founder-hosted use

**Blocks:** [M3-04](M3-04-PLAN-EDIT-LOCK-ACCEPTANCE.md) and
[M3-05](M3-05-M3-VALIDATION-SLICE.md)

## Outcome

Generate and display one sport-agnostic plan proposal for the user-selected
next 1–7 days, based on active goals, active explicitly accepted coaching
context, training history within ADR-013's bounds, the owner's planning note,
and the current accepted roadmap where one exists. The proposal contains
exactly the requested number of consecutive owner-local dates, dated sessions
and personal activity candidates, goal allocation, duration/intensity targets,
alternatives, concise reasoning, and conservative safety behavior. It changes no
plan until explicit acceptance in M3-04.

## The roadmap is an optional input

A weekly plan must be generatable with **no accepted roadmap at all**. That path
is a first-class flow, not a degraded fallback, and it is how the owner's first
week is planned.

Where a current accepted roadmap covers the requested dates, it is used
automatically — the owner makes no extra choice — and the compose screen names
it in the context summary so its influence is visible rather than hidden. The
planning note is the override: "ignore the roadmap this week, I am travelling"
is expressed in prose, not by a control.

**A stale roadmap is used and marked stale.** If the goals a roadmap was
accepted against have changed since, the roadmap still travels, carrying an
explicit marker that it predates the current goals, and the context summary says
so. The coach reconciles the two rather than guessing, and the owner can see
why. Silently dropping the roadmap on a goal edit would make direction vanish
from a small change; blocking generation would gate the owner out of planning
their week.

Staleness is determined from the source record ids and versions M3-02 stores on
the accepted roadmap version. The exact staleness predicate needs approval — see
open decisions.

## Local-owner and pre-friends boundary

Provider calls are local or M0-06A founder-hosted and limited to the product
owner's data or synthetic data through M3-01. Friend data, public registration,
commercial/production use, new remote resources, and external analytics remain
prohibited. The full recovery/privacy/
instrumentation/deployment gates remain mandatory before those uses.

## Scope

1. Define strict `DetailedPlanProposal`, session, activity, target,
   alternative, allocation, rationale, and safety schemas.
2. Build an owner-scoped context from active goals, eligible explicitly
   accepted memory, training history under ADR-013, the planning note under
   ADR-014, timezone, approved generation date, and the current accepted
   roadmap **where one exists and covers the requested dates**.
3. Add a compose step: day-count and start-date selection, an optional planning
   note, and a collapsed-by-default summary of what the coach will receive —
   including whether a roadmap is in play and whether it is stale.
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
   source references including roadmap presence and staleness.
10. Provide reject and regenerate. Regeneration is a new call on the same
    operation carrying the immediately previous proposal and a prefilled,
    editable planning note, capped per horizon. Editing, locking, and
    acceptance belong to M3-04.
11. Add AI-output, domain, authorization, safety, mobile, and leakage tests,
    including planning-note injection cases under ADR-014 decision 4.

## Prompt work happens off-API

Per [the M3 delivery approach](M3-BACKLOG.md#delivery-approach--how-m3-gets-built-without-paying-for-iteration),
draft and iterate this operation's prompt in a chat subscription against
synthetic athlete profiles, with and without a synthetic accepted roadmap, and
across several planning notes including ones that contradict the roadmap. Judge
session
quality, goal allocation, and above all the conservative pain, illness, injury,
and severe-fatigue behavior by reading real output — that judgment is the point
of this ticket and needs no API key to exercise.

Save the good shapes as fixtures. The provider is reached only inside M3-01B's
bounded validation budget, once the prompt is settled.

## Non-goals

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

## Regenerating a proposal the owner does not like

Decided 8 August 2026. The owner rejects a proposal, says what they disliked,
and asks for another. This is a **new API call with no shared state** — the
provider retains nothing between requests and the context is reassembled from
scratch.

It is not replan. Replan reacts to what actually happened and belongs to M4;
this refines a proposal that has never been accepted.

**Same operation, not a new one.** The output schema, prompt version, limits,
and validation are identical to a first generation. A regeneration differs in
exactly two ways: the compose screen prefills the previous planning note (the
one exception in ADR-014 decision 2a), and the **immediately previous proposal**
travels as an additional context source so the coach can avoid repeating itself
and preserve what was not criticized.

**Only the immediately previous proposal travels — never the chain.** Context
size stays flat however many rounds the owner goes. Every round is still
persisted as immutable evidence; storage and transmission are separate.

**Regeneration is capped per horizon.** It is the one control in the product
that spends money on every press, and an owner who is not getting what they want
will keep pressing. At the cap the owner is directed to M3-04's editing rather
than left stuck. The exact number and that copy need approval.

Distinguish this from editing throughout the UI. Editing (M3-04) is
deterministic, free, and right for "move Wednesday to Thursday". Regeneration is
an AI call and right for "the whole week is too hard". An owner who cannot tell
which is which will use the expensive one for both.

Feedback at this step is frequently durable — "I never want two hard days back
to back" is a preference, not a comment on one week — so a regeneration note
feeds memory extraction exactly as an initial note does.

## Server constraints

The server—not the model—must:

- derive owner, timezone, generation date, requested day count, and exact date
  range;
- fetch eligible M1 training/M2 context records, and the current accepted
  roadmap only when one exists and covers the requested dates;
- determine roadmap staleness from stored source versions and mark it
  explicitly rather than dropping or blocking;
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
- Availability, time, equipment, locations, preferences, dislikes,
  limitations, target dates, the planning note, and the accepted roadmap where
  present are treated as constraints, not optional prompt decoration.
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

- Proposal, accepted roadmap, goals, memory, and onboarding drafts/candidates
  remain separate records.
- A proposal stores owner, schema/prompt versions, generation status,
  idempotency reference, source ids/versions, validation state, the structured
  proposed horizon, the planning note, and whether a roadmap was used and
  whether it was stale.
- The planning note is never reused on a later request and is never prefilled
  into a later compose screen (ADR-014 decision 2). Its retention against a
  rejected proposal and its visibility in Progress are ADR-014 open decisions
  and must be settled before dispatch.
- It is not the operational plan used by Today/logging until M3-04 accepts it.
- RLS and repositories enforce immutable `user_id`, owner predicates, explicit
  grants, and anonymous/cross-user denial.
- Retry returns the same validated proposal when idempotent; changed source
  versions require review/regeneration.

## Proposed 390px flow

1. The owner opens **Plan**. An accepted roadmap may or may not exist; both are
   ordinary.
2. The owner chooses the explicit **Propose a plan** action. This opens the
   compose screen; it does not start generation.
3. On the compose screen the owner selects how many next days to generate, from
   1 through 7, confirms the start date, and may write a planning note. A
   disclosure — collapsed by default so the screen stays short at 390px —
   summarizes what the coach will receive: active goals, active constraints,
   recent load, and whether a roadmap is in play and whether it is stale.
4. The owner confirms, and a pending state states that no plan will change
   automatically.
5. The proposal shows the exact requested dates, daily sessions/rest, activities,
   duration/intensity, goal allocation, constraints, alternatives, and concise
   reasons.
6. The owner can inspect activity details and safety/uncertainty notes.
7. Any memory candidates extracted from the planning note are presented for
   explicit accept, edit-and-accept, or reject on the accepted M2-02 review
   surface. They are independent of the plan decision.
8. The owner may continue to the M3-04 edit/lock/accept flow, reject the
   proposal, or **regenerate** — which returns to the compose screen with the
   previous planning note prefilled and editable, and states that the coach
   will see the plan being replaced. At the per-horizon cap the action is
   unavailable and the owner is pointed at editing instead, with an honest
   reason rather than a disabled control that explains nothing.
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
    an empty state, or a warning.
2b. Where a roadmap exists it is used without an extra owner action and named
    in the context summary. A stale roadmap is used, marked stale to both the
    coach and the owner, and neither dropped nor allowed to block generation.
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

## Test plan

- Date/timezone/DST fixtures for 1, 2, and 7 local dates; rejection of 0, 8,
  mismatched counts, gaps, duplicates, and model-expanded horizons.
- Schema fixtures for all measurement modes, custom target bounds, alternatives,
  allocations, unknown fields, malformed values, excessive counts, and size.
- Constraint fixtures for availability, equipment, locations, time, goal
  conflicts, priorities, limitations, and insufficient context.
- Roadmap-absent, roadmap-present, and roadmap-stale generation paths, each
  asserting what reaches the boundary and what the context summary reports.
- Planning-note injection fixtures: one per escalation listed in ADR-014
  decision 4, each asserting the candidate is rejected by output validation
  rather than the note being filtered. Also empty note, maximum-length note,
  and over-length rejection at the compose step.
- Memory-extraction cases: valid candidates, an invalid memory section with a
  valid plan section, and proof that no candidate is ever created active.
- Regeneration: assert exactly one superseded proposal reaches the boundary
  however many rounds have run, that every round persists as evidence, that the
  cap blocks a further call rather than failing one, and that context size does
  not grow across rounds.
- Safety cases for ordinary limitation, pain/illness/severe fatigue, and
  prohibited diagnosis/treatment/safety claims.
- Owner/anonymous/cross-user proposal/source/RLS tests.
- Idempotency, changed-source, concurrent request, provider failure, invalid
  output, and zero-direct-write tests.
- Fixture and opt-in live owner/synthetic tests through M3-01 with token/cost
  cap evidence.
- Playwright `390x844` flow for compose screen, expand and collapse the context
  summary, write a planning note, generate, review requested dates, expand
  activity, alternatives/safety, review memory candidates, reject, continue,
  stale source, and safe failure — run once with no roadmap and once with one.
- Content/secret scan across telemetry, logs, errors, HTML, snapshots,
  screenshots, URLs, and client bundles.

## Implementation guidance

Reuse M3-01's adapter/gate and M3-02's accepted roadmap/source model. Put
calendar, constraints, activity-target validation, allocation, and safety in
server/domain services. Persist only the immutable proposal in this slice.
Create any schema through a supported forward migration with explicit RLS and
direct owner/cross-user tests.

## Required handoff

Provide exact branch/commit, changed files, final schemas and limits, RLS/
privilege matrix, selected-horizon/DST evidence, constraint/safety/idempotency tests,
fixture/live token-cost evidence, `390x844` demo, leakage scan, full commands/
results, limitations, and confirmation that no acceptance/logging/replan/
friend/non-M0-06A-hosted/external behavior was added.

## Open decisions

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
9. Exact proposal layout, alternatives, reasoning, and regeneration action.
10. The staleness predicate for an accepted roadmap. Candidates: any change to
    the goal set it referenced; a change to a referenced goal's target date or
    tier; or the roadmap's own horizon having elapsed. These are not equivalent
    and the choice changes how often "stale" appears.
11. Compose-screen copy and grouping for the context summary, including how a
    stale roadmap is described to the owner without alarming them.
12. What happens to undecided memory candidates when the owner leaves the
    proposal screen — discarded, or retained as `proposed` for later review.
13. Whether the day-count and start-date selectors remember the last choice
    across requests, given that the planning note deliberately does not.
14. The regeneration cap per horizon (recommendation: 3) and the copy shown
    when it is reached.
15. Whether regeneration may change the day count or start date, or must reuse
    the original horizon (recommendation: reuse — changing the dates makes it a
    new request, not a regeneration, and the superseded proposal would then be
    about different days).

## Approval gate

The product owner must approve all plan, unit, constraint, allocation, safety,
UX, and retention decisions. M3-01 and M3-02 must be accepted. Approval is
owner/synthetic local or M0-06A founder-hosted only and does not authorize
M3-04, friend data, public registration, commercial use, production,
analytics, or additional spend.
