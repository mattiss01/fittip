-- A log's feeling is removed for good (owner, 7 Oct 2026).
--
-- Three things are proved here.
--
-- First, that the column and its check are gone, and that nothing else about
-- the two replaced functions moved: who may call them, that they are security
-- definers with an empty search path, and that neither takes an owner.
--
-- Second, that `feeling` is no longer a key a log may carry. A create, an
-- edit and an inline replacement that name it are refused with 22023, which is
-- what a page left open from before the migration gets, and each of the same
-- three is accepted without it.
--
-- Third, that nobody but the owner reaches the write, exactly as before.
--
-- That a log and a plan change cannot cross is a matter of two sessions at
-- once, which a single transaction cannot stage; the harness
-- `supabase/tests/integration/snapshot_lock_concurrent_log_and_edit.mjs`
-- proves it.

begin;

create extension if not exists pgtap with schema extensions;

create temporary table feeling_zone as
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

grant select on feeling_zone to public;

create function pg_temp.owner_day(p_offset integer)
returns text
language sql
stable
as $$
  select (
    (timezone((select name from feeling_zone), clock_timestamp()))::date + p_offset
  )::text
$$;

create function pg_temp.plan_session(
  p_session_id uuid, p_position integer, p_title text
)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'operation', 'add',
    'sessionId', p_session_id,
    'session', jsonb_build_object(
      'localDate', pg_temp.owner_day(0),
      'position', p_position,
      'title', p_title,
      'sport', 'Running',
      'expectedDurationMinutes', 60,
      'activities', '[]'::jsonb
    )
  )
$$;

-- A completed log of one planned session, with whatever else is merged in.
create function pg_temp.completed(p_session_id uuid, p_extra jsonb)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'planSessionId', p_session_id,
    'status', 'completed',
    'actualLocalDate', pg_temp.owner_day(0),
    'durationMinutes', 46,
    'perceivedEffort', 6,
    'activities', '[]'::jsonb) || p_extra
$$;

create function pg_temp.replaced(p_session_id uuid, p_replacement_extra jsonb)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'planSessionId', p_session_id,
    'status', 'replaced',
    'actualLocalDate', pg_temp.owner_day(0),
    'activities', '[]'::jsonb,
    'replacement', jsonb_build_object(
      'title', 'Hill ride', 'sport', 'Cycling',
      'durationMinutes', 70, 'perceivedEffort', 6,
      'activities', '[]'::jsonb) || p_replacement_extra)
$$;

create temporary table logged (
  label text primary key,
  completion_id uuid,
  revision bigint,
  result text
);
grant all on logged to public;

select plan(17);

select is(
  (select count(*)::bigint from feeling_zone), 1::bigint,
  'a stored zone whose local time is mid-day is available at every UTC hour'
);

-- 1. The column is gone, and nothing else moved ---------------------------------

select hasnt_column('public', 'completions', 'feeling',
  'a completion no longer has a feeling');
select is(
  (select count(*)::bigint from pg_constraint
   where conrelid = 'public.completions'::regclass
     and conname = 'completions_feeling_check'),
  0::bigint,
  'and the check that bounded it went with it'
);
select has_column('public', 'completions', 'perceived_effort',
  'effort, which says the same, is still recorded');
select ok(
  has_function_privilege('authenticated',
    'public.apply_completion_change(text, uuid, bigint, jsonb)', 'EXECUTE')
  and not has_function_privilege('anon',
    'public.apply_completion_change(text, uuid, bigint, jsonb)', 'EXECUTE')
  and not has_function_privilege('service_role',
    'public.apply_completion_change(text, uuid, bigint, jsonb)', 'EXECUTE')
  and not has_function_privilege('authenticated',
    'public.completion_input_is_valid(jsonb, text)', 'EXECUTE')
  and not has_function_privilege('anon',
    'public.completion_input_is_valid(jsonb, text)', 'EXECUTE'),
  'only an authenticated owner may write a log, and nobody calls the validator directly'
);
select ok(
  (select prosecdef and proconfig @> array['search_path=""']
     and not pg_get_function_identity_arguments(oid) like '%user%'
   from pg_proc
   where oid = 'public.apply_completion_change(text, uuid, bigint, jsonb)'::regprocedure),
  'the write is still a security definer with an empty search path and no owner argument'
);

-- Owners ------------------------------------------------------------------------

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('7b000000-0000-4000-8000-000000000001', 'feeling-owner@example.test', '{}', '{}'),
  ('7b000000-0000-4000-8000-000000000002', 'feeling-outsider@example.test', '{}', '{}');
insert into public.profiles (user_id, timezone_name)
select id, (select name from feeling_zone) from auth.users
where id in (
  '7b000000-0000-4000-8000-000000000001',
  '7b000000-0000-4000-8000-000000000002'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"7b000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$select public.apply_rolling_plan_change_set(
    0, '7b000000-0000-4000-8000-00000000e001', 'owner_manual',
    jsonb_build_array(
      pg_temp.plan_session('7b000000-0000-4000-8000-0000000000b1', 0, 'Logged'),
      pg_temp.plan_session('7b000000-0000-4000-8000-0000000000b2', 1, 'Replaced'),
      pg_temp.plan_session('7b000000-0000-4000-8000-0000000000b3', 2, 'Outsider target')))$$,
  'the owner plans three sessions for today'
);

-- 2. A create ---------------------------------------------------------------------

select throws_ok(
  format($$select public.apply_completion_change('create', null, null, %L::jsonb)$$,
    pg_temp.completed('7b000000-0000-4000-8000-0000000000b1',
      jsonb_build_object('feeling', 'good'))),
  '22023', 'Invalid completion change.',
  'a new log naming a feeling is refused, as any unknown key is'
);
select throws_ok(
  format($$select public.apply_completion_change('create', null, null, %L::jsonb)$$,
    pg_temp.completed('7b000000-0000-4000-8000-0000000000b1',
      jsonb_build_object('feeling', null))),
  '22023', 'Invalid completion change.',
  'even a null one: the key itself is what is gone'
);

insert into logged
select 'first', * from public.apply_completion_change(
  'create', null, null,
  pg_temp.completed('7b000000-0000-4000-8000-0000000000b1', '{}'::jsonb));

select is((select result from logged where label = 'first'), 'created',
  'the same log without it is written');

-- 3. An edit ----------------------------------------------------------------------

select throws_ok(
  format($$select public.apply_completion_change('edit', %L, 0, %L::jsonb)$$,
    (select completion_id from logged where label = 'first'),
    jsonb_build_object(
      'status', 'completed', 'actualLocalDate', pg_temp.owner_day(0),
      'durationMinutes', 41, 'feeling', 'good')),
  '22023', 'Invalid completion change.',
  'a correction naming a feeling is refused'
);

insert into logged
select 'corrected', * from public.apply_completion_change(
  'edit', (select completion_id from logged where label = 'first'), 0,
  jsonb_build_object(
    'status', 'completed', 'actualLocalDate', pg_temp.owner_day(0),
    'durationMinutes', 41));

select is(
  (select jsonb_build_array(result, revision) from logged where label = 'corrected'),
  jsonb_build_array('updated', 1),
  'the same correction without it lands, and the refused one cost no revision'
);

-- 4. An inline replacement ----------------------------------------------------------

select throws_ok(
  format($$select public.apply_completion_change('create', null, null, %L::jsonb)$$,
    pg_temp.replaced('7b000000-0000-4000-8000-0000000000b2',
      jsonb_build_object('feeling', 'good'))),
  '22023', 'Invalid completion change.',
  'a replacement naming a feeling is refused'
);
select is(
  (select count(*)::bigint from public.completions
   where user_id = '7b000000-0000-4000-8000-000000000001'),
  1::bigint,
  'and neither of its two logs was written'
);

insert into logged
select 'replaced', * from public.apply_completion_change(
  'create', null, null,
  pg_temp.replaced('7b000000-0000-4000-8000-0000000000b2', '{}'::jsonb));

select is(
  (select count(*)::bigint from public.completions
   where user_id = '7b000000-0000-4000-8000-000000000001'),
  3::bigint,
  'the same replacement without it writes the planned log and what was done instead'
);

-- 5. Nobody else reaches the write ----------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"7b000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok(
  format($$select public.apply_completion_change('create', null, null, %L::jsonb)$$,
    pg_temp.completed('7b000000-0000-4000-8000-0000000000b3', '{}'::jsonb)),
  '22023', 'That planned session does not exist.',
  'another owner cannot log this owner session: for them it is not there'
);

select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok(
  format($$select public.apply_completion_change('create', null, null, %L::jsonb)$$,
    pg_temp.completed('7b000000-0000-4000-8000-0000000000b3', '{}'::jsonb)),
  '42501', 'An authenticated FitTip user is required.',
  'and a caller with no owner cannot log at all'
);

select * from finish();
rollback;
