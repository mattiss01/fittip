# What's next

The working list. One line per outcome; follow-ups found along the way become new lines
here rather than new documents. Merges are logged at the bottom.

States: `[ ]` not started · `[~]` in progress · `[x]` merged.

Lanes are defined in `CLAUDE.md`. A careful-lane item carries its constraints on the line
before any code is written.

## Now

1. `[ ]` **Offline console assertion flake** — two browser specs collect console errors for
   the whole test and then go offline inside it, so an App Router prefetch caught in the
   ~62 ms window fails the run at random. First, because a gate that fails at random is
   worse than no gate, and CI is now the main safety net. Test-only.
   ([M3-22](M3/M3-22-OFFLINE-CONSOLE-ASSERTION-FLAKE.md))
2. `[ ]` **Completion write follow-ups** — a duplicate log is refused with the wrong reason,
   and an unplanned log's title cannot be corrected after it is written. Careful lane: both
   change the accepted `apply_completion_change` and need a forward migration. Open question
   for the owner: whether the title fix justifies a migration, and whether the two ship
   together. ([M3-23](M3/M3-23-COMPLETION-WRITE-FOLLOW-UPS.md))
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

## Log

| Date | Commit | CI | What |
| --- | --- | --- | --- |
| 18 Sep 2026 | `d7bca77`, `f08c1a8` | [35331668491](https://github.com/mattiss01/fittip/actions/runs/35331668491) | Dropped the Codex config and the old delivery protocol: one working agreement in `CLAUDE.md`, two lanes, this list |
