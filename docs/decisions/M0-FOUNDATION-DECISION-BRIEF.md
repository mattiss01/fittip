# M0 Foundation: decision brief

**Status:** approved  
**Scope:** foundation only; no training-planning features  
**Decision required before:** repository initialization and hosted deployment

**Approved by:** product owner, 22 July 2026; authentication amended by product owner, 23 July 2026

## Approved decision

Approve the recommended M0 foundation as one coherent, reversible starting point, or select an alternative for any individual decision below.

## Recommendation

| Area | Recommended decision | Why this is the default |
|---|---|---|
| Web application | Next.js App Router + strict TypeScript | Supports the mobile web UI and server-side domain/API boundary in one deployable application. |
| Hosting | Vercel, with preview deployments for review and separate development/production environments | Matches the selected web stack and makes each approved slice reviewable before production. |
| Database and auth | Supabase PostgreSQL + Supabase Auth | Keeps persistent identity, PostgreSQL, and ownership enforcement together while retaining an ordinary PostgreSQL data model. |
| Account registration | Public email-and-password registration, verified email, and username-backed profile | Matches the intended self-service account model while retaining reliable recovery and permanent ownership. |
| Authorization | `user_id` on every owned record; database Row Level Security plus server-side ownership checks | Provides defense in depth and prevents one beta user from accessing another's data. |
| Database access | Server-only repository layer using a Supabase server client; browser client limited to authenticated UI/session needs | Keeps business rules, service credentials, and AI calls off the client. |
| AI boundary | Provider-neutral `CoachAI` interface; initial provider chosen in a later M2 decision | M0 should not commit cost or behavior to an AI vendor before plan generation exists. |
| Consent | A versioned, explicit AI-data consent record is required before training notes, chat content, or health-adjacent data reach an AI provider | Creates an auditable withdrawal path without blocking account creation. |
| Deletion design | Soft-delete request state plus admin-executed deletion workflow; define backup/security-log retention before beta | Avoids claiming instant erasure where backups or audit retention apply. |
| Documentation | `docs/product`, `docs/decisions`, `docs/backlog`, `docs/validation`; approved briefs and ADRs are committed with code | Keeps agreement, implementation, and evidence together. |
| Quality gates | Typecheck, lint, unit tests, production build; Playwright mobile smoke test once an authenticated route exists | Makes each slice reviewable and catches basic regressions. |

## User-visible M0 behavior

1. A person creates an account with a username, email address, and password.
2. The person confirms control of the email address before entering protected FitTip routes.
3. The verified user can sign in with email and password, reset a forgotten password, and sign out.
4. The authenticated user sees their own minimal FitTip profile, never another user's information.
5. The user can read the privacy/AI-data notice. M0 sends no data to an AI provider.

## Explicit non-goals

- No social login, passkeys, payment, detailed profile onboarding, or coach conversation.
- No production AI provider call or storage of training/health data.
- No complete self-service account-deletion interface.
- No native mobile application.

## Alternatives considered

### Authentication

- **Invite-only magic links:** initially approved, then superseded by the product owner's public-account decision on 23 July 2026.
- **Public magic links:** lower password friction, but do not match the requested email-and-password experience.
- **Passkeys:** attractive later, but add recovery/device compatibility decisions before they add product value.
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
- Account, consent, deletion-request, and authorization events are auditable without raw sensitive notes in product analytics.
- Email confirmation and password reset require a configured sender before external registration. Development can use Supabase's supported local email-capture flow.
- Public registration requires reviewed Auth rate limits and a bot-protection decision before broad promotion.

## Reversal and migration approach

The domain layer depends on repository interfaces rather than UI components. Supabase remains standard PostgreSQL, so data can move to another PostgreSQL provider. Authentication identities are referenced through a local user/profile relation rather than scattered provider-specific fields. Adding another sign-in method requires a new authentication decision and testing plan but does not alter ownership records.

## Approval checklist

- [x] Approve Next.js + Vercel.
- [x] Approve Supabase PostgreSQL + Auth.
- [x] Approve public email-and-password registration with verified email (supersedes invite-only magic links on 23 July 2026).
- [x] Approve RLS plus server-side ownership checks.
- [x] Approve the consent/deletion direction.
- [x] Approve deferring the AI provider to M2.
- [x] Approve the Product Plan's collaboration protocol.

## Once approved

Create the M0 ADRs, `AGENTS.md`, repository tooling, environment documentation, and the first feature brief/ticket for public email/password accounts and isolated profiles. No other application feature begins without its own approved brief.
