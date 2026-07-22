# F-001: Invite-only sign-in and isolated empty profile

**Status:** draft — product-owner approval required before implementation  
**Ticket:** M0-03  
**Depends on:** ADR-001, M0-02

## User problem and outcome

An invited tester needs to access their own Fittip account securely from a mobile browser. No person may access another tester's records, and a non-invited person must not create an account.

## Proposed user flow

1. An administrator places a tester email on the server-side invite allowlist.
2. The visitor enters that email on a simple sign-in screen.
3. If invited, the system sends an email magic link and displays a neutral confirmation message.
4. The visitor opens the link and reaches an authenticated empty profile/home screen.
5. If not invited, the visitor receives the same neutral confirmation message and cannot obtain an authenticated account.
6. An authenticated user can sign out; protected routes redirect unauthenticated visitors to sign-in.

## Data and rules

- `profiles` and all future user-owned entities use the authenticated user id as ownership key.
- Invite records contain the normalized email, state, timestamps, and optional administrative note; they do not expose the invite list to clients.
- Consent is not required merely to sign in. It is required before any future AI-bound content transfer.
- Sign-in attempts and messages must not reveal whether an email was invited.

## Non-goals

- Public registration, passwords, social login, profile editing, onboarding questions, AI coaching, or email-template branding.
- A full administrator UI. M0 may use a documented server/admin operation to add or revoke an invite.

## Acceptance criteria

1. At a 390px viewport, an invited tester can request and complete magic-link sign-in.
2. A non-invited email cannot get an authenticated session or protected data.
3. Two test users cannot read or modify each other's profile data through UI or direct requests.
4. Protected routes redirect an unauthenticated visitor to sign-in.
5. Sign-out ends browser access to protected routes.
6. The empty authenticated screen clearly identifies Fittip and contains no unapproved training features.
7. Automated tests cover invite gating and authorization; a mobile end-to-end happy path is documented.

## Validation plan

- Unit/integration tests: invite eligibility, session guard, and ownership repository scope.
- RLS integration test: user A cannot select/update user B's row.
- Playwright: invited user signs in on a 390px viewport and reaches the protected empty screen.
- Manual: repeat with a non-invited email and confirm neutral response/no session.

## Decision requested

Approve this exact sign-in behavior, including the neutral response for non-invited emails and the absence of an administrator UI in M0. If you prefer visible rejection, a password, passkeys, or an invite-link-only flow, say so and this brief will be revised before code begins.
