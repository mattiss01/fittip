# M3-02: High-level roadmap proposal

**Status:** proposed — not approved for implementation

**Milestone:** M3

**Priority:** P1

**Depends on:** [M3-01 accepted](M3-01-LOCAL-AI-ADAPTER-CONTROLS.md), the
accepted M1 training foundation, and the accepted M2 goal, memory, intake, and
validation foundations

**Architecture boundary:** ADR-006 and ADR-007 accepted; M0-06A accepted before
founder-hosted use

**Blocks:** [M3-03](M3-03-SELECTED-HORIZON-PLAN-PROPOSAL.md),
[M3-04](M3-04-PLAN-EDIT-LOCK-ACCEPTANCE.md), and
[M3-05](M3-05-M3-VALIDATION-SLICE.md)

## Outcome

Let the authenticated product owner request and review a structured,
sport-agnostic high-level roadmap derived from accepted goals, active memory,
and active coaching context explicitly accepted by the user. The roadmap
expresses phases, milestones, focus,
review points, uncertainty, and goal tradeoffs. It remains a versioned proposal
until the owner explicitly accepts, rejects, or edits it.

The roadmap is strategic direction for following weeks/months, not a detailed
session prescription or an accepted selected-horizon detailed plan.

## Local-owner and pre-friends boundary

Only the product owner's own data or synthetic data may be used locally.
M3-01's explicit enablement, owner allowlist, budget, schema, telemetry, and
fail-closed controls apply. Friends, public registration, commercial use,
production, external analytics, and new remote resources remain prohibited
until the M0 gates pass.

## Scope

1. Define strict roadmap input, proposal, phase, milestone, allocation,
   uncertainty, and review-point schemas.
2. Construct owner-scoped context from accepted active goals, eligible active
   memory records explicitly accepted by the user.
3. Request one roadmap candidate through M3-01.
4. Apply deterministic server validation for owner, source versions, time
   bounds, goal allocation, safety, and schema.
5. Persist an owner-owned, immutable proposal plus minimized source references
   and validation metadata.
6. Show a 390px review flow with concise rationale and visible uncertainty.
7. Support explicit accept, reject, and edit-to-new-proposal actions.
8. Keep acceptance transactional and separate from proposal generation.
9. Add authorization, versioning, AI-output, UX, safety, and idempotency tests.

## Non-goals

- No dated selected-horizon sessions, planned activities, exact volume/intensity,
  daily schedule, logging, replan, completed history, or progress metrics.
- No direct model write, silent acceptance, automatic replacement, or editing
  an accepted version in place.
- No unbounded chat history, global sport/exercise library, sport-specific
  capability pack, or medical advice.
- No provider/model/key/spend decision, external analytics, new remote
  resource, friend data, public registration, commercial use, or production.

## Data and versioning rules

- Every roadmap proposal and accepted roadmap version has immutable `user_id`.
- Proposal and accepted version are separate permanent records.
- A proposal stores operation/schema/prompt versions, model technical codes,
  validation state, idempotency reference, and source record ids/versions.
- It does not store raw prompts or duplicate raw source content solely for
  telemetry.
- Accepting creates an immutable accepted roadmap version referencing its
  source proposal and prior accepted version where present.
- Editing a proposal creates a new version/candidate; it does not rewrite the
  original AI output or an accepted roadmap.
- Rejection records a minimized status/reason category if approved; it never
  makes the content active.
- All exposed tables use explicit grants, RLS with owner predicates, server
  ownership filters, and cross-user tests.

## Structured roadmap rules

The strict proposal must contain:

- roadmap title/purpose and bounded horizon;
- ordered phases with focus and approximate time range;
- milestones and observable review criteria;
- referenced active goals and relative attention/tradeoffs;
- assumptions and material uncertainties;
- focused review points that state when direction should be reconsidered;
- concise owner-facing rationale; and
- a non-diagnostic safety note when relevant.

The roadmap must not claim certainty, guarantee results, prescribe treatment,
or conceal goal conflicts. Dates and durations are server-validated against
accepted goal dates and approved maximum horizons.

## User flow at 390px

1. The owner opens **Plan → Roadmap** and sees current accepted state, if any.
2. The owner chooses the approved explicit generation action.
3. A pending state explains that nothing changes until acceptance.
4. The proposal shows phases, milestones, goal allocation, uncertainty, review
   points, and concise reasoning.
5. The owner may **Accept**, **Edit proposal**, or **Reject**. No action is
   preselected.
6. Edit shows structured fields and produces a new reviewable proposal.
7. Accept creates one immutable accepted roadmap version and returns to its
   detail.
8. Failure shows a safe retry path; it never falls back to unstructured prose
   or claims a roadmap was saved.

Exact labels, horizon defaults, edit controls, and copy remain open product
decisions.

## AI and safety rules

- M3-01 gates every call and returns only validated structured candidates.
- The roadmap context contains no rejected/archived/expired memory or
  inactive goals.
- The server independently verifies referenced goals and all numeric/time
  bounds.
- Pain, illness, injury, and severe-fatigue context yields conservative,
  non-diagnostic direction and approved stop/professional-help copy where
  required.
- The AI cannot persist a proposal, accept it, create a detailed plan, or mutate
  goals/memory.
- Malformed, extra-field, unsupported, unsafe, or business-invalid output is
  rejected in full.

## Acceptance criteria

1. An owner can request, inspect, edit, reject, and accept a roadmap proposal at
   `390x844`.
2. Context uses only eligible active goals and memory records that are
   user-created or explicitly accepted by the current user.
3. Output is structured, sport-agnostic, bounded, versioned, and includes
   uncertainty and explicit review points.
4. Proposal, rejection, and accepted roadmap are distinguishable records;
   acceptance creates an immutable version.
5. No proposal or edit becomes active without explicit acceptance.
6. Concurrent/retried generation and acceptance are idempotent and cannot
   duplicate provider calls or accepted versions.
7. Stale source records or a changed current roadmap create a conflict for
   review, not silent overwrite.
8. User B and anonymous callers cannot read or mutate user A's proposals,
   sources, or accepted roadmap.
9. Invalid/unsafe output and provider/control failure create no active roadmap
   and expose no raw content/error.
10. No detailed selected-horizon plan, activity catalog, logging, replan, external
    user, non-M0-06A hosted behavior, analytics sink, secret, or unapproved spend is
    added.

## Test plan

- Schema/business-rule fixtures for phases, horizons, milestones, allocations,
  uncertainties, review points, unknown fields, size, and invalid dates.
- Owner/anonymous/cross-user RLS and repository tests for proposal/source/
  accepted-version records.
- Generation/accept/reject/edit idempotency, stale source, concurrent
  acceptance, and simulated transaction failure.
- AI fixture plus opt-in live owner/synthetic path through M3-01; verify zero
  direct writes and safe failure.
- Safety fixtures for ordinary limitation, severe/acute/worsening signal, and
  prohibited diagnosis/treatment claims.
- Playwright at `390x844` for empty, generating, proposal, uncertainty, edit,
  reject, accept, conflict, and safe error states.
- Leakage scans for prompts/content/secrets in telemetry, logs, errors,
  screenshots, snapshots, URLs, and client bundles.

## Implementation guidance

Create one focused owner-scoped proposal/version model through a supported
forward migration after approval. Reuse accepted M1 training repositories,
accepted M2 context repositories, and M3-01 contracts; do not duplicate their
validation. Keep generation, proposal
persistence, and acceptance as separate domain operations. Any privileged
database function, trigger, elevated connection, or new transaction boundary
requires an ADR and product-owner approval.

## Required handoff

Provide the exact branch/commit, changed files, schema and RLS matrix, source
selection and output schema versions, fixture/live validation results,
idempotency/transaction evidence, `390x844` demo path, leakage scan, full
commands/results, limitations, and confirmation that no detailed-plan,
direct-write, friend, non-M0-06A-hosted, analytics, or unapproved
provider/spend behavior was added.

## Open decisions

1. Default roadmap horizon and maximum horizon.
2. Phase/milestone fields and goal-allocation representation.
3. Exact uncertainty and review-point presentation.
4. Visible generation action, edit controls, rejection behavior, and copy.
5. Whether accepting a new roadmap supersedes the prior current version while
   retaining it as immutable history (recommendation: yes).
6. Proposal/source retention and deletion behavior for owner-only local use and
   later privacy implementation.
7. Exact safe-copy triggers and whether a severe signal pauses generation.

## Approval gate

The product owner must approve this brief and all roadmap data, horizon, UX,
safety, retention, and transaction decisions. M3-01 must be accepted with its
provider/model/budget decision. Approval remains owner/synthetic local or
M0-06A founder-hosted only and does not authorize M3-03, friends, public
registration, commercial use, production, or an analytics sink.
