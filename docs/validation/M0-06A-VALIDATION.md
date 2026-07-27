# M0-06A validation: founder-hosted staging

**Status:** testable

**Date:** 27 July 2026

**Awaiting:** product-owner acceptance

**Ticket:** [M0-06A](../backlog/M0-06A-FOUNDER-HOSTED-STAGING.md)

**Architecture:** [ADR-007](../decisions/ADR-007-FOUNDER-HOSTED-STAGING.md)

**Branch:** `master`

**Reviewed application commit:** `d47c1cb5e9fab57f8cf5e896a30721b28af59ec0`

## Testable outcome

FitTip is continuously reachable at
[https://fittip-gilt.vercel.app](https://fittip-gilt.vercel.app) from the
GitHub `master` branch. It uses the separate `FitTip Founder Staging` Supabase
project in Frankfurt and is restricted to the administratively created product
owner.

Hosted signup is closed at the UI, application-route, and Supabase Auth
configuration boundaries. Anonymous and non-owner access is denied. Local
development retains the accepted signup flow.

This is disposable founder staging, not production or an external-user
release. Only product-owner and synthetic data are authorized.

## Hosted resources

| Resource | Recorded value |
|---|---|
| GitHub | `mattiss01/fittip`, production branch `master` |
| Vercel project | `fittip` |
| Public alias | `https://fittip-gilt.vercel.app` |
| Vercel deployment | `dpl_73KS3gRS2hk2XdYhdc6gWHNZX6ET`, READY |
| Deployed reviewed application commit | `d47c1cb5e9fab57f8cf5e896a30721b28af59ec0` |
| Supabase project | `FitTip Founder Staging` |
| Supabase project reference | `mahhfyxhgcmcbqkvudcm` |
| Supabase region | `eu-central-1` (Frankfurt) |
| Initial project cost | `$0` confirmed immediately before creation |

The unrelated pre-existing Supabase project was not changed.

## Environment configuration

The following names are configured for the Vercel production environment. All
values remain redacted from this record:

| Variable | Scope | Classification |
|---|---|---|
| `FITTIP_RUNTIME_MODE` | Production | server-only |
| `FITTIP_OWNER_USER_ID` | Production | server-only |
| `NEXT_PUBLIC_SUPABASE_URL` | Production | deliberately public |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Production | deliberately public publishable key |

No application service-role key, Supabase secret key, database password,
database URL, or management token is configured or required.

The product owner confirmed the exact production Site URL and
`/auth/callback` redirect URL in Supabase. Wildcard, localhost, and preview
origins are excluded. The product owner also confirmed that new-user signup and
anonymous sign-in are disabled while existing-owner email/password sign-in
remains functional.

## Commands and results

| Check | Command or evidence | Result |
|---|---|---|
| Lint | `npm run lint` | PASS |
| TypeScript | `npm run typecheck` | PASS |
| Application tests | `npm run test:run` | PASS - 15 files, 85 tests |
| Production build | `npm run build` | PASS |
| Whitespace | `git diff --check` | PASS |
| Formatting baseline | `npm run format:check` | KNOWN BASELINE - Prettier reports 38 existing checkout files; no broad mechanical rewrite was made under this ticket |
| Remote migrations | Supabase migration list | PASS - exactly `20260723084625` and `20260727082635` |
| Hosted RLS owner test | authenticated owner claims | PASS - one owned profile visible |
| Hosted RLS cross-user test | synthetic non-owner claims | PASS - zero profiles visible |
| Hosted records | count-only database query | PASS - one confirmed non-anonymous owner and one matching profile; zero anonymous users |
| Supabase performance advisors | hosted project advisor | PASS - no findings |
| Supabase security advisors | hosted project advisor | PASS WITH KNOWN WARNING - leaked-password protection disabled |
| Vercel build | deployment build-error query | PASS - build completed; no build errors |
| Vercel runtime | 24-hour production error query | PASS - no runtime errors |
| Mobile browser | hosted page at `390x844` | PASS - no horizontal overflow, console errors, or page errors |
| Anonymous root | `GET /` | PASS - sign-in-only page, `200` |
| Hosted signup page | `GET /signup` | PASS - `303` to `/` |
| Hosted signup action | `POST /auth/signup` | PASS - generic credentials redirect and no-store headers |
| Anonymous protected route | `GET /home` | PASS - `303` to `/` |
| Indexing and caching | response/meta inspection | PASS - `noindex`, `nofollow`, `noarchive`; private/no-store session responses |
| Client exposure | nine deployed JavaScript bundles scanned | PASS - no secret-key, service-role, database-URI, or owner-UUID patterns |
| Owner session | product-owner walkthrough | PASS - sign-in, `/home`, refresh, exactly one profile, and sign-out |

The Terra builder completed the founder-mode implementation. Independent
review found and corrected fail-open configuration, incomplete owner checks,
cache behavior, shared-repository authorization, and a callable RLS helper.
Final review passed after the corrections.

## Database and authorization evidence

- The hosted migration history exactly matches the two committed migrations.
- `public.profiles` has RLS enabled and explicit authenticated `SELECT` and
  `INSERT` ownership policies.
- The configured owner sees the one owned profile.
- A synthetic authenticated non-owner sees zero profiles.
- Anonymous access has no profile privileges or records.
- The event-trigger helper that enables RLS for new public tables remains
  operational for its owner while `PUBLIC`, `anon`, and `authenticated`
  execution is revoked.
- Performance advisors report no findings.
- The security advisor reports only that leaked-password protection is
  disabled. Registration is closed and this free founder-staging slice does
  not add paid or broader authentication features without approval.

## Mobile demo

1. Open [https://fittip-gilt.vercel.app](https://fittip-gilt.vercel.app) at a
   `390x844` viewport.
2. Sign in with the administratively created owner account.
3. Verify `/home` loads.
4. Refresh and verify the owner session remains active.
5. Sign out and verify the sign-in page returns.
6. Verify `/signup` redirects to sign-in and no create-account link is shown.

The owner email and password must remain private and must not be included in a
test report, browser recording, screenshot, or agent message.

## Changed files

### Hosted runtime and authorization

- `.env.example`
- `next.config.ts`
- `src/lib/auth/runtime-policy.ts`
- `src/lib/auth/verified-user.ts`
- `src/lib/supabase/server-environment.ts`
- `src/lib/supabase/server-user-client.ts`
- `src/server/repositories/profile-repository.ts`
- `src/proxy.ts`
- `src/app/page.tsx`
- `src/app/signup/page.tsx`
- `src/app/home/page.tsx`
- `src/app/auth/signup/route.ts`
- `src/app/auth/signin/route.ts`
- `src/app/auth/callback/route.ts`
- `src/app/auth/denied/route.ts`
- `src/components/auth-form.tsx`
- `src/app/layout.tsx`

### Database

- `supabase/migrations/20260727082635_revoke_public_rls_auto_enable_execute.sql`

### Tests

- founder-mode route, page, proxy, environment, authorization, repository, and
  migration-contract tests under `src/**/*.test.ts` and `src/**/*.test.tsx`

### Planning and handoff

- `README.md`
- `REVISED_PRODUCT_PLAN.md`
- `docs/decisions/ADR-007-FOUNDER-HOSTED-STAGING.md`
- `docs/backlog/M0-06A-FOUNDER-HOSTED-STAGING.md`
- `docs/backlog/M0-M1-BACKLOG.md`
- M1/M2 dependency briefs
- `docs/validation/M0-06A-VALIDATION.md`

## Known limitations and upgrade triggers

- Hosted records are disposable. There is no backup or recovery promise.
- Supabase free projects may pause; upgrade requires a separate product-owner
  decision if pausing disrupts testing.
- Leaked-password protection is currently disabled. Public registration is
  closed, and enabling paid or broader protection requires a separate decision.
- There is no account recovery, password-change UI, custom SMTP, CAPTCHA,
  custom domain, external monitoring, analytics, or AI provider in this ticket.
- Vercel Hobby and Supabase free tiers are accepted only for this personal,
  non-commercial founder-staging use.
- Any friend, external user, public registration, commercial use, or
  production claim immediately ends this exception and requires M0-03B through
  M0-06 plus the outstanding privacy implementation gate.

## Credential handling

The Supabase owner email and password were entered privately by the product
owner and were never received or recorded by an agent. No secret key,
service-role key, database password, management token, or owner UUID is
committed or exposed in the deployed client bundles. Only the public Supabase
project reference and generated Vercel URL are recorded here.

## Decision requested

Accept M0-06A as the testable founder-hosted staging baseline, or return focused
corrections. Acceptance authorizes separately approved M1 tickets to be
deployed here one at a time with only product-owner or synthetic data. It does
not authorize friends, public registration, production, commercial use,
external analytics, an AI provider/model/key, or spend.
