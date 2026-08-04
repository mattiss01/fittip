# ADR-013: What training history a coaching AI may read

**Status:** proposed — draft for product-owner decision. Nothing here is
approved. Each numbered decision is a separate call and any of them can be
changed or rejected without disturbing the others.

**Date drafted:** 4 August 2026

**Ticket:** raised by the [M3-01](../backlog/M3/M3-01-LOCAL-AI-ADAPTER-CONTROLS.md)
builder and confirmed by its independent review; required before
[M3-02](../backlog/M3/M3-02-ROADMAP-PROPOSAL.md) is dispatched

**Builds on:** [ADR-006](ADR-006-LOCAL-OWNER-AI-MVP.md),
[ADR-008](ADR-008-M1-TRAINING-RECORD-TRANSACTIONS.md), and
[ADR-012](ADR-012-AI-GOAL-CONTEXT-ELIGIBILITY.md)

## Context

M3-01 built the AI context from goals and memory. Training history was left out
deliberately: no decision existed about what a coach may read, and inventing one
inside a Tier 1 ticket is the failure ADR-012 was written to prevent. The
builder stopped and flagged it; the independent review agreed that was correct.

The gap now binds. A coach that cannot see what someone has actually been doing
cannot judge how much to propose, cannot notice a three-week gap, and cannot
avoid stacking hard work on someone who reported pain yesterday. M3-02 and M3-03
both need it.

Training history is also the most sensitive data FitTip holds. A completed
session carries `pain_reported`, `illness_reported`, `injury_reported`, and
`severe_fatigue_reported`, plus free-text `note`, `replacement_description`, and
`correction_reason`. Goals and memory were already reviewed and accepted by the
owner before they existed; a completion is logged in the moment, often
unreflectively, and the owner never reviews it with a provider in mind. That
difference is why this ADR is stricter than ADR-012 rather than a copy of it.

## Proposed decisions

### 1. Completed sessions are visible; the window is bounded

A coach reads completions from the **last 8 weeks** of the owner's local dates,
not the whole archive.

Eight weeks covers a full training block, so recent load, frequency, and trend
are all groundable. Older history mostly adds tokens without changing what to
propose next week. This is also the only decision here with a real cost
dimension — `COACH_AI_CONTEXT_LIMITS` reserves no byte budget for history today
and will need one.

*Alternative rejected:* everything ever logged. It grows without bound, pushes
against the context limit as a user's history accumulates, and the marginal
value of a session from fourteen months ago is close to zero for planning the
next seven days.

### 2. Only the current revision of a completion is visible

Corrections are append-only behind `completion_heads.current_completion_id`.
The coach reads the current head and never the correction trail, and never
`correction_reason`.

The trail is an audit and history feature for the owner. A coach that can see
"logged 45 minutes, corrected to 60" gains nothing for planning and may comment
on the correction, which is neither useful nor welcome.

### 3. A deleted session is invisible, with no exception

If the owner deletes a session it does not reach a provider, is not summarized,
and does not survive in any derived aggregate.

Deletion is an instruction, not a filing preference. This mirrors ADR-012's
treatment of an abandoned goal: the owner has said no, and nothing may resurface
it. Any future caching or summarization of history must honor a later deletion,
which is a real constraint on how history may be precomputed.

### 4. Safety flags are sent; free-text notes are not

**Sent:** `actual_local_date`, `status`, `duration_minutes`, `perceived_effort`,
`feeling`, and the four boolean signals `pain_reported`, `illness_reported`,
`injury_reported`, `severe_fatigue_reported`. Session `title` and `sport`, and
personal activity names, are sent — a coach cannot reason about training it
cannot name.

**Not sent:** the free-text `note` on a completion, `replacement_description`,
and `correction_reason`.

This is the most consequential decision in the ADR and the one most worth
arguing with. The four booleans carry the entire safety signal the product
invariant requires — conservative, non-diagnostic behavior around pain, illness,
injury, and fatigue keys off them, not off prose. The free-text note carries
unbounded personal content written without a provider in mind: symptoms, moods,
relationships, work stress, anything at all. Sending structured signals gets the
coaching benefit at a fraction of the exposure.

*Cost accepted:* a coach will miss nuance a note contains — "knee twinged on
the descent" becomes a bare `pain_reported: true`. The coach will be more
conservative than a human reading the note would be. That is the right direction
of error for a health-adjacent product, but it is a real quality cost, not a
free win.

*Alternative rejected:* send notes with the owner's per-session consent. It puts
a privacy decision in front of someone mid-workout-log, which is the worst
moment to ask, and a consent that is always granted is not a control.

### 5. Future locked plan entries are visible; unlocked ones are not

A coach proposing the next horizon reads **user-locked** future sessions so it
does not propose work that collides with something the owner has committed to.
Unlocked future entries stay invisible.

An unlocked entry is a draft the owner may still change, and replanning must
never appear to have been influenced by something they were still thinking
about. A lock is an explicit statement that this is fixed.

### 6. Past plans are not visible, so adherence is not inferred

The coach sees what happened, not what was intended and missed.

FitTip's product invariant keeps plans and completions as separate permanent
records. Handing a coach both invites it to compute adherence and comment on it,
which turns a training tool into something that keeps score. If adherence
coaching is wanted later, it is a product decision with its own UX, not a side
effect of what the AI happens to be able to see.

### 7. History is read-only, bounded, and deny-by-default like the others

The same shape as ADR-012: an explicit `selectTrainingHistoryContext` in
`src/server/training/`, returning bounded fields; a maximum session count and
byte budget enforced by denial rather than truncation; anything not enumerated
above excluded, so a column added later is invisible until this ADR is amended.

## Consequences

- M3-02 and M3-03 build on a decided policy rather than inventing one.
- `COACH_AI_CONTEXT_LIMITS` gains a third source and needs a byte budget split
  across goals, memory, and history. Today's limits assume two.
- The 8-week window and the flags-not-notes split are both tunable later without
  reopening the whole ADR, provided the amendment is recorded.
- A coach will occasionally be more cautious than the situation warrants,
  because it sees a pain flag without the sentence that explains it. Accepted
  under decision 4.
- Nothing here approves a provider, model, retention term, or spend. ADR-006 and
  M3-01B's open decisions continue to govern those.

## Decisions the product owner must make

1. Is **8 weeks** the right window, or should it be shorter, longer, or
   expressed in sessions rather than time?
2. Is **flags-not-notes** the right privacy line, or should notes be sent given
   that founder-only use means the only data at risk today is the owner's own?
3. Should **past plans** stay invisible, or is adherence something a coach
   should see and discuss?
4. Should **locked future sessions** be visible, as proposed, or should the
   coach see no future state at all?
