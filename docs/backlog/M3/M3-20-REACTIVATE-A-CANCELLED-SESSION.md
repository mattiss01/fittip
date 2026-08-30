# M3-20: Reactivate a cancelled session

**Status:** proposed — not approved for implementation. Raised by the product
owner on 29 August 2026 during M3-19 acceptance.

**Triage:** needs-triage

**Milestone:** M3

**Priority:** P1

**Tier:** 1 — adds an operation to `apply_rolling_plan_change_set`, a
`security definer` function, and changes which statuses a write path will act
on. That is an authorization-boundary change whatever its size.

**Depends on:** the M3-15 chain accepted and merged, through
[M3-15E](M3-15E-ROADMAP-RESTORATION.md). Sequenced there by the product owner
on 29 August 2026. It does not technically block
[M3-16](M3-16-AI-PROPOSAL-APPLICATION.md), so the two may be reordered; it is
placed first because it closes a trap rather than adding a surface.

**Blocks:** nothing.

## Why this exists

[M3-19](M3-19-DELETE-A-PLANNED-SESSION.md) gave cancellation a companion verb,
but only a destructive one. After it, a cancelled session can be **deleted** and
nothing else. Every non-destructive operation — `edit`, `move`, `set_lock`,
`set_recovery_day` — refuses a cancelled session, and `requireSession` in
`src/app/home/plan/actions.ts` admits one only for delete.

So the product owner's question stands on its own terms: if a cancelled session
cannot be restored or changed, and the only thing that can be done to it is
destroy it, then keeping it on the record buys the owner nothing they could not
get from deleting it. Cancellation's whole justification is that it preserves a
decision. A decision you cannot revisit is not preserved, it is only displayed.

There is a second, worse reason. M3-19 shipped an accepted defect: deleting a
cancelled **recurring occurrence** does not delete it — the series writes it
back in the same request, and it comes back `active`. The product owner accepted
that on 29 August 2026 and it is recorded as M3-19 limitation 1. The
consequence is that FitTip already has an uncancel; it is just an accidental
one, reached through the delete button, undocumented as a restore, and available
only to occurrences of a series. A deliberate verb should exist before an
accidental one is the only one.

## Product decisions already taken

Taken by the product owner on 29 August 2026, before this ticket was written.

1. **The verb is "Reactivate."** Not "Uncancel" (names the undo, not the
   outcome), not "Restore" (already means something else in the roadmap
   surfaces), not "Resume" (implies a session in progress).
2. **Reactivate only. No edit-in-place.** A cancelled session cannot be edited,
   moved, locked, or made a recovery day. To change one, reactivate it first,
   then use the controls that were always there. This keeps the change to the
   accepted function down to one new branch instead of revisiting the status
   filter on four existing operations, each of which would need its own
   argument about what editing a cancelled session should mean.
3. **Sequenced after the M3-15 chain.**

## Expected shape

Not a specification. This is what the ticket looks like from here, to be
confirmed or replaced when it is approved for implementation and gains its
Agent brief.

- One forward additive migration, `create or replace`ing
  `apply_rolling_plan_change_set` with a `reactivate` branch, in the shape
  M3-19 established: an explicit `elsif`, the `else` still rejecting unknown
  operations.
- The branch sets `status` to `active`, clears `cancelled_at`, and writes a
  change entry, so the log reads planned → cancelled → reactivated rather than
  silently returning to its pre-cancellation state.
- Refusals to settle at approval time, each needing a distinct error code or a
  justification for reusing one: a session that is not cancelled; a past-dated
  session; and — the open question — a cancelled session whose date has passed
  while it was cancelled.
- `requireSession(slice, value, includeCancelled)` in
  `src/app/home/plan/actions.ts` already carries the parameter this needs.
- The cancelled card gains **Reactivate** beside **Delete**. Reactivate is not
  destructive and should not sit behind the same confirmation gate Delete and
  Cancel share.

## Open questions for approval

1. **Does reactivating a recurring occurrence close M3-19 limitation 1?** Once
   a deliberate restore exists, the accidental one has no remaining
   justification, and the honest copy M3-19 shipped to describe it becomes
   copy explaining a defect that did not need to survive. The recommendation is
   that this ticket closes it — deleting a cancelled occurrence should delete
   it — but that changes accepted behavior and is the product owner's call, not
   the builder's. It may also be the reason to raise this ticket's scope.
2. **A cancelled session whose date has passed.** Reactivating it would put an
   `active` planned session in the past, which no other operation can create.
   Refusing is the conservative default and the recommendation.
3. **Cancelled series segments**, as opposed to cancelled occurrences, are out
   of scope unless approval says otherwise.
