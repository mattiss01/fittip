# ADR-012: Which goals a coaching AI may read

**Status:** accepted

**Date:** 3 August 2026

**Ticket:** raised as finding F1 by the
[M2 milestone closeout](../validation/M2/M2-MILESTONE-CLOSEOUT.md) under
[M2-04](../backlog/M2/M2-04-M2-VALIDATION-SLICE.md); implemented by
[M3-01](../backlog/M3/M3-01-LOCAL-AI-ADAPTER-CONTROLS.md)

**Builds on:** [ADR-006](ADR-006-LOCAL-OWNER-AI-MVP.md) and
[ADR-010](ADR-010-M2-MEMORY-WRITE-BOUNDARY.md)

## Context

M2 closed with memory holding an explicit server-side gate on what a future AI
may read — `selectActiveMemoryContext` admits only `active`, non-review-due
items, and its tests cover every status. Goals have no counterpart.

The distinction is not undefined. `goals.status` is constrained to `active`,
`paused`, `achieved`, or `abandoned`, a check constraint ties `archived_at` to
a non-`active` status, and the accepted goals surface already groups goals into
active, paused, and historical. What is missing is a server-side function that
names which of those an AI may read, and a test that asserts it.

That gap would otherwise be closed inside M3-01 — the ticket that first
introduces a provider, budget limits, and leakage controls. Deciding a coaching
policy there means deciding it under delivery pressure, in the largest ticket in
the backlog, at the moment the answer becomes load-bearing. The policy is a
product question and does not depend on any provider detail, so it is settled
here instead.

`selectActiveGoalContext` cannot be shared with the goals surface.
`src/components/goals/goal-manager.tsx` is a client component and
`src/architecture/server-boundary.test.ts` forbids client components importing
`@/server/**`. Memory already carries the same split — a server selector for the
AI boundary and the manager's own grouping for display — so goals follow the
accepted pattern rather than introducing a new one.

## Decision

1. **A goal is targetable only when `status = 'active'` and `archived_at is
   null`.** These are the goals a coach may program toward: propose sessions
   for, sequence, or treat as the objective of a plan.
2. **An `achieved` goal is readable as history and is never targetable.** It
   describes proven capability — a distance covered, a load lifted, a skill
   held — and that is legitimate input to judging what to propose next. It is
   not a thing to train toward again, and no proposal may name it as its
   objective.
3. **`paused` goals are excluded entirely.** Pausing is the owner saying "not
   now". Passing a paused goal to a coach invites proposals that relitigate a
   decision the owner already made. The cost is accepted: the coach may propose
   something that conflicts with a shelved goal, and the owner rejects it like
   any other proposal.
4. **`abandoned` goals are excluded entirely.** The owner rejected the goal.
   Nothing may resurface it, including as history.
5. **Archived goals are excluded regardless of status.** `archived_at is not
   null` is disqualifying on its own and is checked independently of `status`,
   so a future status value cannot silently become eligible.
6. **Targetable and historical goals are separate fields in the context
   object**, not one list with a flag. A single list invites a prompt or an
   adapter to lose the distinction; two fields make misuse a type error rather
   than a judgement call.
7. **The gate is deny-by-default.** It enumerates the statuses it admits rather
   than excluding the ones it rejects, so a status added later is invisible to
   the AI until someone decides otherwise and amends this ADR.

## Consequences

- M3-01 implements `selectActiveGoalContext` in `src/server/goals/` mirroring
  `selectActiveMemoryContext`, with per-status unit tests covering all four
  statuses and the archived predicate independently. It does not redecide the
  policy.
- Scope item 6 of M3-01 — "a minimal operation-specific context from accepted
  goals" — is now precise: two fields, targetable and historical, populated by
  this gate.
- The goals surface keeps its own client-side grouping. The two definitions can
  drift, and only the server one governs what reaches a provider. That is the
  accepted architecture, not an oversight; the invariant test is what keeps the
  client from reaching across.
- A user who wants a paused goal considered must resume it. That is a real
  behavior with no UI affordance explaining it, and it is not addressed here.
- Nothing in this ADR approves a provider, model, key, prompt, retention term,
  or spend. ADR-006 and M3-01's separate provider gate continue to govern those.

## Alternatives considered

- **Active only, no history.** The strictest mirror of the memory gate and the
  simplest to reason about. Rejected because a coach that cannot see what the
  owner has already achieved will propose work that ignores demonstrated
  capability, which reads as not paying attention.
- **Include paused goals as visible-but-not-targetable.** Argued on the grounds
  that a coach should avoid proposing work conflicting with a shelved goal.
  Rejected: it adds a third context field to serve a conflict-avoidance case
  that has not been observed, and "not now" is a clear enough instruction to
  honor literally.
- **Defer the whole question to M3-01.** Rejected for the reason in Context.
