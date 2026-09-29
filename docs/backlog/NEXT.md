# What's next

What is open, not what has happened. Follow-ups found along the way become new lines here
rather than new documents, and a merged item's block is deleted by the merge that ships it —
its row in the year's log ([`LOG-2026.md`](LOG-2026.md)) becomes the record. `CLAUDE.md` has
the four retention rules and what they cost.

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

- [ ] **A7-5 — Size the fill before its first live run.** Measure output tokens on a
      twelve-activity answer: the grammar pads each target with fourteen nullable keys
      against a 3,000-token ceiling. Needs a provider key, so it waits for one; each run
      is paid and needs the owner's approval of the call count.
- [ ] **A8 — Targets and actuals in the plan context.** Careful lane. ADR-020 made them
      eligible, so this is only a sizing question now: the plan context has no headroom
      (`Known limitations`). Decide after A7, which may make it unnecessary.
- [ ] **A9 — Progress over measurements.** Load, distance and pace across completions, once
      A4 has been used for long enough to have any. The comfort layer; last on purpose.
      Open for the owner first: a row picked from the library and then changed keeps its
      `personal_activity_id` until it is saved as a new definition, so grouping history by
      definition would count "picked Latzug, renamed Stabwurf" as Latzug.
- [ ] **Make Lock understandable.** Owner, 29 Sep 2026: nothing tells the owner what Lock
      means or why they would use it. Today it means "later planning must not move or
      replace this" (`CONTEXT.md`): the coach's replanning and a series' "delete this and
      all future" keep a locked session, and the owner's own edits are never blocked. Open
      for the owner: say it where Lock is chosen, rename it (e.g. "Keep as planned"), or
      rethink what it protects. Decide before the coach can replan live, which is when it
      starts to matter.

**App redesign in the Coach's note direction.** The owner chose it on 29 Sep 2026 from three
Today prototypes (`prototype/today-design`, `/prototype/today?variant=C`): FitTip's pine and
ember with a modern sans (Schibsted Grotesk, DM Mono for small labels), icon nav, a scrollable
day strip, the coach's one-line reason, session cards that fold into a receipt once logged, and
bottom sheets instead of new pages. Less text: each screen is a heading, the content and one
main action. No week ring. The owner flagged a possible bias toward the look they already know,
so start with Today and adjust from there rather than committing every screen up front. Build
lane, one screen per merge.

- [ ] **R3a — Plan, week by week.** Owner chose variant B of the Plan prototype on
      29 Sep 2026 (`prototype/plan-horizon`, `/prototype/plan?variant=pager`): one week at a
      time with ‹ › arrows, the roadmap phase for that week above it, a row of week tiles
      (busy-day bars, planned hours) to jump, empty days as one line with a "+", compact
      session cards coloured by sport with ↻ for a series, and the header's links as chips.
      Works on today's 14-day window first. Every day from today on has a "+" in the same
      place, empty or not, opening a sheet for that date: "New session" (the one editor, with
      its existing "Repeat this session" switch — no second entry for series), "Use Session
      from Library", and "Mark as recovery day" / "Remove recovery day". A recovery day is a
      ☾ label beside the date and still shows its sessions (`CONTEXT.md`). The top-level
      Create session and the per-day Mark recovery day buttons go. Week totals say
      "planned", never done.
- [ ] **R3b — A three-month horizon.** Careful lane. Owner, 29 Sep 2026: option A — series
      keep being written ahead as real sessions, now ~13 weeks instead of 14 days — and
      option 3 for the far end: past those weeks the Plan continues only with the accepted
      roadmap's phases and week outlines, no sessions. Needs a forward migration replacing
      the two materializers' `v_today + 13`, `PLAN_WINDOW_DAYS` and `ROLLING_PLAN_WINDOW_DAYS`
      to match, an ADR-017 amendment (row growth ~6× per series, series edits rewrite more
      rows), Today's beyond-window notice, and the tests that pin 14 days. Confirm first that
      no coach context reads the whole window (it appears to read only its 1–7-day horizon).
- [ ] **R3 — The other screens, one per merge.** Session page, Log (as a sheet), Progress,
      You. Cut each page's explanatory intro to one line or remove it; say where an
      explanation must survive.
- [ ] **R4 — Motion.** Day-change slide (View Transitions), sheet and press feedback,
      instant log with background save; everything off under reduced motion.
- Cost to expect: many unit and browser tests assert the current copy, so cutting text means
      rewriting those assertions in the same merge.


## Fix in passing

Not worth their own slot; do them when work lands nearby.

- **The same session can be saved to the library twice.** Owner, 29 Sep 2026: saving a
  session that is already in the library creates a second entry. Decide what "the same"
  means (same name, or same name and activities) and whether a repeat save should update
  the existing entry, be refused, or ask. A uniqueness rule in the database would be
  careful lane; the activity library already requires unique names among active entries
  (`16118fb`), which is the precedent.
- A hand-made RPC payload with `position` or `plannedPosition` of `1.0` reaches
  `apply_completion_change` as a raw `22P02` rather than `22023`: the validators compare with
  `trunc`, the inserts cast the text. Unreachable from the app, whose parser emits integers.
  Map `invalid_text_representation` in the handler next time the function is replaced.
- "Only what you did not take" is a prompt-level expectation, not an enforced one. Accepted
  days reach the coach as plan commitments, but nothing stops it proposing on a day the
  owner already took — they would simply see it and decide again. Worth either enforcing or
  softening the copy, which currently states it as fact.
- A conflict after a regeneration has closed the review contradicts itself: the action
  appends "What you added is in your plan." to the generic conflict copy, which ends
  "nothing was added". Reached when the plan moves between the finish and the new
  generation. Needs one wording for that path; `actions.test.ts` pins the rule-error half.

## Later

- **Make an existing session repeat — idea.** Owner, 29 Sep 2026. "Repeat this session" is
  offered only while creating a session; a one-off already in the plan cannot become a
  series later, so today it means creating a new series and deleting the single one. The
  idea: offer the switch when editing a one-off, turning it into the first occurrence of a
  new series from its date. Careful lane (how a series and its occurrences are stored,
  ADR-017), and it has to say what happens to the session's lock and any log already on it.
- **"Why today" — idea.** Owner, 29 Sep 2026. The Today prototype showed one line above the
  sessions saying why the day looks as it does; R2 tried quoting the first open session's
  intent there, and the owner put the intent back on its card. What a real line would need:
  a source that is about the day rather than one session — most likely a coach-written
  reason carried with the plan proposal — and a label that says who wrote it. Coach text
  is careful lane (AI data boundary) and must stay a quote of an accepted plan, never
  composed on the page.
- **Logging in steps — undecided.** Owner, 29 Sep 2026, not sure yet: ask what happened one
  question at a time (how it went, effort, how it felt, anything off) instead of one form.
  To think through: whether it is faster or slower for a routine log, how a correction or
  a skip fits, and where the pain, illness and fatigue question sits so it is never skipped
  by accident. Would land with R3's "Log as a sheet" if wanted.
- **A goal bar on Today — undecided.** Owner, 29 Sep 2026: decide whether Today should show
  one at all. The prototype showed "3 weeks to 10k under 48 min" and "this week 40 min of
  4 h". Both would have to come from real records (`.claude/rules/ui.md`): which goal (the
  first core one?), a target date only if the goal has one, and logged minutes against
  planned minutes this week. Left out of R2 until decided.
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
  session's value, which is right under the one-field reading.
- **Saved sessions in the plan proposal.** Kept out of the plan operation by the owner on
  28 Sep 2026 (ADR-020 decision 4), to be revisited. It would need a proposal able to
  reference a saved session (schema), plan-context bytes there are none of, and a view on
  whether a names-only index is enough.
- **Athlete profile for the coach.** The owner wants the coach to know age, gender, weight
  and similar, collected in onboarding. Not decided: which fields, whether each is
  optional, how weight changes over time, and eligibility — this is a new class of personal
  data, weight is health-adjacent, and it needs its own ADR before it crosses. ADR-020's
  "nothing identifies the person" reasoning should be rechecked against it.
- **Automatic session detail.** Filling sessions without a request, perhaps per
  subscription tier. ADR-020 decision 3 rules it out for now; it would be a new spend and
  autonomy decision.
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

- **The plan context has no headroom left.** M3-16B spent it: prefix 7,400 + wrapper 64 +
  context 32,500 estimates 9,991 tokens against a 10,000 ceiling. The next source, or a longer
  prompt, takes bytes from an existing source or raises `maxInputTokens` — and the second is a
  standing spend increase, because a reservation charges the ceiling before every live call
  whether or not the extra room was used.
- **A superseded roadmap is named only by version.** When the owner accepts a new roadmap after
  a proposal was made, review says which version the proposal was planned under and that it has
  been replaced, but cannot describe it: the content of a superseded version is still stored,
  and reading it back for display was not in this slice.
