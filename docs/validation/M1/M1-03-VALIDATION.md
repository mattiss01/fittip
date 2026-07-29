# M1-03 quick training logging validation

**Lifecycle status:** accepted

**Independent review:** approved exact implementation
`94bc613ee307cc8d89088fbaa01291806fd6ee23` on 29 July 2026

**Product-owner acceptance:** recorded 29 July 2026

**Accepted master merge:** `1521d2674c54de2dec54c7de24e15fcf373a4b7f`

**Implementation head:** `94bc613ee307cc8d89088fbaa01291806fd6ee23`

**Implementation commits:**

- `d9e2e57004a741b5bb22d779b1296c24d2645045` - completion transaction,
  domain/repository, direct logging route, UI, and automated tests.
- `2caf38597e902698952ee909c7c0c57bf0f768bc` - isolated and hardened the
  ticket-owned `390x844` browser test.
- `94bc613ee307cc8d89088fbaa01291806fd6ee23` - resolves independent-review
  findings for inactive outcomes, truthful receipts, revision visibility,
  browser-local dates, and full mobile-path coverage.

**Branch:** `ticket/m1-03-quick-logging`

**Worktree:** `.worktrees/m1-03`

**Date:** 28 July 2026

## Delivered behavior

- `/home/log` provides the direct unplanned-training demo route.
- `/home/log?plannedSession=<owner-planned-session-uuid>` shows the immutable
  planned snapshot beside one focused actual form.
- `/home/log?completion=<owner-completion-group-uuid>` shows the current fact,
  preserves every prior revision, and requires a reason before appending a
  correction.
- Planned outcomes are `completed`, `partially_completed`, `skipped`,
  `replaced`, and `rest`; no-plan logging is explicitly `unplanned`.
- Skipped and rest facts cannot contain activity results. The UI clears and
  hides those fields, the server domain rejects them, and the database trigger
  protects writes through the RPC.
- Replacement requires a description. Duration is `0-10080`, effort is
  optional `1-10`, and feeling is optional
  `much_easier/easier/as_expected/harder/much_harder`.
- Optional activity results use the existing five sport-agnostic measurement
  schemas. Invalid JSON, malformed measurements, and ambiguous units fail
  without a write.
- Optional pain, illness, injury, and severe-fatigue signals remain factual.
  The UI gives static conservative copy and neither interprets them nor changes
  the plan.
- A successful RPC receipt is returned directly. Save is idempotent; an
  ambiguous connection failure tells the user the save is unconfirmed and that
  retrying with the same key is safe. A reused key with changed content and a
  stale correction both return an explicit conflict.
- Every history revision exposes its outcome, date/time, duration, effort,
  feeling, replacement, signals, note, activity modes, and measurements.
- The initial unplanned date is derived from the browser timezone, including
  correct previous/next-day behavior around UTC midnight.
- Session, conflict, validation, loading, unavailable, and unconfirmed states
  use content-safe copy that does not echo free text or identifiers.

The frontend-design skill led to a factual training-ledger direction: planned
and actual are visibly separate columns, status choices are tactile and
high-contrast, the mobile layout collapses to one readable flow, and restrained
entry motion respects reduced-motion settings. All styling is route-local so
it does not collide with M1-02.

## Mobile demo path

1. Start local Supabase and the app with the local URL and publishable key.
2. Sign up or sign in with an allowed verified account.
3. Open `/home/log` at `390x844` and verify the unplanned date matches the
   browser-local date.
4. Save an unplanned actual and open its correction path.
5. Open `/home/log?plannedSession=<owner-planned-session-uuid>` and save each
   planned outcome: completed, partially completed, skipped, rest, and
   replacement.
6. Correct the completed fact and verify both duration and activity
   measurements from the prior and current revisions remain visible.

M1-04 owns the final Today/Plan entry points, bottom navigation, history
destination, and post-save return to Today.

## Data, migration, and API effects

- Forward migration `20260728143000_m1_03_completion_writes.sql`:
  - replaces the M1-01 feeling constraint with the approved
    expectation-relative values;
  - adds owner-scoped `idempotency_key` and an internal request fingerprint to
    immutable completed sessions;
  - adds one `SECURITY DEFINER`, empty-search-path
    `save_training_completion` transaction;
  - grants function execution only to `authenticated`;
  - derives ownership only from `auth.uid()`;
  - validates planned/personal references, status rules, activity snapshots,
    measurements, safety flags, corrections, and idempotency before inserting;
  - appends completion/session activities and advances the current head in one
    transaction without modifying planned records.
- Forward migration `20260728170000_m1_03_review_corrections.sql` adds a
  least-privilege trigger that rejects activity rows for skipped and rest
  completions. RPC regression tests prove the whole attempted fact rolls back.
- Authenticated clients retain read-only table privileges for immutable
  completion records. Anonymous, cross-user, and direct authenticated writes
  remain denied by grants plus RLS.
- `src/lib/supabase/database.types.ts` records the completion columns and RPC
  signature/return shape.
- `saveQuickLog` sends no caller-controlled `user_id`. The repository returns
  the successful RPC receipt without a second read, and safe action messages
  distinguish confirmed conflicts from ambiguous persistence.
- No remote migration, deployment, analytics, external service, service-role
  credential, or spend was introduced.

## Automated evidence

Commands ran from `.worktrees/m1-03`.

| Check | Result |
|---|---|
| `npx.cmd --yes --package node@24.18.0 -- npm.cmd run test:run` | Pass - 23 files, 145 tests |
| `npx.cmd --yes --package node@24.18.0 -- npm.cmd run typecheck` | Pass |
| `npx.cmd --yes --package node@24.18.0 -- npm.cmd run lint` | Pass |
| `npx.cmd --yes --package node@24.18.0 -- npm.cmd run build` | Pass - `/home/log` emitted as a dynamic route |
| `npx.cmd supabase db reset` | Pass - clean forward migration application |
| `npx.cmd supabase test db` | Pass - 3 files, 177 pgTAP tests, including all M0-02 and M1-01 regressions plus 33 M1-03 tests |
| `npx.cmd supabase db lint --level warning` | Pass - no schema errors |
| `npx.cmd playwright test m1-03-quick-log.spec.ts --config=e2e/m1-03.playwright.config.ts` | Pass - signup, confirmation redirect, sign-in, browser-local date, every planned outcome, unplanned save, and full correction history at exactly `390x844` on isolated port `3013` |
| Ticket-file `prettier --check` | Pass |
| `git diff --check` | Pass |

The repository-wide `npm.cmd run format:check` still reports the existing
51-file formatting baseline. Every M1-03 TypeScript, TSX, and CSS file passes
the ticket-scoped Prettier check. This ticket does not broaden into unrelated
baseline formatting.

## Security and invariant evidence

- The 33-test M1-03 pgTAP suite covers function grants, empty search path,
  immutable table access, owner writes, anonymous denial, cross-user planned
  references, RLS visibility, plan immutability, all-or-nothing activity
  snapshots, skipped/rest activity rejection and rollback, idempotent retry,
  changed-key conflict, append-only correction, stale correction, malformed
  measurements, out-of-range effort, replacement requirements, and truthful
  unplanned logging.
- Existing M1-01 pgTAP tests continue to pass after both forward migrations.
- Domain tests cover every outcome, skipped/rest activity rejection, correction
  coordinates, dates, timezones, text limits, effort/duration, feeling values,
  and all measurement shapes.
- Repository tests prove Auth verification precedes writes, a successful RPC
  receipt requires no follow-up read, only `PT409` maps to a conflict,
  ambiguous failures remain unconfirmed, and client retry is disabled for the
  completion transaction.
- Server-action tests prove skipped/rest payloads clear stale activities, no
  caller identity enters the payload, retry copy preserves idempotency
  semantics, and private notes never enter returned errors.
- Component and history tests prove inactive-outcome clearing, browser-local
  date derivation, and visibility of changed duration and measurements in
  every revision.
- The architecture regression permits `.retry(false)` only for the two
  approved atomic RPCs: manual plan save and completion save.
- A content/external-request scan found only local Mailpit URLs in the E2E
  harness and the UI promise that private notes are not sent externally.

## Complete change manifest

### Created

- `docs/validation/M1/M1-03-VALIDATION.md` - persists exact commit, evidence,
  limitations, and the complete change manifest for reviewer reconciliation.
- `e2e/m1-03-quick-log.spec.ts` - exercises signup/confirmation, all planned
  outcomes, unplanned logging, and detailed append-only correction history.
- `e2e/m1-03.playwright.config.ts` - isolates the ticket browser run on port
  `3013`, fixes the browser timezone, and enforces `390x844`.
- `src/app/home/log/actions.test.ts` - verifies safe action payloads,
  skipped/rest clearing, and conflict, session, validation, and unconfirmed
  messages.
- `src/app/home/log/actions.ts` - converts form data into a validated completion
  command, clears inactive activities, and exposes content-safe action state.
- `src/app/home/log/error.tsx` - gives an honest unconfirmed route error state.
- `src/app/home/log/loading.tsx` - gives an explicit private-record loading
  state.
- `src/app/home/log/log.module.css` - supplies route-local, accessible,
  responsive training-ledger and detailed-history styling.
- `src/app/home/log/page.tsx` - authenticates the owner, reads optional planned
  and completion snapshots, derives new unplanned dates in the browser, and
  renders complete revision history.
- `src/components/completions/quick-log-form.test.tsx` - covers status-driven
  fields, inactive-result clearing, correction reason, and browser-local date.
- `src/components/completions/quick-log-form.tsx` - implements the reusable
  status-driven factual logging/correction form and clears skipped/rest
  activity results.
- `src/components/completions/revision-history.test.tsx` - proves changed
  duration and measurements remain visible in current and prior revisions.
- `src/components/completions/revision-history.tsx` - renders all relevant
  factual fields for every immutable revision.
- `src/features/completions/completion-types.ts` - defines shared completion,
  activity, receipt, history, status, feeling, and planned-snapshot types.
- `src/features/completions/local-date.test.ts` - covers previous/next-day
  browser-timezone results around UTC midnight.
- `src/features/completions/local-date.ts` - derives an ISO calendar date in a
  named browser timezone without UTC truncation.
- `src/server/completions/completion-records.test.ts` - covers the complete
  status matrix, including skipped/rest activity rejection.
- `src/server/completions/completion-records.ts` - validates and normalizes
  completion commands before persistence.
- `src/server/repositories/completion-repository.test.ts` - checks Auth-first
  persistence, direct successful receipts, conflict mapping, retry scope, and
  ambiguous failures.
- `src/server/repositories/completion-repository.ts` - provides separate
  owner-scoped completion writes/reads, direct RPC receipts, and explicit
  unconfirmed-error semantics.
- `supabase/migrations/20260728143000_m1_03_completion_writes.sql` - adds the
  approved atomic completion and correction transaction.
- `supabase/migrations/20260728170000_m1_03_review_corrections.sql` - prevents
  activity rows on skipped/rest completions at the database boundary.
- `supabase/tests/database/m1_03_completion_writes.test.sql` - adds 33 database,
  authorization, immutability, validation, correction, and idempotency tests.

### Modified

- `src/architecture/server-boundary.test.ts` - extends the exact no-retry
  allowlist to the separately approved atomic completion RPC.
- `src/lib/supabase/database.types.ts` - adds completion idempotency columns
  and the generated completion RPC contract.

### Deleted

- None.

### Renamed

- None.

## Known limitations and handoff

- Final Today/Plan links, Today return behavior, consolidated Progress, and
  mobile navigation remain intentionally owned by M1-04.
- The direct planned demo requires an owner-scoped planned-session UUID until
  M1-04 wires the visible entry point.
- Activity summaries accept schema-validated JSON; detailed per-set capture is
  explicitly outside this ticket.
- No offline write queue exists. An interrupted request can leave save status
  unconfirmed; retrying reuses the idempotency key and cannot create a
  duplicate fact.
- No remote Supabase project or founder staging environment was changed.

## Independent review target

The independent reviewer reconciled this manifest against the exact Git diff
and approved implementation head
`94bc613ee307cc8d89088fbaa01291806fd6ee23`. The product owner accepted that
reviewed implementation on 29 July 2026. It was merged to `master` as
`1521d2674c54de2dec54c7de24e15fcf373a4b7f`.

The merged M1-02 and M1-03 application passed the combined Node, Supabase,
concurrency, advisor, and `390x844` browser validation recorded in
[M1-02/M1-03 integration validation](M1-02-M1-03-INTEGRATION-VALIDATION.md).
