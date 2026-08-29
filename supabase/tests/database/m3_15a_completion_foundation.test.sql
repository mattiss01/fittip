-- M3-15A: the replacement factual completion record.
--
-- Three things are proved here that nothing else can prove.
--
-- First, that the completion is owner-scoped in the same way the rest of the
-- schema is: explicit privileges, RLS, owner-derived writes, immutable facts,
-- and no cross-owner reach.
--
-- Second, that the status vocabulary and the two structural equivalences are
-- enforced by the database rather than by a surface. `rest` is not a status; a
-- completion is `unplanned` exactly when it names no planned session; and it is
-- `replaced` exactly when it says what was done instead.
--
-- Third, that the planned side cannot rewrite the actual side. A completion
-- carries the planned session as it stood when the completion was written, and
-- editing, cancelling, or sweeping that session afterwards leaves the stored
-- snapshot byte-identical. A hard delete of a session carrying a completion is
-- refused by the database itself, and the one function in this schema that
-- hard deletes occurrences keeps a completed one exactly as it keeps a locked
-- one and reports both separately.
--
-- Dates follow the wall clock for the same reason M3-12's, M3-13's and M3-14's
-- suites do: every planning rule reached here is defined against owner-local
-- today, so a fixed literal would stop testing the rule. The owners share a
-- stored zone whose local time is currently mid-day, so a suite that runs in
-- about a second cannot straddle an owner-local midnight whatever UTC hour it
-- starts at.

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

select plan(87);

select is(
  (select count(*)::bigint from completion_zone), 1::bigint,
  'a stored zone whose local time is mid-day is available at every UTC hour'
);

-- Structure ------------------------------------------------------------------

select has_table('public', 'completions', 'the schema persists factual completions');
select has_table('public', 'completed_activities', 'a completion carries its own activity snapshot');
select col_not_null('public', 'completions', 'user_id', 'every completion has a required owner');
select col_not_null('public', 'completions', 'status', 'every completion has a required status');
select col_not_null('public', 'completions', 'actual_local_date', 'every completion has a required owner-local date');
select col_not_null('public', 'completions', 'timezone_name', 'every completion records the zone its date was written in');
select col_not_null('public', 'completed_activities', 'user_id', 'every completed activity has a required owner');

select ok(
  (select count(*) = 0 from pg_attribute
   where attrelid = 'public.completions'::regclass and not attisdropped
     and attname in (
       'completion_group_id', 'revision_number', 'previous_completion_id',
       'previous_revision_number', 'correction_reason'
     )),
  'the retired correction chain is not rebuilt: no group, revision number, predecessor or reason column'
);
select hasnt_table('public', 'completion_heads',
  'no current-revision pointer table exists, because there is nothing to point past');
select ok(
  (select pg_get_constraintdef(oid) not like '%rest%' from pg_constraint
   where conrelid = 'public.completions'::regclass
     and conname = 'completions_status_check'),
  'the status vocabulary admits no rest outcome'
);
select ok(
  (select count(*) = 1 from pg_constraint
   where conrelid = 'public.completions'::regclass
     and conname = 'completions_plan_fkey'
     and confrelid = 'public.rolling_plan_sessions'::regclass
     and confdeltype = 'r'),
  'a planned session carrying a completion cannot be deleted out from under it'
);
select ok(
  (select count(*) = 1 from pg_constraint
   where conrelid = 'public.completed_activities'::regclass
     and conname = 'completed_activities_completion_fkey'
     and confrelid = 'public.completions'::regclass
     and confdeltype = 'c'),
  'removing a completion removes its own activity snapshot and nothing else'
);
select ok(
  (select count(*) = 1 from pg_constraint
   where conrelid = 'public.completed_activities'::regclass
     and conname = 'completed_activities_personal_fkey'
     and confrelid = 'public.personal_activities'::regclass),
  'a completed activity may only reference the same owner personal activity'
);
select ok(
  (select count(*) = 0 from pg_constraint
   where contype = 'f'
     and conrelid in (
       'public.completions'::regclass, 'public.completed_activities'::regclass)
     and confrelid = 'public.rolling_plan_activities'::regclass),
  'nothing points at a live plan activity, which an edit replaces wholesale'
);
select ok(
  (select count(*) = 1 from pg_constraint
   where conrelid = 'public.completions'::regclass
     and conname = 'completions_revision_check'),
  'the optimistic token can never go negative'
);
select has_index('public', 'completions', 'completions_owner_date_idx',
  'history has an owner-ordered access path');
select has_index('public', 'completions', 'completions_plan_session_idx',
  'the planned-session foreign key is indexed');
select has_index('public', 'completions', 'completions_plan_session_key',
  'a planned session can carry at most one completion');
select has_index('public', 'completed_activities', 'completed_activities_owner_completion_idx',
  'a completion activities have an owner-scoped ordered access path');
select has_index('public', 'completed_activities', 'completed_activities_personal_idx',
  'the personal-activity foreign key is indexed');

-- Privileges and policies ----------------------------------------------------

select ok(
  (select relrowsecurity from pg_class where oid = 'public.completions'::regclass)
  and (select relrowsecurity from pg_class
       where oid = 'public.completed_activities'::regclass),
  'RLS is enabled on both completion tables'
);
select ok(
  has_table_privilege('authenticated', 'public.completions', 'SELECT')
  and not has_table_privilege('authenticated', 'public.completions', 'INSERT')
  and not has_table_privilege('authenticated', 'public.completions', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.completions', 'DELETE'),
  'owners read their history directly but can only write it through the change function'
);
select ok(
  has_table_privilege('authenticated', 'public.completed_activities', 'SELECT')
  and not has_table_privilege('authenticated', 'public.completed_activities', 'INSERT')
  and not has_table_privilege('authenticated', 'public.completed_activities', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.completed_activities', 'DELETE'),
  'the same holds for the activities of a completion'
);
select ok(
  not has_table_privilege('anon', 'public.completions', 'SELECT')
  and not has_table_privilege('anon', 'public.completed_activities', 'SELECT'),
  'anonymous callers hold no completion privilege'
);
select ok(
  not has_table_privilege('service_role', 'public.completions', 'SELECT')
  and not has_table_privilege('service_role', 'public.completed_activities', 'SELECT'),
  'no service role privilege is introduced on the completion tables'
);
select is(
  (select count(*)::bigint from pg_policies
   where schemaname = 'public'
     and tablename in ('completions', 'completed_activities')),
  2::bigint,
  'each completion table carries exactly one owner select policy and no mutation policy'
);
select ok(
  (select bool_and(qual = '(( SELECT auth.uid() AS uid) = user_id)')
   from pg_policies
   where schemaname = 'public'
     and tablename in ('completions', 'completed_activities')),
  'both policies confine reads to the calling owner'
);
select ok(
  has_function_privilege('authenticated',
    'public.apply_completion_change(text, uuid, bigint, jsonb)', 'EXECUTE')
  and not has_function_privilege('anon',
    'public.apply_completion_change(text, uuid, bigint, jsonb)', 'EXECUTE')
  and not has_function_privilege('service_role',
    'public.apply_completion_change(text, uuid, bigint, jsonb)', 'EXECUTE'),
  'only an authenticated owner may call the completion write'
);
select ok(
  (select prosecdef and proconfig @> array['search_path=""']
   from pg_proc
   where oid = 'public.apply_completion_change(text, uuid, bigint, jsonb)'::regprocedure),
  'the completion write is a security definer with an empty search path'
);
select ok(
  (select not pg_get_function_identity_arguments(oid) like '%user%'
   from pg_proc
   where oid = 'public.apply_completion_change(text, uuid, bigint, jsonb)'::regprocedure),
  'the completion write accepts no owner argument, so the owner can only come from the session'
);
select ok(
  not has_function_privilege('authenticated',
    'public.completion_input_is_valid(jsonb, text)', 'EXECUTE')
  and not has_function_privilege('anon',
    'public.completion_input_is_valid(jsonb, text)', 'EXECUTE')
  and not has_function_privilege('authenticated',
    'public.completed_activity_input_is_valid(jsonb)', 'EXECUTE'),
  'the internal validators are reachable from no client role'
);

-- Owners ----------------------------------------------------------------------

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('7f000000-0000-4000-8000-000000000001', 'completion-owner@example.test', '{}', '{}'),
  ('7f000000-0000-4000-8000-000000000002', 'completion-outsider@example.test', '{}', '{}'),
  ('7f000000-0000-4000-8000-000000000003', 'completion-zoneless@example.test', '{}', '{}');
insert into public.profiles (user_id, timezone_name)
select id, (select name from completion_zone) from auth.users
where id in (
  '7f000000-0000-4000-8000-000000000001',
  '7f000000-0000-4000-8000-000000000002'
);
insert into public.profiles (user_id)
values ('7f000000-0000-4000-8000-000000000003');
insert into public.personal_activities (id, user_id, name, sport, measurement_mode)
values (
  '7f000000-0000-4000-8000-0000000000a1',
  '7f000000-0000-4000-8000-000000000001',
  'Easy running', 'Running', 'duration_intensity'
);

set local role authenticated;

select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok(
  $$select * from public.apply_completion_change('create', null, null,
    '{"status":"unplanned","actualLocalDate":"2026-01-01","activities":[]}'::jsonb)$$,
  '42501', 'An authenticated FitTip user is required.',
  'a call without an owner is refused before anything is written'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"7f000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok(
  $$select * from public.apply_completion_change('create', null, null,
    '{"status":"unplanned","actualLocalDate":"2026-01-01","activities":[]}'::jsonb)$$,
  'PT428', 'Confirm your time zone before logging training.',
  'an owner with no stored zone cannot anchor a local date, so nothing is written'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"7f000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select throws_ok(
  $$insert into public.completions (user_id, status, actual_local_date, timezone_name)
    values ('7f000000-0000-4000-8000-000000000001', 'unplanned', '2026-01-01', 'UTC')$$,
  '42501', 'permission denied for table completions',
  'direct authenticated insertion of a completion is denied'
);
select throws_ok(
  $$insert into public.completed_activities (
      user_id, completion_id, position, name, sport, measurement_mode)
    values ('7f000000-0000-4000-8000-000000000001',
      '7f000000-0000-4000-8000-0000000000ff', 0, 'Direct', 'Running', 'custom')$$,
  '42501', 'permission denied for table completed_activities',
  'direct authenticated insertion of a completed activity is denied'
);

-- One planned session, then the factual record of doing it.
insert into change_receipt
select 'plan', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('7f000000-0000-4000-8000-000000000001'),
  '7f000000-0000-4000-8000-00000000e001', 'owner_manual',
  pg_temp.plan_session(
    '7f000000-0000-4000-8000-0000000000b1', pg_temp.owner_day(0), 'Aerobic run'));

insert into snapshot
select 'plan-revision-before', to_jsonb(pg_temp.rev('7f000000-0000-4000-8000-000000000001'));
insert into snapshot
select 'entries-before', to_jsonb(count(*))
from public.rolling_plan_change_entries
where user_id = '7f000000-0000-4000-8000-000000000001';

insert into logged
select 'first', * from public.apply_completion_change(
  'create', null, null,
  jsonb_build_object(
    'planSessionId', '7f000000-0000-4000-8000-0000000000b1',
    'status', 'completed',
    'actualLocalDate', pg_temp.owner_day(0),
    'durationMinutes', 58,
    'perceivedEffort', 6,
    'feeling', 'good',
    'note', 'Legs came round after twenty minutes.',
    'activities', jsonb_build_array(jsonb_build_object(
      'personalActivityId', '7f000000-0000-4000-8000-0000000000a1',
      'position', 0, 'name', 'Easy running', 'sport', 'Running',
      'measurementMode', 'duration_intensity',
      'actualMeasurement', jsonb_build_object(
        'duration_minutes', 58, 'intensity', 'easy')
    ))
  ));

select is((select result from logged where label = 'first'), 'created',
  'the owner records what actually happened against the planned session');
select is((select revision from logged where label = 'first'), 0::bigint,
  'a new completion starts at revision zero');
select is(
  (select user_id from public.completions
   where id = (select completion_id from logged where label = 'first')),
  '7f000000-0000-4000-8000-000000000001'::uuid,
  'the owner is derived from the caller, never from the call');
select is(
  (select timezone_name from public.completions
   where id = (select completion_id from logged where label = 'first')),
  (select name from completion_zone),
  'the record carries the zone its local date was written in');
select is(
  (select count(*)::bigint from public.completed_activities),
  1::bigint,
  'the activity snapshot is written with the completion');
select ok(
  (select personal_activity_id = '7f000000-0000-4000-8000-0000000000a1'::uuid
     and actual_measurement = '{"duration_minutes":58,"intensity":"easy"}'::jsonb
   from public.completed_activities),
  'a completed activity keeps its owner personal-activity reference and measured value');

select is(
  (select pg_temp.rev('7f000000-0000-4000-8000-000000000001')),
  (select (value #>> '{}')::bigint from snapshot where label = 'plan-revision-before'),
  'completing a session advances no plan revision');
select is(
  (select count(*)::bigint from public.rolling_plan_change_entries
   where user_id = '7f000000-0000-4000-8000-000000000001'),
  (select (value #>> '{}')::bigint from snapshot where label = 'entries-before'),
  'and it writes no plan history entry');

-- The planned snapshot is what the completion was measured against ------------

insert into snapshot
select 'planned', planned_snapshot from public.completions
where id = (select completion_id from logged where label = 'first');

select is(
  (select value->>'title' from snapshot where label = 'planned'),
  'Aerobic run',
  'the completion carries the planned session as it stood when it was written');
select is(
  (select jsonb_array_length(value->'activities') from snapshot where label = 'planned'),
  1,
  'and the planned activities with it');

insert into change_receipt
select 'replan', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('7f000000-0000-4000-8000-000000000001'),
  '7f000000-0000-4000-8000-00000000e002', 'owner_manual',
  jsonb_build_array(
    jsonb_build_object(
      'operation', 'edit',
      'sessionId', '7f000000-0000-4000-8000-0000000000b1',
      'session', jsonb_build_object(
        'title', 'Something else entirely', 'sport', 'Cycling',
        'activities', '[]'::jsonb)),
    jsonb_build_object(
      'operation', 'cancel',
      'sessionId', '7f000000-0000-4000-8000-0000000000b1')));

select is(
  (select title from public.rolling_plan_sessions
   where id = '7f000000-0000-4000-8000-0000000000b1'),
  'Something else entirely',
  'the plan side stays mutable after training was logged against it');
select is(
  (select planned_snapshot from public.completions
   where id = (select completion_id from logged where label = 'first')),
  (select value from snapshot where label = 'planned'),
  'editing and cancelling the planned session leaves the stored snapshot byte-identical');

-- Editing the record in place -------------------------------------------------

insert into logged
select 'corrected', * from public.apply_completion_change(
  'edit', (select completion_id from logged where label = 'first'), 0,
  jsonb_build_object(
    'status', 'partially_completed',
    'actualLocalDate', pg_temp.owner_day(0),
    'durationMinutes', 41,
    'note', 'Stopped early.'));

select is((select result from logged where label = 'corrected'), 'updated',
  'an owner may correct their own completion in place');
select is((select revision from logged where label = 'corrected'), 1::bigint,
  'and the optimistic token advances exactly once');
select is(
  (select count(*)::bigint from public.completions
   where user_id = '7f000000-0000-4000-8000-000000000001'),
  1::bigint,
  'the correction keeps no trail: there is one record, not two');
select ok(
  (select status = 'partially_completed' and duration_minutes = 41
     and perceived_effort is null and feeling is null
   from public.completions
   where id = (select completion_id from logged where label = 'first')),
  'an edit replaces the whole record rather than merging into it');
select is(
  (select count(*)::bigint from public.completed_activities),
  1::bigint,
  'and it leaves the activity snapshot exactly as it was written');

select throws_ok(
  format($$select * from public.apply_completion_change('edit', %L, 0,
    '{"status":"skipped","actualLocalDate":"2026-01-01"}'::jsonb)$$,
    (select completion_id from logged where label = 'first')),
  'PT409', 'That completion changed. Reload and try again.',
  'a write at a stale revision is refused rather than applied');
select ok(
  (select status = 'partially_completed' from public.completions
   where id = (select completion_id from logged where label = 'first')),
  'and it changed nothing');
select throws_ok(
  format($$select * from public.apply_completion_change('edit', %L, 1,
    '{"status":"unplanned","actualLocalDate":"2026-01-01"}'::jsonb)$$,
    (select completion_id from logged where label = 'first')),
  '22023', 'Invalid completion change.',
  'an edit can never cross between a planned completion and an unplanned one');

-- The vocabulary and the two structural equivalences --------------------------

select throws_ok(
  $$select * from public.apply_completion_change('create', null, null,
    '{"status":"rest","actualLocalDate":"2026-01-01","activities":[]}'::jsonb)$$,
  '22023', 'Invalid completion change.',
  'rest is not a completion status: a recovery intention is a planning label');
select throws_ok(
  $$select * from public.apply_completion_change('create', null, null,
    '{"status":"unplanned","planSessionId":"7f000000-0000-4000-8000-0000000000b1",
      "actualLocalDate":"2026-01-01","activities":[]}'::jsonb)$$,
  '22023', 'Invalid completion change.',
  'an unplanned completion cannot name a planned session');
select throws_ok(
  $$select * from public.apply_completion_change('create', null, null,
    '{"status":"completed","actualLocalDate":"2026-01-01","activities":[]}'::jsonb)$$,
  '22023', 'Invalid completion change.',
  'a completion that is not unplanned must name the session it is about');
select throws_ok(
  $$select * from public.apply_completion_change('create', null, null,
    '{"status":"replaced","planSessionId":"7f000000-0000-4000-8000-0000000000b1",
      "actualLocalDate":"2026-01-01","activities":[]}'::jsonb)$$,
  '22023', 'Invalid completion change.',
  'a replaced completion must say what was done instead');
select throws_ok(
  $$select * from public.apply_completion_change('create', null, null,
    '{"status":"skipped","planSessionId":"7f000000-0000-4000-8000-0000000000b1",
      "actualLocalDate":"2026-01-01","replacementDescription":"Swam","activities":[]}'::jsonb)$$,
  '22023', 'Invalid completion change.',
  'and only a replaced completion may carry one');
select throws_ok(
  $$select * from public.apply_completion_change('create', null, null,
    jsonb_build_object(
      'planSessionId', '7f000000-0000-4000-8000-0000000000b1',
      'status', 'completed', 'actualLocalDate', '2026-01-01', 'activities', '[]'::jsonb))$$,
  '22023', 'That session already has a completion.',
  'one planned session carries at most one completion; a second logging is an edit');
select throws_ok(
  $$select * from public.apply_completion_change('create', null, null,
    jsonb_build_object(
      'planSessionId', '7f000000-0000-4000-8000-0000000000ee',
      'status', 'completed', 'actualLocalDate', '2026-01-01', 'activities', '[]'::jsonb))$$,
  '22023', 'That planned session does not exist.',
  'a completion cannot be measured against a session that is not the owners');
select throws_ok(
  $$select * from public.apply_completion_change('create', null, null,
    '{"status":"unplanned","actualLocalDate":"2026-01-01","perceivedEffort":11,"activities":[]}'::jsonb)$$,
  '22023', 'Invalid completion change.',
  'perceived effort stays inside the scale the schema declares');
select throws_ok(
  $$select * from public.apply_completion_change('create', '7f000000-0000-4000-8000-0000000000cc',
    null, '{"status":"unplanned","actualLocalDate":"2026-01-01","activities":[]}'::jsonb)$$,
  '22023', 'Invalid completion change.',
  'a create cannot name the identity it is about to be given');
select is(
  (select count(*)::bigint from public.completions
   where user_id = '7f000000-0000-4000-8000-000000000001'),
  1::bigint,
  'every refused write left the history exactly as it was');

-- An unplanned completion is a record with nothing to compare against ---------

insert into logged
select 'unplanned', * from public.apply_completion_change(
  'create', null, null,
  jsonb_build_object(
    'status', 'unplanned',
    'actualLocalDate', pg_temp.owner_day(0),
    'durationMinutes', 30,
    'activities', '[]'::jsonb));

select ok(
  (select plan_session_id is null and planned_snapshot is null
   from public.completions
   where id = (select completion_id from logged where label = 'unplanned')),
  'an unplanned completion names no session and carries no planned snapshot');

-- A completed occurrence survives a series change -----------------------------

insert into change_receipt
select 'series', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('7f000000-0000-4000-8000-000000000001'),
  '7f000000-0000-4000-8000-00000000e003', 'owner_manual',
  jsonb_build_array(jsonb_build_object(
    'operation', 'add_series',
    'seriesId', '7f000000-0000-4000-8000-0000000000c1',
    'series', jsonb_build_object(
      'frequency', 'daily', 'intervalCount', 3,
      'startDate', pg_temp.owner_day(0),
      'title', 'Club session', 'sport', 'Running',
      'activities', '[]'::jsonb))));

insert into logged
select 'materialize', null::uuid, null::bigint, result
from public.materialize_rolling_plan_series(
  pg_temp.rev('7f000000-0000-4000-8000-000000000001'),
  '7f000000-0000-4000-8000-00000000e004');

select is((select result from logged where label = 'materialize'), 'applied',
  'the series fills the owner-local window with occurrences');

insert into change_receipt
select 'lock', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('7f000000-0000-4000-8000-000000000001'),
  '7f000000-0000-4000-8000-00000000e005', 'owner_manual',
  jsonb_build_array(jsonb_build_object(
    'operation', 'set_lock',
    'sessionId', (select id from public.rolling_plan_sessions
      where series_id = '7f000000-0000-4000-8000-0000000000c1'
        and occurrence_date = pg_temp.owner_day(6)::date),
    'isLocked', true)));

insert into logged
select 'occurrence', * from public.apply_completion_change(
  'create', null, null,
  jsonb_build_object(
    'planSessionId', (select id from public.rolling_plan_sessions
      where series_id = '7f000000-0000-4000-8000-0000000000c1'
        and occurrence_date = pg_temp.owner_day(0)::date),
    'status', 'completed',
    'actualLocalDate', pg_temp.owner_day(0),
    'activities', '[]'::jsonb));

insert into change_receipt
select 'end', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('7f000000-0000-4000-8000-000000000001'),
  '7f000000-0000-4000-8000-00000000e006', 'owner_manual',
  jsonb_build_array(jsonb_build_object(
    'operation', 'end_series',
    'seriesId', '7f000000-0000-4000-8000-0000000000c1',
    'effectiveDate', pg_temp.owner_day(0))));

select is(
  (select series_effects->0->>'deleted' from change_receipt where label = 'end'),
  '3',
  'ending the segment deletes every occurrence it is free to delete');
select is(
  (select series_effects->0->>'lockedKept' from change_receipt where label = 'end'),
  '1',
  'and reports the locked one it left alone, exactly as M3-14 did');
select is(
  (select series_effects->0->>'completedKept' from change_receipt where label = 'end'),
  '1',
  'and reports the completed one it left alone beside it');
select is(
  (select series_effects->0->>'divergedDeleted' from change_receipt where label = 'end'),
  '0',
  'the diverged count is unchanged for occurrences nobody had edited');
select ok(
  (select status = 'active' and not is_locked from public.rolling_plan_sessions
   where series_id = '7f000000-0000-4000-8000-0000000000c1'
     and occurrence_date = pg_temp.owner_day(0)::date),
  'the completed occurrence survives the removal and stays active');
select is(
  (select array_agg(occurrence_date order by occurrence_date)
   from public.rolling_plan_sessions
   where series_id = '7f000000-0000-4000-8000-0000000000c1'),
  array[pg_temp.owner_day(0), pg_temp.owner_day(6)]::date[],
  'only the completed and the locked occurrence remain');
select is(
  (select count(*)::bigint from public.rolling_plan_change_entries
   where user_id = '7f000000-0000-4000-8000-000000000001'
     and change_kind = 'delete'),
  3::bigint,
  'each deletion still leaves a surviving delete entry, and a kept occurrence leaves none');
select is(
  (select plan_session_id from public.completions
   where id = (select completion_id from logged where label = 'occurrence')),
  (select id from public.rolling_plan_sessions
   where series_id = '7f000000-0000-4000-8000-0000000000c1'
     and occurrence_date = pg_temp.owner_day(0)::date),
  'and the completion still points at the session it was measured against');

-- Another owner reaches none of it --------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"7f000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select is(
  (select count(*)::bigint from public.completions), 0::bigint,
  'another owner reads no completion');
select is(
  (select count(*)::bigint from public.completed_activities), 0::bigint,
  'and no completed activity');
select throws_ok(
  $$select * from public.apply_completion_change('create', null, null,
    jsonb_build_object(
      'planSessionId', '7f000000-0000-4000-8000-0000000000b1',
      'status', 'completed', 'actualLocalDate', '2026-01-01', 'activities', '[]'::jsonb))$$,
  '22023', 'That planned session does not exist.',
  'another owner cannot log training against a session they do not hold');
select throws_ok(
  format($$select * from public.apply_completion_change('edit', %L, 1,
    '{"status":"skipped","actualLocalDate":"2026-01-01"}'::jsonb)$$,
    (select completion_id from logged where label = 'first')),
  'PT409', 'That completion changed. Reload and try again.',
  'and cannot correct a completion they do not hold');

reset role;
select set_config('request.jwt.claims', null, true);

select is(
  (select count(*)::bigint from public.completions), 3::bigint,
  'the owner history is intact after every cross-owner attempt');

-- What no privileged path may do either ---------------------------------------

select throws_ok(
  $$delete from public.rolling_plan_sessions
    where id = '7f000000-0000-4000-8000-0000000000b1'$$,
  '23503', null,
  'a hard delete of a session carrying a completion is refused by the database itself');
select throws_ok(
  format($$update public.completions set user_id = %L where id = %L$$,
    '7f000000-0000-4000-8000-000000000002',
    (select completion_id from logged where label = 'first')),
  '42501', 'A completion owner cannot be reassigned.',
  'no path may reassign a completion to another owner');
select throws_ok(
  format($$update public.completions set planned_snapshot = '{}'::jsonb where id = %L$$,
    (select completion_id from logged where label = 'first')),
  '42501', 'What a completion was measured against cannot be rewritten.',
  'no path may rewrite the planned values a completion was measured against');
select throws_ok(
  format($$update public.completions set plan_session_id = null where id = %L$$,
    (select completion_id from logged where label = 'first')),
  '42501', 'What a completion was measured against cannot be rewritten.',
  'and none may repoint it at a different planned session');
select throws_ok(
  format($$update public.completions set timezone_name = 'UTC' where id = %L$$,
    (select completion_id from logged where label = 'first')),
  '42501', 'What a completion was measured against cannot be rewritten.',
  'the recorded zone stays put when the profile zone moves');
select throws_ok(
  format($$update public.completed_activities set user_id = %L$$,
    '7f000000-0000-4000-8000-000000000002'),
  '42501', 'A completed activity cannot change owner or completion.',
  'no path may move a completed activity to another owner');

select * from finish();
rollback;
