-- A week the coach leaves as it is (owner, 17 October 2026).
--
-- A plan answer with no sessions is valid: the coach says in its week
-- description why the days need nothing added. What this proves:
--
--   1. The content check accepts an empty list, and nothing else loosened:
--      too many sessions, a missing description and wrong dates still fail.
--   2. Such an answer is recorded as a proposal with no items at all: its
--      free days are not offered as recovery days (owner, 17 Oct 2026).
--   3. Finishing its review closes it as applied with a count of 0, with no
--      change set, and the plan's revision does not move.

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

create function pg_temp.plan_body(
  p_start date, p_end date, p_sessions jsonb, p_description text
)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'schemaVersion', 'fittip.seven-day-plan.v2',
    'weekDescription', p_description,
    'startDate', p_start::text,
    'endDate', p_end::text,
    'sessions', p_sessions
  )
$$;

create function pg_temp.proposed(p_date date)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'date', p_date::text,
    'title', 'Easy run',
    'sport', 'Running',
    'focus', 'Repeatable easy work you could do again tomorrow.',
    'intent', 'Conversational the whole way.',
    'durationMinutes', 30,
    'primaryGoalId', 'goal-1',
    'rationale', 'Most of this horizon stays easy so the work is repeatable.'
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

select plan(12);

-- 1. The content check ----------------------------------------------------------

select ok(
  public.plan_content_is_valid(
    pg_temp.plan_body(pg_temp.day(0), pg_temp.day(6), '[]'::jsonb,
      'The week already holds a walk and two run/walks; nothing is added.'),
    pg_temp.day(0), pg_temp.day(6)),
  'a plan with no sessions and a description is valid'
);
select ok(
  not public.plan_content_is_valid(
    pg_temp.plan_body(pg_temp.day(0), pg_temp.day(0),
      jsonb_build_array(
        pg_temp.proposed(pg_temp.day(0)), pg_temp.proposed(pg_temp.day(0)),
        pg_temp.proposed(pg_temp.day(0)), pg_temp.proposed(pg_temp.day(0))),
      'Four on one day.'),
    pg_temp.day(0), pg_temp.day(0)),
  'more than three sessions a day is still refused'
);
select ok(
  not public.plan_content_is_valid(
    pg_temp.plan_body(pg_temp.day(0), pg_temp.day(6), '[]'::jsonb, ''),
    pg_temp.day(0), pg_temp.day(6)),
  'an empty week without a description is refused'
);
select ok(
  not public.plan_content_is_valid(
    pg_temp.plan_body(pg_temp.day(1), pg_temp.day(6), '[]'::jsonb,
      'Nothing to add.'),
    pg_temp.day(0), pg_temp.day(6)),
  'an empty week for other dates than asked is refused'
);
select ok(
  not has_function_privilege('authenticated',
    'public.plan_content_is_valid(jsonb,date,date)', 'EXECUTE')
  and not has_function_privilege('anon',
    'public.plan_content_is_valid(jsonb,date,date)', 'EXECUTE')
  and not has_function_privilege('service_role',
    'public.plan_content_is_valid(jsonb,date,date)', 'EXECUTE'),
  'the content check stays internal'
);

-- 2. An empty answer becomes a proposal with no items -------------------------

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values ('8b000000-0000-4000-8000-000000000001', 'empty-week@example.test', '{}', '{}');
insert into public.profiles (user_id, timezone_name)
values ('8b000000-0000-4000-8000-000000000001', 'UTC');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"8b000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

insert into pg_temp_receipt
select 'seed', * from public.apply_rolling_plan_change_set(
  0, '8b000000-0000-4000-8000-00000000e001', 'owner_manual',
  jsonb_build_array(jsonb_build_object(
    'operation', 'add',
    'sessionId', '8b000000-0000-4000-8000-0000000000b1',
    'session', jsonb_build_object(
      'localDate', pg_temp.day(1)::text,
      'position', 0,
      'title', 'Run/walk',
      'sport', 'Running',
      'expectedDurationMinutes', 30,
      'activities', '[]'::jsonb))));

insert into pg_temp_claim
select 'empty', * from public.begin_plan_generation(
  'empty-week-key-0000000001', 'empty-week-fingerprint-01', pg_temp.day(0), 3,
  pg_temp.rev('8b000000-0000-4000-8000-000000000001'),
  null, null, null, array[]::uuid[]);

select isnt(
  (select proposal_id from public.finish_plan_generation(
    (select completion_token from pg_temp_claim where label = 'empty'),
    'proposal', 'fittip.seven-day-plan.v2', 'seven-day-plan-v2-2026-08-12',
    'fixture', 'fixture-corpus-v1', 'fixture-no-spend', null,
    null,
    pg_temp.plan_body(pg_temp.day(0), pg_temp.day(2), '[]'::jsonb,
      'The run/walk tomorrow is the right load for these three days.'),
    null, null, null)),
  null,
  'an answer with no sessions is recorded as a proposal'
);
select is(
  (select count(*)::integer from public.plan_proposal_items
   where user_id = '8b000000-0000-4000-8000-000000000001' and kind = 'session'),
  0,
  'with no proposed session'
);
select is(
  (select count(*)::integer from public.plan_proposal_items
   where user_id = '8b000000-0000-4000-8000-000000000001' and kind = 'recovery_day'),
  0,
  'and its two free days are not offered as recovery days'
);

-- 3. Finishing it changes nothing -----------------------------------------------

insert into pg_temp_review
select 'empty', * from public.finish_plan_proposal_review(
  (select id from public.plan_proposals
   where user_id = '8b000000-0000-4000-8000-000000000001'),
  pg_temp.rev('8b000000-0000-4000-8000-000000000001'),
  '8b000000-0000-4000-8000-00000000f001');

select is(
  (select decision || ':' || applied_count from pg_temp_review where label = 'empty'),
  'applied:0',
  'finishing the review closes it with nothing applied'
);
select is(
  (select change_set_id from pg_temp_review where label = 'empty'),
  null,
  'without a change set'
);
select is(
  pg_temp.rev('8b000000-0000-4000-8000-000000000001'),
  (select plan_revision from pg_temp_receipt where label = 'seed'),
  'and the plan''s revision has not moved'
);

-- 4. Beside a proposed session, free days are still offered -----------------

insert into pg_temp_claim
select 'one', * from public.begin_plan_generation(
  'empty-week-key-0000000002', 'empty-week-fingerprint-02', pg_temp.day(3), 3,
  pg_temp.rev('8b000000-0000-4000-8000-000000000001'),
  null, null, null, array[]::uuid[]);

select public.finish_plan_generation(
  (select completion_token from pg_temp_claim where label = 'one'),
  'proposal', 'fittip.seven-day-plan.v2', 'seven-day-plan-v2-2026-08-12',
  'fixture', 'fixture-corpus-v1', 'fixture-no-spend', null,
  null,
  pg_temp.plan_body(pg_temp.day(3), pg_temp.day(5),
    jsonb_build_array(pg_temp.proposed(pg_temp.day(4))),
    'One easy run in the middle of three days.'),
  null, null, null);

select is(
  (select array_agg(item.kind || '@' || (item.local_date - pg_temp.day(3))
     order by item.local_date)
   from public.plan_proposal_items item
   join public.plan_proposals proposal on proposal.id = item.proposal_id
   join public.plan_generation_requests request
     on request.id = proposal.generation_request_id
   where request.idempotency_key = 'empty-week-key-0000000002'),
  array['recovery_day@0', 'session@1', 'recovery_day@2'],
  'beside one proposed session the free days are offered as before'
);

select * from finish();
rollback;
