# ADR-011: M2 guided-onboarding draft and publication boundary

**Status:** accepted

**Date:** 2 August 2026

**Amended:** 3 August 2026 — approved daily in-Postgres expiry cleanup

**Ticket:** [M2-03 guided onboarding](../backlog/M2/M2-03-INTAKE-FACT-REVIEW.md)

**Builds on:** [ADR-002](ADR-002-M0-02-DATA-AUTHORIZATION-BOUNDARY.md),
[ADR-008](ADR-008-M1-TRAINING-RECORD-TRANSACTIONS.md),
[ADR-009](ADR-009-M2-GOAL-MUTATION-TRANSACTION.md), and
[ADR-010](ADR-010-M2-MEMORY-WRITE-BOUNDARY.md)

## Context

M2-03 needs a resumable owner draft whose candidates remain separate from
accepted goals and memory. The final action may create and update several goal
and memory records, including a complete goal ordering, but the owner must
never observe a partially published selection.

Application-level sequential RPC calls cannot meet that guarantee. A failure
after a goal write but before a memory write would leave a half-published
batch, while a retry could duplicate whichever side committed. Direct table
writes would also bypass the accepted goal collection, memory revision,
provenance, three-core, and concurrency boundaries.

The draft can contain health-adjacent text. Cross-device resume therefore
requires an explicit retention and deletion boundary, owner isolation at the
database layer, and a publication receipt that carries no intake content.

## Decision

1. Store one active onboarding draft per owner, its bounded structured answers,
   deterministic candidates, review decisions, and a monotonic draft revision
   in normalized owner-scoped tables. Every owned row carries `user_id`.
2. A draft expires 30 days after last activity. Cancel and successful
   publication purge every answer and candidate containing user content
   immediately. A private PostgreSQL cleanup function deletes expired drafts
   and cascading content once daily at **03:17 UTC** through `pg_cron`.
   Deletion may therefore lag the 30-day expiry by no more than 24 hours.
3. Retain one content-free publication receipt until account deletion. It may
   contain owner, batch/idempotency id, timestamps, resulting goal and memory
   ids, and final collection revisions, but no answer or candidate text.
4. Exposed onboarding tables grant `authenticated` only the reads the approved
   UI needs. Enable RLS and use explicit owner-select policies with
   `(select auth.uid()) = user_id`. Grant no direct authenticated writes.
5. Expose one caller-accessible `SECURITY DEFINER` onboarding function as the
   sole draft and publication write surface. It derives the owner only from
   `auth.uid()`, requires a matching verified FitTip profile, uses an empty
   search path, schema-qualifies every object, uses no dynamic SQL, and accepts
   no caller-supplied owner, provenance, status, author class, or revision id.
6. Revoke function execution from `PUBLIC`, `anon`, `service_role`, and every
   unneeded role; grant it only to `authenticated`. Any internal helper lives
   in an unexposed private schema and grants execution to no API role.
7. Validate each operation-specific payload at the browser, server, and
   database boundary. JSON may carry a bounded typed operation payload but is
   not an unvalidated schema escape hatch.
8. Require the expected onboarding, goal collection, and memory collection
   revisions for publication. Store a server-generated idempotency key on the
   draft and return a typed content-free receipt. A repeated callback returns
   the committed result rather than creating another record.
9. Acquire transaction locks in one canonical order: onboarding, goals, then
   memory. Bound every advisory, row, and statement wait and map exhaustion or
   stale state to the conflict path. Keep the transaction free of network,
   filesystem, provider, or other external work.
10. Publish every accepted candidate and the receipt in one PostgreSQL
    transaction. Any invalid candidate, stale destination, fourth-core
    conflict, rank conflict, or simulated failure rolls the whole selection
    back. Rejected or pending candidates create no destination record.
11. Reuse the accepted goal and memory mutation primitives and their constraints.
    If shared private primitives must be extracted, do so in a forward migration,
    preserve the public `apply_goal_change` and `apply_memory_change` contracts,
    and prove their accepted behavior unchanged. Do not implement weaker
    onboarding-only copies of their rules.
12. Only the trusted onboarding transaction may assign `intake_confirmed`
    provenance. The browser cannot submit or forge provenance, author class,
    confidence, confirmation timestamps, or source references.
13. Confidence qualifies exact system-authored wording. Accepting unchanged may
    retain it. `edit_and_accept` and any later owner content edit clear the
    current confidence while preserving origin provenance and user-confirmation
    history. Apply this change to the memory boundary by forward migration.
14. Keep intake content out of logs, analytics, URLs, browser storage, email,
    error messages, generic audit events, receipts, snapshots, fixtures, and
    external services. Database errors become stable content-free domain errors.
15. Add no service-role client, direct database application connection,
    trigger, view, secret, remote command, AI provider, paid resource, HTTP
    cron call, Edge Function, or external background service. The sole
    background exception is the private in-Postgres expiry cleanup in decision
    2. Its function grants execution to no API role, its named `pg_cron` job is
    scheduled idempotently by migration, and its SQL performs no network work.

## Required evidence

- Exact tables, columns, types, constraints, foreign keys, indexes, grants,
  policies, function owner, security flag, search path, and execute matrix.
- Exact policy count and predicates per table; unfiltered anonymous and
  cross-owner behavioral denial; direct owner writes denied.
- One-active-draft enforcement, owner-scoped resume, 30-day expiry, cancel,
  successful-publication purge, and content-free receipt checks.
- Private cleanup function ownership/search path/execute matrix, one active
  named `03:17 UTC` schedule after repeat scheduling, and expired
  health-adjacent content removed by a direct disposable-database invocation.
- Deterministic mapping, forged provenance rejection, and active-context
  exclusion before publication.
- Atomic mixed-decision publication with goal ordering, fourth-core, stale
  destination, mid-transaction failure, bounded contention, and idempotent retry.
- Regression evidence that ordinary goal and memory mutations retain their
  accepted behavior after any shared-helper refactor.
- A privacy test that fails if bounded synthetic intake markers reach any
  prohibited sink.

## Alternatives considered

### Sequential goal and memory RPC calls from the application

Rejected. They cannot make a cross-model batch atomic and create ambiguous
retry behavior after a partial failure.

### Direct authenticated table writes with RLS

Rejected. RLS isolates owners but does not preserve goal ordering, memory
history/provenance, batch atomicity, or idempotency.

### A service-role server client or direct PostgreSQL connection

Rejected. It adds a credential and a broader bypass boundary when the owner's
existing authenticated database session can support a narrow transaction.

### Browser-only or session-only draft

Rejected. It cannot provide the approved cross-device resume behavior and is
too easy to lose, while browser persistence would place sensitive content
outside the owner-scoped database controls.

### Keep expired, cancelled, or published draft content for audit

Rejected. Destination records already preserve the accepted result and
provenance. A content-free receipt is sufficient for idempotency without
retaining a second copy of sensitive intake.

## Consequences

- M2-03 is a Tier 1 schema, authorization, privacy, and transaction change.
- Publication has one explicit commit point and one content-free result.
- The database work may need a carefully reviewed private-helper refactor of
  accepted goal and memory functions, increasing the regression evidence bar.
- Same-owner context mutations may briefly serialize; different owners do not.
- Draft content has a defined short lifetime, while accepted destination
  history remains governed by M2-01 and M2-02.
- Expired content can remain for up to 24 hours after the 30-day inactivity
  boundary; cleanup is automatic inside PostgreSQL and needs no application,
  credential, or network availability.
- The owner/synthetic founder boundary remains unchanged.

## Approval boundary

The product owner approved this decision with the M2-03 field, UX, safety,
privacy, conflict, and confidence decisions on 2 August 2026. On 3 August
2026, the product owner approved the daily in-Postgres cleanup amendment,
including the maximum 24-hour deletion lag after expiry. It authorizes local
and founder-hosted owner/synthetic implementation only. It does not authorize
production AI, analytics, friends, public registration, commercial use, an
external provider, a remote schema command, network credentials, or spend.
