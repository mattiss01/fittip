# M3-03: Selected-horizon plan proposal

**Status:** proposed — not approved for implementation

**Milestone:** M3

**Priority:** P1

**Depends on:** [M3-01 accepted](M3-01-LOCAL-AI-ADAPTER-CONTROLS.md) and
[M3-02 accepted](M3-02-ROADMAP-PROPOSAL.md)

**Sequencing note:** M3-02 is required so the first detailed proposal is
traceable to a reviewed high-level direction. M3-01 and M3-02 may not be
bypassed by generating a standalone detailed plan.

**Architecture boundary:** ADR-006 and ADR-007 accepted; M0-06A accepted before
founder-hosted use

**Blocks:** [M3-04](M3-04-PLAN-EDIT-LOCK-ACCEPTANCE.md) and
[M3-05](M3-05-M3-VALIDATION-SLICE.md)

## Outcome

Generate and display one sport-agnostic plan proposal for the user-selected
next 1–7 days, based on the accepted roadmap, active goals, active memory, and
accepted intake facts. The proposal contains exactly the requested number of
consecutive owner-local dates, dated sessions and personal activity candidates,
goal allocation, duration/intensity targets, alternatives, concise reasoning,
and conservative safety behavior. It changes no plan until explicit acceptance
in M3-04.

## Local-owner and pre-friends boundary

Provider calls are local or M0-06A founder-hosted and limited to the product
owner's data or synthetic data through M3-01. Friend data, public registration,
commercial/production use, new remote resources, and external analytics remain
prohibited. The full recovery/privacy/
instrumentation/deployment gates remain mandatory before those uses.

## Scope

1. Define strict `DetailedPlanProposal`, session, activity, target,
   alternative, allocation, rationale, and safety schemas.
2. Build an owner-scoped context from the current accepted roadmap, active
   goals, eligible memory, accepted intake, timezone, and approved generation
   date.
3. Accept an explicit user-selected `dayCount` from 1 through 7 and generate
   exactly that many consecutive owner-local calendar dates.
4. Enforce server-owned limits for sessions, daily/horizon time, activities,
   intensity/effort, target shape, and allowed context.
5. Support sport-agnostic personal activities without a global library.
6. Show priority allocation, constraints used, alternatives, uncertainty, and
   concise visible reasoning.
7. Persist an immutable owner-scoped proposal and minimized source references.
8. Provide explicit reject/regenerate boundary; editing, locking, and
   acceptance belong to M3-04.
9. Add AI-output, domain, authorization, safety, mobile, and leakage tests.

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

## Server constraints

The server—not the model—must:

- derive owner, timezone, generation date, requested day count, and exact date
  range;
- fetch only the current accepted roadmap and eligible M1 training/M2 context
  records;
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
  limitations, target dates, and the accepted roadmap are treated as
  constraints, not optional prompt decoration.
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

- Proposal, accepted roadmap, goals, memory, and intake remain separate
  records.
- A proposal stores owner, schema/prompt versions, generation status,
  idempotency reference, source ids/versions, validation state, and the
  structured proposed horizon.
- It is not the operational plan used by Today/logging until M3-04 accepts it.
- RLS and repositories enforce immutable `user_id`, owner predicates, explicit
  grants, and anonymous/cross-user denial.
- Retry returns the same validated proposal when idempotent; changed source
  versions require review/regeneration.

## Proposed 390px flow

1. The owner opens **Plan** after an accepted roadmap exists.
2. The owner selects how many next days to generate, from 1 through 7, and
   confirms the start date.
3. The owner chooses the explicit **Generate plan** action.
4. A pending state states that no plan will change automatically.
5. The proposal shows the exact requested dates, daily sessions/rest, activities,
   duration/intensity, goal allocation, constraints, alternatives, and concise
   reasons.
6. The owner can inspect activity details and safety/uncertainty notes.
7. The owner may continue to the M3-04 edit/lock/accept flow or reject the
   proposal.
8. Invalid/provider/control failure shows a safe retry/review state without
   saving an accepted plan.

Exact labels, date-start default, units, density, and review presentation
require approval.

## Acceptance criteria

1. The user can request 1, 2, or 7 days; the validated proposal covers exactly
   that requested number of consecutive owner-local dates.
2. Requests below 1 or above 7, model attempts to alter the horizon, and
   request/output date-count mismatches are rejected in full.
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
- Safety cases for ordinary limitation, pain/illness/severe fatigue, and
  prohibited diagnosis/treatment/safety claims.
- Owner/anonymous/cross-user proposal/source/RLS tests.
- Idempotency, changed-source, concurrent request, provider failure, invalid
  output, and zero-direct-write tests.
- Fixture and opt-in live owner/synthetic tests through M3-01 with token/cost
  cap evidence.
- Playwright `390x844` flow for select horizon, generate, review requested
  dates, expand activity,
  alternatives/safety, reject, continue, stale source, and safe failure.
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
2. Start-date rule: today, next day, or owner-selected date.
3. Default units and unit-selection source.
4. Maximum sessions/day and horizon, activities/session, daily/horizon minutes,
   intensity bounds, and rest requirements.
5. Minimum required context and behavior when it is incomplete.
6. Goal-allocation representation and visible tradeoff copy.
7. Activity target limits and custom measurement schema.
8. Safety thresholds and whether a signal pauses all generation or only an
   affected activity.
9. Exact proposal layout, alternatives, reasoning, and regeneration action.

## Approval gate

The product owner must approve all plan, unit, constraint, allocation, safety,
UX, and retention decisions. M3-01 and M3-02 must be accepted. Approval is
owner/synthetic local or M0-06A founder-hosted only and does not authorize
M3-04, friend data, public registration, commercial use, production,
analytics, or additional spend.
