-- Settle the reservation in the transaction that records the proposal.
--
-- Two holes, one cause: reserving spend, settling it, and recording the
-- proposal were three separate durable writes with no transaction spanning
-- them.
--
-- ## What went wrong
--
-- `reserve_ai_spend` holds the ceiling. The provider is called and answers, so
-- real money is owed. `coach-ai-service.ts` then settles the reservation --
-- best effort, its rejection swallowed by design so that a settlement failure
-- cannot turn a completed proposal into a failed one. Then the finish function
-- refused any result whose reservation was not already settled.
--
-- So a failed settle meant the provider had been paid and the proposal was
-- thrown away. Worse, the owner could not simply retry: the generation claim
-- stays pending under that idempotency key and never calls the coach again, so
-- recovering the answer meant asking a fresh question and paying twice.
--
-- The second hole is in the ceiling arithmetic. `reserve_ai_spend` counted a
-- reservation as its charge when settled, as its hold while unexpired, and as
-- **zero** otherwise. Fifteen minutes after a failed settle, real money spent
-- stopped counting against the daily and total ceilings entirely.
--
-- ## The fix, as the owner decided it on 24 September 2026
--
-- Both finish functions now settle an open reservation themselves, in the same
-- transaction that inserts the proposal. The two commit together or neither
-- does, so a paid result can no longer be lost.
--
-- They settle it at the amount it was **holding**, not at the real usage. The
-- real usage is known only to the caller that just failed to report it, and
-- the alternative -- passing the charged amount and the settlement token down
-- into the finish -- would spread a credential the database deliberately
-- withholds from the owner's own `select` grant. Charging the ceiling is the
-- conservative direction and applies only to runs where the settle had already
-- failed. ADR-019 records that choice and what it costs.
--
-- And an unsettled reservation now counts as its hold forever rather than
-- falling to zero on expiry. A spend ceiling may overcount; it must never let
-- money that was actually spent vanish.
--
-- ## Why these are replacements rather than new functions
--
-- All three bodies below are the current definitions as the database reports
-- them, with only the blocks described above changed. Replacing in place keeps
-- one definition per behaviour -- a second settling path beside the first would
-- be two ways for the spend rules to drift.
--
-- `create or replace` restores `execute` to `public` by default, so every
-- grant is restated below after a full revoke. That is not ceremony: it is the
-- difference between an ACL that is stated and one that is inherited.

CREATE OR REPLACE FUNCTION public.reserve_ai_spend(p_operation text, p_reserved_micro_usd bigint, p_rate_card_version text, p_currency text)
 RETURNS ai_spend_reservation_receipt
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  -- M3-01B decision 4, as approved on 10 August 2026. Changing a ceiling is a
  -- forward migration under review, which is the point: the only ceiling that
  -- survives a bug in the application is one the application cannot reach.
  c_per_request_ceiling constant bigint := 8000;
  c_daily_ceiling constant bigint := 2000000;
  c_total_ceiling constant bigint := 20000000;
  -- Longer than the 30s deadlineMs by 30x, which leaves room for the
  -- settlement round trip, clock skew, and a frozen serverless instance
  -- between the provider response and the settle call. Far shorter than a day,
  -- so a crashed call cannot hold budget until midnight and lock the owner out
  -- with no visible cause.
  c_reservation_ttl constant interval := interval '15 minutes';
  v_user_id uuid;
  v_now timestamptz := pg_catalog.now();
  v_day date := (pg_catalog.now() at time zone 'utc')::date;
  v_rate_card text;
  v_receipt public.ai_spend_reservation_receipt;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'An authenticated FitTip user is required.';
  end if;

  if not exists (
    select 1
    from public.profiles
    where user_id = v_user_id
  ) then
    raise exception using
      errcode = '23503',
      message = 'A FitTip profile is required.';
  end if;

  if p_operation is null
    or p_operation not in ('create_roadmap', 'create_seven_day_plan')
    or p_reserved_micro_usd is null
    or p_reserved_micro_usd <= 0
    or p_currency is distinct from 'USD'
    or p_rate_card_version is null
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid coaching spend reservation.';
  end if;

  v_rate_card := trim(p_rate_card_version);
  if char_length(v_rate_card) not between 1 and 100 then
    raise exception using
      errcode = '22023',
      message = 'Invalid coaching spend reservation.';
  end if;

  -- The per-request ceiling is checked before the daily one so a single
  -- runaway request is refused on its own terms rather than as budget
  -- exhaustion.
  if p_reserved_micro_usd > c_per_request_ceiling then
    raise exception using
      errcode = 'PT402',
      message = 'Coaching spend ceiling reached.';
  end if;

  -- ADR-010. The check and the write below are one statement, but a lone
  -- INSERT ... SELECT ... WHERE does not lock the rows it aggregates, so under
  -- READ COMMITTED two concurrent reservations would both read the same total
  -- and both pass. Serializing per owner is what actually closes the race.
  -- Every wait is bounded, so exhaustion is a conflict the caller can act on
  -- rather than a silent hang.
  perform pg_catalog.set_config('lock_timeout', '3s', true);
  begin
    perform pg_catalog.pg_advisory_xact_lock(
      62004,
      pg_catalog.hashtext(v_user_id::text)
    );
  exception
    when lock_not_available then
      raise exception using
        errcode = 'PT409',
        message = 'A coaching suggestion is already being prepared.';
  end;

  -- One statement: the ceilings are evaluated in the WHERE clause of the
  -- insert itself, so there is no window between deciding and writing. An
  -- unsettled reservation holds its reserved amount until it expires and then
  -- holds nothing; a settled one holds exactly what it was charged.
  insert into public.ai_spend_reservations (
    user_id,
    operation,
    spend_day,
    reserved_micro_usd,
    rate_card_version,
    currency,
    expires_at,
    created_at
  )
  select
    v_user_id,
    p_operation,
    v_day,
    p_reserved_micro_usd,
    v_rate_card,
    'USD',
    v_now + c_reservation_ttl,
    v_now
  where (
      select coalesce(sum(
        case
          -- Settled: what it actually cost. Unsettled: what it is holding,
          -- whether or not it has expired. The `else 0` this replaces made a
          -- charge we failed to record disappear from the ceiling fifteen
          -- minutes later, which is the one direction a spend ceiling must
          -- never fail in.
          when r.settled_at is not null then r.charged_micro_usd
          else r.reserved_micro_usd
        end
      ), 0)
      from public.ai_spend_reservations r
      where r.user_id = v_user_id
        and r.spend_day = v_day
    ) + p_reserved_micro_usd <= c_daily_ceiling
    and (
      select coalesce(sum(
        case
          -- Settled: what it actually cost. Unsettled: what it is holding,
          -- whether or not it has expired. The `else 0` this replaces made a
          -- charge we failed to record disappear from the ceiling fifteen
          -- minutes later, which is the one direction a spend ceiling must
          -- never fail in.
          when r.settled_at is not null then r.charged_micro_usd
          else r.reserved_micro_usd
        end
      ), 0)
      from public.ai_spend_reservations r
      where r.user_id = v_user_id
    ) + p_reserved_micro_usd <= c_total_ceiling
  returning
    id,
    settlement_token,
    spend_day,
    reserved_micro_usd,
    expires_at
  into v_receipt;

  if not found then
    raise exception using
      errcode = 'PT402',
      message = 'Coaching spend ceiling reached.';
  end if;

  return v_receipt;
end;
$function$;

CREATE OR REPLACE FUNCTION public.finish_plan_generation(p_completion_token uuid, p_outcome text, p_schema_version text DEFAULT NULL::text, p_prompt_version text DEFAULT NULL::text, p_provider_code text DEFAULT NULL::text, p_model_code text DEFAULT NULL::text, p_rate_card_version text DEFAULT NULL::text, p_spend_reservation_id uuid DEFAULT NULL::uuid, p_planning_note text DEFAULT NULL::text, p_content jsonb DEFAULT NULL::jsonb, p_sources jsonb DEFAULT NULL::jsonb, p_safe_failure_code text DEFAULT NULL::text)
 RETURNS plan_generation_result
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_request public.plan_generation_requests;
  v_note text;
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
    spend_reservation_id, content, created_at
  ) values (
    v_user_id, v_request.id, 'ai_initial', v_note, p_schema_version,
    p_prompt_version, p_provider_code, p_model_code, p_rate_card_version,
    p_spend_reservation_id, p_content, v_now
  )
  returning id into v_proposal_id;

  -- Items, in the order the surface reads them: by date, then proposed
  -- sessions in the order the coach listed them. A date carries either
  -- sessions or a recovery-day item, never both, so the kind only breaks ties
  -- for determinism. `ordinal` is the owner's stable handle on a choice;
  -- `content_index` is the way back to the rest of what the coach said.
  insert into public.plan_proposal_items (
    proposal_id, ordinal, user_id, kind, content_index, session_id,
    local_date, title, sport, intent, expected_duration_minutes, rationale
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
    item.rationale
  from (
    select
      'session' as kind,
      (session.ordinality - 1)::smallint as content_index,
      (session.value->>'date')::date as local_date,
      pg_catalog.btrim(session.value->>'title') as title,
      pg_catalog.btrim(session.value->>'sport') as sport,
      nullif(session.value->>'intent', '') as intent,
      (session.value->>'durationMinutes')::integer as expected_duration_minutes,
      pg_catalog.btrim(session.value->>'rationale') as rationale
    from pg_catalog.jsonb_array_elements(p_content->'sessions')
      with ordinality as session(value, ordinality)
    union all
    select
      'recovery_day',
      null::smallint,
      horizon.local_date,
      null, null, null, null::integer, null
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

CREATE OR REPLACE FUNCTION public.finish_roadmap_generation(p_completion_token uuid, p_outcome text, p_schema_version text DEFAULT NULL::text, p_prompt_version text DEFAULT NULL::text, p_provider_code text DEFAULT NULL::text, p_model_code text DEFAULT NULL::text, p_rate_card_version text DEFAULT NULL::text, p_spend_reservation_id uuid DEFAULT NULL::uuid, p_planning_note text DEFAULT NULL::text, p_regeneration_feedback text DEFAULT NULL::text, p_content jsonb DEFAULT NULL::jsonb, p_sources jsonb DEFAULT NULL::jsonb, p_safe_failure_code text DEFAULT NULL::text)
 RETURNS roadmap_generation_result
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
    or p_schema_version is distinct from 'fittip.roadmap.v2'
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

-- ---------------------------------------------------------------------------
-- The privilege boundary, restated rather than inherited.
-- ---------------------------------------------------------------------------

revoke all privileges on function public.reserve_ai_spend(
  text, bigint, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.reserve_ai_spend(
  text, bigint, text, text
) to authenticated;

revoke all privileges on function public.finish_plan_generation(
  uuid, text, text, text, text, text, text, uuid, text, jsonb, jsonb, text
) from public, anon, authenticated, service_role;
grant execute on function public.finish_plan_generation(
  uuid, text, text, text, text, text, text, uuid, text, jsonb, jsonb, text
) to authenticated;

revoke all privileges on function public.finish_roadmap_generation(
  uuid, text, text, text, text, text, text, uuid, text, text, jsonb, jsonb, text
) from public, anon, authenticated, service_role;
grant execute on function public.finish_roadmap_generation(
  uuid, text, text, text, text, text, text, uuid, text, text, jsonb, jsonb, text
) to authenticated;
