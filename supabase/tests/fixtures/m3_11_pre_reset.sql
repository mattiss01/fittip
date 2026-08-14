begin;
set constraints all deferred;

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values (
  '31100000-0000-4000-8000-000000000001',
  'm3-11-reset@example.test',
  '{}'::jsonb,
  '{}'::jsonb
);

insert into auth.audit_log_entries (instance_id, id, payload, ip_address)
values (
  '00000000-0000-0000-0000-000000000000',
  '31100000-0000-4000-8000-000000000002',
  '{"action":"m3_11_preservation_proof"}'::json,
  '127.0.0.1'
);

insert into public.profiles (user_id)
values ('31100000-0000-4000-8000-000000000001');

insert into public.personal_activities (
  id, user_id, name, sport, measurement_mode, default_measurement
)
values (
  '31100000-0000-4000-8000-000000000010',
  '31100000-0000-4000-8000-000000000001',
  'Reset proof run',
  'running',
  'duration_intensity',
  '{"duration_minutes":30,"intensity":"easy"}'::jsonb
);

insert into public.detailed_plan_versions (
  id, user_id, version_number, day_count, start_date, end_date, timezone_name
)
values (
  '31100000-0000-4000-8000-000000000020',
  '31100000-0000-4000-8000-000000000001',
  1, 1, '2026-08-15', '2026-08-15', 'Europe/Berlin'
);
insert into public.detailed_plan_heads (user_id, current_version_id, revision)
values (
  '31100000-0000-4000-8000-000000000001',
  '31100000-0000-4000-8000-000000000020',
  1
);
insert into public.planned_sessions (
  id, user_id, plan_version_id, local_date, position, title, sport
)
values (
  '31100000-0000-4000-8000-000000000021',
  '31100000-0000-4000-8000-000000000001',
  '31100000-0000-4000-8000-000000000020',
  '2026-08-15', 0, 'Legacy easy run', 'running'
);
insert into public.planned_activities (
  id, user_id, planned_session_id, personal_activity_id, position, name,
  sport, measurement_mode, target
)
values (
  '31100000-0000-4000-8000-000000000022',
  '31100000-0000-4000-8000-000000000001',
  '31100000-0000-4000-8000-000000000021',
  '31100000-0000-4000-8000-000000000010',
  0, 'Reset proof run', 'running', 'duration_intensity',
  '{"duration_minutes":30,"intensity":"easy"}'::jsonb
);
insert into public.completed_sessions (
  id, user_id, completion_group_id, revision_number, planned_session_id,
  actual_local_date, timezone_name, duration_minutes, status,
  idempotency_key, idempotency_fingerprint
)
values (
  '31100000-0000-4000-8000-000000000030',
  '31100000-0000-4000-8000-000000000001',
  '31100000-0000-4000-8000-000000000031',
  1,
  '31100000-0000-4000-8000-000000000021',
  '2026-08-15', 'Europe/Berlin', 30, 'completed',
  '31100000-0000-4000-8000-000000000032',
  '0123456789abcdef0123456789abcdef'
);
insert into public.completion_heads (
  user_id, completion_group_id, current_completion_id, revision
)
values (
  '31100000-0000-4000-8000-000000000001',
  '31100000-0000-4000-8000-000000000031',
  '31100000-0000-4000-8000-000000000030',
  1
);
insert into public.completed_activities (
  id, user_id, completed_session_id, planned_activity_id,
  personal_activity_id, position, name, sport, measurement_mode,
  actual_measurement
)
values (
  '31100000-0000-4000-8000-000000000033',
  '31100000-0000-4000-8000-000000000001',
  '31100000-0000-4000-8000-000000000030',
  '31100000-0000-4000-8000-000000000022',
  '31100000-0000-4000-8000-000000000010',
  0, 'Reset proof run', 'running', 'duration_intensity',
  '{"duration_minutes":30,"intensity":"easy"}'::jsonb
);

insert into public.goal_collections (user_id, revision)
values ('31100000-0000-4000-8000-000000000001', 1);
insert into public.goals (
  id, user_id, title, desired_outcome, category, start_date,
  priority_tier, status, active_rank
)
values (
  '31100000-0000-4000-8000-000000000040',
  '31100000-0000-4000-8000-000000000001',
  'Keep moving', 'Train consistently', 'endurance', '2026-08-01',
  'core', 'active', 1
);
insert into public.goal_lifecycle_events (
  id, user_id, goal_id, from_status, to_status, collection_revision
)
values (
  '31100000-0000-4000-8000-000000000041',
  '31100000-0000-4000-8000-000000000001',
  '31100000-0000-4000-8000-000000000040',
  'achieved', 'active', 1
);

insert into public.memory_collections (user_id, revision)
values ('31100000-0000-4000-8000-000000000001', 1);
insert into public.memory_items (
  id, user_id, memory_type, status, provenance, current_revision_id
)
values (
  '31100000-0000-4000-8000-000000000050',
  '31100000-0000-4000-8000-000000000001',
  'preference', 'active', 'user_created',
  '31100000-0000-4000-8000-000000000051'
);
insert into public.memory_revisions (
  id, user_id, item_id, revision_number, content, author_class,
  provenance, change_kind, status_after
)
values (
  '31100000-0000-4000-8000-000000000051',
  '31100000-0000-4000-8000-000000000001',
  '31100000-0000-4000-8000-000000000050',
  1, 'Prefer morning sessions', 'user', 'user_created', 'created', 'active'
);

insert into public.onboarding_drafts (
  id, user_id, revision, current_step, expires_at
)
values (
  '31100000-0000-4000-8000-000000000060',
  '31100000-0000-4000-8000-000000000001',
  0, 1, pg_catalog.now() + interval '7 days'
);

insert into public.ai_spend_reservations (
  id, user_id, settlement_token, operation, spend_day,
  reserved_micro_usd, charged_micro_usd, rate_card_version,
  expires_at, settled_at
)
values (
  '31100000-0000-4000-8000-000000000070',
  '31100000-0000-4000-8000-000000000001',
  '31100000-0000-4000-8000-000000000071',
  'create_roadmap', '2026-08-14', 100, 80, 'reset-proof-v1',
  pg_catalog.now() + interval '15 minutes', pg_catalog.now()
);

insert into public.roadmap_generation_requests (
  id, user_id, completion_token, idempotency_key, request_fingerprint,
  requested_start_date, requested_end_date, expected_head_revision,
  status
)
values (
  '31100000-0000-4000-8000-000000000080',
  '31100000-0000-4000-8000-000000000001',
  '31100000-0000-4000-8000-000000000081',
  'm3-11-roadmap-key', 'm3-11-roadmap-fingerprint',
  '2026-08-15', '2026-09-11', 0, 'pending'
);
insert into public.roadmap_proposals (
  id, user_id, generation_request_id, origin, schema_version,
  prompt_version, provider_code, model_code, rate_card_version, content
)
values (
  '31100000-0000-4000-8000-000000000082',
  '31100000-0000-4000-8000-000000000001',
  '31100000-0000-4000-8000-000000000080',
  'ai_initial', 'fittip.roadmap.v2', 'reset-proof', 'fixture', 'fixture',
  'reset-proof-v1', '{}'::jsonb
);
update public.roadmap_generation_requests
set status = 'completed',
    proposal_id = '31100000-0000-4000-8000-000000000082'
where id = '31100000-0000-4000-8000-000000000080';
insert into public.roadmap_proposal_sources (
  proposal_id, user_id, ordinal, source_kind, record_id, revision_number
)
values (
  '31100000-0000-4000-8000-000000000082',
  '31100000-0000-4000-8000-000000000001',
  0, 'plan_version', '31100000-0000-4000-8000-000000000020', 1
);

-- Accepted and rejected source-dependent roadmap proposals must remain
-- byte-for-byte terminal while only the undecided proposal above expires.
insert into public.roadmap_generation_requests (
  id, user_id, completion_token, idempotency_key, request_fingerprint,
  requested_start_date, requested_end_date, expected_head_revision,
  status
)
values
  (
    '31100000-0000-4000-8000-000000000083',
    '31100000-0000-4000-8000-000000000001',
    '31100000-0000-4000-8000-000000000084',
    'm3-11-roadmap-accepted', 'm3-11-roadmap-accepted-fingerprint',
    '2026-08-15', '2026-09-11', 0, 'pending'
  ),
  (
    '31100000-0000-4000-8000-000000000087',
    '31100000-0000-4000-8000-000000000001',
    '31100000-0000-4000-8000-000000000088',
    'm3-11-roadmap-rejected', 'm3-11-roadmap-rejected-fingerprint',
    '2026-08-15', '2026-09-11', 1, 'pending'
  );
insert into public.roadmap_proposals (
  id, user_id, generation_request_id, origin, schema_version,
  prompt_version, provider_code, model_code, rate_card_version, content
)
values
  (
    '31100000-0000-4000-8000-000000000085',
    '31100000-0000-4000-8000-000000000001',
    '31100000-0000-4000-8000-000000000083',
    'ai_initial', 'fittip.roadmap.v2', 'reset-proof', 'fixture', 'fixture',
    'reset-proof-v1', '{"state":"accepted-before-reset"}'::jsonb
  ),
  (
    '31100000-0000-4000-8000-000000000089',
    '31100000-0000-4000-8000-000000000001',
    '31100000-0000-4000-8000-000000000087',
    'ai_initial', 'fittip.roadmap.v2', 'reset-proof', 'fixture', 'fixture',
    'reset-proof-v1', '{"state":"rejected-before-reset"}'::jsonb
  );
update public.roadmap_generation_requests
set status = 'completed',
    proposal_id = case id
      when '31100000-0000-4000-8000-000000000083'
        then '31100000-0000-4000-8000-000000000085'::uuid
      else '31100000-0000-4000-8000-000000000089'::uuid
    end
where id in (
  '31100000-0000-4000-8000-000000000083',
  '31100000-0000-4000-8000-000000000087'
);
insert into public.roadmap_proposal_sources (
  proposal_id, user_id, ordinal, source_kind, record_id, revision_number
)
values
  (
    '31100000-0000-4000-8000-000000000085',
    '31100000-0000-4000-8000-000000000001',
    0, 'plan_version', '31100000-0000-4000-8000-000000000020', 1
  ),
  (
    '31100000-0000-4000-8000-000000000089',
    '31100000-0000-4000-8000-000000000001',
    0, 'completion', '31100000-0000-4000-8000-000000000030', 1
  );
insert into public.roadmap_versions (
  id, user_id, version_number, source_proposal_id, content, accepted_at
)
values (
  '31100000-0000-4000-8000-000000000086',
  '31100000-0000-4000-8000-000000000001',
  1, '31100000-0000-4000-8000-000000000085',
  '{"state":"accepted-before-reset"}'::jsonb,
  '2026-08-14 18:00:00+00'
);
insert into public.roadmap_heads (
  user_id, revision, current_version_id, updated_at
)
values (
  '31100000-0000-4000-8000-000000000001',
  1, '31100000-0000-4000-8000-000000000086',
  '2026-08-14 18:00:00+00'
);
insert into public.roadmap_proposal_decisions (
  proposal_id, user_id, decision, accepted_version_id, decided_at
)
values
  (
    '31100000-0000-4000-8000-000000000085',
    '31100000-0000-4000-8000-000000000001',
    'accepted', '31100000-0000-4000-8000-000000000086',
    '2026-08-14 18:00:00+00'
  ),
  (
    '31100000-0000-4000-8000-000000000089',
    '31100000-0000-4000-8000-000000000001',
    'rejected', null,
    '2026-08-14 18:05:00+00'
  );

insert into public.plan_generation_requests (
  id, user_id, completion_token, idempotency_key, request_fingerprint,
  requested_start_date, requested_end_date, day_count, status
)
values (
  '31100000-0000-4000-8000-000000000090',
  '31100000-0000-4000-8000-000000000001',
  '31100000-0000-4000-8000-000000000091',
  'm3-11-plan-key-0001', 'm3-11-plan-fingerprint',
  '2026-08-15', '2026-08-15', 1, 'pending'
);
insert into public.plan_proposals (
  id, user_id, generation_request_id, origin, schema_version,
  prompt_version, provider_code, model_code, rate_card_version, content
)
values (
  '31100000-0000-4000-8000-000000000092',
  '31100000-0000-4000-8000-000000000001',
  '31100000-0000-4000-8000-000000000090',
  'ai_initial', 'fittip.seven-day-plan.v2', 'reset-proof', 'fixture',
  'fixture', 'reset-proof-v1', '{}'::jsonb
);
update public.plan_generation_requests
set status = 'completed',
    proposal_id = '31100000-0000-4000-8000-000000000092'
where id = '31100000-0000-4000-8000-000000000090';
insert into public.plan_proposal_sources (
  proposal_id, user_id, ordinal, source_kind, record_id, revision_number
)
values (
  '31100000-0000-4000-8000-000000000092',
  '31100000-0000-4000-8000-000000000001',
  0, 'plan_version', '31100000-0000-4000-8000-000000000020', 1
);
insert into public.plan_proposal_decisions (proposal_id, user_id, decision)
values (
  '31100000-0000-4000-8000-000000000092',
  '31100000-0000-4000-8000-000000000001',
  'rejected'
);

insert into public.rolling_plans (id, user_id, revision)
values (
  '31100000-0000-4000-8000-000000000100',
  '31100000-0000-4000-8000-000000000001',
  1
);
insert into public.rolling_plan_sessions (
  id, user_id, plan_id, local_date, position, title, sport
)
values (
  '31100000-0000-4000-8000-000000000101',
  '31100000-0000-4000-8000-000000000001',
  '31100000-0000-4000-8000-000000000100',
  '2026-08-16', 0, 'Rolling plan survives', 'running'
);
insert into public.rolling_plan_activities (
  id, user_id, plan_id, session_id, personal_activity_id, position,
  name, sport, measurement_mode, target
)
values (
  '31100000-0000-4000-8000-000000000102',
  '31100000-0000-4000-8000-000000000001',
  '31100000-0000-4000-8000-000000000100',
  '31100000-0000-4000-8000-000000000101',
  '31100000-0000-4000-8000-000000000010',
  0, 'Reset proof run', 'running', 'duration_intensity',
  '{"duration_minutes":30,"intensity":"easy"}'::jsonb
);
insert into public.rolling_plan_change_sets (
  id, user_id, plan_id, plan_revision, idempotency_key,
  request_fingerprint, provenance
)
values (
  '31100000-0000-4000-8000-000000000103',
  '31100000-0000-4000-8000-000000000001',
  '31100000-0000-4000-8000-000000000100',
  1, '31100000-0000-4000-8000-000000000104',
  repeat('a', 64), 'manual'
);
insert into public.rolling_plan_change_entries (
  id, user_id, plan_id, change_set_id, session_id, ordinal,
  change_kind, before_state, after_state
)
values (
  '31100000-0000-4000-8000-000000000105',
  '31100000-0000-4000-8000-000000000001',
  '31100000-0000-4000-8000-000000000100',
  '31100000-0000-4000-8000-000000000103',
  '31100000-0000-4000-8000-000000000101',
  0, 'add', null, '{"title":"Rolling plan survives"}'::jsonb
);

commit;
