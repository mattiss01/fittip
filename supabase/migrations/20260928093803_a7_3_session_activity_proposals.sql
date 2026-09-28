-- A7-3: persistence for `fill_session_activities` (ADR-020).
--
-- The coach's activity list for one planned session is a proposal like every
-- other coaching output: a permanent record the owner decides, never a write to
-- the plan. Saving the list is the owner's own plan edit through
-- `apply_rolling_plan_change_set`, exactly as if they had typed it; this
-- migration records what was proposed and what the owner decided about it.
--
-- The shape is the plan proposal's, reduced to what one session needs:
--
--   session_activity_requests            the claimed attempt and its capability
--   session_activity_proposals           immutable content, one per completed attempt
--   session_activity_proposal_sources    ids and revisions of what reached the coach
--   session_activity_decisions           the owner's one final decision
--
-- There are no items and no review to finish. The owner edits the list in the
-- session editor and either saves it or dismisses it, so the decision is one
-- row per proposal and final once written.
--
-- A proposal names its session by id. If the session is later deleted, the
-- proposal stays — it is a permanent record of what was proposed — and its
-- session id becomes null, which `ON DELETE SET NULL (session_id)` does without
-- also nulling the owner column the composite key shares.
--
-- Spend follows ADR-019: the finish settles an open reservation in the same
-- transaction that records the proposal, and one reservation pays for exactly
-- one proposal. `reserve_ai_spend` and the reservation table's operation check
-- are widened to the new operation; nothing else about them changes.

-- ---------------------------------------------------------------------------
-- 1. The spend ledger admits the new operation.
-- ---------------------------------------------------------------------------

alter table public.ai_spend_reservations
  drop constraint ai_spend_reservations_operation_check;
alter table public.ai_spend_reservations
  add constraint ai_spend_reservations_operation_check
  check (operation in (
    'create_roadmap', 'create_seven_day_plan', 'fill_session_activities'
  ));

-- Replaced from its live definition (20260924082758), changed in one line: the
-- operation list. Every grant is restated below after a full revoke, as ADR-019
-- did, so the privilege boundary is read here rather than inherited.
CREATE OR REPLACE FUNCTION public.reserve_ai_spend(p_operation text, p_reserved_micro_usd bigint, p_rate_card_version text, p_currency text)
 RETURNS public.ai_spend_reservation_receipt
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
  -- between the provider response and the settle call.
  --
  -- It no longer bounds how long a hold counts. Until ADR-019 the second half
  -- of this comment read that a crashed call cannot hold budget past midnight
  -- and lock the owner out with no visible cause -- which is exactly what this
  -- change gives up, deliberately, because forgiving a charge we failed to
  -- record is the worse failure. `expires_at` is still written and still
  -- readable; nothing in the ceiling arithmetic consults it any more.
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
    or p_operation not in (
      'create_roadmap', 'create_seven_day_plan', 'fill_session_activities'
    )
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
  -- insert itself, so there is no window between deciding and writing. A
  -- settled reservation holds exactly what it was charged; an unsettled one
  -- holds what it reserved, for good. It used to stop holding anything once it
  -- expired, and ADR-019 removed that: a reservation nobody settled is one
  -- where money may well have been spent and we failed to record it.
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

revoke all privileges on function public.reserve_ai_spend(
  text, bigint, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.reserve_ai_spend(
  text, bigint, text, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Tables.
-- ---------------------------------------------------------------------------

-- The attempt. The completion token is the capability that permits closing it,
-- and is withheld from the owner's own SELECT below as the plan's is.
--
-- `local_date` is the session's date when the request was made, kept so the
-- record still says which day it was about if the session is later deleted.
-- `expected_plan_revision` is what the proposal was composed against; nothing
-- revalidates it, because saving goes through the plan's own write rules.
create table public.session_activity_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  completion_token uuid not null default gen_random_uuid(),
  idempotency_key text not null,
  request_fingerprint text not null,
  session_id uuid,
  local_date date not null,
  expected_plan_revision bigint not null,
  note_hash text,
  status text not null default 'pending',
  proposal_id uuid,
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint session_activity_requests_owner_fkey
    foreign key (user_id) references public.profiles (user_id) on delete cascade,
  constraint session_activity_requests_owner_key unique (id, user_id),
  constraint session_activity_requests_key_key unique (user_id, idempotency_key),
  constraint session_activity_requests_token_key
    unique (user_id, completion_token),
  constraint session_activity_requests_session_fkey
    foreign key (session_id, user_id)
    references public.rolling_plan_sessions (id, user_id)
    on delete set null (session_id),
  constraint session_activity_requests_key_check
    check (char_length(idempotency_key) between 16 and 128),
  constraint session_activity_requests_fingerprint_check
    check (char_length(request_fingerprint) between 16 and 256),
  constraint session_activity_requests_status_check
    check (status in ('pending', 'completed', 'failed')),
  constraint session_activity_requests_revision_check
    check (expected_plan_revision >= 0),
  constraint session_activity_requests_note_hash_check
    check (note_hash is null or char_length(note_hash) = 64),
  constraint session_activity_requests_failure_code_check
    check (failure_code is null or failure_code ~ '^[a-z][a-z0-9_]{1,63}$'),
  -- Terminal state and its evidence move together.
  constraint session_activity_requests_terminal_check check (
    (status = 'pending' and proposal_id is null and failure_code is null)
    or (status = 'completed' and proposal_id is not null and failure_code is null)
    or (status = 'failed' and proposal_id is null and failure_code is not null)
  )
);

-- Immutable proposal content. Nothing updates a row here, and saving the list
-- to the plan does not change it: a plan and the proposal it came from are
-- separate permanent records.
create table public.session_activity_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  request_id uuid not null,
  session_id uuid,
  local_date date not null,
  note text,
  schema_version text not null,
  prompt_version text not null,
  provider_code text not null,
  model_code text not null,
  rate_card_version text not null,
  spend_reservation_id uuid,
  content jsonb not null,
  created_at timestamptz not null default now(),
  constraint session_activity_proposals_owner_fkey
    foreign key (user_id) references public.profiles (user_id) on delete cascade,
  constraint session_activity_proposals_owner_key unique (id, user_id),
  constraint session_activity_proposals_request_key unique (request_id),
  constraint session_activity_proposals_request_fkey
    foreign key (request_id, user_id)
    references public.session_activity_requests (id, user_id) on delete cascade,
  constraint session_activity_proposals_session_fkey
    foreign key (session_id, user_id)
    references public.rolling_plan_sessions (id, user_id)
    on delete set null (session_id),
  constraint session_activity_proposals_spend_fkey
    foreign key (spend_reservation_id)
    references public.ai_spend_reservations (id) on delete set null,
  -- The owner's request note: 500 characters, the bound the action enforces.
  constraint session_activity_proposals_note_check
    check (note is null or char_length(note) between 1 and 500),
  constraint session_activity_proposals_schema_check
    check (schema_version = 'fittip.session-activities.v1'),
  constraint session_activity_proposals_prompt_check
    check (char_length(trim(prompt_version)) between 1 and 100),
  constraint session_activity_proposals_provider_check
    check (char_length(trim(provider_code)) between 1 and 64),
  constraint session_activity_proposals_model_check
    check (char_length(trim(model_code)) between 1 and 64),
  constraint session_activity_proposals_rate_card_check
    check (char_length(trim(rate_card_version)) between 1 and 100),
  constraint session_activity_proposals_content_size_check
    check (pg_column_size(content) <= 32768)
);

-- One reservation pays for exactly one proposal, as for plans and roadmaps.
create unique index session_activity_proposals_spend_idx
  on public.session_activity_proposals (spend_reservation_id)
  where spend_reservation_id is not null;

-- Minimized provenance. Ids and revisions only; no copied source content.
create table public.session_activity_proposal_sources (
  proposal_id uuid not null,
  ordinal smallint not null,
  user_id uuid not null,
  source_kind text not null,
  record_id uuid not null,
  revision_id uuid,
  revision_number bigint,
  constraint session_activity_proposal_sources_pkey
    primary key (proposal_id, ordinal),
  constraint session_activity_proposal_sources_owner_fkey
    foreign key (user_id) references public.profiles (user_id) on delete cascade,
  constraint session_activity_proposal_sources_proposal_fkey
    foreign key (proposal_id, user_id)
    references public.session_activity_proposals (id, user_id) on delete cascade,
  constraint session_activity_proposal_sources_kind_check
    check (source_kind in (
      'goal', 'memory', 'completion',
      'plan_session', 'personal_activity', 'saved_session'
    )),
  constraint session_activity_proposal_sources_ordinal_check
    check (ordinal between 0 and 255),
  constraint session_activity_proposal_sources_revision_check
    check (revision_number is null or revision_number >= 0)
);

-- The owner's decision. One row per proposal and final once written: Save
-- records 'accepted', Dismiss records 'dismissed', and neither can be changed
-- into the other. No row means the proposal is still open.
create table public.session_activity_decisions (
  proposal_id uuid primary key,
  user_id uuid not null,
  decision text not null,
  decided_at timestamptz not null default now(),
  constraint session_activity_decisions_owner_fkey
    foreign key (user_id) references public.profiles (user_id) on delete cascade,
  constraint session_activity_decisions_proposal_fkey
    foreign key (proposal_id, user_id)
    references public.session_activity_proposals (id, user_id) on delete cascade,
  constraint session_activity_decisions_decision_check
    check (decision in ('accepted', 'dismissed'))
);

create index session_activity_requests_owner_idx
  on public.session_activity_requests (user_id, created_at desc);
create index session_activity_requests_session_idx
  on public.session_activity_requests (session_id, user_id)
  where session_id is not null;
create index session_activity_proposals_owner_idx
  on public.session_activity_proposals (user_id, created_at desc);
create index session_activity_proposals_session_idx
  on public.session_activity_proposals (session_id, user_id)
  where session_id is not null;
create index session_activity_proposal_sources_owner_idx
  on public.session_activity_proposal_sources (user_id, proposal_id);
create index session_activity_decisions_owner_idx
  on public.session_activity_decisions (user_id, decided_at desc);

-- ---------------------------------------------------------------------------
-- 3. Row Level Security, privileges, and policies.
-- ---------------------------------------------------------------------------

alter table public.session_activity_requests enable row level security;
alter table public.session_activity_proposals enable row level security;
alter table public.session_activity_proposal_sources enable row level security;
alter table public.session_activity_decisions enable row level security;

revoke all privileges on table public.session_activity_requests
  from public, anon, authenticated, service_role;
revoke all privileges on table public.session_activity_proposals
  from public, anon, authenticated, service_role;
revoke all privileges on table public.session_activity_proposal_sources
  from public, anon, authenticated, service_role;
revoke all privileges on table public.session_activity_decisions
  from public, anon, authenticated, service_role;

-- Column-level, so `completion_token` is not left in a table the owner lists.
grant select (
  id,
  user_id,
  idempotency_key,
  request_fingerprint,
  session_id,
  local_date,
  expected_plan_revision,
  note_hash,
  status,
  proposal_id,
  failure_code,
  created_at,
  updated_at
) on table public.session_activity_requests to authenticated;

grant select on table
  public.session_activity_proposals,
  public.session_activity_proposal_sources,
  public.session_activity_decisions
to authenticated;

create policy session_activity_requests_owner_select
on public.session_activity_requests
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy session_activity_proposals_owner_select
on public.session_activity_proposals
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy session_activity_proposal_sources_owner_select
on public.session_activity_proposal_sources
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy session_activity_decisions_owner_select
on public.session_activity_decisions
for select
to authenticated
using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 4. Content validity.
-- ---------------------------------------------------------------------------
--
-- The database's own copy of the shape `output-validation.ts` enforces, so an
-- owner calling the RPCs directly with their own completion token still cannot
-- store a list the plan would refuse. Targets go through
-- `is_valid_training_measurement`, the check `rolling_plan_activities` itself
-- uses, and a library link must be one of this owner's definitions.
create function public.session_activities_content_is_valid(
  p_content jsonb,
  p_user_id uuid
)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_activity jsonb;
  v_mode text;
  v_link text;
  v_entry jsonb;
begin
  if p_content is null
    or pg_catalog.jsonb_typeof(p_content) <> 'object'
    or exists (
      select 1 from pg_catalog.jsonb_object_keys(p_content) as key
      where key not in (
        'schemaVersion', 'summary', 'activities', 'safetyConsiderations'
      )
    )
    or p_content->>'schemaVersion' is distinct from 'fittip.session-activities.v1'
    or pg_catalog.jsonb_typeof(p_content->'summary') <> 'string'
    or pg_catalog.char_length(pg_catalog.btrim(p_content->>'summary'))
      not between 1 and 400
    or pg_catalog.jsonb_typeof(p_content->'activities') <> 'array'
    or pg_catalog.jsonb_array_length(p_content->'activities') not between 1 and 12
  then
    return false;
  end if;

  if p_content ? 'safetyConsiderations' then
    if pg_catalog.jsonb_typeof(p_content->'safetyConsiderations') <> 'array'
      or pg_catalog.jsonb_array_length(p_content->'safetyConsiderations') > 3
    then
      return false;
    end if;
    for v_entry in
      select value
      from pg_catalog.jsonb_array_elements(p_content->'safetyConsiderations')
    loop
      if pg_catalog.jsonb_typeof(v_entry) <> 'string'
        or pg_catalog.char_length(pg_catalog.btrim(v_entry #>> '{}'))
          not between 1 and 240
      then
        return false;
      end if;
    end loop;
  end if;

  for v_activity in
    select value from pg_catalog.jsonb_array_elements(p_content->'activities')
  loop
    if pg_catalog.jsonb_typeof(v_activity) <> 'object'
      or exists (
        select 1 from pg_catalog.jsonb_object_keys(v_activity) as key
        where key not in (
          'personalActivityId', 'name', 'sport', 'instructions',
          'measurementMode', 'target', 'rationale'
        )
      )
      or pg_catalog.jsonb_typeof(v_activity->'name') <> 'string'
      or pg_catalog.char_length(pg_catalog.btrim(v_activity->>'name'))
        not between 1 and 120
      or pg_catalog.jsonb_typeof(v_activity->'sport') <> 'string'
      or pg_catalog.char_length(pg_catalog.btrim(v_activity->>'sport'))
        not between 1 and 80
      or pg_catalog.jsonb_typeof(v_activity->'rationale') <> 'string'
      or pg_catalog.char_length(pg_catalog.btrim(v_activity->>'rationale'))
        not between 1 and 300
      or (
        coalesce(pg_catalog.jsonb_typeof(v_activity->'instructions'), 'null')
          <> 'null'
        and (
          pg_catalog.jsonb_typeof(v_activity->'instructions') <> 'string'
          or pg_catalog.char_length(pg_catalog.btrim(v_activity->>'instructions'))
            not between 1 and 500
        )
      )
    then
      return false;
    end if;

    v_mode := v_activity->>'measurementMode';
    if v_mode is null or v_mode not in (
      'unmeasured', 'sets_reps_load', 'time_distance_pace',
      'duration_intensity', 'skill_repetitions', 'custom'
    ) then
      return false;
    end if;

    if coalesce(pg_catalog.jsonb_typeof(v_activity->'target'), 'null') = 'null'
    then
      null;
    elsif v_mode = 'unmeasured'
      or not public.is_valid_training_measurement(v_mode, v_activity->'target')
    then
      return false;
    end if;

    if coalesce(pg_catalog.jsonb_typeof(v_activity->'personalActivityId'), 'null')
      <> 'null'
    then
      v_link := v_activity->>'personalActivityId';
      if not exists (
        select 1
        from public.personal_activities activity
        where activity.id = v_link::uuid
          and activity.user_id = p_user_id
          and activity.measurement_mode = v_mode
      ) then
        return false;
      end if;
    end if;
  end loop;

  return true;
exception
  when others then
    -- A malformed uuid or number cast is invalid content, not a server error.
    return false;
end;
$$;

revoke all privileges on function public.session_activities_content_is_valid(
  jsonb, uuid
) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Claim the provider attempt.
-- ---------------------------------------------------------------------------
--
-- ADR-015's shape: the claim is durable and taken before the coach is called,
-- so two instances carrying the same key cannot both call out. Only the caller
-- whose insert opened the attempt is told 'claimed'.
--
-- The session must be the caller's, active, and not already past. The day of
-- slack against UTC today is the plan's: an owner's local today can be a day
-- either side of the server's, and the exact past-date rule is enforced where
-- it belongs, in `apply_rolling_plan_change_set`, when the list is saved.
create function public.begin_session_activity_generation(
  p_idempotency_key text,
  p_request_fingerprint text,
  p_session_id uuid,
  p_expected_plan_revision bigint,
  p_note text default null
)
returns public.plan_generation_receipt
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_existing public.session_activity_requests;
  v_session public.rolling_plan_sessions;
  v_note text;
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
    or p_session_id is null
    or p_expected_plan_revision is null
    or p_expected_plan_revision < 0
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid session activity request.';
  end if;

  v_note := public.roadmap_normalize_owner_text(p_note);
  if v_note = '' then v_note := null; end if;
  if v_note is not null and pg_catalog.char_length(v_note) > 500 then
    raise exception using
      errcode = '22023',
      message = 'Invalid session activity request.';
  end if;

  -- Replay first, so a repeated request for a session that has since been
  -- deleted or passed still answers with what it already did.
  select * into v_existing
  from public.session_activity_requests
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

  select * into v_session
  from public.rolling_plan_sessions
  where id = p_session_id and user_id = v_user_id;

  -- Another owner's session and no session at all are the same answer.
  if not found or v_session.status <> 'active' then
    raise exception using
      errcode = 'PT409',
      message = 'That session is no longer available.';
  end if;

  if v_session.local_date < (v_now at time zone 'utc')::date - 1 then
    raise exception using
      errcode = 'PT422',
      message = 'That session is already in the past.';
  end if;

  perform pg_catalog.set_config('lock_timeout', '3s', true);
  begin
    perform pg_catalog.pg_advisory_xact_lock(
      62009,
      pg_catalog.hashtext(v_user_id::text)
    );
  exception
    when lock_not_available then
      raise exception using
        errcode = 'PT409',
        message = 'Your plan changed. Reload and try again.';
  end;

  begin
    insert into public.session_activity_requests (
      user_id, idempotency_key, request_fingerprint, session_id, local_date,
      expected_plan_revision, note_hash, created_at, updated_at
    ) values (
      v_user_id, p_idempotency_key, p_request_fingerprint, v_session.id,
      v_session.local_date, p_expected_plan_revision,
      public.roadmap_owner_text_hash(v_note), v_now, v_now
    )
    returning id, completion_token, 'claimed', proposal_id into v_receipt;
  exception
    when unique_violation then
      -- The race loser: answered exactly as a sequential replay would be.
      select * into v_existing
      from public.session_activity_requests
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
$$;

-- ---------------------------------------------------------------------------
-- 6. Close the attempt with a proposal or a failure.
-- ---------------------------------------------------------------------------
create function public.finish_session_activity_generation(
  p_completion_token uuid,
  p_outcome text,
  p_schema_version text default null,
  p_prompt_version text default null,
  p_provider_code text default null,
  p_model_code text default null,
  p_rate_card_version text default null,
  p_spend_reservation_id uuid default null,
  p_note text default null,
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
  v_request public.session_activity_requests;
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
      message = 'Invalid session activity result.';
  end if;

  perform pg_catalog.set_config('lock_timeout', '3s', true);
  begin
    perform pg_catalog.pg_advisory_xact_lock(
      62009,
      pg_catalog.hashtext(v_user_id::text)
    );
  exception
    when lock_not_available then
      raise exception using
        errcode = 'PT409',
        message = 'Your plan changed. Reload and try again.';
  end;

  select * into v_request
  from public.session_activity_requests
  where user_id = v_user_id and completion_token = p_completion_token
  for update;

  if not found then
    raise exception using
      errcode = 'PT409',
      message = 'That coaching request is no longer open.';
  end if;

  -- Replay: the same outcome returns what was recorded; a different one
  -- conflicts. A second call never overwrites the first one's result.
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
        message = 'Invalid session activity result.';
    end if;
    update public.session_activity_requests
    set status = 'failed', failure_code = p_safe_failure_code, updated_at = v_now
    where id = v_request.id and user_id = v_user_id;
    return ('failed', null)::public.plan_generation_result;
  end if;

  -- The note travels again on finish, and its hash proves it is the text the
  -- claim was made for.
  v_note := public.roadmap_normalize_owner_text(p_note);
  if v_note = '' then v_note := null; end if;
  if public.roadmap_owner_text_hash(v_note) is distinct from v_request.note_hash
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid session activity result.';
  end if;

  if p_schema_version is distinct from 'fittip.session-activities.v1'
    or p_prompt_version is null
    or p_provider_code is null
    or p_model_code is null
    or p_rate_card_version is null
    or not public.session_activities_content_is_valid(p_content, v_user_id)
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid session activity result.';
  end if;

  -- An approved pairing, with a reservation exactly when it is live: what the
  -- owner-facing "example" label rests on. The function names no operation.
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

  -- ADR-019: settled here, in the transaction that records the proposal, at
  -- the amount it was holding if the application's settle did not arrive. It
  -- must be this owner's, for this operation, priced by the same rate card.
  if p_spend_reservation_id is not null then
    update public.ai_spend_reservations
    set
      charged_micro_usd = reserved_micro_usd,
      settled_at = pg_catalog.now()
    where id = p_spend_reservation_id
      and user_id = v_user_id
      and operation = 'fill_session_activities'
      and rate_card_version = p_rate_card_version
      and settled_at is null;

    if not exists (
      select 1
      from public.ai_spend_reservations
      where id = p_spend_reservation_id
        and user_id = v_user_id
        and operation = 'fill_session_activities'
        and settled_at is not null
        and rate_card_version = p_rate_card_version
    ) then
      raise exception using
        errcode = '22023',
        message = 'Invalid session activity result.';
    end if;
  end if;

  insert into public.session_activity_proposals (
    user_id, request_id, session_id, local_date, note, schema_version,
    prompt_version, provider_code, model_code, rate_card_version,
    spend_reservation_id, content, created_at
  ) values (
    v_user_id, v_request.id, v_request.session_id, v_request.local_date,
    v_note, p_schema_version, p_prompt_version, p_provider_code, p_model_code,
    p_rate_card_version, p_spend_reservation_id, p_content, v_now
  )
  returning id into v_proposal_id;

  if p_sources is not null then
    if pg_catalog.jsonb_typeof(p_sources) <> 'array'
      or pg_catalog.jsonb_array_length(p_sources) > 256
    then
      raise exception using
        errcode = '22023',
        message = 'Invalid session activity result.';
    end if;
    for v_source in select value from pg_catalog.jsonb_array_elements(p_sources)
    loop
      v_kind := v_source->>'kind';
      if v_kind is null or v_kind not in (
        'goal', 'memory', 'completion',
        'plan_session', 'personal_activity', 'saved_session'
      ) then
        raise exception using
          errcode = '22023',
          message = 'Invalid session activity result.';
      end if;
      begin
        v_record := (v_source->>'recordId')::uuid;
      exception when others then
        raise exception using
          errcode = '22023',
          message = 'Invalid session activity result.';
      end;
      insert into public.session_activity_proposal_sources (
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

  update public.session_activity_requests
  set status = 'completed', proposal_id = v_proposal_id, updated_at = v_now
  where id = v_request.id and user_id = v_user_id;

  return ('completed', v_proposal_id)::public.plan_generation_result;
exception
  when check_violation or invalid_datetime_format or invalid_text_representation then
    raise exception using
      errcode = '22023',
      message = 'Invalid session activity result.';
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. The owner's decision.
-- ---------------------------------------------------------------------------
--
-- Final once written. The same decision again returns it, so a retried Save or
-- Dismiss is harmless; the other decision is refused with `PT433`, the plan
-- review's "already finished" code.
create function public.decide_session_activity_proposal(
  p_proposal_id uuid,
  p_decision text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_existing text;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'An authenticated FitTip user is required.';
  end if;

  if p_proposal_id is null
    or p_decision is null
    or p_decision not in ('accepted', 'dismissed')
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid session activity decision.';
  end if;

  if not exists (
    select 1
    from public.session_activity_proposals
    where id = p_proposal_id and user_id = v_user_id
  ) then
    raise exception using
      errcode = 'PT409',
      message = 'That proposal is no longer available.';
  end if;

  insert into public.session_activity_decisions (proposal_id, user_id, decision)
  values (p_proposal_id, v_user_id, p_decision)
  on conflict (proposal_id) do nothing;

  select decision into v_existing
  from public.session_activity_decisions
  where proposal_id = p_proposal_id and user_id = v_user_id;

  if v_existing is distinct from p_decision then
    raise exception using
      errcode = 'PT433',
      message = 'That proposal is already decided.';
  end if;

  return v_existing;
end;
$$;

revoke all privileges on function public.begin_session_activity_generation(
  text, text, uuid, bigint, text
) from public, anon, authenticated, service_role;
grant execute on function public.begin_session_activity_generation(
  text, text, uuid, bigint, text
) to authenticated;

revoke all privileges on function public.finish_session_activity_generation(
  uuid, text, text, text, text, text, text, uuid, text, jsonb, jsonb, text
) from public, anon, authenticated, service_role;
grant execute on function public.finish_session_activity_generation(
  uuid, text, text, text, text, text, text, uuid, text, jsonb, jsonb, text
) to authenticated;

revoke all privileges on function public.decide_session_activity_proposal(
  uuid, text
) from public, anon, authenticated, service_role;
grant execute on function public.decide_session_activity_proposal(
  uuid, text
) to authenticated;
