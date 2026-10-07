-- A logged session is settled on the server too (owner, 7 Oct 2026).
--
-- Three things are proved here that nothing else proves.
--
-- First, that every plan verb aimed at one session - edit, move, set_lock,
-- cancel and reactivate, beside the delete M3-19 already refused - answers
-- PT425 once a completion names that session, and that a skip logged ahead
-- settles a session exactly as training that happened does.
--
-- Second, that the refusal costs nothing: the session row, its activities and
-- the plan revision are what they were, no change entry is written, and the
-- same verbs still work on the session beside it that carries no log.
--
-- Third, that the coach is not asked to fill a logged session: the request is
-- refused before a row is written, so nothing is claimed and nothing is spent.
--
-- The functions are security definers, so the owner comes from the session and
-- another owner's attempt is answered as a session that does not exist. That is
-- asserted against the functions themselves, as M3-19's suite does.
--
-- Dates follow the wall clock for the reason M3-19's suite gives: the past
-- boundary is defined against owner-local today, and the stored zone is one
-- whose local time is currently mid-day.

begin;

create extension if not exists pgtap with schema extensions;

create temporary table settled_zone as
select name
from pg_catalog.pg_timezone_names
where name in (
  'UTC', 'Europe/Berlin', 'Asia/Tokyo', 'Pacific/Auckland',
  'America/New_York', 'America/Los_Angeles'
)
  and pg_catalog.date_part(
    'hour', pg_catalog.timezone(name, pg_catalog.clock_timestamp())
  ) between 8 and 15
order by name
limit 1;

grant select on settled_zone to public;

create function pg_temp.owner_day(p_offset integer)
returns text
language sql
stable
as $$
  select (
    (timezone((select name from settled_zone), clock_timestamp()))::date + p_offset
  )::text
$$;

create function pg_temp.rev(p_user_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select plan.revision from public.rolling_plans plan where plan.user_id = p_user_id),
    0::bigint
  )
$$;

create function pg_temp.plan_session(
  p_session_id uuid, p_local_date text, p_position integer, p_title text
)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'operation', 'add',
    'sessionId', p_session_id,
    'session', jsonb_build_object(
      'localDate', p_local_date,
      'position', p_position,
      'title', p_title,
      'sport', 'Running',
      'expectedDurationMinutes', 60,
      'isLocked', false,
      'activities', jsonb_build_array(jsonb_build_object(
        'position', 0, 'name', 'Easy running', 'sport', 'Running',
        'measurementMode', 'duration_intensity',
        'target', jsonb_build_object('duration_minutes', 40, 'intensity', 'easy'),
        'isLocked', false
      ))
    )
  )
$$;

-- The five verbs, each as the one change a stale page would send.
create function pg_temp.verb(p_operation text, p_session_id uuid)
returns jsonb
language sql
stable
as $$
  select jsonb_build_array(
    jsonb_build_object('operation', p_operation, 'sessionId', p_session_id)
    || case p_operation
      when 'edit' then jsonb_build_object('session', jsonb_build_object(
        'title', 'Rewritten', 'sport', 'Running',
        'expectedDurationMinutes', 30, 'activities', '[]'::jsonb))
      when 'move' then jsonb_build_object(
        'localDate', pg_temp.owner_day(3), 'position', 0)
      when 'set_lock' then jsonb_build_object('isLocked', true)
      else '{}'::jsonb
    end)
$$;

-- What a session is, as one value, so "unchanged" is a single comparison.
create function pg_temp.session_state(p_session_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.to_jsonb(session) || pg_catalog.jsonb_build_object(
    'activities', (
      select pg_catalog.count(*) from public.rolling_plan_activities activity
      where activity.session_id = session.id))
  from public.rolling_plan_sessions session
  where session.id = p_session_id
$$;

-- Receipts are captured rather than re-read, because `(f()).*` evaluates the
-- function once per output column and would apply a change more than once.
create temporary table change_receipt (
  label text primary key,
  plan_id uuid,
  plan_revision bigint,
  change_set_id uuid,
  result text,
  series_effects jsonb
);
create temporary table logged (
  label text primary key,
  completion_id uuid,
  revision bigint,
  result text
);
create temporary table snapshot (label text primary key, value jsonb);

grant all on change_receipt, logged, snapshot to public;

select plan(28);

select is(
  (select count(*)::bigint from settled_zone), 1::bigint,
  'a stored zone whose local time is mid-day is available at every UTC hour'
);

-- Nothing structural moved ----------------------------------------------------

select ok(
  has_function_privilege('authenticated',
    'public.apply_rolling_plan_change_set(bigint, uuid, text, jsonb)', 'EXECUTE')
  and not has_function_privilege('anon',
    'public.apply_rolling_plan_change_set(bigint, uuid, text, jsonb)', 'EXECUTE')
  and not has_function_privilege('service_role',
    'public.apply_rolling_plan_change_set(bigint, uuid, text, jsonb)', 'EXECUTE')
  and has_function_privilege('authenticated',
    'public.begin_session_activity_generation(text, text, uuid, bigint, text)', 'EXECUTE')
  and not has_function_privilege('anon',
    'public.begin_session_activity_generation(text, text, uuid, bigint, text)', 'EXECUTE')
  and not has_function_privilege('service_role',
    'public.begin_session_activity_generation(text, text, uuid, bigint, text)', 'EXECUTE'),
  'only an authenticated owner may call either replaced function'
);
select ok(
  (select bool_and(prosecdef and proconfig @> array['search_path=""']
     and not pg_get_function_identity_arguments(oid) like '%user%')
   from pg_proc
   where oid in (
     'public.apply_rolling_plan_change_set(bigint, uuid, text, jsonb)'::regprocedure,
     'public.begin_session_activity_generation(text, text, uuid, bigint, text)'::regprocedure)),
  'both are still security definers with an empty search path and no owner argument'
);

-- Owners ----------------------------------------------------------------------

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('7a000000-0000-4000-8000-000000000001', 'settled-owner@example.test', '{}', '{}'),
  ('7a000000-0000-4000-8000-000000000002', 'settled-outsider@example.test', '{}', '{}');
insert into public.profiles (user_id, timezone_name)
select id, (select name from settled_zone) from auth.users
where id in (
  '7a000000-0000-4000-8000-000000000001',
  '7a000000-0000-4000-8000-000000000002'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- b1 is logged as completed today, b2 is skipped ahead, b3 is cancelled and
-- then trained anyway, b4 and b5 carry no log.
insert into change_receipt
select 'seed', * from public.apply_rolling_plan_change_set(
  0, '7a000000-0000-4000-8000-00000000e001', 'owner_manual',
  jsonb_build_array(
    pg_temp.plan_session('7a000000-0000-4000-8000-0000000000b1', pg_temp.owner_day(0), 0, 'Completed'),
    pg_temp.plan_session('7a000000-0000-4000-8000-0000000000b2', pg_temp.owner_day(2), 0, 'Skipped ahead'),
    pg_temp.plan_session('7a000000-0000-4000-8000-0000000000b3', pg_temp.owner_day(0), 1, 'Trained anyway'),
    pg_temp.plan_session('7a000000-0000-4000-8000-0000000000b4', pg_temp.owner_day(1), 0, 'Unlogged'),
    pg_temp.plan_session('7a000000-0000-4000-8000-0000000000b5', pg_temp.owner_day(1), 1, 'Unlogged, cancelled')));

insert into change_receipt
select 'cancel-two', * from public.apply_rolling_plan_change_set(
  1, '7a000000-0000-4000-8000-00000000e002', 'owner_manual',
  pg_temp.verb('cancel', '7a000000-0000-4000-8000-0000000000b3')
  || pg_temp.verb('cancel', '7a000000-0000-4000-8000-0000000000b5'));

insert into logged
select 'completed', * from public.apply_completion_change(
  'create', null, null,
  jsonb_build_object(
    'planSessionId', '7a000000-0000-4000-8000-0000000000b1',
    'status', 'completed',
    'actualLocalDate', pg_temp.owner_day(0),
    'durationMinutes', 46,
    'activities', '[]'::jsonb));
insert into logged
select 'skipped', * from public.apply_completion_change(
  'create', null, null,
  jsonb_build_object(
    'planSessionId', '7a000000-0000-4000-8000-0000000000b2',
    'status', 'skipped',
    'actualLocalDate', pg_temp.owner_day(0),
    'activities', '[]'::jsonb));
insert into logged
select 'trained-anyway', * from public.apply_completion_change(
  'create', null, null,
  jsonb_build_object(
    'planSessionId', '7a000000-0000-4000-8000-0000000000b3',
    'status', 'completed',
    'actualLocalDate', pg_temp.owner_day(0),
    'durationMinutes', 30,
    'activities', '[]'::jsonb));

select is(
  (select count(*)::bigint from public.completions
   where user_id = '7a000000-0000-4000-8000-000000000001'),
  3::bigint,
  'three sessions are logged: completed, skipped ahead, and trained after a cancel'
);

insert into snapshot
select 'revision', to_jsonb(pg_temp.rev('7a000000-0000-4000-8000-000000000001'));
insert into snapshot values
  ('b1', pg_temp.session_state('7a000000-0000-4000-8000-0000000000b1')),
  ('b2', pg_temp.session_state('7a000000-0000-4000-8000-0000000000b2')),
  ('b3', pg_temp.session_state('7a000000-0000-4000-8000-0000000000b3'));
insert into snapshot
select 'entries', to_jsonb(count(*)) from public.rolling_plan_change_entries
where user_id = '7a000000-0000-4000-8000-000000000001';

-- 1. Training that happened settles the session -------------------------------

select throws_ok(
  format($$select public.apply_rolling_plan_change_set(%s,
    '7a000000-0000-4000-8000-00000000e01%s', 'owner_manual', %L::jsonb)$$,
    (select value #>> '{}' from snapshot where label = 'revision'),
    ordinality,
    pg_temp.verb(operation, '7a000000-0000-4000-8000-0000000000b1')),
  'PT425', 'This session has training logged against it, so its plan entry cannot be changed.',
  format('a completed session refuses %s', operation)
)
from unnest(array['edit', 'move', 'set_lock', 'cancel', 'delete'])
  with ordinality as verbs(operation, ordinality);

-- 2. A skip logged ahead settles it too ---------------------------------------

select throws_ok(
  format($$select public.apply_rolling_plan_change_set(%s,
    '7a000000-0000-4000-8000-00000000e02%s', 'owner_manual', %L::jsonb)$$,
    (select value #>> '{}' from snapshot where label = 'revision'),
    ordinality,
    pg_temp.verb(operation, '7a000000-0000-4000-8000-0000000000b2')),
  'PT425', 'This session has training logged against it, so its plan entry cannot be changed.',
  format('a session skipped ahead refuses %s', operation)
)
from unnest(array['edit', 'move', 'set_lock', 'cancel', 'delete'])
  with ordinality as verbs(operation, ordinality);

-- 3. A cancelled session that was trained anyway stays cancelled ---------------

select throws_ok(
  format($$select public.apply_rolling_plan_change_set(%s,
    '7a000000-0000-4000-8000-00000000e031', 'owner_manual', %L::jsonb)$$,
    (select value #>> '{}' from snapshot where label = 'revision'),
    pg_temp.verb('reactivate', '7a000000-0000-4000-8000-0000000000b3')),
  'PT425', 'This session has training logged against it, so its plan entry cannot be changed.',
  'a cancelled session with a log refuses reactivate'
);

-- 4. One refused change refuses the set it came in ------------------------------

select throws_ok(
  format($$select public.apply_rolling_plan_change_set(%s,
    '7a000000-0000-4000-8000-00000000e041', 'owner_manual', %L::jsonb)$$,
    (select value #>> '{}' from snapshot where label = 'revision'),
    pg_temp.verb('set_lock', '7a000000-0000-4000-8000-0000000000b4')
    || pg_temp.verb('set_lock', '7a000000-0000-4000-8000-0000000000b1')),
  'PT425', 'This session has training logged against it, so its plan entry cannot be changed.',
  'a change set naming a logged session beside an unlogged one is refused whole'
);

-- 5. The refusals cost nothing ---------------------------------------------------

select is(
  jsonb_build_array(
    pg_temp.session_state('7a000000-0000-4000-8000-0000000000b1'),
    pg_temp.session_state('7a000000-0000-4000-8000-0000000000b2'),
    pg_temp.session_state('7a000000-0000-4000-8000-0000000000b3')),
  (select jsonb_build_array(
    (select value from snapshot where label = 'b1'),
    (select value from snapshot where label = 'b2'),
    (select value from snapshot where label = 'b3'))),
  'every logged session and its activities are exactly what they were'
);
select is(
  (select pg_temp.rev('7a000000-0000-4000-8000-000000000001')),
  (select (value #>> '{}')::bigint from snapshot where label = 'revision'),
  'no refusal advanced the plan revision'
);
select is(
  (select to_jsonb(count(*)) from public.rolling_plan_change_entries
   where user_id = '7a000000-0000-4000-8000-000000000001'),
  (select value from snapshot where label = 'entries'),
  'and none wrote a change entry'
);
select is(
  (select is_locked from public.rolling_plan_sessions
   where id = '7a000000-0000-4000-8000-0000000000b4'),
  false,
  'the unlogged session named beside a logged one was not locked either'
);

-- 6. A session without a log is planned as before -------------------------------

insert into change_receipt
select 'unlogged', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('7a000000-0000-4000-8000-000000000001'),
  '7a000000-0000-4000-8000-00000000e061', 'owner_manual',
  pg_temp.verb('edit', '7a000000-0000-4000-8000-0000000000b4')
  || pg_temp.verb('set_lock', '7a000000-0000-4000-8000-0000000000b4')
  || pg_temp.verb('move', '7a000000-0000-4000-8000-0000000000b4')
  || pg_temp.verb('reactivate', '7a000000-0000-4000-8000-0000000000b5'));

select is(
  (select jsonb_build_array(title, is_locked, local_date::text, status)
   from public.rolling_plan_sessions
   where id = '7a000000-0000-4000-8000-0000000000b4'),
  jsonb_build_array('Rewritten', true, pg_temp.owner_day(3), 'active'),
  'an unlogged session is still edited, locked and moved'
);
select is(
  (select status from public.rolling_plan_sessions
   where id = '7a000000-0000-4000-8000-0000000000b5'),
  'active',
  'and an unlogged cancelled session is still reactivated'
);

-- 7. The coach is not asked to fill a logged session ----------------------------

select throws_ok(
  format($$select public.begin_session_activity_generation(
    'settled-fill-key-00000001', 'settled-fill-fingerprint-1',
    '7a000000-0000-4000-8000-0000000000b1', %s, null)$$,
    (select pg_temp.rev('7a000000-0000-4000-8000-000000000001'))),
  'PT409', 'That session is no longer available.',
  'a fill request for a logged session is refused'
);
select is(
  (select count(*)::bigint from public.session_activity_requests
   where user_id = '7a000000-0000-4000-8000-000000000001'),
  0::bigint,
  'and claims nothing, so no coach call can follow it'
);
select is(
  (select state from public.begin_session_activity_generation(
    'settled-fill-key-00000002', 'settled-fill-fingerprint-2',
    '7a000000-0000-4000-8000-0000000000b4',
    (select pg_temp.rev('7a000000-0000-4000-8000-000000000001')), null)),
  'claimed',
  'a fill request for an unlogged session is still claimed'
);

-- 8. Nobody else reaches either function ----------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select throws_ok(
  $$select public.apply_rolling_plan_change_set(0,
    '7a000000-0000-4000-8000-00000000e081', 'owner_manual',
    '[{"operation":"cancel","sessionId":"7a000000-0000-4000-8000-0000000000b1"}]'::jsonb)$$,
  '22023', 'Invalid rolling plan change.',
  'another owner is told the session does not exist, not that it is logged'
);
select throws_ok(
  $$select public.begin_session_activity_generation(
    'settled-fill-key-00000003', 'settled-fill-fingerprint-3',
    '7a000000-0000-4000-8000-0000000000b1', 0, null)$$,
  'PT409', 'That session is no longer available.',
  'and gets the answer for a session that is gone when asking the coach'
);

select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok(
  $$select public.apply_rolling_plan_change_set(0,
    '7a000000-0000-4000-8000-00000000e082', 'owner_manual',
    '[{"operation":"cancel","sessionId":"7a000000-0000-4000-8000-0000000000b1"}]'::jsonb)$$,
  '42501', 'An authenticated FitTip user is required.',
  'a caller with no owner cannot change a plan at all'
);

select * from finish();
rollback;
