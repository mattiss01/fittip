# F-002: Manual training planning and factual tracking

**Status:** accepted — M1 milestone closeout recorded 29 July 2026

**Milestone:** M1

**Tickets:** [M1-01](../backlog/M1/M1-01-TRAINING-RECORDS-FOUNDATION.md),
[M1-02](../backlog/M1/M1-02-SELECTABLE-HORIZON-PLANNING.md),
[M1-03](../backlog/M1/M1-03-QUICK-TRAINING-LOGGING.md),
[M1-04](../backlog/M1/M1-04-TODAY-PROGRESS-NAVIGATION.md), plus the retired
[M1-05 proposal](../backlog/M1/M1-05-M1-VALIDATION-SLICE.md) and its targeted
[M1 milestone closeout](../validation/M1/M1-MILESTONE-CLOSEOUT.md)

## User problem

FitTip currently proves account access and isolation but does not help the
owner train. Starting with goals and memory would create configuration screens
before a usable daily workflow.

The first product capability should let the owner decide what training is
planned, see what is relevant today, record the facts of what happened, and
retain a truthful comparison between the two.

## Intended outcome

On mobile, the owner can:

1. choose how many of the next 1–7 days to plan and create that
   sport-agnostic plan manually;
2. add sessions and personal activities without a global exercise library;
3. see today's planned training;
4. record completed, partial, skipped, replaced, rest, or unplanned training;
5. inspect planned versus actual and earlier versions;
6. correct an actual record without erasing the original fact.

This gives FitTip a usable foundation before goals, memory, intake, AI
generation, or replanning are added.

## Proposed user journeys

### Plan a selected horizon

1. Open **Plan**.
2. Select a requested day count from 1 through 7 and confirm the start date,
   defaulting to today.
3. FitTip shows exactly that many consecutive owner-local dates.
4. Add a session to a date.
5. Enter title, sport/domain, intent, expected duration, and optional note.
6. Add arbitrary activities with instructions, measurement mode, target, and
   units, or reuse an owner-created personal activity.
7. Review changes and explicitly choose **Save plan**.
8. FitTip creates a new accepted manual plan version and preserves the prior
   version.

### Use Today

1. Open **Today**.
2. See the local date and every planned session in order.
3. If nothing is planned, see **No training planned** and one route to Plan.
4. Open a session or choose **Log training**.
5. FitTip never treats a planned session as completed merely because its date
   has passed.

### Record actual training

1. Start from a planned session or choose **Log unplanned training**.
2. Select the factual outcome.
3. Optionally record date/time, duration, perceived effort, feeling, note, and
   activity results.
4. Review **Planned** and **Actual** as separate sections.
5. Choose **Save actual**.
6. A correction creates a visible revision; it does not silently overwrite the
   original.

### Review progress

1. Open **Progress**.
2. Browse accepted plan versions and factual completions.
3. Open a detail showing planned and actual side by side.
4. Inspect the current correction and prior factual revisions.

## Affected data and rules

- Every record is owned by authenticated `user_id` with server checks and RLS.
- Personal activities, plan versions with requested `day_count` from 1–7,
  planned sessions/activities, completed
  sessions/activities, and revisions are distinct owner-scoped records.
- A plan save creates a new immutable accepted version.
- A completion may reference but never mutate its source planned session.
- Unplanned training requires no planned-session reference.
- Personal-activity edits affect future reuse only, not historical snapshots.
- Measurement modes remain sport-agnostic:
  `sets_reps_load`, `time_distance_pace`, `duration_intensity`,
  `skill_repetitions`, and `custom`.
- Free text and health-adjacent flags are never sent to logs, analytics, or an
  external service.
- Founder staging permits only product-owner or synthetic data.

## Recommended product decisions

1. Require a visible day count from 1 through 7 and store it with the plan
   version; recommend 7 as the first-use default and the last selected value
   thereafter, while never silently expanding a shorter request.
2. Use an explicit **Save plan** action and create a new version; do not
   autosave accepted content.
3. Use a vertical selected-horizon mobile list rather than a compressed
   calendar grid.
4. Represent an empty day as **No training planned**; explicit rest is an
   optional session with intent.
5. Require only outcome status for quick logging. Replacement additionally
   requires an actual description.
6. Use optional 1–10 perceived effort and a five-value feeling scale.
7. Use append-only correction revisions with a visible reason/current pointer.
8. Include optional pain/illness/injury/severe-fatigue flags only with static,
   conservative, non-diagnostic copy; never modify the plan automatically in
   M1.
9. Show Today, Plan, Progress, and You in M1; keep Coach absent until it has real
   behavior.
10. Keep detailed/per-set logging secondary; M1's primary flow is a quick
    factual summary.

## Open decisions requiring product-owner approval

- Exact day-count selector, first-use default, whether the last selection is
  remembered, plan/session/activity fields, limits, labels, units, and error
  copy.
- Plan version/current-pointer and concurrent-save architecture.
- Personal-activity edit/archive/delete behavior.
- Completion correction and deletion/retention behavior.
- Outcome requirements, effort/feeling scales, note limits, and sensitive
  flags.
- Navigation destinations/order/icons, Today card density, Progress labels, and
  You composition.
- Touch targets, focus, contrast, motion, safe areas, desktop adaptation, and
  all visible empty/loading/error/offline/session-expiry states.

## Non-goals

- Goals, memory, intake, AI generation, coaching chat, or replanning.
- Global exercise/activity library, templates, recurring schedules, calendar
  sync, wearable imports, notifications, or offline write queue.
- Trend claims, performance scoring, streaks, leaderboards, social sharing, or
  public profiles.
- External analytics, friends, public registration, commercial use, or
  production.

## Acceptance criteria

1. The complete select 1–7 days → plan → Today → actual → Progress flow works
   at `390x844`.
2. Another authenticated user cannot access the owner's records.
3. At least five sport/measurement examples fit without strength-first
   assumptions.
4. The saved plan has exactly the selected number of consecutive owner-local
   dates, and previous plan versions remain available after changes.
5. Logging and correcting actual training never changes the source plan.
6. Replaced and unplanned training remain truthful and separately represented.
7. Historical activity snapshots survive personal-definition edits.
8. Empty/error/conflict/offline/session states are honest and accessible.
9. No AI, analytics, external-user behavior, or secret is added.
10. Automated database/RLS, domain, component, and Playwright tests cover the
    core flow and invariants.

## Validation plan

- Implement and independently accept M1-01 through M1-04 one at a time.
- Reuse their recorded clean-migration, RLS, invariant, mobile, accessibility,
  privacy/security, and regression evidence rather than repeat it in M1-05.
- Run the approved targeted hosted M1 closeout: current deployment and
  migration/RLS/advisor state plus one `390x844` Plan to Today to actual to
  Progress smoke.

## Approval boundary

The product owner approved this feature brief in chat on 28 July 2026. That
approval establishes the governing behavior for M1 but does not dispatch every
M1 ticket. M1-01 through M1-04 were separately accepted. On 29 July 2026 the
product owner retired M1-05 and approved the targeted M1 milestone closeout.
The product owner completed the private hosted walkthrough and the milestone
closeout was accepted on 29 July 2026.
