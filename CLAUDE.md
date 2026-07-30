# FitTip — Claude Code entry point

Read [AGENTS.md](AGENTS.md) before any change. It holds the product
invariants, the delivery protocol, the continuous-integration rules, the
project skill workflow, and the engineering rules.

This file deliberately does not restate them. A second copy would drift from
the first and would be read twice. Put a durable rule in `AGENTS.md`; put
product direction in
[REVISED_PRODUCT_PLAN.md](REVISED_PRODUCT_PLAN.md); put setup and command
documentation in [README.md](README.md).

## What to load, and when

| Need | Read |
| --- | --- |
| Delivery rules, invariants, review and CI expectations | `AGENTS.md` |
| Product direction and the agent operating protocol | `REVISED_PRODUCT_PLAN.md` |
| Local setup, Supabase, environment variables, commands | `README.md` |
| The current work item | its ticket under `docs/backlog/M*/` |
| Why a decision was made | the linked ADR under `docs/decisions/` |

Read the ticket for the work in hand. Do not preload an entire milestone's
backlog, its validation records, or the full product plan to make a scoped
change.

## Evidence

Automated-test evidence comes from the CI run for the exact reviewed commit,
not from suite output pasted into a session. See the continuous-integration
section of `AGENTS.md`.

## Environment notes

- Windows shells that block `npm.ps1` need `npm.cmd` instead of `npm`.
- `npm run format:check` is unreliable on a Windows checkout. With
  `core.autocrlf=true` the working copy holds CRLF while Prettier expects LF,
  so the command reports nearly every file as unformatted and hides real
  failures among them. Committed blobs are normalized to LF, so trust the CI
  Prettier step. To check one file locally, run Prettier against its committed
  blob rather than the working copy.
- The local Supabase stack needs a running Docker-compatible runtime. Without
  it the database and browser suites cannot run locally; CI runs both.
