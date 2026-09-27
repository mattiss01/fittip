-- A5: an owner's active personal activities never share a name.
--
-- The migration is one partial unique index, so what is proved is its shape
-- and its decision table, run as the owner through the table's own grants and
-- RLS rather than as a superuser that would skip them. It adds no privilege
-- and no policy, and M1-01's owner-only matrix for this table is unchanged, so
-- the only cross-owner question is the one the index itself raises: that
-- another owner's names neither collide with nor reveal this owner's.
--
-- Concurrency is the index's own: two simultaneous inserts of one name are
-- serialized on the index entry and one of them fails with 23505, which is a
-- property of a unique index in PostgreSQL rather than of anything written
-- here. The application maps that code, and nothing else, to "name taken".

begin;

create extension if not exists pgtap with schema extensions;

select plan(16);

select has_index(
  'public',
  'personal_activities',
  'personal_activities_active_name_key',
  'the unique-name index exists'
);
select ok(
  (select indisunique from pg_catalog.pg_index
   where indexrelid = 'public.personal_activities_active_name_key'::regclass),
  'it is unique'
);
select ok(
  (select pg_catalog.pg_get_expr(indpred, indrelid)
   from pg_catalog.pg_index
   where indexrelid = 'public.personal_activities_active_name_key'::regclass)
    = '(archived_at IS NULL)',
  'it covers active definitions only'
);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('a5000000-0000-4000-8000-000000000001', 'a5-owner@example.test', '{}', '{}'),
  ('a5000000-0000-4000-8000-000000000002', 'a5-other@example.test', '{}', '{}');
insert into public.profiles (user_id)
values
  ('a5000000-0000-4000-8000-000000000001'),
  ('a5000000-0000-4000-8000-000000000002');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a5000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select lives_ok(
  $$insert into public.personal_activities
      (id, user_id, name, sport, measurement_mode)
    values ('a5000000-0000-4000-8000-0000000000a1',
            'a5000000-0000-4000-8000-000000000001',
            'Rudern', 'Strength', 'unmeasured')$$,
  'the owner creates Rudern'
);
select throws_ok(
  $$insert into public.personal_activities (user_id, name, sport, measurement_mode)
    values ('a5000000-0000-4000-8000-000000000001', 'Rudern', 'Rowing', 'custom')$$,
  '23505', null,
  'the same name is refused, whatever the sport or mode'
);
select throws_ok(
  $$insert into public.personal_activities (user_id, name, sport, measurement_mode)
    values ('a5000000-0000-4000-8000-000000000001', ' RUDERN  ', 'Strength', 'unmeasured')$$,
  '23505', null,
  'case and outer spaces do not make a different name'
);

select lives_ok(
  $$insert into public.personal_activities
      (id, user_id, name, sport, measurement_mode)
    values ('a5000000-0000-4000-8000-0000000000a2',
            'a5000000-0000-4000-8000-000000000001',
            'Rudern Kabel', 'Strength', 'unmeasured')$$,
  'a name that differs by a word is its own'
);
select throws_ok(
  $$insert into public.personal_activities (user_id, name, sport, measurement_mode)
    values ('a5000000-0000-4000-8000-000000000001', E'rudern \t kabel', 'Strength', 'unmeasured')$$,
  '23505', null,
  'an inner run of whitespace reads as one space'
);
select throws_ok(
  $$update public.personal_activities set name = 'rudern'
    where id = 'a5000000-0000-4000-8000-0000000000a2'$$,
  '23505', null,
  'renaming onto a taken name is refused'
);
select lives_ok(
  $$update public.personal_activities set name = 'RUDERN'
    where id = 'a5000000-0000-4000-8000-0000000000a1'$$,
  'a definition may change the case of its own name'
);

-- Remove from library, then save it again under the same name.
select lives_ok(
  $$update public.personal_activities set archived_at = now()
    where id = 'a5000000-0000-4000-8000-0000000000a1'$$,
  'the owner removes Rudern'
);
select lives_ok(
  $$insert into public.personal_activities
      (id, user_id, name, sport, measurement_mode)
    values ('a5000000-0000-4000-8000-0000000000a3',
            'a5000000-0000-4000-8000-000000000001',
            'Rudern', 'Strength', 'sets_reps_load')$$,
  'a removed definition frees its name for a new one'
);
select throws_ok(
  $$update public.personal_activities set archived_at = null
    where id = 'a5000000-0000-4000-8000-0000000000a1'$$,
  '23505', null,
  'a removed definition cannot come back beside its successor'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"a5000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select lives_ok(
  $$insert into public.personal_activities (user_id, name, sport, measurement_mode)
    values ('a5000000-0000-4000-8000-000000000002', 'Rudern', 'Strength', 'unmeasured')$$,
  'another owner may use the same name'
);
select is(
  (select count(*)::integer from public.personal_activities),
  1,
  'and sees only their own definition'
);

reset role;
select is(
  (select count(*)::integer from public.personal_activities
   where user_id = 'a5000000-0000-4000-8000-000000000001'
     and archived_at is null),
  2,
  'the owner is left with Rudern Kabel and the new Rudern active'
);

select * from finish();
rollback;
