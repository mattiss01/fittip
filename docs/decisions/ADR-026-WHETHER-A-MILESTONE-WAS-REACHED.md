# ADR-026: Whether a milestone was reached

**Status:** accepted — the product owner decided it on 13 October 2026.

**Date:** 13 October 2026

**Ticket:** "Whether a milestone was reached" in [`docs/backlog/NEXT.md`](../backlog/NEXT.md)

**Builds on:** [ADR-015](ADR-015-M3-ROADMAP-TRANSACTIONS.md) (an accepted roadmap version
is immutable) and [ADR-025](ADR-025-WHAT-A-ROADMAP-HOLDS.md) (what a roadmap holds, and that
a phase has zero to three milestones). It adds one table and one `SECURITY DEFINER`
function, which is why it is recorded.

## Context

A milestone showed its title, the day to aim for, and what would count as reaching it.
Nothing could be marked and nothing changed when its day passed. The owner asked for a way
to say a milestone was reached, on 10 October 2026, and settled the open points three days
later.

## Decision

1. **One answer: reached.** A milestone that is not marked is open. Nothing says missed,
   late or overdue, whatever its date, and nothing is counted or scored.
2. **A mark can be taken back.** Taking it back removes it. No history of marks is kept.
3. **A mark holds the owner's local day and nothing else.** No note, and no choosing an
   earlier day.
4. **Only the roadmap in force can be marked,** on the Roadmap page.
5. **A mark belongs to one accepted roadmap.** A new roadmap's milestones start unmarked,
   also where one has the title of an earlier one: a milestone has no identity that crosses
   roadmaps, and inventing one would be guessing that two milestones are the same.
6. **No coach call reads a mark.** Telling the roadmap call what was reached changes what a
   provider is sent, and is its own item, to be decided once marks have been used.

## How it is held

- **A record beside the roadmap**, `roadmap_milestone_marks`, as a log is beside the plan.
  Nothing writes to `roadmap_versions`. A milestone is addressed by where it sits in the
  accepted version, which never changes: the version, the phase's position, the
  milestone's position.
- **Read by its owner** under an ownership policy; **written by nobody directly.** The
  table grants `select` to `authenticated` and nothing else.
- **`set_roadmap_milestone_reached(version, phase, milestone, reached)`** is the one way
  to write. It takes its owner from `auth.uid()` and the day from the owner's confirmed
  time zone (UTC where none is confirmed); neither is a caller's to give. It refuses a
  version that is not the caller's roadmap in force and a milestone the version does not
  have, with one refusal for every reason, so it does not say whether a version exists or
  whose it is. It locks the roadmap head, so a roadmap accepted at the same moment cannot
  leave a mark on the version it replaced.
- **Replay-safe both ways.** Marking a marked milestone keeps the day it was first marked;
  taking back a mark that is not there succeeds.
- **Why a definer function and not an insert policy:** the rule that only the version in
  force may be marked, the existence of the milestone, and the day would otherwise each be
  the browser's word. ADR-009 is the precedent for owner-scoped definer functions.

## Consequences

- One more `authenticated_security_definer_function_executable` warning on the hosted
  project's security advisors, as every owner-scoped definer function adds.
- Marks of a replaced roadmap stay stored with their version and are shown nowhere, as the
  version itself is not.
- Deleting a profile removes its marks with its versions.
