# ADR-014: The planning note, and owner free text as prompt input

**Status:** **accepted** — the shape was settled in the 8 August 2026 decision
session and the five open questions were answered on 9 August 2026. One answer
went beyond the question asked and amends decision 2a: regeneration now requires
mandatory feedback in a second field. Two consequences land in M3-03 rather than
here — see "Decisions made" below.

**Date drafted:** 8 August 2026
**Date accepted:** 9 August 2026

**Ticket:** required before [M3-02](../backlog/M3/M3-02-ROADMAP-PROPOSAL.md)
and [M3-03](../backlog/M3/M3-03-SELECTED-HORIZON-PLAN-PROPOSAL.md) are
dispatched

**Builds on:** [ADR-006](ADR-006-LOCAL-OWNER-AI-MVP.md),
[ADR-012](ADR-012-AI-GOAL-CONTEXT-ELIGIBILITY.md), and
[ADR-013](ADR-013-AI-TRAINING-HISTORY-ELIGIBILITY.md)

## Context

ADR-012 and ADR-013 decide which *stored records* a coaching AI may read. Both
assume the same thing: the coach's input is assembled by the server from data
the owner created for some other purpose, and the owner never types anything
aimed at the model.

The 8 August session broke that assumption. A plan built only from goals,
memory, and training history cannot know that the owner has a wedding on
Saturday, has already agreed to a club run on Wednesday, or is flying on
Thursday with no kit. Those facts are real constraints, they are numerous, and
most of them are too transient to be worth curating as memory items. Without a
channel for them the coach produces plans that are wrong in ways the owner can
see immediately and cannot correct.

So the compose step for a proposal gains a **planning note**: owner free text,
written for one proposal request, describing what the coach should account for
on those dates.

This is a new *kind* of input, not a new field on an existing one, and it
deserves its own decision for two reasons. It is the first text in the product
authored deliberately for a provider, which changes the consent posture. And it
is the first input the owner controls the wording of, which changes the threat
model.

## Decisions

### 1. The planning note is optional, per-request, and on both operations

Both `create_roadmap` and `create_seven_day_plan` take a planning note. Neither
requires one; a proposal with an empty note is an ordinary proposal, not a
degraded one.

The roadmap arguably needs it more than the weekly plan. A roadmap spans months,
so the things that shape it — a race in October, a knee that flares in winter, a
job change in spring — are exactly what goals and memory will not hold on the
day the roadmap is generated.

*Alternative rejected:* a note on the weekly plan only. It keeps the change
surface smaller, but it leaves a roadmap that spans a season with no channel for
anything a goal does not already say, and it means designing the compose pattern
twice.

### 2. The note is stored on the proposal, and never reused on a later request

The note is part of the proposal record it produced, so an accepted plan remains
explainable — both to the owner reading Progress later and to anyone reviewing
why a plan looked the way it did.

It is never carried into a later request, prefilled into a later compose screen,
or added to a durable context. "I am away this Saturday" silently reshaping a
plan three weeks later is the specific failure this prevents, and it would be
invisible to the owner who wrote it.

### 2a. Regeneration is the one exception to "never reused"

*Amended 9 August 2026: regeneration requires mandatory feedback in a second
field. The two-field shape below replaces the single prefilled note originally
drafted here.*

When the owner rejects a proposal and asks for another, the compose screen
carries **two** fields:

- **The planning note**, prefilled from the previous round and editable. It
  holds constraints on the horizon — "I am away Saturday" — which stay true
  across every regeneration.
- **Regeneration feedback**, empty on every round and **required**. It holds
  what is wrong with the proposal just rejected — "too much volume on Tuesday".

The superseded proposal travels with the request as context.

Two fields rather than one because these are different kinds of statement and
decision 5 sends both to memory extraction. "I am away Saturday" is a candidate
constraint; "too much volume on Tuesday" is a comment on one week and must never
become a proposed durable memory item. Merged into one box, either the
constraint is buried in complaints or the complaint is mistaken for a standing
rule.

Making feedback mandatory is the substantive part. A regeneration with no stated
reason is a slot-machine pull, and three blind pulls converge on nothing; three
informed attempts are a reasonable budget. It also removes an unenforceable
validation — "the note must differ from its prefill" is weak and gameable, while
"this field is required and starts empty" is trivial to check.

This is a new request on the same operation, not a continuation of a
conversation — the provider retains nothing, and the context is reassembled from
scratch. What makes it different from an ordinary later request is that the
intent, the dates, and the constraints are the same ones from seconds earlier.
Not prefilling would make the owner retype "I am away Saturday" to fix a
complaint about Tuesday.

The bound that keeps this from becoming a transcript: **only the immediately
previous proposal travels**, never the whole chain. Context size stays flat
regardless of how many rounds the owner goes. Every round is still stored as
evidence; storage and transmission are separate questions.

A cap on regenerations per horizon is required — regenerate is the one control
in the product that spends money on every press, and an owner who is not getting
what they want will press it. The exact number is a product decision recorded in
M3-03.

Feedback given at this step is often durable — "I never want two hard days back
to back" is a preference, not a comment on one week. It feeds memory extraction
under decision 5 exactly as an initial note does.

### 3. The note is sent verbatim, within a maximum length

No summarization, classification, redaction, or rewriting happens between the
owner's text and the provider. The owner wrote it for the coach; interposing a
transformation would make the coach's input something the owner never approved,
and any transformation good enough to be safe would need a model of its own.

A maximum length applies and is enforced server-side. Over-length is a rejection
at the compose step where the owner can fix it, not a silent truncation — this
differs deliberately from ADR-013's treatment of completion notes, where the
owner is not present and truncation is the only option that preserves the flow.

### 4. The note has no authority over server constraints

**This is the consequential decision in this ADR.**

The planning note is the only input to the boundary whose exact wording the
owner controls, which makes it the one place where prompt injection is possible
— including accidental injection, where an owner writes something that reads as
an instruction without meaning it as one.

The note may inform *what the coach proposes*. It may not change *what the
system accepts*. Specifically, nothing written in a planning note may:

- alter the requested date range, the day count, or the horizon;
- change the output schema, add a field, or omit a required one;
- cause a goal, memory item, or session the eligibility gates excluded to be
  read or referenced;
- relax the conservative pain, illness, injury, and severe-fatigue behavior;
- cause the coach to write, accept, or persist anything; or
- change any limit, budget, or ceiling.

The enforcement is not a filter on the note's text. It is that every one of
those properties is already validated server-side after the response returns,
against values the server derived and the model never saw. A note that
successfully persuades the model to return eight days produces a rejected
candidate, not an eight-day plan.

This is also why the note is placed in the request as clearly delimited owner
content, labeled as context rather than as instruction. That reduces accidental
injection; it is not what makes the boundary safe.

*Alternative rejected:* screen the note for injection patterns before sending.
It gives a false sense of a control — pattern-matching natural language for
intent does not work — and it would reject legitimate notes. The output
validator is the real control and it already exists.

### 5. Memory extraction reads the note, and produces proposals only

The same request returns memory candidates derived from the note. They are
written with provenance `inferred_proposed` and status `proposed`, and become
active only through the owner's existing explicit review.

This is what stops decision 2 from hollowing out the memory model. Without it,
durable constraints get typed into the ephemeral box week after week and memory
never learns anything. With it, "I only have 45 minutes on weekdays" is offered
once as a constraint the owner can accept, after which it shapes every future
plan without being retyped.

`inferred_proposed` already exists in the accepted M2-02 model and nothing has
ever produced one. This is the intended producer.

### 6. The note counts against the context ceiling like every other source

It is bounded, enumerated, and deny-by-default in the same way goals, memory,
and training history are. Its maximum length is reserved within the
whole-context byte budget rather than added on top of it, so a long note reduces
what is available to other sources rather than pushing the total over.

## Consequences

- `CoachAIRequest` gains an owner-authored field for the first time. The
  comment on that type states that every field is server-derived; it stops being
  true and must be corrected rather than left to mislead.
- The privacy statement for AI transfer under M0-04 must cover it. It is the
  clearest case in the product of the owner knowingly sending their own words to
  a provider, and it should be described as such rather than buried.
- Deletion under M0-04 must reach it. It lives on the proposal, so it is covered
  by whatever retains or deletes proposals — see open decision 2.
- The compose screen gains a length affordance. A limit the owner discovers only
  on submit is a bad limit.
- Decision 4 is a claim about the output validator that must be tested, not
  assumed. M3-03's test plan needs a fixture whose planning note attempts each
  listed escalation, asserting the candidate is rejected. A fixture corpus that
  contains no injection attempt does not establish this.
- Nothing here approves a provider, model, retention term, or spend.

Added 9 August 2026 with the answers above:

- **M3-03 gains a schema version bump.** `fittip.seven-day-plan.v2` adds a
  coach-authored description of the week, without which the "why does this plan
  look like this" section has only the owner's own note to show. The roadmap
  needs no bump; it already has `summary`.
- **M3-03 gains a second free-text field** and its compose UX: mandatory
  regeneration feedback, empty each round, 500 characters.
- **Memory extraction must distinguish the two fields.** Decision 5 reads owner
  text and proposes memory candidates. The planning note is a legitimate source
  of durable constraints; regeneration feedback is a comment on one rejected
  week and must not produce them. Extracting "too much volume on Tuesday" as a
  proposed constraint would poison the memory model with one-off reactions, and
  is the specific failure the two-field split exists to prevent.
- **The bake-off corpus predates the v2 schema.** Its scenarios carry a planning
  note and score per-session `intent`, so the model comparison stands, but the
  schema in `docs/decisions/support/m3-01b-bakeoff/schemas.mjs` mirrors v1 and
  will need the description field before it is reused for M3-03 prompt tuning.

## Decisions made

Answered by the product owner on 9 August 2026.

1. **Maximum length: 1000 characters**, matching `MEMORY_CONTENT_MAX_LENGTH`, so
   there is one constant and one mental model. Realistic notes are far shorter —
   the two authored for the M3-01B bake-off measure 431 and 320 bytes — so this
   is roughly two to three times real usage. The competing precedent, the 2000
   allowed on a completion `note`, was rejected: a box that invites 2000
   characters stops being a note and becomes a chat.

2. **Retained with a rejected proposal: yes.** A rejected proposal without its
   note is evidence nobody can interpret — you cannot tell whether the model
   failed or the request was strange. This remains conditional on M3-02's
   decision to retain rejected proposals at all; if they are not retained, there
   is nothing for the note to be retained with.

3. **Visible in Progress, inside a "why does this plan look like this"
   section.** The section is collapsed by default and expands to reveal the
   planning note together with a description written by the coach. Purely a
   display affordance — no user-editable annotation, and therefore no question
   about mutating an immutable plan version.

   **This does not fit the accepted contract, and that is an M3-03 consequence
   rather than an M3-01B one.** `RoadmapProposal` carries a `summary`;
   `SevenDayPlanProposal` does not, and its only reasoning lives in each
   session's `intent`. A coach-authored description for the week as a whole
   needs a new field and a schema version bump to `fittip.seven-day-plan.v2`.
   M3-01B non-goal 2 forbids touching the contract, so this lands in M3-03 and
   nothing already decided is disturbed.

4. **Reservation: 1,200 bytes for the planning note, 600 for the regeneration
   feedback.** Not 1,000 and 500: umlauts and sharp s are two bytes each in
   UTF-8 and JSON escaping adds more, so a note written in German would
   otherwise be rejected at compose for a reason the owner cannot see. Reserved
   within the whole-context budget per decision 6, never added on top.

   Regeneration is therefore the worst-case context: goals, memory, training
   history, an optional roadmap, the carried planning note, the new feedback,
   **and** the superseded proposal.

5. **Regeneration cap: 3, recorded as a product guardrail and explicitly not a
   spend control.** At the prices settled in M3-01B the difference between three
   regenerations and five is roughly EUR 0.0002. Calling it a cost control would
   be false, and would invite the next person who reads the pricing to raise it
   for the wrong reason. The real argument is that after three informed attempts
   the prompt or the goals are the problem, not the roll, and the product should
   push the owner toward editing the proposal directly. What the owner sees when
   the cap is reached is a UX decision recorded in M3-03.

6. **Regeneration feedback is mandatory**, in its own field, capped at 500
   characters. This amends decision 2a — see that section for the reasoning and
   the two-field shape.

## A finding raised while sizing decision 4

The per-source item caps and the whole-context byte ceiling are inconsistent
today, and decision 4 cannot fix it alone.

`COACH_AI_CONTEXT_LIMITS` allows `maxMemoryItems: 40`
(`src/server/ai/context.ts:39`) and `MEMORY_CONTENT_MAX_LENGTH` is 1000. Forty
memory items at full length is 40,000 bytes — more than the entire ~30,000
ceiling this ADR sizes against, and more than three times the 12,000 the
accepted code enforces today. `assembleCoachAIContext` **denies** rather than
truncating, so an owner who curates a large memory simply cannot generate a
proposal, and the error does not say which source is at fault.

This is not a reason to reopen ADR-012 or ADR-013. It is a reason for the
context budget to be an explicit per-source allocation rather than a single
total with independent item caps behind it. That allocation belongs with M3-01B
decision 4 and should be recorded there.
