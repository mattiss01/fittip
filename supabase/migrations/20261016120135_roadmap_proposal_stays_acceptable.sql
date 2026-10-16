-- A roadmap proposal stays acceptable (owner, 16 Oct 2026).
--
-- `accept_roadmap_proposal` compared every source a proposal recorded with the
-- record as it is now. The application records only the logs the coach was
-- sent, so in practice a log edited or deleted (ADR-031) after asking made the
-- proposal impossible to accept; the goal and memory branches never ran. The
-- owner decided that a proposal stays acceptable whatever changed after it was
-- asked for: the sources stay recorded and are no longer compared.
--
-- Goals are no exception, on the owner's word: one the proposal names that has
-- since been paused, abandoned or deleted does not refuse. The proposal says
-- so before Accept (the roadmap page), and the Plan's coach is already told of
-- a phase whose goal is missing (`roadmap-stale-reasons.ts`).
--
-- Unchanged: the head revision the page read, and the lineage check that the
-- roadmap the proposal was made under is still in force (ADR-028 amendment).
--
-- Structurally: re-emitted from `20261013202639_roadmap_proposal_lineage`
-- (the latest migration to define it) with the source loop and its loop
-- variable removed. Same signature, so the grants below restate what
-- `create or replace` keeps.

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

  -- A proposal stays acceptable (owner, 16 Oct 2026): nothing the owner
  -- changed after asking is compared. Its sources stay recorded as
  -- provenance. A goal it names that is no longer active is shown on the
  -- proposal before Accept, and accepting puts the roadmap in force as it is.

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
