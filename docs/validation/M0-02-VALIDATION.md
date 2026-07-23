# M0-02 validation: local data and authorization foundation

**Status:** testable — focused M0-02-C1 correction pending independent review and product-owner acceptance

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
M0-02-C1 is a separate approved correction and is not accepted by this record.
It requires independent review and product-owner acceptance before M0-03 can
be approved for implementation.
