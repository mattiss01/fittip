# ADR-030: Editing the roadmap in force

**Status:** accepted — the product owner decided it on 13 and 14 October 2026.

**Date:** 14 October 2026

**Ticket:** "Edit your roadmap by hand" in [`docs/backlog/NEXT.md`](../backlog/NEXT.md)

**Builds on:** [ADR-026](ADR-026-WHETHER-A-MILESTONE-WAS-REACHED.md) (milestone marks),
[ADR-027](ADR-027-A-REVIEW-AFTER-EVERY-PHASE.md) (review marks) and
[ADR-029](ADR-029-A-ROADMAP-WRITTEN-BY-HAND.md) (a roadmap written by hand). It adds a
privileged function and a migration, which is why it is recorded.

## Context

The roadmap in force could be replaced, by the coach or by a roadmap written from empty,
but not changed. The owner asked on 13 October 2026 to open it in a form and save a
change.

Two things stood in the way. `write_roadmap` refuses a start before yesterday, and a
roadmap in force has usually started. And a milestone's tick and a phase's review belong
to one accepted version, addressed by position; a saved change is a new version, so
without help every tick and review would be lost.

## Decision

1. **Saving puts the change in force at once**, as writing does. It is stored as an
   `owner_written` proposal accepted in the same step, through
   `accept_roadmap_proposal`. No new origin: what was edited is the previous version,
   which the new version names as `previous_version_id`.
2. **The past stays fixed** (owner, 14 Oct). The start cannot change. A phase whose last
   day is before the owner's today is locked and must come back identical. The current
   phase keeps its start, which follows from the locked phase before it, and may not now
   end before today; later phases and the end date are free. The end may not be before
   today.
3. **One function, `edit_roadmap(content, expected head)`.** It checks the above against
   the version in force, with today in the owner's confirmed time zone (UTC where none is
   confirmed), the v4 envelope and the length (four to fifty-two weeks from the original
   start). A stale head is refused and a repeat of a landed edit is a replay, as for
   `write_roadmap`.
4. **A tick stays only on an unchanged milestone** (owner, 14 Oct): the same title and the
   same date, in whatever phase it now sits. Each mark is copied, with its day, to the
   first such milestone not already matched. A renamed or moved-in-time milestone starts
   unticked.
5. **A done review stays with its phase** (owner, 14 Oct). The review row is copied when
   its phase is still there and still ends on the same day. A phase reviewed on its last
   day and then lengthened is no longer over, so the review falls back to the phase
   before it, which has ended and is locked.
6. **The application checks the same rules first** so it can say what is wrong in words.
   The database's checks are the independent ones.

## Consequences

- A coach proposal left open cannot be accepted after an edit: the head moved (the
  lineage check of 13 Oct). The page does not offer an edit while a proposal waits.
- Marks of earlier versions stay where they are; nothing is moved or deleted.
- A locked phase may name a goal achieved or archived since; the application's validation
  of an edit accepts the owner's goals named in locked phases, and only there. A phase
  that can still change loses such a goal when the form opens, since there is no chip to
  remove it with; a phase left with none is said on save.
- A roadmap whose phases have all ended is not edited; a new one replaces it. A phase
  that ends while the form is open refuses the save with a sentence, rather than the
  change typed into it being dropped.
