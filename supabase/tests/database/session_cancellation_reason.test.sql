-- Why a session was cancelled (owner, 29 Sep 2026).
--
-- The reason is the owner's own words, one optional text (no quick picks).
-- It is proved as stored-only data: its own owner-select-only table,
-- written by a cancel that names it and by one setter, cleared by reactivate
-- and by deleting the session, and absent from `rolling_plan_session_state`,
-- which is what completions' planned snapshots and change history copy.
--
-- Dates follow the wall clock for the reason every rolling-plan suite gives:
-- the past boundary is owner-local today, so a literal would stop testing it.

begin;

create extension if not exists pgtap with schema extensions;

create temporary table reason_zone as
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

grant select on reason_zone to public;

create function pg_temp.owner_day(p_offset integer)
returns text
language sql
stable
as $$
  select (
    (timezone((select name from reason_zone), clock_timestamp()))::date + p_offset
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

create function pg_temp.new_session(
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
      'activities', '[]'::jsonb
    )
  )
$$;

-- What the owner's own read of the table returns, under RLS.
create function pg_temp.reason_of(p_session_id uuid)
returns text
language sql
stable
as $$
  select reason from public.rolling_plan_session_cancellations
  where session_id = p_session_id
$$;

create function pg_temp.has_reason(p_session_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.rolling_plan_session_cancellations
    where session_id = p_session_id
  )
$$;

create temporary table snapshot (label text primary key, value jsonb);
grant all on snapshot to public;

select plan(33);

select is(
  (select count(*)::bigint from reason_zone), 1::bigint,
  'a stored zone whose local time is mid-day is available at every UTC hour'
);

-- Structure -------------------------------------------------------------------

select has_table('public', 'rolling_plan_session_cancellations', 'the reason has its own table');
select columns_are(
  'public', 'rolling_plan_session_cancellations',
  array['session_id', 'user_id', 'reason', 'created_at', 'updated_at'],
  'it holds the owner''s words and nothing about the session itself'
);
select col_is_pk('public', 'rolling_plan_session_cancellations', 'session_id',
  'one reason per session');
select fk_ok(
  'public', 'rolling_plan_session_cancellations', array['session_id', 'user_id'],
  'public', 'rolling_plan_sessions', array['id', 'user_id'],
  'a reason belongs to its owner''s session'
);
select ok(
  (select relrowsecurity from pg_class
   where oid = 'public.rolling_plan_session_cancellations'::regclass),
  'row level security is on'
);
select policies_are(
  'public', 'rolling_plan_session_cancellations',
  array['rolling_plan_session_cancellations_owner_select'],
  'the only policy is the owner''s select'
);
select ok(
  has_table_privilege('authenticated', 'public.rolling_plan_session_cancellations', 'SELECT')
  and not has_table_privilege('authenticated', 'public.rolling_plan_session_cancellations', 'INSERT')
  and not has_table_privilege('authenticated', 'public.rolling_plan_session_cancellations', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.rolling_plan_session_cancellations', 'DELETE'),
  'an owner reads the table and never writes it directly'
);
select ok(
  not has_table_privilege('anon', 'public.rolling_plan_session_cancellations', 'SELECT'),
  'an anonymous caller cannot read it'
);
select ok(
  has_function_privilege('authenticated',
    'public.set_session_cancellation_reason(uuid, text)', 'EXECUTE')
  and not has_function_privilege('anon',
    'public.set_session_cancellation_reason(uuid, text)', 'EXECUTE'),
  'the setter is granted to authenticated alone'
);
select ok(
  not has_function_privilege('authenticated',
    'public.rolling_plan_cancellation_reason_is_valid(jsonb)', 'EXECUTE'),
  'the validator is not callable on its own'
);

-- Owners ----------------------------------------------------------------------

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('7c500000-0000-4000-8000-000000000001', 'reason-owner@example.test', '{}', '{}'),
  ('7c500000-0000-4000-8000-000000000002', 'reason-outsider@example.test', '{}', '{}');
insert into public.profiles (user_id, timezone_name)
select id, (select name from reason_zone) from auth.users
where id in (
  '7c500000-0000-4000-8000-000000000001',
  '7c500000-0000-4000-8000-000000000002'
);

set local role authenticated;

select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok(
  $$select public.set_session_cancellation_reason(
    '7c500000-0000-4000-8000-0000000000a1', 'tired')$$,
  '42501', 'An authenticated FitTip user is required.',
  'an anonymous caller cannot set a reason'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"7c500000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select public.apply_rolling_plan_change_set(
  pg_temp.rev('7c500000-0000-4000-8000-000000000001'),
  '7c500000-0000-4000-8000-00000000e001', 'owner_manual',
  jsonb_build_array(
    pg_temp.new_session('7c500000-0000-4000-8000-0000000000a1', pg_temp.owner_day(1), 0, 'Tempo'),
    pg_temp.new_session('7c500000-0000-4000-8000-0000000000a2', pg_temp.owner_day(1), 1, 'Easy'),
    pg_temp.new_session('7c500000-0000-4000-8000-0000000000a3', pg_temp.owner_day(2), 0, 'Long')));

-- 1. A cancel may say why, and a cancel that does not is unchanged ------------

select public.apply_rolling_plan_change_set(
  pg_temp.rev('7c500000-0000-4000-8000-000000000001'),
  '7c500000-0000-4000-8000-00000000e002', 'owner_manual',
  jsonb_build_array(
    jsonb_build_object('operation', 'cancel',
      'sessionId', '7c500000-0000-4000-8000-0000000000a1',
      'reason', '  work ran late  '),
    jsonb_build_object('operation', 'cancel',
      'sessionId', '7c500000-0000-4000-8000-0000000000a2')));

select is(
  pg_temp.reason_of('7c500000-0000-4000-8000-0000000000a1'),
  'work ran late',
  'a cancel that says why stores it, trimmed'
);
select ok(
  not pg_temp.has_reason('7c500000-0000-4000-8000-0000000000a2'),
  'a cancel that says nothing stores nothing'
);

select throws_ok(
  format($$select public.apply_rolling_plan_change_set(%s,
    '7c500000-0000-4000-8000-00000000e0f1', 'owner_manual',
    '[{"operation":"cancel","sessionId":"7c500000-0000-4000-8000-0000000000a3","reason":"   "}]'::jsonb)$$,
    pg_temp.rev('7c500000-0000-4000-8000-000000000001')),
  '22023', 'Invalid rolling plan cancellation.',
  'a blank reason is refused rather than stored'
);
select throws_ok(
  format($$select public.apply_rolling_plan_change_set(%s,
    '7c500000-0000-4000-8000-00000000e0f4', 'owner_manual',
    jsonb_build_array(jsonb_build_object('operation', 'cancel',
      'sessionId', '7c500000-0000-4000-8000-0000000000a3',
      'reason', E'\t\n')))$$,
    pg_temp.rev('7c500000-0000-4000-8000-000000000001')),
  '22023', 'Invalid rolling plan cancellation.',
  'tabs and line breaks alone are blank too'
);
select throws_ok(
  format($$select public.apply_rolling_plan_change_set(%s,
    '7c500000-0000-4000-8000-00000000e0f2', 'owner_manual',
    jsonb_build_array(jsonb_build_object('operation', 'cancel',
      'sessionId', '7c500000-0000-4000-8000-0000000000a3',
      'reason', repeat('x', 501))))$$,
    pg_temp.rev('7c500000-0000-4000-8000-000000000001')),
  '22023', 'Invalid rolling plan cancellation.',
  'a reason over 500 characters is refused'
);
select throws_ok(
  format($$select public.apply_rolling_plan_change_set(%s,
    '7c500000-0000-4000-8000-00000000e0f3', 'owner_manual',
    '[{"operation":"cancel","sessionId":"7c500000-0000-4000-8000-0000000000a3","note":"tired"}]'::jsonb)$$,
    pg_temp.rev('7c500000-0000-4000-8000-000000000001')),
  '22023', 'Invalid rolling plan cancellation.',
  'a cancel still refuses any key it does not know'
);

-- 2. The setter edits and clears, and never moves the plan -------------------

insert into snapshot
select 'revision-before', to_jsonb(pg_temp.rev('7c500000-0000-4000-8000-000000000001'));

select public.set_session_cancellation_reason(
  '7c500000-0000-4000-8000-0000000000a2', 'felt ill');
select is(
  pg_temp.reason_of('7c500000-0000-4000-8000-0000000000a2'),
  'felt ill',
  'a reason can be added to a session cancelled without one'
);

select public.set_session_cancellation_reason(
  '7c500000-0000-4000-8000-0000000000a1', 'meeting ran over');
select is(
  pg_temp.reason_of('7c500000-0000-4000-8000-0000000000a1'),
  'meeting ran over',
  'a reason can be replaced'
);

select public.set_session_cancellation_reason(
  '7c500000-0000-4000-8000-0000000000a1', '   ');
select ok(
  not pg_temp.has_reason('7c500000-0000-4000-8000-0000000000a1'),
  'a blank reason clears it rather than keeping an empty row'
);

select public.set_session_cancellation_reason(
  '7c500000-0000-4000-8000-0000000000a2', E'\t');
select is(
  pg_temp.reason_of('7c500000-0000-4000-8000-0000000000a2'),
  null,
  'a tab alone clears it as well, rather than being stored'
);
select public.set_session_cancellation_reason(
  '7c500000-0000-4000-8000-0000000000a2', 'felt ill');

select is(
  pg_temp.rev('7c500000-0000-4000-8000-000000000001'),
  (select value::bigint from snapshot where label = 'revision-before'),
  'setting a reason annotates the plan without changing its revision'
);

select throws_ok(
  $$select public.set_session_cancellation_reason(
    '7c500000-0000-4000-8000-0000000000a3', 'tired')$$,
  '22023', 'Invalid cancellation reason.',
  'an active session cannot be given a reason'
);
select throws_ok(
  $$select public.set_session_cancellation_reason(
    '7c500000-0000-4000-8000-0000000000a2', repeat('x', 501))$$,
  '22023', 'Invalid cancellation reason.',
  'the setter refuses a reason over 500 characters'
);
select throws_ok(
  $$insert into public.rolling_plan_session_cancellations (session_id, user_id, reason)
    values ('7c500000-0000-4000-8000-0000000000a2',
            '7c500000-0000-4000-8000-000000000001', 'tired')$$,
  '42501', null,
  'an owner cannot write the table directly'
);

-- 3. Another owner can neither read nor write it -----------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"7c500000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select is(
  (select count(*)::bigint from public.rolling_plan_session_cancellations),
  0::bigint,
  'another owner reads none of it'
);
select throws_ok(
  $$select public.set_session_cancellation_reason(
    '7c500000-0000-4000-8000-0000000000a2', 'tired')$$,
  '22023', 'Invalid cancellation reason.',
  'another owner cannot set a reason on this owner''s session'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"7c500000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(
  pg_temp.reason_of('7c500000-0000-4000-8000-0000000000a2'),
  'felt ill',
  'the outsider''s attempt changed nothing'
);

-- 4. Reactivate clears it; deleting the session takes it along ---------------

select public.apply_rolling_plan_change_set(
  pg_temp.rev('7c500000-0000-4000-8000-000000000001'),
  '7c500000-0000-4000-8000-00000000e003', 'owner_manual',
  '[{"operation":"reactivate","sessionId":"7c500000-0000-4000-8000-0000000000a2"}]'::jsonb);
select ok(
  not pg_temp.has_reason('7c500000-0000-4000-8000-0000000000a2'),
  'a reactivated session keeps no reason'
);

select public.apply_rolling_plan_change_set(
  pg_temp.rev('7c500000-0000-4000-8000-000000000001'),
  '7c500000-0000-4000-8000-00000000e004', 'owner_manual',
  '[{"operation":"cancel","sessionId":"7c500000-0000-4000-8000-0000000000a3","reason":"storm"}]'::jsonb);
select public.apply_rolling_plan_change_set(
  pg_temp.rev('7c500000-0000-4000-8000-000000000001'),
  '7c500000-0000-4000-8000-00000000e005', 'owner_manual',
  '[{"operation":"delete","sessionId":"7c500000-0000-4000-8000-0000000000a3"}]'::jsonb);
select ok(
  not pg_temp.has_reason('7c500000-0000-4000-8000-0000000000a3'),
  'deleting a cancelled session deletes its reason with it'
);

-- 5. It never enters what history copies -------------------------------------

select public.apply_rolling_plan_change_set(
  pg_temp.rev('7c500000-0000-4000-8000-000000000001'),
  '7c500000-0000-4000-8000-00000000e006', 'owner_manual',
  '[{"operation":"cancel","sessionId":"7c500000-0000-4000-8000-0000000000a2","reason":"left knee sore"}]'::jsonb);

reset role;

select ok(
  not (public.rolling_plan_session_state(
    '7c500000-0000-4000-8000-000000000001',
    '7c500000-0000-4000-8000-0000000000a2')::text ~ 'left knee'),
  'the session state that snapshots copy carries no reason'
);
select ok(
  not exists (
    select 1 from public.rolling_plan_change_entries entry
    where entry.user_id = '7c500000-0000-4000-8000-000000000001'
      and (coalesce(entry.before_state::text, '') || coalesce(entry.after_state::text, ''))
        ~ '(left knee|work ran late|meeting ran over|felt ill|storm)'
  ),
  'no change history entry carries a reason'
);
select * from finish();

rollback;
