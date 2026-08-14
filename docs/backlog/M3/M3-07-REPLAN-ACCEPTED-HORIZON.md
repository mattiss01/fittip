# M3-07: Replanning an accepted horizon

**Status:** retired — no replacement in F-005, decided 14 August 2026

**Triage:** wontfix

**Disposition:** Do not dispatch. M3-16 proposes additions beside existing Plan
content and the owner edits existing sessions directly. A future Coach-driven
replacement or cancellation capability requires a new approved feature and
ticket.

**Milestone:** M3

**Priority:** P1

**Depends on:** [M3-04 accepted](M3-04-PLAN-EDIT-LOCK-ACCEPTANCE.md), and
therefore M3-01 through M3-03 and
[ADR-013](../../decisions/ADR-013-AI-TRAINING-HISTORY-ELIGIBILITY.md) plus
[ADR-014](../../decisions/ADR-014-PLANNING-NOTE-BOUNDARY.md)

**Blocks:** [M3-05](M3-05-M3-VALIDATION-SLICE.md)

**Raised:** 8 August 2026. The product owner asked what happens when an accepted
plan is no longer wanted, and observed that the "re-proposing versus replanning"
distinction the lead had drawn did not hold. It did not: ADR-013 already puts
completions and safety flags in context, and ADR-014's planning note already
carries "I got sick Tuesday". There is one capability, and this is it.

## Outcome

Let the owner ask the coach for a new plan covering dates that already have an
accepted plan version. Acceptance creates a new immutable version, moves the
current pointer, and retains the superseded version intact. Locks survive.
Completed history is untouched.

Without this, M3 ships a coach the owner can consult exactly once per horizon:
accept a plan on Sunday and hand-editing is the only recourse for the rest of
the week.

## What separates this from regeneration

Regeneration (M3-03) refines a proposal that was **never accepted**. No version
exists, nothing is superseded, and it is capped per horizon.

Replanning supersedes an **accepted version**. That is the whole distinction and
it is structural — it does not depend on why the owner asked. Illness, a missed
session, a change of mind, and a race appearing on the calendar all take the
same path.

## Scope

1. Offer replanning from an accepted plan for a horizon starting today or later
   (M3-06's rule; a proposal never contains a past date).
2. Assemble context including the **current accepted plan version** for those
   dates, alongside the sources M3-03 already uses.
3. Reuse M3-03's compose step, planning note, and memory extraction unchanged.
4. Preserve locked sessions and activities across the new proposal and the
   version it produces.
5. Accept transactionally through M3-04's machinery: new immutable version,
   current pointer moved, prior version retained.
6. Show what changed between the superseded version and the new one.
7. Add lock-preservation, supersession, concurrency, and history-integrity
   tests.

## Non-goals

- No structured "report a session" reporting UX — no buttons for missed, too
  hard, sick, or time-constrained. The planning note carries it in prose. The
  structured surface stays M4.
- No AI-generated alternatives to choose between, and no clarifying questions
  before proposing. Both stay M4.
- No change to completion, logging, correction, or plan-versus-actual behaviour
  accepted in M1.
- No change to regeneration, which remains bounded to unaccepted proposals.

## Invariants that bind, and are not decisions

From `AGENTS.md`: replanning never changes completed history, past sessions, or
user-locked future content. The server enforces all three; the model is told
about locks under ADR-013 decision 5 but is never the control.

**This removes a non-goal from M3-04**, which currently states that lock
enforcement against future replans is out of scope. That non-goal must be
deleted when this ticket is approved, and M3-04's validation record should note
that the boundary moved rather than leaving two documents disagreeing.

## Open decisions

1. **May a replan change the day count or start date?** A plan accepted for
   Mon–Sun, replanned on Wednesday, produces at most Wed–Sun under M3-06.
   Whether the owner may also shrink or extend that further needs approval.
2. **What happens to a locked session the owner now wants moved?** Unlocking
   before replanning is the obvious answer, but it means the lock offers no
   protection against a distracted owner. Whether that is acceptable is a
   product call.
3. **Is replanning capped?** Regeneration is capped per horizon because it is
   free to press and costs money. Replanning has the same property. A cap, a
   cooldown, or nothing at all.
4. **How is the change from the superseded version shown?** M3-04 already has
   an open decision on diff presentation; this should reuse whatever it settles
   rather than inventing a second one.
5. **What happens when a day in the horizon already has a completion?** Under
   M3-06 only today can be affected. The completed session is permanent and the
   plan for that day must not be rewritten, but whether the day is shown as
   closed, or replanned around, needs approval.

## Test plan

- Replan a horizon with locked sessions; assert every lock survives into the
  new accepted version and that no path can clear one silently.
- Replan a horizon where today already has a completion; assert the completion
  and its planned source are unchanged.
- Assert the superseded version is retained, readable, and unmodified, and that
  plan-versus-actual for its dates still resolves.
- Concurrency: two replans of the same horizon; assert one wins and the other
  returns a conflict without writing.
- Idempotent retry creates at most one new accepted version.
- Anonymous and cross-user denial on every new path.
- Playwright at `390x844`: accepted plan → replan → compose → review → accept,
  plus a locked-content case and a conflict case.

## Approval gate

Tier 1: it supersedes accepted plan versions and touches the lock and history
invariants. Approved ticket, distinct builder, distinct independent reviewer,
Preview verification, and product-owner acceptance. The five open decisions
above are required before dispatch.
