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

**Activities in training.** The owner named this on 24 Sep 2026. A session can now hold
activities and the editor writes them; what is left is everywhere else they should appear.
The live tables are `rolling_plan_activities` and `completion_activities`; M3-11 dropped
M1's `planned_activities` and `completed_activities`, and `personal_activities` survived
that reset untouched.

Ordered by dependency. A lane is named where it is not the build lane.

- [ ] **A5 — Personal activity library.** Create, list, edit and archive reusable
      definitions, and a picker in A2 that sets `personal_activity_id` — the only thing that
      ever will. Carries F-002's rule that an edit changes future reuse and never a
      historical snapshot. Lives under `/home/plan`, beside the session library (owner, 26 Sep
      2026). Sport-or-category stays deferred, so it keeps today's `sport`.
      The editors' `ActivityValue` and the Plan and library page views carry no
      `personalActivityId`, so once A5 sets it, any edit would write it back as null — carry
      it through all three editors in the same change.
- [ ] **Log from the library.** Asked by the owner on 26 Sep 2026: an unplanned log starts
      from a saved session — its name, sport and activities prefilled, then changed — and an
      activity row starts from a library activity (A5), for training that is routinely the
      same but never planned. Copies by value, as the Plan's reuse does. The saved-session
      half can start now that A6 made library activities editable.
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

- A hand-made RPC payload with `position` or `plannedPosition` of `1.0` reaches
  `apply_completion_change` as a raw `22P02` rather than `22023`: the validators compare with
  `trunc`, the inserts cast the text. Unreachable from the app, whose parser emits integers.
  Map `invalid_text_representation` in the handler next time the function is replaced.
- Sign-in offers a dead link. `auth-form.tsx` links to `/signup`, and `proxy.ts` redirects
  `/signup` back to `/` whenever the runtime policy is `founder-staging` — so on the founder
  environment the link always bounces to where it started. The redirect is right: production
  is owner-only, not a public launch (ADR-005, ADR-007). The link is what is wrong, and it
  should be hidden under the same condition rather than the redirect being softened. Reported
  by the owner on 25 Sep 2026. Found on 26 Sep that it already is — `page.tsx` has passed
  `allowSignUp={policy.mode === "local"}` since `21e6841`, with a test — so what the owner saw
  is still to be established before anything changes.

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

- **Sport or category — undecided.** Moved here by the owner on 25 Sep 2026, who could not
  decide yet; this replaces A2d, which planned to rename an activity's `sport` to `category`.
  Where the discussion stood: the owner leans to **one field, the same on sessions and
  activities**, whose values may be a sport (Tennis, Running) or a kind of work (Strength,
  Mobility, Recovery). "Category" reads right for both kinds of value, where "Sport:
  Mobility" does not. That field already exists — it is today's `sport` — so the cheap
  version is a relabel plus presets and the owner's own past values offered back, with no
  migration. The expensive version also renames the column across about seven tables and
  functions, the AI contract, and reads of stored snapshots, which keep `sport` forever.
  Open: which of the two, the preset list (it is shared vocabulary, so it wants the owner's
  agreement and a line in `CONTEXT.md`), and whether an activity keeps starting from its
  session's value, which is right under the one-field reading. A5 builds on whatever this
  becomes.
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
| 26 Sep 2026 | `5bbc61b` | [36239355367](https://github.com/mattiss01/fittip/actions/runs/36239355367) | A Progress record has Edit log, which opens the one log editor and returns to that record rather than to Today; `from=progress` is matched against a fixed value and the destination is built from the record's id. No migration |
| 26 Sep 2026 | `49a639e` | [36238154474](https://github.com/mattiss01/fittip/actions/runs/36238154474) | Choosing Extra on a planned log removes "What happened": extra training is written as unplanned and can only have happened. Picking "Instead of" brings it back. No migration |
| 26 Sep 2026 | `6a0a81a` | [36237171196](https://github.com/mattiss01/fittip/actions/runs/36237171196) | A planned session logged as trained on another day asks "instead of it, or extra?" (owner, 26 Sep): instead links it, and its planned day then reads "Completed on Tue 29 Sep" on the Plan and as logged on Today; extra saves unplanned training and leaves it open (a partial becomes plain unplanned, owner's call). A skip or replacement written ahead, or a log on its own day, keeps its card. No migration; the Plan reads its window's logs in one query. m3-19's accepted refusal step now logs a skip written ahead, since a completed one no longer offers Delete |
| 26 Sep 2026 | `2bfb490` | [36234950571](https://github.com/mattiss01/fittip/actions/runs/36234950571) | A library entry's activities can be edited: the Edit form carries the Plan's editor and replaces the list whole, and the card lists targets (A6). Migration `20260926093859` applied to the founder project — 33 migrations, advisors unchanged at 20 definer + 1 auth; it replaces `apply_saved_session_change` in place, where a null list keeps the stored one, so the previous app's edits still work. m3_13's pgTAP "an edit carries no activity list" was inverted on purpose, and m3-13's accepted flow was rewritten to read the card's activity list and find the entry's Name by its form name |
| 26 Sep 2026 | `b4b0ca3` | [36232864562](https://github.com/mattiss01/fittip/actions/runs/36232864562) | A recurring series keeps the activities its editor shows — creating one had sent `[]`, and both edit scopes opened empty, so "only this" erased an occurrence's list (A6, series half; no migration). Recurring edit is one form ending in two buttons, filled from the occurrence (owner's call), with Enter disabled so a scope is never chosen by a keystroke; set groups drag and arrow-key into order; Create session closes after a save. m3-14b's accepted flow was rewritten to find the fields through the shared form, and the Edit panel's withheld-scope copy (M3-21) was fixed on the way |
| 26 Sep 2026 | `55137f0` | [36229324811](https://github.com/mattiss01/fittip/actions/runs/36229324811) | The `.retry(false)` rule names the six `apply_*_change` RPCs instead of two that M3-11 dropped, and `CLAUDE.md`'s pitfall stops saying "two". No code change |
| 25 Sep 2026 | `3430435` | [36184425816](https://github.com/mattiss01/fittip/actions/runs/36184425816) | The Plan day and Today list a session's activities with their targets instead of counting them, a logged card lists what was done (or still the plan's, when a skip or a replacement records none), Progress's recorded sheet lists the actuals, and a ride that replaced sessions says "Instead of: …" (A3, A4e). No migration. m3-13's accepted flow was rewritten where it read "N activities" on a plan card; the library card still prints its count |
| 25 Sep 2026 | `c41beb3` | [36172504470](https://github.com/mattiss01/fittip/actions/runs/36172504470) | A replaced session now points at the unplanned log of what was done instead — written in the same save through a recursive `apply_completion_change`, so both or neither, or picked from the week's logs — and one ride may replace several sessions; the coach reads "Replaced by …" in the existing description slot. Migration `20260925174607` applied to the founder project — 32 migrations, advisors unchanged at 20 definer + 1 auth; it redefines `completions_replacement_check` under the same name, admitting a link in place of text, and a replaced create from the previous app with only text is refused until the deploy |
| 25 Sep 2026 | `0ab1c3f` | [36164580894](https://github.com/mattiss01/fittip/actions/runs/36164580894) | Every log owns its `title`/`sport` (unplanned ones backfilled from their first activity) and a planned log's actuals, each linked to the planned activity it answers by `planned_position`, are corrected with the create editor; it also fixes A2c's four activity validators refusing `unmeasured`, which had broken both the plan editor and logging. Migration `20260925162039` applied to the founder project — 31 migrations, advisors unchanged at 20 definer + 1 auth; the m3_23 pgTAP and contract assertions refusing a planned log's actual edit were inverted on purpose, and renaming no longer rewrites an unplanned log's activity list, so that limitation is gone |
| 25 Sep 2026 | `6b7b7ef` | [36121793569](https://github.com/mattiss01/fittip/actions/runs/36121793569) | A planned log now records each activity's actual: prefilled from its target, measured in its own mode, with activities addable and drag-ordered, so `position` is the log's order rather than the plan's. No migration; correcting those actuals after saving is A4c, because `apply_completion_change` refuses it. m3-15b and m3-15c pick the outcome from a select now, not radios |
| 25 Sep 2026 | `cf53091` | [36114024850](https://github.com/mattiss01/fittip/actions/runs/36114024850) | Activities in a session, which nothing in FitTip could hold before: the rolling plan has taken the list since M3-10 and every caller passed `[]`. A drag-ordered editor writes them, an edit replaces the whole list, and the payload names no `position` or `isLocked` — the array's order is the position, and a lock guards nothing while replanning cannot reach a session at all. Migration `20260925074117` applied to the founder project — 30 migrations, advisors unchanged at 20 definer + 1 auth. It widens only: `sets_reps_load` gained a grouped form so a squat that ramps is one activity, `duration_intensity` requires only its minutes, and a sixth mode `unmeasured` lets a tennis drill stop claiming to be counted in sets. The flat shape stays valid because `is_valid_training_measurement` does not guard `completions.planned_snapshot`, so a measurement sealed into history must stay readable. pgTAP caught a NULL-returning branch that a check constraint would have read as passing; CI caught a move that sent an edit changing nothing beside it, which the database refused as a pair |
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
