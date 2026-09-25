-- A4d: a replaced session points at what replaced it.
--
-- What is proved here, and nowhere else:
--
-- First, that an inline replacement writes two logs or none. The unplanned
-- one is created by the same function under the same owner, so a refusal of
-- the planned half must take the unplanned half with it.
--
-- Second, that only this owner's unplanned training can be pointed at, that
-- one unplanned log may replace several sessions, and that correcting a log
-- away from `replaced` leaves it pointing nowhere.
--
-- Third, that the pointer refuses a lone delete of what it points at while
-- still letting an account be removed whole.
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

create function pg_temp.session(p_id uuid, p_position integer, p_title text)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'operation', 'add',
    'sessionId', p_id,
    'session', jsonb_build_object(
      'localDate', pg_temp.owner_day(0), 'position', p_position,
      'title', p_title, 'sport', 'Running', 'isLocked', false,
      'activities', '[]'::jsonb))
$$;

create temporary table logged (label text primary key, completion_id uuid);
grant all on logged to public;

select plan(21);

-- Owners ----------------------------------------------------------------------

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('7f000000-0000-4000-8000-000000000501', 'a4d-owner@example.test', '{}', '{}'),
  ('7f000000-0000-4000-8000-000000000502', 'a4d-outsider@example.test', '{}', '{}');
insert into public.profiles (user_id, timezone_name)
select id, (select name from completion_zone) from auth.users
where id in (
  '7f000000-0000-4000-8000-000000000501',
  '7f000000-0000-4000-8000-000000000502'
);

select has_column('public', 'completions', 'replaced_by_completion_id',
  'a replaced log can point at what replaced it');
select col_is_fk('public', 'completions',
  array['replaced_by_completion_id', 'user_id'],
  'and only at a log of the same owner');

-- The outsider has unplanned training of their own ----------------------------

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"7f000000-0000-4000-8000-000000000502","role":"authenticated"}', true);
select lives_ok(
  format($$select * from public.apply_completion_change('create', null, null,
    jsonb_build_object('status', 'unplanned', 'actualLocalDate', %L,
      'title', 'Outsider row', 'sport', 'Rowing', 'activities', '[]'::jsonb))$$,
    pg_temp.owner_day(0)),
  'another owner logs unplanned training'
);
reset role;
insert into logged
select 'outsider', id from public.completions
where user_id = '7f000000-0000-4000-8000-000000000502';

-- The owner's plan: three sessions today --------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"7f000000-0000-4000-8000-000000000501","role":"authenticated"}', true);

select lives_ok(
  format($$select * from public.apply_rolling_plan_change_set(%L, %L, 'a4d', %s)$$,
    pg_temp.rev('7f000000-0000-4000-8000-000000000501'),
    '7f000000-0000-4000-8000-00000000e501',
    quote_literal(jsonb_build_array(
      pg_temp.session('7f000000-0000-4000-8000-0000000005b1', 0, 'Tempo run'),
      pg_temp.session('7f000000-0000-4000-8000-0000000005b2', 1, 'Easy run'),
      pg_temp.session('7f000000-0000-4000-8000-0000000005b3', 2, 'Strides')
    )::text) || '::jsonb'),
  'three planned sessions exist to replace'
);

-- Inline: two logs or none ----------------------------------------------------

select throws_ok(
  format($$select * from public.apply_completion_change('create', null, null,
    jsonb_build_object('planSessionId', '7f000000-0000-4000-8000-0000000005b1',
      'status', 'replaced', 'actualLocalDate', %L, 'activities', '[]'::jsonb,
      'replacement', jsonb_build_object('title', 'Hill ride', 'sport', 'Cycling',
        'durationMinutes', 70, 'activities', '[]'::jsonb),
      'perceivedEffort', 11))$$, pg_temp.owner_day(0)),
  '22023', 'Invalid completion change.',
  'a replacement whose planned half is invalid is refused'
);
select is(
  (select count(*)::bigint from public.completions
   where user_id = '7f000000-0000-4000-8000-000000000501'),
  0::bigint,
  'and the unplanned half was not written either'
);

select throws_ok(
  format($$select * from public.apply_completion_change('create', null, null,
    jsonb_build_object('planSessionId', '7f000000-0000-4000-8000-0000000005b1',
      'status', 'replaced', 'actualLocalDate', %L, 'activities', '[]'::jsonb,
      'replacement', jsonb_build_object('title', 'Hill ride', 'sport', 'Cycling',
        'perceivedEffort', 11, 'activities', '[]'::jsonb)))$$,
    pg_temp.owner_day(0)),
  '22023', 'Invalid completion change.',
  'a replacement that is not valid unplanned training is refused'
);
select is(
  (select count(*)::bigint from public.completions
   where user_id = '7f000000-0000-4000-8000-000000000501'),
  0::bigint,
  'and the planned half was not written either'
);

select lives_ok(
  format($$select * from public.apply_completion_change('create', null, null,
    jsonb_build_object('planSessionId', '7f000000-0000-4000-8000-0000000005b1',
      'status', 'replaced', 'actualLocalDate', %L, 'activities', '[]'::jsonb,
      'note', 'Legs were heavy.',
      'replacement', jsonb_build_object('title', 'Hill ride', 'sport', 'Cycling',
        'durationMinutes', 70, 'perceivedEffort', 6, 'feeling', 'good',
        'activities', jsonb_build_array(jsonb_build_object('position', 0,
          'name', 'Climbs', 'sport', 'Cycling',
          'measurementMode', 'unmeasured')))))$$,
    pg_temp.owner_day(0)),
  'a planned session is replaced by training logged in the same save'
);

reset role;
insert into logged
select 'replaced', id from public.completions
where plan_session_id = '7f000000-0000-4000-8000-0000000005b1';
insert into logged
select 'ride', id from public.completions
where user_id = '7f000000-0000-4000-8000-000000000501' and plan_session_id is null;
set local role authenticated;

select is(
  (select replaced_by_completion_id from public.completions
   where id = (select completion_id from logged where label = 'replaced')),
  (select completion_id from logged where label = 'ride'),
  'the replaced log points at the unplanned log written with it'
);
select is(
  (select title || ' / ' || sport || ' / ' || duration_minutes || ' / '
     || (select count(*) from public.completion_activities a
         where a.completion_id = c.id)
   from public.completions c
   where id = (select completion_id from logged where label = 'ride')),
  'Hill ride / Cycling / 70 / 1',
  'and that log holds what was done, activities included'
);
select is(
  (select coalesce(duration_minutes::text, '-') || ' / ' || note
   from public.completions
   where id = (select completion_id from logged where label = 'replaced')),
  '- / Legs were heavy.',
  'the planned log keeps its note and no numbers of its own'
);

-- Pointing at one already logged ----------------------------------------------

select lives_ok(
  format($$select * from public.apply_completion_change('create', null, null,
    jsonb_build_object('planSessionId', '7f000000-0000-4000-8000-0000000005b2',
      'status', 'replaced', 'actualLocalDate', %L, 'activities', '[]'::jsonb,
      'replacedByCompletionId', %L))$$,
    pg_temp.owner_day(0), (select completion_id from logged where label = 'ride')),
  'a second session is replaced by the same unplanned log'
);
select is(
  (select count(*)::bigint from public.completions
   where replaced_by_completion_id = (select completion_id from logged where label = 'ride')),
  2::bigint,
  'one unplanned log may replace several planned sessions'
);

select throws_ok(
  format($$select * from public.apply_completion_change('create', null, null,
    jsonb_build_object('planSessionId', '7f000000-0000-4000-8000-0000000005b3',
      'status', 'replaced', 'actualLocalDate', %L, 'activities', '[]'::jsonb,
      'replacedByCompletionId', %L))$$,
    pg_temp.owner_day(0), (select completion_id from logged where label = 'outsider')),
  '22023', 'Invalid completion change.',
  'another owner''s training cannot be pointed at'
);
select throws_ok(
  format($$select * from public.apply_completion_change('create', null, null,
    jsonb_build_object('planSessionId', '7f000000-0000-4000-8000-0000000005b3',
      'status', 'replaced', 'actualLocalDate', %L, 'activities', '[]'::jsonb,
      'replacedByCompletionId', %L))$$,
    pg_temp.owner_day(0), (select completion_id from logged where label = 'replaced')),
  '22023', 'Invalid completion change.',
  'a planned log cannot stand for what was done instead'
);
select throws_ok(
  format($$select * from public.apply_completion_change('create', null, null,
    jsonb_build_object('planSessionId', '7f000000-0000-4000-8000-0000000005b3',
      'status', 'skipped', 'actualLocalDate', %L, 'activities', '[]'::jsonb,
      'replacedByCompletionId', %L))$$,
    pg_temp.owner_day(0), (select completion_id from logged where label = 'ride')),
  '22023', 'Invalid completion change.',
  'only a replaced log points anywhere'
);

-- Correcting away from replaced -----------------------------------------------

select lives_ok(
  format($$select * from public.apply_completion_change('edit', %L, 0,
    jsonb_build_object('status', 'completed', 'actualLocalDate', %L,
      'activities', '[]'::jsonb))$$,
    (select completion_id from logged where label = 'replaced'),
    pg_temp.owner_day(0)),
  'a replaced log is corrected to completed'
);
select is(
  (select replaced_by_completion_id from public.completions
   where id = (select completion_id from logged where label = 'replaced')),
  null::uuid,
  'and it no longer points anywhere, while the ride it pointed at remains'
);

-- Deletion --------------------------------------------------------------------

reset role;

select throws_ok(
  $$delete from public.completions
    where id = (select completion_id from logged where label = 'ride')$$,
  '23503', null,
  'a linked log cannot be deleted on its own, whoever tries'
);
select lives_ok(
  $$delete from public.profiles
    where user_id = '7f000000-0000-4000-8000-000000000501'$$,
  'but an account is still removed whole, links and all'
);

select * from finish();
rollback;
