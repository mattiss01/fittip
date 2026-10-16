-- Delete a log (ADR-031; owner, 7 and 16 Oct 2026).
--
-- Proved here: only an authenticated owner reaches the delete, and only
-- through `apply_completion_change`; it answers to the revision read, and a
-- stale, missing or other owner's log gets the same PT409 and is untouched; a
-- deleted log takes its activities with it and frees its planned session;
-- deleting unplanned training deletes the planned logs "Replaced" by it and
-- nothing else; deleting a Replaced log alone leaves what it pointed at.
--
-- Dates follow the wall clock for the reason M3-19's suite gives.

begin;

create extension if not exists pgtap with schema extensions;

create temporary table deleted_zone as
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

grant select on deleted_zone to public;

create function pg_temp.owner_day(p_offset integer)
returns text
language sql
stable
as $$
  select (
    (timezone((select name from deleted_zone), clock_timestamp()))::date + p_offset
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
      'activities', '[]'::jsonb
    )
  )
$$;

-- Counts read past RLS, so "gone" means gone and not merely invisible.
create function pg_temp.exists_log(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.completions where id = p_id)
$$;

create function pg_temp.activities_of(p_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) from public.completion_activities where completion_id = p_id
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

grant all on change_receipt, logged to public;

create function pg_temp.log_id(p_label text)
returns uuid
language sql
stable
as $$ select completion_id from logged where label = p_label $$;

select plan(21);

select is(
  (select count(*)::bigint from deleted_zone), 1::bigint,
  'a stored zone whose local time is mid-day is available at every UTC hour'
);

-- Nothing structural moved ----------------------------------------------------

select ok(
  has_function_privilege('authenticated',
    'public.apply_completion_change(text, uuid, bigint, jsonb)', 'EXECUTE')
  and not has_function_privilege('anon',
    'public.apply_completion_change(text, uuid, bigint, jsonb)', 'EXECUTE')
  and not has_function_privilege('service_role',
    'public.apply_completion_change(text, uuid, bigint, jsonb)', 'EXECUTE'),
  'only an authenticated owner may call apply_completion_change'
);
select ok(
  (select prosecdef and proconfig @> array['search_path=""']
   from pg_proc
   where oid = 'public.apply_completion_change(text, uuid, bigint, jsonb)'::regprocedure),
  'it is still a security definer with an empty search path'
);
select ok(
  not has_table_privilege('authenticated', 'public.completions', 'DELETE')
  and not has_table_privilege('authenticated', 'public.completion_activities', 'DELETE')
  and not has_table_privilege('anon', 'public.completions', 'DELETE'),
  'nobody may delete a log directly: the function is the only path'
);

-- Owners and logs -------------------------------------------------------------

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('7d000000-0000-4000-8000-000000000001', 'delete-owner@example.test', '{}', '{}'),
  ('7d000000-0000-4000-8000-000000000002', 'delete-outsider@example.test', '{}', '{}');
insert into public.profiles (user_id, timezone_name)
select id, (select name from deleted_zone) from auth.users
where id in (
  '7d000000-0000-4000-8000-000000000001',
  '7d000000-0000-4000-8000-000000000002'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"7d000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

insert into logged
select 'outsider', * from public.apply_completion_change(
  'create', null, null,
  jsonb_build_object('status', 'unplanned', 'actualLocalDate', pg_temp.owner_day(0),
    'title', 'Not yours', 'sport', 'Rowing', 'activities', '[]'::jsonb));

select set_config(
  'request.jwt.claims',
  '{"sub":"7d000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- d1 is completed; d2 and d3 were replaced by one ride; d4 by a swim.
insert into change_receipt
select 'seed', * from public.apply_rolling_plan_change_set(
  0, '7d000000-0000-4000-8000-00000000e001', 'owner_manual',
  jsonb_build_array(
    pg_temp.plan_session('7d000000-0000-4000-8000-0000000000d1', pg_temp.owner_day(0), 0, 'Completed'),
    pg_temp.plan_session('7d000000-0000-4000-8000-0000000000d2', pg_temp.owner_day(0), 1, 'Replaced once'),
    pg_temp.plan_session('7d000000-0000-4000-8000-0000000000d3', pg_temp.owner_day(0), 2, 'Replaced twice'),
    pg_temp.plan_session('7d000000-0000-4000-8000-0000000000d4', pg_temp.owner_day(0), 3, 'Replaced by a swim')));

insert into logged
select 'completed', * from public.apply_completion_change(
  'create', null, null,
  jsonb_build_object(
    'planSessionId', '7d000000-0000-4000-8000-0000000000d1',
    'status', 'completed',
    'actualLocalDate', pg_temp.owner_day(0),
    'durationMinutes', 46,
    'activities', jsonb_build_array(jsonb_build_object('position', 0,
      'name', 'Strides', 'sport', 'Running', 'measurementMode', 'unmeasured'))));

insert into logged
select 'replaced-d2', * from public.apply_completion_change(
  'create', null, null,
  jsonb_build_object(
    'planSessionId', '7d000000-0000-4000-8000-0000000000d2',
    'status', 'replaced',
    'actualLocalDate', pg_temp.owner_day(0),
    'activities', '[]'::jsonb,
    'replacement', jsonb_build_object('title', 'Hill ride', 'sport', 'Cycling',
      'durationMinutes', 70,
      'activities', jsonb_build_array(jsonb_build_object('position', 0,
        'name', 'Climbs', 'sport', 'Cycling', 'measurementMode', 'unmeasured')))));

reset role;
insert into logged (label, completion_id, revision)
select 'ride', id, revision from public.completions
where user_id = '7d000000-0000-4000-8000-000000000001'
  and plan_session_id is null and title = 'Hill ride';
set local role authenticated;

insert into logged
select 'replaced-d3', * from public.apply_completion_change(
  'create', null, null,
  jsonb_build_object(
    'planSessionId', '7d000000-0000-4000-8000-0000000000d3',
    'status', 'replaced',
    'actualLocalDate', pg_temp.owner_day(0),
    'activities', '[]'::jsonb,
    'replacedByCompletionId', pg_temp.log_id('ride')));

insert into logged
select 'replaced-d4', * from public.apply_completion_change(
  'create', null, null,
  jsonb_build_object(
    'planSessionId', '7d000000-0000-4000-8000-0000000000d4',
    'status', 'replaced',
    'actualLocalDate', pg_temp.owner_day(0),
    'activities', '[]'::jsonb,
    'replacement', jsonb_build_object('title', 'Sunrise swim', 'sport', 'Swimming',
      'durationMinutes', 30, 'activities', '[]'::jsonb)));

reset role;
insert into logged (label, completion_id, revision)
select 'swim', id, revision from public.completions
where user_id = '7d000000-0000-4000-8000-000000000001'
  and plan_session_id is null and title = 'Sunrise swim';
set local role authenticated;

-- Refused, and nothing changes ------------------------------------------------

select throws_ok(
  format($$select * from public.apply_completion_change('delete', %L, %s,
    jsonb_build_object('status', 'completed'))$$,
    pg_temp.log_id('completed'),
    (select revision from logged where label = 'completed')),
  '22023', 'Invalid completion change.',
  'a delete carries no content'
);
select throws_ok(
  $$select * from public.apply_completion_change('delete', null, null, null)$$,
  '22023', 'Invalid completion change.',
  'a delete names a log and the revision read'
);
select throws_ok(
  format($$select * from public.apply_completion_change('delete', %L, %s, null)$$,
    pg_temp.log_id('completed'),
    (select revision from logged where label = 'completed') + 1),
  'PT409', 'That completion changed. Reload and try again.',
  'a delete answers to the revision read'
);
select throws_ok(
  format($$select * from public.apply_completion_change('delete', %L, %s, null)$$,
    pg_temp.log_id('outsider'),
    (select revision from logged where label = 'outsider')),
  'PT409', 'That completion changed. Reload and try again.',
  'another owner''s log is answered as one that changed'
);
select ok(
  pg_temp.exists_log(pg_temp.log_id('completed'))
  and pg_temp.exists_log(pg_temp.log_id('outsider')),
  'and every refused delete left its log in place'
);

-- A planned log ---------------------------------------------------------------

select is(
  (select result from public.apply_completion_change('delete',
    pg_temp.log_id('completed'),
    (select revision from logged where label = 'completed'), null)),
  'deleted',
  'the owner deletes a planned log at the revision read'
);
select ok(
  not pg_temp.exists_log(pg_temp.log_id('completed'))
  and pg_temp.activities_of(pg_temp.log_id('completed')) = 0,
  'the log is gone, and its activities with it'
);
select lives_ok(
  format($$select * from public.apply_rolling_plan_change_set(%s,
    '7d000000-0000-4000-8000-00000000e002', 'owner_manual',
    jsonb_build_array(jsonb_build_object('operation', 'edit',
      'sessionId', '7d000000-0000-4000-8000-0000000000d1',
      'session', jsonb_build_object('title', 'Free again', 'sport', 'Running',
        'expectedDurationMinutes', 30, 'activities', '[]'::jsonb))))$$,
    pg_temp.rev('7d000000-0000-4000-8000-000000000001')),
  'its session is no longer settled and can be edited'
);
select throws_ok(
  format($$select * from public.apply_completion_change('delete', %L, %s, null)$$,
    pg_temp.log_id('completed'),
    (select revision from logged where label = 'completed')),
  'PT409', 'That completion changed. Reload and try again.',
  'a log already deleted is answered as one that changed'
);

-- A Replaced log alone --------------------------------------------------------

select is(
  (select result from public.apply_completion_change('delete',
    pg_temp.log_id('replaced-d4'),
    (select revision from logged where label = 'replaced-d4'), null)),
  'deleted',
  'a planned log marked Replaced can be deleted on its own'
);
select ok(
  not pg_temp.exists_log(pg_temp.log_id('replaced-d4'))
  and pg_temp.exists_log(pg_temp.log_id('swim')),
  'and the training done instead stays'
);

-- Training that replaced sessions ---------------------------------------------

select is(
  (select result from public.apply_completion_change('delete',
    pg_temp.log_id('ride'),
    (select revision from logged where label = 'ride'), null)),
  'deleted',
  'the owner deletes unplanned training that replaced two sessions'
);
select ok(
  not pg_temp.exists_log(pg_temp.log_id('ride'))
  and pg_temp.activities_of(pg_temp.log_id('ride')) = 0,
  'the training is gone, with its activities'
);
select ok(
  not pg_temp.exists_log(pg_temp.log_id('replaced-d2'))
  and not pg_temp.exists_log(pg_temp.log_id('replaced-d3')),
  'and both Replaced logs that pointed at it went with it'
);
select ok(
  pg_temp.exists_log(pg_temp.log_id('swim'))
  and pg_temp.exists_log(pg_temp.log_id('outsider')),
  'no other log was touched'
);

-- Outsiders -------------------------------------------------------------------

reset role;
set local role anon;
select throws_ok(
  format($$select * from public.apply_completion_change('delete', %L, %s, null)$$,
    pg_temp.log_id('swim'),
    (select revision from logged where label = 'swim')),
  '42501', null,
  'an anonymous caller cannot reach the delete'
);

reset role;
select ok(
  pg_temp.exists_log(pg_temp.log_id('swim')),
  'and the log it named is still there'
);

select * from finish();
rollback;
