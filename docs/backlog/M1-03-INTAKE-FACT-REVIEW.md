# M1-03: Structured intake and fact review

**Status:** proposed — not approved for implementation

**Milestone:** M1

**Priority:** P1

**Depends on:** [M1-01 accepted](M1-01-GOAL-MODEL-VALIDATION.md) and [M1-02 accepted](M1-02-MEMORY-MODEL-MANAGEMENT.md)

**Local staging boundary:** [ADR-006](../decisions/ADR-006-LOCAL-OWNER-AI-MVP.md);
product-owner or synthetic data only, no hosted/external use

**Blocks:** [M1-05 M1 validation slice](M1-05-M1-VALIDATION-SLICE.md)

## Outcome

Let an authenticated user complete a compact, sport-agnostic structured intake,
review deterministic candidate goals and memory items, and explicitly accept,
edit-and-accept, or reject every candidate before any item becomes active.
Interrupted intake can resume safely, validation conflicts remain reviewable,
and retries do not duplicate accepted records.

This ticket uses structured form input and deterministic mapping only. It does
not use production AI extraction, accept unreviewed natural-language
inferences, generate a plan, provide coaching, or give diagnostic advice.

## Approval, environment, and external-use boundary

This proposal may be implemented locally only after M1-01 and M1-02 are
accepted. It does not authorize remote persistence, production AI, external
registration, analytics, or a privacy/legal conclusion.

M0-06 is not a local implementation dependency. It remains mandatory, together
with the privacy and recovery gates below, before friends, hosted deployment,
or external use.

Before any external user submits intake, all of the following must be
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
collection UI, consent UI, deletion operations, or external use. M1-03 adds no
AI transfer even if an AI-consent design later exists.

## Scope

1. Add the approved structured intake steps and review screen.
2. Deterministically map submitted fields to candidate goal and memory
   contracts already accepted in M1-01/M1-02.
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
- No general narrative intake unless a later brief separately approves its
  purpose, privacy handling, and mapping.
- No silent persistence, preselected acceptance, automatic merge, or direct
  write that bypasses the accepted goal/memory services.
- No analytics, remote migration, deployment, external service, consent
  implementation, or deletion operation.
- No new goal or memory behavior beyond the accepted M1-01/M1-02 contracts.

## Structured intake boundary

The default proposed intake asks only for structured fields needed by the
accepted goal and memory contracts:

- goals, desired outcomes, category, sports/activity areas, dates, target
  detail/metric, core/supporting tier, and rank;
- weekly availability and time limits;
- equipment and locations/possibilities;
- preferences and explicit dislikes;
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
- candidate payload validated against the accepted M1-01 or M1-02 input schema;
- decision `pending`, `accept`, `edit_and_accept`, or `reject`;
- user edits and current revision/concurrency token;
- duplicate/conflict references without copying unrelated record content;
- created, updated, last-resumed, expiry/cancel, and publication timestamps; and
- an idempotency/publication reference to the created goal or memory.

Draft and candidate schema is not approved merely by this recommendation.
Alternatives include encrypted/session-local drafts with no cross-device
resume or a narrower server draft. The selected design must support the
approved resume promise, retention/deletion design, RLS, and atomic
publication.

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
- Inferred/system-looking content: deterministic structured intake records
  `intake_confirmed`, not `inferred`. A user cannot forge system provenance.
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

1. **Welcome/purpose:** Explain what will be collected, that nothing becomes
   active until review, and where the privacy notice is available.
2. **Goals:** Add and order goal cards using the accepted M1-01 fields.
3. **Possibilities:** Enter availability, time, equipment, and locations.
4. **Preferences and constraints:** Enter the approved structured fields and
   see conservative safety copy when applicable.
5. **Review:** Candidate goals and memory are grouped by destination. Each card
   requires accept, edit-and-accept, or reject.
6. **Resolve:** Duplicates, contradictions, fourth-core, rank, and stale-state
   conflicts are handled explicitly.
7. **Save:** A summary names the counts to be published. One final action
   atomically creates/updates selected accepted records.
8. **Complete:** Show only actual persisted goals/memory with links to inspect
   them. Do not generate or imply a plan.

Each step uses a visible title/progress indicator, associated labels, inline
and summary errors, thumb-reachable actions, safe back navigation, and
non-color-only status. Exact step count, route, copy, progress pattern, and
required fields remain unapproved proposals.

## Acceptance criteria

1. At `390x844`, an authenticated user can start, save, resume, review, publish,
   cancel, and safely retry the approved structured intake.
2. Intake is sport-agnostic and contains no production AI extraction, coaching
   chat, plan generation, global activity library, or diagnostic advice.
3. Candidate goals/memory remain separate from active records until explicit
   publication.
4. Every candidate requires accept, edit-and-accept, or reject; no default,
   navigation, timeout, or retry silently accepts it.
5. A mixed accepted/rejected selection is supported, while publication of all
   selected accepted items is atomic under the approved design.
6. Destination records use the accepted M1-01/M1-02 contracts, provenance,
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

1. Re-read [AGENTS.md](../../AGENTS.md), the
   [Product Plan](../../REVISED_PRODUCT_PLAN.md), accepted M1-01/M1-02 briefs
   and validation, accepted privacy implementation artifacts, and current
   Supabase guidance.
2. Resolve required fields, draft retention, publication atomicity, safety, and
   mobile UX decisions; record architecture decisions where required.
3. Define deterministic candidate schemas by importing/reusing the accepted
   goal/memory contracts, not copying divergent rules.
4. Create the forward migration and direct draft/candidate authorization tests.
5. Add the intake domain/repository boundary and atomic publication service.
6. Add only the approved structured intake and review routes/components.
7. Add unit, integration, privacy/security, accessibility, and 390px tests.
8. Regenerate types from a clean reset and run all gates.
9. Hand off to independent review. Missing goal/memory behavior returns to its
   owning ticket; missing intake behavior remains M1-03.

Likely areas are `supabase/migrations/`, `supabase/tests/database/`,
`src/server/`, authenticated `src/app/` routes, focused components, shared
accepted validation schemas, generated types, tests, and validation docs.
Exact reversible file names remain builder choices. A transaction function,
RPC, trigger, elevated credential/connection, or persistent sensitive draft
design requires explicit architecture/privacy approval.

## Open product, architecture, safety, and privacy decisions

1. **Required intake fields.** Approve which goal, availability, equipment,
   preference, and limitation fields are required versus skippable.
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
7. **Mobile IA/copy.** Approve route, step count/order, progress pattern,
   button labels, completion copy, and whether a user may skip intake.
8. **Privacy.** Approve collection notice placement, content classification,
   source retention, access/export, deletion, backups, and prohibited logging
   before external use.

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
decision after review is: **accept M1-03 as the structured intake/fact-review
slice, or return focused corrections**.

## Approval gate

The product owner must approve required fields, draft persistence/retention,
partial-selection and atomic-publication behavior, duplicate/conflict rules,
safety copy/thresholds, privacy handling, and mobile flow/copy. Any
consequential transaction or persistence mechanism requires an ADR. Approval
dispatches only after M1-01 and M1-02 are accepted. Until then, M1-03 remains
**proposed**.
