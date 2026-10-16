# ADR-032: A roadmap proposal stays acceptable

**Status:** accepted — the product owner decided it on 16 October 2026.

**Date:** 16 October 2026

**Ticket:** "A roadmap proposal stays acceptable" in [`docs/backlog/NEXT.md`](../backlog/NEXT.md)

**Changes:** what `accept_roadmap_proposal` compares. The source recheck goes back to
M3-15A and was carried through [ADR-028](ADR-028-CHANGE-WITH-COACH.md)'s amendment; it
became visible with [ADR-031](ADR-031-DELETING-A-LOG.md), since deleting a log made an open
proposal that read it impossible to accept.

## Context

A roadmap proposal records the goals, memory items and logs the coach was given. Accepting
it compared every one: a log edited or deleted since, a memory item edited or turned off,
a goal archived, and the proposal was refused with "Review the proposal again". Reviewing
again meant declining and asking again, which is a paid coach call, for a proposal the
owner had read and wanted.

## Decision

1. **Nothing the owner changes after asking stops a proposal being accepted.** Logs,
   memory items and goals the coach read are no longer compared at acceptance. They stay
   recorded with the proposal as provenance.
2. **One refusal is kept, on what the proposal names.** A goal the coach was given that a
   phase or a milestone names, and that is no longer the owner's active or achieved goal
   (deleted, paused or abandoned), refuses: a roadmap in force cannot point at it. The
   owner is told so and declines it to ask again. Achieved stays allowed, as it was.
3. **The roadmap checks stay**: the page's head revision, and that the roadmap the
   proposal was made under is still the one in force.

## Consequences

- A proposal accepted after an edit describes what the coach was told, not what is true
  now. The owner reads it before accepting; Edit roadmap (ADR-030) changes it after.
- A source naming a record that is not the owner's is never read, so it neither verifies
  nor blocks; nothing of another owner's is reached.
- A hand-written or edited proposal's goals are checked when it is written, not here,
  since only goals the coach was given are recorded as sources.
