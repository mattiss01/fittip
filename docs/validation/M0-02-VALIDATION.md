# M0-02 validation: local data and authorization foundation

**Status:** accepted — product owner accepted the reviewed M0-02-C1 correction 26 July 2026

**Date:** 23 July 2026

**Tickets:** [M0-02](../backlog/M0-02-DATA-AUTHORIZATION-FOUNDATION.md) (accepted original local implementation), [M0-02-C1](../backlog/M0-02-C1-REMOVE-USERNAME.md) (approved correction)

**Architecture:** [ADR-002](../decisions/ADR-002-M0-02-DATA-AUTHORIZATION-BOUNDARY.md), [ADR-004](../decisions/ADR-004-USERNAME-FREE-ACCOUNT-PROFILE.md)

## Correction outcome

M0-02-C1 amends the never-remotely-applied local baseline. `public.profiles`
now contains exactly `user_id` and `created_at`; no username, display name,
email, password, Auth metadata contract, or other profile input exists.

The correction preserves the original local-only boundary: explicit grants,
owner-only RLS, verified server identity, request-scoped publishable-key
client, explicit repository owner filtering, and direct negative tests.

No remote Supabase project, hosted setting, or user-visible authentication flow
was created or changed. F-001/M0-03 remains **draft**.

## Actual schema and authorization matrix

| Column | Type | Boundary |
|---|---|---|
| `user_id` | `uuid` | Primary key; FK to `auth.users(id)` with cascade delete |
| `created_at` | `timestamptz` | Required; defaults to `now()` |

| Role | SELECT | INSERT | UPDATE | DELETE |
|---|---:|---:|---:|---:|
| `anon` | No privilege | No privilege | No privilege | No privilege |
| `authenticated` | Own row via `profiles_owner_select` | Own `user_id` via `profiles_owner_insert` | No privilege/policy | No privilege/policy |

Both policies target `authenticated`, require a non-null `auth.uid()`, and
compare `(select auth.uid())` with `user_id`. Neither policy uses email or
user-editable Auth metadata.

## Focused correction evidence

| Command | Result |
|---|---|
| `npx supabase db reset --local` | PASS — recreated the local database and applied the corrected baseline from zero |
| `npx supabase db lint --local --level warning --fail-on warning` | PASS — no schema errors |
| `npx supabase db advisors --local --type all --level warn --fail-on warn` | PASS — no security or performance issues |
| `npx supabase test db --local supabase/tests/database/m0_02_authorization.test.sql` | PASS — 1 file, 41 pgTAP assertions |
| `npm run format:check` | PASS |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run test:run` | PASS — 5 files, 13 tests |
| `npm run build` | PASS — static `/` and `/_not-found` |

The 41 pgTAP assertions verify exactly two profile columns, explicit
privileges, two policies, owner insert/read, anonymous denial,
missing-identity denial, and cross-user denial. Repository tests prove profile
creation accepts no caller input and inserts only the verified Auth `user_id`.

The committed TypeScript types were regenerated from the clean local schema,
formatted, regenerated, and formatted again with an identical SHA-256 hash.
The runtime source/migration scan found no username reference and no
service-role, secret-key, remote-link, remote-push, view, trigger, function, or
`SECURITY DEFINER` addition. No local Supabase project reference exists.

## Independent correction review

Independent review at exact commit `6de981d` returned **PASS — no findings**.
The reviewer confirmed:

- a clean local reset, database lint, and security/performance advisors pass;
- all 41 pgTAP assertions pass;
- the catalog contains only `user_id` and `created_at`, the primary key and
  Auth foreign key, the primary-key index, and the two approved owner policies;
- only authenticated owner `SELECT` and `INSERT` privileges exist;
- generated types match the clean local schema after normalized comparison;
- formatting, ESLint, typecheck, all 13 Vitest tests, and the production build
  pass;
- F-001 remains draft with an eight-character password minimum and no profile
  input; and
- no project reference, remote mutation, or M0-03 implementation exists.

The builder ran the complete application gates with pinned Node 24.18.0. The
reviewer independently repeated formatting with Node 24.18.0 and the remaining
application gates with the available host Node 22.14 after its pinned-node
wrapper stalled; this was classified as an environment limitation, not a code
finding.

## Known limitations

- There is no registration, callback, confirmation, recovery, sign-in,
  sign-out, middleware, protected route, or profile UI. These remain M0-03.
- An Auth user can exist without a profile; M0-03 must create the minimal
  profile after email confirmation.
- Profiles intentionally have no UPDATE or DELETE access until a later
  approved profile/account feature.
- Local email is captured by Mailpit only. Hosted SMTP, Auth settings, rate
  limits, CAPTCHA, deployment, and remote migration remain outside this ticket.

## Acceptance boundary

The original M0-02 implementation was product-owner accepted on 23 July 2026.
The product owner accepted M0-02-C1 as the reviewed username-removal correction
on 26 July 2026. This acceptance does not approve M0-03 or authorize a remote
Supabase change.
