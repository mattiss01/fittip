-- M3-20: an owner reactivates a cancelled session, and a deleted occurrence of
-- a series stays deleted.
--
-- Reactivate is proved as a verb with exactly one admissible input: a
-- cancelled session of the caller's, on today or later. It returns after the
-- day's last active session, because cancelling freed its place and another
-- session may hold it now; a full day is refused by the existing cap.
--
-- The skip list is proved over its whole life: a deleted occurrence is not
-- written back, a cancelled one deleted is not either, a whole-series edit
-- clears the skips it now answers for, and a split gives its successor an
-- empty list.
--
-- Dates follow the wall clock for the reason every rolling-plan suite gives:
-- the past boundary is owner-local today, so a literal would stop testing it.

begin;

create extension if not exists pgtap with schema extensions;

create temporary table reactivate_zone as
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

grant select on reactivate_zone to public;

create function pg_temp.owner_day(p_offset integer)
returns text
language sql
stable
as $$
  select (
    (timezone((select name from reactivate_zone), clock_timestamp()))::date + p_offset
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
      'isLocked', false,
      'activities', '[]'::jsonb
    )
  )
$$;

create function pg_temp.one(p_operation text, p_session_id uuid)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_array(jsonb_build_object(
    'operation', p_operation, 'sessionId', p_session_id))
$$;

create function pg_temp.daily_series(
  p_series_id uuid, p_operation text, p_start_date text, p_title text
)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'operation', p_operation,
    'seriesId', p_series_id,
    'series', jsonb_build_object(
      'frequency', 'daily',
      'intervalCount', 1,
      'startDate', p_start_date,
      'title', p_title,
      'sport', 'Running',
      'activities', '[]'::jsonb
    )
  )
$$;

create function pg_temp.occurrence(p_series_id uuid, p_offset integer)
returns uuid
language sql
stable
as $$
  select id from public.rolling_plan_sessions
  where series_id = p_series_id
    and occurrence_date = pg_temp.owner_day(p_offset)::date
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
create temporary table snapshot (label text primary key, value jsonb);

grant all on change_receipt, materialization, snapshot to public;

select plan(39);

select is(
  (select count(*)::bigint from reactivate_zone), 1::bigint,
  'a stored zone whose local time is mid-day is available at every UTC hour'
);

-- Structure -------------------------------------------------------------------

select col_type_is(
  'public', 'rolling_plan_series', 'skipped_occurrence_dates', 'date[]',
  'a series carries the rule dates the owner deleted occurrences from'
);
select col_not_null(
  'public', 'rolling_plan_series', 'skipped_occurrence_dates',
  'the list is never null, so the materializer never has to ask'
);
select ok(
  (select pg_get_constraintdef(oid) like '%''reactivate''%' from pg_constraint
   where conrelid = 'public.rolling_plan_change_entries'::regclass
     and conname = 'rolling_plan_change_entries_kind_check'),
  'reactivate is an admitted change kind'
);
select ok(
  not has_table_privilege('authenticated', 'public.rolling_plan_series', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.rolling_plan_series', 'INSERT'),
  'an owner still cannot write a series, and so cannot write its skip list, directly'
);

-- Owners ----------------------------------------------------------------------

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('7a200000-0000-4000-8000-000000000001', 'reactivate-owner@example.test', '{}', '{}'),
  ('7a200000-0000-4000-8000-000000000002', 'reactivate-outsider@example.test', '{}', '{}');
insert into public.profiles (user_id, timezone_name)
select id, (select name from reactivate_zone) from auth.users
where id in (
  '7a200000-0000-4000-8000-000000000001',
  '7a200000-0000-4000-8000-000000000002'
);

set local role authenticated;

select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok(
  $$select public.apply_rolling_plan_change_set(0,
    '7a200000-0000-4000-8000-00000000e0ff', 'owner_manual',
    '[{"operation":"reactivate","sessionId":"7a200000-0000-4000-8000-0000000000b1"}]'::jsonb)$$,
  '42501', 'An authenticated FitTip user is required.',
  'an anonymous caller cannot reactivate a session'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"7a200000-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- 1. A cancelled session returns, after whoever took its place ----------------

insert into change_receipt
select 'add-tempo', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('7a200000-0000-4000-8000-000000000001'),
  '7a200000-0000-4000-8000-00000000e001', 'owner_manual',
  jsonb_build_array(
    pg_temp.new_session('7a200000-0000-4000-8000-0000000000b1', pg_temp.owner_day(1), 0, 'Tempo'),
    pg_temp.new_session('7a200000-0000-4000-8000-0000000000b3', pg_temp.owner_day(2), 0, 'Long run')));
insert into change_receipt
select 'cancel-tempo', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('7a200000-0000-4000-8000-000000000001'),
  '7a200000-0000-4000-8000-00000000e002', 'owner_manual',
  pg_temp.one('cancel', '7a200000-0000-4000-8000-0000000000b1'));
-- Position 0 is free again once Tempo is cancelled, and Intervals takes it.
insert into change_receipt
select 'add-intervals', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('7a200000-0000-4000-8000-000000000001'),
  '7a200000-0000-4000-8000-00000000e003', 'owner_manual',
  jsonb_build_array(pg_temp.new_session(
    '7a200000-0000-4000-8000-0000000000b2', pg_temp.owner_day(1), 0, 'Intervals')));

insert into snapshot
select 'revision-before', to_jsonb(pg_temp.rev('7a200000-0000-4000-8000-000000000001'));

insert into change_receipt
select 'reactivate-tempo', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('7a200000-0000-4000-8000-000000000001'),
  '7a200000-0000-4000-8000-00000000e004', 'owner_manual',
  pg_temp.one('reactivate', '7a200000-0000-4000-8000-0000000000b1'));

select is(
  (select result from change_receipt where label = 'reactivate-tempo'), 'applied',
  'the owner reactivates a cancelled future session'
);
select is(
  (select status || '|' || coalesce(cancelled_at::text, 'none')
   from public.rolling_plan_sessions where id = '7a200000-0000-4000-8000-0000000000b1'),
  'active|none',
  'it is active again and no longer carries a cancellation time'
);
select is(
  (select position::integer from public.rolling_plan_sessions
   where id = '7a200000-0000-4000-8000-0000000000b1'),
  1,
  'it returns after the session that took its place, rather than colliding with it'
);
select is(
  (select position::integer from public.rolling_plan_sessions
   where id = '7a200000-0000-4000-8000-0000000000b2'),
  0,
  'and that session keeps the place it took'
);
select is(
  (select plan_revision from change_receipt where label = 'reactivate-tempo'),
  (select (value #>> '{}')::bigint + 1 from snapshot where label = 'revision-before'),
  'the plan revision advances exactly once'
);

insert into snapshot
select 'reactivate-entry', to_jsonb(entry)
from public.rolling_plan_change_entries entry
where entry.user_id = '7a200000-0000-4000-8000-000000000001'
  and entry.change_set_id = (
    select change_set_id from change_receipt where label = 'reactivate-tempo');

select is(
  (select value->>'change_kind' || '|' || (value->>'session_id')
   from snapshot where label = 'reactivate-entry'),
  'reactivate|7a200000-0000-4000-8000-0000000000b1',
  'it is recorded as a reactivate entry naming the session'
);
select is(
  (select (value->'before_state'->>'status') || '>' || (value->'after_state'->>'status')
   from snapshot where label = 'reactivate-entry'),
  'cancelled>active',
  'so the history reads planned, cancelled, reactivated rather than silently reverting'
);

-- 2. Only a cancelled session is admitted -------------------------------------

select throws_ok(
  format($$select public.apply_rolling_plan_change_set(%s,
    '7a200000-0000-4000-8000-00000000e005', 'owner_manual',
    '[{"operation":"reactivate","sessionId":"7a200000-0000-4000-8000-0000000000b3"}]'::jsonb)$$,
    (select pg_temp.rev('7a200000-0000-4000-8000-000000000001'))),
  '22023', 'Invalid rolling plan change.',
  'a session that was never cancelled cannot be reactivated'
);
select throws_ok(
  format($$select public.apply_rolling_plan_change_set(%s,
    '7a200000-0000-4000-8000-00000000e006', 'owner_manual',
    '[{"operation":"reactivate","sessionId":"7a200000-0000-4000-8000-0000000000b1"}]'::jsonb)$$,
    (select pg_temp.rev('7a200000-0000-4000-8000-000000000001'))),
  '22023', 'Invalid rolling plan change.',
  'nor can one that has already been reactivated'
);
select throws_ok(
  format($$select public.apply_rolling_plan_change_set(%s,
    '7a200000-0000-4000-8000-00000000e007', 'owner_manual',
    '[{"operation":"reactivate","sessionId":"7a200000-0000-4000-8000-0000000000b1","position":0}]'::jsonb)$$,
    (select pg_temp.rev('7a200000-0000-4000-8000-000000000001'))),
  '22023', 'Invalid rolling plan reactivation.',
  'a caller cannot choose where it lands'
);

-- 3. A past cancelled session stays history -----------------------------------

reset role;
insert into public.rolling_plan_sessions (
  id, user_id, plan_id, local_date, position, title, sport, status, cancelled_at
) select
  '7a200000-0000-4000-8000-0000000000f1', plan.user_id, plan.id,
  (pg_temp.owner_day(-2))::date, 0, 'Skipped last week', 'Running',
  'cancelled', now()
from public.rolling_plans plan
where plan.user_id = '7a200000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"7a200000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select throws_ok(
  format($$select public.apply_rolling_plan_change_set(%s,
    '7a200000-0000-4000-8000-00000000e008', 'owner_manual',
    '[{"operation":"reactivate","sessionId":"7a200000-0000-4000-8000-0000000000f1"}]'::jsonb)$$,
    (select pg_temp.rev('7a200000-0000-4000-8000-000000000001'))),
  'PT422', 'A plan change cannot target a date before today.',
  'a cancelled session whose date has passed cannot be reactivated'
);
select is(
  (select status from public.rolling_plan_sessions
   where id = '7a200000-0000-4000-8000-0000000000f1'),
  'cancelled',
  'and it stays cancelled'
);

-- 4. A full day refuses it ----------------------------------------------------

insert into change_receipt
select 'add-crowded', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('7a200000-0000-4000-8000-000000000001'),
  '7a200000-0000-4000-8000-00000000e009', 'owner_manual',
  jsonb_build_array(pg_temp.new_session(
    '7a200000-0000-4000-8000-0000000000b4', pg_temp.owner_day(20), 0, 'Crowded out')));
insert into change_receipt
select 'cancel-crowded', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('7a200000-0000-4000-8000-000000000001'),
  '7a200000-0000-4000-8000-00000000e010', 'owner_manual',
  pg_temp.one('cancel', '7a200000-0000-4000-8000-0000000000b4'));
insert into change_receipt
select 'fill-day', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('7a200000-0000-4000-8000-000000000001'),
  '7a200000-0000-4000-8000-00000000e011', 'owner_manual',
  (select jsonb_agg(pg_temp.new_session(
     gen_random_uuid(), pg_temp.owner_day(20), slot, 'Filler ' || slot))
   from generate_series(0, 9) as slot));

select throws_ok(
  format($$select public.apply_rolling_plan_change_set(%s,
    '7a200000-0000-4000-8000-00000000e012', 'owner_manual',
    '[{"operation":"reactivate","sessionId":"7a200000-0000-4000-8000-0000000000b4"}]'::jsonb)$$,
    (select pg_temp.rev('7a200000-0000-4000-8000-000000000001'))),
  'PT423', 'A date holds at most ten planned sessions.',
  'a session cannot be reactivated onto a day that already holds ten'
);

-- 5. No caller who is not the owner can reach it ------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"7a200000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select throws_ok(
  $$select public.apply_rolling_plan_change_set(0,
    '7a200000-0000-4000-8000-00000000e013', 'owner_manual',
    '[{"operation":"reactivate","sessionId":"7a200000-0000-4000-8000-0000000000b4"}]'::jsonb)$$,
  '22023', 'Invalid rolling plan change.',
  'another owner cannot reactivate this owner''s session'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"7a200000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is(
  (select status from public.rolling_plan_sessions
   where id = '7a200000-0000-4000-8000-0000000000b4'),
  'cancelled',
  'the cross-owner attempt left the session cancelled'
);

-- 6. A deleted occurrence stays deleted ---------------------------------------

insert into change_receipt
select 'add-series', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('7a200000-0000-4000-8000-000000000001'),
  '7a200000-0000-4000-8000-00000000e020', 'owner_manual',
  jsonb_build_array(pg_temp.daily_series(
    '7a200000-0000-4000-8000-0000000000a1', 'add_series', pg_temp.owner_day(1), 'Daily easy')));
insert into materialization
select 'first', * from public.materialize_rolling_plan_series(
  pg_temp.rev('7a200000-0000-4000-8000-000000000001'),
  '7a200000-0000-4000-8000-00000000e021');

select is(
  (select count(*)::bigint from public.rolling_plan_sessions
   where series_id = '7a200000-0000-4000-8000-0000000000a1'),
  13::bigint,
  'the series fills every date from tomorrow to the end of the window'
);

insert into change_receipt
select 'delete-day3', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('7a200000-0000-4000-8000-000000000001'),
  '7a200000-0000-4000-8000-00000000e022', 'owner_manual',
  pg_temp.one('delete', pg_temp.occurrence('7a200000-0000-4000-8000-0000000000a1', 3)));
insert into change_receipt
select 'cancel-day5', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('7a200000-0000-4000-8000-000000000001'),
  '7a200000-0000-4000-8000-00000000e023', 'owner_manual',
  pg_temp.one('cancel', pg_temp.occurrence('7a200000-0000-4000-8000-0000000000a1', 5)));
insert into change_receipt
select 'delete-day5', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('7a200000-0000-4000-8000-000000000001'),
  '7a200000-0000-4000-8000-00000000e024', 'owner_manual',
  pg_temp.one('delete', pg_temp.occurrence('7a200000-0000-4000-8000-0000000000a1', 5)));

select is(
  (select skipped_occurrence_dates from public.rolling_plan_series
   where id = '7a200000-0000-4000-8000-0000000000a1'),
  array[pg_temp.owner_day(3)::date, pg_temp.owner_day(5)::date],
  'the series records both rule dates the owner deleted, in order'
);

insert into materialization
select 'after-delete', * from public.materialize_rolling_plan_series(
  pg_temp.rev('7a200000-0000-4000-8000-000000000001'),
  '7a200000-0000-4000-8000-00000000e025');

select is(
  (select result from materialization where label = 'after-delete'), 'unchanged',
  'the next top-up finds nothing missing'
);
select is(
  (select count(*)::bigint from public.rolling_plan_sessions
   where series_id = '7a200000-0000-4000-8000-0000000000a1'),
  11::bigint,
  'a deleted occurrence is not written back, active or cancelled when it went'
);

-- A moved occurrence is skipped by its rule date, not the day it sat on.
insert into change_receipt
select 'move-day7', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('7a200000-0000-4000-8000-000000000001'),
  '7a200000-0000-4000-8000-00000000e026', 'owner_manual',
  jsonb_build_array(jsonb_build_object(
    'operation', 'move',
    'sessionId', pg_temp.occurrence('7a200000-0000-4000-8000-0000000000a1', 7),
    'localDate', pg_temp.owner_day(9), 'position', 1)));
insert into change_receipt
select 'delete-moved', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('7a200000-0000-4000-8000-000000000001'),
  '7a200000-0000-4000-8000-00000000e027', 'owner_manual',
  pg_temp.one('delete', pg_temp.occurrence('7a200000-0000-4000-8000-0000000000a1', 7)));

select ok(
  (select skipped_occurrence_dates @> array[pg_temp.owner_day(7)::date]
     and not skipped_occurrence_dates @> array[pg_temp.owner_day(9)::date]
   from public.rolling_plan_series
   where id = '7a200000-0000-4000-8000-0000000000a1'),
  'a moved occurrence is skipped by the rule date it answers, not the day it was moved to'
);

insert into materialization
select 'after-moved', * from public.materialize_rolling_plan_series(
  pg_temp.rev('7a200000-0000-4000-8000-000000000001'),
  '7a200000-0000-4000-8000-00000000e028');

select is(
  (select result from materialization where label = 'after-moved'), 'unchanged',
  'and the series does not write the moved date back either'
);

-- Only the owner can read the list.
select set_config(
  'request.jwt.claims',
  '{"sub":"7a200000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is(
  (select count(*)::bigint from public.rolling_plan_series
   where id = '7a200000-0000-4000-8000-0000000000a1'),
  0::bigint,
  'another owner cannot see the series or the dates skipped on it'
);
select set_config(
  'request.jwt.claims',
  '{"sub":"7a200000-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- 7. A whole-series edit clears the skips it rewrites -------------------------

insert into change_receipt
select 'edit-whole', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('7a200000-0000-4000-8000-000000000001'),
  '7a200000-0000-4000-8000-00000000e030', 'owner_manual',
  jsonb_build_array(pg_temp.daily_series(
    '7a200000-0000-4000-8000-0000000000a1', 'edit_series', pg_temp.owner_day(1), 'Daily easier')));

select is(
  (select skipped_occurrence_dates from public.rolling_plan_series
   where id = '7a200000-0000-4000-8000-0000000000a1'),
  '{}'::date[],
  'rewriting the whole rule clears every skip, as it clears every changed occurrence'
);

insert into materialization
select 'after-edit', * from public.materialize_rolling_plan_series(
  pg_temp.rev('7a200000-0000-4000-8000-000000000001'),
  '7a200000-0000-4000-8000-00000000e031');

select is(
  (select count(*)::bigint from public.rolling_plan_sessions
   where series_id = '7a200000-0000-4000-8000-0000000000a1'),
  13::bigint,
  'so the new rule fills every date again, including the ones deleted under the old one'
);
select is(
  (select title from public.rolling_plan_sessions
   where id = pg_temp.occurrence('7a200000-0000-4000-8000-0000000000a1', 3)),
  'Daily easier',
  'and what returns is the rule as it now reads'
);

-- 8. A split starts its successor with an empty list --------------------------

insert into change_receipt
select 'delete-day2', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('7a200000-0000-4000-8000-000000000001'),
  '7a200000-0000-4000-8000-00000000e032', 'owner_manual',
  pg_temp.one('delete', pg_temp.occurrence('7a200000-0000-4000-8000-0000000000a1', 2)));
insert into change_receipt
select 'delete-day10', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('7a200000-0000-4000-8000-000000000001'),
  '7a200000-0000-4000-8000-00000000e033', 'owner_manual',
  pg_temp.one('delete', pg_temp.occurrence('7a200000-0000-4000-8000-0000000000a1', 10)));
insert into change_receipt
select 'split', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('7a200000-0000-4000-8000-000000000001'),
  '7a200000-0000-4000-8000-00000000e034', 'owner_manual',
  jsonb_build_array(
    pg_temp.daily_series(
      '7a200000-0000-4000-8000-0000000000a1', 'edit_series', pg_temp.owner_day(8), 'Daily later')
    || jsonb_build_object(
      'effectiveDate', pg_temp.owner_day(8),
      'successorSeriesId', '7a200000-0000-4000-8000-0000000000a2')));

select is(
  (select skipped_occurrence_dates from public.rolling_plan_series
   where id = '7a200000-0000-4000-8000-0000000000a2'),
  '{}'::date[],
  'the successor segment starts with no skips of its own'
);

insert into materialization
select 'after-split', * from public.materialize_rolling_plan_series(
  pg_temp.rev('7a200000-0000-4000-8000-000000000001'),
  '7a200000-0000-4000-8000-00000000e035');

select is(
  pg_temp.occurrence('7a200000-0000-4000-8000-0000000000a1', 2), null::uuid,
  'a skip before the split still holds on the predecessor'
);
select isnt(
  pg_temp.occurrence('7a200000-0000-4000-8000-0000000000a2', 10), null::uuid,
  'while a date after it is the successor''s to fill under its own rule'
);

-- 9. Reactivating an occurrence -----------------------------------------------

insert into change_receipt
select 'cancel-occurrence', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('7a200000-0000-4000-8000-000000000001'),
  '7a200000-0000-4000-8000-00000000e040', 'owner_manual',
  pg_temp.one('cancel', pg_temp.occurrence('7a200000-0000-4000-8000-0000000000a1', 4)));
select is(
  (select has_diverged from public.rolling_plan_sessions
   where id = pg_temp.occurrence('7a200000-0000-4000-8000-0000000000a1', 4)),
  false,
  'cancelling an occurrence does not mark it as changed: what it says is the rule''s'
);

insert into change_receipt
select 'reactivate-occurrence', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('7a200000-0000-4000-8000-000000000001'),
  '7a200000-0000-4000-8000-00000000e041', 'owner_manual',
  pg_temp.one('reactivate', pg_temp.occurrence('7a200000-0000-4000-8000-0000000000a1', 4)));

select is(
  (select status || '|' || has_diverged::text from public.rolling_plan_sessions
   where id = pg_temp.occurrence('7a200000-0000-4000-8000-0000000000a1', 4)),
  'active|false',
  'a reactivated occurrence the owner never edited reads as the rule''s again'
);

-- Moving and locking leave what it says alone as well.
insert into change_receipt
select 'move-lock-occurrence', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('7a200000-0000-4000-8000-000000000001'),
  '7a200000-0000-4000-8000-00000000e046', 'owner_manual',
  jsonb_build_array(
    jsonb_build_object(
      'operation', 'move',
      'sessionId', pg_temp.occurrence('7a200000-0000-4000-8000-0000000000a1', 4),
      'localDate', pg_temp.owner_day(5), 'position', 5),
    jsonb_build_object(
      'operation', 'set_lock',
      'sessionId', pg_temp.occurrence('7a200000-0000-4000-8000-0000000000a1', 4),
      'isLocked', true)));

select is(
  (select has_diverged from public.rolling_plan_sessions
   where id = pg_temp.occurrence('7a200000-0000-4000-8000-0000000000a1', 4)),
  false,
  'nor does moving or locking it'
);

-- Only an edit does, and cancelling and reactivating an edited one keeps it.
insert into change_receipt
select 'edit-occurrence', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('7a200000-0000-4000-8000-000000000001'),
  '7a200000-0000-4000-8000-00000000e043', 'owner_manual',
  jsonb_build_array(jsonb_build_object(
    'operation', 'edit',
    'sessionId', pg_temp.occurrence('7a200000-0000-4000-8000-0000000000a1', 6),
    'session', jsonb_build_object(
      'title', 'Owner changed this', 'sport', 'Running', 'activities', '[]'::jsonb))));
insert into change_receipt
select 'cancel-edited', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('7a200000-0000-4000-8000-000000000001'),
  '7a200000-0000-4000-8000-00000000e044', 'owner_manual',
  pg_temp.one('cancel', pg_temp.occurrence('7a200000-0000-4000-8000-0000000000a1', 6)));
insert into change_receipt
select 'reactivate-edited', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('7a200000-0000-4000-8000-000000000001'),
  '7a200000-0000-4000-8000-00000000e045', 'owner_manual',
  pg_temp.one('reactivate', pg_temp.occurrence('7a200000-0000-4000-8000-0000000000a1', 6)));

select is(
  (select has_diverged from public.rolling_plan_sessions
   where id = pg_temp.occurrence('7a200000-0000-4000-8000-0000000000a1', 6)),
  true,
  'while one the owner edited before cancelling stays marked as changed'
);

insert into materialization
select 'after-reactivate', * from public.materialize_rolling_plan_series(
  pg_temp.rev('7a200000-0000-4000-8000-000000000001'),
  '7a200000-0000-4000-8000-00000000e042');

select is(
  (select count(*)::bigint from public.rolling_plan_sessions
   where series_id = '7a200000-0000-4000-8000-0000000000a1'
     and occurrence_date = pg_temp.owner_day(4)::date),
  1::bigint,
  'and the series does not write a second one beside it'
);

select * from finish();
rollback;
