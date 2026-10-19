# ADR-033: A plan proposal may change any session not locked, and suggest cancelling one

**Status:** accepted — the product owner decided it on 19 October 2026.

**Date:** 19 October 2026

**Ticket:** "The coach may change any session not locked" in
[`docs/backlog/NEXT.md`](../backlog/NEXT.md)

**Supersedes in part:** [ADR-024](ADR-024-WHAT-A-PROPOSAL-MAY-REPLACE.md) decisions 1, 5
and 6, and its rejected alternative "cancel instead of delete". Its handles, its rechecks
at Finish (decision 7) and "asking again keeps the marks" (decision 8) stand.

## Context

ADR-024 let a proposal replace a session only when the owner ticked "Can be replaced" on
the compose screen. In use nothing was ticked, so the coach could only add, and when a
session should go (a pain report, a week already full) it could say so only in words that
changed nothing. The owner asked to turn the question around: what must the coach leave
alone, rather than what may it touch.

ADR-024 rejected the earlier Lock because it was "a flag set long before, on a screen that
never explained it". That objection is about where the flag lived, not which way it
pointed, so the new Lock lives where ADR-024 put the tick.

## Decision

1. **A session is open unless the owner locks it.** The compose screen lists the active,
   unlogged sessions on the chosen days, each with a Lock toggle, off by default. The
   browser sends every unlocked one as offered; `begin_plan_generation`, the handle table
   and its checks are unchanged, so the database still records exactly what was offered
   for this request. A lock is never stored on the session.
2. **The coach may replace an open session or suggest cancelling it.** A cancel names one
   handle and gives a reason. A handle is used at most once across replacing and
   cancelling; anything else refuses the answer whole, in the validator and again in
   `finish_plan_generation`. A cancel becomes a proposal item of kind `cancel`.
3. **Locked means locked.** Under a pain, illness or severe-fatigue signal the coach still
   cannot touch a locked session; it says so in its safety note.
4. **Choices.** A cancel item is staged (cancel it) or rejected (keep it); `staged_beside`
   is refused on one. A replacing item keeps Replace, Add beside and Reject.
5. **Replacing cancels; it no longer deletes.** Finish adds a `cancel` of the old session
   to the change set that adds the new one, and a staged cancel item adds a `cancel` too,
   both under ADR-024 decision 7's rechecks. One that fails them is left alone.
6. **What a review cancelled is recorded beside the plan.** `plan_proposal_cancellations`
   holds each session a finished review cancelled, its proposal, the session that replaced
   it if any, and the session's `cancelled_at`. A replaced session is not shown on its day
   while that row matches its current cancellation; the replacement's page offers to bring
   it back (reactivate). No cancellation reason is written for it: those reasons are sent
   to the coach as the athlete's own words, and this text would be the app's or the
   coach's. The page composes the reason from the record instead.

## Consequences

- An accepted replacement can be undone with one tap; the plan keeps the cancelled row.
- The review can hold more items (up to 21 sessions and 21 cancels); the item ordinal bound
  moves from 27 to 47.
- The plan prompt grows by a sentence and a schema key; its prefix budget moves 9,000 to
  9,400 against the 18,000-token ceiling.
- A session the coach cancelled because it was replaced is not sent to the coach as called
  off: its replacement is on the plan. One it cancelled on its own suggestion is sent as
  called off, without a reason.
- Reviews get busier: the coach may now suggest changing sessions the owner liked, which
  the owner rejects. Watch whether it reshuffles a plan only because it can.
