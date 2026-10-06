# ADR-021: Guided setup saves directly; the draft and its publication are removed

**Status:** accepted — the product owner decided it on 6 October 2026, while
reworking guided setup screen by screen.

**Date:** 6 October 2026

**Ticket:** "Remove the setup draft" in [`docs/backlog/NEXT.md`](../backlog/NEXT.md),
after the rework logged on 6 October 2026 in
[`docs/backlog/LOG-2026.md`](../backlog/LOG-2026.md)

**Supersedes:** [ADR-011](ADR-011-M2-ONBOARDING-PUBLICATION-BOUNDARY.md)

**Builds on:** [ADR-009](ADR-009-M2-GOAL-MUTATION-TRANSACTION.md) and
[ADR-010](ADR-010-M2-MEMORY-WRITE-BOUNDARY.md), which stay as they are

## Context

ADR-011 gave guided setup a resumable draft. Answers became goal and memory
candidates, waited in six owner-scoped tables, and were published together at a
review step by one `SECURITY DEFINER` function, `apply_onboarding_change`, so
that the owner never saw half a selection saved. A nightly job deleted drafts
that had expired.

The owner found the result wrong in use. The steps read as forms, the review
asked for a decision on every line the owner had just typed, and the memory
items came out stilted because fixed rules turned each answer into a statement.
Setup also kept its own limit of three goals, which is the limit on core goals
and not on goals.

## Decision

Guided setup has no draft and no review. Each screen saves where its answer
lives, when Next is pressed:

- "About you", the sports and the training setup are columns of `profiles`,
  written directly by the owner under a column-scoped grant.
- Goals are saved as goals through `apply_goal_change` (ADR-009), one call a
  goal.
- What the owner writes on the last screen is filed in Memory through
  `apply_memory_change` (ADR-010), one active item a field, as written.
- Where setup stands is three columns of the profile: the screen, finished,
  skipped.

The draft's tables, `apply_onboarding_change`, its helpers, its receipt type and
the nightly cleanup job are dropped
(`20261006175442_remove_setup_draft`). The `intake_confirmed` provenance, the
`memory_items.intake_field_key` column and the trigger that clears a confidence
after an owner's edit are kept: Memory uses them, and items filed by the old
setup still carry them.

## What is given up

ADR-011 existed for one guarantee: several goals and memory items appear
together or not at all. That guarantee is gone, on purpose.

- A goals screen with three goals is three calls. If the second is refused, the
  first is saved. The screen stays open with what was typed, the saved row keeps
  its id, and pressing Next again edits it and does not make it twice.
- The last screen is one call a field. Pressing "Finish setup" again passes over
  text Memory already holds as active.
- Nothing is reviewed before it is kept. The owner typed every word, so there
  is nothing inferred to accept; the product rule that inferred memory is
  proposed and never silently treated as fact is untouched, because nothing
  here is inferred.

The multi-row invariants that matter are still held where they always were: at
most three core goals and the goal ranks by `apply_goal_change`, memory
revisions by `apply_memory_change`. Setup holds none of its own.

## Consequences

- One privileged boundary fewer: no `SECURITY DEFINER` function for setup, and
  six fewer tables holding health-adjacent text for up to thirty days.
- Leaving setup loses nothing, since everything before the open screen is
  already saved.
- The owner can set `setup_step`, `setup_finished_at` and `setup_skipped_at` on
  their own row. They decide only which screen opens and whether a reminder
  shows; no authorization depends on them.
- The AI data boundary does not move. Active memory items already reach the
  coach, which the last screen says. The training setup does not reach it;
  that is a separate decision (ADR-022, not yet written).
- A coach that tidies or splits what the owner wrote into memory items would
  bring candidates and a review back for that screen. That is not built and
  would need its own record.
