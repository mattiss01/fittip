# ADR-002: M0-02 data and authorization boundary

**Status:** draft — product-owner approval required

**Date:** 22 July 2026

**Ticket:** [M0-02](../backlog/M0-02-DATA-AUTHORIZATION-FOUNDATION.md)

**Builds on:** [ADR-001](ADR-001-M0-FOUNDATION.md)

## Context

ADR-001 selects Supabase PostgreSQL/Auth, server repositories, `user_id` ownership, and RLS. M0-02 must turn those principles into an exact first migration and application boundary without implementing the M0-03 sign-in experience.

The connected Supabase account currently contains one active project with unrelated tables, existing rows, no reported migration history, and Security Advisor warnings for permissive access. It is not safe to assume that project is an empty FitTip development environment.

Supabase's 2026 platform changes also make explicit object grants important: new projects no longer safely support the assumption that every new `public` table is automatically exposed, while older projects may still carry broad default privileges. The migration must behave safely in either configuration.

## Proposed decision

1. Implement and validate M0-02 against the local Supabase stack first. Do not link or migrate a remote project under this approval.
2. Use a dedicated FitTip Supabase development project when remote validation becomes necessary. Reusing the currently connected unrelated project is not recommended.
3. Create only `public.profiles` and `public.invites` in M0-02.
4. Make `profiles.user_id` the one-to-one primary/ownership key referencing `auth.users(id)`.
5. Treat invites as system-owned pre-account access-control records. Store normalized email, active/revoked state, optional admin note, and timestamps; do not add a meaningless pre-account `user_id`.
6. Keep both tables behind explicit grants and RLS:
   - ordinary authenticated access can only select its own profile;
   - anonymous access has no table privileges;
   - invite data has no ordinary client privileges or policies;
   - the secret server role has only the narrow privileges required for invite checks and later profile provisioning.
7. Use two server boundaries:
   - a publishable-key, user-session client for user-scoped profile access that remains subject to RLS;
   - a guarded secret-key client exposed only through the invite/provisioning repository.
8. Do not create an Auth trigger that automatically creates a profile. M0-03 must explicitly coordinate invite verification, identity acceptance, and profile provisioning.
9. Require direct database isolation tests with two users in addition to repository tests.
10. Require a separate product-owner gate naming the exact remote project before any remote configuration or migration.

## Alternatives considered

### Reuse the currently connected project

Rejected as the default. It mixes unrelated product data, lacks a reported migration history, and has existing security warnings. Isolation by table naming alone would not provide a clean operational or review boundary.

### Put invite data in an unexposed custom schema

Deferred. This is a strong database-internal boundary, but the accepted application architecture uses the Supabase server client/Data API. Querying an unexposed schema would require a direct database driver or a privileged function, adding a second access path or a `SECURITY DEFINER` surface before either is needed. Explicit table grants, no client policy, and a server-only secret repository provide a smaller first boundary.

### Expose invite eligibility through a public RPC

Rejected for M0-02. Even a boolean RPC creates an enumeration and abuse surface and would require careful function privileges or definer behavior. M0-03 can call a private server repository before requesting a magic link.

### Create profiles automatically with an `auth.users` trigger

Rejected for M0-02. A trigger would create a FitTip profile for any Auth identity, potentially before the invite gate has been enforced. The provisioning transaction belongs with the approved M0-03 authentication design.

### Let authenticated users create and edit their own empty profile

Rejected for M0-02. There are no approved editable profile fields, and self-insert could turn an unintended Auth identity into a FitTip account. The least-privilege starting point is owner read only.

### Rely only on RLS or only on repository filters

Rejected. RLS protects against a server/query scoping bug, while explicit server filters make the intended ownership boundary visible and improve query planning. Object grants separately determine whether a role may reach the table at all.

## Consequences

- Local development requires Docker and a supported Supabase CLI workflow.
- A dedicated remote FitTip project may add cost or account administration later and therefore needs separate approval.
- M0-03 will need a narrowly scoped secret-key operation to check invites and provision a profile; that key can bypass RLS and must never reach a browser.
- The first profile is intentionally empty and read-only to ordinary authenticated users.
- Invite rows do not have `user_id` until a later approved design links them to an accepted identity, because they exist before a user account.
- Future write access is added by explicit migrations and policies instead of broad grants now.
- Direct RLS tests become a permanent regression requirement for every future user-owned table.

## Security and operational safeguards

- Exact target-environment approval before any remote action.
- Explicit `REVOKE`/`GRANT` statements and RLS policies in the migration.
- No `ALL` privileges, public RPC, view, definer function, or authorization from user metadata.
- Modern publishable/secret key naming; secrets have no `NEXT_PUBLIC_` prefix.
- Clean-reset migration validation, pgTAP negative tests, repository tests, and independent review.
- No changes to the unrelated connected project's tables, policies, storage, or data.

## Reversal

Before remote application, local schema and code can be reversed with an ordinary Git revert and local database reset. After a migration reaches an approved remote project, corrections use a new forward migration; applied migration history is not rewritten.

Changing providers later remains possible because the schema is ordinary PostgreSQL and the application depends on repository interfaces. Changing the remote environment or data-access strategy requires a new or superseding ADR plus authorization regression tests.

## Approval requested

Approve this ADR with the M0-02 brief. Approval authorizes the local implementation boundary described here; it does not create, link, or modify any remote Supabase project.
