# F-005: One rolling training plan

**Status:** approved — approved by the product owner on 14 August 2026;
implementation remains separately gated

**Date approved:** 14 August 2026

**Clean-break sequence revised:** 14 August 2026

**Milestone:** M3

**Approved architecture:**
[ADR-016](../decisions/ADR-016-ROLLING-TRAINING-PLAN.md)

**Replaces for future delivery:** the bounded manual-plan model in
[F-002](F-002-MANUAL-TRAINING-PLANNING-TRACKING.md) and the unapproved former
F-005 draft. Accepted governance and validation documents remain permanent
history; the early clean reset deliberately deletes old-model plan, proposal,
completion, and correction data and removes the legacy runtime and schema.

## User problem

FitTip currently makes the owner choose a 1–7-day horizon before planning
manually. Each save creates another immutable whole-plan version, even when the
owner only wants to add, move, or remove one future session. This turns a
continuous training calendar into a sequence of short plans and makes ordinary
manual planning feel like version management.

The 1–7-day bound is valuable for an AI request: it limits context, output,
cost, review effort, and the scope of a proposed change. It is not a natural
limit on the owner's own training plan.

Recurring training is also absent. An owner who swims every Tuesday or trains
every three days must currently recreate each session by hand.

## Intended outcome

Each owner has one continuous **rolling training plan**. It has no product-level
start or end date. The owner can add one-off sessions on any eligible future
date and can create open-ended or date-bounded recurring session series.

Each owner also has a private **saved session library**. A planned session can
be saved there as a reusable template, and a saved session can be copied into a
new one-off or recurring session without rebuilding the same training by hand.

The AI Coach still plans exactly 1–7 consecutive owner-local dates. Its result
is a bounded proposal for changes to that slice of the rolling plan, not a new
plan. The owner stages a choice for each suggestion and then finishes the
review. Only the reviewed **Will be added** items enter the rolling plan, in one
change set, without rewriting its past or completed training.

Proposal review shows the current planned sessions and the Coach suggestions
together for every date in the horizon. Existing content remains visibly
distinct and read-only in this flow, so the owner can understand the resulting
week before deciding on any suggestion.

The owner sees one plan and one understandable history. Internally, current
session rows stay simple while their change log remains append-only and
attributable so convenience does not erase truth.

## Domain language

The approval of this brief adds these terms to `CONTEXT.md`.

**Rolling training plan**:
The owner's single continuous collection of planned training. It is queried by
date but is not itself constrained to a horizon.

**Planned session**:
One dated intended training session in the rolling training plan. It has a
stable identity, one current state, and append-only change history.

**Saved session**:
An owner-private, reusable session template with no planned date or completion
state. Reuse copies a snapshot into the rolling plan; it is not a live link.

**Recurring session series**:
One owner-defined rule and session template that describes repeated planned
sessions over owner-local dates.

**Occurrence**:
One dated instance of a recurring session series. It may inherit the series or
carry an explicit exception.

**Plan change set**:
One atomic owner-approved group of additions, edits, moves, cancellations,
locks, or recurrence changes. It records before/after values and manual or
proposal provenance in the append-only plan change log.

**AI planning horizon**:
The exact 1–7 consecutive owner-local dates covered by one AI plan proposal.
It bounds the coaching operation, not the rolling training plan.

**Recovery day**:
An optional day-level planning label expressing a recovery intention. It is not
a session and may coexist with planned sessions.

## Conceptual model

```text
One owner
  -> one rolling training plan
       -> one-off planned sessions
       -> recurring session series
            -> dated occurrences and exceptions
       -> current session state and append-only plan change log
  -> one private saved session library
       -> reusable saved sessions
            -> copied snapshots in one-off sessions or recurring series

AI Coach request for 1–7 dates
  -> immutable proposal
       -> staged per-item Proposed / Will be added / Rejected choices
       -> Finish review
            -> one plan change set containing only Will be added items
                 -> rolling training plan
       -> optional regeneration of unresolved items with feedback

Completed sessions remain separate factual records.
```

## Owner journeys

### Add one planned session

1. Open **Plan** and navigate to a date. Manual planning shows no day-count
   selector.
2. Choose **Add session**.
3. Enter the existing sport-agnostic session fields and optional activities.
4. Review and save.
5. The session appears in the rolling plan. The save records its current row
   and one initial plan change entry in the same transaction.

### Change future training

1. Open a future planned session.
2. Edit, move, duplicate, lock, unlock, or cancel it.
3. Review the change and save.
4. The session keeps its stable identity, its current row is updated, and a
   before/after change entry makes the prior state inspectable.

Past or completed training cannot be changed through planning. Factual
completion correction remains the separate accepted correction flow.

### Save and reuse a session

1. From a session editor or an existing owned session, choose **Save session**.
2. Give the saved session a recognizable name and review the reusable session
   and activity fields. Date, completion state, plan locks, and history are not
   saved as template content.
3. Later, choose **Add from saved sessions**, select a private saved session,
   choose a date or recurrence, and review before adding it to the plan.
4. Adding it copies the saved session's current fields into the new planned
   session. Editing or deleting the library entry later changes no existing
   planned, recurring, or completed training.

### Add recurring training

1. Create a session and choose **Repeat**.
2. Select every day, every N days, or every N weeks on selected weekdays.
3. Choose a start date and optionally an end date. No end date means the series
   continues.
4. Review the first occurrences and save the series.
5. Plan, Today, AI context, and conflict checks expand only the requested date
   slice; FitTip never creates infinite future rows.

### Change a recurring occurrence

1. Open one occurrence.
2. Choose **Only this session** or **This and future sessions**.
3. Saving one session creates an exception. Saving this and future closes the
   prior effective series segment and creates its successor.
4. Earlier occurrences and completed training remain unchanged.

### Ask the AI Coach to plan

1. Choose an AI planning horizon of 1–7 consecutive owner-local dates and add
   an optional planning note.
2. FitTip shows the existing manual, recurring, and locked training in that
   slice as part of the bounded context disclosure.
3. The coach returns the accepted `fittip.seven-day-plan.v2` session-level
   proposal. It changes nothing by itself.
4. The result groups the horizon by day and composes the live rolling-plan
   slice with the immutable proposal. Existing sessions use **Already planned**
   and an optional source label such as **Manual**, **Recurring**, or
   **Previously accepted**. Proposed content uses **Coach suggestion**.
5. Existing sessions have no proposal decision controls, but **Edit planned
   session** opens the normal Plan editor without leaving the review. Saving
   immediately updates the Plan and its history, refreshes the current-plan
   layer, and shows a non-blocking warning that the suggestions were generated
   before that change. Regeneration is optional.
6. Each Coach session suggestion and proposed **Recovery day** label starts
   **Proposed**. The owner may mark it **Will be added** or **Rejected** and
   revise that choice before finishing.
7. **Finish review** revalidates every **Will be added** item against current
   manual, recurring, accepted-AI, capped, or locked content. If any item fails,
   nothing is applied and the conflicting cards explain what needs attention.
8. On success, FitTip adds every **Will be added** item in one plan change set,
   records the rejected decisions, and adds no still-proposed item. The owner
   must decide every item before finishing or explicitly discard the proposal.
9. **Discard proposal** adds nothing and does not undo edits already saved to the
   Plan. If any item is **Will be added**, FitTip
   first names how many staged sessions and **Recovery day** labels will not
   enter the Plan and requires explicit confirmation.

### Review history

1. Progress shows completed training separately from planned history.
2. Plan history is organized by understandable changes, for example "Added
   Tuesday swim series" or "Accepted two Coach sessions", rather than by a
   sequence of entire short plans.
3. Opening a change shows the affected sessions and their before/after values.
4. A completed session continues to show the immutable planned snapshot it was
   compared with.

## Product rules

### One plan, bounded views

- Each owner has exactly one rolling training plan.
- The plan has no day count, start date, end date, season, or current-version
  identity in the product model.
- Every read is date-bounded: Today reads one date, Plan reads a visible slice,
  Progress reads a paginated history slice, and the AI reads its exact approved
  horizon plus separately bounded training history.
- The owner can add manual sessions on owner-local today or a future date. Past
  activity is recorded through completion/logging, not retroactive planning.
- Multiple sessions on one date remain valid. The AI keeps its accepted limit
  of three sessions per date; a separate decision below sets the manual limit.

### History and mutability

- The rolling plan is one stable identity, not a mutable bag with no history.
- History begins with the rolling-plan model's first write. The one-time clean
  reset deletes the founder/test data named below and is not a reusable
  replanning or deletion rule.
- Planned sessions have stable identities and one directly readable current
  row. Every accepted manual or AI action updates current state and appends its
  before/after plan change entries in one server-controlled transaction.
- One plan change set groups all entries produced by one atomic owner action.
- Removing future training marks the current session cancelled and records the
  change. It does not hard-delete the session or its earlier state.
- After each replacement model's first write, past planned states, completed sessions,
  completed-activity snapshots, and completion corrections remain immutable.
- A monotonic owner plan revision provides stale-write and concurrency checks
  without exposing whole-plan versions as separate plans.

### Recurrence

- V1 recurrence is deliberately constrained: daily with an interval, or weekly
  with an interval and selected weekdays.
- Dates are calculated as owner-local calendar dates. "Every three days" is
  not a 72-hour UTC timer and must remain correct across daylight-saving
  transitions.
- A series has a start date and optional end date. Open-ended means no end date,
  not pre-created infinite occurrences.
- A session template carries the same sport-agnostic session and activity
  fields, measurement modes, targets, and locks as a one-off session under the
  approved contract.
- One-occurrence changes are explicit exceptions. This-and-future changes use
  effective-dated successor series. Past occurrences are never rewritten.
- Completed occurrences retain their planned snapshot even if the future
  series changes.

### Private saved session library

- Every saved session is owned by exactly one user and is visible and reusable
  only by that owner. There is no global, shared, public, or coach-authored
  template library.
- A saved session contains reusable sport-agnostic session fields and activity
  targets. It contains no planned date, occurrence identity, completion state,
  plan lock, proposal decision, or history from the source session.
- Saving an eligible owned session or Coach suggestion copies its reusable
  fields into a new saved session. It does not add, move, accept, or otherwise
  change Plan content or proposal decisions. Discarding the proposal later does
  not undo the separate library save.
- AI proposals and accepted AI sessions never enter the saved-session library
  automatically. Saving reusable content always requires an explicit owner
  action.
- Reusing a saved session copies its current fields into a new one-off session or
  recurring-series template. The resulting training is independent, with no
  live link or later synchronization.
- A saved session is one editable current library record, with no revision chain
  or archive state. Editing affects only future copies. Deleting removes the
  library entry and changes no training already created from it.
- Duplicate or similarly named library entries are allowed. V1 performs no
  automatic duplicate detection, merging, or replacement.
- Same-owner references, RLS, explicit privileges, and owner-derived writes
  prevent one user from reading, copying, changing, or inferring another
  user's saved sessions.

### AI proposals and per-session decisions

- The AI operation remains bounded to 1–7 consecutive owner-local dates and
  uses the existing schema, prompt version, validation, safety, idempotency,
  cost, and provider boundaries unless a later approved ticket says otherwise.
- The proposal records the current rolling-plan revision and minimized source
  references used for generation.
- The AI receives the current planned sessions and **Recovery day** labels in
  its exact horizon and must account for them. Those records remain rolling-plan
  content and are not copied into the immutable proposal as suggestions.
- Proposal review is one composed, day-by-day view of two record sets: current
  rolling-plan content and Coach suggestions. A plan change after generation
  refreshes the current layer without rewriting the proposal layer.
- Existing content uses a persistent text label such as **Already planned** and
  may additionally show **Manual**, **Recurring**, or **Previously accepted**.
  Coach content uses **Coach suggestion**. Shape, border, and action placement
  reinforce the distinction; color is never the only signal.
- Within each day, existing and proposed sessions appear in the same readable
  schedule rather than on disconnected screens. Days containing only existing
  sessions still appear in the review horizon.
- Only Coach suggestions expose the staged **Proposed**, **Will be added**, and
  **Rejected** choices. Existing sessions have no proposal decisions but expose
  **Edit planned session**, which opens the normal Plan editor within the review
  surface and retains its usual validation, recurrence-scope, lock, and history
  behavior.
- Saving an existing-session edit writes it immediately as a normal Plan change
  set, advances the plan revision, and refreshes the current-plan layer without
  rewriting the immutable proposal. Discarding the proposal does not undo that
  separately confirmed Plan edit.
- After such an edit, keep every staged proposal choice unchanged and show a
  non-blocking warning such as **Your Plan changed after these suggestions were
  created.** The owner may regenerate or continue reviewing. Regeneration is
  never forced solely because the Plan changed.
- Staged choices are reversible review input and change no plan content.
  **Finish review** is the deterministic owner action and makes no provider
  call.
- Finishing applies all **Will be added** items atomically as one plan change
  set after revalidating them against the current Plan. An invalid, unsafe,
  over-limit, locked, conflicting, or concurrently stale finish causes the whole
  operation to write nothing; the fact that the Plan changed after proposal
  generation does not by itself block finishing.
- An explicit AI recovery recommendation becomes a proposed day-level
  **Recovery day** label, separate from session suggestions. Accepting it labels
  the date; rejecting it does not. An empty date without that explicit label
  remains unplanned.
- A rejected item changes no plan content. Closing the proposal leaves every
  still-proposed item out of the plan.
- **Finish review** is available only after every proposed session and
  **Recovery day** label is **Will be added** or **Rejected**. **Discard
  proposal** is the separate way to close an unfinished review without applying
  anything.
- Discarding with staged **Will be added** items requires confirmation such as:
  “Discard this proposal? 3 sessions and 1 Recovery day label marked ‘Will be
  added’ will not be added to your Plan.” The actions are **Keep reviewing** and
  **Discard without adding**. Omit a zero category from the message.
- Proposal-level reasoning remains immutable evidence of what the coach
  proposed. After partial acceptance it is not presented as a description of
  the current rolling plan.
- An accepted session never silently replaces existing content. A conflict
  requires a separately reviewed keep-both, move, replace, or cancel decision.
- A **Recovery day** label is independent from the date's sessions and may
  coexist with stretching, mobility, walking, or any other session. FitTip does
  not automatically classify a session as consistent or inconsistent with the
  label, and adding or removing sessions never changes the label.
- Locked future sessions cannot be replaced, moved, or cancelled by an AI
  proposal. The owner may explicitly unlock them through manual planning.
- Regeneration requires actionable feedback. Overall feedback is mandatory
  unless at least one rejected item has feedback. Per-session feedback remains
  optional for rejected and still-proposed items; **Will be added** items have
  no feedback field because their choice already means keep unchanged.
- A successor proposal deterministically carries **Will be added** items
  forward unchanged, omits rejected items from the new review, and lets the AI
  keep or revise still-proposed items. Rejected content and optional feedback
  remain visible only in the immediate predecessor evidence supplied to the AI.
- Regeneration remains a fresh request and charge for the same horizon, uses
  only the immediate predecessor, and retains the three-round chain cap.
  Feedback is bounded request context and never becomes memory automatically.

### Ownership, privacy, and safety

- Every rolling-plan, session, revision, series, exception, change-set, saved
  session, and proposal-decision record has immutable owner scope. Same-owner
  references are enforced server-side and by composite database constraints and
  RLS.
- Authenticated access never trusts an owner id supplied by the browser.
- Direct mutation grants stay revoked where an owner-derived transaction is
  required. Any privileged database function requires explicit grants, an
  empty `search_path`, bounded lock waits, and focused security review.
- Planned and completed records remain separate. AI output remains a validated
  proposal until the owner accepts a specific change.
- The accepted conservative, non-diagnostic safety behavior remains unchanged.
  Neither free text nor elapsed time assigns severity or recovery.
- Owner/synthetic local and founder-hosted use only. No external-user,
  commercial, analytics, credential, provider, model, or spend expansion is
  authorized here.

## Migration and compatibility strategy

- Use forward migrations only. Never edit an applied M1 or M3 migration.
- After the accepted M3-10 foundation, remove the legacy training model before
  building its user-facing replacements. Do not backfill, translate, export, or
  show old-model training data in the new model.
- In one dedicated, auditable reset, delete all rows from
  `plan_proposal_decisions`, `plan_proposal_sources`, `plan_proposals`,
  `plan_generation_requests`, `completed_activities`, `completion_heads`,
  `completed_sessions`, `planned_activities`, `planned_sessions`,
  `detailed_plan_heads`, and `detailed_plan_versions` in a constraint-safe
  order, then drop those legacy tables and their exclusive functions, triggers,
  policies, grants, indexes, constraints, and database types.
- Remove the corresponding legacy application modules, routes, actions,
  components, fixtures, tests, and generated type surface. Shared validation or
  personal-activity machinery stays when a preserved or replacement domain
  still needs it. No callable or dead compatibility implementation remains.
- The reset includes accepted and rejected AI plan proposals, accepted plan
  versions, planned sessions and activities, completions, correction revisions,
  completion heads, and their old-model provenance. No in-app legacy archive or
  restore path is created.
- Preserve authentication and profiles, goals, explicit memory, onboarding,
  roadmap proposals and accepted roadmap versions, personal activity
  definitions, AI spend/accounting records, and security/audit evidence.
- Roadmap source metadata may contain minimized IDs for deleted plan or
  completion records. Preserve the roadmap record, but make any undecided
  proposal that depends on such a source explicitly expired and impossible to
  accept; never reinterpret the missing source as current.
- Before deletion, deploy maintenance-safe Plan, Today, logging, Progress,
  roadmap, and plan-proposal surfaces that make no legacy database call.
  Preserve roadmap records while their completion-dependent runtime is
  unavailable. Restore each replacement surface only through its approved
  ticket, with `/home/plan` returning directly as the continuous Plan.
- New tables in exposed schemas require deliberate Data API grants, RLS,
  owner/anonymous/cross-owner tests, and indexes for owner/date, active series,
  current revision, and source lookups.
- Before deletion, record row counts and dependency checks without exporting
  row contents. Test the exact migration from a clean reset and from a seeded
  old-model database, including preserved-record counts and dangling-reference
  checks.
- Do not create a manual backup or training-data export for the reset. Verify
  and record any provider-managed retention that cannot be removed by this
  application migration without presenting it as an application recovery path.
- The reset ticket requires independent review of the exact commit and a
  green CI run. Its Vercel Preview verifies the maintenance state and every
  non-destructive hosted preflight available against the unchanged founder
  database; Preview verification must not apply the destructive migration.
- Rollback is supported only before the destructive transaction commits. After
  commit the application has no legacy-data rollback; infrastructure backups
  may still retain deleted bytes under the database provider's retention rules.
- The founder database reset needs a separately approved runbook and an
  explicit **Run the destructive cutover** confirmation against the exact
  independently reviewed commit. This is a narrow exception to the ordinary
  requirement to apply a committed migration before Preview acceptance; it does
  not weaken any earlier ticket's hosted migration evidence.
- After final confirmation, apply the exact migration, reconcile remote
  migration history, and immediately verify authentication, removed-object
  absence, preserved-domain counts, the M3-10 schema/RLS/privileges/functions,
  advisors, authenticated empty Plan reads, denied cross-owner access, and the
  approved maintenance surfaces.

## Proposed deep modules

One rolling-plan module should hide recurrence expansion, change logging,
conflict detection, concurrency, ownership, and persistence behind a small
server-side interface:

```ts
getPlanSlice(startDate, endDate)
applyChangeSet(changes, expectedPlanRevision)
changeRecurringSeries(seriesId, scope, change, expectedPlanRevision)
```

The interface returns explicit receipts and conflicts. UI callers never expand
recurrence, construct owner ids, split a current-state update from its history
entry, or write plan tables directly.

A sibling saved-session module owns private template listing, creation, editing,
deletion, and current-value retrieval. The rolling-plan module accepts a saved
session identity as one input to a change set and resolves the owner-matched
current fields server-side before copying them; the resulting session has no
continuing dependency on the library entry. Tests exercise both interfaces
through in-memory and Postgres adapters; their internal representations are not
part of either interface.

## Acceptance criteria

1. An authenticated owner has one rolling training plan and can add, edit,
   move, duplicate, lock, unlock, and cancel eligible future one-off sessions
   without selecting a plan horizon.
2. The clean reset removes every old-model plan, plan proposal, planned
   session/activity, completion, and completion-correction record plus its
   exclusive schema/runtime surface, creates no replacement copy, and leaves
   the explicitly preserved domains and M3-10 foundation unchanged.
3. Daily, every-N-days, weekly, and every-N-weeks series expand correctly over
   bounded owner-local date slices, including DST boundaries, optional end
   dates, and open-ended series.
4. One-occurrence and this-and-future edits create the approved exception or
   successor behavior without rewriting earlier occurrences.
5. Today, Plan, Progress, logging, and AI context show the same planned session
   state for the same owner-local date.
6. The AI still proposes exactly 1–7 dates. Existing manual, recurring,
   previously accepted, locked, and **Recovery day** content is supplied as
   context and remains visible in the day-by-day review under a non-proposal
   label.
7. The owner can stage **Will be added** or **Rejected** for each proposed
   session and **Recovery day** label, revise those choices, and finish once.
   Only **Will be added** items enter the plan; still-proposed items never do.
8. Finishing is idempotent and atomic, preserves proposal evidence, records one
   understandable plan change set, and writes nothing when any selected item
   fails revalidation. Discarding writes no plan content and warns about the
   exact count of staged **Will be added** sessions and **Recovery day** labels
   before confirmation.
9. An owner can edit an **Already planned** session through the normal Plan
   editor without leaving proposal review. The edit saves immediately and
   remains after proposal discard; the current-plan layer refreshes, staged
   choices remain unchanged, and a non-blocking warning offers optional
   regeneration. Finishing succeeds without regeneration when every selected
   suggestion passes current-state revalidation.
10. Stale, simultaneous, cross-owner, invalid, unsafe, locked, and conflicting
   changes write nothing and return an honest actionable result.
11. From each replacement model's first write onward, past planned states and all
    completed/corrected history remain immutable under manual planning,
    recurrence changes, AI proposals, migration, and retries.
12. Date-bounded queries use ownership/date and active-series indexes and do
    not scan or materialize an unbounded future.
13. Anonymous and cross-owner reads and mutations are denied by grants, RLS,
    same-owner constraints, owner-derived transactions, and direct tests.
14. The complete mobile paths pass at `390x844`, including long plan slices,
    recurrence editing, conflict review, proposal decisions, empty dates,
    loading, offline-safe failure, and session expiry.
15. Outside the explicit clean reset, no accepted-history rewrite, global
    activity library, external sink, secret, new provider/model, unapproved
    spend, friend, public registration, or commercial behavior is added.
16. An owner can explicitly save an eligible session or Coach suggestion to a
    private library without adding it to the Plan, create a new one-off or
    recurring session from its current fields, edit or delete the library entry,
    and see no change to training previously created from it. Duplicate entries
    are allowed and no revision history or live link is created.

## Non-goals

- No literally infinite stored occurrence set or unbounded database query.
- No arbitrary iCalendar RRULE editor, monthly/yearly recurrence, calendar
  import/export, wearable sync, notifications, or background reminder engine.
- No multiple named plans, team plans, coach-owned plans, reusable whole-plan
  templates, global/shared session library, or public plan sharing.
- No automatic AI acceptance, silent conflict resolution, or AI mutation of a
  recurring series.
- No retroactive planning of past training and no mutation of completions.
- No redesign of goals, memory, roadmap content, activity measurement modes,
  provider selection, model selection, or spend controls.
- No import, archive, export, compatibility view, or user-facing recovery path
  for pre-reset plan, proposal, or completion data.

## Delivery plan

This feature is too large for one implementation ticket. After product and
ADR approval, draft and deliver these slices sequentially. Founder-environment
continuity is not required during this replacement. M3-11 removes the legacy
training stack and later tickets restore the replacement surfaces sequentially.
No ticket may add dual writes, compatibility synchronization, or another route
merely to keep the old planning flow active.

1. **M3-10: Rolling-plan foundation — Tier 1.** New owner-scoped current-state schema,
   atomic append-only change log, plan revision, RLS, privileges, indexes,
   concurrency, and generated types, introduced without activating the new path
   or deleting old data.
2. **M3-11: Legacy training reset — Tier 1.** Delete all approved old-model
   training data, remove its exclusive database and application machinery,
   preserve the named non-training domains and M3-10 foundation, and deploy
   honest maintenance states before the irreversible founder migration.
3. **M3-12: Manual continuous planning — Tier 1.** Restore `/home/plan`
   directly as the continuous one-off Plan with understandable history.
4. **M3-13: Private saved-session library — Tier 1.** Owner-scoped templates,
   current-value copy reuse, edit/delete behavior, same-owner enforcement, RLS,
   and the mobile save/select/review flow.
5. **M3-14: Recurring session series — Tier 1.** Constrained rules, bounded expansion,
   occurrence exceptions, this-and-future changes, DST behavior, and history.
6. **M3-15: Replacement consumer readiness — Tier 1.** Restore Today, logging,
   Progress, roadmap operation, replacement completion/correction history, and
   the bounded completion-history interface for AI context.
7. **M3-16: AI proposal application — Tier 1.** Generate fresh proposals and adapt
   M3-03 proposal semantics into a combined current-plan/proposal timeline,
   staged per-item choices, one atomic **Finish review** action, conflicts,
   locks, source revalidation, and mobile review.
8. **M3-03B: Regeneration on the rolling plan — Tier 1.** Revise M3-03B after proposal
   application is accepted; preserve **Will be added**, omit **Rejected**,
   revise unresolved items, require overall feedback unless a rejected item has
   feedback, retain only the immediate predecessor, and keep the three-round
   chain cap.
9. **M3-17: Final rolling-plan closeout — Tier 3 unless defects require their
   own ticket.** Reconcile accepted evidence and verify the integrated founder
   experience. It performs no later cutover, activation switch, or data change.

Only one implementation builder may be active. Every ticket requires approval,
exact-commit evidence, and explicit product-owner acceptance before its
dependent work starts. Tier 1 and Tier 2 slices require a distinct builder and
reviewer plus Preview and hosted evidence under the working agreement. M3-17
uses the Tier 3 path unless a discovered defect is separately re-tiered.

## Existing governance affected

- [F-002](F-002-MANUAL-TRAINING-PLANNING-TRACKING.md), M1-01, and M1-02 remain
  accepted documentary history. Their runtime plan and completion rows are not
  retained through the approved clean reset.
- `CONTEXT.md` now replaces **Detailed plan version** and **Horizon** with the
  approved rolling-plan language, updates **Planned session**, **Proposal**,
  **Regeneration**, and **Replanning**, and adds the other terms above.
- [ADR-008](../decisions/ADR-008-M1-TRAINING-RECORD-TRANSACTIONS.md) remains the
  historical M1 decision and is superseded for new planning writes only by
  accepted ADR-016.
- M3-03 remains accepted documentary delivery history, but its stored plan
  generation requests, proposals, sources, and decisions are deleted. Its
  1–7-day contract becomes the AI planning horizon rather than the destination
  plan shape.
- M3-03B stays proposed and undispatched until the rolling-plan foundation and
  AI proposal-application contract are accepted.
- M3-03C is retired as a standalone ticket. Its roadmap-input and visible
  proposal-reasoning behavior moves into M3-16.
- M3-03D remains a deferred optional enhancement after closeout. It must link
  detail to a stable proposed or planned session rather than a whole accepted
  plan version.
- M3-04 is retired. M3-12 owns manual rolling-plan changes and M3-16 owns AI
  proposal application; its whole-version acceptance architecture must never
  be dispatched.
- M3-06 is retired if this model is approved because a rolling plan has no
  bounded start date. Its rule against retroactive planning moves here.
- M3-07 is retired without replacement. The approved Coach flow proposes
  additions beside existing Plan content and does not modify or supersede
  existing sessions. Any future Coach-driven replacement or cancellation is a
  new separately approved capability.
- M3-08 is retired as a standalone ticket. Its exact-sent-completion source rule
  moves into M3-15 while replacement AI context is built.
- M3-05 is retired. M3-17 owns the narrow final hosted end-to-end closeout;
  ticket-level review, CI, Preview, hosted evidence, and acceptance remain at
  every slice and are not duplicated by a second exhaustive validation pass.
- M3-09 remains a parked P3 roadmap-concurrency defect outside the replacement
  dependency chain.

## Approved product decisions

The product owner resolved the following individual decisions and approved this
feature brief and ADR-016 on 14 August 2026:

1. **Canonical name — decided 14 August 2026:** use **Rolling training plan**
   in the domain and **Plan** in the interface.
2. **Past boundary — decided 14 August 2026:** manual planning permits
   owner-local today and future only; past training enters through factual
   logging/correction.
3. **Daily session limit — decided 14 August 2026:** allow at most 10 active
   planned sessions per owner-local date across manual, recurring, saved-session,
   and accepted-AI sources. Cancelled sessions and completions do not count. AI
   output remains capped at 3 proposed sessions per date.
4. **Recurrence set — decided 14 August 2026:** support daily/every-N-days with
   a 1–365-day interval and weekly/every-N-weeks on selected weekdays with a
   1–52-week interval. Exclude monthly, yearly, ordinal-weekday, and arbitrary
   RRULE recurrence in v1.
5. **Series edit scopes — decided 14 August 2026:** offer **Only this session**
   and **This and future sessions** for edits and cancellations. Past and
   completed occurrences never change; whole-series editing is available only
   before the first occurrence.
6. **Open-ended recurrence — decided 14 August 2026:** allow an explicit
   **No end date** choice. The series continues until the owner changes or ends
   it; no reader pre-creates or queries an infinite occurrence set, and FitTip
   applies no automatic expiry.
7. **History model — decided 14 August 2026:** use one current row per stable
   planned-session identity plus an append-only before/after change log. Update
   current state, append the atomic plan change set, and advance one monotonic
   owner plan revision in the same server-controlled transaction. Do not use
   session-revision chains, head pointers, whole-plan snapshots, or event
   sourcing.
8. **AI acceptance — decided 14 August 2026:** each item starts **Proposed** and
   can be staged as **Will be added** or **Rejected** without changing the Plan.
   **Finish review** revalidates once and atomically adds all **Will be added**
   items in one plan change set; rejected and still-proposed items add nothing.
9. **Proposal closure — decided 14 August 2026:** enable **Finish review** only
   after every session and **Recovery day** label is **Will be added** or
   **Rejected**.
   **Discard proposal** closes without adding anything. When staged
   **Will be added** items exist, require explicit confirmation that the named
   counts of sessions and **Recovery day** labels will not be added to the Plan.
   No undecided or discarded item applies automatically.
10. **In-review Plan edits and conflicts — decided 14 August 2026:** an
    **Already planned** session exposes the normal Plan editor within proposal
    review. Saving writes the Plan and its history immediately, refreshes the
    current-plan layer, preserves all staged proposal choices, and shows a
    non-blocking stale-context warning. Regeneration is optional; **Finish
    review** revalidates against the current Plan. Discarding the proposal does
    not undo the Plan edit. There is no automatic replacement: the owner must
    explicitly keep both, move, replace, or cancel, and locked content cannot be
    displaced.
11. **Recovery-day semantics — decided 14 August 2026:** **Recovery day** is an
    optional day-level label, not a session. It may coexist with any sessions,
    does not count toward the daily session limit, and is never added or removed
    automatically when sessions change. An empty unlabeled date is unplanned.
    The AI may propose the label as an independent item with **Proposed**,
    **Will be added**, and **Rejected** choices; FitTip does not automatically
    judge whether a session contradicts it.
12. **Clean-reset boundary — revised 14 August 2026:** delete all
    pre-reset plan versions, planned sessions/activities, AI plan proposals
    and decisions, completions, and correction history. Do not backfill or
    expose them. Preserve accounts/profiles, goals, memory, onboarding,
    roadmaps, personal activities, spend/accounting, and security/audit data.
    Also remove the legacy model's exclusive database and runtime machinery;
    retain shared code only when a preserved or replacement domain needs it.
    New-model history is permanent from its first write onward.
13. **Saved-session ownership — decided 14 August 2026:** the library is private
    per user. There is no global/shared library and no cross-owner discovery or
    reuse.
14. **Saved-session reuse — decided 14 August 2026:** keep one editable current
    record per private library entry, with no revision chain or archive state.
    An explicit owner action may save an eligible session or Coach suggestion
    without adding it to the Plan. Reuse copies the current fields into an
    independent one-off or recurring session. Later edits or deletion change no
    planned or completed training. Duplicate entries are allowed; V1 performs no
    automatic detection, merging, or live linking.
15. **Reset ordering and availability — revised 14 August 2026:** after M3-10,
    perform the destructive legacy reset first. Maintenance or temporary
    unavailability is acceptable while later tickets restore `/home/plan`, the
    saved-session library, recurrence, Today/logging/Progress, AI proposal
    application, and regeneration in that order. Do not add dual writes,
    compatibility synchronization, or a second Plan route. Keep every ticket
    proposed until its predecessor is accepted and its exact scope is approved.
16. **Destructive deployment protocol — revised 14 August 2026:** prove the
    exact migration locally from clean and seeded old-model databases; require
    exact-commit independent review and green CI; and verify a Vercel maintenance
    Preview plus non-destructive hosted preflights without changing founder
    data. Record counts but create no export or manual backup. Require an
    explicit **Run the destructive cutover** confirmation, then apply the exact
    migration only after the reviewed maintenance-safe application is deployed,
    reconcile remote history, and immediately verify authentication, removed
    object absence, preserved domains, empty Plan reads,
    schema/RLS/privileges/advisors, authenticated owner and denied cross-owner
    paths, and the maintenance surfaces. This reset alone receives a narrow
    exception to applying its destructive migration before Preview acceptance.
17. **Proposal review composition — decided 14 August 2026:** show current plan
    content and Coach suggestions together under each horizon date. Existing
    content is labeled **Already planned** and has no accept/reject controls, but
    can open the normal Plan editor within the review as defined in Decision 10.
    Exact visual styling remains part of the later approved UI ticket.
18. **Regeneration preservation and feedback — decided 14 August 2026:** carry
    **Will be added** items forward unchanged, omit rejected items from the new
    review, and allow the AI to keep or revise still-proposed items. All
    session-level feedback is optional and accepted items ask for none; overall
    feedback is required unless a rejected item has feedback. Use a fresh
    request/charge, the same horizon, only the immediate predecessor, and the
    three-round cap.
19. **M3 replacement-ticket map — revised 14 August 2026:** deliver F-005 as
    M3-10, M3-11 reset, M3-12, M3-13, M3-14, M3-15, M3-16, rewritten M3-03B,
    and M3-17 in
    that order. Retire M3-03C, M3-04, M3-05, M3-06, M3-07, and M3-08 as
    standalone implementation tickets: M3-03C's relevant behavior moves into
    M3-16, M3-08's source rule moves into M3-15, and M3-17 owns the final hosted
    closeout. Defer M3-03D until after closeout and park M3-09 outside the chain.
    M3-07 receives no replacement because this feature proposes additions and
    preserves direct owner editing of existing Plan content; AI-driven changes
    to existing sessions require a new approved feature if wanted later.

## Approval boundary

This approved replacement feature brief authorizes the product behavior and
delivery decomposition above, not implementation. ADR-016 was approved
separately on 14 August 2026. Each Tier 1 ticket still requires its own approved
Agent brief, distinct builder and reviewer, exact-commit CI, hosted
migration/RLS/privilege/read-path evidence, Preview verification, and explicit
product-owner acceptance.

Approval preserves accepted M1/M3 governance and validation documents but
authorizes the clean-reset behavior as future ticket scope. It does not
dispatch a builder, delete any data, apply a migration, change the founder
database, enable a live provider, incur spend, or authorize external-user or
commercial use.

On 14 August 2026 the product owner revised and authorized this one-time working
agreement amendment:

> The F-005 founder reset may permanently delete the explicitly approved
> pre-reset plan, proposal, completion, and correction records and remove their
> exclusive legacy schema and runtime after dedicated M3-11, its reviewed
> commit, a maintenance-safe founder deployment, and final product-owner
> confirmation. This is a one-time exception; all records created through a
> replacement model remain permanent from that model's first write onward.

`AGENTS.md` is protected from agent edits, so this approved exception is
persisted here and must be quoted in M3-11's eventual Agent brief. It does not
authorize deletion before M3-11's independently reviewed implementation,
maintenance-safe deployment, and final confirmation. The replacement invariant
remains: proposals, planned history, and actual completions are separate
permanent records, and replanning never rewrites them.
