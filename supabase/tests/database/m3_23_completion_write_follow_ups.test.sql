-- M3-23: the three corrections to the completion write path.
--
-- What is proved here, and nowhere else:
--
-- First, that a duplicate is refused with an errcode the surface can act on.
-- M3-15A raised `22023` for it, which the repository collapses into the generic
-- validation error, so the owner was told to check numbers that were correct.
--
-- Second, that an unplanned completion's activities can be corrected. M3-23
-- also refused a planned one's; A4bc inverted that on purpose, because the
-- actual list is not the snapshot, and its own suite proves the snapshot
-- still cannot move.
--
-- Third, that no completion may be dated after the owner's today, on either
-- operation. The edit is judged against the zone the completion carries rather
-- than the owner's current profile zone, because a completion's date must not
-- move when the profile zone does.
--
-- Dates follow the wall clock for the same reason the M3-15A suite's do: the
-- rule is defined against owner-local today, so a fixed literal would stop
-- testing it. The owner's zone is one whose local time is currently mid-day, so
-- a suite that runs in about a second cannot straddle an owner-local midnight.

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

create function pg_temp.plan_session(p_session_id uuid, p_local_date text, p_title text)
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
  ))
$$;

create temporary table logged (
  label text primary key,
  completion_id uuid,
  revision bigint,
  result text
);
grant all on logged to public;

select plan(22);

-- Owners ----------------------------------------------------------------------

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('7f000000-0000-4000-8000-000000000201', 'm323-owner@example.test', '{}', '{}'),
  ('7f000000-0000-4000-8000-000000000202', 'm323-outsider@example.test', '{}', '{}');
insert into public.profiles (user_id, timezone_name)
select id, (select name from completion_zone) from auth.users
where id in (
  '7f000000-0000-4000-8000-000000000201',
  '7f000000-0000-4000-8000-000000000202'
);
insert into public.personal_activities (id, user_id, name, sport, measurement_mode)
values
  (
    '7f000000-0000-4000-8000-0000000002a1',
    '7f000000-0000-4000-8000-000000000201',
    'Easy running', 'Running', 'duration_intensity'
  ),
  (
    '7f000000-0000-4000-8000-0000000002a2',
    '7f000000-0000-4000-8000-000000000202',
    'Outsider rowing', 'Rowing', 'duration_intensity'
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"7f000000-0000-4000-8000-000000000201","role":"authenticated"}', true);

-- Nothing is completed before it happens --------------------------------------

select throws_ok(
  format($$select * from public.apply_completion_change('create', null, null,
    jsonb_build_object('status', 'unplanned', 'actualLocalDate', %L,
      'activities', '[]'::jsonb))$$, pg_temp.owner_day(1)),
  'PT430', 'Training cannot be logged for a future date.',
  'unplanned training cannot be logged for tomorrow'
);
select is(
  (select count(*)::bigint from public.completions
   where user_id = '7f000000-0000-4000-8000-000000000201'),
  0::bigint,
  'and the refusal wrote nothing'
);

select lives_ok(
  format($$select * from public.apply_completion_change('create', null, null,
    jsonb_build_object('status', 'unplanned', 'actualLocalDate', %L,
      'activities', jsonb_build_array(jsonb_build_object(
        'position', 0, 'name', 'Tepmo run', 'sport', 'Running',
        'measurementMode', 'duration_intensity'))))$$, pg_temp.owner_day(0)),
  'today is not a future date'
);

insert into logged
select 'unplanned', completion.id, completion.revision, 'created'
from public.completions completion
where completion.user_id = '7f000000-0000-4000-8000-000000000201';

-- A typo in unplanned training can be corrected -------------------------------

select lives_ok(
  format($$select * from public.apply_completion_change('edit', %L, 0,
    jsonb_build_object('status', 'unplanned', 'actualLocalDate', %L,
      'activities', jsonb_build_array(jsonb_build_object(
        'position', 0, 'name', 'Tempo run', 'sport', 'Trail running',
        'measurementMode', 'duration_intensity'))))$$,
    (select completion_id from logged where label = 'unplanned'),
    pg_temp.owner_day(0)),
  'an unplanned completion states its activities again to correct them'
);
select is(
  (select array_agg(name || ' / ' || sport order by position)
   from public.completion_activities
   where completion_id = (select completion_id from logged where label = 'unplanned')),
  array['Tempo run / Trail running'],
  'the title and the sport are both corrected'
);
select is(
  (select count(*)::bigint from public.completion_activities
   where completion_id = (select completion_id from logged where label = 'unplanned')),
  1::bigint,
  'and the list is replaced rather than appended to'
);

select lives_ok(
  format($$select * from public.apply_completion_change('edit', %L, 1,
    jsonb_build_object('status', 'unplanned', 'actualLocalDate', %L,
      'durationMinutes', 32))$$,
    (select completion_id from logged where label = 'unplanned'),
    pg_temp.owner_day(0)),
  'an edit that names no activities is still a valid edit'
);
select is(
  (select array_agg(name order by position) from public.completion_activities
   where completion_id = (select completion_id from logged where label = 'unplanned')),
  array['Tempo run'],
  'and it leaves the activities exactly as they were'
);

select throws_ok(
  format($$select * from public.apply_completion_change('edit', %L, 2,
    jsonb_build_object('status', 'unplanned', 'actualLocalDate', %L,
      'activities', jsonb_build_array(jsonb_build_object(
        'position', 0, 'name', 'Borrowed', 'sport', 'Rowing',
        'measurementMode', 'duration_intensity',
        'personalActivityId', '7f000000-0000-4000-8000-0000000002a2'))))$$,
    (select completion_id from logged where label = 'unplanned'),
    pg_temp.owner_day(0)),
  '22023', 'Invalid completed activity.',
  'a corrected activity cannot point at another owner''s definition'
);
select is(
  (select array_agg(name order by position) from public.completion_activities
   where completion_id = (select completion_id from logged where label = 'unplanned')),
  array['Tempo run'],
  'and the refused correction left the activities alone'
);

select throws_ok(
  format($$select * from public.apply_completion_change('edit', %L, 2,
    jsonb_build_object('status', 'unplanned', 'actualLocalDate', %L))$$,
    (select completion_id from logged where label = 'unplanned'),
    pg_temp.owner_day(1)),
  'PT430', 'Training cannot be logged for a future date.',
  'an edit cannot move a completion into the future either'
);

-- A planned session: the snapshot is not editable, and one completion is enough

select lives_ok(
  format($$select * from public.apply_rolling_plan_change_set(%L, %L, 'm323', %s)$$,
    pg_temp.rev('7f000000-0000-4000-8000-000000000201'),
    '7f000000-0000-4000-8000-00000000e201',
    quote_literal(pg_temp.plan_session(
      '7f000000-0000-4000-8000-0000000002b1', pg_temp.owner_day(0), 'Aerobic run'
    )::text) || '::jsonb'),
  'a planned session exists to log against'
);

select throws_ok(
  format($$select * from public.apply_completion_change('create', null, null,
    jsonb_build_object('planSessionId', '7f000000-0000-4000-8000-0000000002b1',
      'status', 'completed', 'actualLocalDate', %L,
      'activities', '[]'::jsonb))$$, pg_temp.owner_day(1)),
  'PT430', 'Training cannot be logged for a future date.',
  'a planned session cannot be completed ahead of its day either'
);

select lives_ok(
  format($$select * from public.apply_completion_change('create', null, null,
    jsonb_build_object('planSessionId', '7f000000-0000-4000-8000-0000000002b1',
      'status', 'completed', 'actualLocalDate', %L,
      'activities', '[]'::jsonb))$$, pg_temp.owner_day(0)),
  'the planned session is logged on its own day'
);

insert into logged
select 'planned', completion.id, completion.revision, 'created'
from public.completions completion
where completion.user_id = '7f000000-0000-4000-8000-000000000201'
  and completion.plan_session_id = '7f000000-0000-4000-8000-0000000002b1';

select throws_ok(
  format($$select * from public.apply_completion_change('create', null, null,
    jsonb_build_object('planSessionId', '7f000000-0000-4000-8000-0000000002b1',
      'status', 'completed', 'actualLocalDate', %L,
      'activities', '[]'::jsonb))$$, pg_temp.owner_day(0)),
  'PT431', 'That session already has a completion.',
  'a second completion for the same session is refused with its own code'
);
select is(
  (select count(*)::bigint from public.completions
   where user_id = '7f000000-0000-4000-8000-000000000201'
     and plan_session_id = '7f000000-0000-4000-8000-0000000002b1'),
  1::bigint,
  'and the session still carries exactly one completion'
);

-- Inverted by A4bc: a planned completion's actuals may be restated. What it
-- was measured against is the snapshot, which a4bc's suite proves unmoved.
select lives_ok(
  format($$select * from public.apply_completion_change('edit', %L, 0,
    jsonb_build_object('status', 'completed', 'actualLocalDate', %L,
      'activities', jsonb_build_array(jsonb_build_object(
        'position', 0, 'name', 'Rewritten', 'sport', 'Running',
        'measurementMode', 'duration_intensity'))))$$,
    (select completion_id from logged where label = 'planned'),
    pg_temp.owner_day(0)),
  'a planned completion''s actuals may be restated'
);

-- The edit is judged in the completion's own zone -----------------------------

update public.profiles set timezone_name = 'Pacific/Kiritimati'
where user_id = '7f000000-0000-4000-8000-000000000201';

select is(
  (select timezone_name from public.completions
   where id = (select completion_id from logged where label = 'unplanned')),
  (select name from completion_zone),
  'the completion keeps the zone it was written in when the profile zone moves'
);
select throws_ok(
  format($$select * from public.apply_completion_change('edit', %L, 2,
    jsonb_build_object('status', 'unplanned', 'actualLocalDate', %L))$$,
    (select completion_id from logged where label = 'unplanned'),
    pg_temp.owner_day(1)),
  'PT430', 'Training cannot be logged for a future date.',
  'and tomorrow in that stored zone stays refused whatever zone the profile now names'
);

-- Nothing about the boundary moved --------------------------------------------

reset role;

select ok(
  has_function_privilege('authenticated',
    'public.apply_completion_change(text, uuid, bigint, jsonb)', 'EXECUTE')
  and not has_function_privilege('anon',
    'public.apply_completion_change(text, uuid, bigint, jsonb)', 'EXECUTE')
  and not has_function_privilege('public',
    'public.apply_completion_change(text, uuid, bigint, jsonb)', 'EXECUTE'),
  'the completion write is still reachable only by an authenticated owner'
);
select ok(
  not has_function_privilege('authenticated',
    'public.completion_input_is_valid(jsonb, text)', 'EXECUTE')
  and not has_function_privilege('anon',
    'public.completion_input_is_valid(jsonb, text)', 'EXECUTE'),
  'and the validator it calls is still reachable from no client role'
);
select ok(
  not has_table_privilege('authenticated', 'public.completion_activities', 'DELETE')
  and not has_table_privilege('authenticated', 'public.completion_activities', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.completion_activities', 'INSERT'),
  'correcting activities did not open direct writes on the table'
);

select * from finish();
rollback;
