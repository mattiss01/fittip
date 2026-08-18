begin;

create extension if not exists pgtap with schema extensions;

select plan(41);

select has_table('public', 'profiles', 'profiles table exists');
select has_column('public', 'profiles', 'user_id', 'profiles.user_id exists');
select has_column('public', 'profiles', 'created_at', 'profiles.created_at exists');
select hasnt_column('public', 'profiles', 'username', 'profiles has no username');
select col_type_is('public', 'profiles', 'user_id', 'uuid', 'user_id is uuid');
select col_type_is(
  'public',
  'profiles',
  'created_at',
  'timestamp with time zone',
  'created_at is timezone-aware'
);
select col_not_null('public', 'profiles', 'user_id', 'user_id is required');
select col_not_null('public', 'profiles', 'created_at', 'created_at is required');
select col_has_default('public', 'profiles', 'created_at', 'created_at has a default');
select col_is_pk('public', 'profiles', 'user_id', 'user_id is the primary key');
select col_is_fk('public', 'profiles', 'user_id', 'user_id references Auth');
select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.profiles'::regclass
  ),
  'RLS is enabled'
);
select is(
  (
    select count(*)::bigint
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_owner_select'
      and cmd = 'SELECT'
      and roles = array['authenticated']::name[]
  ),
  1::bigint,
  'owner SELECT policy targets authenticated users'
);
select is(
  (
    select count(*)::bigint
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_owner_insert'
      and cmd = 'INSERT'
      and roles = array['authenticated']::name[]
  ),
  1::bigint,
  'owner INSERT policy targets authenticated users'
);
-- M3-12 added the third: an owner UPDATE policy that exists only so the owner
-- can confirm their own time zone. Its privilege is column-scoped, which is
-- why the table-wide UPDATE assertion below is still false.
select is(
  (
    select count(*)::bigint
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
  ),
  3::bigint,
  'profiles has only the three approved policies'
);
select ok(not has_table_privilege('anon', 'public.profiles', 'SELECT'), 'anon has no SELECT privilege');
select ok(not has_table_privilege('anon', 'public.profiles', 'INSERT'), 'anon has no INSERT privilege');
select ok(has_table_privilege('authenticated', 'public.profiles', 'SELECT'), 'authenticated has SELECT privilege');
select ok(has_table_privilege('authenticated', 'public.profiles', 'INSERT'), 'authenticated has INSERT privilege');
select ok(not has_table_privilege('authenticated', 'public.profiles', 'UPDATE'), 'authenticated has no table-wide UPDATE privilege');
select ok(not has_table_privilege('authenticated', 'public.profiles', 'DELETE'), 'authenticated has no DELETE privilege');

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-4000-8000-000000000001', 'user-a@example.test', '{}', '{}'),
  ('00000000-0000-4000-8000-000000000002', 'user-b@example.test', '{}', '{}'),
  ('00000000-0000-4000-8000-000000000003', 'no-claims@example.test', '{}', '{}');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$ insert into public.profiles (user_id) values ('00000000-0000-4000-8000-000000000001') $$,
  'user A can insert their own profile'
);
select is((select count(*)::bigint from public.profiles where user_id = '00000000-0000-4000-8000-000000000001'), 1::bigint, 'user A can read their own profile');
select throws_ok(
  $$ insert into public.profiles (user_id) values ('00000000-0000-4000-8000-000000000002') $$,
  '42501',
  'new row violates row-level security policy for table "profiles"',
  'user A cannot insert a profile for user B'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select lives_ok(
  $$ insert into public.profiles (user_id) values ('00000000-0000-4000-8000-000000000002') $$,
  'user B can insert their own profile'
);
select is((select count(*)::bigint from public.profiles where user_id = '00000000-0000-4000-8000-000000000001'), 0::bigint, 'user B cannot read user A');
select is((select count(*)::bigint from public.profiles where user_id = '00000000-0000-4000-8000-000000000002'), 1::bigint, 'user B can read their own profile');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select count(*)::bigint from public.profiles where user_id = '00000000-0000-4000-8000-000000000002'), 0::bigint, 'user A cannot read user B');
select throws_ok(
  $$ update public.profiles set created_at = now() where user_id = '00000000-0000-4000-8000-000000000001' $$,
  '42501', 'permission denied for table profiles', 'user A cannot update a profile column outside the M3-12 grant'
);
select throws_ok(
  $$ delete from public.profiles where user_id = '00000000-0000-4000-8000-000000000001' $$,
  '42501', 'permission denied for table profiles', 'user A cannot delete their own profile'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$ update public.profiles set created_at = now() where user_id = '00000000-0000-4000-8000-000000000001' $$,
  '42501', 'permission denied for table profiles', 'user B cannot update user A'
);
select throws_ok(
  $$ delete from public.profiles where user_id = '00000000-0000-4000-8000-000000000001' $$,
  '42501', 'permission denied for table profiles', 'user B cannot delete user A'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok('select * from public.profiles', '42501', 'permission denied for table profiles', 'anonymous reads are denied');
select throws_ok(
  $$ insert into public.profiles (user_id) values ('00000000-0000-4000-8000-000000000003') $$,
  '42501', 'permission denied for table profiles', 'anonymous inserts are denied'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select is((select count(*)::bigint from public.profiles), 0::bigint, 'authenticated role without a user id reads no profiles');
select throws_ok(
  $$ insert into public.profiles (user_id) values ('00000000-0000-4000-8000-000000000003') $$,
  '42501', 'new row violates row-level security policy for table "profiles"', 'authenticated role without a user id cannot insert'
);

reset role;
select ok((select created_at is not null from public.profiles where user_id = '00000000-0000-4000-8000-000000000001'), 'created_at receives its default');
select hasnt_column('public', 'profiles', 'email', 'profiles does not duplicate email');
select hasnt_column('public', 'profiles', 'password', 'profiles does not store passwords');
select hasnt_table('public', 'invites', 'no invite table exists');
select is((select count(*)::bigint from information_schema.columns where table_schema = 'public' and table_name = 'profiles'), 3::bigint, 'profiles has exactly the three approved columns');

select * from finish();

rollback;
