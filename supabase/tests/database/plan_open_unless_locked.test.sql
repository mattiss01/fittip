-- A plan proposal may change any session not locked, and suggest cancelling
-- one (ADR-033). The handles and what may be offered are proved in
-- `proposal_replaces.test.sql`; this file proves what is new:
--
--   1. The record of what a review cancelled: readable by its owner, written
--      by nobody directly.
--   2. A suggested cancel names a handle the request issued, once across
--      replacing and cancelling, with a reason, or the answer is refused whole.
--   3. A cancel is an item of its own, with the session's title and the
--      coach's reason; "add beside" is refused on it.
--   4. Finish cancels a replaced session and a staged cancel's session,
--      records both, writes no cancellation reason, and leaves a session that
--      was never offered alone.
--   5. A session cancelled by hand since is left alone and not recorded.
--   6. A session brought back no longer matches its record.

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
    'sport', 'Cycling',
    'focus', 'Easy aerobic work that spares the legs.',
    'intent', 'Seated and easy the whole way.',
    'durationMinutes', 40,
    'primaryGoalId', 'goal-1',
    'rationale', 'Keeps the aerobic work without the impact of running.',
    'replaces', p_replaces
  ))
$$;

create function pg_temp.plan_body(
  p_start date, p_end date, p_sessions jsonb, p_cancels jsonb
)
returns jsonb
language sql
stable
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'schemaVersion', 'fittip.seven-day-plan.v2',
    'weekDescription', 'A lighter week around a sore shin.',
    'startDate', p_start::text,
    'endDate', p_end::text,
    'sessions', p_sessions,
    'cancels', p_cancels
  ))
$$;

create function pg_temp.cancel(p_handle text, p_reason text)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object('replaceHandle', p_handle, 'reason', p_reason)
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
create temporary table pg_temp_review (
  label text primary key,
  proposal_id uuid,
  decision text,
  applied_count smallint,
  change_set_id uuid,
  plan_revision bigint,
  state text
);
grant all on pg_temp_claim, pg_temp_receipt, pg_temp_review to public;

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

select plan(30);

-- 1. The boundary ------------------------------------------------------------

select has_table('public', 'plan_proposal_cancellations',
  'what a review cancelled has a table');
select ok(
  (select relrowsecurity from pg_class
   where oid = 'public.plan_proposal_cancellations'::regclass),
  'with row level security on'
);
select ok(
  has_table_privilege('authenticated', 'public.plan_proposal_cancellations', 'SELECT')
  and not has_table_privilege('authenticated', 'public.plan_proposal_cancellations', 'INSERT')
  and not has_table_privilege('authenticated', 'public.plan_proposal_cancellations', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.plan_proposal_cancellations', 'DELETE')
  and not has_table_privilege('anon', 'public.plan_proposal_cancellations', 'SELECT')
  and not has_table_privilege('service_role', 'public.plan_proposal_cancellations', 'SELECT'),
  'an owner may read it; nobody writes it except through the finish'
);
select policies_are('public', 'plan_proposal_cancellations',
  array['plan_proposal_cancellations_owner_select'],
  'its one policy is the owner''s read');

-- Owners and their plans -------------------------------------------------------

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('8b000000-0000-4000-8000-000000000001', 'open-owner@example.test', '{}', '{}'),
  ('8b000000-0000-4000-8000-000000000002', 'open-outsider@example.test', '{}', '{}');
insert into public.profiles (user_id, timezone_name)
select id, 'UTC' from auth.users
where id in (
  '8b000000-0000-4000-8000-000000000001',
  '8b000000-0000-4000-8000-000000000002'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"8b000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- Run tomorrow, Intervals and Strength the day after, Club run tomorrow (the
-- one the owner locks, so it is never offered).
insert into pg_temp_receipt
select 'seed', * from public.apply_rolling_plan_change_set(
  0, '8b000000-0000-4000-8000-00000000e001', 'owner_manual',
  pg_temp.plan_session('8b000000-0000-4000-8000-0000000000c1', pg_temp.day(1), 0, 'Run')
  || pg_temp.plan_session('8b000000-0000-4000-8000-0000000000c2', pg_temp.day(2), 0, 'Intervals')
  || pg_temp.plan_session('8b000000-0000-4000-8000-0000000000c3', pg_temp.day(2), 1, 'Strength')
  || pg_temp.plan_session('8b000000-0000-4000-8000-0000000000c4', pg_temp.day(1), 1, 'Club run'));

-- Offered: Run (r1), Intervals (r2), Strength (r3). Club run is locked.
insert into pg_temp_claim
select 'first', * from public.begin_plan_generation(
  'open-key-0000000000000001', 'open-fingerprint-00000001', pg_temp.day(0), 3, 0,
  null, null, null, array[
    '8b000000-0000-4000-8000-0000000000c1',
    '8b000000-0000-4000-8000-0000000000c2',
    '8b000000-0000-4000-8000-0000000000c3']::uuid[]);

-- 2. A cancel names an issued handle, once, with a reason -------------------------

select throws_ok(
  format($q$select pg_temp.finish_generation('first', %L::jsonb)$q$,
    pg_temp.plan_body(pg_temp.day(0), pg_temp.day(2), '[]'::jsonb,
      jsonb_build_array(pg_temp.cancel('r9', 'Your shin needs the rest.')))),
  '22023', 'Invalid plan result.',
  'a cancel naming a handle the request never issued refuses the answer'
);
select throws_ok(
  format($q$select pg_temp.finish_generation('first', %L::jsonb)$q$,
    pg_temp.plan_body(pg_temp.day(0), pg_temp.day(2),
      jsonb_build_array(pg_temp.proposed(pg_temp.day(1), 'Easy spin', 'r1')),
      jsonb_build_array(pg_temp.cancel('r1', 'Your shin needs the rest.')))),
  '22023', 'Invalid plan result.',
  'so does one handle both replaced and cancelled'
);
select throws_ok(
  format($q$select pg_temp.finish_generation('first', %L::jsonb)$q$,
    pg_temp.plan_body(pg_temp.day(0), pg_temp.day(2), '[]'::jsonb,
      jsonb_build_array(
        pg_temp.cancel('r2', 'Your shin needs the rest.'),
        pg_temp.cancel('r2', 'Twice.')))),
  '22023', 'Invalid plan result.',
  'and one handle cancelled twice'
);
select throws_ok(
  format($q$select pg_temp.finish_generation('first', %L::jsonb)$q$,
    pg_temp.plan_body(pg_temp.day(0), pg_temp.day(2), '[]'::jsonb,
      jsonb_build_array(pg_temp.cancel('r2', repeat('a', 161))))),
  '22023', 'Invalid plan result.',
  'a reason over 160 characters is invalid content'
);
select throws_ok(
  format($q$select pg_temp.finish_generation('first', %L::jsonb)$q$,
    pg_temp.plan_body(pg_temp.day(0), pg_temp.day(2), '[]'::jsonb,
      jsonb_build_array(pg_temp.cancel('r2', '   ')))),
  '22023', 'Invalid plan result.',
  'and so is a blank one'
);
select throws_ok(
  format($q$select pg_temp.finish_generation('first', %L::jsonb)$q$,
    pg_temp.plan_body(pg_temp.day(0), pg_temp.day(2), '[]'::jsonb,
      jsonb_build_array(pg_temp.cancel('r2', 'Your shin needs the rest.')
        || '{"sessionId":"8b000000-0000-4000-8000-0000000000c2"}'::jsonb))),
  '22023', 'Invalid plan result.',
  'a cancel carries a handle and a reason, never a session id'
);

-- Easy spin stands in for the Run; Intervals is suggested off; Strength stays.
select isnt(
  (select pg_temp.finish_generation('first',
    pg_temp.plan_body(pg_temp.day(0), pg_temp.day(2),
      jsonb_build_array(pg_temp.proposed(pg_temp.day(1), 'Easy spin', 'r1')),
      jsonb_build_array(pg_temp.cancel('r2', '  Your shin needs two easy days.  '))))),
  null,
  'a proposal that replaces one session and cancels another is recorded'
);

-- 3. A cancel is an item of its own ------------------------------------------------

select is(
  (select array_agg(
            kind || ':' || title || '>' || right(replaces_session_id::text, 2)
            || coalesce(':' || rationale, '')
            order by ordinal)
   from public.plan_proposal_items
   where user_id = '8b000000-0000-4000-8000-000000000001'
     and replaces_session_id is not null),
  array[
    'session:Easy spin>c1:Keeps the aerobic work without the impact of running.',
    'cancel:Intervals>c2:Your shin needs two easy days.'
  ],
  'the cancel carries the session''s title and the coach''s reason, trimmed'
);
select is(
  (select local_date from public.plan_proposal_items
   where user_id = '8b000000-0000-4000-8000-000000000001' and kind = 'cancel'),
  pg_temp.day(2),
  'on the day of the session it names'
);
select throws_ok(
  $$select public.decide_plan_proposal_item(
    item.proposal_id, item.ordinal, 'staged_beside')
    from public.plan_proposal_items item
    where item.user_id = '8b000000-0000-4000-8000-000000000001'
      and item.kind = 'cancel'$$,
  '22023', 'Invalid plan proposal decision.',
  '"add beside" is refused on a cancel'
);
select lives_ok(
  $$select public.decide_plan_proposal_item(item.proposal_id, item.ordinal, 'staged')
    from public.plan_proposal_items item
    where item.user_id = '8b000000-0000-4000-8000-000000000001'$$,
  'the owner accepts both: replace the Run, cancel Intervals'
);

-- 4. Finish ---------------------------------------------------------------------

insert into pg_temp_review
select 'first', * from public.finish_plan_proposal_review(
  (select id from public.plan_proposals
   where user_id = '8b000000-0000-4000-8000-000000000001'),
  pg_temp.rev('8b000000-0000-4000-8000-000000000001'),
  '8b000000-0000-4000-8000-00000000f001');

select is(
  (select applied_count::integer from pg_temp_review where label = 'first'), 2,
  'one session added and one cancelled count as two applied'
);
select is(
  (select array_agg(title || '=' || status order by title)
   from public.rolling_plan_sessions
   where user_id = '8b000000-0000-4000-8000-000000000001'),
  array['Club run=active', 'Easy spin=active', 'Intervals=cancelled',
        'Run=cancelled', 'Strength=active'],
  'the Run and Intervals are cancelled; the locked Club run and Strength stay'
);
select is(
  (select array_agg(
            right(cancelled.session_id::text, 2) || '>'
            || coalesce(replacement.title, '-')
            || ':' || (cancelled.cancelled_at = session.cancelled_at)::text
            order by cancelled.session_id)
   from public.plan_proposal_cancellations cancelled
   join public.rolling_plan_sessions session on session.id = cancelled.session_id
   left join public.rolling_plan_sessions replacement
     on replacement.id = cancelled.replaced_by_session_id),
  array['c1>Easy spin:true', 'c2>-:true'],
  'both are recorded: the Run with what replaced it, each with its cancellation'
);
select is(
  (select count(*)::integer from public.rolling_plan_session_cancellations
   where user_id = '8b000000-0000-4000-8000-000000000001'),
  0,
  'and no cancellation reason is written: those reach the coach as the athlete''s'
);
select throws_ok(
  $$insert into public.plan_proposal_cancellations
      (proposal_id, session_id, user_id, cancelled_at)
    select id, '8b000000-0000-4000-8000-0000000000c3',
           '8b000000-0000-4000-8000-000000000001', now()
    from public.plan_proposals
    where user_id = '8b000000-0000-4000-8000-000000000001'$$,
  '42501', null,
  'an owner cannot record a cancellation of their own'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"8b000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is(
  (select count(*)::integer from public.plan_proposal_cancellations), 0,
  'another owner reads none of it'
);
select set_config(
  'request.jwt.claims',
  '{"sub":"8b000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- 5. A session cancelled by hand since is left alone -----------------------------

insert into pg_temp_claim
select 'second', * from public.begin_plan_generation(
  'open-key-0000000000000002', 'open-fingerprint-00000002', pg_temp.day(0), 3,
  pg_temp.rev('8b000000-0000-4000-8000-000000000001'),
  null, null, null, array['8b000000-0000-4000-8000-0000000000c3']::uuid[]);

select isnt(
  (select pg_temp.finish_generation('second',
    pg_temp.plan_body(pg_temp.day(0), pg_temp.day(2), '[]'::jsonb,
      jsonb_build_array(pg_temp.cancel('r1', 'Strength the day after intervals is a lot.'))))),
  null,
  'a proposal that only cancels is recorded'
);

insert into pg_temp_receipt
select 'by-hand', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('8b000000-0000-4000-8000-000000000001'),
  '8b000000-0000-4000-8000-00000000e002', 'owner_manual',
  jsonb_build_array(jsonb_build_object(
    'operation', 'cancel', 'sessionId', '8b000000-0000-4000-8000-0000000000c3')));

select lives_ok(
  $$select public.decide_plan_proposal_item(item.proposal_id, item.ordinal, 'staged')
    from public.plan_proposal_items item
    join pg_temp_claim claim on claim.label = 'second'
    join public.plan_generation_requests request on request.id = claim.generation_id
    where item.proposal_id = request.proposal_id$$,
  'the owner accepts the cancel the plan has already made true'
);

insert into pg_temp_review
select 'second', * from public.finish_plan_proposal_review(
  (select request.proposal_id
   from pg_temp_claim claim
   join public.plan_generation_requests request on request.id = claim.generation_id
   where claim.label = 'second'),
  pg_temp.rev('8b000000-0000-4000-8000-000000000001'),
  '8b000000-0000-4000-8000-00000000f002');

select is(
  (select applied_count::integer from pg_temp_review where label = 'second'), 0,
  'nothing is applied for a session no longer active'
);
select is(
  (select count(*)::integer from public.plan_proposal_cancellations
   where session_id = '8b000000-0000-4000-8000-0000000000c3'),
  0,
  'and the owner''s own cancellation is not recorded as the coach''s'
);

-- 6. Brought back ------------------------------------------------------------------

insert into pg_temp_receipt
select 'back', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('8b000000-0000-4000-8000-000000000001'),
  '8b000000-0000-4000-8000-00000000e003', 'owner_manual',
  jsonb_build_array(jsonb_build_object(
    'operation', 'reactivate', 'sessionId', '8b000000-0000-4000-8000-0000000000c1')));

select is(
  (select session.status || ':'
          || (cancelled.cancelled_at is not distinct from session.cancelled_at)::text
   from public.plan_proposal_cancellations cancelled
   join public.rolling_plan_sessions session on session.id = cancelled.session_id
   where cancelled.session_id = '8b000000-0000-4000-8000-0000000000c1'),
  'active:false',
  'a replaced session brought back is active and no longer matches its record'
);

-- 7. A cancel only, and one whose session moved away ------------------------------

insert into pg_temp_receipt
select 'more', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('8b000000-0000-4000-8000-000000000001'),
  '8b000000-0000-4000-8000-00000000e004', 'owner_manual',
  pg_temp.plan_session('8b000000-0000-4000-8000-0000000000c5', pg_temp.day(1), 5, 'Hill reps')
  || pg_temp.plan_session('8b000000-0000-4000-8000-0000000000c6', pg_temp.day(2), 5, 'Tempo'));

-- Hill reps is r1, Tempo r2.
insert into pg_temp_claim
select 'third', * from public.begin_plan_generation(
  'open-key-0000000000000003', 'open-fingerprint-00000003', pg_temp.day(0), 3,
  pg_temp.rev('8b000000-0000-4000-8000-000000000001'),
  null, null, null, array[
    '8b000000-0000-4000-8000-0000000000c5',
    '8b000000-0000-4000-8000-0000000000c6']::uuid[]);

-- While the coach answers, the owner moves Tempo off the days asked about.
insert into pg_temp_receipt
select 'moved', * from public.apply_rolling_plan_change_set(
  pg_temp.rev('8b000000-0000-4000-8000-000000000001'),
  '8b000000-0000-4000-8000-00000000e005', 'owner_manual',
  jsonb_build_array(jsonb_build_object(
    'operation', 'move', 'sessionId', '8b000000-0000-4000-8000-0000000000c6',
    'localDate', pg_temp.day(5)::text, 'position', 0)));

select isnt(
  (select pg_temp.finish_generation('third',
    pg_temp.plan_body(pg_temp.day(0), pg_temp.day(2), '[]'::jsonb,
      jsonb_build_array(
        pg_temp.cancel('r1', 'Hills can wait a week.'),
        pg_temp.cancel('r2', 'Tempo can wait too.'))))),
  null,
  'an answer cancelling a session moved off the days is still recorded'
);
select is(
  (select array_agg(item.title order by item.ordinal)
   from public.plan_proposal_items item
   join pg_temp_claim claim on claim.label = 'third'
   join public.plan_generation_requests request on request.id = claim.generation_id
   where item.proposal_id = request.proposal_id),
  array['Hill reps'],
  'but only the cancel still on those days becomes an item, so none is left undecidable'
);

select lives_ok(
  $$select public.decide_plan_proposal_item(item.proposal_id, item.ordinal, 'staged')
    from public.plan_proposal_items item
    join pg_temp_claim claim on claim.label = 'third'
    join public.plan_generation_requests request on request.id = claim.generation_id
    where item.proposal_id = request.proposal_id$$,
  'the owner accepts the cancel'
);

insert into pg_temp_review
select 'third', * from public.finish_plan_proposal_review(
  (select request.proposal_id
   from pg_temp_claim claim
   join public.plan_generation_requests request on request.id = claim.generation_id
   where claim.label = 'third'),
  pg_temp.rev('8b000000-0000-4000-8000-000000000001'),
  '8b000000-0000-4000-8000-00000000f003');

select is(
  (select (select applied_count::integer from pg_temp_review where label = 'third')
          || ':' || session.status || ':'
          || coalesce(cancelled.replaced_by_session_id::text, 'none')
   from public.rolling_plan_sessions session
   join public.plan_proposal_cancellations cancelled
     on cancelled.session_id = session.id
     and cancelled.cancelled_at = session.cancelled_at
   where session.id = '8b000000-0000-4000-8000-0000000000c5'),
  '1:cancelled:none',
  'a proposal that only cancels applies it, recorded with no replacement'
);

select * from finish();
rollback;
