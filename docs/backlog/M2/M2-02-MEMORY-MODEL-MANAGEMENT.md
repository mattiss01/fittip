# M2-02: Memory model and management

**Status:** in development — approved for implementation 1 August 2026. The
product owner approved the ticket's recommended direction for statuses,
history, expiry, and deletion; the memory write boundary as a new ADR-010; and
the sensitive-content treatment recorded in the brief below. The approval
resolves the eight open decisions listed at the end of this ticket.

**Decision, 2 August 2026 — a user-created `observed_pattern` is active on
save.** The product owner ruled that an observed pattern the user writes
themselves becomes `active` immediately, like a fact, constraint, or
preference. It does not start `proposed` and needs no confirming tap. Two
statements below are superseded by this and are retained as history rather than
edited: the class table's "Starts proposed and needs explicit user acceptance"
for `observed_pattern`, and "Any system/AI-derived **or observed** content must
begin `proposed`" under the provenance rules. The `## Agent brief` never stated
that rule, so the implementation contract is unaffected.

**What did not change:** genuinely system-derived or inferred content still
begins `proposed`, and no caller can forge `inferred_proposed` provenance or
`author_class = 'system'`. The independent review confirmed `proposed` is now
unreachable from the authenticated write path entirely.

**The cost, recorded deliberately:** accept, edit-and-accept, and reject have
no browser coverage and will not until M2-03 produces real proposals, because
no user path reaches the review queue. They remain proven at the database and
unit level against directly seeded proposals. Manufacturing an application path
to a proposal was rejected outright — it would have let a user create content
that reads as FitTip-inferred, which is the invariant this ticket exists to
protect. See ADR-010 decision 7 and the M2-02 validation record, both of which
arrive on `master` with the ticket merge.

**Milestone:** M2 — goals, editable coaching context, and guided onboarding

**Priority:** P1

**Feature brief:** [F-003 draft; direction approved](../../product/F-003-GOALS-MEMORY-GUIDED-ONBOARDING.md)

**Depends on:** [M1 milestone closeout accepted](../../validation/M1/M1-MILESTONE-CLOSEOUT.md); [M0-03 / F-001 accepted](../../product/F-001-PUBLIC-ACCOUNT-AUTHENTICATION.md); [M0-02-C1 accepted](../M0/M0-02-C1-REMOVE-USERNAME.md); [ADR-002](../../decisions/ADR-002-M0-02-DATA-AUTHORIZATION-BOUNDARY.md); [ADR-004](../../decisions/ADR-004-USERNAME-FREE-ACCOUNT-PROFILE.md)

**Hosted test dependency:** [M0-06A accepted](../M0/M0-06A-FOUNDER-HOSTED-STAGING.md)

**Founder staging boundary:** [ADR-006](../../decisions/ADR-006-LOCAL-OWNER-AI-MVP.md)
and [ADR-007](../../decisions/ADR-007-FOUNDER-HOSTED-STAGING.md);
product-owner or synthetic data only, local or founder-hosted

**Blocks:** [M2-03 Guided onboarding](M2-03-INTAKE-FACT-REVIEW.md) and [M2-04 targeted M2 closeout](M2-04-M2-VALIDATION-SLICE.md)

## Agent brief

**Outcome.** Give an authenticated user an explicit, inspectable, editable,
statused store of coaching facts, constraints, preferences, and proposed
observed patterns at `/home/you/memory`, so nothing FitTip believes about them
is hidden or silently inferred.

**Tier 1.** New table, migration, RLS, health-adjacent content, deletion.

**Approved decisions — build these, do not re-litigate them.**

- **Disable** moves `active` to `archived`, reversible by **Enable**. `rejected`
  is only a declined proposal. `proposed` is never active context.
- Editing appends a content revision and moves a current pointer; it never
  overwrites prior text, and a partial revision is never visible.
- Expiry excludes an item from active context and marks it review-due. It never
  silently deletes, archives, or converts content.
- **Delete permanently** purges the current content and every content-bearing
  revision in one transaction, leaving only evidence carrying no content.
- Content is one generic validated text value. No structured subtype fields, no
  global activity, equipment, or facility catalog.
- No health-adjacent field and no classifier; nothing infers severity from CRUD.
  One static, non-diagnostic notice on create and edit tells the user to stop
  and consult a qualified professional for severe or worsening symptoms.

**Hard constraints.**

- Write **ADR-010**, following ADR-008 and ADR-009: tables grant only `select`;
  one `security definer` function with `set search_path = ''` is the sole write
  path, deriving the owner from `auth.uid()` internally and never from the
  caller; execute granted only to `authenticated`.
- **Bound every lock wait.** ADR-009's unbounded `pg_advisory_xact_lock` was the
  defect M2-01's review caught. Use `lock_timeout` or
  `pg_try_advisory_xact_lock`, map exhaustion to the conflict path, and never
  let a contended save hang silently.
- Memory content must never reach logs, analytics, error messages, snapshots,
  or fixtures. Add a test that fails if it does.
- A third RPC call site changes the `.retry(false)` invariant in
  `src/architecture/server-boundary.test.ts`. Update it deliberately.
- Do not copy M2-01's broken pgTAP patterns
  ([M2-07](M2-07-GOAL-REVIEW-FOLLOWUPS.md) findings 1 and 2). Per
  `supabase/tests/database/m0_02_authorization.test.sql`: assert policy names,
  commands, roles, predicates, **exact count** per table; prove cross-user
  denial behaviorally with no own-owner `where` masking RLS; write no assertion
  that passes when the property is absent.
- No `supabase link`, `db push`, or remote command. No secret, service client,
  trigger, view, or elevated worker beyond the approved function.

**Non-goals.** No AI extraction, pattern detection, coaching, plan generation,
or provider call. No raw-chat store. No onboarding flow — that is M2-03. No
training, completion, replan, diagnosis, treatment, analytics, or external
service.

**Acceptance criteria.** The twelve criteria below are the contract; the
approved decisions settle how 1 through 7 and 10 are met.

**Expected files.** Migration and pgTAP under `supabase/`; domain and
repository under `src/server/`; route `src/app/home/you/memory/`; components
`src/components/memory/`; regenerated `database.types.ts`;
`e2e/m2-02-memory.spec.ts` with its own config and port; `ADR-010`; validation
record. Decomposition is yours.

**Project skills.** `schema-change`, `vercel-react-best-practices`,
`frontend-design`, `mobile-e2e`, `validation-record` — read each from
`.agents/skills/<name>/`; Claude Code does not auto-discover them.

Read only this section unless you hit an ambiguity it does not resolve.

## Outcome

Give an authenticated user an explicit, inspectable, editable, statused record
of coaching facts, constraints, preferences, and proposed observed patterns.
The user can understand where each item came from, correct it, disable it, and
delete it without FitTip silently converting an inference into fact.

This ticket implements memory records and management only. It does not extract
facts with AI, generate coaching or plans, detect patterns, send content to an
AI provider, or treat raw chat history as memory.

## Approval, environment, and external-use boundary

This proposal may be implemented locally after its accepted dependencies are
satisfied and the decisions below are approved. It does not authorize a remote migration,
external collection, analytics, AI transfer, or a health-data processing
claim.

Before any external user stores memory, all of the following must be separately
approved, implemented, validated, and accepted:

- M0-03B account recovery;
- the M0-04 privacy design **and** later implementation slices for the
  user-facing notice, memory/health-adjacent inventory and retention,
  account/data deletion operation, and applicable access/export handling;
- any AI-consent/withdrawal implementation before memory content can be sent to
  an AI provider;
- M0-05 privacy-safe event/request-control contracts; and
- M0-06's hosted database, email, bot-protection, CI/deployment, and
  authorization validation gates.

M0-04 design acceptance does not authorize a `memory_items` migration, privacy
UI, consent UI, deletion worker, processor transfer, or external use. M2-02's
schema/UI approval is a separate gate, and production AI calls remain
prohibited.

## Scope

1. Define the user-owned memory item and content-bearing history semantics.
2. Add a forward migration, explicit privileges/RLS, generated types, and
   direct authorization tests.
3. Add server-only memory domain and repository operations.
4. Add authenticated 390px list, detail, create, edit, disable/enable, proposal
   review, and approved deletion flows.
5. Distinguish user-created/confirmed content from inferred-proposed content at
   every boundary.
6. Apply conservative handling to pain, illness, injury, and severe-fatigue
   content without diagnosis or treatment advice.
7. Add domain, integration, privacy/security, accessibility, and end-to-end
   validation.

## Non-goals

- No AI extraction, pattern detection, coaching, plan generation, prompt,
  model, provider call, or consent bypass.
- No raw-chat memory store, global activity/equipment catalog, or hidden user
  profile assembled from behavior.
- No training plan, completion, replan, progress, or activity behavior.
- No medical diagnosis, treatment, rehabilitation prescription, or safety
  guarantee.
- No analytics, remote migration, deployment, external service, or privacy
  schema/UI/operation outside the approved memory slice.

## Memory classes

| Type | Purpose | Example | May become active how? |
|---|---|---|---|
| `profile_fact` | Stable context relevant to coaching | Unit preference or training experience | User creates or explicitly accepts/edits a candidate |
| `constraint` | A limit that future coaching should respect | Thirty minutes available on weekdays; no pool this month | User creates or explicitly accepts/edits a candidate |
| `preference` | A strong but overridable preference | Prefers Sundays off; dislikes a named activity | User creates or explicitly accepts/edits a candidate |
| `observed_pattern` | A fallible inference with evidence | Often misses Thursday training | Starts proposed and needs explicit user acceptance |

Types are sport-agnostic. Equipment, locations, availability, limitations, and
preferences are represented as personal memory rather than a global exercise,
facility, or sport catalog.

## Proposed current-record contract

| Field | Proposed rule |
|---|---|
| Stable id | UUID primary key |
| Owner | Required immutable `user_id`, derived from verified identity |
| Type | One of the four approved memory classes |
| Summary/value | Required user-readable content with approved limits |
| Status | `active`, `proposed`, `rejected`, or `archived` |
| Provenance | User-created, intake-confirmed, or inferred-proposed; never implicit |
| Source references | Minimal structured references to the originating intake/log/system evidence when applicable |
| Confidence | Optional for inferred proposals; never presented as certainty |
| Expiry | Optional owner-local date/time or review date where a constraint/pattern may become stale |
| Current revision | Reference to or number of the visible current content revision |
| Timestamps | UTC creation/update/status timestamps |

Recommendation: the user-visible **Disable** action transitions an active item
to `archived`, and **Enable** restores it to `active` after validation.
`rejected` is reserved for a reviewed proposal the user declined. A proposed
item is never active context.

Exact field names, content structure, text limits, source-reference shape,
confidence scale, and whether `archived` is the visible word remain open
decisions. A generic validated text value is required so no sport is excluded;
structured subtype fields must have an approved need and schema.

## Provenance and activation rules

- A user-created item may become active only through the user's explicit save.
- A structured onboarding candidate becomes active only after the M2-03 review
  action commits it.
- Any system/AI-derived or observed content must begin `proposed`, even when
  confidence is high. M2-02 provides the state contract but creates no
  inference engine.
- Accepting a proposal is an explicit authenticated action. Editing before
  acceptance creates user-confirmed content while retaining the proposal's
  origin in history.
- Rejecting a proposal prevents it from active use. It must not reappear as fact
  merely because similar content is later generated.
- Active memory is eligible for future planning context only after the later
  planning ticket is approved. Proposed, rejected, archived, deleted, or
  expired content is not eligible.
- A user statement outranks an inferred proposal. Contradictory items are shown
  for review; FitTip does not silently select a winner.
- Raw chat transcripts, form submissions, and training logs are not the memory
  store. Source references are minimized and purpose-specific.

## Version, history, and audit semantics

Recommendation:

- Keep one stable memory identity and an append-only sequence of content/status
  revisions visible to the owner.
- Editing creates a new revision; it does not overwrite the prior text in
  place.
- Each revision records author class (`user` or approved system source),
  provenance, status transition, server timestamp, and the immediately prior
  revision.
- Current state is derived from the latest committed revision or from a
  separately constrained current pointer; partial revisions are never visible.
- Do not copy raw health-adjacent content into analytics, logs, generic audit
  events, or error messages.
- Version history is not an excuse to defeat deletion. Permanent deletion
  removes the current content and all content-bearing revisions according to
  the accepted privacy design. Only specifically approved, minimized deletion
  evidence may remain, without the deleted content.

The exact history representation and retention period are consequential data
and privacy decisions. A single mutable row without inspectable history is not
acceptable; indefinite hidden retention of deleted sensitive content is also
not acceptable.

## Status and expiry behavior

- `active`: visible and eligible for future approved coaching context.
- `proposed`: visible in a review queue; excluded from active context.
- `rejected`: retained only for the approved review/history purpose and never
  used as fact.
- `archived`: disabled by the user and excluded from active context; may be
  re-enabled.
- Expiry never silently deletes or converts content. At the approved boundary,
  an expired active item becomes visibly due for review and is excluded from
  active context until renewed, edited, or archived.
- Status changes and expiry reviews use optimistic concurrency or an equivalent
  stale-write guard.
- Deleting an item is distinct from disabling it and requires explicit
  confirmation. Account deletion remains owned by the later privacy operation.

Whether expired items automatically become archived or enter a separate
review-needed state is an open product decision.

## Sensitive and health-adjacent handling

Pain, illness, injury, recovery, fatigue, medication-like text, disability, and
other limitation details may reveal health information. The UI and server must
treat them conservatively:

- collect only what the user intentionally enters for an approved coaching
  purpose;
- make the item visible and editable to the user, with its source and status;
- never diagnose, claim safety, prescribe rehabilitation, or turn a statement
  into a medical conclusion;
- never infer severity from ordinary memory CRUD;
- display approved static safety language for severe, acute, or worsening
  signals and recommend stopping/consulting a qualified professional;
- do not send content to analytics, logs, monitoring, email, or an AI provider;
- require accepted privacy inventory, notice, retention, deletion/export, and
  access controls before external collection; and
- let the user disable or delete the item without implying that deletion can
  instantly erase unexpired approved backups.

The exact signal fields, copy, and whether a dedicated health-adjacent label is
shown are open safety/privacy decisions. M2-02 must not add diagnostic
classification or automated coaching behavior.

## Ownership, repository, migration, and RLS rules

- Every current item and content-bearing revision is owner-scoped with
  `user_id`; parent/child references must not cross owners.
- Server operations derive identity from verified Auth context and repeat the
  owner filter. No caller supplies an owner id.
- Browser components do not import repositories or decide provenance,
  activation, deletion, or expiry eligibility.
- Schema validation applies to browser input, server input, and database-bound
  records.
- Exposed tables have explicit least-privilege grants and RLS enabled.
- Owner policies target `authenticated` and use explicit predicates such as
  `(select auth.uid()) = user_id`; anonymous and cross-user access is denied.
- Update policies have owner `USING` and `WITH CHECK`, plus the required select
  policy. `user_id`, historical author class, and provenance cannot be
  reassigned by an ordinary edit.
- The selected history design prevents a user from forging a system-inferred
  provenance while still allowing the user to edit/accept the content through
  a controlled domain operation.
- Index `user_id` and owner/list ordering fields where not covered by a primary
  or unique index.
- No view, trigger, public RPC, definer function, secret/service client, or
  elevated worker is added without an approved architecture decision.
- Migration creation, clean reset, type generation, lint, advisors, and direct
  RLS tests follow the current supported Supabase workflow.

## Proposed 390px management flows

### Memory list

1. The user opens **You → Memory**.
2. Active memory is grouped by facts, constraints, preferences, and observed
   patterns.
3. A separate review section shows proposed items with an explicit
   **Proposed** label and source.
4. Filters expose active, proposed, rejected, archived/disabled, and
   review-due items without hiding their meaning.
5. Empty states say that nothing is stored; they do not claim the coach has
   learned anything.

### Create and edit

1. The user chooses **Add memory**, selects a type, enters the approved
   content, and optionally sets expiry where allowed.
2. The review screen shows the exact value, provenance `Created by you`, and
   whether it will be active.
3. Save creates the item/revision once. Retry does not duplicate it.
4. Editing shows the current revision. A stale save preserves the user's input
   and asks them to review the newer version.

### Review, disable, and delete

1. A proposed item shows its content, source/evidence summary, confidence when
   applicable, and actions **Accept**, **Edit and accept**, and **Reject**.
2. No action is preselected; leaving the screen changes nothing.
3. **Disable** removes an active item from future approved coaching context and
   leaves it inspectable.
4. **Delete permanently** explains the approved content/history effect and
   requires confirmation.
5. Safety copy is static, concise, non-diagnostic, and only appears at the
   approved trigger.

Routes, visible terms, group ordering, copy, and confirmation patterns remain
unapproved proposals.

## Acceptance criteria

1. At 390px, an owner can inspect, create, edit, disable/enable, delete, and
   filter memory according to the approved semantics.
2. Facts, constraints, preferences, and observed patterns remain distinct and
   sport-agnostic.
3. Every item visibly shows status and provenance; inferred/system content can
   only start proposed.
4. Proposed/rejected/archived/expired content is never returned as active
   context by the domain service.
5. Accept, edit-and-accept, reject, disable, re-enable, expiry review, and
   delete are explicit, validated, stale-write-safe operations.
6. Editing creates inspectable version/history evidence without silently
   overwriting prior content.
7. Approved permanent deletion removes all content-bearing versions and does
   not leave raw content in logs/audit evidence.
8. User A can access only user A's items and revisions; user B and anonymous
   callers cannot read or mutate them through repository or Data API paths.
9. Cross-owner parent/source references and ownership reassignment are rejected.
10. Health-adjacent content receives the approved conservative,
    non-diagnostic treatment and never enters analytics/logs/AI.
11. Clean migrations, generated types, database lint/advisors, direct
    authorization tests, application gates, and production build pass.
12. No AI extraction, pattern detector, plan/coaching generation, global
    activity library, remote mutation, external service, or secret is added.

## Test and validation plan

### Database and repository

- Assert approved current/history columns, constraints, references, indexes,
  grants, policies, and RLS state.
- Test owner operations and anonymous/cross-user denial for current items,
  revisions, source references, and deletes.
- Reject forged `user_id`, provenance, author class, current revision, and
  cross-owner source references.
- Prove atomic revision/current-state changes and stable retry behavior.
- Prove content deletion covers every content-bearing revision while retaining
  only approved minimal evidence.

### Domain and UI

- State-transition tables for active/proposed/rejected/archived and the approved
  expiry behavior.
- User-created versus intake-confirmed versus inferred-proposed activation.
- Edit-and-accept preserves source provenance but records user confirmation.
- Duplicate, conflict, stale revision, and idempotent retry cases.
- Context selector excludes every non-active/review-due item.
- 390px Playwright flow: empty memory → create each supported type → edit →
  disable/enable → review proposed accept/edit/reject → expiry state → delete.
- Accessibility review for headings, filters, status labels, focus, error
  summary, confirmation, announcements, touch targets, and keyboard use.
- Sensitive-content scans across logs, analytics/event payloads, HTML,
  snapshots, fixtures, errors, and committed files.

### Expected command families

Verify exact syntax against installed tool versions:

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
   [Product Plan](../../../REVISED_PRODUCT_PLAN.md), accepted M0 authorization
   artifacts, the accepted M0-04 design when available, and current official
   Supabase guidance.
2. Resolve history, deletion, expiry, sensitive-data, and architecture
   decisions; add an ADR for consequential database/service choices.
3. Create one forward migration and direct authorization/history tests.
4. Add a narrow memory domain contract/context selector and owner repository
   behind the existing server boundary.
5. Add only the approved authenticated memory-management screens.
6. Add focused unit, integration, privacy/security, and 390px end-to-end tests.
7. Regenerate types from a clean reset and run all gates.
8. Hand off to an independent reviewer; missing behavior stays with M2-02 and
   is not silently added by M2-04.

Likely areas are `supabase/migrations/`, `supabase/tests/database/`,
`src/server/`, authenticated `src/app/` routes, focused `src/components/`,
generated types, tests, and validation docs. Names and decomposition are
reversible builder decisions after approval. A privileged operation, new
database connection, function/RPC, trigger, or hidden audit store is not.

## Open product, architecture, safety, and privacy decisions

**Resolved 1 August 2026.** All eight were settled at approval; the outcomes
are in the Agent brief. This section is retained as the record of what was
asked. Decision 2 became ADR-010, and decision 6 was answered with no
health-adjacent field and a static non-diagnostic notice.

1. **Visible statuses.** Recommendation: use Product Plan statuses and map
   **Disable** to reversible `archived`; approve the exact label and restore
   behavior.
2. **History representation.** Approve append-only revisions/current pointer
   or another inspectable atomic design, including owner visibility.
3. **Deletion.** Recommendation: purge all content-bearing versions and retain
   only explicitly approved minimized deletion evidence; align exact retention
   and backup language with the M0-04 implementation.
4. **Expiry.** Recommendation: exclude expired items and mark them review-due
   without silently changing or deleting them. Alternative: automatically
   archive at expiry.
5. **Provenance/source detail.** Approve the three initial provenance classes,
   evidence detail, confidence scale, and protection against forged system
   provenance.
6. **Sensitive content.** Approve the health-adjacent indicator, static safety
   trigger/copy, inventory classification, access/export, retention, and
   prohibited logging rules.
7. **Content structure.** Approve text limits and the minimum structured fields
   for availability/equipment/locations without creating a global catalog.
8. **Visible flow/copy.** Approve routes, grouping, filters, review actions,
   destructive confirmation, and source/confidence wording.

## Handoff

Before testable status, provide:

- exact branch and commit;
- changed files grouped by migration, domain/repository, UI, tests, and docs;
- actual record/history model and privilege/policy matrix;
- clean-reset and generated-type evidence;
- provenance/status/context-selector, versioning, stale-write, delete, owner,
  anonymous, and cross-user evidence;
- sensitive-content and secret/log/analytics scans;
- exact commands/results and `390x844` demo paths/screenshots;
- known limitations and approved deviations; and
- confirmation that no AI extraction/generation/transfer, remote mutation, or
  plan behavior was added.

The lead agent assigns an independent reviewer. The precise product-owner
decision after review is: **accept M2-02 as the memory-model and management
slice, or return focused corrections**.

## Current primary guidance

- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Data API security](https://supabase.com/docs/guides/api/securing-your-api)
- [Supabase database migrations](https://supabase.com/docs/guides/deployment/database-migrations)
- [PostgreSQL constraints](https://www.postgresql.org/docs/current/ddl-constraints.html)

## Approval gate

The product owner must approve the memory types, statuses, provenance,
version/history, expiry, delete, sensitive-data, mobile UX/copy, and any
consequential database architecture before implementation. Approval dispatches
the ticket only when its recorded dependencies are accepted. M0-06A permits
only owner/synthetic founder staging; M0-06 remains a
pre-friends/public/commercial gate. Until then, M2-02 remains **proposed**.
