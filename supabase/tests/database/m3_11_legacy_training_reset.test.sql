begin;
select plan(49);

select hasnt_table('public', 'plan_proposal_decisions', 'plan proposal decisions are removed');
select hasnt_table('public', 'plan_proposal_sources', 'plan proposal sources are removed');
select hasnt_table('public', 'plan_proposals', 'plan proposals are removed');
select hasnt_table('public', 'plan_generation_requests', 'plan generation requests are removed');
-- M3-15A rebuilds `completed_activities` on the rolling-plan foundation, so the
-- name exists again. What M3-11 removed was the M1-01 shape, and that is what
-- stays removed: the replacement hangs off `completion_id`, and nothing in it
-- can reference a `planned_activities` row, because that table is still gone.
select ok(
  (select count(*) = 0 from pg_attribute
   where attrelid = 'public.completed_activities'::regclass and not attisdropped
     and attname in ('completed_session_id', 'planned_activity_id')),
  'the legacy completed-activity shape is removed'
);
select hasnt_table('public', 'completion_heads', 'completion heads are removed');
select hasnt_table('public', 'completed_sessions', 'completed sessions are removed');
select hasnt_table('public', 'planned_activities', 'planned activities are removed');
select hasnt_table('public', 'planned_sessions', 'planned sessions are removed');
select hasnt_table('public', 'detailed_plan_heads', 'detailed plan heads are removed');
select hasnt_table('public', 'detailed_plan_versions', 'detailed plan versions are removed');

select hasnt_function(
  'public', 'save_manual_plan_version',
  array['integer', 'integer', 'date', 'text', 'jsonb'],
  'the legacy manual-plan RPC is removed'
);
select hasnt_function(
  'public', 'save_training_completion',
  array[
    'uuid', 'uuid', 'integer', 'uuid', 'date', 'timestamp with time zone',
    'text', 'integer', 'text', 'integer', 'text', 'text', 'text', 'boolean',
    'boolean', 'boolean', 'boolean', 'text', 'jsonb'
  ],
  'the legacy completion RPC is removed'
);
select hasnt_function(
  'public', 'reject_inactive_completion_activity', array[]::text[],
  'the legacy completion trigger function is removed'
);
select hasnt_function(
  'public', 'plan_content_is_valid', array['jsonb', 'date', 'date'],
  'the bounded-plan validator is removed'
);
select hasnt_function(
  'public', 'begin_plan_generation',
  array['text', 'text', 'date', 'integer', 'text'],
  'the legacy plan-generation claim RPC is removed'
);
select hasnt_function(
  'public', 'finish_plan_generation',
  array[
    'uuid', 'text', 'text', 'text', 'text', 'text', 'text', 'uuid', 'text',
    'jsonb', 'jsonb', 'text'
  ],
  'the legacy plan-generation finish RPC is removed'
);
select hasnt_function(
  'public', 'record_plan_memory_candidates',
  array['uuid', 'bigint', 'jsonb'],
  'the legacy plan-memory RPC is removed'
);
select hasnt_function(
  'public', 'reject_plan_proposal', array['uuid'],
  'the legacy plan-proposal decision RPC is removed'
);

select hasnt_type('public', 'plan_generation_receipt', 'legacy plan claim receipt is removed');
select hasnt_type('public', 'plan_generation_result', 'legacy plan result is removed');
select hasnt_type('public', 'plan_memory_candidate_receipt', 'legacy plan memory receipt is removed');
select hasnt_type('public', 'plan_proposal_decision_receipt', 'legacy plan decision receipt is removed');

select has_table('public', 'personal_activities', 'personal activity definitions are preserved');
select has_function(
  'public', 'is_valid_training_measurement', array['text', 'jsonb'],
  'shared training measurement validation is preserved'
);
select has_table('public', 'rolling_plans', 'M3-10 rolling plans are preserved');
select has_table('public', 'rolling_plan_sessions', 'M3-10 sessions are preserved');
select has_table('public', 'rolling_plan_activities', 'M3-10 activities are preserved');
select has_table('public', 'rolling_plan_change_sets', 'M3-10 change sets are preserved');
select has_table('public', 'rolling_plan_change_entries', 'M3-10 change entries are preserved');
select has_function(
  'public', 'get_rolling_plan_slice', array['date', 'date'],
  'M3-10 read RPC is preserved'
);
select has_function(
  'public', 'apply_rolling_plan_change_set',
  array['bigint', 'uuid', 'text', 'jsonb'],
  'M3-10 write RPC is preserved'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'roadmap_proposal_decisions_decision_check'
      and pg_get_constraintdef(oid) like '%expired%'
  ),
  'roadmap decisions carry an explicit expired state'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.begin_roadmap_generation(text,text,date,date,bigint,text,uuid,text)',
    'EXECUTE'
  ),
  'authenticated cannot begin roadmap generation during maintenance'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.begin_roadmap_generation(text,text,date,date,bigint,text,uuid,text)',
    'EXECUTE'
  ),
  'anonymous cannot begin roadmap generation during maintenance'
);
select ok(
  not has_function_privilege(
    'service_role',
    'public.begin_roadmap_generation(text,text,date,date,bigint,text,uuid,text)',
    'EXECUTE'
  ),
  'service role cannot begin roadmap generation during maintenance'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.finish_roadmap_generation(uuid,text,text,text,text,text,text,uuid,text,text,jsonb,jsonb,text)',
    'EXECUTE'
  ),
  'authenticated cannot finish roadmap generation during maintenance'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.finish_roadmap_generation(uuid,text,text,text,text,text,text,uuid,text,text,jsonb,jsonb,text)',
    'EXECUTE'
  ),
  'anonymous cannot finish roadmap generation during maintenance'
);
select ok(
  not has_function_privilege(
    'service_role',
    'public.finish_roadmap_generation(uuid,text,text,text,text,text,text,uuid,text,text,jsonb,jsonb,text)',
    'EXECUTE'
  ),
  'service role cannot finish roadmap generation during maintenance'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.record_roadmap_memory_candidates(uuid,bigint,jsonb)',
    'EXECUTE'
  ),
  'authenticated cannot record roadmap memory during maintenance'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.record_roadmap_memory_candidates(uuid,bigint,jsonb)',
    'EXECUTE'
  ),
  'anonymous cannot record roadmap memory during maintenance'
);
select ok(
  not has_function_privilege(
    'service_role',
    'public.record_roadmap_memory_candidates(uuid,bigint,jsonb)',
    'EXECUTE'
  ),
  'service role cannot record roadmap memory during maintenance'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.apply_roadmap_proposal_change(text,uuid,jsonb)',
    'EXECUTE'
  ),
  'authenticated cannot change roadmap proposals during maintenance'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.apply_roadmap_proposal_change(text,uuid,jsonb)',
    'EXECUTE'
  ),
  'anonymous cannot change roadmap proposals during maintenance'
);
select ok(
  not has_function_privilege(
    'service_role',
    'public.apply_roadmap_proposal_change(text,uuid,jsonb)',
    'EXECUTE'
  ),
  'service role cannot change roadmap proposals during maintenance'
);
select ok(
  not has_function_privilege(
    'authenticated', 'public.accept_roadmap_proposal(uuid,bigint)', 'EXECUTE'
  ),
  'authenticated cannot accept roadmap proposals during maintenance'
);
select ok(
  not has_function_privilege(
    'anon', 'public.accept_roadmap_proposal(uuid,bigint)', 'EXECUTE'
  ),
  'anonymous cannot accept roadmap proposals during maintenance'
);
select ok(
  not has_function_privilege(
    'service_role', 'public.accept_roadmap_proposal(uuid,bigint)', 'EXECUTE'
  ),
  'service role cannot accept roadmap proposals during maintenance'
);

select ok(
  pg_get_functiondef(
    'public.accept_roadmap_proposal(uuid,bigint)'::regprocedure
  ) !~ '(detailed_plan|completion_heads)',
  'roadmap acceptance has no legacy relation reference'
);

select * from finish();
rollback;
