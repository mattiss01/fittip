# What's next

The working list. One line per outcome; follow-ups found along the way become new lines
here rather than new documents. Merges are logged at the bottom.

States: `[ ]` not started · `[~]` in progress · `[x]` merged.

Lanes are defined in `CLAUDE.md`. A careful-lane item carries its constraints on the line
before any code is written.

## Now

1. `[x]` **Offline console assertion flake** — fixed by scoping the collector to the
   deliberate offline window, which stays open until the interrupted requests settle and
   their reports arrive. ([M3-22](M3/M3-22-OFFLINE-CONSOLE-ASSERTION-FLAKE.md))
2. `[x]` **Completion write follow-ups** — three fixes to the completion write path, shipped
   together on one forward migration to `apply_completion_change`.
   ([M3-23](M3/M3-23-COMPLETION-WRITE-FOLLOW-UPS.md))
   - **Wrong duplicate message.** The function already says "That session already has a
     completion", but raises it as `22023`, which the repository collapses into the generic
     validation error. Give that branch its own errcode and message, **and** add a
     by-session read so the form can say it before the owner fills anything in — today
     `CompletionLog.list` is bounded by `actual_local_date`, so a completion written on
     another day is invisible to the surface.
   - **Unplanned title and sport are permanent.** Admit an `activities` key on the edit
     branch when `plan_session_id` is null, replacing the list wholesale. The planned link
     stays immutable, and this must not grow into the general activity editor M3-15A
     described.
   - **Future dates.** Refuse an `actualLocalDate` after owner-local today for **every**
     completion, planned or not (owner's decision, 18 Sep 2026 — the argument doesn't depend
     on whether it was planned, and it is their data). Anchor it in the zone the completion
     stores, not the current profile zone. Add `max` on the date input so the owner is
     stopped before the round trip, but the rule lives in the write function: a check only
     the form performs is a courtesy, not a constraint.
   - Careful lane: forward migration only, pgTAP for the new branches, owner applies the
     migration and checks the Preview before merge.
3. `[ ]` **AI proposal application** — the core loop: a fresh Coach proposal composed with
   current plan content, per-item choices, direct plan edits, an atomic finish-review,
   discard, locks, and conflicts. Today Coach can propose but nothing can be applied.
   Careful lane, and the largest remaining item; expect to split it once its contract is
   written. ([M3-16](M3/M3-16-AI-PROPOSAL-APPLICATION.md))
4. `[ ]` **Reactivate a cancelled session** — a cancelled session can currently only be
   deleted; every non-destructive operation refuses it. Careful lane: it adds an operation to
   `apply_rolling_plan_change_set`. ([M3-20](M3/M3-20-REACTIVATE-A-CANCELLED-SESSION.md))

## Fix in passing

Not worth their own slot; do them when work lands nearby.

- Recurring scope fallback copy: the two whole-series controls explain their absence by
  naming the series end date, but the predicate also withholds them when the occurrence's
  rule date has fallen behind today, and the remove-mode string asserts a lock its branch
  does not require. ([M3-21](M3/M3-21-RECURRING-SCOPE-FALLBACK-COPY.md))
- Network tripwire coverage: the coaching tripwire claims a complete root list but does not
  watch `src/server/completions` or `src/server/rolling-plan`. Neither holds a network
  primitive today, so this is a control overstating its coverage.
  ([M3-25](M3/M3-25-NETWORK-TRIPWIRE-COVERAGE.md))

## Later

- **Plan change history** — plan history organized by understandable changes, each opening to
  show affected sessions and their before/after values. Real, but a comfort feature; the
  tables are already granted and RLS-confined. ([M3-24](M3/M3-24-PLAN-CHANGE-HISTORY.md))

## Dropped

- **M3-17 final rolling-plan closeout** — it existed to reconcile evidence for the old
  delivery protocol. With validation records gone it has no content left.
- **M3-03B plan regeneration** and **M3-03D on-demand session detail** — pre-F-005 drafts
  that were already marked "rewrite before dispatch". They stay as ideas, not commitments.

## Known limitations

- **Correcting an unplanned log's title replaces its activity list wholesale.** Today that
  list is always exactly one bare activity, so nothing is lost. If a completion ever holds
  more than one, or one carrying a personal-activity link or a measurement, a rename would
  discard the rest. Pre-existing to the M3-23 work, which only made renaming possible.
- **M3-15B's accepted browser flow was rewritten** on 18 Sep 2026 (`cf33bb6`): it asserted the
  read-only title and sport that M3-23 replaced. Its validation record still describes the
  surface as it shipped then, which is what a record is for.

## Log

| Date | Commit | CI | What |
| --- | --- | --- | --- |
| 18 Sep 2026 | `d46a5be` | [35364797638](https://github.com/mattiss01/fittip/actions/runs/35364797638) | Completion write follow-ups: PT431 for a duplicate, correctable unplanned naming, no future-dated completion. Migration `20260918132941` applied to the founder project — 22 migrations, no drift, advisors unchanged at 14 definer + 1 auth warning. Reviewed twice; the first pass was blocking. Two notes below |
| 18 Sep 2026 | `e9173cc` | (same run) | ADR-018: the lead applies founder-staging migrations. Bundled onto the ticket branch rather than committed separately, which is worth avoiding next time |
| 18 Sep 2026 | `6fe22ee` | [35333826198](https://github.com/mattiss01/fittip/actions/runs/35333826198) | Offline console flake: shared `e2e/support/console-errors.ts`, both specs on it, 9 unit tests. One green run cannot prove a race is gone; the claim rests on the mechanism |
| 18 Sep 2026 | `d7bca77`, `f08c1a8` | [35331668491](https://github.com/mattiss01/fittip/actions/runs/35331668491) | Dropped the Codex config and the old delivery protocol: one working agreement in `CLAUDE.md`, two lanes, this list |
