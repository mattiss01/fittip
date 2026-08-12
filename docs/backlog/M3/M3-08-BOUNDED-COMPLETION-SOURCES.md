# M3-08: Roadmap source references list completions that never travelled

**Status:** proposed — not approved for implementation

**Triage:** needs-triage

**Milestone:** M3 — AI coaching proposals

**Priority:** P2

**Owning accepted work:** [M3-02 roadmap proposal](M3-02-ROADMAP-PROPOSAL.md)

**Depends on:** nothing. It changes source recording only, behind the accepted
M3-02 schema.

**Source:** recorded as limitation 10 by
[M3-02](../../validation/M3/M3-02-VALIDATION.md#known-limitations) on 12 August
2026, which asked for exactly this ticket rather than a change inside M3-02.

## Observed behavior

`ContextSourceLoader` in `src/server/ai/context-source.ts:167` builds the
`CoachAISourceReference[]` that a proposal stores and that acceptance later
re-checks. Goals and memory are recorded correctly: the same two selectors that
decide what reaches the coach — `selectActiveGoalContext` and
`selectActiveMemoryContext` — decide what is recorded, so the two cannot drift.
That was defect 4 in M3-02 and it is fixed.

Completions were not brought to the same rule. Every completion the owner has
ever recorded is mapped into a `kind: "completion"` source, while ADR-013 sends
only a bounded window that `selectTrainingHistoryContext` chooses later, inside
`buildCoachAIContext`. The stored sources are therefore a superset of what the
coach actually saw.

**The error direction is the safe one.** Acceptance re-checks more records than
it must, never fewer, so no stale input can slip through unnoticed. The visible
cost is a false conflict: correcting an old completion that was never sent
invalidates a pending proposal with *"Your training history changed"*, and the
owner is told their proposal is stale because of a record that had no influence
on it.

## Why it is not a one-line fix

The two decisions happen in different places and the later one throws its work
away. `context-source.ts` builds the sources; `context.ts` applies ADR-013's
byte budget and count cap and returns the trimmed context without any completion
identity — `toHistoryCompletion` drops the ids that `toCompletionReference`
would need. Recording only what travelled means the selected window's identity
has to survive selection, which is a small but real shape change to the
assembled context.

Do not solve it by re-running the selector in `context-source.ts`. That is how
goals and memory stay correct, but the training-history selector is byte-bounded
against an allocation derived from the whole assembled prompt, so a second
independent run is not guaranteed to choose the same window and would reintroduce
exactly the drift the goal and memory rule was written to prevent.

## Open questions for the product owner

1. **Does an owner-visible conflict message need to change too?** If a
   correction to a *sent* completion still conflicts a pending proposal — and it
   should — the copy is right. Confirm that narrowing the trigger does not also
   need a wording change.
2. **Are trimmed-but-eligible completions sources?** ADR-013 discloses a trim to
   the coach. A completion inside the window but dropped by the byte budget was
   never seen, so by this ticket's rule it is not a source. Confirm that is
   intended rather than merely consistent.

## Non-goals

- No change to ADR-013's window, byte budget, per-source allocation, or
  disclosure behaviour.
- No change to the goal, memory, or plan-version source rules, which are correct.
- No schema change. `roadmap_proposal_sources` already stores exactly the shape
  needed; this is about which rows are written.
- No change to acceptance's re-check semantics, only to its input set.

## Acceptance criteria

1. A proposal's stored completion sources are exactly the completions that
   reached the coach — same window, same records — asserted in
   `context-source.test.ts` or its successor against a history longer than the
   ADR-013 window.
2. A correction to a completion outside the sent window does **not** conflict a
   pending proposal.
3. A correction to a completion inside the sent window still does.
4. The goal, memory, and plan-version source rules are unchanged, with the
   existing assertions still passing unmodified.
5. A green continuous-integration run for the reviewed commit.

## Approval gate

**Tier 2.** User-visible behaviour on an already accepted schema and
authorization boundary: approved ticket, distinct builder, distinct independent
reviewer, Preview verification, and product-owner acceptance. It becomes
**Tier 1** the moment it needs a migration or touches an ADR-015 function —
stop and re-dispatch if so. Answer the two open questions before dispatch.
