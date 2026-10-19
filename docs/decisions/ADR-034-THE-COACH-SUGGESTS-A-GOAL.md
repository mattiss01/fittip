# ADR-034: The coach may suggest a goal, which the owner accepts or rejects

**Status:** accepted — the product owner decided it on 19 October 2026.

**Date:** 19 October 2026

**Ticket:** "The coach suggests a goal" in [`docs/backlog/NEXT.md`](../backlog/NEXT.md)

**Builds on:** [ADR-010](ADR-010-M2-MEMORY-WRITE-BOUNDARY.md) decision 16 (the coach
proposes memory from a planning note) and
[ADR-015](ADR-015-AI-PROPOSAL-PERSISTENCE-AND-ACCEPTANCE.md) (an AI answer is a proposal;
nothing reaches the owner's records before they accept it).

## Context

Sarah's live roadmap (R4) turned "I want to run 5 km twice a week by January" into a
memory suggestion. It is an objective, which FitTip keeps as a goal, with a tier, a rank
and the three-core limit. The owner asked for the coach to suggest goals, and decided how.

## Decision

1. **Only from the planning note.** A plan or roadmap answer may carry at most one goal
   suggestion, when the note states an objective none of the athlete's active goals covers.
   Never from "ask again" feedback, history or memory. The prompt also says that what the
   athlete wants to achieve is a goal, never a memory.
2. **A suggestion is its own record, never a goal.** `goal_suggestions` holds title,
   desired outcome, one to ten sports, a target date only when the note names one, and a
   status (`proposed`, `accepted`, `rejected`). Owner-select only; written by
   `record_goal_suggestion` (after the proposal commits, with its completion token; a note
   is required; one per proposal; a replay returns the same row) and
   `decide_goal_suggestion`. A failure to record is logged by code and never fails the
   proposal, as memory candidates are.
3. **Accept creates the goal through `apply_goal_change`**, in the same transaction, in the
   tier the owner picks (Core or Supporting). The three-core rule, ranks and the goal
   collection revision are enforced where they always were, and a fourth core goal is
   refused with that rule's own message. Reject creates nothing.
4. **Decided where it was made.** Beside the memory suggestions at the bottom of the plan
   and roadmap review, asked about once before the review ends, and listed on Goals while
   it waits.
5. **Spend.** The prompts need room the roadmap call did not have (17,891 of 18,000 input
   tokens at its worst). `maxInputTokens` rises to 20,000 and the database's per-request
   ceiling to 9,000 micro-USD (a reservation is 2,500 + 5,750 = 8,250); the daily and total
   ceilings are unchanged.

## Consequences

- The coach still writes no user data: a goal exists only after the owner's Accept.
- Two suggestion panels in a review, memory and goals, decided independently of the
  proposal itself: accepting or declining the proposal decides neither.
- The daily spend ceiling admits about 240 calls where it admitted 250.
