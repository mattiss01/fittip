begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

-- 1. The column --------------------------------------------------------------

select col_type_is('public', 'profiles', 'coach_push_level', 'text', 'coach_push_level is text');
select col_not_null('public', 'profiles', 'coach_push_level', 'coach_push_level is never null');
select col_default_is('public', 'profiles', 'coach_push_level', 'balanced', 'coach_push_level starts balanced');

-- Column-scoped, as the rest of the profile's settings are.
select ok(
  not has_table_privilege('authenticated', 'public.profiles', 'UPDATE'),
  'authenticated still has no table-wide UPDATE on profiles'
);
select ok(
  has_column_privilege('authenticated', 'public.profiles', 'coach_push_level', 'UPDATE'),
  'authenticated may update coach_push_level'
);
select ok(
  not has_column_privilege('anon', 'public.profiles', 'coach_push_level', 'SELECT')
    and not has_column_privilege('anon', 'public.profiles', 'coach_push_level', 'UPDATE'),
  'anon can neither read nor write coach_push_level'
);
select is(
  (select count(*)::bigint from pg_policies where schemaname = 'public' and tablename = 'profiles'),
  3::bigint,
  'profiles gained no policy'
);

-- 2. Behaviour ---------------------------------------------------------------

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-4000-8000-0000000000e5', 'push-a@example.test', '{}', '{}'),
  ('00000000-0000-4000-8000-0000000000f6', 'push-b@example.test', '{}', '{}');
insert into public.profiles (user_id)
values
  ('00000000-0000-4000-8000-0000000000e5'),
  ('00000000-0000-4000-8000-0000000000f6');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e5","role":"authenticated"}', true);

select is(
  (select coach_push_level from public.profiles where user_id = '00000000-0000-4000-8000-0000000000e5'),
  'balanced',
  'a new profile is balanced'
);
select lives_ok(
  $$ update public.profiles set coach_push_level = 'all_in'
     where user_id = '00000000-0000-4000-8000-0000000000e5' $$,
  'the owner can choose a level'
);
select is(
  (select coach_push_level from public.profiles where user_id = '00000000-0000-4000-8000-0000000000e5'),
  'all_in',
  'the owner reads back the level they chose'
);
select throws_ok(
  $$ update public.profiles set coach_push_level = 'extreme'
     where user_id = '00000000-0000-4000-8000-0000000000e5' $$,
  '23514', null, 'a level that is not one of the five is refused'
);
select throws_ok(
  $$ update public.profiles set coach_push_level = null
     where user_id = '00000000-0000-4000-8000-0000000000e5' $$,
  '23502', null, 'a level cannot be cleared'
);

-- Another account's row is not there to be changed.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f6","role":"authenticated"}', true);
update public.profiles
set coach_push_level = 'gentle'
where user_id = '00000000-0000-4000-8000-0000000000e5';

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e5","role":"authenticated"}', true);
select is(
  (select coach_push_level from public.profiles where user_id = '00000000-0000-4000-8000-0000000000e5'),
  'all_in',
  'another account''s update changed nothing'
);

reset role;
set local role anon;
select throws_ok(
  $$ update public.profiles set coach_push_level = 'gentle' $$,
  '42501', null, 'anon cannot write a level'
);

reset role;

select * from finish();

rollback;
