begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

-- ---------------------------------------------------------------------------
-- Structure, privileges and policies, asserted before any behaviour.
-- ---------------------------------------------------------------------------

select has_table('public', 'roadmap_generation_requests', 'the generation request table exists');
select has_table('public', 'roadmap_proposals', 'the proposal table exists');
select has_table('public', 'roadmap_proposal_sources', 'the proposal source table exists');
select has_table('public', 'roadmap_proposal_decisions', 'the proposal decision table exists');
select has_table('public', 'roadmap_versions', 'the accepted version table exists');
select has_table('public', 'roadmap_heads', 'the roadmap head table exists');

select ok(
  (
    select bool_and(relrowsecurity)
    from pg_class
    where oid in (
      'public.roadmap_generation_requests'::regclass,
      'public.roadmap_proposals'::regclass,
      'public.roadmap_proposal_sources'::regclass,
      'public.roadmap_proposal_decisions'::regclass,
      'public.roadmap_versions'::regclass,
      'public.roadmap_heads'::regclass
    )
  ),
  'every roadmap table has row level security enabled'
);

-- Direct writes are revoked everywhere. The functions are the only write path,
-- so there is no privilege to weaken later.
select ok(
  not exists (
    select 1
    from unnest(array[
      'public.roadmap_generation_requests',
      'public.roadmap_proposals',
      'public.roadmap_proposal_sources',
      'public.roadmap_proposal_decisions',
      'public.roadmap_versions',
      'public.roadmap_heads'
    ]) as relation
    cross join unnest(array['authenticated', 'anon']) as grantee
    cross join unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) as privilege
    where has_table_privilege(grantee, relation, privilege)
  ),
  'no authenticated or anonymous role holds a direct roadmap write privilege'
);

select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename like 'roadmap%'
      and cmd <> 'SELECT'
  ),
  'the roadmap tables carry no insert, update, or delete policy'
);

-- The completion token is the capability that finishes a generation. An owner
-- who could read it could finish their own generation with content the server
-- never validated, so it is withheld from the column-level SELECT grant.
select ok(
  has_column_privilege(
    'authenticated', 'public.roadmap_generation_requests', 'status', 'SELECT'
  ),
  'an owner can read their own generation request status'
);
select ok(
  not has_column_privilege(
    'authenticated',
    'public.roadmap_generation_requests',
    'completion_token',
    'SELECT'
  ),
  'no authenticated user may read a generation completion token'
);

select has_function(
  'public', 'begin_roadmap_generation',
  array['text', 'text', 'date', 'date', 'bigint', 'text', 'uuid', 'text'],
  'begin_roadmap_generation exists with its approved signature'
);
select has_function(
  'public', 'finish_roadmap_generation',
  array['uuid', 'text', 'text', 'text', 'text', 'text', 'text', 'uuid', 'text',
        'text', 'jsonb', 'jsonb', 'text'],
  'finish_roadmap_generation exists with its approved signature'
);
select has_function(
  'public', 'record_roadmap_memory_candidates',
  array['uuid', 'bigint', 'jsonb'],
  'record_roadmap_memory_candidates exists with its approved signature'
);
select has_function(
  'public', 'apply_roadmap_proposal_change',
  array['text', 'uuid', 'jsonb'],
  'apply_roadmap_proposal_change exists with its approved signature'
);
select has_function(
  'public', 'accept_roadmap_proposal',
  array['uuid', 'bigint'],
  'accept_roadmap_proposal exists with its approved signature'
);

select ok(
  (
    select bool_and(prosecdef and proconfig = array['search_path=""'])
    from pg_proc
    where oid in (
      'public.begin_roadmap_generation(text,text,date,date,bigint,text,uuid,text)'::regprocedure,
      'public.finish_roadmap_generation(uuid,text,text,text,text,text,text,uuid,text,text,jsonb,jsonb,text)'::regprocedure,
      'public.record_roadmap_memory_candidates(uuid,bigint,jsonb)'::regprocedure,
      'public.apply_roadmap_proposal_change(text,uuid,jsonb)'::regprocedure,
      'public.accept_roadmap_proposal(uuid,bigint)'::regprocedure
    )
  ),
  'every roadmap function is security definer with an empty search path'
);

-- The owner is derived from auth.uid(). No argument may name a user.
select is(
  (
    select count(*)::bigint
    from pg_proc
    cross join lateral unnest(coalesce(proargnames, array[]::text[])) as argument
    where oid in (
      'public.begin_roadmap_generation(text,text,date,date,bigint,text,uuid,text)'::regprocedure,
      'public.finish_roadmap_generation(uuid,text,text,text,text,text,text,uuid,text,text,jsonb,jsonb,text)'::regprocedure,
      'public.record_roadmap_memory_candidates(uuid,bigint,jsonb)'::regprocedure,
      'public.apply_roadmap_proposal_change(text,uuid,jsonb)'::regprocedure,
      'public.accept_roadmap_proposal(uuid,bigint)'::regprocedure
    )
      and (argument ilike '%user%' or argument ilike '%owner%')
  ),
  0::bigint,
  'no roadmap function accepts the owner as a parameter'
);

select ok(
  (
    select bool_and(
      has_function_privilege('authenticated', oid, 'EXECUTE')
      and not has_function_privilege('anon', oid, 'EXECUTE')
    )
    from pg_proc
    where oid in (
      'public.begin_roadmap_generation(text,text,date,date,bigint,text,uuid,text)'::regprocedure,
      'public.finish_roadmap_generation(uuid,text,text,text,text,text,text,uuid,text,text,jsonb,jsonb,text)'::regprocedure,
      'public.record_roadmap_memory_candidates(uuid,bigint,jsonb)'::regprocedure,
      'public.apply_roadmap_proposal_change(text,uuid,jsonb)'::regprocedure,
      'public.accept_roadmap_proposal(uuid,bigint)'::regprocedure
    )
  ),
  'authenticated may execute every roadmap function and anon may execute none'
);

select ok(
  not exists (
    select 1
    from pg_proc
    cross join lateral aclexplode(coalesce(proacl, acldefault('f', proowner)))
    where oid in (
      'public.begin_roadmap_generation(text,text,date,date,bigint,text,uuid,text)'::regprocedure,
      'public.finish_roadmap_generation(uuid,text,text,text,text,text,text,uuid,text,text,jsonb,jsonb,text)'::regprocedure,
      'public.record_roadmap_memory_candidates(uuid,bigint,jsonb)'::regprocedure,
      'public.apply_roadmap_proposal_change(text,uuid,jsonb)'::regprocedure,
      'public.accept_roadmap_proposal(uuid,bigint)'::regprocedure
    )
      and grantee = 0
      and privilege_type = 'EXECUTE'
  ),
  'PUBLIC cannot execute any roadmap function'
);

-- The helper functions are internal to the definer boundary and reachable by
-- nobody directly, so a caller cannot use the normalization or the accepted
-- model list as an oracle.
select ok(
  not exists (
    select 1
    from pg_proc
    cross join unnest(array['authenticated', 'anon']) as grantee
    where oid in (
      'public.roadmap_normalize_owner_text(text)'::regprocedure,
      'public.roadmap_owner_text_hash(text)'::regprocedure,
      'public.roadmap_content_is_valid(jsonb,date,date)'::regprocedure,
      'public.roadmap_technical_codes_are_accepted(text,text,text,boolean)'::regprocedure
    )
      and has_function_privilege(grantee, oid, 'EXECUTE')
  ),
  'no client role may execute the internal roadmap helpers'
);

-- ---------------------------------------------------------------------------
-- Fixtures.
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('70000000-0000-4000-8000-000000000001', 'm3-02-a@example.test', '{}', '{}'),
  ('70000000-0000-4000-8000-000000000002', 'm3-02-b@example.test', '{}', '{}');

insert into public.profiles (user_id)
values
  ('70000000-0000-4000-8000-000000000001'),
  ('70000000-0000-4000-8000-000000000002');

insert into public.goals (
  id, user_id, title, desired_outcome, category, start_date, priority_tier,
  status, active_rank
)
values
  (
    '71000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000001',
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
  'test.end', (((now() at time zone 'utc')::date) + 84)::text, true
);
select set_config('test.goal', '71000000-0000-4000-8000-000000000001', true);
select set_config(
  'test.note',
  'I am away the first weekend of every month. I only have 45 minutes on weekdays.',
  true
);

select set_config(
  'test.content',
  jsonb_build_object(
    'schemaVersion', 'fittip.roadmap.v2',
    'title', 'Twelve weeks to a hilly half',
    'summary', 'Build aerobic base, then hill strength, then race-specific work.',
    'startDate', current_setting('test.start'),
    'endDate', current_setting('test.end'),
    'phases', jsonb_build_array(
      jsonb_build_object(
        'title', 'Aerobic base',
        'focus', 'Easy volume with one weekly hill circuit.',
        'startDate', current_setting('test.start'),
        'endDate', current_setting('test.end'),
        'goalAttention', jsonb_build_array(
          jsonb_build_object(
            'goalId', current_setting('test.goal'),
            'level', 'primary',
            'reason', 'The only dated objective inside this horizon.'
          )
        ),
        'milestones', jsonb_build_array(
          jsonb_build_object(
            'title', 'Four consecutive weeks of three runs',
            'observableCriterion', 'Three runs logged in each of four weeks.',
            'targetDate', current_setting('test.end'),
            'goalIds', jsonb_build_array(current_setting('test.goal'))
          )
        )
      )
    ),
    'assumptions', jsonb_build_array('Three training days a week are available.'),
    'uncertainties', jsonb_build_array(
      jsonb_build_object(
        'statement', 'The knee may not tolerate weekly descents.',
        'whyItMatters', 'Descending is the specific demand of this race.',
        'whatToWatch', 'Soreness that lasts more than a day after a descent.'
      )
    ),
    'reviewPoints', jsonb_build_array(
      jsonb_build_object(
        'title', 'Six week check',
        'triggerDate', current_setting('test.end'),
        'question', 'Is the weekly volume still sustainable alongside work?'
      )
    ),
    'safetyConsiderations', jsonb_build_array(
      'Hold descending volume flat while the knee is sore.'
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

-- ---------------------------------------------------------------------------
-- Anonymous callers are denied everywhere.
-- ---------------------------------------------------------------------------

set local role anon;

select throws_ok(
  $$select public.begin_roadmap_generation(
    'anon-key-0000000000', 'anon-fingerprint-0000', current_date,
    current_date + 84, 0
  )$$,
  '42501',
  null,
  'an anonymous caller cannot claim a generation'
);
select throws_ok(
  $$select public.accept_roadmap_proposal(
    '71000000-0000-4000-8000-0000000000ff', 0
  )$$,
  '42501',
  null,
  'an anonymous caller cannot accept a proposal'
);

reset role;

-- ---------------------------------------------------------------------------
-- Owner A: claim, replay, and the same-key conflict.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"70000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select lives_ok(
  $$select set_config(
    'test.token',
    (public.begin_roadmap_generation(
      'roadmap-key-000000001',
      'roadmap-fingerprint-0001',
      current_setting('test.start')::date,
      current_setting('test.end')::date,
      0,
      current_setting('test.note')
    )).completion_token::text,
    true
  )$$,
  'an owner can claim one paid generation attempt'
);

select is(
  (select count(*)::bigint from public.roadmap_generation_requests),
  1::bigint,
  'claiming writes exactly one owned request'
);
select is(
  (select status from public.roadmap_generation_requests),
  'pending',
  'a fresh claim is pending'
);
select ok(
  not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'roadmap_generation_requests'
      and column_name in ('planning_note', 'regeneration_feedback')
  ),
  'a generation request has no column that could hold owner text'
);
select ok(
  (
    select planning_note_hash is not null
      and char_length(planning_note_hash) = 64
    from public.roadmap_generation_requests
  ),
  'a pending request holds only a bounded hash of the owner text'
);

-- Replay: the same key and the same fingerprint return the existing claim, so
-- the caller makes no second provider call.
select is(
  (
    select (public.begin_roadmap_generation(
      'roadmap-key-000000001',
      'roadmap-fingerprint-0001',
      current_setting('test.start')::date,
      current_setting('test.end')::date,
      0,
      current_setting('test.note')
    )).state
  ),
  'pending',
  'replaying a claim with the same fingerprint returns the existing state'
);
select is(
  (select count(*)::bigint from public.roadmap_generation_requests),
  1::bigint,
  'replaying a claim creates no second request'
);

select throws_ok(
  $$select public.begin_roadmap_generation(
    'roadmap-key-000000001',
    'a-different-fingerprint',
    current_setting('test.start')::date,
    current_setting('test.end')::date,
    0,
    current_setting('test.note')
  )$$,
  'PT409',
  null,
  'the same key with a different fingerprint is a conflict'
);

-- The horizon bounds are the database's, not the caller's.
select throws_ok(
  $$select public.begin_roadmap_generation(
    'roadmap-key-000000002',
    'roadmap-fingerprint-0002',
    current_setting('test.start')::date,
    current_setting('test.start')::date + 10,
    0
  )$$,
  '22023',
  null,
  'a horizon shorter than four weeks is refused'
);
select throws_ok(
  $$select public.begin_roadmap_generation(
    'roadmap-key-000000003',
    'roadmap-fingerprint-0003',
    current_setting('test.start')::date,
    current_setting('test.start')::date + 400,
    0
  )$$,
  '22023',
  null,
  'a horizon beyond 365 days is refused'
);
select throws_ok(
  $$select public.begin_roadmap_generation(
    'roadmap-key-000000004',
    'roadmap-fingerprint-0004',
    current_setting('test.start')::date - 30,
    current_setting('test.end')::date,
    0
  )$$,
  '22023',
  null,
  'a start date in the past is refused'
);
-- An initial request carries no feedback at all.
select throws_ok(
  $$select public.begin_roadmap_generation(
    'roadmap-key-000000005',
    'roadmap-fingerprint-0005',
    current_setting('test.start')::date,
    current_setting('test.end')::date,
    0,
    current_setting('test.note'),
    null,
    'too much volume'
  )$$,
  '22023',
  null,
  'an initial request may not carry regeneration feedback'
);

-- ---------------------------------------------------------------------------
-- Finish: the accepted model/rate-card pair, and proposal persistence.
-- ---------------------------------------------------------------------------

-- M3-01B limitation 17, at the database boundary: a model the product owner
-- never approved cannot be recorded against an approved rate card.
select throws_ok(
  $$select public.finish_roadmap_generation(
    current_setting('test.token')::uuid,
    'proposal',
    'fittip.roadmap.v2',
    'roadmap-v2',
    'openai',
    'gpt-5.5',
    'openai-gpt-5.6-luna-2026-08-10',
    null,
    current_setting('test.note'),
    null,
    current_setting('test.content')::jsonb,
    current_setting('test.sources')::jsonb
  )$$,
  '22023',
  'That coaching model is not approved.',
  'a model that is not the model its rate card prices is refused'
);

-- A live provider result cannot be recorded as a costless fixture either.
select throws_ok(
  $$select public.finish_roadmap_generation(
    current_setting('test.token')::uuid,
    'proposal',
    'fittip.roadmap.v2',
    'roadmap-v2',
    'openai',
    'gpt-5.6-luna',
    'openai-gpt-5.6-luna-2026-08-10',
    null,
    current_setting('test.note'),
    null,
    current_setting('test.content')::jsonb,
    current_setting('test.sources')::jsonb
  )$$,
  '22023',
  'That coaching model is not approved.',
  'a live result with no spend reservation is refused'
);

-- Owner text that does not match what the claim hashed is refused: the content
-- that travelled must be the content that is stored.
select throws_ok(
  $$select public.finish_roadmap_generation(
    current_setting('test.token')::uuid,
    'proposal',
    'fittip.roadmap.v2',
    'roadmap-v2',
    'fixture',
    'fixture-corpus-v1',
    'fixture-no-spend',
    null,
    'a completely different planning note',
    null,
    current_setting('test.content')::jsonb,
    current_setting('test.sources')::jsonb
  )$$,
  '22023',
  null,
  'a planning note that does not match the claimed hash is refused'
);

-- A content envelope outside the approved bounds is refused independently of
-- whatever the application decided.
select throws_ok(
  $$select public.finish_roadmap_generation(
    current_setting('test.token')::uuid,
    'proposal',
    'fittip.roadmap.v2',
    'roadmap-v2',
    'fixture',
    'fixture-corpus-v1',
    'fixture-no-spend',
    null,
    current_setting('test.note'),
    null,
    (current_setting('test.content')::jsonb || '{"phases": []}'::jsonb),
    current_setting('test.sources')::jsonb
  )$$,
  '22023',
  null,
  'a proposal with no phases is refused by the database'
);

select lives_ok(
  $$select set_config(
    'test.proposal',
    (public.finish_roadmap_generation(
      current_setting('test.token')::uuid,
      'proposal',
      'fittip.roadmap.v2',
      'roadmap-v2',
      'fixture',
      'fixture-corpus-v1',
      'fixture-no-spend',
      null,
      current_setting('test.note'),
      null,
      current_setting('test.content')::jsonb,
      current_setting('test.sources')::jsonb
    )).proposal_id::text,
    true
  )$$,
  'a validated fixture candidate persists as one immutable proposal'
);

select is(
  (select status from public.roadmap_generation_requests),
  'completed',
  'the generation request is completed once its proposal exists'
);
select is(
  (select origin from public.roadmap_proposals),
  'ai_initial',
  'the first proposal for a horizon has no source proposal'
);
select is(
  (select planning_note from public.roadmap_proposals),
  current_setting('test.note'),
  'the planning note is stored with the proposal it produced'
);
select is(
  (select count(*)::bigint from public.roadmap_proposal_sources),
  1::bigint,
  'the proposal records its minimized source references'
);
select is(
  (select source_kind from public.roadmap_proposal_sources),
  'goal',
  'a goal source is recorded by kind and id only'
);

-- Replaying the same completion token returns the existing result rather than
-- creating a second proposal or charging again.
select is(
  (
    select (public.finish_roadmap_generation(
      current_setting('test.token')::uuid,
      'proposal',
      'fittip.roadmap.v2',
      'roadmap-v2',
      'fixture',
      'fixture-corpus-v1',
      'fixture-no-spend',
      null,
      current_setting('test.note'),
      null,
      current_setting('test.content')::jsonb,
      current_setting('test.sources')::jsonb
    )).proposal_id::text
  ),
  current_setting('test.proposal'),
  'replaying a completion token returns the existing proposal'
);
select is(
  (select count(*)::bigint from public.roadmap_proposals),
  1::bigint,
  'replaying a completion token creates no second proposal'
);
select throws_ok(
  $$select public.finish_roadmap_generation(
    current_setting('test.token')::uuid,
    'proposal',
    'fittip.roadmap.v2',
    'roadmap-v2',
    'fixture',
    'fixture-corpus-v1',
    'fixture-no-spend',
    null,
    current_setting('test.note'),
    null,
    (current_setting('test.content')::jsonb || '{"title": "A different title"}'::jsonb),
    current_setting('test.sources')::jsonb
  )$$,
  'PT409',
  null,
  'different content against a finished request is a conflict'
);

-- ---------------------------------------------------------------------------
-- Memory candidates: planning-note excerpts only, proposed only, idempotent.
-- ---------------------------------------------------------------------------

select throws_ok(
  $$select public.record_roadmap_memory_candidates(
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
  (select count(*)::bigint from public.roadmap_proposals),
  1::bigint,
  'a rejected candidate batch leaves the committed roadmap valid'
);

select throws_ok(
  $$select public.record_roadmap_memory_candidates(
    current_setting('test.token')::uuid,
    0,
    ('[' ||
     '{"memoryType":"constraint","sourceExcerpt":"I only have 45 minutes on weekdays"},' ||
     '{"memoryType":"constraint","sourceExcerpt":"I am away the first weekend of every month"},' ||
     '{"memoryType":"preference","sourceExcerpt":"I only have 45 minutes on weekdays"},' ||
     '{"memoryType":"preference","sourceExcerpt":"I am away the first weekend of every month"},' ||
     '{"memoryType":"profile_fact","sourceExcerpt":"I only have 45 minutes on weekdays"}' ||
     ']')::jsonb
  )$$,
  '22023',
  null,
  'more than four candidates is refused'
);

select lives_ok(
  $$select public.record_roadmap_memory_candidates(
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
select is(
  (
    select content
    from public.memory_items i
    join public.memory_revisions r on r.id = i.current_revision_id
    where i.confidence = 60
  ),
  'I only have 45 minutes on weekdays',
  'the normalized excerpt itself becomes the proposed memory text'
);
select ok(
  (
    select bool_and(
      source_reference like 'roadmap-proposal:' || current_setting('test.proposal') || ':%'
    )
    from public.memory_items
  ),
  'each candidate names the proposal it came from'
);

-- Retry returns the existing candidates rather than duplicating them.
select lives_ok(
  $$select public.record_roadmap_memory_candidates(
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
-- Edit, decline, and regeneration.
-- ---------------------------------------------------------------------------

select lives_ok(
  $$select set_config(
    'test.edit',
    (public.apply_roadmap_proposal_change(
      'edit',
      current_setting('test.proposal')::uuid,
      (current_setting('test.content')::jsonb || '{"title": "Twelve weeks, adjusted"}'::jsonb)
    )).proposal_id::text,
    true
  )$$,
  'an owner edit creates a new reviewable proposal'
);
select ok(
  current_setting('test.edit') <> current_setting('test.proposal'),
  'an edit does not rewrite the proposal it came from'
);
select is(
  (
    select origin from public.roadmap_proposals
    where id = current_setting('test.edit')::uuid
  ),
  'owner_edit',
  'the edited proposal records owner authorship of the change'
);
select is(
  (
    select title from (
      select content->>'title' as title from public.roadmap_proposals
      where id = current_setting('test.proposal')::uuid
    ) as original
  ),
  'Twelve weeks to a hilly half',
  'the source proposal content is unchanged by an edit'
);
select is(
  (
    select count(*)::bigint from public.roadmap_proposal_sources
    where proposal_id = current_setting('test.edit')::uuid
  ),
  1::bigint,
  'an edit carries its source references forward'
);
-- Replaying the same edit returns the existing receipt.
select is(
  (
    select (public.apply_roadmap_proposal_change(
      'edit',
      current_setting('test.proposal')::uuid,
      (current_setting('test.content')::jsonb || '{"title": "Twelve weeks, adjusted"}'::jsonb)
    )).proposal_id::text
  ),
  current_setting('test.edit'),
  'replaying an identical edit returns the existing proposal'
);

select lives_ok(
  $$select public.apply_roadmap_proposal_change(
    'reject', current_setting('test.proposal')::uuid
  )$$,
  'an owner can decline a proposal'
);
select is(
  (
    select decision from public.roadmap_proposal_decisions
    where proposal_id = current_setting('test.proposal')::uuid
  ),
  'rejected',
  'declining records one terminal decision'
);
select is(
  (
    select (public.apply_roadmap_proposal_change(
      'reject', current_setting('test.proposal')::uuid
    )).result
  ),
  'rejected',
  'replaying a decline returns the existing receipt'
);
select throws_ok(
  $$select public.apply_roadmap_proposal_change(
    'edit',
    current_setting('test.proposal')::uuid,
    current_setting('test.content')::jsonb
  )$$,
  'PT409',
  null,
  'a decided proposal cannot be edited'
);

-- A regeneration is a new request with its own key. It keeps the horizon,
-- carries only its immediate predecessor, and requires feedback.
select throws_ok(
  $$select public.begin_roadmap_generation(
    'roadmap-key-000000010',
    'roadmap-fingerprint-0010',
    current_setting('test.start')::date,
    current_setting('test.end')::date,
    0,
    current_setting('test.note'),
    current_setting('test.proposal')::uuid,
    null
  )$$,
  '22023',
  null,
  'a regeneration without feedback is refused'
);
select throws_ok(
  $$select public.begin_roadmap_generation(
    'roadmap-key-000000011',
    'roadmap-fingerprint-0011',
    current_setting('test.start')::date,
    current_setting('test.end')::date + 7,
    0,
    current_setting('test.note'),
    current_setting('test.proposal')::uuid,
    'The base phase is too long.'
  )$$,
  '22023',
  null,
  'a regeneration may not change the horizon'
);
select throws_ok(
  $$select public.begin_roadmap_generation(
    'roadmap-key-000000012',
    'roadmap-fingerprint-0012',
    current_setting('test.start')::date,
    current_setting('test.end')::date,
    0,
    current_setting('test.note'),
    current_setting('test.edit')::uuid,
    'The base phase is too long.'
  )$$,
  'PT409',
  null,
  'only a declined proposal may be regenerated from'
);

select lives_ok(
  $$select set_config(
    'test.token2',
    (public.begin_roadmap_generation(
      'roadmap-key-000000013',
      'roadmap-fingerprint-0013',
      current_setting('test.start')::date,
      current_setting('test.end')::date,
      0,
      current_setting('test.note'),
      current_setting('test.proposal')::uuid,
      'The base phase is too long.'
    )).completion_token::text,
    true
  )$$,
  'a declined proposal can be regenerated with bounded feedback'
);
select is(
  (
    select regeneration_number from public.roadmap_generation_requests
    where idempotency_key = 'roadmap-key-000000013'
  ),
  1,
  'a regeneration counts one round beyond its predecessor'
);

-- ---------------------------------------------------------------------------
-- The three-round ceiling, enforced before any provider call.
-- ---------------------------------------------------------------------------

select lives_ok(
  $$select set_config(
    'test.proposal2',
    (public.finish_roadmap_generation(
      current_setting('test.token2')::uuid, 'proposal', 'fittip.roadmap.v2',
      'roadmap-v2', 'fixture', 'fixture-corpus-v1', 'fixture-no-spend', null,
      current_setting('test.note'), 'The base phase is too long.',
      current_setting('test.content')::jsonb, current_setting('test.sources')::jsonb
    )).proposal_id::text, true
  )$$,
  'a regenerated candidate persists as its own proposal'
);
select is(
  (
    select origin from public.roadmap_proposals
    where id = current_setting('test.proposal2')::uuid
  ),
  'ai_regeneration',
  'a regenerated proposal records its origin'
);
select is(
  (
    select source_proposal_id::text from public.roadmap_proposals
    where id = current_setting('test.proposal2')::uuid
  ),
  current_setting('test.proposal'),
  'a regenerated proposal links only its immediate predecessor'
);
select is(
  (
    select regeneration_feedback from public.roadmap_proposals
    where id = current_setting('test.proposal2')::uuid
  ),
  'The base phase is too long.',
  'the feedback that requested the change is stored with the proposal'
);

select public.apply_roadmap_proposal_change(
  'reject', current_setting('test.proposal2')::uuid
);
select set_config(
  'test.token3',
  (public.begin_roadmap_generation(
    'roadmap-key-000000014', 'roadmap-fingerprint-0014',
    current_setting('test.start')::date, current_setting('test.end')::date, 0,
    current_setting('test.note'), current_setting('test.proposal2')::uuid,
    'Still too long.'
  )).completion_token::text,
  true
);
select set_config(
  'test.proposal3',
  (public.finish_roadmap_generation(
    current_setting('test.token3')::uuid, 'proposal', 'fittip.roadmap.v2',
    'roadmap-v2', 'fixture', 'fixture-corpus-v1', 'fixture-no-spend', null,
    current_setting('test.note'), 'Still too long.',
    current_setting('test.content')::jsonb, current_setting('test.sources')::jsonb
  )).proposal_id::text,
  true
);
select public.apply_roadmap_proposal_change(
  'reject', current_setting('test.proposal3')::uuid
);
select set_config(
  'test.token4',
  (public.begin_roadmap_generation(
    'roadmap-key-000000015', 'roadmap-fingerprint-0015',
    current_setting('test.start')::date, current_setting('test.end')::date, 0,
    current_setting('test.note'), current_setting('test.proposal3')::uuid,
    'Once more.'
  )).completion_token::text,
  true
);
select set_config(
  'test.proposal4',
  (public.finish_roadmap_generation(
    current_setting('test.token4')::uuid, 'proposal', 'fittip.roadmap.v2',
    'roadmap-v2', 'fixture', 'fixture-corpus-v1', 'fixture-no-spend', null,
    current_setting('test.note'), 'Once more.',
    current_setting('test.content')::jsonb, current_setting('test.sources')::jsonb
  )).proposal_id::text,
  true
);
select public.apply_roadmap_proposal_change(
  'reject', current_setting('test.proposal4')::uuid
);

select throws_ok(
  $$select public.begin_roadmap_generation(
    'roadmap-key-000000016', 'roadmap-fingerprint-0016',
    current_setting('test.start')::date, current_setting('test.end')::date, 0,
    current_setting('test.note'), current_setting('test.proposal4')::uuid,
    'One more time.'
  )$$,
  'PT429',
  null,
  'a fourth regeneration is refused before any provider call'
);

-- ---------------------------------------------------------------------------
-- Acceptance.
-- ---------------------------------------------------------------------------

select lives_ok(
  $$select set_config(
    'test.version',
    (public.accept_roadmap_proposal(
      current_setting('test.edit')::uuid, 0
    )).version_id::text,
    true
  )$$,
  'an owner can accept a proposal that has no terminal decision'
);
select is(
  (select count(*)::bigint from public.roadmap_versions),
  1::bigint,
  'accepting creates exactly one immutable version'
);
select is(
  (select revision from public.roadmap_heads),
  1::bigint,
  'accepting advances the single head'
);
select is(
  (select current_version_id::text from public.roadmap_heads),
  current_setting('test.version'),
  'the head points at the version just accepted'
);
select is(
  (
    select decision from public.roadmap_proposal_decisions
    where proposal_id = current_setting('test.edit')::uuid
  ),
  'accepted',
  'accepting records its own terminal decision'
);
select is(
  (
    select (public.accept_roadmap_proposal(
      current_setting('test.edit')::uuid, 1
    )).result
  ),
  'replayed',
  'replaying acceptance of the same proposal returns its existing version'
);
select is(
  (select count(*)::bigint from public.roadmap_versions),
  1::bigint,
  'replaying acceptance creates no second version'
);

-- A competing proposal against the same expected head loses.
select set_config(
  'test.token5',
  (public.begin_roadmap_generation(
    'roadmap-key-000000020', 'roadmap-fingerprint-0020',
    current_setting('test.start')::date, current_setting('test.end')::date, 1,
    current_setting('test.note')
  )).completion_token::text,
  true
);
select set_config(
  'test.proposal5',
  (public.finish_roadmap_generation(
    current_setting('test.token5')::uuid, 'proposal', 'fittip.roadmap.v2',
    'roadmap-v2', 'fixture', 'fixture-corpus-v1', 'fixture-no-spend', null,
    current_setting('test.note'), null,
    current_setting('test.content')::jsonb, current_setting('test.sources')::jsonb
  )).proposal_id::text,
  true
);

select throws_ok(
  $$select public.accept_roadmap_proposal(
    current_setting('test.proposal5')::uuid, 0
  )$$,
  'PT409',
  null,
  'a proposal racing a stale expected head is refused'
);
select is(
  (select count(*)::bigint from public.roadmap_versions),
  1::bigint,
  'the losing acceptance leaves no partial version'
);

-- A source that is no longer current creates a visible conflict rather than a
-- silent overwrite.
reset role;
update public.goals
set status = 'abandoned', archived_at = now(), active_rank = null
where id = current_setting('test.goal')::uuid;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"70000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);


select throws_ok(
  $$select public.accept_roadmap_proposal(
    current_setting('test.proposal5')::uuid, 1
  )$$,
  'PT409',
  null,
  'a proposal whose source goal is no longer eligible is a conflict'
);

reset role;
update public.goals
set status = 'active', archived_at = null, active_rank = 1
where id = current_setting('test.goal')::uuid;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"70000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);


select lives_ok(
  $$select public.accept_roadmap_proposal(
    current_setting('test.proposal5')::uuid, 1
  )$$,
  'accepting against the current head succeeds once the sources agree'
);
select is(
  (select revision from public.roadmap_heads),
  2::bigint,
  'the second acceptance advances the head to revision two'
);
select is(
  (
    select previous_version_id::text from public.roadmap_versions
    where version_number = 2
  ),
  current_setting('test.version'),
  'the new version links the version it superseded'
);
select ok(
  (
    select accepted_at is not null and content is not null
    from public.roadmap_versions where version_number = 1
  ),
  'the superseded version remains readable and unchanged'
);

-- ---------------------------------------------------------------------------
-- Owner B cannot see or touch owner A's roadmap.
-- ---------------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"70000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

select is(
  (select count(*)::bigint from public.roadmap_proposals),
  0::bigint,
  'a second owner reads none of the first owner rows'
);
select is(
  (select count(*)::bigint from public.roadmap_versions),
  0::bigint,
  'a second owner reads none of the first owner accepted versions'
);
select is(
  (select count(*)::bigint from public.roadmap_heads),
  0::bigint,
  'a second owner reads no other roadmap head'
);
select throws_ok(
  $$select public.accept_roadmap_proposal(
    current_setting('test.proposal5')::uuid, 0
  )$$,
  'PT409',
  null,
  'a second owner cannot accept the first owner proposal'
);
select throws_ok(
  $$select public.apply_roadmap_proposal_change(
    'reject', current_setting('test.proposal5')::uuid
  )$$,
  'PT409',
  null,
  'a second owner cannot decline the first owner proposal'
);
select throws_ok(
  $$select public.finish_roadmap_generation(
    current_setting('test.token5')::uuid, 'failed', null, null, null, null,
    null, null, null, null, null, null, 'provider_unavailable'
  )$$,
  'PT409',
  null,
  'a second owner cannot finish the first owner generation'
);
select throws_ok(
  $$select public.record_roadmap_memory_candidates(
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
  'the cross-owner candidate attempt created nothing'
);

-- ---------------------------------------------------------------------------
-- A failed attempt records a safe code and no proposal.
-- ---------------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"70000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select set_config(
  'test.token6',
  (public.begin_roadmap_generation(
    'roadmap-key-000000030', 'roadmap-fingerprint-0030',
    current_setting('test.start')::date, current_setting('test.end')::date, 2
  )).completion_token::text,
  true
);
select is(
  (
    select (public.finish_roadmap_generation(
      current_setting('test.token6')::uuid, 'failed', null, null, null, null,
      null, null, null, null, null, null, 'provider_unavailable'
    )).state
  ),
  'failed',
  'a provider failure is recorded as a bounded safe code'
);
select is(
  (
    select failure_code from public.roadmap_generation_requests
    where idempotency_key = 'roadmap-key-000000030'
  ),
  'provider_unavailable',
  'the failed request stores only the safe code'
);
select is(
  (
    select proposal_id from public.roadmap_generation_requests
    where idempotency_key = 'roadmap-key-000000030'
  ),
  null::uuid,
  'a failed attempt creates no proposal'
);
select is(
  (select revision from public.roadmap_heads),
  2::bigint,
  'a failed attempt leaves the current roadmap unchanged'
);

reset role;

select * from finish();
rollback;
