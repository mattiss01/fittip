-- A roadmap proposal stays acceptable (owner, 16 Oct 2026).
--
-- `accept_roadmap_proposal` refused a proposal whose sources had changed since
-- the coach read them: a log edited or deleted (ADR-031), a memory item
-- edited or disabled, a goal archived. The owner decided that a proposal
-- should stay acceptable whatever changed after it was asked for. The sources
-- stay recorded and are no longer compared.
--
-- One refusal is kept, on what the proposal names rather than what it read: a
-- goal the coach was given and a phase or milestone names, which is no longer
-- the owner's active or achieved goal (deleted, paused or abandoned), since a
-- roadmap in force cannot point at it. Achieved stays allowed, as it was; it
-- is the rule the source loop applied to goals.
--
-- Unchanged: the head revision the page read, and the lineage check that the
-- roadmap the proposal was made under is still in force (ADR-028 amendment).
--
-- Structurally: re-emitted from `20261013202639_roadmap_proposal_lineage`
-- (the latest migration to define it) with the source loop replaced by the
-- goal check above and its loop variable removed. Same signature, so the
-- grants below restate what `create or replace` keeps.

CREATE OR REPLACE FUNCTION public.accept_roadmap_proposal(p_proposal_id uuid, p_expected_head_revision bigint)
 RETURNS public.roadmap_acceptance_receipt
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  v_user_id uuid;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_proposal public.roadmap_proposals;
  v_decision public.roadmap_proposal_decisions;
  v_head public.roadmap_heads;
  v_head_revision bigint;
  v_made_under bigint;
  v_current_version_id uuid;
  v_version_id uuid;
  v_version_number bigint;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'An authenticated FitTip user is required.';
  end if;

  if p_proposal_id is null
    or p_expected_head_revision is null
    or p_expected_head_revision < 0
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid roadmap acceptance.';
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

  select * into v_proposal
  from public.roadmap_proposals
  where id = p_proposal_id and user_id = v_user_id;

  if not found then
    raise exception using
      errcode = 'PT409',
      message = 'That proposal is no longer available.';
  end if;

  -- Replaying acceptance of the same proposal returns its existing version.
  select * into v_decision
  from public.roadmap_proposal_decisions
  where proposal_id = v_proposal.id and user_id = v_user_id;

  if found then
    if v_decision.decision = 'accepted' then
      select revision into v_head_revision
      from public.roadmap_heads
      where user_id = v_user_id;
      return (
        v_proposal.id,
        v_decision.accepted_version_id,
        coalesce(v_head_revision, 0),
        'replayed'
      )::public.roadmap_acceptance_receipt;
    end if;
    raise exception using
      errcode = 'PT409',
      message = 'That proposal has already been decided.';
  end if;

  -- What the proposal names, not what it was made from (owner, 16 Oct 2026).
  -- A log, memory item or goal edited or deleted since the coach read it no
  -- longer blocks: the sources stay recorded as provenance and are not
  -- compared. The one refusal left is a goal the roadmap itself names, in a
  -- phase's attention or a milestone's "Counts toward", that is no longer the
  -- owner's active or achieved goal: a roadmap in force cannot point at one
  -- deleted, paused or abandoned.
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(
      coalesce(v_proposal.content->'phases', '[]'::jsonb)) as phase(value)
    cross join lateral (
      select attention.value->>'goalId' as goal_id
      from pg_catalog.jsonb_array_elements(
        coalesce(phase.value->'goalAttention', '[]'::jsonb)) as attention(value)
      union all
      select named.value #>> '{}'
      from pg_catalog.jsonb_array_elements(
        coalesce(phase.value->'milestones', '[]'::jsonb)) as milestone(value)
      cross join lateral pg_catalog.jsonb_array_elements(
        coalesce(milestone.value->'goalIds', '[]'::jsonb)) as named(value)
    ) as named_goal
    -- Among the goals the coach was given, which a proposal's goals are by
    -- construction (the validator admits only those); a hand-written roadmap
    -- checks its goals when it is written.
    join public.roadmap_proposal_sources source
      on source.proposal_id = v_proposal.id
     and source.user_id = v_user_id
     and source.source_kind = 'goal'
     and source.record_id::text = pg_catalog.lower(named_goal.goal_id)
    where not exists (
      select 1 from public.goals goal
      where goal.id::text = pg_catalog.lower(named_goal.goal_id)
        and goal.user_id = v_user_id
        and goal.status in ('active', 'achieved')
    )
  ) then
    raise exception using
      errcode = 'PT409',
      message = 'Your goals changed. A goal this proposal names is no longer active.';
  end if;

  select * into v_head
  from public.roadmap_heads
  where user_id = v_user_id
  for update;

  v_head_revision := coalesce(v_head.revision, 0);
  v_current_version_id := v_head.current_version_id;

  if v_head_revision <> p_expected_head_revision then
    raise exception using
      errcode = 'PT409',
      message = 'Your roadmap changed. Review the proposal again.';
  end if;

  -- The roadmap this proposal was made under must still be the one in force.
  -- `begin_roadmap_generation` stored the head it checked on the request, and
  -- an owner's edit shares its source's request. Without this a proposal left
  -- open while another roadmap was accepted could replace the newer one: the
  -- check above only says the page was current, not the proposal.
  select request.expected_head_revision into v_made_under
  from public.roadmap_generation_requests request
  where request.id = v_proposal.generation_request_id
    and request.user_id = v_user_id;

  if found and v_made_under <> v_head_revision then
    raise exception using
      errcode = 'PT409',
      message = 'Your roadmap changed since this was proposed. Decline it and ask again.';
  end if;

  v_version_number := v_head_revision + 1;
  v_version_id := gen_random_uuid();

  insert into public.roadmap_versions (
    id, user_id, version_number, source_proposal_id, previous_version_id,
    content, accepted_at
  )
  values (
    v_version_id, v_user_id, v_version_number, v_proposal.id,
    v_current_version_id, v_proposal.content, v_now
  );

  insert into public.roadmap_heads (
    user_id, revision, current_version_id, updated_at
  )
  values (v_user_id, v_version_number, v_version_id, v_now)
  on conflict (user_id)
  do update set
    revision = excluded.revision,
    current_version_id = excluded.current_version_id,
    updated_at = excluded.updated_at;

  insert into public.roadmap_proposal_decisions (
    proposal_id, user_id, decision, accepted_version_id, decided_at
  )
  values (v_proposal.id, v_user_id, 'accepted', v_version_id, v_now);

  return (v_proposal.id, v_version_id, v_version_number, 'accepted')
    ::public.roadmap_acceptance_receipt;
end;
$$;

revoke all privileges on function public.accept_roadmap_proposal(uuid, bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.accept_roadmap_proposal(uuid, bigint)
  to authenticated;
