-- A week the coach leaves as it is (owner, 17 October 2026).
--
-- The first live seven-day plan came back with no sessions: the week already
-- held what a three-week beginner should do, and the coach said so in its
-- week description. `plan_content_is_valid` required at least one session,
-- so a sensible answer was refused. Zero is now valid; the upper bound, the
-- description, the dates and every per-session rule are unchanged.
--
-- An answer with no sessions offers nothing to decide, not even rest (owner,
-- 17 October 2026): `finish_plan_generation` turns free days into
-- recovery-day items only beside at least one proposed session, so such a
-- proposal has no items at all. `finish_plan_proposal_review` already
-- handles that: nothing is unresolved, nothing is applied, and the review is
-- recorded as applied with a count of 0 and no change set, so the plan's
-- revision does not move.
--
-- Both bodies below are the ones from `20261009092532_proposal_replaces`,
-- each with that single condition changed.

CREATE OR REPLACE FUNCTION public.plan_content_is_valid(p_content jsonb, p_start_date date, p_end_date date)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_session jsonb;
  v_alternative jsonb;
  v_day_count integer;
  v_count integer;
  v_minutes jsonb;
begin
  if p_content is null or pg_catalog.jsonb_typeof(p_content) <> 'object' then
    return false;
  end if;

  if pg_catalog.octet_length(p_content::text) > 16000 then
    return false;
  end if;

  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    return false;
  end if;

  v_day_count := (p_end_date - p_start_date) + 1;
  if v_day_count not between 1 and 7 then
    return false;
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_object_keys(p_content) as key
    where key not in (
      'schemaVersion', 'weekDescription', 'startDate', 'endDate', 'sessions',
      'assumptions', 'uncertainties', 'safetyConsiderations'
    )
  ) then
    return false;
  end if;

  if p_content->>'schemaVersion' is distinct from 'fittip.seven-day-plan.v2'
    or pg_catalog.char_length(coalesce(p_content->>'weekDescription', ''))
       not between 1 and 600
    or (p_content->>'startDate')::date is distinct from p_start_date
    or (p_content->>'endDate')::date is distinct from p_end_date
  then
    return false;
  end if;

  if pg_catalog.jsonb_typeof(p_content->'sessions') <> 'array' then
    return false;
  end if;
  v_count := pg_catalog.jsonb_array_length(p_content->'sessions');
  if v_count not between 0 and (3 * v_day_count) then
    return false;
  end if;

  -- At most three sessions on any one date.
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_content->'sessions') as entry(value)
    group by entry.value->>'date'
    having pg_catalog.count(*) > 3
  ) then
    return false;
  end if;

  for v_session in
    select value from pg_catalog.jsonb_array_elements(p_content->'sessions')
  loop
    if pg_catalog.jsonb_typeof(v_session) <> 'object' then
      return false;
    end if;
    if exists (
      select 1
      from pg_catalog.jsonb_object_keys(v_session) as key
      where key not in (
        'date', 'title', 'sport', 'focus', 'intent', 'durationMinutes',
        'primaryGoalId', 'secondaryGoalIds', 'alternatives', 'rationale',
        'replaces'
      )
    ) then
      return false;
    end if;

    if (v_session->>'date')::date < p_start_date
      or (v_session->>'date')::date > p_end_date
      or pg_catalog.char_length(coalesce(v_session->>'title', ''))
         not between 1 and 120
      or pg_catalog.char_length(coalesce(v_session->>'sport', ''))
         not between 1 and 60
      or pg_catalog.char_length(coalesce(v_session->>'focus', ''))
         not between 1 and 300
      or pg_catalog.char_length(coalesce(v_session->>'intent', ''))
         not between 1 and 300
      or pg_catalog.char_length(coalesce(v_session->>'rationale', ''))
         not between 1 and 300
      or pg_catalog.char_length(coalesce(v_session->>'primaryGoalId', ''))
         not between 1 and 64
    then
      return false;
    end if;

    -- The handle of a session the owner marked replaceable, or absent. Only
    -- its shape is checked here; `finish_plan_generation` holds it to the
    -- marks of the request it answers.
    if v_session ? 'replaces'
      and pg_catalog.jsonb_typeof(v_session->'replaces') <> 'null'
      and (
        pg_catalog.jsonb_typeof(v_session->'replaces') <> 'string'
        or (v_session->>'replaces') !~ '^r[1-9][0-9]?$'
      )
    then
      return false;
    end if;

    v_minutes := v_session->'durationMinutes';
    if pg_catalog.jsonb_typeof(v_minutes) <> 'number'
      or (v_minutes::text)::numeric not between 10 and 240
      or (v_minutes::text)::numeric
         <> pg_catalog.trunc((v_minutes::text)::numeric)
    then
      return false;
    end if;

    if v_session ? 'secondaryGoalIds' and (
      pg_catalog.jsonb_typeof(v_session->'secondaryGoalIds') <> 'array'
      or pg_catalog.jsonb_array_length(v_session->'secondaryGoalIds') > 6
    ) then
      return false;
    end if;

    if v_session ? 'alternatives' then
      if pg_catalog.jsonb_typeof(v_session->'alternatives') <> 'array'
        or pg_catalog.jsonb_array_length(v_session->'alternatives') > 2
      then
        return false;
      end if;
      for v_alternative in
        select value
        from pg_catalog.jsonb_array_elements(v_session->'alternatives')
      loop
        if pg_catalog.jsonb_typeof(v_alternative) <> 'object'
          or exists (
            select 1
            from pg_catalog.jsonb_object_keys(v_alternative) as key
            where key not in ('title', 'whenToChoose')
          )
          or pg_catalog.char_length(coalesce(v_alternative->>'title', ''))
             not between 1 and 120
          or pg_catalog.char_length(
               coalesce(v_alternative->>'whenToChoose', '')
             ) not between 1 and 200
        then
          return false;
        end if;
      end loop;
    end if;
  end loop;

  if p_content ? 'assumptions' and (
    pg_catalog.jsonb_typeof(p_content->'assumptions') <> 'array'
    or pg_catalog.jsonb_array_length(p_content->'assumptions') > 4
  ) then
    return false;
  end if;

  if p_content ? 'uncertainties' and (
    pg_catalog.jsonb_typeof(p_content->'uncertainties') <> 'array'
    or pg_catalog.jsonb_array_length(p_content->'uncertainties') > 3
  ) then
    return false;
  end if;

  if p_content ? 'safetyConsiderations' and (
    pg_catalog.jsonb_typeof(p_content->'safetyConsiderations') <> 'array'
    or pg_catalog.jsonb_array_length(p_content->'safetyConsiderations') > 3
  ) then
    return false;
  end if;

  return true;
exception
  when others then
    -- A malformed date or number cast is invalid content, not a server error.
    return false;
end;
$function$;

revoke all privileges on function public.plan_content_is_valid(jsonb, date, date)
from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.finish_plan_generation(p_completion_token uuid, p_outcome text, p_schema_version text DEFAULT NULL::text, p_prompt_version text DEFAULT NULL::text, p_provider_code text DEFAULT NULL::text, p_model_code text DEFAULT NULL::text, p_rate_card_version text DEFAULT NULL::text, p_spend_reservation_id uuid DEFAULT NULL::uuid, p_planning_note text DEFAULT NULL::text, p_content jsonb DEFAULT NULL::jsonb, p_sources jsonb DEFAULT NULL::jsonb, p_safe_failure_code text DEFAULT NULL::text, p_regeneration_feedback text DEFAULT NULL::text)
 RETURNS public.plan_generation_result
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_request public.plan_generation_requests;
  v_note text;
  v_feedback text;
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
      message = 'Invalid plan result.';
  end if;

  perform pg_catalog.set_config('lock_timeout', '3s', true);
  begin
    perform pg_catalog.pg_advisory_xact_lock(
      62007,
      pg_catalog.hashtext(v_user_id::text)
    );
  exception
    when lock_not_available then
      raise exception using
        errcode = 'PT409',
        message = 'Your plan changed. Reload and try again.';
  end;

  select * into v_request
  from public.plan_generation_requests
  where user_id = v_user_id and completion_token = p_completion_token
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
      return (v_request.status, v_request.proposal_id)
        ::public.plan_generation_result;
    end if;
    raise exception using
      errcode = 'PT409',
      message = 'That coaching request is already finished.';
  end if;

  if p_outcome = 'failed' then
    if p_safe_failure_code is null
      or p_safe_failure_code !~ '^[a-z][a-z0-9_]{1,63}$'
    then
      raise exception using
        errcode = '22023',
        message = 'Invalid plan result.';
    end if;
    update public.plan_generation_requests
    set status = 'failed', failure_code = p_safe_failure_code, updated_at = v_now
    where id = v_request.id and user_id = v_user_id;
    return ('failed', null)::public.plan_generation_result;
  end if;

  -- The planning note travels again on finish rather than being read back from
  -- the claim, which stores only its hash. The hash is what proves the text
  -- finish was given is the text begin claimed.
  v_note := public.roadmap_normalize_owner_text(p_planning_note);
  if v_note = '' then v_note := null; end if;

  -- The feedback travels again on finish for the reason the planning note
  -- does, and is proved the same way: the claim stored only a hash, so the
  -- hash is what shows this is the text the claim was made for.
  v_feedback := public.roadmap_normalize_owner_text(p_regeneration_feedback);
  if v_feedback = '' then v_feedback := null; end if;
  if public.roadmap_owner_text_hash(v_feedback)
     is distinct from v_request.regeneration_feedback_hash
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid plan result.';
  end if;
  if public.roadmap_owner_text_hash(v_note)
     is distinct from v_request.planning_note_hash
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid plan result.';
  end if;

  if p_schema_version is distinct from 'fittip.seven-day-plan.v2'
    or p_prompt_version is null
    or p_provider_code is null
    or p_model_code is null
    or p_rate_card_version is null
    or not public.plan_content_is_valid(
      p_content, v_request.requested_start_date, v_request.requested_end_date
    )
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid plan result.';
  end if;

  -- The provider, model and rate card must be a pairing somebody approved, and
  -- a live pairing must carry a reservation while the fixture one must not.
  -- This is what stops a paid call being recorded as a free fixture, and it is
  -- also what the owner-facing "example" label rests on: that label reads
  -- `provider_code`, so the database has to guarantee the code is honest. The
  -- function is the roadmap's; it names no operation, and M3-03's dropped plan
  -- migration used it the same way.
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

  -- A live result must carry a settled reservation belonging to this owner,
  -- for this operation, priced by the same rate card. Without it a proposal
  -- could point at another owner's reservation, or at one that paid for a
  -- roadmap.
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
      and operation = 'create_seven_day_plan'
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
        and operation = 'create_seven_day_plan'
        and settled_at is not null
        and rate_card_version = p_rate_card_version
    ) then
      raise exception using
        errcode = '22023',
        message = 'Invalid plan result.';
    end if;
  end if;

  insert into public.plan_proposals (
    user_id, generation_request_id, origin, planning_note, schema_version,
    prompt_version, provider_code, model_code, rate_card_version,
    spend_reservation_id, content, source_proposal_id, regeneration_feedback,
    created_at
  ) values (
    v_user_id, v_request.id,
    case when v_request.regeneration_number > 0
      then 'ai_regeneration' else 'ai_initial' end,
    v_note, p_schema_version,
    p_prompt_version, p_provider_code, p_model_code, p_rate_card_version,
    p_spend_reservation_id, p_content, v_request.previous_proposal_id,
    v_feedback, v_now
  )
  returning id into v_proposal_id;

  -- A proposed session may stand in for one the owner marked, named by its
  -- handle. A handle this request never issued, or one named twice, refuses
  -- the whole answer, exactly as invalid content does: half a proposal is not
  -- something the owner asked for.
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_content->'sessions') as proposed(value)
    where nullif(proposed.value->>'replaces', '') is not null
      and not exists (
        select 1
        from public.plan_generation_replaceable_sessions marked
        where marked.request_id = v_request.id
          and marked.user_id = v_user_id
          and marked.handle = proposed.value->>'replaces'
      )
  ) or exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_content->'sessions') as proposed(value)
    where nullif(proposed.value->>'replaces', '') is not null
    group by proposed.value->>'replaces'
    having pg_catalog.count(*) > 1
  ) then
    raise exception using
      errcode = '22023',
      message = 'Invalid plan result.';
  end if;

  -- Items, in the order the surface reads them: by date, then proposed
  -- sessions in the order the coach listed them. A date carries either
  -- sessions or a recovery-day item, never both, so the kind only breaks ties
  -- for determinism. `ordinal` is the owner's stable handle on a choice;
  -- `content_index` is the way back to the rest of what the coach said.
  insert into public.plan_proposal_items (
    proposal_id, ordinal, user_id, kind, content_index, session_id,
    local_date, title, sport, intent, expected_duration_minutes, rationale,
    replaces_session_id
  )
  select
    v_proposal_id,
    (pg_catalog.row_number() over (
      order by item.local_date, item.kind, item.content_index
    ) - 1)::smallint,
    v_user_id,
    item.kind,
    item.content_index,
    case when item.kind = 'session' then pg_catalog.gen_random_uuid() end,
    item.local_date,
    item.title,
    item.sport,
    item.intent,
    item.expected_duration_minutes,
    item.rationale,
    (
      select marked.session_id
      from public.plan_generation_replaceable_sessions marked
      where marked.request_id = v_request.id
        and marked.user_id = v_user_id
        and marked.handle = item.replaces
    )
  from (
    select
      'session' as kind,
      (session.ordinality - 1)::smallint as content_index,
      (session.value->>'date')::date as local_date,
      pg_catalog.btrim(session.value->>'title') as title,
      pg_catalog.btrim(session.value->>'sport') as sport,
      nullif(session.value->>'intent', '') as intent,
      (session.value->>'durationMinutes')::integer as expected_duration_minutes,
      pg_catalog.btrim(session.value->>'rationale') as rationale,
      nullif(session.value->>'replaces', '') as replaces
    from pg_catalog.jsonb_array_elements(p_content->'sessions')
      with ordinality as session(value, ordinality)
    union all
    select
      'recovery_day',
      null::smallint,
      horizon.local_date,
      null, null, null, null::integer, null, null
    from pg_catalog.generate_series(
      v_request.requested_start_date,
      v_request.requested_end_date,
      interval '1 day'
    ) as horizon(local_date)
    where not exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_content->'sessions') as proposed(value)
      where (proposed.value->>'date')::date = horizon.local_date::date
    )
      and not exists (
        select 1
        from public.rolling_plan_sessions planned
        where planned.user_id = v_user_id
          and planned.local_date = horizon.local_date::date
          and planned.status = 'active'
      )
      and not exists (
        select 1
        from public.rolling_plan_recovery_days recovery
        where recovery.user_id = v_user_id
          and recovery.local_date = horizon.local_date::date
      )
      -- A week the coach leaves as it is offers nothing, not even rest (owner,
      -- 17 October 2026): free days become recovery-day items only beside at
      -- least one proposed session.
      and pg_catalog.jsonb_array_length(p_content->'sessions') > 0
  ) as item;

  -- Minimized provenance. Ids and revisions only; no copied source content.
  if p_sources is not null then
    if pg_catalog.jsonb_typeof(p_sources) <> 'array'
      or pg_catalog.jsonb_array_length(p_sources) > 256
    then
      raise exception using
        errcode = '22023',
        message = 'Invalid plan result.';
    end if;
    for v_source in select value from pg_catalog.jsonb_array_elements(p_sources) loop
      v_kind := v_source->>'kind';
      if v_kind is null
        or v_kind not in (
          'goal', 'memory', 'plan_session', 'completion', 'roadmap_version'
        )
      then
        raise exception using
          errcode = '22023',
          message = 'Invalid plan result.';
      end if;
      begin
        v_record := (v_source->>'recordId')::uuid;
      exception when others then
        raise exception using
          errcode = '22023',
          message = 'Invalid plan result.';
      end;
      insert into public.plan_proposal_sources (
        proposal_id, ordinal, user_id, source_kind, record_id,
        revision_id, revision_number
      ) values (
        v_proposal_id, v_ordinal, v_user_id, v_kind, v_record,
        case
          when pg_catalog.jsonb_typeof(v_source->'revisionId') = 'string'
          then (v_source->>'revisionId')::uuid
        end,
        case
          when pg_catalog.jsonb_typeof(v_source->'revisionNumber') = 'number'
          then (v_source->>'revisionNumber')::bigint
        end
      );
      v_ordinal := v_ordinal + 1;
    end loop;
  end if;

  update public.plan_generation_requests
  set status = 'completed', proposal_id = v_proposal_id, updated_at = v_now
  where id = v_request.id and user_id = v_user_id;

  return ('completed', v_proposal_id)::public.plan_generation_result;
exception
  when check_violation or invalid_datetime_format or invalid_text_representation then
    raise exception using errcode = '22023', message = 'Invalid plan result.';
end;
$function$;

revoke all privileges on function public.finish_plan_generation(
  uuid, text, text, text, text, text, text, uuid, text, jsonb, jsonb, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.finish_plan_generation(
  uuid, text, text, text, text, text, text, uuid, text, jsonb, jsonb, text, text
) to authenticated;
