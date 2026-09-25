# FitTip working agreement

FitTip is a mobile-first training app for one athlete: the product owner. A Coach AI
proposes plans; the athlete accepts, edits, and logs what actually happened. Next.js 16
on Vercel, Supabase Postgres with Row Level Security.

Background when you need it: `CONTEXT.md` for the domain, `docs/decisions/` for ADRs,
`docs/product/` for feature briefs. `README.md` is the human setup guide.

## Product invariants

- Plans, proposals, and actual completions are separate permanent records.
- Replanning never changes completed history, past sessions, or user-locked future content.
- Every owned record has a `user_id`; authorization is enforced server-side and in database
  Row Level Security.
- At most three active goals may be `core`; supporting goals remain distinct.
- Memory is explicit, inspectable, editable, and statused. Inferred memory is proposed,
  never silently treated as fact.
- Activities are personal, AI-created or user-created definitions. Do not add a global
  exercise library for v1 convenience.
- AI returns schema-validated proposals only. It never directly writes user data or
  silently changes an accepted plan.
- Pain, illness, injury, and severe-fatigue signals use conservative, non-diagnostic
  behavior.

## How we work

Work is tracked in `docs/backlog/NEXT.md`: a checklist of what is next, plus a one-line log
per merge. Follow-ups found along the way become new checklist lines, not new documents.
`docs/backlog/M0`–`M3` and `docs/validation/` are history from the earlier protocol; read
them for context, never extend them.

**Nothing accumulates in that file.** It describes what is open, not what has happened, and
it stays near a hundred lines however long the project runs. Four rules keep it there:

- **A merged item's block is deleted in the merge that ships it.** The log row becomes its
  record. The constraints and the owner's decisions are already in the commit message and in
  the comments of the code they shaped, which is where someone asking "why is this like
  this?" will be standing. Measured on 20 September 2026: shipped items were 91 of the
  file's 174 lines, against 16 for everything actually open.
- **A log row is one or two sentences.** What changed, the migration and its founder apply if
  there was one, and anything a reader would otherwise get wrong. A row that grows into a
  paragraph has only moved the bloat; the detail belongs in the commit message, which is
  where it was written first.
- **A limitation is removed from `Known limitations` by the merge that stops it being true**,
  and that merge's log row says so. The section is a description of today, not a history of
  everything that was ever awkward.
- **When the log passes roughly a hundred rows, the finished year moves to
  `docs/backlog/LOG-<year>.md`** and `NEXT.md` keeps the current one.

The cost of this is real and worth knowing: an owner decision from six weeks ago is
recovered by reading a commit rather than by scrolling. That is the trade — the file is
optimized for the question "what now?", which is asked every session, over "what did we
decide in August?", which is asked rarely and answered precisely by `git log`.

### Build lane — the default

For anything visible or behavioral that the careful lane does not cover:

1. The owner says what they want. If it is not obvious, restate it in two or three lines
   before touching code.
2. Run `npm.cmd run dev` in the background. The owner watches at 390px.
3. Make small changes and say what changed after each one. The owner reacts; repeat until
   they are happy.
4. Commit to a `ticket/<slug>` branch so CI triggers, and push. CI must be green.
5. For anything past a copy or styling tweak, run `/code-review` on the diff and fix or
   report what it finds.
6. Merge to `master`, push, and add the log line.

No subagents, no ticket document, no validation record, no Preview wait. Add tests where the
logic is non-trivial; do not add a per-ticket Playwright config or screenshot evidence.

### Careful lane

Schema or migrations, RLS and grants, auth, the AI provider or prompt data boundary, spend,
or anything irreversible to the owner's data.

- Write three to eight lines on the checklist line first: outcome, constraints, decisions
  the owner made.
- Same interactive loop. Use the `schema-change` skill for database work.
- After pushing, spawn one reviewer subagent to review that commit's diff for data,
  authorization, and privacy. It reads the diff and reports; it does not re-run CI. Tell it
  in the prompt that this file is the working agreement and that `docs/backlog/M0`–`M3` and
  `docs/validation/` are history — otherwise it reviews against the retired protocol and asks
  for tiers and validation records.
- Apply the migration to the founder project (ADR-018), report what `migration list` and the
  advisors say, then merge.

### Judgment calls

- Product, safety, privacy, cost, and architecture choices belong to the owner. Ask with
  AskUserQuestion instead of picking a default. Record architecture decisions as ADRs.
- Use plan mode for careful-lane work or when the scope is genuinely unclear. Otherwise make
  the change and show it.
- Pushing to `origin` (`https://github.com/mattiss01/fittip.git`) is pre-authorized for
  intentional commits. Never stage secrets, `.env*`, or unrelated files. Stop and report if
  the remote differs or Git rejects the update.
- Preserve unrelated user changes. Do not refactor broadly without asking.
- Commit a change to permissions, ADRs, or this file on its own, not bundled onto a product
  branch. Both land in the same merge either way, but a reader looking for when an agent's
  reach changed should not have to find it inside a feature.
- Report honestly: if something is untested, unfinished, or failing, say so plainly.

## Engineering rules

- Keep AI calls and business rules server-side, behind domain-service interfaces.
- Use migrations for database changes. Enable RLS with explicit ownership policies on
  exposed user-data tables.
- Never expose service-role credentials or make authorization decisions from user-editable
  metadata.
- Prefer small vertical slices with automated tests. Test mobile flows at a 390px viewport.

Path-scoped detail lives in `.claude/rules/` and loads when you touch matching files.

## Commands

PowerShell here blocks `npm.ps1`, so always use `npm.cmd` and `npx.cmd`.

| Purpose              | Command                                         |
| -------------------- | ----------------------------------------------- |
| Install exact tree   | `npm.cmd ci`                                    |
| Lint                 | `npm.cmd run lint`                              |
| Types                | `npm.cmd run typecheck`                         |
| Unit/component tests | `npm.cmd run test:run`                          |
| One test file        | `npm.cmd run test:run -- src/path/file.test.ts` |
| Production build     | `npm.cmd run build`                             |
| Dev server           | `npm.cmd run dev`                               |
| Production server    | `npm.cmd run start -- -p <port>`                |

- **Never run `npm run test`** — that is Vitest watch mode and it will hang the session.
- Run Prettier over files you **create**, not only ones you edit. A new file is the usual way
  a branch goes red on formatting.
- `npm.cmd run format` rewrites line endings across the whole repository, so `git status`
  then shows hundreds of files. Only the README's type-generation sequence needs it. After
  running it, `git diff --numstat` names the few files with real content changes: stage those,
  then `git checkout -- .` to drop the rest. Otherwise format the files you touched by name.
- `npm.cmd run format:check` fails on a clean checkout (131 files) because `core.autocrlf`
  gives CRLF working files and Prettier defaults to LF. Do not "fix" it repo-wide. To check
  your own files: `npx.cmd prettier --write <changed files>`, then `git diff` — no diff means
  it was line endings only. CI runs Prettier on a Linux checkout, so trust CI over the local
  command.

## Continuous integration

`.github/workflows/ci.yml` runs on `master`, `ticket/**`, `chore/**`, and pull requests.
Three jobs, about four minutes: `static` (Prettier, ESLint, TypeScript, `test:run`, build),
`database` (every migration from zero, db lint, advisors, pgTAP, concurrency harnesses), and
`browser` (390px production Playwright flows).

- Green CI for the commit being merged is the automated-test evidence. Don't re-run the
  suites by hand to produce a report.
- A red run blocks the merge. If it is a known flake, `gh run rerun --failed` keeps the run
  URL valid, and the log line says what flaked. An undiagnosed failure is a blocker.
- Inspect with `gh run list --branch <branch>`, `gh run view <id>`,
  `gh run view <id> --log-failed`. For a browser failure,
  `gh run download <id> -n playwright-report` has the trace.
- CI needs no repository secret: each Docker job starts its own disposable Supabase stack.
  Never add a secret, hosted project, deployment step, or paid resource without the owner's
  approval, and never weaken a check to make a branch green.
- CI proves an assertion holds. It cannot judge whether a mobile surface looks right — that
  stays the owner's check.

## Database and hosted environment

`README.md` has the reset / lint / advisor / pgTAP / type-generation sequence.

- **Applying a migration to the founder project is yours to do** (ADR-018), under three
  conditions: a green CI run for that exact commit first; `migration list --linked` and
  `db advisors --linked --type security` afterwards, reported to the owner; and destructive
  DDL (`drop table`, `drop column`, `truncate`, unfiltered `delete`) asked about first.
  `db dump`, `db diff` and `inspect` are available for diagnosis, and what they return stays
  on this machine.
- Never run `db reset --linked`, `migration repair`, `db remote`, `secrets`, `projects`, or
  `branches`. `supabase/config.toml` is local-only development configuration.
- Docker-backed local runs are slow; run them in the background rather than blocking.
- **To show the owner a change**, the local stack needs an account with data. `npx.cmd supabase
  status -o env` gives the URL and keys; pass them to `dev`/`start` explicitly. Take
  `PUBLISHABLE_KEY`, **not `ANON_KEY`** — both are in that output, and `src/lib/supabase/env.ts`
  refuses the legacy JWT form on purpose, so `ANON_KEY` gets a 500 on sign-in that names the
  variable rather than the key. Create a confirmed user through `/auth/v1/admin/users` with the
  service-role key, then insert its `profiles` row with `docker exec supabase_db_fittip psql` —
  nothing but the app creates one, and service_role has no privileges on that table. `psql`
  needs `docker exec -i` to read a heredoc; without `-i` it silently does nothing. Plan sessions
  need distinct `position` values per day, and every plan activity needs `isLocked`.
- **A `db reset --local` takes that account with it.** The reset is the first half of the
  schema-change gate, so a session that runs one has no signed-in owner afterwards and has to
  create the user and seed the plan again before it can show anything.
- `npm.cmd run test:e2e` needs the app serving on port 3000 plus
  `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Some specs also need
  `SUPABASE_SERVICE_ROLE_KEY` and **skip silently without it** — read the skipped count before
  calling a run green. Existing per-ticket configs pin their own `testMatch` and port.
- `db push` can print internal certificate errors and still finish. `migration list --linked`
  showing the repository's version in remote history is the proof it applied; the push's own
  output is not.
- `production` on Vercel is the owner-only founder environment, not a public launch.

## Hands off

- `src/lib/supabase/database.types.ts` — generated by the Supabase CLI.
- `supabase/migrations/*.sql` already applied — corrections are forward-only.
- `docs/validation/**` and `docs/backlog/M0`–`M3` — permanent history.
- `.env.local` and anything matching `.env*` except `.env.example` — never read, never commit.
- `node_modules/`, `.next/`, `supabase/.branches/`, `supabase/.temp/`.

## Pitfalls

- `src/architecture/*.test.ts` are repo-wide invariants, not unit tests. They fail if a
  `"use client"` file imports from `@/server/**` or a repository, or if `.retry(false)` appears
  outside the two atomic RPC calls. Changing a pattern there is a deliberate decision.
- `next build` may warn about workspace root inference when more than one lockfile is visible.
  The build still succeeds.
- Next.js 16: middleware is `src/proxy.ts`, route params are async, and private response
  headers come from `next.config.ts` (covered by `next.config.test.ts`).
- Deleting files is blocked by the permission layer. Leave leftovers (run artifacts, stray
  screenshots) to the owner and say what they are rather than working around it.
