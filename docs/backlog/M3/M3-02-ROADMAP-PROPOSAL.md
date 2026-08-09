# M3-02: High-level roadmap proposal

**Status:** proposed — not approved for implementation

**Milestone:** M3

**Priority:** P1

**Depends on:** [M3-01 accepted](M3-01-LOCAL-AI-ADAPTER-CONTROLS.md), the
accepted M1 training foundation, the accepted M2 goal, memory, intake, and
validation foundations, and
[ADR-013](../../decisions/ADR-013-AI-TRAINING-HISTORY-ELIGIBILITY.md) plus
[ADR-014](../../decisions/ADR-014-PLANNING-NOTE-BOUNDARY.md) — **both accepted
9 August 2026**

**Revised:** 8 August 2026 — compose step and planning note added, context
policy ADRs named, stub-schema gap recorded

**Revised:** 9 August 2026 — both context ADRs accepted, so they no longer block
dispatch. Planning-note length and byte reservation settled; the per-source
context allocation is named as an M3-01B dependency; regeneration confirmed out
of scope here

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
   uncertainty, and review-point schemas. The current contract types are stubs;
   see above.
2. Construct owner-scoped context from accepted active goals, eligible active
   memory records explicitly accepted by the user, and training history under
   ADR-013.
3. Add a compose step: an optional **planning note** under ADR-014, plus a
   collapsed-by-default summary of the goals, active constraints, and recent
   load the coach will receive.
4. Request one roadmap candidate through M3-01. The same response carries
   memory candidates extracted from the planning note; the two sections
   validate independently, and an invalid memory section is discarded without
   failing the roadmap.
5. Apply deterministic server validation for owner, source versions, time
   bounds, goal allocation, safety, and schema.
6. Persist an owner-owned, immutable proposal plus minimized source references,
   validation metadata, and the planning note.
7. Show a 390px review flow with concise rationale and visible uncertainty.
8. Support explicit accept, reject, and edit-to-new-proposal actions, and
   review of any extracted memory candidates.
9. Keep acceptance transactional and separate from proposal generation.
10. Add authorization, versioning, AI-output, UX, safety, and idempotency
    tests, including planning-note injection cases under ADR-014 decision 4.

## Context policy: both ADRs are accepted

**Both were accepted on 9 August 2026 and no longer block dispatch.**

**[ADR-013](../../decisions/ADR-013-AI-TRAINING-HISTORY-ELIGIBILITY.md)** —
what training history a coach may read. An 8-week window with a session cap,
completion free text travelling truncated, only the current revision visible,
missed planned sessions visible, and a defined bound on readable future plan
state.

**[ADR-014](../../decisions/ADR-014-PLANNING-NOTE-BOUNDARY.md)** — the planning
note. Owner free text reaches the provider, has no authority over server
constraints, and memory candidates are extracted from it. Settled values that
bind this ticket: the note is **1000 characters**, enforced server-side and
**rejected at compose rather than truncated**, and it reserves **1,200 bytes**
of the context budget — not 1,000, because umlauts are two bytes in UTF-8 and
JSON escaping adds more.

Together they take `COACH_AI_CONTEXT_LIMITS` in `src/server/ai/context.ts` from
two sources to four, and the whole-context byte ceiling from 10,000–12,000 to
roughly 30,000. Sizing this ticket's limits against the old ceiling will produce
denials in ordinary use.

**The allocation must be per source, not a single total.** `maxMemoryItems: 40`
at `MEMORY_CONTENT_MAX_LENGTH` 1000 is 40,000 bytes of memory alone, which
exceeds the whole ceiling, and `assembleCoachAIContext` denies rather than
truncating — so an owner who curates a large memory cannot generate at all, and
the error does not say which source is at fault. The allocation is set with
[M3-01B](M3-01B-REAL-PROVIDER-ADAPTER.md) decision 4; this ticket consumes it.

**Regeneration is out of scope here.** ADR-014's two-field compose shape and its
mandatory-feedback rule are recorded in
[M3-03](M3-03-SELECTED-HORIZON-PLAN-PROPOSAL.md). This ticket ships the initial
planning note only.

## The implemented roadmap schema is a stub

`RoadmapProposal` in `src/server/ai/contracts.ts` is currently `schemaVersion`,
`summary`, and `phases[]`, where a phase carries only `title`, `focus`,
`startDate`, `endDate`, and `goalId`.

Milestones, review criteria, goal allocation, uncertainty, review points,
rationale, and the safety note — every item in "Structured roadmap rules" below
— have no representation in the contract today. M3-01 shipped deliberate stub
schemas and named them as such. The schema work in this ticket is therefore
substantially larger than wiring up an existing type, and `fittip.roadmap.v1`
will need a version bump.

## Prompt work happens off-API

Per [the M3 delivery approach](M3-BACKLOG.md#delivery-approach--how-m3-gets-built-without-paying-for-iteration),
draft and iterate this operation's prompt in a chat subscription against
synthetic athlete profiles — reading the roadmap it produces, judging phase and
milestone quality, and tuning by hand. Save the good shapes as fixtures. Only
once the prompt is settled does it reach the real provider, inside M3-01B's
bounded validation budget.

Prompt iteration is where this milestone's API cost would otherwise land:
hundreds of calls to tune, a handful to ship. Do not wire a provider in order to
explore what a good roadmap looks like.

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
3. A **compose screen** opens. It offers an optional planning note and a
   summary of what the coach already knows — active goals, active constraints,
   recent load — collapsed behind a disclosure by default so the screen stays
   short at 390px. The owner confirms from here; generation does not start on
   the tap that opened the screen.
4. A pending state explains that nothing changes until acceptance.
5. The proposal shows phases, milestones, goal allocation, uncertainty, review
   points, and concise reasoning.
6. Any memory candidates extracted from the planning note are presented for the
   owner's explicit accept, edit-and-accept, or reject, reusing the accepted
   M2-02 review surface. They are independent of the roadmap decision: the
   owner may reject the roadmap and keep a candidate, or the reverse.
7. The owner may **Accept**, **Edit proposal**, or **Reject**. No action is
   preselected.
8. Edit shows structured fields and produces a new reviewable proposal.
9. Accept creates one immutable accepted roadmap version and returns to its
   detail.
10. Failure shows a safe retry path; it never falls back to unstructured prose
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
   user-created or explicitly accepted by the current user, training history
   within ADR-013's bounds, and the owner's planning note.
2a. A planning note cannot alter the horizon, the schema, context eligibility,
    the safety rule, any limit, or cause a write. Proven by fixtures that
    attempt each, not asserted.
2b. Memory candidates from the note are created `inferred_proposed` /
    `proposed` and never active without explicit owner review. An invalid
    memory section is discarded and the roadmap still returns.
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
4a. What the compose screen's context summary shows and how it is grouped, and
    the copy for its collapsed state.
4b. Where extracted memory candidates appear relative to the roadmap review,
    and what happens to undecided candidates if the owner leaves the screen.
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
