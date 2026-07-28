# M1-03 quick training logging validation

**Builder status:** complete — ready for independent review

**Implementation head:** `2caf38597e902698952ee909c7c0c57bf0f768bc`

**Implementation commits:**

- `d9e2e57004a741b5bb22d779b1296c24d2645045` — completion transaction,
  domain/repository, direct logging route, UI, and automated tests.
- `2caf38597e902698952ee909c7c0c57bf0f768bc` — isolated and hardened the
  ticket-owned `390x844` browser test.

**Branch:** `ticket/m1-03-quick-logging`

**Worktree:** `.worktrees/m1-03`

**Date:** 28 July 2026

## Delivered behavior

- `/home/log` provides the direct unplanned-training demo route.
- `/home/log?plannedSession=<owner-planned-session-uuid>` shows the immutable
  planned snapshot beside one focused actual form.
- `/home/log?completion=<owner-completion-group-uuid>` shows the current fact,
  preserves prior revisions, and requires a reason before appending a
  correction.
- Planned outcomes are `completed`, `partially_completed`, `skipped`,
  `replaced`, and `rest`; no-plan logging is explicitly `unplanned`.
- Replacement requires a description. Duration is `0–10080`, effort is
  optional `1–10`, and feeling is optional
  `much_easier/easier/as_expected/harder/much_harder`.
- Optional activity results use the existing five sport-agnostic measurement
  schemas. Invalid JSON, malformed measurements, and ambiguous units fail
  without a write.
- Optional pain, illness, injury, and severe-fatigue signals remain factual.
  The UI gives static conservative copy and neither interprets them nor changes
  the plan.
- Save is idempotent. A reused key with changed content and a stale correction
  both return an explicit conflict.
- Session, conflict, validation, loading, unavailable, and persistence states
  use content-safe copy that does not echo free text or identifiers.

The frontend-design skill led to a factual training-ledger direction: planned
and actual are visibly separate columns, status choices are tactile and
high-contrast, the mobile layout collapses to one readable flow, and restrained
entry motion respects reduced-motion settings. All styling is route-local so
it does not collide with M1-02.

## Mobile demo path

1. Start local Supabase and the app with the local URL and publishable key.
2. Sign in with an allowed verified account.
3. Open `/home/log` at `390x844`.
4. Keep **Unplanned**, optionally enter duration, effort, feeling, note, and
   signals, then choose **Save actual**.
5. Choose **View or correct this actual**, change a fact, enter a correction
   reason, and choose **Save correction**.
6. For a planned example, open
   `/home/log?plannedSession=<owner-planned-session-uuid>` and verify the
   **Planned** section remains distinct from **Actual**.

M1-04 owns the final Today/Plan entry points, bottom navigation, history
destination, and post-save return to Today.

## Data, migration, and API effects

- Forward migration
  `20260728143000_m1_03_completion_writes.sql`:
  - replaces the M1-01 feeling constraint with the approved
    expectation-relative values;
  - adds owner-scoped `idempotency_key` and an internal request fingerprint to
    immutable completed sessions, with defaults that preserve earlier
    migration fixtures;
  - adds one `SECURITY DEFINER`, empty-search-path
    `save_training_completion` transaction;
  - grants function execution only to `authenticated`;
  - derives ownership only from `auth.uid()`;
  - validates planned/personal references, status rules, activity snapshots,
    measurements, safety flags, corrections, and idempotency before inserting;
  - appends the completion/session activities and advances the current head in
    one transaction without modifying planned records.
- Authenticated clients retain read-only table privileges for immutable
  completion records. Anonymous, cross-user, and direct authenticated writes
  remain denied by grants plus RLS.
- `src/lib/supabase/database.types.ts` records the two columns and RPC
  signature/return shape.
- `saveQuickLog` sends no caller-controlled `user_id`, maps safe error states,
  and returns only the completion group and revision required for the receipt.
- No remote migration, deployment, analytics, external service, service-role
  credential, or spend was introduced.

## Automated evidence

Commands ran from `.worktrees/m1-03`.

| Check | Result |
|---|---|
| `npx.cmd --yes --package node@24.18.0 -- npm.cmd run test:run` | Pass — 21 files, 134 tests |
| `npx.cmd --yes --package node@24.18.0 -- npm.cmd run typecheck` | Pass |
| `npx.cmd --yes --package node@24.18.0 -- npm.cmd run lint` | Pass |
| `npx.cmd --yes --package node@24.18.0 -- npm.cmd run build` | Pass — `/home/log` emitted as a dynamic route |
| `npx.cmd supabase db reset` | Pass — clean forward migration application |
| `npx.cmd supabase test db` | Pass — 3 files, 174 pgTAP tests, including all M0-02 and M1-01 regressions plus 30 M1-03 tests |
| `npx.cmd supabase db lint --level warning` | Pass — no schema errors |
| `npx.cmd playwright test m1-03-quick-log.spec.ts --config=e2e/m1-03.playwright.config.ts` | Pass — signup/confirmation/sign-in, unplanned save, and append-only correction at exactly `390x844` |
| Ticket-file `prettier --check` | Pass |
| `git diff --check` | Pass |

The repository-wide `npm.cmd run format:check` still reports the existing
52-file formatting baseline. Every M1-03 TypeScript, TSX, CSS, generated-type,
and architecture-test file passes the ticket-scoped Prettier check. This ticket
does not broaden into unrelated baseline formatting.

## Security and invariant evidence

- The 30-test M1-03 pgTAP suite covers function grants, empty search path,
  immutable table access, owner writes, anonymous denial, cross-user planned
  references, RLS visibility, plan immutability, all-or-nothing activity
  snapshots, idempotent retry, changed-key conflict, append-only correction,
  stale correction, malformed measurements, out-of-range effort, replacement
  requirements, and truthful unplanned logging.
- Existing M1-01 pgTAP tests continue to pass after the forward migration.
- Domain tests cover every outcome plus correction coordinates, dates,
  timezones, text limits, effort/duration, feeling values, and all measurement
  shapes.
- Repository tests prove Auth verification precedes writes, only `PT409` maps
  to a conflict, and client retry is disabled for the completion transaction.
- Server-action tests verify no caller identity enters the payload and private
  notes never enter returned errors.
- The architecture regression now permits `.retry(false)` only for the two
  approved atomic RPCs: manual plan save and completion save.
- A content/external-request scan found only local Mailpit URLs in the E2E
  harness and the UI promise that private notes are not sent externally.

## Complete change manifest

### Created

- `e2e/m1-03-quick-log.spec.ts` — exercises the direct unplanned save and
  append-only correction journey at `390x844`.
- `e2e/m1-03.playwright.config.ts` — isolates the ticket browser run on a
  non-conflicting local port while enforcing the required mobile viewport.
- `src/app/home/log/actions.test.ts` — verifies safe server-action payloads and
  conflict, session-expiry, and persistence messages.
- `src/app/home/log/actions.ts` — converts form data into a validated
  completion command and exposes content-safe action state.
- `src/app/home/log/error.tsx` — gives an honest no-change route error state.
- `src/app/home/log/loading.tsx` — gives an explicit private-record loading
  state.
- `src/app/home/log/log.module.css` — supplies route-local, accessible,
  responsive training-ledger styling without editing shared M1-02 CSS.
- `src/app/home/log/page.tsx` — authenticates the owner, reads optional planned
  and completion history snapshots, and renders planned versus actual
  separately.
- `src/components/completions/quick-log-form.test.tsx` — covers planned versus
  unplanned choices, replacement fields, correction reason, and mobile-form
  semantics.
- `src/components/completions/quick-log-form.tsx` — implements the reusable
  status-driven factual logging and correction form.
- `src/features/completions/completion-types.ts` — defines shared completion,
  activity, history, status, feeling, and planned-snapshot types.
- `src/server/completions/completion-records.test.ts` — covers the complete
  status and invalid-field domain matrix.
- `src/server/completions/completion-records.ts` — validates and normalizes
  completion commands before persistence.
- `src/server/repositories/completion-repository.test.ts` — checks Auth-first
  persistence, conflict mapping, retry scope, and safe failures.
- `src/server/repositories/completion-repository.ts` — provides the separate
  owner-scoped completion write/history/planned-snapshot repository.
- `supabase/migrations/20260728143000_m1_03_completion_writes.sql` — adds the
  approved atomic completion and correction transaction.
- `supabase/tests/database/m1_03_completion_writes.test.sql` — adds 30 database,
  authorization, immutability, validation, correction, and idempotency tests.

### Modified

- `src/architecture/server-boundary.test.ts` — extends the exact no-retry
  allowlist to the separately approved atomic completion RPC.
- `src/lib/supabase/database.types.ts` — adds completion idempotency columns
  and the generated completion RPC contract.

### Deleted

- None.

### Renamed

- None.

## Known limitations and handoff

- Final Today/Plan links, Today return behavior, consolidated History, and
  mobile navigation remain intentionally owned by M1-04.
- The direct planned demo requires an owner-scoped planned-session UUID until
  M1-04 wires the visible entry point.
- Activity summaries accept schema-validated JSON; detailed per-set capture is
  explicitly outside this ticket.
- No offline write queue exists. A failed connection reports that nothing
  changed and permits retry with the same idempotency key.
- The browser test covers the full unplanned and correction journey. Planned
  status variants are additionally covered by component, domain, repository,
  and database matrices; M1-04/M1-05 own the consolidated Plan-to-Today
  browser journey.
- No remote Supabase project or founder staging environment was changed.

## Independent review target

Review exact implementation head
`2caf38597e902698952ee909c7c0c57bf0f768bc`, reconcile this manifest against
the Git diff from the M1-03 branch base, rerun the security/data/mobile checks,
and report any omitted or unexpected file before recommending `testable`.
