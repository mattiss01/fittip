# ADR-020: Measurements and the library may reach a coach; session detail is on demand

**Status:** accepted — the product owner decided all three questions on
28 September 2026, after the session-detail operation (A7) was described as a
trainer writing one session: the session in front of them, the athlete's own
exercises, their recent numbers, and their limits.

**Date:** 28 September 2026

**Ticket:** A7 and A8 in [`docs/backlog/NEXT.md`](../backlog/NEXT.md)

**Builds on:** [ADR-012](ADR-012-AI-GOAL-CONTEXT-ELIGIBILITY.md),
[ADR-013](ADR-013-AI-TRAINING-HISTORY-ELIGIBILITY.md), and
[ADR-014](ADR-014-PLANNING-NOTE-BOUNDARY.md). Every one of those decided a
class of owner data before it crossed the coaching boundary; this does the same
for two more.

## Context

Today a coach sees a completed session's activities as `activityNames` and
nothing else. No target, no actual, no measurement mode, and nothing from the
owner's library — neither personal activities nor saved sessions — crosses the
boundary. That was deliberate: the plan is session-level
(`fittip.seven-day-plan.v2` in `src/server/ai/contracts.ts`), and activity
detail was deferred to a separate per-session operation that did not exist.

That operation (A7) is now the next coaching feature, and it cannot do its job
on names alone. A coach choosing loads for a squat it has never seen the owner
lift is guessing; a coach that cannot see the owner's own activity definitions
will invent a "Lat pulldown" beside their "Latzug", which is exactly the
duplicate the personal-library invariant exists to avoid.

## Decisions

### 1. Measurements are eligible

An activity's **targets** and a completion's **actuals** — sets, reps, load,
distance, duration, pace, intensity, in whichever measurement mode the activity
uses — may be sent to a coach.

The owner's reasoning, recorded as given: nothing that says who the person is
reaches the provider. That was checked when this was decided, not assumed: the
request `openai-adapter.ts` sends carries the model, the token ceiling, the
response schema, and the messages, and no user, account, email, or name field.
Record ids in the context are random UUIDs.

Two limits on that reasoning are worth keeping visible. Free text the owner
writes (session notes, planning notes, memory) can identify them, and already
crosses under ADR-013 and ADR-014 regardless of this decision. And, as in
ADR-013, the premise is founder-only use: the only data at risk is the owner's
own. **A second user, or any subscription tier, reopens this decision** rather
than inheriting it.

Eligibility is not inclusion. This decides that measurements *may* cross; which
operation sends how many, and at what byte allocation, is decided when that
operation is built, under ADR-013's rules: bounded per source, and a trimmed
source is disclosed to the coach as trimmed. For the plan operation that is A8,
and it still has no headroom (`Known limitations`).

### 2. The library is eligible

The owner's **personal activities** (name, sport, measurement mode) and
**saved sessions** (name, title, sport, intent, duration, note, and their
activities with targets) may be sent to a coach. The saved session's `note` is
owner free text and is bounded like every other free-text field.

The reason is the same as for goals under ADR-012: the library is something the
owner curated deliberately, and a coach that can see it can reuse the owner's
own definitions instead of inventing parallel ones.

### 3. Session detail runs on demand only

A coach fills a session's activities only when the owner asks, for that session.
Nothing fills sessions automatically — not on accepting a plan, not on a
schedule. Every fill is an explicit request and a proposal the owner decides,
like every other coaching output.

Automatic fill is a possible later feature, perhaps tied to a subscription tier.
It would be a new decision about spend and about what the coach does
unprompted, and is not implied by this one.

### 4. The plan operation does not receive the library — for now

The seven-day plan stays session-level and is not given saved sessions. The
owner wants this revisited later; until then it is not an open question on any
ticket. What revisiting would involve: a proposal able to reference a saved
session (a schema change), bytes the plan context does not have, and whether a
names-only index would be enough.

## Consequences

- A7 is unblocked for design. It remains careful-lane work: a new operation with
  its own schema, context, and spend. Its context is estimated at about 5,000 to
  6,500 tokens, under the shared 10,000 ceiling, so it does not need the plan's
  headroom. Whether it gets a smaller per-operation ceiling of its own is
  decided when it is built.
- A8 is no longer a privacy question, only a sizing one.
- Nothing in the context assembly changes with this ADR. Each source still has
  to be added deliberately, with its allocation and its tests.
