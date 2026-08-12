-- M3-03 / ADR-015: selected-horizon plan proposal records and transactions.
--
-- Four owner-owned tables and four narrowly granted SECURITY DEFINER functions,
-- modelled directly on the M3-02 roadmap migration. Every function derives the
-- owner from auth.uid(), takes no owner identifier, sets search_path = '', uses
-- schema-qualified names, bounds every lock wait to three seconds, and returns
-- content-free receipts. No function makes a provider call: the call happens
-- between function 1 and function 2, outside any transaction, because an
-- external call cannot be made atomic with Postgres.
--
-- What is deliberately absent, because it belongs to a later ticket: an
-- accepted plan version, a head pointer, an edit path, and an acceptance
-- function. M3-04 owns acceptance, editing and locks; M3-03B owns regeneration,
-- which is why nothing here carries a lineage or a regeneration counter. This
-- ticket persists an immutable proposal and one terminal rejection.
--
-- Three things are reused rather than re-declared, on purpose:
--
--   * `public.roadmap_normalize_owner_text` and `public.roadmap_owner_text_hash`
--     are the exact pair that `normalizeOwnerText` in src/server/ai/owner-text.ts
--     must agree with. A second copy under a plan-prefixed name would be a
--     second thing that can drift from the application by one collapsed newline,
--     and a drifted normalization rejects a memory candidate the owner cannot
--     see a reason for. One normalization, one place.
--   * `public.roadmap_technical_codes_are_accepted` is the approved
--     provider/model/rate-card list mirrored from `model-binding.ts`. Approving
--     a model is a spend decision about FitTip, not about one operation, so the
--     plan path checks the same list.
--
-- Their roadmap-prefixed names are now slightly wrong. Renaming them would
-- rewrite applied history for a cosmetic gain, so they keep their names and
-- this comment records why.

create type public.plan_generation_receipt as (
  generation_id uuid,
  completion_token uuid,
  state text,
  proposal_id uuid
);

create type public.plan_generation_result as (
  state text,
  proposal_id uuid
);

create type public.plan_memory_candidate_receipt as (
  collection_revision bigint,
  item_ids uuid[]
);

create type public.plan_proposal_decision_receipt as (
  proposal_id uuid,
  result text
);

-- The durable pre-call idempotency record.
--
-- Owner text is held here as a bounded hash only. The note travels to the
-- provider and is stored on the proposal that results; a pending or failed
-- attempt keeps only enough to prove that the text finish is given is the text
-- begin claimed.
--
-- `day_count` is stored rather than derived so that the horizon the owner asked
-- for is a fact in the record, not something a reader recomputes from two dates
-- and hopes matches. The check constraint below ties the three together.
create table public.plan_generation_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  completion_token uuid not null default gen_random_uuid(),
  idempotency_key text not null,
  request_fingerprint text not null,
  requested_start_date date not null,
  requested_end_date date not null,
  day_count smallint not null,
  planning_note_hash text,
  status text not null default 'pending',
  proposal_id uuid,
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plan_generation_requests_owner_fkey
    foreign key (user_id)
    references public.profiles (user_id)
    on delete cascade,
  constraint plan_generation_requests_owner_key unique (id, user_id),
  constraint plan_generation_requests_key_key
    unique (user_id, idempotency_key),
  constraint plan_generation_requests_key_check
    check (char_length(idempotency_key) between 16 and 128),
  constraint plan_generation_requests_fingerprint_check
    check (char_length(request_fingerprint) between 16 and 256),
  constraint plan_generation_requests_status_check
    check (status in ('pending', 'completed', 'failed')),
  -- One to seven consecutive owner-local dates, inclusive, and the end date is
  -- the start plus one less than the count. A one-day horizon is valid and is
  -- the case a `end > start` bound would have silently excluded.
  constraint plan_generation_requests_day_count_check
    check (day_count between 1 and 7),
  constraint plan_generation_requests_horizon_check
    check (requested_end_date = requested_start_date + (day_count - 1)),
  constraint plan_generation_requests_note_hash_check
    check (planning_note_hash is null or char_length(planning_note_hash) = 64),
  constraint plan_generation_requests_failure_code_check
    check (
      failure_code is null
      or failure_code ~ '^[a-z][a-z0-9_]{1,63}$'
    ),
  -- Terminal state and its evidence move together.
  constraint plan_generation_requests_terminal_check
    check (
      (status = 'pending' and proposal_id is null and failure_code is null)
      or (status = 'completed' and proposal_id is not null
          and failure_code is null)
      or (status = 'failed' and proposal_id is null
          and failure_code is not null)
    )
);

-- Immutable proposal content. Nothing updates a row in this table.
create table public.plan_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  generation_request_id uuid not null,
  origin text not null,
  planning_note text,
  schema_version text not null,
  prompt_version text not null,
  provider_code text not null,
  model_code text not null,
  rate_card_version text not null,
  spend_reservation_id uuid,
  content jsonb not null,
  created_at timestamptz not null default now(),
  constraint plan_proposals_owner_fkey
    foreign key (user_id)
    references public.profiles (user_id)
    on delete cascade,
  constraint plan_proposals_owner_key unique (id, user_id),
  constraint plan_proposals_request_fkey
    foreign key (generation_request_id, user_id)
    references public.plan_generation_requests (id, user_id)
    on delete cascade,
  constraint plan_proposals_spend_fkey
    foreign key (spend_reservation_id)
    references public.ai_spend_reservations (id)
    on delete set null,
  -- Only one origin exists in this ticket. Regeneration and owner edits add
  -- their own values in M3-03B and M3-04; the column exists now so that adding
  -- one is a check-constraint change rather than a table reshape.
  constraint plan_proposals_origin_check check (origin in ('ai_initial')),
  constraint plan_proposals_note_check
    check (planning_note is null or char_length(planning_note) between 1 and 1000),
  constraint plan_proposals_schema_check
    check (schema_version = 'fittip.seven-day-plan.v2'),
  constraint plan_proposals_prompt_check
    check (char_length(trim(prompt_version)) between 1 and 100),
  constraint plan_proposals_provider_check
    check (char_length(trim(provider_code)) between 1 and 64),
  constraint plan_proposals_model_check
    check (char_length(trim(model_code)) between 1 and 64),
  constraint plan_proposals_rate_card_check
    check (char_length(trim(rate_card_version)) between 1 and 100),
  constraint plan_proposals_content_size_check
    check (pg_column_size(content) <= 32768)
);

-- Minimized provenance. Ids and revisions only; no copied source content.
create table public.plan_proposal_sources (
  proposal_id uuid not null,
  user_id uuid not null,
  ordinal smallint not null,
  source_kind text not null,
  record_id uuid not null,
  revision_id uuid,
  revision_number bigint,
  constraint plan_proposal_sources_pkey primary key (proposal_id, ordinal),
  constraint plan_proposal_sources_owner_fkey
    foreign key (user_id)
    references public.profiles (user_id)
    on delete cascade,
  -- Composite, so a proposal cannot reference a row recorded under another
  -- owner even if a caller supplied one.
  constraint plan_proposal_sources_proposal_fkey
    foreign key (proposal_id, user_id)
    references public.plan_proposals (id, user_id)
    on delete cascade,
  constraint plan_proposal_sources_kind_check
    check (source_kind in ('goal', 'memory', 'plan_version', 'completion')),
  constraint plan_proposal_sources_ordinal_check
    check (ordinal between 0 and 255),
  constraint plan_proposal_sources_revision_check
    check (revision_number is null or revision_number >= 0)
);

-- Append-only. One terminal decision per proposal, enforced by the primary key.
--
-- `rejected` is the only decision this ticket can record, because acceptance is
-- M3-04 and there is nothing yet for an accepted proposal to become. M3-04
-- widens the check and adds its version reference in its own forward migration.
create table public.plan_proposal_decisions (
  proposal_id uuid primary key,
  user_id uuid not null,
  decision text not null,
  decided_at timestamptz not null default now(),
  constraint plan_proposal_decisions_owner_fkey
    foreign key (user_id)
    references public.profiles (user_id)
    on delete cascade,
  constraint plan_proposal_decisions_owner_key
    unique (proposal_id, user_id),
  constraint plan_proposal_decisions_proposal_fkey
    foreign key (proposal_id, user_id)
    references public.plan_proposals (id, user_id)
    on delete cascade,
  constraint plan_proposal_decisions_decision_check
    check (decision in ('rejected'))
);

create index plan_generation_requests_owner_idx
  on public.plan_generation_requests (user_id, created_at desc);
create index plan_proposals_owner_idx
  on public.plan_proposals (user_id, created_at desc);
create index plan_proposals_request_idx
  on public.plan_proposals (generation_request_id, user_id);
create index plan_proposals_spend_idx
  on public.plan_proposals (spend_reservation_id)
  where spend_reservation_id is not null;
create index plan_proposal_sources_owner_idx
  on public.plan_proposal_sources (user_id, proposal_id);
create index plan_proposal_decisions_owner_idx
  on public.plan_proposal_decisions (user_id, decided_at desc);

alter table public.plan_generation_requests enable row level security;
alter table public.plan_proposals enable row level security;
alter table public.plan_proposal_sources enable row level security;
alter table public.plan_proposal_decisions enable row level security;

revoke all privileges on table public.plan_generation_requests
  from public, anon, authenticated, service_role;
revoke all privileges on table public.plan_proposals
  from public, anon, authenticated, service_role;
revoke all privileges on table public.plan_proposal_sources
  from public, anon, authenticated, service_role;
revoke all privileges on table public.plan_proposal_decisions
  from public, anon, authenticated, service_role;

-- Column-level SELECT, deliberately. `completion_token` is absent: it is the
-- capability that permits finishing a generation, and an owner who could read
-- it could finish their own generation with content the server never validated.
grant select (
  id,
  user_id,
  idempotency_key,
  request_fingerprint,
  requested_start_date,
  requested_end_date,
  day_count,
  planning_note_hash,
  status,
  proposal_id,
  failure_code,
  created_at,
  updated_at
) on table public.plan_generation_requests to authenticated;

grant select on table
  public.plan_proposals,
  public.plan_proposal_sources,
  public.plan_proposal_decisions
to authenticated;

create policy plan_generation_requests_owner_select
on public.plan_generation_requests
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy plan_proposals_owner_select
on public.plan_proposals
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy plan_proposal_sources_owner_select
on public.plan_proposal_sources
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy plan_proposal_decisions_owner_select
on public.plan_proposal_decisions
for select
to authenticated
using ((select auth.uid()) = user_id);

-- Structural bounds on the stored envelope.
--
-- The application validates the complete fittip.seven-day-plan.v2 contract and
-- every business rule before it calls finish. This function is the independent
-- floor: it enforces the sizes, enums, horizon and array bounds needed to keep
-- what is stored safe to read back, so a bug in the application cannot write an
-- unbounded or mis-horizoned envelope into permanent history.
--
-- Two bounds here are the ones M3-03 decision 4 changed and are the reason this
-- function is not a copy of the roadmap's: at most three sessions on any one
-- date, and at most three times the day count across the horizon. There is no
-- minutes cap and no required rest day, so a horizon with neither is valid and
-- must not be rejected here.
--
-- Note what the key allowlists exclude. No level of this schema admits a weight,
-- a percentage, or an attention share, and the allowlist is what makes that
-- mechanical rather than a rule someone has to remember.
create function public.plan_content_is_valid(
  p_content jsonb,
  p_start_date date,
  p_end_date date
)
returns boolean
language plpgsql
-- STABLE rather than IMMUTABLE: a text-to-date cast depends on DateStyle, so
-- the strongest honest volatility class is stable.
stable
security invoker
set search_path = ''
as $$
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
        'primaryGoalId', 'secondaryGoalIds', 'alternatives', 'rationale'
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
$$;

revoke all privileges on function public.plan_content_is_valid(
  jsonb, date, date
) from public, anon, authenticated, service_role;

-- Function 1: claim the provider attempt.
create function public.begin_plan_generation(
  p_idempotency_key text,
  p_request_fingerprint text,
  p_start_date date,
  p_day_count integer,
  p_planning_note text default null
)
returns public.plan_generation_receipt
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_existing public.plan_generation_requests;
  v_note text;
  v_receipt public.plan_generation_receipt;
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
    or p_day_count is null
    or p_day_count not between 1 and 7
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid plan request.';
  end if;

  -- A proposal never contains a date that has already happened. The single day
  -- of slack is deliberate: the owner's local today can legitimately be one day
  -- behind or ahead of the server's UTC date.
  if p_start_date < (v_now at time zone 'utc')::date - 1 then
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

  -- Same key, same fingerprint replays the claim, returning the stored status —
  -- pending, completed, or failed — and never 'claimed'. That is the whole
  -- discriminator: only the fresh insert below reports 'claimed', so only the
  -- caller that actually opened the attempt invokes the provider. A different
  -- fingerprint under the same key is a conflict, not a silent second call.
  select * into v_existing
  from public.plan_generation_requests
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
      v_existing.proposal_id
    )::public.plan_generation_receipt;
  end if;

  perform pg_catalog.set_config('lock_timeout', '3s', true);
  begin
    perform pg_catalog.pg_advisory_xact_lock(
      62006,
      pg_catalog.hashtext(v_user_id::text)
    );
  exception
    when lock_not_available then
      raise exception using
        errcode = 'PT409',
        message = 'Your plan changed. Reload and try again.';
  end;

  insert into public.plan_generation_requests (
    user_id,
    idempotency_key,
    request_fingerprint,
    requested_start_date,
    requested_end_date,
    day_count,
    planning_note_hash,
    status,
    created_at,
    updated_at
  )
  values (
    v_user_id,
    p_idempotency_key,
    p_request_fingerprint,
    p_start_date,
    p_start_date + (p_day_count - 1),
    p_day_count,
    public.roadmap_owner_text_hash(v_note),
    'pending',
    v_now,
    v_now
  )
  -- The row is stored 'pending'; the receipt reports 'claimed'. Only this path
  -- runs for the caller that won the insert, so 'claimed' is the one state that
  -- authorizes a provider call.
  returning id, completion_token, 'claimed', proposal_id
  into v_receipt;

  return v_receipt;
end;
$$;

-- Function 2: finish generation and persist the proposal.
create function public.finish_plan_generation(
  p_completion_token uuid,
  p_outcome text,
  p_schema_version text default null,
  p_prompt_version text default null,
  p_provider_code text default null,
  p_model_code text default null,
  p_rate_card_version text default null,
  p_spend_reservation_id uuid default null,
  p_planning_note text default null,
  p_content jsonb default null,
  p_sources jsonb default null,
  p_safe_failure_code text default null
)
returns public.plan_generation_result
language plpgsql
security definer
set search_path = ''
as $$
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
      62006,
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
          from public.plan_proposals
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
        ::public.plan_generation_result;
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
        message = 'Invalid plan result.';
    end if;

    update public.plan_generation_requests
    set status = 'failed', failure_code = p_safe_failure_code, updated_at = v_now
    where id = v_request.id and user_id = v_user_id;

    return ('failed', null::uuid)::public.plan_generation_result;
  end if;

  if p_safe_failure_code is not null
    or p_content is null
    or p_schema_version is distinct from 'fittip.seven-day-plan.v2'
    or p_prompt_version is null
    or p_provider_code is null
    or p_model_code is null
    or p_rate_card_version is null
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid plan result.';
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
  -- same rate card, recorded against this operation. Without this a real call
  -- could be recorded as a fixture and cost nothing against the ceiling.
  if p_spend_reservation_id is not null then
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

  -- The owner text must be the text this request claimed before the provider
  -- call. Anything else means the content that travelled is not the content
  -- being stored, and the memory excerpt check downstream would be meaningless.
  v_note := public.roadmap_normalize_owner_text(p_planning_note);
  if v_note = '' then v_note := null; end if;

  if public.roadmap_owner_text_hash(v_note)
       is distinct from v_request.planning_note_hash
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid plan result.';
  end if;

  if not public.plan_content_is_valid(
    p_content,
    v_request.requested_start_date,
    v_request.requested_end_date
  ) then
    raise exception using
      errcode = '22023',
      message = 'Invalid plan result.';
  end if;

  insert into public.plan_proposals (
    user_id,
    generation_request_id,
    origin,
    planning_note,
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
    'ai_initial',
    v_note,
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
        message = 'Invalid plan result.';
    end if;

    for v_source in
      select value from pg_catalog.jsonb_array_elements(p_sources)
    loop
      v_kind := v_source->>'kind';
      if v_kind not in ('goal', 'memory', 'plan_version', 'completion') then
        raise exception using
          errcode = '22023',
          message = 'Invalid plan result.';
      end if;

      begin
        v_record := (v_source->>'recordId')::uuid;
      exception
        when others then
          raise exception using
            errcode = '22023',
            message = 'Invalid plan result.';
      end;

      insert into public.plan_proposal_sources (
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

  update public.plan_generation_requests
  set status = 'completed', proposal_id = v_proposal_id, updated_at = v_now
  where id = v_request.id and user_id = v_user_id;

  return ('completed', v_proposal_id)::public.plan_generation_result;
end;
$$;

-- Function 3: persist inferred memory candidates independently.
--
-- The plan-side twin of `record_roadmap_memory_candidates`, and the second
-- route in FitTip that can create author_class = 'system',
-- provenance = 'inferred_proposed' and status = 'proposed'. It narrowly amends
-- ADR-010's statement that no authenticated path produces inferred provenance
-- on exactly the same terms: this path can produce proposals only, cannot
-- accept, enable, edit or delete them, and cannot make them eligible coaching
-- context. Only explicit owner review on M2-02's surface can do that.
create function public.record_plan_memory_candidates(
  p_completion_token uuid,
  p_expected_memory_revision bigint,
  p_candidates jsonb
)
returns public.plan_memory_candidate_receipt
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_request public.plan_generation_requests;
  v_proposal public.plan_proposals;
  v_current_revision bigint;
  v_new_revision bigint;
  v_candidate jsonb;
  v_ordinal integer := 0;
  v_excerpt text;
  v_type text;
  v_confidence smallint;
  v_item_id uuid;
  v_revision_id uuid;
  v_source_reference text;
  v_item_ids uuid[] := array[]::uuid[];
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'An authenticated FitTip user is required.';
  end if;

  if p_completion_token is null
    or p_expected_memory_revision is null
    or p_expected_memory_revision < 0
    or p_candidates is null
    or pg_catalog.jsonb_typeof(p_candidates) <> 'array'
    or pg_catalog.jsonb_array_length(p_candidates) not between 1 and 4
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid memory candidates.';
  end if;

  select * into v_request
  from public.plan_generation_requests
  where user_id = v_user_id
    and completion_token = p_completion_token
    and status = 'completed';

  if not found then
    raise exception using
      errcode = 'PT409',
      message = 'That coaching request is no longer open.';
  end if;

  select * into v_proposal
  from public.plan_proposals
  where id = v_request.proposal_id
    and user_id = v_user_id;

  if not found then
    raise exception using
      errcode = 'PT409',
      message = 'That coaching request is no longer open.';
  end if;

  -- With no planning note there is nothing for a candidate to cite.
  if v_proposal.planning_note is null then
    raise exception using
      errcode = '22023',
      message = 'Invalid memory candidates.';
  end if;

  -- ADR-010's owner lock, stale-revision check and collection increment.
  perform pg_catalog.set_config('lock_timeout', '3s', true);
  begin
    perform pg_catalog.pg_advisory_xact_lock(
      62002,
      pg_catalog.hashtext(v_user_id::text)
    );
  exception
    when lock_not_available then
      raise exception using
        errcode = 'PT409',
        message = 'Memory changed. Reload and try again.';
  end;

  -- Retry returns the existing candidates rather than duplicating them. The
  -- source reference is the proposal plus the candidate ordinal, so the same
  -- batch replayed maps onto the same rows.
  if exists (
    select 1
    from public.memory_items
    where user_id = v_user_id
      and source_reference like 'plan-proposal:' || v_proposal.id::text || ':%'
  ) then
    select
      coalesce(
        (select revision from public.memory_collections where user_id = v_user_id),
        0
      ),
      pg_catalog.array_agg(id order by source_reference)
    into v_new_revision, v_item_ids
    from public.memory_items
    where user_id = v_user_id
      and source_reference like 'plan-proposal:' || v_proposal.id::text || ':%';

    return (v_new_revision, v_item_ids)
      ::public.plan_memory_candidate_receipt;
  end if;

  select revision into v_current_revision
  from public.memory_collections
  where user_id = v_user_id;
  v_current_revision := coalesce(v_current_revision, 0);

  if v_current_revision <> p_expected_memory_revision then
    raise exception using
      errcode = 'PT409',
      message = 'Memory changed. Reload and try again.';
  end if;

  v_new_revision := v_current_revision + 1;

  for v_candidate in
    select value from pg_catalog.jsonb_array_elements(p_candidates)
  loop
    if exists (
      select 1
      from pg_catalog.jsonb_object_keys(v_candidate) as key
      where key not in ('memoryType', 'sourceExcerpt', 'confidence')
    ) then
      raise exception using
        errcode = '22023',
        message = 'Invalid memory candidates.';
    end if;

    v_type := v_candidate->>'memoryType';
    if v_type not in (
      'profile_fact', 'constraint', 'preference', 'observed_pattern'
    ) then
      raise exception using
        errcode = '22023',
        message = 'Invalid memory candidates.';
    end if;

    v_excerpt := public.roadmap_normalize_owner_text(
      v_candidate->>'sourceExcerpt'
    );
    if v_excerpt is null
      or pg_catalog.char_length(v_excerpt) not between 1 and 200
      or pg_catalog.strpos(v_proposal.planning_note, v_excerpt) = 0
    then
      raise exception using
        errcode = '22023',
        message = 'Invalid memory candidates.';
    end if;

    v_confidence := null;
    if v_candidate ? 'confidence'
      and pg_catalog.jsonb_typeof(v_candidate->'confidence') <> 'null'
    then
      if pg_catalog.jsonb_typeof(v_candidate->'confidence') <> 'number' then
        raise exception using
          errcode = '22023',
          message = 'Invalid memory candidates.';
      end if;
      v_confidence := (v_candidate->>'confidence')::numeric;
      if v_confidence not between 0 and 100 then
        raise exception using
          errcode = '22023',
          message = 'Invalid memory candidates.';
      end if;
    end if;

    v_item_id := gen_random_uuid();
    v_revision_id := gen_random_uuid();
    v_source_reference :=
      'plan-proposal:' || v_proposal.id::text || ':' || v_ordinal::text;

    -- Owner, provenance, author class, status and timestamps are derived here.
    -- None of them is a caller input, which is what keeps this route unable to
    -- create anything but a proposal.
    insert into public.memory_revisions (
      id, user_id, item_id, revision_number, content, author_class,
      provenance, change_kind, status_after, previous_revision_id, created_at
    )
    values (
      v_revision_id, v_user_id, v_item_id, 1, v_excerpt, 'system',
      'inferred_proposed', 'created', 'proposed', null, v_now
    );

    insert into public.memory_items (
      id, user_id, memory_type, status, provenance, confidence,
      source_reference, expires_on, current_revision_id, user_confirmed_at,
      status_changed_at, created_at, updated_at
    )
    values (
      v_item_id, v_user_id, v_type, 'proposed', 'inferred_proposed',
      v_confidence, v_source_reference, null, v_revision_id, null,
      v_now, v_now, v_now
    );

    v_item_ids := v_item_ids || v_item_id;
    v_ordinal := v_ordinal + 1;
  end loop;

  insert into public.memory_collections (user_id, revision, updated_at)
  values (v_user_id, v_new_revision, v_now)
  on conflict (user_id)
  do update set revision = excluded.revision, updated_at = excluded.updated_at;

  return (v_new_revision, v_item_ids)
    ::public.plan_memory_candidate_receipt;
end;
$$;

-- Function 4: reject a proposal.
--
-- Reject is the only decision M3-03 offers. There is no edit and no acceptance:
-- both change what an accepted plan is, and M3-04 owns that. A rejected
-- proposal and its planning note are retained as evidence rather than deleted —
-- a rejected proposal without its note is evidence nobody can interpret.
create function public.reject_plan_proposal(p_proposal_id uuid)
returns public.plan_proposal_decision_receipt
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_proposal public.plan_proposals;
  v_decision public.plan_proposal_decisions;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'An authenticated FitTip user is required.';
  end if;

  if p_proposal_id is null then
    raise exception using
      errcode = '22023',
      message = 'Invalid plan decision.';
  end if;

  perform pg_catalog.set_config('lock_timeout', '3s', true);
  begin
    perform pg_catalog.pg_advisory_xact_lock(
      62006,
      pg_catalog.hashtext(v_user_id::text)
    );
  exception
    when lock_not_available then
      raise exception using
        errcode = 'PT409',
        message = 'Your plan changed. Reload and try again.';
  end;

  select * into v_proposal
  from public.plan_proposals
  where id = p_proposal_id and user_id = v_user_id;

  if not found then
    raise exception using
      errcode = 'PT409',
      message = 'That proposal is no longer available.';
  end if;

  select * into v_decision
  from public.plan_proposal_decisions
  where proposal_id = v_proposal.id and user_id = v_user_id;

  -- Rejecting twice is the same rejection, not a conflict: a retried tap must
  -- not become an error the owner has to interpret.
  if found then
    return (v_proposal.id, v_decision.decision)
      ::public.plan_proposal_decision_receipt;
  end if;

  insert into public.plan_proposal_decisions (
    proposal_id, user_id, decision, decided_at
  )
  values (v_proposal.id, v_user_id, 'rejected', v_now);

  return (v_proposal.id, 'rejected')::public.plan_proposal_decision_receipt;
end;
$$;

revoke all privileges on function public.begin_plan_generation(
  text, text, date, integer, text
) from public, anon, authenticated, service_role;
grant execute on function public.begin_plan_generation(
  text, text, date, integer, text
) to authenticated;

revoke all privileges on function public.finish_plan_generation(
  uuid, text, text, text, text, text, text, uuid, text, jsonb, jsonb, text
) from public, anon, authenticated, service_role;
grant execute on function public.finish_plan_generation(
  uuid, text, text, text, text, text, text, uuid, text, jsonb, jsonb, text
) to authenticated;

revoke all privileges on function public.record_plan_memory_candidates(
  uuid, bigint, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.record_plan_memory_candidates(
  uuid, bigint, jsonb
) to authenticated;

revoke all privileges on function public.reject_plan_proposal(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.reject_plan_proposal(uuid) to authenticated;
