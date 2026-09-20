-- M3-16B: a plan proposal records the roadmap it was planned under.
--
-- The migration widens one check constraint and reproduces
-- `finish_plan_generation` to widen the same list a second time, inside the
-- function. Two places, one fact, and the failure mode if they ever drift is
-- silent in opposite directions: a function that still refuses the value the
-- constraint accepts loses lineage nobody notices, and a constraint narrower
-- than the function turns a proposal into an error at the last step. So both
-- are asserted here, and they are asserted through the function rather than by
-- inserting into the table, because the function is the only writer that
-- exists — `plan_proposal_sources` grants no insert to anyone.
--
-- What is deliberately not re-proved: the privilege matrix, the replay rules,
-- the advisory lock and the change-set path. None of them moved, and
-- `m3_16a_plan_proposal_application.test.sql` owns them. A second copy would be
-- a second thing to keep true.
--
-- Dates come from UTC today for the reason 16A's suite gives: the begin
-- function refuses a start earlier than the day before its own UTC date, so a
-- literal would pass until it did not.

begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

create function pg_temp.day(p_offset integer)
returns date
language sql
stable
as $$
  select ((clock_timestamp() at time zone 'utc')::date + p_offset)
$$;

create function pg_temp.plan_body(p_start date, p_end date)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'schemaVersion', 'fittip.seven-day-plan.v2',
    'weekDescription', 'One easy session to open the block.',
    'startDate', p_start::text,
    'endDate', p_end::text,
    'sessions', jsonb_build_array(
      jsonb_build_object(
        'date', p_start::text,
        'title', 'Easy aerobic session',
        'sport', 'Running',
        'focus', 'Aerobic base',
        'intent', 'Conversational throughout.',
        'durationMinutes', 45,
        'primaryGoalId', '7b000000-0000-4000-8000-000000000010',
        'secondaryGoalIds', jsonb_build_array(),
        'rationale', 'Opens the week without cost.'
      )
    ),
    'assumptions', jsonb_build_array(),
    'uncertainties', jsonb_build_array()
  )
$$;

-- The constraint itself -------------------------------------------------------
--
-- Read from the catalog rather than exercised, so the assertion names the list
-- the table will accept even if no function ever offered it one.

select matches(
  (select pg_get_constraintdef(oid)
   from pg_constraint
   where conrelid = 'public.plan_proposal_sources'::regclass
     and conname = 'plan_proposal_sources_kind_check'),
  'roadmap_version',
  'the sources table accepts a roadmap version as a kind'
);

select matches(
  (select pg_get_constraintdef(oid)
   from pg_constraint
   where conrelid = 'public.plan_proposal_sources'::regclass
     and conname = 'plan_proposal_sources_kind_check'),
  'completion',
  'widening the list kept every kind that was already on it'
);

-- Owners ----------------------------------------------------------------------

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values ('7b000000-0000-4000-8000-000000000001', 'lineage-owner@example.test',
        '{}', '{}');
insert into public.profiles (user_id, timezone_name)
values ('7b000000-0000-4000-8000-000000000001', 'UTC');

-- No goal row. `plan_content_is_valid` checks the shape of the content, not
-- whether the goal ids inside it resolve, which is why 16A's suite inserts
-- none either. Recording one here would assert a relationship the function
-- does not have.

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"7b000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

create temporary table pg_temp_claim (
  generation_id uuid,
  completion_token uuid,
  state text,
  proposal_id uuid
) on commit drop;

insert into pg_temp_claim
select * from public.begin_plan_generation(
  'lineage-key-000000000001', 'lineage-fingerprint-00000001',
  pg_temp.day(0), 1, 0
);

-- A roadmap version is accepted, stored and readable ---------------------------

select is(
  (select proposal_id is not null from public.finish_plan_generation(
    (select completion_token from pg_temp_claim),
    'proposal',
    'fittip.seven-day-plan.v2',
    'seven-day-plan-v2-2026-08-12',
    'fixture',
    'fixture-corpus-v1',
    'fixture-no-spend',
    null,
    null,
    pg_temp.plan_body(pg_temp.day(0), pg_temp.day(0)),
    jsonb_build_array(
      jsonb_build_object(
        'kind', 'roadmap_version',
        'recordId', '7b000000-0000-4000-8000-000000000050',
        'revisionNumber', 3
      ),
      jsonb_build_object(
        'kind', 'completion',
        'recordId', '7b000000-0000-4000-8000-000000000060',
        'revisionNumber', 2
      )
    ),
    null
  )),
  true,
  'a finish carrying a roadmap version closes with a proposal'
);

select is(
  (select source_kind from public.plan_proposal_sources
   where user_id = '7b000000-0000-4000-8000-000000000001'
     and record_id = '7b000000-0000-4000-8000-000000000050'),
  'roadmap_version',
  'the roadmap version is stored as its own kind'
);

select is(
  (select revision_number from public.plan_proposal_sources
   where user_id = '7b000000-0000-4000-8000-000000000001'
     and record_id = '7b000000-0000-4000-8000-000000000050'),
  3::bigint,
  'the version number is stored as the revision, not discarded'
);

-- The other kinds still work beside it, which is the half of the change that
-- would fail silently: a reproduced function that dropped a kind would lose
-- lineage without refusing anything.
select is(
  (select count(*)::integer from public.plan_proposal_sources
   where user_id = '7b000000-0000-4000-8000-000000000001'),
  2,
  'the completion source is recorded alongside the roadmap version'
);

select is(
  (select ordinal from public.plan_proposal_sources
   where user_id = '7b000000-0000-4000-8000-000000000001'
     and source_kind = 'completion'),
  1::smallint,
  'sources keep the order the caller sent them in'
);

-- An unknown kind is still refused --------------------------------------------
--
-- The function validates before it inserts, so this is the function's list
-- being asserted and not the constraint's. Both must reject it; only the
-- function can report it as a plan error rather than a constraint violation.

-- Its own table rather than a second row in `pg_temp_claim`. A finished
-- request replays rather than re-validating, so picking the wrong token here
-- would return the first proposal and assert nothing — which is exactly what
-- the first draft of this test did.
create temporary table pg_temp_claim_two (
  generation_id uuid,
  completion_token uuid,
  state text,
  proposal_id uuid
) on commit drop;

insert into pg_temp_claim_two
select * from public.begin_plan_generation(
  'lineage-key-000000000002', 'lineage-fingerprint-00000002',
  pg_temp.day(1), 1, 0
);

select throws_ok(
  format(
    $$select * from public.finish_plan_generation(
      %L::uuid, 'proposal', 'fittip.seven-day-plan.v2',
      'seven-day-plan-v2-2026-08-12', 'fixture', 'fixture-corpus-v1',
      'fixture-no-spend', null, null, %L::jsonb,
      '[{"kind":"roadmap","recordId":"7b000000-0000-4000-8000-000000000051"}]'::jsonb,
      null)$$,
    (select completion_token from pg_temp_claim_two),
    pg_temp.plan_body(pg_temp.day(1), pg_temp.day(1))
  ),
  '22023', 'Invalid plan result.',
  'a kind outside the list is refused, and the near miss "roadmap" is one'
);

select finish();
rollback;
