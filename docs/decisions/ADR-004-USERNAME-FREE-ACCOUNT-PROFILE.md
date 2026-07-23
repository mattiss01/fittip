# ADR-004: Username-free account profile

**Status:** accepted

**Date:** 23 July 2026

**Approval:** Product owner approved removing usernames and deferring an optional display name

**Supersedes:** The username-specific clauses of [ADR-003](ADR-003-PUBLIC-EMAIL-PASSWORD-AUTH.md) and [ADR-002](ADR-002-M0-02-DATA-AUTHORIZATION-BOUNDARY.md)

## Context

FitTip currently has no social, sharing, public-profile, or username-login feature. Email already identifies the account for authentication, while the immutable Supabase Auth user id owns application data. A globally unique username therefore adds signup friction, collision handling, and a public-style identity without serving an approved v1 user need.

M0-02 created the username-backed local profile baseline, but no migration has been linked or applied to a hosted Supabase project. The product owner approved correcting this local-only foundation before M0-03 begins.

## Decision

- Continue using email and password for authentication and the verified Auth `user_id` for ownership.
- Remove `username` from `public.profiles`, account creation, Auth metadata, repository contracts, validation, and error handling.
- Keep `public.profiles` as the minimal FitTip-owned account record with only:
  - `user_id uuid` as primary key and foreign key to `auth.users(id)` with cascade delete;
  - `created_at timestamptz not null default now()`.
- Preserve explicit authenticated `SELECT` and `INSERT` grants, owner-only RLS, verified server identity, and cross-user isolation tests.
- After email confirmation, M0-03 may create the current user's profile without asking for additional profile data.
- Defer any human-readable name to a later approved feature. If needed, prefer an optional, non-unique display name rather than a global username.
- Keep the F-001 password minimum at the product-owner-selected eight characters.

Because the existing migration has never been applied to a remote environment, the correction may amend the local baseline migration instead of preserving an obsolete create-then-drop sequence. Git history, this ADR, the correction ticket, and renewed validation provide the permanent change record. Once any migration is applied remotely, all later changes must use forward migrations.

## Consequences

- Account creation becomes shorter and has no username collision state.
- Email remains private Auth data and is not copied into `public.profiles`.
- The profile row remains a stable FitTip application identity and future extension point.
- M0-02 requires a focused schema, repository, generated-type, test, and documentation correction before M0-03 can be approved for implementation.
- No public handle or display name exists until a later feature is approved.

## Reversal

A later feature can add an optional display name or, if a real social requirement emerges, propose a unique handle with explicit privacy, moderation, rename, and collision rules. It must not silently reuse Auth metadata for authorization.
