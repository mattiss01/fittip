# M2-10: Focus is lost after every mutation

**Status:** proposed — not approved for implementation

**Milestone:** M2 — goals, editable coaching context, and guided onboarding

**Priority:** P2

**Owning accepted work:** [M2-01 goal model and validation](M2-01-GOAL-MODEL-VALIDATION.md)
and [M2-02 memory model and management](M2-02-MEMORY-MODEL-MANAGEMENT.md)

**Depends on:** M2-02 accepted

**Source:** reported by M2-02's independent review on 2 August 2026, which
confirmed the accepted goals surface has the identical shape

**Blocks:** nothing.

## Observed behavior

Both management surfaces disable their controls while a mutation is pending,
and both move the affected item between sections when it settles. The acting
button therefore unmounts, and focus falls to `<body>`.

A keyboard or screen-reader user loses their place after **every** state
change. Disable an item and focus is at the top of the document; to disable the
next one they tab back through the entire list.

Both surfaces do announce the outcome through a `role="status"
aria-live="polite"` region, so the user is told what happened. They are simply
not left anywhere sensible afterwards. Both also correctly restore focus to the
originating `<summary>` when a confirmation is cancelled, so the pattern is
already understood in the codebase — it is just not applied to the completion
path.

## Why one ticket for both surfaces

M2-02's reviewer checked `src/components/goals/goal-manager.tsx` against
`src/components/memory/memory-manager.tsx` and found the same shape in both:
live region present, no post-mutation focus management. It is a consistent
product-wide gap rather than a regression either ticket introduced.

Fixing it inside M2-02 would have made the memory surface diverge from an
accepted surface with no ticket recording why, and left goals broken. Both
surfaces should end up with the same answer, decided once.

The same reasoning covers any surface added later: whatever this ticket
concludes becomes the pattern M2-03 and its successors follow.

## Investigation and design first

There is a real product question here, and it should be settled before code:
**where should focus land after a mutation?**

Plausible answers, each with a cost:

- The moved item's new position — keeps the user with the thing they acted on,
  but that position may be far away, or the item may be gone entirely after a
  delete.
- The section heading the item moved into — stable and always exists, but the
  user must travel back to continue working.
- The status region itself — guarantees the announcement is read, but that
  region is not a natural place to resume from.
- The next sibling control — best for repeated actions like disabling several
  items, worst when the list reorders.

Delete, disable, enable, accept, reject, reorder, and edit do not obviously
share one answer. Decide deliberately rather than picking whatever is easiest
to implement, and record the reasoning.

## Non-goals

- No change to the accepted goal or memory data models, actions, or copy.
- No new visual design, and no change to the live-region announcements
  themselves, which both surfaces already get right.
- No focus behavior for surfaces that do not yet exist.
- Not a general accessibility audit. Other findings — for example the reorder
  buttons lacking a per-goal accessible name, and the repository-wide 1.92:1
  focus-outline contrast — belong to
  [M2-07](M2-07-GOAL-REVIEW-FOLLOWUPS.md) and its noted follow-up.

## Acceptance criteria

1. The chosen destination for focus after each mutation kind is recorded with
   its reasoning, including the delete case where the acted-on element is gone.
2. Goals and memory implement the same pattern.
3. A keyboard user can perform two consecutive mutations on different items
   without traversing the list from the top.
4. The existing `role="status"` announcements still fire, and moving focus does
   not interrupt or duplicate them.
5. Automated coverage that fails without the change, on both surfaces.
6. `prefers-reduced-motion` and the existing 44px touch targets are unaffected.
7. A green continuous-integration run for the reviewed commit.

## Approval gate

The product owner approves the focus destinations before implementation, since
they are visible interaction behavior. Likely **Tier 2** — user-visible
behavior on an accepted schema and authorization boundary, with no migration
expected.
