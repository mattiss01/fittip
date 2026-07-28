# M1-01: Training records and ownership foundation

**Status:** accepted — product-owner acceptance recorded 28 July 2026

**Milestone:** M1 — manual training planning and tracking

**Priority:** P1

**Feature brief:** [F-002 approved](../product/F-002-MANUAL-TRAINING-PLANNING-TRACKING.md)

**Visual model:** [Data-model overview](../product/DATA-MODEL-OVERVIEW.md)

**Validation:** [Builder and review evidence](../validation/M1-01-VALIDATION.md)

**Depends on:** [M0-03 / F-001 accepted](../product/F-001-PUBLIC-ACCOUNT-AUTHENTICATION.md), [M0-02-C1 accepted](M0-02-C1-REMOVE-USERNAME.md), [ADR-002](../decisions/ADR-002-M0-02-DATA-AUTHORIZATION-BOUNDARY.md), [ADR-004](../decisions/ADR-004-USERNAME-FREE-ACCOUNT-PROFILE.md), and [ADR-008](../decisions/ADR-008-M1-TRAINING-RECORD-TRANSACTIONS.md)

**Hosted boundary:** [M0-06A accepted](M0-06A-FOUNDER-HOSTED-STAGING.md) for product-owner or synthetic data only

**Blocks:** [M1-02](M1-02-SELECTABLE-HORIZON-PLANNING.md), [M1-03](M1-03-QUICK-TRAINING-LOGGING.md), and [M1-05](M1-05-M1-VALIDATION-SLICE.md)

## Outcome

FitTip has one durable, sport-agnostic owner-scoped record model that can
represent:

- a user-authored detailed plan version for a selected 1–7-day horizon;
- planned sessions and their planned activities;
- personal activity definitions created by the user;
- factual completed, partial, skipped, replaced, rest, and unplanned training;
- the link between a completion and its source plan without merging the two;
- future AI proposals and replans without rewriting the manual foundation.

This is a data/domain slice. It adds no complete planning or logging screen.

## Product invariants owned by this ticket

1. Plans, proposals, and actual completions are separate permanent records.
2. Saving a changed accepted plan creates a new version with a parent/source
   reference. It does not overwrite the prior accepted version.
3. A completed-session record never changes the planned-session snapshot it
   references.
4. User locks are stored separately from completion state and protect future
   automated changes. The user may explicitly unlock their own future content.
5. Every owned row has `user_id`; repositories derive it from verified Auth,
   repeat ownership predicates, and remain subject to RLS.
6. Activities are owner-created personal definitions or plan snapshots. There
   is no global exercise library.
7. Measurement shapes are sport-agnostic and schema validated. Sets/reps/load
   are one mode, not the default product model.

## Proposed data boundary

The builder must propose the exact migration and obtain approval for any
material deviation. The expected normalized concepts are:

- `personal_activities`
- `detailed_plan_versions`
- `planned_sessions`
- `planned_activities`
- `completed_sessions`
- `completed_activities`

Every owned table and record carries an explicit `user_id`. Relationships,
server authorization, and RLS must also enforce same-owner references without
privileged application credentials.

### Detailed plan version

- owner-selected `day_count` constrained to 1 through 7;
- owner-local start date and exactly `day_count` consecutive local dates;
- IANA timezone used to interpret the week;
- monotonic owner-scoped version number;
- nullable parent/source version;
- source kind, initially only `manual`;
- accepted timestamp and current-version pointer semantics;
- immutable accepted historical versions.

### Planned session and activity

- local date, order, title, sport/domain, intent, expected duration, and note;
- zero or more ordered planned activities;
- optional link to a personal activity plus an immutable display/target
  snapshot;
- measurement mode:
  `sets_reps_load`, `time_distance_pace`, `duration_intensity`,
  `skill_repetitions`, or `custom`;
- schema-validated target with explicit units;
- session/activity lock state that future automated work must respect.

### Completion

- nullable planned-session source so unplanned training is representable;
- actual local date/time, duration, and status;
- factual completed-activity snapshots and validated actual measurements;
- append-only correction/history design rather than silent destructive edits;
- no field that converts a plan row into an actual row.

## Scope

- Forward-only Supabase migrations created with the exact-pinned CLI.
- Explicit table privileges and RLS for owner access.
- Domain schemas for all database-boundary inputs and flexible JSON values.
- Server-only repositories/services with verified-user ownership.
- Atomic current-plan/version behavior and stale-write protection.
- Generated public-schema TypeScript types.
- Database and application tests for ownership, record separation, version
  history, date rules, measurement validation, and cross-user denial.
- Documentation of the actual privilege/policy matrix and changed data.

## Non-goals

- Planning, Today, logging, or history UI.
- AI extraction, plan generation, coaching, or provider calls.
- Goals, memory, intake, analytics, consent UI, deletion workflow, or export.
- Calendar sync, recurring schedules, templates, global activities, media, or
  sport-specific capability packs.
- Editing completed history without an approved revision/audit design.
- Friend data, public registration, commercial use, or production.

## Acceptance criteria

1. Clean migration creates the approved training-record model.
2. Anonymous users have no owned-record privileges.
3. User A cannot select, insert, update, or delete user B's records through
   repositories, direct Data API access, or database tests.
4. The fourth consecutive plan revision retains every earlier accepted
   version and has an unambiguous current pointer.
5. Planned and completed records remain separate and independently queryable.
6. An unplanned completion is valid without a planned-session id.
7. Requested horizons of 1, 2, and 7 days are valid; 0 and 8 days and any date
   count differing from the stored request are rejected.
8. Every measurement mode accepts valid sport-neutral examples and rejects
   malformed or unit-ambiguous payloads.
9. A personal activity is owned, editable for future use, and never mutates
   historical plan/completion snapshots.
10. Stale concurrent plan writes fail safely.
11. No service-role or secret credential is introduced.

## Test and validation plan

- Clean local reset, migration lint/advisors, generated-type diff, and database
  tests.
- Owner, anonymous, and cross-user CRUD matrix for every exposed table.
- Domain tests for selected 1–7-day ranges, requested/count mismatch,
  timezone/date boundaries, measurement schemas, parent/version rules, locks,
  and current-pointer behavior.
- Repository tests proving Auth-derived ownership and stale-write handling.
- Architecture scan for browser imports, privileged clients, secrets, and
  unapproved external calls.
- Existing lint, typecheck, unit, formatting-baseline, build, and regression
  commands.

## Implementation sequence and file guidance

1. Confirm the approved contract and add any required ADR for transactional
   version/current-pointer enforcement.
2. Add one forward migration under `supabase/migrations/`.
3. Add database tests under `supabase/tests/database/`.
4. Regenerate `src/lib/supabase/database.types.ts`.
5. Add domain schemas/services under `src/server/` and user-scoped
   repositories under `src/server/repositories/`.
6. Add unit, repository, concurrency, and architecture tests.
7. Produce `docs/validation/M1-01-VALIDATION.md` only when the ticket becomes
   testable.

## Open product, data, and architecture decisions

1. **Saved-plan semantics.** Recommendation: every explicit save of changed
   accepted content creates a new immutable manual plan version.
2. **Planning horizon.** The product owner selected an explicit requested
   `day_count` of 1 through 7. Recommendation: default the first plan to 7,
   remember the last choice thereafter, allow any owner-selected start date,
   and never silently pad a shorter horizon.
3. **Activity reuse.** Recommendation: personal definition plus immutable
   plan/completion snapshot; never retroactively update history.
4. **Measurement contract.** Approve modes, required units, JSON limits, and
   custom-value boundaries.
5. **Completion correction.** Recommendation: append-only revisions with a
   current pointer and visible correction history.
6. **Deletion/archive.** Recommendation: archive referenced personal
   activities and hard-delete only never-referenced definitions; align final
   retention with the later M0-04 implementation.
7. **Concurrency.** Approve the per-owner transaction/current-pointer design.
   Any private RPC, trigger, or elevated credential requires an ADR and focused
   security review.
8. **Sensitive fields.** Approve whether pain/illness flags exist in the base
   contract now or enter with M1-03, plus their founder-only privacy boundary.

## Approval

The product owner approved this ticket and its listed record, version/save,
horizon, activity snapshot/reuse, measurement, correction, deletion/archive,
concurrency, and sensitive-field recommendations in chat on 28 July 2026.
M1-02 through M1-05 remain separately proposed.
