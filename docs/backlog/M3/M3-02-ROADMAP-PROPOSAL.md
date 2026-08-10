# M3-02: High-level roadmap proposal

**Status:** proposed — decision set approved 10 August 2026; not approved for
implementation

**Milestone:** M3

**Priority:** P1

**Depends on:** [M3-01B accepted](M3-01B-REAL-PROVIDER-ADAPTER.md), which in
turn depends on [M3-01 accepted](M3-01-LOCAL-AI-ADAPTER-CONTROLS.md); the
accepted M1 training foundation; the accepted M2 goal, memory, intake, and
validation foundations; and
[ADR-013](../../decisions/ADR-013-AI-TRAINING-HISTORY-ELIGIBILITY.md) plus
[ADR-014](../../decisions/ADR-014-PLANNING-NOTE-BOUNDARY.md) — **both accepted
9 August 2026**

**Revised:** 8 August 2026 — compose step and planning note added, context
policy ADRs named, stub-schema gap recorded

**Revised:** 9 August 2026 — both context ADRs accepted, so they no longer block
dispatch. Planning-note length and byte reservation settled; the per-source
context allocation is named as an M3-01B dependency; regeneration confirmed out
of scope here

**Revised:** 10 August 2026 — decisions 1-6 and 8 approved as drafted; decision
7 approved with no automatic roadmap-generation blocker

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

## Decisions

**Approved by the product owner on 10 August 2026.** Decisions 1-6 and 8 were
approved as drafted. Decision 7 was discussed separately and approved with no
automatic roadmap-generation blocker. This resolves the decision set but does
not approve implementation or move the ticket out of `proposed`.

### 1. Horizon

**Approved:** a roadmap starts on the owner's local today and covers at
least 4 weeks and at most 52 weeks.

- On first use, the default end is the latest target date among active core
  goals when that date falls within the next 52 weeks. If no active core goal
  has such a date, default to 12 weeks. A nearer target never makes the roadmap
  shorter than 4 weeks; a later target is visibly outside this roadmap rather
  than silently dropped.
- The compose screen always shows and permits changing the end date before
  generation. It never permits a start in the past or an end beyond 365 days.
- Supporting-goal dates do not extend the default by themselves, but supporting
  goals remain eligible for attention inside the chosen horizon.
- Before generation, name every active goal whose target lies outside the
  selected horizon. The proposal must not imply that the roadmap reaches it.

This accommodates both a roughly 12-week return-to-running goal and a
season-long event without making one year the default when the owner has no
dated core goal. The rejected alternatives are a fixed 12-week horizon, which
cannot represent the accepted long-event scenarios, and an unbounded
goal-derived horizon, which produces oversized, falsely precise roadmaps.

### 2. Roadmap shape, milestones, and goal attention

**Approved:** bump the response to `fittip.roadmap.v2` and use bounded,
ordinal attention rather than percentages.

- Roadmap: `title`, `summary`, `startDate`, `endDate`, ordered `phases`,
  `assumptions`, `uncertainties`, `reviewPoints`, and optional bounded
  `safetyConsiderations`.
- Phase: `title`, `focus`, `startDate`, `endDate`, `goalAttention`, and
  `milestones`. Phases are contiguous, ordered, non-overlapping, inside the
  roadmap horizon, and cover it without gaps.
- Goal attention: `goalId`, one of `primary | secondary | maintenance |
  deferred`, and a concise `reason`. `deferred` describes this roadmap phase;
  it never changes the goal's lifecycle or tier. Every active core goal appears
  in at least one phase, and every referenced goal is revalidated server-side.
- Milestone: `title`, `observableCriterion`, `targetDate`, and one or more
  `goalIds`. The UI says **Aim for by**, not **Due**, and the criterion must be
  observable without promising an outcome.
- Assumption: one concise statement. Uncertainty: `statement`, `whyItMatters`,
  and `whatToWatch`. Review point: `title`, either a date or condition trigger,
  and the question the owner should reconsider.
- Bounds: 1-6 phases; 1-3 milestones per phase; 1-4 goal-attention entries per
  phase; 0-4 assumptions; 0-4 uncertainties; 1-4 review points; and 0-3 safety
  considerations. Text limits in characters: roadmap title 80 and summary 600;
  phase title 80 and focus 300; attention reason 160; milestone title 80 and
  criterion 200; each assumption 200; each uncertainty field 200; each review
  point field 200; and each safety consideration 240. The complete serialized
  proposal is capped at 16,000 UTF-8 bytes in addition to M3-01B's output-token
  ceiling.
- Static stop/professional-help copy is server-owned and is not model-authored
  or editable. `safetyConsiderations` may explain conservative training
  direction but may not diagnose, prescribe treatment, or claim safety.

Percent allocations are rejected because a model-generated `60% / 40%` split
looks measurable while the roadmap contains no training volume from which to
calculate it. The four attention levels state the actual product meaning and
remain sport-agnostic.

### 3. Uncertainty and review-point presentation

**Approved:** show uncertainty as actionable language, never a confidence
score.

- The roadmap review uses one vertical **roadmap spine** at 390px: phase bands
  carry milestone markers, and review points interrupt the spine as explicit
  checkpoints. This is the surface's FitTip-specific visual signature, not a
  decorative progress meter.
- Under the spine, show **What this assumes**, **What could change the
  direction**, and **When to reassess**. Keep these sections expanded when they
  contain material information; omit empty assumptions/uncertainties rather
  than showing a misleading zero.
- A review point says either **Review on _date_** or **Review when _condition_**,
  followed by one focused question. It does not automatically replan, notify,
  or mutate anything.
- The review header says **Direction, not a promise.** Do not show percentages,
  star ratings, model confidence, or red/amber/green certainty badges.
- The spine is a semantic ordered list with visible keyboard focus. Any
  transition is non-essential and removed under reduced motion.

### 4. Generation, editing, rejection, and exact copy

**Approved:** use one explicit compose step and keep every state honest
about what is saved.

- Empty/current-roadmap actions: **Create roadmap** when none exists and
  **Propose a new roadmap** when one is current.
- Compose title: **Shape your roadmap**. Planning-note label: **Anything the
  coach should account for? (optional)**. Helper: **Add commitments or
  constraints that your saved information does not show. Maximum 1,000
  characters.**
- Confirmation action: **Generate roadmap proposal**. Supporting copy:
  **Nothing changes until you accept a proposal.** Opening compose never starts
  generation.
- Pending copy: **Building your roadmap proposal... Your current roadmap stays
  unchanged.** Disable duplicate submission while retaining the idempotency
  key across an uncertain retry.
- Review actions: **Accept roadmap**, **Edit proposal**, and **Decline
  proposal**. No action is preselected. There is no **Regenerate** action in
  M3-02.
- **Decline proposal** opens a confirmation: **Decline this proposal? It will
  stay in your roadmap history and will not become current.** This slice stores
  the rejected status but no reason field or extra free text.
- Editing is a structured form, not raw JSON. The owner may edit the roadmap
  title/summary; phase titles, focus, dates, order, and bounded add/remove;
  milestone text/dates; goal-attention levels/reasons; assumptions,
  uncertainties, and review points. Every edit is server-revalidated and
  creates a new owner-edited proposal linked to its source proposal.
- Owner id, source ids/versions, schema/prompt/model codes, validation state,
  idempotency data, and server-owned safety copy are never editable.
- A rejected, malformed, stale, over-limit, or provider-failed result never
  falls back to prose and never claims that a roadmap was saved.

### 4a. Compose context summary

**Approved:** the collapsed disclosure says **What the coach will use**
and summarizes the exact eligible material, for example **2 goals · 6 memory
items · 8 weeks of training**.

When expanded, group the actual provider-bound fields rather than an invented
summary:

1. **Goals** — title, core/supporting tier, and target date.
2. **Memory** — accepted active memory items, grouped as profile facts,
   constraints, preferences, and observed patterns.
3. **Recent training** — the ADR-013 local-date range, current completion
   values, completed/missed state, allowed session/activity fields, safety
   flags, and the exact truncated free text that will travel. Superseded
   completion revisions are not shown because ADR-013 does not send them.
4. **Current plan commitments** — planned and locked future state eligible under
   ADR-013.

The planning note remains outside the disclosure as the only new input. Copy
below the collapsed label says **Only active, accepted information and the
bounded training window are included.** Empty groups say **None included**.
When a time/count limit excludes records, show the limit and excluded count.
When any source exceeds its approved byte allocation, generation is unavailable
with that source named; nothing is silently truncated beyond ADR-013's already
approved per-field truncation.

### 4b. Extracted memory candidates

**Approved:** show **Possible memory updates** as a separate panel after
the roadmap content, with the accepted M2-02 **Accept**, **Edit and accept**, and
**Decline** controls. The roadmap action dock and memory controls remain
visually and transactionally separate.

- Accepting or declining the roadmap updates the roadmap state in place; it
  does not decide any memory candidate.
- Leaving the screen retains undecided candidates as `inferred_proposed` /
  `proposed`. They appear under **You -> Memory -> Needs your review** with the
  source **Roadmap planning note** and never enter coaching context until the
  owner accepts them.
- The accepted-roadmap detail shows a small **Memory updates still need your
  review** link when candidates remain undecided.
- An invalid memory section is discarded without failing or weakening a valid
  roadmap. No roadmap action silently discards or accepts it.

### 5. Current roadmap and supersession

**Approved:** yes. Accepting a proposal creates a new immutable roadmap
version, makes it the single current roadmap, and links it to both its source
proposal and the previously current version. The prior version remains readable
and unchanged as superseded history.

- Accepting the same proposal twice is idempotent and returns the existing
  version.
- If source goals/memory/training revisions or the current-roadmap head changed
  after generation, acceptance returns a visible review conflict. It never
  silently overwrites the new state.
- Two different proposals cannot both win the same expected current revision.
- `current`, `superseded`, `proposal`, and `rejected` remain distinct states;
  supersession never changes a proposal into an accepted version or rewrites
  the prior version.

### 6. Retention and deletion boundary

**Approved:** no automatic expiry and no per-proposal deletion UI in
M3-02. For owner/synthetic founder use, retain proposals, edit lineage,
decisions, accepted roadmap versions, planning notes, and minimized source
references as owner-visible audit history.

- Store no raw assembled prompt, provider HTTP body, duplicate source content,
  or content-bearing telemetry. Source references are ids plus exact revisions;
  the proposal stores only the structured content needed for review/history.
- Rejected proposal content and its planning note remain together, as ADR-014
  anticipated, so a later review can distinguish a poor model response from a
  poor request.
- Memory candidates follow the accepted M2-02 retention/deletion boundary and
  are not embedded copies inside the roadmap record.
- Account deletion and the future M0-04 owner-deletion/export design must be
  able to purge content-bearing proposal chains and planning notes. Do not add
  a hidden audit copy or tombstone in this ticket.
- This founder-only retention decision must be revisited before any friend's
  data; it does not approve indefinite commercial retention.

Automatic deletion after 30 or 90 days is rejected for this slice because it
would erase the provenance of a still-current or historically referenced
roadmap. A usable content-deletion design belongs with the privacy inventory and
reference rules rather than a timer added only to M3-02.

### 7. Safety behavior — no automatic roadmap blocker

**Approved 10 August 2026:** no pain, illness, injury, or severe-fatigue signal
automatically blocks high-level roadmap generation in M3-02.

- Do not add a free-text severity classifier, keyword matcher, elapsed-time
  clearance rule, or inferred resolved state. The current model has reliable
  structured completion flags but no reliable structured `severe`, `sudden`,
  `worsening`, or `resolved` state for pain, illness, or injury. Seven days
  passing would not prove recovery.
- Any eligible `pain_reported`, `illness_reported`, `injury_reported`, or
  `severe_fatigue_reported` completion flag makes compose and any resulting
  review show the already approved static copy: **FitTip cannot assess or
  diagnose symptoms. If symptoms are severe, sudden, or getting worse, stop the
  affected activity and contact a qualified health professional.**
- When any flag is present, the proposal must contain at least one bounded
  `safetyConsideration` and one relevant review point. The prompt requires
  conservative direction — pause, reduce, maintain, or defer affected work —
  and must not escalate affected load.
- Prohibited diagnosis, treatment, claims of safety, or instructions to ignore
  or push through symptoms reject the entire candidate. If a structurally valid,
  conservative candidate cannot be produced, fail closed and persist no
  proposal.
- `severe_fatigue_reported` remains visible and constrains the proposal; it is
  not ignored merely because it does not block the provider call. The owner
  still reviews and explicitly accepts or declines the proposal.
- Do not add a waiver or acknowledgement checkbox that could imply medical
  clearance. The explicit **Generate roadmap proposal** action and the ordinary
  proposal acceptance boundary remain the only decisions.
- M3-03 must decide short-horizon plan behavior separately. Approval here does
  not decide whether a current safety signal blocks or constrains near-term
  sessions.

### 8. Transaction and privileged-write boundary

**Approved:** record a dedicated ADR before dispatch and use narrow
owner-derived database functions for proposal persistence and acceptance.

- The provider call is never held open inside a database transaction.
- After schema/business validation, one idempotent function atomically persists
  the immutable proposal, minimized source references, edit lineage where
  present, and its generation decision. It derives the owner from `auth.uid()`
  and takes no owner id.
- Valid extracted memory candidates are then created through the accepted
  M2-02 memory boundary. Their failure does not invalidate a valid roadmap, and
  the operation/request id prevents duplicate candidates on retry.
- A separate acceptance function atomically verifies proposal ownership and
  state, expected source revisions, and expected current-roadmap revision;
  inserts the immutable accepted version; updates the single current pointer;
  links the prior version; and records proposal acceptance.
- Replaying acceptance for the same proposal returns the existing version.
  Competing proposals against the same expected head produce a conflict and no
  partial write.
- Revoke direct authenticated writes to proposal sources, accepted versions,
  and current heads. Functions use `SECURITY DEFINER`, `SET search_path = ''`,
  explicit grants, and RLS/ownership tests following the accepted M2
  transaction precedents.

This boundary is Tier 1. Approval of the product behavior does not implicitly
approve the functions; the ADR must name their exact tables, arguments,
privileges, idempotency keys, rollback behavior, and deletion consequences.

## Approval gate

**The decision set was approved on 10 August 2026; implementation was not.** The
ticket remains `proposed`. Before implementation approval and dispatch:

1. M3-01B must be accepted, merged, pushed, deployed to the founder environment,
   and have its required hosted verification recorded.
2. An approved roadmap feature brief must exist; the repository currently has
   no M3 roadmap feature brief.
3. Decision 8's dedicated transaction ADR must be drafted and separately
   approved with the exact privileged boundary.

The deferred per-source context allocation in M3-01B decision 4 must be settled
before M3-02 can be accepted, and earlier if the owner approaches its recorded
memory-item trigger. Any later implementation approval remains owner/synthetic
local or M0-06A founder-hosted only and does not authorize M3-03, friends,
public registration, commercial use, production, or an analytics sink.
