# ADR-005: Stage MVP authentication before account recovery

**Status:** accepted

**Date:** 26 July 2026

**Approval:** Product owner approved reducing M0-03 to the basic testable MVP authentication flow

**Supersedes:** The requirement in [ADR-003](ADR-003-PUBLIC-EMAIL-PASSWORD-AUTH.md) to implement forgotten-password and password-reset behavior in the first authentication ticket

## Context

F-001 originally combined account creation, email confirmation, sign-in, sign-out, session protection, profile creation, password recovery, and production email-delivery concerns. The product owner wants the smallest authentication slice that can be tested now and later used as the MVP foundation, without spending time on recovery and hosted-email hardening before they are needed.

## Decision

M0-03 implements only:

- public email/password account creation;
- an eight-character password minimum;
- email confirmation through the local Supabase Mailpit flow;
- the server-side confirmation/token-exchange route;
- sign-in and sign-out;
- session persistence and protected-route enforcement;
- caller-input-free minimal profile creation; and
- owner/anonymous/cross-user security tests.

M0-03 does not implement:

- forgotten-password or password-reset screens and callbacks;
- password changes or account settings;
- custom SMTP, branded hosted templates, CAPTCHA, or hosted rate-limit tuning; or
- production email-delivery testing.

Account recovery becomes a separate proposed M0-03B ticket. It must be accepted before FitTip is offered to external MVP users. Hosted SMTP, bot protection, and production delivery remain part of the M0-06 environment gate.

## Consequences

- M0-03 becomes smaller and faster while still proving the complete signup, confirmation, session, profile, and authorization foundation.
- Local confirmation email remains because the final account model depends on verified email.
- A local/internal MVP user who forgets a password has no self-service recovery until M0-03B.
- External MVP use remains blocked until recovery and hosted email delivery are implemented and accepted.

## Reversal

M0-03B can add recovery without changing account ownership or the M0-03 session boundary. Other authentication methods remain separately approved future work.
