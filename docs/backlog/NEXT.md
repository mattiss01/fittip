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

**Friends beta.** Owner, 12 Nov 2026: three to five friends, decided in
[ADR-043](../decisions/ADR-043-A-FRIENDS-BETA.md). Planned only; the owner says when to build.
No friend is admitted until B1, B2 and B3 have merged. All careful lane.

- [ ] **B1 — Admit a list of people, not one.** `FITTIP_OWNER_USER_ID`
      (`runtime-policy.ts`) becomes a server-only list of verified user ids, read by the
      proxy, the pages and the coach's enablement (`enablement.ts`, `composition.ts`) alike.
      Hosted sign-up stays off in FitTip and in Supabase Auth. Fails closed on a missing,
      empty or malformed entry; never decided from email or user metadata. Proof:
      runtime-policy, proxy and enablement tests for a listed, an unlisted and a malformed
      id. Per-user isolation is already enforced by RLS and proved on the test athletes.
- [ ] **B2 — Consent before the coach.** ADR-043 decision 5: a privacy notice and a separate,
      recorded yes before a person's first coach call; without it the coach is not offered,
      withdrawing stops calls, account delete (ADR-039) removes the record. The notice states
      the AI provider's data-use and retention terms as they are, checked when it is
      written, and that the owner can read the database. A migration and the AI data
      boundary. Covers the owner too, who consents like anyone else.
- [ ] **B3 — Friends' data survives.** ADR-043 decisions 6 and 7: a weekly dump of the
      founder project to the owner's laptop and one before each hosted migration, one
      restored into the local stack to prove it, the laptop's disk encryption checked, and
      the retention period the notice states. The agent's rules and memory drop "no stored
      data needs to survive". Open: who runs the weekly dump (the owner, or a scheduled
      task).
- [ ] **B4 — First invitations.** The owner creates each account by hand with a one-time
      password and passes it on privately (ADR-043 decision 3); the invitation says a
      forgotten password is reset by the owner. `CLAUDE.md` stops calling FitTip an app
      "for one athlete" in the same step.

- [ ] **Language switch.** Owner, 12 Nov 2026: soon, after the beta starts in English. The
      app's text in English and German, chosen in Settings. To settle with the owner
      first: where the choice is stored (a profile column is a migration, careful lane)
      and whether the coach then answers in it (the prompts, careful lane); the user's own
      names (activities, sports) are never translated.

**Activities in training.** The owner named this on 24 Sep 2026. A session can now hold
activities and the editor writes them; what is left is everywhere else they should appear.
The live tables are `rolling_plan_activities` and `completion_activities`; M3-11 dropped
M1's `planned_activities` and `completed_activities`, and `personal_activities` survived
that reset untouched.

Ordered by dependency. A lane is named where it is not the build lane.

- [ ] **A7-5 — Size the fill before its first live run.** Measure output tokens on a
      twelve-activity answer: the grammar pads each target with fourteen nullable keys
      against an 11,500-token ceiling. Needs a provider key, so it waits for one; each run
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
- [ ] **The 30-day start limit is the app's alone.** `begin_plan_generation` and
      `begin_roadmap_generation` refuse a past start and have no upper bound. Only
      the owner calling the database directly gets past it, on their own data.
      The owner's to decide; a small migration, so it can ride with the next one.

**Coach and records.**

- [ ] **The plan coach does not see a recovery day.** Live run, 12 Nov 2026: Tom at All in
      was offered hard trainer intervals in place of Tuesday's easy ride, a day marked
      "Already a recovery day" (and his physio appointment). Since 17 Oct 2026 the coach
      never reads recovery days and an empty day is rest to it, and since the push level a
      plan may offer an open session harder in its place, so a marked day is now easier to
      load. Owner, 12 Nov 2026: kept as it is for now, because what a recovery day is in the
      app is itself undecided. Sending the marked days would be the AI data boundary,
      careful lane.
- [ ] **A fill drops what does not match the session's sport.** All ten live fills of Chris's
      "Trainer intervals" (12 Nov 2026), at every push level, left out the planned "Hip &
      core circuit" ("so the session stays focused on the bike"), so Accept removes it.
      The prompt says the athlete's activities are the starting point. Whether a strength
      add-on on a bike day should survive a fill is the owner's to say.

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

## Fix in passing

Not worth their own slot; do them when work lands nearby.

- **For the owner to look at.** The date fields' width fix (13 Oct 2026) has not been seen
  on a phone or in a desktop browser's calendar mark. And with this week at the week
  strip's left edge, a sliver of last week's tile shows in the page inset: a hint that the
  strip scrolls, or a flaw.
- **The week strip still jumps on a first load in Safari.** Since 15 Oct 2026 the strip
  is placed before paint and the server's HTML asks for this week's tile with
  `scroll-initial-target`, which Chrome honours and Safari does not, so there the strip
  shows its oldest week until the page is interactive.

- **A refused account delete for an ended session never says so.** The route sends it to
  `/home/you/settings/delete?delete=session`, which redirects a signed-out visitor to the
  start before the message can show (as on the single page before 6 Nov 2026).

## Later

- **Goals with a number — idea.** Owner, 5 Nov 2026, after prototypes B and G: a goal card
  showing its best against its target needs a measure first, and both sources fall short
  alone. Read from a linked activity definition, it misses logs typed freely (36 of 267
  in the test athletes) and training sets understate a test (Lena's logs say 4 pull-ups a
  set; she marked "5 in a row" reached). Entered by hand as a result, like weight, it is
  right but goes stale. Recommended: both, the card saying what it counted and when, a
  hand-entered result winning. Of the test athletes' 17 goals, about 9 could be read from
  an activity, 3 are sessions-a-week goals and 5 have no number FitTip records. Careful
  lane (a migration); it answers A9's grouping question too. Also shown and not chosen
  for now: the plan-following week strip, the roadmap bar on Progress, a week review.
- **A global FitTip session and activity library — idea.** Owner, 29 Oct 2026: sessions
  and activities FitTip provides, beside each person's own. Today's rule says otherwise:
  `CLAUDE.md` keeps activities personal and rules out a global library for v1, so this
  starts with the owner changing that invariant. Then careful lane: who writes the shared
  entries, how a copy taken from one relates to it, and what the coach may pick from.
- **Coach start times — idea.** Owner, 29 Oct 2026: not for now. The coach would give a
  start time only when the note or memory says when; proposal items carry it, an accepted
  proposal writes it, and a replaced session keeps its own time when the proposal gives
  none. Careful lane (the AI contracts); one paid call to judge.
- **How much the coach thinks — idea.** Owner, 17 Oct 2026: keep the default for now.
  `gpt-6-luna` takes `reasoning_effort` (none … max; FitTip sends none, so "medium");
  lower is faster and cheaper, and weighs less at once (knee, pain rule, the days after).
  Per operation is possible (plan and fill low, roadmap medium). Needs one paid test call
  each, and the parameter confirmed against OpenAI's own reference first.
- **What goes in Settings.** Owner, 2 Oct 2026. Still meant for it: a subscription and
  light or dark mode (language moved to Now, 12 Nov 2026). Neither is decided; Sign out
  stays on You. A subscription touches spend, so it is careful lane.
- **GPS for runs — idea, for a native app.** Owner, 21 Oct 2026: a browser loses the
  phone's position once the screen locks, so a run's distance is typed for now. Worth
  revisiting if FitTip becomes a real app.
- **Create and fill with Coach — idea.** Owner, 1 Oct 2026. Fill with Coach is offered only
  when editing, because the coach reads a saved session and its suggestion is stored
  against one. The idea: a second button on the create form that saves the session, then
  opens it with the coach's suggestion already asked for. Single sessions only, not a
  series. To decide: a dismissed suggestion leaves an empty session in the plan rather
  than nothing. Filling an unsaved form instead would be careful lane (AI data boundary,
  a proposal with no session behind it) for little more.
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

- **A form opened before a sport is renamed can bring the old name back.** A rename moves
  the revision of each log, saved session and workout it touches, but not the plan's
  (ADR-041), so a plan edit or coach proposal opened before it can still save the old name,
  which then joins the list as a sport of its own, grey until recoloured or merged.

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
- **A changed setup is not noticed by a resend of the same open plan form.** The
  repeat-protection fingerprint covers the goal and memory revisions, not the profile, so
  a setup changed in another tab while the form stays open replays the earlier proposal;
  reloading the page asks afresh. Owner, 21 Oct 2026: kept, since it costs nothing and
  changes nothing, and a fix needs a profile revision (migration) and a key renewal that
  must not undo the 17 Oct 2026 replay protection.
- **The roadmap coach is not told which dates of a series differ.** A rule is sent as the
  series stands (ADR-013, amended 2 Oct 2026): a cancelled or deleted occurrence is not
  listed, and an edited or moved one appears both as its own dated entry and
  inside the rule.
