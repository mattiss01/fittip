# ADR-003: Public email-and-password accounts

**Status:** accepted

**Date:** 23 July 2026

**Approval:** Product owner explicitly replaced invite-only access with public account creation in this task

**Supersedes:** The invite-only and magic-link authentication clauses of [ADR-001](ADR-001-M0-FOUNDATION.md)

**Partially superseded by:** [ADR-004](ADR-004-USERNAME-FREE-ACCOUNT-PROFILE.md) removes the username requirement while preserving public email/password accounts. The historical username-specific clauses below are superseded; M0-03 remains draft.

## Context

ADR-001 originally chose invite-only email magic links for a small private beta. The product owner has decided that FitTip should use the intended long-term account model from the beginning: a person can create their own account without an administrator first adding them to an allowlist.

Removing the invite gate does not remove the requirements for real identity, verified contact information, server-side authorization, or per-user data isolation.

## Decision

- Allow public self-service account creation.
- Use email and password as the initial authentication method.
- Require email confirmation before a new account can enter protected FitTip routes.
- Use email—not username—as the login identifier.
- Store passwords only through Supabase Auth. FitTip application tables never store a plaintext password, password hash, or password-reset token.
- Store the FitTip username in the user-owned `profiles` table. Do not duplicate the Auth email into `profiles`; the verified email is read from the authenticated identity when needed.
- Provide sign-in, sign-out, forgotten-password, and password-reset flows as part of the first authentication feature.
- Keep every user-owned row tied to the authenticated `user_id`, with server-side ownership checks and RLS.
- Keep generic authentication errors where revealing whether an email is registered would enable account enumeration.
- Treat candidate username data from Auth user metadata as untrusted input. Validate it again before inserting it into `profiles`; never use user metadata for authorization.

The exact username rules, password validation, mobile screens, and profile-provisioning sequence remain in the draft F-001 feature brief and require product-owner approval before implementation.

## Alternatives considered

### Invite-only email magic links

Superseded by product-owner direction. It limits early access but adds an administrator allowlist and does not match the desired self-service account model.

### Public magic links

Rejected as the initial default. They avoid password management but do not match the product owner's requested email-and-password experience.

### Username-and-password login

Rejected for the initial implementation. Email is already needed for confirmation and password recovery. A username remains user-facing profile information rather than a second authentication identifier.

### Social login or passkeys

Deferred. Either can be added later as an additional identity method without changing ownership keys. They add provider, recovery, and testing decisions that are unnecessary for the first account flow.

### Disable email confirmation

Rejected for hosted use. Public registration without verified email makes password recovery unreliable and permits accounts tied to addresses the registrant does not control. Local automated tests may use supported test fixtures, but hosted behavior requires confirmation.

## Consequences

- No invite table, allowlist repository, invite-administration operation, or invitation UI is needed.
- Public registration creates an abuse surface even if FitTip is not actively promoted. Hosted deployment therefore requires reviewed Auth rate limits, custom SMTP for confirmation/reset mail, and a bot-protection decision.
- FitTip must support forgotten-password and password-reset behavior rather than only login.
- A person may create an Auth identity and never confirm it. The account/profile flow must tolerate an unconfirmed identity without exposing protected data.
- Username collisions must be handled as a normal profile-completion state rather than corrupting or partially authorizing an account.
- Email changes and password changes are Auth operations, not direct profile-table edits.

## Security and privacy safeguards

- Require email confirmation for hosted environments.
- Use PKCE-compatible SSR Auth handling and verified server-side claims.
- Apply reasonable password-length settings and review leaked-password protection when the selected Supabase plan is known.
- Use generic sign-in and password-reset responses where practical.
- Add CAPTCHA/bot protection before broad public promotion, or record an explicit product-owner risk acceptance for the initial hosted beta.
- Configure custom SMTP before external users rely on confirmation or password reset.
- Never expose secret/service credentials to a browser.
- Preserve owner-only profile access with explicit grants, RLS, and cross-user tests.

## Reversal

An invite gate could be added later as a server-side registration policy without changing existing `user_id` ownership or passwords. Magic links, passkeys, or social providers can also be added as alternative identity methods. Removing password authentication after users exist would require a migration and communication plan so users retain account access.
