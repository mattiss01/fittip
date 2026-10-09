-- What a coach proposal may replace (owner, 9 Oct 2026; ADR-024).
--
-- Until now a plan proposal could only add sessions. Lock was removed that
-- morning, and the question it stood for moved to where a proposal is asked
-- for: each session on the chosen days stays unless the owner marks it "can be
-- replaced". This migration is what lets the database, and not the browser,
-- know what the owner allowed for one proposal.
--
--   * `plan_generation_replaceable_sessions` holds the marks of one request,
--     each with a short handle (`r1`, `r2`). The coach is shown the handle and
--     never a session id.
--   * `plan_proposal_items.replaces_session_id` is the session a proposed one
--     stands in for, resolved from the handle the coach named.
--   * A replacing item has a third choice, `staged_beside`: add it and keep
--     the owner's session. `staged` on such an item means replace.
--   * `finish_plan_proposal_review` adds a `delete` of the old session to the
--     same change set as the `add`. `apply_rolling_plan_change_set` is not
--     touched: its `delete` already refuses a session with training logged
--     against it and already removes one occurrence of a series.
--
-- Five functions are re-emitted from their live definitions and changed only
-- where they name the above. `begin_plan_generation` gains a last parameter
-- with a default, so it is dropped and created again; a caller that does not
-- send it gets what it got before.
--
-- Nothing destructive: no column, table or row is removed.

create table public.plan_generation_replaceable_sessions (
  request_id uuid not null,
  user_id uuid not null,
  handle text not null,
  -- Not a foreign key to the plan: the session is deleted when it is replaced,
  -- and the record of what the owner allowed should outlive it.
  session_id uuid not null,
  constraint plan_generation_replaceable_sessions_pkey
    primary key (request_id, handle),
  constraint plan_generation_replaceable_sessions_session_key
    unique (request_id, session_id),
  constraint plan_generation_replaceable_sessions_owner_fkey
    foreign key (user_id) references public.profiles (user_id) on delete cascade,
  -- Composite, so a mark cannot hang on a request recorded under another owner.
  constraint plan_generation_replaceable_sessions_request_fkey
    foreign key (request_id, user_id)
    references public.plan_generation_requests (id, user_id) on delete cascade,
  constraint plan_generation_replaceable_sessions_handle_check
    check (handle ~ '^r[1-9][0-9]?$')
);

create index plan_generation_replaceable_sessions_owner_idx
  on public.plan_generation_replaceable_sessions (user_id);

alter table public.plan_generation_replaceable_sessions enable row level security;

revoke all privileges on table public.plan_generation_replaceable_sessions
from public, anon, authenticated, service_role;

grant select on table public.plan_generation_replaceable_sessions to authenticated;

create policy plan_generation_replaceable_sessions_owner_select
on public.plan_generation_replaceable_sessions
for select
to authenticated
using ((select auth.uid()) = user_id);

alter table public.plan_proposal_items
  add column replaces_session_id uuid;

-- A recovery-day item replaces nothing.
alter table public.plan_proposal_items
  add constraint plan_proposal_items_replaces_check
  check (replaces_session_id is null or kind = 'session');

alter table public.plan_proposal_item_decisions
  drop constraint plan_proposal_item_decisions_decision_check;
alter table public.plan_proposal_item_decisions
  add constraint plan_proposal_item_decisions_decision_check
  check (decision in ('staged', 'staged_beside', 'rejected'));

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
  if v_count not between 1 and (3 * v_day_count) then
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


drop function public.begin_plan_generation(
  text, text, date, integer, bigint, text, uuid, text
);

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

    -- One proposal, one replacement.
    --
    -- Without this the count below is not a chain at all. It reads the number
    -- from whichever predecessor the caller *names*, and a closed proposal
    -- stays closed forever, so pointing at the first proposal of a lineage
    -- yields 1 every time and the ceiling never arrives. Measured against a
    -- local database before adding this: two regenerations from one source,
    -- both numbered 1.
    --
    -- It is also what the owner's decision already implies. Regenerating
    -- discards the proposal being rejected; asking a second time from that
    -- same rejected proposal is a second bite at something already replaced.
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
    -- on one of the requested days with no training logged against it, the
    -- same three things `finish_plan_proposal_review` checks again before it
    -- deletes anything. One that is not is a refusal rather than a mark
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

CREATE OR REPLACE FUNCTION public.decide_plan_proposal_item(p_proposal_id uuid, p_ordinal integer, p_decision text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'An authenticated FitTip user is required.';
  end if;

  if p_proposal_id is null
    or p_ordinal is null
    or p_ordinal not between 0 and 27
    or p_decision is null
    or p_decision not in ('staged', 'staged_beside', 'rejected', 'proposed')
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid plan proposal decision.';
  end if;

  if not exists (
    select 1 from public.plan_proposal_items
    where proposal_id = p_proposal_id
      and ordinal = p_ordinal::smallint
      and user_id = v_user_id
  ) then
    raise exception using
      errcode = 'PT409',
      message = 'That proposed item is no longer available.';
  end if;

  -- The same lock the finish and the discard take. Without it, a choice made in
  -- one tab could read "not finished" just before another tab's finish
  -- committed, and then write after it — leaving the permanent record saying an
  -- item was staged that never entered the plan. Held, the terminal-row check
  -- below cannot be overtaken, and the finish sees a stable set of choices.
  perform pg_catalog.set_config('lock_timeout', '3s', true);
  begin
    perform pg_catalog.pg_advisory_xact_lock(
      62008,
      pg_catalog.hashtext(v_user_id::text)
    );
  exception
    when lock_not_available then
      raise exception using
        errcode = 'PT409',
        message = 'Your plan changed. Reload and try again.';
  end;

  if exists (
    select 1 from public.plan_proposal_decisions
    where proposal_id = p_proposal_id and user_id = v_user_id
  ) then
    raise exception using
      errcode = 'PT433',
      message = 'That review is already finished.';
  end if;

  -- "Add beside" is a choice about the session an item would replace, so an
  -- item that replaces nothing does not have it.
  if p_decision = 'staged_beside' and not exists (
    select 1 from public.plan_proposal_items
    where proposal_id = p_proposal_id
      and ordinal = p_ordinal::smallint
      and user_id = v_user_id
      and replaces_session_id is not null
  ) then
    raise exception using
      errcode = '22023',
      message = 'Invalid plan proposal decision.';
  end if;

  if p_decision = 'proposed' then
    delete from public.plan_proposal_item_decisions
    where proposal_id = p_proposal_id
      and ordinal = p_ordinal::smallint
      and user_id = v_user_id;
    return;
  end if;

  insert into public.plan_proposal_item_decisions (
    proposal_id, ordinal, user_id, decision, decided_at
  ) values (
    p_proposal_id, p_ordinal::smallint, v_user_id, p_decision,
    pg_catalog.clock_timestamp()
  )
  on conflict (proposal_id, ordinal) do update
  set decision = excluded.decision, decided_at = excluded.decided_at;
end;
$function$;

CREATE OR REPLACE FUNCTION public.finish_plan_proposal_review(p_proposal_id uuid, p_expected_plan_revision bigint, p_idempotency_key uuid)
 RETURNS public.plan_review_receipt
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_existing public.plan_proposal_decisions;
  v_unresolved integer;
  v_changes jsonb;
  v_applied smallint;
  v_deletes jsonb;
  v_receipt public.rolling_plan_change_receipt;
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'An authenticated FitTip user is required.';
  end if;

  if p_proposal_id is null
    or p_expected_plan_revision is null
    or p_expected_plan_revision < 0
    or p_idempotency_key is null
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid plan review.';
  end if;

  if not exists (
    select 1 from public.plan_proposals
    where id = p_proposal_id and user_id = v_user_id
  ) then
    raise exception using
      errcode = 'PT409',
      message = 'That proposal is no longer available.';
  end if;

  perform pg_catalog.set_config('lock_timeout', '3s', true);
  begin
    perform pg_catalog.pg_advisory_xact_lock(
      62008,
      pg_catalog.hashtext(v_user_id::text)
    );
  exception
    when lock_not_available then
      raise exception using
        errcode = 'PT409',
        message = 'Your plan changed. Reload and try again.';
  end;

  -- Replay. A repeated finish returns what the first one did; a finish after a
  -- discard is a conflict, because there is nothing left to apply and saying
  -- 'applied' would be untrue.
  select * into v_existing
  from public.plan_proposal_decisions
  where proposal_id = p_proposal_id and user_id = v_user_id;
  if found then
    if v_existing.decision <> 'applied' then
      raise exception using
        errcode = 'PT433',
        message = 'That review is already finished.';
    end if;
    return (
      v_existing.proposal_id, v_existing.decision, v_existing.applied_count,
      v_existing.change_set_id, v_existing.plan_revision, 'replayed'
    )::public.plan_review_receipt;
  end if;

  select pg_catalog.count(*) into v_unresolved
  from public.plan_proposal_items item
  left join public.plan_proposal_item_decisions decision
    on decision.proposal_id = item.proposal_id
    and decision.ordinal = item.ordinal
    and decision.user_id = item.user_id
  where item.proposal_id = p_proposal_id
    and item.user_id = v_user_id
    and decision.decision is null;

  if v_unresolved > 0 then
    raise exception using
      errcode = 'PT432',
      message = 'Every proposed item needs a choice before you can finish.';
  end if;

  select
    pg_catalog.jsonb_agg(change.entry order by change.local_date, change.ordinal),
    pg_catalog.count(*)::smallint
  into v_changes, v_applied
  from (
    select
      staged.local_date,
      staged.ordinal,
      case staged.kind
        when 'recovery_day' then pg_catalog.jsonb_build_object(
          'operation', 'set_recovery_day',
          'localDate', staged.local_date::text,
          'isRecoveryDay', true
        )
        else pg_catalog.jsonb_build_object(
          'operation', 'add',
          'sessionId', staged.session_id,
          'session', pg_catalog.jsonb_build_object(
            'localDate', staged.local_date::text,
            -- The nth position on this date that no active session holds,
            -- where n is this item's place among the date's staged sessions.
            -- Not `max + n`: an owner who has moved a session to 99 would push
            -- that past the 0-99 bound and the whole finish would be refused.
            -- A date holds at most ten active sessions, so a free slot always
            -- exists below 100.
            'position', (
              select slot
              from pg_catalog.generate_series(0, 99) as slot
              where not exists (
                select 1
                from public.rolling_plan_sessions existing
                where existing.user_id = v_user_id
                  and existing.local_date = staged.local_date
                  and existing.status = 'active'
                  and existing.position = slot
              )
              order by slot
              offset staged.date_rank - 1
              limit 1
            )::smallint,
            'title', staged.title,
            'sport', staged.sport,
            'intent', staged.intent,
            'expectedDurationMinutes', staged.expected_duration_minutes,
            'activities', '[]'::jsonb
          )
        )
      end as entry
    from (
      select
        item.*,
        pg_catalog.row_number() over (
          partition by item.local_date, item.kind order by item.ordinal
        ) as date_rank
      from public.plan_proposal_items item
      join public.plan_proposal_item_decisions decision
        on decision.proposal_id = item.proposal_id
        and decision.ordinal = item.ordinal
        and decision.user_id = item.user_id
      where item.proposal_id = p_proposal_id
        and item.user_id = v_user_id
        and decision.decision in ('staged', 'staged_beside')
        -- A staged rest day on a date that is already one is a choice whose
        -- outcome already holds. Sending it would be refused by the change
        -- function as a change that changes nothing, and that refusal would
        -- take every other staged item down with it. It is left out, and it
        -- is not counted as applied, because nothing was.
        and not (
          item.kind = 'recovery_day'
          and exists (
            select 1
            from public.rolling_plan_recovery_days recovery
            where recovery.user_id = v_user_id
              and recovery.local_date = item.local_date
          )
        )
    ) as staged
  ) as change;

  -- The other half of "replace": the owner's session goes in the change set
  -- that adds the one standing in for it, so the swap happens whole or not at
  -- all. Three things are checked again here, because the mark is as old as
  -- the request: the session is still active, still on a day that can be
  -- changed, and has no training logged against it. One that fails any of
  -- them is left alone and the proposed session is added beside it, which is
  -- what the review shows for such an item. A session with a log is never
  -- deleted.
  select pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'operation', 'delete',
      'sessionId', target.id
    )
    order by target.local_date, target.position, target.id
  )
  into v_deletes
  from public.plan_proposal_items item
  join public.plan_proposal_item_decisions decision
    on decision.proposal_id = item.proposal_id
    and decision.ordinal = item.ordinal
    and decision.user_id = item.user_id
  join public.rolling_plan_sessions target
    on target.id = item.replaces_session_id
    and target.user_id = v_user_id
  where item.proposal_id = p_proposal_id
    and item.user_id = v_user_id
    and decision.decision = 'staged'
    and target.status = 'active'
    and target.local_date >= (
      select (pg_catalog.timezone(profile.timezone_name, v_now))::date
      from public.profiles profile
      where profile.user_id = v_user_id
    )
    -- Only a session this owner marked for this very proposal.
    and exists (
      select 1
      from public.plan_proposals proposal
      join public.plan_generation_replaceable_sessions marked
        on marked.request_id = proposal.generation_request_id
        and marked.user_id = proposal.user_id
      where proposal.id = p_proposal_id
        and proposal.user_id = v_user_id
        and marked.session_id = target.id
    )
    and not exists (
      select 1 from public.completions completion
      where completion.user_id = v_user_id
        and completion.plan_session_id = target.id
    );

  if v_deletes is not null then
    v_changes := v_deletes || coalesce(v_changes, '[]'::jsonb);
  end if;

  if v_applied = 0 then
    insert into public.plan_proposal_decisions (
      proposal_id, user_id, decision, applied_count, decided_at
    ) values (p_proposal_id, v_user_id, 'applied', 0, v_now);
    return (p_proposal_id, 'applied', 0::smallint, null::uuid, null::bigint, 'applied')
      ::public.plan_review_receipt;
  end if;

  -- The plan's single door. Every refusal it can raise — a stale revision, a
  -- past date, a date already holding ten sessions — propagates unchanged, and
  -- the terminal row below is never written when one does.
  v_receipt := public.apply_rolling_plan_change_set(
    p_expected_plan_revision, p_idempotency_key, 'owner_ai_proposal', v_changes
  );

  insert into public.plan_proposal_decisions (
    proposal_id, user_id, decision, applied_count, change_set_id,
    plan_revision, decided_at
  ) values (
    p_proposal_id, v_user_id, 'applied', v_applied, v_receipt.change_set_id,
    v_receipt.plan_revision, v_now
  );

  return (
    p_proposal_id, 'applied', v_applied, v_receipt.change_set_id,
    v_receipt.plan_revision, 'applied'
  )::public.plan_review_receipt;
end;
$function$;

revoke all privileges on function public.plan_content_is_valid(jsonb, date, date)
from public, anon, authenticated, service_role;

revoke all privileges on function public.begin_plan_generation(
  text, text, date, integer, bigint, text, uuid, text, uuid[]
) from public, anon, authenticated, service_role;
grant execute on function public.begin_plan_generation(
  text, text, date, integer, bigint, text, uuid, text, uuid[]
) to authenticated;

revoke all privileges on function public.finish_plan_generation(
  uuid, text, text, text, text, text, text, uuid, text, jsonb, jsonb, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.finish_plan_generation(
  uuid, text, text, text, text, text, text, uuid, text, jsonb, jsonb, text, text
) to authenticated;

revoke all privileges on function public.decide_plan_proposal_item(
  uuid, integer, text
) from public, anon, authenticated, service_role;
grant execute on function public.decide_plan_proposal_item(
  uuid, integer, text
) to authenticated;

revoke all privileges on function public.finish_plan_proposal_review(
  uuid, bigint, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.finish_plan_proposal_review(
  uuid, bigint, uuid
) to authenticated;
