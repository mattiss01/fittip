# M3-02 hosted check runbook (limitation 9)

M3-02 was accepted on 12 August 2026 with four hosted checks named as
outstanding. This runbook is what closes them. It exists because the lead agent
**cannot** run any of it: `supabase link`, `db push`, `db remote`, and
`supabase projects` are in the `deny` list in `.claude/settings.json`, the CLI
login needs a TTY, and `.env.local` is unreadable to the agent by the same
config. Every command below runs in the product owner's own browser or terminal,
exactly as M3-01B's hosted verification did on 10 August 2026.

**Project:** `mahhfyxhgcmcbqkvudcm` (FitTip Founder Staging)
**Surface:** <https://fittip-gilt.vercel.app> — the founder production
deployment. M3-02's ticket Preview is a spent review artefact; the reviewed
commit `d55c343` is merged as `04cebc8` and `origin/master` is at `d5faac8`, so
production is the honest place to check now.

**What is already done** and needs no repeat: the migration is applied, remote
history matches the repository at all eleven positions, `db lint` is clean,
advisors return the accounted-for thirteen warnings, and the five hosted
function signatures carry no owner argument. See "Hosted verification" in
`../M3-02-VALIDATION.md`.

**What this runbook closes:** the authenticated owner read, the denied
cross-user read, the hosted privilege-boundary check, and the `390x844`
acceptance pass.

Paste the results back into the session and the lead appends them to the
validation record under a dated subsection. Do not edit the accepted record's
existing text.

---

## Part 1 — privilege boundary, in the Supabase SQL editor

Six tables and nine functions. Run each block and compare against the stated
expectation. A mismatch is a finding, not a formatting quirk — report it rather
than adjusting the query.

### 1.1 Column-level SELECT for `authenticated`

```sql
select table_name, column_name
from information_schema.column_privileges
where grantee = 'authenticated'
  and table_schema = 'public'
  and table_name = 'roadmap_generation_requests'
order by column_name;
```

**Expect exactly 16 rows.** `completion_token` must be **absent**. The table has
17 columns; the token is the capability that permits finishing a generation, and
an owner able to read it could finish their own generation with content the
server never validated. Its absence is the whole point of the check.

The 16: `created_at`, `expected_head_revision`, `failure_code`, `id`,
`idempotency_key`, `planning_note_hash`, `previous_proposal_id`, `proposal_id`,
`regeneration_feedback_hash`, `regeneration_number`, `request_fingerprint`,
`requested_end_date`, `requested_start_date`, `status`, `updated_at`, `user_id`.

### 1.2 Table-level grants on all six tables

```sql
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in (
    'roadmap_generation_requests',
    'roadmap_proposals',
    'roadmap_proposal_sources',
    'roadmap_proposal_decisions',
    'roadmap_versions',
    'roadmap_heads'
  )
order by table_name, grantee, privilege_type;
```

**Expect:** `authenticated` holds `SELECT` and nothing else, on the five tables
granted at table level. `roadmap_generation_requests` should **not** appear for
`authenticated` here at all — its grant is column-level and shows only in 1.1.
`anon` must not appear. No `INSERT`, `UPDATE`, or `DELETE` for any role other
than `postgres`.

**Watch `service_role`.** The migration revokes all privileges from it on all
six tables. If `service_role` appears here holding privileges, Supabase's
default grants outlived the revoke — report it. That would differ from M3-01B,
where `service_role` deliberately retained its default seven and the product
owner accepted it as that ticket's limitation 6.

### 1.3 RLS is on, and the policies are read-only

```sql
select c.relname, c.relrowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname like 'roadmap_%'
order by c.relname;

select tablename, policyname, roles, cmd, qual
from pg_policies
where schemaname = 'public'
  and tablename like 'roadmap_%'
order by tablename;
```

**Expect:** `relrowsecurity` is `true` for all six tables. **Exactly six
policies**, one per table, each named `<table>_owner_select`, each `{authenticated}`,
each `cmd = SELECT`, each `qual` equal to `(( SELECT auth.uid() AS uid) = user_id)`.
No `INSERT`, `UPDATE`, `DELETE`, or `ALL` policy exists anywhere in this set —
every write goes through a `SECURITY DEFINER` function or it does not happen.

### 1.4 Function security and execute grants

```sql
select p.proname,
       p.prosecdef,
       p.proconfig,
       pg_catalog.has_function_privilege('authenticated', p.oid, 'execute')
         as authenticated_can_execute,
       pg_catalog.has_function_privilege('anon', p.oid, 'execute')
         as anon_can_execute,
       pg_catalog.has_function_privilege('service_role', p.oid, 'execute')
         as service_role_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'begin_roadmap_generation',
    'finish_roadmap_generation',
    'record_roadmap_memory_candidates',
    'apply_roadmap_proposal_change',
    'accept_roadmap_proposal',
    'roadmap_normalize_owner_text',
    'roadmap_owner_text_hash',
    'roadmap_content_is_valid',
    'roadmap_technical_codes_are_accepted'
  )
order by p.prosecdef desc, p.proname;
```

**Expect nine rows**, splitting cleanly in two:

- **Five `SECURITY DEFINER`** (`prosecdef = true`): the ADR-015 write functions.
  `proconfig` is `{search_path=""}` on every one — an empty search path is what
  stops a definer function resolving a name into a caller-controlled schema.
  `authenticated_can_execute` is `true`.
- **Four `SECURITY INVOKER`** (`prosecdef = false`): the helpers. `proconfig` is
  also `{search_path=""}`, and **all three** execute columns are `false` — the
  migration revokes them from `public`, `anon`, `authenticated`, and
  `service_role`, so they are reachable only from inside a definer function.

`anon_can_execute` must be `false` on all nine.

---

## Part 2 — the authenticated read, under a simulated role

This is the check the catalogue cannot make: 1.1–1.4 say the grants are written
correctly, and this says the database *enforces* them. It runs entirely inside a
transaction that is rolled back, so it creates and changes nothing.

### 2.1 First, is the test meaningful?

```sql
select 'proposals' as t, user_id, count(*) from public.roadmap_proposals group by 1, 2
union all
select 'versions', user_id, count(*) from public.roadmap_versions group by 1, 2
union all
select 'heads', user_id, count(*) from public.roadmap_heads group by 1, 2
order by 1, 2;
```

**Read this before running 2.2.** If every count is zero, the cross-user denial
below passes vacuously — zero rows are invisible to everyone, including their
owner — and it proves nothing. In that case generate one roadmap proposal on
<https://fittip-gilt.vercel.app> first (the 390px pass in Part 3 does exactly
that), then come back. Note the `user_id` that appears; 2.2 needs it.

### 2.2 The owner sees their rows; a stranger sees none

**Substitute before running.** Replace **both** occurrences of `OWNER_UUID`
with the `user_id` from 2.1 — there is one in this block and one in 2.3.
Pasting the block unedited fails with
`22P02: invalid input syntax for type uuid: "OWNER_UUID"`, which is the
placeholder doing its job rather than a finding. The second subject is a
literal random UUID and must stay one — it is the stranger.

```sql
begin;
select set_config('request.jwt.claims',
                  '{"sub":"OWNER_UUID","role":"authenticated"}', true);
set local role authenticated;

select 'owner' as subject,
       (select count(*) from public.roadmap_proposals)          as proposals,
       (select count(*) from public.roadmap_versions)           as versions,
       (select count(*) from public.roadmap_heads)              as heads,
       (select count(*) from public.roadmap_generation_requests) as requests,
       (select count(*) from public.roadmap_proposal_sources)   as sources,
       (select count(*) from public.roadmap_proposal_decisions) as decisions;

reset role;
select set_config('request.jwt.claims',
                  '{"sub":"00000000-0000-4000-8000-0000000000ff","role":"authenticated"}', true);
set local role authenticated;

select 'stranger' as subject,
       (select count(*) from public.roadmap_proposals)          as proposals,
       (select count(*) from public.roadmap_versions)           as versions,
       (select count(*) from public.roadmap_heads)              as heads,
       (select count(*) from public.roadmap_generation_requests) as requests,
       (select count(*) from public.roadmap_proposal_sources)   as sources,
       (select count(*) from public.roadmap_proposal_decisions) as decisions;

rollback;
```

**Expect:** the `owner` row matches the counts from 2.1 with no error. The
`stranger` row is **`0` in every column**. A non-zero stranger count on any
table is a cross-user leak and a stop-everything finding.

### 2.3 The withheld column is actually withheld

```sql
begin;
select set_config('request.jwt.claims',
                  '{"sub":"OWNER_UUID","role":"authenticated"}', true);
set local role authenticated;

select count(*) from public.roadmap_generation_requests;   -- expect: succeeds
select completion_token from public.roadmap_generation_requests limit 1;

rollback;
```

**Expect:** the first statement succeeds. The second fails with
**`42501 permission denied for table roadmap_generation_requests`** (or
`... for column completion_token`, depending on the server's phrasing). A
result set instead of an error means the column grant did not take, and the
finish-generation capability is readable by its owner.

---

## Part 3 — the `390x844` acceptance pass

Browser dev tools at **390 × 844**, signed in as the founder account, on
<https://fittip-gilt.vercel.app>. This is the judgement CI cannot make. The
seven reference screenshots from the ticket are in this directory
(`M3-02-*-390x844.png`) — compare against them rather than against memory.

Walk the roadmap surface and check:

1. **Empty state** — honest, not a spinner that never resolves, and it says what
   to do next.
2. **Compose** — the planning-note field, its character limit, and the horizon
   selection are usable one-handed at this width. Nothing is clipped.
3. **Generate** — a proposal appears. Without `FITTIP_AI_LIVE` this is the
   synthetic fixture roadmap: structurally valid and deliberately dull. You are
   judging the *surface*, not the coaching (limitation 13).
4. **The lost-render notice** — expect to hit it occasionally, roughly half the
   time locally (limitation 11). It should show a brief notice and recover by
   reloading, and must never claim a save that did not happen.
5. **Edit, decline, regenerate, accept** — each reaches its recorded state, and
   the regenerated proposal shows its lineage back to the one it replaces.
6. **Focus and touch** — keyboard focus is visible on every control, tap targets
   are reachable, and reduced-motion is respected.
7. **Copy tone** — serious coach, no false certainty. Two strings were approved
   as written on 12 August 2026 (limitation 12); the rest should match the
   ticket's approved list.

---

## Reporting back

Paste, for each part: the query results or a one-line pass/fail, plus anything
that surprised you. The lead appends a dated "Hosted verification completed"
subsection to `../M3-02-VALIDATION.md` and closes limitation 9 there — or
records precisely what still fails, which is the same job done honestly.
