-- The coach's note on a session and each activity's reason (ADR-040, owner,
-- 28 Oct 2026).
--
-- Proved here: the four nullable columns and their length checks; that the
-- re-issued functions kept their privileges; that a session takes an optional
-- `coachNote` and its activities an optional `rationale`, refusing any other
-- shape or a longer one; that the slice and the change log read them back;
-- that an edit sets and clears them; and that a series' note and reasons reach
-- the occurrences it materializes. Another owner sees none of it.
--
-- Dates follow the wall clock for the reason every rolling-plan suite gives:
-- the past boundary is owner-local today, and the stored zone is one whose
-- local time is currently mid-day.

begin;

create extension if not exists pgtap with schema extensions;

create temporary table note_zone as
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

grant select on note_zone to public;

create function pg_temp.owner_day(p_offset integer)
returns text
language sql
stable
as $$
  select (
    (timezone((select name from note_zone), clock_timestamp()))::date + p_offset
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

create function pg_temp.activities(p_extra jsonb)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_array(jsonb_build_object(
    'position', 0, 'name', 'Bench press', 'sport', 'Strength',
    'measurementMode', 'sets_reps_load',
    'target', jsonb_build_object(
      'groups', jsonb_build_array(
        jsonb_build_object('sets', 3, 'reps', 6, 'load', 60)),
      'load_unit', 'kg')
  ) || p_extra)
$$;

create function pg_temp.add_session(
  p_session_id uuid, p_local_date text, p_extra jsonb, p_activity jsonb
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
      'title', 'Upper body',
      'sport', 'Strength',
      'activities', pg_temp.activities(p_activity)
    ) || p_extra
  ))
$$;

create function pg_temp.edit_session(
  p_session_id uuid, p_extra jsonb, p_activity jsonb
)
returns jsonb
language sql
stable
as $$
  select jsonb_build_array(jsonb_build_object(
    'operation', 'edit',
    'sessionId', p_session_id,
    'session', jsonb_build_object(
      'title', 'Upper body',
      'sport', 'Strength',
      'activities', pg_temp.activities(p_activity)
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

select plan(21);

select is(
  (select count(*)::bigint from note_zone), 1::bigint,
  'a stored zone whose local time is mid-day is available at every UTC hour'
);

-- Structure ------------------------------------------------------------------

select col_type_is('public', 'rolling_plan_sessions', 'coach_note', 'text',
  'a planned session has a coach''s note');
select col_type_is('public', 'rolling_plan_series', 'coach_note', 'text',
  'a series has one too');
select col_type_is('public', 'rolling_plan_activities', 'rationale', 'text',
  'a planned activity has the coach''s reason');
select col_type_is('public', 'rolling_plan_series_activities', 'rationale', 'text',
  'a series activity has one too');
select ok(
  (select bool_and(not attnotnull) from pg_attribute
   where (attrelid, attname) in (
     ('public.rolling_plan_sessions'::regclass, 'coach_note'),
     ('public.rolling_plan_series'::regclass, 'coach_note'),
     ('public.rolling_plan_activities'::regclass, 'rationale'),
     ('public.rolling_plan_series_activities'::regclass, 'rationale'))),
  'all four are optional'
);
select ok(
  (select count(*) = 4 from pg_constraint
   where conname in (
     'rolling_plan_sessions_coach_note_length',
     'rolling_plan_series_coach_note_length',
     'rolling_plan_activities_rationale_length',
     'rolling_plan_series_activities_rationale_length')
     and contype = 'c'),
  'and each is bounded in length'
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
     'public.rolling_plan_activity_input_is_valid(jsonb)'::regprocedure,
     'public.rolling_plan_series_activity_input_is_valid(jsonb)'::regprocedure,
     'public.rolling_plan_session_input_is_valid(jsonb, boolean)'::regprocedure,
     'public.rolling_plan_series_input_is_valid(jsonb)'::regprocedure,
     'public.rolling_plan_session_state(uuid, uuid)'::regprocedure,
     'public.rolling_plan_series_state(uuid, uuid)'::regprocedure)),
  'the re-issued helpers are still reachable from no client role'
);

-- Owners ----------------------------------------------------------------------

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('7e300000-0000-4000-8000-000000000001', 'note-owner@example.test', '{}', '{}'),
  ('7e300000-0000-4000-8000-000000000002', 'note-outsider@example.test', '{}', '{}');
insert into public.profiles (user_id, timezone_name)
select id, (select name from note_zone) from auth.users
where id in (
  '7e300000-0000-4000-8000-000000000001',
  '7e300000-0000-4000-8000-000000000002'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"7e300000-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- A session's note and reasons -------------------------------------------------

insert into change_receipt
select 'add', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('7e300000-0000-4000-8000-000000000001'),
  '7e300000-0000-4000-8000-00000000e001', 'owner_manual',
  pg_temp.add_session(
    '7e300000-0000-4000-8000-0000000000b1', pg_temp.owner_day(0),
    '{"coachNote": "A push session: chest, shoulders, triceps."}'::jsonb,
    '{"rationale": "Builds on last week''s 57.5 kg."}'::jsonb));

select is(
  (select coach_note from public.rolling_plan_sessions
   where id = '7e300000-0000-4000-8000-0000000000b1'),
  'A push session: chest, shoulders, triceps.',
  'a session is added with its coach''s note'
);
select is(
  (select rationale from public.rolling_plan_activities
   where session_id = '7e300000-0000-4000-8000-0000000000b1'),
  'Builds on last week''s 57.5 kg.',
  'and its activity with the coach''s reason'
);
select is(
  (select array[sessions->0->>'coachNote',
                sessions->0->'activities'->0->>'rationale']
   from public.get_rolling_plan_slice(
     pg_temp.owner_day(0)::date, pg_temp.owner_day(0)::date)),
  array['A push session: chest, shoulders, triceps.',
        'Builds on last week''s 57.5 kg.'],
  'the slice reads both back'
);
select is(
  (select array[after_state->>'coachNote',
                after_state->'activities'->0->>'rationale']
   from public.rolling_plan_change_entries
   where user_id = '7e300000-0000-4000-8000-000000000001'
     and change_kind = 'add'),
  array['A push session: chest, shoulders, triceps.',
        'Builds on last week''s 57.5 kg.'],
  'the change log records both'
);

select throws_ok(
  format($$select public.apply_rolling_plan_change_set(%s,
    '7e300000-0000-4000-8000-00000000e002', 'owner_manual', %L::jsonb)$$,
    pg_temp.rev('7e300000-0000-4000-8000-000000000001'),
    pg_temp.add_session(
      '7e300000-0000-4000-8000-0000000000b2', pg_temp.owner_day(1),
      jsonb_build_object('coachNote', repeat('x', 1001)), '{}'::jsonb)),
  '22023', null,
  'a note longer than 1,000 characters is refused'
);
select throws_ok(
  format($$select public.apply_rolling_plan_change_set(%s,
    '7e300000-0000-4000-8000-00000000e003', 'owner_manual', %L::jsonb)$$,
    pg_temp.rev('7e300000-0000-4000-8000-000000000001'),
    pg_temp.add_session(
      '7e300000-0000-4000-8000-0000000000b2', pg_temp.owner_day(1),
      '{"coachNote": 7}'::jsonb, '{}'::jsonb)),
  '22023', null,
  'so is a note that is not text'
);
select throws_ok(
  format($$select public.apply_rolling_plan_change_set(%s,
    '7e300000-0000-4000-8000-00000000e004', 'owner_manual', %L::jsonb)$$,
    pg_temp.rev('7e300000-0000-4000-8000-000000000001'),
    pg_temp.add_session(
      '7e300000-0000-4000-8000-0000000000b2', pg_temp.owner_day(1),
      '{}'::jsonb, jsonb_build_object('rationale', repeat('x', 301)))),
  '22023', null,
  'and a reason longer than 300 characters'
);

insert into change_receipt
select 'clear', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('7e300000-0000-4000-8000-000000000001'),
  '7e300000-0000-4000-8000-00000000e005', 'owner_manual',
  pg_temp.edit_session(
    '7e300000-0000-4000-8000-0000000000b1', '{}'::jsonb, '{}'::jsonb));

select ok(
  (select s.coach_note is null and a.rationale is null
   from public.rolling_plan_sessions s
   join public.rolling_plan_activities a on a.session_id = s.id
   where s.id = '7e300000-0000-4000-8000-0000000000b1'),
  'an edit without them clears both'
);

insert into change_receipt
select 'blank', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('7e300000-0000-4000-8000-000000000001'),
  '7e300000-0000-4000-8000-00000000e006', 'owner_manual',
  pg_temp.edit_session(
    '7e300000-0000-4000-8000-0000000000b1', '{"coachNote": ""}'::jsonb,
    '{"rationale": ""}'::jsonb));

select ok(
  (select s.coach_note is null and a.rationale is null
   from public.rolling_plan_sessions s
   join public.rolling_plan_activities a on a.session_id = s.id
   where s.id = '7e300000-0000-4000-8000-0000000000b1'),
  'and an empty one is stored as none'
);

-- A series' note and reasons ------------------------------------------------------

insert into change_receipt
select 'series', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('7e300000-0000-4000-8000-000000000001'),
  '7e300000-0000-4000-8000-00000000e007', 'owner_manual',
  jsonb_build_array(jsonb_build_object(
    'operation', 'add_series',
    'seriesId', '7e300000-0000-4000-8000-0000000000a1',
    'series', jsonb_build_object(
      'frequency', 'daily', 'intervalCount', 1,
      'startDate', pg_temp.owner_day(2),
      'endDate', pg_temp.owner_day(3),
      'title', 'Push day', 'sport', 'Strength',
      'coachNote', 'Push, heavy press first.',
      'activities', pg_temp.activities(
        '{"rationale": "The main press."}'::jsonb)))));

select is(
  (select array[s.coach_note, a.rationale]
   from public.rolling_plan_series s
   join public.rolling_plan_series_activities a on a.series_id = s.id
   where s.id = '7e300000-0000-4000-8000-0000000000a1'),
  array['Push, heavy press first.', 'The main press.'],
  'a series is written with its note and its activity''s reason'
);

insert into materialization
select 'fill', * from public.materialize_rolling_plan_series(
  pg_temp.rev('7e300000-0000-4000-8000-000000000001'),
  '7e300000-0000-4000-8000-00000000e008');

select is(
  (select array_agg(s.coach_note || ' / ' || a.rationale order by s.local_date)
   from public.rolling_plan_sessions s
   join public.rolling_plan_activities a on a.session_id = s.id
   where s.series_id = '7e300000-0000-4000-8000-0000000000a1'),
  array['Push, heavy press first. / The main press.',
        'Push, heavy press first. / The main press.'],
  'every occurrence it materializes carries them'
);

-- Another owner -------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"7e300000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select is(
  (select coalesce(jsonb_array_length(sessions), 0)
   from public.get_rolling_plan_slice(
     pg_temp.owner_day(0)::date, pg_temp.owner_day(3)::date)),
  0,
  'another owner''s slice holds none of these sessions'
);

select * from finish();
rollback;
