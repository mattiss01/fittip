# ADR-024: A plan proposal may replace a session the owner offered, and only that

**Status:** accepted — the product owner decided it on 9 October 2026.

**Date:** 9 October 2026

**Ticket:** "What a proposal may replace" in [`docs/backlog/NEXT.md`](../backlog/NEXT.md)

**Builds on:** [ADR-013](ADR-013-AI-TRAINING-HISTORY-ELIGIBILITY.md) decision 5
(what the coach reads of the plan) and
[ADR-015](ADR-015-AI-PROPOSAL-PERSISTENCE-AND-ACCEPTANCE.md) (a proposal is
recorded first and changes the plan only when the owner finishes a review)

## Context

A plan proposal could only add sessions. The owner removed Lock on 9 October
2026 because nothing said what it meant, and its one job was hypothetical: there
was nothing a proposal could replace. The question Lock stood for, "keep this"
or "this can be replaced", belongs where a proposal is asked for.

The product invariant was reworded the same day: replanning replaces a future
session only where the owner allowed it for that proposal. This ADR is how that
is made true by the database rather than promised by a screen.

## Decision

1. **A session stays unless the owner marks it.** The compose screen lists the
   active sessions on the chosen days that have no training logged against
   them. Each has a "Can be replaced" tick, off by default. A repeating session
   may be ticked; the tick is about that day's occurrence only.
2. **The marks belong to the request.** `begin_plan_generation` stores them in
   `plan_generation_replaceable_sessions` with the claim, after checking each
   is this owner's active, unlogged session on one of the requested days. One
   that is not refuses the request. Nothing else writes that table.
3. **The coach is shown a handle, never a session id.** Each mark gets `r1`,
   `r2`… in calendar order. A planned session inside the chosen days is sent
   with its minutes and its handle, or null for one that stays (ADR-013,
   amended). A proposed session may name one handle in `replaces`. It need not
   be on the same day as the session it replaces; the review shows both.
4. **An answer that names anything else is refused whole.** A handle the
   request never issued, or one handle named twice, is refused by the output
   validator and again by `finish_plan_generation`, as an invented goal id is.
5. **Three choices for a replacing item:** Replace, Add beside, Reject. They
   are stored as `staged`, `staged_beside` and `rejected`. `staged_beside` is
   refused on an item that replaces nothing.
6. **Finish is the only writer, in one change set.** For each item staged as
   Replace, `finish_plan_proposal_review` adds a `delete` of the old session to
   the change set that adds the new one, and hands it to
   `apply_rolling_plan_change_set`. The swap happens whole or not at all, and
   nothing changes before Finish. Replacing deletes; it does not cancel (owner).
7. **A logged session is never replaced.** Before adding the `delete`, Finish
   checks again that the session is still active, not behind today, still on
   one of the days the proposal was asked about, still marked for this
   proposal's own request, and has no log. One that fails is left alone and the
   proposed session is added beside it. The review applies the same tests to
   the plan as it is when the page is read, and offers a plain add with the
   reason in place of Replace. A session moved off those days is the case that
   needs the third test: without it Finish would delete a session the review,
   which reads those days, could no longer show.
8. **Asking again keeps the marks** that can still be replaced. One replaced by
   the finish that closed the review is gone, and one logged or cancelled since
   is dropped.

## What is not changed

- `apply_rolling_plan_change_set`. Its `delete` already refused a session with
  training logged against it and already removed one occurrence of a series
  while telling the series not to write it back.
- The schema version, `fittip.seven-day-plan.v2`. `replaces` is an optional key
  on a session; a stored proposal without it reads as it always did. The plan
  approved on 9 October said v3; the version is checked in four functions and
  one table constraint, and a superset needed none of them changed.
- The roadmap. It writes no sessions, so it has nothing to replace.

## Consequences

- **The input ceiling is 14,000 tokens, up from 10,000** (owner, 9 October
  2026). The plan call had nine tokens free. A whole reservation is 6,400
  micro-USD against the 8,000 per-request ceiling, and the daily ceiling admits
  312 generations where it admitted 357. Settlement still charges what was
  used. The roadmap and fill calls use none of the new room yet; ADR-023 will.
- The plan call's planned-session list is 30 entries in 4,000 bytes, up from 12
  in 1,400. A marked session that still does not fit refuses the request with
  that source named, rather than dropping the mark.
- The proposal route reads which planned sessions have a log. It takes session
  ids from that read and nothing else.
- A deleted session cannot be brought back with one tap. The plan's change
  history records what it was.
- The mark is as old as the request. Between asking and finishing, the owner
  can log, cancel or delete the session; decision 7 is what makes that safe.

## Alternatives considered

- **Keep Lock and let the coach replace anything unlocked.** Rejected by the
  owner: a flag set long before, on a screen that never explained it, is not a
  decision about this proposal.
- **Let the coach name a session id.** Rejected: an id is a reference a model
  can invent or copy from elsewhere in the context. A handle is valid only for
  the request that issued it, and resolving it is a lookup the database owns.
- **Cancel instead of delete.** Offered and declined by the owner: the day
  would show the called-off session beside its replacement.
- **Replace every marked session on a day when anything is accepted for it.**
  Rejected: the coach may leave a marked session alone, and the owner should
  see exactly which one a proposed session stands in for.
