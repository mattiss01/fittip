begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

-- ---------------------------------------------------------------------------
-- Structure, privileges and policies, asserted before any behaviour.
-- ---------------------------------------------------------------------------

select has_table('public', 'plan_generation_requests', 'the plan generation request table exists');
select has_table('public', 'plan_proposals', 'the plan proposal table exists');
select has_table('public', 'plan_proposal_sources', 'the plan proposal source table exists');
select has_table('public', 'plan_proposal_decisions', 'the plan proposal decision table exists');

select ok(
  (
    select bool_and(relrowsecurity)
    from pg_class
    where oid in (
      'public.plan_generation_requests'::regclass,
      'public.plan_proposals'::regclass,
      'public.plan_proposal_sources'::regclass,
      'public.plan_proposal_decisions'::regclass
    )
  ),
  'every plan proposal table has row level security enabled'
);

-- Direct writes are revoked everywhere. The functions are the only write path,
-- so there is no privilege to weaken later.
select ok(
  not exists (
    select 1
    from unnest(array[
      'public.plan_generation_requests',
      'public.plan_proposals',
      'public.plan_proposal_sources',
      'public.plan_proposal_decisions'
    ]) as relation
    cross join unnest(array['authenticated', 'anon']) as grantee
    cross join unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) as privilege
    where has_table_privilege(grantee, relation, privilege)
  ),
  'no authenticated or anonymous role holds a direct plan proposal write privilege'
);

select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'plan_generation_requests', 'plan_proposals', 'plan_proposal_sources',
        'plan_proposal_decisions'
      )
      and cmd <> 'SELECT'
  ),
  'the plan proposal tables carry no insert, update, or delete policy'
);

-- The completion token is the capability that finishes a generation. An owner
-- who could read it could finish their own generation with content the server
-- never validated, so it is withheld from the column-level SELECT grant.
select ok(
  has_column_privilege(
    'authenticated', 'public.plan_generation_requests', 'status', 'SELECT'
  ),
  'an owner can read their own plan generation request status'
);
select ok(
  not has_column_privilege(
    'authenticated',
    'public.plan_generation_requests',
    'completion_token',
    'SELECT'
  ),
  'no authenticated user may read a plan generation completion token'
);

select has_function(
  'public', 'begin_plan_generation',
  array['text', 'text', 'date', 'integer', 'text'],
  'begin_plan_generation exists with its approved signature'
);
select has_function(
  'public', 'finish_plan_generation',
  array['uuid', 'text', 'text', 'text', 'text', 'text', 'text', 'uuid', 'text',
        'jsonb', 'jsonb', 'text'],
  'finish_plan_generation exists with its approved signature'
);
select has_function(
  'public', 'record_plan_memory_candidates',
  array['uuid', 'bigint', 'jsonb'],
  'record_plan_memory_candidates exists with its approved signature'
);
select has_function(
  'public', 'reject_plan_proposal',
  array['uuid'],
  'reject_plan_proposal exists with its approved signature'
);

select ok(
  (
    select bool_and(prosecdef and proconfig = array['search_path=""'])
    from pg_proc
    where oid in (
      'public.begin_plan_generation(text,text,date,integer,text)'::regprocedure,
      'public.finish_plan_generation(uuid,text,text,text,text,text,text,uuid,text,jsonb,jsonb,text)'::regprocedure,
      'public.record_plan_memory_candidates(uuid,bigint,jsonb)'::regprocedure,
      'public.reject_plan_proposal(uuid)'::regprocedure
    )
  ),
  'every plan function is security definer with an empty search path'
);

-- ADR-015: the owner is derived from auth.uid(). No argument may name a user.
select is(
  (
    select count(*)::bigint
    from pg_proc
    cross join lateral unnest(coalesce(proargnames, array[]::text[])) as argument
    where oid in (
      'public.begin_plan_generation(text,text,date,integer,text)'::regprocedure,
      'public.finish_plan_generation(uuid,text,text,text,text,text,text,uuid,text,jsonb,jsonb,text)'::regprocedure,
      'public.record_plan_memory_candidates(uuid,bigint,jsonb)'::regprocedure,
      'public.reject_plan_proposal(uuid)'::regprocedure
    )
      and (argument ilike '%user%' or argument ilike '%owner%')
  ),
  0::bigint,
  'no plan function accepts the owner as a parameter'
);

select ok(
  (
    select bool_and(
      has_function_privilege('authenticated', oid, 'EXECUTE')
      and not has_function_privilege('anon', oid, 'EXECUTE')
    )
    from pg_proc
    where oid in (
      'public.begin_plan_generation(text,text,date,integer,text)'::regprocedure,
      'public.finish_plan_generation(uuid,text,text,text,text,text,text,uuid,text,jsonb,jsonb,text)'::regprocedure,
      'public.record_plan_memory_candidates(uuid,bigint,jsonb)'::regprocedure,
      'public.reject_plan_proposal(uuid)'::regprocedure
    )
  ),
  'authenticated may execute every plan function and anon may execute none'
);

select ok(
  not exists (
    select 1
    from pg_proc
    cross join lateral aclexplode(coalesce(proacl, acldefault('f', proowner)))
    where oid in (
      'public.begin_plan_generation(text,text,date,integer,text)'::regprocedure,
      'public.finish_plan_generation(uuid,text,text,text,text,text,text,uuid,text,jsonb,jsonb,text)'::regprocedure,
      'public.record_plan_memory_candidates(uuid,bigint,jsonb)'::regprocedure,
      'public.reject_plan_proposal(uuid)'::regprocedure
    )
      and grantee = 0
      and privilege_type = 'EXECUTE'
  ),
  'PUBLIC cannot execute any plan function'
);

select ok(
  not exists (
    select 1
    from pg_proc
    cross join unnest(array['authenticated', 'anon']) as grantee
    where oid = 'public.plan_content_is_valid(jsonb,date,date)'::regprocedure
      and has_function_privilege(grantee, oid, 'EXECUTE')
  ),
  'no client role may execute the internal plan content validator'
);

-- ---------------------------------------------------------------------------
-- Fixtures.
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('80000000-0000-4000-8000-000000000001', 'm3-03-a@example.test', '{}', '{}'),
  ('80000000-0000-4000-8000-000000000002', 'm3-03-b@example.test', '{}', '{}');

insert into public.profiles (user_id)
values
  ('80000000-0000-4000-8000-000000000001'),
  ('80000000-0000-4000-8000-000000000002');

insert into public.goals (
  id, user_id, title, desired_outcome, category, start_date, priority_tier,
  status, active_rank
)
values
  (
    '81000000-0000-4000-8000-000000000001',
    '80000000-0000-4000-8000-000000000001',
    'Run a hilly half marathon',
    'Finish the November half marathon feeling strong on the climbs.',
    'performance_event',
    (now() at time zone 'utc')::date,
    'core',
    'active',
    1
  );

select set_config('test.start', ((now() at time zone 'utc')::date)::text, true);
select set_config(
  'test.end', (((now() at time zone 'utc')::date) + 6)::text, true
);
select set_config('test.goal', '81000000-0000-4000-8000-000000000001', true);
select set_config(
  'test.note',
  'I am away the first weekend of every month. I only have 45 minutes on weekdays.',
  true
);

-- One structurally valid session, parameterized by date, so a case can build the
-- exact shape it wants to prove without restating ten fields.
create function pg_temp.session(p_date date, p_title text default 'Easy aerobic run')
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'date', p_date::text,
    'title', p_title,
    'sport', 'Running',
    'focus', 'Steady aerobic time on feet, nothing that leaves a mark.',
    'intent', 'Conversational effort the whole way.',
    'durationMinutes', 45,
    'primaryGoalId', current_setting('test.goal'),
    'secondaryGoalIds', jsonb_build_array(),
    'alternatives', jsonb_build_array(
      jsonb_build_object(
        'title', 'Thirty easy minutes',
        'whenToChoose', 'If the weekday window is shorter than you hoped.'
      )
    ),
    'rationale', 'Most of the week is easy so the hill work lands well.'
  );
$$;

create function pg_temp.plan(p_sessions jsonb, p_end date default null)
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'schemaVersion', 'fittip.seven-day-plan.v2',
    'weekDescription',
      'A steady week: two easy runs and one hill session, with the rest of the '
      || 'days deliberately free so the hills are the only hard thing in it.',
    'startDate', current_setting('test.start'),
    'endDate', coalesce(p_end, current_setting('test.end')::date)::text,
    'sessions', p_sessions
  );
$$;

select set_config(
  'test.content',
  pg_temp.plan(
    jsonb_build_array(
      pg_temp.session(current_setting('test.start')::date),
      pg_temp.session(current_setting('test.start')::date + 2, 'Hill repeats')
    )
  )::text,
  true
);

select set_config(
  'test.sources',
  jsonb_build_array(
    jsonb_build_object('kind', 'goal', 'recordId', current_setting('test.goal'))
  )::text,
  true
);

-- Three sessions on one date and no rest day anywhere is a valid week: neither
-- a minutes cap nor a required rest day is a rule this schema owns, so a
-- proposal must not be rejected for lacking one. Asserted against the content
-- floor directly, which is why it runs here rather than as a client role: no
-- client role may execute it, and the assertion above proves that.
select ok(
  public.plan_content_is_valid(
    pg_temp.plan(jsonb_build_array(
      pg_temp.session(current_setting('test.start')::date, 'Mobility'),
      pg_temp.session(current_setting('test.start')::date, 'Run'),
      pg_temp.session(current_setting('test.start')::date, 'Gym'),
      pg_temp.session(current_setting('test.start')::date + 1),
      pg_temp.session(current_setting('test.start')::date + 2),
      pg_temp.session(current_setting('test.start')::date + 3),
      pg_temp.session(current_setting('test.start')::date + 4),
      pg_temp.session(current_setting('test.start')::date + 5),
      pg_temp.session(current_setting('test.start')::date + 6)
    )),
    current_setting('test.start')::date,
    current_setting('test.end')::date
  ),
  'three sessions on one date, and a week with no rest day, are both valid'
);

-- ---------------------------------------------------------------------------
-- Anonymous callers are denied everywhere.
-- ---------------------------------------------------------------------------

set local role anon;

select throws_ok(
  $$select public.begin_plan_generation(
    'anon-plan-key-000000', 'anon-plan-fingerprint', current_date, 7
  )$$,
  '42501',
  null,
  'an anonymous caller cannot claim a plan generation'
);
select throws_ok(
  $$select public.reject_plan_proposal(
    '81000000-0000-4000-8000-0000000000ff'
  )$$,
  '42501',
  null,
  'an anonymous caller cannot reject a plan proposal'
);

reset role;

-- ---------------------------------------------------------------------------
-- Owner A: claim, replay, and the same-key conflict.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"80000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select lives_ok(
  $$select set_config('test.token', r.completion_token::text, true),
           set_config('test.claim_state', r.state, true)
    from public.begin_plan_generation(
      'plan-key-0000000001',
      'plan-fingerprint-0001',
      current_setting('test.start')::date,
      7,
      current_setting('test.note')
    ) as r$$,
  'an owner can claim one paid plan generation attempt'
);

-- The discriminator the provider call is gated on. Only the caller whose insert
-- opened the attempt is told 'claimed'; a replay is told the stored status, so
-- an uncertain retry cannot buy a second provider call.
select is(
  current_setting('test.claim_state'),
  'claimed',
  'a fresh claim reports claimed, the one state that authorizes a provider call'
);
select is(
  (select count(*)::bigint from public.plan_generation_requests),
  1::bigint,
  'claiming writes exactly one owned request'
);
select is(
  (select status from public.plan_generation_requests),
  'pending',
  'a fresh claim is pending'
);
select is(
  (select requested_end_date from public.plan_generation_requests),
  current_setting('test.end')::date,
  'the end date is derived from the day count rather than taken from the caller'
);
select ok(
  not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'plan_generation_requests'
      and column_name in ('planning_note', 'regeneration_feedback')
  ),
  'a plan generation request has no column that could hold owner text'
);
select ok(
  (
    select planning_note_hash is not null
      and char_length(planning_note_hash) = 64
    from public.plan_generation_requests
  ),
  'a pending request holds only a bounded hash of the owner text'
);

select is(
  (
    select (public.begin_plan_generation(
      'plan-key-0000000001',
      'plan-fingerprint-0001',
      current_setting('test.start')::date,
      7,
      current_setting('test.note')
    )).state
  ),
  'pending',
  'replaying a claim with the same fingerprint returns the existing state'
);
select is(
  (select count(*)::bigint from public.plan_generation_requests),
  1::bigint,
  'replaying a claim creates no second request'
);

select throws_ok(
  $$select public.begin_plan_generation(
    'plan-key-0000000001',
    'a-different-fingerprint',
    current_setting('test.start')::date,
    7,
    current_setting('test.note')
  )$$,
  'PT409',
  null,
  'the same key with a different fingerprint is a conflict'
);

-- The horizon bounds are the database's, not the caller's, and not a note's.
select throws_ok(
  $$select public.begin_plan_generation(
    'plan-key-0000000002', 'plan-fingerprint-0002',
    current_setting('test.start')::date, 0
  )$$,
  '22023',
  null,
  'a day count below one is refused'
);
select throws_ok(
  $$select public.begin_plan_generation(
    'plan-key-0000000003', 'plan-fingerprint-0003',
    current_setting('test.start')::date, 8
  )$$,
  '22023',
  null,
  'a day count above seven is refused'
);
select throws_ok(
  $$select public.begin_plan_generation(
    'plan-key-0000000004', 'plan-fingerprint-0004',
    current_setting('test.start')::date - 30, 7
  )$$,
  '22023',
  null,
  'a start date in the past is refused, so no proposal covers a day that happened'
);

-- ---------------------------------------------------------------------------
-- Finish: the accepted model/rate-card pair, the content floor, persistence.
-- ---------------------------------------------------------------------------

select throws_ok(
  $$select public.finish_plan_generation(
    current_setting('test.token')::uuid, 'proposal',
    'fittip.seven-day-plan.v2', 'seven-day-plan-v2', 'openai', 'gpt-5.5',
    'openai-gpt-5.6-luna-2026-08-10', null, current_setting('test.note'),
    current_setting('test.content')::jsonb, current_setting('test.sources')::jsonb
  )$$,
  '22023',
  'That coaching model is not approved.',
  'a model that is not the model its rate card prices is refused'
);

select throws_ok(
  $$select public.finish_plan_generation(
    current_setting('test.token')::uuid, 'proposal',
    'fittip.seven-day-plan.v2', 'seven-day-plan-v2', 'openai', 'gpt-5.6-luna',
    'openai-gpt-5.6-luna-2026-08-10', null, current_setting('test.note'),
    current_setting('test.content')::jsonb, current_setting('test.sources')::jsonb
  )$$,
  '22023',
  'That coaching model is not approved.',
  'a live result with no spend reservation is refused'
);

select throws_ok(
  $$select public.finish_plan_generation(
    current_setting('test.token')::uuid, 'proposal',
    'fittip.roadmap.v2', 'seven-day-plan-v2', 'fixture', 'fixture-corpus-v1',
    'fixture-no-spend', null, current_setting('test.note'),
    current_setting('test.content')::jsonb, current_setting('test.sources')::jsonb
  )$$,
  '22023',
  null,
  'a plan recorded under another operation schema version is refused'
);

select throws_ok(
  $$select public.finish_plan_generation(
    current_setting('test.token')::uuid, 'proposal',
    'fittip.seven-day-plan.v2', 'seven-day-plan-v2', 'fixture',
    'fixture-corpus-v1', 'fixture-no-spend', null,
    'a completely different planning note',
    current_setting('test.content')::jsonb, current_setting('test.sources')::jsonb
  )$$,
  '22023',
  null,
  'a planning note that does not match the claimed hash is refused'
);

-- The content floor, independently of whatever the application decided.

select throws_ok(
  $$select public.finish_plan_generation(
    current_setting('test.token')::uuid, 'proposal',
    'fittip.seven-day-plan.v2', 'seven-day-plan-v2', 'fixture',
    'fixture-corpus-v1', 'fixture-no-spend', null, current_setting('test.note'),
    (current_setting('test.content')::jsonb || '{"sessions": []}'::jsonb),
    current_setting('test.sources')::jsonb
  )$$,
  '22023',
  null,
  'a horizon with no session at all is refused'
);

select throws_ok(
  $$select public.finish_plan_generation(
    current_setting('test.token')::uuid, 'proposal',
    'fittip.seven-day-plan.v2', 'seven-day-plan-v2', 'fixture',
    'fixture-corpus-v1', 'fixture-no-spend', null, current_setting('test.note'),
    pg_temp.plan(jsonb_build_array(
      pg_temp.session(current_setting('test.start')::date, 'One'),
      pg_temp.session(current_setting('test.start')::date, 'Two'),
      pg_temp.session(current_setting('test.start')::date, 'Three'),
      pg_temp.session(current_setting('test.start')::date, 'Four')
    )),
    current_setting('test.sources')::jsonb
  )$$,
  '22023',
  null,
  'a fourth session on one date is refused'
);

select throws_ok(
  $$select public.finish_plan_generation(
    current_setting('test.token')::uuid, 'proposal',
    'fittip.seven-day-plan.v2', 'seven-day-plan-v2', 'fixture',
    'fixture-corpus-v1', 'fixture-no-spend', null, current_setting('test.note'),
    (current_setting('test.content')::jsonb
      || jsonb_build_object('weekDescription', repeat('x', 601))),
    current_setting('test.sources')::jsonb
  )$$,
  '22023',
  null,
  'a description of the week over 600 characters is refused'
);

select throws_ok(
  $$select public.finish_plan_generation(
    current_setting('test.token')::uuid, 'proposal',
    'fittip.seven-day-plan.v2', 'seven-day-plan-v2', 'fixture',
    'fixture-corpus-v1', 'fixture-no-spend', null, current_setting('test.note'),
    ((current_setting('test.content')::jsonb) - 'weekDescription'),
    current_setting('test.sources')::jsonb
  )$$,
  '22023',
  null,
  'a plan with no description of the week is refused'
);

-- Decision 6: no weight, no percentage, nowhere. The key allowlist is what
-- makes that mechanical rather than a rule someone has to remember.
select throws_ok(
  $$select public.finish_plan_generation(
    current_setting('test.token')::uuid, 'proposal',
    'fittip.seven-day-plan.v2', 'seven-day-plan-v2', 'fixture',
    'fixture-corpus-v1', 'fixture-no-spend', null, current_setting('test.note'),
    pg_temp.plan(jsonb_build_array(
      pg_temp.session(current_setting('test.start')::date)
        || '{"goalWeight": 70}'::jsonb
    )),
    current_setting('test.sources')::jsonb
  )$$,
  '22023',
  null,
  'a session carrying a goal weight is refused'
);

-- No activities, measurement modes, or targets. Those are M3-03D.
select throws_ok(
  $$select public.finish_plan_generation(
    current_setting('test.token')::uuid, 'proposal',
    'fittip.seven-day-plan.v2', 'seven-day-plan-v2', 'fixture',
    'fixture-corpus-v1', 'fixture-no-spend', null, current_setting('test.note'),
    pg_temp.plan(jsonb_build_array(
      pg_temp.session(current_setting('test.start')::date)
        || '{"activities": [{"name": "Back squat"}]}'::jsonb
    )),
    current_setting('test.sources')::jsonb
  )$$,
  '22023',
  null,
  'a session carrying activities is refused'
);

select throws_ok(
  $$select public.finish_plan_generation(
    current_setting('test.token')::uuid, 'proposal',
    'fittip.seven-day-plan.v2', 'seven-day-plan-v2', 'fixture',
    'fixture-corpus-v1', 'fixture-no-spend', null, current_setting('test.note'),
    pg_temp.plan(jsonb_build_array(
      pg_temp.session(current_setting('test.start')::date + 30)
    )),
    current_setting('test.sources')::jsonb
  )$$,
  '22023',
  null,
  'a session dated outside the requested horizon is refused'
);

select throws_ok(
  $$select public.finish_plan_generation(
    current_setting('test.token')::uuid, 'proposal',
    'fittip.seven-day-plan.v2', 'seven-day-plan-v2', 'fixture',
    'fixture-corpus-v1', 'fixture-no-spend', null, current_setting('test.note'),
    pg_temp.plan(
      jsonb_build_array(pg_temp.session(current_setting('test.start')::date)),
      current_setting('test.start')::date + 20
    ),
    current_setting('test.sources')::jsonb
  )$$,
  '22023',
  null,
  'content that widens the horizon it was asked for is refused'
);

select lives_ok(
  $$select set_config(
    'test.proposal',
    (public.finish_plan_generation(
      current_setting('test.token')::uuid, 'proposal',
      'fittip.seven-day-plan.v2', 'seven-day-plan-v2', 'fixture',
      'fixture-corpus-v1', 'fixture-no-spend', null,
      current_setting('test.note'),
      current_setting('test.content')::jsonb,
      current_setting('test.sources')::jsonb
    )).proposal_id::text,
    true
  )$$,
  'a validated fixture candidate persists as one immutable proposal'
);

select is(
  (select status from public.plan_generation_requests),
  'completed',
  'the generation request is completed once its proposal exists'
);
select is(
  (select origin from public.plan_proposals),
  'ai_initial',
  'the only origin this ticket can produce is an initial AI proposal'
);
select is(
  (select planning_note from public.plan_proposals),
  current_setting('test.note'),
  'the planning note is stored with the proposal it produced'
);
select is(
  (select count(*)::bigint from public.plan_proposal_sources),
  1::bigint,
  'the proposal records its minimized source references'
);
select is(
  (select source_kind from public.plan_proposal_sources),
  'goal',
  'a goal source is recorded by kind and id only'
);

select is(
  (
    select (public.finish_plan_generation(
      current_setting('test.token')::uuid, 'proposal',
      'fittip.seven-day-plan.v2', 'seven-day-plan-v2', 'fixture',
      'fixture-corpus-v1', 'fixture-no-spend', null,
      current_setting('test.note'),
      current_setting('test.content')::jsonb,
      current_setting('test.sources')::jsonb
    )).proposal_id::text
  ),
  current_setting('test.proposal'),
  'replaying a completion token returns the existing proposal'
);
select is(
  (select count(*)::bigint from public.plan_proposals),
  1::bigint,
  'replaying a completion token creates no second proposal'
);
select throws_ok(
  $$select public.finish_plan_generation(
    current_setting('test.token')::uuid, 'proposal',
    'fittip.seven-day-plan.v2', 'seven-day-plan-v2', 'fixture',
    'fixture-corpus-v1', 'fixture-no-spend', null, current_setting('test.note'),
    (current_setting('test.content')::jsonb
      || '{"weekDescription": "A different week."}'::jsonb),
    current_setting('test.sources')::jsonb
  )$$,
  'PT409',
  null,
  'different content against a finished request is a conflict'
);

-- ---------------------------------------------------------------------------
-- A one-day horizon is a first-class request, not an edge case.
-- ---------------------------------------------------------------------------

select set_config(
  'test.token1',
  (public.begin_plan_generation(
    'plan-key-0000000005', 'plan-fingerprint-0005',
    current_setting('test.start')::date, 1
  )).completion_token::text,
  true
);
select is(
  (
    select requested_end_date from public.plan_generation_requests
    where idempotency_key = 'plan-key-0000000005'
  ),
  current_setting('test.start')::date,
  'a one-day horizon starts and ends on the same owner-local date'
);
select lives_ok(
  $$select public.finish_plan_generation(
    current_setting('test.token1')::uuid, 'proposal',
    'fittip.seven-day-plan.v2', 'seven-day-plan-v2', 'fixture',
    'fixture-corpus-v1', 'fixture-no-spend', null, null,
    pg_temp.plan(
      jsonb_build_array(pg_temp.session(current_setting('test.start')::date)),
      current_setting('test.start')::date
    ),
    null
  )$$,
  'a one-day plan persists, and a request with no planning note is ordinary'
);
select throws_ok(
  $$select public.finish_plan_generation(
    (public.begin_plan_generation(
      'plan-key-0000000006', 'plan-fingerprint-0006',
      current_setting('test.start')::date, 1
    )).completion_token,
    'proposal',
    'fittip.seven-day-plan.v2', 'seven-day-plan-v2', 'fixture',
    'fixture-corpus-v1', 'fixture-no-spend', null, null,
    pg_temp.plan(
      jsonb_build_array(
        pg_temp.session(current_setting('test.start')::date, 'One'),
        pg_temp.session(current_setting('test.start')::date, 'Two'),
        pg_temp.session(current_setting('test.start')::date, 'Three'),
        pg_temp.session(current_setting('test.start')::date, 'Four')
      ),
      current_setting('test.start')::date
    ),
    null
  )$$,
  '22023',
  null,
  'four sessions across a one-day horizon exceeds three times the day count'
);

-- ---------------------------------------------------------------------------
-- Memory candidates: planning-note excerpts only, proposed only, idempotent.
-- ---------------------------------------------------------------------------

select throws_ok(
  $$select public.record_plan_memory_candidates(
    current_setting('test.token')::uuid,
    0,
    '[{"memoryType":"constraint","sourceExcerpt":"I never train on Tuesdays"}]'::jsonb
  )$$,
  '22023',
  null,
  'an excerpt absent from the planning note rejects the whole batch'
);
select is(
  (select count(*)::bigint from public.memory_items),
  0::bigint,
  'a rejected candidate batch creates no memory item'
);
select is(
  (select count(*)::bigint from public.plan_proposals),
  2::bigint,
  'a rejected candidate batch leaves the committed proposals valid'
);

select lives_ok(
  $$select public.record_plan_memory_candidates(
    current_setting('test.token')::uuid,
    0,
    ('[' ||
     '{"memoryType":"constraint","sourceExcerpt":"I only have 45 minutes on weekdays","confidence":60},' ||
     '{"memoryType":"constraint","sourceExcerpt":"I am away the first weekend of every month"}' ||
     ']')::jsonb
  )$$,
  'valid planning-note excerpts become proposed memory candidates'
);
select is(
  (select count(*)::bigint from public.memory_items),
  2::bigint,
  'each valid candidate creates exactly one memory item'
);
select ok(
  (
    select bool_and(
      status = 'proposed'
      and provenance = 'inferred_proposed'
      and user_confirmed_at is null
    )
    from public.memory_items
  ),
  'every candidate is proposed and inferred, never active'
);
select ok(
  (
    select bool_and(author_class = 'system' and provenance = 'inferred_proposed')
    from public.memory_revisions
  ),
  'the candidate revision records system authorship'
);
select ok(
  (
    select bool_and(
      source_reference like 'plan-proposal:' || current_setting('test.proposal') || ':%'
    )
    from public.memory_items
  ),
  'each candidate names the plan proposal it came from'
);
select lives_ok(
  $$select public.record_plan_memory_candidates(
    current_setting('test.token')::uuid,
    1,
    ('[' ||
     '{"memoryType":"constraint","sourceExcerpt":"I only have 45 minutes on weekdays","confidence":60},' ||
     '{"memoryType":"constraint","sourceExcerpt":"I am away the first weekend of every month"}' ||
     ']')::jsonb
  )$$,
  'replaying a candidate batch is idempotent'
);
select is(
  (select count(*)::bigint from public.memory_items),
  2::bigint,
  'replaying a candidate batch creates no duplicates'
);

-- ---------------------------------------------------------------------------
-- Reject is the only decision this ticket offers.
-- ---------------------------------------------------------------------------

select is(
  (
    select (public.reject_plan_proposal(
      current_setting('test.proposal')::uuid
    )).result
  ),
  'rejected',
  'an owner can reject a plan proposal'
);
select is(
  (
    select decision from public.plan_proposal_decisions
    where proposal_id = current_setting('test.proposal')::uuid
  ),
  'rejected',
  'rejecting records one terminal decision'
);
select is(
  (
    select (public.reject_plan_proposal(
      current_setting('test.proposal')::uuid
    )).result
  ),
  'rejected',
  'replaying a rejection returns the existing receipt rather than an error'
);
select ok(
  (
    select planning_note is not null and content is not null
    from public.plan_proposals
    where id = current_setting('test.proposal')::uuid
  ),
  'a rejected proposal keeps its content and its planning note as evidence'
);
select is(
  (select count(*)::bigint from public.memory_items where status = 'proposed'),
  2::bigint,
  'rejecting the plan leaves undecided memory candidates proposed and intact'
);

-- ---------------------------------------------------------------------------
-- Owner B cannot see or touch owner A's plan proposals.
-- ---------------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"80000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

select is(
  (select count(*)::bigint from public.plan_proposals),
  0::bigint,
  'a second owner reads none of the first owner proposals'
);
select is(
  (select count(*)::bigint from public.plan_generation_requests),
  0::bigint,
  'a second owner reads none of the first owner generation requests'
);
select is(
  (select count(*)::bigint from public.plan_proposal_sources),
  0::bigint,
  'a second owner reads none of the first owner source references'
);
select is(
  (select count(*)::bigint from public.plan_proposal_decisions),
  0::bigint,
  'a second owner reads none of the first owner decisions'
);
select throws_ok(
  $$select public.reject_plan_proposal(current_setting('test.proposal')::uuid)$$,
  'PT409',
  null,
  'a second owner cannot reject the first owner proposal'
);
select throws_ok(
  $$select public.finish_plan_generation(
    current_setting('test.token')::uuid, 'failed', null, null, null, null,
    null, null, null, null, null, 'provider_unavailable'
  )$$,
  'PT409',
  null,
  'a second owner cannot finish the first owner generation'
);
select throws_ok(
  $$select public.record_plan_memory_candidates(
    current_setting('test.token')::uuid,
    0,
    '[{"memoryType":"constraint","sourceExcerpt":"I only have 45 minutes on weekdays"}]'::jsonb
  )$$,
  'PT409',
  null,
  'a second owner cannot write memory candidates against another generation'
);
select is(
  (select count(*)::bigint from public.memory_items),
  0::bigint,
  'the cross-owner candidate attempt created nothing this owner can see'
);

-- ---------------------------------------------------------------------------
-- A failed attempt records a safe code and no proposal.
-- ---------------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"80000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select set_config(
  'test.token7',
  (public.begin_plan_generation(
    'plan-key-0000000030', 'plan-fingerprint-0030',
    current_setting('test.start')::date, 3
  )).completion_token::text,
  true
);
select is(
  (
    select (public.finish_plan_generation(
      current_setting('test.token7')::uuid, 'failed', null, null, null, null,
      null, null, null, null, null, 'provider_unavailable'
    )).state
  ),
  'failed',
  'a provider failure is recorded as a bounded safe code'
);
select is(
  (
    select failure_code from public.plan_generation_requests
    where idempotency_key = 'plan-key-0000000030'
  ),
  'provider_unavailable',
  'the failed request stores only the safe code'
);
select is(
  (
    select proposal_id from public.plan_generation_requests
    where idempotency_key = 'plan-key-0000000030'
  ),
  null::uuid,
  'a failed attempt creates no proposal'
);
select is(
  (select count(*)::bigint from public.plan_proposals),
  2::bigint,
  'a failed attempt leaves the existing proposals unchanged'
);

reset role;

select * from finish();
rollback;
