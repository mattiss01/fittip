# FitTip

A personal training coach. One owner keeps goals and coaching context, maintains
one continuous training plan, logs what actually happened, and asks an AI to
propose bounded changes they review before adding them.

The vocabulary below is the project's ubiquitous language. It is a glossary, not
a spec: no schema, no implementation, no decisions. Decisions live in
`docs/decisions/`, behaviour in `docs/product/`.

## Language

### Owner and identity

**Owner**:
The one person whose data a record belongs to. Every owned record names an
owner, and authorization is enforced both server-side and in the database.
_Avoid_: user, account, customer, athlete

### Goals and coaching context

**Goal**:
Something the owner is training towards. A goal is either _core_ or
_supporting_, and at most three active goals may be core.
_Avoid_: objective, target, aim

**Memory item**:
One explicit, inspectable, statused piece of coaching context — a profile fact,
a constraint, a preference, or an observed pattern. Memory is never silently
inferred; an item the system suggests is proposed and stays proposed until the
owner accepts it.
_Avoid_: fact, note, preference (as a standalone noun), profile

**Coaching context**:
The assembled set of goals and memory items eligible to be sent to a coaching
AI for one operation. Eligibility is decided by gates, not by convenience.
_Avoid_: context (unqualified), prompt data, user data

**Candidate**:
A record produced for the owner's explicit review — accept, edit and accept, or
reject — that becomes a goal or memory item only through an explicit
publication. Onboarding produces candidates; so does a coaching AI.
_Avoid_: suggestion, draft, recommendation

### Planning and training

**Personal activity**:
An owner-created, owner-owned definition of something they do. FitTip ships no
global exercise library; every activity belongs to the owner who made it.
_Avoid_: exercise, movement, workout type

**Rolling training plan**:
The owner's single continuous collection of planned training. It is viewed by
date but is not itself constrained to a horizon.
_Avoid_: detailed plan version, short plan, schedule, program

**Planned session**:
One intended training session on one date in the rolling training plan. It may
be locked, meaning later planning must not move or replace it.
_Avoid_: workout, event, entry

**Saved session**:
An owner-private reusable session template with no planned date or completion
state. Reuse creates an independent copy rather than a live link.
_Avoid_: global template, shared session, exercise library

**Recurring session series**:
One owner-defined rule and session template describing repeated planned
sessions over owner-local dates.
_Avoid_: recurring plan, schedule rule, RRULE

**Occurrence**:
One dated instance of a recurring session series. It may inherit the series or
carry an explicit exception.
_Avoid_: generated row, recurrence copy, event

**Plan change set**:
One owner-approved group of Plan additions, edits, moves, cancellations, locks,
or recurrence changes that succeeds or fails as one action.
_Avoid_: plan version, save, mutation batch

**Recovery day**:
An optional day-level label expressing a recovery intention. It is not a
session and may coexist with planned sessions.
_Avoid_: rest session, empty day, no training

**Completed session**:
A permanent record of what actually happened, created separately from the plan
that suggested it. A plan is never converted or rewritten into an actual.
_Avoid_: actual, log entry, result

**Completion note**:
The owner's free text about a session that already happened, written on the
actuals side.
_Avoid_: note (unqualified), comment

**Correction**:
An append-only revision of a completed session. The trail is preserved and the
current revision is pointed to, so history is never overwritten.
_Avoid_: edit, update, fix

**AI planning horizon**:
The exact 1–7 consecutive owner-local dates covered by one AI plan proposal. It
bounds the coaching operation, not the rolling training plan.
_Avoid_: plan duration, plan length, schedule

### Coaching AI

**Proposal**:
Structured, schema-validated output from a coaching AI. A proposal is never
accepted data: only an explicit owner-reviewed action can add selected content
to the Plan or create a roadmap version from one.
_Avoid_: suggestion, generated plan, AI plan, output

**Roadmap**:
A rough longer-term training direction — phases and focus — that a detailed
plan proposal can be traced back to. Deliberately coarser than a plan.
_Avoid_: long-term plan, macrocycle, strategy

**Planning note**:
The owner's free text written for one proposal request, describing what the
coach should account for on those dates — commitments, constraints, or anything
the records cannot show. The forward-looking counterpart to a completion note.
_Avoid_: prompt, instruction, request context, user input

**Operation**:
One named thing a coaching AI can be asked to do, each with its own schema,
prompt, and context limits. The set is enumerated and closed.
_Avoid_: task, action, call, endpoint

**Regeneration**:
Asking the coach for another roadmap or plan proposal using bounded feedback
and the immediate predecessor. It is a new request, not a continued
conversation, and changes no accepted data by itself.
_Avoid_: retry, refine, iterate, redo, re-propose

**Editing**:
Changing a proposal's structured fields yourself, before accepting it. Purely
deterministic: no coach is involved and nothing is sent anywhere.
_Avoid_: adjusting, correcting, tweaking

**Replanning**:
Proposing reviewed changes to future content already represented in the rolling
training plan. Past training, completed sessions, and locked future content are
never changed by replanning.
_Avoid_: rescheduling, adapting, re-proposing, replan (as a noun)

**Boundary**:
The single server-side place where coaching context is assembled, limits are
applied, and output is validated. Nothing reaches a provider except through it,
and it fails closed.
_Avoid_: gateway, wrapper, integration, layer
