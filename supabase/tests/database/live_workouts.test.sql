-- A workout in progress (ADR-037).
--
-- Proved against the real table and function: RLS on and only the owner's
-- policies; the privileges a client has, by column; one workout per owner;
-- the owner reads, starts, changes and discards their own and nobody else's,
-- and an anonymous caller none; the planned session it names is cleared when
-- that session is deleted; the state's shape and size are bounded; and
-- `apply_live_workout_log` writes the log and removes the workout together,
-- refuses a second finish, rolls back on a refused log, and leaves another
-- owner's workout alone.

begin;

create extension if not exists pgtap with schema extensions;

create function pg_temp.today()
returns text
language sql
stable
as $$
  select (clock_timestamp() at time zone 'utc')::date::text
$$;

create function pg_temp.as_user(p_user uuid)
returns void
language sql
as $$
  select set_config(
    'request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}', p_user), true)
$$;

create temporary table made (label text primary key, id uuid);
grant all on made to public;

select plan(32);

-- The table -----------------------------------------------------------------------

select has_table('public', 'live_workouts', 'live_workouts exists');
select columns_are('public', 'live_workouts', array[
  'id', 'user_id', 'plan_session_id', 'title', 'sport', 'started_at',
  'paused_at', 'paused_seconds', 'state', 'revision'
], 'live_workouts has exactly its columns');
select ok(
  (select relrowsecurity from pg_catalog.pg_class
   where oid = 'public.live_workouts'::regclass),
  'RLS is enabled'
);
select policies_are('public', 'live_workouts', array[
  'live_workouts_owner_select', 'live_workouts_owner_insert',
  'live_workouts_owner_update', 'live_workouts_owner_delete'
], 'only the four owner policies');
select col_is_unique('public', 'live_workouts', array['user_id'],
  'one workout per owner');
select fk_ok('public', 'live_workouts', array['plan_session_id', 'user_id'],
  'public', 'rolling_plan_sessions', array['id', 'user_id'],
  'the planned session is the owner''s own');

-- Privileges ------------------------------------------------------------------------

select ok(
  not has_table_privilege('anon', 'public.live_workouts', 'SELECT')
  and not has_table_privilege('anon', 'public.live_workouts', 'INSERT')
  and not has_table_privilege('anon', 'public.live_workouts', 'UPDATE')
  and not has_table_privilege('anon', 'public.live_workouts', 'DELETE'),
  'anon has nothing on the table'
);
select ok(
  has_table_privilege('authenticated', 'public.live_workouts', 'SELECT')
  and has_table_privilege('authenticated', 'public.live_workouts', 'DELETE'),
  'authenticated may read and delete'
);
select ok(
  has_column_privilege('authenticated', 'public.live_workouts', 'state', 'INSERT')
  and not has_column_privilege('authenticated', 'public.live_workouts', 'user_id', 'INSERT')
  and not has_column_privilege('authenticated', 'public.live_workouts', 'started_at', 'INSERT')
  and not has_column_privilege('authenticated', 'public.live_workouts', 'id', 'INSERT'),
  'a start writes its content, never its owner, id or start time'
);
select ok(
  has_column_privilege('authenticated', 'public.live_workouts', 'state', 'UPDATE')
  and has_column_privilege('authenticated', 'public.live_workouts', 'paused_at', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.live_workouts', 'user_id', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.live_workouts', 'started_at', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.live_workouts', 'plan_session_id', 'UPDATE'),
  'a change may not move the workout to another owner, start or session'
);
select ok(
  has_function_privilege('authenticated',
    'public.apply_live_workout_log(uuid, jsonb)', 'EXECUTE')
  and not has_function_privilege('anon',
    'public.apply_live_workout_log(uuid, jsonb)', 'EXECUTE')
  and not has_function_privilege('public',
    'public.apply_live_workout_log(uuid, jsonb)', 'EXECUTE'),
  'only authenticated may finish a workout'
);
select is(
  (select not p.prosecdef
     and pg_catalog.array_to_string(p.proconfig, ',') = 'search_path=""'
   from pg_catalog.pg_proc as p
   join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'apply_live_workout_log'),
  true,
  'it runs as invoker with an empty search path'
);

-- Two owners, the first with a planned session today ---------------------------------

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('75000000-0000-4000-8000-000000000001', 'live-owner@example.test', '{}', '{}'),
  ('75000000-0000-4000-8000-000000000002', 'live-other@example.test', '{}', '{}');
insert into public.profiles (user_id, timezone_name)
values
  ('75000000-0000-4000-8000-000000000001', 'UTC'),
  ('75000000-0000-4000-8000-000000000002', 'UTC');

set local role authenticated;
select pg_temp.as_user('75000000-0000-4000-8000-000000000001');

select lives_ok(
  format($$select * from public.apply_rolling_plan_change_set(0, %L, 'live', %L::jsonb)$$,
    '75000000-0000-4000-8000-00000000e001',
    jsonb_build_array(jsonb_build_object(
      'operation', 'add',
      'sessionId', '75000000-0000-4000-8000-0000000000a1',
      'session', jsonb_build_object(
        'localDate', pg_temp.today(), 'position', 0,
        'title', 'Upper body', 'sport', 'Strength',
        'expectedDurationMinutes', 50, 'activities', '[]'::jsonb
      )
    ))::text),
  'a planned session exists to start from'
);

-- Owner access ---------------------------------------------------------------------------

select lives_ok(
  $$insert into public.live_workouts (plan_session_id, title, sport, state)
    values ('75000000-0000-4000-8000-0000000000a1', 'Upper body', 'Strength',
      '{"activities": []}')$$,
  'the owner starts a workout from a planned session'
);
insert into made select 'owner', id from public.live_workouts;
select is(
  (select user_id from public.live_workouts),
  '75000000-0000-4000-8000-000000000001'::uuid,
  'the database names the owner'
);
select throws_ok(
  $$insert into public.live_workouts (title, sport) values ('Again', 'Strength')$$,
  '23505', null,
  'a second workout is refused while one runs'
);
select lives_ok(
  $$update public.live_workouts
    set state = '{"activities": [{"name": "Bench press"}]}', revision = 2,
      paused_at = now(), paused_seconds = 30$$,
  'the owner changes their workout'
);
select throws_ok(
  $$update public.live_workouts set state = '{"activities": "none"}'$$,
  '23514', null,
  'a state without an activity list is refused'
);
select throws_ok(
  format($$update public.live_workouts set state = %L::jsonb$$,
    jsonb_build_object('activities', '[]'::jsonb, 'pad', repeat('x', 70000))),
  '23514', null,
  'a state past its size is refused'
);
select throws_ok(
  $$update public.live_workouts set user_id = '75000000-0000-4000-8000-000000000002'$$,
  '42501', null,
  'the owner cannot give the workout to someone else'
);

-- Another owner and anonymous --------------------------------------------------------

select pg_temp.as_user('75000000-0000-4000-8000-000000000002');
select is((select count(*)::integer from public.live_workouts), 0,
  'another owner reads nothing');
update public.live_workouts set title = 'Taken';
delete from public.live_workouts;
select throws_ok(
  $$insert into public.live_workouts (plan_session_id, title, sport)
    values ('75000000-0000-4000-8000-0000000000a1', 'Theirs', 'Strength')$$,
  '23503', null,
  'another owner cannot start from someone else''s session'
);
select lives_ok(
  $$insert into public.live_workouts (title, sport) values ('Run', 'Running')$$,
  'another owner starts a workout of their own'
);
select throws_ok(
  format($$select * from public.apply_live_workout_log(%L,
    jsonb_build_object('status', 'unplanned', 'actualLocalDate', %L,
      'activities', '[]'::jsonb))$$,
    (select id from made where label = 'owner'), pg_temp.today()),
  'PT409', 'That workout was already logged or discarded.',
  'another owner cannot finish the owner''s workout'
);

reset role;
select is(
  (select title from public.live_workouts
   where user_id = '75000000-0000-4000-8000-000000000001'),
  'Upper body',
  'the owner''s workout is untouched by another owner''s change and delete'
);
set local role anon;
select throws_ok('select count(*) from public.live_workouts', '42501', null,
  'anonymous callers cannot read workouts');

-- Finishing --------------------------------------------------------------------------------

set local role authenticated;
select pg_temp.as_user('75000000-0000-4000-8000-000000000001');

select throws_ok(
  format($$select * from public.apply_live_workout_log(%L,
    jsonb_build_object('planSessionId', '75000000-0000-4000-8000-0000000000a1',
      'status', 'completed', 'actualLocalDate', %L, 'activities', '[]'::jsonb))$$,
    (select id from made where label = 'owner'),
    ((clock_timestamp() at time zone 'utc')::date + 2)::text),
  'PT430', 'Training cannot be logged for a future date.',
  'a refused log is refused as it would be anyway'
);
select is((select count(*)::integer from public.live_workouts), 1,
  'and the workout is still there to finish');

select is(
  (select result from public.apply_live_workout_log(
    (select id from made where label = 'owner'),
    jsonb_build_object('planSessionId', '75000000-0000-4000-8000-0000000000a1',
      'status', 'completed', 'actualLocalDate', pg_temp.today(),
      'durationMinutes', 48, 'activities', '[]'::jsonb))),
  'created',
  'finishing writes the log'
);
select ok(
  (select count(*) = 0 from public.live_workouts)
  and (select count(*) = 1 from public.completions
       where plan_session_id = '75000000-0000-4000-8000-0000000000a1'
         and duration_minutes = 48),
  'the workout is gone and its log is there'
);
select throws_ok(
  format($$select * from public.apply_live_workout_log(%L,
    jsonb_build_object('status', 'unplanned', 'actualLocalDate', %L,
      'activities', '[]'::jsonb))$$,
    (select id from made where label = 'owner'), pg_temp.today()),
  'PT409', 'That workout was already logged or discarded.',
  'the same workout cannot be logged twice'
);

-- A deleted planned session leaves the workout, unplanned ------------------------------

reset role;
insert into public.live_workouts (user_id, plan_session_id, title, sport)
values ('75000000-0000-4000-8000-000000000001',
  '75000000-0000-4000-8000-0000000000a1', 'Upper body', 'Strength');
delete from public.completions
where plan_session_id = '75000000-0000-4000-8000-0000000000a1';
delete from public.rolling_plan_sessions
where id = '75000000-0000-4000-8000-0000000000a1';
select is(
  (select plan_session_id from public.live_workouts
   where user_id = '75000000-0000-4000-8000-000000000001'),
  null,
  'deleting the planned session clears the link and keeps the workout'
);

select * from finish();
rollback;
