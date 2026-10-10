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
- [ ] **A9 — Progress over measurements.** Load, distance and pace across completions, once
      A4 has been used for long enough to have any. The comfort layer; last on purpose.
      Open for the owner first: a row picked from the library and then changed keeps its
      `personal_activity_id` until it is saved as a new definition, so grouping history by
      definition would count "picked Latzug, renamed Stabwurf" as Latzug.
- [ ] **The 30-day start limit is the app's alone.** `begin_plan_generation` and
      `begin_roadmap_generation` refuse a past start and have no upper bound. Only
      the owner calling the database directly gets past it, on their own data.
      The owner's to decide; a small migration, so it can ride with the next one.

**App redesign in the Coach's note direction.** The owner chose it on 29 Sep 2026 from three
Today prototypes (`prototype/today-design`, `/prototype/today?variant=C`): FitTip's pine and
ember with a modern sans (Schibsted Grotesk, Chivo Mono for small labels), icon nav, a scrollable
day strip, the coach's one-line reason, session cards that fold into a receipt once logged, and
bottom sheets instead of new pages. Less text: each screen is a heading, the content and one
main action. No week ring. The owner flagged a possible bias toward the look they already know,
so start with Today and adjust from there rather than committing every screen up front. Build
lane, one screen per merge.

- [ ] **The plan call's logs: 9,300 bytes or the 10,200 the owner named.** The
      plan call is at the 15,000-token ceiling by construction (ADR-023 decision 12),
      so its logs got 9,300. Raising `maxInputTokens` to 15,300 gives them 10,200 and
      the hold per call goes from 6,600 to 6,660 micro-USD. The owner's to say.
- [ ] **A fill's sources are recorded and never checked.** A suggestion names the
      logs, library entries and saved sessions it was built from, and since ADR-023
      the logs whose flags it was sent. Nothing compares them, so a flag corrected
      away, or a log edited, after the suggestion was made changes nothing in the
      draft box. Not urgent (owner, 10 Oct 2026): the list passes through the editor
      before it is saved. The check cannot go in `decide_session_activity_proposal`,
      which runs after the session is saved (`session-activity-acceptance.ts`); it
      wants a read-only "is this still current" function the draft box asks as it
      renders, compared per kind as `accept_roadmap_proposal` does. Open: what
      revision a `plan_session`, `personal_activity` and `saved_session` source
      stores, and so which kinds can be compared; and the owner's to say, whether a
      stale suggestion warns or loses Accept, where asking again is a paid call.
      Careful lane: a migration.
- [ ] **A changed setup can replay an earlier answer.** The coach service's
      repeat-protection fingerprint covers the goal and memory revisions, not the
      profile. Changing the setup and resubmitting the same open form may return the
      earlier proposal. Found in the review of ADR-023's first merge; staleness, not a
      leak. Careful lane (the fingerprint is part of the spend guard).
- [ ] **Setup's small ends.** What is left of the reviews of 5 and 6 Oct 2026, none of
      it build lane. Needs a migration: `weight_entries.measured_on`, `birth_date` and
      the names in the training lists are bounded by the app, not the database. Needs
      one write instead of two: a typed sport joins the owner's sports read-then-write,
      and a first time zone can be stored when the rest of "About you" then fails.
      The owner's to decide: "Continue later" drops, without saying so, a goal or note
      that cannot be saved; setup's notes are limited in characters and the coach's
      memory in bytes, so many long notes can leave the coach refusing to plan. Limits
      as a whole are still to be thought through with the owner, and the coach tidying
      the notes is not built.
- [ ] **Write a roadmap yourself.** Owner, 2 Oct 2026. The Roadmap offers only
      "Generate roadmap proposal", and an owner without a subscription may not be able
      to generate one, so a roadmap must also be writable by hand: phases, dates, focus,
      milestones, review points. After "Roadmap: a slimmer shape", whose shape it
      writes. Careful lane either way: a proposal without a coach behind it has no
      origin the database allows, and an accepted version must name a proposal. Open:
      whether it goes through a proposal and its acceptance as a coach one does
      (ADR-015) or is written directly, and what the least is that counts as a
      roadmap.
- [~] **Roadmap: a slimmer shape.** Owner, 10 Oct 2026, after going through what a
      roadmap holds: assumptions, uncertainties, the written reason on goal
      attention and the coach's safety sentences go; the attention levels and review
      points stay, and a phase may have no milestone. No coach call reads what goes.
      The safety sentences go entirely, the owner's choice over keeping a required
      review point: with a flag present nothing checks that a roadmap acknowledges
      it. The coach is still sent the flags and the safety rules, and the app's own
      notice on the Roadmap stays. Careful lane (the AI contract and the stored
      shape): the database checks the stored envelope by name and version
      (`fittip.roadmap.v2`), so this is a v3 beside it, with a migration, a prompt and
      schema change, and the editor. Accepted versions and old proposals are
      permanent and keep rendering what they hold.
- [ ] **Whether a milestone was reached.** Owner, 10 Oct 2026. One answer, reached;
      a milestone not ticked is open and nothing ever says missed. A record beside
      the roadmap, as a log is beside the plan: the accepted version is never
      rewritten. Careful lane: a new owned table with RLS and its write function.
      Open: whether a tick can be taken back, what it holds besides the day, and
      whether the next roadmap call is told (AI data boundary, its own decision).
- [ ] **Review points that show.** Owner, 10 Oct 2026. A review date passes silently
      today. From the day it arrives its question is a line at the top of the Plan
      until dismissed, and it is marked due on the Roadmap; nothing replans and no
      coach is asked. Open: what a point with a condition instead of a date does, and
      where a dismissal is kept (a record of its own is a migration).
- [ ] **Delete a log.** Owner, 7 Oct 2026: it should be possible, which also frees a
      settled session for planning again. Careful lane: `apply_completion_change`
      accepts only create and edit, and completions are permanent records today. Open
      for the owner: any log or only a skip logged ahead; what happens to a replaced
      session's link to the log that replaced it; the coach's proposals record which
      logs they read; ADR-013 decision 3 already says a deleted record reaches no
      provider and no summary.
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
- **The sports field's loose ends.** Since 8 Oct 2026 a typed sport joins the owner's
  sports after a save (`keepSports`). It is offered from the next page load, not at once;
  it is read-then-write, so a sport removed on Settings at that moment comes back; a
  name over 60 characters or with a comma is not added and nothing says so; the call is
  repeated in eight actions; and the chips are not announced to a screen reader.
- **The Plan's series-extension notice is drawn as a heading** (`series-materializer.tsx`)
  though it is a status sentence, sometimes two, so it kept its full stop on 8 Oct 2026.
  It wants to be a paragraph with `role="status"`; m3-14b may find it by its heading.
- **Three dates are still plain date fields**: a phase's start and end and a milestone's
  date in the roadmap editor (`roadmap-editor.tsx`). They are held by the editor, and a
  phase is keyed by its start date, so its block is rebuilt as that date changes. Do
  them with "Roadmap: what it holds, again".
- **A typed date outside a session's range gets the general refusal**, since only the
  calendar is held to it (`plan-date-field.tsx` gives no `rangeMessage`, so that a page
  left open past midnight is not blocked). A goal's calendar still offers days before
  today, which the save then refuses.
- **Dragging a goal does not scroll the page.** Since 5 Oct 2026 a goal is
  reordered by dragging its number. A list taller than the screen cannot be
  dragged end to end; the arrow keys on the number can, which a phone lacks.
- **`e2e/auth.spec.ts` leaves its accounts behind**, two a run, against the rule in
  `.claude/rules/tests.md`. Harmless in CI, whose stack is thrown away; on a laptop
  they stay in the local database. It needs the service-role key the spec does not use.
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
  ADR-017), and it has to say what happens to any log already on the session.
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

- **A hosted password reset does not work.** Owner, 8 Oct 2026: decided later, when
  further users are invited. Supabase lets a free-plan project on its built-in sender
  change no mail template, so the hosted mail carries the default link, which is used
  up by Supabase and lands on sign-in with nothing reset. It needs a mail sender of
  the owner's (custom SMTP), then the text of `supabase/templates/recovery.html`
  pasted in and the Site URL checked (ADR-022). A forgotten hosted password is set
  from the Supabase SQL editor until then.

- **The roadmap prompt has 43 characters left.** Its static prefix is 5,957 of the 6,000
  `openai-prompt.test.ts` allows, after the sentence naming `recurringSessions`. The next
  sentence takes them from an existing one or raises the input ceiling, which is a
  standing spend increase.
- **The roadmap coach is not told which dates of a series differ.** A rule is sent as the
  series stands (ADR-013, amended 2 Oct 2026): a cancelled or deleted occurrence is not
  listed, and an edited or moved one appears both as its own dated entry and
  inside the rule.
- **A superseded roadmap is named only by version.** When the owner accepts a new roadmap after
  a proposal was made, review says which version the proposal was planned under and that it has
  been replaced, but cannot describe it: the content of a superseded version is still stored,
  and reading it back for display was not in this slice.
