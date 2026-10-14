# ADR-029: A roadmap written by hand

**Status:** accepted — the product owner decided it on 13 and 14 October 2026.

**Date:** 14 October 2026

**Ticket:** "Write a roadmap yourself" in [`docs/backlog/NEXT.md`](../backlog/NEXT.md)

**Builds on:** [ADR-015](ADR-015-M3-ROADMAP-TRANSACTIONS.md) (a roadmap is a proposal
accepted into a version), [ADR-027](ADR-027-A-REVIEW-AFTER-EVERY-PHASE.md) (the v4 shape)
and [ADR-028](ADR-028-CHANGE-WITH-COACH.md) (the "Change roadmap" choice). It adds a
proposal origin, a privileged function and a migration, which is why it is recorded.

## Context

A roadmap could only come from the coach. An owner without a subscription, or with no
provider configured, could not have one at all. The owner asked on 2 October 2026 for a
roadmap to be writable by hand.

The records did not allow it. A proposal had to name the generation request that made it
and carry the provider, model, prompt and rate-card codes of that call. A hand-written
roadmap has none of these.

## Decision

1. **Saving puts it in force at once, with nothing to review** (owner, 13 Oct). It is
   stored as a proposal accepted in the same step, so a version still comes from a
   proposal and the records keep their shape.
2. **A new origin, `owner_written`.** Its request, codes, spend, source and owner text are
   null, and a check on `roadmap_proposals` ties that to the origin both ways: every
   other origin still carries its request and all four codes.
3. **One function, `write_roadmap(content, expected head)`.** It holds the content to the
   v4 envelope and to a coach request's horizon (four to fifty-two weeks, from the day
   before UTC today; no upper bound on the start, as there is none on a request's). It
   inserts the proposal and calls `accept_roadmap_proposal`, so the version, head and
   decision are written by the one path that writes them for the coach. A stale head is
   refused. A repeat of a write that landed is a replay, so the client's transport retry
   stays safe.
4. **The least that counts** (owner, 13 Oct): a title, the dates, and one phase with a
   title, what it is for and one goal. A summary and milestones are optional. Phases
   cover the dates without gaps; the form makes that the only thing it can send, since a
   phase's start is derived and never typed.
5. **The form always starts empty** (owner, 13 Oct). Editing the roadmap in force is a
   separate item.
6. **A summary and a milestone's criterion are optional for every roadmap** (owner,
   14 Oct). The criterion is shown as "Details". The coach's grammar still asks for both,
   so a coach roadmap keeps them.
7. **A roadmap no longer has to give every core goal a phase** (owner, 14 Oct). The rule
   came from M3-02 and bound the coach and the validator. It is deleted for both: the
   validator no longer checks it and the prompt no longer asks it.
8. **No label.** A hand-written roadmap is not marked as such where it is shown. Its
   origin is recorded. It is read with the provider code `owner`, never stored, so that
   the missing code is not taken for an unreadable one and labelled an example.
9. **Where it is offered:** the third choice under "Change roadmap", and beside the
   coach's form while there is no roadmap. Not while a proposal awaits a decision.

## Consequences

- A coach proposal left open while a roadmap is written elsewhere can no longer be
  accepted: it was made under another head (the lineage check of 13 Oct).
- The goals a hand-written roadmap names are checked by the application against the
  owner's active goals, as an edit's are. The database checks only the envelope.
- A milestone may have no details, and the Roadmap shows none then.
