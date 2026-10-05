begin;

create extension if not exists pgtap with schema extensions;

select plan(63);

-- 1. Profile columns ---------------------------------------------------------

select col_type_is('public', 'profiles', 'display_name', 'text', 'display_name is text');
select col_type_is('public', 'profiles', 'birth_date', 'date', 'birth_date is a date');
select col_type_is('public', 'profiles', 'height_cm', 'numeric(4,1)', 'height_cm is numeric(4,1)');
select col_type_is('public', 'profiles', 'gender', 'text', 'gender is text');
select col_type_is('public', 'profiles', 'units_system', 'text', 'units_system is text');
select col_type_is('public', 'profiles', 'sports', 'text[]', 'sports is a text array');
select col_is_null('public', 'profiles', 'display_name', 'display_name may be unset');
select col_is_null('public', 'profiles', 'birth_date', 'birth_date may be unset');
select col_is_null('public', 'profiles', 'height_cm', 'height_cm may be unset');
select col_is_null('public', 'profiles', 'gender', 'gender may be unset');
select col_is_null('public', 'profiles', 'units_system', 'units_system may be unset');
select col_not_null('public', 'profiles', 'sports', 'sports is never null');
select col_default_is('public', 'profiles', 'sports', '{}', 'sports starts empty');

-- The grant is column-scoped: the six new columns and the time zone, and
-- nothing that identifies or dates the row.
select ok(
  not has_table_privilege('authenticated', 'public.profiles', 'UPDATE'),
  'authenticated still has no table-wide UPDATE on profiles'
);
select is(
  (
    select array_agg(column_name::text order by column_name::text)
    from information_schema.column_privileges
    where table_schema = 'public'
      and table_name = 'profiles'
      and grantee = 'authenticated'
      and privilege_type = 'UPDATE'
  ),
  array[
    'birth_date',
    'display_name',
    'gender',
    'height_cm',
    'sports',
    'timezone_name',
    'units_system'
  ],
  'authenticated may update exactly the settings columns'
);
select ok(
  not has_column_privilege('anon', 'public.profiles', 'display_name', 'SELECT'),
  'anon cannot read a profile column'
);
select is(
  (select count(*)::bigint from pg_policies where schemaname = 'public' and tablename = 'profiles'),
  3::bigint,
  'profiles gained no policy'
);

-- 2. Weight history: shape ---------------------------------------------------

select has_table('public', 'weight_entries', 'weight_entries exists');
select col_type_is('public', 'weight_entries', 'user_id', 'uuid', 'user_id is uuid');
select col_type_is('public', 'weight_entries', 'measured_on', 'date', 'measured_on is a date');
select col_type_is('public', 'weight_entries', 'weight_kg', 'numeric(5,2)', 'weight_kg is numeric(5,2)');
select col_not_null('public', 'weight_entries', 'weight_kg', 'weight_kg is required');
select col_is_pk(
  'public',
  'weight_entries',
  array['user_id', 'measured_on'],
  'one entry per owner and day'
);
select fk_ok(
  'public', 'weight_entries', 'user_id',
  'public', 'profiles', 'user_id',
  'an entry belongs to a profile'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.weight_entries'::regclass),
  'RLS is enabled on weight_entries'
);
select is(
  (
    select array_agg(policyname::text || ':' || cmd order by policyname::text)
    from pg_policies
    where schemaname = 'public'
      and tablename = 'weight_entries'
      and roles = array['authenticated']::name[]
  ),
  array[
    'weight_entries_owner_delete:DELETE',
    'weight_entries_owner_insert:INSERT',
    'weight_entries_owner_select:SELECT',
    'weight_entries_owner_update:UPDATE'
  ],
  'weight_entries has exactly the four owner policies, for authenticated'
);
select ok(has_table_privilege('authenticated', 'public.weight_entries', 'SELECT'), 'authenticated may read');
select ok(has_table_privilege('authenticated', 'public.weight_entries', 'INSERT'), 'authenticated may insert');
select ok(has_table_privilege('authenticated', 'public.weight_entries', 'DELETE'), 'authenticated may delete');
select ok(
  not has_table_privilege('authenticated', 'public.weight_entries', 'UPDATE'),
  'authenticated has no table-wide UPDATE on weight_entries'
);
select ok(
  has_column_privilege('authenticated', 'public.weight_entries', 'weight_kg', 'UPDATE'),
  'authenticated may correct the weight'
);
select ok(
  not has_column_privilege('authenticated', 'public.weight_entries', 'user_id', 'UPDATE'),
  'an entry cannot be given to someone else'
);
select ok(
  not has_column_privilege('authenticated', 'public.weight_entries', 'measured_on', 'UPDATE'),
  'an entry cannot be moved to another day'
);
select ok(
  not has_table_privilege('anon', 'public.weight_entries', 'SELECT')
    and not has_table_privilege('anon', 'public.weight_entries', 'INSERT'),
  'anon has no privilege on weight_entries'
);
select ok(
  not has_table_privilege('service_role', 'public.weight_entries', 'SELECT'),
  'service_role has no privilege on weight_entries'
);

-- 3. Behaviour ---------------------------------------------------------------

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-4000-8000-0000000000a1', 'details-a@example.test', '{}', '{}'),
  ('00000000-0000-4000-8000-0000000000b2', 'details-b@example.test', '{}', '{}');
insert into public.profiles (user_id)
values
  ('00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-0000000000b2');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

select lives_ok(
  $$ update public.profiles
     set display_name = 'Alex', birth_date = '1990-05-17', height_cm = 181.5,
         gender = 'other', units_system = 'metric',
         sports = array['Running', 'Latzug']
     where user_id = '00000000-0000-4000-8000-0000000000a1' $$,
  'the owner can save their details and sports'
);
select is(
  (select display_name || '|' || height_cm::text || '|' || array_to_string(sports, ',')
   from public.profiles where user_id = '00000000-0000-4000-8000-0000000000a1'),
  'Alex|181.5|Running,Latzug',
  'the owner reads back what they saved'
);
select lives_ok(
  $$ update public.profiles
     set birth_date = null, height_cm = null, gender = null
     where user_id = '00000000-0000-4000-8000-0000000000a1' $$,
  'every detail but the name can be cleared again'
);
select throws_ok(
  $$ update public.profiles set display_name = '  ' where user_id = '00000000-0000-4000-8000-0000000000a1' $$,
  '23514', null, 'a name of whitespace is refused'
);
select throws_ok(
  $$ update public.profiles set display_name = repeat('n', 81) where user_id = '00000000-0000-4000-8000-0000000000a1' $$,
  '23514', null, 'a name over 80 characters is refused'
);
select throws_ok(
  $$ update public.profiles set birth_date = '1899-12-31' where user_id = '00000000-0000-4000-8000-0000000000a1' $$,
  '23514', null, 'a birthday before 1900 is refused'
);
select throws_ok(
  $$ update public.profiles set height_cm = 49.9 where user_id = '00000000-0000-4000-8000-0000000000a1' $$,
  '23514', null, 'a height under 50 cm is refused'
);
select throws_ok(
  $$ update public.profiles set gender = 'unknown' where user_id = '00000000-0000-4000-8000-0000000000a1' $$,
  '23514', null, 'a gender outside the three values is refused'
);
select throws_ok(
  $$ update public.profiles set units_system = 'stone' where user_id = '00000000-0000-4000-8000-0000000000a1' $$,
  '23514', null, 'a units system outside the two values is refused'
);
select throws_ok(
  $$ update public.profiles
     set sports = (select array_agg('sport ' || n) from generate_series(1, 101) as n)
     where user_id = '00000000-0000-4000-8000-0000000000a1' $$,
  '23514', null, 'more than 100 sports are refused'
);
select throws_ok(
  $$ update public.profiles set sports = array['Running', ''] where user_id = '00000000-0000-4000-8000-0000000000a1' $$,
  '23514', null, 'an empty sport name is refused'
);
select throws_ok(
  $$ update public.profiles set created_at = now() where user_id = '00000000-0000-4000-8000-0000000000a1' $$,
  '42501', 'permission denied for table profiles', 'the owner still cannot rewrite created_at'
);

select lives_ok(
  $$ insert into public.weight_entries (user_id, measured_on, weight_kg)
     values ('00000000-0000-4000-8000-0000000000a1', '2026-10-01', 80.5),
            ('00000000-0000-4000-8000-0000000000a1', '2026-10-05', 79.8) $$,
  'the owner can record weights on two days'
);
select throws_ok(
  $$ insert into public.weight_entries (user_id, measured_on, weight_kg)
     values ('00000000-0000-4000-8000-0000000000a1', '2026-10-05', 79.0) $$,
  '23505', null, 'a second entry on the same day is refused'
);
select lives_ok(
  $$ update public.weight_entries set weight_kg = 79.0
     where user_id = '00000000-0000-4000-8000-0000000000a1' and measured_on = '2026-10-05' $$,
  'the owner can correct a day''s weight'
);
select throws_ok(
  $$ insert into public.weight_entries (user_id, measured_on, weight_kg)
     values ('00000000-0000-4000-8000-0000000000a1', '2026-10-06', 19.9) $$,
  '23514', null, 'a weight under 20 kg is refused'
);
select throws_ok(
  $$ insert into public.weight_entries (user_id, measured_on, weight_kg)
     values ('00000000-0000-4000-8000-0000000000b2', '2026-10-05', 70) $$,
  '42501', null, 'the owner cannot record a weight for someone else'
);
select throws_ok(
  $$ update public.weight_entries set measured_on = '2026-09-01'
     where user_id = '00000000-0000-4000-8000-0000000000a1' and measured_on = '2026-10-01' $$,
  '42501', null, 'an entry cannot be moved to another day'
);

-- Another signed-in user sees and changes nothing of it.
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);

select is(
  (select count(*)::bigint from public.weight_entries),
  0::bigint,
  'user B reads none of user A''s weights'
);
select is(
  (select count(*)::bigint from public.profiles where display_name = 'Alex'),
  0::bigint,
  'user B cannot read user A''s details'
);
update public.profiles set display_name = 'Taken' where user_id = '00000000-0000-4000-8000-0000000000a1';
update public.weight_entries set weight_kg = 99 where user_id = '00000000-0000-4000-8000-0000000000a1';
delete from public.weight_entries where user_id = '00000000-0000-4000-8000-0000000000a1';

reset role;
select is(
  (select display_name from public.profiles where user_id = '00000000-0000-4000-8000-0000000000a1'),
  'Alex',
  'user B''s update of user A''s profile changed nothing'
);
select is(
  (select array_agg(weight_kg order by measured_on) from public.weight_entries
   where user_id = '00000000-0000-4000-8000-0000000000a1'),
  array[80.5, 79.0]::numeric[],
  'user B''s update and delete of user A''s weights changed nothing'
);

-- Anonymous callers are refused outright.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  'select * from public.weight_entries',
  '42501', 'permission denied for table weight_entries', 'anonymous reads are denied'
);
select throws_ok(
  $$ insert into public.weight_entries (user_id, measured_on, weight_kg)
     values ('00000000-0000-4000-8000-0000000000a1', '2026-10-07', 80) $$,
  '42501', 'permission denied for table weight_entries', 'anonymous inserts are denied'
);
select throws_ok(
  $$ update public.profiles set display_name = 'Anon' $$,
  '42501', 'permission denied for table profiles', 'anonymous profile updates are denied'
);

-- The owner removes an entry, and deleting the account removes the rest.
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select lives_ok(
  $$ delete from public.weight_entries
     where user_id = '00000000-0000-4000-8000-0000000000a1' and measured_on = '2026-10-01' $$,
  'the owner can delete an entry'
);
select is(
  (select count(*)::bigint from public.weight_entries),
  1::bigint,
  'one entry is left'
);
reset role;
delete from auth.users where id = '00000000-0000-4000-8000-0000000000a1';
select is(
  (select count(*)::bigint from public.weight_entries
   where user_id = '00000000-0000-4000-8000-0000000000a1'),
  0::bigint,
  'deleting the account deletes its weight history'
);

select * from finish();
rollback;
