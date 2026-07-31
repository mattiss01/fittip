@AGENTS.md

## Claude Code

Tooling notes for this repository only. `AGENTS.md` above is the working agreement and wins
on every product, delivery, and engineering question. `README.md` holds the human setup
guide; this file records what a Claude Code session needs on top of it.

### Commands

Run from the repository root. PowerShell on this machine blocks `npm.ps1`, so always use
`npm.cmd` and `npx.cmd`.

| Purpose                | Command                                          |
| ---------------------- | ------------------------------------------------ |
| Install exact tree     | `npm.cmd ci`                                     |
| Lint                   | `npm.cmd run lint`                               |
| Types                  | `npm.cmd run typecheck`                          |
| Unit/component tests   | `npm.cmd run test:run`                           |
| One test file          | `npm.cmd run test:run -- src/path/file.test.ts`  |
| Production build       | `npm.cmd run build`                              |
| Dev server             | `npm.cmd run dev`                                |
| Production server      | `npm.cmd run start -- -p <port>`                 |

- **Never run `npm run test`** — that is Vitest watch mode and it will hang the session. Use
  `test:run`.
- Run the narrow tests your change touches, plus `git diff --check`, before a handoff. Do not
  execute the whole suite by hand to produce evidence — that is what continuous integration is
  for. Current clean-tree baseline: 39 test files / 229 tests passing.
- `npm.cmd run format:check` **fails on a clean checkout** (131 files). `core.autocrlf=true`
  gives CRLF working files while Prettier defaults to `endOfLine: "lf"`. Do not "fix" this by
  running `format` across the repo or by editing `.prettierrc.json`. To check your own files:
  `npx.cmd prettier --write <changed files>` then `git diff` — no diff means the warning was
  line endings only. The CI Prettier step runs on a Linux checkout, so it sees only real
  failures; trust it over the local command. Prettier also ignores `AGENTS.md`, `CLAUDE.md`,
  `docs/`, and `.claude/`, so documentation is hand-wrapped at ~80 columns; match the
  surrounding file.

### Continuous integration

`.github/workflows/ci.yml` runs on `master`, `ticket/**`, `chore/**`, and pull requests into
`master`. Three jobs: `static` (Prettier, ESLint, TypeScript, `test:run`, `build`), `database`
(every migration from zero, db lint, advisors, pgTAP, the concurrency harnesses), and `browser`
(the 390px production Playwright flows). A full run takes about four minutes.

- The green run for the exact reviewed commit **is** the automated-test evidence. Cite its run
  URL in the validation record instead of pasting suite output. A red or absent run for that SHA
  is a delivery blocker.
- Inspect a run with `gh run list --branch <branch>`, `gh run view <id>`, and
  `gh run view <id> --log-failed`. For a browser failure,
  `gh run download <id> -n playwright-report` yields the trace and page snapshot. The trace
  names the pending action, which a spec's cleanup error frequently hides in the plain log.
- CI needs no repository secret: each Docker job starts its own disposable Supabase stack and
  derives that container's ephemeral keys. Never add a secret, hosted project, deployment step,
  or paid resource to CI without product-owner approval, and never weaken a check to make a
  branch green.
- CI proves that an assertion holds. It cannot judge whether a mobile surface looks or feels
  right; the 390px visual pass stays a product-owner check on the Vercel Preview.

### Database and browser flows (need Docker + local Supabase)

`README.md` has the reset / lint / advisor / pgTAP / type-generation sequence. Additions:

- CI already runs the whole database and browser matrix on every push. Run these locally to
  develop or to debug a specific failure, not to produce handoff evidence.
- These are slow (first `npx.cmd supabase start` takes minutes). Run them in the background
  rather than blocking on a foreground call.
- Never run `supabase link`, `db push`, or any other remote/hosted CLI command — ADR-007 gates
  the founder-staging project and `supabase/config.toml` is local-only.
- `npm.cmd run test:e2e` needs the app already serving on port 3000 plus
  `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
  `e2e/planning.spec.ts`, `e2e/m1-04-today-progress.spec.ts`, and `e2e/m2-01-goals.spec.ts` also
  need `SUPABASE_SERVICE_ROLE_KEY` and **skip themselves silently without it** — read the
  skipped count before reporting a pass.
- Every per-ticket config pins its own `testMatch`. A new one must do the same, or running it
  bare collects every other ticket's spec on that config's port and timezone.
- Per-ticket flows have their own config and port, e.g.
  `npx.cmd playwright test e2e/m1-04-today-progress.spec.ts --config=e2e/m1-04.playwright.config.ts`
  (port 3014). Acceptance evidence is captured against `build` + `start`, not `dev`.

### Plan mode and delegation

- Default to plan mode whenever no approved ticket covers the request: exploration, diagnosis,
  drafting a feature brief, ADR, or backlog ticket. Exiting plan mode means implementation
  starts, and AGENTS.md permits that only for an approved ticket.
- In this session you are the lead agent. Per AGENTS.md the lead never writes the
  implementation: spawn a builder subagent, then a *different* reviewer subagent. Use plan mode
  to prepare the handoff (ticket, named project skills, scope) rather than editing code.
- Route product, safety, privacy, cost, and architecture choices to the product owner with
  AskUserQuestion instead of picking a default.
- `/security-review` and `/code-review` are useful before a handoff but do **not** satisfy the
  independent-reviewer requirement, which needs a separate agent reviewing the exact pushed
  commit.

### Project skills live outside `.claude/`

FitTip's own skills are in `.agents/skills/<name>/SKILL.md` and Claude Code does not
auto-discover them (it only scans `.claude/skills/`). When a handoff names one — most often
`vercel-react-best-practices` or `frontend-design` — `Read` that path explicitly. The project
copy wins over any same-named global or plugin skill. Never edit `.agents/skills/**` or
`skills-lock.json`; those are governance/supply-chain changes needing approval.

### Stay out of / never hand-edit

- `AGENTS.md`, `.agents/**`, `skills-lock.json` — Codex-owned shared config; propose a diff and
  ask first.
- `src/lib/supabase/database.types.ts` — generated by the Supabase CLI.
- `supabase/migrations/*.sql` that are already applied — corrections are forward-only.
- `docs/validation/**` records of accepted tickets, and `docs/backlog/**` acceptance/decision
  lines — those are permanent history. Add new records instead.
- `.env.local` and anything matching `.env*` except `.env.example` — never read into context,
  never commit.
- `node_modules/`, `.next/`, `supabase/.branches/`, `supabase/.temp/`, `.worktrees/`.

### Non-obvious pitfalls

- This checkout is an Orca-managed worktree of `C:/Users/msche/dev/fittip`, so `.git` is a file,
  not a directory. Tools that assume a `.git` directory can misread the repo. Do not create
  further worktrees for ticket delivery — AGENTS.md requires a ticket branch in this checkout.
- `src/architecture/*.test.ts` are repo-wide invariant tests, not unit tests. They fail if a
  `"use client"` file imports from `@/server/**` or a repository, or if `.retry(false)` appears
  anywhere other than the two atomic RPC calls. A new pattern must update the invariant
  deliberately, not incidentally.
- `next build` may warn about workspace root inference when more than one lockfile is visible.
  The build still succeeds; it is a known, recorded warning.
- Next.js 16 here: middleware is `src/proxy.ts`, route params are async, and private response
  headers come from `next.config.ts` (covered by `next.config.test.ts`).
