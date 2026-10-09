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
and the four boolean signals `pain_reported`, `illness_reported`,
`injury_reported`, `severe_fatigue_reported`. Session `title` and `sport`, and
personal activity names. And all three free-text fields on the current
revision: `note`, `replacement_description`, and `correction_reason`.

*Amended 7 Oct 2026:* `feeling` is no longer sent, because it no longer exists.
The log stopped asking "How did it feel?" on 3 Oct 2026 (effort says the same),
and the owner had the column dropped for good
(`20261007083912_remove_completion_feeling`). Nothing replaces it and the bytes
it freed are not allocated to anything else by this amendment.

*Clarified 25 Sep 2026 (A4bc):* a completion's `title` and `sport` are the
log's own — what the owner called the training when logging it — falling back
to the planned snapshot's for a log written before logs carried a name. It is
the same field under the same bound (120 and 80 characters) that this decision
already sends, not a new category, so eligibility does not change.

*Clarified 25 Sep 2026 (A4d):* a replaced session now links to the unplanned
log of what was done instead. For such a log, `replacement_description` carries
the linked log's date, title and sport ("Replaced by Hill ride (Cycling) on
2026-09-26"), under the same 500-character truncation. Those are the same
kinds of fact this decision already sends for every log - a date, a title, a
sport - so eligibility does not change. They are not always facts the coach
already has: the linked log may predate the history window, in which case the
line is the only place its title appears. A replaced log written before
the link keeps sending the text the owner typed.

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

## Recorded amendment to decisions 2 and 4

Unlike the tuning section above, this one **does** change decisions recorded in
this ADR. It is recorded here and in the Decision history below rather than by
rewriting the decisions in place.

On 29 August 2026, while M3-15's replacement completion contract was being
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

## Recorded amendment to decision 5

This one also changes a decision, and is recorded the same way.

On 2 October 2026, while the plan window was being lengthened from 14 days to 13
weeks (ADR-017, amended the same week), the product owner decided that **for
`create_roadmap` a running recurring series reaches the coach once, as a rule,
rather than as one dated entry per occurrence.**

Decision 5 says the coach reads "every planned entry" inside the horizon. That
was written when a series existed as rows for 14 days only. A roadmap's horizon
is months, the list is capped at 12 entries nearest first, and an occurrence
carries nothing that says it is a repeat. With 13 weeks written ahead, a weekly
session alone fills the list with identical lines and a locked race further out
— the entry decision 5 exists to deliver — no longer reaches the coach.

What a rule carries, and nothing else: `title`, `sport`, `frequency`,
`intervalCount`, `weekdays`, `startDate`, `endDate`. That is the title and sport
a dated entry already carries plus the recurrence the owner typed. The series'
intent, note, expected duration and activities are **not** sent; they were not
eligible on a dated entry and are not made eligible here.

What stays a dated entry inside the horizon: a one-off session, and an
occurrence the rule no longer describes — one that is locked, whose content the
owner edited, or that was moved to another day. Beyond the horizon, locked
entries only, as before.

Which series: one that starts on or before the horizon's last day and has not
ended before today. A series that only starts after the horizon is the unlocked
speculation decision 5 already calls noise.

Limits, set here as tuning parameters: at most 6 rules, earliest start first,
with the title and sport truncated as on a dated entry (120 and 80 characters),
counted inside the existing 1,400-byte plan-commitment allocation. No byte
ceiling and no token limit changes. The allocation is filled in this order:

1. **Locked dated entries.** A locked race is what this amendment exists to
   keep in view, so neither a rule nor a nearer unlocked session may push one
   out. Before the amendment the list was simply the 12 nearest entries; for
   `create_roadmap` a locked entry now outranks a nearer unlocked one.
2. **Rules.** One that does not fit in what is left is not sent, and its
   occurrences then stay dated entries, so a trimmed rule hides nothing.
3. **Unlocked dated entries** no sent rule describes, nearest first.

What this gives up, stated rather than discovered: a rule is the series as it
stands, and nothing tells the coach which of its dates differ. A single
occurrence the owner cancelled or deleted is not listed, so the coach may assume
a session on a date the owner called off. And an occurrence that stays dated —
locked, edited or moved — is described twice: once by its own entry and once by
the rule, which still implies a session on its rule date. For a roadmap, which
plans phases rather than days, both were judged smaller than the loss they
replace.

`create_seven_day_plan` is unchanged: its horizon is at most seven days, every
entry inside it is still sent dated with its lock state, and it receives no
rules. `fill_session_activities` sends no plan commitments, as before.

## Second recorded amendment to decision 5: the lock leaves

On 9 October 2026 the product owner removed Lock from the product. Nothing told
them what it meant, and its one job in a plan proposal was hypothetical: a
proposal only adds sessions and replaces none. The choice it stood for — "keep
this" or "this can be replaced" — is to be asked where a proposal is requested,
once a proposal can replace a session at all. That is not built and is not
decided here.

Decision 5 leaned on the lock in three places, and the owner decided each:

- **The lock state is no longer sent.** A plan commitment is `localDate`,
  `title` and `sport`. Decision 5's reasoning — an entry without its lock state
  leaves the coach unsure whether to plan around it or replace it — no longer
  applies, because the coach cannot replace an entry and nothing sets the flag.
  The plan prompt's "or a locked session" is removed with it.
- **Beyond the horizon: the entries no series rule describes**, in place of
  locked entries only. That is a single session, or an occurrence the owner
  edited or moved, up to the same 180 days ahead. This sends more than before:
  the title, sport and date of single sessions the owner did not lock. It is
  what delivers a race placed months out without a step nobody knew to take. An
  unchanged occurrence of a series out there is still not sent; the roadmap has
  its series as a rule, and for the plan operation it is the noise decision 5
  already names.
- **The fill order is rules, then dated entries nearest first.** Locked entries
  were fitted before both.

Both operations follow the same eligibility rule. `create_seven_day_plan` still
receives no rules; its list is the twelve nearest eligible entries.

That includes the window. Decision 5 says the forward window "should be longer
for `create_roadmap` than for `create_seven_day_plan`", and the tuning table
gives 180 days for the roadmap only. The code has used 180 days for both since
M3-02, which mattered little while the window carried locked entries alone. It
matters now: a plan request for one to seven days is also sent the title, sport
and date of single sessions up to 180 days out, within the same twelve entries.
The owner's decision of 9 October was stated for the planning range of either
operation, so that sentence of decision 5 is superseded rather than left to
contradict the code. A shorter window for the plan operation is one limit in
`context.ts` if it is ever wanted.

No limit changes: at most 12 entries and 6 rules inside the 1,400-byte
plan-commitment allocation, and no byte ceiling or token limit moves. Each
entry is about 17 bytes shorter for the field it no longer carries.

What this gives up, stated rather than discovered: nothing ranks one entry
above another. More single sessions than the list holds cut the furthest one,
so a race beyond a full fortnight of one-off sessions does not reach the coach
as a planned entry. And rules at their longest take the whole allocation: with
120-character titles, 80-character sports and every weekday, three rules fit
and no dated entry does. That was already so for an unlocked entry; a locked
one was the exception. A goal with a target date is always sent (ADR-012) and
is the dependable way to tell the coach about a race.

Unchanged: `fill_session_activities` sends no plan commitments, and the 180-day
window, which is also how far ahead a single session may be placed.

## Third recorded amendment to decision 5: a chosen first day

On 9 October 2026 the product owner decided that a plan and a roadmap may start
on a day they choose, from today to 30 days ahead, instead of always today.
Decision 5 was written for a horizon that begins today, and one sentence of it
needs saying again for one that does not.

- **Eligibility is unchanged.** Every planned entry from today to the last day
  being planned is still eligible, so the sessions between today and a later
  first day are sent. They are the load the athlete carries into those days.
- **The fill order changes.** The days being planned and everything after them
  come first, nearest first; the days before the first day follow, nearest
  first. Nearest first alone would let the sessions before a later first day
  fill the twelve entries and cut the very days the coach is asked about.

With the first day today, which is every request made before this amendment,
nothing is before it and the order is what it was. No field, limit or window
changes: the 56 days of history still end today, and the 180 days still count
from today.

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

**Amended 29 August 2026.** Decisions 2 and 4 changed when the product owner
made a completion owner-editable rather than append-only, withdrawing
`correction_reason` from the boundary. The section above records what changed
and what survives. Decision 2's outcome is unchanged and is now structural
rather than enforced by a head pointer; decision 4 loses one of its three
free-text fields and keeps the other two.

**Amended 2 October 2026.** Decision 5 changed for `create_roadmap`: a running
recurring series is sent once as a rule, and its ordinary occurrences leave the
dated list. The section above records what a rule carries, what stays dated,
and what is given up. Decisions 1, 3, 6 and 7 are unchanged.

**Amended 9 October 2026.** Decision 5 changed again when the product owner
removed Lock: the lock state is not sent, single sessions beyond the horizon
are, and nothing is fitted ahead of the rules. The second amendment above
records it. Decisions 1, 3, 6 and 7 are unchanged.

**Amended again 9 October 2026.** The owner may choose the first day being
planned. Decision 5's eligibility stands; its fill order puts the planned days
ahead of the days before them. The third amendment above records it.
