---
name: mobile-e2e
description: Run FitTip's 390x844 Playwright flow against a local production build with the local Supabase stack, including the env vars, isolated port, and disposable-account cleanup. Use when producing or re-checking mobile acceptance evidence for a ticket.
---

# Mobile end-to-end run

Acceptance evidence is captured against a production build, not `next dev`.

CI already runs every 390px flow against a production build on each push, and retains a
Playwright trace on failure. Use this skill to develop a new flow or to debug a specific CI
failure locally — not to reproduce evidence CI has already established. For a failing run,
`gh run download <id> -n playwright-report` is usually faster than rebuilding the stack here.

## 1. Local stack

Start Docker, then `npx.cmd supabase start` (background; the first run takes minutes).
`npx.cmd supabase status` prints the local URL and the modern `sb_publishable_...` key. If the
schema changed, `npx.cmd supabase db reset --local` first so the run exercises committed
migrations from zero.

## 2. Environment

`.env.local` (never committed) needs:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Leave `FITTIP_RUNTIME_MODE` and `FITTIP_OWNER_USER_ID` unset for local runs.

`e2e/planning.spec.ts` and `e2e/m1-04-today-progress.spec.ts` also need
`SUPABASE_SERVICE_ROLE_KEY` to create and delete a disposable confirmed user. Supply it only at
test runtime, never to application code, and never print or persist it. **Without it these
specs skip silently** — read the skipped count before reporting a pass.

## 3. Serve the production build

```powershell
npm.cmd run build
npm.cmd run start -- -p 3014
```

Use the port the ticket's Playwright config expects.

## 4. Run

Default config (port 3000, `390x844`):

```powershell
npm.cmd run test:e2e
```

A ticket flow with its own config and port:

```powershell
npx.cmd playwright test e2e/m1-04-today-progress.spec.ts --config=e2e/m1-04.playwright.config.ts
```

New ticket flows get `e2e/<ticket>.playwright.config.ts` pinning `390x844`, a fixed timezone,
and an unused port so runs stay isolated.

## 5. Confirm and clean up

- Viewport was exactly `390x844`; no horizontal overflow.
- Authenticated responses carried `private` and `no-store` (header names compared
  case-insensitively, values exactly).
- No browser console or page errors.
- Every synthetic account the run created was deleted — including after a timeout. Check for
  leftovers from failed attempts and remove them, or reset the local database.
- Capture the 390px screenshot into `docs/validation/<MILESTONE>/evidence/` and record the real
  command, duration, and result in the validation record.
