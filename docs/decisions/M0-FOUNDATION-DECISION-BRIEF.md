# M0 Foundation: decision brief

**Status:** approved  
**Scope:** foundation only; no training-planning features  
**Decision required before:** repository initialization and hosted deployment

**Approved by:** product owner, 22 July 2026

## Approved decision

Approve the recommended M0 foundation as one coherent, reversible starting point, or select an alternative for any individual decision below.

## Recommendation

| Area | Recommended decision | Why this is the default |
|---|---|---|
| Web application | Next.js App Router + strict TypeScript | Supports the mobile web UI and server-side domain/API boundary in one deployable application. |
| Hosting | Vercel, with preview deployments for review and separate development/production environments | Matches the selected web stack and makes each approved slice reviewable before production. |
| Database and auth | Supabase PostgreSQL + Supabase Auth | Keeps persistent identity, PostgreSQL, and ownership enforcement together while retaining an ordinary PostgreSQL data model. |
| Invite-only sign-in | Email magic link plus server-side invite allowlist | Low-friction across devices; no password handling; public registration stays disabled. |
| Authorization | `user_id` on every owned record; database Row Level Security plus server-side ownership checks | Provides defense in depth and prevents one beta user from accessing another's data. |
| Database access | Server-only repository layer using a Supabase server client; browser client limited to authenticated UI/session needs | Keeps business rules, service credentials, and AI calls off the client. |
| AI boundary | Provider-neutral `CoachAI` interface; initial provider chosen in a later M2 decision | M0 should not commit cost or behavior to an AI vendor before plan generation exists. |
| Consent | A versioned, explicit AI-data consent record is required before training notes, chat content, or health-adjacent data reach an AI provider | Creates an auditable withdrawal path without blocking account creation. |
| Deletion design | Soft-delete request state plus admin-executed deletion workflow; define backup/security-log retention before beta | Avoids claiming instant erasure where backups or audit retention apply. |
| Documentation | `docs/product`, `docs/decisions`, `docs/backlog`, `docs/validation`; approved briefs and ADRs are committed with code | Keeps agreement, implementation, and evidence together. |
| Quality gates | Typecheck, lint, unit tests, production build; Playwright mobile smoke test once an authenticated route exists | Makes each slice reviewable and catches basic regressions. |

## User-visible M0 behavior

1. An administrator adds a tester email to the invite allowlist.
2. The invited person requests a magic-link email and can sign in only if invited.
3. The authenticated user sees an empty Fittip account/profile, never another user's information.
4. A non-invited email cannot create an account or reach authenticated data.
5. The user can read the privacy/AI-data notice. M0 sends no data to an AI provider.

## Explicit non-goals

- No public sign-up, password login, social login, payment, profile onboarding, or coach conversation.
- No production AI provider call or storage of training/health data.
- No complete self-service account-deletion interface.
- No native mobile application.

## Alternatives considered

### Authentication

- **Email/password:** familiar, but adds password reset, credential handling, and beta friction.
- **Passkeys:** attractive long term, but add recovery/device complexity before they add product value.
- **Single shared password:** rejected; it prevents real identity and secure ownership isolation.

### Backend/database

- **Separate API service plus managed PostgreSQL:** viable, but adds a second deployable and operational work before the core loop is validated.
- **Local-only or single-owner store:** rejected because beta users and cross-device use require identity and isolation.

### Hosting

- **Self-managed server:** viable later, but operationally disproportionate for private beta.

## Consequences and safeguards

- Every exposed table uses Row Level Security with explicit ownership policies; server routes independently scope reads/writes to the authenticated user.
- Service-role credentials never enter browser code. Any use is limited to narrowly scoped server/admin operations.
- No authorization decision relies on user-editable profile metadata.
- Local dates are stored with the owner's timezone; events use UTC timestamps.
- The invite allowlist, consent records, deletion requests, and authorization failures are auditable without raw sensitive notes in product analytics.
- Magic-link delivery requires a configured email sender before external beta invitations. Development can use Supabase's supported development flow.

## Reversal and migration approach

The domain layer depends on repository interfaces rather than UI components. Supabase remains standard PostgreSQL, so data can move to another PostgreSQL provider. Authentication identities are referenced through a local user/profile relation rather than scattered provider-specific fields. Moving away from magic links requires a new authentication decision and migration/testing plan, but does not alter ownership records.

## Approval checklist

- [x] Approve Next.js + Vercel.
- [x] Approve Supabase PostgreSQL + Auth.
- [x] Approve invite-only email magic links.
- [x] Approve RLS plus server-side ownership checks.
- [x] Approve the consent/deletion direction.
- [x] Approve deferring the AI provider to M2.
- [x] Approve the Product Plan's collaboration protocol.

## Once approved

Create the M0 ADR, `AGENTS.md`, repository tooling, environment documentation, and the first feature brief/ticket for invite-only sign-in and isolated empty profiles. No other application feature begins without its own approved brief.
