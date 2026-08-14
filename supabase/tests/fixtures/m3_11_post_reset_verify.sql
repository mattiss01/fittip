do $$
declare
  removed_tables constant text[] := array[
    'plan_proposal_decisions', 'plan_proposal_sources', 'plan_proposals',
    'plan_generation_requests', 'completed_activities', 'completion_heads',
    'completed_sessions', 'planned_activities', 'planned_sessions',
    'detailed_plan_heads', 'detailed_plan_versions'
  ];
  table_name text;
begin
  foreach table_name in array removed_tables loop
    if pg_catalog.to_regclass('public.' || table_name) is not null then
      raise exception 'legacy table still exists: %', table_name;
    end if;
  end loop;

  if pg_catalog.to_regprocedure(
    'public.save_manual_plan_version(integer,integer,date,text,jsonb)'
  ) is not null
    or pg_catalog.to_regprocedure(
      'public.save_training_completion(uuid,uuid,integer,uuid,date,timestamp with time zone,text,integer,text,integer,text,text,text,boolean,boolean,boolean,boolean,text,jsonb)'
    ) is not null
    or pg_catalog.to_regprocedure(
      'public.begin_plan_generation(text,text,date,integer,text)'
    ) is not null
  then
    raise exception 'a legacy mutation RPC still exists';
  end if;

  if (select count(*) from auth.users) <> 1
    or (select count(*) from auth.audit_log_entries) <> 1
    or (select count(*) from public.profiles) <> 1
    or (select count(*) from public.personal_activities) <> 1
    or (select count(*) from public.goal_collections) <> 1
    or (select count(*) from public.goals) <> 1
    or (select count(*) from public.goal_lifecycle_events) <> 1
    or (select count(*) from public.memory_collections) <> 1
    or (select count(*) from public.memory_items) <> 1
    or (select count(*) from public.memory_revisions) <> 1
    or (select count(*) from public.onboarding_drafts) <> 1
    or (select count(*) from public.ai_spend_reservations) <> 1
    or (select count(*) from public.roadmap_generation_requests) <> 3
    or (select count(*) from public.roadmap_proposals) <> 3
    or (select count(*) from public.roadmap_proposal_sources) <> 3
    or (select count(*) from public.roadmap_proposal_decisions) <> 3
    or (select count(*) from public.roadmap_versions) <> 1
    or (select count(*) from public.roadmap_heads) <> 1
    or (select count(*) from public.rolling_plans) <> 1
    or (select count(*) from public.rolling_plan_sessions) <> 1
    or (select count(*) from public.rolling_plan_activities) <> 1
    or (select count(*) from public.rolling_plan_change_sets) <> 1
    or (select count(*) from public.rolling_plan_change_entries) <> 1
  then
    raise exception 'a preserved-domain count changed';
  end if;

  if not exists (
    select 1
    from auth.users auth_user
    join public.profiles profile on profile.user_id = auth_user.id
    where auth_user.id = '31100000-0000-4000-8000-000000000001'
  )
    or not exists (
      select 1
      from public.goal_collections collection
      join public.goals goal on goal.user_id = collection.user_id
      join public.goal_lifecycle_events event
        on event.goal_id = goal.id
        and event.user_id = goal.user_id
    )
    or not exists (
      select 1
      from public.memory_collections collection
      join public.memory_items item on item.user_id = collection.user_id
      join public.memory_revisions revision
        on revision.id = item.current_revision_id
        and revision.user_id = item.user_id
    )
    or not exists (
    select 1
    from public.memory_items item
    join public.memory_revisions revision
      on revision.id = item.current_revision_id
      and revision.user_id = item.user_id
  )
    or not exists (
      select 1
      from public.rolling_plan_activities activity
      join public.personal_activities personal
        on personal.id = activity.personal_activity_id
        and personal.user_id = activity.user_id
    )
    or not exists (
      select 1
      from public.roadmap_generation_requests request
      join public.roadmap_proposals proposal
        on proposal.id = request.proposal_id
        and proposal.user_id = request.user_id
      group by request.user_id
      having count(*) = 3
    )
    or not exists (
      select 1
      from public.roadmap_heads head
      join public.roadmap_versions version
        on version.id = head.current_version_id
        and version.user_id = head.user_id
      join public.roadmap_proposals proposal
        on proposal.id = version.source_proposal_id
        and proposal.user_id = version.user_id
      where head.revision = 1
        and version.id = '31100000-0000-4000-8000-000000000086'
        and version.content = '{"state":"accepted-before-reset"}'::jsonb
    )
  then
    raise exception 'a preserved same-owner reference was broken';
  end if;

  if (select decision from public.roadmap_proposal_decisions
      where proposal_id = '31100000-0000-4000-8000-000000000082')
      is distinct from 'expired'
  then
    raise exception 'source-dependent roadmap proposal was not expired';
  end if;

  if not exists (
    select 1
    from public.roadmap_proposal_decisions
    where proposal_id = '31100000-0000-4000-8000-000000000085'
      and decision = 'accepted'
      and accepted_version_id = '31100000-0000-4000-8000-000000000086'
      and decided_at = '2026-08-14 18:00:00+00'::timestamptz
  )
    or not exists (
      select 1
      from public.roadmap_proposal_decisions
      where proposal_id = '31100000-0000-4000-8000-000000000089'
        and decision = 'rejected'
        and accepted_version_id is null
        and decided_at = '2026-08-14 18:05:00+00'::timestamptz
    )
  then
    raise exception 'an accepted or rejected roadmap decision changed';
  end if;

  if not exists (
    select 1
    from auth.audit_log_entries
    where id = '31100000-0000-4000-8000-000000000002'
      and payload::jsonb = '{"action":"m3_11_preservation_proof"}'::jsonb
  )
  then
    raise exception 'representative auth audit evidence changed';
  end if;

  if pg_catalog.has_function_privilege(
      'authenticated',
      'public.accept_roadmap_proposal(uuid,bigint)',
      'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
      'anon',
      'public.accept_roadmap_proposal(uuid,bigint)',
      'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
      'service_role',
      'public.accept_roadmap_proposal(uuid,bigint)',
      'EXECUTE'
    )
  then
    raise exception 'roadmap acceptance remains callable';
  end if;

  if pg_catalog.pg_get_functiondef(
    'public.accept_roadmap_proposal(uuid,bigint)'::regprocedure
  ) ~ '(detailed_plan|completion_heads)'
  then
    raise exception 'roadmap acceptance retains a legacy dependency';
  end if;

  if not public.is_valid_training_measurement(
    'duration_intensity',
    '{"duration_minutes":30,"intensity":"easy"}'::jsonb
  )
  then
    raise exception 'shared training measurement validation was removed';
  end if;
end;
$$;
