---
description: Conventions for Vitest suites and Playwright mobile flows
paths:
  - "**/*.test.ts"
  - "**/*.test.tsx"
  - "e2e/**"
  - "supabase/tests/integration/**"
---

# Tests

## Vitest (`*.test.ts[x]`, jsdom)

- Co-locate the test beside its subject. `e2e/`, `.worktrees/`, and `node_modules` are excluded
  by `vitest.config.ts`.
- Import through the `@/` alias, as the app does.
- Suites must be deterministic and isolated: no wall-clock timers, no shared module state, no
  ordering dependency. A timer in a subscription previously made the parallel component suite
  flaky and had to be removed.
- Assert behavior a user or an attacker can observe — routing, ownership denial, factual copy —
  not implementation details.
- Tests in `src/architecture/` are repo-wide invariants (client/server import boundary, the
  exact `.retry(false)` allowlist). Update them only as a deliberate decision.

## Playwright (`e2e/**`)

- The acceptance viewport is exactly `390x844`. Assert no horizontal overflow.
- Specs self-skip when their Supabase env vars are absent, so check the skipped count before
  calling a run green. `planning.spec.ts`, `m1-04-today-progress.spec.ts`, and
  `m2-01-goals.spec.ts` also need `SUPABASE_SERVICE_ROLE_KEY`.
- CI runs every flow on each push and retains a trace on failure. A local run is for developing
  or debugging, not for producing handoff evidence.
- Do not let a fixed overlay decide whether a flow passes. The plan editor's save dock and the
  primary navigation are both fixed, and content that scrolls underneath them makes a click
  retry until timeout. CI caught exactly that; reserve the space rather than nudging the test.
- The service-role key is a test-harness-only credential for creating and deleting a disposable
  confirmed user. Never log it, persist it, or let it reach application code.
- Every spec that creates a synthetic account must delete it, including on failure paths.
- Ticket flows get their own `e2e/<ticket>.playwright.config.ts` on an isolated port and run
  against a production `build` + `start`, not `dev`.
- Assert real HTTP response headers for authenticated routes (`private`, `no-store`), comparing
  header **names** case-insensitively while keeping exact value assertions.
- Confirmation links come only from local Mailpit at `http://127.0.0.1:54324`.
