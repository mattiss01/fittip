# M0-02: Data and authorization foundation

**Status:** approved — local implementation may begin

**Approved by:** product owner, 23 July 2026

**Milestone:** M0

**Priority:** P0

**Depends on:** [M0-01 accepted](M0-01-REPOSITORY-TOOLING-BASELINE.md), [ADR-001](../decisions/ADR-001-M0-FOUNDATION.md), [ADR-003](../decisions/ADR-003-PUBLIC-EMAIL-PASSWORD-AUTH.md)

**Architecture decision:** [ADR-002 draft](../decisions/ADR-002-M0-02-DATA-AUTHORIZATION-BOUNDARY.md)

**Blocks:** [M0-03 / F-001](../product/F-001-PUBLIC-ACCOUNT-AUTHENTICATION.md), M0-04, M0-05

**Owner:** one builder after approval; one independent reviewer before acceptance

## Outcome

Establish a production-shaped but locally testable Supabase data boundary for FitTip's public email/password account flow. The result gives M0-03 a safe owner-scoped profile table, explicit database privileges, Row Level Security (RLS), a server-only repository boundary, and repeatable cross-user isolation tests.

This ticket creates no registration or sign-in screen and changes no hosted Auth settings. It proves the data and authorization foundation before public account behavior is implemented.

## Approval and environment gates

Approval of this brief and ADR-002 authorizes implementation against the local Supabase development stack only.

It does **not** authorize:

- creating a paid or billable Supabase project;
- linking the repository to a remote Supabase project;
- applying a migration to an existing shared or production database;
- enabling public registration or changing Auth/email/redirect/Data API settings in a remote project;
- configuring an external SMTP or CAPTCHA provider;
- copying existing data into FitTip.

Before any remote change, the product owner must identify the exact target environment and approve it in writing. The recommended target remains a dedicated FitTip development project.

## Current-state review — 23 July 2026

### Repository

- M0-01 is accepted and provides Next.js, strict TypeScript, lint, format, Vitest, and production-build commands.
- The repository contains no `supabase/` directory, migrations, database types, Supabase dependencies, or committed environment template.
- No application feature currently reads or writes persistent data.
- ADR-003 has replaced the previous invite-only direction with public email/password registration and verified email.

### Connected Supabase account

A read-only review found one active Supabase project in the connected account. It is not a clean FitTip target:

- it contains six unrelated `public` tables with existing rows;
- it has no migrations reported through the project migration history;
- its Security Advisor reports several permissive policies that allow unrestricted anonymous writes, plus a public storage-listing warning.

M0-02 must not alter, clean up, import from, or reuse that project without a separate product-owner decision. Those tables and warnings belong to the other application using that project.

### Current platform behavior relevant to this ticket

- New Supabase projects require deliberate Data API privileges. M0-02 records grants in the same migration as RLS and does not rely on project defaults.
- FitTip uses a publishable key for user-scoped access. M0-02 requires no application secret key because invite administration has been removed.
- Supabase Auth owns email identities, password hashes, confirmation/reset tokens, and sessions. The FitTip profile table does not duplicate them.
- Authentication alone is not authorization. Object privileges, RLS, and server repository filters are tested independently.

## Approved foundation decisions this ticket applies

M0-02 applies rather than reopens these accepted choices:

- Supabase PostgreSQL and Supabase Auth;
- public email/password registration with email confirmation;
- email as login identity and username as profile data;
- `user_id` on every user-owned record;
- RLS plus independent server-side ownership scoping;
- database access behind server repositories;
- no service/secret credential in browser code;
- no authorization based on username, email, or user-editable metadata.

The product owner still needs to approve the exact profile schema, privileges, repository boundary, and local-first environment approach in this brief and ADR-002.

## Scope

### 1. Local Supabase baseline

- Add the Supabase CLI as an exact-pinned development dependency using its supported local-development workflow.
- Initialize versioned local configuration under `supabase/`.
- Document Docker/local prerequisites and the commands to start, stop, reset, lint, test, and generate TypeScript types.
- Configure local Auth behavior needed for later password/confirmation testing, without changing a remote project.
- Add an environment example containing names and safe descriptions only—never real values.
- Verify a clean database reset applies every committed migration from zero.

The builder must review the current official Supabase changelog, CLI help, password-auth, SSR Auth, RLS, Data API, and database-testing guidance immediately before implementation. If current behavior conflicts with the approved brief, stop and return the conflict to the lead agent.

### 2. Minimal profile schema

Create one forward migration through `supabase migration new`. Do not invent an applied migration timestamp and do not edit a migration after it reaches an approved remote environment.

#### `public.profiles`

Purpose: the minimal user-owned FitTip profile completed after email confirmation.

| Column | Type | Rules |
|---|---|---|
| `user_id` | `uuid` | Primary key; not null; references `auth.users(id)`; delete cascades with the Auth identity |
| `username` | `text` | Not null; unique; normalized lowercase; 3–30 characters; begins with a letter; remaining characters are lowercase letters, numbers, or underscore |
| `created_at` | `timestamptz` | Not null; defaults to `now()` |

Rules:

- `user_id` is both identity reference and ownership key; no second profile id is created.
- Email is not copied into this table. The verified email remains in Supabase Auth.
- Passwords, password hashes, confirmation tokens, reset tokens, and sessions never enter this table.
- Username is profile data, not an Auth or authorization claim.
- Database constraints independently enforce the approved username form; client/server validation alone is insufficient.
- No automatic `auth.users` trigger creates a profile. M0-03 creates the profile after verified sign-in and revalidates any candidate username from untrusted Auth metadata.
- An unconfirmed or abandoned Auth identity may temporarily have no profile and receives no protected FitTip data.
- No invite table or allowlist data is created.
- No consent, deletion request, analytics, AI request, training, memory, goal, activity, or audit-event table is created.

### 3. Explicit privileges and RLS

The migration must revoke broad/default access on `public.profiles` before granting the minimum required privileges.

- Enable RLS.
- `anon`: no table privileges and no policy.
- `authenticated`: `SELECT` and `INSERT`; no `UPDATE` or `DELETE`.
- Owner-select policy: `TO authenticated`, explicit non-null authenticated user check, and `(select auth.uid()) = user_id`.
- Owner-insert policy: `TO authenticated` with `WITH CHECK ((select auth.uid()) = user_id)`.
- No policy makes usernames or profiles public.
- No application grant is required for a secret/service role in this ticket.

The profile repository must also filter by the verified current user id. RLS is the database backstop, not a substitute for server-side scoping.

#### General database requirements

- Use lowercase `snake_case`, named constraints, `timestamptz`, and explicit `NOT NULL`.
- Do not add a duplicate `user_id` index because the primary key already supplies it.
- The unique username constraint/index must operate on the same normalized value enforced by the check constraint.
- Do not create a view, RPC, trigger, `SECURITY DEFINER` function, custom Postgres role, or exposed custom schema.
- Do not use `auth.jwt()->'user_metadata'`, email, or username for authorization.
- Do not grant `ALL` to any application role.

### 4. Server-only database boundary

Add a small, typed boundary with no UI consumer yet:

- a user-scoped server Supabase client using the publishable key and request session;
- a profile repository that resolves the verified current identity and never trusts a caller-supplied ownership id;
- repository operations to get the current profile and create it for the current user;
- generated database types from the committed local schema;
- environment validation that fails clearly when a required value is absent.

Suggested paths:

```text
supabase/
  config.toml
  migrations/<generated>_m0_02_data_authorization_foundation.sql
  tests/database/m0_02_authorization.test.sql
src/lib/supabase/
  database.types.ts
  env.ts
  server-user-client.ts
src/server/repositories/
  profile-repository.ts
```

Required boundary rules:

- Server code obtains identity through verified Auth claims/session handling, not form fields.
- Browser components must not import a database repository.
- Profile creation sets `user_id` from the verified identity and does not accept caller-supplied ownership.
- Candidate usernames are normalized and validated again at the server/database boundary.
- Repository results expose only approved profile fields.
- Logs and errors must not contain passwords, API keys, Auth tokens, raw connection strings, or raw provider responses.
- M0-02 must not add a page, endpoint, Server Action, middleware rule, signup call, confirmation callback, password reset, or protected-route UI.

### 5. Documentation

Update repository documentation with:

- exact local setup and verification commands;
- environment-variable names and browser/server visibility;
- migration creation and forward-only correction rules;
- database-type generation;
- direct RLS-test instructions;
- local Auth/email-capture notes needed by M0-03;
- the remote-project approval warning;
- exact package and CLI versions selected by the builder.

## Non-goals

- No create-account, email-confirmation, sign-in, password-reset, sign-out, callback, session middleware, or protected route; those belong to M0-03.
- No invite allowlist, invite repository, secret client, invitation email, or administrator UI.
- No remote Supabase project creation or migration.
- No external SMTP or CAPTCHA integration.
- No public exposure of profiles or usernames.
- No consent/withdrawal schema; that belongs to M0-04.
- No deletion request, retention, analytics, AI telemetry, rate limiting, or AI provider call.
- No goal, memory, plan, activity, log, conversation, proposal, or training data.
- No Vercel environment setup, CI, preview deployment, or hosted smoke test; those belong to M0-06 unless separately approved.
- No cleanup or repair of the unrelated connected Supabase project.

## Acceptance criteria

1. A new contributor can start the local Supabase stack from the documented prerequisites.
2. `supabase db reset` succeeds from a clean state using only committed configuration and migrations.
3. The schema contains exactly the approved M0-02 profile table/constraints and no invite or speculative product table.
4. RLS is enabled and grants match this brief rather than project defaults.
5. User A can insert and read profile A through the authenticated role.
6. User A cannot insert a profile for user B, update any profile, read profile B, or delete profiles.
7. User B cannot read or modify profile A.
8. An anonymous request cannot read or insert profiles.
9. Invalid and duplicate normalized usernames are rejected by database constraints.
10. The repository derives `user_id` from verified identity and applies an explicit ownership filter.
11. No secret key, password, token, or sensitive Auth value appears in browser code, committed files, snapshots, or logs.
12. Generated TypeScript database types match the clean-reset schema and are committed.
13. Database tests, repository tests, M0-01 quality gates, and production build pass.
14. No remote Supabase project or setting changed unless a separate approval identifies the exact target.

## Required tests

### Database/pgTAP

Use transaction-scoped fixtures with at least two Auth users and assert:

- required table, columns, types, constraints, foreign key, primary key, unique index, and RLS flag exist;
- anonymous access is denied;
- authenticated user A can insert/read only profile A;
- user A cannot insert for B;
- user A cannot read profile B;
- authenticated update and delete are denied;
- username normalization, length, first-character, and character-set constraints reject invalid data;
- duplicate username is rejected.

Do not count a UI or repository test as a substitute for direct RLS testing.

### TypeScript/Vitest

- Environment validation accepts safe test values and reports missing variables without echoing sensitive values.
- The repository derives current identity from the authenticated server context.
- Profile creation ignores or rejects caller-supplied ownership.
- Username input is normalized and validated before the database call.
- Expected uniqueness/constraint errors map to safe domain errors.
- Client-reachable modules cannot import the server repository.

### Commands expected at handoff

The builder must verify exact commands against the installed CLI's `--help`. The anticipated sequence is:

```powershell
npm.cmd ci
npx.cmd supabase start
npx.cmd supabase db reset
npx.cmd supabase db lint --level warning
npx.cmd supabase test db
npx.cmd supabase gen types typescript --local
npm.cmd run format:check
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test:run
npm.cmd run build
```

If Docker or another supported local prerequisite is unavailable, stop and report the blocker. Do not substitute an unapproved shared database.

## Implementation sequence

1. Re-read AGENTS.md, this brief, ADR-001, ADR-002, ADR-003, F-001, and current official Supabase guidance.
2. Confirm the worktree and dependency baseline.
3. Verify CLI/package choices and exact-pin the smallest required dependency set.
4. Initialize local Supabase and document prerequisites.
5. Create the profile migration through the supported CLI workflow.
6. Add direct schema, privilege, constraint, and RLS tests.
7. Generate and commit database types from a clean reset.
8. Add the user-scoped server client and profile repository.
9. Add repository/environment/import-boundary tests.
10. Run the complete validation sequence from a clean database.
11. Ask an independent reviewer to check every acceptance criterion, emphasizing cross-user isolation and sensitive-data exposure.
12. Correct only M0-02 findings, then prepare the validation record.

## Builder handoff requirements

Before requesting review, provide:

- changed files and one-sentence purpose for each group;
- selected dependency and CLI versions;
- exact commands and results;
- database reset, lint, and pgTAP summary;
- the actual privilege/policy matrix;
- evidence for anonymous and cross-user denial;
- evidence that username constraints exist at the database boundary;
- evidence that no remote project changed;
- evidence that no secret/password/Auth token entered client or logs;
- known limitations and deviations;
- confirmation that M0-03 remains unimplemented.

Before product-owner acceptance, create `docs/validation/M0-02-VALIDATION.md` with builder evidence and independent review. The precise decision requested is: **accept M0-02 as the local data/authorization foundation, or return focused corrections**.

## Risks and reversal

- A privilege/RLS error can expose another user's data. Direct negative tests and independent review are mandatory.
- Public signup can leave an unconfirmed Auth identity without a profile. M0-03 must treat this as an expected incomplete state.
- Username collision/validation errors must not create cross-user access or partial profile rows.
- Reusing the connected unrelated project could mix products and inherit unsafe policies. The remote environment gate prevents this.
- An incorrect migration is corrected with a new forward migration after remote use; applied history is never silently rewritten.
- Before approved remote use, reversal is local through Git revert and database reset.

## Official references checked for this revision

- [Supabase password-based Auth](https://supabase.com/docs/guides/auth/passwords)
- [Supabase password security](https://supabase.com/docs/guides/auth/password-security)
- [Supabase CAPTCHA protection](https://supabase.com/docs/guides/auth/auth-captcha)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Securing the Data API](https://supabase.com/docs/guides/api/securing-your-api)
- [Local database testing](https://supabase.com/docs/guides/local-development/testing/overview)

## Approval record

The product owner approved this revised brief together with ADR-002 on 23 July 2026. M0-02 may enter **in development** when a builder starts the local-only implementation.

Remote project creation, Auth configuration, SMTP/CAPTCHA integration, and migration remain separate decisions.
