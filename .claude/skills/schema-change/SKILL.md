---
name: schema-change
description: Run FitTip's local Supabase schema-change workflow — create a forward migration, verify it from a clean reset, prove RLS with pgTAP, and regenerate the committed database types. Use when an approved ticket adds or changes a table, column, constraint, policy, grant, index, or RPC.
---

# Schema change

Only for an approved ticket that changes the database. Never touch a remote project: `supabase
link`, `db push`, and every other hosted command stay blocked by ADR-007.

## 1. Prepare

- Confirm the ticket names the schema change and that any new privileged boundary already has an
  ADR (a `SECURITY DEFINER` function is not reversible — ADR-009 is the precedent).
- Start Docker, then `npx.cmd supabase start` (first run takes minutes; run it in the
  background). `npx.cmd supabase status` reports the local URL and publishable key.

## 2. Write the migration

```powershell
npx.cmd supabase migration new <descriptive_name>
```

One forward migration. Never edit an applied file. In the SQL: revoke unintended privileges,
enable RLS, add owner policies with `(select auth.uid()) = user_id` for `authenticated`, give
updates both `USING` and `WITH CHECK`, and index the ownership/ordering columns that policies
and list queries need.

## 3. Prove it before touching the UI

Add or extend a pgTAP file in `supabase/tests/database/` asserting the actual columns, types,
constraints, foreign keys, indexes, privileges, policies, and RLS state — then owner access plus
anonymous and cross-user denial for every mutation. Cover the ticket's concurrency invariant
with genuinely simultaneous statements where one must lose.

## 4. Verify from zero

```powershell
npx.cmd supabase db reset --local
npx.cmd supabase db lint --local --level warning --fail-on warning
npx.cmd supabase db advisors --local --type all --level warn --fail-on warn
npx.cmd supabase test db --local supabase/tests/database
```

All four must pass on a clean reset. A lint or advisor finding is a blocker, not a note.

CI runs this same matrix on every push, so run it locally while iterating on the migration and
let the branch's CI run stand as the recorded evidence.

## 5. Regenerate committed types

After the clean reset, regenerate `src/lib/supabase/database.types.ts` with the sequence in
`README.md` ("Migrations and generated types"). It is three ordered steps — generate, then
`npm.cmd run format`, then `npm.cmd run types:patch` — and all three are required. Do not pass
`--schema public`, and do not run the patch before formatting; both mistakes are recorded in
M2-08 with what they cost. `git status` must be clean afterwards unless your migration
genuinely changed the schema. Never hand-edit the file.

Then run the application gate: `npm.cmd run lint`, `npm.cmd run typecheck`,
`npm.cmd run test:run`, `npm.cmd run build`.

## 6. Record

Put the actual privilege/policy matrix, the clean-reset and type-generation evidence, and the
ownership/concurrency results in the ticket's validation record — see the `validation-record`
skill. A schema commit is a separate concern from unrelated changes; keep the worktree clean.
