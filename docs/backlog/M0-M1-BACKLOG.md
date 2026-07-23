# M0/M1 backlog

**Planning state:** M0 foundation, M0-01, and M0-02 are accepted. The approved M0-02-C1 username-removal correction is in development and blocks M0-03. M0-03 remains draft until both the correction is accepted and the product owner approves its revised F-001 feature brief. Every later ticket remains blocked until its dependencies and linked approval gate are satisfied.

| Priority | Ticket | Status | Depends on | Scope | Approval gate |
|---|---|---|---|---|---|
| P0 | [M0-01 Repository/tooling baseline](M0-01-REPOSITORY-TOOLING-BASELINE.md) | accepted | ADR-001 | Next.js setup, strict TypeScript, lint, format, unit-test and production-build commands | Accepted by product owner on 22 July 2026 |
| P0 | [M0-02 Data/authorization foundation](M0-02-DATA-AUTHORIZATION-FOUNDATION.md) | accepted | M0-01 accepted and ADR-003 | Local Supabase baseline; username-backed profile migration; explicit privileges/RLS; server repository boundary; cross-user isolation tests | Builder and independent re-review passed; reviewed implementation accepted by product owner on 23 July 2026; exact remote target remains separately gated |
| P0 | [M0-02-C1 Remove username](M0-02-C1-REMOVE-USERNAME.md) | in development | M0-02 accepted and ADR-004 | Correct the local-only profile schema, repository, tests, generated types, and governing docs while preserving RLS and ownership | Product owner approved removal on 23 July 2026; assigned automatically to a `gpt-5.6-terra` builder; remote changes remain prohibited |
| P0 | [M0-03 Public account registration and authentication](../product/F-001-PUBLIC-ACCOUNT-AUTHENTICATION.md) | draft | M0-02-C1 accepted | Public email/password signup, email confirmation, profile creation, sign-in/reset/sign-out, sessions, and protected route | Approve the username-free revised feature brief F-001 after M0-02-C1 is accepted |
| P0 | M0-04 Privacy, consent, and deletion-operation design | proposed | M0-02 accepted | User-facing notice; versioned AI-data consent and withdrawal records; deletion-request workflow; data inventory; privacy-policy outline; backup/security-log retention decisions | Approve consent wording, processors/data flow, and retention choices |
| P0 | M0-05 Privacy-safe instrumentation and AI request controls | proposed | M0-02 and M0-04 accepted | Privacy-safe product-event contract; server-side AI rate-limit boundary; AI provider/model/prompt/validation/cost telemetry contract; no production AI provider call | Approve analytics data fields, retention, rate-limit defaults, and cost boundary |
| P0 | M0-06 Quality and deployment baseline | proposed | M0-03, M0-04, and M0-05 accepted | CI checks; preview deployment; separate environment documentation; custom Auth SMTP; registration rate-limit/CAPTCHA decision; hosted 390px auth smoke test; consolidated M0 validation record | Approve the exact remote environment, email provider, bot-protection choice, and any other external service |
| P1 | M1-01 Goal model and validation | proposed | M0-06 accepted | Goal CRUD, active/core/rank constraints, server/domain validation | Approve goal-management feature brief |
| P1 | M1-02 Memory model and management | proposed | M0-06 accepted | Profile facts, constraints, preferences; inspect/edit/disable UI | Approve memory feature brief |
| P1 | M1-03 Intake fact review | proposed | M1-01 and M1-02 accepted | Structured intake input, candidate-fact review and confirmation; no AI extraction yet unless separately approved | Approve onboarding flow and required-field choices |
| P1 | M1-04 Mobile navigation and empty states | proposed | M0-06 accepted | Today, Plan, Coach, Progress, You tabs with only approved content | Approve information-architecture brief |
| P1 | M1-05 M1 validation slice | proposed | M1-01 through M1-04 accepted | 390px walkthrough and automated tests for goals/memory ownership | No new product decision; validation follows the approved M1 briefs |

M0-05 is now the explicit owner of the request-control, AI telemetry-contract, and privacy-safe event work required by the Product Plan. The previous quality/deployment ticket moves to M0-06. This is a planning correction only; neither ticket is approved for implementation.

Consent tables have intentionally moved out of M0-02 and into M0-04 so their schema cannot precede approval of the consent, withdrawal, processor, and retention decisions. M0-02 may establish generic ownership conventions but must not guess those privacy semantics.

ADR-003 supersedes the earlier invite-only magic-link decision. M0-02 no longer contains an invite table or secret invite repository; M0-03 now owns public email/password registration, verified email, username profile completion, recovery, and session behavior.

## Ticket rule

Each ticket must be independently demonstrable and have its own scope, non-goals, acceptance criteria, test plan, dependencies, and links to applicable briefs/ADRs. A proposed or draft ticket cannot start merely because a parent milestone is approved. Before implementation it needs either a linked approved feature brief or documented product-owner confirmation that it contains only already approved foundation behavior.

Once the product owner approves a ticket and its dependencies are satisfied, the lead agent must immediately mark it `in development`, assign one builder, and start work. The lead agent also assigns an independent reviewer after the builder handoff; neither transition requires another product-owner prompt.

For Supabase work, the builder must review the current official changelog and topic documentation before implementation, create schema changes through the supported migration workflow, enable RLS on every exposed user-data table, and test both permitted owner access and denied cross-user access. Authentication alone is not authorization.
