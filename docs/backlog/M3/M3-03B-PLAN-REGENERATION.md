# M3-03B: Regenerating a plan proposal the owner does not like

**Status:** proposed — not approved for implementation

**Dispatch state:** paused by approved F-005. This pre-rolling-plan contract
must not be approved or dispatched. Its replacement is F-005 delivery slice 8
and can be drafted only after rolling-plan proposal application is accepted.

**Triage:** needs-triage

**Milestone:** M3

**Priority:** P1

**Depends on:** this historical draft followed
[M3-03 accepted](M3-03-SELECTED-HORIZON-PLAN-PROPOSAL.md). Its replacement
contract depends on M3-16 accepted and reuses only the still-approved
`fittip.seven-day-plan.v2` boundary and F-005 regeneration decisions.

**Split from:** [M3-03](M3-03-SELECTED-HORIZON-PLAN-PROPOSAL.md) on 12 August
2026. M3-03 carried sixteen open decisions across five separable concerns; see
its "Split into four tickets" section for the reasoning and the boundary.

**Origin:** decided 8 August 2026; the two-field shape and the cap settled
9 August 2026 under ADR-014.

**Blocks:** nothing. [M3-04](M3-04-PLAN-EDIT-LOCK-ACCEPTANCE.md) and
[M3-05](M3-05-M3-VALIDATION-SLICE.md) depend on M3-03, not on this.

## Outcome

The owner rejects a plan proposal, says what they disliked, and asks for
another. This is a **new API call with no shared state** — the provider retains
nothing between requests and the context is reassembled from scratch.

It is not replan. Replan reacts to what actually happened and belongs to M4;
this refines a proposal that has never been accepted.

## Same operation, not a new one

The output schema, prompt version, limits, and validation are identical to a
first generation. A regeneration differs in exactly two ways: the compose screen
carries two owner-text fields instead of one, and the **immediately previous
proposal** travels as an additional context source so the coach can avoid
repeating itself and preserve what was not criticized. Decision 4 adds the
earlier rounds' feedback to that same context as history; it adds no third
difference to the operation itself.

That is the whole of this ticket. If it grows a second prompt version or a
second output schema, the split has been misread.

## Two fields, and feedback is mandatory

Settled 9 August 2026, amending ADR-014 decision 2a:

- **The planning note** — prefilled from the previous round, editable, 1000
  characters. It holds constraints on the horizon ("I am away Saturday") which
  stay true across every regeneration.
- **Regeneration feedback** — empty on every round, **required**, 500
  characters. It holds what is wrong with the proposal just rejected ("too much
  volume on Tuesday").

Two fields rather than one because **memory extraction must treat them
differently.** The planning note is a legitimate source of durable constraint
candidates; regeneration feedback is a comment on one rejected week and must
never produce one. Extracting "too much volume on Tuesday" as a proposed
constraint would poison the memory model with one-off reactions. This is the
specific failure the split exists to prevent, and a builder that merges the
fields for UI convenience has broken it.

Mandatory feedback is also what makes the cap coherent: a regeneration with no
stated reason is a slot-machine pull, and three blind pulls converge on nothing.
It replaces an unenforceable validation — "the note must differ from its
prefill" is gameable by adding a space — with a trivially checkable
required-and-empty field.

Feedback at this step is frequently durable — "I never want two hard days back
to back" is a preference, not a comment on one week — so the *planning note* on
a regeneration feeds memory extraction exactly as an initial note does. The
feedback field never does.

## Only the immediately previous proposal travels

Never the chain. Every round is still persisted as immutable evidence; storage
and transmission are separate concerns and this ticket keeps them separate.

**Amended 12 August 2026.** The proposal rule above is unchanged — exactly one
proposal travels, however many rounds have run. But the earlier claim that
"context size stays flat however many rounds" is no longer true, because
decision 3b carries every earlier round's feedback forward as history. The
growth is bounded at 3 x 500 = 1,500 characters against a 33,700-byte context
ceiling, which is real and negligible. The ticket says so rather than claiming a
flatness it no longer has.

## The cap

**Regeneration is capped at 3 per chain**, decided 9 August 2026 as "per
horizon" and corrected to "per chain" on 12 August 2026. At the cap the owner is
directed to M3-04's editing rather than left stuck.

**Why "per chain".** Decision 2 lets a regeneration change the day count and
start date, which makes "per horizon" undefined: shifting the start by one day
would begin a fresh count. That is exactly the loophole the product owner
rejected when declining "allow changes and reset the cap", so the count follows
the regeneration chain and a date change does not reset it.

**The cap is a product guardrail, not a spend control**, and the distinction is
load-bearing. At the prices settled in M3-01B the difference between three
regenerations and five is roughly EUR 0.0002. The real argument is that after
three *informed* attempts the prompt or the goals are the problem rather than
the roll, and the product should push the owner toward editing directly. Do not
restore the cost framing: whoever reads the pricing next would raise the cap for
a reason that was never true.

Distinguish this from editing throughout the UI. Editing (M3-04) is
deterministic, free, and right for "move Wednesday to Thursday". Regeneration is
an AI call and right for "the whole week is too hard". An owner who cannot tell
which is which will use the expensive one for both.

## Non-goals

- No new prompt version, output schema, or set of limits. It reuses M3-03's.
- No editing, locking, or acceptance; those are M3-04.
- No roadmap input; that is M3-03C. If a roadmap is in play when this ships, it
  travels on a regeneration exactly as it does on a first generation, and this
  ticket adds nothing to that behavior.
- No replan against an accepted version. That is M4 and it is a different
  operation.
- No change to how memory candidates are reviewed. M2-02's surface is reused.

## Acceptance criteria

1. A regeneration carries exactly one superseded proposal to the boundary,
   however many rounds have run.
1a. Where the regeneration changed the day count or start date, that proposal
    travels **marked as having covered a different range**, never silently and
    never dropped.
1b. Every earlier round's feedback travels in order as history, bounded at
    3 x 500 characters, while the input field stays empty and required.
2. Every round persists as immutable evidence, including the round that was
   rejected.
3. Regeneration feedback is required. An empty or whitespace-only feedback field
   is refused at the compose step, before any provider call and before any
   idempotency key is consumed.
4. **Regeneration feedback never produces a memory candidate**, proven by a
   fixture whose feedback contains a durable-sounding preference. A planning
   note on the same request still can.
5. A feedback field attempting an ADR-014 decision 4 escalation is rejected
   exactly as one in the planning note is, proven per escalation by fixture.
6. The cap blocks a further call rather than failing one: at 3 the action is
   unavailable, the owner is pointed at editing, and no provider call, spend
   reservation, or idempotency key is consumed.
6a. The cap counts **per chain**. Changing the day count or start date mid-chain
    does not reset it, proven directly rather than inferred.
7. At the cap the regenerate control is **replaced** by the approved line and a
   direct action to editing. It is never merely disabled, and never disabled
   without an honest reason.
8. Retry and concurrency do not duplicate provider attempts, proposals, or
   budget usage across rounds.
9. The `390x844` flow covers reject, regenerate, the prefilled note, the empty
   required feedback field, a second round, and reaching the cap.
10. No accepted plan, lock, completion, replan, external sink, secret, or
    unapproved spend is added.

## Test plan

- Exactly one superseded proposal reaches the boundary at rounds 1, 2, and 3.
- A round that shifts the start date does **not** reset the cap; a fourth
  attempt after three shifted rounds is still refused.
- A proposal covering different dates travels carrying its different-range
  marker; assert the marker is present and that the proposal is neither dropped
  nor sent unmarked.
- Feedback accumulation: round 3 carries rounds 1 and 2 in order, the field is
  empty and required on every round, and the total stays inside the bound.
- Empty, whitespace-only, and over-length feedback are each refused at compose,
  with an assertion that no key was consumed.
- A feedback fixture containing "I never want two hard days back to back"
  produces **no** memory candidate; the same text in the planning note produces
  one.
- One injection fixture per ADR-014 decision 4 escalation, in the feedback
  field, each asserting rejection by output validation rather than by filtering
  the text.
- The cap: a fourth attempt consumes no key, no reservation, and no call.
- Every round is readable afterwards as evidence, with its own note and
  feedback, under owner/anonymous/cross-user RLS tests.
- Playwright `390x844`: reject, regenerate, prefill, required feedback, second
  round, cap reached, and the copy at the cap.

## Open decisions

Moved here from M3-03 on 12 August 2026, renumbered from their original
positions 14, 15, and 16.

**All three were answered on 12 August 2026**, together with two consequences
the answers created. None remain open. The ticket is decision-complete and ready
for the product owner to move to `approved`; answering the decisions is not
approval.

1. ~~**The copy shown when the cap is reached**~~ - **decided: replace the
   control, do not disable it.** The regenerate action is gone at the cap and in
   its place sits an honest line and a direct action to editing. Copy approved
   as written:

   > You've asked for three versions of this week. Editing it directly is
   > usually faster from here.

   A disabled control with a bare "limit reached" label was rejected: it leaves
   the owner with no next step. (Originally decision 14's open half; the cap of
   3 itself was already decided.)
2. ~~**Whether regeneration may change the day count or start date**~~ -
   **decided: it may**, and it still counts against the cap. This goes against
   the recommendation recorded here, deliberately.

   Two consequences were settled with it. The cap counts **per chain** rather
   than per horizon, because otherwise a one-day date shift would reset it - see
   "The cap". And the superseded proposal **still travels, marked as having
   covered a different range**, mirroring how M3-03C carries and marks a stale
   roadmap. Dropping it was rejected because the owner's feedback would then
   arrive attached to no plan, and "too much volume on Tuesday" means little
   without the Tuesday it refers to. (Originally decision 15.)
3. ~~**Copy and layout for the two compose fields**~~ - **decided: both fields
   open, planning note first**, with its prefilled text visible and editable and
   the required feedback field below it. It reads in the same order as a first
   generation.

   ```text
   Regenerate this week

   What should the coach know about
   this week?
   +---------------------------------+
   | Away Saturday, knee sore after  |
   | long runs                       |
   +---------------------------------+
   Carried into every new version
   of this week.

   What was wrong with the last plan?
   +---------------------------------+
   |                                 |
   +---------------------------------+
   Required. Used once, for this
   version only. Not remembered.

               [ Regenerate ]
   ```

   This is the shape, not the styling; `frontend-design` governs the rest under
   the product owner's `390x844` pass. (Originally decision 16.)
4. **Earlier rounds' feedback travels as context** - raised and decided
   12 August 2026, not in the original list.

   The failure it fixes: the coach reduces Tuesday in round 2, does not know
   *why* Tuesday is light, and puts the volume back in round 3. Feedback that
   vanishes each round lets the week oscillate.

   **Every earlier round's feedback travels, in order, as history. The input
   field stays empty and required on every round.** Prefilling the field was
   rejected because it breaks the check that makes the cap coherent: a prefilled
   field can be re-submitted unchanged, and "must differ from its prefill" is
   gameable by adding a space.

   **The memory boundary is unchanged.** Feedback still never produces a memory
   candidate in any round, carried or not; acceptance criterion 4 stands as
   written.

## Approval gate

**Tier 1.** It adds an AI provider call path and consumes spend, and it likely
needs schema for the feedback field and the round lineage: approved ticket,
distinct builder, distinct independent reviewer, hosted migration evidence if a
migration lands, Preview verification, and product-owner acceptance. The three
open decisions must be answered before dispatch.
