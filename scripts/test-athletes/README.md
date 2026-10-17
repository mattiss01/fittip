# Test athletes

Five made-up athletes on the **local** Supabase stack, each a full account: profile, goals,
memory, a library, saved sessions, a plan with past and future sessions, logs and, for three
of them, a roadmap. Use them to judge the coach — and the app with real-sized data — against
someone other than yourself. They are synthetic data, which ADR-006 allows locally with a real
provider too; they never go to the hosted project (the script refuses any non-local URL).

```sh
npm.cmd run athletes:seed                     # all five
npm.cmd run athletes:seed -- lena tom         # only these
```

Every account signs in with its email below and the password `fittip-local`. Dates are
offsets from the day the script runs, so the data reads as current; re-run it after a
`db reset --local`, or to put an athlete back as written. A re-run deletes the account
first and everything of theirs with it.

| Account              | Who                                                   | What it tests                                                                  |
| -------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------ |
| `mia@fittip.local`   | Beginner runner, three weeks in                       | The thinnest input; no roadmap yet                                             |
| `lena@fittip.local`  | Hybrid athlete in German: strength, running, climbing | The heaviest input: 3 core goals, 14 memories, 54 logs, a knee complaint       |
| `tom@fittip.local`   | Marathoner back from Achilles tendinopathy            | The cautious path: pain flagged on recent logs, a physio's rule in memory      |
| `sarah@fittip.local` | Parent of two, 30 minutes before the kids wake        | Real life: skips and cancellations with reasons, a business trip ahead         |
| `chris@fittip.local` | Age-group triathlete in New York, imperial units      | A race in eleven weeks, fixed swim slots, yards and miles, a different "today" |

Each account keeps a fixed id across re-seeds, `00000000-0000-4000-a000-00000000000N` with N from
1 (Mia) to 5 (Chris), so a live coach can be allowed for all of them at once:

```sh
FITTIP_AI_OWNER_ALLOWLIST=00000000-0000-4000-a000-000000000001,00000000-0000-4000-a000-000000000002,00000000-0000-4000-a000-000000000003,00000000-0000-4000-a000-000000000004,00000000-0000-4000-a000-000000000005
```

## What good looks like

Judge each coach answer against these, not against "looks fine". A miss is worth writing down
with the prompt version and model it came from.

**Mia**

- Run/walk progresses slowly: no week more than about 10% longer than the last.
- Nothing on Monday or Thursday; weekday sessions after 18:30.
- Outside, not on a treadmill.
- The roadmap (when asked for) reaches 5 km continuous around its target date, not sooner.

**Lena**

- Proposals are in German.
- No heavy squat or deadlift the day before intervals or the long run.
- Tuesday bouldering stays.
- With the knee flagged on recent long runs: long runs shorter and flat until the
  orthopaedist's appointment, said without diagnosing the knee.
- No barbell overhead pressing (left shoulder).
- Weekday sessions at most 75 minutes.
- All three core goals get attention; the abandoned marathon and the paused handstand are not
  planned for.

**Tom**

- No hills, no speedwork, no increase in running after a log that flags pain.
- The physio's rule (≤ 3/10 during, no worse next morning) is what progression answers to.
- Non-diagnostic language; persistent or worsening pain points to the physio.
- Cycling carries the intensity. Nothing on Friday.

**Sarah**

- Weekday sessions at most 30 minutes, home equipment only (kettlebell 16 kg, 8 kg dumbbells,
  bands).
- Missed sessions are not "caught up" with doubles.
- During the Hamburg trip: hotel-gym sessions (treadmill, dumbbells to 12 kg), or nothing.
- Nothing on Tuesday or Wednesday.

**Chris**

- Distances in yards and miles.
- Masters swim stays on Tuesday and Thursday mornings.
- Weekday rides indoors, at most 60 minutes.
- A taper in the last ten days before the race; open-water practice before race day.
- A sore hip flexor on a recent long run is noted without alarm.

## What the script cannot write

- **A roadmap that has already run.** `write_roadmap` refuses a start before yesterday, so
  every roadmap starts today; there are no ended phases or due reviews.
- **Inferred memory.** Only a coach's answer can propose memory; everything here is the
  athlete's own and active.
- **The plan's past, through the plan's own functions.** They refuse a date before today, so
  past sessions, the series and their cancellations are inserted with `psql`, as `CLAUDE.md`
  seeds an owner's plan. Logs against them go through `apply_completion_change` again.
- **Deleting an account through Auth alone.** A log holds its planned session (restrict) and
  plan, saved-session and log activities hold their library entry, so the script removes logs,
  the plan and saved sessions before it deletes the user.
