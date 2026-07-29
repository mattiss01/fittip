# M0 backlog

**Planning state:** M0 foundation, M0-01, M0-02, M0-02-C1, the reduced
basic-auth M0-03, ADR-006, ADR-007, and founder-hosted M0-06A are accepted.
M0-03B, M0-04, M0-05, and M0-06 remain proposed external-use gates.

| Priority | Ticket | Status | Depends on | Scope | Approval gate |
|---|---|---|---|---|---|
| P0 | [M0-01 Repository/tooling baseline](M0-01-REPOSITORY-TOOLING-BASELINE.md) | accepted | ADR-001 | Next.js, strict TypeScript, lint, formatting, unit tests, and production build | Accepted 22 July 2026 |
| P0 | [M0-02 Data/authorization foundation](M0-02-DATA-AUTHORIZATION-FOUNDATION.md) | accepted (corrected by M0-02-C1) | M0-01 and ADR-003 | Local Supabase, username-free profile, explicit privileges/RLS, server repository, cross-user isolation | Accepted 23 July 2026; remote target separately gated |
| P0 | [M0-02-C1 Remove username](M0-02-C1-REMOVE-USERNAME.md) | accepted | M0-02 | Correct local profile schema/repository/tests/types/docs while preserving RLS | Accepted 26 July 2026 |
| P0 | [M0-03 Basic account authentication](../../product/F-001-PUBLIC-ACCOUNT-AUTHENTICATION.md) | accepted | M0-02-C1 and ADR-005 | Email/password signup, local confirmation, profile creation, sign-in/out, sessions, protected route | Accepted 26 July 2026; hosted signup/recovery excluded |
| P0 | [M0-06A Founder-hosted staging](M0-06A-FOUNDER-HOSTED-STAGING.md) | accepted | M0-03, M0-02-C1, ADR-007 | Owner-only Vercel/Supabase staging with signup closed and hosted RLS/390px validation | Accepted 27 July 2026; owner/synthetic only |
| P0 | [M0-03B Account recovery](M0-03B-ACCOUNT-RECOVERY.md) | proposed | M0-03 accepted | Local forgotten-password/reset flow and safe session behavior | Approve recovery brief and four open UX/session decisions |
| P0 | [M0-04 Privacy, consent, and deletion design](M0-04-PRIVACY-CONSENT-DELETION-DESIGN.md) | proposed | M0-02/C1 accepted | Design notice, AI consent/withdrawal, deletion operation, inventory, retention, access/export; no schema | Approve product/legal/processor decisions and later create implementation slices |
| P0 | [M0-05 Privacy-safe instrumentation and AI controls](M0-05-PRIVACY-SAFE-INSTRUMENTATION-AI-CONTROLS.md) | proposed | M0-04 accepted | Default-deny event contract and server AI consent/rate/budget/telemetry boundary | Approve fields, deletion/retention, rate/budget behavior, and privacy implementation dependency |
| P0 | [M0-06 Quality and deployment baseline](M0-06-QUALITY-DEPLOYMENT-BASELINE.md) | proposed | M0-03B, M0-04, M0-05 accepted | CI, protected environments, migration/backup/rollback, hosted email/bot/privacy/auth validation | Approve exact targets, providers, access, monitoring, privacy dependency, and cost ceiling |

## External-use boundary

M0-06A permits only product-owner or synthetic data in disposable founder
staging. Before any friend, external user, public registration, commercial use,
analytics sink, or production claim:

1. M0-03B account recovery must be accepted.
2. M0-04 privacy design and its later implementation slices must be accepted.
3. M0-05 instrumentation and AI request controls must be accepted with their
   required persistent privacy dependencies.
4. M0-06 must pass its full hosted quality/deployment gate.

M0-04 remains design-only. The lead must create the missing privacy
implementation ticket before external registration; accepting the design alone
does not authorize schema, consent UI, deletion operations, or processors.

## Ticket rule

Every M0 ticket has its own approval gate. Acceptance of M0 foundation or
founder staging never approves a proposed recovery, privacy, instrumentation,
or production-deployment ticket.

For Supabase work, use current official guidance and supported migrations,
enable RLS with explicit owner predicates, and prove owner access plus
anonymous and cross-user denial.
