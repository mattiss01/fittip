# M3-19 founder migration runbook

Applies `20260829135426_m3_19_delete_a_planned_session.sql` to the founder
project and produces the hosted evidence `AGENTS.md` requires before
acceptance. The lead agent cannot run any of it: `supabase link`, `db push`,
and `db remote` are in the `deny` list in `.claude/settings.json`, the CLI
login needs a TTY, and the database password is unreadable to the agent. Every
command below runs in the product owner's own terminal or in the Supabase SQL
editor.

**Project:** `mahhfyxhgcmcbqkvudcm` (FitTip Founder Staging)
**Commit:** `1e12dce`, the independently reviewed implementation
**Repository migration count:** 20, ending at `20260829135426`

This migration is **narrower than M3-15A's**. It creates no table, no column,
no constraint, and no index. It replaces the body of one existing function,
`apply_rolling_plan_change_set`, and re-establishes that function's existing
grant. So the checks below are about one function, not a schema.

Paste each result back into the session. The lead appends them to
`../M3-19-VALIDATION.md` under a dated subsection.

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

**Expect 19 remote entries**, the newest `20260829073444` (M3-15A), with
`20260829135426` showing as local-only. If remote already has entries the
repository does not, stop — that is history drift and a delivery blocker.

### 1.3 Apply

```bash
npx.cmd supabase db push --linked > push.txt 2>&1; cat push.txt
```

Redirect and `cat` rather than piping to `tee` — `tee` buffers and hides the
CLI's own confirmation prompt, which looks exactly like a hang.

**Expect exactly one migration applied:** `20260829135426`.

### 1.4 History after

```bash
npx.cmd supabase migration list --linked > after.txt 2>&1; cat after.txt
```

**Expect 20 remote entries aligned at every position with the repository**,
ending `20260829135426`.

### 1.5 Hosted advisors

```bash
npx.cmd supabase inspect db lint --linked > lint.txt 2>&1; cat lint.txt
```

A clean local advisor run says nothing about the hosted project, which is why
this is here rather than assumed from CI. **Expect no new category.** M3-15A's
run left one known warning in the existing ADR-008 category; a warning in that
same category is expected and is not a blocker. Anything new is.

---

## Part 2 — the function's security properties (Supabase SQL editor)

This migration's whole risk surface is one function. These four checks are the
whole of it.

### 2.1 It is still `security definer` with an empty `search_path`

```sql
select p.proname,
       p.prosecdef as security_definer,
       p.proconfig as config
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'apply_rolling_plan_change_set';
```

**Expect** `security_definer = true` and `config = {search_path=}`. A
`security definer` function with a settable `search_path` is the classic
privilege-escalation shape; this is the check that it did not regress.

### 2.2 Execute privileges are `authenticated` only

```sql
select grantee, privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name = 'apply_rolling_plan_change_set'
order by grantee;
```

**Expect exactly one row:** `authenticated / EXECUTE`. Not `anon`, not
`public`, not `service_role`. The migration revokes from all four and re-grants
to one, so a second row here means the revoke did not take.

### 2.3 The delete branch is actually in the deployed body

```sql
select
  pg_get_functiondef(p.oid) like '%v_operation = ''delete''%' as has_delete_branch,
  pg_get_functiondef(p.oid) like '%v_operation = ''cancel''%' as cancel_is_explicit,
  pg_get_functiondef(p.oid) like '%PT425%'                    as has_completion_guard
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'apply_rolling_plan_change_set';
```

**Expect all three `true`.** The second matters as much as the first: before
this ticket `cancel` was the unnamed `else` fallthrough, and the point of the
change was to name it so that an unknown operation can no longer fall through
into a destructive branch.

### 2.4 Nothing else moved

```sql
select conname
from pg_constraint
where conrelid = 'public.rolling_plan_change_entries'::regclass
  and conname in (
    'rolling_plan_change_entries_kind_check',
    'rolling_plan_change_entries_target_check',
    'rolling_plan_change_entries_states_check',
    'rolling_plan_change_entries_session_fkey'
  )
order by conname;
```

**Expect all four rows.** This ticket reuses M3-14's existing `delete` change
kind and must not have altered any of these. Four rows means the audit shape it
writes into is the one that was already accepted.

---

## Part 3 — the authenticated hosted delete

Everything above proves the function is shaped correctly. This proves it
behaves correctly for a real signed-in owner against the real project.

In the app, on the Preview URL, signed in as the founder account:

1. Open `/home/plan` and create a session on a future date.
2. On its card, open **Cancel**. Confirm the copy says the session is kept on
   the record, then cancel it. It should reappear under **Cancelled**.
3. On that same cancelled card, open **Delete** and delete it. It should
   disappear entirely rather than move anywhere.
4. Create a second future session, lock it, and delete it. It should delete —
   a lock stops a sweep, not a deliberate individual act.
5. Reload. Confirm the plan revision advanced and nothing reappeared.

Then, in the SQL editor, confirm the audit trail exists without the rows:

```sql
select change_kind, local_date, session_id, series_id,
       before_state is not null as has_before_state
from public.rolling_plan_change_entries
where change_kind = 'delete'
order by created_at desc
limit 5;
```

**Expect** one row per deletion, each with a `local_date`, a **null**
`session_id` and `series_id`, and `has_before_state = true`. That null session
id is the whole design: it is why the entry survives the session row it
describes being deleted.

---

## What this runbook does not cover

**The `PT425` completion refusal cannot be exercised by hand on the Preview.**
Nothing in the app writes a completion until M3-15B ships the logging path, so
there is no way to create a session that carries one through the UI. It is
proven in pgTAP, in both adapters, and in the local browser flow, which writes
the completion through M3-15A's own owner-derived RPC using the test account's
own token. This is recorded as a known limitation of the ticket, not as a gap
that hosted verification could close today. M3-15B is the first ticket that can
close it, and it should.

**The past-dated refusal is likewise pgTAP-only**, because no surface can
create a past-dated session to attempt it on.
