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

**Activities in training.** The owner named this on 24 Sep 2026. The domain stack is built
and nothing reaches it: `RollingPlanActivityInput` carries name, sport, instructions,
measurement mode, target and lock, `apply_rolling_plan_change_set` takes it, `completion-log`
accepts an actual measurement per activity — and `actions.ts` passes `activities: []` on
every add, so `rolling_plan_activities` is empty in practice. The coach cannot fill it
either: the plan schema is session-level by design (`contracts.ts`, "carries no
activities"). F-002 step 6 and its "activity results" step are accepted requirements that
were never built. The live tables are `rolling_plan_activities` and `completion_activities`;
M3-11 dropped M1's `planned_activities` and `completed_activities`, and `personal_activities`
survived that reset untouched.

Decided by the owner on 24 Sep 2026, before A2 is written:

- **Reordering is drag.** Not up/down controls.
- **The surface designs for ten activities a session.** The contract's fifty stays the hard
  bound; no second limit is added to diverge from it.
- **No per-activity lock in the surface.** A2 writes `isLocked: false` on every activity.
  Replanning cannot reach an existing session to begin with: a finished review builds only
  `add` and `set_recovery_day`, and F-005 retired Coach-driven replacement without
  replacement. The column stays in the change-set contract, unused, and whichever ticket
  ever approves Coach-driven replacement owns its UI.

Ordered by dependency. A lane is named where it is not the build lane.

- [ ] **A1 — Measurement input and display.** One mode selector and per-mode fields for the
      five modes in `training-measurements.ts`, plus a formatter that renders a target or an
      actual as words. A2, A3 and A4 all need it; building it inside the first of them and
      extracting later would mean writing it twice at 390px.
- [ ] **A2 — Add and edit activities in a planned session.** `session-fields.tsx` grows a
      drag-ordered activity list: name, sport, instructions, mode, target. No lock control.
      Fills the list `actions.ts` currently carries through untouched. F-002 step 6.
- [ ] **A3 — See the activities.** Today and the Plan day render the list instead of the
      `activityCount` string. `completion-record.tsx` already renders one; follow it.
- [ ] **A4 — Log what you actually did.** The log form offers each planned activity beside
      its target and takes the actual. The server already accepts it; only the surface is
      missing. F-002 "Record actual training" step 3.
- [ ] **A5 — Personal activity library.** Create, list, edit and archive reusable
      definitions, and a picker in A2 that sets `personal_activity_id` — the only thing that
      ever will. Carries F-002's rule that an edit changes future reuse and never a
      historical snapshot. Needs a route under `/home/you` or `/home/plan`; owner's call.
- [ ] **A6 — Series templates and saved sessions carry activities.** Careful lane, and a
      direct consequence of A2 rather than a tidy-up. `saved_sessions`' write function takes
      `p_activities` on create and has no such parameter on edit — it *refuses* one, which
      `saved-session-repository.ts` documents as "nothing can edit a saved session's
      activities yet". Harmless while every saved session is empty; the moment A2 makes
      Save to library carry real activities, the library becomes the one surface that shows
      activities and cannot change them, enforced in SQL. Needs a forward migration for the
      edit path, plus the surface. `series-actions.ts` passes `[]` as `actions.ts` does, and
      the library prints `name · sport` with no target.
- [ ] **A7 — The coach fills in a session's activities.** Careful lane: a new AI operation
      with its own schema, spend, and context cost — the M3-03D detail operation that
      `contracts.ts` defers to. Blocked on the plan context having no headroom left, which
      `Known limitations` records. Needs the owner's decision before any code.
- [ ] **A8 — Do targets and actuals reach the coach?** Careful lane: today only
      `activityNames` crosses the boundary. Extending that is an ADR-013 eligibility
      decision and costs context bytes there are none of. Decide after A4 has produced real
      data; it may be that names remain enough.
- [ ] **A9 — Progress over measurements.** Load, distance and pace across completions, once
      A4 has been used for long enough to have any. The comfort layer; last on purpose.


## Fix in passing

Not worth their own slot; do them when work lands nearby.

- Recurring scope fallback copy: the Edit panel explains a missing whole-series scope as
  "outside the active dates of its ended series", but the predicate also withholds it when
  the rule date has fallen behind today. M3-20 rewrote the Delete panel's version; Edit's
  remains. ([M3-21](M3/M3-21-RECURRING-SCOPE-FALLBACK-COPY.md))
- `regeneratePlanProposalAction` has no test of its own, and it is the orchestration that
  implements two of the owner's decisions: closing the review before asking again, and
  keeping what was accepted. The pgTAP proves the database half; nothing exercises the
  action's ordering or its failure messages.
- "Only what you did not take" is a prompt-level expectation, not an enforced one. Accepted
  days reach the coach as plan commitments, but nothing stops it proposing on a day the
  owner already took — they would simply see it and decide again. Worth either enforcing or
  softening the copy, which currently states it as fact.
- A swallowed memory batch hides why it failed. Both generation paths catch the candidate
  batch's error and return zero, so a coach that invented an excerpt (`22023`) is
  indistinguishable from a genuine conflict (`PT409`), and neither is logged. Logging the
  error *code* — never the content, ADR-010 decision 15 — would cost nothing and would be the
  only signal if the TypeScript and SQL owner-text normalizers ever skew, which
  `src/server/ai/owner-text.ts` warns they must not. Do both paths together; one alone makes
  them differ for no reason.
- The roadmap's memory copy says "1 item ... are waiting". `roadmap-records.ts` pluralizes the
  noun but not the verb. The plan panel's own copy was written correctly, so the two now
  differ; fix the roadmap's when work lands near it.
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

- **An unsettled reservation holds its budget for good, and nothing reports one.** ADR-019
  stopped expiry forgiving a charge we failed to record, which is the right direction for a
  ceiling but removes the release the 15-minute TTL was introduced to guarantee. Three paths
  strand a reservation nobody can settle: a settle RPC that fails, a `reserve_ai_spend` the
  client retried after the insert committed (the orphan's token never reaches the
  application), and a receipt `toHandle` refuses as malformed. Each costs 8,000 micro-USD
  against a 2,000,000 daily and 20,000,000 lifetime ceiling — 0.4% of a day, 0.04% of the
  project's life — so it takes 250 in a day or 2,500 ever to lock coaching out entirely.
  Far outside single-athlete traffic, but it accumulates permanently and no surface shows it.

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
| 24 Sep 2026 | `9a79a0d` | [36006993308](https://github.com/mattiss01/fittip/actions/runs/36006993308) | Plan regeneration, revived from Dropped: a proposal that is not what the owner wanted goes back with a note saying why, the coach sees both the note and the proposal it replaces, and whatever the owner already accepted is applied first so the new plan covers only what they did not take. No context ceiling was raised — a real plan context is 8,589 bytes of the 32,500 pool — but the plan's `previousProposal` allocation went 2,200 to 6,400, because it held the roadmap's number and a legal worst-case plan reduces to about 5,800. Migration `20260924102713` applied to the founder project — 29 migrations, advisors unchanged at 20 definer + 1 auth. Review found three blocking faults on one seam: the action closes the proposal before anything that can fail, and every later failure claimed nothing was written. Fixed, along with a feedback bound that accepted 1,000 characters the context refuses over 500, and a chain cap that counted from whichever proposal the caller named and so never bound |
| 24 Sep 2026 | `11139d5` | [35978290689](https://github.com/mattiss01/fittip/actions/runs/35978290689) | Both finishes now settle an open spend reservation themselves, in the transaction that inserts the proposal, at the amount it was holding — so a settle that failed can no longer throw away a result the provider was paid for, which was unrecoverable because the claim stays pending under that key. Beside it, an unsettled reservation counts against the ceilings for good instead of falling to zero on expiry, which covers the failed-call path the first half cannot reach. ADR-019 records both and what was rejected; `reserve_ai_spend` and the two finishes were replaced from their live definitions, so every grant is restated after a full revoke. m3_01b's “an expired reservation no longer holds budget” is inverted on purpose, at the same 5,000 figure that flips. Migration `20260924082758` applied to the founder project — 28 migrations, advisors unchanged at 20 definer + 1 auth. Review found no defect but two of my assertions proved less than they claimed; fixed in the same branch, and the standing cost is now a known limitation |
| 23 Sep 2026 | `dd7b68d` | [35910418730](https://github.com/mattiss01/fittip/actions/runs/35910418730) | A planning note that states a durable constraint now proposes it: `record_plan_memory_candidates` is back with M3-03's signature, `generatePlanProposal` records the batch after the proposal commits and swallows its failure, and the proposal page says how many are waiting. ADR-010 gained decision 16 first, on its own branch (`4826786`), naming every route allowed to create `inferred_proposed` memory and the two limits none may skip. M3-11's suite asserted this function stays dropped, so those two assertions now assert the reach instead — the precedent that file already set for `plan_content_is_valid`. Migration `20260923191214` applied to the founder project — 27 migrations, advisors 20 definer + 1 auth, the one new definer being this route. Review found nothing blocking; the panel itself has not been seen at 390px |
| 23 Sep 2026 | `80cf78f` | [35894277478](https://github.com/mattiss01/fittip/actions/runs/35894277478) | One settled spend reservation now pays for exactly one proposal: both `plan_proposals_spend_idx` and `roadmap_proposals_spend_idx` are unique, the roadmap one exempting `owner_edit` rows, which copy their source's reservation deliberately and would otherwise have made a paid roadmap uneditable. Migration `20260923165201` applied to the founder project — 26 migrations, advisors unchanged at 19 definer + 1 auth. The index built without conflict, which is the evidence that no existing row held a duplicate; review found nothing blocking |
| 22 Sep 2026 | `49386f9` | [35712107521](https://github.com/mattiss01/fittip/actions/runs/35712107521) | Reactivate a cancelled session (M3-20), and a deleted series occurrence stays deleted, closing M3-19 limitation 1; from the owner's review, a logged cancelled session reads as logged, occurrence Delete offers only-this or all-future (moved from Cancel, so the accepted m3-14b and m3-15b flows were rewritten), and only an edit marks "Changed" (ADR-017 amended; flags recomputed, so older change-entry states may still say `hasDiverged: true`). Migration `20260921214230` applied to the founder project — 25 migrations, advisors unchanged at 19 definer + 1 auth |
| 20 Sep 2026 | `5971b48` | [35507313220](https://github.com/mattiss01/fittip/actions/runs/35507313220) | Review against the real plan (16B): the coach reads the accepted roadmap as a fixed reduced shape, a planned session is editable inside review, and the surface names what moved. Migration `20260920102905` applied to the founder project — 24 migrations, advisors unchanged. Review found one blocking defect: the reduction ladder confused UTF-8 bytes with the UTF-16 units the validator bounds, which would have refused every plan generation |
| 19 Sep 2026 | `63e58d3` | [35435242207](https://github.com/mattiss01/fittip/actions/runs/35435242207) | Plan proposal core loop (16A): ask the fixture coach, decide per item, apply staged items atomically through `apply_rolling_plan_change_set`. Migration `20260918161313` applied to the founder project — 23 migrations, advisors +5 definer. Reviewed twice; the first pass found two blocking defects |
| 18 Sep 2026 | `d46a5be` | [35364797638](https://github.com/mattiss01/fittip/actions/runs/35364797638) | Completion write follow-ups: PT431 for a duplicate, correctable unplanned naming, no future-dated completion. Migration `20260918132941` applied to the founder project — 22 migrations, no drift, advisors unchanged at 14 definer + 1 auth warning. Reviewed twice; the first pass was blocking. Two notes below |
| 18 Sep 2026 | `e9173cc` | (same run) | ADR-018: the lead applies founder-staging migrations. Bundled onto the ticket branch rather than committed separately, which is worth avoiding next time |
| 18 Sep 2026 | `6fe22ee` | [35333826198](https://github.com/mattiss01/fittip/actions/runs/35333826198) | Offline console flake: shared `e2e/support/console-errors.ts`, both specs on it, 9 unit tests. One green run cannot prove a race is gone; the claim rests on the mechanism |
| 18 Sep 2026 | `d7bca77`, `f08c1a8` | [35331668491](https://github.com/mattiss01/fittip/actions/runs/35331668491) | Dropped the Codex config and the old delivery protocol: one working agreement in `CLAUDE.md`, two lanes, this list |
