# What's next

What is open, not what has happened. Follow-ups found along the way become new lines here
rather than new documents, and a merged item's block is deleted by the merge that ships it —
its log row at the bottom becomes the record. `CLAUDE.md` has the four retention rules and
what they cost.

States: `[ ]` not started · `[~]` in progress. There is no merged state; a merged item is
gone from here.

Lanes are defined in `CLAUDE.md`. A careful-lane item carries its constraints on the line
before any code is written.

## Now

1. `[ ]` **Plan proposal memory candidates** — M3-16A deliberately did not rebuild
   `record_plan_memory_candidates`, so a planning note that states a durable constraint
   proposes nothing on the memory surface. The roadmap path already does this; the plan
   path should too. Careful lane: a new privileged function.

2. `[ ]` **Live plan proposals and the spend ledger** — two gaps the M3-16A re-review found,
   both shared with the roadmap and harmless while the coach is fixture-only. `finish_*`
   refuses a live result whose reservation is unsettled, but `coach-ai-service.ts` treats
   settling as best effort, so a paid proposal is lost if the settle fails. And nothing makes
   `spend_reservation_id` unique, so an owner calling the RPCs directly can attach one
   reservation to several proposals. Settle before any live-provider ticket. Careful lane.

## Fix in passing

Not worth their own slot; do them when work lands nearby.

- Recurring scope fallback copy: the Edit panel explains a missing whole-series scope as
  "outside the active dates of its ended series", but the predicate also withholds it when
  the rule date has fallen behind today. M3-20 rewrote the Delete panel's version; Edit's
  remains. ([M3-21](M3/M3-21-RECURRING-SCOPE-FALLBACK-COPY.md))
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
- **The plan context has no headroom left.** M3-16B spent it: prefix 7,400 + wrapper 64 +
  context 32,500 estimates 9,991 tokens against a 10,000 ceiling. The next source, or a longer
  prompt, takes bytes from an existing source or raises `maxInputTokens` — and the second is a
  standing spend increase, because a reservation charges the ceiling before every live call
  whether or not the extra room was used.
- **A superseded roadmap is named only by version.** When the owner accepts a new roadmap after
  a proposal was made, review says which version the proposal was planned under and that it has
  been replaced, but cannot describe it: the content of a superseded version is still stored,
  and reading it back for display was not in this slice.

## Log

| Date | Commit | CI | What |
| --- | --- | --- | --- |
| 22 Sep 2026 | `49386f9` | [35712107521](https://github.com/mattiss01/fittip/actions/runs/35712107521) | Reactivate a cancelled session (M3-20), and a deleted series occurrence stays deleted, closing M3-19 limitation 1; from the owner's review, a logged cancelled session reads as logged, occurrence Delete offers only-this or all-future (moved from Cancel, so the accepted m3-14b and m3-15b flows were rewritten), and only an edit marks "Changed" (ADR-017 amended; flags recomputed, so older change-entry states may still say `hasDiverged: true`). Migration `20260921214230` applied to the founder project — 25 migrations, advisors unchanged at 19 definer + 1 auth |
| 20 Sep 2026 | `5971b48` | [35507313220](https://github.com/mattiss01/fittip/actions/runs/35507313220) | Review against the real plan (16B): the coach reads the accepted roadmap as a fixed reduced shape, a planned session is editable inside review, and the surface names what moved. Migration `20260920102905` applied to the founder project — 24 migrations, advisors unchanged. Review found one blocking defect: the reduction ladder confused UTF-8 bytes with the UTF-16 units the validator bounds, which would have refused every plan generation |
| 19 Sep 2026 | `63e58d3` | [35435242207](https://github.com/mattiss01/fittip/actions/runs/35435242207) | Plan proposal core loop (16A): ask the fixture coach, decide per item, apply staged items atomically through `apply_rolling_plan_change_set`. Migration `20260918161313` applied to the founder project — 23 migrations, advisors +5 definer. Reviewed twice; the first pass found two blocking defects |
| 18 Sep 2026 | `d46a5be` | [35364797638](https://github.com/mattiss01/fittip/actions/runs/35364797638) | Completion write follow-ups: PT431 for a duplicate, correctable unplanned naming, no future-dated completion. Migration `20260918132941` applied to the founder project — 22 migrations, no drift, advisors unchanged at 14 definer + 1 auth warning. Reviewed twice; the first pass was blocking. Two notes below |
| 18 Sep 2026 | `e9173cc` | (same run) | ADR-018: the lead applies founder-staging migrations. Bundled onto the ticket branch rather than committed separately, which is worth avoiding next time |
| 18 Sep 2026 | `6fe22ee` | [35333826198](https://github.com/mattiss01/fittip/actions/runs/35333826198) | Offline console flake: shared `e2e/support/console-errors.ts`, both specs on it, 9 unit tests. One green run cannot prove a race is gone; the claim rests on the mechanism |
| 18 Sep 2026 | `d7bca77`, `f08c1a8` | [35331668491](https://github.com/mattiss01/fittip/actions/runs/35331668491) | Dropped the Codex config and the old delivery protocol: one working agreement in `CLAUDE.md`, two lanes, this list |
