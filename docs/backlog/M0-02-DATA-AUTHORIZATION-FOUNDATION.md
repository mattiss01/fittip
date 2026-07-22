# M0-02: Data and authorization foundation

**Status:** draft — product-owner approval required before implementation

**Milestone:** M0

**Priority:** P0

**Depends on:** [M0-01 accepted](M0-01-REPOSITORY-TOOLING-BASELINE.md), [ADR-001](../decisions/ADR-001-M0-FOUNDATION.md)

**Architecture decision:** [ADR-002 draft](../decisions/ADR-002-M0-02-DATA-AUTHORIZATION-BOUNDARY.md)

**Blocks:** [M0-03 / F-001](../product/F-001-INVITE-ONLY-SIGN-IN.md), M0-04, M0-05

**Owner:** one builder after approval; one independent reviewer before acceptance

## Outcome

Establish a production-shaped but locally testable Supabase data boundary for FitTip. The result gives the next ticket a safe place to implement invite-only sign-in: a minimal profile relation, a non-client-readable invite allowlist, explicit database privileges, Row Level Security (RLS), server-only repositories, and repeatable cross-user isolation tests.

This ticket creates no user-visible sign-in flow and sends no email. It proves the data and authorization foundation before authentication UI is added.

## Approval and environment gates

Approval of this brief and ADR-002 authorizes implementation against the local Supabase development stack only.

It does **not** authorize any of the following:

- creating a paid or billable Supabase project;
- linking the repository to a remote Supabase project;
- applying a migration to an existing shared or production database;
- changing authentication, email, redirect, API, or Data API settings in a remote project;
- copying existing data into FitTip.

Before any remote change, the product owner must identify the exact target environment and approve it in writing. The recommended target is a dedicated FitTip development project, separate from any unrelated application or production data.

## Current-state review — 22 July 2026

### Repository

- M0-01 is accepted and the repository has Next.js, strict TypeScript, lint, format, Vitest, and production-build commands.
- The repository contains no `supabase/` directory, migrations, database types, Supabase dependencies, or committed environment template.
- No application feature currently reads or writes persistent data.

### Connected Supabase account

A read-only review found one active Supabase project in the connected account. It is not a clean FitTip target:

- it contains six unrelated `public` tables with existing rows;
- it has no migrations reported through the project migration history;
- its Security Advisor reports several permissive policies that allow unrestricted anonymous writes, plus a public storage-listing warning.

M0-02 must not alter, clean up, import from, or otherwise reuse that project without a separate product-owner decision. Those existing warnings are outside this ticket and belong to the other application using that project.

### Current platform changes relevant to this ticket

- New Supabase projects now default toward explicit Data API grants instead of automatically exposing new tables. M0-02 therefore records grants in the same migration as RLS policies and does not rely on project defaults.
- New hosted projects use publishable and secret API keys. FitTip will use a publishable key for user-scoped access and a server-only secret key only for the narrow invite/provisioning boundary. Legacy `anon` and `service_role` key names are not the design default.
- Authentication alone is not authorization. Both object privileges and row policies are required and are tested independently.

## Approved foundation decisions this ticket applies

M0-02 does not reopen the accepted choices in ADR-001:

- Supabase PostgreSQL and Supabase Auth;
- `user_id` on every user-owned record;
- RLS plus independent server-side ownership scoping;
- database access behind server repositories;
- no service or secret credential in browser code;
- no authorization based on user-editable metadata.

The product owner still needs to approve the exact M0-02 choices in ADR-002: the initial tables, privileges, repository split, local-first environment boundary, and delayed profile provisioning.

## Scope

### 1. Local Supabase baseline

- Add the Supabase CLI as an exact-pinned development dependency using its supported local-development workflow.
- Initialize versioned local Supabase configuration under `supabase/`.
- Document Docker/local prerequisites and the commands to start, stop, reset, lint, test, and generate TypeScript types.
- Add an environment example containing names and safe descriptions only—never real values.
- Verify a clean database reset applies every committed migration from zero.

The builder must review the current official Supabase changelog, CLI help, RLS guidance, server-side Auth guidance, and Data API security guidance again immediately before implementation. If current behavior conflicts with this brief, stop and return the conflict to the lead agent rather than improvising.

### 2. Minimal schema

Create one forward migration through `supabase migration new`; do not hand-invent an applied migration timestamp and do not edit a migration after it has reached an approved remote environment.

#### `public.profiles`

Purpose: a minimal one-to-one local relation for an authenticated FitTip identity.

| Column | Type | Rules |
|---|---|---|
| `user_id` | `uuid` | Primary key; not null; references `auth.users(id)`; delete cascades with the Auth identity |
| `created_at` | `timestamptz` | Not null; defaults to `now()` |

Rules:

- `user_id` is both identity reference and ownership key; no second profile id is created.
- The table contains no display name, health data, training data, onboarding answers, role, plan, consent, or preference fields.
- No automatic `auth.users` trigger creates profiles in this ticket. M0-03 owns the exact sequence “invite verified → Auth identity accepted → profile provisioned.” This prevents a generic Auth signup from silently becoming a FitTip account.
- Future profile fields require their own approved ticket and migration.

#### `public.invites`

Purpose: server-managed allowlist data needed by M0-03 before an account exists.

| Column | Type | Rules |
|---|---|---|
| `id` | `uuid` | Primary key; defaults to `gen_random_uuid()` |
| `email_normalized` | `text` | Not null; unique; must equal `lower(btrim(email_normalized))` |
| `status` | `text` | Not null; only `active` or `revoked`; defaults to `active` |
| `admin_note` | `text` | Optional; never returned to a browser or product analytics |
| `created_at` | `timestamptz` | Not null; defaults to `now()` |
| `updated_at` | `timestamptz` | Not null; defaults to `now()`; changed explicitly by the server/admin operation |
| `revoked_at` | `timestamptz` | Null while active; required when revoked |

Rules:

- A check constraint keeps `status` and `revoked_at` consistent.
- Email syntax validation and the final normalization routine belong to M0-03; this table only enforces the approved lower-case/trimmed storage form.
- An invite is a system-owned pre-account access-control record, not user-owned data, so it cannot carry a meaningful `user_id` before the account exists. This is the narrow documented exception to the owned-record rule.
- Hard delete is not part of the application privilege set. Revocation is an update so the access decision remains explainable.
- No consent, deletion request, analytics, AI request, training, memory, goal, activity, or audit-event table is created in M0-02.

### 3. Explicit privileges and RLS

The migration must revoke broad/default access for these two objects before granting the minimum required privileges. It must not depend on the remote project's default-grant toggle.

#### `profiles`

- Enable RLS.
- `anon`: no table privileges and no policy.
- `authenticated`: `SELECT` only.
- `service_role`/secret server role: `SELECT` and `INSERT` only, reserved for the later invite-verified provisioning path.
- Owner-select policy: `TO authenticated`, with an explicit non-null authenticated user check and `(select auth.uid()) = user_id`.
- No authenticated `INSERT`, `UPDATE`, or `DELETE` policy in this ticket.

The authenticated profile repository must also filter by the verified current user id. RLS is the database backstop, not a replacement for server-side scoping.

#### `invites`

- Enable RLS even though ordinary clients receive no privileges.
- `anon`: no table privileges and no policy.
- `authenticated`: no table privileges and no policy.
- `service_role`/secret server role: `SELECT`, `INSERT`, and `UPDATE`; no `DELETE`.
- No client-readable RLS policy.

The table may be addressed only by a narrowly scoped server-only invite repository using a secret key. A publishable-key request must receive no rows and must not be able to infer invite membership.

#### General database requirements

- Use lowercase `snake_case` identifiers, named constraints, `timestamptz`, and explicit `NOT NULL` constraints.
- Index every foreign key or RLS filter column unless its primary/unique index already provides the required index. `profiles.user_id` needs no duplicate index because it is the primary key.
- Do not create a view, RPC, `SECURITY DEFINER` function, custom Postgres role, or exposed custom schema in this ticket.
- Do not use `auth.jwt()->'user_metadata'` or any other user-editable metadata for authorization.
- Do not grant `ALL` to `anon`, `authenticated`, or the secret server role.

### 4. Server-only database boundary

Add a small, typed boundary with no UI consumer yet:

- a user-scoped server Supabase client that uses the publishable key plus the request's authenticated session and never trusts a caller-supplied user id;
- a narrowly scoped secret server client that is importable only from server code;
- a profile repository that resolves the verified current identity and queries with an explicit `user_id` filter;
- an invite repository that can answer whether one normalized email has an active invite without listing or returning the full allowlist;
- generated database types from the committed local schema;
- environment validation that fails clearly when a required server variable is absent.

Suggested paths (the builder may make a reversible naming adjustment):

```text
supabase/
  config.toml
  migrations/<generated>_m0_02_data_authorization_foundation.sql
  tests/database/m0_02_authorization.test.sql
src/lib/supabase/
  database.types.ts
  env.ts
  server-user-client.ts
  server-secret-client.ts
src/server/repositories/
  profile-repository.ts
  invite-repository.ts
```

Required boundary rules:

- Files that can create a secret client must use a server-only guard.
- Secret variables must not use the `NEXT_PUBLIC_` prefix.
- Browser components must not import a database repository.
- Repository results expose only the fields required by the calling service.
- Logs and thrown errors must not contain API keys, Auth tokens, full invite lists, or raw database connection strings.
- M0-02 must not add an endpoint, Server Action, page, form, middleware rule, magic-link request, profile-creation flow, or administrator UI.

### 5. Documentation

Update the repository documentation with:

- exact local setup and verification commands;
- environment-variable names and which are safe for a browser;
- migration creation and forward-only correction rules;
- how to generate database types after a migration;
- how to run the RLS tests;
- a warning that linking/applying to a remote project requires the explicit gate above;
- a record of the exact package and CLI versions selected by the builder.

## Non-goals

- No sign-in page, magic link, callback, session middleware, sign-out, or protected route; those belong to M0-03.
- No creation of a remote Supabase project and no migration of the currently connected project.
- No public registration and no administrator UI.
- No automatic profile trigger or unapproved account-provisioning behavior.
- No consent or withdrawal schema; that belongs to M0-04.
- No deletion request, retention, analytics, AI telemetry, rate limiting, or AI provider call.
- No goal, memory, plan, activity, log, conversation, proposal, or training data.
- No Vercel environment setup, CI, preview deployment, or hosted smoke test; those belong to M0-06 unless separately approved.
- No cleanup or security repair for unrelated data found in the existing Supabase project.

## Acceptance criteria

1. A new contributor can follow the documented local prerequisites and start the local Supabase stack.
2. `supabase db reset` succeeds from a clean state using only committed configuration and migrations.
3. The resulting schema contains exactly the approved M0-02 FitTip tables/columns/constraints and no speculative product tables.
4. RLS is enabled on both tables, and grants match the matrix in this brief rather than relying on project defaults.
5. As user A, the profile repository can read user A's profile and never returns user B's profile.
6. User A cannot insert, update, delete, or reassign a profile through the authenticated role; user B cannot read or modify user A's profile.
7. An anonymous request cannot read either table.
8. An ordinary authenticated request cannot read, list, insert, update, or delete invites.
9. The server-only invite repository returns only active/not-active for one normalized email and does not expose the allowlist or admin note.
10. No secret key or secret-client module is reachable from a browser bundle, committed file, test snapshot, or log.
11. Generated TypeScript database types match the clean-reset schema and are committed.
12. Database tests, repository tests, M0-01 quality gates, and the production build all pass.
13. No remote Supabase project or setting changed while satisfying this ticket unless a separate written approval identifies the exact target.

## Required tests

### Database/pgTAP

Use transaction-scoped fixtures with at least two Auth users and assert:

- required tables, columns, types, constraints, keys, and RLS flags exist;
- anonymous access is denied;
- authenticated user A sees only profile A;
- authenticated user B sees only profile B;
- cross-user profile reads return no row;
- authenticated profile insert, update, ownership reassignment, and delete do not succeed;
- authenticated access to every invite operation is denied;
- malformed invite status or inconsistent `revoked_at` is rejected;
- duplicate normalized invite email is rejected.

Do not count a UI or repository test as a substitute for direct RLS testing.

### TypeScript/Vitest

- Environment validation accepts safe test values and reports missing variables without echoing secrets.
- The profile repository derives the current user identity from the authenticated server context and includes an explicit ownership filter.
- The invite repository normalizes its input once, selects only the active-match result, and does not return invite rows.
- Client-reachable modules cannot import the secret client; add an enforceable lint/import rule or a focused architecture test if the existing toolchain can do so without a broad refactor.
- Error mapping does not leak raw Supabase errors or secret values.

### Commands expected at handoff

The builder must verify the exact commands against the installed CLI's `--help`. The anticipated sequence is:

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

If Docker or a supported local prerequisite is unavailable, the builder stops and reports that concrete blocker. The builder must not substitute an unapproved shared database.

## Implementation sequence

1. Re-read AGENTS.md, this brief, ADR-001, ADR-002, F-001, and the current official Supabase guidance.
2. Confirm the worktree is clean enough to isolate this ticket and record current package versions.
3. Inspect CLI/package choices and exact-pin the smallest required dependency set.
4. Initialize the local Supabase structure and document prerequisites.
5. Create the migration through the supported CLI workflow.
6. Add direct schema, privilege, and RLS tests before repository integration.
7. Generate and commit TypeScript database types from a clean reset.
8. Add the server-only clients and the two narrow repositories.
9. Add focused repository/environment/import-boundary tests.
10. Run the full validation sequence from a clean database.
11. Ask an independent reviewer to check the diff against every acceptance criterion, emphasizing cross-user isolation and secret exposure.
12. Correct only M0-02 findings, then prepare the validation record and acceptance request.

## Builder handoff requirements

Before requesting review, provide:

- changed files and one-sentence purpose for each group;
- selected dependency and CLI versions;
- exact commands run and their results;
- database reset, lint, and pgTAP output summary;
- the privilege/policy matrix actually created;
- evidence for anonymous and cross-user denial cases;
- evidence that no remote project changed;
- evidence that the secret client cannot enter browser code;
- known limitations and any deviation from this brief;
- a statement that M0-03 remains unimplemented.

Before requesting product-owner acceptance, create `docs/validation/M0-02-VALIDATION.md` containing the builder evidence and independent review result. The precise decision requested must be: **accept M0-02 as the local data/authorization foundation, or return focused corrections**.

## Risks and reversal

- A privilege or RLS error can expose another user's data. Direct negative tests and independent review are mandatory.
- A secret key in client code bypasses the intended boundary. Server-only guards, environment naming, and bundle/import verification are mandatory.
- Reusing the connected unrelated project could mix products and inherit unsafe policies. The remote environment gate prevents this.
- An incorrect migration is corrected with a new forward migration after remote use; it is never silently rewritten.
- Before any approved remote use, reversal is local and recoverable with a clean database reset and ordinary Git revert.

## Official references checked for this draft

- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Securing the Data API](https://supabase.com/docs/guides/api/securing-your-api)
- [Local database testing overview](https://supabase.com/docs/guides/local-development/testing/overview)
- [CLI testing and linting](https://supabase.com/docs/guides/local-development/cli/testing-and-linting)
- [2026 explicit Data API grant change](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)
- [Supabase publishable and secret API keys](https://supabase.com/changelog/29260-upcoming-changes-to-supabase-api-keys)

## Decision requested

Approve this brief together with ADR-002 to move M0-02 from **draft** to **approved** and authorize local implementation only.

Remote project creation, linking, and migration remain separate decisions. The recommendation is to create or designate a dedicated FitTip development project when the local implementation is ready for hosted validation.
