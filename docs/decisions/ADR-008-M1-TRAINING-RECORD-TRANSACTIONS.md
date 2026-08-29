# ADR-008: M1 training-record transactions and immutable history

**Status:** accepted — subject model removed, transaction idiom still current

**Superseded in part:** M3-11 deleted every table this ADR governs, and F-005
replaced the whole-plan-version model with the rolling plan. What survives is
the *idiom*, and it is still the accepted precedent for a new owner-scoped
write boundary: an owner-derived `SECURITY DEFINER` function with an empty
`search_path`, no service-role credential, no caller-supplied `user_id`, a
composite receipt type, and the `PT409` stale-write conflict transport carried
without retry. `apply_rolling_plan_change_set`, `apply_saved_session_change`,
and M3-15A's completion write all follow it. The immutable-history half of
this ADR does **not** carry forward to completions: see the 29 August 2026
amendment in
[ADR-013](ADR-013-AI-TRAINING-HISTORY-ELIGIBILITY.md#recorded-amendment-to-decisions-2-and-4)
and its matching F-005 amendment.

**Date:** 28 July 2026

**Approval:** The product owner approved F-002 and M1-01, including the
version/current-pointer and stale-write architecture, in chat on 28 July 2026.
The product owner separately approved the reviewed `PT409` conflict transport
and no-retry correction on 28 July 2026.

**Ticket:** [M1-01](../backlog/M1/M1-01-TRAINING-RECORDS-FOUNDATION.md)

**Builds on:** [ADR-001](ADR-001-M0-FOUNDATION.md),
[ADR-002](ADR-002-M0-02-DATA-AUTHORIZATION-BOUNDARY.md), and
[ADR-004](ADR-004-USERNAME-FREE-ACCOUNT-PROFILE.md)

## Context

An accepted plan is a permanent version containing planned-session and
planned-activity snapshots. Creating a replacement version, its children, and
the owner's current-version pointer must be atomic. A sequence of ordinary
Data API inserts cannot provide that guarantee, and a stale browser must not
replace a newer current plan.

The application must continue using the owner's publishable-key session. It
must not introduce a service-role credential or trust a caller-supplied
`user_id`.

## Decision

1. Store immutable accepted versions in `detailed_plan_versions`, with
   immutable children in `planned_sessions` and `planned_activities`.
2. Store the mutable owner current pointer and monotonic revision in
   `detailed_plan_heads`. Earlier accepted versions remain queryable.
3. Give authenticated users owner-scoped `SELECT` access to immutable records,
   but no direct `INSERT`, `UPDATE`, or `DELETE` privileges on them.
4. Create one `public.save_manual_plan_version` PostgreSQL function for the
   atomic write. It is `SECURITY DEFINER` because direct immutable-table writes
   are revoked.
5. Harden that function by:
   - revoking execution from `PUBLIC` and `anon`;
   - granting execution only to `authenticated`;
   - setting an empty `search_path` and schema-qualifying every object;
   - deriving the owner only from `auth.uid()` and accepting no `user_id`;
   - checking that the owner has a FitTip profile;
   - validating the complete plan payload and all same-owner references;
   - taking a per-owner transaction advisory lock;
   - requiring the caller's expected current revision and rejecting stale
     writes with custom SQLSTATE `PT409`, which PostgREST exposes as HTTP 409
     with error code `PT409`.
6. Keep RLS enabled on every exposed table even where object privileges make
   the table read-only. Policies repeat the explicit `auth.uid() = user_id`
   ownership predicate.
7. Allow owner-scoped CRUD on `personal_activities`. Referenced definitions may
   be archived; foreign keys prevent deleting a referenced definition.
8. Store planned and completed activity snapshots separately from editable
   personal definitions. Completion tables are created in M1-01, but their
   authenticated write transaction is deferred to M1-03.
9. Use explicit `user_id` on every owned record plus same-owner composite
   foreign keys. No ownership decision uses user-editable Auth metadata.
10. The server repository calls `.retry(false)` only on
    `save_manual_plan_version`, maps only `PT409` to the explicit plan-conflict
    result, and treats every other database error as a generic persistence
    failure.

## Alternatives considered

### Client-side multi-step writes

Rejected. A failure between inserting a version, inserting children, and
updating the current pointer can expose partial accepted history.

### Direct writes plus a trigger-maintained current pointer

Rejected. It gives a broader table-write surface and makes the accepted-plan
operation less explicit. A narrowly granted function is easier to validate as
one product action.

### Service-role server client

Rejected. It bypasses RLS and introduces a high-impact application secret for
an operation that can remain authenticated-user scoped.

### Overwrite the current plan

Rejected. It destroys accepted history and breaks planned-versus-actual
traceability.

### PostgreSQL serialization-failure SQLSTATE `40001`

Rejected for this application conflict. PostgREST maps the `40*` class to an
HTTP 500 response, so a deliberate stale-write result is not transported as a
client conflict. The explicit `PT409` code preserves rollback semantics while
making the HTTP and application error contract unambiguous.

## Consequences

- Every save sends the currently observed revision. A stale save fails without
  creating an orphan version or moving the current pointer, and the Data API
  returns one prompt HTTP 409 / `PT409` response without client retry.
- M1-02 can use one repository operation for explicit **Save plan**.
- Direct Data API clients cannot mutate accepted plan history.
- The security-definer function requires permanent focused regression tests
  for grants, Auth-derived ownership, payload validation, cross-user
  references, atomicity, and stale writes.
- Completion write/correction behavior remains separately gated by M1-03.

## Reversal

Before any approved remote application, an ordinary Git revert and local
database reset can remove the schema. After application, corrections use a new
forward migration. A later ADR may replace the RPC with another atomic
transaction boundary, but it must preserve immutable versions, Auth-derived
ownership, RLS, same-owner references, and stale-write protection.
