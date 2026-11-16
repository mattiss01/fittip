begin;

create extension if not exists pgtap with schema extensions;

select plan(41);

-- B2 (ADR-043 decision 5): each person's decisions about the terms and about
-- the coach, append-only, and no spend reserved without a coach yes in force.

-- 1. Shape --------------------------------------------------------------------

select has_table('public', 'consent_decisions', 'consent_decisions exists');
select col_type_is('public', 'consent_decisions', 'user_id', 'uuid', 'user_id is uuid');
select col_type_is('public', 'consent_decisions', 'kind', 'text', 'kind is text');
select col_type_is('public', 'consent_decisions', 'decision', 'text', 'decision is text');
select col_type_is('public', 'consent_decisions', 'version', 'text', 'version is text');
select col_type_is(
  'public', 'consent_decisions', 'decided_at', 'timestamp with time zone',
  'decided_at is a timestamp'
);
select col_not_null('public', 'consent_decisions', 'kind', 'kind is required');
select col_not_null('public', 'consent_decisions', 'decision', 'decision is required');
select col_not_null('public', 'consent_decisions', 'version', 'version is required');
select fk_ok(
  'public', 'consent_decisions', 'user_id',
  'public', 'profiles', 'user_id',
  'a decision belongs to a profile'
);
select is(
  (select confdeltype::text from pg_constraint
   where conname = 'consent_decisions_user_id_fkey'),
  'c',
  'decisions go with the account'
);
select has_index(
  'public', 'consent_decisions', 'consent_decisions_latest_idx',
  'the decision in force is found by index'
);

-- 2. Privileges and policies ----------------------------------------------------

select ok(
  (select relrowsecurity from pg_class where oid = 'public.consent_decisions'::regclass),
  'row level security is on'
);
select is(
  (select array_agg(policyname::text order by policyname::text)
   from pg_policies where schemaname = 'public' and tablename = 'consent_decisions'),
  array['consent_decisions_owner_insert', 'consent_decisions_owner_select'],
  'an owner may read and add their own decisions, nothing else'
);
select ok(
  has_table_privilege('authenticated', 'public.consent_decisions', 'SELECT'),
  'authenticated may read'
);
select ok(
  not has_table_privilege('authenticated', 'public.consent_decisions', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.consent_decisions', 'DELETE'),
  'authenticated may neither change nor remove a decision'
);
select is(
  (select array_agg(column_name::text order by column_name::text)
   from information_schema.column_privileges
   where table_schema = 'public' and table_name = 'consent_decisions'
     and grantee = 'authenticated' and privilege_type = 'INSERT'),
  array['decision', 'kind', 'user_id', 'version'],
  'a decision''s time and id are the database''s'
);
select ok(
  not has_table_privilege('anon', 'public.consent_decisions', 'SELECT')
  and not has_table_privilege('anon', 'public.consent_decisions', 'INSERT'),
  'anon has no access'
);
select ok(
  not has_function_privilege('authenticated', 'private.coach_consent_agreed(uuid)', 'EXECUTE'),
  'the helper is reachable only from inside the database'
);

-- 3. People ---------------------------------------------------------------------

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('b2000000-0000-4000-8000-000000000001', 'consent-a@example.test', '{}', '{}'),
  ('b2000000-0000-4000-8000-000000000002', 'consent-b@example.test', '{}', '{}');
insert into public.profiles (user_id, timezone_name)
values
  ('b2000000-0000-4000-8000-000000000001', 'UTC'),
  ('b2000000-0000-4000-8000-000000000002', 'UTC');
insert into public.consent_decisions (user_id, kind, decision, version)
values ('b2000000-0000-4000-8000-000000000002', 'coach', 'declined', '2026-11-12');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"b2000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

-- 4. The terms are agreed or not used; they never stand in for the coach ------

select lives_ok(
  $$insert into public.consent_decisions (kind, decision, version)
    values ('terms', 'agreed', '2026-11-15')$$,
  'a person accepts the terms'
);
select throws_ok(
  $$insert into public.consent_decisions (kind, decision, version)
    values ('terms', 'declined', '2026-11-15')$$,
  '23514', null,
  'the terms are not declined in a row: not using FitTip declines them'
);
select lives_ok(
  $$insert into public.consent_decisions (kind, decision, version)
    values ('health', 'agreed', '2026-11-15')$$,
  'a person gives the separate health consent'
);
select throws_ok(
  $$insert into public.consent_decisions (kind, decision, version)
    values ('health', 'declined', '2026-11-15')$$,
  '23514', null,
  'the health consent is withdrawn by deleting the account, not by a row'
);

-- 5. The spend backstop follows the coach decision in force ---------------------

select throws_ok(
  $$select public.reserve_ai_spend('create_roadmap', 5200, 'luna-v1', 'USD')$$,
  'PT403', 'The coach needs your agreement first.',
  'terms accepted, no coach decision: no spend'
);
select lives_ok(
  $$insert into public.consent_decisions (kind, decision, version)
    values ('coach', 'agreed', '2026-11-12')$$,
  'a person records their own coach yes'
);
select lives_ok(
  $$select public.reserve_ai_spend('create_roadmap', 5200, 'luna-v1', 'USD')$$,
  'agreed: spend is reserved'
);
select lives_ok(
  $$insert into public.consent_decisions (kind, decision, version)
    values ('coach', 'declined', '2026-11-12')$$,
  'a person withdraws with a new row'
);
select throws_ok(
  $$select public.reserve_ai_spend('create_roadmap', 5200, 'luna-v1', 'USD')$$,
  'PT403', 'The coach needs your agreement first.',
  'withdrawn: no spend'
);
select lives_ok(
  $$insert into public.consent_decisions (kind, decision, version)
    values ('terms', 'agreed', '2026-11-15')$$,
  'accepting the terms again'
);
select throws_ok(
  $$select public.reserve_ai_spend('create_roadmap', 5200, 'luna-v1', 'USD')$$,
  'PT403', 'The coach needs your agreement first.',
  'a later terms row does not revive a withdrawn coach yes'
);
select is(
  (select count(*)::bigint from public.consent_decisions),
  5::bigint,
  'a person sees their own five decisions and not anyone else''s'
);

-- 6. What a person cannot do -----------------------------------------------------

select throws_ok(
  $$insert into public.consent_decisions (user_id, kind, decision, version)
    values ('b2000000-0000-4000-8000-000000000002', 'coach', 'agreed', '2026-11-12')$$,
  '42501', null,
  'nobody decides for someone else'
);
select throws_ok(
  $$insert into public.consent_decisions (kind, decision, version, decided_at)
    values ('coach', 'agreed', '2026-11-12', '2026-01-01')$$,
  '42501', null,
  'nobody backdates a decision'
);
select throws_ok(
  $$update public.consent_decisions set decision = 'agreed'$$,
  '42501', null,
  'a decision is never changed in place'
);
select throws_ok(
  $$delete from public.consent_decisions$$,
  '42501', null,
  'a decision is never removed on its own'
);
select throws_ok(
  $$insert into public.consent_decisions (kind, decision, version)
    values ('marketing', 'agreed', '2026-11-12')$$,
  '23514', null,
  'a decision is about the terms or the coach'
);
select throws_ok(
  $$insert into public.consent_decisions (kind, decision, version)
    values ('coach', 'agreed', 'latest')$$,
  '23514', null,
  'a version is a date'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"b2000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select throws_ok(
  $$select public.reserve_ai_spend('create_roadmap', 5200, 'luna-v1', 'USD')$$,
  'PT403', 'The coach needs your agreement first.',
  'declined: no spend'
);

reset role;
set local role anon;
select throws_ok(
  $$insert into public.consent_decisions (user_id, kind, decision, version)
    values ('b2000000-0000-4000-8000-000000000001', 'coach', 'agreed', '2026-11-12')$$,
  '42501', null,
  'anon records nothing'
);
reset role;

-- 7. The rows go with the account ------------------------------------------------

select is(
  (select count(*)::bigint from public.consent_decisions
   where user_id = 'b2000000-0000-4000-8000-000000000001'),
  5::bigint,
  'the first person has five decisions'
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"b2000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
-- ADR-039's own path, unchanged by this migration.
select public.delete_my_account('DELETE');
reset role;
select is(
  (select count(*)::bigint from public.consent_decisions
   where user_id = 'b2000000-0000-4000-8000-000000000001'),
  0::bigint,
  'deleting the account removes its decisions'
);

select * from finish();
rollback;
