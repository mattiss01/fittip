-- M3-14: the recurring session series foundation.
--
-- Five owners, because the interesting behavior is sequential and mixing it
-- into one plan would only make each assertion harder to read:
--
--   A  the daily narrative - materialize, diverge, cancel, lock, end, and the
--      `delete` entries that outlive the rows they describe;
--   B  a weekly weekday rule materializing owner-local dates;
--   C  a date already at the ten-session cap;
--   D  a segment that already started: refused whole-series edit, accepted
--      this-and-future split, and byte-identical earlier occurrences;
--   E  another owner, who reaches none of it;
--   F  a bounded segment that ending or splitting it from a later date must
--      never lengthen.
--
-- Dates follow the wall clock for the same reason M3-12's and M3-13's suites
-- do: every rule here is defined against owner-local today, so a fixed literal
-- would stop testing the rule. The owners share a stored zone whose local time
-- is currently mid-day, so a suite that runs in about a second cannot straddle
-- an owner-local midnight whatever UTC hour it starts at.
--
-- Daylight saving is proved on `rolling_plan_series_dates` with fixed dates
-- spanning both European transitions rather than end to end, because owner-local
-- today is real time and cannot be moved onto a transition from inside a
-- transaction. That function is the whole of the date-producing logic; the only
-- part outside it is `today + 13`, which is asserted separately to be `date`
-- arithmetic.

begin;

create extension if not exists pgtap with schema extensions;

create temporary table series_zone as
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

grant select on series_zone to public;

create function pg_temp.owner_day(p_offset integer)
returns text
language sql
stable
as $$
  select (
    (timezone((select name from series_zone), clock_timestamp()))::date + p_offset
  )::text
$$;

create function pg_temp.owner_dow(p_offset integer)
returns integer
language sql
stable
as $$
  select extract(dow from pg_temp.owner_day(p_offset)::date)::integer
$$;

-- The revision the owner would read next. Every change below answers to it, so
-- the suite never hardcodes a revision it would have to renumber.
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

-- One activity, so a template's copy into an occurrence is observable.
create function pg_temp.template_activities()
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

create function pg_temp.series_payload(
  p_series_id uuid,
  p_operation text,
  p_frequency text,
  p_interval integer,
  p_weekdays jsonb,
  p_start_date text,
  p_title text
)
returns jsonb
language sql
stable
as $$
  select jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
    'operation', p_operation,
    'seriesId', p_series_id,
    'series', jsonb_strip_nulls(jsonb_build_object(
      'frequency', p_frequency,
      'intervalCount', p_interval,
      'weekdays', p_weekdays,
      'startDate', p_start_date,
      'title', p_title,
      'sport', 'Running'
    )) || jsonb_build_object('activities', pg_temp.template_activities())
  )))
$$;

-- The same payload with an explicit end date. A bounded segment is the only
-- shape a later effective date could lengthen, so the clamp on `end_series` and
-- on a this-and-future split cannot be exercised without one.
create function pg_temp.bounded_series_payload(
  p_series_id uuid,
  p_operation text,
  p_start_date text,
  p_end_date text,
  p_title text
)
returns jsonb
language sql
stable
as $$
  select jsonb_build_array(jsonb_build_object(
    'operation', p_operation,
    'seriesId', p_series_id,
    'series', (pg_temp.series_payload(
      p_series_id, p_operation, 'daily', 1, null, p_start_date, p_title
    )->0->'series') || jsonb_build_object('endDate', p_end_date)
  ))
$$;

-- Receipts are captured rather than re-read, because `(f()).*` evaluates the
-- function once per output column and would apply a change set five times.
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
create temporary table snapshot (
  label text,
  session_id uuid,
  state jsonb
);
grant all on change_receipt, materialization, snapshot to public;

select plan(102);

select is(
  (select count(*)::bigint from series_zone), 1::bigint,
  'a stored zone whose local time is mid-day is available at every UTC hour'
);

-- Structure ------------------------------------------------------------------

select has_table('public', 'rolling_plan_series',
  'a recurring series is a first-class effective-dated record');
select has_table('public', 'rolling_plan_series_activities',
  'a series carries its own session template activities');
select col_not_null('public', 'rolling_plan_series', 'user_id',
  'every series has a required owner');
select col_not_null('public', 'rolling_plan_series_activities', 'user_id',
  'every series activity has a required owner');

select ok(
  (select count(*) = 0 from pg_attribute
   where attrelid in (
     'public.rolling_plan_series'::regclass,
     'public.rolling_plan_series_activities'::regclass)
     and not attisdropped and attnum > 0
     and atttypid in ('timestamptz'::regtype, 'timestamp'::regtype)
     and attname not in ('created_at', 'updated_at')),
  'no rule field is a timestamp, so expansion is daylight-saving free by construction'
);
select ok(
  (select atttypid = 'date'::regtype from pg_attribute
   where attrelid = 'public.rolling_plan_series'::regclass and attname = 'start_date')
  and (select atttypid = 'date'::regtype from pg_attribute
   where attrelid = 'public.rolling_plan_series'::regclass and attname = 'end_date')
  and (select atttypid = 'date'::regtype from pg_attribute
   where attrelid = 'public.rolling_plan_sessions'::regclass and attname = 'occurrence_date'),
  'the rule range and the occurrence date are owner-local calendar dates'
);
select ok(
  (select attnotnull is false from pg_attribute
   where attrelid = 'public.rolling_plan_sessions'::regclass and attname = 'series_id')
  and (select attnotnull is false from pg_attribute
   where attrelid = 'public.rolling_plan_sessions'::regclass and attname = 'occurrence_date')
  and (select atthasdef from pg_attribute
   where attrelid = 'public.rolling_plan_sessions'::regclass and attname = 'has_diverged'),
  'the three occurrence columns are nullable or defaulted, so one-off sessions are untouched'
);
select ok(
  (select count(*) = 1 from pg_constraint
   where conrelid = 'public.rolling_plan_sessions'::regclass
     and conname = 'rolling_plan_sessions_occurrence_key' and contype = 'u'),
  'one rule date yields at most one occurrence of a series'
);
select ok(
  (select confdeltype = 'c' from pg_constraint
   where conrelid = 'public.rolling_plan_change_entries'::regclass
     and conname = 'rolling_plan_change_entries_session_fkey'),
  'the session foreign key on a change entry still cascades on delete'
);
select ok(
  (select pg_get_constraintdef(oid) like '%add_series%'
      and pg_get_constraintdef(oid) like '%edit_series%'
      and pg_get_constraintdef(oid) like '%end_series%'
      and pg_get_constraintdef(oid) like '%''delete''%'
   from pg_constraint
   where conrelid = 'public.rolling_plan_change_entries'::regclass
     and conname = 'rolling_plan_change_entries_kind_check'),
  'the recorded change kinds gain the three series operations and the deletion'
);
select ok(
  (select count(*) = 1 from pg_constraint
   where conrelid = 'public.rolling_plan_series'::regclass
     and conname = 'rolling_plan_series_activities_personal_fkey') is not true
  and (select count(*) = 1 from pg_constraint
   where conrelid = 'public.rolling_plan_series_activities'::regclass
     and conname = 'rolling_plan_series_activities_personal_fkey'
     and confrelid = 'public.personal_activities'::regclass),
  'a template activity may only reference the same owner personal activity'
);
select has_index('public', 'rolling_plan_series',
  'rolling_plan_series_owner_window_idx',
  'the window expansion has an owner-ordered access path');
select has_index('public', 'rolling_plan_series_activities',
  'rolling_plan_series_activities_owner_series_idx',
  'a template activities have an owner-scoped ordered access path');

-- Privileges and policies ----------------------------------------------------

select ok(
  (select relrowsecurity from pg_class where oid = 'public.rolling_plan_series'::regclass)
  and (select relrowsecurity from pg_class
       where oid = 'public.rolling_plan_series_activities'::regclass),
  'RLS is enabled on both series tables'
);
select ok(
  has_table_privilege('authenticated', 'public.rolling_plan_series', 'SELECT')
  and not has_table_privilege('authenticated', 'public.rolling_plan_series', 'INSERT')
  and not has_table_privilege('authenticated', 'public.rolling_plan_series', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.rolling_plan_series', 'DELETE'),
  'owners read their series directly but can only write it through the change function'
);
select ok(
  has_table_privilege('authenticated', 'public.rolling_plan_series_activities', 'SELECT')
  and not has_table_privilege('authenticated', 'public.rolling_plan_series_activities', 'INSERT')
  and not has_table_privilege('authenticated', 'public.rolling_plan_series_activities', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.rolling_plan_series_activities', 'DELETE'),
  'the same holds for a series template activities'
);
select ok(
  not has_table_privilege('anon', 'public.rolling_plan_series', 'SELECT')
  and not has_table_privilege('anon', 'public.rolling_plan_series_activities', 'SELECT')
  and not has_table_privilege('service_role', 'public.rolling_plan_series', 'SELECT')
  and not has_table_privilege('service_role', 'public.rolling_plan_series_activities', 'SELECT'),
  'neither the anonymous role nor the service role holds any series privilege'
);
select is(
  (select count(*)::bigint from pg_policies
   where schemaname = 'public'
     and tablename in ('rolling_plan_series', 'rolling_plan_series_activities')),
  2::bigint,
  'each series table carries exactly one owner select policy and no mutation policy'
);
select ok(
  (select bool_and(qual = '(( SELECT auth.uid() AS uid) = user_id)')
   from pg_policies
   where schemaname = 'public'
     and tablename in ('rolling_plan_series', 'rolling_plan_series_activities')),
  'both policies confine reads to the calling owner'
);
select ok(
  has_function_privilege('authenticated',
    'public.materialize_rolling_plan_series(bigint, uuid)', 'EXECUTE')
  and not has_function_privilege('anon',
    'public.materialize_rolling_plan_series(bigint, uuid)', 'EXECUTE')
  and not has_function_privilege('service_role',
    'public.materialize_rolling_plan_series(bigint, uuid)', 'EXECUTE'),
  'only an authenticated owner may call the materializer'
);
select ok(
  (select prosecdef and proconfig @> array['search_path=""']
   from pg_proc where oid = 'public.materialize_rolling_plan_series(bigint, uuid)'::regprocedure),
  'the materializer is security definer with an empty search path'
);
select ok(
  (select pg_get_function_identity_arguments(oid) = 'p_expected_plan_revision bigint, p_idempotency_key uuid'
   from pg_proc where oid = 'public.materialize_rolling_plan_series(bigint, uuid)'::regprocedure),
  'the materializer takes no owner argument, so the owner can only come from auth.uid()'
);
select ok(
  not has_function_privilege('authenticated',
    'public.rolling_plan_series_dates(text, smallint, smallint[], date, date, date, date)', 'EXECUTE')
  and not has_function_privilege('authenticated',
    'public.rolling_plan_sweep_series_occurrences(uuid, uuid, uuid, uuid, date, date, integer, timestamptz)', 'EXECUTE')
  and not has_function_privilege('authenticated',
    'public.rolling_plan_series_input_is_valid(jsonb)', 'EXECUTE'),
  'the internal expansion, sweep and validator are reachable from no client role'
);

-- Rule expansion across daylight saving ---------------------------------------

select is(
  (select array_agg(d order by d) from public.rolling_plan_series_dates(
    'weekly', 1::smallint, array[1, 3, 5]::smallint[],
    '2026-10-19', null, '2026-10-19', '2026-11-01') d),
  array['2026-10-19', '2026-10-21', '2026-10-23', '2026-10-26',
        '2026-10-28', '2026-10-30']::date[],
  'a weekly Monday/Wednesday/Friday rule keeps its weekdays across the October transition'
);
select is(
  (select array_agg(d order by d) from public.rolling_plan_series_dates(
    'daily', 3::smallint, null, '2026-03-25', null, '2026-03-25', '2026-04-07') d),
  array['2026-03-25', '2026-03-28', '2026-03-31', '2026-04-03', '2026-04-06']::date[],
  'an every-three-days rule keeps its three-day spacing across the March transition'
);
select is(
  (select array_agg(d order by d) from public.rolling_plan_series_dates(
    'weekly', 2::smallint, array[0, 1]::smallint[],
    '2026-08-23', null, '2026-08-23', '2026-09-20') d),
  array['2026-08-23', '2026-08-24', '2026-09-06', '2026-09-07',
        '2026-09-20']::date[],
  'an every-two-weeks Sunday and Monday rule fires both days of the same week'
);
select is(
  (select array_agg(d order by d) from public.rolling_plan_series_dates(
    'daily', 1::smallint, null, '2026-10-20', '2026-10-24', '2026-10-19', '2026-11-01') d),
  array['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23',
        '2026-10-24']::date[],
  'expansion never leaves the segment range, whichever window is asked for'
);
select is(
  (select count(*)::bigint from public.rolling_plan_series_dates(
    'daily', 1::smallint, null, '2026-01-01', null, '2026-05-01', '2026-05-14') d),
  14::bigint,
  'an open-ended rule still yields only the window asked for'
);
select is(
  (
    pg_catalog.timezone('Europe/Berlin', '2026-10-25T09:00:00Z'::timestamptz)::date + 13
  )::text,
  '2026-11-07',
  'the fourteen-day window is date arithmetic, so a transition cannot shorten it'
);

-- Owners ----------------------------------------------------------------------

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('7d000000-0000-4000-8000-000000000001', 'series-daily@example.test', '{}', '{}'),
  ('7d000000-0000-4000-8000-000000000002', 'series-weekly@example.test', '{}', '{}'),
  ('7d000000-0000-4000-8000-000000000003', 'series-cap@example.test', '{}', '{}'),
  ('7d000000-0000-4000-8000-000000000004', 'series-split@example.test', '{}', '{}'),
  ('7d000000-0000-4000-8000-000000000005', 'series-outsider@example.test', '{}', '{}'),
  ('7d000000-0000-4000-8000-000000000006', 'series-bounded@example.test', '{}', '{}');
insert into public.profiles (user_id, timezone_name)
select id, (select name from series_zone) from auth.users
where id::text like '7d000000-0000-4000-8000-0000000000%';

-- Owner D's segment must already have started, which only time can produce, so
-- it is seeded here as the table owner rather than through the change function.
insert into public.rolling_plans (id, user_id)
values ('7d000000-0000-4000-8000-0000000000d0', '7d000000-0000-4000-8000-000000000004');
insert into public.rolling_plan_series (
  id, user_id, plan_id, frequency, interval_count, start_date, title, sport
) values (
  '7d000000-0000-4000-8000-0000000000d1', '7d000000-0000-4000-8000-000000000004',
  '7d000000-0000-4000-8000-0000000000d0', 'daily', 1,
  pg_temp.owner_day(-5)::date, 'Morning row', 'Rowing'
);

set local role authenticated;

select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok(
  $$select * from public.materialize_rolling_plan_series(
    0, '7d000000-0000-4000-8000-00000000f001')$$,
  '42501', 'An authenticated FitTip user is required.',
  'materialization without an owner is refused before anything is written'
);

-- Owner A: the daily narrative -------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"7d000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select throws_ok(
  $$insert into public.rolling_plan_series (
      id, user_id, plan_id, frequency, interval_count, start_date, title, sport)
    values (gen_random_uuid(), '7d000000-0000-4000-8000-000000000001',
      '7d000000-0000-4000-8000-0000000000d0', 'daily', 1, '2126-01-01', 'X', 'Y')$$,
  '42501', 'permission denied for table rolling_plan_series',
  'direct authenticated insertion of a series is denied'
);
select throws_ok(
  $$insert into public.rolling_plan_series_activities (
      user_id, series_id, position, name, sport, measurement_mode)
    values ('7d000000-0000-4000-8000-000000000001',
      '7d000000-0000-4000-8000-0000000000d1', 0, 'X', 'Running', 'custom')$$,
  '42501', 'permission denied for table rolling_plan_series_activities',
  'direct authenticated insertion of a template activity is denied'
);

insert into change_receipt
select 'a-add', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('7d000000-0000-4000-8000-000000000001'),
  '7d000000-0000-4000-8000-00000000a001', 'owner_manual',
  pg_temp.series_payload(
    '7d000000-0000-4000-8000-0000000000a1', 'add_series', 'daily', 2, null,
    pg_temp.owner_day(0), 'Easy run'));

select is(
  (select result from change_receipt where label = 'a-add'), 'applied',
  'the owner creates a recurring series through the existing change function'
);
select is(
  (select user_id from public.rolling_plan_series
   where id = '7d000000-0000-4000-8000-0000000000a1'),
  '7d000000-0000-4000-8000-000000000001'::uuid,
  'the series owner is derived from the caller, never from the call'
);
select is(
  (select count(*)::bigint from public.rolling_plan_series_activities
   where series_id = '7d000000-0000-4000-8000-0000000000a1'),
  1::bigint,
  'the template carries the activities it was created with'
);
select is(
  (select change_kind from public.rolling_plan_change_entries
   where series_id = '7d000000-0000-4000-8000-0000000000a1'),
  'add_series',
  'creating a series is recorded as one add_series entry against the rule'
);
select ok(
  (select session_id is null and local_date is null and before_state is null
   from public.rolling_plan_change_entries
   where series_id = '7d000000-0000-4000-8000-0000000000a1'),
  'a series entry targets the rule alone and records no prior state'
);
select is(
  (select count(*)::bigint from public.rolling_plan_sessions
   where user_id = '7d000000-0000-4000-8000-000000000001'),
  0::bigint,
  'creating a series writes no occurrence: materialization is a separate act'
);

insert into materialization
select 'a-first', * from public.materialize_rolling_plan_series(
  pg_temp.rev('7d000000-0000-4000-8000-000000000001'),
  '7d000000-0000-4000-8000-00000000a002');

select is(
  (select result from materialization where label = 'a-first'), 'applied',
  'the first materialization writes the window it was missing'
);
select is(
  (select array_agg(occurrence_date order by occurrence_date)
   from public.rolling_plan_sessions
   where series_id = '7d000000-0000-4000-8000-0000000000a1'),
  array[
    pg_temp.owner_day(0), pg_temp.owner_day(2), pg_temp.owner_day(4),
    pg_temp.owner_day(6), pg_temp.owner_day(8), pg_temp.owner_day(10),
    pg_temp.owner_day(12)
  ]::date[],
  'an every-two-days rule materializes exactly its owner-local dates inside the window'
);
select ok(
  (select bool_and(local_date = occurrence_date and not has_diverged
     and not is_locked and status = 'active' and title = 'Easy run')
   from public.rolling_plan_sessions
   where series_id = '7d000000-0000-4000-8000-0000000000a1'),
  'an occurrence is an ordinary active session placed on its own rule date'
);
select is(
  (select count(*)::bigint from public.rolling_plan_activities activity
   join public.rolling_plan_sessions session on session.id = activity.session_id
   where session.series_id = '7d000000-0000-4000-8000-0000000000a1'),
  7::bigint,
  'every occurrence carries a copy of the template activities'
);
select is(
  (select provenance from public.rolling_plan_change_sets
   where id = (select change_set_id from materialization where label = 'a-first')),
  'series_expansion',
  'the additions are recorded under a machine provenance no owner action produces'
);
select is(
  (select count(distinct change_set_id)::bigint
   from public.rolling_plan_change_entries
   where change_kind = 'add' and user_id = '7d000000-0000-4000-8000-000000000001'),
  1::bigint,
  'the whole expansion is one grouped change set, not one per occurrence'
);
select is(
  (select plan_revision from materialization where label = 'a-first'),
  (select plan_revision from change_receipt where label = 'a-add') + 1,
  'materializing advances the revision exactly once'
);

insert into materialization
select 'a-second', * from public.materialize_rolling_plan_series(
  pg_temp.rev('7d000000-0000-4000-8000-000000000001'),
  '7d000000-0000-4000-8000-00000000a003');

select is(
  (select result from materialization where label = 'a-second'), 'unchanged',
  'a second materialization with nothing missing reports unchanged'
);
select is(
  (select created_count from materialization where label = 'a-second'), 0,
  'and it writes no occurrence'
);
select is(
  (select change_set_id from materialization where label = 'a-second'), null,
  'and it appends no change set'
);
select is(
  (select plan_revision from materialization where label = 'a-second'),
  (select plan_revision from materialization where label = 'a-first'),
  'and it does not advance the revision, so two open tabs do not fight over it'
);

-- A caller whose revision is stale still learns it is current rather than being
-- told it lost a race it never entered.
insert into materialization
select 'a-stale', * from public.materialize_rolling_plan_series(
  0, '7d000000-0000-4000-8000-00000000a004');
select is(
  (select result from materialization where label = 'a-stale'), 'unchanged',
  'a stale revision with nothing missing is answered, not refused'
);

-- Divergence and cancellation.
insert into change_receipt
select 'a-touch', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('7d000000-0000-4000-8000-000000000001'),
  '7d000000-0000-4000-8000-00000000a005', 'owner_manual',
  jsonb_build_array(
    (select jsonb_build_object('operation', 'edit', 'sessionId', id, 'session',
       jsonb_build_object('title', 'Owner changed this', 'sport', 'Running',
         'activities', '[]'::jsonb))
     from public.rolling_plan_sessions
     where series_id = '7d000000-0000-4000-8000-0000000000a1'
       and occurrence_date = pg_temp.owner_day(4)::date),
    (select jsonb_build_object('operation', 'cancel', 'sessionId', id)
     from public.rolling_plan_sessions
     where series_id = '7d000000-0000-4000-8000-0000000000a1'
       and occurrence_date = pg_temp.owner_day(6)::date),
    (select jsonb_build_object('operation', 'set_lock', 'sessionId', id, 'isLocked', true)
     from public.rolling_plan_sessions
     where series_id = '7d000000-0000-4000-8000-0000000000a1'
       and occurrence_date = pg_temp.owner_day(8)::date)));

select ok(
  (select has_diverged from public.rolling_plan_sessions
   where series_id = '7d000000-0000-4000-8000-0000000000a1'
     and occurrence_date = pg_temp.owner_day(4)::date),
  'an occurrence the owner edits is marked as diverged from its rule'
);

insert into materialization
select 'a-third', * from public.materialize_rolling_plan_series(
  pg_temp.rev('7d000000-0000-4000-8000-000000000001'),
  '7d000000-0000-4000-8000-00000000a006');

select is(
  (select result from materialization where label = 'a-third'), 'unchanged',
  'a diverged and a cancelled occurrence leave nothing for the materializer to do'
);
select is(
  (select title from public.rolling_plan_sessions
   where series_id = '7d000000-0000-4000-8000-0000000000a1'
     and occurrence_date = pg_temp.owner_day(4)::date),
  'Owner changed this',
  'the materializer never revisits a diverged occurrence'
);
select is(
  (select count(*)::bigint from public.rolling_plan_sessions
   where series_id = '7d000000-0000-4000-8000-0000000000a1'
     and occurrence_date = pg_temp.owner_day(6)::date),
  1::bigint,
  'a cancelled occurrence is never recreated beside itself'
);
select is(
  (select status from public.rolling_plan_sessions
   where series_id = '7d000000-0000-4000-8000-0000000000a1'
     and occurrence_date = pg_temp.owner_day(6)::date),
  'cancelled',
  'and it stays cancelled'
);

-- Ending the segment.
insert into snapshot
select 'a-before-end', session.id, to_jsonb(session)
from public.rolling_plan_sessions session
where session.series_id = '7d000000-0000-4000-8000-0000000000a1'
  and session.occurrence_date <= pg_temp.owner_day(2)::date;

insert into change_receipt
select 'a-end', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('7d000000-0000-4000-8000-000000000001'),
  '7d000000-0000-4000-8000-00000000a007', 'owner_manual',
  jsonb_build_array(jsonb_build_object(
    'operation', 'end_series',
    'seriesId', '7d000000-0000-4000-8000-0000000000a1',
    'effectiveDate', pg_temp.owner_day(4))));

select is(
  (select series_effects->0->>'deleted' from change_receipt where label = 'a-end'),
  '4',
  'ending the segment deletes every unlocked occurrence from the effective date on'
);
select is(
  (select series_effects->0->>'divergedDeleted' from change_receipt where label = 'a-end'),
  '2',
  'and it reports how many of those the owner had already changed'
);
select is(
  (select series_effects->0->>'lockedKept' from change_receipt where label = 'a-end'),
  '1',
  'and how many locked ones it deliberately left alone'
);
select ok(
  (select is_locked and status = 'active' from public.rolling_plan_sessions
   where series_id = '7d000000-0000-4000-8000-0000000000a1'
     and occurrence_date = pg_temp.owner_day(8)::date),
  'a locked occurrence survives the removal and stays active'
);
select is(
  (select array_agg(occurrence_date order by occurrence_date)
   from public.rolling_plan_sessions
   where series_id = '7d000000-0000-4000-8000-0000000000a1'),
  array[
    pg_temp.owner_day(0), pg_temp.owner_day(2), pg_temp.owner_day(8)
  ]::date[],
  'nothing before the effective date is swept, and nothing after it but the lock survives'
);
select is(
  (select count(*)::bigint from snapshot before
   join public.rolling_plan_sessions session on session.id = before.session_id
   where before.label = 'a-before-end' and to_jsonb(session) <> before.state),
  0::bigint,
  'every occurrence before the effective date is byte-identical afterwards'
);
select is(
  (select end_date from public.rolling_plan_series
   where id = '7d000000-0000-4000-8000-0000000000a1'),
  pg_temp.owner_day(3)::date,
  'the segment is closed on the day before the effective date'
);

-- The record of a removal outlives the row it describes.
select is(
  (select count(*)::bigint from public.rolling_plan_change_entries
   where change_kind = 'delete' and user_id = '7d000000-0000-4000-8000-000000000001'),
  4::bigint,
  'each deletion leaves one delete change entry'
);
select ok(
  (select bool_and(session_id is null and series_id is null and local_date is not null)
   from public.rolling_plan_change_entries
   where change_kind = 'delete' and user_id = '7d000000-0000-4000-8000-000000000001'),
  'a delete entry names a date and no session, which is what lets it outlive the row'
);
select ok(
  (select bool_and(
     before_state ? 'title' and before_state ? 'seriesId'
     and before_state ? 'occurrenceDate' and before_state ? 'hasDiverged'
     and jsonb_typeof(before_state->'activities') = 'array')
   from public.rolling_plan_change_entries
   where change_kind = 'delete' and user_id = '7d000000-0000-4000-8000-000000000001'),
  'its before_state carries the whole session, its occurrence identity and its activities'
);
select is(
  (select count(*)::bigint from public.rolling_plan_change_entries
   where change_kind = 'delete'
     and user_id = '7d000000-0000-4000-8000-000000000001'
     and jsonb_array_length(before_state->'activities') = 1),
  3::bigint,
  'the three untouched occurrences kept their copied activity in the record'
);
select is(
  (select count(*)::bigint from public.rolling_plan_change_entries entry
   where entry.user_id = '7d000000-0000-4000-8000-000000000001'
     and entry.session_id is not null
     and not exists (
       select 1 from public.rolling_plan_sessions session
       where session.id = entry.session_id)),
  0::bigint,
  'the deleted rows own earlier entries cascaded away, as ADR-017 records'
);

insert into materialization
select 'a-after-end', * from public.materialize_rolling_plan_series(
  pg_temp.rev('7d000000-0000-4000-8000-000000000001'),
  '7d000000-0000-4000-8000-00000000a008');
select is(
  (select result from materialization where label = 'a-after-end'), 'unchanged',
  'an ended segment produces no further occurrence'
);

-- Owner B: a weekly weekday rule ----------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"7d000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

insert into change_receipt
select 'b-add', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('7d000000-0000-4000-8000-000000000002'),
  '7d000000-0000-4000-8000-00000000b001', 'owner_manual',
  pg_temp.series_payload(
    '7d000000-0000-4000-8000-0000000000b1', 'add_series', 'weekly', 1,
    jsonb_build_array(pg_temp.owner_dow(3), pg_temp.owner_dow(5)),
    pg_temp.owner_day(0), 'Club session'));

select is(
  (select weekdays from public.rolling_plan_series
   where id = '7d000000-0000-4000-8000-0000000000b1'),
  (select array_agg(distinct w order by w)
   from unnest(array[pg_temp.owner_dow(3), pg_temp.owner_dow(5)]::smallint[]) w),
  'a weekly rule stores its weekday set sorted and distinct'
);

insert into materialization
select 'b-first', * from public.materialize_rolling_plan_series(
  pg_temp.rev('7d000000-0000-4000-8000-000000000002'),
  '7d000000-0000-4000-8000-00000000b002');

select is(
  (select array_agg(occurrence_date order by occurrence_date)
   from public.rolling_plan_sessions
   where series_id = '7d000000-0000-4000-8000-0000000000b1'),
  array[
    pg_temp.owner_day(3), pg_temp.owner_day(5),
    pg_temp.owner_day(10), pg_temp.owner_day(12)
  ]::date[],
  'a weekly weekday rule materializes both weekdays in both weeks of the window'
);
select is(
  (select created_count from materialization where label = 'b-first'), 4,
  'and reports exactly what it created'
);

-- Owner C: a date already at the cap -------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"7d000000-0000-4000-8000-000000000003","role":"authenticated"}', true);

insert into change_receipt
select 'c-fill', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('7d000000-0000-4000-8000-000000000003'),
  '7d000000-0000-4000-8000-00000000c001', 'owner_manual',
  (select jsonb_agg(jsonb_build_object(
     'operation', 'add', 'sessionId', gen_random_uuid(),
     'session', jsonb_build_object(
       'localDate', pg_temp.owner_day(3), 'position', i,
       'title', 'Filler', 'sport', 'Running', 'isLocked', false,
       'activities', '[]'::jsonb)))
   from generate_series(0, 9) i));

insert into change_receipt
select 'c-add', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('7d000000-0000-4000-8000-000000000003'),
  '7d000000-0000-4000-8000-00000000c002', 'owner_manual',
  pg_temp.series_payload(
    '7d000000-0000-4000-8000-0000000000c1', 'add_series', 'daily', 1, null,
    pg_temp.owner_day(0), 'Daily'));

insert into materialization
select 'c-first', * from public.materialize_rolling_plan_series(
  pg_temp.rev('7d000000-0000-4000-8000-000000000003'),
  '7d000000-0000-4000-8000-00000000c003');

select is(
  (select created_count from materialization where label = 'c-first'), 13,
  'a date already holding ten sessions yields no occurrence, and the rest still do'
);
select is(
  (select jsonb_array_length(skipped) from materialization where label = 'c-first'),
  1,
  'the skipped date is returned rather than swallowed'
);
select is(
  (select skipped->0->>'occurrenceDate' from materialization where label = 'c-first'),
  pg_temp.owner_day(3),
  'and it is the date that was full'
);
select is(
  (select skipped->0->>'reason' from materialization where label = 'c-first'),
  'daily_session_limit',
  'and it says why'
);
select is(
  (select count(*)::bigint from public.rolling_plan_series
   where id = '7d000000-0000-4000-8000-0000000000c1'),
  1::bigint,
  'the series survives a cap collision rather than being refused'
);
select is(
  (select count(*)::bigint from public.rolling_plan_sessions
   where user_id = '7d000000-0000-4000-8000-000000000003'
     and local_date = pg_temp.owner_day(3)::date and status = 'active'),
  10::bigint,
  'and the full date still holds exactly ten active sessions'
);

-- Owner D: a segment that already started --------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"7d000000-0000-4000-8000-000000000004","role":"authenticated"}', true);

insert into materialization
select 'd-first', * from public.materialize_rolling_plan_series(
  pg_temp.rev('7d000000-0000-4000-8000-000000000004'),
  '7d000000-0000-4000-8000-00000000d001');
select is(
  (select created_count from materialization where label = 'd-first'), 14,
  'a segment that started before today still materializes only from today forward'
);
select is(
  (select min(occurrence_date) from public.rolling_plan_sessions
   where series_id = '7d000000-0000-4000-8000-0000000000d1'),
  pg_temp.owner_day(0)::date,
  'so no occurrence is written on a date already past'
);

select throws_ok(
  format($$select * from public.apply_rolling_plan_change_set(
    %s, '7d000000-0000-4000-8000-00000000d002', 'owner_manual',
    %L::jsonb)$$,
    pg_temp.rev('7d000000-0000-4000-8000-000000000004'),
    pg_temp.series_payload(
      '7d000000-0000-4000-8000-0000000000d1', 'edit_series', 'daily', 2, null,
      pg_temp.owner_day(0), 'Rewritten')),
  'PT424', 'This series has already started. Change it from a date instead.',
  'a whole-series edit is refused once the segment first occurrence has passed'
);

insert into snapshot
select 'd-before-split', session.id, to_jsonb(session)
from public.rolling_plan_sessions session
where session.series_id = '7d000000-0000-4000-8000-0000000000d1'
  and session.occurrence_date < pg_temp.owner_day(5)::date;

insert into change_receipt
select 'd-split', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('7d000000-0000-4000-8000-000000000004'),
  '7d000000-0000-4000-8000-00000000d003', 'owner_manual',
  jsonb_build_array(
    (pg_temp.series_payload(
      '7d000000-0000-4000-8000-0000000000d1', 'edit_series', 'daily', 3, null,
      pg_temp.owner_day(5), 'Successor')->0)
    || jsonb_build_object(
      'effectiveDate', pg_temp.owner_day(5),
      'successorSeriesId', '7d000000-0000-4000-8000-0000000000d2')));

select is(
  (select end_date from public.rolling_plan_series
   where id = '7d000000-0000-4000-8000-0000000000d1'),
  pg_temp.owner_day(4)::date,
  'a this-and-future edit closes the running segment on the day before the split'
);
select ok(
  (select predecessor_series_id = '7d000000-0000-4000-8000-0000000000d1'
     and start_date = pg_temp.owner_day(5)::date
     and title = 'Successor' and interval_count = 3
   from public.rolling_plan_series
   where id = '7d000000-0000-4000-8000-0000000000d2'),
  'and opens a successor segment that points back at it'
);
select is(
  (select count(*)::bigint from snapshot before
   join public.rolling_plan_sessions session on session.id = before.session_id
   where before.label = 'd-before-split' and to_jsonb(session) <> before.state),
  0::bigint,
  'every occurrence before the split date is byte-identical afterwards'
);
select is(
  (select count(*)::bigint from public.rolling_plan_sessions
   where series_id = '7d000000-0000-4000-8000-0000000000d1'
     and occurrence_date >= pg_temp.owner_day(5)::date),
  0::bigint,
  'the closed segment keeps no occurrence on or after the split date'
);

insert into materialization
select 'd-second', * from public.materialize_rolling_plan_series(
  pg_temp.rev('7d000000-0000-4000-8000-000000000004'),
  '7d000000-0000-4000-8000-00000000d004');
select is(
  (select array_agg(occurrence_date order by occurrence_date)
   from public.rolling_plan_sessions
   where series_id = '7d000000-0000-4000-8000-0000000000d2'),
  array[
    pg_temp.owner_day(5), pg_temp.owner_day(8), pg_temp.owner_day(11)
  ]::date[],
  'the successor rule then fills the rest of the window on its own schedule'
);

-- Owner E: another owner reaches none of it ------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"7d000000-0000-4000-8000-000000000005","role":"authenticated"}', true);

select is(
  (select count(*)::bigint from public.rolling_plan_series), 0::bigint,
  'another owner reads no series'
);
select is(
  (select count(*)::bigint from public.rolling_plan_series_activities), 0::bigint,
  'and no template activity'
);
select is(
  (select count(*)::bigint from public.rolling_plan_change_entries
   where change_kind = 'delete'),
  0::bigint,
  'and none of the delete records another owner removal left behind'
);
select throws_ok(
  format($$select * from public.apply_rolling_plan_change_set(
    0, '7d000000-0000-4000-8000-00000000e001', 'owner_manual',
    %L::jsonb)$$,
    jsonb_build_array(jsonb_build_object(
      'operation', 'end_series',
      'seriesId', '7d000000-0000-4000-8000-0000000000b1',
      'effectiveDate', pg_temp.owner_day(1)))),
  '22023', 'Invalid rolling plan series change.',
  'and cannot end a series it does not own'
);
select throws_ok(
  format($$select * from public.apply_rolling_plan_change_set(
    0, '7d000000-0000-4000-8000-00000000e002', 'owner_manual',
    %L::jsonb)$$,
    jsonb_build_array(
      (pg_temp.series_payload(
        '7d000000-0000-4000-8000-0000000000b1', 'edit_series', 'daily', 1, null,
        pg_temp.owner_day(1), 'Stolen')->0)
      || jsonb_build_object(
        'effectiveDate', pg_temp.owner_day(1),
        'successorSeriesId', '7d000000-0000-4000-8000-0000000000e9'))),
  '22023', 'Invalid rolling plan series change.',
  'and cannot split one either'
);
select is(
  (select count(*)::bigint from public.rolling_plan_series
   where id = '7d000000-0000-4000-8000-0000000000b1'),
  0::bigint,
  'the other owner series is untouched and still invisible'
);

-- Owner F: ending or splitting never lengthens a segment ------------------------

-- Both closing paths write the day before the effective date. Without a clamp
-- an effective date past an existing end date pushes that end date outward, and
-- the sweep cannot take the difference back because it only runs from the
-- effective date forward: the next materialization simply fills the reopened
-- gap.

select set_config(
  'request.jwt.claims',
  '{"sub":"7d000000-0000-4000-8000-000000000006","role":"authenticated"}', true);

insert into change_receipt
select 'f-add', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('7d000000-0000-4000-8000-000000000006'),
  '7d000000-0000-4000-8000-00000000f101', 'owner_manual',
  pg_temp.bounded_series_payload(
    '7d000000-0000-4000-8000-0000000000f1', 'add_series',
    pg_temp.owner_day(0), pg_temp.owner_day(3), 'Bounded row'));
insert into materialization
select 'f-first', * from public.materialize_rolling_plan_series(
  pg_temp.rev('7d000000-0000-4000-8000-000000000006'),
  '7d000000-0000-4000-8000-00000000f102');
select is(
  (select array_agg(occurrence_date order by occurrence_date)
   from public.rolling_plan_sessions
   where series_id = '7d000000-0000-4000-8000-0000000000f1'),
  array[
    pg_temp.owner_day(0), pg_temp.owner_day(1),
    pg_temp.owner_day(2), pg_temp.owner_day(3)
  ]::date[],
  'a bounded segment materializes no further than its own end date'
);

-- Clamped, the close leaves the segment exactly as it was, so the change set
-- is refused by the same rule that refuses any other change that changes
-- nothing. What it must never do is push the end date out to day(7).
select throws_ok(
  format($$select * from public.apply_rolling_plan_change_set(
    %s, '7d000000-0000-4000-8000-00000000f103', 'owner_manual',
    %L::jsonb)$$,
    pg_temp.rev('7d000000-0000-4000-8000-000000000006'),
    jsonb_build_array(jsonb_build_object(
      'operation', 'end_series',
      'seriesId', '7d000000-0000-4000-8000-0000000000f1',
      'effectiveDate', pg_temp.owner_day(8)))),
  '22023', 'A plan change must change current state.',
  'ending a segment from a date after its end date changes nothing and is refused'
);
select is(
  (select end_date from public.rolling_plan_series
   where id = '7d000000-0000-4000-8000-0000000000f1'),
  pg_temp.owner_day(3)::date,
  'and leaves that end date exactly where it was'
);

insert into materialization
select 'f-second', * from public.materialize_rolling_plan_series(
  pg_temp.rev('7d000000-0000-4000-8000-000000000006'),
  '7d000000-0000-4000-8000-00000000f104');
select is(
  (select count(*)::bigint from public.rolling_plan_sessions
   where series_id = '7d000000-0000-4000-8000-0000000000f1'
     and occurrence_date > pg_temp.owner_day(3)::date),
  0::bigint,
  'so the next materialization writes nothing into the gap that would have opened'
);
select is(
  (select array_agg(occurrence_date order by occurrence_date)
   from public.rolling_plan_sessions
   where series_id = '7d000000-0000-4000-8000-0000000000f1'),
  array[
    pg_temp.owner_day(0), pg_temp.owner_day(1),
    pg_temp.owner_day(2), pg_temp.owner_day(3)
  ]::date[],
  'and the segment still holds exactly the occurrences it held before'
);

insert into change_receipt
select 'f-add-2', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('7d000000-0000-4000-8000-000000000006'),
  '7d000000-0000-4000-8000-00000000f105', 'owner_manual',
  pg_temp.bounded_series_payload(
    '7d000000-0000-4000-8000-0000000000f2', 'add_series',
    pg_temp.owner_day(0), pg_temp.owner_day(3), 'Bounded swim'));
insert into materialization
select 'f-third', * from public.materialize_rolling_plan_series(
  pg_temp.rev('7d000000-0000-4000-8000-000000000006'),
  '7d000000-0000-4000-8000-00000000f106');

insert into change_receipt
select 'f-split', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('7d000000-0000-4000-8000-000000000006'),
  '7d000000-0000-4000-8000-00000000f107', 'owner_manual',
  jsonb_build_array(
    (pg_temp.series_payload(
      '7d000000-0000-4000-8000-0000000000f2', 'edit_series', 'daily', 3, null,
      pg_temp.owner_day(6), 'Successor')->0)
    || jsonb_build_object(
      'effectiveDate', pg_temp.owner_day(6),
      'successorSeriesId', '7d000000-0000-4000-8000-0000000000f3')));
select is(
  (select end_date from public.rolling_plan_series
   where id = '7d000000-0000-4000-8000-0000000000f2'),
  pg_temp.owner_day(3)::date,
  'splitting from a date after the end date does not push the predecessor out'
);
select is(
  (select after_state->>'predecessorEndDate'
   from public.rolling_plan_change_entries
   where series_id = '7d000000-0000-4000-8000-0000000000f3'),
  pg_temp.owner_day(3),
  'and the recorded change reports the end date the predecessor actually kept'
);

insert into materialization
select 'f-fourth', * from public.materialize_rolling_plan_series(
  pg_temp.rev('7d000000-0000-4000-8000-000000000006'),
  '7d000000-0000-4000-8000-00000000f108');
select is(
  (select count(*)::bigint from public.rolling_plan_sessions
   where series_id = '7d000000-0000-4000-8000-0000000000f2'
     and occurrence_date > pg_temp.owner_day(3)::date),
  0::bigint,
  'so the predecessor gains no occurrence between its end date and the split'
);

-- Owner immutability -----------------------------------------------------------

reset role;
select throws_ok(
  $$update public.rolling_plan_series
    set user_id = '7d000000-0000-4000-8000-000000000005'
    where id = '7d000000-0000-4000-8000-0000000000a1'$$,
  '42501', 'A recurring series owner cannot be reassigned.',
  'no privileged path can move a series to another owner'
);
select throws_ok(
  $$update public.rolling_plan_series_activities
    set user_id = '7d000000-0000-4000-8000-000000000005'
    where series_id = '7d000000-0000-4000-8000-0000000000a1'$$,
  '42501', 'A recurring series owner cannot be reassigned.',
  'and none can move a template activity either'
);

select * from finish();
rollback;
