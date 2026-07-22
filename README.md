# Fittip

This repository contains the mobile-first web foundation for Fittip. M0-01 provides only the application and quality-tooling baseline; product features and external-service configuration are intentionally absent.

## Prerequisites

- Node.js 24.18.0 LTS (see `.nvmrc`)
- npm 11.16.0 (bundled with the selected Node.js release)

## Install

Install the exact dependency tree recorded in `package-lock.json`:

```powershell
npm ci
```

On Windows systems where PowerShell blocks `npm.ps1`, use `npm.cmd` in place of `npm`.

## Run locally

```powershell
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The only route in this baseline is `/`.

## Quality commands

```powershell
npm run lint
npm run typecheck
npm run test
npm run test:run
npm run format
npm run format:check
npm run build
```

- `test` starts Vitest in watch mode.
- `test:run` runs the deterministic test suite once.
- `format` rewrites supported application and repository-tooling files with Prettier.

Supabase setup, authentication, environment configuration, continuous integration, and Vercel linkage belong to later approved tickets.
