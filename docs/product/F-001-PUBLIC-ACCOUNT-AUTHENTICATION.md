# F-001: Basic public account registration and authentication

**Status:** accepted — product owner accepted the reviewed implementation 26 July 2026

**Ticket:** M0-03

**Depends on:** [ADR-003](../decisions/ADR-003-PUBLIC-EMAIL-PASSWORD-AUTH.md), [ADR-004](../decisions/ADR-004-USERNAME-FREE-ACCOUNT-PROFILE.md), M0-02-C1 accepted

**Scope decision:** [ADR-005](../decisions/ADR-005-STAGED-MVP-AUTHENTICATION.md)

## User problem and outcome

A person needs to create and use their own permanent FitTip account without waiting for an invitation. The account must work across devices, and no user may read or modify another user's profile.

## Proposed user flow

### Create account

1. The visitor chooses **Create account**.
2. The visitor enters an email address, password, and password confirmation.
3. FitTip validates the input and requests a Supabase email/password signup using the SSR-compatible PKCE flow.
4. FitTip displays a generic “check your email” state.
5. The visitor follows the confirmation link, establishing a verified session.
6. The server creates the minimal profile for the authenticated `user_id` without caller-supplied profile data.
7. The user reaches a minimal protected FitTip home/profile screen.

### Sign in and sign out

1. An existing user enters email and password.
2. Invalid credentials return one generic error without confirming whether the email exists.
3. A valid verified account reaches the protected FitTip screen.
4. Sign-out ends browser access to protected routes.

## Data and rules

### Authentication data

- Supabase Auth owns the verified email, password hash, confirmation tokens, sessions, and authentication events.
- FitTip never stores a password, password hash, or password-reset token in `public.profiles`.
- The verified email is read from the authenticated identity when needed; it is not duplicated into the profile table.
- Email confirmation is required before protected access in hosted environments.
- Consent is not required merely to create or access an account. It is required before future AI-bound content transfer.

### Proposed password rules

- Minimum 8 characters.
- Password and confirmation must match.
- Allow paste and password-manager/autofill use.
- Never log, return, persist in application state longer than necessary, or include in analytics.
- Use Supabase Auth password settings and review leaked-password protection when the selected plan is known.
- Forgotten-password, password-reset, and password-change behavior is deferred to M0-03B and later account settings.

### Profile and authorization

- `profiles` contains only the authenticated `user_id` and its creation timestamp; every future owned entity uses the same ownership key.
- Profile creation accepts no user-editable profile or ownership field.
- No RLS policy or server authorization decision uses email or user-editable Auth metadata.
- Protected routes validate the authenticated server session; repositories independently filter by `user_id`; RLS remains the database backstop.

## Abuse and email-delivery boundary

Public account creation is intentionally allowed, but the deployed Auth endpoint can still receive automated traffic.

- Local development uses Supabase's supported email-capture flow.
- Before external registration is enabled, M0-03B must add account recovery and M0-06 must configure or approve custom SMTP for confirmation and recovery mail.
- M0-06 must review Supabase Auth rate limits and either add CAPTCHA/bot protection or record explicit product-owner acceptance of the initial risk.
- Error messages must not expose secrets, raw provider errors, or account existence.

## Non-goals

- Invite allowlist, invitation links, administrator account-creation UI, or manual account approval.
- Social login, phone login, passkeys, MFA, or passwordless login.
- Forgotten-password, password-reset, and password-change screens or callbacks.
- Display name, public handle, profile biography/avatar, detailed onboarding, goals, memory, plans, AI coaching, payment, or account deletion UI.
- Branded production email templates before the email-provider/deployment decision.

## Acceptance criteria

1. At a 390px viewport, a new user can submit a valid email and password.
2. The user cannot reach protected FitTip content before confirming the email.
3. Following a valid confirmation link creates a verified session and an owner-scoped minimal profile.
4. A verified user can sign in with email/password and sign out.
5. Invalid sign-in attempts use a generic safe error.
6. Two test users cannot read or modify each other's profiles through UI, repository, or direct Data API requests.
7. Unauthenticated users are redirected from protected routes.
8. No password or Auth token appears in logs, analytics, HTML, committed files, or test snapshots.
9. The authenticated screen clearly identifies FitTip and contains no unapproved training features.
10. Automated tests cover registration, confirmation, minimal profile creation, sign-in, sign-out, session guards, and authorization.

## Validation plan

- Unit tests: password validation, safe error mapping, and profile-creation state.
- Repository tests: current-user ownership scope and caller-input-free profile creation.
- RLS tests: user A cannot select or update user B's profile; unauthenticated access is denied.
- Integration tests: unconfirmed versus confirmed sessions, profile creation, and generic invalid-credential responses.
- Playwright at 390px: create account → confirm through local email capture → protected screen → sign out → sign in.
- Security inspection: browser bundle, logs, environment variables, and snapshots contain no secret key, password, or token.

## Decision summary

1. **Password minimum:** product owner selected 8 characters without an arbitrary symbol requirement.
2. **Recovery timing:** product owner deferred recovery to M0-03B before external MVP use.
3. **Bot protection timing:** keep M0-03 local/testable, then require the M0-06 hosted-environment gate before exposing registration externally.

## Approval record

The product owner approved this reduced username-free MVP authentication scope on 26 July 2026. The implementation and corrective independent review passed, and the product owner accepted M0-03 on 26 July 2026. See the [M0-03 validation record](../validation/M0-03-VALIDATION.md). Acceptance remains local-only and does not authorize a hosted Supabase project, custom SMTP, external registration, account recovery, or M0-06 behavior.
