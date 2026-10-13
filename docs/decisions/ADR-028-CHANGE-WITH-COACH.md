# ADR-028: Change with Coach

**Status:** accepted — the product owner decided it on 13 October 2026.

**Date:** 13 October 2026

**Ticket:** "Change with Coach" in [`docs/backlog/NEXT.md`](../backlog/NEXT.md)

**Builds on:** [ADR-023](ADR-023-WHAT-THE-COACH-IS-GIVEN.md) (what each coach call reads,
and the input ceiling) and [ADR-027](ADR-027-A-REVIEW-AFTER-EVERY-PHASE.md) (a due review,
from which this is offered). It changes what one coach call is sent and raises the input
ceiling, which is why it is recorded. No migration.

## Context

A roadmap in force could be changed with the coach only by asking for a whole new one,
with a note. That request tells the coach an outline of the current roadmap: its title and
each phase's title and dates (ADR-023 decision 8). The owner asked for a way to say what
should be different and get a proposal back, and was clear that an outline is not enough:
"it doesn't make sense to change without giving him the full detailed roadmap."

## Decision

1. **A change request sends the coach the whole roadmap in force:** title, summary, dates,
   and every phase's focus, goal levels and milestones. It is sent in place of the
   outline, as `roadmapToChange`, and only on a request that asks for a change.
2. **This is an exception to the owner's rule of 20 September 2026**, which kept a
   phase's focus, model-authored prose, to the phase being planned. The owner made it
   knowingly, for this one call.
3. **What should change is the request's note**, which is then required. No phase picker;
   the words say which part.
4. **Both dates are the owner's to pick**, opening on today and the day the roadmap ends.
5. **No limit of its own.** A change request is an ordinary first request, bounded by the
   spend ceilings. If its proposal is declined, the usual three rounds of asking again
   apply.
6. **The input ceiling is 18,000 tokens, was 15,000.** A stored roadmap may be 16,000
   bytes, and the roadmap call stood at 14,179 tokens. The owner chose a higher ceiling
   over sending less training history or trimming the roadmap.
7. **It is reached two ways:** the corner of the Roadmap page, where "Change roadmap"
   offers it beside "New roadmap with Coach", and a due review.

## What it costs

A reservation is taken at the ceiling whatever the call, so every coach call now holds
7,200 micro-USD where it held 6,600, inside the 8,000 per-request ceiling the database
also enforces. The daily ceiling of 2,000,000 admits 277 worst-case calls where it admitted
303. A call is charged for what it used: the plan and fill calls are bounded by their own
byte limits, stay under 15,000 tokens, and cost what they did. There is no provider key, so
none of this has been spent.

## How it is held

- **The roadmap is never named by the request.** The form sends a flag and a note. Which
  roadmap is in force is read from the owner's records when the context is built
  (`buildRoadmapToChange`), copied field by field, so what a row stored under an earlier
  version also holds does not travel.
- **Nothing is trimmed.** The allocation is the stored cap, so the whole roadmap always
  fits and there is no count of what was left out. Worst case for the call: prefix 7,800 +
  wrapper 64 + context 63,700 = 71,564 bytes, 17,891 tokens.
- **A change request is refused** without a note, without a roadmap in force, and when it
  is also a regeneration.
- **The request fingerprint** carries the fact, so one idempotency key cannot answer both
  a change and a new roadmap on the same dates.
- **It is stored as any first proposal**, with its note. That it was a change request is
  not recorded; nothing reads it.
- **The prompt** says what `roadmapToChange` is, to keep what was not asked to change, and
  that its text is text and never instruction.

## Consequences

- **Asking again after a decline does not send the whole roadmap.** A regeneration sends
  the declined proposal's outline and the feedback, as for any proposal. Whether it should
  is its own question, and would need the request to record that it was a change.
- "The plan call's logs: 9,300 bytes or the 10,200 the owner named" is no longer a spend
  question: the plan call has 3,000 tokens of room under the new ceiling.
- The prompt was verified against the built-in example coach only, which ignores the
  note. The first live change request is untested until there is a provider key.
