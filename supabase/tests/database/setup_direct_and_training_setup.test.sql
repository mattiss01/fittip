begin;

create extension if not exists pgtap with schema extensions;

select plan(34);

-- 1. Columns -----------------------------------------------------------------

select col_type_is('public', 'profiles', 'sessions_per_week', 'smallint', 'sessions_per_week is a smallint');
select col_type_is('public', 'profiles', 'unavailable_days', 'text[]', 'unavailable_days is a text array');
select col_type_is('public', 'profiles', 'availability_note', 'text', 'availability_note is text');
select col_type_is('public', 'profiles', 'training_places', 'text[]', 'training_places is a text array');
select col_type_is('public', 'profiles', 'home_equipment', 'text[]', 'home_equipment is a text array');
select col_type_is('public', 'profiles', 'setup_step', 'smallint', 'setup_step is a smallint');
select col_type_is('public', 'profiles', 'setup_finished_at', 'timestamp with time zone', 'setup_finished_at is a timestamp');
select col_type_is('public', 'profiles', 'setup_skipped_at', 'timestamp with time zone', 'setup_skipped_at is a timestamp');
select col_is_null('public', 'profiles', 'sessions_per_week', 'sessions_per_week may be unset');
select col_is_null('public', 'profiles', 'setup_step', 'setup_step may be unset');
select col_not_null('public', 'profiles', 'unavailable_days', 'unavailable_days is never null');
select col_default_is('public', 'profiles', 'training_places', '{}', 'training_places starts empty');
select col_default_is('public', 'profiles', 'home_equipment', '{}', 'home_equipment starts empty');

-- Still column-scoped: the settings and where setup stands, and nothing that
-- identifies or dates the row.
select ok(
  not has_table_privilege('authenticated', 'public.profiles', 'UPDATE'),
  'authenticated still has no table-wide UPDATE on profiles'
);
select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'user_id', 'UPDATE')
    and not has_column_privilege('authenticated', 'public.profiles', 'created_at', 'UPDATE'),
  'the owner and the creation time stay unwritable'
);
select ok(
  not has_column_privilege('anon', 'public.profiles', 'sessions_per_week', 'SELECT')
    and not has_column_privilege('anon', 'public.profiles', 'setup_step', 'UPDATE'),
  'anon can neither read nor write the new columns'
);
select is(
  (select count(*)::bigint from pg_policies where schemaname = 'public' and tablename = 'profiles'),
  3::bigint,
  'profiles gained no policy'
);

-- 2. Behaviour ---------------------------------------------------------------

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-4000-8000-0000000000c3', 'setup-a@example.test', '{}', '{}'),
  ('00000000-0000-4000-8000-0000000000d4', 'setup-b@example.test', '{}', '{}');
insert into public.profiles (user_id)
values
  ('00000000-0000-4000-8000-0000000000c3'),
  ('00000000-0000-4000-8000-0000000000d4');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c3","role":"authenticated"}', true);

select lives_ok(
  $$ update public.profiles
     set sessions_per_week = 4,
         unavailable_days = array['monday', 'sunday'],
         availability_note = 'Tuesdays only after 18:00',
         training_places = array['Gym', 'Home'],
         home_equipment = array['Dumbbells', 'Mat'],
         setup_step = 9
     where user_id = '00000000-0000-4000-8000-0000000000c3' $$,
  'the owner can save their training setup and where setup stands'
);
select is(
  (select sessions_per_week::text || '|' || array_to_string(unavailable_days, ',')
     || '|' || array_to_string(training_places, ',') || '|' || setup_step::text
   from public.profiles where user_id = '00000000-0000-4000-8000-0000000000c3'),
  '4|monday,sunday|Gym,Home|9',
  'the owner reads back what they saved'
);
select lives_ok(
  $$ update public.profiles
     set setup_finished_at = now(), setup_skipped_at = now(),
         sessions_per_week = null, availability_note = null
     where user_id = '00000000-0000-4000-8000-0000000000c3' $$,
  'setup can be marked finished and skipped, and an answer cleared'
);
select throws_ok(
  $$ update public.profiles set sessions_per_week = 0 where user_id = '00000000-0000-4000-8000-0000000000c3' $$,
  '23514', null, 'no sessions a week is refused'
);
select throws_ok(
  $$ update public.profiles set sessions_per_week = 15 where user_id = '00000000-0000-4000-8000-0000000000c3' $$,
  '23514', null, 'more than 14 sessions a week is refused'
);
select throws_ok(
  $$ update public.profiles set unavailable_days = array['monday', 'someday'] where user_id = '00000000-0000-4000-8000-0000000000c3' $$,
  '23514', null, 'a day that is not one of the seven is refused'
);
select throws_ok(
  $$ update public.profiles
     set unavailable_days = array['monday','monday','monday','monday','monday','monday','monday','monday']
     where user_id = '00000000-0000-4000-8000-0000000000c3' $$,
  '23514', null, 'more than seven days is refused'
);
select throws_ok(
  $$ update public.profiles set availability_note = '   ' where user_id = '00000000-0000-4000-8000-0000000000c3' $$,
  '23514', null, 'a note of whitespace is refused'
);
select throws_ok(
  $$ update public.profiles set availability_note = repeat('n', 301) where user_id = '00000000-0000-4000-8000-0000000000c3' $$,
  '23514', null, 'a note over 300 characters is refused'
);
select throws_ok(
  $$ update public.profiles
     set training_places = (select array_agg('place ' || n) from generate_series(1, 21) as n)
     where user_id = '00000000-0000-4000-8000-0000000000c3' $$,
  '23514', null, 'more than 20 places are refused'
);
select throws_ok(
  $$ update public.profiles set training_places = array['Gym', ''] where user_id = '00000000-0000-4000-8000-0000000000c3' $$,
  '23514', null, 'an empty place name is refused'
);
select throws_ok(
  $$ update public.profiles
     set home_equipment = (select array_agg('thing ' || n) from generate_series(1, 41) as n)
     where user_id = '00000000-0000-4000-8000-0000000000c3' $$,
  '23514', null, 'more than 40 pieces of equipment are refused'
);
select throws_ok(
  $$ update public.profiles set home_equipment = array[repeat('e', 2401)] where user_id = '00000000-0000-4000-8000-0000000000c3' $$,
  '23514', null, 'equipment names past the total length are refused'
);
select throws_ok(
  $$ update public.profiles set setup_step = 0 where user_id = '00000000-0000-4000-8000-0000000000c3' $$,
  '23514', null, 'a setup step below one is refused'
);

-- Another account's row is not there to be changed.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d4","role":"authenticated"}', true);
update public.profiles
set sessions_per_week = 7, setup_step = 1, setup_finished_at = now()
where user_id = '00000000-0000-4000-8000-0000000000c3';
select is(
  (select count(*)::bigint from public.profiles where user_id = '00000000-0000-4000-8000-0000000000c3'),
  0::bigint,
  'another account cannot read the row'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c3","role":"authenticated"}', true);
select is(
  (select coalesce(sessions_per_week::text, 'unset') || '|' || setup_step::text
   from public.profiles where user_id = '00000000-0000-4000-8000-0000000000c3'),
  'unset|9',
  'another account''s update changed nothing'
);

reset role;
set local role anon;
select throws_ok(
  $$ update public.profiles set setup_step = 1 $$,
  '42501', null, 'anon cannot write a profile'
);

reset role;

select * from finish();

rollback;
