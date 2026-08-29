# M3-15A founder migration runbook

Applies `20260829073444_m3_15a_completion_foundation.sql` to the founder
project and produces the hosted evidence `AGENTS.md` requires before
acceptance. The lead agent cannot run any of it: `supabase link`, `db push`,
and `db remote` are in the `deny` list in `.claude/settings.json`, the CLI
login needs a TTY, and the database password is unreadable to the agent. Every
command below runs in the product owner's own terminal or in the Supabase SQL
editor, exactly as the M3-02 hosted checks did.

**Project:** `mahhfyxhgcmcbqkvudcm` (FitTip Founder Staging)
**Commit:** `0cc8d46`, independently reviewed and approved 29 August 2026
**Repository migration count:** 19, ending at `20260829073444`

Paste each result back into the session. The lead appends them to
`../M3-15A-VALIDATION.md` under a dated subsection.

---

## Part 1 — apply the migration (terminal)

Run from **Git Bash**, not PowerShell.

### 1.1 Link

```bash
npx.cmd supabase link --project-ref mahhfyxhgcmcbqkvudcm
```

It prompts for the database password. If that password is lost it is not
retrievable — reset it at Project Settings → Database → Reset database
password. That is safe for the app, which reaches Supabase over the REST API
with the publishable and service-role keys.

### 1.2 History before

```bash
npx.cmd supabase migration list --linked > before.txt 2>&1; cat before.txt
```

**Expect 18 remote entries**, the newest `20260819112410` (M3-14), with
`20260829073444` showing as local-only. If remote already has entries the
repository does not, stop — that is history drift and a delivery blocker.

### 1.3 Apply

```bash
npx.cmd supabase db push --linked > push.txt 2>&1; cat push.txt
```

Redirect and `cat` rather than piping to `tee` — `tee` buffers and hides the
CLI's own confirmation prompt, which looks exactly like a hang.

**Expect exactly one migration applied:** `20260829073444`.

### 1.4 History after

```bash
npx.cmd supabase migration list --linked > after.txt 2>&1; cat after.txt
```

**Expect 19 rows, local and remote aligned at every position**, newest
`20260829073444`. Any row present on one side only is a blocker.

### 1.5 Hosted advisors

```bash
npx.cmd supabase db advisors --linked --type all --level warn > advisors.txt 2>&1; cat advisors.txt
```

**Expect warnings, and that is not a failure.** The local run was clean, which
predicts nothing: the local container does not run the hosted lint
`0029_authenticated_security_definer_function_executable`, and FitTip trips it
by design on every `apply_*` function, because that is how an owner's write is
mediated instead of granted directly. Before this ticket there were six such
functions plus the auth-settings warnings. This ticket adds **one**,
`apply_completion_change`. Report the full list; the lead attributes each
warning to the migration that introduced it rather than treating the count as a
regression. A warning in a **new category** is a finding.

---

## Part 2 — schema and privilege boundary (Supabase SQL editor)

A mismatch is a finding. Report it rather than adjusting the query.

### 2.1 The two tables exist with RLS on

```sql
select relname, relrowsecurity
from pg_class
where relnamespace = 'public'::regnamespace
  and relname in ('completions', 'completion_activities')
order by relname;
```

**Expect 2 rows, `relrowsecurity` true on both.**

### 2.2 Grants — the important one

```sql
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('completions', 'completion_activities')
order by table_name, grantee, privilege_type;
```

**Expect `authenticated` with `SELECT` and nothing else, on both tables.**
`anon` must not appear at all. No `INSERT`, `UPDATE`, or `DELETE` for any role
but the table owner. A single `INSERT` row for `authenticated` would mean an
owner could write a completion bypassing the validating function — that is the
whole point of this check.

### 2.3 Policies

```sql
select tablename, policyname, cmd, qual
from pg_policies
where schemaname = 'public'
  and tablename in ('completions', 'completion_activities')
order by tablename;
```

**Expect exactly two policies**, both `SELECT`, both carrying an explicit
`auth.uid() = user_id` ownership predicate. A `qual` of `true` is a cross-owner
read hole.

### 2.4 The write function's security properties

```sql
select p.proname,
       p.prosecdef,
       p.proconfig,
       pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname = 'apply_completion_change';
```

**Expect** `prosecdef` = true, `proconfig` = `{search_path=""}`, and args
exactly `text, uuid, bigint, jsonb`. The single `uuid` is the completion id.
**There must be no second uuid** — the owner comes from `auth.uid()` alone. If
one appears, stop.

### 2.5 Execute privileges on it

```sql
select grantee, privilege_type
from information_schema.role_routine_grants
where routine_schema = 'public'
  and routine_name = 'apply_completion_change'
order by grantee;
```

**Expect `authenticated` only.** `anon`, `service_role`, and `PUBLIC` must be
absent.

### 2.6 Deletion protection is in the database

```sql
select conname, confdeltype
from pg_constraint
where conrelid = 'public.completions'::regclass
  and contype = 'f';
```

**Expect `completions_plan_fkey` with `confdeltype = 'r'`** (restrict). This is
acceptance criterion 6: a plan session carrying a completion cannot be hard
deleted, by the database rather than by application code.

### 2.7 The retired revision chain is genuinely absent

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('completion_heads', 'completed_activities',
                     'completed_sessions');
```

```sql
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'completions'
  and column_name in ('correction_reason', 'revision_number',
                      'completion_group_id', 'previous_completion_id');
```

**Expect both to return zero rows.**

---

## Part 3 — the authenticated hosted read

Part 2 proves the grants are right. This proves the path actually works for a
signed-in owner, which is what `AGENTS.md` asks for. Both blocks run in the
SQL editor, which executes as the table owner by default — the `set local role`
is what makes the check meaningful.

Your auth user id is on the dashboard under Authentication → Users.

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"<YOUR-AUTH-USER-ID>","role":"authenticated"}';
select count(*) from public.completions;
commit;
```

**Expect `0`, and critically no error.** Zero is correct: the table is new and
nothing writes to it until M3-15. A `permission denied` here means the
authenticated read path is broken and the ticket is not deliverable.

Then the denial half:

```sql
begin;
set local role anon;
select count(*) from public.completions;
commit;
```

**Expect `permission denied for table completions`.** An anonymous count of `0`
would mean `anon` holds a grant it must not have. If the transaction aborts,
run `rollback;` before continuing.

---

## What this runbook does not cover

There is no 390px visual pass. M3-15A adds no user-visible surface — the
maintenance stubs are untouched — and M3-10 and M3-14 set the precedent of
accepting a dormant-schema ticket on schema and security evidence alone. The
visual pass returns with M3-15.
---

## Appendix — Part 2 as a single paste

Part 2 above is broken into blocks so each expectation is readable next to its
query. Once the expectations are understood, this returns all of it as one
labelled result set, to save eight round trips. The letters match the sections.

```sql
select line from (
  select 'A rls        | ' || relname || ' = ' || relrowsecurity::text as line
  from pg_class
  where relnamespace = 'public'::regnamespace
    and relname in ('completions', 'completion_activities')

  union all
  select 'B grant      | ' || table_name || ' | ' || grantee || ' | ' || privilege_type
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name in ('completions', 'completion_activities')
    and grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')

  union all
  select 'C policy     | ' || tablename || ' | ' || policyname || ' | ' || cmd
         || ' | ' || coalesce(qual, 'NULL')
  from pg_policies
  where schemaname = 'public'
    and tablename in ('completions', 'completion_activities')

  union all
  select 'D function   | secdef=' || p.prosecdef::text
         || ' | config=' || coalesce(array_to_string(p.proconfig, ','), 'NULL')
         || ' | args=' || pg_get_function_identity_arguments(p.oid)
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.proname = 'apply_completion_change'

  union all
  select 'E execute    | ' || grantee || ' | ' || privilege_type
  from information_schema.role_routine_grants
  where routine_schema = 'public'
    and routine_name = 'apply_completion_change'

  union all
  select 'F fk         | ' || conname || ' | ondelete=' || confdeltype::text
  from pg_constraint
  where conrelid = 'public.completions'::regclass
    and contype = 'f'

  union all
  select 'G legacy tbl | ' || table_name
  from information_schema.tables
  where table_schema = 'public'
    and table_name in ('completion_heads', 'completed_activities',
                       'completed_sessions')

  union all
  select 'H legacy col | ' || column_name
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'completions'
    and column_name in ('correction_reason', 'revision_number',
                        'completion_group_id', 'previous_completion_id')
) t
order by line;
```

**Expect 8 rows and nothing else:**

| Label | Rows | Expected |
| --- | --- | --- |
| `A rls` | 2 | both `= true` |
| `B grant` | 2 | `authenticated \| SELECT` on each table; **no `anon` row** |
| `C policy` | 2 | both `SELECT`, both with an `auth.uid()` predicate, neither `true` |
| `D function` | 1 | `secdef=true`, `config=search_path=`, `args=text, uuid, bigint, jsonb` |
| `E execute` | 1 | `authenticated \| EXECUTE` only |
| `F fk` | 2 | `completions_plan_fkey \| ondelete=r`, plus the owner FK |
| `G legacy tbl` | **0** | any row here is a blocker |
| `H legacy col` | **0** | any row here is a blocker |

More than 8 rows means something holds a privilege it should not. Fewer means
an object is missing. Either way, paste what you actually get.
