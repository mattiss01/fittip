# M0-02 validation: local data and authorization foundation

**Status:** builder handoff complete — independent review required

**Date:** 23 July 2026

**Ticket:** [M0-02](../backlog/M0-02-DATA-AUTHORIZATION-FOUNDATION.md)

**Architecture:** [ADR-002](../decisions/ADR-002-M0-02-DATA-AUTHORIZATION-BOUNDARY.md)

## Outcome

M0-02 now provides a reproducible local Supabase stack, the approved minimal
`public.profiles` schema, explicit grants and owner-only RLS, a request-scoped
server client, a typed profile repository, generated database types, and direct
cross-user denial tests.

No remote Supabase project, hosted setting, or user-visible authentication flow
was created or changed.

## Demo path

M0-02 has no approved user-visible flow. The existing mobile-neutral route
remains `/` at `http://localhost:3000`.

The local database behavior is demonstrated through:

```powershell
npx supabase db reset --local
npx supabase test db --local supabase/tests/database
```

Mailpit is available at `http://127.0.0.1:54324` while the local stack runs, but
registration and email-confirmation UI remain M0-03 work.

## Changed files

### Local database

- `supabase/config.toml` — CLI-generated local configuration with email
  confirmation enabled and no remote linkage.
- `supabase/migrations/20260723084625_m0_02_data_authorization_foundation.sql`
  — the single approved profile migration, explicit grants, and RLS policies.
- `supabase/tests/database/m0_02_authorization.test.sql` — 51 direct pgTAP
  assertions covering schema, constraints, privileges, anonymous denial, and
  two-user isolation.
- `supabase/.gitignore` — excludes local CLI state.

### Server data boundary

- `src/lib/supabase/database.types.ts` — generated public-schema TypeScript
  types.
- `src/lib/supabase/env.ts` — safe public environment validation.
- `src/lib/supabase/server-user-client.ts` — request-scoped SSR client using
  cookies and the publishable key.
- `src/server/repositories/profile-repository.ts` — verified-claim identity,
  explicit owner scoping, username validation, profile reads/inserts, and safe
  error mapping.
- Focused tests under `src/lib/supabase/`,
  `src/server/repositories/`, and `src/architecture/`.

### Tooling and documentation

- `package.json` and `package-lock.json` — exact-pinned Supabase and
  `server-only` packages.
- `.env.example` — safe variable names/placeholders only.
- `.prettierignore` — excludes Supabase local CLI state.
- `README.md` — local prerequisites, commands, environment boundary,
  migration/type workflow, policy matrix, Mailpit notes, and remote gate.

## Exact versions

| Tool or package | Version |
|---|---:|
| Node.js | 24.18.0 |
| npm | 11.16.0 |
| Docker engine | 28.1.1 |
| Supabase CLI | 2.109.1 |
| `@supabase/supabase-js` | 2.110.8 |
| `@supabase/ssr` | 0.12.3 |
| `server-only` | 0.0.1 |
| Local PostgreSQL image | 17.6.1.143 |

## Database evidence

### Schema

`public.profiles` contains exactly:

| Column | Type | Boundary |
|---|---|---|
| `user_id` | `uuid` | Primary key, FK to `auth.users(id)`, cascade delete |
| `username` | `text` | Required, unique, lowercase format check, 3–30 characters |
| `created_at` | `timestamptz` | Required, defaults to `now()` |

There is no email, password, invite, consent, training, AI, or speculative
product table.

### Privilege and policy matrix

| Role | SELECT | INSERT | UPDATE | DELETE |
|---|---:|---:|---:|---:|
| `anon` | No privilege | No privilege | No privilege | No privilege |
| `authenticated` | Own row via `profiles_owner_select` | Own `user_id` via `profiles_owner_insert` | No privilege/policy | No privilege/policy |

Both policies target `authenticated`, require a non-null `auth.uid()`, and
compare `(select auth.uid())` with `user_id`. No policy uses email, username, or
user metadata.

### Direct denial evidence

The 51-test pgTAP suite proves:

- `anon` SELECT and INSERT fail with SQLSTATE `42501`;
- user A inserting for user B fails with SQLSTATE `42501` from RLS;
- user A sees zero user-B rows and user B sees zero user-A rows;
- authenticated UPDATE and DELETE fail with SQLSTATE `42501`;
- an authenticated role without a user-id claim sees zero rows and cannot
  insert;
- uppercase, short, number-leading, unsupported-character, and overlong
  usernames fail the named check constraint with SQLSTATE `23514`;
- duplicate normalized usernames fail the unique constraint with SQLSTATE
  `23505`.

## Commands and results

### Database

| Command | Result |
|---|---|
| `npx supabase --version` | PASS — `2.109.1` |
| `npx supabase start` | PASS — local Docker stack started; first image pull was slow |
| `npx supabase db reset --local` | PASS — recreated database and applied migration from zero |
| `npx supabase db lint --local --level warning --fail-on warning` | PASS — no schema errors |
| `npx supabase db advisors --local --type all --level warn --fail-on warn` | PASS — no security/performance issues |
| `npx supabase test db --local supabase/tests/database/m0_02_authorization.test.sql` | PASS — 1 file, 51 tests |
| `npx supabase migration list --local` | PASS — migration `20260723084625` applied locally |
| `npx supabase gen types --local --lang typescript --schema public` | PASS — committed types generated from local schema |
| Masked `npx supabase status --output json` format check | PASS — local key exists, matches `sb_publishable_...`, and no key material was printed |

### Application

All application gates used the verified Node.js 24.18.0 runtime.

| Gate | Result |
|---|---|
| Prettier check | PASS — all matched files |
| ESLint | PASS — no findings |
| `tsc --noEmit` | PASS |
| Vitest | PASS — 5 files, 21 tests |
| Next.js production build | PASS — static `/` and `/_not-found` |

The combined `npx`/npm wrapper was abnormally slow in this Windows/OneDrive
workspace, so the final application binaries were invoked directly with the
same verified Node 24.18.0 runtime. This changed no test configuration or
coverage.

## Acceptance-criteria mapping

| Criterion | Evidence |
|---:|---|
| 1 | README prerequisites and local start/reset commands; local stack started successfully |
| 2 | Clean `db reset --local` passed from committed configuration/migration |
| 3 | pgTAP verifies exactly three approved profile columns and no invite table |
| 4 | pgTAP verifies RLS, exactly two policies, and the explicit privilege matrix |
| 5 | pgTAP user A owner insert/read passed |
| 6 | pgTAP proves user A cannot insert for B, update, or delete, and reads zero B rows |
| 7 | pgTAP proves user B reads zero A rows and cannot update/delete A |
| 8 | pgTAP proves anonymous SELECT/INSERT denial |
| 9 | pgTAP proves format and duplicate constraints |
| 10 | Repository tests prove verified claims, explicit read filter, and derived insert ownership |
| 11 | Environment/repository tests prove safe errors; static scans listed below find no sensitive values |
| 12 | Types were generated from the clean local schema and committed |
| 13 | Database, repository, quality, and production-build gates passed |
| 14 | No project ref/link exists and no remote Supabase mutation command was run |

## Secret and remote-change evidence

- `.env.example` contains only a local URL and a non-functional publishable-key
  placeholder.
- The environment validator accepts only the modern `sb_publishable_...`
  format. It rejects both `sb_secret_` values and legacy JWT-form keys without
  echoing either value, closing the legacy `service_role` bypass path.
- `server-only` marks the SSR client and repository; the architecture test
  rejects client-component repository imports.
- The codebase contains no service-role/secret client, password field, token
  logging, raw connection string, `supabase link`, project ref, remote
  migration, RPC, trigger, view, or `SECURITY DEFINER` function.
- Only local CLI commands using `--local` were used for reset, lint, advisors,
  tests, type generation, and migration inspection.
- No Supabase MCP project mutation tool was used.

## Known limitations

- There is no registration, callback, confirmation, recovery, sign-in,
  sign-out, middleware, protected route, or profile UI. All remain M0-03.
- An Auth user can exist without a profile; M0-03 must handle profile completion
  and username collisions.
- Profiles intentionally have no UPDATE or DELETE access until a later approved
  profile/account feature.
- Local email is captured by Mailpit only. Hosted SMTP, Auth settings, rate
  limits, CAPTCHA, and deployment remain outside this ticket.
- The local Supabase stack is development-only and must not be externally
  exposed.

## Independent review

Pending. The reviewer must independently rerun the authorization tests, inspect
the actual grants/policies and server boundary, verify no remote change or
secret exposure, and return approval or focused M0-02 corrections.

## Decision requested after independent review

Accept M0-02 as FitTip's **local data and authorization foundation**, or return
focused corrections. Acceptance does not authorize a remote Supabase project,
hosted Auth configuration, or M0-03 implementation.
