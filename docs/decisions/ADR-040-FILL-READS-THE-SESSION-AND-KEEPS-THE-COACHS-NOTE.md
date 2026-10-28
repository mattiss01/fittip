# ADR-040: A fill reads the session on screen, and a session keeps the coach's note

**Status:** accepted — the product owner decided it on 28 October 2026.

**Date:** 28 October 2026

**Ticket:** "Fill reads the session on screen and keeps the coach's note" in
[`docs/backlog/NEXT.md`](../backlog/NEXT.md)

**Builds on:** [ADR-020](ADR-020-SESSION-DETAIL-CONTEXT-ELIGIBILITY.md) decision 5 (what a
fill reads of its session) and its amendment for ADR-023. Amends what `sessionDetail` holds
and what a planned session stores.

## Context

The owner asked Fill with Coach for "a push session with a few activities", accepted the
answer, then asked "give me more exercises". The answer had forgotten it was a push day.

Two reasons. Accept only loads a suggestion into the editor, and nothing is stored until
Save session, but the coach read the session as last saved — the second ask saw the old,
empty list. And nothing of what the coach wrote survived an Accept except the activities:
every answered ask is stored in `session_activity_proposals` (the owner's note, the summary,
each activity with its reason, the safety notes), but nothing read it back, neither the
coach nor the owner once they had decided.

A per-session log of earlier asks was planned and then set aside by the owner in favour of
something on the session itself.

## Decision

1. **The ask carries the session as it is on screen.** The editor's rows and the coach's
   note field travel with the request. The rows are checked by `parseSubmittedActivities`,
   the validator a Save runs, so a list that would not save refuses before anything is
   claimed or paid for. They take the place of the saved ones in `sessionDetail.session`.
   The list's length joins the request fingerprint, as the note's length does, so a reused
   key with a different list conflicts rather than replays.
2. **A session keeps a coach's note** (owner's choice, 28 Oct 2026). `coach_note` on
   `rolling_plan_sessions` and `rolling_plan_series`, at most 1,000 characters. Accept
   writes the owner's note for that ask, verbatim as `Asked: "…"`, followed by the
   suggestion's summary into the form's "Coach's note" field; Save stores it with the rest.
   The owner edits or clears it like any other field. The prompt asks for the summary to
   say what the session is for, including what was asked, so earlier asks carry forward
   too. The example coach's answer writes no note.
3. **Each activity keeps the coach's reason.** `rationale` on `rolling_plan_activities`
   and `rolling_plan_series_activities`, at most 300 characters, carried into the editor
   with the accepted activities and removable per row. A saved session (a template) keeps
   none; an occurrence takes its series' note and reasons.
4. **The coach reads both.** `sessionDetail.session.coachNote`, and each of its own
   activities with its `rationale` cut to 160 characters. The current planning note wins
   where they differ. The session part of the context grows from 3,500 to 7,500 bytes; when
   it would overflow, the owner's note goes first, then the coach's note, then the intent.
5. **Both are visible.** The session page shows the coach's note and a "Why:" line under
   each activity; the edit form shows them where they can be changed.
6. **No spend change.** The fill's context total goes from 51,450 to 55,450 bytes,
   16,091 of the 20,000 input tokens at worst; a reservation is taken at the ceiling either
   way, and a call is charged for what it sends.

## Consequences

- Every function that writes or reads a planned session's fields was re-issued with the two
  keys added (`20261028141230_session_coach_note`), as start times were; every form that
  edits a session carries the note, so an edit made elsewhere does not clear it.
- The owner's note for the accepted ask is stored with the session and sent with every
  later ask for it, not only the one it was written for; the owner sees it as the first
  line of the coach's note and can edit or remove it there.
- An unsaved list can be asked about, and its suggestion is still only a draft beside it.
- The earlier asks themselves stay where they were, in `session_activity_proposals`, read
  by nothing new.
