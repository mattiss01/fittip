# M1-04: Mobile navigation and honest empty states

**Status:** proposed — visible UX/IA; not approved for implementation

**Milestone:** M1

**Priority:** P1

**Depends on:** M0-06 accepted; [M0-03 / F-001 accepted](../product/F-001-PUBLIC-ACCOUNT-AUTHENTICATION.md)

**Integration dependency:** M1-01, M1-02, and M1-03 must be accepted before
their routes or calls to action appear as available behavior

**Blocks:** [M1-05 M1 validation slice](M1-05-M1-VALIDATION-SLICE.md)

## Outcome

Create the authenticated 390px information architecture for **Today**,
**Plan**, **Coach**, **Progress**, and **You**, with accessible bottom
navigation, stable deep links, correct session handling, and honest
loading/error/empty/blocked states.

Only accepted functionality may appear operational. Tabs for later milestones
may explain that no plan, coaching, or progress data exists yet, but they must
not fabricate training, metrics, recommendations, AI activity, or future
availability.

Every visible label, route, tab state, icon, empty-state message, and call to
action in this brief is a proposal until the product owner approves it.

## Approval, environment, and external-use boundary

Approval would authorize this local authenticated shell only after M0-06 is
accepted. It does not authorize a deployment, remote environment, tracking,
AI, training data, or any unaccepted M1 route.

Before external use, all of the following must be separately approved,
implemented, validated, and accepted:

- M0-03B account recovery;
- M0-04 privacy design plus later implementation of the reachable privacy
  notice, relevant inventory/retention, account/data deletion operation, and
  applicable access/export boundary;
- any AI consent/withdrawal UI before an AI-capable Coach action exists;
- M0-05 privacy-safe event and request-control contracts; and
- M0-06's hosted Supabase/Vercel target, email delivery, registration-abuse
  control, CI/deployment, and hosted mobile/auth validation.

M0-04 design acceptance alone does not authorize privacy navigation, schema,
consent UI, deletion UI/operation, or external availability. M1-04 may reserve
an approved location for later privacy/account controls, but it must not claim
those controls exist.

## Scope

1. Add an authenticated mobile shell and accessible bottom navigation for the
   five approved top-level destinations.
2. Define route ownership and stable deep-link/session behavior.
3. Render accepted M1 goal, memory, and intake entry points under **You** only
   when their owning tickets are accepted.
4. Add truthful empty and blocked states for unimplemented Today, Plan, Coach,
   and Progress capabilities.
5. Add loading, route-level error, not-found, session-expired, and network
   interruption boundaries without fake data.
6. Preserve desktop functionality with a responsive adaptation that does not
   create a second information architecture.
7. Add mobile, navigation, accessibility, session, and regression tests.

## Non-goals

- No plan, roadmap, session, activity, logging, coaching chat, AI, progress
  metric, chart, streak, observed-pattern, replan, or generate behavior.
- No fake/sample user data, speculative calls to action, global activity
  library, or implied offline support.
- No authentication-method, recovery, profile-schema, session-policy, RLS,
  privacy, analytics, remote-environment, or deployment change.
- No reimplementation of goal, memory, or intake business rules.
- No approved visual brand/design system beyond the specific shell choices
  later accepted for this ticket.

## Proposed information architecture

| Destination | Purpose in the full Product Plan | Honest M1 content |
|---|---|---|
| **Today** | Next session, quick action, urgent clarification | No-session/plan empty state only; no workout card or coach message |
| **Plan** | Current seven-day plan, locks, roadmap, replan | Plan-unavailable empty state only; no generated dates, sessions, locks, or replan |
| **Coach** | Conversation, suggestions, questions, explanations | Coaching-unavailable blocked state only; no chat input, typing indicator, or AI output |
| **Progress** | History, plan-versus-actual, trends, patterns | No-history empty state only; no sample metrics, charts, streaks, or observed patterns |
| **You** | Goals, priorities, memory, possibilities, preferences | Accepted M1-01/M1-02 management and M1-03 intake entry points |

Recommendation: keep all five destinations visible so the Product Plan's
stable structure can be evaluated early, while unavailable destinations use
plain honest copy and no enabled primary action. Alternative: show only **You**
until another destination has real behavior. This visible product choice
requires approval.

## Proposed route ownership

Recommendation:

```text
/home                 -> safe authenticated redirect to the approved default
/home/today           -> Today owner
/home/plan            -> Plan owner
/home/coach           -> Coach owner
/home/progress         -> Progress owner
/home/you             -> You overview owner
/home/you/goals       -> M1-01
/home/you/memory      -> M1-02
/home/you/intake      -> M1-03
```

The route strings and default are proposals, not architecture already
authorized by the Product Plan. Route ownership means:

- M1-04 owns only the authenticated shell, navigation, destination landing
  states, and route-level boundaries.
- M1-01 owns goal behavior and content.
- M1-02 owns memory behavior and content.
- M1-03 owns intake/review behavior and content.
- Later plan, coaching, logging, and progress tickets replace their own empty
  states without M1-04 prebuilding the feature.
- Authentication/session enforcement continues to use the accepted M0-03
  server boundary. Navigation is not authorization.

No M1-04 component may recreate another ticket's business rules or repository
calls.

## Bottom-navigation behavior

- Five destinations appear in the approved order with persistent text labels.
- Icons, if approved, are decorative support rather than the only accessible
  name.
- The active item uses `aria-current="page"` or equivalent semantics and is
  identifiable without color alone.
- Each target meets the approved minimum touch size and remains reachable above
  device safe-area insets and browser chrome.
- Focus order follows visual order; keyboard focus is visible.
- The shell accommodates text zoom and longer translated strings even though
  the initial product language is English.
- A route change preserves meaningful page-heading focus/announcement without
  stealing focus during ordinary in-page interaction.
- The bottom bar does not cover forms, errors, save actions, or content.
- Desktop uses a responsive presentation of the same five destinations and
  route hierarchy; no critical function depends on hover.

Exact icons, selected treatment, labels, order, safe-area behavior, and desktop
presentation require product/design approval.

## Authentication and session behavior

- Every destination validates authenticated server claims before rendering
  protected content; the navigation shell/proxy is not the sole guard.
- Any owned record reached from a destination remains scoped by immutable
  `user_id`, server repository checks, and RLS in its owning ticket.
- An unauthenticated deep link redirects to the accepted sign-in route.
- Recommendation: preserve a same-origin allowlisted return path so successful
  sign-in can return to the requested destination. Never trust an arbitrary
  host, origin, or full URL.
- An unconfirmed account receives the accepted M0-03 confirmation/access
  behavior rather than partial navigation.
- Session refresh preserves the accepted private no-cache and cookie behavior.
- Session expiry during navigation or form work shows a generic expired-session
  state and redirects to sign-in without leaking form content into query
  parameters.
- Sign-out removes access to every deep link; browser back must not reveal
  protected cached content.
- Authorization failures do not reveal whether another user's route/resource
  exists.

M1-04 must not change Auth methods, recovery, JWT/session policy, profile
schema, or hosted redirect configuration.

## Deep links and navigation state

- Each accepted destination has one canonical route that can be refreshed and
  opened directly.
- Browser back/forward returns to meaningful route states without duplicating a
  mutation.
- Query parameters are allowlisted, non-sensitive, and optional; owner ids,
  raw form content, tokens, emails, and health details never appear in URLs.
- Unknown authenticated paths render a useful not-found state inside or
  adjacent to the approved shell without guessing content.
- Links to an unavailable later feature land on its honest blocked state, not a
  dead button or fake form.
- Links to M1-01/M1-02/M1-03 appear only after those tickets are accepted and
  integrated.
- Destructive operations and unsaved form warnings remain owned by their
  feature tickets; tab navigation must respect the approved behavior rather
  than bypass it.

## Honest page states

### Empty

- **Today:** “No training is planned yet” or approved equivalent. Do not show a
  fictional date, duration, activity, or start button.
- **Plan:** “No plan yet” or approved equivalent. Do not create a sample week,
  roadmap, lock, or replan action.
- **Coach:** clearly unavailable in this milestone. Do not show an enabled text
  composer, prompt suggestions, typing state, or generated response.
- **Progress:** “No completed training history yet” or approved equivalent. Do
  not show sample charts, totals, streaks, or inferred patterns.
- **You:** show actual accepted goal/memory/intake state only. Before those
  integrations are accepted, show an honest account-foundation state.

Empty-state calls to action may link only to accepted behavior. “Add goals” is
not shown until M1-01 is accepted; “Start intake” is not shown until M1-03 is
accepted; “Generate plan” remains absent until the appropriate M2 brief is
approved.

### Loading

- Use a stable layout and concise accessible loading announcement.
- Skeletons, if used, are generic shapes and do not imply real training values.
- Do not persist a spinner indefinitely; resolve to content, empty, blocked, or
  error.

### Error

- Show a concise safe message, retry when the operation is safe/idempotent, and
  a way back to a known destination.
- Do not reveal raw provider/database/Auth errors, record existence, owner ids,
  tokens, or sensitive content.
- Feature errors remain within the owning route where possible; shell failure
  has a separate boundary.

### Offline/network interruption

- M1 has no offline mode. State honestly that current data/actions require a
  connection.
- Do not claim a save succeeded, queue a hidden mutation, or display cached
  data as current unless a later offline brief approves that behavior.
- A retry revalidates the session and server state.

## Exact proposed demo flows

### Flow A: authenticated navigation at `390x844`

1. Sign in through accepted M0-03.
2. Land on the approved default destination.
3. Visit Today, Plan, Coach, Progress, and You in bottom-nav order.
4. Verify one correct page heading and active-nav state per route.
5. Verify each unavailable destination uses its honest empty/blocked copy and
   contains no fake metrics, training, plan, or AI interaction.

### Flow B: accepted You integrations

1. Open **You** and follow the accepted Goals, Memory, and Intake links.
2. Complete a non-destructive representative action owned by each accepted
   feature.
3. Use bottom navigation and browser back/forward; verify no unsaved or saved
   state is silently lost or duplicated.

### Flow C: deep link and session

1. While signed out, open each canonical deep link.
2. Verify safe sign-in redirect and approved same-origin return behavior.
3. Expire/revoke the local session and revisit a route.
4. Verify generic session handling, private cache behavior, and no protected
   content through browser back.

### Flow D: loading, error, and network interruption

1. Exercise deterministic loading and recoverable-error fixtures.
2. Interrupt the network on a read and a mutation owned by an accepted feature.
3. Verify no fabricated/current claim, hidden queued write, duplicate retry, or
   raw error.

## Acceptance criteria

1. The approved five-destination shell works at `390x844` and on functional
   desktop widths without hover-only behavior.
2. Bottom navigation has persistent accessible names, non-color-only active
   state, visible focus, safe-area/touch-target handling, and no content
   obstruction.
3. Each canonical deep link refreshes and renders the correct heading/active
   state after server-side authentication.
4. Unauthenticated, expired, and signed-out sessions cannot view protected
   content, including through direct links or browser back.
5. Same-origin return paths are allowlisted; arbitrary redirects and sensitive
   query data are rejected.
6. Today, Plan, Coach, and Progress show only approved honest empty/blocked
   states, with no fake workouts, dates, metrics, trends, chat, AI, locks, or
   plan behavior.
7. You exposes only accepted M1 content; unavailable calls to action are absent
   or explicitly blocked as approved.
8. Loading, empty, blocked, error, not-found, and network states are distinct,
   accessible, and privacy-safe.
9. Network interruption never reports an unconfirmed save or invents offline
   support; safe retry does not duplicate a mutation.
10. Route components do not contain goal/memory/intake business rules or import
    server repositories into browser code.
11. Existing M0-03 authentication, private-cache, cookie, ownership, and
    390px tests continue to pass.
12. No analytics, production AI, plan/log/progress data, remote setting,
    external service, secret, or unapproved privacy UI is added.

## Test and validation plan

### Navigation and session

- Route table tests for canonical path, destination label, heading, selected
  navigation item, and owning ticket.
- Direct-refresh, back/forward, unknown route, safe return path, malicious
  redirect, signed-out, unconfirmed, expired-session, and sign-out cache cases.
- Verify protected pages retain exact private/no-cache behavior required by
  accepted M0-03.
- Architectural tests keep browser components from importing server
  repositories and prevent placeholder pages from importing plan/AI modules.

### Mobile and accessibility

- Playwright at `390x844` for Flows A–D.
- Keyboard-only order/focus, page-heading announcement, `aria-current`, unique
  landmarks, skip mechanism if needed, error/live-region behavior, text zoom,
  reflow, touch targets, reduced motion, and non-color-only state.
- Verify the nav does not cover the last form control or validation message and
  handles safe-area inset.
- Desktop smoke test for the same route hierarchy.

### Honesty and privacy

- Assert absence of sample dates, durations, workouts, charts, streaks,
  generated coach text, enabled chat input, generate/replan actions, and
  training claims.
- Snapshot/content allowlist for each empty/blocked state.
- Scan URLs, rendered HTML, logs, errors, snapshots, and committed files for
  tokens, emails, owner ids, raw user content, or secrets.
- Verify no analytics call or external request is introduced.

### Existing quality commands

```powershell
npm.cmd run format:check
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test:run
npm.cmd run test:e2e
npm.cmd run build
git diff --check
```

Database commands are required only if the approved route integration changes
database artifacts; M1-04 itself proposes no migration.

## Implementation sequence and file guidance

1. Re-read [AGENTS.md](../../AGENTS.md), the
   [Product Plan](../../REVISED_PRODUCT_PLAN.md), accepted M0-03 behavior, and
   accepted M1 route contracts.
2. Resolve the visible IA, route, empty-state, return-path, and responsive
   decisions before UI work.
3. Define a small route/ownership table used by implementation and tests.
4. Build the authenticated shell and one honest destination state at a time.
5. Integrate links/content from M1-01/M1-02/M1-03 only after each is accepted;
   do not reimplement their rules.
6. Add route/session, architecture, content-honesty, accessibility, and 390px
   end-to-end tests.
7. Run existing M0 regressions and production build.
8. Hand off to independent review; missing behavior returns to the owning
   feature ticket instead of being improvised here or in M1-05.

Likely areas are authenticated `src/app/` layouts/routes, focused navigation
and state components, global responsive styles, route/session tests, and
Playwright. Exact file names and reversible composition are builder choices
after approval. Changing authentication, cache policy, route security,
deployment, or data boundaries requires the appropriate ticket/ADR.

## Open visual, IA, copy, and architecture decisions

1. **Visible tabs.** Recommendation: show all five with honest blocked states.
   Alternative: expose only destinations with implemented behavior.
2. **Routes/default.** Recommendation: canonical `/home/<destination>` routes
   with `/home` redirecting to Today. Alternative: You as the M1 default until
   Today has real content.
3. **Labels/order/icons.** Approve the five labels, order, icon set or text-only
   treatment, active style, and desktop adaptation.
4. **Empty/blocked copy.** Approve exact text and whether an unavailable
   destination has no action or one link to accepted You behavior.
5. **Auth return.** Recommendation: preserve only an allowlisted same-origin
   path after sign-in. Alternative: always return to the default destination.
6. **Offline/error behavior.** Approve exact connection, retry, expired-session,
   and generic-error copy; no offline queue is proposed.
7. **You composition.** Approve cards/list hierarchy and when accepted Goals,
   Memory, Intake, and later privacy/account controls become visible.
8. **Accessibility/design tokens.** Approve touch-size, safe-area, focus,
   contrast, motion, and responsive presentation choices that affect visible
   design.

## Handoff

Before testable status, provide:

- exact branch and commit;
- changed files grouped by shell/routes, components/styles, tests, and docs;
- final approved route/ownership table and exact visible copy;
- `390x844` screenshots for all five destinations plus loading/error/offline
  and session states;
- deep-link, safe-return, sign-out/cache, browser-back, accessibility, and
  honesty evidence;
- exact commands and results;
- external-request, analytics, AI, fake-data, privacy, and secret scans;
- known limitations and approved deviations; and
- confirmation that no plan, log, coach, progress, remote, or unaccepted M1
  behavior was added.

The lead agent assigns an independent reviewer. The precise product-owner
decision after review is: **accept M1-04 as the mobile navigation/empty-state
slice, or return focused corrections**.

## Approval gate

The product owner must approve the visible tabs, labels/order/icons, routes and
default, bottom-navigation treatment, empty/blocked/loading/error/offline copy,
safe-return behavior, You composition, and responsive/accessibility choices
before implementation. Approval is local-only and dispatches the ticket only
after M0-06 is accepted. Until then, M1-04 remains **proposed**.
