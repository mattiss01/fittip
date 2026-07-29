# ADR-009: M2 goal-mutation transaction boundary

**Status:** accepted

**Date:** 29 July 2026

**Approval:** The product owner approved the recommended M2-01 atomic
goal-mutation function in chat on 29 July 2026.

**Ticket:** [M2-01](../backlog/M2/M2-01-GOAL-MODEL-VALIDATION.md)

**Builds on:** [ADR-002](ADR-002-M0-02-DATA-AUTHORIZATION-BOUNDARY.md),
[ADR-004](ADR-004-USERNAME-FREE-ACCOUNT-PROFILE.md), and
[ADR-008](ADR-008-M1-TRAINING-RECORD-TRANSACTIONS.md)

## Context

M2-01 requires every committed active goal ordering to be contiguous within
its core or supporting tier. The user must never have more than three active
core goals, and create, reorder, tier, lifecycle, archive, eligible-delete, and
terminal-state-reopen operations must be atomic and reject stale concurrent
writes.

A core rank constrained to `1..3` plus an owner/tier unique index can enforce
the three-core maximum, but ordinary Supabase Data API table calls cannot lock
one owner and update a collection of goal rows as one product operation.
PostgreSQL row checks cannot enforce collection-wide contiguity, and direct
multi-row table access would let callers bypass the domain transition.

FitTip already uses the owner's publishable-key session, explicit RLS, and the
narrowly granted transaction pattern accepted in ADR-008. M2-01 must not add a
service-role credential, a direct database connection, caller-controlled
ownership, or a broader privileged application boundary.

## Decision

1. Store normalized owner-scoped goals in `goals`.
2. Store one monotonic collection revision per owner in `goal_collections`.
3. Store the minimum immutable evidence required for explicit terminal-state
   reopening in `goal_lifecycle_events`.
4. Create one `public.apply_goal_change` PostgreSQL function as the only
   authenticated goal-write surface.
5. Support the approved operations through the function:
   - create;
   - edit;
   - reorder;
   - pause;
   - resume;
   - achieve;
   - abandon;
   - reopen;
   - archive; and
   - delete when the goal has never been referenced and has no retained
     lifecycle history that requires preservation.
6. Accept no `user_id`, email, user metadata, arbitrary SQL-shaped object, or
   unbounded payload. Inputs are the expected collection revision, operation,
   optional goal id, typed bounded goal fields, optional target tier/rank, and
   an ordered goal-id array only for explicit reorder.
7. Return only a typed, content-safe receipt containing the affected goal id,
   resulting collection revision, and safe result category.
8. Make the function `SECURITY DEFINER` because direct authenticated writes to
   the owned tables are revoked. Harden it by:
   - requiring `auth.uid()` and a matching FitTip profile;
   - deriving the owner only from `auth.uid()`;
   - using an empty `search_path` and schema-qualifying every object;
   - using no dynamic SQL;
   - explicitly constraining every read and mutation by the derived owner;
   - revoking execution from `PUBLIC`, `anon`, and other unneeded roles; and
   - granting execution only to `authenticated`.
9. Keep RLS enabled on every exposed table. Allow authenticated users only the
   owner-scoped reads required by the approved UI. Policies retain explicit
   `(select auth.uid()) = user_id` predicates even where object privileges make
   tables read-only.
10. Take one namespaced per-owner transaction advisory lock before reading or
    changing collection state.
11. Require the expected collection revision for every mutation. Reject a
    mismatch with the established custom SQLSTATE `PT409`, which the repository
    maps to the explicit goal-conflict result without automatic retry.
12. Validate the complete operation and every referenced id as same-owner,
    enforce lifecycle and hard-delete eligibility, produce complete contiguous
    core and supporting orderings, and increment the collection revision
    exactly once in the same transaction.
13. Constrain active core rank to `1..3`. Use database constraints and indexes
    for bounded scalar values, ownership access paths, and committed
    owner/tier/rank uniqueness. Inactive and archived goals have no active
    rank.
14. Use foreign keys with restrictive delete behavior for future goal
    references. Archive remains the normal removal path; the function alone
    decides whether hard deletion is currently eligible.
15. The application repository calls only this function for mutations,
    disables automatic retry for it, maps only the deliberate `PT409` conflict,
    and treats other database errors as generic safe failures.

## Required security and concurrency evidence

- Exact function owner, `SECURITY DEFINER` flag, empty search path, and execute
  grants.
- Direct authenticated table mutations denied, including owner mutations.
- Authenticated owner reads work; anonymous and cross-user reads and writes
  are denied.
- Caller-controlled ownership, user metadata authorization, dynamic SQL, and
  service-role use are absent.
- Core and supporting active ranks are contiguous after every operation.
- Two concurrent attempts to create the third core goal produce exactly one
  success and one `PT409`, with no partial state.
- Concurrent reorder and lifecycle changes from the same revision produce one
  success and one content-safe stale conflict.
- Stale create, edit, archive, delete, and reopen attempts leave goals,
  lifecycle evidence, and collection revision unchanged.
- Cross-user goal ids and reorder arrays fail without revealing the other
  user's content.
- Fourth-core create, promotion, resume, and reopen fail safely.
- Reopen creates the approved minimal lifecycle evidence.
- Hard delete succeeds only for a never-referenced eligible goal; otherwise
  the goal remains available for archive.
- Clean reset, generated types, database tests, simultaneous Data API tests,
  lint/advisors, repository tests, application gates, and the hosted mobile
  flow validate the boundary.

## Alternatives considered

### Direct Data API table writes with constraints

Rejected. Constraints can cap the three active core slots but cannot make all
multi-row reorder and lifecycle transitions atomic, gap-free, and protected by
one collection-wide stale revision.

### `SECURITY INVOKER` function

Rejected as the exclusive write boundary. If direct table writes remain
revoked, the invoker cannot mutate. If they are granted, callers can bypass
the function and create invalid collection transitions. Adding a trigger or
privileged helper recreates the gated boundary less explicitly.

### Single-row JSON goal aggregate

Rejected. It weakens stable goal identities, relational references,
constraints, indexes, audit evidence, archive/delete protection, and generated
types. Combining a normalized table with a separate aggregate reintroduces the
cross-table transaction requirement.

### Direct PostgreSQL application connection

Rejected. It adds a new credential, role, pool/connection lifecycle, Vercel
configuration, and broader authorization surface. The approved function works
through the existing authenticated publishable-key session.

### Service-role application client

Rejected. It bypasses RLS and introduces a high-impact secret for a mutation
that can remain scoped to the authenticated owner.

## Consequences

- All goal mutations become explicit collection operations rather than direct
  row writes.
- The smallest privileged code surface is one reviewed PostgreSQL function;
  every privileged query repeats explicit ownership checks.
- Same-owner goal mutations serialize for a short transaction. Different
  owners do not share the advisory lock.
- Clients must refresh on `PT409`; they never silently overwrite a newer goal
  collection.
- The function and its grants require permanent focused regression tests and
  an explicit database-advisor disposition.
- This ADR creates no new credential, network connection, external service,
  remote resource, or spend.

## Reversal

Before any approved remote application, an ordinary Git revert and clean local
database reset can remove the schema. After application, corrections use a new
forward migration. A later ADR may replace the function, but it must preserve
Auth-derived ownership, RLS, revoked direct writes, the three-core invariant,
atomic contiguous ordering, lifecycle evidence, and stale-write protection.

## Approval boundary

This ADR approves only the M2-01 goal-mutation transaction described above for
owner/synthetic local and founder-hosted use. It does not approve M2-02,
M2-03, AI processing, analytics, public registration, friends, commercial use,
a service-role client, a direct database connection, or another privileged
function.
