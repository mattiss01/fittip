# ADR-032: A roadmap proposal stays acceptable

**Status:** accepted — the product owner decided it on 16 October 2026.

**Date:** 16 October 2026

**Ticket:** "A roadmap proposal stays acceptable" in [`docs/backlog/NEXT.md`](../backlog/NEXT.md)

**Changes:** what `accept_roadmap_proposal` compares. The source recheck goes back to
M3-15A and was carried through [ADR-028](ADR-028-CHANGE-WITH-COACH.md)'s amendment; it
became visible with [ADR-031](ADR-031-DELETING-A-LOG.md), since deleting a log made an open
proposal that read it impossible to accept.

## Context

A roadmap proposal records the sources the coach was given, and accepting it compared
each with the record as it is now. The function had branches for goals, memory and logs,
but the application records only the logs the coach was sent, so in practice one rule
applied: a log edited or deleted after asking made the proposal impossible to accept. The
owner was told to review it again, which meant declining and asking again, a paid coach
call, for a proposal they had read and wanted.

## Decision

1. **A proposal stays acceptable.** Nothing the owner changes after asking (logs, memory,
   goals) is compared at acceptance. The sources stay recorded with the proposal as
   provenance.
2. **A goal the proposal names that is no longer active does not refuse either; the
   proposal says so.** Above the proposal, before Accept: "This roadmap names a goal no
   longer active: Swim a mile. Accepting puts it in force as it is; you can edit it
   afterwards." Paused, abandoned and achieved goals are named by title, deleted ones
   counted. (The owner was first offered a refusal for this case; reading that the goal
   branch had never fired, they chose to accept and be told.)
3. **The roadmap checks stay**: the page's head revision, and that the roadmap the proposal
   was made under is still the one in force.

## Consequences

- A proposal accepted after a change describes what the coach was told, not what is true
  now. The owner reads it before accepting; Edit roadmap (ADR-030) changes it after.
- A roadmap in force may name a goal no longer active. The Plan's coach is already told
  of such a phase (`goal_missing` in `roadmap-stale-reasons.ts`), as it is when a goal is
  paused under a roadmap accepted earlier.
- The refusal "Your goals, memory or training changed…" is gone from the app, with the
  reason that carried it: nothing raises it any more.
- A source naming a record that is not the owner's is never read, so it reaches nothing.
