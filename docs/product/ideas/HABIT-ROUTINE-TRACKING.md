# Parked idea — habit and routine tracking

**Status:** parked, 10 August 2026. Not approved, not scheduled, no milestone.
**Owner decision:** the product owner asked for this to be left out for now.

This file exists so the research behind the idea is not repeated the next time
it comes up. It is **not** a feature brief. Nothing here is approved, and no
F-number, milestone, backlog folder, ticket, or rule amendment has been created
for it. If the idea is revived, the work starts at a feature brief that goes
through the normal product-owner gate.

## The idea, as stated

Track daily and weekly habits, including a named morning routine performed every
day. Three scoping answers given on 10 August 2026 shape the rest:

- **Any life habit**, not only training-adjacent ones.
- **No coach involvement at all.** The AI neither reads habits nor proposes
  them.
- Tracked four ways: done / not-done, a quantity per day, a grouped routine, and
  **streaks with history**.

## What the research found — the part worth keeping

Two findings make this larger than it first appears. Both were established
against the code and documents as they stood on 10 August 2026, so re-verify
before relying on them.

**1. "Habit" is entirely new domain vocabulary.** The word appears nowhere in
`CONTEXT.md`, in any feature brief, ticket, ADR, or validation record.
`docs/agents/domain.md` treats new vocabulary as a deliberate stop signal:
either the language is being invented unnecessarily, or there is a real gap.
Here it is a real gap, which is why a glossary pass would have to come first.

**2. Nothing in the schema expresses repetition.** Every planned thing is one
row on one concrete `date`, inside an immutable version spanning at most seven
days (`detailed_plan_versions_day_count_check`), and past dates are frozen by
`src/server/training/past-plan-protection.ts`. "Do this every day, indefinitely"
is not expressible today. Goals are outcome-shaped rather than behaviour-shaped:
`desired_outcome` is `not null`, there is no "N times per week" anywhere, and
there is no foreign key between goals and sessions.

## The two governance decisions it would force

Neither has been taken. Both are recorded here because they are the reason this
is not a small feature.

**Streaks would need a habits-only carve-out.** `.claude/rules/ui.md` forbids
implying "a completion, score, streak, trend, or coaching judgment", and that
rule is repo-wide rather than M1-scoped — it is restated in F-002, in three M1
tickets, and in `M1-04-VALIDATION.md`. The argument for amending it is that a
streak motivates a habit in a way it misleads for training. Any amendment would
have to say explicitly that it does not reopen streaks for training, Progress,
or plan/actual history. Accepted validation records are permanent history and
must not be edited to suit it.

**It would want to be its own milestone.** It depends on nothing beyond M0
authorization and blocks nothing, so it can be built in parallel — but
`AGENTS.md` allows only one implementation builder at a time, so "parallel"
means "independent of other work", not "concurrent with it".

## The open decisions a brief would have to raise

These are the questions that have no obvious answer, listed so they are not
rediscovered one at a time during implementation.

1. **Can a missed day be backfilled, and how far back?** Training freezes the
   past deliberately. Habits almost certainly want the opposite, which means
   consciously departing from an established rule rather than drifting from it.
2. **What happens to history when a habit's recurrence changes?** Training
   solved this with immutable versions plus a head pointer. Habits could reuse
   that or accept mutation. This is the single biggest data-model fork.
3. **Is a routine a habit containing items, or a group of habits?** The morning
   routine example needs this answered before any table exists.
4. **Does archiving a habit destroy its history?**
5. **The exact wording of the streak-rule amendment**, given that four accepted
   documents currently state the opposite position.

## Where it would land, if revived

- A new route `/home/habits` for defining and managing habits, alongside the
  existing `/home/plan`, `/home/log`, `/home/progress`, `/home/you`.
- A habits section on `/home/today`. That page already resolves the owner-local
  date via `isoDateInTimezone(new Date(), timezoneName)`; reuse it rather than
  computing a date a second way.
- **Not** `/home/progress`. Progress is explicitly a factual plan-versus-actual
  ledger, so habit history belongs on the habit surface — otherwise the streak
  carve-out leaks straight back into the training ledger.

## Patterns it should reuse rather than reinvent

- **The CAS write path.** Every user-data table except `personal_activities` is
  read-only to `authenticated`, with all mutation through a `security definer`
  RPC taking `p_expected_revision` and raising `PT409` on mismatch. See
  `apply_goal_change` in
  `supabase/migrations/20260729161854_m2_01_goal_model.sql` and
  `apply_memory_change` in `20260801085404_m2_02_memory_model.sql`.
- **Quantity tracking already has a shape.** `personal_activities` carries
  `measurement_mode` plus `default_measurement jsonb`, and
  `completed_activities` carries `actual_measurement jsonb`. Reuse that for
  "8 glasses of water" rather than inventing new columns.
- **Versioned history with a head pointer**, if open decision 2 goes that way:
  `detailed_plan_versions` + `detailed_plan_heads`, and `completion_heads` for
  the append-only correction chain.

## Non-goals that were already agreed

Each is a boundary someone would otherwise erode: no AI involvement of any kind;
no notifications or reminders (the product plan defers those to "Later"); no
social, sharing, or comparison; no import from wearables; and no coupling to
goals, plans, or completions.
