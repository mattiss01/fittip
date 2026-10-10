-- Roadmap v3: a slimmer shape (ADR-025).
--
-- The owner went through what a roadmap holds on 10 October 2026. Four things
-- go: `assumptions`, `uncertainties`, the written `reason` beside each goal's
-- attention level, and the coach's `safetyConsiderations`. A phase may have no
-- milestone. Title, summary, dates, phases, attention levels, milestones and
-- review points stay.
--
-- The safety sentences go entirely, the owner's choice over keeping a required
-- review point in their place. Nothing here or in the application now checks
-- that a roadmap written with a pain, illness, injury or severe-fatigue flag
-- present acknowledges it. The coach is still sent the flags and the safety
-- rules, and the application's own fixed notice on the Roadmap is unchanged.
--
-- Nothing stored is rewritten. Proposals and accepted versions are permanent
-- records; the ones made under `fittip.roadmap.v2` keep their content and their
-- `schema_version`, stay readable, and an undecided one can still be accepted
-- or declined: `accept_roadmap_proposal` never re-validates content. What
-- changes is what may be written from now on.
--
-- Changed:
--   1. `roadmap_proposals_schema_check` admits v3 beside v2.
--   2. `roadmap_content_is_valid` accepts v3 only, and by name: the top-level
--      keys, a phase's keys, and now an attention entry's keys (`goalId`,
--      `level`). Milestones are zero to three.
--   3. `finish_roadmap_generation` is re-emitted verbatim from
--      `20260924082758_settle_with_the_proposal.sql` with one literal changed:
--      the schema version a result must carry is v3.
--   4. `apply_roadmap_proposal_change` is re-emitted verbatim from
--      `20260810213904_m3_02_roadmap_proposals.sql` with one expression
--      changed: an edit stores the schema version of the content it was given
--      rather than copying its source's, so an edit of a v2 proposal is an
--      honest v3 row. Everything else it copies from the source is unchanged.
--
-- No table, column, policy, signature or grant changes. `create or replace`
-- keeps a function's privileges; they are restated below so this file says
-- what they are.

alter table public.roadmap_proposals
  drop constraint roadmap_proposals_schema_check;

alter table public.roadmap_proposals
  add constraint roadmap_proposals_schema_check
    check (schema_version in ('fittip.roadmap.v2', 'fittip.roadmap.v3'));

-- The application validates the complete fittip.roadmap.v3 contract and every
-- business rule before either caller reaches this. It is the independent check
-- on the stored envelope: its names, its sizes and its horizon.
create or replace function public.roadmap_content_is_valid(
  p_content jsonb,
  p_start_date date,
  p_end_date date
)
returns boolean
language plpgsql
-- STABLE rather than IMMUTABLE: a text-to-date cast depends on DateStyle.
stable
security invoker
set search_path = ''
as $$
declare
  v_phase jsonb;
  v_entry jsonb;
  v_count integer;
begin
  if p_content is null or pg_catalog.jsonb_typeof(p_content) <> 'object' then
    return false;
  end if;

  if pg_catalog.octet_length(p_content::text) > 16000 then
    return false;
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_object_keys(p_content) as key
    where key not in (
      'schemaVersion', 'title', 'summary', 'startDate', 'endDate',
      'phases', 'reviewPoints'
    )
  ) then
    return false;
  end if;

  if p_content->>'schemaVersion' is distinct from 'fittip.roadmap.v3'
    or pg_catalog.char_length(coalesce(p_content->>'title', ''))
       not between 1 and 80
    or pg_catalog.char_length(coalesce(p_content->>'summary', ''))
       not between 1 and 600
    or (p_content->>'startDate')::date is distinct from p_start_date
    or (p_content->>'endDate')::date is distinct from p_end_date
  then
    return false;
  end if;

  if pg_catalog.jsonb_typeof(p_content->'phases') <> 'array' then
    return false;
  end if;
  v_count := pg_catalog.jsonb_array_length(p_content->'phases');
  if v_count not between 1 and 6 then
    return false;
  end if;

  for v_phase in
    select value from pg_catalog.jsonb_array_elements(p_content->'phases')
  loop
    if pg_catalog.jsonb_typeof(v_phase) <> 'object' then
      return false;
    end if;
    if exists (
      select 1
      from pg_catalog.jsonb_object_keys(v_phase) as key
      where key not in (
        'title', 'focus', 'startDate', 'endDate', 'goalAttention', 'milestones'
      )
    ) then
      return false;
    end if;
    if pg_catalog.char_length(coalesce(v_phase->>'title', ''))
         not between 1 and 80
      or pg_catalog.char_length(coalesce(v_phase->>'focus', ''))
         not between 1 and 300
      or (v_phase->>'startDate')::date < p_start_date
      or (v_phase->>'endDate')::date > p_end_date
      or (v_phase->>'endDate')::date < (v_phase->>'startDate')::date
    then
      return false;
    end if;
    -- A phase may have no milestone. `is distinct from` rather than `<>`, so a
    -- missing list is refused instead of comparing as unknown.
    if pg_catalog.jsonb_typeof(v_phase->'milestones') is distinct from 'array'
      or pg_catalog.jsonb_array_length(v_phase->'milestones') > 3
      or pg_catalog.jsonb_typeof(v_phase->'goalAttention')
         is distinct from 'array'
      or pg_catalog.jsonb_array_length(v_phase->'goalAttention')
         not between 1 and 4
    then
      return false;
    end if;
    for v_entry in
      select value from pg_catalog.jsonb_array_elements(v_phase->'goalAttention')
    loop
      if pg_catalog.jsonb_typeof(v_entry) is distinct from 'object' then
        return false;
      end if;
      -- A level and nothing beside it: the written reason is what v3 dropped.
      if exists (
        select 1
        from pg_catalog.jsonb_object_keys(v_entry) as key
        where key not in ('goalId', 'level')
      ) then
        return false;
      end if;
      if coalesce(v_entry->>'level', '') not in
        ('primary', 'secondary', 'maintenance', 'deferred')
      then
        return false;
      end if;
    end loop;
  end loop;

  if pg_catalog.jsonb_typeof(p_content->'reviewPoints') is distinct from 'array'
    or pg_catalog.jsonb_array_length(p_content->'reviewPoints') not between 1 and 4
  then
    return false;
  end if;

  return true;
exception
  when others then
    -- A malformed date cast is invalid content, not a server error.
    return false;
end;
$$;

CREATE OR REPLACE FUNCTION public.finish_roadmap_generation(p_completion_token uuid, p_outcome text, p_schema_version text DEFAULT NULL::text, p_prompt_version text DEFAULT NULL::text, p_provider_code text DEFAULT NULL::text, p_model_code text DEFAULT NULL::text, p_rate_card_version text DEFAULT NULL::text, p_spend_reservation_id uuid DEFAULT NULL::uuid, p_planning_note text DEFAULT NULL::text, p_regeneration_feedback text DEFAULT NULL::text, p_content jsonb DEFAULT NULL::jsonb, p_sources jsonb DEFAULT NULL::jsonb, p_safe_failure_code text DEFAULT NULL::text)
 RETURNS public.roadmap_generation_result
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_request public.roadmap_generation_requests;
  v_note text;
  v_feedback text;
  v_origin text;
  v_proposal_id uuid;
  v_source jsonb;
  v_ordinal smallint := 0;
  v_kind text;
  v_record uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'An authenticated FitTip user is required.';
  end if;

  if p_completion_token is null
    or p_outcome is null
    or p_outcome not in ('proposal', 'failed')
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid roadmap result.';
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

  select * into v_request
  from public.roadmap_generation_requests
  where user_id = v_user_id
    and completion_token = p_completion_token
  for update;

  if not found then
    raise exception using
      errcode = 'PT409',
      message = 'That coaching request is no longer open.';
  end if;

  -- Replay. An already finished request returns its recorded result when the
  -- caller repeats the same outcome, and conflicts when it does not: a second
  -- call must never overwrite what the first one persisted.
  if v_request.status <> 'pending' then
    if (v_request.status = 'completed' and p_outcome = 'proposal')
      or (v_request.status = 'failed' and p_outcome = 'failed'
          and v_request.failure_code is not distinct from p_safe_failure_code)
    then
      if v_request.status = 'completed'
        and p_content is not null
        and not exists (
          select 1
          from public.roadmap_proposals
          where id = v_request.proposal_id
            and user_id = v_user_id
            and content = p_content
        )
      then
        raise exception using
          errcode = 'PT409',
          message = 'That coaching request is no longer open.';
      end if;
      return (v_request.status, v_request.proposal_id)
        ::public.roadmap_generation_result;
    end if;
    raise exception using
      errcode = 'PT409',
      message = 'That coaching request is no longer open.';
  end if;

  if p_outcome = 'failed' then
    if p_content is not null
      or p_sources is not null
      or p_schema_version is not null
      or p_prompt_version is not null
      or p_provider_code is not null
      or p_model_code is not null
      or p_rate_card_version is not null
      or p_spend_reservation_id is not null
      or p_safe_failure_code is null
      or p_safe_failure_code !~ '^[a-z][a-z0-9_]{1,63}$'
    then
      raise exception using
        errcode = '22023',
        message = 'Invalid roadmap result.';
    end if;

    update public.roadmap_generation_requests
    set status = 'failed', failure_code = p_safe_failure_code, updated_at = v_now
    where id = v_request.id and user_id = v_user_id;

    return ('failed', null::uuid)::public.roadmap_generation_result;
  end if;

  if p_safe_failure_code is not null
    or p_content is null
    or p_schema_version is distinct from 'fittip.roadmap.v3'
    or p_prompt_version is null
    or p_provider_code is null
    or p_model_code is null
    or p_rate_card_version is null
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid roadmap result.';
  end if;

  if not public.roadmap_technical_codes_are_accepted(
    p_provider_code,
    p_model_code,
    p_rate_card_version,
    p_spend_reservation_id is not null
  ) then
    raise exception using
      errcode = '22023',
      message = 'That coaching model is not approved.';
  end if;

  -- A live result must carry a settled, same-owner reservation priced by the
  -- same rate card. Without this a real call could be recorded as a fixture and
  -- cost nothing against the ceiling.
  if p_spend_reservation_id is not null then
    -- Settled here, in the transaction that records the proposal, so the two
    -- commit together or neither does. Before this, a reservation the
    -- application failed to settle made the check below refuse a result the
    -- provider had already been paid for, and the proposal was thrown away.
    --
    -- The amount is what the reservation was holding, not the real usage: the
    -- real usage is known only to the caller that just failed to report it.
    -- Charging the ceiling is the conservative direction, and it applies only
    -- to runs where the settle had already gone wrong.
    update public.ai_spend_reservations
    set
      charged_micro_usd = reserved_micro_usd,
      settled_at = pg_catalog.now()
    where id = p_spend_reservation_id
      and user_id = v_user_id
      and operation = 'create_roadmap'
      and rate_card_version = p_rate_card_version
      and settled_at is null;

    -- Asserted separately rather than from the update's row count, because a
    -- reservation the application settled normally matches no row above and is
    -- a perfectly good finish. What has to hold on every path is the same four
    -- things it always did, plus that the reservation is now closed.
    if not exists (
      select 1
      from public.ai_spend_reservations
      where id = p_spend_reservation_id
        and user_id = v_user_id
        and operation = 'create_roadmap'
        and settled_at is not null
        and rate_card_version = p_rate_card_version
    ) then
      raise exception using
        errcode = '22023',
        message = 'Invalid roadmap result.';
    end if;
  end if;

  -- The owner text must be the text this request claimed before the provider
  -- call. Anything else means the content that travelled is not the content
  -- being stored, and the memory excerpt check downstream would be meaningless.
  v_note := public.roadmap_normalize_owner_text(p_planning_note);
  if v_note = '' then v_note := null; end if;
  v_feedback := public.roadmap_normalize_owner_text(p_regeneration_feedback);
  if v_feedback = '' then v_feedback := null; end if;

  if public.roadmap_owner_text_hash(v_note)
       is distinct from v_request.planning_note_hash
    or public.roadmap_owner_text_hash(v_feedback)
       is distinct from v_request.regeneration_feedback_hash
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid roadmap result.';
  end if;

  if not public.roadmap_content_is_valid(
    p_content,
    v_request.requested_start_date,
    v_request.requested_end_date
  ) then
    raise exception using
      errcode = '22023',
      message = 'Invalid roadmap result.';
  end if;

  v_origin := case
    when v_request.regeneration_number > 0 then 'ai_regeneration'
    else 'ai_initial'
  end;

  insert into public.roadmap_proposals (
    user_id,
    generation_request_id,
    source_proposal_id,
    origin,
    planning_note,
    regeneration_feedback,
    schema_version,
    prompt_version,
    provider_code,
    model_code,
    rate_card_version,
    spend_reservation_id,
    content,
    created_at
  )
  values (
    v_user_id,
    v_request.id,
    v_request.previous_proposal_id,
    v_origin,
    v_note,
    v_feedback,
    p_schema_version,
    pg_catalog.btrim(p_prompt_version),
    pg_catalog.btrim(p_provider_code),
    pg_catalog.btrim(p_model_code),
    pg_catalog.btrim(p_rate_card_version),
    p_spend_reservation_id,
    p_content,
    v_now
  )
  returning id into v_proposal_id;

  if p_sources is not null then
    if pg_catalog.jsonb_typeof(p_sources) <> 'array'
      or pg_catalog.jsonb_array_length(p_sources) > 200
    then
      raise exception using
        errcode = '22023',
        message = 'Invalid roadmap result.';
    end if;

    for v_source in
      select value from pg_catalog.jsonb_array_elements(p_sources)
    loop
      v_kind := v_source->>'kind';
      if v_kind not in ('goal', 'memory', 'plan_version', 'completion') then
        raise exception using
          errcode = '22023',
          message = 'Invalid roadmap result.';
      end if;

      begin
        v_record := (v_source->>'recordId')::uuid;
      exception
        when others then
          raise exception using
            errcode = '22023',
            message = 'Invalid roadmap result.';
      end;

      insert into public.roadmap_proposal_sources (
        proposal_id,
        user_id,
        ordinal,
        source_kind,
        record_id,
        revision_id,
        revision_number
      )
      values (
        v_proposal_id,
        v_user_id,
        v_ordinal,
        v_kind,
        v_record,
        nullif(v_source->>'revisionId', '')::uuid,
        nullif(v_source->>'revisionNumber', '')::bigint
      );
      v_ordinal := v_ordinal + 1;
    end loop;
  end if;

  update public.roadmap_generation_requests
  set status = 'completed', proposal_id = v_proposal_id, updated_at = v_now
  where id = v_request.id and user_id = v_user_id;

  return ('completed', v_proposal_id)::public.roadmap_generation_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.apply_roadmap_proposal_change(p_operation text, p_proposal_id uuid, p_content jsonb DEFAULT NULL::jsonb)
 RETURNS public.roadmap_proposal_change_receipt
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_proposal public.roadmap_proposals;
  v_request public.roadmap_generation_requests;
  v_decision public.roadmap_proposal_decisions;
  v_new_id uuid;
  v_existing_edit uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'An authenticated FitTip user is required.';
  end if;

  if p_operation is null
    or p_operation not in ('edit', 'reject')
    or p_proposal_id is null
    or (p_operation = 'edit' and p_content is null)
    or (p_operation = 'reject' and p_content is not null)
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid roadmap change.';
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

  select * into v_decision
  from public.roadmap_proposal_decisions
  where proposal_id = v_proposal.id and user_id = v_user_id;

  if p_operation = 'reject' then
    if found then
      if v_decision.decision = 'rejected' then
        return (v_proposal.id, 'rejected')
          ::public.roadmap_proposal_change_receipt;
      end if;
      raise exception using
        errcode = 'PT409',
        message = 'That proposal has already been decided.';
    end if;

    insert into public.roadmap_proposal_decisions (
      proposal_id, user_id, decision, accepted_version_id, decided_at
    )
    values (v_proposal.id, v_user_id, 'rejected', null, v_now);

    return (v_proposal.id, 'rejected')
      ::public.roadmap_proposal_change_receipt;
  end if;

  if found then
    raise exception using
      errcode = 'PT409',
      message = 'That proposal has already been decided.';
  end if;

  select * into v_request
  from public.roadmap_generation_requests
  where id = v_proposal.generation_request_id and user_id = v_user_id;

  if not found then
    raise exception using
      errcode = 'PT409',
      message = 'That proposal is no longer available.';
  end if;

  if not public.roadmap_content_is_valid(
    p_content,
    v_request.requested_start_date,
    v_request.requested_end_date
  ) then
    raise exception using
      errcode = '22023',
      message = 'Invalid roadmap change.';
  end if;

  -- Replay of the same edit returns the existing receipt instead of stacking a
  -- second identical owner_edit proposal.
  select id into v_existing_edit
  from public.roadmap_proposals
  where user_id = v_user_id
    and source_proposal_id = v_proposal.id
    and origin = 'owner_edit'
    and content = p_content
  limit 1;

  if v_existing_edit is not null then
    return (v_existing_edit, 'edited')::public.roadmap_proposal_change_receipt;
  end if;

  -- The edit copies the original's owner text, technical metadata and source
  -- references. It does not rewrite or decide the source proposal, and none of
  -- those fields is a caller input.
  insert into public.roadmap_proposals (
    user_id, generation_request_id, source_proposal_id, origin, planning_note,
    regeneration_feedback, schema_version, prompt_version, provider_code,
    model_code, rate_card_version, spend_reservation_id, content, created_at
  )
  values (
    v_user_id, v_proposal.generation_request_id, v_proposal.id, 'owner_edit',
    v_proposal.planning_note, v_proposal.regeneration_feedback,
    -- The version of what is stored, not of what was edited: an edit of a v2
    -- proposal is v3 content, and `roadmap_content_is_valid` has just said so.
    p_content->>'schemaVersion', v_proposal.prompt_version,
    v_proposal.provider_code, v_proposal.model_code,
    v_proposal.rate_card_version, v_proposal.spend_reservation_id,
    p_content, v_now
  )
  returning id into v_new_id;

  insert into public.roadmap_proposal_sources (
    proposal_id, user_id, ordinal, source_kind, record_id, revision_id,
    revision_number
  )
  select
    v_new_id, v_user_id, ordinal, source_kind, record_id, revision_id,
    revision_number
  from public.roadmap_proposal_sources
  where proposal_id = v_proposal.id and user_id = v_user_id;

  return (v_new_id, 'edited')::public.roadmap_proposal_change_receipt;
end;
$function$;

revoke all privileges on function public.roadmap_content_is_valid(
  jsonb, date, date
) from public, anon, authenticated, service_role;

revoke all privileges on function public.finish_roadmap_generation(
  uuid, text, text, text, text, text, text, uuid, text, text, jsonb, jsonb, text
) from public, anon, authenticated, service_role;
grant execute on function public.finish_roadmap_generation(
  uuid, text, text, text, text, text, text, uuid, text, text, jsonb, jsonb, text
) to authenticated;

revoke all privileges on function public.apply_roadmap_proposal_change(
  text, uuid, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.apply_roadmap_proposal_change(
  text, uuid, jsonb
) to authenticated;
