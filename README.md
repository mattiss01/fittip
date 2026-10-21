# FitTip

A personal training coach, built for one athlete: its author. The athlete keeps
goals and coaching context, maintains one continuous training plan, logs what
actually happened, and asks an AI coach to propose changes that they review
before anything is added.

This is a private project developed in the open. It is not a product, there is
no public sign-up, and the hosted instance accepts only its owner. You are
welcome to read the code; see [Rights](#rights) before reusing any of it.

## What it does

- **Today** shows the day's planned sessions, logs them, and runs a workout in
  progress.
- **Plan** is a rolling plan viewed by date: sessions, recurring series,
  recovery days, saved session templates and a personal activity library. Its
  roadmap sets out the longer direction in phases and milestones.
- **Progress** is the training record, a month at a time. A log is kept
  separately from the plan that suggested it, is corrected as a revision, and is
  removed only when the owner deletes it.
- **You** holds goals (at most three core), coaching memory and settings.

The **coach** writes a rough roadmap and detailed 1–7-day plan proposals. Every
answer is schema-validated and shown as a proposal next to the real data;
nothing changes until the owner accepts it. Memory the coach infers is proposed,
never treated as fact. Pain, illness and injury are handled conservatively and
without diagnosis.

The vocabulary is defined in [CONTEXT.md](CONTEXT.md), and the reasoning behind
the bigger choices is in [docs/decisions](docs/decisions/).

## Stack

- Next.js 16 (App Router) and React, deployed on Vercel
- Supabase: Postgres with Row Level Security on every owned table, and Auth
- Vitest, pgTAP and Playwright at a 390px phone viewport
- An AI provider reached only from the server, behind one validating boundary

## Run it locally

You need Node.js 24 (see `.nvmrc`) and Docker with about 7 GB of memory for the
local Supabase stack. On Windows, use `npm.cmd` and `npx.cmd` if PowerShell
blocks `npm.ps1`.

```sh
npm ci
npx supabase start            # first start downloads images and takes a while
npx supabase status -o env    # prints the local URL and keys
```

Copy `.env.example` to `.env.local` and fill in `API_URL` and
`PUBLISHABLE_KEY` from that output. Use the `sb_publishable_…` key, not
`ANON_KEY`: the app refuses legacy JWT-form keys on purpose.

```sh
npm run dev
```

Open <http://localhost:3000> and create an account. Confirmation and
password-reset mail is captured by Mailpit at <http://127.0.0.1:54324> rather
than sent.

For an account with data already in it, `npm run athletes:seed` creates five
made-up athletes on the local stack (password `fittip-local`). The
[test athletes guide](scripts/test-athletes/README.md) says who each one is.

### The coach runs offline by default

Unless `FITTIP_AI_LIVE=enabled` is set together with a provider, model, API key,
owner allowlist and operation list (`src/server/ai/enablement.ts`), the coach
answers from built-in fixtures. Nothing is sent anywhere and nothing costs
money. Any missing or malformed setting keeps it offline.

### Hosted mode

Every Vercel environment runs in `founder-staging` mode: `FITTIP_RUNTIME_MODE`
and `FITTIP_OWNER_USER_ID` restrict it to one pre-created owner account, sign-up
is closed, and any other session is signed out. Leave both unset locally.

## Checks

```sh
npm run lint
npm run typecheck
npm run test:run      # once; `npm run test` is watch mode
npm run build
npm run test:e2e      # needs the app on port 3000 and the local stack
```

Database checks run against the local stack:

```sh
npx supabase db reset --local
npx supabase db lint --local --level warning --fail-on warning
npx supabase db advisors --local --type all --level warn --fail-on warn
npx supabase test db --local supabase/tests/database
```

## Database changes

Create each migration with `npx supabase migration new <name>`. Applied
migrations are never edited; corrections go forward in a new one.

After a clean `db reset --local`, regenerate the committed types with
`npm run types:gen`. It writes, formats and checks
`src/lib/supabase/database.types.ts`, which is never edited by hand. Do not add
`--schema public` to a manual run: the file also carries `graphql_public`, and
the flag drops it silently.

## Continuous integration

`.github/workflows/ci.yml` runs on `master`, `ticket/**` and `chore/**` branches
and on pull requests. It needs no repository secrets: each job starts its own
disposable Supabase stack and contacts no hosted service.

| Job        | Covers                                                                        |
| ---------- | ----------------------------------------------------------------------------- |
| `static`   | Prettier, ESLint, TypeScript, Vitest and the production build                 |
| `database` | Every migration from zero, database lint, advisors, pgTAP, concurrency checks |
| `browser`  | The 390px production Playwright flows, split over three runners               |

## How the work is organized

- [CLAUDE.md](CLAUDE.md) is the working agreement. Most of the code is written
  with Claude Code under it.
- [docs/backlog/NEXT.md](docs/backlog/NEXT.md) lists what is open, and
  `docs/backlog/LOG-<year>.md` records each merge.
- [docs/product](docs/product/) holds feature briefs and the
  [data-model overview](docs/product/DATA-MODEL-OVERVIEW.md).

## Rights

Copyright © 2026 mattiss01. All rights reserved.

No license is granted. You may read this code and fork it on GitHub as GitHub's
terms allow, but you may not copy, modify, distribute or use it, in whole or in
part, without written permission.
