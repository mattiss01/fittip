-- A roadmap proposal knows which roadmap it was made under.
--
-- Found in the review of ADR-028 on 13 Oct 2026, and true of every roadmap
-- proposal before it. `begin_roadmap_generation` has always refused a request
-- whose expected head is not the real one, and stored that head on the request
-- row; `accept_roadmap_proposal` never compared it. So a proposal left open in
-- one tab while a different roadmap was accepted in another could still be
-- accepted, and replaced the newer roadmap. For a request to change a roadmap
-- that is a changed version of roadmap 1 replacing roadmap 2.
--
--   1. `accept_roadmap_proposal` refuses a proposal whose request was made
--      under another head than the one in force. Its body is its live
--      definition with that one check added.
--   2. A request records that it asked for the roadmap in force to be changed
--      (`changes_roadmap`), so that asking again after such a proposal is
--      declined is a change request too, and can be sent the whole roadmap as
--      the first was. `begin_roadmap_generation` gains `p_change_roadmap`; a
--      new parameter is a new signature, so the old function is dropped and
--      this one created, with its grants. A first request stores what it was
--      given; a regeneration inherits its predecessor's, whatever it was given.
--
-- No row is rewritten or deleted. Existing requests are not change requests.

alter table public.roadmap_generation_requests
  add column changes_roadmap boolean not null default false;

-- This table is read by its owner column by column (`completion_token` is the
-- capability to finish a generation and is never granted), so the new column
-- needs its own grant to be read at all.
grant select (changes_roadmap)
  on table public.roadmap_generation_requests to authenticated;

drop function public.begin_roadmap_generation(
  text, text, date, date, bigint, text, uuid, text
);

CREATE OR REPLACE FUNCTION public.begin_roadmap_generation(p_idempotency_key text, p_request_fingerprint text, p_start_date date, p_end_date date, p_expected_head_revision bigint, p_planning_note text DEFAULT NULL::text, p_previous_proposal_id uuid DEFAULT NULL::uuid, p_regeneration_feedback text DEFAULT NULL::text, p_change_roadmap boolean DEFAULT false)
 RETURNS public.roadmap_generation_receipt
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  v_user_id uuid;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_existing public.roadmap_generation_requests;
  v_head_revision bigint;
  v_note text;
  v_feedback text;
  v_previous public.roadmap_proposals;
  v_previous_request public.roadmap_generation_requests;
  v_regeneration integer := 0;
  v_changes_roadmap boolean := false;
  v_receipt public.roadmap_generation_receipt;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'An authenticated FitTip user is required.';
  end if;

  if not exists (
    select 1 from public.profiles where user_id = v_user_id
  ) then
    raise exception using
      errcode = '23503',
      message = 'A FitTip profile is required.';
  end if;

  if p_idempotency_key is null
    or pg_catalog.char_length(p_idempotency_key) not between 16 and 128
    or p_request_fingerprint is null
    or pg_catalog.char_length(p_request_fingerprint) not between 16 and 256
    or p_start_date is null
    or p_end_date is null
    or p_expected_head_revision is null
    or p_expected_head_revision < 0
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid roadmap request.';
  end if;

  -- Decision 1: four to fifty-two weeks, and a start no earlier than the day
  -- before UTC today. The single day of slack is deliberate: the owner's local
  -- today can legitimately be one day behind or ahead of the server's.
  if p_start_date < (v_now at time zone 'utc')::date - 1
    or p_end_date < p_start_date + 27
    or p_end_date > p_start_date + 365
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid roadmap request.';
  end if;

  v_note := public.roadmap_normalize_owner_text(p_planning_note);
  if v_note = '' then v_note := null; end if;
  v_feedback := public.roadmap_normalize_owner_text(p_regeneration_feedback);
  if v_feedback = '' then v_feedback := null; end if;

  if v_note is not null and pg_catalog.char_length(v_note) > 1000 then
    raise exception using
      errcode = '22023',
      message = 'Invalid roadmap request.';
  end if;
  if v_feedback is not null and pg_catalog.char_length(v_feedback) > 500 then
    raise exception using
      errcode = '22023',
      message = 'Invalid roadmap request.';
  end if;

  -- Same key, same fingerprint replays the claim, returning the stored status —
  -- pending, completed, or failed — and never 'claimed'. That is the whole
  -- discriminator: only the fresh insert below reports 'claimed', so only the
  -- caller that actually opened the attempt invokes the provider. A different
  -- fingerprint under the same key is a conflict, not a silent second call.
  select * into v_existing
  from public.roadmap_generation_requests
  where user_id = v_user_id
    and idempotency_key = p_idempotency_key;

  if found then
    if v_existing.request_fingerprint is distinct from p_request_fingerprint then
      raise exception using
        errcode = 'PT409',
        message = 'That coaching request changed. Reload and try again.';
    end if;
    return (
      v_existing.id,
      v_existing.completion_token,
      v_existing.status,
      v_existing.regeneration_number,
      v_existing.proposal_id
    )::public.roadmap_generation_receipt;
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

  select coalesce(revision, 0) into v_head_revision
  from public.roadmap_heads
  where user_id = v_user_id;
  v_head_revision := coalesce(v_head_revision, 0);

  if v_head_revision <> p_expected_head_revision then
    raise exception using
      errcode = 'PT409',
      message = 'Your roadmap changed. Reload and try again.';
  end if;

  if p_previous_proposal_id is null then
    -- An initial request carries no feedback at all.
    if v_feedback is not null then
      raise exception using
        errcode = '22023',
        message = 'Invalid roadmap request.';
    end if;
    v_regeneration := 0;
    -- ADR-028. A request to change the roadmap in force says so, and there has
    -- to be one. Whether there is one is read here, never taken from the caller.
    v_changes_roadmap := coalesce(p_change_roadmap, false);
    if v_changes_roadmap and not exists (
      select 1 from public.roadmap_heads
      where user_id = v_user_id and current_version_id is not null
    ) then
      raise exception using
        errcode = '22023',
        message = 'Invalid roadmap request.';
    end if;
  else
    -- A regeneration needs an owned, rejected immediate predecessor, the same
    -- horizon, and non-empty feedback. The ceiling is enforced here, before any
    -- provider call, because a fourth round must cost nothing.
    if v_feedback is null then
      raise exception using
        errcode = '22023',
        message = 'Invalid roadmap request.';
    end if;

    select * into v_previous
    from public.roadmap_proposals
    where id = p_previous_proposal_id
      and user_id = v_user_id;

    if not found then
      raise exception using
        errcode = 'PT409',
        message = 'That proposal is no longer available.';
    end if;

    if not exists (
      select 1
      from public.roadmap_proposal_decisions
      where proposal_id = v_previous.id
        and user_id = v_user_id
        and decision = 'rejected'
    ) then
      raise exception using
        errcode = 'PT409',
        message = 'Decline that proposal before asking for another.';
    end if;

    select * into v_previous_request
    from public.roadmap_generation_requests
    where id = v_previous.generation_request_id
      and user_id = v_user_id;

    if not found
      or v_previous_request.requested_start_date <> p_start_date
      or v_previous_request.requested_end_date <> p_end_date
    then
      raise exception using
        errcode = '22023',
        message = 'Invalid roadmap request.';
    end if;

    v_regeneration := v_previous_request.regeneration_number + 1;
    -- Another answer to a change request is a change request: inherited from
    -- the predecessor, whatever the caller sent.
    v_changes_roadmap := v_previous_request.changes_roadmap;
    if v_regeneration > 3 then
      raise exception using
        errcode = 'PT429',
        message = 'This roadmap has reached its regeneration limit.';
    end if;
  end if;

  begin
    insert into public.roadmap_generation_requests (
      user_id,
      idempotency_key,
      request_fingerprint,
      requested_start_date,
      requested_end_date,
      expected_head_revision,
      previous_proposal_id,
      regeneration_number,
      planning_note_hash,
      regeneration_feedback_hash,
      changes_roadmap,
      status,
      created_at,
      updated_at
    )
    values (
      v_user_id,
      p_idempotency_key,
      p_request_fingerprint,
      p_start_date,
      p_end_date,
      p_expected_head_revision,
      p_previous_proposal_id,
      v_regeneration,
      public.roadmap_owner_text_hash(v_note),
      public.roadmap_owner_text_hash(v_feedback),
      v_changes_roadmap,
      'pending',
      v_now,
      v_now
    )
    -- The row is stored 'pending'; the receipt reports 'claimed'. Only this path
    -- runs for the caller that won the insert, so 'claimed' is the one state that
    -- authorizes a provider call. A replay above returns the stored 'pending'
    -- instead, and stops.
    returning id, completion_token, 'claimed', regeneration_number, proposal_id
    into v_receipt;
  exception
    when unique_violation then
      -- M3-09. The key was claimed by a concurrent caller between this
      -- transaction's replay read and its insert. That is a replay, not a
      -- failure, and it is answered exactly as the sequential replay above is:
      -- the fingerprint decides, and the stored receipt is returned unchanged.
      -- The stored status can only be 'pending' here, so this path never
      -- reports 'claimed' and never authorizes a second provider call.
      select * into v_existing
      from public.roadmap_generation_requests
      where user_id = v_user_id
        and idempotency_key = p_idempotency_key;

      if not found then
        -- The violation was not this key's. Nothing about it is understood, so
        -- nothing is claimed about it either.
        raise;
      end if;

      if v_existing.request_fingerprint is distinct from p_request_fingerprint
      then
        raise exception using
          errcode = 'PT409',
          message = 'That coaching request changed. Reload and try again.';
      end if;

      return (
        v_existing.id,
        v_existing.completion_token,
        v_existing.status,
        v_existing.regeneration_number,
        v_existing.proposal_id
      )::public.roadmap_generation_receipt;
  end;

  return v_receipt;
end;
$$;

revoke all privileges on function public.begin_roadmap_generation(
  text, text, date, date, bigint, text, uuid, text, boolean
) from public, anon, authenticated, service_role;
grant execute on function public.begin_roadmap_generation(
  text, text, date, date, bigint, text, uuid, text, boolean
) to authenticated;

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
  v_source public.roadmap_proposal_sources;
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

  -- Every stored source must still point at the same current eligible revision.
  -- Unrelated new records create no conflict, because only what actually
  -- travelled is recorded here.
  for v_source in
    select * from public.roadmap_proposal_sources
    where proposal_id = v_proposal.id and user_id = v_user_id
  loop
    if v_source.source_kind = 'goal' then
      if not exists (
        select 1 from public.goals
        where id = v_source.record_id
          and user_id = v_user_id
          and status in ('active', 'achieved')
      ) then
        raise exception using
          errcode = 'PT409',
          message = 'Your goals changed. Review the proposal again.';
      end if;

    elsif v_source.source_kind = 'memory' then
      -- Compared by revision number rather than revision id: the item view the
      -- application reads exposes the number, and the two are equivalent
      -- because memory revisions are append-only and monotonic per item. An
      -- edited or disabled item therefore fails this check, while an unrelated
      -- new memory item does not appear here at all.
      if not exists (
        select 1
        from public.memory_items i
        join public.memory_revisions r
          on r.id = i.current_revision_id and r.user_id = i.user_id
        where i.id = v_source.record_id
          and i.user_id = v_user_id
          and i.status = 'active'
          and r.revision_number = v_source.revision_number
      ) then
        raise exception using
          errcode = 'PT409',
          message = 'Your memory changed. Review the proposal again.';
      end if;

    elsif v_source.source_kind = 'completion' then
      -- M3-15A's factual record. A correction bumps `revision`, so a completion
      -- edited since it travelled fails here and the owner is told to look
      -- again; a completion logged since then was never a source and is not
      -- compared.
      if not exists (
        select 1 from public.completions
        where id = v_source.record_id
          and user_id = v_user_id
          and revision = v_source.revision_number
      ) then
        raise exception using
          errcode = 'PT409',
          message = 'Your training history changed. Review the proposal again.';
      end if;

    else
      -- 'plan_version'. Unverifiable since M3-11 dropped the relation that
      -- carried it, and therefore never verified.
      raise exception using
        errcode = 'PT409',
        message = 'Your plan changed. Review the proposal again.';
    end if;
  end loop;

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
