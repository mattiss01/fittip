-- Editing the roadmap in force (ADR-030).
--
-- The owner decided on 13 and 14 October 2026 that the roadmap in force can be
-- opened in a form and changed, and how:
--
--   * the change is in force at once, stored as an `owner_written` proposal
--     accepted in the same step, as a roadmap written by hand is (ADR-029);
--   * the past stays fixed: the start does not move, a phase whose last day is
--     before the owner's today comes back identical, and nothing that is not
--     locked may end before today; a roadmap whose phases have all ended is
--     not edited;
--   * a milestone's tick stays only where the milestone is unchanged, the same
--     title and the same date, in whatever phase it now sits;
--   * a done review stays with its phase.
--
-- Marks belong to one accepted version (ADR-026, ADR-027) and a saved change
-- is a new version, so they are copied onto it here, in the same transaction
-- as the acceptance. Nothing of the earlier version is changed or deleted.
--
-- `write_roadmap` is not reused: it refuses a start before yesterday, and a
-- roadmap in force has usually started.

create or replace function public.edit_roadmap(
  p_content jsonb,
  p_expected_head_revision bigint
)
returns public.roadmap_acceptance_receipt
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_today date;
  v_start date;
  v_end date;
  v_head public.roadmap_heads;
  v_old jsonb;
  v_replay record;
  v_proposal_id uuid;
  v_receipt public.roadmap_acceptance_receipt;
  v_locked integer := 0;
  v_count integer;
  v_mark record;
  v_old_milestone jsonb;
  v_target record;
  v_used text[] := array[]::text[];
  v_review record;
  v_reviewed_phase integer;
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'An authenticated FitTip user is required.';
  end if;

  -- Today where the owner is, from the confirmed time zone, and UTC's where
  -- none is confirmed: the day that decides which phases have ended.
  select (pg_catalog.timezone(
    coalesce(profile.timezone_name, 'UTC'), v_now
  ))::date into v_today
  from public.profiles profile
  where profile.user_id = v_user_id;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'A FitTip profile is required.';
  end if;

  if p_content is null
    or pg_catalog.jsonb_typeof(p_content) <> 'object'
    or p_expected_head_revision is null
    or p_expected_head_revision < 1
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid roadmap.';
  end if;

  begin
    v_start := (p_content->>'startDate')::date;
    v_end := (p_content->>'endDate')::date;
  exception
    when others then
      raise exception using
        errcode = '22023',
        message = 'Invalid roadmap.';
  end;

  if v_start is null
    or v_end is null
    or v_end < v_today
    or v_end < v_start + 27
    or v_end > v_start + 365
    or not public.roadmap_content_is_valid(p_content, v_start, v_end)
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid roadmap.';
  end if;

  perform pg_catalog.set_config('lock_timeout', '3s', true);
  begin
    perform pg_catalog.pg_advisory_xact_lock(
      62005,
      pg_catalog.hashtext(v_user_id::text)
    );
  exception
    when lock_not_available then
      raise exception using
        errcode = 'PT409',
        message = 'Your roadmap changed. Reload and try again.';
  end;

  select * into v_head
  from public.roadmap_heads
  where user_id = v_user_id;

  if coalesce(v_head.revision, 0) <> p_expected_head_revision then
    -- The same change, in force one revision on: this edit has already
    -- landed.
    select proposal.id as proposal_id, version.id as version_id
    into v_replay
    from public.roadmap_versions version
    join public.roadmap_proposals proposal
      on proposal.id = version.source_proposal_id
      and proposal.user_id = version.user_id
    where version.user_id = v_user_id
      and version.id = v_head.current_version_id
      and v_head.revision = p_expected_head_revision + 1
      and proposal.origin = 'owner_written'
      and proposal.content = p_content;

    if found then
      return (
        v_replay.proposal_id, v_replay.version_id, v_head.revision, 'replayed'
      )::public.roadmap_acceptance_receipt;
    end if;

    raise exception using
      errcode = 'PT409',
      message = 'Your roadmap changed. Reload and try again.';
  end if;

  select version.content into v_old
  from public.roadmap_versions version
  where version.id = v_head.current_version_id
    and version.user_id = v_user_id;

  -- One refusal for everything about the past, as for the content: the
  -- application has said what is wrong before this is reached.
  if not found
    or (v_old->>'startDate')::date is distinct from v_start
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid roadmap.';
  end if;

  -- Every phase that has ended comes back as it was. Phases are contiguous
  -- and in order, so the ended ones are the first few.
  v_count := pg_catalog.jsonb_array_length(v_old->'phases');
  while v_locked < v_count
    and ((v_old->'phases'->v_locked->>'endDate')::date) < v_today
  loop
    if (p_content->'phases'->v_locked) is distinct from
       (v_old->'phases'->v_locked)
    then
      raise exception using
        errcode = '22023',
        message = 'Invalid roadmap.';
    end if;
    v_locked := v_locked + 1;
  end loop;

  -- A roadmap that has ended is over, not edited: a new one replaces it.
  if v_locked = v_count then
    raise exception using
      errcode = '22023',
      message = 'Invalid roadmap.';
  end if;

  -- The phase after them keeps its start, and nothing not locked ends before
  -- today: either would rewrite days that have passed.
  if v_locked < v_count
    and (p_content->'phases'->v_locked->>'startDate')
      is distinct from (v_old->'phases'->v_locked->>'startDate')
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid roadmap.';
  end if;
  for v_index in
    v_locked .. pg_catalog.jsonb_array_length(p_content->'phases') - 1
  loop
    if ((p_content->'phases'->v_index->>'endDate')::date) < v_today then
      raise exception using
        errcode = '22023',
        message = 'Invalid roadmap.';
    end if;
  end loop;

  insert into public.roadmap_proposals (
    user_id, origin, schema_version, content, created_at
  )
  values (
    v_user_id, 'owner_written', p_content->>'schemaVersion', p_content, v_now
  )
  returning id into v_proposal_id;

  -- The version, the head and the decision, by the one path that writes them.
  -- The advisory lock is the transaction's already.
  v_receipt := public.accept_roadmap_proposal(
    v_proposal_id, p_expected_head_revision
  );

  -- A tick goes to the first unchanged milestone not already given one: the
  -- same title and the same date, in any phase. One that changed starts
  -- unticked (owner, 14 Oct 2026).
  for v_mark in
    select phase_index, milestone_index, reached_on
    from public.roadmap_milestone_marks
    where version_id = v_head.current_version_id and user_id = v_user_id
    order by phase_index, milestone_index
  loop
    v_old_milestone :=
      v_old->'phases'->v_mark.phase_index->'milestones'->v_mark.milestone_index;
    if v_old_milestone is null then
      continue;
    end if;

    select phase.ordinality - 1 as phase_index,
      milestone.ordinality - 1 as milestone_index
    into v_target
    from pg_catalog.jsonb_array_elements(p_content->'phases')
      with ordinality as phase (value, ordinality)
    cross join lateral pg_catalog.jsonb_array_elements(phase.value->'milestones')
      with ordinality as milestone (value, ordinality)
    where milestone.value->>'title' = v_old_milestone->>'title'
      and milestone.value->>'targetDate' = v_old_milestone->>'targetDate'
      and not (
        ((phase.ordinality - 1)::text || ':' || (milestone.ordinality - 1)::text)
        = any (v_used)
      )
    order by phase.ordinality, milestone.ordinality
    limit 1;

    if found then
      v_used := v_used
        || (v_target.phase_index::text || ':' || v_target.milestone_index::text);
      insert into public.roadmap_milestone_marks (
        user_id, version_id, phase_index, milestone_index, reached_on
      )
      values (
        v_user_id, v_receipt.version_id, v_target.phase_index,
        v_target.milestone_index, v_mark.reached_on
      );
    end if;
  end loop;

  -- A done review stays with its phase. A phase reviewed on its last day and
  -- since lengthened is not over any more, so the mark falls back to the phase
  -- before it, which has ended and is locked.
  select phase_index, reviewed_on into v_review
  from public.roadmap_review_marks
  where version_id = v_head.current_version_id and user_id = v_user_id;

  if found then
    v_reviewed_phase := v_review.phase_index;
    if (p_content->'phases'->v_reviewed_phase->>'endDate')
      is distinct from (v_old->'phases'->v_reviewed_phase->>'endDate')
    then
      v_reviewed_phase := v_reviewed_phase - 1;
    end if;
    if v_reviewed_phase >= 0 then
      insert into public.roadmap_review_marks (
        version_id, user_id, phase_index, reviewed_on
      )
      values (
        v_receipt.version_id, v_user_id, v_reviewed_phase, v_review.reviewed_on
      );
    end if;
  end if;

  return v_receipt;
end;
$$;

revoke all privileges on function public.edit_roadmap(jsonb, bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.edit_roadmap(jsonb, bigint)
  to authenticated;
