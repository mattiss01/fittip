# ADR-013: What training history a coaching AI may read

**Status:** **accepted** — the product owner accepted the revised text on
9 August 2026. The four open questions in the 4 August draft were answered on
8 August, three of them against the draft's proposal, and the revised ADR was
read and accepted as it stands.

**Date drafted:** 4 August 2026
**Date revised:** 8 August 2026
**Date accepted:** 9 August 2026

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
unreflectively, and the owner never reviews it with a provider in mind.

The 4 August draft made that difference the reason to be stricter than ADR-012.
The 8 August session accepted the difference but not the conclusion: while use
is founder-only, the only data at risk is the owner's own, and a coach that
cannot read the sentence explaining a pain flag is conservative in ways that
make it worse at its job. The exposure line moved; the boundedness did not.

## Decisions

### 1. Completed sessions are visible; the window is bounded by time and by count

A coach reads completions from the **last 8 weeks** of the owner's local dates,
subject to a **maximum session count** within that window. Both limits apply;
neither replaces the other.

The time window is what makes a *gap* legible. A count-only rule cannot express
"you have not trained in three weeks" — the last twenty sessions of someone who
stopped in March still look dense. The count is what bounds cost, because eight
weeks means sixteen sessions for one owner and forty-eight for another.

When the count trims the window, the coach is told **how many sessions the
window held and how many it received**, so a trimmed context never reads as a
complete one. A model that silently receives a subset will reason as though it
saw everything.

*Alternative rejected:* everything ever logged. It grows without bound and the
marginal value of a session from fourteen months ago is close to zero for
planning the next seven days.

*Alternative rejected:* a session count alone. Bounded and predictable, but it
destroys the gap signal, which is one of the specific things this ADR exists to
give the coach.

### 2. Only the current revision of a completion is visible

Corrections are append-only behind `completion_heads.current_completion_id`.
The coach reads the current head and never the correction trail.

Superseded values are ones the owner has explicitly declared wrong. Feeding a
coach data it has been told is incorrect is worse than withholding it, and a
session corrected five times would otherwise cost five records, so context size
would stop being predictable from the session count in decision 1.

The head's own `correction_reason` **is** sent — see decision 4. That is a
change from the 4 August draft, which withheld it.

### 3. A deleted session is invisible, with no exception

If the owner deletes a session it does not reach a provider, is not summarized,
and does not survive in any derived aggregate.

Deletion is an instruction, not a filing preference. This mirrors ADR-012's
treatment of an abandoned goal: the owner has said no, and nothing may resurface
it. Any future caching or summarization of history must honor a later deletion,
which is a real constraint on how history may be precomputed.

### 4. Safety flags and free text are both sent, and free text is truncated

**Sent:** `actual_local_date`, `status`, `duration_minutes`, `perceived_effort`,
`feeling`, and the four boolean signals `pain_reported`, `illness_reported`,
`injury_reported`, `severe_fatigue_reported`. Session `title` and `sport`, and
personal activity names. And all three free-text fields on the current
revision: `note`, `replacement_description`, and `correction_reason`.

**Each free-text field is truncated to a fixed maximum** before it leaves the
boundary. `note` allows 2000 characters and `replacement_description` and
`correction_reason` 500 each; sending them at full length against a
forty-session window would exceed the whole-context ceiling several times over.
Most real notes are a sentence or two, so truncation rarely fires, and when it
does the explaining sentence survives because it comes first.

This reverses the 4 August draft, which sent flags only. Two things changed the
answer. First, use is founder-only, so the only data at risk today is the
owner's own — and the pre-friends gate in the M3 backlog must revisit this
before that stops being true. Second, the coaching cost of withholding is real:
`pain_reported: true` without "knee twinged on the descent, fine by evening"
produces a coach that backs off from a non-problem.

`correction_reason` is included because the owner may correct a record for a
reason that matters — but see decision 2: the reason travels, the trail does
not.

*Alternative rejected:* send notes with the owner's per-session consent. It puts
a privacy decision in front of someone mid-workout-log, which is the worst
moment to ask, and a consent that is always granted is not a control.

*Explicitly deferred:* whether this line survives contact with another person's
data. It does not automatically. See Consequences.

### 5. Inside the horizon the coach sees every planned entry and its lock state; beyond it, locked entries only

Within the dates being planned, the coach reads **every** planned session,
each marked locked or unlocked. Beyond the horizon it reads **locked entries
only**, within a bounded forward window.

Showing an entry without showing whether it is locked is ambiguous: the coach
cannot tell whether it should plan around the entry or replace it. The lock is
already the owner's statement of exactly that, so the two travel together.
Withholding unlocked entries entirely — the 4 August proposal — would have the
coach propose into dates that already hold the owner's own manual work, with no
idea it was doing so. The draft's anchoring concern applies to *replanning*, and
M3 does not implement replanning.

Beyond the horizon the logic inverts. Unlocked entries out there are speculative
and the coach was not asked about those dates, so they are noise. Locked ones
are not: a locked race is what a taper is built toward, and without it the
roadmap has nothing to aim at. The forward window may differ per operation and
should be longer for `create_roadmap` than for `create_seven_day_plan`.

### 6. Planned sessions that were never completed are visible

Within the same window as decision 1, the coach reads planned sessions that
produced no completion.

The 4 August draft withheld past plans entirely so that adherence could not be
inferred. That went too far in a specific way: a completion already carries its
optional link to the planned session it came from, so the coach can already see
what was *done*. What it could not see was what was planned and skipped — which
means it could not distinguish an owner who trained three times because that was
the plan from one who planned six and managed three, and would keep prescribing
into a gap it could not see.

Sending only the misses is the whole adherence signal at near-zero extra cost,
and it preserves which sessions went missing. A skipped long run and a skipped
mobility session are not the same information.

This does not license score-keeping. The coach may use adherence to size the
next proposal; the product invariant that plans and completions are separate
permanent records is unchanged, and no completion is created, rewritten, or
inferred from a plan.

### 7. History is read-only, bounded, and deny-by-default like the others

The same shape as ADR-012: an explicit `selectTrainingHistoryContext` in
`src/server/training/`, returning bounded fields; a maximum session count and
byte budget; anything not enumerated above excluded, so a column added later is
invisible until this ADR is amended.

Two departures from ADR-012's enforcement, both deliberate. Per-field
truncation under decision 4 and per-count trimming under decision 1 are
**bounded reductions**, not denials — with the disclosure decision 1 requires.
The whole-context byte ceiling remains a denial.

## Consequences

- M3-02 and M3-03 build on a decided policy rather than inventing one.
- `COACH_AI_CONTEXT_LIMITS` gains a third source and a much larger budget.
  Today's ceiling is 10,000–12,000 bytes and assumes two sources; free text
  across a full window needs roughly **30,000**. At the M3-01B figures that is
  about 7.5K input tokens — still fractions of a cent per proposal, but roughly
  50% above the 5K the cost table assumed. M3-01B's ceilings must be set against
  this number, not the old one.
- Prompt caching will not absorb history. A cached prefix must match exactly,
  and history changes as sessions are logged, so the static system prompt and
  schema must be ordered **before** volatile context for caching to work at all.
- The exact session cap, per-field truncation length, and forward-window length
  are tuning parameters. They may be amended without reopening this ADR,
  provided the amendment is recorded here.
- **Decision 4 does not survive the pre-friends gate unexamined.** It is
  justified by founder-only use. Before any friend's data, external user, or
  public registration, the free-text line must be revisited alongside M0-04
  consent, and reversing it later means either a migration or grandfathering
  already-logged notes. That cost is accepted knowingly.
- A coach that reads notes will occasionally act on something the owner wrote
  carelessly. The planning note (see below) is the deliberate channel; the
  completion note is not, and now travels anyway.
- Nothing here approves a provider, model, retention term, or spend. ADR-006 and
  M3-01B's open decisions continue to govern those.

## Recorded amendments to the tuning parameters

The Consequences above name the session cap, the per-field truncation lengths,
and the forward-window length as tuning parameters that may be amended without
reopening this ADR, provided the amendment is recorded here. This section is
that record. No decision above is changed.

**Set by M3-02 on 11 August 2026**, for `create_roadmap`:

| Parameter                            | Draft | Set    |
| ------------------------------------ | ----- | ------ |
| Session cap within the 8-week window | none  | 20     |
| `note` truncation                    | 2000  | 400    |
| `replacement_description` truncation | 500   | 240    |
| `correction_reason` truncation       | 500   | 240    |
| Forward locked-entry window          | none  | 180 days |

The reason the drafted free-text lengths could not stand: 20 sessions at a
2,000-character `note` allowance is 40,000 bytes for that one field, against a
5,800-byte allocation for the whole training-history source and a 24,000-byte
whole-context ceiling. The drafted number cannot coexist with any session count
worth having.

400 characters is two to six times the longest note in the shared synthetic
corpus at `docs/decisions/support/m3-01b-bakeoff/`, where a serialized session
measures 393-625 bytes with a mean of 511. Truncation therefore rarely fires,
and decision 4's argument still holds when it does, because the explaining
sentence comes first.

M3-02 also adds a **byte** trim alongside the count trim: sessions are added
newest-first until either the cap or the allocation is reached. This stays
within decision 7's "bounded reductions, not denials", and `sessionsIncluded`
against `sessionsInWindow` continues to disclose it, so a trimmed window never
reads as a complete one. History is the one source whose size the owner cannot
see or curate, which is why it reduces rather than denying while goals and
memory deny with the source named.

The forward window is 180 days for `create_roadmap`. Decision 5 requires it to
be longer here than for `create_seven_day_plan`, which M3-03 sets.

These figures are recorded in the M3-02 validation record with their arithmetic
and are subject to the product owner's approval of that record.

## Recorded amendment to decisions 2 and 4, 20 August 2026

Unlike the tuning section above, this one **does** change decisions recorded in
this ADR. It is recorded here and in the Decision history below rather than by
rewriting the decisions in place.

On 20 August 2026, while M3-15's replacement completion contract was being
drafted, the product owner decided that a completion is one owner-editable
record rather than an append-only revision chain. `completion_heads`,
`completion_group_id`, `revision_number`, `previous_completion_id`, and
`correction_reason` are not rebuilt after M3-11's reset. The matching product
amendment is recorded in
[F-005](../product/F-005-ROLLING-TRAINING-PLAN.md#recorded-amendments).

**Decision 2, "Only the current revision of a completion is visible."** Its
mechanism is gone; its outcome is now structural. There is no correction trail
to withhold, because there is no trail. The coach reads the single completion
row, which is by construction the current one. The reasoning that justified the
decision holds unchanged and is worth keeping visible: superseded values are
ones the owner has declared wrong, feeding a coach data it has been told is
incorrect is worse than withholding it, and context size stays predictable from
the session count in decision 1 because one completion can only ever cost one
record. This ADR was in fact the evidence for the product decision — a trail
that no consumer reads is machinery without a consumer.

**Decision 4, on free text.** `correction_reason` is withdrawn from the sent
field set. `note` and `replacement_description` are unchanged and remain sent
with per-field truncation. The `correction_reason` row in the tuning table
above is obsolete and is left standing as the historical record of what M3-02
set; no replacement value is needed, because the field no longer exists in the
schema or in `CoachAICompletionReference`.

Decision 4's own justification for including it — "the owner may correct a
record for a reason that matters" — is not disputed. What changed is the price:
that reason was only ever available because a check constraint made it
mandatory on every revision after the first, which put a required text field in
front of an owner fixing a mistyped duration. The coaching value of the
occasional meaningful reason did not cover that cost.

**Decisions 1, 3, 5, 6, and 7 are unchanged.** The 8-week window, the session
cap, invisible deleted sessions, missed planned sessions, the forward
locked-entry window, and the read-only bounded-reduction rule all stand.

## Related decision made in the same session

The compose step for a plan proposal introduces a **planning note** — owner
free text written for one proposal request, describing what the coach should
account for on those dates. It is a new field crossing the boundary and is
therefore a privacy decision of the same class as this ADR, but it is not
training history and is not governed here. It needs its own record, and M3-03 is
where it lands.

## Decision history

The 4 August draft asked the product owner four questions. All four were
answered on 8 August 2026:

1. **Window** — 8 weeks confirmed, with a session cap added. *(refined)*
2. **Flags versus notes** — notes are sent, all three free-text fields, with
   per-field truncation. *(reversed)*
3. **Past plans** — missed planned sessions are sent; full past plans are not.
   *(reversed in part)*
4. **Locked future sessions** — every entry inside the horizon with its lock
   state, locked entries only beyond it. *(reversed in part, and widened)*

Decisions 2 (current revision only), 3 (deleted sessions invisible), and 7
(read-only and bounded) carry over from the draft substantially unchanged.

**Accepted 9 August 2026** against the revised text, with no further changes.
The consequence recorded above stands and is not softened by acceptance: the
free-text decision is justified by founder-only use, it does not survive the
pre-friends gate unexamined, and reversing it later means a migration or
grandfathering already-logged notes. That cost is accepted knowingly.

**Amended 20 August 2026.** Decisions 2 and 4 changed when the product owner
made a completion owner-editable rather than append-only, withdrawing
`correction_reason` from the boundary. The section above records what changed
and what survives. Decision 2's outcome is unchanged and is now structural
rather than enforced by a head pointer; decision 4 loses one of its three
free-text fields and keeps the other two.
