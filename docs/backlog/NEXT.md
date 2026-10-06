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

- [ ] **Guided setup, step by step with the owner.** Owner, 2 Oct 2026: the screens look
      right, the setup itself does not. Go through all six steps together in detail,
      from scratch: what each step asks and why, every question's wording, which
      answers are required, where each answer is kept, and what the review step shows.
      The list below is where that starts, not its scope. Owner, 5 Oct 2026: it
      comes after the three items below it (goals migration, sports list, personal
      details), which it is built from. Signing up now starts it, and its goal
      step is the slim form. Already named; the first three need a migration, so
      careful lane:
  - **Access and equipment** cannot be left empty and is a comma list of labels. The
    owner dislikes both. `apply_onboarding_change` refuses fewer than one label.
  - **Time zone and units belong in the profile, not in Memory.** Setup files both as
    memory candidates today. `profiles` has `timezone_name` and no units column.
  - **A half-filled step cannot be saved.** "Save and finish later" now leaves anyway
    and You says the step was not saved; the draft has no place for a partial step,
    and the button still says "Save".
  - **The Guided setup row stays on You after setup is done**, leading to a page that
    says it is finished. Hiding it needs the setup's state read on You, no migration.
  - **A card that matches something saved starts accepted as "update"**, so one press
    writes over a saved goal or brings back a declined or disabled memory. The card
    says so. The owner asked for everything accepted first; this is its sharpest edge.
- [ ] **One goals migration.** Careful lane. The form and card were slimmed on
      5 Oct 2026 (title, desired outcome, sports, target date, core or supporting)
      without touching the database; this is what that left:
  - **Drop what is no longer asked** (owner, 5 Oct 2026): `start_date`,
    `target_detail`, the three `target_metric_*`, `rationale` and
    `constraints_text`, from `goals`, `apply_goal_change` and setup's goal
    candidates. Irreversible, so ask again before applying. Until then they travel
    hidden through every edit, and a target date before an older goal's hidden
    start date gets the generic refusal.
  - **The coach reads the desired outcome**, for the roadmap above all (owner,
    5 Oct 2026). AI data boundary, ADR-012. Goals have 4,000 bytes for twelve at
    326 each and an outcome may be 1,000 characters, so it needs a shorter limit,
    fewer goals, or the roadmap only; the plan context has no headroom.
  - **Sports in place of category.** The form sends `other` for every new goal,
    and category is one of the four goal fields the coach is sent. Swap it for
    the goal's sports in the same change, then drop the column.
  - **Remove Archive for good.** Owner, 2 Oct 2026. `apply_goal_change` still
    accepts `archive`, `goals.archived_at` is still a column, and goals archived
    earlier still show in History. To decide first: what an archived goal becomes
    (most likely Abandoned, so reopenable); the coach's context and the delete
    refusal ("archive-required") both read `archived_at`.
  - **"Achieved on"** is the goal's last-changed time, because the lifecycle log
    records only reopening. It is wrong in one case: setup filing a new answer
    over a finished goal of the same title moves the day to then.
  - **Pause and Abandoned** are still two ways to set a goal aside, both undoable.
- [ ] **The sports list wherever a sport is typed.** Owner, 5 Oct 2026; this
      settles "sport or category" as one shared list. Offer the profile's sports
      in a goal's sports and a session's and an activity's `sport`. Build lane
      once the list exists. Open: whether the stored `sport` columns are renamed.
- [ ] **The coach reads age, gender, height and weight.** Owner, 5 Oct 2026:
      those four, age worked out from the birthday, and never the name. AI data
      boundary, so careful lane and its own ADR (021). The plan context has
      about 9 tokens free and this needs about 20 plus a prompt sentence; bring
      measured numbers and the safety wording (non-diagnostic) before pushing.
- [ ] **Setup after goals, rethought.** Owner, 5 and 6 Oct 2026: current training, time
      and access, preferences and constraints all go. Decided: (1) "How often do you
      want to train?", sessions a week, nothing about training now; (2) "Any days you
      can't train?", every day free until tapped, with an optional line in words; no
      session length; (3) "Where can you train?", about eight place chips plus the
      owner's own; (4) "What do you have at home?", equipment chips in groups, asked
      only when Home is picked, and without bikes or skis, which the sports say.
      All four are profile settings, changed on Settings, never memory items.
      (5) One screen, "Anything your coach should know?", with a line on why it
      matters and prompt chips; a tap adds a labelled text field, and any chip can be
      tapped again for another: An old injury, A health condition to consider, What
      I enjoy, What I can't stand, My training background, Why I'm doing this, My
      job and daily routine, Other preference, Other limitation. These fields are
      the only source of memory items: the coach drafts them (one field may give
      several) and they are accepted in review; without the coach each field is one
      item under its label. This replaces the limits step and its seven categories,
      so the text is sent to the AI (ADR needed; the screen says today that it is
      not) and the safety note moves here, shortened. Still to shape: review.
      Careful lane: replaces most of `apply_onboarding_change`.
- [ ] **Setup's small ends.** From the reviews of 5 Oct 2026. The leave popup has no
      focus trap and the sport list no arrow keys, Escape or outside press; an "About
      you" save refused for a question that is not on screen names no field; removing
      the last weight loses its notice; `weight_entries.measured_on` and `birth_date`
      have no future check in the database; a sport a goal adds skips the list's
      tidying of spaces and is written read-then-write; a first time zone can be
      stored when the rest of "About you" then fails; the confirmation link does not
      check its sign-out; `ageOn` waits for the coach item above.
- [ ] **Setup takes more than three goals.** Owner, 5 Oct 2026: three is the limit on core
      goals, not on goals. Setup's goal step stops at three because the database does:
      `apply_onboarding_change` refuses a fourth and `onboarding_goal_candidates.position`
      is checked 1 to 3. Raising it replaces that function, so careful lane; do it with
      the goals migration. The Goals page has no such limit.
- [ ] **A date typed or picked, everywhere.** Owner, 5 Oct 2026. `DateField` (three typed
      fields and a calendar button) is on a goal's target date, in setup and on Goals,
      and, without the calendar, on the birthday. Still plain date fields: a session's
      date (`plan-date-field.tsx`, with its `min` and `max`), a series' end, the log's
      date, a memory's expiry, the roadmap's dates. Several are pinned by browser specs.
- [ ] **Numbers without the struck-through zero.** Owner, 5 Oct 2026: the mono face
      (DM Mono, `--font-mono`) draws 0 with a line through it and the owner does not
      want it anywhere a number shows. Setup's percentage is in the sans face already;
      71 other rules use the mono face, for small labels as well as numbers. Open:
      another mono face with a plain zero, or the sans face with tabular figures
      wherever a number is shown. Build lane, one sweep, the owner looking.
- [ ] **No full stop on a heading, everywhere.** Owner, 5 Oct 2026. Done on sign-in,
      sign-up and in setup; about fifty older headings (loading, error and empty
      states) still end with one, each quoted by a test or a browser spec.
- [ ] **Forgot password.** Owner, 5 Oct 2026: a link on sign-in that sends a
      reset mail and lets the password be set again. Careful lane (auth).
- [ ] **Write a roadmap yourself.** Owner, 2 Oct 2026. The Roadmap offers only
      "Generate roadmap proposal", and an owner without a subscription may not be able
      to generate one, so a roadmap must also be writable by hand: phases, dates, focus,
      milestones, review points. Open before it starts: whether a hand-written first
      version goes through a proposal and its acceptance as a coach one does (ADR-015)
      or is written directly, which decides whether it needs a migration. Careful lane
      if it does.
- [ ] **Roadmap: what it holds, again.** Owner, 3 Oct 2026, as with goals: go through
      the roadmap's data model together — phases, focus, goal attention, milestones,
      review points, assumptions, uncertainties, versions and proposals — what each is
      for, what the owner should be able to set, and how a roadmap screen shows it.
      Belongs with "Write a roadmap yourself", which writes the same shape by hand. A
      change to the stored shape is careful lane (`roadmap_versions` content, the AI
      contract, ADR-015).
- [ ] **The server does not refuse a plan change to a logged session.** Since 3 Oct 2026
      a logged session's page offers only Edit log and Save to library, but `planAction`
      still accepts edit, move, lock and cancel on one (only delete is refused,
      `session-completed`); a page left open from before the log could still send them.
      Refusing them is a rule in the rolling-plan change function, so careful lane.
- [ ] **A migration to remove a log's feeling.** Owner, 3 Oct 2026: "How did it feel?"
      left the log's steps that day (effort says the same) and should go for good. Careful
      lane. The column is `completions.feeling`, written by `apply_completion_change` and
      read by the completion log, Today, Progress, saved-session copies, the inline
      replacement's `replacement.feeling` (no longer asked either), and the coach's
      training history (`training-history-context.ts`, `contracts.ts`), so the AI context
      changes too. Nothing is in production, so existing values need no keeping.
- Cost to expect: many unit and browser tests assert the current copy, so cutting text means
      rewriting those assertions in the same merge.


## Fix in passing

Not worth their own slot; do them when work lands nearby.

- **`saveSessionDraftToLibraryAction` has no caller.** The log's own "Save session to
  library" left the activities step (owner, 3 Oct 2026); saving a log goes through the
  receipt, Today and Progress. The action and its tests in `plan/saved` can go.
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
- **Dragging a goal does not scroll the page.** Since 5 Oct 2026 a goal is
  reordered by dragging its number. A list taller than the screen cannot be
  dragged end to end; the arrow keys on the number can, which a phone lacks.
- **A confirmation link opened in another browser does not start setup.** Only
  the browser that signed up can be confirmed into a session; elsewhere the
  link fails, the sign-in that follows goes to Today, and setup is reached
  from You. `OnboardingHomeInvitation` is unrendered and could cover it.
- **Two back links drawn the same way.** `src/app/home/you/back-link.tsx` copies the one on
  a Progress record, markup and style. Progress could use the component; it would have to
  carry `data-back-link`, which m3-15c clicks.
- **Two links named "You" on the pages under You**, the back link and the navigation. A
  spec that clicks `{ name: "You", exact: true }` from one of them fails as ambiguous; the
  four that exist start from Today.
- **The same session can be saved to the library twice.** Owner, 29 Sep 2026: saving a
  session that is already in the library creates a second entry. Decide what "the same"
  means (same title, or same title and activities) and whether a repeat save should update
  the existing entry, be refused, or ask. Since 2 Oct 2026 an entry has one title and no
  name of its own, so two saves of one session, and two older entries once told apart
  only by name, look identical in the library and in every picker. A uniqueness rule in the database would be
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
  after-the-fact log in steps, and where the pain, illness and fatigue question goes so
  it is never skipped (in steps it is its own question, answered or "Nothing was off"). The log's records stay separate from the
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
- **A goal bar on Today — undecided.** Owner, 29 Sep 2026: decide whether Today should show
  one at all. The prototype showed "3 weeks to 10k under 48 min" and "this week 40 min of
  4 h". Both would have to come from real records (`.claude/rules/ui.md`): which goal (the
  first core one?), a target date only if the goal has one, and logged minutes against
  planned minutes this week. Left out of R2 until decided.
- **Saved sessions in the plan proposal.** Kept out of the plan operation by the owner on
  28 Sep 2026 (ADR-020 decision 4), to be revisited. It would need a proposal able to
  reference a saved session (schema), plan-context bytes there are none of, and a view on
  whether a names-only index is enough.
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
