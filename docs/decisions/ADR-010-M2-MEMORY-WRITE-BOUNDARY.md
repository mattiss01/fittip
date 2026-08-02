# ADR-010: M2 memory write boundary

**Status:** proposed — records the direction the product owner approved in
principle on 1 August 2026 when M2-02 was dispatched; awaiting confirmation
with M2-02 acceptance

**Date:** 1 August 2026

**Ticket:** [M2-02](../backlog/M2/M2-02-MEMORY-MODEL-MANAGEMENT.md)

**Builds on:** [ADR-002](ADR-002-M0-02-DATA-AUTHORIZATION-BOUNDARY.md),
[ADR-008](ADR-008-M1-TRAINING-RECORD-TRANSACTIONS.md), and
[ADR-009](ADR-009-M2-GOAL-MUTATION-TRANSACTION.md)

## Context

M2-02 stores what FitTip is allowed to believe about a person: facts,
constraints, preferences, and proposed observed patterns. The content is
free text the owner writes, so it may carry pain, illness, injury, recovery,
or other health-adjacent detail.

Three requirements decide the boundary.

Editing must append a content revision and move a current pointer rather than
overwrite text in place, and a partial revision must never be visible. A
single mutable row cannot satisfy that, and two ordinary Data API writes
cannot make the new revision and the moved pointer one atomic change.

Permanent deletion must purge the current content and **every** content-bearing
revision in one transaction, leaving only evidence that carries no content.
Version history must not become a way to defeat deletion.

Status, provenance, and author class decide whether coaching may use an item.
A user must be able to edit and accept content through a controlled operation
without being able to forge system-inferred provenance, and no caller may
supply an owner.

ADR-009 established the pattern that fits: one narrowly granted
`SECURITY DEFINER` function over owner-scoped tables whose direct writes are
revoked, reached through the owner's existing publishable-key session. Its
independent review also found a real defect to avoid. `apply_goal_change`
takes `pg_advisory_xact_lock` with no timeout, so a second same-owner mutation
can wait unbounded; the server action never returns and the user is left
looking at a form that silently did nothing.

## Decision

1. Store per-owner optimistic concurrency in `memory_collections`, one
   monotonic revision per owner.
2. Store identity, status, provenance, confidence, source reference, review
   date, and the current revision pointer in `memory_items`. The item row
   holds **no memory text**.
3. Store every copy of the owner's text in append-only `memory_revisions`.
   Each revision records its content, author class (`user` or `system`),
   provenance, change kind, resulting status, server timestamp, and the
   immediately prior revision.
4. Store content-free deletion evidence in `memory_deletion_events`: owner,
   the deleted item id, its class, how many revisions were purged, the
   collection revision, and when. No text, ever.
5. Create one `public.apply_memory_change` function as the only authenticated
   memory-write surface. It supports create, edit, accept, edit-and-accept,
   reject, disable, enable, renew, and delete.
6. Accept no `user_id`, provenance, author class, status, confidence, source
   reference, revision id, email, user metadata, dynamic SQL, or unbounded
   payload. Inputs are the expected collection revision, the operation, an
   optional item id, an optional memory class, optional bounded content, and
   an optional review date. Every operation declares exactly which of those it
   accepts and rejects anything else.
7. Derive status, provenance, author class, and revision numbering inside the
   function. A user-created item is `user_created` and authored by `user`. An
   `observed_pattern` starts `proposed` whoever creates it, because a reading
   of behaviour is fallible and needs an explicit acceptance. Accepting keeps
   the item's origin provenance and the accepted revision's own provenance,
   and records the confirmation separately in `user_confirmed_at`.
8. Return a typed receipt of item id, resulting collection revision, resulting
   revision number, and a safe result category. **The receipt carries no
   memory content.**
9. Make the function `SECURITY DEFINER` because direct authenticated writes to
   the owned tables are revoked. Harden it exactly as ADR-009 does: require
   `auth.uid()` and a matching profile, derive the owner only from
   `auth.uid()`, use an empty `search_path` with every object schema-qualified,
   use no dynamic SQL, constrain every read and mutation by the derived owner,
   revoke execution from `PUBLIC`, `anon`, and `service_role`, and grant it
   only to `authenticated`.
10. Keep RLS enabled on all four tables with exactly one owner
    `(select auth.uid()) = user_id` select policy each, targeted at
    `authenticated`. Authenticated object privileges are `SELECT` only.
11. **Bound every lock wait.** Set `lock_timeout` locally before taking the
    per-owner advisory lock and map `lock_not_available` to the `PT409`
    conflict. A contended save answers the caller with a conflict it can act
    on; it never hangs. This is the correction to ADR-009's decision 10, and
    it applies to every lock this transaction takes, not only the advisory
    one.
12. Require the expected collection revision for every mutation and reject a
    mismatch with `PT409`. The repository maps `PT409` to an explicit conflict
    and disables automatic retry, so a change the user was told to review is
    never silently re-run.
13. Make expiry a review date that excludes an item from active context and
    marks it review-due. Expiry never archives, converts, or deletes anything;
    only the owner does, through renew, edit, or disable.
14. Purge on permanent delete: delete every revision of the item, delete the
    item, and insert the content-free deletion event, all in one transaction.
    Cross-table references are owner-scoped composite keys, deferred only so
    far as one transaction needs to write a first revision with its item, and
    to purge revisions ahead of their item.
15. Keep memory content out of logs, analytics, monitoring, error messages,
    receipts, and generic audit events. A database error message is never
    forwarded to the caller; the repository raises its own generic failure.

## Required security and concurrency evidence

- Exact function owner, `SECURITY DEFINER` flag, empty search path, absence of
  dynamic SQL, and execute grants.
- Direct authenticated table writes denied, including the owner's own, for
  items, revisions, and deletion evidence.
- Each policy asserted by name, command, target roles, and exact predicate,
  with an exact policy count per table, so a later permissive predicate cannot
  leave the suite green.
- Anonymous and cross-user reads and mutations denied, proved by unfiltered
  owner-scoped counts rather than by a query that masks RLS with its own
  `where user_id = ...`.
- A concurrent same-owner mutation receives a bounded conflict, not an
  unbounded wait.
- Editing appends a revision, moves the pointer, and leaves the prior text
  readable.
- Accepting and edit-and-accept preserve the origin provenance while recording
  user confirmation, and a declined proposal cannot be switched on as fact.
- Permanent deletion leaves no content in any revision and no content in the
  deletion evidence.
- Memory content is absent from logs, analytics, error messages, and receipts.

## Alternatives considered

### One mutable row per memory item

Rejected. It cannot show the owner what changed, it overwrites the text the
ticket requires to stay inspectable, and it makes "purge every content-bearing
version" meaningless because there is only ever one.

### Content on the item row, history in a side table

Rejected. It puts the same sensitive text in two places with two different
lifecycles, and a permanent delete then has to remember both. Keeping every
copy in one append-only table makes the purge a single statement whose
completeness a test can assert directly.

### Revisions for content only, status changes elsewhere

Rejected for M2-02. A second history table doubles the surface a reviewer must
check and splits the answer to "what happened to this item, in order" across
two places. The accepted cost is that a status-only change copies the current
text into its revision; every copy stays owner-scoped and is purged together.

### `SECURITY INVOKER` function, or direct Data API writes with constraints

Rejected, for the reasons ADR-009 records. Constraints cannot make the new
revision and the moved current pointer one atomic change, and granting direct
writes would let a caller author a revision claiming `system` provenance.

### Unbounded advisory lock, as in ADR-009

Rejected. It is the defect M2-01's review found. A bounded wait costs one
setting and turns a silent hang into an honest conflict.

### A trigger, view, second RPC, service-role client, or direct database
connection

Rejected. None is needed. Each adds a privileged surface or a credential for
behaviour the single reviewed function already provides through the owner's
existing session.

## Consequences

- All memory mutations become explicit owner-scoped operations. There is no
  direct row write, from any role reachable by the application.
- The privileged code surface is one reviewed PostgreSQL function.
- Same-owner memory mutations serialize for a short, bounded transaction.
  Different owners never share the lock. A contended save reports a conflict
  within the timeout instead of waiting.
- Clients must reload on `PT409`; they never overwrite a newer collection.
- A status-only change stores another copy of the item's current text. This is
  deliberate and is purged with the rest on permanent delete.
- `apply_memory_change` becomes the fourth `.retry(false)` call site, which the
  server-boundary invariant records deliberately.
- This ADR creates no credential, network connection, external service, AI
  provider call, remote resource, or spend.

## Reversal

Before any approved remote application, an ordinary Git revert and a clean
local database reset remove the schema. After application, corrections use a
new forward migration. A later ADR may replace the function, but it must
preserve Auth-derived ownership, RLS with explicit owner predicates, revoked
direct writes, append-only inspectable history, complete content purge on
permanent delete, unforgeable provenance, bounded lock waits, and stale-write
protection.

## Approval boundary

This ADR approves only the M2-02 memory write boundary described above, for
owner and synthetic data in local and founder-hosted use. It does not approve
M2-03 onboarding, AI extraction or transfer, analytics, a raw-chat store, a
global activity catalog, public registration, commercial use, a service-role
client, a direct database connection, or another privileged function. Sending
memory content to an AI provider stays prohibited until the separate consent
and privacy gates recorded in M2-02 are approved, implemented, and accepted.
