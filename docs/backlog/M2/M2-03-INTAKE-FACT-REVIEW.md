# M2-03: Guided onboarding and context review

**Status:** in development — approved and dispatched 2 August 2026 after
M2-02 was accepted, merged, pushed, deployed to the founder environment, and
verified. The product owner approved the nine-part field, UX, persistence,
atomicity, conflict, safety, privacy, and confidence decision set.

**Milestone:** M2 — goals, editable coaching context, and guided onboarding

**Priority:** P1

**Feature brief:** [F-003 approved](../../product/F-003-GOALS-MEMORY-GUIDED-ONBOARDING.md)

**Direction approval:** On 29 July 2026 the product owner approved guided
onboarding inside M2, with goals as a central step, accepted data editable in
**You**, and future AI limited to active explicitly accepted records.

**Depends on:** [M2-01 accepted](M2-01-GOAL-MODEL-VALIDATION.md) and [M2-02 accepted](M2-02-MEMORY-MODEL-MANAGEMENT.md)

**Hosted test dependency:** [M0-06A accepted](../M0/M0-06A-FOUNDER-HOSTED-STAGING.md)

**Founder staging boundary:** [ADR-006](../../decisions/ADR-006-LOCAL-OWNER-AI-MVP.md)
and [ADR-007](../../decisions/ADR-007-FOUNDER-HOSTED-STAGING.md);
product-owner or synthetic data only, local or founder-hosted

**Blocks:** [M2-04 targeted M2 milestone closeout](M2-04-M2-VALIDATION-SLICE.md)

## Agent brief

**Outcome.** Give a verified owner a skippable, resumable six-step setup at `/home/you/onboarding` that deterministically prepares goal and memory candidates, requires every decision, and publishes only the accepted subset.

**Tier 1.** New sensitive owner data, migration, RLS, privileged transaction, cross-model publication, expiry/deletion, and health-adjacent intake.

**Approved behavior — build this, do not re-litigate it.**

- Steps: Goals; Current training; Time and access; Preferences; Constraints; Review and save. Skipping never gates manual planning or logging.
- Future-AI readiness is informational only: one active core goal, an explicit training answer, availability/capacity, access/equipment, timezone, and units; it authorizes no AI call or safety claim.
- No general narrative box or universal experience level. Reuse accepted goal limits; allow up to 10 new labels of 60 characters, baseline detail 500, and memory text 1,000.
- One cross-device draft saves only on named save actions, expires after 30 inactive days, and is purged on cancel, expiry, or publication; retain only a content-free receipt.
- Nothing is preaccepted. Publish any valid accepted subset; finishing with none publishes nothing. Exact duplicates cannot create a second record.
- Compare deterministically only. Show existing versus candidate for conflicts; preview full rank changes; preserve decisions on stale refresh; never merge.
- Optional pain/injury, illness/recovery, unusual-fatigue, and other limitations infer no severity and block no publication. Copy: “FitTip cannot assess or diagnose symptoms. If symptoms are severe, sudden, or getting worse, stop the affected activity and contact a qualified health professional.”
- Show the start storage/no-AI notice and repeat it before Constraints. Home uses **Set up your coaching context**, **Start setup**, and **Not now**; do not remind or notify.
- Save controls are **Save and continue**, **Save and finish later**, and **Save accepted items**. Completion offers Goals, Memory, and **Run guided review again**.
- Use the visible label **Memory**. The review signature is a Context map that stamps every candidate **Goals** or **Memory**.
- Keep confidence only for unchanged system wording; an owner content edit clears it while preserving provenance and confirmation history.

**Hard constraints.**

- Follow [ADR-011](../../decisions/ADR-011-M2-ONBOARDING-PUBLICATION-BOUNDARY.md): one authenticated write function, Auth-derived owner, expected revisions, canonical bounded locks, and one atomic idempotent publication.
- Every owned row has `user_id`; exposed tables use RLS, exact owner-select policies, explicit grants, and no direct authenticated writes. Private helpers grant no API-role execution.
- Reuse accepted goal/memory mutation invariants; change applied behavior only by forward migration and never build weaker onboarding-only copies.
- No intake content in logs, analytics, URLs, browser storage, email, errors, receipts, fixtures, screenshots, AI providers, or external services.
- Focus the new heading after navigation, the first actionable error after validation, and the result heading after publication; preserve reduced motion, keyboard use, touch targets, and `390x844` reflow.

**Non-goals.** No production AI, extraction, chat, coaching, plan generation, activity library, diagnosis, treatment, analytics, notifications, public users, remote command, service-role client, or changes to completed/past records.

**Acceptance criteria.** Prove the 390px start/skip/save/resume/review/cancel/restart/publish flow; owner/anonymous/cross-user isolation; 30-day purge; mapping/provenance; mixed-decision atomicity, conflict, fourth-core, failure and retry; context exclusions; confidence clearing; honest states; prohibited sinks.

**Expected modules.** Migration/pgTAP under `supabase/`; onboarding domain and repository under `src/server/`; route/actions under `src/app/home/you/onboarding/`; `src/components/onboarding/`; Home/You entries; generated types; ticket-specific 390px Playwright flow; validation record.

**Skills.** Project `frontend-design` and `vercel-react-best-practices`; plugin
`supabase:supabase` and `supabase:supabase-postgres-best-practices`.

Read only this section unless you hit an ambiguity it does not resolve.

## Outcome

After verified account creation and first sign-in, offer an authenticated user
a detailed but progressive, sport-agnostic guided onboarding. The flow covers
goals, current training background, possibilities, preferences, and optional
constraints. The user reviews deterministic candidate goals and memory items
and explicitly accepts, edits-and-accepts, or rejects every candidate before
anything becomes active.

Onboarding is separate from the authentication/profile-creation transaction,
can be skipped without blocking manual M1 features, can resume safely, and is
also reachable later from **You**. Completion links to the accepted goals and
coaching context in **You**. Validation conflicts remain reviewable and retries
do not duplicate accepted records.

This ticket uses structured form input and deterministic mapping only. It does
not use production AI extraction, accept unreviewed natural-language
inferences, generate a plan, provide coaching, or give diagnostic advice.

## Approval, environment, and external-use boundary

This approved ticket may be implemented because M2-01 and M2-02 are accepted,
using the approved local/founder-hosted owner-or-synthetic boundary. It does
not authorize production AI, external registration, analytics, or a
privacy/legal conclusion.

M0-06A is required before a hosted testable release. M0-06 remains mandatory,
together with the privacy and recovery gates below, before friends, public
registration, commercial use, or production.

Before any external user submits onboarding data, all of the following must be
separately approved, implemented, validated, and accepted:

- M0-03B account recovery;
- the M0-04 privacy design **and** later implementation slices for the
  user-facing notice, intake/goal/memory/health-adjacent inventory and
  retention, deletion operation, and applicable access/export handling;
- any consent/withdrawal implementation before future intake content is sent
  to an AI provider;
- M0-05 privacy-safe event and request-control contracts; and
- M0-06 hosted environment, email, bot-protection, CI/deployment, and
  authorization gates.

M0-04 design acceptance does not authorize intake draft/candidate schema,
collection UI, consent UI, deletion operations, or external use. M2-03 adds no
AI transfer even if an AI-consent design later exists.

## Scope

1. Add the approved first-run, resumable guided-onboarding steps and review
   screen, with a later entry point from **You**.
2. Deterministically map submitted fields to candidate goal and memory
   contracts already accepted in M2-01/M2-02.
3. Keep candidate/draft state separate from active goal and memory records.
4. Require an explicit decision for every candidate before publication.
5. Support partial selection with atomic publication of the selected accepted
   items.
6. Detect existing-record duplicates, contradictions, and core-goal conflicts
   without silently merging or overwriting.
7. Support authenticated resume, expiry/cancel, safe retries, and stale-state
   conflict handling.
8. Add conservative static pain/illness/injury/fatigue handling.
9. Validate the complete flow at `390x844` with owner/anonymous/cross-user,
   accessibility, privacy, and regression coverage.

## Non-goals

- No production AI extraction, chat, prompt, model, provider call, generated
  plan, roadmap, activity, coaching response, or diagnostic advice.
- No general narrative onboarding unless a later brief separately approves its
  purpose, privacy handling, and mapping.
- No silent persistence, preselected acceptance, automatic merge, or direct
  write that bypasses the accepted goal/memory services.
- No analytics, remote migration, deployment, external service, consent
  implementation, or deletion operation.
- No new goal or memory behavior beyond the accepted M2-01/M2-02 contracts.

## Structured onboarding boundary

The default proposed onboarding asks only for structured fields needed by the
accepted goal and memory contracts:

- goals, desired outcomes, category, sports/activity areas, dates, target
  detail/metric, core/supporting tier, and rank;
- current training background and a sport-relevant recent baseline without a
  universal gym-first experience scale;
- weekly availability and time limits;
- equipment and locations/possibilities;
- training preferences, explicit dislikes, and coaching-style preferences;
- timezone, units, and approved planning defaults;
- current constraints and optional expiry/review date; and
- optional limitation flags needed to show approved non-diagnostic safety copy.

Recommendation: do not include a general narrative/free-text coaching box in
this slice. Short text fields needed by accepted goal/memory records may be
allowed with approved limits and purpose labels. A natural-language intake,
chat transcript, AI extraction, or flexible “tell us everything” field
requires a separate privacy/product/AI brief.

The flow must remain sport-agnostic. It cannot assume gym equipment,
sets/reps/load, a known exercise catalog, or one primary sport.

## Candidate and draft semantics

Recommendation: persist an owner-scoped intake draft so a user can resume
across page reloads, while keeping candidates permanently distinct from active
goal and memory records.

Each draft/candidate needs enough state to represent:

- stable owner and intake-session id;
- accepted intake-schema version;
- current step and completion state;
- candidate kind (`goal` or `memory`) and deterministic source field;
- candidate payload validated against the accepted M2-01 or M2-02 input schema;
- decision `pending`, `accept`, `edit_and_accept`, or `reject`;
- user edits and current revision/concurrency token;
- duplicate/conflict references without copying unrelated record content;
- created, updated, last-resumed, expiry/cancel, and publication timestamps; and
- an idempotency/publication reference to the created goal or memory.

The product owner approved the owner-scoped server draft, 30-day inactivity
expiry, content purge, cross-device resume, and content-free receipt on
2 August 2026. ADR-011 governs the persistence and publication boundary.

Candidate records are proposals, not facts. Pending or rejected candidates
never appear in active goal lists, active memory context, planning context,
analytics, or coaching.

## Review and explicit acceptance rules

- Every candidate starts pending and displays its mapped fields, destination
  type, and source.
- The user must choose **Accept**, **Edit and accept**, or **Reject** for each
  candidate. No control is preselected.
- Navigating away, losing the session, retrying, or reaching the last screen
  does not imply acceptance.
- Edited candidates are revalidated against the destination contract before
  publication.
- Rejecting a candidate stores only the approved minimal draft/review evidence
  and never creates a goal or memory.
- The final action states exactly how many goals and memory items will be
  created or updated.
- Publication derives `user_id` from verified identity and writes accepted
  destination records with intake-confirmed provenance.
- Accepted candidates link to their destination record for idempotency and
  traceability; retry returns the existing result rather than duplicating it.

## Partial selection and atomic publication

Recommendation:

1. Save review decisions incrementally to the owner-scoped draft.
2. Permit any mixture of accepted and rejected candidates.
3. On **Save accepted items**, re-read current goal/memory state and validate
   the complete selected set.
4. Publish all selected accepted items in one transaction. If any selected item
   is invalid or stale, publish none of them; preserve the draft and show
   item-specific corrections.
5. Keep rejected decisions and draft edits available for resume until the
   approved retention/cancel boundary.

This provides partial acceptance without a partially published batch. An
alternative per-item immediate publication is possible but creates harder
resume/rollback semantics and is not recommended. The exact cross-repository
transaction mechanism is consequential architecture and must be approved,
with an ADR if it introduces a function/RPC, trigger, elevated connection, or
new service boundary.

## Duplicate and conflict handling

The server compares candidates with the owner's current accepted records at
review and again at publication.

### Goal cases

- Exact or near duplicate: show both records and offer keep existing, edit the
  existing goal, or keep both. Never auto-merge.
- Fourth active core goal: block publication until the candidate becomes
  supporting/paused or an existing core goal is explicitly changed through the
  approved goal domain operation.
- Rank conflict: show the resulting proposed order and require confirmation;
  write the complete ordering atomically.
- Stale goal change: refresh and return to review without overwriting it.

### Memory cases

- Exact duplicate: offer keep existing, update existing through a new revision,
  or keep both where approved. Never merge silently.
- Contradiction: show current and candidate content side by side with source,
  status, and expiry; require the user to choose which item to activate,
  disable, update, or reject.
- Inferred/system-looking content: deterministic structured onboarding records
  use `intake_confirmed`, not `inferred`. A user cannot forge system
  provenance.
- Health-adjacent conflict: preserve neutral wording and do not choose which
  statement is medically correct.

Updates to an existing goal or memory must use its owning accepted domain
service and history/concurrency rules; intake cannot bypass them.

## Pain, illness, injury, and severe-fatigue behavior

- The intake may collect only the approved structured limitation indicators
  and short constraint detail.
- The interface states that FitTip does not diagnose or provide treatment.
- Severe, acute, or worsening selections show approved static guidance to stop
  the relevant activity and consult a qualified professional.
- The flow does not claim an activity is safe, assess a condition, prescribe
  rehabilitation, or generate an alternative plan.
- A limitation becomes active memory only after explicit review and save.
- If the approved safety rule requires blocking publication, the reason and
  next safe action are clear; other unrelated reviewed items remain in the
  draft.
- Raw limitation content never enters logs, analytics, email, error payloads,
  snapshots, or an AI provider.

Exact fields, triggers, copy, and whether the flow may continue after each
signal are open safety/product decisions.

## Resume, retry, cancellation, and expiry

- Only the authenticated owner can list, open, edit, publish, cancel, or delete
  a draft.
- A safe deep link may identify an opaque draft id, but ownership is always
  rechecked server-side.
- Resume returns to the last committed step and shows any stale/conflicting
  destination records before publication.
- Save and publish operations use idempotency and revision checks; browser
  retries do not duplicate candidates, goals, memory, or history.
- Session expiry redirects to sign-in without exposing candidate content in the
  URL. After reauthentication, the approved safe return path may resume.
- Cancel/expiry never publishes content. It deletes or archives draft content
  according to the approved retention/deletion decision.
- A partial server failure leaves the batch unpublished or returns an
  idempotently discoverable committed result; it must not create an ambiguous
  half-state.

## Ownership, migration, and security rules

- Drafts, candidates, source references, and publication links use immutable
  `user_id` ownership; references cannot cross owners.
- Repositories derive verified identity and apply owner filters in addition to
  RLS.
- All exposed tables revoke unintended privileges, enable RLS, and use explicit
  owner policies targeted to `authenticated`.
- Update policies use both owner `USING` and `WITH CHECK` plus owner select.
- Anonymous and cross-user reads/mutations are denied and directly tested.
- Browser components do not import repositories, create destination records,
  or decide provenance/atomicity.
- Candidate payloads are schema-validated and constrained to the accepted
  destination fields. JSON is not an unbounded arbitrary-content store.
- No user metadata, email, draft id, or client field makes an authorization
  decision.
- No service-role secret, public definer function, arbitrary redirect, raw
  Auth error, or sensitive log is introduced.
- Use supported forward migrations, clean reset, generated types, database
  lint/advisors, and direct pgTAP authorization tests.

## Proposed 390px user flow

1. **Welcome/purpose:** After first verified sign-in, explain what will be
   collected, that onboarding is resumable/skippable, that nothing becomes
   active until review, and where the privacy notice is available. Existing
   users can enter from **You**.
2. **Goals:** Add and order goal cards using the accepted M2-01 fields.
3. **Current training:** Enter the approved sport-relevant background and
   recent-baseline fields.
4. **Possibilities:** Enter availability, time, equipment, and locations.
5. **Preferences and constraints:** Enter the approved training/coaching
   preferences and optional limitations; see conservative safety copy when
   applicable.
6. **Review:** Candidate goals and memory are grouped by destination. Each card
   requires accept, edit-and-accept, or reject.
7. **Resolve:** Duplicates, contradictions, fourth-core, rank, and stale-state
   conflicts are handled explicitly.
8. **Save:** A summary names the counts to be published. One final action
   atomically creates/updates selected accepted records.
9. **Complete:** Show only actual persisted records with links to
   **You -> Goals** and **You -> Coach context**. Do not generate or imply a
   plan.

Each step uses a visible title/progress indicator, associated labels, inline
and summary errors, thumb-reachable actions, safe back navigation, and
non-color-only status. The approved step count, route, copy, progress pattern,
and required-versus-optional behavior are in the Agent brief.

## Acceptance criteria

1. At `390x844`, an authenticated user can start after verified sign-in, skip,
   save, resume, review, publish, cancel, revisit from **You**, and safely retry
   the approved structured onboarding.
2. Intake is sport-agnostic and contains no production AI extraction, coaching
   chat, plan generation, global activity library, or diagnostic advice.
3. Candidate goals/memory remain separate from active records until explicit
   publication.
4. Every candidate requires accept, edit-and-accept, or reject; no default,
   navigation, timeout, or retry silently accepts it.
5. A mixed accepted/rejected selection is supported, while publication of all
   selected accepted items is atomic under the approved design.
6. Destination records use the accepted M2-01/M2-02 contracts, provenance,
   lifecycle, version, ownership, and history operations rather than bypassing
   them.
7. Duplicate, contradiction, fourth-core, rank, and stale-write states are
   visible and never silently merge, overwrite, or exceed invariants.
8. Owner resume/retry is idempotent; partial failure cannot create ambiguous
   duplicate or half-published records.
9. User A cannot read or mutate user B's draft/candidates/destinations, and
   anonymous access is denied.
10. Pain/illness/injury/fatigue handling matches approved conservative,
    non-diagnostic copy and creates no active constraint without review.
11. Draft expiry/cancel/delete follows the accepted privacy behavior, and
    sensitive content is absent from logs, analytics, URLs, snapshots, and
    external services.
12. Clean migration/reset, generated types, database lint/advisors, direct
    authorization tests, application gates, and production build pass.

## Test and validation plan

### Domain, persistence, and authorization

- Deterministic field-to-candidate mapping fixtures for every approved goal and
  memory type.
- Candidate decision transition table and rejection of forged provenance.
- Atomic batch publication with mixed decisions, invalid candidate, stale
  destination, simulated mid-transaction failure, and retry.
- Idempotent repeated save/publish callbacks.
- Exact/near duplicate and contradiction choices with no automatic merge.
- Concurrent fourth-core and reorder conflicts through the goal service.
- Memory update creates the approved revision/history and preserves source.
- Owner, anonymous, cross-user, cross-owner reference, and draft-id guessing
  tests at repository and Data API boundaries.

### Mobile and accessibility

- Playwright at `390x844`: start → fill every step → leave/reload → resume →
  review mixed actions → resolve duplicate/fourth-core → publish → inspect
  created goals/memory.
- Separate expired session, expired draft, cancel, retry, server error, and
  stale destination paths.
- Pain/illness/injury/fatigue selections show only approved static safe copy and
  no plan/advice.
- Keyboard-only completion, focus restoration, error summary links, fieldset
  legends, status announcements, touch targets, and zoom/text reflow checks.

### Privacy and security

- Scan URLs, logs, analytics/event payloads, monitoring errors, HTML, fixtures,
  snapshots, and committed files for raw intake/health content and secrets.
- Confirm no production AI dependency, provider call, prompt, model, consent
  bypass, remote link, or external service.
- Verify cancel/expiry/delete and account-deletion compatibility against the
  accepted privacy implementation.

### Expected command families

Verify exact CLI syntax against installed versions:

```powershell
npx.cmd supabase migration new <approved_name>
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
git diff --check
```

## Implementation sequence and file guidance

1. Re-read [AGENTS.md](../../../AGENTS.md), the
   [Product Plan](../../../REVISED_PRODUCT_PLAN.md), accepted M2-01/M2-02 briefs
   and validation, accepted privacy implementation artifacts, and current
   Supabase guidance.
2. Apply the approved field, retention, atomicity, safety, privacy, and mobile
   UX decisions in the Agent brief and ADR-011.
3. Define deterministic candidate schemas by importing/reusing the accepted
   goal/memory contracts, not copying divergent rules.
4. Create the forward migration and direct draft/candidate authorization tests.
5. Add the intake domain/repository boundary and atomic publication service.
6. Add only the approved guided-onboarding and review routes/components.
7. Add unit, integration, privacy/security, accessibility, and 390px tests.
8. Regenerate types from a clean reset and run all gates.
9. Hand off to independent review. Missing goal/memory behavior returns to its
   owning ticket; missing intake behavior remains M2-03.

Likely areas are `supabase/migrations/`, `supabase/tests/database/`,
`src/server/`, authenticated `src/app/` routes, focused components, shared
accepted validation schemas, generated types, tests, and validation docs.
Exact reversible file names remain builder choices. A transaction function,
RPC, trigger, elevated credential/connection, or persistent sensitive draft
design requires explicit architecture/privacy approval.

## Pre-approval decision record

The product owner resolved all nine questions below on 2 August 2026. The
approved behavior is stated once in the Agent brief; these original prompts
remain only as the audit record of what required a decision.

1. **Required onboarding fields and AI readiness.** Approve which goal,
   background/baseline, availability, equipment, preference, unit/timezone,
   and limitation fields are required versus skippable, plus the minimum
   accepted context required before future AI generation.
2. **Free text.** Recommendation: no general narrative box; approve any short
   text fields, limits, and purpose separately.
3. **Draft persistence.** Recommendation: owner-scoped resumable server draft;
   approve retention/expiry, cancel/delete behavior, cross-device resume, and
   privacy inventory.
4. **Publication atomicity.** Recommendation: incremental review decisions plus
   one atomic accepted-item publication. Approve the transaction mechanism and
   any ADR it requires.
5. **Duplicate/conflict UX.** Approve thresholds/labels and the choices for
   goal duplicates, memory contradictions, rank changes, and updates to
   existing records.
6. **Safety.** Approve limitation fields, static non-diagnostic copy, trigger
   thresholds, and whether severe/acute/worsening signals block publication or
   only the affected constraint.
7. **Mobile IA/copy.** Approve first-run and **You** entry routes, step
   count/order, progress pattern, button labels, completion copy, deferral/
   reminder behavior, and restart behavior.
8. **Privacy.** Approve collection notice placement, content classification,
   source retention, access/export, deletion, backups, and prohibited logging
   before external use.
9. **Confidence after edit-and-accept.** Raised by M2-02's independent review on
   2 August 2026 and inherited here, because M2-03 is the first ticket that can
   actually produce it. M2-02's `edit_and_accept` deliberately leaves
   `memory_items.confidence` untouched, and its pgTAP asserts that it stays put,
   so a proposal offered at 70% keeps that number after the user rewrites the
   text. The card then renders the user's own sentence with a model's confidence
   attached — an inference figure qualifying words the model never wrote, which
   runs against "a user statement outranks an inferred proposal". Unreachable in
   M2-02 because nothing produces confidence there. Decide before M2-03 ships
   whether edit-and-accept clears confidence, keeps it with a visible marker that
   it refers to the original proposal, or something else. Changing it requires a
   forward migration and an update to the M2-02 pgTAP assertion.

## Handoff

Before testable status, provide:

- exact branch and commit;
- changed files grouped by migration, candidate/domain service, UI, tests, and
  docs;
- actual draft/candidate contract, retention behavior, and privilege/policy
  matrix;
- atomicity/idempotency, destination mapping, duplicate/conflict, fourth-core,
  owner/anonymous/cross-user, and cancel/expiry evidence;
- exact commands/results and clean-reset/type-generation evidence;
- `390x844` resume, review, conflict, safety, and completion demo paths;
- sensitive-content, secret, AI-provider, remote-target, and analytics scans;
- known limitations and approved deviations; and
- confirmation that no plan, coaching, diagnostic, or production AI behavior
  was added.

The lead agent assigns an independent reviewer. The precise product-owner
decision after review is: **accept M2-03 as the guided-onboarding and context
review slice, or return focused corrections**.

## Approval gate

**Resolved 2 August 2026.** The product owner approved the nine-part decision
set after M2-01 and M2-02 were accepted. ADR-011 records the approved
transaction and persistence mechanism. The ticket is Tier 1 and was moved to
**in development** for a distinct builder and independent reviewer. Approval
remains limited to owner/synthetic local and founder-hosted use and authorizes
no production AI, external user, analytics, provider, or spend.
