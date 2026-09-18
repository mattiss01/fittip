-- M3-15F: restore the roadmap write path.
--
-- M3-11 closed the roadmap runtime in two ways, and both are undone here.
--
-- It revoked `execute` on all five ADR-015 functions from every role, with the
-- recorded intent that M3-15 restore them deliberately. It also replaced the
-- body of `accept_roadmap_proposal` with a stub that raises, because the
-- original body named `detailed_plan_heads` and `completion_heads` — two tables
-- the same migration dropped. Re-granting `execute` without replacing that body
-- would hand the owner a function that refuses every call, so the two halves
-- are one change.
--
-- Nothing else about the roadmap model moves. No table, column, constraint,
-- index, policy, or table grant is touched; the five signatures and the two
-- receipt types are exactly what M3-02 accepted; and no preserved roadmap
-- record is read or written by this migration.

-- ---------------------------------------------------------------------------
-- 1. begin_roadmap_generation: the M3-09 same-key concurrency defect.
-- ---------------------------------------------------------------------------
--
-- The replay check reads `roadmap_generation_requests` *before* the advisory
-- lock is taken, which is correct: a replay must not queue behind an unrelated
-- in-flight generation. The cost is that two simultaneous calls carrying the
-- same idempotency key both read "not found", and then serialize on the lock.
-- The winner inserts; the loser wakes up, walks past a head check that still
-- passes, and hits `roadmap_generation_requests_owner_key`. The resulting
-- 23505 escapes as an unmapped error, so the repository reports a persistence
-- failure and the surface tells the owner their generation failed — while the
-- generation the other tab opened is running normally.
--
-- The fix is to treat that unique violation as what it is: a replay that lost a
-- race. The function already has a replay path, and the row the winner inserted
-- is now committed and visible, so the loser re-reads it and returns the stored
-- receipt — `pending`, never `claimed`. Only the caller whose insert actually
-- succeeded is told `claimed`, so the single-provider-call guarantee is
-- unchanged: this path ends in a `pending` receipt, which authorizes nothing.
--
-- A differing fingerprint under the same key stays a PT409 conflict on this
-- path exactly as it is on the sequential one, so a reused key with different
-- input still cannot silently replay someone else's question.
--
-- Everything above the insert is M3-02's, character for character. Only the
-- insert gains an exception block.
create or replace function public.begin_roadmap_generation(
  p_idempotency_key text,
  p_request_fingerprint text,
  p_start_date date,
  p_end_date date,
  p_expected_head_revision bigint,
  p_planning_note text default null,
  p_previous_proposal_id uuid default null,
  p_regeneration_feedback text default null
)
returns public.roadmap_generation_receipt
language plpgsql
security definer
set search_path = ''
as $$
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

-- ---------------------------------------------------------------------------
-- 2. accept_roadmap_proposal: a working body again.
-- ---------------------------------------------------------------------------
--
-- M3-02's logic, with one change forced by M3-11: the two legacy relations it
-- rechecked a source against no longer exist.
--
--   * `completion` was checked against `completion_heads`. The replacement
--     record is M3-15A's `public.completions`, whose `id` and `revision` are
--     exactly what `OwnedRecordsCoachAIContextSource` records as a source, so
--     the recheck is the same claim against the current table. `revision_id` is
--     not compared: the new model has no per-revision row to name, and the
--     monotonic `revision` already changes on every correction.
--
--   * `plan_version` was checked against `detailed_plan_heads`. Nothing writes
--     that source kind any more — the M3-10 rolling plan has no version to
--     pin — and M3-11 marked every preserved proposal carrying one `expired`,
--     so an undecided proposal cannot reach this branch. It is kept and fails
--     closed rather than removed: a source this function cannot verify must
--     never be treated as verified, and `roadmap_proposal_sources` still admits
--     the value.
--
-- Everything else is unchanged: the advisory lock, the acceptance replay, the
-- goal and memory rechecks, the head compare-and-set, the version insert, and
-- the append-only decision.
create or replace function public.accept_roadmap_proposal(
  p_proposal_id uuid,
  p_expected_head_revision bigint
)
returns public.roadmap_acceptance_receipt
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_proposal public.roadmap_proposals;
  v_decision public.roadmap_proposal_decisions;
  v_head public.roadmap_heads;
  v_head_revision bigint;
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
          and archived_at is null
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

-- ---------------------------------------------------------------------------
-- 3. The privilege boundary, restored exactly as M3-02 set it.
-- ---------------------------------------------------------------------------
--
-- `authenticated` and nobody else. Each grant is preceded by a full revoke, so
-- the resulting ACL is stated rather than inherited: `public` picks up `execute`
-- on a replaced function by default, and a `create or replace` above would
-- otherwise have restored that default silently. `anon` and `service_role` stay
-- revoked — every one of these functions derives its owner from `auth.uid()`, so
-- a role with no owner could only ever fail, and a role that bypasses RLS must
-- never hold a capability it cannot be scoped by.
revoke all privileges on function public.begin_roadmap_generation(
  text, text, date, date, bigint, text, uuid, text
) from public, anon, authenticated, service_role;
grant execute on function public.begin_roadmap_generation(
  text, text, date, date, bigint, text, uuid, text
) to authenticated;

revoke all privileges on function public.finish_roadmap_generation(
  uuid, text, text, text, text, text, text, uuid, text, text, jsonb, jsonb, text
) from public, anon, authenticated, service_role;
grant execute on function public.finish_roadmap_generation(
  uuid, text, text, text, text, text, text, uuid, text, text, jsonb, jsonb, text
) to authenticated;

revoke all privileges on function public.record_roadmap_memory_candidates(
  uuid, bigint, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.record_roadmap_memory_candidates(
  uuid, bigint, jsonb
) to authenticated;

revoke all privileges on function public.apply_roadmap_proposal_change(
  text, uuid, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.apply_roadmap_proposal_change(
  text, uuid, jsonb
) to authenticated;

revoke all privileges on function public.accept_roadmap_proposal(
  uuid, bigint
) from public, anon, authenticated, service_role;
grant execute on function public.accept_roadmap_proposal(
  uuid, bigint
) to authenticated;
