-- A review after every phase (ADR-027).
--
-- The owner decided on 13 Oct 2026 that a roadmap's reviews are the app's, one
-- as each phase ends, and no longer one to four points the coach writes. Two
-- things follow, and they travel together because neither is whole alone.
--
-- First, `fittip.roadmap.v4`: a roadmap without `reviewPoints`. Nothing stored
-- is rewritten or deleted. A row made under v2 or v3 keeps its content and its
-- version; the application reads from it only what v4 holds. Nothing can be
-- written as v2 or v3 any more.
--
--   1. `roadmap_proposals_schema_check` admits v4 beside v2 and v3.
--   2. `roadmap_content_is_valid` accepts v4 only, and by name: `reviewPoints`
--      is refused as any unknown key is.
--   3. `finish_roadmap_generation` accepts a result only as v4. Its body is its
--      live definition with that one literal changed.
--
-- `apply_roadmap_proposal_change` is not re-emitted: since v3 it stores an edit
-- under the version of the content it was given, and it validates that content
-- with (2), so an edit is v4 or refused.
--
-- Second, the one thing about a review that is a fact and not arithmetic: that
-- the owner looked. A review is due from a phase's last day; which phase that
-- is follows from the accepted version and today. `roadmap_review_marks` holds
-- the latest phase the owner marked reviewed, per accepted version.
--
-- `create or replace` keeps a function's privileges; they are restated below so
-- this file says what they are.

-- 1. The roadmap without review points -----------------------------------------

alter table public.roadmap_proposals
  drop constraint roadmap_proposals_schema_check;

alter table public.roadmap_proposals
  add constraint roadmap_proposals_schema_check
    check (schema_version in (
      'fittip.roadmap.v2', 'fittip.roadmap.v3', 'fittip.roadmap.v4'
    ));

-- The application validates the complete fittip.roadmap.v4 contract and every
-- business rule before either caller reaches this. It is the independent check
-- on the stored envelope: its names, its sizes and its horizon.
CREATE OR REPLACE FUNCTION public.roadmap_content_is_valid(p_content jsonb, p_start_date date, p_end_date date)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $$
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
      'schemaVersion', 'title', 'summary', 'startDate', 'endDate', 'phases'
    )
  ) then
    return false;
  end if;

  if p_content->>'schemaVersion' is distinct from 'fittip.roadmap.v4'
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
      -- A level and nothing beside it.
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
AS $$
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
    or p_schema_version is distinct from 'fittip.roadmap.v4'
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
$$;

revoke all privileges on function public.roadmap_content_is_valid(
  jsonb, date, date
) from public, anon, authenticated, service_role;

revoke all privileges on function public.finish_roadmap_generation(
  uuid, text, text, text, text, text, text, uuid, text, text, jsonb, jsonb, text
) from public, anon, authenticated, service_role;
grant execute on function public.finish_roadmap_generation(
  uuid, text, text, text, text, text, text, uuid, text, text, jsonb, jsonb, text
) to authenticated;

-- 2. That a review was done ------------------------------------------------------

-- One row for an accepted version: the latest of its phases the owner marked
-- reviewed, and the day. A record beside the roadmap, as a milestone's mark is
-- (ADR-026); nothing here writes to `roadmap_versions`.
create table public.roadmap_review_marks (
  version_id uuid not null,
  user_id uuid not null,
  phase_index smallint not null,
  reviewed_on date not null,
  updated_at timestamptz not null default now(),
  constraint roadmap_review_marks_pkey primary key (version_id),
  constraint roadmap_review_marks_owner_fkey
    foreign key (user_id)
    references public.profiles (user_id)
    on delete cascade,
  -- The version and its owner together, so a mark cannot name a version that
  -- belongs to somebody else.
  constraint roadmap_review_marks_version_fkey
    foreign key (version_id, user_id)
    references public.roadmap_versions (id, user_id)
    on delete cascade,
  -- A roadmap has one to six phases.
  constraint roadmap_review_marks_phase_check
    check (phase_index between 0 and 5)
);

create index roadmap_review_marks_owner_idx
  on public.roadmap_review_marks (user_id, version_id);

alter table public.roadmap_review_marks enable row level security;

revoke all privileges on table public.roadmap_review_marks
  from public, anon, authenticated, service_role;
-- Read only. Every write goes through the function below.
grant select on table public.roadmap_review_marks to authenticated;

create policy roadmap_review_marks_owner_select
  on public.roadmap_review_marks
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- The owner's own roadmap in force only, found by auth.uid(), and only a phase
-- that has ended: its last day is on or before today where the owner is. The
-- day, like the owner, is not a caller's to give; it comes from the confirmed
-- time zone, and from UTC where none is confirmed.
--
-- One refusal for every reason, so the function does not say whether a
-- version exists, whose it is, or what it holds.
--
-- It only moves forward. Marking a phase at or before the one already marked
-- changes nothing, so a repeat is safe and an old page cannot undo a later
-- review. There is no taking it back: a mark hides a reminder and nothing else.
create or replace function public.set_roadmap_reviewed(
  p_version_id uuid,
  p_phase_index integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_content jsonb;
  v_today date;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'An authenticated FitTip user is required.';
  end if;
  if p_version_id is null
    or p_phase_index is null or p_phase_index not between 0 and 5
  then
    raise exception using errcode = '22023', message = 'Invalid roadmap review.';
  end if;

  -- The head is locked for the length of the change, so a roadmap accepted at
  -- the same moment cannot leave a mark on the version it replaced.
  select version.content into v_content
  from public.roadmap_heads head
  join public.roadmap_versions version
    on version.id = head.current_version_id and version.user_id = head.user_id
  where head.user_id = v_user_id and head.current_version_id = p_version_id
  for update of head;
  if not found then
    raise exception using errcode = '22023', message = 'Invalid roadmap review.';
  end if;

  select (pg_catalog.timezone(
    coalesce(profile.timezone_name, 'UTC'), pg_catalog.now()
  ))::date into v_today
  from public.profiles profile
  where profile.user_id = v_user_id;

  -- A phase the version does not have gives a null date, which is not on or
  -- before any day.
  if ((v_content -> 'phases' -> p_phase_index ->> 'endDate')::date <= v_today)
    is not true
  then
    raise exception using errcode = '22023', message = 'Invalid roadmap review.';
  end if;

  insert into public.roadmap_review_marks (
    version_id, user_id, phase_index, reviewed_on
  )
  values (p_version_id, v_user_id, p_phase_index, v_today)
  on conflict (version_id) do update set
    phase_index = excluded.phase_index,
    reviewed_on = excluded.reviewed_on,
    updated_at = pg_catalog.now()
  where public.roadmap_review_marks.user_id = v_user_id
    and public.roadmap_review_marks.phase_index < excluded.phase_index;
exception
  when invalid_datetime_format or datetime_field_overflow then
    -- A stored end date that is not a date is a phase that cannot be reviewed.
    raise exception using errcode = '22023', message = 'Invalid roadmap review.';
end;
$$;

revoke all privileges on function public.set_roadmap_reviewed(uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.set_roadmap_reviewed(uuid, integer)
  to authenticated;
