# M0-03B: Account recovery

**Status:** proposed — not approved for implementation

**Milestone:** M0

**Priority:** P0

**Depends on:** [M0-03 / F-001 accepted](../../product/F-001-PUBLIC-ACCOUNT-AUTHENTICATION.md), [ADR-005](../../decisions/ADR-005-STAGED-MVP-AUTHENTICATION.md)

**Blocks:** external MVP use and M0-06 acceptance

## Outcome

Add the smallest local, testable forgotten-password and password-reset flow so
an email/password user can regain access without administrator intervention.
The flow preserves M0-03's username-free account, eight-character password
minimum, SSR-compatible PKCE session boundary, generic Auth responses, and
server-side protection.

This is a proposed brief. It does not approve implementation, a remote
Supabase change, custom SMTP, hosted email delivery, or public exposure.

## Approval and environment boundary

Approval would authorize implementation and validation against the local
Supabase stack and Mailpit only, after M0-03 is accepted.

It would not authorize:

- linking or changing a hosted Supabase project;
- changing hosted Auth URLs, email templates, password settings, JWT lifetime,
  rate limits, or session settings;
- configuring custom SMTP, CAPTCHA, analytics, or another external service;
- adding account settings, password change for a signed-in user, or account
  deletion; or
- weakening the generic response to help diagnose local test failures.

The builder must recheck the current Supabase changelog, password-recovery,
PKCE/SSR, redirect URL, session, and sign-out documentation before
implementation. A platform change that conflicts with this brief returns to
the product owner rather than being silently accommodated.

Current documentation says `resetPasswordForEmail` supports PKCE, SSR uses the
PKCE flow, sign-out can target local/global/other sessions, and revoked-session
access-token JWTs can remain valid until expiry. The 26 July 2026 changelog
review also found hosted default-SMTP/template changes; they reinforce rather
than expand the M0-06 hosted-email gate.

## User flow

### Request recovery

1. The sign-in screen links to **Forgot password?**
2. The user enters an email address and submits the form.
3. FitTip sends the request through the existing M0-03 Auth boundary.
4. FitTip always shows the same confirmation:
   **If an account exists for that email, we sent a password reset link.**
5. For a registered local user, Mailpit receives the Supabase recovery email.
   For an unknown email, the visible state is indistinguishable and no message
   is expected.

### Open recovery link

1. The user opens the most recent recovery link in the same browser context
   that requested it.
2. A dedicated server callback validates the expected recovery parameters,
   completes the one-time PKCE/token exchange using the M0-03 cookie-aware
   client, and redirects to a fixed reset-password path.
3. The callback never renders or logs a code, verifier, token, full recovery
   URL, raw provider error, or arbitrary `next` destination.
4. An expired, malformed, already-used, or context-mismatched link reaches a
   generic recovery-link error with actions to request another link or return
   to sign-in.

### Set the new password

1. Only a valid recovery-authenticated session can open the reset form.
2. The user enters and confirms a new password.
3. FitTip requires at least 8 characters and an exact confirmation match,
   allows paste/password managers, and adds no symbol rule.
4. The server updates the password through Supabase Auth; FitTip never stores
   the password or a reset token.
5. On success, FitTip signs out the recovery session and, subject to the
   product decision below, requests global sign-out so existing refresh
   sessions cannot continue. The user returns to sign-in and uses the new
   password.

## Scope

### UI and safe states

- Add the request screen, generic request confirmation, reset screen, success
  state, and generic invalid-link state.
- Keep forms usable at a 390px viewport with associated labels, keyboard
  focus, password-manager-compatible fields, non-color-only errors, and no
  password value echoed after failure.
- Keep existence-sensitive conditions out of visible copy, status codes,
  redirects, and client-visible structured errors.

### Server/Auth handling

- Reuse M0-03's cookie-aware SSR clients and server-only Auth error mapping.
- Normalize email only as already approved by M0-03; do not persist it in a
  FitTip table or place it in application logs/analytics.
- Initiate `resetPasswordForEmail` with the exact local recovery callback URL.
- Permit only configured same-origin redirect destinations. Do not trust a
  caller-supplied `next`, `redirectTo`, host, or origin.
- Complete the supported one-time PKCE/token exchange before showing the reset
  form. Clear Auth parameters from the browser URL on success and failure.
- Require a recovery-authenticated session immediately before `updateUser`;
  possessing a normal unauthenticated page URL is insufficient.
- Map known/unknown email, provider throttling, and ordinary provider failures
  to the same requester-visible confirmation. Record only a coarse,
  privacy-safe internal outcome if logging already exists.
- Mark callback/reset responses non-cacheable and do not include Auth values in
  error monitoring, snapshots, or referrers.

### Password and session rules

- Apply the approved minimum of 8 characters and matching confirmation at the
  form and server boundary; Supabase remains the credential store.
- Do not introduce arbitrary composition rules.
- After a successful update, clear the recovery browser session and require a
  fresh sign-in.
- Test the approved sign-out scope explicitly. Supabase documents that revoked
  refresh sessions stop refreshing while already-issued access-token JWTs may
  remain valid until expiry. M0-03B must not claim instantaneous invalidation
  unless a separately approved session-validation design proves it.
- Password-reset success must not create, replace, or modify the FitTip profile
  or any user-owned product data.

### Abuse and safety

- Rely on the supported local Supabase Auth rate limit for this local slice;
  do not build a second speculative limiter.
- Make repeated requests safe and idempotent from FitTip's perspective. Only
  the most recently valid provider-issued flow is relied on.
- Avoid account enumeration through wording, page transitions, status codes,
  or raw errors. Exact response-time equalization is not promised; the reviewer
  should still flag obvious application-created timing branches.
- Reject open redirects and one-time-link reuse. Do not accept reset secrets in
  ordinary form fields.
- Do not disclose whether a rate limit, delivery failure, invalid account, or
  provider error occurred to the requester.
- Hosted abuse controls, delivery monitoring, CAPTCHA, and support recovery
  remain the M0-06 gate.

## Non-goals

- Custom SMTP, branded email templates, hosted redirect/Auth settings, or
  production email-delivery validation.
- CAPTCHA, custom rate-limit tuning, IP/device reputation, or a bespoke abuse
  service.
- Signed-in password change, email change, session-management UI, account
  settings, administrator recovery, support impersonation, or recovery codes.
- Account deletion, privacy/consent UI, data export, goals, coaching, or AI.
- A migration, new application table, service-role client, secret key, remote
  project, or external-service mutation.
- Guaranteeing that a link opened on another browser/device can complete a
  PKCE flow. The user receives a safe retry path.

## Acceptance criteria

1. At 390px, the sign-in flow exposes an accessible forgotten-password path.
2. Registered and unknown emails receive the exact same visible request
   confirmation, redirect, and application status.
3. A registered local user receives one recovery email in Mailpit and can use
   its link in the initiating browser to reach the reset form.
4. The callback uses the supported one-time PKCE/session exchange, accepts no
   open redirect, and removes sensitive Auth parameters from the visible URL.
5. Expired, malformed, reused, and context-mismatched links show one generic
   safe error and cannot update a password.
6. A reset is rejected without a valid recovery-authenticated session.
7. Passwords shorter than 8 characters or with mismatched confirmation are
   rejected; paste and password-manager use remain possible.
8. A successful reset accepts the new password, rejects the old password,
   clears the recovery session, and follows the approved session-scope rule.
9. The existing profile and ownership/RLS behavior are unchanged.
10. No password, recovery URL/code/verifier/token, raw provider error, secret,
    or full submitted email appears in logs, analytics, HTML, snapshots, or
    committed files.
11. Registration, confirmation, sign-in, sign-out, protected-route, and
    cross-user M0-03 regression tests still pass.
12. No hosted setting, remote project, SMTP provider, or external service was
    changed.

## Test plan

### Unit and integration

- Email form validation and exact generic response mapping for known, unknown,
  throttled, and provider-error cases.
- Eight-character minimum, confirmation matching, paste/autofill attributes,
  and safe password error mapping.
- Callback allowlist and fixed-destination tests, including malicious `next`
  and host inputs.
- Missing, malformed, expired, reused, and wrong-context recovery parameters.
- Reset action with no recovery session, a normal signed-in session, and a
  valid recovery session.
- Successful password update, old-password rejection, required fresh sign-in,
  and the approved session scope.
- Secret/log/snapshot scan and M0-03 session/authorization regression suite.

### Local end-to-end at 390px

1. Request recovery for an unknown email; verify the generic state and no
   Mailpit message.
2. Request recovery for a fixture user; verify the identical generic state,
   open the Mailpit message in the initiating browser, set a valid password,
   and sign in afresh.
3. Reuse the link and verify safe failure.
4. Request a new link, tamper with callback/redirect parameters, and verify no
   redirect or password update occurs.
5. Try a short/mismatched password and verify the secret is neither echoed nor
   retained.
6. If global sign-out is approved, verify another refresh session can no longer
   refresh; record the documented access-token-expiry limitation.

## Implementation and handoff guidance

- Start only from the accepted M0-03 commit and preserve its callback, cookie,
  error, and route-protection conventions.
- Keep Auth calls behind the existing server boundary. Add no general account
  service or speculative abstraction.
- Suggested paths are a forgotten-password page/action, a dedicated recovery
  callback, a reset-password page/action, and focused tests; the builder may
  adapt names to the accepted M0-03 layout.
- Verify current APIs and behavior from official docs rather than copying code
  from this brief.
- The handoff must list changed files, exact local commands/results, the
  390px/Mailpit demo path, safe-response evidence, callback/open-redirect
  evidence, session-scope evidence, secret scan, known limitations, and
  confirmation that no remote change occurred.
- An independent reviewer must test both account-existence branches and the
  recovery-link negative cases before the ticket can become testable.

## Open product decisions

1. **Post-reset session scope.** Recommendation: request global sign-out and
   require fresh sign-in on every device. Alternative: clear only the recovery
   session, which is less disruptive but leaves other refresh sessions active.
2. **Success destination.** Recommendation: return to sign-in with a concise
   “Password updated” state. Alternative: keep the recovery-created session
   signed in; this is simpler for the user but weaker as a visible security
   boundary.
3. **Recovery copy.** Approve the exact generic request, invalid-link, and
   success wording. No copy in this draft is approved merely by being shown.
4. **Cross-device link behavior.** Recommendation for M0-03B: show a clear safe
   retry when the PKCE browser context is missing. Supporting cross-device
   recovery would require a separately reviewed flow rather than weakening
   PKCE/session checks.

## Current official sources reviewed

- [Supabase password-based Auth](https://supabase.com/docs/guides/auth/passwords)
- [Supabase `resetPasswordForEmail`](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail)
- [Supabase Auth sessions](https://supabase.com/docs/guides/auth/sessions)
- [Supabase signing out and session scopes](https://supabase.com/docs/guides/auth/signout)
- [Supabase Auth changelog](https://supabase.com/changelog?tags=auth)

## Approval gate

The product owner must approve this brief and resolve the four open decisions
before implementation. Approval would be local-only and would trigger the
normal `approved` to `in development` dispatch only after M0-03 is accepted.
Until then, M0-03B remains **proposed** and external MVP use remains blocked.
