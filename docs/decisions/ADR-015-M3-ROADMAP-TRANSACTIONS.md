# ADR-015: M3 roadmap proposal and acceptance transactions

**Status:** accepted — approved by the product owner on 10 August 2026

**Date accepted:** 10 August 2026

**Revised:** 10 August 2026 — added the approved roadmap-regeneration contract
and deterministic planning-note-only memory-candidate validation

**Ticket:** required before
[M3-02](../backlog/M3/M3-02-ROADMAP-PROPOSAL.md) is dispatched

**Builds on:** [ADR-002](ADR-002-M0-02-DATA-AUTHORIZATION-BOUNDARY.md),
[ADR-008](ADR-008-M1-TRAINING-RECORD-TRANSACTIONS.md),
[ADR-009](ADR-009-M2-GOAL-MUTATION-TRANSACTION.md),
[ADR-010](ADR-010-M2-MEMORY-WRITE-BOUNDARY.md), and
[ADR-014](ADR-014-PLANNING-NOTE-BOUNDARY.md)

## Context

M3-02 has operations with different failure boundaries: claim one paid AI
attempt before calling the provider, persist a validated proposal after the
provider returns, optionally regenerate from a rejected proposal, and later
accept a proposal as the current roadmap. The provider call cannot be inside a
database transaction. A unique proposal row alone is also insufficient: two
serverless instances could both call the provider before either tries to insert
it.

The ticket also becomes the first producer of `inferred_proposed` memory.
ADR-010 deliberately gives `apply_memory_change` no authenticated operation
that can create system-authored provenance. M3-02 therefore needs one narrow
extension without allowing a memory candidate to become active or making its
failure roll back a valid roadmap proposal.

## Decision

Use six owner-owned tables and five narrowly granted `SECURITY DEFINER`
functions. Every function derives the owner from `auth.uid()`, takes no owner
identifier, sets `search_path = ''`, uses schema-qualified names, bounds every
lock wait to three seconds, and returns content-free receipts except where the
caller is explicitly loading its own proposal. No provider call is made from a
function.

### Tables

1. `roadmap_generation_requests` is the durable pre-call idempotency record. It
   stores `id`, `user_id`, a hidden `completion_token`, bounded
   `idempotency_key`, `request_fingerprint`, requested start/end dates,
   `expected_head_revision`, nullable previous proposal id, regeneration number
   from 0 through 3, bounded planning-note and regeneration-feedback hashes,
   status (`pending`, `completed`, or `failed`), nullable `proposal_id`, a
   bounded safe failure code, and timestamps. It is unique on
   `(user_id, idempotency_key)`.
2. `roadmap_proposals` stores immutable proposal content: `id`, `user_id`,
   `generation_request_id`, nullable `source_proposal_id`, origin (`ai_initial`,
   `ai_regeneration`, or `owner_edit`), planning note, nullable regeneration
   feedback, schema/prompt/provider/model/rate-card codes, nullable
   spend-reservation id, validated `content` JSON, and `created_at`. An initial
   AI proposal has no source; a regeneration and an edit each link exactly one
   immediate source proposal. Every proposal retains the generation request
   whose owner-text context and technical metadata it uses.
3. `roadmap_proposal_sources` stores minimized provenance: `proposal_id`,
   `user_id`, source kind, record id, nullable revision id, nullable revision
   number, and ordinal. It stores no copied source content. A composite foreign
   key prevents a proposal from referencing another owner's source row.
4. `roadmap_proposal_decisions` is append-only and stores one terminal decision
   per proposal: `proposal_id`, `user_id`, `accepted` or `rejected`, nullable
   accepted version id, and server decision time. Proposal content is never
   updated to express status.
5. `roadmap_versions` stores immutable accepted history: `id`, `user_id`,
   monotonic version number, source proposal id, nullable previous version id,
   validated content, and accepted time. A proposal can create at most one
   accepted version.
6. `roadmap_heads` stores one owner row with monotonic `revision`, nullable
   `current_version_id`, and `updated_at`. It is the only mutable roadmap
   pointer.

Every table has a composite owner key where another owned table references it,
`ON DELETE CASCADE` from the profile, RLS enabled, and an authenticated owner
`SELECT` policy. Direct `INSERT`, `UPDATE`, and `DELETE` are revoked from
`public`, `anon`, `authenticated`, and `service_role`. The generation token is
excluded from the authenticated column-level `SELECT` grant.

### Function 1: claim the provider attempt

`begin_roadmap_generation(p_idempotency_key text, p_request_fingerprint text,
p_start_date date, p_end_date date, p_expected_head_revision bigint,
p_planning_note text, p_previous_proposal_id uuid,
p_regeneration_feedback text)` returns a typed receipt containing generation
id, completion token, state, regeneration number, and nullable proposal id.

It takes a bounded per-owner advisory transaction lock, verifies the current
head revision, and inserts the `pending` request. An initial request requires
null predecessor and feedback. A regeneration requires an owned rejected
immediate predecessor, the exact same horizon, an editable planning note of at
most 1,000 characters, and non-empty feedback of at most 500 characters. It
derives the predecessor's regeneration number plus one and rejects a fourth
regeneration before any provider call. Only bounded hashes of both owner-text
fields are held on a pending or failed request; their content is stored only
when a proposal is successfully persisted.

On the same key and same fingerprint it returns the existing state; the caller
invokes no provider when that state is `pending`, `completed`, or `failed`.
Reuse of a key with a different fingerprint is `PT409`. A process lost after
the provider call leaves an honest pending attempt; it is never automatically
retried. Regeneration is different: it deliberately uses a new key, spend
reservation, and provider call.

### Function 2: finish generation and persist the proposal

`finish_roadmap_generation(p_completion_token uuid, p_outcome text,
p_schema_version text, p_prompt_version text, p_provider_code text,
p_model_code text, p_rate_card_version text, p_spend_reservation_id uuid,
p_planning_note text, p_regeneration_feedback text, p_content jsonb,
p_sources jsonb, p_safe_failure_code text)` returns generation state and nullable
proposal id.

For `failed`, proposal fields must be null and the function records only the
bounded safe code. For `proposal`, failure fields must be null; the function
requires the request to be pending, verifies its owner and token, verifies both
owner-text fields against the hashes claimed before the provider call, verifies
a settled same-owner `create_roadmap` spend reservation and matching rate-card
for a live provider result, validates the bounded envelope, and atomically
inserts the proposal and source rows before marking the request completed. A
regeneration stores only its immediate predecessor and feedback; the database
rejects a changed horizon or lineage above three. Local network-free fixture
tests use a null spend reservation and the fixed fixture technical codes;
founder-hosted provider results cannot.

Replaying the same completion token returns the existing result. Different
content or metadata against an already finished request is `PT409`. Failure at
any point rolls back the proposal, every source row, and the request state.

The application validates the full v2 contract and business rules before this
call; the database independently enforces ownership, sizes, enums, horizon,
array/object bounds needed to keep the stored envelope safe, and the accepted
model/rate-card pair. The composition root expresses that model and rate card
as one value and refuses to construct a live service when they differ.

### Function 3: persist inferred memory candidates independently

`record_roadmap_memory_candidates(p_completion_token uuid,
p_expected_memory_revision bigint, p_candidates jsonb)` returns the resulting
memory collection revision and created item ids.

This is the only new route that can create `author_class = 'system'`,
`provenance = 'inferred_proposed'`, and `status = 'proposed'`. It requires the
token of an owned, completed AI roadmap generation, accepts at most the approved
zero-to-four candidate count, and accepts only memory type, a 1-to-200-character
`sourceExcerpt`, and bounded optional confidence. It verifies each normalized
excerpt is an exact substring of the stored planning note and uses that excerpt
as the memory content; there is no separate model-authored content field. Owner,
provenance, author, status, source reference, revision ids, and timestamps are
derived inside the function. Source reference is the roadmap proposal plus
candidate ordinal; a unique constraint makes a retry return the existing
candidates rather than duplicate them.

For a regeneration, the same exact-excerpt check applies only to the planning
note. Text present solely in regeneration feedback cannot pass; that field is a
critique of one rejected proposal, not durable coaching context. If one
candidate fails, the function rejects the whole candidate batch, and the
already committed roadmap remains valid.

The function uses ADR-010's owner lock, stale collection revision check,
append-only `memory_revisions`, and collection revision increment. It is a
separate transaction called only after the roadmap proposal commits. An
invalid candidate section is not called. A conflict or database failure rolls
back only the candidate batch and does not invalidate or delete the roadmap.

This narrowly amends ADR-010's statement that no authenticated path can produce
inferred provenance. The new path can produce proposals only; it cannot accept,
enable, edit, or delete them and cannot make them eligible coaching context.
Because FitTip intentionally uses the owner's existing Supabase session and no
service-role credential, the function proves that content passed through this
restricted owned generation route, not that an untrusted owner could never call
the RPC directly. That is acceptable here because the result remains visibly
proposed and affects no other owner or active coaching context. A stronger
trusted-process claim would require a separately approved server credential or
signed capability and is not introduced by M3-02.

### Function 4: edit or reject a proposal

`apply_roadmap_proposal_change(p_operation text, p_proposal_id uuid,
p_content jsonb)` supports only `edit` and `reject`.

`edit` requires bounded valid content and no terminal decision. It creates a
new immutable `owner_edit` proposal, copies the original planning note,
regeneration feedback where present, technical metadata, and source references,
and links the source proposal. It does not rewrite or decide the source
proposal. `reject` requires null content and inserts one `rejected` decision.
That decision makes the proposal eligible as the immediate predecessor of one
regeneration request. Same-operation replay returns the existing receipt; a
conflicting terminal decision is `PT409`.

### Function 5: accept a proposal

`accept_roadmap_proposal(p_proposal_id uuid,
p_expected_head_revision bigint)` returns proposal id, accepted version id,
new head revision, and result category.

It takes the bounded owner lock and, in one transaction:

1. verifies ownership and that no conflicting terminal decision exists;
2. verifies every stored goal, memory, plan, and completion source still points
   to the same current eligible revision (unrelated new records do not create a
   false conflict);
3. verifies the current head revision equals the caller's expected revision;
4. inserts the next immutable version, linked to its proposal and prior current
   version;
5. advances the single head; and
6. inserts the accepted decision linked to that version.

Replaying acceptance of the same proposal returns its existing version.
Another proposal racing the same expected head receives `PT409`; no version,
head, or decision from the losing transaction remains.

## Safety and privacy consequences

- Transaction functions do not infer injury severity or recovery. They persist
  only a proposal already validated under M3-02's no-automatic-blocker rule.
- Proposal content and planning notes remain owner-readable audit history with
  no automatic expiry or per-proposal delete. Profile/account deletion cascades
  through requests, proposals, sources, decisions, versions, and the head.
- Memory candidates retain ADR-010's independent deletion behavior; deleting a
  memory item removes its content and revisions without deleting the roadmap.
- No raw prompt, assembled provider body, duplicate source content, settlement
  token, credential, or content-bearing error is stored in these tables or
  returned in a receipt.

## Alternatives rejected

- **Insert the proposal after the call and rely on a unique key.** This prevents
  duplicate rows but not two provider calls made before either insert.
- **Treat regeneration as a retry of the rejected request.** It would reuse an
  idempotency key for different input and conceal a new provider charge.
- **Hold the provider call inside a transaction.** This holds locks across an
  external deadline and cannot make the external call atomic with Postgres.
- **Direct table writes with RLS.** RLS protects ownership but cannot atomically
  create accepted history and move the current pointer, or derive immutable
  metadata and system-proposed memory provenance.
- **Make memory candidates part of proposal persistence.** One memory conflict
  would roll back a valid roadmap, contradicting the approved independent
  decision boundary.
- **Add a service-role client or new secret.** It would create a larger
  credential and deployment boundary solely to strengthen provenance for an
  owner-visible, inactive proposal. That needs separate approval and is not
  justified for founder-only M3-02.

## Approval boundary

This ADR approves only these tables, function signatures, grants, idempotency
behavior, rollback boundaries, and the narrow ADR-010 amendment for M3-02
owner/synthetic local and founder-hosted use. F-004 was approved separately on
10 August 2026. Neither approval dispatches implementation or approves M3-03, a
service-role client, friends' data, public registration, commercial use,
analytics, or a new provider/model or spend ceiling. The product owner
explicitly paused M3-02 dispatch after approving both documents.
