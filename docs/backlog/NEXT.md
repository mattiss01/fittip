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

- [~] **The coach waits 90 seconds.** Careful lane (spend limits). Owner, 17 Oct 2026:
      the first live "ask again" on `gpt-6-luna` took over 30 s, timed out, was charged its
      whole reservation (3,750 micro-USD) and closed the old proposal with nothing in its
      place. `COACH_AI_LIVE_LIMITS.deadlineMs` 30,000 → 90,000; costs nothing more. No
      route sets `maxDuration`, so Vercel's 300 s default covers it.
- [ ] **A7-5 — Size the fill before its first live run.** Measure output tokens on a
      twelve-activity answer: the grammar pads each target with fourteen nullable keys
      against a 3,000-token ceiling. Needs a provider key, so it waits for one; each run
      is paid and needs the owner's approval of the call count.
- [ ] **A9 — Progress over measurements.** Load, distance and pace across completions, once
      A4 has been used for long enough to have any. The comfort layer; last on purpose.
      Open for the owner first: a row picked from the library and then changed keeps its
      `personal_activity_id` until it is saved as a new definition, so grouping history by
      definition would count "picked Latzug, renamed Stabwurf" as Latzug.
- [ ] **A session's own measurement — to talk through with the owner first.** Owner,
      16 Oct 2026: a run should be measured without adding an activity. Hiding a single
      activity behind the session (stored as one row) was considered and fails the owner's
      own case: a 50 min, 8 km run that then gets intervals makes the total a sibling of
      its own parts, and progress would add them. The likelier shape is the session (and
      its log) holding the totals and activities holding the parts. Careful lane: schema,
      the AI contracts and what A9 sums.
- [ ] **More ways to measure — to talk through with the owner first.** Candidates named
      on 16 Oct 2026: intervals (repeats of distance and time), heart rate or RPE beside
      time and distance, elevation, laps or lengths. Each is a mode or field in the schema
      and the AI contracts, so careful lane; only the ones the owner misses.
- [ ] **The 30-day start limit is the app's alone.** `begin_plan_generation` and
      `begin_roadmap_generation` refuse a past start and have no upper bound. Only
      the owner calling the database directly gets past it, on their own data.
      The owner's to decide; a small migration, so it can ride with the next one.

**Coach and records.**

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
- [ ] **An account with logs cannot be deleted.** Found seeding the test athletes,
      16 Oct 2026: deleting the auth user fails, because a log restricts the deletion of
      its planned session (`completions` → `rolling_plan_sessions`) and plan,
      saved-session and log activities hold their library entry with no action. Nothing
      deletes an account today, but it blocks "delete my account" before anyone else is
      invited. Careful lane: a migration, and the owner's to say what a deletion takes.
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
- [ ] **Tell the coach which milestones were reached.** Left out of the tick on
      purpose (owner, 13 Oct 2026; ADR-026), to be decided once ticks have been
      used. It changes what the roadmap call is sent and takes prompt bytes:
      careful lane.
- [ ] **The Plan reads one week at a time.** Owner, 15 Oct 2026: its own item. Today it
      carries every week to the browser — 13 behind, 13 of recurring sessions and 13
      more of single ones — and re-reads all of it for every change, though it shows one.
      Fine for one athlete's plan; a longer history than a quarter would need it first.

## Fix in passing

Not worth their own slot; do them when work lands nearby.

- **Fill with Coach takes a new key after a deadline.** `fill-with-coach.tsx` clears its
  key on any `refused` reply, and a `deadline_exceeded` is one, while the provider call
  may still be running; the next tap is a second paid call. The plan and roadmap forms
  keep the key there since 17 Oct 2026 (`attemptEnded`); give the fill reply the same.

- **`plan-month-sheet.test.tsx` times out under a full local run.** Three times on
  16 Oct 2026 ("steps between the months…", over 5,000 ms), passing alone each time;
  `onboarding-manager.test.tsx` once. CI has not shown it. Likely a slow render under
  load rather than a fault; a longer timeout on that one test, or less work in it.
- **For the owner to delete; the agent cannot.** What the Roadmap page left behind on
  13 and 14 Oct 2026 and nothing renders: `src/components/roadmap/roadmap-proposal-record.tsx`,
  `roadmap-editor.tsx` and both their tests. With them go the `.historyItem` and
  `.recordTitle` styles in `roadmap.module.css` and the `proposalExpired` and
  `proposalSuperseded` wordings in `roadmap-records.ts`, which only those files use.
- **For the owner to look at.** The date fields' width fix (13 Oct 2026) has not been seen
  on a phone or in a desktop browser's calendar mark. And with this week at the week
  strip's left edge, a sliver of last week's tile shows in the page inset: a hint that the
  strip scrolls, or a flaw.
- **The week strip still jumps on a first load in Safari.** Since 15 Oct 2026 the strip
  is placed before paint and the server's HTML asks for this week's tile with
  `scroll-initial-target`, which Chrome honours and Safari does not, so there the strip
  shows its oldest week until the page is interactive.
- **After a milestone tick's recovery reload, nothing says why.** The tick passes no
  recovered notice; the explanation appears only when "New roadmap" is next opened. Rarer
  since 15 Oct 2026, when ticks stopped taking each other's replies for their own.

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

- **The roadmap prompt has about eighty-five characters left** of the 7,800 its token
  arithmetic is derived against (`openai-prompt.test.ts`), since the core-goal sentence
  went on 14 Oct 2026. A longer sentence takes its room from an existing one.

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

- **A change request has never met a provider.** The example coach ignores what the
  owner writes, so what "Change with Coach" returns locally is not changed to the
  note. The first live one is untested until there is a provider key.
- **The v4 roadmap prompt has never met a provider.** It was checked against the built-in
  example coach only; there is no provider key, so the first live roadmap is untested.
- **A due review cannot be shown in a browser flow.** The coach starts a roadmap today,
  so no phase has ended; the card and the Plan's dot are proved in unit and database
  tests and were looked at on a local database with a phase moved into the past.
- **The roadmap coach is not told which dates of a series differ.** A rule is sent as the
  series stands (ADR-013, amended 2 Oct 2026): a cancelled or deleted occurrence is not
  listed, and an edited or moved one appears both as its own dated entry and
  inside the rule.
- **A superseded roadmap is named only by version.** When the owner accepts a new roadmap after
  a proposal was made, review says which version the proposal was planned under and that it has
  been replaced, but cannot describe it: the content of a superseded version is still stored,
  and reading it back for display was not in this slice.
