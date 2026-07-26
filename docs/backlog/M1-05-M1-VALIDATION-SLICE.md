# M1-05: Consolidated M1 validation slice

**Status:** proposed — not approved to start

**Milestone:** M1

**Priority:** P1

**Type:** independent validation and evidence only; no new product behavior

**Depends on:** [M1-01 accepted](M1-01-GOAL-MODEL-VALIDATION.md), [M1-02 accepted](M1-02-MEMORY-MODEL-MANAGEMENT.md), [M1-03 accepted](M1-03-INTAKE-FACT-REVIEW.md), and [M1-04 accepted](M1-04-MOBILE-NAVIGATION-EMPTY-STATES.md)

**Blocks:** M1 milestone acceptance and any M2 implementation

## Outcome

Independently validate the complete accepted M1 implementation from clean
migrations through the 390px user experience. Produce traceable evidence for
authorization, domain invariants, history/provenance, intake publication,
navigation honesty, accessibility, privacy/security, quality gates, and known
limitations.

M1-05 changes no product behavior. A discovered gap, ambiguous requirement, or
missing testability hook returns to M1-01, M1-02, M1-03, M1-04, or the relevant
M0 ticket. The validation agent must not “fix while testing,” relax a criterion,
or invent a new decision.

## Approval, readiness, and external-use boundary

Approval authorizes independent local validation only after M1-01 through
M1-04 are individually accepted and integrated at exact reviewed commits. It
does not authorize a remote migration, deployment, external registration, AI,
analytics, or product correction.

M1 validation is not an external-use authorization. Before any external use,
the release gate must separately prove accepted implementation of:

- M0-03B account recovery;
- M0-04's privacy design **and** later privacy implementation briefs for the
  reachable notice, relevant inventory/retention, consent/withdrawal before any
  AI transfer, account/data deletion operation, and applicable access/export
  handling;
- M0-05 privacy-safe instrumentation and request-control contracts; and
- M0-06's exact hosted Supabase/Vercel environment, custom email delivery,
  registration-abuse control, CI/deployment, and hosted authorization/mobile
  checks.

M0-04 design acceptance alone never counts as schema/UI/operation completion.
If these privacy/deployment implementations do not yet exist, M1-05 records
“local/internal only — external use blocked” as a limitation and must not
relabel the product externally ready.

## Readiness criteria

The lead agent may dispatch M1-05 only when:

1. each owning M1 brief and validation record says `accepted`;
2. the exact reviewed commits are present in the integrated validation branch;
3. no unreviewed product behavior or schema is mixed into the validation base;
4. migration history is coherent and the local Supabase stack can reset from
   zero;
5. deterministic test users/fixtures and Mailpit/local Auth prerequisites are
   documented without real credentials;
6. all approved open decisions and ADRs are linked from their owning ticket;
7. expected commands are discoverable from `package.json`, README, and current
   CLI `--help`; and
8. the independent validator did not build M1-01 through M1-04.

If readiness fails, stop and return the precise owning-ticket correction.

## Scope

1. Reproduce the complete local schema from committed migrations.
2. Validate grants, RLS, ownership, references, constraints, indexes, and
   generated types for profiles, goals, memory, and intake records.
3. Validate goal, memory, intake, and navigation domain invariants, including
   concurrent/conflict paths.
4. Walk the accepted 390px journeys with two authenticated users plus
   anonymous/session-expiry cases.
5. Perform focused accessibility, privacy, security, secret, external-request,
   and content-honesty reviews.
6. Run all repository quality/build/regression gates from a clean dependency
   state where feasible.
7. Create one consolidated validation record with evidence references,
   limitations, findings, and exact release boundary.

## Non-goals

- No migration, schema, policy, repository, domain rule, component, route,
  visible copy, test expectation, or product behavior change.
- No correction of an owning-ticket failure inside the validation slice.
- No M2 plan/AI behavior, production provider call, analytics, remote
  migration, deployment, or external-service mutation.
- No product-owner approval inference, privacy/legal conclusion, or claim that
  local validation authorizes external use.
- No real user data, real credentials, or destructive production operation.

## Test and validation plan

### 1. Clean migrations and schema

- Install from the committed lockfile using the approved Node/npm versions.
- Start the supported local Supabase stack and reset the database from zero.
- Confirm migrations apply in committed order without manual Dashboard edits.
- Run database lint and security/performance advisors at the strict approved
  level.
- Regenerate TypeScript database types, format them, regenerate again, and
  prove reproducibility.
- Compare actual tables, columns, types, defaults, constraints, foreign keys,
  indexes, grants, policies, RLS flags, views, functions, triggers, and exposed
  schemas with the accepted briefs.
- Confirm no speculative plan, completion, activity, AI, analytics, consent,
  deletion, or other table was added by M1 unless separately approved.

### 2. RLS and authorization

For every user-owned M1 table and relationship:

- owner select/insert/update/delete only as approved;
- required immutable `user_id` ownership on every owned record;
- anonymous denial;
- user A denied access to user B's rows through direct Data API and repository
  paths;
- owner reassignment denied;
- cross-owner parent/source/reference creation denied;
- update has required select visibility plus owner `USING` and `WITH CHECK`;
- `authenticated` role alone is never treated as ownership;
- user-editable Auth metadata/email is not authorization;
- object grants are least privilege and agree with policies;
- no browser service-role/secret key, public definer function, unintended view,
  or unapproved privileged bypass exists.

Repeat the accepted M0 profile RLS suite to detect regression.

### 3. Goal invariants

- Create core and supporting goals with every approved sport-agnostic field.
- Reject a fourth active core goal at UI, domain, repository/database, and
  genuinely concurrent-write boundaries.
- Validate independent explicit ordering, atomic reorder/tier/status changes,
  pause/resume, achieved/abandoned/reopen-if-approved, and archive/delete.
- Prove stale revisions never silently overwrite current data.
- Prove goal mutation does not create/change plan, proposal, completion,
  activity, or memory records.
- Confirm no sport-specific or strength-first schema/default appears.

### 4. Memory invariants

- Create each accepted memory type and show status/provenance.
- Prove user-created/intake-confirmed content activation and
  inferred/system-proposed non-activation.
- Exercise accept, edit-and-accept, reject, disable/enable, expiry/review, and
  deletion.
- Confirm edits create the approved inspectable history atomically.
- Confirm active-context selection excludes proposed, rejected, archived,
  expired/review-due, and deleted content.
- Confirm deletion removes content-bearing versions and raw content does not
  remain in logs/audit evidence beyond approved minimized records.
- Exercise conservative, non-diagnostic handling of approved health-adjacent
  fixtures without external transfer.

### 5. Intake and publication invariants

- Start, save, leave, resume, cancel, expire, and retry a structured intake.
- Confirm every candidate requires accept, edit-and-accept, or reject.
- Publish a mixed selection and prove the accepted destination batch is atomic.
- Simulate validation and mid-operation failures; prove no partial/duplicate
  destination state.
- Exercise exact/near duplicate, contradiction, fourth-core, rank, and stale
  destination conflicts without silent merge/overwrite.
- Confirm destination records use accepted goal/memory services, provenance,
  versions, and ownership.
- Confirm no production AI extraction, prompt/provider call, plan, or
  diagnostic advice exists.

### 6. Mobile navigation and honest states

- At `390x844`, navigate Today, Plan, Coach, Progress, and You through bottom
  navigation and direct deep links.
- Verify active semantics, headings, labels/icons, focus, safe-area/touch
  behavior, text zoom/reflow, and no covered controls.
- Verify Today/Plan/Coach/Progress show only accepted honest empty/blocked
  content: no fake workouts, dates, metrics, charts, chat, coach output, locks,
  or replan/generate action.
- Verify You exposes only accepted goals, memory, and intake behavior.
- Exercise signed-out, unconfirmed, expired/revoked session, safe return path,
  malicious redirect, browser back/cache, unknown route, loading, error, and
  network interruption states.
- Confirm network loss never reports an unconfirmed save or hidden offline
  queue.

### 7. Accessibility

- Automated accessibility scan on each top-level destination and each critical
  goal/memory/intake state.
- Keyboard-only execution of create/edit/reorder/review/publish/disable/delete
  and all navigation/session recovery paths.
- Logical landmarks/headings, programmatic labels, fieldset/legend, error
  summary and field association, focus management, live announcements,
  non-color-only state, contrast, touch target, zoom/reflow, reduced motion, and
  confirmation dialog behavior.
- Record automated tools/versions and manual checks separately; an automated
  scan alone is insufficient.

### 8. Security, privacy, and secrets

- Inspect client bundles, rendered HTML, source maps if generated, logs,
  screenshots, snapshots, fixtures, error payloads, URLs, analytics/event
  payloads, and committed files.
- Confirm absence of passwords, tokens, service-role/secret keys, connection
  strings, full emails where prohibited, raw goal/memory/intake/health content,
  and raw provider/database/Auth errors.
- Confirm no external analytics, AI, model, SMTP, remote database, or other
  service call was introduced by M1.
- Trace each M1 data category to accepted inventory, retention,
  deletion/backup, access/export, and notice decisions; flag missing privacy
  implementation as an external-use blocker.
- Verify account deletion design can discover all M1-owned data and
  content-bearing history; do not execute a real deletion operation unless its
  separate implementation ticket is accepted and part of the test environment.
- Re-run dependency audit and compare new findings with the accepted
  M0-01/M0-06 disposition.

### 9. Regression and build quality

- M0 signup, local email confirmation, profile provisioning, sign-in, sign-out,
  session refresh, protected route, cache header, owner/anonymous/cross-user,
  and 390px authentication flows still pass.
- Formatting, lint, strict typecheck, all unit/integration tests, all database
  tests, Playwright, and production build pass.
- The lockfile is internally consistent and direct dependencies remain pinned.
- No unrelated refactor or unapproved visible behavior appears in the integrated
  diff.

## Implementation sequence and file guidance

1. Create an isolated validation branch/worktree from the exact integrated,
   accepted M1 commit set.
2. Verify readiness without modifying application/schema files.
3. Run clean install, migration, generated-type, database, application,
   browser, build, audit, and diff checks in the documented order.
4. Execute the matrix with deterministic synthetic users and content.
5. Record evidence and findings only under `docs/validation/`, plus explicitly
   approved safe screenshots or machine-readable reports.
6. Route every failure to the owning ticket and stop the affected acceptance
   path until its correction is independently reviewed.
7. Re-run the affected matrix and full regressions only after an accepted
   correction is integrated.
8. Commit the consolidated validation artifacts and hand them to the lead
   agent; do not merge, deploy, or start M2.

Expected changes are limited to `docs/validation/M1-05-VALIDATION.md`, safe
evidence files under `docs/validation/`, and only pre-approved test-report
configuration when strictly necessary. Application source, migrations,
existing assertions, backlog statuses, and approved briefs are read-only for
the validator.

## Commands and evidence

The validator must inspect installed CLI help and repository scripts before
running commands. The expected local sequence is:

```powershell
npm.cmd ci
npx.cmd supabase --version
npx.cmd supabase start
npx.cmd supabase db reset --local
npx.cmd supabase db lint --local --level warning --fail-on warning
npx.cmd supabase db advisors --local --type all --level warn --fail-on warn
npx.cmd supabase test db --local
npx.cmd supabase gen types typescript --local
npm.cmd run format:check
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test:run
npm.cmd run test:e2e
npm.cmd run build
npm.cmd audit
git diff --check
git status --short
```

If a command differs in the installed version, record the discovered supported
equivalent. Do not guess a replacement or use a remote project.

Evidence belongs under `docs/validation/` and should include:

- `M1-05-VALIDATION.md` as the authoritative consolidated record;
- 390px screenshots for each destination and critical error/conflict/safety
  state, with no real personal data;
- machine-readable test reports only when already supported and safe to commit;
- exact commits, tool/runtime versions, dates, command results, and reviewer;
- schema/privilege/policy and domain-invariant matrices;
- accessibility automated/manual results;
- privacy/security/secret/external-request findings;
- regression results, known limitations, and external-use blockers; and
- links to focused correction tickets if anything fails.

Do not commit local databases, Mailpit messages, Auth tokens, browser profiles,
coverage containing secrets, environment values, or raw personal fixtures.

## Finding ownership and stop rules

| Finding | Return to |
|---|---|
| Goal field, rank, lifecycle, core-limit, concurrency, delete, or goal UX | M1-01 |
| Memory provenance, status, history, expiry, delete, sensitive handling, or memory UX | M1-02 |
| Intake field, candidate, review, duplicate/conflict, atomicity, resume, or safety flow | M1-03 |
| Navigation, route, session shell, empty/error/offline state, or nav accessibility | M1-04 |
| Auth/profile/session/RLS foundation regression | Owning M0 ticket |
| Privacy notice/consent/deletion/inventory/retention implementation absent or wrong | Later M0-04 implementation ticket |
| Hosted environment/email/bot protection/CI/deployment issue | M0-06 |
| New desired behavior or material ambiguity | New proposed brief/ADR and product-owner decision |

The validator may add validation documentation and non-product test evidence
explicitly authorized by this ticket. It may not change migrations,
application code, existing test expectations, copy, or behavior to make a
failure pass.

## Acceptance criteria

1. Readiness is proven with exact accepted M1 commits and no unreviewed behavior
   in the validation base.
2. A clean local database reset applies every migration, database lint/advisors
   pass, and generated types are reproducible.
3. Direct tests prove owner access plus anonymous/cross-user denial for every
   M1-owned table/operation and retain M0 profile isolation.
4. The maximum-three-active-core invariant passes normal, stale, retry, and
   genuinely concurrent cases.
5. Goal lifecycle/rank/archive-delete and memory
   provenance/status/history/expiry/delete invariants match accepted briefs.
6. Intake review requires explicit decisions and atomic/idempotent publication,
   with duplicate/conflict/failure paths verified.
7. The accepted goal, memory, intake, and five-destination navigation stories
   pass at `390x844` without fake training, metrics, plan, coaching, or AI.
8. Automated and manual accessibility checks pass or every focused failure is
   returned to its owner before acceptance.
9. Security/privacy/secret inspection finds no cross-user exposure, browser
   secret, sensitive logging, unapproved external request, or production AI.
10. M0 regressions, format, lint, typecheck, all tests, Playwright, and build
    pass with exact results recorded.
11. The consolidated record distinguishes pass, limitation, external-use
    blocker, and deferred behavior without weakening criteria.
12. M1-05 introduces no product/schema behavior; `git diff` contains only
    approved validation artifacts and any explicitly approved test-report
    configuration.

## Handoff

The independent validator provides:

- exact validation branch/commit and integrated source commits;
- readiness and scope confirmation;
- changed validation files;
- exact tool/runtime versions and commands/results;
- clean migration/type-generation and schema/policy matrices;
- owner/anonymous/cross-user and concurrent fourth-core evidence;
- goal, memory, intake, navigation, accessibility, privacy/security, secret,
  dependency, and regression findings;
- `390x844` demo path and evidence index;
- known limitations, external-use blockers, and focused correction links;
- confirmation that no product behavior/schema was changed; and
- one verdict: **PASS**, or **BLOCKED with findings routed to owning tickets**.

After a PASS, the lead agent requests the precise product-owner decision:
**accept the consolidated M1 milestone as locally validated, or return focused
validation corrections**. M2 remains separately gated and external use remains
blocked until every named M0 privacy/deployment implementation gate passes.

## Open validation decisions

M1-05 should not reopen accepted feature behavior. Before dispatch, approve
only validation-operational choices:

1. exact integrated commit set and validator identity;
2. approved fixture strategy and whether screenshots/test reports are committed;
3. automated accessibility tool/version plus required manual checklist;
4. any environment-specific command equivalent discovered through CLI help;
5. dependency-audit severity disposition owner; and
6. the exact external-use blocker statement based on actual M0
   privacy/deployment implementation status.

Any choice that changes visible behavior, schema, retention, authorization, or
architecture returns to the owning ticket rather than being decided here.

## Approval gate

The product owner or lead agent may approve this validation procedure only
after M1-01 through M1-04 are individually accepted. Approval starts an
independent validator; it does not approve fixes, M2, deployment, external use,
AI, analytics, or privacy implementation. Until the dependencies and readiness
criteria are satisfied, M1-05 remains **proposed**.
