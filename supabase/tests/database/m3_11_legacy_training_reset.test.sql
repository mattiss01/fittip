begin;
select plan(28);

-- The four plan-proposal tables came back in M3-16A, which is what M3-11 left
-- room for: it dropped the legacy contract and its rows, not the product. What
-- stands under these names now is M3-16A's schema, so the assertion that holds
-- permanently is that the *legacy* shape is gone rather than the name. The new
-- contract is asserted in `m3_16a_plan_proposal_application.test.sql`.
select has_column(
  'public', 'plan_generation_requests', 'expected_plan_revision',
  'what stands there now is anchored to a rolling plan revision, which the legacy table had no concept of'
);
select has_column(
  'public', 'plan_proposal_decisions', 'applied_count',
  'and the terminal decision records what entered the plan, where the legacy one could only record a rejection'
);
select hasnt_table('public', 'completed_activities', 'completed activities are removed');
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
-- Restored by M3-16A, unchanged, against the same unchanged contract version.
-- What M3-11 established and still holds is that no role can reach it.
select ok(
  not has_function_privilege(
    'authenticated', 'public.plan_content_is_valid(jsonb,date,date)', 'EXECUTE'
  ) and not has_function_privilege(
    'anon', 'public.plan_content_is_valid(jsonb,date,date)', 'EXECUTE'
  ) and not has_function_privilege(
    'service_role', 'public.plan_content_is_valid(jsonb,date,date)', 'EXECUTE'
  ),
  'the bounded-plan validator is reachable by no role'
);
select hasnt_function(
  'public', 'begin_plan_generation',
  array['text', 'text', 'date', 'integer', 'text'],
  'the legacy plan-generation claim RPC is removed'
);
-- M3-16A's `finish_plan_generation` happens to take the same twelve argument
-- types as the dropped one, so the signature no longer distinguishes them. Its
-- privilege boundary is asserted in M3-16A's own suite; what M3-11 proves here
-- is that the legacy *claim* RPC, whose five-argument shape nothing restored,
-- is still gone.
-- Restored on 23 September 2026 under ADR-010 decision 16, with M3-03's exact
-- signature and receipt shape, because the need M3-03 had is the need the plan
-- path has again: a planning note that states a durable constraint should
-- propose something. What M3-11 established and still holds is the reach, so
-- that is what is asserted now. The other half -- that `authenticated` gets a
-- route able to create nothing but a `proposed` item -- is proved in the
-- route's own suite, which is where decision 16's evidence list lives.
select ok(
  has_function_privilege(
    'authenticated',
    'public.record_plan_memory_candidates(uuid,bigint,jsonb)', 'EXECUTE'
  ) and not has_function_privilege(
    'anon', 'public.record_plan_memory_candidates(uuid,bigint,jsonb)', 'EXECUTE'
  ) and not has_function_privilege(
    'service_role',
    'public.record_plan_memory_candidates(uuid,bigint,jsonb)', 'EXECUTE'
  ),
  'the restored plan-memory RPC is reachable by the owner and by no other role'
);
select hasnt_function(
  'public', 'reject_plan_proposal', array['uuid'],
  'the legacy plan-proposal decision RPC is removed'
);

-- Both names are M3-16A's again, with different fields. `plan_memory_candidate_receipt`
-- came back on 23 September 2026 with M3-03's own two fields, so it is asserted
-- present rather than absent; `plan_proposal_decision_receipt` is the one legacy
-- receipt type nothing has restored.
-- Existence only. The two fields are proved where they are actually relied on:
-- the route's own suite selects the receipt into a typed temporary table, which
-- fails on any other shape.
select has_type('public', 'plan_memory_candidate_receipt', 'the plan memory receipt type is back');
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

-- The roadmap privilege boundary moved to M3-15F.
--
-- M3-11 revoked `execute` on all five ADR-015 functions from every role and
-- asserted that here, recording the intent that M3-15 restore them
-- deliberately. M3-15F is that restoration: `authenticated` holds `execute`
-- again, and `public`, `anon` and `service_role` still do not. Asserting the
-- old state here would now fail, and asserting the new one would put M3-15F's
-- boundary in M3-11's suite, so the whole matrix — including the check that
-- `accept_roadmap_proposal` names no dropped relation — lives in
-- `m3_15f_roadmap_generation.test.sql` instead.
--
-- What stays here is what M3-11 permanently established and M3-15F does not
-- touch: the dropped tables, the removed RPCs, the deleted legacy rows, and
-- the `expired` decision state above.

select * from finish();
rollback;
