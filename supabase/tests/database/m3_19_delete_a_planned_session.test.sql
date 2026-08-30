-- M3-19: an owner deletes one planned session outright.
--
-- Four things are proved here that nothing else proves.
--
-- First, that delete and cancel are now genuinely distinct verbs over the same
-- session: cancel keeps the row, delete removes it, and the audit entry a
-- delete leaves behind outlives the row it describes because it names a date
-- and no session.
--
-- Second, that the two rules bounding the new verb are the database's, not a
-- surface's. A session carrying a completion is refused with PT425 before the
-- restricting foreign key can fire, so no raw violation ever reaches a client.
-- A lock does not refuse it, because a lock stops a sweep rather than the
-- owner's own deliberate individual act.
--
-- Third, that cancel is no longer the fallthrough of the session-operation
-- chain. An unrecognized operation string now lands nowhere instead of landing
-- in whichever branch happens to be written last - which, since M3-19, is a
-- branch that destroys a row.
--
-- Fourth, that no caller who is not the owner can reach the new operation.
-- That is asserted against the privileged function itself rather than against
-- RLS on the table, because `apply_rolling_plan_change_set` is a security
-- definer and RLS is not what confines it.
--
-- Dates follow the wall clock for the same reason M3-12's, M3-14's and
-- M3-15A's suites do: the past boundary is defined against owner-local today,
-- so a fixed literal would stop testing the rule. The owner's stored zone is
-- one whose local time is currently mid-day, so a suite that runs in about a
-- second cannot straddle an owner-local midnight whatever UTC hour it starts.

begin;

create extension if not exists pgtap with schema extensions;

create temporary table delete_zone as
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

grant select on delete_zone to public;

create function pg_temp.owner_day(p_offset integer)
returns text
language sql
stable
as $$
  select (
    (timezone((select name from delete_zone), clock_timestamp()))::date + p_offset
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

create function pg_temp.plan_session(
  p_session_id uuid, p_local_date text, p_position integer, p_title text
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
      'position', p_position,
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

create function pg_temp.delete_change(p_session_id uuid)
returns jsonb
language sql
stable
as $$
  select jsonb_build_array(jsonb_build_object(
    'operation', 'delete', 'sessionId', p_session_id))
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
create temporary table snapshot (label text primary key, value jsonb);

grant all on change_receipt, logged, snapshot to public;

select plan(39);

select is(
  (select count(*)::bigint from delete_zone), 1::bigint,
  'a stored zone whose local time is mid-day is available at every UTC hour'
);

-- Nothing structural moved ----------------------------------------------------

select ok(
  (select pg_get_constraintdef(oid) like '%''delete''%' from pg_constraint
   where conrelid = 'public.rolling_plan_change_entries'::regclass
     and conname = 'rolling_plan_change_entries_kind_check'),
  'the delete change kind M3-14 added is reused rather than replaced'
);
select ok(
  (select pg_get_constraintdef(oid) like '%session_id IS NULL%'
   from pg_constraint
   where conrelid = 'public.rolling_plan_change_entries'::regclass
     and conname = 'rolling_plan_change_entries_target_check'),
  'a delete entry still names a date and no session, which is why it survives the cascade'
);
select ok(
  has_function_privilege('authenticated',
    'public.apply_rolling_plan_change_set(bigint, uuid, text, jsonb)', 'EXECUTE')
  and not has_function_privilege('anon',
    'public.apply_rolling_plan_change_set(bigint, uuid, text, jsonb)', 'EXECUTE')
  and not has_function_privilege('service_role',
    'public.apply_rolling_plan_change_set(bigint, uuid, text, jsonb)', 'EXECUTE'),
  'only an authenticated owner may call the change function that now deletes'
);
select ok(
  (select prosecdef and proconfig @> array['search_path=""']
   from pg_proc
   where oid = 'public.apply_rolling_plan_change_set(bigint, uuid, text, jsonb)'::regprocedure),
  'the replaced function is still a security definer with an empty search path'
);
select ok(
  (select not pg_get_function_identity_arguments(oid) like '%user%'
   from pg_proc
   where oid = 'public.apply_rolling_plan_change_set(bigint, uuid, text, jsonb)'::regprocedure),
  'and it still accepts no owner argument, so the owner can only come from the session'
);

-- Owners ----------------------------------------------------------------------

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('79000000-0000-4000-8000-000000000001', 'delete-owner@example.test', '{}', '{}'),
  ('79000000-0000-4000-8000-000000000002', 'delete-outsider@example.test', '{}', '{}');
insert into public.profiles (user_id, timezone_name)
select id, (select name from delete_zone) from auth.users
where id in (
  '79000000-0000-4000-8000-000000000001',
  '79000000-0000-4000-8000-000000000002'
);

set local role authenticated;

-- No owner at all -------------------------------------------------------------

select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok(
  $$select public.apply_rolling_plan_change_set(0,
    '79000000-0000-4000-8000-00000000e0ff', 'owner_manual',
    '[{"operation":"delete","sessionId":"79000000-0000-4000-8000-0000000000b1"}]'::jsonb)$$,
  '42501', 'An authenticated FitTip user is required.',
  'an anonymous caller cannot delete a planned session'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"79000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- Four sessions the owner will treat four different ways ----------------------

insert into change_receipt
select 'plain', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('79000000-0000-4000-8000-000000000001'),
  '79000000-0000-4000-8000-00000000e001', 'owner_manual',
  pg_temp.plan_session(
    '79000000-0000-4000-8000-0000000000b1', pg_temp.owner_day(1), 0, 'Aerobic run'));
insert into change_receipt
select 'cancelled', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('79000000-0000-4000-8000-000000000001'),
  '79000000-0000-4000-8000-00000000e002', 'owner_manual',
  pg_temp.plan_session(
    '79000000-0000-4000-8000-0000000000b2', pg_temp.owner_day(2), 0, 'Threshold'));
insert into change_receipt
select 'locked', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('79000000-0000-4000-8000-000000000001'),
  '79000000-0000-4000-8000-00000000e003', 'owner_manual',
  pg_temp.plan_session(
    '79000000-0000-4000-8000-0000000000b3', pg_temp.owner_day(3), 0, 'Hills'));
insert into change_receipt
select 'completed', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('79000000-0000-4000-8000-000000000001'),
  '79000000-0000-4000-8000-00000000e004', 'owner_manual',
  pg_temp.plan_session(
    '79000000-0000-4000-8000-0000000000b4', pg_temp.owner_day(0), 0, 'Recovery jog'));

-- 1. One future planned session is deleted outright ---------------------------

insert into snapshot
select 'revision-before', to_jsonb(pg_temp.rev('79000000-0000-4000-8000-000000000001'));
insert into snapshot
select 'add-entries-before', to_jsonb(count(*))
from public.rolling_plan_change_entries
where user_id = '79000000-0000-4000-8000-000000000001'
  and session_id = '79000000-0000-4000-8000-0000000000b1';

select is(
  (select (value #>> '{}')::bigint from snapshot where label = 'add-entries-before'),
  1::bigint,
  'the session starts out with its own add entry naming it'
);

insert into change_receipt
select 'delete-plain', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('79000000-0000-4000-8000-000000000001'),
  '79000000-0000-4000-8000-00000000e011', 'owner_manual',
  pg_temp.delete_change('79000000-0000-4000-8000-0000000000b1'));

select is(
  (select result from change_receipt where label = 'delete-plain'), 'applied',
  'the owner deletes one future planned session'
);
select is(
  (select count(*)::bigint from public.rolling_plan_sessions
   where id = '79000000-0000-4000-8000-0000000000b1'),
  0::bigint,
  'the row is gone rather than kept as cancelled'
);
select is(
  (select count(*)::bigint from public.rolling_plan_activities
   where session_id = '79000000-0000-4000-8000-0000000000b1'),
  0::bigint,
  'and its planned activities go with it'
);
select is(
  (select plan_revision from change_receipt where label = 'delete-plain'),
  (select (value #>> '{}')::bigint + 1 from snapshot where label = 'revision-before'),
  'the plan revision advances exactly once, as every other operation advances it'
);
select is(
  (select count(*)::bigint from public.rolling_plan_change_entries
   where user_id = '79000000-0000-4000-8000-000000000001'
     and session_id = '79000000-0000-4000-8000-0000000000b1'),
  0::bigint,
  'the entries that named the row are cascaded away with it'
);

insert into snapshot
select 'delete-entry', to_jsonb(entry)
from public.rolling_plan_change_entries entry
where entry.user_id = '79000000-0000-4000-8000-000000000001'
  and entry.change_set_id = (
    select change_set_id from change_receipt where label = 'delete-plain');

select is(
  (select value->>'change_kind' from snapshot where label = 'delete-entry'),
  'delete',
  'what survives is a delete entry, the same kind a series removal writes'
);
select ok(
  (select value->>'session_id' is null and value->>'series_id' is null
   from snapshot where label = 'delete-entry'),
  'it names no session and no series, which is what lets it outlive the row'
);
select is(
  (select value->>'local_date' from snapshot where label = 'delete-entry'),
  pg_temp.owner_day(1),
  'it is anchored to the date the session was planned for'
);
select is(
  (select value->'before_state'->>'title' from snapshot where label = 'delete-entry'),
  'Aerobic run',
  'and it carries the state the session was in before it went'
);
select is(
  (select value->'after_state' from snapshot where label = 'delete-entry'),
  jsonb_build_object('localDate', pg_temp.owner_day(1), 'deleted', true),
  'its after state is the shape M3-14 already writes for a swept occurrence'
);

-- 2. A cancelled session may still be deleted ---------------------------------

insert into change_receipt
select 'cancel', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('79000000-0000-4000-8000-000000000001'),
  '79000000-0000-4000-8000-00000000e012', 'owner_manual',
  jsonb_build_array(jsonb_build_object(
    'operation', 'cancel', 'sessionId', '79000000-0000-4000-8000-0000000000b2')));

select is(
  (select status from public.rolling_plan_sessions
   where id = '79000000-0000-4000-8000-0000000000b2'),
  'cancelled',
  'cancel still keeps the session on the record, unchanged by this ticket'
);

insert into change_receipt
select 'delete-cancelled', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('79000000-0000-4000-8000-000000000001'),
  '79000000-0000-4000-8000-00000000e013', 'owner_manual',
  pg_temp.delete_change('79000000-0000-4000-8000-0000000000b2'));

select is(
  (select count(*)::bigint from public.rolling_plan_sessions
   where id = '79000000-0000-4000-8000-0000000000b2'),
  0::bigint,
  'a session the owner already cancelled is exactly what they may next want gone'
);
select is(
  (select count(*)::bigint from public.rolling_plan_change_entries
   where user_id = '79000000-0000-4000-8000-000000000001'
     and session_id = '79000000-0000-4000-8000-0000000000b2'),
  0::bigint,
  'the cancel entry that named it goes with the row, exactly as its add entry does'
);

-- 3. A lock does not refuse the owner's own deliberate act --------------------

insert into change_receipt
select 'lock', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('79000000-0000-4000-8000-000000000001'),
  '79000000-0000-4000-8000-00000000e014', 'owner_manual',
  jsonb_build_array(jsonb_build_object(
    'operation', 'set_lock', 'sessionId', '79000000-0000-4000-8000-0000000000b3',
    'isLocked', true)));

insert into change_receipt
select 'delete-locked', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('79000000-0000-4000-8000-000000000001'),
  '79000000-0000-4000-8000-00000000e015', 'owner_manual',
  pg_temp.delete_change('79000000-0000-4000-8000-0000000000b3'));

select is(
  (select count(*)::bigint from public.rolling_plan_sessions
   where id = '79000000-0000-4000-8000-0000000000b3'),
  0::bigint,
  'a locked session is deleted when the owner asks for it directly'
);

-- 4. A session carrying a completion is refused, and both records survive -----

insert into logged
select 'first', * from public.apply_completion_change(
  'create', null, null,
  jsonb_build_object(
    'planSessionId', '79000000-0000-4000-8000-0000000000b4',
    'status', 'completed',
    'actualLocalDate', pg_temp.owner_day(0),
    'durationMinutes', 46,
    'activities', '[]'::jsonb));

insert into snapshot
select 'completed-revision', to_jsonb(pg_temp.rev('79000000-0000-4000-8000-000000000001'));

select throws_ok(
  format($$select public.apply_rolling_plan_change_set(%s,
    '79000000-0000-4000-8000-00000000e016', 'owner_manual',
    '[{"operation":"delete","sessionId":"79000000-0000-4000-8000-0000000000b4"}]'::jsonb)$$,
    (select value #>> '{}' from snapshot where label = 'completed-revision')),
  'PT425', 'This session has training logged against it, so it cannot be deleted.',
  'a session carrying a completion is refused before the foreign key can fire'
);
select is(
  (select count(*)::bigint from public.rolling_plan_sessions
   where id = '79000000-0000-4000-8000-0000000000b4'),
  1::bigint,
  'the planned session survives the refusal'
);
select is(
  (select count(*)::bigint from public.completions
   where id = (select completion_id from logged where label = 'first')),
  1::bigint,
  'and so does the record of what actually happened'
);
select is(
  (select pg_temp.rev('79000000-0000-4000-8000-000000000001')),
  (select (value #>> '{}')::bigint from snapshot where label = 'completed-revision'),
  'a refused delete advances no revision and writes no change set'
);

-- 5. A past-dated session stays history ---------------------------------------

reset role;
insert into public.rolling_plan_sessions (
  id, user_id, plan_id, local_date, position, title, sport
) select
  '79000000-0000-4000-8000-0000000000f1', plan.user_id, plan.id,
  (pg_temp.owner_day(-3))::date, 0, 'Last week', 'Running'
from public.rolling_plans plan
where plan.user_id = '79000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"79000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select throws_ok(
  format($$select public.apply_rolling_plan_change_set(%s,
    '79000000-0000-4000-8000-00000000e017', 'owner_manual',
    '[{"operation":"delete","sessionId":"79000000-0000-4000-8000-0000000000f1"}]'::jsonb)$$,
    (select pg_temp.rev('79000000-0000-4000-8000-000000000001'))),
  'PT422', 'A plan change cannot target a date before today.',
  'a past session cannot be deleted, exactly as it cannot be cancelled'
);
select is(
  (select count(*)::bigint from public.rolling_plan_sessions
   where id = '79000000-0000-4000-8000-0000000000f1'),
  1::bigint,
  'and it is still there afterwards'
);

-- 6. Cancel is no longer the fallthrough --------------------------------------

select throws_ok(
  format($$select public.apply_rolling_plan_change_set(%s,
    '79000000-0000-4000-8000-00000000e018', 'owner_manual',
    '[{"operation":"obliterate","sessionId":"79000000-0000-4000-8000-0000000000b4"}]'::jsonb)$$,
    (select pg_temp.rev('79000000-0000-4000-8000-000000000001'))),
  '22023', 'Invalid rolling plan change.',
  'an unrecognized operation is refused rather than falling through to cancel or delete'
);
select is(
  (select status from public.rolling_plan_sessions
   where id = '79000000-0000-4000-8000-0000000000b4'),
  'active',
  'the session it named is neither cancelled nor deleted'
);
select throws_ok(
  format($$select public.apply_rolling_plan_change_set(%s,
    '79000000-0000-4000-8000-00000000e019', 'owner_manual',
    '[{"operation":"delete","sessionId":"79000000-0000-4000-8000-0000000000f1",
       "localDate":"2026-01-01"}]'::jsonb)$$,
    (select pg_temp.rev('79000000-0000-4000-8000-000000000001'))),
  '22023', 'Invalid rolling plan deletion.',
  'a delete carrying anything but a session id is refused'
);
select throws_ok(
  format($$select public.apply_rolling_plan_change_set(%s,
    '79000000-0000-4000-8000-00000000e01a', 'owner_manual',
    '[{"operation":"delete","sessionId":"79000000-0000-4000-8000-0000000000cc"}]'::jsonb)$$,
    (select pg_temp.rev('79000000-0000-4000-8000-000000000001'))),
  '22023', 'Invalid rolling plan change.',
  'a delete of a session that does not exist is refused'
);

-- 7. No caller who is not the owner can reach it ------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"79000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select throws_ok(
  $$select public.apply_rolling_plan_change_set(0,
    '79000000-0000-4000-8000-00000000e020', 'owner_manual',
    '[{"operation":"delete","sessionId":"79000000-0000-4000-8000-0000000000b4"}]'::jsonb)$$,
  '22023', 'Invalid rolling plan change.',
  'another owner cannot delete this owner session through the privileged function'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"79000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is(
  (select count(*)::bigint from public.rolling_plan_sessions
   where id = '79000000-0000-4000-8000-0000000000b4'
     and user_id = '79000000-0000-4000-8000-000000000001'),
  1::bigint,
  'the cross-owner attempt left the session exactly where it was'
);
select is(
  (select count(*)::bigint from public.rolling_plan_change_entries
   where user_id = '79000000-0000-4000-8000-000000000002'),
  0::bigint,
  'and wrote no history under the outsider either'
);

-- 8. Delete leaves cancel alone -----------------------------------------------

-- What a completion refuses is the delete that would remove the plan entry it
-- was measured against. It does not refuse the cancel, because cancelling
-- keeps that entry exactly where it was.
insert into change_receipt
select 'cancel-completed', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('79000000-0000-4000-8000-000000000001'),
  '79000000-0000-4000-8000-00000000e021', 'owner_manual',
  jsonb_build_array(jsonb_build_object(
    'operation', 'cancel', 'sessionId', '79000000-0000-4000-8000-0000000000b4')));

select is(
  (select status from public.rolling_plan_sessions
   where id = '79000000-0000-4000-8000-0000000000b4'),
  'cancelled',
  'a session carrying a completion may still be cancelled, only not deleted'
);
select is(
  (select count(*)::bigint from public.rolling_plan_change_entries
   where user_id = '79000000-0000-4000-8000-000000000001'
     and change_kind = 'cancel'
     and session_id = '79000000-0000-4000-8000-0000000000b4'),
  1::bigint,
  'and that cancel is recorded as a cancel naming its own session'
);
select is(
  (select count(*)::bigint from public.rolling_plan_change_entries
   where user_id = '79000000-0000-4000-8000-000000000001'
     and change_kind = 'delete'),
  3::bigint,
  'and the three deletions are recorded as deletions, one dated entry each'
);
select ok(
  (select bool_and(session_id is null and series_id is null and local_date is not null)
   from public.rolling_plan_change_entries
   where user_id = '79000000-0000-4000-8000-000000000001'
     and change_kind = 'delete'),
  'every one of them names a date and nothing else'
);

select * from finish();
rollback;
