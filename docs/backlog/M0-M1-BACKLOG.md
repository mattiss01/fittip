# M0/M1 backlog

**Planning state:** M0 foundation, M0-01, M0-02, M0-02-C1, the reduced
basic-auth M0-03, and the local-owner AI staging principle in ADR-006 are
accepted. M0-03B, M0-04, M0-05, and M0-06 remain proposed pre-friends/hosted
gates. Independently approved M1/M2 tickets may proceed locally with only the
product owner or synthetic data; no friend data, hosted/external use, analytics
sink, provider/model/key, or spend is authorized by this staging change.

| Priority | Ticket | Status | Depends on | Scope | Approval gate |
|---|---|---|---|---|---|
| P0 | [M0-01 Repository/tooling baseline](M0-01-REPOSITORY-TOOLING-BASELINE.md) | accepted | ADR-001 | Next.js setup, strict TypeScript, lint, format, unit-test and production-build commands | Accepted by product owner on 22 July 2026 |
| P0 | [M0-02 Data/authorization foundation](M0-02-DATA-AUTHORIZATION-FOUNDATION.md) | accepted (corrected locally by M0-02-C1) | M0-01 accepted and ADR-003 | Local Supabase baseline; minimal username-free profile migration; explicit privileges/RLS; server repository boundary; cross-user isolation tests | Original reviewed implementation was accepted on 23 July 2026; M0-02-C1 corrects the never-remotely-applied baseline; exact remote target remains separately gated |
| P0 | [M0-02-C1 Remove username](M0-02-C1-REMOVE-USERNAME.md) | accepted | M0-02 accepted and ADR-004 | Correct the local-only profile schema, repository, tests, generated types, and governing docs while preserving RLS and ownership | `gpt-5.6-terra` builder and independent review passed; reviewed correction accepted by product owner on 26 July 2026; remote changes remain prohibited |
| P0 | [M0-03 Basic public account authentication](../product/F-001-PUBLIC-ACCOUNT-AUTHENTICATION.md) | accepted | M0-02-C1 accepted and ADR-005 | Email/password signup, local email confirmation, profile creation, sign-in/sign-out, sessions, protected route, and authorization tests | Implementation and independent review passed; accepted by the product owner on 26 July 2026; hosted and recovery work remain prohibited |
| P0 | [M0-03B Account recovery](M0-03B-ACCOUNT-RECOVERY.md) | proposed | M0-03 accepted | Local forgotten-password/reset flow; enumeration-safe response; PKCE/session-safe callback; Mailpit and session tests | Approve the recovery brief and open UX/session decisions before implementation; required before external MVP use |
| P0 | [M0-04 Privacy, consent, and deletion-operation design](M0-04-PRIVACY-CONSENT-DELETION-DESIGN.md) | proposed | M0-02 and M0-02-C1 accepted | Pre-friends/hosted design-only notice, versioned AI-consent/withdrawal, deletion operation, inventory/data flow, retention, backups/logs, and access/export boundary; no schema | Approve product/legal/processor decisions and the design; later schema/UI/operation work needs a separate approved brief |
| P0 | [M0-05 Privacy-safe instrumentation and AI request controls](M0-05-PRIVACY-SAFE-INSTRUMENTATION-AI-CONTROLS.md) | proposed | M0-02 and M0-04 accepted | Pre-friends/hosted default-deny product-event contract; server-side AI consent/rate/budget boundary; versioned validation/telemetry contract; no real provider call in this ticket | Approve exact event fields, subject-key/deletion design, retention, rate defaults, AI budget behavior, and the missing privacy implementation dependency |
| P0 | [M0-06 Quality and deployment baseline](M0-06-QUALITY-DEPLOYMENT-BASELINE.md) | proposed | M0-03, M0-03B, M0-04, and M0-05 accepted | Pre-friends/hosted CI gates; protected preview/staging; isolated environments; migration/backup/rollback validation; hosted SMTP/bot/privacy/auth smoke; consolidated M0 evidence | Approve exact remote targets, provider/account/region/plan, privacy implementation dependency, email/bot/monitoring choices, access, and cost ceiling |
| P1 | [M1-01 Goal model and validation](M1-01-GOAL-MODEL-VALIDATION.md) | proposed | M0-03 and M0-02-C1 accepted; ADR-006 local boundary | Sport-agnostic goal CRUD; lifecycle; separate core/supporting ranks; maximum three active core goals; ownership/RLS; concurrency and archive/delete rules; 390px management | Approve goal fields, lifecycle/rank, archive/delete, concurrency architecture, mobile UX/copy, and privacy classification before local implementation |
| P1 | [M1-02 Memory model and management](M1-02-MEMORY-MODEL-MANAGEMENT.md) | proposed | M0-03 and M0-02-C1 accepted; ADR-006 local boundary | Explicit facts, constraints, preferences, and proposed patterns; provenance/status/history; inspect/edit/disable/delete; ownership/RLS; sensitive-data handling; 390px management; no AI extraction | Approve statuses, provenance, history/expiry/delete, sensitive-data handling, mobile UX/copy, and consequential data architecture before local implementation |
| P1 | [M1-03 Structured intake and fact review](M1-03-INTAKE-FACT-REVIEW.md) | proposed | M1-01 and M1-02 accepted | Structured intake; separate candidates; explicit accept/edit/reject; partial selection with atomic publication; duplicate/conflict handling; resume/retry; conservative safety copy; no production AI | Approve required fields, draft retention, publication atomicity, conflict/safety rules, mobile flow/copy, privacy handling, and any transaction ADR before implementation |
| P1 | [M1-04 Mobile navigation and honest empty states](M1-04-MOBILE-NAVIGATION-EMPTY-STATES.md) | proposed | M0-03 accepted; ADR-006 local boundary | Accessible 390px Today/Plan/Coach/Progress/You shell; route/deep-link/session ownership; honest loading/error/offline/empty states; no fake training, metrics, or AI | Approve visible tabs, routes/default, labels/icons/order, state copy, safe-return behavior, You composition, and responsive/accessibility design before implementation |
| P1 | [M1-05 Consolidated M1 validation slice](M1-05-M1-VALIDATION-SLICE.md) | proposed | M1-01 through M1-04 accepted | Independent clean-migration, RLS, invariant, 390px flow, accessibility, privacy/security/secret, quality, regression, and evidence validation; no product changes | Dispatch independent validation only after all four M1 slices are accepted; findings return to owning tickets and do not authorize M2 or external use |

M0-05 is now the explicit owner of the request-control, AI telemetry-contract, and privacy-safe event work required by the Product Plan. The previous quality/deployment ticket moves to M0-06. This is a planning correction only; neither ticket is approved for implementation.

Consent tables have intentionally moved out of M0-02 and into M0-04 so their schema cannot precede approval of the consent, withdrawal, processor, and retention decisions. M0-02 may establish generic ownership conventions but must not guess those privacy semantics.

ADR-003 supersedes the earlier invite-only magic-link decision. ADR-004 supersedes its username-specific clauses. ADR-005 stages recovery separately. M0-02 contains no invite table or secret invite repository; M0-03 owns basic public email/password registration, verified email, username-free profile creation, and session behavior, while M0-03B owns account recovery.

M0-04 is a design ticket only. Accepting its design does not authorize consent/deletion schema, user-facing privacy behavior, a privileged deletion operation, an AI processor, or any external-service configuration; each implementation slice needs its own dependency-ready approved brief.

M0-05 and M0-06 now have proposed implementation-ready briefs, but neither is approved. M0-05 may implement pure contracts and local/test adapters after M0-04 design acceptance; any persistent consent lookup, subject mapping, deletion operation, event/audit store, or production transfer also requires the later privacy implementation brief identified by M0-04. M0-06 cannot authorize external registration until that missing privacy implementation dependency is accepted and its hosted privacy checks pass. The lead must review whether to add that ticket; this backlog update neither creates nor approves it.

[ADR-006](../decisions/ADR-006-LOCAL-OWNER-AI-MVP.md) separates the
owner/synthetic local development path from the pre-friends/hosted gates. M1
local dependencies therefore begin with the accepted M0-03 authentication and
ownership foundation plus each ticket's own approved dependencies. M0-03B,
M0-04 and its later implementation, M0-05, and M0-06 are still required before
friend data, hosted deployment, external registration, or external use.

M2 planning is maintained in the [M2 backlog](M2-BACKLOG.md). Its briefs remain
proposed and do not select a provider/model, authorize a key, create an account
or remote resource, or approve spend.

## Ticket rule

Each ticket must be independently demonstrable and have its own scope, non-goals, acceptance criteria, test plan, dependencies, and links to applicable briefs/ADRs. A proposed or draft ticket cannot start merely because a parent milestone is approved. Before implementation it needs either a linked approved feature brief or documented product-owner confirmation that it contains only already approved foundation behavior.

Once the product owner approves a ticket and its dependencies are satisfied, the lead agent must immediately mark it `in development`, assign one builder, and start work. The lead agent also assigns an independent reviewer after the builder handoff; neither transition requires another product-owner prompt.

While an approved ticket is being implemented, the lead assigns a separate planning agent in a separate worktree and branch to draft only the next dependency-relevant proposed items. Those drafts never start implementation or become approved without product-owner approval, and planning must not alter the active builder branch.

For Supabase work, the builder must review the current official changelog and topic documentation before implementation, create schema changes through the supported migration workflow, enable RLS on every exposed user-data table, and test both permitted owner access and denied cross-user access. Authentication alone is not authorization.
