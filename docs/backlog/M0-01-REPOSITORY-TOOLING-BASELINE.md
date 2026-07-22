# M0-01: Repository and tooling baseline

**Status:** testable — product-owner acceptance required  
**Approved by:** product owner, 22 July 2026 — “I approve M0-01 as written.”  
**Milestone:** M0  
**Priority:** P0  
**Type:** foundation; no user-visible product feature  
**Depends on:** [M0 foundation decision](../decisions/M0-FOUNDATION-DECISION-BRIEF.md), [ADR-001](../decisions/ADR-001-M0-FOUNDATION.md)  
**Blocks:** M0-02, M0-03, M0-06

## Outcome

Create a reproducible, production-shaped Next.js repository baseline so later approved tickets can be implemented and checked without revisiting foundational tooling. This ticket establishes application and test commands only; it does not implement authentication, persistence, training behavior, analytics, or deployment.

## Approved constraints

- Use the Next.js App Router with strict TypeScript, as accepted in ADR-001.
- Use a mobile-first web structure without creating unapproved product screens.
- Keep business rules and future external-service clients server-side.
- Preserve `AGENTS.md`, `REVISED_PRODUCT_PLAN.md`, and all existing `docs/` content.
- Pin direct dependency versions and commit the package-manager lockfile.
- Select current stable, security-patched framework versions at implementation time. Record the selected Node.js, Next.js, React, and package-manager versions in the handoff.

## Reversible implementation decisions

These choices do not change product behavior and may be made by the builder within this ticket:

- Use npm and commit `package-lock.json` unless the local environment demonstrates a concrete incompatibility.
- Keep application code under `src/` and use the `@/*` import alias.
- Include Tailwind CSS as the approved styling baseline, but do not add a component library or visual design system yet.
- Use ESLint, Prettier, Vitest, React Testing Library, and TypeScript's compiler for the local quality commands.
- Keep Server Components as the default. Add Client Components only where a later approved feature requires browser interactivity.

Any departure from these defaults must be documented in the ticket handoff. A change that affects architecture, deployment, security, privacy, cost, or user-visible behavior requires a separate approval.

## Scope

1. Scaffold a Next.js App Router application at the repository root without overwriting the existing governance and product documents.
2. Enable strict TypeScript and the `@/*` import alias.
3. Add a minimal neutral root page identifying the application as FitTip and containing no training, authentication, onboarding, or AI behavior.
4. Configure Tailwind CSS, ESLint, and Prettier.
5. Configure Vitest with a browser-like test environment and React Testing Library.
6. Provide package scripts for:
   - `dev`
   - `build`
   - `start`
   - `lint`
   - `typecheck`
   - `test`
   - `test:run`
   - `format`
   - `format:check`
7. Add one deterministic baseline test proving that the test runner and application component setup work.
8. Add a concise developer README covering prerequisites, installation, local startup, and all quality commands. Environment-specific Supabase and Vercel instructions remain M0-02 and M0-06 work.
9. Add or refine `.gitignore` so dependencies, build output, local environment files, coverage output, and editor/OS artifacts are not committed.

## Non-goals

- Supabase packages, project configuration, migrations, tables, policies, or credentials.
- Authentication, invite gating, protected routes, profiles, or session handling.
- Consent, deletion, analytics, AI rate limiting, AI providers, or AI telemetry.
- CI workflows, Vercel project linkage, preview deployments, or production environments.
- Product navigation, onboarding, training screens, reusable UI components, or a branded design system.
- Playwright configuration or an authenticated mobile end-to-end flow.
- Domain entities or speculative repository/service abstractions before their tickets are approved.

## Acceptance criteria

1. A clean checkout can install dependencies from the committed lockfile using the documented command.
2. The project uses the Next.js App Router under `src/app` and TypeScript strict mode is enabled.
3. The root route renders a neutral FitTip foundation page and does not imply that an account, plan, or training feature exists.
4. The documented local development command starts the application successfully.
5. `npm run lint` exits successfully.
6. `npm run typecheck` exits successfully.
7. `npm run test:run` exits successfully and executes at least one meaningful baseline test.
8. `npm run format:check` exits successfully.
9. `npm run build` produces a successful production build without requiring Supabase, Vercel, or AI environment variables.
10. Direct dependencies use explicitly pinned versions, `package-lock.json` is committed, and the handoff records the selected runtime/framework versions plus any known audit findings.
11. Existing project documents remain present and materially unchanged except for links or status updates required by this ticket.
12. No secret or real environment value is committed.

## Test and verification plan

Run from the repository root after a clean dependency installation:

```powershell
npm ci
npm run lint
npm run typecheck
npm run test:run
npm run format:check
npm run build
```

Then start the local server and manually verify `/` at a 390px viewport. This is a foundation smoke check, not the authenticated Playwright flow required later by M0-03/M0-06.

Before scaffolding, consult the current official Next.js documentation and release/security notes. Do not rely on a stale remembered framework version. The production build must remain safe when later external-service environment variables are absent; future database and SDK clients must therefore be initialized lazily rather than at module import time.

## Required handoff

Before requesting acceptance, report:

- Local demo path.
- Changed files.
- Node.js, npm, Next.js, and React versions selected.
- Commands run and their results.
- Dependency/audit findings and disposition.
- Known limitations.
- Confirmation that no environment secrets or feature behavior were added.
- The exact request: accept M0-01 or return focused corrections.

## Decision requested

Confirm this ticket as the complete scope for M0-01. Confirmation moves it from `draft` to `approved`; only then may repository scaffolding begin.
