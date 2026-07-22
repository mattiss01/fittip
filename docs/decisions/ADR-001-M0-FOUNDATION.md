# ADR-001: M0 application foundation

**Status:** accepted  
**Date:** 22 July 2026  
**Approval:** Product owner approved M0 in this task

## Context

Fittip needs private-beta access from multiple devices while preserving user isolation and keeping a future native client possible. M0 must establish a production-shaped foundation without implementing training features or committing to an AI provider.

## Decision

- Build a mobile-first Next.js App Router application in strict TypeScript and deploy it on Vercel.
- Use Supabase PostgreSQL and Supabase Auth.
- Use invite-only email magic links, controlled by a server-side allowlist; public sign-up is out of scope.
- Give every owned row a `user_id`. Enforce ownership with both server-side checks and database Row Level Security.
- Keep database access and domain logic server-side behind repositories/services. Browser code has no service-role credential and no business-rule authority.
- Store versioned AI-data consent before any AI-bound user content is sent. Deletion begins as an auditable request plus administrator-executed workflow; backup and security-log retention are defined before external beta.
- Keep the `CoachAI` interface provider-neutral; decide a provider/model in M2.

## Alternatives considered

- Email/password, passkeys, a shared password, and public registration.
- A separate API service and managed PostgreSQL.
- Local-only persistence or a single shared profile.
- Self-managed hosting.

These alternatives were rejected for M0 because they add avoidable operational/product complexity or fail the cross-device ownership requirement.

## Consequences

- Development requires Supabase and Vercel configuration before a hosted demo is possible.
- All future data models and migrations must preserve ownership and RLS invariants.
- Magic-link email configuration must be reviewed before inviting external testers.
- An AI vendor decision and costs remain intentionally unresolved until plan-generation scope is approved.

## Reversal

The domain model uses PostgreSQL and server-side repositories, which limits coupling to Supabase. A future migration needs a dedicated ADR, data-migration plan, and authorization regression tests. Changing authentication methods must retain the local user/profile relation and ownership records.
