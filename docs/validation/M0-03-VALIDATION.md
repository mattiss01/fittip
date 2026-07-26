# M0-03 validation: basic public account authentication

**Status:** testable — pending product-owner acceptance

**Date:** 26 July 2026

**Ticket:** [F-001 / M0-03](../product/F-001-PUBLIC-ACCOUNT-AUTHENTICATION.md)

**Architecture:** [ADR-003](../decisions/ADR-003-PUBLIC-EMAIL-PASSWORD-AUTH.md), [ADR-004](../decisions/ADR-004-USERNAME-FREE-ACCOUNT-PROFILE.md), [ADR-005](../decisions/ADR-005-STAGED-MVP-AUTHENTICATION.md)

**Reviewed implementation:** `13684e1a84683e9b150dce9f0e70d4cb224cf63a` on `agent/m0-03-basic-auth`

## Testable outcome

The local FitTip application now supports the approved basic account flow:

- public email/password signup with an eight-character minimum;
- local confirmation email captured by Mailpit;
- server-side PKCE confirmation and verified session creation;
- caller-input-free minimal profile provisioning;
- sign-in, sign-out, session refresh, and protected `/home` access;
- safe generic authentication errors; and
- server, repository, and RLS ownership enforcement.

Password recovery, password changes, hosted SMTP, branded templates, CAPTCHA,
hosted rate-limit tuning, and production email testing were not implemented.

## Mobile demo

1. Start the local Supabase stack and application by following
   [README.md](../../README.md).
2. Open [http://localhost:3000/](http://localhost:3000/) at a `390x844`
   viewport.
3. Choose **Create account**, enter an email and matching password of at least
   eight characters, and submit.
4. Open local Mailpit, follow the FitTip confirmation link, and verify that
   `/home` opens.
5. Sign out, sign back in with the same account, and verify that `/home` opens
   again.

The automated Playwright walkthrough performs this complete path at 390px and
also verifies that the callback session response carries exact, non-duplicated
private no-cache headers.

## Commands and results

| Check | Command | Result |
|---|---|---|
| Format | `npm run format:check` | PASS |
| Lint | `npm run lint` | PASS |
| TypeScript | `npm run typecheck` | PASS |
| Application and connected auth tests | `npm run test:run` | PASS — 9 files, 36 tests |
| Production build | `npm run build` | PASS |
| Database lint | `npx supabase db lint --local --level warning --fail-on warning` | PASS — no issues |
| Database advisors | `npx supabase db advisors --local --type all --level warn --fail-on warn` | PASS — no security or performance findings |
| Database authorization tests | `npx supabase test db --local supabase/tests/database/m0_02_authorization.test.sql` | PASS — 41/41 pgTAP assertions |
| Mobile authentication flow | `npm run test:e2e` | PASS — 1/1 at 390px |
| Lock consistency | `npm ci --dry-run --ignore-scripts` | PASS |
| Whitespace | `git diff --check` | PASS |

A full `npm ci` installed dependencies but its command wrapper did not return
before the builder timeout. The lockfile-only update and dry-run consistency
check passed, resolved dependency versions did not change, and all application,
database, build, and browser gates passed afterward.

## Security and review evidence

- Credential-carrying form handlers use `303` Post/Redirect/Get behavior, so
  browsers do not replay password form bodies.
- Callback, credential routes, and session proxy preserve `Set-Cookie` while
  returning exact private no-cache headers.
- Protected content verifies authenticated claims server-side; authorization
  does not depend on the proxy alone.
- Profile creation derives ownership only from verified claims and retries
  idempotently after a successful sign-in.
- Owner access, anonymous denial, and cross-user denial remain covered by the
  41 database authorization assertions.
- Production route and proxy tests cover successful and failed confirmation,
  signup, sign-in, sign-out, profile provisioning, session refresh, cookie
  propagation, cache headers, and protected-route redirects.
- No service-role credential, password, Auth token, hosted project mutation, or
  prohibited recovery/SMTP/CAPTCHA implementation was committed.

Independent review initially blocked the handoff on browser-origin,
Post/Redirect/Get, Mailpit polling, cache-header, provisioning-retry, connected
test, and dependency-lock findings. Each finding was corrected and re-reviewed.
Final independent review returned **PASS** at
`13684e1a84683e9b150dce9f0e70d4cb224cf63a`.

## Changed files

### Authentication application

- `src/app/page.tsx`
- `src/app/signup/page.tsx`
- `src/app/home/page.tsx`
- `src/app/auth/signup/route.ts`
- `src/app/auth/callback/route.ts`
- `src/app/auth/signin/route.ts`
- `src/app/auth/signout/route.ts`
- `src/components/auth-form.tsx`
- `src/components/sign-out-button.tsx`
- `src/lib/auth/credentials.ts`
- `src/lib/supabase/browser-client.ts`
- `src/lib/supabase/server-user-client.ts`
- `src/proxy.ts`
- `src/server/repositories/profile-repository.ts`
- `src/app/globals.css`

### Tests and tooling

- `src/app/auth/auth-routes.test.ts`
- `src/app/page.test.tsx`
- `src/components/auth-form.test.tsx`
- `src/lib/auth/credentials.test.ts`
- `src/lib/supabase/server-user-client.test.ts`
- `src/proxy.test.ts`
- `src/server/repositories/profile-repository.test.ts`
- `e2e/auth.spec.ts`
- `playwright.config.ts`
- `vitest.config.ts`
- `package.json`
- `package-lock.json`
- `.gitignore`

### Documentation

- `README.md`
- `docs/product/F-001-PUBLIC-ACCOUNT-AUTHENTICATION.md`
- `docs/backlog/M0-M1-BACKLOG.md`
- `docs/validation/M0-03-VALIDATION.md`

## Known limitations

- The flow is local-only. No hosted Supabase project or remote Auth setting was
  changed.
- Local email is captured by Mailpit; production delivery is not validated.
- There is no forgotten-password, reset-password, or password-change flow.
- M0-03B account recovery and M0-06 hosted email/bot-protection decisions remain
  required before external MVP registration.

## Decision requested

Accept M0-03 as the reviewed local basic-authentication foundation. Acceptance
does not approve account recovery, hosted authentication settings, production
email delivery, external registration, or later product features.
