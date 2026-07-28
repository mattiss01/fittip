# M1-04: Today, factual progress, and mobile navigation

**Status:** approved — dependency-queued until M1-02 and M1-03 are accepted;
product-owner approval recorded 28 July 2026

**Milestone:** M1 — manual training planning and tracking

**Priority:** P1

**Feature brief:** [F-002 approved](../product/F-002-MANUAL-TRAINING-PLANNING-TRACKING.md)

**Depends on:** [M1-02 accepted](M1-02-SELECTABLE-HORIZON-PLANNING.md) and [M1-03 accepted](M1-03-QUICK-TRAINING-LOGGING.md)

**Blocks:** [M1-05](M1-05-M1-VALIDATION-SLICE.md)

## Outcome

The owner has a coherent mobile application rather than isolated forms:

- **Today** answers what is planned now and offers the next factual action;
- **Plan** provides the accepted manual plan for the selected next 1–7 days;
- **Progress** shows factual plan and completion history without confusing
  planned and actual records or inventing trends;
- future Coach, Goals, and Memory destinations remain honest and do
  not display invented data or dead functionality.

## Proposed route boundary

```text
/home                 -> redirect to /home/today
/home/today           -> current local date, planned session, actual status/action
/home/plan            -> M1-02 selectable 1–7-day planning
/home/progress        -> plan-version and completion history
/home/progress/<id>   -> planned-versus-actual detail
```

Only allowlisted same-origin paths may be restored after sign-in. Session
expiry returns to generic sign-in without leaking the requested private path.

## Proposed mobile behavior

### Today

- Show the owner-local date and the current plan version.
- Show every planned session for today in order.
- Clearly label `planned`, `completed`, `partially completed`, `skipped`,
  `replaced`, `rest`, or `unplanned`.
- Primary action is **Log training** or **View actual**, depending on facts.
- Offer **Plan training** when no current plan/session exists.
- Never infer completion from time passing or from a planned record.

### Progress

- Chronological list of accepted plan versions and factual completions.
- Detail view shows **Planned** and **Actual** as separate sections.
- Show completion revisions/corrections without erasing the original.
- The **Progress** label does not authorize a performance judgment, trend
  claim, score, streak, or AI interpretation in M1.

### Navigation and page states

- Mobile bottom navigation must expose only useful or intentionally honest
  destinations.
- Loading, empty, error, expired-session, and network-interruption states use
  concise safe copy and an available recovery action.
- Desktop remains functional but mobile is the primary acceptance surface.

## Scope

- Authenticated shell, route ownership, bottom navigation, and safe return.
- Today aggregation over accepted M1 repositories/services.
- Progress list/detail and plan-version navigation.
- Honest empty/loading/error/offline/session states.
- Touch size, focus, contrast, safe-area, reduced-motion, and screen-reader
  behavior.
- Private/no-store authenticated responses and sign-out cache regression.
- `390x844` screenshots and browser evidence for all primary states.

## Non-goals

- AI Coach behavior, generated plans, replanning, explanations, or fake chat.
- Goal, memory, intake, analytics dashboard, trends, scores, streaks, or social
  features.
- Offline write queue, push notifications, calendar integration, native
  navigation, or custom install/PWA scope.
- New training-record business rules owned by M1-01 through M1-03.

## Acceptance criteria

1. `/home` safely resolves to the approved authenticated default.
2. At `390x844`, Today shows planned and actual information without horizontal
   overflow or ambiguous labels.
3. A no-plan owner gets one honest action into manual planning.
4. A planned session opens the quick-log flow; a logged session opens factual
   actual detail.
5. Progress preserves and distinguishes plan versions, source sessions,
   completions, and corrections.
6. Browser back/forward, refresh, deep link, sign-in return, expiry, and
   sign-out behave safely.
7. Empty, loading, error, and network states never invent sessions, metrics,
   coaching, or progress.
8. Navigation and primary actions meet the approved accessibility checks.
9. Authenticated responses are private/no-store.
10. No unaccepted M2/M3 behavior, analytics, external request, or secret is
    introduced.

## Test and validation plan

- Route, redirect, safe-return, session-expiry, sign-out, and cache tests.
- Today aggregation tests for no plan, multiple sessions, every actual status,
  replacement, unplanned training, and timezone boundary.
- Progress/version/correction ordering and record-separation tests.
- Component tests for labels, actions, loading/error/empty states, keyboard,
  focus, reduced motion, and accessible names.
- Playwright at `390x844` for plan → Today → log → Progress and all recovery
  states.
- No-fake-data, external-request, analytics, AI, secret, and private-cache
  scans.
- Existing quality and regression commands.

## Approved visual, IA, copy, and architecture decisions

1. **Navigation.** Show Today, Plan, Progress, and You in that order. Keep Coach
   absent until it has real behavior.
2. **Default.** Use `/home/today`.
3. **Progress label.** Use **Progress** for factual plan-version, completion,
   and correction history. Do not show trends or performance claims in M1.
4. **You destination.** Retain the existing profile/sign-out surface and add
   goal/memory entries only after their tickets are accepted.
5. **Today density.** Use concise session cards with one primary action and
   expandable activity detail.
6. **Same-day multiple sessions.** Preserve plan order. Each session keeps its
   own factual log/view action; FitTip does not silently choose one session as
   completed or more important.
7. **State copy.** No-plan, no-session, completed, error, offline,
   expired-session, and conflict states remain concise, non-judgmental, and
   explicit about the available recovery action.
8. **Design system.** Reuse the established FitTip visual tokens. Navigation
   uses visible text labels with accessible names, safe-area padding,
   touch-sized targets, visible focus, sufficient contrast, reduced-motion
   support, and a functional desktop adaptation.

## Approval

The product owner approved M1-04 in chat on 28 July 2026 with one revision:
the factual-history navigation tab is named **Progress**, not **History**.
Implementation remains queued until M1-02 and M1-03 are both accepted.
