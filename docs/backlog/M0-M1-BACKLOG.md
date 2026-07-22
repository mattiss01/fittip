# M0/M1 backlog

**Planning state:** M0 foundation and M0-01 are accepted. M0-02 is unblocked for planning but remains proposed and cannot enter development until its migration/RLS brief is approved. Every later ticket remains blocked until its dependencies and linked approval gate are satisfied.

| Priority | Ticket | Status | Depends on | Scope | Approval gate |
|---|---|---|---|---|---|
| P0 | [M0-01 Repository/tooling baseline](M0-01-REPOSITORY-TOOLING-BASELINE.md) | accepted | ADR-001 | Next.js setup, strict TypeScript, lint, format, unit-test and production-build commands | Accepted by product owner on 22 July 2026 |
| P0 | M0-02 Data/authorization foundation | proposed | M0-01 accepted | Current Supabase project/config review; profile and invite migrations; explicit RLS and Data API access; server repository boundary; cross-user isolation tests | Approve a migration/RLS brief before any shared database change |
| P0 | [M0-03 Invite-only sign-in and isolated empty profile](../product/F-001-INVITE-ONLY-SIGN-IN.md) | draft | M0-02 accepted | Magic-link request, server-enforced invite gate, session handling, sign-out, and an empty protected route | Approve feature brief F-001 |
| P0 | M0-04 Privacy, consent, and deletion-operation design | proposed | M0-02 accepted | User-facing notice; versioned AI-data consent and withdrawal records; deletion-request workflow; data inventory; privacy-policy outline; backup/security-log retention decisions | Approve consent wording, processors/data flow, and retention choices |
| P0 | M0-05 Privacy-safe instrumentation and AI request controls | proposed | M0-02 and M0-04 accepted | Privacy-safe product-event contract; server-side AI rate-limit boundary; AI provider/model/prompt/validation/cost telemetry contract; no production AI provider call | Approve analytics data fields, retention, rate-limit defaults, and cost boundary |
| P0 | M0-06 Quality and deployment baseline | proposed | M0-03, M0-04, and M0-05 accepted | CI checks; preview deployment; separate environment documentation; hosted 390px auth smoke test; consolidated M0 validation record | Approve any external service/environment additions not already covered by ADR-001 |
| P1 | M1-01 Goal model and validation | proposed | M0-06 accepted | Goal CRUD, active/core/rank constraints, server/domain validation | Approve goal-management feature brief |
| P1 | M1-02 Memory model and management | proposed | M0-06 accepted | Profile facts, constraints, preferences; inspect/edit/disable UI | Approve memory feature brief |
| P1 | M1-03 Intake fact review | proposed | M1-01 and M1-02 accepted | Structured intake input, candidate-fact review and confirmation; no AI extraction yet unless separately approved | Approve onboarding flow and required-field choices |
| P1 | M1-04 Mobile navigation and empty states | proposed | M0-06 accepted | Today, Plan, Coach, Progress, You tabs with only approved content | Approve information-architecture brief |
| P1 | M1-05 M1 validation slice | proposed | M1-01 through M1-04 accepted | 390px walkthrough and automated tests for goals/memory ownership | No new product decision; validation follows the approved M1 briefs |

M0-05 is now the explicit owner of the request-control, AI telemetry-contract, and privacy-safe event work required by the Product Plan. The previous quality/deployment ticket moves to M0-06. This is a planning correction only; neither ticket is approved for implementation.

Consent tables have intentionally moved out of M0-02 and into M0-04 so their schema cannot precede approval of the consent, withdrawal, processor, and retention decisions. M0-02 may establish generic ownership conventions but must not guess those privacy semantics.

## Ticket rule

Each ticket must be independently demonstrable and have its own scope, non-goals, acceptance criteria, test plan, dependencies, and links to applicable briefs/ADRs. A proposed or draft ticket cannot start merely because a parent milestone is approved. Before implementation it needs either a linked approved feature brief or documented product-owner confirmation that it contains only already approved foundation behavior.

For Supabase work, the builder must review the current official changelog and topic documentation before implementation, create schema changes through the supported migration workflow, enable RLS on every exposed user-data table, and test both permitted owner access and denied cross-user access. Authentication alone is not authorization.
