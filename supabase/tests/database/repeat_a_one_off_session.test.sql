-- R2: a one-off session becomes the first session of a new series (owner,
-- 5 and 10 Nov 2026).
--
-- Proved here: the session keeps its id and activities and becomes the
-- series' occurrence on its own date, undiverged; the series template is the
-- session's content with copies of its activities; the change log names both;
-- the window then fills around it without a second session on its date; a
-- logged session may repeat and its log and the log's link are unchanged; and
-- each refusal - another owner, a cancelled session, a session already in a
-- series, a past date, a date beyond the recurring window, a rule that does
-- not fall on the session's date, a key the operation does not take - changes
-- nothing.
--
-- Dates follow the wall clock for the reason every rolling-plan suite gives:
-- the past boundary is owner-local today, and the stored zone is one whose
-- local time is currently mid-day.

begin;

create extension if not exists pgtap with schema extensions;

create temporary table repeat_zone as
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

grant select on repeat_zone to public;

create function pg_temp.owner_day(p_offset integer)
returns text
language sql
stable
as $$
  select (
    (timezone((select name from repeat_zone), clock_timestamp()))::date + p_offset
  )::text
$$;

create function pg_temp.owner_dow(p_offset integer)
returns integer
language sql
stable
as $$
  select extract(dow from pg_temp.owner_day(p_offset)::date)::integer
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
      'startTime', '07:30',
      'note', 'Flat route',
      'coachNote', 'Keep it conversational',
      'activities', jsonb_build_array(jsonb_build_object(
        'position', 0, 'name', 'Easy running', 'sport', 'Running',
        'measurementMode', 'duration_intensity',
        'rationale', 'Aerobic base',
        'target', jsonb_build_object('duration_minutes', 40, 'intensity', 'easy')
      ))
    )
  )
$$;

-- Weekly on the weekday of the given day, with no end.
create function pg_temp.weekly_on(p_offset integer)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'frequency', 'weekly', 'intervalCount', 1,
    'weekdays', jsonb_build_array(pg_temp.owner_dow(p_offset))
  )
$$;

-- One repeat as the call a page would send, under the owner's next revision.
create function pg_temp.repeat_call(
  p_owner uuid, p_key text, p_session_id uuid, p_series_id uuid, p_rule jsonb
)
returns text
language sql
stable
as $$
  select format(
    'select * from public.apply_rolling_plan_change_set(%s, %L, %L, %L::jsonb)',
    pg_temp.rev(p_owner), p_key, 'owner_series',
    jsonb_build_array(jsonb_build_object(
      'operation', 'repeat_session', 'sessionId', p_session_id,
      'seriesId', p_series_id, 'rule', p_rule
    ))
  )
$$;

create function pg_temp.session_row(p_session_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.to_jsonb(session) from public.rolling_plan_sessions session
  where session.id = p_session_id
$$;

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
  (select count(*)::bigint from repeat_zone), 1::bigint,
  'a stored zone whose local time is mid-day is available at every UTC hour'
);

-- Owners ----------------------------------------------------------------------

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('7b000000-0000-4000-8000-000000000001', 'repeat-owner@example.test', '{}', '{}'),
  ('7b000000-0000-4000-8000-000000000002', 'repeat-outsider@example.test', '{}', '{}');
insert into public.profiles (user_id, timezone_name)
select id, (select name from repeat_zone) from auth.users
where id in (
  '7b000000-0000-4000-8000-000000000001',
  '7b000000-0000-4000-8000-000000000002'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"7b000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- c1 a plain one-off today, c2 logged today, c3 cancelled, c4 beyond the
-- recurring window, c5 for the outsider and the wrong-weekday rule.
insert into change_receipt
select 'seed', * from public.apply_rolling_plan_change_set(
  0, '7b000000-0000-4000-8000-00000000e001', 'owner_manual',
  jsonb_build_array(
    pg_temp.plan_session('7b000000-0000-4000-8000-0000000000c1', pg_temp.owner_day(0), 0, 'Morning run'),
    pg_temp.plan_session('7b000000-0000-4000-8000-0000000000c2', pg_temp.owner_day(0), 1, 'Logged run'),
    pg_temp.plan_session('7b000000-0000-4000-8000-0000000000c3', pg_temp.owner_day(1), 0, 'Cancelled run'),
    pg_temp.plan_session('7b000000-0000-4000-8000-0000000000c4', pg_temp.owner_day(91), 0, 'Far run'),
    pg_temp.plan_session('7b000000-0000-4000-8000-0000000000c5', pg_temp.owner_day(2), 0, 'Spare run')));
insert into change_receipt
select 'cancel', * from public.apply_rolling_plan_change_set(
  1, '7b000000-0000-4000-8000-00000000e002', 'owner_manual',
  jsonb_build_array(jsonb_build_object(
    'operation', 'cancel', 'sessionId', '7b000000-0000-4000-8000-0000000000c3')));
insert into logged
select 'c2', * from public.apply_completion_change(
  'create', null, null,
  jsonb_build_object(
    'planSessionId', '7b000000-0000-4000-8000-0000000000c2',
    'status', 'completed',
    'actualLocalDate', pg_temp.owner_day(0),
    'durationMinutes', 46,
    'activities', '[]'::jsonb));

-- A session in the past cannot be planned, so it is written as the database
-- owner would have left it once its day passed.
reset role;
insert into public.rolling_plan_sessions (
  id, user_id, plan_id, local_date, position, title, sport
)
select '7b000000-0000-4000-8000-0000000000c6', plan.user_id, plan.id,
  pg_temp.owner_day(-1)::date, 0, 'Yesterday', 'Running'
from public.rolling_plans plan
where plan.user_id = '7b000000-0000-4000-8000-000000000001';
insert into snapshot
select 'c2-log', to_jsonb(completion) from public.completions completion
where completion.plan_session_id = '7b000000-0000-4000-8000-0000000000c2';
insert into snapshot
select 'c1-activity-ids', jsonb_agg(activity.id order by activity.id)
from public.rolling_plan_activities activity
where activity.session_id = '7b000000-0000-4000-8000-0000000000c1';
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"7b000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- 1. A one-off repeats -------------------------------------------------------

insert into change_receipt
select 'repeat-c1', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('7b000000-0000-4000-8000-000000000001'),
  '7b000000-0000-4000-8000-00000000e003', 'owner_series',
  jsonb_build_array(jsonb_build_object(
    'operation', 'repeat_session',
    'sessionId', '7b000000-0000-4000-8000-0000000000c1',
    'seriesId', '7b000000-0000-4000-8000-0000000000f1',
    'rule', pg_temp.weekly_on(0))));

select is(
  (select result || ':' || coalesce(series_effects::text, 'none')
   from change_receipt where label = 'repeat-c1'),
  'applied:none',
  'the repeat is applied and sweeps nothing'
);
select is(
  (select jsonb_build_object(
     'seriesId', session.series_id, 'occurrenceDate', session.occurrence_date::text,
     'localDate', session.local_date::text, 'hasDiverged', session.has_diverged,
     'status', session.status, 'title', session.title)
   from public.rolling_plan_sessions session
   where session.id = '7b000000-0000-4000-8000-0000000000c1'),
  jsonb_build_object(
    'seriesId', '7b000000-0000-4000-8000-0000000000f1',
    'occurrenceDate', pg_temp.owner_day(0), 'localDate', pg_temp.owner_day(0),
    'hasDiverged', false, 'status', 'active', 'title', 'Morning run'),
  'the session itself is the first occurrence, on its own date and undiverged'
);
select is(
  (select jsonb_agg(activity.id order by activity.id)
   from public.rolling_plan_activities activity
   where activity.session_id = '7b000000-0000-4000-8000-0000000000c1'),
  (select value from snapshot where label = 'c1-activity-ids'),
  'the session keeps its own activities'
);
select is(
  (select jsonb_build_object(
     'frequency', series.frequency, 'intervalCount', series.interval_count,
     'weekdays', to_jsonb(series.weekdays), 'startDate', series.start_date::text,
     'endDate', series.end_date, 'title', series.title, 'sport', series.sport,
     'minutes', series.expected_duration_minutes,
     'startTime', to_char(series.start_time, 'HH24:MI'), 'note', series.note,
     'coachNote', series.coach_note, 'predecessor', series.predecessor_series_id)
   from public.rolling_plan_series series
   where series.id = '7b000000-0000-4000-8000-0000000000f1'),
  jsonb_build_object(
    'frequency', 'weekly', 'intervalCount', 1,
    'weekdays', jsonb_build_array(pg_temp.owner_dow(0)),
    'startDate', pg_temp.owner_day(0), 'endDate', null,
    'title', 'Morning run', 'sport', 'Running', 'minutes', 60,
    'startTime', '07:30', 'note', 'Flat route',
    'coachNote', 'Keep it conversational', 'predecessor', null),
  'the series is the rule from the session''s date with the session''s content'
);
select is(
  (select jsonb_agg(jsonb_build_object(
     'name', activity.name, 'mode', activity.measurement_mode,
     'target', activity.target, 'rationale', activity.rationale))
   from public.rolling_plan_series_activities activity
   where activity.series_id = '7b000000-0000-4000-8000-0000000000f1'),
  jsonb_build_array(jsonb_build_object(
    'name', 'Easy running', 'mode', 'duration_intensity',
    'target', jsonb_build_object('duration_minutes', 40, 'intensity', 'easy'),
    'rationale', 'Aerobic base')),
  'the template''s activities are copies of the session''s'
);
select is(
  (select jsonb_build_object(
     'session', entry.session_id, 'series', entry.series_id,
     'date', entry.local_date, 'beforeSeries', entry.before_state->'seriesId',
     'afterSeries', entry.after_state->'seriesId',
     'templateTitle', entry.after_state->'series'->'title')
   from public.rolling_plan_change_entries entry
   where entry.change_kind = 'repeat_session'
     and entry.user_id = '7b000000-0000-4000-8000-000000000001'),
  jsonb_build_object(
    'session', '7b000000-0000-4000-8000-0000000000c1',
    'series', '7b000000-0000-4000-8000-0000000000f1',
    'date', null, 'beforeSeries', null,
    'afterSeries', '7b000000-0000-4000-8000-0000000000f1',
    'templateTitle', 'Morning run'),
  'the change log names the session and the series it made'
);

-- 2. The window fills around it ---------------------------------------------

insert into snapshot
select 'materialized', to_jsonb(receipt) from public.materialize_rolling_plan_series(
  pg_temp.rev('7b000000-0000-4000-8000-000000000001'),
  '7b000000-0000-4000-8000-00000000e004') receipt;

select is(
  (select count(*)::integer from public.rolling_plan_sessions session
   where session.series_id = '7b000000-0000-4000-8000-0000000000f1'
     and session.occurrence_date = pg_temp.owner_day(0)::date),
  1,
  'the window never writes a second session on the repeated session''s date'
);
select is(
  (select count(*)::integer from public.rolling_plan_sessions session
   where session.series_id = '7b000000-0000-4000-8000-0000000000f1'),
  13,
  'the window holds thirteen weekly occurrences, the first being the session'
);

-- 3. A logged session repeats and its log stays -----------------------------

select lives_ok(
  pg_temp.repeat_call(
    '7b000000-0000-4000-8000-000000000001', '7b000000-0000-4000-8000-00000000e005',
    '7b000000-0000-4000-8000-0000000000c2', '7b000000-0000-4000-8000-0000000000f2',
    jsonb_build_object('frequency', 'daily', 'intervalCount', 2,
      'endDate', pg_temp.owner_day(20))),
  'a session with a log may become a first occurrence'
);
select is(
  (select session.series_id from public.rolling_plan_sessions session
   where session.id = '7b000000-0000-4000-8000-0000000000c2'),
  '7b000000-0000-4000-8000-0000000000f2'::uuid,
  'the logged session is now the series'' occurrence'
);

reset role;
select is(
  (select to_jsonb(completion) from public.completions completion
   where completion.plan_session_id = '7b000000-0000-4000-8000-0000000000c2'),
  (select value from snapshot where label = 'c2-log'),
  'its log and the log''s link to the session are exactly as they were'
);
insert into snapshot
select 'revision', to_jsonb(pg_temp.rev('7b000000-0000-4000-8000-000000000001'));
insert into snapshot
select 'series', to_jsonb(count(*)) from public.rolling_plan_series
where user_id = '7b000000-0000-4000-8000-000000000001';
insert into snapshot
select 'entries', to_jsonb(count(*)) from public.rolling_plan_change_entries
where user_id = '7b000000-0000-4000-8000-000000000001';
insert into snapshot
select 'sessions', jsonb_agg(to_jsonb(session) order by session.id)
from public.rolling_plan_sessions session
where session.user_id = '7b000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"7b000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- 4. Refusals ----------------------------------------------------------------

select throws_ok(
  pg_temp.repeat_call(
    '7b000000-0000-4000-8000-000000000001', '7b000000-0000-4000-8000-00000000e006',
    '7b000000-0000-4000-8000-0000000000c1', '7b000000-0000-4000-8000-0000000000f3',
    pg_temp.weekly_on(0)),
  '22023', 'Invalid rolling plan repeat.',
  'a session already in a series is refused'
);
select throws_ok(
  pg_temp.repeat_call(
    '7b000000-0000-4000-8000-000000000001', '7b000000-0000-4000-8000-00000000e007',
    '7b000000-0000-4000-8000-0000000000c3', '7b000000-0000-4000-8000-0000000000f3',
    pg_temp.weekly_on(1)),
  '22023', 'Invalid rolling plan change.',
  'a cancelled session is refused'
);
select throws_ok(
  pg_temp.repeat_call(
    '7b000000-0000-4000-8000-000000000001', '7b000000-0000-4000-8000-00000000e008',
    '7b000000-0000-4000-8000-0000000000c6', '7b000000-0000-4000-8000-0000000000f3',
    pg_temp.weekly_on(-1)),
  'PT422', 'A plan change cannot target a date before today.',
  'a past session stays a record'
);
select throws_ok(
  pg_temp.repeat_call(
    '7b000000-0000-4000-8000-000000000001', '7b000000-0000-4000-8000-00000000e009',
    '7b000000-0000-4000-8000-0000000000c4', '7b000000-0000-4000-8000-0000000000f3',
    pg_temp.weekly_on(91)),
  '22023', 'Invalid rolling plan repeat.',
  'a session past the last date recurring sessions are written through is refused'
);
select throws_ok(
  pg_temp.repeat_call(
    '7b000000-0000-4000-8000-000000000001', '7b000000-0000-4000-8000-00000000e010',
    '7b000000-0000-4000-8000-0000000000c5', '7b000000-0000-4000-8000-0000000000f3',
    pg_temp.weekly_on(3)),
  '22023', 'Invalid rolling plan repeat.',
  'a rule that does not fall on the session''s own date is refused'
);
select throws_ok(
  pg_temp.repeat_call(
    '7b000000-0000-4000-8000-000000000001', '7b000000-0000-4000-8000-00000000e011',
    '7b000000-0000-4000-8000-0000000000c5', '7b000000-0000-4000-8000-0000000000f3',
    pg_temp.weekly_on(2) || jsonb_build_object('title', 'Smuggled')),
  '22023', 'Invalid rolling plan repeat.',
  'the template is the session''s: a rule carrying content is refused'
);
select throws_ok(
  pg_temp.repeat_call(
    '7b000000-0000-4000-8000-000000000001', '7b000000-0000-4000-8000-00000000e012',
    '7b000000-0000-4000-8000-0000000000c5', '7b000000-0000-4000-8000-0000000000f1',
    pg_temp.weekly_on(2)),
  '22023', 'Invalid rolling plan repeat.',
  'a series id already in use is refused'
);
select throws_ok(
  pg_temp.repeat_call(
    '7b000000-0000-4000-8000-000000000001', '7b000000-0000-4000-8000-00000000e013',
    '7b000000-0000-4000-8000-0000000000c5', '7b000000-0000-4000-8000-0000000000f3',
    jsonb_build_object('frequency', 'monthly', 'intervalCount', 1)),
  '22023', 'Invalid rolling plan repeat.',
  'a rule the series does not support is refused'
);

-- Another owner reaches none of it, and sees it as a session that is not there.
select set_config(
  'request.jwt.claims',
  '{"sub":"7b000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok(
  pg_temp.repeat_call(
    '7b000000-0000-4000-8000-000000000002', '7b000000-0000-4000-8000-00000000e014',
    '7b000000-0000-4000-8000-0000000000c5', '7b000000-0000-4000-8000-0000000000f3',
    pg_temp.weekly_on(2)),
  '22023', 'Invalid rolling plan change.',
  'another owner''s session is answered as one that does not exist'
);

-- Nobody signed in reaches the function at all.
reset role;
set local role anon;
select throws_ok(
  pg_temp.repeat_call(
    '7b000000-0000-4000-8000-000000000001', '7b000000-0000-4000-8000-00000000e015',
    '7b000000-0000-4000-8000-0000000000c5', '7b000000-0000-4000-8000-0000000000f3',
    pg_temp.weekly_on(2)),
  '42501', null,
  'an anonymous caller cannot call the change function'
);

reset role;
select is(
  to_jsonb(pg_temp.rev('7b000000-0000-4000-8000-000000000001')),
  (select value from snapshot where label = 'revision'),
  'no refusal moved the plan revision'
);
select is(
  (select to_jsonb(count(*)) from public.rolling_plan_series
   where user_id = '7b000000-0000-4000-8000-000000000001'),
  (select value from snapshot where label = 'series'),
  'no refusal made a series'
);
select is(
  (select to_jsonb(count(*)) from public.rolling_plan_change_entries
   where user_id = '7b000000-0000-4000-8000-000000000001'),
  (select value from snapshot where label = 'entries'),
  'no refusal wrote a change entry'
);
select is(
  (select jsonb_agg(to_jsonb(session) order by session.id)
   from public.rolling_plan_sessions session
   where session.user_id = '7b000000-0000-4000-8000-000000000001'),
  (select value from snapshot where label = 'sessions'),
  'no refusal changed a session'
);
select is(
  (select count(*)::integer from public.rolling_plan_series
   where user_id = '7b000000-0000-4000-8000-000000000002'),
  0,
  'the outsider has no series'
);
select ok(
  not has_function_privilege('authenticated',
    'private.plan_change_repeat_session(uuid, uuid, date, timestamptz, jsonb, uuid)', 'EXECUTE')
  and not has_function_privilege('anon',
    'private.plan_change_repeat_session(uuid, uuid, date, timestamptz, jsonb, uuid)', 'EXECUTE'),
  'the helper itself cannot be called from the API'
);

select * from finish();
rollback;
