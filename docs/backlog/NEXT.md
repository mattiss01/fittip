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
      starts to matter. It already matters in one place (R3b-3, 2 Oct 2026): a session
      placed months out starts unlocked, and past its own horizon the coach is sent locked
      sessions only, so a race the owner adds does not reach the roadmap coach until they
      lock it, and nothing on the far day says so.

**App redesign in the Coach's note direction.** The owner chose it on 29 Sep 2026 from three
Today prototypes (`prototype/today-design`, `/prototype/today?variant=C`): FitTip's pine and
ember with a modern sans (Schibsted Grotesk, DM Mono for small labels), icon nav, a scrollable
day strip, the coach's one-line reason, session cards that fold into a receipt once logged, and
bottom sheets instead of new pages. Less text: each screen is a heading, the content and one
main action. No week ring. The owner flagged a possible bias toward the look they already know,
so start with Today and adjust from there rather than committing every screen up front. Build
lane, one screen per merge.

- [ ] **One title for a library session, and creating one in the library.** Owner,
      2 Oct 2026. A saved session has a name and a title that are almost always the
      same: show one field, "Title", on the card, in Edit and in "Save to library", and
      store it in both columns, so no migration. An entry whose name differed shows its
      title from then on, and the old name goes on its next edit. And a "New session"
      card at the top of the Session Library, as "New activity" is on the other: it
      makes a library entry only, through the existing create operation. Next ticket.
- [ ] **Write a roadmap yourself.** Owner, 2 Oct 2026. The Roadmap offers only
      "Generate roadmap proposal", and an owner without a subscription may not be able
      to generate one, so a roadmap must also be writable by hand: phases, dates, focus,
      milestones, review points. Open before it starts: whether a hand-written first
      version goes through a proposal and its acceptance as a coach one does (ADR-015)
      or is written directly, which decides whether it needs a migration. Careful lane
      if it does.
- [ ] **R3 — The other screens, one per merge.** Today, the Plan, the session page,
      Progress and You are done. For each one left: cut the explanatory intro to one line or
      remove it, and say where an explanation must survive. In the order they can be started:
  - [ ] **Inside Goals, Memory and Guided setup.** The three pages got You's back link and
        a plain heading and nothing else: their lists, filters, forms and buttons are
        still in the old style, with mono kickers ("Primary attention / 0 of 3",
        "Optional setup") and square controls.
  - [ ] **A proposal under review and a roadmap with phases are still in the old style.**
        The Plan's sub-pages were restyled on 2 Oct 2026 from their empty and one-entry
        states. Not done: in a review, the mono day stamps, badges and section labels,
        the ink border on a taken day, the solid ink choice and the dock; a finished
        proposal; on a roadmap, the spine, phase bands, attention chips, checkpoints,
        section headings, the editor and the decision dock; and the memory link on both.
  - [ ] **Log, as a sheet.** Blocked on the owner: one form as today, or "Logging in steps"
        (`Later`). The form's activity editor is already rounded.
  - [ ] **The shared state cards.** Loading, error and "confirm your time zone" on every
        route still use the old masthead card. You and Settings have no loading or error
        file of their own.
- [ ] **Small things the owner has not answered**, each a yes or no:
  - Session page: should Edit, Duplicate, Cancel and Delete open as bottom sheets like the
    Plan's "+", rather than below the card?
  - Activity editor: its input fields and the measurement line under a name are still in
    the mono face; the count and hints moved to sans.
  - Outcomes: completed and unplanned are green; "Partly completed" and "Replaced" are
    still ember. Change either?
  - The spark mark is on Plan with Coach, Fill with Coach and the suggestion box only, not
    on the proposal or roadmap pages.
  - A record's "Logged for" date is long, so at 390px the duration wraps under it; a short
    date ("Tue 29 Sep") would keep them on one line.
  - You's Memory row says "What the coach may use about you", but the page also lists
    proposed, declined and disabled items, which the coach may not use. The owner took the
    wording "for now" on 2 Oct 2026.
- [ ] **R4 — Motion.** Day-change slide (View Transitions), sheet and press feedback,
      instant log with background save; everything off under reduced motion.
- Cost to expect: many unit and browser tests assert the current copy, so cutting text means
      rewriting those assertions in the same merge.


## Fix in passing

Not worth their own slot; do them when work lands nearby.

- **A plain new browser spec has no way into CI.** `.github/scripts/browser-flows.sh` runs
  `auth` or a flow with its own `e2e/<flow>.playwright.config.ts`, and `.claude/rules/tests.md`
  says not to add such configs. A new spec under the root config would pass review and
  never run. Older than the shards (2 Oct 2026); the fix is one shard entry that runs the
  root config over every spec no per-ticket config claims.
- **A deleted occurrence makes the Plan re-run its top-up on every visit.** The page works
  out which rule dates have no session (`findUncoveredSeriesDates`) without knowing the
  dates a series was told to skip, so it fires the extension, which then writes nothing
  and costs no revision. Since M3-20; a deleted occurrence now stays in the window for 13
  weeks rather than two. `listSeries` would have to read `skipped_occurrence_dates`.
- **The Plan carries every week to the browser** — 13 behind today, 13 of recurring
  sessions and 13 more of single ones — and re-reads all of it for every change, though
  it shows one week. Fine for one athlete's plan; a read per week is the fix if it ever
  is not, and is what a longer history than a quarter would need first.
- **A logged card on the Plan shows the planned minutes, not the logged ones.** "40 min
  planned · Completed" (owner, 2 Oct 2026); the Plan reads a log's outcome and date and
  not its duration. Progress shows what was done.
- **The week strip jumps once as the Plan loads.** The server's HTML has the strip at its
  oldest week, thirteen weeks back, and it moves to the shown week when the page becomes
  interactive. Where it lands has no automated check either: unit tests have no layout.
  With this week at the left edge, a sliver of last week's tile shows in the page inset.
- **A date picked outside the allowed range gets the generic refusal.** The date fields on
  "Copy to", Edit and "Add to" carry `min` and `max`, which iOS Safari's picker does not
  enforce, so a date past day 180 is refused with "Check the session details and the
  date." rather than a sentence about how far ahead a session may sit.
- **Two back links drawn the same way.** `src/app/home/you/back-link.tsx` copies the one on
  a Progress record, markup and style. Progress could use the component; it would have to
  carry `data-back-link`, which m3-15c clicks.
- **Two links named "You" on the pages under You**, the back link and the navigation. A
  spec that clicks `{ name: "You", exact: true }` from one of them fails as ambiguous; the
  four that exist start from Today.
- **White text on the orange buttons is short of AA contrast.** Paper on `--ember` is
  3.7:1 against the 4.5:1 that m3-16a asserts for "Plan with Coach", which is why that one
  button uses `--ember-dark` (6:1), as do "Ask the coach" and "Generate roadmap proposal".
  Log this session, Edit, Edit log, Save session and, since 2 Oct 2026, the libraries'
  "Add to plan", "Save entry" and "Save to library" use `--ember`; those three were white
  on navy at 8.8:1 before. Owner's call: darken the orange everywhere, or keep it and
  accept it.
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

- **A start date for a coach proposal.** Owner, 2 Oct 2026. "Plan with Coach" always plans
  from today for one to seven days. The idea: choose the first day, so next week can be
  planned on a Friday. It changes what the coach is asked and what context it is sent,
  so careful lane (AI data boundary), and the roadmap coach's own start date wants the
  same answer.
- **What goes in Settings.** Owner, 2 Oct 2026. The gear on You opens a page that says
  "Nothing to set yet." Meant for it: account details, subscription, language, and light
  or dark mode. None is decided or listed there; Sign out stays on You. Account details
  touch auth and a subscription touches spend, so both are careful lane.
- **Log a session live — idea.** Owner, 1 Oct 2026. Track a session while doing it, set by
  set and activity by activity, instead of filling the log in afterwards. To think
  through: what is saved if it is abandoned halfway (a partial log, or nothing), whether
  a phone that sleeps or goes offline mid-session loses anything, how it sits beside the
  after-the-fact form and "Logging in steps" below, and where the pain, illness and
  fatigue question goes so it is never skipped. The log's records stay separate from the
  plan either way.
- **Create and fill with Coach — idea.** Owner, 1 Oct 2026. Fill with Coach is offered only
  when editing, because the coach reads a saved session and its suggestion is stored
  against one. The idea: a second button on the create form that saves the session, then
  opens it with the coach's suggestion already asked for. Single sessions only, not a
  series. To decide: a dismissed suggestion leaves an empty session in the plan rather
  than nothing. Filling an unsaved form instead would be careful lane (AI data boundary,
  a proposal with no session behind it) for little more.
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

- **The roadmap prompt has 43 characters left.** Its static prefix is 5,957 of the 6,000
  `openai-prompt.test.ts` allows, after the sentence naming `recurringSessions`. The next
  sentence takes them from an existing one or raises the input ceiling, which is a
  standing spend increase.
- **The roadmap coach is not told which dates of a series differ.** A rule is sent as the
  series stands (ADR-013, amended 2 Oct 2026): a cancelled or deleted occurrence is not
  listed, and a locked, edited or moved one appears both as its own dated entry and
  inside the rule.
- **The plan context has no headroom left.** M3-16B spent it: prefix 7,400 + wrapper 64 +
  context 32,500 estimates 9,991 tokens against a 10,000 ceiling. The next source, or a longer
  prompt, takes bytes from an existing source or raises `maxInputTokens` — and the second is a
  standing spend increase, because a reservation charges the ceiling before every live call
  whether or not the extra room was used.
- **A superseded roadmap is named only by version.** When the owner accepts a new roadmap after
  a proposal was made, review says which version the proposal was planned under and that it has
  been replaced, but cannot describe it: the content of a superseded version is still stored,
  and reading it back for display was not in this slice.
