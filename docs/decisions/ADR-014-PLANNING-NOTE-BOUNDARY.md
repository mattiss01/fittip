# ADR-014: The planning note, and owner free text as prompt input

**Status:** proposed — draft for product-owner decision. The shape below was
settled in the 8 August 2026 decision session; the four questions at the end
were not, and each can be answered without disturbing the others.

**Date drafted:** 8 August 2026

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

When the owner rejects a proposal and asks for another, the compose screen
**does** prefill the previous planning note, and the superseded proposal travels
with the request as context.

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

## Decisions the product owner must make

1. **Maximum length.** Recommendation: 1000 characters, matching
   `MEMORY_CONTENT_MAX_LENGTH`. Long enough for several constraints, short
   enough to stay a note rather than becoming a chat.
2. **Does the note survive a rejected proposal?** If a proposal is rejected and
   the record is retained as evidence, the note is retained with it.
   Recommendation: yes — a rejected proposal is already kept as generated
   evidence, and the note is what explains what was asked for.
3. **Is the note visible in Progress against an accepted plan version?**
   Recommendation: yes. "Why does this week look like this" is answerable only
   if what you asked for is still visible next to what you got.
4. **How much of the ~30KB ceiling is reserved for it?** At 1000 characters the
   answer is small, but it must be stated so the budget adds up across goals,
   memory, training history, the optional roadmap, the note, and — on a
   regeneration — the superseded proposal, which is the largest of these after
   training history.
5. **The regeneration cap per horizon.** Recommendation: 3. Enough to converge
   on something workable, few enough that an unsatisfying loop stops and asks
   the owner to edit the proposal directly instead. What the owner sees when the
   cap is reached is a UX decision recorded in M3-03.
