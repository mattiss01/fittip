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

- Co-locate the test beside its subject. `vitest.config.ts` excludes `e2e/**/*.spec.ts`,
  `.worktrees/`, and `node_modules` — Playwright owns the browser flows, but helpers under
  `e2e/support/` are ordinary units and are tested here.
- Import through the `@/` alias, as the app does.
- Suites must be deterministic and isolated: no wall-clock timers, no shared module state, no
  ordering dependency. A timer in a subscription previously made the parallel component suite
  flaky and had to be removed.
- Assert behavior a user or an attacker can observe — routing, ownership denial, factual copy —
  not implementation details.
- Tests in `src/architecture/` are repo-wide invariants (client/server import boundary, the
  exact `.retry(false)` allowlist). Update them only as a deliberate decision.

## When you change a surface

Search `e2e/**` for assertions about it before you call the change done. Accepted flows pin
surfaces that unit tests do not, and a spec written for the old surface is a red run nobody
expects — updating the unit tests is not enough. Rewriting an accepted spec is legitimate when
the surface it described was deliberately replaced; note it in the merge log so the older
validation record is read as history rather than as a description of today.

Prefer a real browser run over reasoning about Server Action behavior. The receipt-versus-
notice bug on the log form was invisible to jsdom tests and obvious on the first flow run.

## Playwright (`e2e/**`)

- The acceptance viewport is exactly `390x844`. Assert no horizontal overflow.
- Specs self-skip when their Supabase env vars are absent, so check the skipped count before
  calling a run green. `planning.spec.ts`, `m1-04-today-progress.spec.ts`, and
  `m2-01-goals.spec.ts` also need `SUPABASE_SERVICE_ROLE_KEY`.
- CI runs every flow on each push and retains a trace on failure. Run one locally to develop
  or debug a failure, not to produce evidence.
- Do not let a fixed overlay decide whether a flow passes. The plan editor's save dock and the
  primary navigation are both fixed, and content that scrolls underneath them makes a click
  retry until timeout. CI caught exactly that; reserve the space rather than nudging the test.
- The service-role key is a test-harness-only credential for creating and deleting a disposable
  confirmed user. Never log it, persist it, or let it reach application code.
- Every spec that creates a synthetic account must delete it, including on failure paths.
- Existing per-ticket configs (`e2e/<ticket>.playwright.config.ts`) each pin their own
  `testMatch` and port and run against a production `build` + `start`, not `dev`. Do not add
  new ones; extend an existing flow or write a plain spec instead.
- Assert real HTTP response headers for authenticated routes (`private`, `no-store`), comparing
  header **names** case-insensitively while keeping exact value assertions.
- Confirmation links come only from local Mailpit at `http://127.0.0.1:54324`.
