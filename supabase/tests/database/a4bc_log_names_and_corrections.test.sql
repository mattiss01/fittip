-- A4bc: every log owns its name, and its actuals can be corrected.
--
-- What is proved here, and nowhere else:
--
-- First, that an unmeasured actual is accepted. A2c added the mode everywhere
-- but the activity validator, so every log carrying one was refused.
--
-- Second, that a log names itself. A create that states no name takes the
-- planned session's, or for unplanned training its first activity's, which is
-- what keeps the app deployed during the apply working; an edit that states no
-- name leaves the stored one.
--
-- Third, that a planned log's actuals can be restated and its planned snapshot
-- cannot move while that happens. Each actual answers at most one activity of
-- the log's own snapshot, and unplanned training answers none.
--
-- Dates follow the wall clock for the reason the M3-23 suite gives.

begin;

create extension if not exists pgtap with schema extensions;

create temporary table completion_zone as
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

grant select on completion_zone to public;

create function pg_temp.owner_day(p_offset integer)
returns text
language sql
stable
as $$
  select (
    (timezone((select name from completion_zone), clock_timestamp()))::date + p_offset
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

create temporary table logged (
  label text primary key,
  completion_id uuid,
  snapshot jsonb
);
grant all on logged to public;

select plan(32);

-- Owners ----------------------------------------------------------------------

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('7f000000-0000-4000-8000-000000000401', 'a4bc-owner@example.test', '{}', '{}'),
  ('7f000000-0000-4000-8000-000000000402', 'a4bc-outsider@example.test', '{}', '{}');
insert into public.profiles (user_id, timezone_name)
select id, (select name from completion_zone) from auth.users
where id in (
  '7f000000-0000-4000-8000-000000000401',
  '7f000000-0000-4000-8000-000000000402'
);

-- The sixth mode, admitted wherever an activity is written -------------------

select ok(public.completion_activity_input_is_valid(
  '{"position":0,"name":"Serve practice","sport":"Tennis","measurementMode":"unmeasured"}'),
  'a logged activity may be unmeasured');
select ok(public.rolling_plan_activity_input_is_valid(
  '{"position":0,"name":"Serve practice","sport":"Tennis","measurementMode":"unmeasured","isLocked":false}'),
  'so may a planned one');
select ok(public.rolling_plan_series_activity_input_is_valid(
  '{"position":0,"name":"Serve practice","sport":"Tennis","measurementMode":"unmeasured"}'),
  'and one in a recurring series');
select ok(public.saved_session_activity_input_is_valid(
  '{"position":0,"name":"Serve practice","sport":"Tennis","measurementMode":"unmeasured"}'),
  'and one in the saved library');

-- The shape -------------------------------------------------------------------

select has_column('public', 'completions', 'title', 'a log has a title of its own');
select has_column('public', 'completions', 'sport', 'and a sport of its own');
select has_column('public', 'completion_activities', 'planned_position',
  'an actual can say which planned activity it answers');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"7f000000-0000-4000-8000-000000000401","role":"authenticated"}', true);

select lives_ok(
  format($$select * from public.apply_rolling_plan_change_set(%L, %L, 'a4bc', %s)$$,
    pg_temp.rev('7f000000-0000-4000-8000-000000000401'),
    '7f000000-0000-4000-8000-00000000e401',
    quote_literal(jsonb_build_array(jsonb_build_object(
      'operation', 'add',
      'sessionId', '7f000000-0000-4000-8000-0000000004b1',
      'session', jsonb_build_object(
        'localDate', pg_temp.owner_day(0),
        'position', 0,
        'title', 'Lower body strength',
        'sport', 'Strength',
        'isLocked', false,
        'activities', jsonb_build_array(
          jsonb_build_object(
            'position', 0, 'name', 'Back squat', 'sport', 'Strength',
            'measurementMode', 'sets_reps_load',
            'target', jsonb_build_object(
              'groups', jsonb_build_array(
                jsonb_build_object('sets', 5, 'reps', 5, 'load', 82.5)),
              'load_unit', 'kg'),
            'isLocked', false),
          jsonb_build_object(
            'position', 1, 'name', 'Serve practice', 'sport', 'Tennis',
            'measurementMode', 'unmeasured', 'isLocked', false))
      )
    ))::text) || '::jsonb'),
  'a planned session with two activities exists to log against'
);

-- An unmeasured actual, and a name taken from the plan ------------------------

select lives_ok(
  format($$select * from public.apply_completion_change('create', null, null,
    jsonb_build_object('planSessionId', '7f000000-0000-4000-8000-0000000004b1',
      'status', 'completed', 'actualLocalDate', %L,
      'activities', jsonb_build_array(
        jsonb_build_object('position', 0, 'plannedPosition', 1,
          'name', 'Serve practice', 'sport', 'Tennis',
          'measurementMode', 'unmeasured'),
        jsonb_build_object('position', 1, 'plannedPosition', 0,
          'name', 'Back squat', 'sport', 'Strength',
          'measurementMode', 'sets_reps_load',
          'actualMeasurement', jsonb_build_object(
            'groups', jsonb_build_array(
              jsonb_build_object('sets', 5, 'reps', 5, 'load', 80)),
            'load_unit', 'kg')))))$$, pg_temp.owner_day(0)),
  'a planned log with an unmeasured actual is accepted'
);

insert into logged
select 'planned', completion.id, completion.planned_snapshot
from public.completions completion
where completion.plan_session_id = '7f000000-0000-4000-8000-0000000004b1';

select is(
  (select title || ' / ' || sport from public.completions
   where id = (select completion_id from logged where label = 'planned')),
  'Lower body strength / Strength',
  'a create that states no name takes the planned session''s'
);
select is(
  (select array_agg(name || '@' || planned_position order by position)
   from public.completion_activities
   where completion_id = (select completion_id from logged where label = 'planned')),
  array['Serve practice@1', 'Back squat@0'],
  'each actual keeps the order it was done in and the planned activity it answers'
);

-- Unplanned training ----------------------------------------------------------

select lives_ok(
  format($$select * from public.apply_completion_change('create', null, null,
    jsonb_build_object('status', 'unplanned', 'actualLocalDate', %L,
      'title', '  Sunrise swim ', 'sport', 'Swimming',
      'activities', jsonb_build_array(
        jsonb_build_object('position', 0, 'name', '400 m warm-up',
          'sport', 'Swimming', 'measurementMode', 'unmeasured'))))$$,
    pg_temp.owner_day(0)),
  'unplanned training states its own name and its own activities'
);
select is(
  (select title from public.completions
   where user_id = '7f000000-0000-4000-8000-000000000401'
     and plan_session_id is null),
  'Sunrise swim',
  'and the name is stored trimmed'
);

select lives_ok(
  format($$select * from public.apply_completion_change('create', null, null,
    jsonb_build_object('status', 'unplanned', 'actualLocalDate', %L,
      'activities', jsonb_build_array(
        jsonb_build_object('position', 0, 'name', 'Evening walk',
          'sport', 'Walking', 'measurementMode', 'custom'))))$$,
    pg_temp.owner_day(0)),
  'the previous app''s unplanned create, naming only an activity, still lands'
);
select is(
  (select title || ' / ' || sport from public.completions
   where user_id = '7f000000-0000-4000-8000-000000000401'
     and plan_session_id is null and title <> 'Sunrise swim'),
  'Evening walk / Walking',
  'and it is named from that activity, as the backfill names older ones'
);

select throws_ok(
  format($$select * from public.apply_completion_change('create', null, null,
    jsonb_build_object('status', 'unplanned', 'actualLocalDate', %L,
      'title', 'Row', 'sport', 'Rowing',
      'activities', jsonb_build_array(
        jsonb_build_object('position', 0, 'plannedPosition', 0, 'name', 'Row',
          'sport', 'Rowing', 'measurementMode', 'unmeasured'))))$$,
    pg_temp.owner_day(0)),
  '22023', 'Invalid completed activity.',
  'unplanned training has no snapshot, so no actual of it answers a planned one'
);

-- Correcting a planned log ----------------------------------------------------

select lives_ok(
  format($$select * from public.apply_completion_change('edit', %L, 0,
    jsonb_build_object('status', 'partially_completed', 'actualLocalDate', %L,
      'title', 'Legs and tennis', 'sport', 'Mixed',
      'activities', jsonb_build_array(
        jsonb_build_object('position', 0, 'plannedPosition', 0,
          'name', 'Back squat', 'sport', 'Strength',
          'measurementMode', 'sets_reps_load',
          'actualMeasurement', jsonb_build_object(
            'groups', jsonb_build_array(
              jsonb_build_object('sets', 4, 'reps', 5, 'load', 80)),
            'load_unit', 'kg')),
        jsonb_build_object('position', 1, 'name', 'Farmer carry',
          'sport', 'Strength', 'measurementMode', 'unmeasured'))))$$,
    (select completion_id from logged where label = 'planned'),
    pg_temp.owner_day(0)),
  'a planned log restates its actuals and renames itself in one edit'
);
select is(
  (select planned_snapshot from public.completions
   where id = (select completion_id from logged where label = 'planned')),
  (select snapshot from logged where label = 'planned'),
  'and what it was measured against is exactly what it was'
);
select is(
  (select title || ' / ' || sport from public.completions
   where id = (select completion_id from logged where label = 'planned')),
  'Legs and tennis / Mixed',
  'the log carries the name it was given'
);
select is(
  (select array_agg(name || '@' || coalesce(planned_position::text, '-')
     order by position)
   from public.completion_activities
   where completion_id = (select completion_id from logged where label = 'planned')),
  array['Back squat@0', 'Farmer carry@-'],
  'the actuals are replaced, an added one answering no planned activity'
);

select lives_ok(
  format($$select * from public.apply_completion_change('edit', %L, 1,
    jsonb_build_object('status', 'partially_completed', 'actualLocalDate', %L,
      'durationMinutes', 55))$$,
    (select completion_id from logged where label = 'planned'),
    pg_temp.owner_day(0)),
  'an edit that states neither a name nor activities is still an edit'
);
select is(
  (select title from public.completions
   where id = (select completion_id from logged where label = 'planned')),
  'Legs and tennis',
  'and it leaves the name alone'
);

select throws_ok(
  format($$select * from public.apply_completion_change('edit', %L, 2,
    jsonb_build_object('status', 'completed', 'actualLocalDate', %L,
      'activities', jsonb_build_array(
        jsonb_build_object('position', 0, 'plannedPosition', 5,
          'name', 'Ghost', 'sport', 'Strength',
          'measurementMode', 'unmeasured'))))$$,
    (select completion_id from logged where label = 'planned'),
    pg_temp.owner_day(0)),
  '22023', 'Invalid completed activity.',
  'an actual cannot answer a planned activity its snapshot does not hold'
);
select throws_ok(
  format($$select * from public.apply_completion_change('edit', %L, 2,
    jsonb_build_object('status', 'completed', 'actualLocalDate', %L,
      'activities', jsonb_build_array(
        jsonb_build_object('position', 0, 'plannedPosition', 0,
          'name', 'Back squat', 'sport', 'Strength',
          'measurementMode', 'unmeasured'),
        jsonb_build_object('position', 1, 'plannedPosition', 0,
          'name', 'Back squat again', 'sport', 'Strength',
          'measurementMode', 'unmeasured'))))$$,
    (select completion_id from logged where label = 'planned'),
    pg_temp.owner_day(0)),
  '22023', 'Invalid completion change.',
  'two actuals cannot answer the same planned activity'
);
select throws_ok(
  format($$select * from public.apply_completion_change('edit', %L, 2,
    jsonb_build_object('status', 'completed', 'actualLocalDate', %L,
      'title', 'Half a name'))$$,
    (select completion_id from logged where label = 'planned'),
    pg_temp.owner_day(0)),
  '22023', 'Invalid completion change.',
  'a title without a sport is refused'
);
select throws_ok(
  format($$select * from public.apply_completion_change('edit', %L, 2,
    jsonb_build_object('status', 'completed', 'actualLocalDate', %L,
      'title', repeat('t', 121), 'sport', 'Strength'))$$,
    (select completion_id from logged where label = 'planned'),
    pg_temp.owner_day(0)),
  '22023', 'Invalid completion change.',
  'a title longer than a plan title is refused'
);
select is(
  (select revision from public.completions
   where id = (select completion_id from logged where label = 'planned')),
  2::bigint,
  'and none of those refusals wrote anything'
);

-- Another owner ---------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"7f000000-0000-4000-8000-000000000402","role":"authenticated"}', true);

select throws_ok(
  format($$select * from public.apply_completion_change('edit', %L, 2,
    jsonb_build_object('status', 'completed', 'actualLocalDate', %L,
      'title', 'Taken', 'sport', 'Theft'))$$,
    (select completion_id from logged where label = 'planned'),
    pg_temp.owner_day(0)),
  'PT409', 'That completion changed. Reload and try again.',
  'another owner cannot rename a log, and is told only that it changed'
);
select is(
  (select count(*)::bigint from public.completions),
  0::bigint,
  'and sees no log of the owner''s at all'
);

-- The boundary ----------------------------------------------------------------

reset role;

select throws_ok(
  $$update public.completions set sport = null
    where id = (select completion_id from logged where label = 'planned')$$,
  '23514', null,
  'a title never stands without a sport, whoever writes'
);
select ok(
  has_function_privilege('authenticated',
    'public.apply_completion_change(text, uuid, bigint, jsonb)', 'EXECUTE')
  and not has_function_privilege('anon',
    'public.apply_completion_change(text, uuid, bigint, jsonb)', 'EXECUTE'),
  'the completion write is still reachable only by an authenticated owner'
);
select ok(
  not has_function_privilege('authenticated',
    'public.completion_activity_input_is_valid(jsonb)', 'EXECUTE')
  and not has_function_privilege('anon',
    'public.completion_activity_input_is_valid(jsonb)', 'EXECUTE'),
  'and the replaced activity validator is reachable from no client role'
);

select * from finish();
rollback;
