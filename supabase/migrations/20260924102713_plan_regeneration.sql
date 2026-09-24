-- Plan regeneration with feedback.
--
-- The roadmap has had this since M3-02: a proposal that is not what the owner
-- wanted can be sent back with a note saying why, and the coach answers with
-- another one. The plan never did. `begin_plan_generation` takes no previous
-- proposal and no feedback, and `plan_proposals_origin_check` admits only
-- `'ai_initial'`, so the only thing an owner could do with a plan they did not
-- like was discard it and ask again from nothing -- paying for a second call
-- that knew nothing about the first.
--
-- M3-03B drafted this before F-005 and it was dropped as a stale draft rather
-- than as a bad idea. The owner asked for it back on 24 September 2026.
--
-- ## What the owner decided, and what follows from it
--
-- **The coach receives the feedback and the proposal being rejected.** Sending
-- the complaint without the thing complained about would make the coach guess
-- at what it said last time. Measured before committing to it: a realistic plan
-- context is 8,589 bytes of the 32,500-byte pool, so the 2,800 bytes these two
-- sources can add fit roughly eight times over. No ceiling was raised and no
-- source trimmed; `context.test.ts` holds that as an assertion so the day a new
-- source eats the room, it fails loudly rather than at a live call.
--
-- **Regenerating discards the proposal being rejected**, so an owner never has
-- two open proposals to reason about. That is why this function requires the
-- previous proposal to carry a terminal decision: closing it is the caller's
-- act, through `finish_plan_proposal_review` or `discard_plan_proposal`, and
-- doing it here would mean a second path that ends a review.
--
-- **What the owner already accepted is kept.** That is also why the closing
-- happens first: `finish_plan_proposal_review` applies the staged items into
-- the plan and records the decision, so by the time a regeneration begins the
-- accepted days are plan sessions like any other. The coach then sees them as
-- plan commitments and plans around them.
--
-- The horizon stays the original span rather than shrinking to the gaps.
-- `begin_plan_generation` validates a start date plus a day count, which cannot
-- express a non-contiguous set of days, and the owner's days are not
-- necessarily contiguous -- keeping Thursday and Saturday leaves two separate
-- holes. Sending the same horizon with the kept sessions visible as
-- commitments says the same thing without inventing a second horizon shape.
--
-- ## What is deliberately not changed
--
-- `plan_proposals_spend_idx` stays as it is. Yesterday's uniqueness migration
-- left a note saying that widening this origin check would make that index
-- reject the first row of a new origin, and that the fix would be to exempt it
-- as the roadmap's does. That is not needed here: both `'ai_initial'` and
-- `'ai_regeneration'` are purchases, each carrying its own reservation, which
-- is exactly what the index must keep unique. The roadmap exempts `'owner_edit'`
-- because an edit inherits a reservation it did not buy; nothing here does.

-- ---------------------------------------------------------------------------
-- 1. The columns a regeneration needs.
-- ---------------------------------------------------------------------------
--
-- On the request: which proposal is being rejected, how many times this chain
-- has been regenerated, and a hash of the feedback. The feedback itself is not
-- stored here for the same reason the planning note is not -- the text travels
-- again on finish and the hash is what proves the text finish was given is the
-- text begin claimed.

alter table public.plan_generation_requests
  add column previous_proposal_id uuid,
  add column regeneration_number smallint not null default 0,
  add column regeneration_feedback_hash text;

alter table public.plan_generation_requests
  add constraint plan_generation_requests_previous_fkey
    foreign key (previous_proposal_id, user_id)
    references public.plan_proposals (id, user_id) on delete set null;

alter table public.plan_generation_requests
  add constraint plan_generation_requests_regeneration_check
    check (regeneration_number between 0 and 20);

-- A regeneration is a request that names what it is regenerating. Neither half
-- makes sense alone: a previous proposal with a zero count would be a first
-- attempt that somehow has a predecessor, and a count above zero with nothing
-- named would be a regeneration of nothing.
alter table public.plan_generation_requests
  add constraint plan_generation_requests_regeneration_pair_check
    check ((regeneration_number = 0) = (previous_proposal_id is null));

-- On the proposal: which proposal it descends from, and the feedback that
-- produced it. Stored as text here because the owner reads it back on the
-- review surface -- this is the record of what they asked for.
alter table public.plan_proposals
  add column source_proposal_id uuid,
  add column regeneration_feedback text;

alter table public.plan_proposals
  add constraint plan_proposals_source_fkey
    foreign key (source_proposal_id, user_id)
    references public.plan_proposals (id, user_id) on delete set null;

alter table public.plan_proposals
  add constraint plan_proposals_feedback_check
    check (
      regeneration_feedback is null
      or char_length(regeneration_feedback) between 1 and 1000
    );

-- The origin widens. Both values are AI purchases carrying their own
-- reservation; there is no derivative origin here, which is why
-- `plan_proposals_spend_idx` needs no exemption.
alter table public.plan_proposals
  drop constraint plan_proposals_origin_check;

alter table public.plan_proposals
  add constraint plan_proposals_origin_check
    check (origin in ('ai_initial', 'ai_regeneration'));

-- A regeneration names its source and carries the feedback that caused it; an
-- initial proposal does neither. Stated as a constraint so the two can never
-- drift apart in a way the surface would have to guess about.
alter table public.plan_proposals
  add constraint plan_proposals_regeneration_shape_check
    check (
      (origin = 'ai_initial'
        and source_proposal_id is null
        and regeneration_feedback is null)
      or (origin = 'ai_regeneration' and source_proposal_id is not null)
    );

create index plan_generation_requests_previous_idx
  on public.plan_generation_requests (previous_proposal_id, user_id)
  where previous_proposal_id is not null;

create index plan_proposals_source_idx
  on public.plan_proposals (source_proposal_id, user_id)
  where source_proposal_id is not null;
CREATE OR REPLACE FUNCTION public.begin_plan_generation(p_idempotency_key text, p_request_fingerprint text, p_start_date date, p_day_count integer, p_expected_plan_revision bigint, p_planning_note text DEFAULT NULL::text, p_previous_proposal_id uuid DEFAULT NULL::uuid, p_regeneration_feedback text DEFAULT NULL::text)
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
  if v_feedback is not null
    and pg_catalog.char_length(v_feedback) not between 1 and 1000
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

    -- The proposal being regenerated must already be closed. Closing it is the
    -- caller's act -- `finish_plan_proposal_review`, which applies whatever the
    -- owner accepted, or `discard_plan_proposal` when they accepted nothing --
    -- and doing it here would make this a second path that ends a review, with
    -- its own copy of the rules about what an ending means.
    if not exists (
      select 1
      from public.plan_proposal_decisions
      where proposal_id = p_previous_proposal_id and user_id = v_user_id
    ) then
      raise exception using
        errcode = 'PT409',
        message = 'Finish or discard that proposal before asking again.';
    end if;

    select * into v_previous_request
    from public.plan_generation_requests
    where id = v_previous.generation_request_id and user_id = v_user_id;

    v_regeneration_number :=
      (coalesce(v_previous_request.regeneration_number, 0) + 1)::smallint;

    -- The chain is bounded for the same reason every other ceiling here is: a
    -- loop that never ends is a bill that never stops.
    if v_regeneration_number > 20 then
      raise exception using
        errcode = '22023',
        message = 'Invalid plan request.';
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

-- ---------------------------------------------------------------------------
-- 3. The privilege boundary, restated rather than inherited.
-- ---------------------------------------------------------------------------
--
-- Both functions gained parameters, so these are new signatures rather than
-- replacements: the old ones still exist and would still be callable. They are
-- dropped, because a second way into the same write that skips the regeneration
-- rules is exactly the drift this migration is trying not to create.

drop function public.begin_plan_generation(
  text, text, date, integer, bigint, text
);
drop function public.finish_plan_generation(
  uuid, text, text, text, text, text, text, uuid, text, jsonb, jsonb, text
);

-- The three new request columns need granting by name. `plan_generation_requests`
-- carries column-level grants rather than a table-level one -- that is how
-- `completion_token` is withheld from the owner who owns the row -- and a
-- column added later is not covered by a grant written before it existed. The
-- owner can read what they asked to have regenerated and how many times; the
-- completion token stays the one thing they cannot see.
--
-- `regeneration_feedback_hash` is granted for the same reason `planning_note_hash`
-- already is: it is a hash of the owner's own words, it proves nothing a caller
-- could misuse, and withholding exactly one column of a pair invites the next
-- reader to wonder which rule applies.
grant select (previous_proposal_id, regeneration_number, regeneration_feedback_hash)
  on public.plan_generation_requests to authenticated;

revoke all privileges on function public.begin_plan_generation(
  text, text, date, integer, bigint, text, uuid, text
) from public, anon, authenticated, service_role;
grant execute on function public.begin_plan_generation(
  text, text, date, integer, bigint, text, uuid, text
) to authenticated;

revoke all privileges on function public.finish_plan_generation(
  uuid, text, text, text, text, text, text, uuid, text, jsonb, jsonb, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.finish_plan_generation(
  uuid, text, text, text, text, text, text, uuid, text, jsonb, jsonb, text, text
) to authenticated;
