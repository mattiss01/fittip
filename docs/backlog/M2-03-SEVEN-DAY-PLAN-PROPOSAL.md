# M2-03: Seven-day plan proposal

**Status:** proposed — not approved for implementation

**Milestone:** M2

**Priority:** P1

**Depends on:** [M2-01 accepted](M2-01-LOCAL-AI-ADAPTER-CONTROLS.md) and
[M2-02 accepted](M2-02-ROADMAP-PROPOSAL.md)

**Sequencing note:** M2-02 is required so the first detailed proposal is
traceable to a reviewed high-level direction. M2-01 and M2-02 may not be
bypassed by generating a standalone week.

**Architecture boundary:** ADR-006 and ADR-007 accepted; M0-06A accepted before
founder-hosted use

**Blocks:** [M2-04](M2-04-PLAN-EDIT-LOCK-ACCEPTANCE.md) and
[M2-05](M2-05-M2-VALIDATION-SLICE.md)

## Outcome

Generate and display one exact seven-day, sport-agnostic plan proposal based on
the accepted roadmap, accepted active goals, active memory, and accepted intake
facts. The proposal contains dated sessions and personal activity candidates,
goal allocation, duration/intensity targets, alternatives, concise reasoning,
and conservative safety behavior. It changes no plan until explicit acceptance
in M2-04.

## Local-owner and pre-friends boundary

Provider calls are local or M0-06A founder-hosted and limited to the product
owner's data or synthetic data through M2-01. Friend data, public registration,
commercial/production use, new remote resources, and external analytics remain
prohibited. The full recovery/privacy/
instrumentation/deployment gates remain mandatory before those uses.

## Scope

1. Define strict `DetailedPlanProposal`, session, activity, target,
   alternative, allocation, rationale, and safety schemas.
2. Build an owner-scoped context from the current accepted roadmap, active
   goals, eligible memory, accepted intake, timezone, and approved generation
   date.
3. Generate exactly seven consecutive owner-local calendar dates.
4. Enforce server-owned limits for sessions, daily/weekly time, activities,
   intensity/effort, target shape, and allowed context.
5. Support sport-agnostic personal activities without a global library.
6. Show priority allocation, constraints used, alternatives, uncertainty, and
   concise visible reasoning.
7. Persist an immutable owner-scoped proposal and minimized source references.
8. Provide explicit reject/regenerate boundary; editing, locking, and
   acceptance belong to M2-04.
9. Add AI-output, domain, authorization, safety, mobile, and leakage tests.

## Non-goals

- No accepted plan version, editing, locks, personal-activity persistence, or
  transactional acceptance; those belong to M2-04.
- No completion/logging, plan-versus-actual history, replan, diff, coaching
  chat, progress metric, or pattern inference.
- No global exercise/activity catalog, strength-first schema, hidden sport
  template, diagnosis, treatment, rehabilitation, or safety guarantee.
- No provider/model/key/spend decision, new remote resource, friend/external
  data, public registration, commercial use, production, or analytics sink.

## Exact seven-day contract

- The proposal has one `startDate`, one `endDate`, and exactly seven
  consecutive owner-local dates inclusive.
- Every session is assigned to one of those dates; rest/no-session days remain
  explicit in the week representation.
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

- derive owner, timezone, generation date, and seven-day range;
- fetch only the current accepted roadmap and eligible M1 records;
- enforce approved maximum session count, daily duration, weekly duration,
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
  structured proposed week.
- It is not the operational plan used by Today/logging until M2-04 accepts it.
- RLS and repositories enforce immutable `user_id`, owner predicates, explicit
  grants, and anonymous/cross-user denial.
- Retry returns the same validated proposal when idempotent; changed source
  versions require review/regeneration.

## Proposed 390px flow

1. The owner opens **Plan** after an accepted roadmap exists.
2. The owner chooses the approved explicit **Generate seven-day plan** action.
3. A pending state states that no plan will change automatically.
4. The proposal shows the exact dates, daily sessions/rest, activities,
   duration/intensity, goal allocation, constraints, alternatives, and concise
   reasons.
5. The owner can inspect activity details and safety/uncertainty notes.
6. The owner may continue to the M2-04 edit/lock/accept flow or reject the
   proposal.
7. Invalid/provider/control failure shows a safe retry/review state without
   saving an accepted plan.

Exact labels, date-start default, units, density, and review presentation
require approval.

## Acceptance criteria

1. The validated proposal covers exactly seven consecutive owner-local dates.
2. Sessions/activities are sport-agnostic, personal, structured, and contain
   no global exercise-library dependency.
3. The week respects approved availability, time, equipment, location,
   preference, limitation, session/activity, duration, intensity, and unit
   constraints.
4. Goal priorities and allocation are visible, and material tradeoffs/
   uncertainty have concise reasons or alternatives.
5. Safety behavior is conservative and non-diagnostic; unsafe or impossible
   output is rejected in full.
6. The model cannot choose owner/date limits, access records directly, persist
   a plan, or accept its own output.
7. Proposal/source records are owner-scoped, immutable as generated evidence,
   and denied to anonymous/cross-user callers.
8. Retry/concurrency does not duplicate provider attempts, proposals, or
   budget usage.
9. The 390px proposal flow has honest loading/error/reject/continue states and
   never implies acceptance.
10. No accepted plan, lock, completion, replan, friend/non-M0-06A-hosted behavior,
    external sink, secret, or unapproved spend is added.

## Test plan

- Date/timezone/DST fixtures proving exactly seven local dates.
- Schema fixtures for all measurement modes, custom target bounds, alternatives,
  allocations, unknown fields, malformed values, excessive counts, and size.
- Constraint fixtures for availability, equipment, locations, time, goal
  conflicts, priorities, limitations, and insufficient context.
- Safety cases for ordinary limitation, pain/illness/severe fatigue, and
  prohibited diagnosis/treatment/safety claims.
- Owner/anonymous/cross-user proposal/source/RLS tests.
- Idempotency, changed-source, concurrent request, provider failure, invalid
  output, and zero-direct-write tests.
- Fixture and opt-in live owner/synthetic tests through M2-01 with token/cost
  cap evidence.
- Playwright `390x844` flow for generate, review week, expand activity,
  alternatives/safety, reject, continue, stale source, and safe failure.
- Content/secret scan across telemetry, logs, errors, HTML, snapshots,
  screenshots, URLs, and client bundles.

## Implementation guidance

Reuse M2-01's adapter/gate and M2-02's accepted roadmap/source model. Put
calendar, constraints, activity-target validation, allocation, and safety in
server/domain services. Persist only the immutable proposal in this slice.
Create any schema through a supported forward migration with explicit RLS and
direct owner/cross-user tests.

## Required handoff

Provide exact branch/commit, changed files, final schemas and limits, RLS/
privilege matrix, seven-day/DST evidence, constraint/safety/idempotency tests,
fixture/live token-cost evidence, `390x844` demo, leakage scan, full commands/
results, limitations, and confirmation that no acceptance/logging/replan/
friend/non-M0-06A-hosted/external behavior was added.

## Open decisions

1. Start-date rule: today, next day, or owner-selected date.
2. Default units and unit-selection source.
3. Maximum sessions/day and week, activities/session, daily/weekly minutes,
   intensity bounds, and rest requirements.
4. Minimum required context and behavior when it is incomplete.
5. Goal-allocation representation and visible tradeoff copy.
6. Activity target limits and custom measurement schema.
7. Safety thresholds and whether a signal pauses all generation or only an
   affected activity.
8. Exact proposal layout, alternatives, reasoning, and regeneration action.

## Approval gate

The product owner must approve all plan, unit, constraint, allocation, safety,
UX, and retention decisions. M2-01 and M2-02 must be accepted. Approval is
owner/synthetic local or M0-06A founder-hosted only and does not authorize
M2-04, friend data, public registration, commercial use, production,
analytics, or additional spend.
