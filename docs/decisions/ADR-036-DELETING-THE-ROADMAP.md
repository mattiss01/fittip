# ADR-036: Deleting the roadmap

**Status:** accepted — the product owner decided it on 19 October 2026.

**Date:** 20 October 2026

**Ticket:** "Delete roadmap" in [`docs/backlog/NEXT.md`](../backlog/NEXT.md)

**Builds on:** [ADR-031](ADR-031-DELETING-A-LOG.md) (a deleted record is removed, not
hidden, and ids that pointed at it stay). It adds a privileged function that removes owner
data, which is why it is recorded.

## Context

The roadmap could be written, edited by hand (ADR-030) or with the coach, and replaced by
a new one, but never removed. A roadmap that no longer fits, or one written to try the
feature, stayed in force until another took its place. On 19 October 2026 the owner asked
for "Delete Roadmap" in the ⋯ menu beside the roadmap's title, and chose that it erases
the roadmap completely rather than archiving it.

## Decision

1. **Delete erases every roadmap record of the owner**, in one transaction: the head,
   every version, every proposal (open, declined or accepted), the coach requests behind
   them, their sources and decisions, and the milestone ticks and done reviews. Nothing is
   kept: no hidden row, no tombstone, no undo. Afterwards the Roadmap page reads as it did
   before the first roadmap.
2. **It is one definer function, `delete_roadmap(version_id)`**, executable by
   `authenticated` only, held to `auth.uid()` in every statement. `authenticated` still
   holds no `DELETE` on any roadmap table.
3. **It answers to the version the owner was shown**, by id, under the per-owner roadmap
   lock every roadmap write takes, so it cannot interleave with an acceptance, an edit, or
   a coach result being stored. Any other version in force is `PT409`, "Your roadmap
   changed". Not the head revision, which every other roadmap write answers to: it starts
   again from 0 after a delete, so a question left open from before one could match a new
   roadmap's revision and erase it (found in review, 20 Oct 2026). A version id is never
   reused.
4. **With no roadmap in force it does nothing and reports `replayed`.** The roadmap
   repository keeps the client's transport retry (ADR-015), so a retry of a delete that
   landed must be harmless, and it must not erase a proposal the owner asked for after
   the delete.
5. **It asks first.** "Delete roadmap" in ⋯ opens a short question in the middle of the
   screen, as a session's Delete does, saying what goes and what stays. It is offered
   whenever the menu is, including on a roadmap that has ended, and not while a proposal
   awaits a decision, as nothing else in the menu is.

## Consequences

- **Spend is not touched.** `ai_spend_reservations` is its own ledger; a roadmap proposal
  only points at it. A delete neither refunds a call nor resets a cap. The three-asks
  limit per horizon counts requests, so it starts again with a new roadmap, as it does for
  any new horizon.
- **Memory and goal suggestions stay.** They are memory and goal records, decided on
  their own pages; their `source_reference` keeps a `roadmap-proposal:` id that points at
  nothing, as a deleted log's ids do (ADR-031).
- **A plan proposal's `roadmap_version` source keeps its id**, pointing at nothing. Nothing
  reads it back as content. Accepted plans and logs are unchanged: the plan is a separate
  record (product invariant).
- **A coach request still running when the roadmap goes** has nothing to finish into. Its
  result is refused as an unknown request and the owner sees the general error. The
  service settles its spend before storing the result, so it is normally in the ledger
  already; where that settle failed, the reservation stays open and counts at its full
  hold (ADR-019), which overcounts the cap and never undercounts it.
- **The head revision starts again from 0.** The delete is immune (decision 3), but an
  edit form left open from before a delete names a revision a new roadmap may reach again,
  and would then be compared against the new roadmap. `edit_roadmap` still refuses a
  changed start or ended phase, and it needs the old form kept open through a delete and
  as many new versions; it is accepted rather than adding a counter that survives the
  delete.
- A deletion cannot be undone, by the owner or by us. The question is the only guard.
