# ADR-002: M0-02 data and authorization boundary

**Status:** accepted

**Approval:** Product owner approved M0-02 and this required ADR on 23 July 2026

**Date:** 23 July 2026

**Ticket:** [M0-02](../backlog/M0-02-DATA-AUTHORIZATION-FOUNDATION.md)

**Builds on:** [ADR-001](ADR-001-M0-FOUNDATION.md) and [ADR-003](ADR-003-PUBLIC-EMAIL-PASSWORD-AUTH.md)

## Context

ADR-001 selects Supabase PostgreSQL/Auth, server repositories, `user_id` ownership, and RLS. ADR-003 replaces invite-only magic links with public email/password registration, verified email, and a username-backed profile. M0-02 must now establish the exact first migration and server data boundary without implementing registration UI or hosted Auth configuration.

The connected Supabase account contains one active project with unrelated tables, existing rows, no reported migration history, and Security Advisor warnings for permissive access. It is not safe to treat it as an empty FitTip development environment.

Supabase's 2026 platform defaults also make explicit object grants important: new and existing projects may differ in automatic Data API privileges, so the migration must be secure under either configuration.

## Proposed decision

1. Implement and validate M0-02 against the local Supabase stack first. Do not link or migrate a remote project under this approval.
2. Use a dedicated FitTip Supabase development project when remote validation becomes necessary. Reusing the currently connected unrelated project is not recommended.
3. Create only `public.profiles` in M0-02; remove the former invite-table design.
4. Make `profiles.user_id` the one-to-one primary/ownership key referencing `auth.users(id)`.
5. Store one required normalized unique username plus a creation timestamp in the profile.
6. Keep verified email and all password/session/token data in Supabase Auth; do not duplicate them in application tables.
7. Do not automatically create a profile from an `auth.users` trigger. After email confirmation, M0-03 revalidates the candidate username and inserts the profile through the authenticated owner context.
8. Give `authenticated` users only owner-scoped `SELECT` and `INSERT` access. Give `anon` no profile privileges and give ordinary users no `UPDATE` or `DELETE`.
9. Use a publishable-key, user-session server client that remains subject to RLS. M0-02 adds no application secret client.
10. Require the repository to derive identity from verified Auth context and repeat the `user_id` filter on reads/writes.
11. Require direct database isolation/constraint tests with two users in addition to repository tests.
12. Require a separate product-owner gate naming the exact remote project before any remote configuration or migration.

## Alternatives considered

### Reuse the currently connected project

Rejected as the default. It mixes unrelated product data, lacks reported migration history, and has existing security warnings. Table naming alone does not create a clean operational boundary.

### Keep an invite table despite public registration

Rejected. ADR-003 removes the invite gate, so an allowlist would be unused data and an unnecessary privileged repository.

### Duplicate email in `public.profiles`

Rejected. Supabase Auth already owns and verifies the email. A duplicate can drift after an Auth email change and would create unnecessary personal-data handling.

### Store a FitTip password hash

Rejected. Supabase Auth owns password hashing, reset tokens, and credential verification. FitTip must not create a second credential store.

### Create profiles automatically with an `auth.users` trigger

Rejected for the first implementation. Trigger failure can block Auth signup, and candidate username metadata is user-controlled. M0-03 can establish a verified session, validate the username, and create the owner-scoped profile while handling collisions as a recoverable UI state.

### Allow a public profile or username directory

Rejected. FitTip has no approved social/discovery feature. Profiles and usernames remain owner-only.

### Use a secret-key server client for normal profile creation

Rejected. A secret key bypasses RLS and is unnecessary when the confirmed user can insert their own profile under an owner `WITH CHECK` policy.

### Rely only on RLS or only on repository filters

Rejected. RLS protects against server/query scoping bugs, repository filters make ownership explicit, and object grants determine whether a role can reach the table at all.

## Consequences

- Local development requires Docker and a supported Supabase CLI workflow.
- A dedicated remote FitTip project may add cost or account administration and needs separate approval.
- A confirmed Auth identity can temporarily lack a profile until profile completion succeeds.
- Username collisions and invalid candidate metadata must lead to a profile-completion state, not a broken Auth account.
- The initial profile is private and contains only username and creation time.
- Future profile fields and any public display require explicit migrations, policies, and feature approval.
- Direct RLS tests become a permanent regression requirement for every future user-owned table.

## Security and operational safeguards

- Exact target-environment approval before remote action.
- Explicit `REVOKE`/`GRANT` statements and owner-scoped RLS in the migration.
- No `ALL` privileges, invite repository, secret app client, public RPC, view, trigger, definer function, or authorization from user metadata.
- Candidate usernames are revalidated and constrained in PostgreSQL.
- Clean-reset migration validation, pgTAP negative tests, repository tests, and independent review.
- No changes to the unrelated connected project's tables, policies, storage, or data.

## Reversal

Before remote application, local schema and code can be reversed with an ordinary Git revert and local database reset. After a migration reaches an approved remote project, corrections use a new forward migration; applied history is not rewritten.

Changing providers remains possible because the schema is ordinary PostgreSQL and the application depends on repository interfaces. Changing profile creation or exposure requires a new or superseding ADR plus authorization regression tests.

## Approval record

The product owner approved this revised ADR with the M0-02 brief on 23 July 2026. Approval authorizes only the local data/authorization implementation; it does not create, link, or modify a remote Supabase project or enable public registration.
