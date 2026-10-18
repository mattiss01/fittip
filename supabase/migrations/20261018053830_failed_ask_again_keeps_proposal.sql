-- A failed "ask again" keeps the old proposal (owner, 17 October 2026).
--
-- Until now `regeneratePlanProposalAction` finished the review first, applying
-- what the owner accepted and declining the rest, and only then asked the
-- coach, because `begin_plan_generation` refused a source without a decision.
-- When the coach then failed, the owner was left with neither proposal.
--
-- Now the source stays open while the coach is asked. `begin_plan_generation`
-- accepts an open source, and refuses a second pending request from the same
-- one (one older than ten minutes is a dead server's and is ignored); both
-- checks on the source now run under the lock, and after a same-key replay. `finish_plan_generation` closes the source in the transaction that
-- records its replacement: undecided items are declined, and
-- `finish_plan_proposal_review` applies what the owner accepted, keyed by the
-- request's completion token. A source the owner finished or discarded while
-- waiting is left alone. A failed request changes nothing.
--
-- Only the two function bodies change; their signatures and privileges stay.

CREATE OR REPLACE FUNCTION public.begin_plan_generation(p_idempotency_key text, p_request_fingerprint text, p_start_date date, p_day_count integer, p_expected_plan_revision bigint, p_planning_note text DEFAULT NULL::text, p_previous_proposal_id uuid DEFAULT NULL::uuid, p_regeneration_feedback text DEFAULT NULL::text, p_replaceable_session_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS public.plan_generation_receipt
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_existing public.plan_generation_requests;
  v_note text;
  v_end_date date;
  v_feedback text;
  v_previous public.plan_proposals;
  v_previous_request public.plan_generation_requests;
  v_regeneration_number smallint := 0;
  v_receipt public.plan_generation_receipt;
  v_replaceable uuid[] := coalesce(p_replaceable_session_ids, '{}'::uuid[]);
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'An authenticated FitTip user is required.';
  end if;

  if not exists (select 1 from public.profiles where user_id = v_user_id) then
    raise exception using
      errcode = '23503',
      message = 'A FitTip profile is required.';
  end if;

  if p_idempotency_key is null
    or pg_catalog.char_length(p_idempotency_key) not between 16 and 128
    or p_request_fingerprint is null
    or pg_catalog.char_length(p_request_fingerprint) not between 16 and 256
    or p_start_date is null
    or p_day_count is null
    or p_day_count not between 1 and 7
    or p_expected_plan_revision is null
    or p_expected_plan_revision < 0
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid plan request.';
  end if;

  -- A start no earlier than the day before UTC today. The single day of slack
  -- is deliberate: the owner's local today can legitimately be one day behind
  -- or ahead of the server's. The plan's own past-date rule is enforced where
  -- it belongs, in `apply_rolling_plan_change_set`, against the owner's stored
  -- zone rather than against UTC.
  if p_start_date < (v_now at time zone 'utc')::date - 1 then
    raise exception using
      errcode = '22023',
      message = 'Invalid plan request.';
  end if;
  v_end_date := p_start_date + (p_day_count - 1);

  -- What the owner marked "can be replaced". Seven days hold at most three
  -- proposed sessions each, so more marks than that could never all be used.
  if pg_catalog.cardinality(v_replaceable) > 21
    or pg_catalog.array_position(v_replaceable, null) is not null
    or pg_catalog.cardinality(v_replaceable) <> (
      select pg_catalog.count(distinct marked)
      from pg_catalog.unnest(v_replaceable) as marked
    )
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid plan request.';
  end if;

  v_note := public.roadmap_normalize_owner_text(p_planning_note);
  if v_note = '' then v_note := null; end if;
  if v_note is not null and pg_catalog.char_length(v_note) > 1000 then
    raise exception using
      errcode = '22023',
      message = 'Invalid plan request.';
  end if;

  -- The regeneration half. Feedback without a proposal to attach it to is a
  -- complaint about nothing, and a proposal without feedback is a repeat of a
  -- question already paid for, so the two travel together or not at all.
  v_feedback := public.roadmap_normalize_owner_text(p_regeneration_feedback);
  if v_feedback = '' then v_feedback := null; end if;
  if (v_feedback is null) <> (p_previous_proposal_id is null) then
    raise exception using
      errcode = '22023',
      message = 'Invalid plan request.';
  end if;
  -- 500, not 1000: `REGENERATION_FEEDBACK_MAX_LENGTH` in the context assembly
  -- has been 500 since M3-02, and that check runs after the owner's review has
  -- already been applied. Accepting more here only means destroying a proposal
  -- over text the coach would never have been shown.
  if v_feedback is not null
    and pg_catalog.char_length(v_feedback) not between 1 and 500
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid plan request.';
  end if;

  if p_previous_proposal_id is not null then
    select * into v_previous
    from public.plan_proposals
    where id = p_previous_proposal_id and user_id = v_user_id;

    if not found then
      raise exception using
        errcode = 'PT409',
        message = 'That proposal is no longer open.';
    end if;

    select * into v_previous_request
    from public.plan_generation_requests
    where id = v_previous.generation_request_id and user_id = v_user_id;

    v_regeneration_number :=
      (coalesce(v_previous_request.regeneration_number, 0) + 1)::smallint;

    -- Now that the lineage is a line, this ceiling means what it says. `PT429`
    -- rather than `22023`, matching the roadmap: the generic invalid-request
    -- code maps to "Something went wrong", which is the least useful thing to
    -- say to an owner who has just been told their proposal was closed.
    if v_regeneration_number > 20 then
      raise exception using
        errcode = 'PT429',
        message = 'This plan has reached its regeneration limit.';
    end if;
  end if;

  -- Same key, same fingerprint replays the claim, returning the stored status —
  -- pending, completed, or failed — and never 'claimed'. That is the whole
  -- discriminator. A different fingerprint under the same key is a conflict,
  -- not a silent second call.
  select * into v_existing
  from public.plan_generation_requests
  where user_id = v_user_id and idempotency_key = p_idempotency_key;

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
      v_existing.proposal_id
    )::public.plan_generation_receipt;
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

  -- The checks on the source run under the lock, so two "ask again" presses
  -- at once cannot both pass them: the second sees the first's request.
  if p_previous_proposal_id is not null then
    -- The proposal being regenerated stays open while the coach is asked
    -- (owner, 17 Oct 2026): a failed answer used to leave the owner with
    -- nothing, since the review had already been closed. It is closed by
    -- `finish_plan_generation`, in the transaction that records its
    -- replacement. One request at a time per source. A request pending for
    -- more than ten minutes is one whose server died after the call, since
    -- no call waits longer than ninety seconds; it blocks nothing.
    if exists (
      select 1
      from public.plan_generation_requests
      where previous_proposal_id = p_previous_proposal_id
        and user_id = v_user_id
        and status = 'pending'
        and created_at > pg_catalog.now() - interval '10 minutes'
    ) then
      raise exception using
        errcode = 'PT409',
        message = 'The coach is already being asked again about that proposal.';
    end if;

    -- One proposal, one replacement.
    --
    -- Without this the count above is not a chain at all. It reads the number
    -- from whichever predecessor the caller *names*, and a closed proposal
    -- stays closed forever, so pointing at the first proposal of a lineage
    -- yields 1 every time and the ceiling never arrives. Measured against a
    -- local database before adding this: two regenerations from one source,
    -- both numbered 1.
    if exists (
      select 1
      from public.plan_proposals
      where source_proposal_id = p_previous_proposal_id
        and user_id = v_user_id
    ) then
      raise exception using
        errcode = 'PT409',
        message = 'That proposal has already been replaced.';
    end if;
  end if;

  begin
    insert into public.plan_generation_requests (
      user_id, idempotency_key, request_fingerprint,
      requested_start_date, requested_end_date, day_count,
      expected_plan_revision, planning_note_hash, previous_proposal_id,
      regeneration_number, regeneration_feedback_hash, created_at, updated_at
    ) values (
      v_user_id, p_idempotency_key, p_request_fingerprint,
      p_start_date, v_end_date, p_day_count::smallint,
      p_expected_plan_revision, public.roadmap_owner_text_hash(v_note),
      p_previous_proposal_id, v_regeneration_number,
      public.roadmap_owner_text_hash(v_feedback),
      v_now, v_now
    )
    returning id, completion_token, 'claimed', proposal_id into v_receipt;

    -- The marks, written with the claim and only with it: a replay returns
    -- above and never reaches this. Each must be this owner's active session
    -- on one of the requested days with no training logged against it, which
    -- `finish_plan_proposal_review` checks again before it deletes anything. One that is not is a refusal rather than a mark
    -- quietly dropped: the owner was shown a list and chose from it.
    if pg_catalog.cardinality(v_replaceable) > 0 then
      insert into public.plan_generation_replaceable_sessions (
        request_id, user_id, handle, session_id
      )
      select
        v_receipt.generation_id,
        v_user_id,
        'r' || pg_catalog.row_number() over (
          order by session.local_date, session.position, session.id
        ),
        session.id
      from public.rolling_plan_sessions session
      where session.user_id = v_user_id
        and session.id = any (v_replaceable)
        and session.status = 'active'
        and session.local_date between p_start_date and v_end_date
        and not exists (
          select 1 from public.completions completion
          where completion.user_id = v_user_id
            and completion.plan_session_id = session.id
        );

      if (
        select pg_catalog.count(*)
        from public.plan_generation_replaceable_sessions
        where request_id = v_receipt.generation_id and user_id = v_user_id
      ) <> pg_catalog.cardinality(v_replaceable) then
        raise exception using
          errcode = 'PT409',
          message = 'Your plan changed. Reload and try again.';
      end if;
    end if;
  exception
    when unique_violation then
      -- The race loser. The winner's row is committed and visible now, so this
      -- is a replay that arrived simultaneously rather than sequentially, and
      -- it is answered exactly as a sequential replay would be.
      select * into v_existing
      from public.plan_generation_requests
      where user_id = v_user_id and idempotency_key = p_idempotency_key;
      if not found then
        raise exception using
          errcode = 'PT409',
          message = 'Your plan changed. Reload and try again.';
      end if;
      if v_existing.request_fingerprint is distinct from p_request_fingerprint then
        raise exception using
          errcode = 'PT409',
          message = 'That coaching request changed. Reload and try again.';
      end if;
      return (
        v_existing.id,
        v_existing.completion_token,
        v_existing.status,
        v_existing.proposal_id
      )::public.plan_generation_receipt;
  end;

  return v_receipt;
end;
$function$;

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
  v_plan_revision bigint;
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

  -- The proposal this one replaces closes here, with its replacement, and
  -- not before the coach is asked (owner, 17 Oct 2026): a failed answer
  -- leaves it open, the owner's choices on it intact. What the owner had not
  -- decided is declined; what they accepted is applied by the review's own
  -- finish, so the rules about what an ending means stay in one place. One
  -- the owner finished or discarded while waiting is left as they left it.
  if v_request.previous_proposal_id is not null and not exists (
    select 1
    from public.plan_proposal_decisions
    where proposal_id = v_request.previous_proposal_id
      and user_id = v_user_id
  ) then
    insert into public.plan_proposal_item_decisions (
      proposal_id, ordinal, user_id, decision, decided_at
    )
    select item.proposal_id, item.ordinal, v_user_id, 'rejected', v_now
    from public.plan_proposal_items item
    where item.proposal_id = v_request.previous_proposal_id
      and item.user_id = v_user_id
    on conflict (proposal_id, ordinal) do nothing;

    select revision into v_plan_revision
    from public.rolling_plans
    where user_id = v_user_id;

    perform public.finish_plan_proposal_review(
      v_request.previous_proposal_id,
      coalesce(v_plan_revision, 0),
      p_completion_token
    );
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
  -- sessions in the order the coach listed them. Only sessions: a free day is
  -- not offered as a recovery day (owner, 17 October 2026). `ordinal` is the
  -- owner's stable handle on a choice; `content_index` is the way back to the
  -- rest of what the coach said.
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
