-- Start times on planned sessions and series (owner, 22 Oct 2026).
--
-- Proved here: the two nullable columns and their whole-minute checks; that
-- the re-issued functions kept their privileges; that a session takes an
-- optional `startTime` as `HH:MM` and refuses any other shape; that the slice
-- and the change log read it back; that an edit can set and clear it; and
-- that a series' time reaches the occurrences it materializes. Another owner
-- sees none of it.
--
-- Dates follow the wall clock for the reason every rolling-plan suite gives:
-- the past boundary is owner-local today, and the stored zone is one whose
-- local time is currently mid-day.

begin;

create extension if not exists pgtap with schema extensions;

create temporary table start_zone as
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

grant select on start_zone to public;

create function pg_temp.owner_day(p_offset integer)
returns text
language sql
stable
as $$
  select (
    (timezone((select name from start_zone), clock_timestamp()))::date + p_offset
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

create function pg_temp.activities()
returns jsonb
language sql
immutable
as $$
  select jsonb_build_array(jsonb_build_object(
    'position', 0, 'name', 'Easy running', 'sport', 'Running',
    'measurementMode', 'duration_intensity',
    'target', jsonb_build_object('duration_minutes', 40, 'intensity', 'easy')
  ))
$$;

create function pg_temp.add_session(
  p_session_id uuid, p_local_date text, p_extra jsonb
)
returns jsonb
language sql
stable
as $$
  select jsonb_build_array(jsonb_build_object(
    'operation', 'add',
    'sessionId', p_session_id,
    'session', jsonb_build_object(
      'localDate', p_local_date,
      'position', 0,
      'title', 'Long run',
      'sport', 'Running',
      'activities', pg_temp.activities()
    ) || p_extra
  ))
$$;

create function pg_temp.edit_session(p_session_id uuid, p_extra jsonb)
returns jsonb
language sql
stable
as $$
  select jsonb_build_array(jsonb_build_object(
    'operation', 'edit',
    'sessionId', p_session_id,
    'session', jsonb_build_object(
      'title', 'Long run',
      'sport', 'Running',
      'activities', pg_temp.activities()
    ) || p_extra
  ))
$$;

create temporary table change_receipt (
  label text primary key,
  plan_id uuid,
  plan_revision bigint,
  change_set_id uuid,
  result text,
  series_effects jsonb
);
create temporary table materialization (
  label text primary key,
  plan_id uuid,
  plan_revision bigint,
  change_set_id uuid,
  result text,
  created_count integer,
  skipped jsonb
);

grant all on change_receipt, materialization to public;

select plan(20);

select is(
  (select count(*)::bigint from start_zone), 1::bigint,
  'a stored zone whose local time is mid-day is available at every UTC hour'
);

-- Structure ------------------------------------------------------------------

select col_type_is('public', 'rolling_plan_sessions', 'start_time',
  'time without time zone', 'a planned session has a start time column');
select col_is_null('public', 'rolling_plan_sessions', 'start_time',
  'which is optional');
select col_type_is('public', 'rolling_plan_series', 'start_time',
  'time without time zone', 'a series has one too');
select ok(
  (select count(*) = 2 from pg_constraint
   where conname in (
     'rolling_plan_sessions_start_time_whole_minutes',
     'rolling_plan_series_start_time_whole_minutes')
     and contype = 'c'),
  'both columns hold whole minutes only'
);
select ok(
  (select bool_and(
     has_function_privilege('authenticated', oid, 'EXECUTE')
     and not has_function_privilege('anon', oid, 'EXECUTE')
     and not has_function_privilege('service_role', oid, 'EXECUTE'))
   from pg_proc
   where oid in (
     'public.apply_rolling_plan_change_set(bigint, uuid, text, jsonb)'::regprocedure,
     'public.get_rolling_plan_slice(date, date)'::regprocedure,
     'public.materialize_rolling_plan_series(bigint, uuid)'::regprocedure)),
  'the re-issued owner calls are still for an authenticated owner alone'
);
select ok(
  (select bool_and(
     not has_function_privilege('authenticated', oid, 'EXECUTE')
     and not has_function_privilege('anon', oid, 'EXECUTE')
     and not has_function_privilege('service_role', oid, 'EXECUTE'))
   from pg_proc
   where oid in (
     'public.rolling_plan_session_input_is_valid(jsonb, boolean)'::regprocedure,
     'public.rolling_plan_series_input_is_valid(jsonb)'::regprocedure,
     'public.rolling_plan_session_state(uuid, uuid)'::regprocedure,
     'public.rolling_plan_series_state(uuid, uuid)'::regprocedure)),
  'the re-issued helpers are still reachable from no client role'
);

-- Owners ----------------------------------------------------------------------

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('7e200000-0000-4000-8000-000000000001', 'start-owner@example.test', '{}', '{}'),
  ('7e200000-0000-4000-8000-000000000002', 'start-outsider@example.test', '{}', '{}');
insert into public.profiles (user_id, timezone_name)
select id, (select name from start_zone) from auth.users
where id in (
  '7e200000-0000-4000-8000-000000000001',
  '7e200000-0000-4000-8000-000000000002'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"7e200000-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- A session's time -------------------------------------------------------------

insert into change_receipt
select 'add', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('7e200000-0000-4000-8000-000000000001'),
  '7e200000-0000-4000-8000-00000000e001', 'owner_manual',
  pg_temp.add_session(
    '7e200000-0000-4000-8000-0000000000b1', pg_temp.owner_day(0),
    '{"startTime": "07:30"}'::jsonb));

select is(
  (select start_time from public.rolling_plan_sessions
   where id = '7e200000-0000-4000-8000-0000000000b1'),
  '07:30'::time,
  'a session is added with its start time'
);
select is(
  (select sessions->0->>'startTime'
   from public.get_rolling_plan_slice(
     pg_temp.owner_day(0)::date, pg_temp.owner_day(0)::date)),
  '07:30',
  'the slice reads it back as HH:MM'
);
select is(
  (select after_state->>'startTime'
   from public.rolling_plan_change_entries
   where user_id = '7e200000-0000-4000-8000-000000000001'
     and change_kind = 'add'),
  '07:30',
  'the change log records it'
);

insert into change_receipt
select 'untimed', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('7e200000-0000-4000-8000-000000000001'),
  '7e200000-0000-4000-8000-00000000e002', 'owner_manual',
  pg_temp.add_session(
    '7e200000-0000-4000-8000-0000000000b2', pg_temp.owner_day(1),
    '{}'::jsonb));

select ok(
  (select start_time is null from public.rolling_plan_sessions
   where id = '7e200000-0000-4000-8000-0000000000b2'),
  'a session without one is untimed'
);

select throws_ok(
  format($$select public.apply_rolling_plan_change_set(%s,
    '7e200000-0000-4000-8000-00000000e003', 'owner_manual', %L::jsonb)$$,
    pg_temp.rev('7e200000-0000-4000-8000-000000000001'),
    pg_temp.add_session(
      '7e200000-0000-4000-8000-0000000000b3', pg_temp.owner_day(1),
      '{"startTime": "7:30"}'::jsonb)),
  '22023', 'Invalid rolling plan addition.',
  'an hour without its leading zero is refused'
);
select throws_ok(
  format($$select public.apply_rolling_plan_change_set(%s,
    '7e200000-0000-4000-8000-00000000e004', 'owner_manual', %L::jsonb)$$,
    pg_temp.rev('7e200000-0000-4000-8000-000000000001'),
    pg_temp.add_session(
      '7e200000-0000-4000-8000-0000000000b3', pg_temp.owner_day(1),
      '{"startTime": "24:00"}'::jsonb)),
  '22023', 'Invalid rolling plan addition.',
  'so is 24:00'
);
select throws_ok(
  format($$select public.apply_rolling_plan_change_set(%s,
    '7e200000-0000-4000-8000-00000000e005', 'owner_manual', %L::jsonb)$$,
    pg_temp.rev('7e200000-0000-4000-8000-000000000001'),
    pg_temp.add_session(
      '7e200000-0000-4000-8000-0000000000b3', pg_temp.owner_day(1),
      '{"startTime": "07:30:15"}'::jsonb)),
  '22023', 'Invalid rolling plan addition.',
  'and a time with seconds'
);
select throws_ok(
  format($$select public.apply_rolling_plan_change_set(%s,
    '7e200000-0000-4000-8000-00000000e006', 'owner_manual', %L::jsonb)$$,
    pg_temp.rev('7e200000-0000-4000-8000-000000000001'),
    pg_temp.add_session(
      '7e200000-0000-4000-8000-0000000000b3', pg_temp.owner_day(1),
      '{"startTime": 730}'::jsonb)),
  '22023', 'Invalid rolling plan addition.',
  'and a number'
);

insert into change_receipt
select 'retime', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('7e200000-0000-4000-8000-000000000001'),
  '7e200000-0000-4000-8000-00000000e007', 'owner_manual',
  pg_temp.edit_session(
    '7e200000-0000-4000-8000-0000000000b2', '{"startTime": "18:05"}'::jsonb));
insert into change_receipt
select 'clear', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('7e200000-0000-4000-8000-000000000001'),
  '7e200000-0000-4000-8000-00000000e008', 'owner_manual',
  pg_temp.edit_session(
    '7e200000-0000-4000-8000-0000000000b1', '{"startTime": null}'::jsonb));

select is(
  (select array_agg(coalesce(start_time::text, 'none') order by id)
   from public.rolling_plan_sessions
   where user_id = '7e200000-0000-4000-8000-000000000001'),
  array['none', '18:05:00'],
  'an edit sets a time, and an edit without one clears it'
);

-- A series' time ----------------------------------------------------------------

insert into change_receipt
select 'series', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('7e200000-0000-4000-8000-000000000001'),
  '7e200000-0000-4000-8000-00000000e009', 'owner_manual',
  jsonb_build_array(jsonb_build_object(
    'operation', 'add_series',
    'seriesId', '7e200000-0000-4000-8000-0000000000a1',
    'series', jsonb_build_object(
      'frequency', 'daily', 'intervalCount', 1,
      'startDate', pg_temp.owner_day(2),
      'endDate', pg_temp.owner_day(3),
      'title', 'Evening swim', 'sport', 'Swimming',
      'startTime', '18:00',
      'activities', pg_temp.activities()))));

select is(
  (select start_time from public.rolling_plan_series
   where id = '7e200000-0000-4000-8000-0000000000a1'),
  '18:00'::time,
  'a series is written with its start time'
);

insert into materialization
select 'fill', * from public.materialize_rolling_plan_series(
  pg_temp.rev('7e200000-0000-4000-8000-000000000001'),
  '7e200000-0000-4000-8000-00000000e00a');

select is(
  (select array_agg(start_time::text order by local_date)
   from public.rolling_plan_sessions
   where series_id = '7e200000-0000-4000-8000-0000000000a1'),
  array['18:00:00', '18:00:00'],
  'every occurrence it materializes starts at the series'' time'
);
select is(
  (select after_state->>'startTime'
   from public.rolling_plan_change_entries
   where user_id = '7e200000-0000-4000-8000-000000000001'
     and change_kind = 'add_series'),
  '18:00',
  'the change log records the series'' time'
);

-- Another owner -------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"7e200000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select is(
  (select coalesce(jsonb_array_length(sessions), 0)
   from public.get_rolling_plan_slice(
     pg_temp.owner_day(0)::date, pg_temp.owner_day(3)::date)),
  0,
  'another owner''s slice holds none of these sessions'
);

select * from finish();
rollback;
