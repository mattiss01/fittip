# M3-04: Plan editing, locks, and acceptance

**Status:** proposed — not approved for implementation

**Milestone:** M3

**Priority:** P1

**Depends on:** [M3-02 accepted](M3-02-ROADMAP-PROPOSAL.md) and
[M3-03 accepted](M3-03-SELECTED-HORIZON-PLAN-PROPOSAL.md)

**Architecture boundary:** ADR-006 and ADR-007 accepted; M0-06A accepted before
founder-hosted use

**Blocks:** [M3-05](M3-05-M3-VALIDATION-SLICE.md)

## Outcome

Let the owner edit a roadmap/selected 1–7-day proposal, lock proposed sessions or
activities, review changes side by side, and explicitly accept one
transactional immutable version. Acceptance reuses the accepted M1
personal-activity model for AI-created or user-confirmed definitions without
introducing a global library.

This slice establishes proposal editing and AI-proposal acceptance only. It
does not change accepted M1 completion/logging behavior, implement replan
behavior, or alter accepted history.

## Local-owner and pre-friends boundary

All data remains product-owner or synthetic local data. This ticket makes no
provider call beyond accepted M3-02/M3-03 generation, adds no remote resource,
and does not authorize friends, non-M0-06A-hosted/external use, or analytics. The full M0
privacy/recovery/instrumentation/deployment gates remain mandatory before those
uses.

## Scope

1. Define editable working-copy semantics for roadmap and detailed-plan
   proposals.
2. Let the owner edit approved structured fields while retaining source and
   revision history.
3. Let the owner lock/unlock a proposed session and/or individual proposed
   activity before acceptance.
4. Show side-by-side or equivalent explicit change review from generated source
   to edited candidate.
5. Validate the complete candidate through the same server constraints as
   M3-03.
6. Create/reuse owner-owned definitions through the accepted M1
   personal-activity contract for accepted AI-created or user-confirmed
   activities.
7. Accept roadmap and detailed plan transactionally into immutable versioned
   records with source/parent references.
8. Make the accepted detailed version the current operational plan without
   deleting prior accepted versions.
9. Add idempotency, concurrency, ownership/RLS, transaction, versioning, lock,
   activity, mobile, and accessibility tests.

## Non-goals

- No change to session completion, factual log, actual metric,
  skipped/partial/replaced outcome, plan-versus-actual comparison, or Progress
  behavior already accepted in M1.
- No replan request, AI replan, accepted-plan diff, or enforcement of locks
  against future replans; those belong to later milestones.
- No mutation of completed history, past sessions, or a prior accepted version.
- No global activity/exercise catalog, public sharing, coach role, sport pack,
  analytics sink, new hosted resource, external user, or new provider call.

## Record and versioning rules

- Generated proposal, user-edited proposal revision, accepted roadmap version,
  accepted detailed-plan version, planned session, planned activity, and personal
  activity definition are distinct records.
- Every owned record has immutable `user_id`; references must remain within one
  owner.
- Editing appends a proposal revision or creates a derived proposal. The
  original generated candidate remains inspectable.
- Acceptance creates new immutable accepted roadmap/detailed-plan versions linked to
  their source proposal and prior accepted version where applicable.
- Prior accepted versions are never overwritten or deleted by a later
  acceptance.
- Only one current accepted roadmap and one current accepted detailed-plan version may
  be selected for an owner at a time; switching the current pointer is part of
  the same transaction.
- A retry of the same acceptance returns the same accepted identifiers.
- Stale proposal/source/current-version state returns a conflict and writes
  nothing.

## Edit rules

- Editable fields are an exact allowlist from the accepted roadmap/plan
  contracts.
- Dates remain within the exact requested 1–7-day range; server
  time/session/activity,
  allocation, target, unit, and safety constraints still apply.
- The owner can add/remove/reorder sessions and activities only within approved
  limits.
- Edits never silently alter goals, memory, intake, or the accepted roadmap.
- A change summary classifies added, removed, moved, or changed structured
  fields and shows concise owner-readable values.
- The application does not invent or expose hidden model reasoning.

## Lock rules

- A lock is explicit at session or activity level and visibly labeled.
- A session lock covers the session's date/order/content and contained
  activities unless the approved model permits an independently unlocked child;
  the exact inheritance rule needs approval.
- An activity lock covers its structured prescription and position within the
  session under the approved rule.
- Locks are stored in the accepted version and copied from the reviewed
  proposal candidate during acceptance.
- M3-04 proves lock persistence and edit protection inside the current
  proposal/accepted version. Replan enforcement remains out of scope.

## Personal activity rules

- Accepted activities create or reference definitions owned by the same user.
- Definitions record origin (`ai_created` or `user_created`), normalized name,
  display name, sport/domain, instructions/intent, measurement mode, validated
  target template, status, and version/source where approved.
- The owner may edit a proposal's activity, producing a user-confirmed
  definition on acceptance.
- Reuse requires an explicit deterministic match or owner choice; no
  auto-merge of merely similar names.
- Definitions are private, editable/archivable under later approved behavior,
  and never form a global catalog.
- Plan-version activities retain an immutable snapshot/reference sufficient to
  preserve what was accepted if a personal definition later changes.

## AI boundary

- Editing and acceptance are deterministic server/domain operations and make
  no provider call.
- Generated origin remains visible, but an owner edit records user confirmation
  rather than pretending the changed value came from the model.
- No model may decide locks, accept a proposal, choose current pointers, merge
  personal activities, or write version records.
- Returning to AI for a materially new proposal is an explicit later
  generation action under M3-01/M3-03, not a hidden effect of editing.

## Transactional acceptance

One server/domain transaction must:

1. verify current owner and proposal revision;
2. re-read source goals, memory, roadmap, and current accepted version;
3. reject stale/cross-user/invalid/unsafe state;
4. validate every roadmap, date, session, activity, lock, allocation, and
   target rule;
5. create/reuse approved personal activity definitions;
6. create immutable roadmap/detailed-plan/session/activity records;
7. switch the owner's current accepted pointers;
8. mark the proposal accepted with its destination ids; and
9. commit once or roll back everything.

Any database function/RPC, trigger, elevated credential, or new privileged
connection needed for this transaction requires a separate ADR and approval.

## Proposed 390px flow

1. The owner opens the M3-03 proposal and chooses **Edit and review**.
2. The owner edits structured roadmap/plan/session/activity fields and
   locks/unlocks sessions or activities.
3. The review screen shows generated versus edited values and all locks.
4. The owner chooses **Accept plan** only after seeing that the action creates
   an immutable current version.
5. Acceptance returns the accepted selected-horizon plan and roadmap version with
   visible lock labels.
6. Reject/back leaves accepted state unchanged; stale state preserves edits for
   comparison without committing them.
7. Repeated submit does not create duplicate versions or activities.

Exact copy, edit density, lock inheritance, diff presentation, and destructive
confirmation require approval.

## Acceptance criteria

1. At `390x844`, the owner can edit, lock/unlock, compare, reject, and accept
   the approved proposal fields.
2. Generated and edited proposal evidence remains separate and inspectable.
3. Acceptance creates immutable owner-scoped roadmap and detailed-plan versions,
   sessions, activities, source links, and current pointers atomically.
4. Failed/stale/concurrent acceptance writes none of the transaction and
   preserves the prior accepted current version.
5. Idempotent retry creates at most one accepted version and one approved set
   of personal activity definitions.
6. Session/activity locks persist exactly as reviewed and cannot be silently
   removed during editing/acceptance.
7. Personal activities are user-owned AI-created/user-created definitions with
   no global library or silent merge.
8. Later changes to a personal activity cannot rewrite the immutable accepted
   plan snapshot.
9. Anonymous/user B cannot read or mutate user A's proposals, activities,
   plans, versions, sessions, locks, or current pointers.
10. Acceptance triggers no provider call and does not modify goals, memory,
    intake, completed history, or another accepted version.
11. Mobile, accessibility, migration, RLS, transaction, quality, and build
    gates pass.
12. No logging/replan/friend/non-M0-06A-hosted/external/analytics behavior, secret, remote
    resource, or unapproved spend is added.

## Test plan

- Edit allowlist, validation, add/remove/reorder, date/time/target/allocation,
  and safe error tests.
- Lock transition/inheritance, session/activity conflict, and reviewed-state
  snapshot tests.
- Transaction fault injection after each logical step; assert complete rollback.
- Double-submit, concurrent accept, stale proposal/source/current pointer, and
  retry idempotency.
- Personal activity create/reuse/near-duplicate/owner-edit/snapshot/archive-
  compatibility cases.
- Direct schema/grant/RLS owner/anonymous/cross-user/cross-owner-reference
  tests for every new table.
- Regression proving no proposal generation call during edit/accept and no
  completed/history/replan record exists.
- Playwright `390x844` edit → lock → side-by-side review → accept, plus reject,
  stale conflict, failed transaction, and repeated-submit paths.
- Accessibility and leakage scans across forms, diffs, errors, logs, telemetry,
  screenshots, URLs, snapshots, and client bundles.

## Implementation guidance

Reuse the accepted M3-02/M3-03 schemas and constraints rather than copying
them. Keep proposal editing and transactional acceptance in server/domain
services; UI submits no owner id and contains no versioning/lock business
rules. Use forward migrations, explicit least-privilege grants, RLS ownership,
generated types, and direct authorization tests.

## Required handoff

Provide exact branch/commit, changed files, approved edit/lock/activity/version
contracts, migration and privilege/RLS matrix, transaction rollback/
idempotency/concurrency evidence, immutable snapshot proof, `390x844` demo,
leakage scan, exact commands/results, limitations, and confirmation that no
logging, completed-history, replan, friend, non-M0-06A-hosted, analytics, or new-provider
behavior was added.

## Open decisions

1. Editable field allowlist and add/remove/reorder limits.
2. Session-lock/activity-lock inheritance and unlock rules.
3. Side-by-side diff presentation and exact acceptance copy.
4. Whether one acceptance can accept both roadmap and week, or only a week
   linked to an already accepted roadmap (recommendation: explicit atomic
   acceptance of the reviewed pair when both are new).
5. Current-pointer and supersession semantics.
6. Personal activity matching/reuse, owner edit, archive, and immutable
   snapshot fields.
7. Transaction architecture and any required ADR.
8. Proposal/accepted-version/personal-activity retention and later deletion
   handling.

## Approval gate

The product owner must approve the edit, lock, diff, activity, version,
transaction, UX, and retention decisions. M3-02 and M3-03 must be accepted.
Approval is owner/synthetic local or M0-06A founder-hosted only and does not
authorize logging, replan, friends, public registration, commercial use,
production, analytics, or M3-05.
