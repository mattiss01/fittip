# ADR-035: The coach is told what it already suggested

**Status:** accepted — the product owner decided it on 19 October 2026.

**Date:** 19 October 2026

**Ticket:** "The coach is told what it already suggested" in
[`docs/backlog/NEXT.md`](../backlog/NEXT.md)

**Builds on:** [ADR-010](ADR-010-M2-MEMORY-WRITE-BOUNDARY.md) decision 16 (memory
suggestions from a planning note) and [ADR-034](ADR-034-THE-COACH-SUGGESTS-A-GOAL.md)
(goal suggestions). Amends ADR-034's "none on ask again", shipped in `31601e5`.

## Context

The coach was never shown a suggestion the owner had not accepted. A later note that
said the same thing got the same memory or goal suggestion again, and "ask again" on a
plan could repeat the first answer's memory suggestions. Roadmap "ask again" also lost
the planning note, so the coach answered the feedback without the question.

## Decision

1. **A "don't repeat" list on every plan and roadmap call**, "ask again" included:
   `alreadySuggested`, holding the coach's memory suggestions (`inferred_proposed`) and
   goal suggestions that are still open or were rejected in the last 60 days. Memory by
   its wording cut to 160 characters, the newest 20; goals by title, the newest 10.
2. **It is not a fact.** It is a separate field, never part of `memory`, and the prompt
   says it is not about the athlete and nothing is planned from it. Accepted suggestions
   are not on it: they are active memory and goals, which the coach reads as such.
3. **Rejected text goes to the provider.** The owner decided that a rejected suggestion
   is the one they least want to see again, and accepted sending its wording for 60 days.
4. **"Ask again" may suggest memory and goals too.** The list is what keeps the first
   answer's suggestions from coming back. ADR-028's rule stays: a roadmap change note
   proposes no memory.
5. **An exact repeat is dropped server-side** (case, spacing and a closing full stop
   aside), whatever the model did. A reworded repeat is the prompt's to prevent.
6. **Roadmap "ask again" sends the declined proposal's planning note**, read from the
   stored proposal as the change mode already is, never from the form.
7. **No spend change.** The list has 5,200 bytes and trims to fit rather than refusing;
   the worst cases are 19,341 (roadmap) and 18,141 (plan) of the 20,000 input tokens.

## Consequences

- A suggestion the owner leaves open keeps the coach from suggesting it again for as long
  as it stays open; one they reject does for 60 days.
- The context source reads `goal_suggestions` for the plan and the roadmap; a fill reads
  none and sends no list.
