-- A lock is no longer read (owner, 9 Oct 2026).
--
-- Two things are proved here, about the one function that consulted a lock.
--
-- First, that a locked occurrence is removed with the rest, by both verbs that
-- sweep a series forward: a change "from this one on" (`edit_series` with an
-- effective date) and an end (`end_series`). The receipt reports no locked
-- occurrence kept.
--
-- Second, that an occurrence with training logged against it is still kept and
-- is counted as what keeps it. Before this migration a locked and logged
-- occurrence was reported as locked and left out of `completedKept`.
--
-- The `set_lock` branch of `apply_rolling_plan_change_set` still exists and is
-- used below to set the flag, which is the state a session locked before this
-- migration is in. The application no longer sends it.
--
-- Dates follow the wall clock for the reason every rolling-plan suite gives:
-- the past boundary is defined against owner-local today, and the stored zone
-- is one whose local time is currently mid-day.

begin;

create extension if not exists pgtap with schema extensions;

create temporary table lock_zone as
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

grant select on lock_zone to public;

create function pg_temp.owner_day(p_offset integer)
returns text
language sql
stable
as $$
  select (
    (timezone((select name from lock_zone), clock_timestamp()))::date + p_offset
  )::text
$$;

-- The revision the owner would read next, so no assertion below hardcodes one.
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

create function pg_temp.daily_series(
  p_series_id uuid, p_operation text, p_start_date text, p_title text
)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'operation', p_operation,
    'seriesId', p_series_id,
    'series', jsonb_build_object(
      'frequency', 'daily', 'intervalCount', 1,
      'startDate', p_start_date,
      'title', p_title, 'sport', 'Running',
      'activities', '[]'::jsonb))
$$;

create function pg_temp.lock_occurrence(p_series_id uuid, p_offset integer)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'operation', 'set_lock',
    'sessionId', (select session.id from public.rolling_plan_sessions session
      where session.series_id = p_series_id
        and session.occurrence_date = pg_temp.owner_day(p_offset)::date),
    'isLocked', true)
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
create temporary table materialization (
  label text primary key,
  plan_id uuid,
  plan_revision bigint,
  change_set_id uuid,
  result text,
  created_count integer,
  skipped jsonb
);
create temporary table logged (
  label text primary key,
  completion_id uuid,
  revision bigint,
  result text
);
create temporary table counted (label text primary key, value bigint);

grant all on change_receipt, materialization, logged, counted to public;

select plan(12);

select is(
  (select count(*)::bigint from lock_zone), 1::bigint,
  'a stored zone whose local time is mid-day is available at every UTC hour'
);

select ok(
  not has_function_privilege('authenticated',
    'public.rolling_plan_sweep_series_occurrences(uuid, uuid, uuid, uuid, date, date, integer, timestamptz)', 'EXECUTE')
  and not has_function_privilege('anon',
    'public.rolling_plan_sweep_series_occurrences(uuid, uuid, uuid, uuid, date, date, integer, timestamptz)', 'EXECUTE')
  and not has_function_privilege('service_role',
    'public.rolling_plan_sweep_series_occurrences(uuid, uuid, uuid, uuid, date, date, integer, timestamptz)', 'EXECUTE'),
  'the replaced sweep is still reachable from no client role'
);
select ok(
  (select not prosecdef from pg_proc
   where oid = 'public.rolling_plan_sweep_series_occurrences(uuid, uuid, uuid, uuid, date, date, integer, timestamptz)'::regprocedure),
  'and still runs as its caller'
);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('7b000000-0000-4000-8000-000000000001', 'lock-owner@example.test', '{}', '{}');
insert into public.profiles (user_id, timezone_name)
select '7b000000-0000-4000-8000-000000000001', (select name from lock_zone);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"7b000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- A change "from this one on" removes a locked occurrence ----------------------

insert into change_receipt
select 'a-add', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('7b000000-0000-4000-8000-000000000001'),
  '7b000000-0000-4000-8000-00000000e001', 'owner_manual',
  jsonb_build_array(pg_temp.daily_series(
    '7b000000-0000-4000-8000-0000000000a1', 'add_series',
    pg_temp.owner_day(0), 'Morning run')));
insert into materialization
select 'a-fill', * from public.materialize_rolling_plan_series(
  pg_temp.rev('7b000000-0000-4000-8000-000000000001'),
  '7b000000-0000-4000-8000-00000000e002');
insert into change_receipt
select 'a-lock', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('7b000000-0000-4000-8000-000000000001'),
  '7b000000-0000-4000-8000-00000000e003', 'owner_manual',
  jsonb_build_array(
    pg_temp.lock_occurrence('7b000000-0000-4000-8000-0000000000a1', 3)));

select ok(
  (select is_locked from public.rolling_plan_sessions
   where series_id = '7b000000-0000-4000-8000-0000000000a1'
     and occurrence_date = pg_temp.owner_day(3)::date),
  'an occurrence carries the flag, as one locked before this migration does'
);

insert into counted
select 'a-from-day-2', count(*) from public.rolling_plan_sessions
where series_id = '7b000000-0000-4000-8000-0000000000a1'
  and occurrence_date >= pg_temp.owner_day(2)::date;

insert into change_receipt
select 'a-split', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('7b000000-0000-4000-8000-000000000001'),
  '7b000000-0000-4000-8000-00000000e004', 'owner_manual',
  jsonb_build_array(
    pg_temp.daily_series(
      '7b000000-0000-4000-8000-0000000000a1', 'edit_series',
      pg_temp.owner_day(2), 'Evening run')
    || jsonb_build_object(
      'effectiveDate', pg_temp.owner_day(2),
      'successorSeriesId', '7b000000-0000-4000-8000-0000000000a2')));

select is(
  (select (series_effects->0->>'deleted')::bigint from change_receipt
   where label = 'a-split'),
  (select value from counted where label = 'a-from-day-2'),
  'a change from a date on removes every occurrence from that date, the locked one included'
);
select is(
  (select series_effects->0->>'lockedKept' from change_receipt where label = 'a-split'),
  '0',
  'and reports none kept for a lock'
);
select is(
  (select count(*)::bigint from public.rolling_plan_sessions
   where series_id = '7b000000-0000-4000-8000-0000000000a1'
     and occurrence_date >= pg_temp.owner_day(2)::date),
  0::bigint,
  'so nothing of the old rule is left beside the new one'
);
select is(
  (select count(*)::bigint from public.rolling_plan_change_entries
   where user_id = '7b000000-0000-4000-8000-000000000001'
     and change_kind = 'delete'
     and (before_state->>'isLocked')::boolean),
  1::bigint,
  'the removed locked occurrence leaves its delete entry like any other'
);

-- An end keeps a logged occurrence, and counts it as logged ---------------------

insert into change_receipt
select 'b-add', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('7b000000-0000-4000-8000-000000000001'),
  '7b000000-0000-4000-8000-00000000e005', 'owner_manual',
  jsonb_build_array(pg_temp.daily_series(
    '7b000000-0000-4000-8000-0000000000b1', 'add_series',
    pg_temp.owner_day(0), 'Club session')));
insert into materialization
select 'b-fill', * from public.materialize_rolling_plan_series(
  pg_temp.rev('7b000000-0000-4000-8000-000000000001'),
  '7b000000-0000-4000-8000-00000000e006');
insert into change_receipt
select 'b-lock', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('7b000000-0000-4000-8000-000000000001'),
  '7b000000-0000-4000-8000-00000000e007', 'owner_manual',
  jsonb_build_array(
    pg_temp.lock_occurrence('7b000000-0000-4000-8000-0000000000b1', 0),
    pg_temp.lock_occurrence('7b000000-0000-4000-8000-0000000000b1', 5)));

insert into logged
select 'b-log', * from public.apply_completion_change(
  'create', null, null,
  jsonb_build_object(
    'planSessionId', (select id from public.rolling_plan_sessions
      where series_id = '7b000000-0000-4000-8000-0000000000b1'
        and occurrence_date = pg_temp.owner_day(0)::date),
    'status', 'completed',
    'actualLocalDate', pg_temp.owner_day(0),
    'activities', '[]'::jsonb));

insert into counted
select 'b-all', count(*) from public.rolling_plan_sessions
where series_id = '7b000000-0000-4000-8000-0000000000b1';

insert into change_receipt
select 'b-end', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('7b000000-0000-4000-8000-000000000001'),
  '7b000000-0000-4000-8000-00000000e008', 'owner_manual',
  jsonb_build_array(jsonb_build_object(
    'operation', 'end_series',
    'seriesId', '7b000000-0000-4000-8000-0000000000b1',
    'effectiveDate', pg_temp.owner_day(0))));

select is(
  (select (series_effects->0->>'deleted')::bigint from change_receipt
   where label = 'b-end'),
  (select value - 1 from counted where label = 'b-all'),
  'an end removes every occurrence but the logged one, a locked one included'
);
select is(
  (select series_effects->0->>'completedKept' from change_receipt where label = 'b-end'),
  '1',
  'a locked and logged occurrence is counted as kept for its log'
);
select is(
  (select series_effects->0->>'lockedKept' from change_receipt where label = 'b-end'),
  '0',
  'and not for its lock'
);
select is(
  (select array_agg(occurrence_date order by occurrence_date)
   from public.rolling_plan_sessions
   where series_id = '7b000000-0000-4000-8000-0000000000b1'),
  array[pg_temp.owner_day(0)]::date[],
  'only the logged occurrence remains'
);

reset role;
select set_config('request.jwt.claims', null, true);

select * from finish();
rollback;
