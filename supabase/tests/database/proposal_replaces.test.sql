-- What a coach proposal may replace (ADR-024).
--
-- What this proves, in the order it matters:
--
--   1. The boundary. The marks table is readable by its owner and writable by
--      nobody directly; the claim function has one signature, the new one.
--   2. A mark is only ever this owner's active, unlogged session on one of the
--      requested days. Anything else refuses the claim.
--   3. The coach names a handle the request issued, once, or the answer is
--      refused whole.
--   4. "Add beside" exists only for an item that replaces something.
--   5. Finish deletes the old session in the change set that adds the new one,
--      for Replace alone, and never a session that has since been logged.
--   6. Replacing an occurrence of a series removes that day only.
--   7. None of it reaches across owners.

begin;

create extension if not exists pgtap with schema extensions;

create function pg_temp.day(p_offset integer)
returns date
language sql
stable
as $$
  select ((clock_timestamp() at time zone 'utc')::date + p_offset)
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
  p_session_id uuid, p_local_date date, p_position integer, p_title text
)
returns jsonb
language sql
stable
as $$
  select jsonb_build_array(jsonb_build_object(
    'operation', 'add',
    'sessionId', p_session_id,
    'session', jsonb_build_object(
      'localDate', p_local_date::text,
      'position', p_position,
      'title', p_title,
      'sport', 'Running',
      'expectedDurationMinutes', 60,
      'activities', '[]'::jsonb
    )
  ))
$$;

create function pg_temp.proposed(p_date date, p_title text, p_replaces text)
returns jsonb
language sql
stable
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'date', p_date::text,
    'title', p_title,
    'sport', 'Running',
    'focus', 'Repeatable easy work you could do again tomorrow.',
    'intent', 'Conversational the whole way.',
    'durationMinutes', 45,
    'primaryGoalId', 'goal-1',
    'rationale', 'Most of this horizon stays easy so the work is repeatable.',
    'replaces', p_replaces
  ))
$$;

create function pg_temp.plan_body(p_start date, p_end date, p_sessions jsonb)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'schemaVersion', 'fittip.seven-day-plan.v2',
    'weekDescription', 'A short horizon built around what is already planned.',
    'startDate', p_start::text,
    'endDate', p_end::text,
    'sessions', p_sessions
  )
$$;

create temporary table pg_temp_claim (
  label text primary key,
  generation_id uuid,
  completion_token uuid,
  state text,
  proposal_id uuid
);
create temporary table pg_temp_receipt (
  label text primary key,
  plan_id uuid,
  plan_revision bigint,
  change_set_id uuid,
  result text,
  series_effects jsonb
);
create temporary table pg_temp_logged (
  label text primary key,
  completion_id uuid,
  revision bigint,
  result text
);
create temporary table pg_temp_review (
  label text primary key,
  proposal_id uuid,
  decision text,
  applied_count smallint,
  change_set_id uuid,
  plan_revision bigint,
  state text
);
grant all on pg_temp_claim, pg_temp_receipt, pg_temp_logged, pg_temp_review to public;

-- Runs as the caller, so every call below is the owner's own.
create function pg_temp.finish_generation(p_label text, p_body jsonb)
returns uuid
language sql
as $$
  select proposal_id from public.finish_plan_generation(
    (select completion_token from pg_temp_claim where label = p_label),
    'proposal', 'fittip.seven-day-plan.v2', 'seven-day-plan-v2-2026-08-12',
    'fixture', 'fixture-corpus-v1', 'fixture-no-spend', null,
    null, p_body, null, null, null
  )
$$;

select plan(39);

-- 1. The boundary ------------------------------------------------------------

select has_table('public', 'plan_generation_replaceable_sessions', 'the marks have a table');
select ok(
  (select relrowsecurity from pg_class
   where oid = 'public.plan_generation_replaceable_sessions'::regclass),
  'with row level security on'
);
select ok(
  has_table_privilege('authenticated', 'public.plan_generation_replaceable_sessions', 'SELECT')
  and not has_table_privilege('authenticated', 'public.plan_generation_replaceable_sessions', 'INSERT')
  and not has_table_privilege('authenticated', 'public.plan_generation_replaceable_sessions', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.plan_generation_replaceable_sessions', 'DELETE')
  and not has_table_privilege('anon', 'public.plan_generation_replaceable_sessions', 'SELECT')
  and not has_table_privilege('service_role', 'public.plan_generation_replaceable_sessions', 'SELECT'),
  'an owner may read their marks; nobody writes one except through the claim'
);
select has_column('public', 'plan_proposal_items', 'replaces_session_id',
  'a proposed item can name the session it stands in for');
select has_function(
  'public', 'begin_plan_generation',
  array['text', 'text', 'date', 'integer', 'bigint', 'text', 'uuid', 'text', 'uuid[]'],
  'the claim function takes the marks'
);
select hasnt_function(
  'public', 'begin_plan_generation',
  array['text', 'text', 'date', 'integer', 'bigint', 'text', 'uuid', 'text'],
  'and the signature without them is dropped, not shadowed'
);
select ok(
  has_function_privilege('authenticated',
    'public.begin_plan_generation(text,text,date,integer,bigint,text,uuid,text,uuid[])', 'EXECUTE')
  and not has_function_privilege('anon',
    'public.begin_plan_generation(text,text,date,integer,bigint,text,uuid,text,uuid[])', 'EXECUTE')
  and not has_function_privilege('service_role',
    'public.begin_plan_generation(text,text,date,integer,bigint,text,uuid,text,uuid[])', 'EXECUTE')
  and not has_function_privilege('authenticated',
    'public.plan_content_is_valid(jsonb,date,date)', 'EXECUTE'),
  'the owner alone may claim, and the content check stays internal'
);
select ok(
  (select bool_and(prosecdef) and bool_and(proconfig = array['search_path=""'])
   from pg_proc
   where oid in (
     'public.begin_plan_generation(text,text,date,integer,bigint,text,uuid,text,uuid[])'::regprocedure,
     'public.finish_plan_generation(uuid,text,text,text,text,text,text,uuid,text,jsonb,jsonb,text,text)'::regprocedure,
     'public.decide_plan_proposal_item(uuid,integer,text)'::regprocedure,
     'public.finish_plan_proposal_review(uuid,bigint,uuid)'::regprocedure
   )),
  'the four re-issued functions are still definer functions with an empty search path'
);

-- Owners and their plans -------------------------------------------------------

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('8a000000-0000-4000-8000-000000000001', 'replace-owner@example.test', '{}', '{}'),
  ('8a000000-0000-4000-8000-000000000002', 'replace-outsider@example.test', '{}', '{}');
insert into public.profiles (user_id, timezone_name)
select id, 'UTC' from auth.users
where id in (
  '8a000000-0000-4000-8000-000000000001',
  '8a000000-0000-4000-8000-000000000002'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"8a000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

insert into pg_temp_receipt
select 'outsider', * from public.apply_rolling_plan_change_set(
  0, '8a000000-0000-4000-8000-00000000e0ff', 'owner_manual',
  pg_temp.plan_session('8a000000-0000-4000-8000-0000000000bf', pg_temp.day(1), 0, 'Not yours'));

select set_config(
  'request.jwt.claims',
  '{"sub":"8a000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- Long run tomorrow, Strength the day after, two sessions today (one of which
-- gets logged), and one beyond the three days asked about.
insert into pg_temp_receipt
select 'seed', * from public.apply_rolling_plan_change_set(
  0, '8a000000-0000-4000-8000-00000000e001', 'owner_manual',
  pg_temp.plan_session('8a000000-0000-4000-8000-0000000000b1', pg_temp.day(1), 0, 'Long run')
  || pg_temp.plan_session('8a000000-0000-4000-8000-0000000000b2', pg_temp.day(2), 0, 'Strength')
  || pg_temp.plan_session('8a000000-0000-4000-8000-0000000000b3', pg_temp.day(0), 0, 'Logged jog')
  || pg_temp.plan_session('8a000000-0000-4000-8000-0000000000b4', pg_temp.day(5), 0, 'Next week')
  || pg_temp.plan_session('8a000000-0000-4000-8000-0000000000b5', pg_temp.day(0), 1, 'Evening mobility'));

insert into pg_temp_logged
select 'jog', * from public.apply_completion_change(
  'create', null, null,
  jsonb_build_object(
    'planSessionId', '8a000000-0000-4000-8000-0000000000b3',
    'status', 'completed',
    'actualLocalDate', pg_temp.day(0)::text,
    'durationMinutes', 30,
    'activities', '[]'::jsonb));

-- 2. What may be marked --------------------------------------------------------

select throws_ok(
  format($q$select * from public.begin_plan_generation(
    'replace-key-000000000001', 'replace-fingerprint-0001', %L::date, 3, 0,
    null, null, null, array['8a000000-0000-4000-8000-0000000000bf']::uuid[])$q$,
    pg_temp.day(0)),
  'PT409', 'Your plan changed. Reload and try again.',
  'another owner''s session cannot be marked'
);
select throws_ok(
  format($q$select * from public.begin_plan_generation(
    'replace-key-000000000002', 'replace-fingerprint-0002', %L::date, 3, 0,
    null, null, null, array['8a000000-0000-4000-8000-0000000000b3']::uuid[])$q$,
    pg_temp.day(0)),
  'PT409', 'Your plan changed. Reload and try again.',
  'nor a session with training logged against it'
);
select throws_ok(
  format($q$select * from public.begin_plan_generation(
    'replace-key-000000000003', 'replace-fingerprint-0003', %L::date, 3, 0,
    null, null, null, array['8a000000-0000-4000-8000-0000000000b4']::uuid[])$q$,
    pg_temp.day(0)),
  'PT409', 'Your plan changed. Reload and try again.',
  'nor a session outside the days asked about'
);
select throws_ok(
  format($q$select * from public.begin_plan_generation(
    'replace-key-000000000004', 'replace-fingerprint-0004', %L::date, 3, 0,
    null, null, null, array[
      '8a000000-0000-4000-8000-0000000000b1',
      '8a000000-0000-4000-8000-0000000000b1']::uuid[])$q$,
    pg_temp.day(0)),
  '22023', 'Invalid plan request.',
  'the same session twice is not a list of marks'
);
select is(
  (select count(*)::integer from public.plan_generation_requests
   where user_id = '8a000000-0000-4000-8000-000000000001'),
  0,
  'a refused claim leaves no request behind'
);

-- Given out of order on purpose: handles follow the calendar, not the array.
insert into pg_temp_claim
select 'first', * from public.begin_plan_generation(
  'replace-key-000000000010', 'replace-fingerprint-0010', pg_temp.day(0), 3, 0,
  null, null, null, array[
    '8a000000-0000-4000-8000-0000000000b2',
    '8a000000-0000-4000-8000-0000000000b1']::uuid[]);

select is(
  (select array_agg(handle || '=' || right(session_id::text, 2) order by handle)
   from public.plan_generation_replaceable_sessions
   where request_id = (select generation_id from pg_temp_claim where label = 'first')),
  array['r1=b1', 'r2=b2'],
  'the marks are stored with the request, handles in date order'
);

insert into pg_temp_claim
select 'first-replay', * from public.begin_plan_generation(
  'replace-key-000000000010', 'replace-fingerprint-0010', pg_temp.day(0), 3, 0,
  null, null, null, array[
    '8a000000-0000-4000-8000-0000000000b2',
    '8a000000-0000-4000-8000-0000000000b1']::uuid[]);
select is(
  (select state from pg_temp_claim where label = 'first-replay'), 'pending',
  'the same key replays the claim'
);
select is(
  (select count(*)::integer from public.plan_generation_replaceable_sessions
   where user_id = '8a000000-0000-4000-8000-000000000001'),
  2,
  'and writes no mark a second time'
);
select throws_ok(
  $$insert into public.plan_generation_replaceable_sessions
      (request_id, user_id, handle, session_id)
    select generation_id, '8a000000-0000-4000-8000-000000000001', 'r3',
           '8a000000-0000-4000-8000-0000000000b5'
    from pg_temp_claim where label = 'first'$$,
  '42501', null,
  'an owner cannot add a mark of their own to a request'
);

-- 3. The coach names a handle the request issued, once ---------------------------

select throws_ok(
  format($q$select pg_temp.finish_generation('first', %L::jsonb)$q$,
    pg_temp.plan_body(pg_temp.day(0), pg_temp.day(2), jsonb_build_array(
      pg_temp.proposed(pg_temp.day(1), 'Tempo run', 'r9')))),
  '22023', 'Invalid plan result.',
  'a handle the request never issued refuses the answer'
);
select throws_ok(
  format($q$select pg_temp.finish_generation('first', %L::jsonb)$q$,
    pg_temp.plan_body(pg_temp.day(0), pg_temp.day(2), jsonb_build_array(
      pg_temp.proposed(pg_temp.day(1), 'Tempo run', 'r1'),
      pg_temp.proposed(pg_temp.day(2), 'Hill repeats', 'r1')))),
  '22023', 'Invalid plan result.',
  'so does one handle named twice'
);
select throws_ok(
  format($q$select pg_temp.finish_generation('first', %L::jsonb)$q$,
    pg_temp.plan_body(pg_temp.day(0), pg_temp.day(2), jsonb_build_array(
      pg_temp.proposed(pg_temp.day(1), 'Tempo run',
        '8a000000-0000-4000-8000-0000000000b1')))),
  '22023', 'Invalid plan result.',
  'and a session id where a handle belongs'
);

-- Ordinal 0: Easy spin today, replacing nothing. Ordinal 1: Tempo run for the
-- Long run. Ordinal 2: Hill repeats for Strength.
select isnt(
  (select pg_temp.finish_generation('first',
    pg_temp.plan_body(pg_temp.day(0), pg_temp.day(2), jsonb_build_array(
      pg_temp.proposed(pg_temp.day(0), 'Easy spin', null),
      pg_temp.proposed(pg_temp.day(1), 'Tempo run', 'r1'),
      pg_temp.proposed(pg_temp.day(2), 'Hill repeats', 'r2'))))),
  null,
  'a proposal naming each handle once is recorded'
);
select is(
  (select array_agg(title || '>' || coalesce(right(replaces_session_id::text, 2), '-')
                    order by ordinal)
   from public.plan_proposal_items
   where user_id = '8a000000-0000-4000-8000-000000000001'),
  array['Easy spin>-', 'Tempo run>b1', 'Hill repeats>b2'],
  'each item carries the session its handle stood for'
);

-- 4. The three choices ----------------------------------------------------------

select throws_ok(
  $$select public.decide_plan_proposal_item(
    (select id from public.plan_proposals
     where user_id = '8a000000-0000-4000-8000-000000000001'), 0, 'staged_beside')$$,
  '22023', 'Invalid plan proposal decision.',
  '"add beside" is refused on an item that replaces nothing'
);

select lives_ok(
  $$select
      public.decide_plan_proposal_item(p.id, 0, 'rejected'),
      public.decide_plan_proposal_item(p.id, 1, 'staged'),
      public.decide_plan_proposal_item(p.id, 2, 'staged_beside')
    from public.plan_proposals p
    where p.user_id = '8a000000-0000-4000-8000-000000000001'$$,
  'reject one, replace with the second, add the third beside'
);

-- 5. Finish ---------------------------------------------------------------------

insert into pg_temp_review
select 'first', * from public.finish_plan_proposal_review(
  (select id from public.plan_proposals
   where user_id = '8a000000-0000-4000-8000-000000000001'),
  pg_temp.rev('8a000000-0000-4000-8000-000000000001'),
  '8a000000-0000-4000-8000-00000000f001');

select is(
  (select applied_count::integer from pg_temp_review where label = 'first'), 2,
  'two sessions were added'
);
select is(
  (select count(*)::integer from public.rolling_plan_sessions
   where id = '8a000000-0000-4000-8000-0000000000b1'),
  0,
  'the Long run is gone: Replace deleted it'
);
select is(
  (select array_agg(title order by title) from public.rolling_plan_sessions
   where user_id = '8a000000-0000-4000-8000-000000000001'
     and local_date = pg_temp.day(1)),
  array['Tempo run'],
  'and the session standing in for it is the only one on that day'
);
select is(
  (select array_agg(title order by title) from public.rolling_plan_sessions
   where user_id = '8a000000-0000-4000-8000-000000000001'
     and local_date = pg_temp.day(2) and status = 'active'),
  array['Hill repeats', 'Strength'],
  'Add beside kept Strength and added the proposed session next to it'
);
select is(
  (select count(*)::integer from public.rolling_plan_change_entries
   where change_set_id = (select change_set_id from pg_temp_review where label = 'first')),
  3,
  'one change set holds the delete and both adds'
);

-- The mark is as old as the request. Evening mobility is marked, then logged
-- before the review is finished.
insert into pg_temp_claim
select 'second', * from public.begin_plan_generation(
  'replace-key-000000000020', 'replace-fingerprint-0020', pg_temp.day(0), 1,
  pg_temp.rev('8a000000-0000-4000-8000-000000000001'),
  null, null, null, array['8a000000-0000-4000-8000-0000000000b5']::uuid[]);

select isnt(
  (select pg_temp.finish_generation('second',
    pg_temp.plan_body(pg_temp.day(0), pg_temp.day(0), jsonb_build_array(
      pg_temp.proposed(pg_temp.day(0), 'Short strength', 'r1'))))),
  null,
  'a second proposal would replace Evening mobility'
);

insert into pg_temp_logged
select 'mobility', * from public.apply_completion_change(
  'create', null, null,
  jsonb_build_object(
    'planSessionId', '8a000000-0000-4000-8000-0000000000b5',
    'status', 'completed',
    'actualLocalDate', pg_temp.day(0)::text,
    'durationMinutes', 20,
    'activities', '[]'::jsonb));

select lives_ok(
  $$select public.decide_plan_proposal_item(
    (select proposal_id from public.plan_generation_requests
     where id = (select generation_id from pg_temp_claim where label = 'second')),
    0, 'staged')$$,
  'the owner still chooses Replace'
);

insert into pg_temp_review
select 'second', * from public.finish_plan_proposal_review(
  (select proposal_id from public.plan_generation_requests
   where id = (select generation_id from pg_temp_claim where label = 'second')),
  pg_temp.rev('8a000000-0000-4000-8000-000000000001'),
  '8a000000-0000-4000-8000-00000000f002');

select is(
  (select array_agg(title order by title) from public.rolling_plan_sessions
   where user_id = '8a000000-0000-4000-8000-000000000001'
     and local_date = pg_temp.day(0)),
  array['Evening mobility', 'Logged jog', 'Short strength'],
  'a session logged since is never deleted: the proposed one is added beside it'
);
select is(
  (select count(*)::integer from public.completions
   where plan_session_id = '8a000000-0000-4000-8000-0000000000b5'),
  1,
  'and its log still has the plan entry it was measured against'
);

-- 6. One occurrence of a series ---------------------------------------------------

insert into pg_temp_receipt
select 'series', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('8a000000-0000-4000-8000-000000000001'),
  '8a000000-0000-4000-8000-00000000e002', 'owner_manual',
  jsonb_build_array(jsonb_build_object(
    'operation', 'add_series',
    'seriesId', '8a000000-0000-4000-8000-0000000000a1',
    'series', jsonb_build_object(
      'frequency', 'daily',
      'intervalCount', 1,
      'startDate', pg_temp.day(3)::text,
      'title', 'Club run',
      'sport', 'Running',
      'expectedDurationMinutes', 50,
      'activities', '[]'::jsonb))));
insert into pg_temp_receipt (label)
select 'materialize' from public.materialize_rolling_plan_series(
  pg_temp.rev('8a000000-0000-4000-8000-000000000001'),
  '8a000000-0000-4000-8000-00000000e003');

insert into pg_temp_claim
select 'third', * from public.begin_plan_generation(
  'replace-key-000000000030', 'replace-fingerprint-0030', pg_temp.day(3), 1,
  pg_temp.rev('8a000000-0000-4000-8000-000000000001'),
  null, null, null,
  (select array_agg(id) from public.rolling_plan_sessions
   where series_id = '8a000000-0000-4000-8000-0000000000a1'
     and local_date = pg_temp.day(3)));

select isnt(
  (select pg_temp.finish_generation('third',
    pg_temp.plan_body(pg_temp.day(3), pg_temp.day(3), jsonb_build_array(
      pg_temp.proposed(pg_temp.day(3), 'Track session', 'r1'))))),
  null,
  'a proposal would replace one Club run'
);
select lives_ok(
  $$select public.decide_plan_proposal_item(
    (select proposal_id from public.plan_generation_requests
     where id = (select generation_id from pg_temp_claim where label = 'third')),
    0, 'staged')$$,
  'and the owner chooses Replace'
);
insert into pg_temp_review
select 'third', * from public.finish_plan_proposal_review(
  (select proposal_id from public.plan_generation_requests
   where id = (select generation_id from pg_temp_claim where label = 'third')),
  pg_temp.rev('8a000000-0000-4000-8000-000000000001'),
  '8a000000-0000-4000-8000-00000000f003');

select is(
  (select array_agg(title order by title) from public.rolling_plan_sessions
   where user_id = '8a000000-0000-4000-8000-000000000001'
     and local_date = pg_temp.day(3) and status = 'active'),
  array['Track session'],
  'that day''s Club run is replaced'
);
select ok(
  (select count(*) > 0 from public.rolling_plan_sessions
   where series_id = '8a000000-0000-4000-8000-0000000000a1'
     and local_date = pg_temp.day(4) and status = 'active')
  and (select pg_temp.day(3) = any (skipped_occurrence_dates)
       from public.rolling_plan_series
       where id = '8a000000-0000-4000-8000-0000000000a1'),
  'the next day''s is untouched, and the series will not write the replaced one back'
);

-- 7. Not across owners -------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"8a000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select is(
  (select count(*)::integer from public.plan_generation_replaceable_sessions),
  0,
  'another owner reads none of these marks'
);
select throws_ok(
  format($q$select * from public.finish_plan_proposal_review(
    %L::uuid, 0, '8a000000-0000-4000-8000-00000000f0ff')$q$,
    (select proposal_id from pg_temp_review where label = 'first')),
  'PT409', 'That proposal is no longer available.',
  'and cannot finish a review that is not theirs'
);

select * from finish();
rollback;
