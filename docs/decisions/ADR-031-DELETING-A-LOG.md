# ADR-031: Deleting a log

**Status:** accepted — the product owner decided it on 7 and 16 October 2026.

**Date:** 16 October 2026

**Ticket:** "Delete a log" in [`docs/backlog/NEXT.md`](../backlog/NEXT.md)

**Builds on:** [ADR-013](ADR-013-AI-TRAINING-HISTORY-ELIGIBILITY.md) decision 3 (a
deleted record reaches no provider). It changes a product invariant and a privileged function, which is
why it is recorded.

## Context

A log could be created and corrected but never removed. `CLAUDE.md` called completions
permanent records, and a correction overwrites the row in place under its `revision`, so
there was no way to take back a log written by mistake: a session logged twice in a
hurry, a skip logged ahead for a session that then happened, training logged on the wrong
day. A logged session is also settled (7 October 2026): it cannot be edited, moved or
planned over while a log names it, so a wrong log held its session too.

The owner asked on 7 October 2026 for a log to be deletable, which frees its session.

## Decision

1. **Any log can be deleted**: planned or unplanned, any date, whatever its outcome. The
   rule is the same everywhere, and the confirmation says what goes.
2. **Deleting really deletes.** The log and its activities are removed in one
   transaction. Nothing is kept: no hidden row, no tombstone, no undo. A deleted log
   reaches no coach call, no summary and no Progress figure, which is ADR-013 decision 3
   already.
3. **What was replaced goes with what replaced it.** A planned session logged "Replaced"
   points at the unplanned training done instead. Deleting that unplanned log also
   deletes every Replaced log pointing at it, so those sessions are free again too.
   Deleting a Replaced log on its own leaves the unplanned training it pointed at.
4. **It is one more operation of `apply_completion_change`**, `delete`, answering to the
   revision the owner last read, under the same row lock and the same `PT409` an edit
   gets. A log that is gone, or another owner's, is reported the same way: it changed.
   `authenticated` still holds no `DELETE` on `completions`; the definer function is the
   only path.
5. **A freed session is simply not logged.** No rule about sessions changes: the settled
   rule tests for a log naming the session, so with none it no longer applies. A past
   session without a log reads as not logged, which is now true.

## Consequences

- The product invariant reads: plans, proposals and completions are separate records,
  and a log is removed only when the owner deletes it, never as a side effect.
- Coach proposals record the logs they read by id (`*_proposal_sources`). Those ids stay
  and point at nothing; nothing reads them back as content. A roadmap proposal still open
  when a log it read is deleted stays acceptable since ADR-032; from this decision until
  that one, the same day, it was refused as after an edit. Plan and fill proposals compare nothing (the open "A fill's
  sources are recorded and never checked" item).
- What a proposal already holds stays as it was. Its rationale or suggested sessions may
  reflect a log since deleted; nothing rewrites them, and a plan or fill proposal built
  from one can still be accepted. Only the log's own content is gone, and from then on
  no coach call reads it.
- A deletion cannot be undone, by the owner or by us. The confirmation is the only guard,
  so it names every log that goes.
- The names are those read when the edit page opened. Linking another planned session to
  the same training does not change that log's revision, so a Replaced log linked in a
  second tab after the dialog was read is deleted with it unnamed. It needs the same owner
  in two tabs at once; making the link bump the revision would close it, at the cost of
  an edit of that training open elsewhere being refused.

## Alternatives considered

- **Only a skip logged ahead.** The case that prompted the request, but the owner chose
  one rule for every log.
- **Hide the row and keep it.** Undoable, but the data would never really go, and every
  read would need to leave it out. Declined: a delete should mean what it says.
- **Refuse while a Replaced log points at it**, or **unlink and keep the Replaced logs**.
  Declined for deleting both: the owner reads "what I did instead" and "what it replaced"
  as one record of one day.
