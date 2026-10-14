-- A roadmap written by hand (ADR-029).
--
-- The owner decided on 13 Oct 2026 that a roadmap can be written without the
-- coach, and that saving one puts it in force at once, stored as a proposal
-- accepted in the same step so the records keep their shape. On 14 Oct 2026
-- they made a roadmap's summary optional, and a milestone's criterion
-- ("Details"), for every roadmap.
--
-- A proposal could not be stored without a coach behind it: it had to name a
-- generation request and carry the provider, model, prompt and rate-card codes
-- of the call that made it. A hand-written one has none of these.
--
--   1. `roadmap_proposals` admits the origin `owner_written`. Its request and
--      its four codes may be null, and a check ties that to the origin: an
--      `owner_written` row has no request, no codes, no spend, no source and
--      no owner text; every other origin has its request and all four codes,
--      as `not null` required until now. No row is rewritten.
--   2. `roadmap_content_is_valid` lets a roadmap have no summary. Its body is
--      its live definition with that one condition changed. It never looked
--      inside a milestone, so an optional criterion needs nothing here.
--   3. `write_roadmap` stores the proposal and accepts it in one transaction,
--      through `accept_roadmap_proposal`, so the version, the head and the
--      decision are written by the one path that writes them for the coach.

-- 1. The origin ---------------------------------------------------------------------

alter table public.roadmap_proposals
  alter column generation_request_id drop not null,
  alter column prompt_version drop not null,
  alter column provider_code drop not null,
  alter column model_code drop not null,
  alter column rate_card_version drop not null;

alter table public.roadmap_proposals
  drop constraint roadmap_proposals_origin_check;
alter table public.roadmap_proposals
  add constraint roadmap_proposals_origin_check
    check (origin in (
      'ai_initial', 'ai_regeneration', 'owner_edit', 'owner_written'
    ));

-- A first answer and a hand-written roadmap have no source; a regeneration and
-- an edit each link exactly one immediate source proposal.
alter table public.roadmap_proposals
  drop constraint roadmap_proposals_lineage_check;
alter table public.roadmap_proposals
  add constraint roadmap_proposals_lineage_check
    check (
      (origin in ('ai_initial', 'owner_written') and source_proposal_id is null)
      or (
        origin in ('ai_regeneration', 'owner_edit')
        and source_proposal_id is not null
      )
    );

-- What a coach call leaves on its proposal, and that a hand-written one has
-- none of it.
alter table public.roadmap_proposals
  add constraint roadmap_proposals_provenance_check
    check (
      (
        origin = 'owner_written'
        and generation_request_id is null
        and prompt_version is null
        and provider_code is null
        and model_code is null
        and rate_card_version is null
        and spend_reservation_id is null
        and planning_note is null
        and regeneration_feedback is null
      )
      or (
        origin <> 'owner_written'
        and generation_request_id is not null
        and prompt_version is not null
        and provider_code is not null
        and model_code is not null
        and rate_card_version is not null
      )
    );

-- 2. A roadmap without a summary ------------------------------------------------------

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

  -- The summary may be left out (owner, 14 Oct 2026). One that is there is
  -- text of one to six hundred characters; a null is not a summary left out.
  if p_content->>'schemaVersion' is distinct from 'fittip.roadmap.v4'
    or pg_catalog.char_length(coalesce(p_content->>'title', ''))
       not between 1 and 80
    or (
      p_content ? 'summary'
      and pg_catalog.char_length(coalesce(p_content->>'summary', ''))
          not between 1 and 600
    )
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

revoke all privileges on function public.roadmap_content_is_valid(
  jsonb, date, date
) from public, anon, authenticated, service_role;

-- 3. Writing one ------------------------------------------------------------------------

-- The owner's roadmap, in force from this call. The owner is `auth.uid()`;
-- nothing in the arguments names one. The application validates the whole
-- v4 contract and every business rule first (the goals are its to check, as
-- they are for an edit); this is the independent check on the envelope, the
-- horizon and the head.
--
-- The horizon is the coach's: four to fifty-two weeks, starting no earlier
-- than the day before UTC today, the one day of slack being for the owner's
-- own zone. There is no upper bound on the start, as there is none on a coach
-- request's (`NEXT.md`, "The 30-day start limit is the app's alone").
--
-- The expected head is the one the page read. A roadmap accepted in another
-- tab since then refuses the write, as it refuses an acceptance. A repeat of a
-- write that already landed finds its own roadmap in force, one revision on,
-- and returns that receipt as a replay, so the client's transport retry stays
-- safe here as it is for the other roadmap functions.
create or replace function public.write_roadmap(
  p_content jsonb,
  p_expected_head_revision bigint
)
returns public.roadmap_acceptance_receipt
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_start date;
  v_end date;
  v_head public.roadmap_heads;
  v_replay record;
  v_proposal_id uuid;
begin
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

  if p_content is null
    or pg_catalog.jsonb_typeof(p_content) <> 'object'
    or p_expected_head_revision is null
    or p_expected_head_revision < 0
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid roadmap.';
  end if;

  begin
    v_start := (p_content->>'startDate')::date;
    v_end := (p_content->>'endDate')::date;
  exception
    when others then
      raise exception using
        errcode = '22023',
        message = 'Invalid roadmap.';
  end;

  if v_start is null
    or v_end is null
    or v_start < (v_now at time zone 'utc')::date - 1
    or v_end < v_start + 27
    or v_end > v_start + 365
    or not public.roadmap_content_is_valid(p_content, v_start, v_end)
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid roadmap.';
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

  select * into v_head
  from public.roadmap_heads
  where user_id = v_user_id;

  if coalesce(v_head.revision, 0) <> p_expected_head_revision then
    -- The same roadmap, written by hand, in force one revision on: this
    -- write has already landed.
    select proposal.id as proposal_id, version.id as version_id
    into v_replay
    from public.roadmap_versions version
    join public.roadmap_proposals proposal
      on proposal.id = version.source_proposal_id
      and proposal.user_id = version.user_id
    where version.user_id = v_user_id
      and version.id = v_head.current_version_id
      and v_head.revision = p_expected_head_revision + 1
      and proposal.origin = 'owner_written'
      and proposal.content = p_content;

    if found then
      return (
        v_replay.proposal_id, v_replay.version_id, v_head.revision, 'replayed'
      )::public.roadmap_acceptance_receipt;
    end if;

    raise exception using
      errcode = 'PT409',
      message = 'Your roadmap changed. Reload and try again.';
  end if;

  insert into public.roadmap_proposals (
    user_id, origin, schema_version, content, created_at
  )
  values (
    v_user_id, 'owner_written', p_content->>'schemaVersion', p_content, v_now
  )
  returning id into v_proposal_id;

  -- The advisory lock is the transaction's already, and taking it again is a
  -- no-op. A proposal with no request passes acceptance's lineage check, and
  -- with no sources its source check: what is left is the head, compared
  -- again, and the version, head and decision written as for any proposal.
  return public.accept_roadmap_proposal(v_proposal_id, p_expected_head_revision);
end;
$$;

revoke all privileges on function public.write_roadmap(jsonb, bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.write_roadmap(jsonb, bigint)
  to authenticated;
