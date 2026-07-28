# M1-04: Today, plan-versus-actual history, and mobile navigation

**Status:** proposed — visible UX/IA; not approved for implementation

**Milestone:** M1 — manual training planning and tracking

**Priority:** P1

**Feature brief:** [F-002 proposed](../product/F-002-MANUAL-TRAINING-PLANNING-TRACKING.md)

**Depends on:** [M1-02 accepted](M1-02-SELECTABLE-HORIZON-PLANNING.md) and [M1-03 accepted](M1-03-QUICK-TRAINING-LOGGING.md)

**Blocks:** [M1-05](M1-05-M1-VALIDATION-SLICE.md)

## Outcome

The owner has a coherent mobile application rather than isolated forms:

- **Today** answers what is planned now and offers the next factual action;
- **Plan** provides the accepted manual plan for the selected next 1–7 days;
- **History** shows planned versus actual without confusing the two;
- future Coach, Progress, Goals, and Memory destinations remain honest and do
  not display invented data or dead functionality.

## Proposed route boundary

```text
/home                 -> redirect to /home/today
/home/today           -> current local date, planned session, actual status/action
/home/plan            -> M1-02 selectable 1–7-day planning
/home/history         -> plan-version and completion history
/home/history/<id>    -> planned-versus-actual detail
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

### History

- Chronological list of accepted plan versions and factual completions.
- Detail view shows **Planned** and **Actual** as separate sections.
- Show completion revisions/corrections without erasing the original.
- Provide no performance judgment, trend claim, streak, or AI interpretation.

### Navigation and page states

- Mobile bottom navigation must expose only useful or intentionally honest
  destinations.
- Loading, empty, error, expired-session, and network-interruption states use
  concise safe copy and an available recovery action.
- Desktop remains functional but mobile is the primary acceptance surface.

## Scope

- Authenticated shell, route ownership, bottom navigation, and safe return.
- Today aggregation over accepted M1 repositories/services.
- History list/detail and plan-version navigation.
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
5. History preserves and distinguishes plan versions, source sessions,
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
- History/version/correction ordering and record-separation tests.
- Component tests for labels, actions, loading/error/empty states, keyboard,
  focus, reduced motion, and accessible names.
- Playwright at `390x844` for plan → Today → log → history and all recovery
  states.
- No-fake-data, external-request, analytics, AI, secret, and private-cache
  scans.
- Existing quality and regression commands.

## Open visual, IA, copy, and architecture decisions

1. **Navigation.** Recommendation: show Today, Plan, History, and You in M1;
   keep Coach absent until it has real behavior. Alternative: show the eventual
   five tabs with explicit unavailable states.
2. **Default.** Recommendation: `/home/today`.
3. **History label.** Recommendation: **History** in M1; later Progress may
   contain history plus accepted trends.
4. **You destination.** Recommendation: retain the existing profile/sign-out
   surface and add goal/memory entries only after their tickets are accepted.
5. **Today density.** Recommendation: concise session cards with one primary
   action and expandable activity detail.
6. **Same-day multiple sessions.** Approve ordering and primary-action
   behavior.
7. **State copy.** Approve no-plan, no-session, completed, error, offline,
   expired-session, and conflict wording.
8. **Design system.** Approve visible tokens, icons/text treatment, safe areas,
   touch targets, focus, contrast, and desktop adaptation.

## Approval gate

The product owner must approve navigation destinations/order/labels, default
route, Today hierarchy/actions, history presentation, You composition, state
copy, safe-return behavior, and responsive/accessibility design. Approval
dispatches only after M1-02 and M1-03 are accepted.
