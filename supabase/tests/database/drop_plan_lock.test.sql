-- The lock flag leaves the database (owner, 9 Oct 2026).
--
-- Four things are proved here.
--
-- First, that the two columns are gone and the eight functions re-emitted
-- without them kept exactly the privileges and security attributes they had:
-- four are the owner's own calls and four are reachable from no client role.
--
-- Second, that a payload naming a lock is refused where it was once required:
-- `isLocked` on a session or an activity is an unknown key, and `set_lock` is
-- an unknown operation. Another owner's session is not reachable through
-- either refusal.
--
-- Third, that nothing written from here on carries the key: not a slice, not a
-- change entry's state, not a log's planned snapshot.
--
-- Fourth, that history is left alone. The change-entry constraints still admit
-- the `set_lock` kind, so an entry written before this migration stays valid.
--
-- Dates follow the wall clock for the reason every rolling-plan suite gives:
-- the past boundary is defined against owner-local today, and the stored zone
-- is one whose local time is currently mid-day.

begin;

create extension if not exists pgtap with schema extensions;

create temporary table drop_zone as
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

grant select on drop_zone to public;

create function pg_temp.owner_day(p_offset integer)
returns text
language sql
stable
as $$
  select (
    (timezone((select name from drop_zone), clock_timestamp()))::date + p_offset
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

create function pg_temp.activity(p_extra jsonb)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'position', 0, 'name', 'Easy running', 'sport', 'Running',
    'measurementMode', 'duration_intensity',
    'target', jsonb_build_object('duration_minutes', 40, 'intensity', 'easy')
  ) || p_extra
$$;

create function pg_temp.add_session(
  p_session_id uuid, p_local_date text, p_extra jsonb, p_activity_extra jsonb
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
      'expectedDurationMinutes', 60,
      'activities', jsonb_build_array(pg_temp.activity(p_activity_extra))
    ) || p_extra
  ))
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

grant all on change_receipt, logged to public;

select plan(19);

select is(
  (select count(*)::bigint from drop_zone), 1::bigint,
  'a stored zone whose local time is mid-day is available at every UTC hour'
);

-- Structure ------------------------------------------------------------------

select hasnt_column('public', 'rolling_plan_sessions', 'is_locked',
  'a planned session carries no lock column');
select hasnt_column('public', 'rolling_plan_activities', 'is_locked',
  'a planned activity carries no lock column');

select ok(
  (select bool_and(
     has_function_privilege('authenticated', oid, 'EXECUTE')
     and not has_function_privilege('anon', oid, 'EXECUTE')
     and not has_function_privilege('service_role', oid, 'EXECUTE'))
   from pg_proc
   where oid in (
     'public.apply_rolling_plan_change_set(bigint, uuid, text, jsonb)'::regprocedure,
     'public.get_rolling_plan_slice(date, date)'::regprocedure,
     'public.materialize_rolling_plan_series(bigint, uuid)'::regprocedure,
     'public.finish_plan_proposal_review(uuid, bigint, uuid)'::regprocedure)),
  'the four owner calls are still for an authenticated owner alone'
);
select ok(
  (select bool_and(
     not has_function_privilege('authenticated', oid, 'EXECUTE')
     and not has_function_privilege('anon', oid, 'EXECUTE')
     and not has_function_privilege('service_role', oid, 'EXECUTE'))
   from pg_proc
   where oid in (
     'public.rolling_plan_activity_input_is_valid(jsonb)'::regprocedure,
     'public.rolling_plan_session_input_is_valid(jsonb, boolean)'::regprocedure,
     'public.rolling_plan_session_state(uuid, uuid)'::regprocedure,
     'public.rolling_plan_sweep_series_occurrences(uuid, uuid, uuid, uuid, date, date, integer, timestamptz)'::regprocedure)),
  'the four internal functions are still reachable from no client role'
);
select ok(
  (select bool_and(prosecdef and proconfig @> array['search_path=""']
     and not pg_get_function_identity_arguments(oid) like '%user%')
   from pg_proc
   where oid in (
     'public.apply_rolling_plan_change_set(bigint, uuid, text, jsonb)'::regprocedure,
     'public.materialize_rolling_plan_series(bigint, uuid)'::regprocedure,
     'public.finish_plan_proposal_review(uuid, bigint, uuid)'::regprocedure)),
  'the three writers are still security definers with an empty search path and no owner argument'
);
select ok(
  (select bool_and(not prosecdef and proconfig @> array['search_path=""'])
   from pg_proc
   where oid in (
     'public.get_rolling_plan_slice(date, date)'::regprocedure,
     'public.rolling_plan_activity_input_is_valid(jsonb)'::regprocedure,
     'public.rolling_plan_session_input_is_valid(jsonb, boolean)'::regprocedure,
     'public.rolling_plan_session_state(uuid, uuid)'::regprocedure,
     'public.rolling_plan_sweep_series_occurrences(uuid, uuid, uuid, uuid, date, date, integer, timestamptz)'::regprocedure)),
  'the read and the helpers still run as their caller with an empty search path'
);
select ok(
  (select bool_and(pg_get_constraintdef(oid) like '%set_lock%')
   from pg_constraint
   where conrelid = 'public.rolling_plan_change_entries'::regclass
     and conname in (
       'rolling_plan_change_entries_kind_check',
       'rolling_plan_change_entries_target_check')),
  'history is left alone: a change entry of kind set_lock written before this stays valid'
);

-- Owners ----------------------------------------------------------------------

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('7c100000-0000-4000-8000-000000000001', 'drop-owner@example.test', '{}', '{}'),
  ('7c100000-0000-4000-8000-000000000002', 'drop-outsider@example.test', '{}', '{}');
insert into public.profiles (user_id, timezone_name)
select id, (select name from drop_zone) from auth.users
where id in (
  '7c100000-0000-4000-8000-000000000001',
  '7c100000-0000-4000-8000-000000000002'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"7c100000-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- A payload naming a lock is refused ---------------------------------------------

insert into change_receipt
select 'add', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('7c100000-0000-4000-8000-000000000001'),
  '7c100000-0000-4000-8000-00000000e001', 'owner_manual',
  pg_temp.add_session(
    '7c100000-0000-4000-8000-0000000000b1', pg_temp.owner_day(0),
    '{}'::jsonb, '{}'::jsonb));

select is(
  (select result from change_receipt where label = 'add'), 'applied',
  'a session is added without the key it once had to carry'
);
select throws_ok(
  format($$select public.apply_rolling_plan_change_set(%s,
    '7c100000-0000-4000-8000-00000000e002', 'owner_manual', %L::jsonb)$$,
    pg_temp.rev('7c100000-0000-4000-8000-000000000001'),
    pg_temp.add_session(
      '7c100000-0000-4000-8000-0000000000b2', pg_temp.owner_day(1),
      '{"isLocked": false}'::jsonb, '{}'::jsonb)),
  '22023', 'Invalid rolling plan addition.',
  'a session naming isLocked is refused, as any unknown key is'
);
select throws_ok(
  format($$select public.apply_rolling_plan_change_set(%s,
    '7c100000-0000-4000-8000-00000000e003', 'owner_manual', %L::jsonb)$$,
    pg_temp.rev('7c100000-0000-4000-8000-000000000001'),
    pg_temp.add_session(
      '7c100000-0000-4000-8000-0000000000b2', pg_temp.owner_day(1),
      '{}'::jsonb, '{"isLocked": false}'::jsonb)),
  '22023', 'Invalid rolling plan addition.',
  'and so is an activity naming it'
);
select throws_ok(
  format($$select public.apply_rolling_plan_change_set(%s,
    '7c100000-0000-4000-8000-00000000e004', 'owner_manual', %L::jsonb)$$,
    pg_temp.rev('7c100000-0000-4000-8000-000000000001'),
    jsonb_build_array(jsonb_build_object(
      'operation', 'set_lock',
      'sessionId', '7c100000-0000-4000-8000-0000000000b1',
      'isLocked', true))),
  '22023', 'Invalid rolling plan change.',
  'set_lock is refused, as any unknown operation is'
);
select is(
  (select count(*)::bigint from public.rolling_plan_sessions
   where user_id = '7c100000-0000-4000-8000-000000000001'),
  1::bigint,
  'no refusal wrote a session'
);
select is(
  pg_temp.rev('7c100000-0000-4000-8000-000000000001'), 1::bigint,
  'and none advanced the plan revision'
);

-- Nothing written from here on carries the key -----------------------------------

select ok(
  (select not (sessions->0 ? 'isLocked')
     and not (sessions->0->'activities'->0 ? 'isLocked')
     and sessions->0->>'title' = 'Long run'
     and jsonb_array_length(sessions->0->'activities') = 1
   from public.get_rolling_plan_slice(
     pg_temp.owner_day(0)::date, pg_temp.owner_day(0)::date)),
  'a slice returns the session and its activity without the key'
);
select ok(
  (select not (after_state ? 'isLocked')
     and not (after_state->'activities'->0 ? 'isLocked')
     and after_state->>'title' = 'Long run'
   from public.rolling_plan_change_entries
   where user_id = '7c100000-0000-4000-8000-000000000001'
     and change_kind = 'add'),
  'a change entry records the state without it'
);

insert into logged
select 'log', * from public.apply_completion_change(
  'create', null, null,
  jsonb_build_object(
    'planSessionId', '7c100000-0000-4000-8000-0000000000b1',
    'status', 'completed',
    'actualLocalDate', pg_temp.owner_day(0),
    'activities', '[]'::jsonb));

select ok(
  (select not (planned_snapshot ? 'isLocked')
     and not (planned_snapshot->'activities'->0 ? 'isLocked')
     and planned_snapshot->>'title' = 'Long run'
   from public.completions
   where id = (select completion_id from logged where label = 'log')),
  'a log''s planned snapshot is written without it'
);

-- Another owner reaches nothing through either refusal ----------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"7c100000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select is(
  (select jsonb_array_length(sessions) from public.get_rolling_plan_slice(
     pg_temp.owner_day(0)::date, pg_temp.owner_day(0)::date)),
  0,
  'another owner''s slice holds none of the first owner''s sessions'
);
select throws_ok(
  format($$select public.apply_rolling_plan_change_set(%s,
    '7c100000-0000-4000-8000-00000000e005', 'owner_manual', %L::jsonb)$$,
    pg_temp.rev('7c100000-0000-4000-8000-000000000002'),
    jsonb_build_array(jsonb_build_object(
      'operation', 'delete',
      'sessionId', '7c100000-0000-4000-8000-0000000000b1'))),
  '22023', null,
  'and another owner''s change cannot name the first owner''s session'
);

reset role;
select set_config('request.jwt.claims', null, true);

select * from finish();
rollback;
