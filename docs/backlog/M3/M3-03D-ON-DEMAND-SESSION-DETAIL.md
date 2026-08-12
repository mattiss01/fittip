# M3-03D: On-demand session detail

**Status:** proposed — not approved for implementation

**Triage:** needs-triage

**Milestone:** M3

**Priority:** P1

**Depends on:** [M3-03 accepted](M3-03-SELECTED-HORIZON-PLAN-PROPOSAL.md) for
the session-level plan this details, and
[M3-01 accepted](M3-01-LOCAL-AI-ADAPTER-CONTROLS.md) for the AI boundary.

**Created:** 12 August 2026, when the product owner chose a session-level plan
over a fully detailed one. See M3-03's "Split into four tickets".

**Blocks:** nothing.

## Outcome

The owner opens one session from a plan and asks the coach to fill it in. The
coach returns that session's ordered activities — name, sport/domain, intent,
optional instructions, estimated minutes, one measurement mode, and a validated
target — for that session and no other.

The plan says *what* the week is. This says *what to do* in one part of it.

## Why detail is generated here rather than in the plan

Decided 12 August 2026, against the alternative of putting activities in every
session of every proposal.

- **Detail is better closer to the day.** A session detailed on Thursday knows
  how Monday to Wednesday actually went. Detail written six days ahead is stale
  by the time it is used, and FitTip's whole model is built around what actually
  happened.
- **It matches the decision the owner is making.** Reviewing a proposal, the
  owner is judging the shape of the week, not whether Thursday's third exercise
  is right. Front-loading detail buries that decision under scrolling at 390px.
- **Cost scales with use.** Full detail across a seven-day plan is roughly an
  order of magnitude more output tokens than a session-level plan, and most of
  it is never read. Against the €10/month provider cap that is real money, and
  it is spent again on every regeneration in M3-03B.
- **M1 already permits it.** `planned_activities` has no minimum-per-session
  constraint and `planned_sessions` carries `title`, `sport`, `intent`,
  `expected_duration_minutes`, and `note` on its own, so a session with no
  activities is already a valid accepted plan.
  `completed_activities.planned_activity_id` is nullable, so logging works
  without them. **No M1 migration is required to allow a session to be
  undetailed.**

The costs, stated rather than glossed: detail needs a network call and is
unavailable offline; plan-versus-actual compares at session level for any
session never detailed; and this is a second AI operation with its own prompt,
schema, idempotency, and spend path.

## The measurement contract is M1's, verbatim

Decided 12 August 2026 (M3-03's decision 7). The coach is bound by exactly
`public.is_valid_training_measurement` as the M1 migration defines it — the same
five modes, the same key sets, the same numeric bounds, the same 4096-byte
ceiling:

- `sets_reps_load` — `sets` 1–100, `reps` 1–10000, optional `load` 0–100000 with
  `load_unit` in `kg`/`lb`.
- `time_distance_pace` — duration, distance, and pace with their units.
- `duration_intensity` — `duration_minutes` up to 10080, plus `intensity` in
  `easy`/`moderate`/`hard`/`very_hard` and/or `perceived_effort` 1–10.
- `skill_repetitions` — `repetitions` 1–1000000 with a unit string up to 32
  characters.
- `custom` — exactly `{label, value, unit}`, label ≤ 80, unit ≤ 32, value a
  number, string, or boolean, serialized ≤ 500 characters.

**Nothing is added and nothing is tightened.** A target the coach proposes is
therefore always a target M1 can store, so acceptance in M3-04 can never fail on
a shape the coach was permitted to produce. Units need no separate decision:
they are already per-value in this contract, so there is no global unit setting.

A test must assert the AI-side validator and the database function accept the
same set, and it must fail if either drifts.

## Non-goals

- No change to the session-level plan schema or to how a plan is generated.
  M3-03 owns that.
- No change to M1's measurement contract, its modes, or its bounds. If the coach
  needs a shape it does not allow, stop and report rather than widening it.
- No global exercise or activity library. Activities stay personal and
  sport-agnostic, exactly as the product invariant requires.
- No editing, locking, or acceptance of the detail; those are M3-04's mechanics
  and depend on open decision 1 below.
- No detailing of a whole plan in one call. One session per request, so cost and
  latency stay proportional to what the owner actually asked for.
- No replan, no completion, and no change to logging.

## Open decisions

1. **What happens when a session is detailed after its plan was accepted.**
   Does adding detail create a new plan version, mutate the accepted one, or
   live beside it as a separate record keyed to the session? This is the
   decision that must be answered before dispatch — it touches M3-04's
   immutability and lock model, and getting it wrong means either a mutable
   accepted plan or a new version for every expanded session. Recorded here
   rather than moved into [M3-04](M3-04-PLAN-EDIT-LOCK-ACCEPTANCE.md), which is
   a separate proposed ticket with its own scope, but it may belong there.
2. **Whether an unaccepted proposal's session can be detailed at all**, or only
   a session in an accepted plan. Detailing before acceptance helps the owner
   judge; it also spends money on a week they may reject.
3. **Maximum activities per session.** A structural output bound rather than a
   training rule, in the same spirit as M3-03's 3-sessions-per-day. It bounds
   output tokens and keeps the session readable at 390px.
4. **Whether detail can be regenerated**, and if so whether M3-03B's cap of 3
   and its mandatory-feedback rule apply per session.
5. **What the owner sees for a session that has not been detailed** — an
   explicit "add detail" action, or nothing at all. It must not read as an error
   or as missing data, because an undetailed session is a complete, valid
   session.

## Acceptance criteria

1. Detailing one session returns activities for that session only, and no other
   session in the plan changes.
2. Every proposed target validates against `is_valid_training_measurement`
   unchanged, proven by a test that runs the AI-side validator and the database
   function over the same cases and asserts they agree.
3. An undetailed session remains valid, readable, and loggable end to end. It is
   never presented as an error or as incomplete data.
4. Activities are personal and sport-agnostic with no global library reference.
5. The operation is owner-scoped: another owner's session cannot be detailed,
   proven by direct and RLS tests.
6. Idempotency, retry, and concurrency do not duplicate provider attempts,
   activity rows, or spend.
7. Safety behavior matches M3-03's tiered rule. A session inside a severe signal
   is not detailed into training.
8. The `390x844` flow covers requesting detail, a pending state, the result, an
   undetailed session, and a safe failure that leaves the session undetailed.
9. No accepted plan is mutated in place unless open decision 1 says so
   explicitly.

## Test plan

- One session detailed; assert no other session's stored representation changed.
- Cross-validation of every measurement mode and its bounds against
  `is_valid_training_measurement`, including the boundary values, asserting the
  AI validator and the database agree exactly.
- An undetailed session logs end to end through the accepted M1 path with a null
  `planned_activity_id`.
- Owner, anonymous, and cross-user attempts to detail a session.
- Idempotency and concurrency: two simultaneous detail requests for the same
  session produce one set of activities and one provider call.
- Safety: a severe-signal session is refused rather than detailed.
- Provider failure and invalid output leave the session undetailed and say so.
- Playwright `390x844` for request, pending, result, undetailed state, failure.

## Approval gate

**Tier 1.** A new AI operation, a provider call, spend, and almost certainly a
migration for the generated activities: approved ticket, distinct builder,
distinct independent reviewer, hosted migration evidence, Preview verification,
and product-owner acceptance. Open decision 1 must be answered before dispatch,
because it determines whether this ticket touches M3-04's accepted immutability
model.
