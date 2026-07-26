# F-001: Public account registration and authentication

**Status:** draft — product-owner approval required before implementation

**Ticket:** M0-03

**Depends on:** [ADR-003](../decisions/ADR-003-PUBLIC-EMAIL-PASSWORD-AUTH.md), [ADR-004](../decisions/ADR-004-USERNAME-FREE-ACCOUNT-PROFILE.md), M0-02-C1 accepted

## User problem and outcome

A person needs to create and recover their own permanent FitTip account without waiting for an invitation. The account must work across devices, and no user may read or modify another user's profile.

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

### Forgotten password

1. The visitor requests password recovery with an email address.
2. FitTip always displays the same confirmation response.
3. A valid recovery link opens a set-new-password screen.
4. After a successful reset, the user can sign in with the new password.

## Data and rules

### Authentication data

- Supabase Auth owns the verified email, password hash, confirmation tokens, reset tokens, sessions, and authentication events.
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
- Password changes outside the recovery flow are deferred to a later account-settings feature.

### Profile and authorization

- `profiles` contains only the authenticated `user_id` and its creation timestamp; every future owned entity uses the same ownership key.
- Profile creation accepts no user-editable profile or ownership field.
- No RLS policy or server authorization decision uses email or user-editable Auth metadata.
- Protected routes validate the authenticated server session; repositories independently filter by `user_id`; RLS remains the database backstop.

## Abuse and email-delivery boundary

Public account creation is intentionally allowed, but the deployed Auth endpoint can still receive automated traffic.

- Local development uses Supabase's supported email-capture flow.
- Before external registration is enabled, M0-06 must configure or approve custom SMTP for confirmation and recovery mail.
- M0-06 must review Supabase Auth rate limits and either add CAPTCHA/bot protection or record explicit product-owner acceptance of the initial risk.
- Error messages must not expose secrets, raw provider errors, or account existence.

## Non-goals

- Invite allowlist, invitation links, administrator account-creation UI, or manual account approval.
- Social login, phone login, passkeys, MFA, or passwordless login.
- Display name, public handle, profile biography/avatar, detailed onboarding, goals, memory, plans, AI coaching, payment, or account deletion UI.
- Branded production email templates before the email-provider/deployment decision.

## Acceptance criteria

1. At a 390px viewport, a new user can submit a valid email and password.
2. The user cannot reach protected FitTip content before confirming the email.
3. Following a valid confirmation link creates a verified session and an owner-scoped minimal profile.
4. A verified user can sign in with email/password and sign out.
5. Invalid sign-in and password-recovery attempts do not reveal whether an email is registered.
6. A user can complete the forgotten-password/reset flow using the supported local email-capture path.
7. Two test users cannot read or modify each other's profiles through UI, repository, or direct Data API requests.
8. Unauthenticated users are redirected from protected routes.
9. No password or Auth token appears in logs, analytics, HTML, committed files, or test snapshots.
10. The authenticated screen clearly identifies FitTip and contains no unapproved training features.
11. Automated tests cover registration, confirmation, minimal profile creation, sign-in, reset, sign-out, session guards, and authorization.

## Validation plan

- Unit tests: password validation, safe error mapping, and profile-creation state.
- Repository tests: current-user ownership scope and caller-input-free profile creation.
- RLS tests: user A cannot select or update user B's profile; unauthenticated access is denied.
- Integration tests: unconfirmed versus confirmed sessions, profile creation, generic invalid-credential/recovery responses, and password reset.
- Playwright at 390px: create account → confirm through local email capture → protected screen → sign out → sign in.
- Security inspection: browser bundle, logs, environment variables, and snapshots contain no secret key, password, or token.

## Decision summary

1. **Password minimum:** product owner selected 8 characters without an arbitrary symbol requirement.
2. **Bot protection timing:** recommended—keep M0-03 local/testable, then require the M0-06 hosted-environment gate before exposing registration externally.

## Decision requested

Approve this username-free public account flow, password minimum, email-confirmation requirement, recovery flow, and hosted abuse/email-delivery gate. Because M0-02-C1 is accepted, approval moves F-001 to **in development** and triggers automatic builder assignment and implementation.
