# FitTip

This repository contains the mobile-first web and local data foundation for
FitTip. M0-02-C1 corrects the local-only Supabase profile boundary to be
username-free; public registration
and all other user-visible account behavior remain unimplemented.

## Prerequisites

- Node.js 24.18.0 LTS (see `.nvmrc`)
- npm 11.16.0 (bundled with the selected Node.js release)
- Docker Desktop or another Docker-compatible runtime with at least 7 GB of
  memory available to the local Supabase stack

The M0-02 implementation was verified with Docker 28.1.1, Supabase CLI 2.109.1,
`@supabase/supabase-js` 2.110.8, and `@supabase/ssr` 0.12.3. All versions are
exact-pinned in `package.json` and `package-lock.json`.

## Install

Install the exact dependency tree recorded in `package-lock.json`:

```powershell
npm ci
```

On Windows systems where PowerShell blocks `npm.ps1`, use `npm.cmd` in place of `npm`.

## Run locally

```powershell
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The local M0-03 flow is
available from `/`: create an email/password account, open its captured
confirmation message in Mailpit, then continue to the protected `/home` route.
Password recovery and hosted-email behavior are deliberately not implemented.

## Local Supabase

The checked-in `supabase/config.toml` is a local development configuration. It
is not linked to a hosted project and must not be exposed to external traffic.

Start the Docker-compatible runtime first, then run:

```powershell
npx supabase start
npx supabase db reset --local
npx supabase db lint --local --level warning --fail-on warning
npx supabase db advisors --local --type all --level warn --fail-on warn
npx supabase test db --local supabase/tests/database
```

The first start downloads the local Supabase images and can take several
minutes. Later starts are faster. Stop the stack when it is no longer needed:

```powershell
npx supabase stop
```

The local Auth server requires email confirmation. Development email is
captured rather than sent; Mailpit is available at
[http://127.0.0.1:54324](http://127.0.0.1:54324). M0-03 will implement the
approved account and confirmation flows. M0-02 does not add registration,
callbacks, session middleware, or protected routes.

### Environment variables

Copy `.env.example` to an uncommitted `.env.local`. Use the local project URL
and publishable key reported by `npx supabase status`:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

Both values are public project coordinates. The key must use the modern
`sb_publishable_...` format; the environment validator rejects modern secret
keys and all legacy JWT-form keys rather than trying to distinguish a legacy
`anon` key from a legacy `service_role` key. The exact-pinned local CLI reports
a compatible modern publishable key. Never place a secret key, service-role
key, database password, or connection string in a `NEXT_PUBLIC_` variable. The
application has no secret/service Supabase client.

### Schema and access model

M0-02 creates only `public.profiles`:

| Role            |       SELECT |       INSERT | UPDATE | DELETE |
| --------------- | -----------: | -----------: | -----: | -----: |
| `anon`          |           No |           No |     No |     No |
| `authenticated` | Own row only | Own row only |     No |     No |

The user-scoped server repository verifies Auth claims, derives `user_id`
itself, repeats the ownership filter on reads, and remains subject to RLS.
Email and all credentials stay in Supabase Auth.

### Migrations and generated types

Create every new migration through the exact-pinned CLI:

```powershell
npx supabase migration new descriptive_name
```

Use forward-only corrections after a migration reaches an approved remote
environment. Do not edit applied history. Verify all committed migrations from
zero with `npx supabase db reset --local`.

Regenerate the committed public-schema types after a clean reset:

```powershell
npx supabase gen types --local --lang typescript --schema public |
  Set-Content -Encoding utf8 src/lib/supabase/database.types.ts
npm run format
```

No remote project is approved for this ticket. Do not run `supabase link`,
`db push`, or any hosted migration/configuration command until the product
owner names and approves the exact FitTip target environment.

## Quality commands

```powershell
npm run lint
npm run typecheck
npm run test
npm run test:run
npm run format
npm run format:check
npm run build
npm run test:e2e
```

- `test` starts Vitest in watch mode.
- `test:run` runs the deterministic test suite once.
- `format` rewrites supported application and repository-tooling files with Prettier.
- `test:e2e` runs the 390px browser flow. Start the local Supabase stack and
  `npm run dev` first, and set the two public local Supabase variables shown
  above. It reads the confirmation link only from local Mailpit.

Continuous integration, Vercel linkage, hosted Supabase configuration, and
user-visible authentication belong to later approved tickets.
