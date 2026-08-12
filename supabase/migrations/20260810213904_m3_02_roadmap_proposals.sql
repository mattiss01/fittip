-- M3-02 / ADR-015: roadmap proposal and acceptance transactions.
--
-- Six owner-owned tables and five narrowly granted SECURITY DEFINER functions.
-- Every function derives the owner from auth.uid(), takes no owner identifier,
-- sets search_path = '', uses schema-qualified names, bounds every lock wait to
-- three seconds, and returns content-free receipts. No function makes a
-- provider call: the provider call happens between function 1 and function 2,
-- outside any transaction, because an external call cannot be made atomic with
-- Postgres and holding locks across an external deadline is how a lock becomes
-- an outage.
--
-- The durable pre-call claim in function 1 is the part a unique proposal row
-- cannot replace. A unique row prevents two proposals; it does not prevent two
-- serverless instances both calling the provider before either tries to insert.

create type public.roadmap_generation_receipt as (
  generation_id uuid,
  completion_token uuid,
  state text,
  regeneration_number integer,
  proposal_id uuid
);

create type public.roadmap_generation_result as (
  state text,
  proposal_id uuid
);

create type public.roadmap_memory_candidate_receipt as (
  collection_revision bigint,
  item_ids uuid[]
);

create type public.roadmap_proposal_change_receipt as (
  proposal_id uuid,
  result text
);

create type public.roadmap_acceptance_receipt as (
  proposal_id uuid,
  version_id uuid,
  head_revision bigint,
  result text
);

-- The durable pre-call idempotency record.
--
-- Owner text is held here as a bounded hash only. The note and the feedback
-- travel to the provider and are stored on the proposal that results; a pending
-- or failed attempt keeps only enough to prove that the text finish is given is
-- the text begin claimed, which is what stops a second call substituting
-- different owner content under an already claimed key.
create table public.roadmap_generation_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  completion_token uuid not null default gen_random_uuid(),
  idempotency_key text not null,
  request_fingerprint text not null,
  requested_start_date date not null,
  requested_end_date date not null,
  expected_head_revision bigint not null,
  previous_proposal_id uuid,
  regeneration_number integer not null default 0,
  planning_note_hash text,
  regeneration_feedback_hash text,
  status text not null default 'pending',
  proposal_id uuid,
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint roadmap_generation_requests_owner_fkey
    foreign key (user_id)
    references public.profiles (user_id)
    on delete cascade,
  constraint roadmap_generation_requests_owner_key unique (id, user_id),
  constraint roadmap_generation_requests_key_key
    unique (user_id, idempotency_key),
  constraint roadmap_generation_requests_key_check
    check (char_length(idempotency_key) between 16 and 128),
  constraint roadmap_generation_requests_fingerprint_check
    check (char_length(request_fingerprint) between 16 and 256),
  constraint roadmap_generation_requests_status_check
    check (status in ('pending', 'completed', 'failed')),
  -- Decision 1: at least 4 weeks and at most 52, never starting in the past
  -- relative to the request the server derived.
  constraint roadmap_generation_requests_horizon_check
    check (
      requested_end_date >= requested_start_date + 27
      and requested_end_date <= requested_start_date + 365
    ),
  constraint roadmap_generation_requests_regeneration_check
    check (regeneration_number between 0 and 3),
  -- An initial request has no predecessor and no feedback; a regeneration has
  -- both. The table refuses the mixed shape rather than trusting the caller.
  constraint roadmap_generation_requests_lineage_check
    check (
      (
        regeneration_number = 0
        and previous_proposal_id is null
        and regeneration_feedback_hash is null
      )
      or (
        regeneration_number > 0
        and previous_proposal_id is not null
        and regeneration_feedback_hash is not null
      )
    ),
  constraint roadmap_generation_requests_note_hash_check
    check (planning_note_hash is null or char_length(planning_note_hash) = 64),
  constraint roadmap_generation_requests_feedback_hash_check
    check (
      regeneration_feedback_hash is null
      or char_length(regeneration_feedback_hash) = 64
    ),
  constraint roadmap_generation_requests_failure_code_check
    check (
      failure_code is null
      or failure_code ~ '^[a-z][a-z0-9_]{1,63}$'
    ),
  -- Terminal state and its evidence move together.
  constraint roadmap_generation_requests_terminal_check
    check (
      (status = 'pending' and proposal_id is null and failure_code is null)
      or (status = 'completed' and proposal_id is not null
          and failure_code is null)
      or (status = 'failed' and proposal_id is null
          and failure_code is not null)
    )
);

-- Immutable proposal content. Nothing updates a row in this table: an edit
-- creates a new proposal linked to its source, and a decision is a separate
-- append-only record, so status is never expressed by rewriting content.
create table public.roadmap_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  generation_request_id uuid not null,
  source_proposal_id uuid,
  origin text not null,
  planning_note text,
  regeneration_feedback text,
  schema_version text not null,
  prompt_version text not null,
  provider_code text not null,
  model_code text not null,
  rate_card_version text not null,
  spend_reservation_id uuid,
  content jsonb not null,
  created_at timestamptz not null default now(),
  constraint roadmap_proposals_owner_fkey
    foreign key (user_id)
    references public.profiles (user_id)
    on delete cascade,
  constraint roadmap_proposals_owner_key unique (id, user_id),
  constraint roadmap_proposals_request_fkey
    foreign key (generation_request_id, user_id)
    references public.roadmap_generation_requests (id, user_id)
    on delete cascade,
  constraint roadmap_proposals_source_fkey
    foreign key (source_proposal_id, user_id)
    references public.roadmap_proposals (id, user_id)
    on delete cascade,
  constraint roadmap_proposals_spend_fkey
    foreign key (spend_reservation_id)
    references public.ai_spend_reservations (id)
    on delete set null,
  constraint roadmap_proposals_origin_check
    check (origin in ('ai_initial', 'ai_regeneration', 'owner_edit')),
  -- An initial AI proposal has no source; a regeneration and an edit each link
  -- exactly one immediate source proposal.
  constraint roadmap_proposals_lineage_check
    check (
      (origin = 'ai_initial' and source_proposal_id is null)
      or (origin <> 'ai_initial' and source_proposal_id is not null)
    ),
  constraint roadmap_proposals_note_check
    check (planning_note is null or char_length(planning_note) between 1 and 1000),
  constraint roadmap_proposals_feedback_check
    check (
      regeneration_feedback is null
      or char_length(regeneration_feedback) between 1 and 500
    ),
  constraint roadmap_proposals_schema_check
    check (schema_version = 'fittip.roadmap.v2'),
  constraint roadmap_proposals_prompt_check
    check (char_length(trim(prompt_version)) between 1 and 100),
  constraint roadmap_proposals_provider_check
    check (char_length(trim(provider_code)) between 1 and 64),
  constraint roadmap_proposals_model_check
    check (char_length(trim(model_code)) between 1 and 64),
  constraint roadmap_proposals_rate_card_check
    check (char_length(trim(rate_card_version)) between 1 and 100),
  constraint roadmap_proposals_content_size_check
    check (pg_column_size(content) <= 32768)
);

-- Minimized provenance. Ids and revisions only; no copied source content.
create table public.roadmap_proposal_sources (
  proposal_id uuid not null,
  user_id uuid not null,
  ordinal smallint not null,
  source_kind text not null,
  record_id uuid not null,
  revision_id uuid,
  revision_number bigint,
  constraint roadmap_proposal_sources_pkey primary key (proposal_id, ordinal),
  constraint roadmap_proposal_sources_owner_fkey
    foreign key (user_id)
    references public.profiles (user_id)
    on delete cascade,
  -- Composite, so a proposal cannot reference a row recorded under another
  -- owner even if a caller supplied one.
  constraint roadmap_proposal_sources_proposal_fkey
    foreign key (proposal_id, user_id)
    references public.roadmap_proposals (id, user_id)
    on delete cascade,
  constraint roadmap_proposal_sources_kind_check
    check (source_kind in ('goal', 'memory', 'plan_version', 'completion')),
  constraint roadmap_proposal_sources_ordinal_check
    check (ordinal between 0 and 255),
  constraint roadmap_proposal_sources_revision_check
    check (revision_number is null or revision_number >= 0)
);

-- Append-only. One terminal decision per proposal, enforced by the primary key.
create table public.roadmap_proposal_decisions (
  proposal_id uuid primary key,
  user_id uuid not null,
  decision text not null,
  accepted_version_id uuid,
  decided_at timestamptz not null default now(),
  constraint roadmap_proposal_decisions_owner_fkey
    foreign key (user_id)
    references public.profiles (user_id)
    on delete cascade,
  constraint roadmap_proposal_decisions_owner_key
    unique (proposal_id, user_id),
  constraint roadmap_proposal_decisions_proposal_fkey
    foreign key (proposal_id, user_id)
    references public.roadmap_proposals (id, user_id)
    on delete cascade,
  constraint roadmap_proposal_decisions_decision_check
    check (decision in ('accepted', 'rejected')),
  constraint roadmap_proposal_decisions_version_check
    check (
      (decision = 'accepted' and accepted_version_id is not null)
      or (decision = 'rejected' and accepted_version_id is null)
    )
);

-- Immutable accepted history.
create table public.roadmap_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  version_number bigint not null,
  source_proposal_id uuid not null,
  previous_version_id uuid,
  content jsonb not null,
  accepted_at timestamptz not null default now(),
  constraint roadmap_versions_owner_fkey
    foreign key (user_id)
    references public.profiles (user_id)
    on delete cascade,
  constraint roadmap_versions_owner_key unique (id, user_id),
  constraint roadmap_versions_number_key unique (user_id, version_number),
  -- A proposal can create at most one accepted version.
  constraint roadmap_versions_proposal_key unique (user_id, source_proposal_id),
  constraint roadmap_versions_proposal_fkey
    foreign key (source_proposal_id, user_id)
    references public.roadmap_proposals (id, user_id)
    on delete cascade,
  constraint roadmap_versions_previous_fkey
    foreign key (previous_version_id, user_id)
    references public.roadmap_versions (id, user_id)
    on delete cascade,
  constraint roadmap_versions_number_check check (version_number >= 1),
  constraint roadmap_versions_first_check
    check (
      (version_number = 1 and previous_version_id is null)
      or (version_number > 1 and previous_version_id is not null)
    ),
  constraint roadmap_versions_content_size_check
    check (pg_column_size(content) <= 32768)
);

alter table public.roadmap_proposal_decisions
add constraint roadmap_proposal_decisions_accepted_fkey
  foreign key (accepted_version_id, user_id)
  references public.roadmap_versions (id, user_id)
  on delete cascade
  deferrable initially deferred;

-- The only mutable roadmap pointer in the model.
create table public.roadmap_heads (
  user_id uuid primary key,
  revision bigint not null default 0,
  current_version_id uuid,
  updated_at timestamptz not null default now(),
  constraint roadmap_heads_owner_fkey
    foreign key (user_id)
    references public.profiles (user_id)
    on delete cascade,
  constraint roadmap_heads_current_fkey
    foreign key (current_version_id, user_id)
    references public.roadmap_versions (id, user_id)
    on delete cascade
    deferrable initially deferred,
  constraint roadmap_heads_revision_check check (revision >= 0),
  constraint roadmap_heads_pointer_check
    check ((revision = 0) = (current_version_id is null))
);

create index roadmap_generation_requests_owner_idx
  on public.roadmap_generation_requests (user_id, created_at desc);
create index roadmap_generation_requests_previous_idx
  on public.roadmap_generation_requests (previous_proposal_id, user_id)
  where previous_proposal_id is not null;
create index roadmap_proposals_owner_idx
  on public.roadmap_proposals (user_id, created_at desc);
create index roadmap_proposals_request_idx
  on public.roadmap_proposals (generation_request_id, user_id);
create index roadmap_proposals_source_idx
  on public.roadmap_proposals (source_proposal_id, user_id)
  where source_proposal_id is not null;
create index roadmap_proposals_spend_idx
  on public.roadmap_proposals (spend_reservation_id)
  where spend_reservation_id is not null;
create index roadmap_proposal_sources_owner_idx
  on public.roadmap_proposal_sources (user_id, proposal_id);
create index roadmap_proposal_decisions_owner_idx
  on public.roadmap_proposal_decisions (user_id, decided_at desc);
create index roadmap_proposal_decisions_version_idx
  on public.roadmap_proposal_decisions (accepted_version_id, user_id)
  where accepted_version_id is not null;
create index roadmap_versions_owner_idx
  on public.roadmap_versions (user_id, version_number desc);
create index roadmap_versions_previous_idx
  on public.roadmap_versions (previous_version_id, user_id)
  where previous_version_id is not null;
create index roadmap_heads_current_idx
  on public.roadmap_heads (current_version_id, user_id)
  where current_version_id is not null;

alter table public.roadmap_generation_requests enable row level security;
alter table public.roadmap_proposals enable row level security;
alter table public.roadmap_proposal_sources enable row level security;
alter table public.roadmap_proposal_decisions enable row level security;
alter table public.roadmap_versions enable row level security;
alter table public.roadmap_heads enable row level security;

revoke all privileges on table public.roadmap_generation_requests
  from public, anon, authenticated, service_role;
revoke all privileges on table public.roadmap_proposals
  from public, anon, authenticated, service_role;
revoke all privileges on table public.roadmap_proposal_sources
  from public, anon, authenticated, service_role;
revoke all privileges on table public.roadmap_proposal_decisions
  from public, anon, authenticated, service_role;
revoke all privileges on table public.roadmap_versions
  from public, anon, authenticated, service_role;
revoke all privileges on table public.roadmap_heads
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
  expected_head_revision,
  previous_proposal_id,
  regeneration_number,
  planning_note_hash,
  regeneration_feedback_hash,
  status,
  proposal_id,
  failure_code,
  created_at,
  updated_at
) on table public.roadmap_generation_requests to authenticated;

grant select on table
  public.roadmap_proposals,
  public.roadmap_proposal_sources,
  public.roadmap_proposal_decisions,
  public.roadmap_versions,
  public.roadmap_heads
to authenticated;

create policy roadmap_generation_requests_owner_select
on public.roadmap_generation_requests
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy roadmap_proposals_owner_select
on public.roadmap_proposals
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy roadmap_proposal_sources_owner_select
on public.roadmap_proposal_sources
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy roadmap_proposal_decisions_owner_select
on public.roadmap_proposal_decisions
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy roadmap_versions_owner_select
on public.roadmap_versions
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy roadmap_heads_owner_select
on public.roadmap_heads
for select
to authenticated
using ((select auth.uid()) = user_id);

-- The one normalization the excerpt check depends on. It must match
-- `normalizeOwnerText` in src/server/ai/planning-note.ts exactly, or a memory
-- candidate the application accepted would be rejected here for a reason the
-- owner cannot see. CR and CRLF collapse to LF; the result is NFC; ASCII
-- whitespace is trimmed from both ends.
create function public.roadmap_normalize_owner_text(p_value text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  -- `normalize(text, NFC)` is special grammar, so the form keyword cannot be
  -- reached through a schema-qualified call. pg_catalog is implicitly first in
  -- the search path even when search_path is empty, so the bare name is still
  -- unambiguous.
  select pg_catalog.btrim(
    normalize(
      pg_catalog.replace(
        pg_catalog.replace(p_value, pg_catalog.chr(13) || pg_catalog.chr(10),
          pg_catalog.chr(10)),
        pg_catalog.chr(13),
        pg_catalog.chr(10)
      ),
      NFC
    ),
    concat(
      ' ',
      pg_catalog.chr(9),
      pg_catalog.chr(10),
      pg_catalog.chr(11),
      pg_catalog.chr(12),
      pg_catalog.chr(13)
    )
  );
$$;

create function public.roadmap_owner_text_hash(p_value text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when p_value is null then null
    else pg_catalog.encode(
      extensions.digest(public.roadmap_normalize_owner_text(p_value), 'sha256'),
      'hex'
    )
  end;
$$;

-- Structural bounds on the stored envelope.
--
-- The application validates the complete fittip.roadmap.v2 contract and every
-- business rule before it calls finish. This function is the independent floor:
-- it enforces the sizes, enums, horizon and array bounds needed to keep what is
-- stored safe to read back, so a bug in the application cannot write an
-- unbounded or mis-horizoned envelope into permanent history.
create function public.roadmap_content_is_valid(
  p_content jsonb,
  p_start_date date,
  p_end_date date
)
returns boolean
language plpgsql
-- STABLE rather than IMMUTABLE: a text-to-date cast depends on DateStyle, so
-- the strongest honest volatility class is stable. Declaring immutable would be
-- a claim the planner is entitled to act on.
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
      'phases', 'assumptions', 'uncertainties', 'reviewPoints',
      'safetyConsiderations'
    )
  ) then
    return false;
  end if;

  if p_content->>'schemaVersion' is distinct from 'fittip.roadmap.v2'
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
    if pg_catalog.jsonb_typeof(v_phase->'milestones') <> 'array'
      or pg_catalog.jsonb_array_length(v_phase->'milestones') not between 1 and 3
      or pg_catalog.jsonb_typeof(v_phase->'goalAttention') <> 'array'
      or pg_catalog.jsonb_array_length(v_phase->'goalAttention')
         not between 1 and 4
    then
      return false;
    end if;
    for v_entry in
      select value from pg_catalog.jsonb_array_elements(v_phase->'goalAttention')
    loop
      if v_entry->>'level' not in
        ('primary', 'secondary', 'maintenance', 'deferred')
      then
        return false;
      end if;
    end loop;
  end loop;

  if pg_catalog.jsonb_typeof(p_content->'reviewPoints') <> 'array'
    or pg_catalog.jsonb_array_length(p_content->'reviewPoints') not between 1 and 4
  then
    return false;
  end if;

  if p_content ? 'assumptions' and (
    pg_catalog.jsonb_typeof(p_content->'assumptions') <> 'array'
    or pg_catalog.jsonb_array_length(p_content->'assumptions') > 4
  ) then
    return false;
  end if;

  if p_content ? 'uncertainties' and (
    pg_catalog.jsonb_typeof(p_content->'uncertainties') <> 'array'
    or pg_catalog.jsonb_array_length(p_content->'uncertainties') > 4
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
    -- A malformed date cast is invalid content, not a server error.
    return false;
end;
$$;

-- The accepted provider/model/rate-card triples, in one place.
--
-- M3-01B limitation 17: nothing bound the configured model to the rate card
-- that priced it, so FITTIP_AI_MODEL=gpt-5.5 would have priced every
-- reservation 25x low. The composition root binds them as one value; this is
-- the independent check that the pairing which actually reached the database is
-- one somebody approved. A live result must additionally carry a settled
-- reservation, so a fixture triple cannot be used to record a real call as free.
create function public.roadmap_technical_codes_are_accepted(
  p_provider_code text,
  p_model_code text,
  p_rate_card_version text,
  p_has_spend_reservation boolean
)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select
    (
      p_provider_code = 'openai'
      and p_model_code = 'gpt-5.6-luna'
      and p_rate_card_version = 'openai-gpt-5.6-luna-2026-08-10'
      and p_has_spend_reservation
    )
    or (
      p_provider_code = 'fixture'
      and p_model_code = 'fixture-corpus-v1'
      and p_rate_card_version = 'fixture-no-spend'
      and not p_has_spend_reservation
    );
$$;

revoke all privileges on function public.roadmap_normalize_owner_text(text)
  from public, anon, authenticated, service_role;
revoke all privileges on function public.roadmap_owner_text_hash(text)
  from public, anon, authenticated, service_role;
revoke all privileges on function public.roadmap_content_is_valid(
  jsonb, date, date
) from public, anon, authenticated, service_role;
revoke all privileges on function public.roadmap_technical_codes_are_accepted(
  text, text, text, boolean
) from public, anon, authenticated, service_role;

-- Function 1: claim the provider attempt.
create function public.begin_roadmap_generation(
  p_idempotency_key text,
  p_request_fingerprint text,
  p_start_date date,
  p_end_date date,
  p_expected_head_revision bigint,
  p_planning_note text default null,
  p_previous_proposal_id uuid default null,
  p_regeneration_feedback text default null
)
returns public.roadmap_generation_receipt
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_existing public.roadmap_generation_requests;
  v_head_revision bigint;
  v_note text;
  v_feedback text;
  v_previous public.roadmap_proposals;
  v_previous_request public.roadmap_generation_requests;
  v_regeneration integer := 0;
  v_receipt public.roadmap_generation_receipt;
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
    or p_end_date is null
    or p_expected_head_revision is null
    or p_expected_head_revision < 0
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid roadmap request.';
  end if;

  -- Decision 1: four to fifty-two weeks, and a start no earlier than the day
  -- before UTC today. The single day of slack is deliberate: the owner's local
  -- today can legitimately be one day behind or ahead of the server's.
  if p_start_date < (v_now at time zone 'utc')::date - 1
    or p_end_date < p_start_date + 27
    or p_end_date > p_start_date + 365
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid roadmap request.';
  end if;

  v_note := public.roadmap_normalize_owner_text(p_planning_note);
  if v_note = '' then v_note := null; end if;
  v_feedback := public.roadmap_normalize_owner_text(p_regeneration_feedback);
  if v_feedback = '' then v_feedback := null; end if;

  if v_note is not null and pg_catalog.char_length(v_note) > 1000 then
    raise exception using
      errcode = '22023',
      message = 'Invalid roadmap request.';
  end if;
  if v_feedback is not null and pg_catalog.char_length(v_feedback) > 500 then
    raise exception using
      errcode = '22023',
      message = 'Invalid roadmap request.';
  end if;

  -- Same key, same fingerprint replays the claim, returning the stored status —
  -- pending, completed, or failed — and never 'claimed'. That is the whole
  -- discriminator: only the fresh insert below reports 'claimed', so only the
  -- caller that actually opened the attempt invokes the provider. A different
  -- fingerprint under the same key is a conflict, not a silent second call.
  select * into v_existing
  from public.roadmap_generation_requests
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
      v_existing.regeneration_number,
      v_existing.proposal_id
    )::public.roadmap_generation_receipt;
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

  select coalesce(revision, 0) into v_head_revision
  from public.roadmap_heads
  where user_id = v_user_id;
  v_head_revision := coalesce(v_head_revision, 0);

  if v_head_revision <> p_expected_head_revision then
    raise exception using
      errcode = 'PT409',
      message = 'Your roadmap changed. Reload and try again.';
  end if;

  if p_previous_proposal_id is null then
    -- An initial request carries no feedback at all.
    if v_feedback is not null then
      raise exception using
        errcode = '22023',
        message = 'Invalid roadmap request.';
    end if;
    v_regeneration := 0;
  else
    -- A regeneration needs an owned, rejected immediate predecessor, the same
    -- horizon, and non-empty feedback. The ceiling is enforced here, before any
    -- provider call, because a fourth round must cost nothing.
    if v_feedback is null then
      raise exception using
        errcode = '22023',
        message = 'Invalid roadmap request.';
    end if;

    select * into v_previous
    from public.roadmap_proposals
    where id = p_previous_proposal_id
      and user_id = v_user_id;

    if not found then
      raise exception using
        errcode = 'PT409',
        message = 'That proposal is no longer available.';
    end if;

    if not exists (
      select 1
      from public.roadmap_proposal_decisions
      where proposal_id = v_previous.id
        and user_id = v_user_id
        and decision = 'rejected'
    ) then
      raise exception using
        errcode = 'PT409',
        message = 'Decline that proposal before asking for another.';
    end if;

    select * into v_previous_request
    from public.roadmap_generation_requests
    where id = v_previous.generation_request_id
      and user_id = v_user_id;

    if not found
      or v_previous_request.requested_start_date <> p_start_date
      or v_previous_request.requested_end_date <> p_end_date
    then
      raise exception using
        errcode = '22023',
        message = 'Invalid roadmap request.';
    end if;

    v_regeneration := v_previous_request.regeneration_number + 1;
    if v_regeneration > 3 then
      raise exception using
        errcode = 'PT429',
        message = 'This roadmap has reached its regeneration limit.';
    end if;
  end if;

  insert into public.roadmap_generation_requests (
    user_id,
    idempotency_key,
    request_fingerprint,
    requested_start_date,
    requested_end_date,
    expected_head_revision,
    previous_proposal_id,
    regeneration_number,
    planning_note_hash,
    regeneration_feedback_hash,
    status,
    created_at,
    updated_at
  )
  values (
    v_user_id,
    p_idempotency_key,
    p_request_fingerprint,
    p_start_date,
    p_end_date,
    p_expected_head_revision,
    p_previous_proposal_id,
    v_regeneration,
    public.roadmap_owner_text_hash(v_note),
    public.roadmap_owner_text_hash(v_feedback),
    'pending',
    v_now,
    v_now
  )
  -- The row is stored 'pending'; the receipt reports 'claimed'. Only this path
  -- runs for the caller that won the insert, so 'claimed' is the one state that
  -- authorizes a provider call. A replay above returns the stored 'pending'
  -- instead, and stops.
  returning id, completion_token, 'claimed', regeneration_number, proposal_id
  into v_receipt;

  return v_receipt;
end;
$$;

-- Function 2: finish generation and persist the proposal.
create function public.finish_roadmap_generation(
  p_completion_token uuid,
  p_outcome text,
  p_schema_version text default null,
  p_prompt_version text default null,
  p_provider_code text default null,
  p_model_code text default null,
  p_rate_card_version text default null,
  p_spend_reservation_id uuid default null,
  p_planning_note text default null,
  p_regeneration_feedback text default null,
  p_content jsonb default null,
  p_sources jsonb default null,
  p_safe_failure_code text default null
)
returns public.roadmap_generation_result
language plpgsql
security definer
set search_path = ''
as $$
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

-- Function 3: persist inferred memory candidates independently.
--
-- The only route in FitTip that can create author_class = 'system',
-- provenance = 'inferred_proposed' and status = 'proposed'. It narrowly amends
-- ADR-010's statement that no authenticated path produces inferred provenance:
-- this path can produce proposals only, cannot accept, enable, edit or delete
-- them, and cannot make them eligible coaching context.
create function public.record_roadmap_memory_candidates(
  p_completion_token uuid,
  p_expected_memory_revision bigint,
  p_candidates jsonb
)
returns public.roadmap_memory_candidate_receipt
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_request public.roadmap_generation_requests;
  v_proposal public.roadmap_proposals;
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
  from public.roadmap_generation_requests
  where user_id = v_user_id
    and completion_token = p_completion_token
    and status = 'completed';

  if not found then
    raise exception using
      errcode = 'PT409',
      message = 'That coaching request is no longer open.';
  end if;

  select * into v_proposal
  from public.roadmap_proposals
  where id = v_request.proposal_id
    and user_id = v_user_id;

  if not found or v_proposal.origin = 'owner_edit' then
    raise exception using
      errcode = 'PT409',
      message = 'That coaching request is no longer open.';
  end if;

  -- Text present only in regeneration feedback cannot pass: feedback is a
  -- critique of one rejected proposal, not durable coaching context. With no
  -- planning note there is nothing for a candidate to cite.
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
      and source_reference like 'roadmap-proposal:' || v_proposal.id::text || ':%'
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
      and source_reference like 'roadmap-proposal:' || v_proposal.id::text || ':%';

    return (v_new_revision, v_item_ids)
      ::public.roadmap_memory_candidate_receipt;
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
      'roadmap-proposal:' || v_proposal.id::text || ':' || v_ordinal::text;

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
    ::public.roadmap_memory_candidate_receipt;
end;
$$;

-- Function 4: edit or reject a proposal.
create function public.apply_roadmap_proposal_change(
  p_operation text,
  p_proposal_id uuid,
  p_content jsonb default null
)
returns public.roadmap_proposal_change_receipt
language plpgsql
security definer
set search_path = ''
as $$
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
    v_proposal.schema_version, v_proposal.prompt_version,
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
$$;

-- Function 5: accept a proposal.
create function public.accept_roadmap_proposal(
  p_proposal_id uuid,
  p_expected_head_revision bigint
)
returns public.roadmap_acceptance_receipt
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_proposal public.roadmap_proposals;
  v_decision public.roadmap_proposal_decisions;
  v_head public.roadmap_heads;
  v_head_revision bigint;
  v_current_version_id uuid;
  v_source public.roadmap_proposal_sources;
  v_version_id uuid;
  v_version_number bigint;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'An authenticated FitTip user is required.';
  end if;

  if p_proposal_id is null
    or p_expected_head_revision is null
    or p_expected_head_revision < 0
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid roadmap acceptance.';
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

  -- Replaying acceptance of the same proposal returns its existing version.
  select * into v_decision
  from public.roadmap_proposal_decisions
  where proposal_id = v_proposal.id and user_id = v_user_id;

  if found then
    if v_decision.decision = 'accepted' then
      select revision into v_head_revision
      from public.roadmap_heads
      where user_id = v_user_id;
      return (
        v_proposal.id,
        v_decision.accepted_version_id,
        coalesce(v_head_revision, 0),
        'replayed'
      )::public.roadmap_acceptance_receipt;
    end if;
    raise exception using
      errcode = 'PT409',
      message = 'That proposal has already been decided.';
  end if;

  -- Every stored source must still point at the same current eligible revision.
  -- Unrelated new records create no conflict, because only what actually
  -- travelled is recorded here.
  for v_source in
    select * from public.roadmap_proposal_sources
    where proposal_id = v_proposal.id and user_id = v_user_id
  loop
    if v_source.source_kind = 'goal' then
      if not exists (
        select 1 from public.goals
        where id = v_source.record_id
          and user_id = v_user_id
          and archived_at is null
          and status in ('active', 'achieved')
      ) then
        raise exception using
          errcode = 'PT409',
          message = 'Your goals changed. Review the proposal again.';
      end if;

    elsif v_source.source_kind = 'memory' then
      -- Compared by revision number rather than revision id: the item view the
      -- application reads exposes the number, and the two are equivalent
      -- because memory revisions are append-only and monotonic per item. An
      -- edited or disabled item therefore fails this check, while an unrelated
      -- new memory item does not appear here at all.
      if not exists (
        select 1
        from public.memory_items i
        join public.memory_revisions r
          on r.id = i.current_revision_id and r.user_id = i.user_id
        where i.id = v_source.record_id
          and i.user_id = v_user_id
          and i.status = 'active'
          and r.revision_number = v_source.revision_number
      ) then
        raise exception using
          errcode = 'PT409',
          message = 'Your memory changed. Review the proposal again.';
      end if;

    elsif v_source.source_kind = 'plan_version' then
      if not exists (
        select 1 from public.detailed_plan_heads
        where user_id = v_user_id
          and current_version_id = v_source.record_id
          and revision = v_source.revision_number
      ) then
        raise exception using
          errcode = 'PT409',
          message = 'Your plan changed. Review the proposal again.';
      end if;

    else
      if not exists (
        select 1 from public.completion_heads
        where user_id = v_user_id
          and completion_group_id = v_source.record_id
          and current_completion_id is not distinct from v_source.revision_id
          and revision = v_source.revision_number
      ) then
        raise exception using
          errcode = 'PT409',
          message = 'Your training history changed. Review the proposal again.';
      end if;
    end if;
  end loop;

  select * into v_head
  from public.roadmap_heads
  where user_id = v_user_id
  for update;

  v_head_revision := coalesce(v_head.revision, 0);
  v_current_version_id := v_head.current_version_id;

  if v_head_revision <> p_expected_head_revision then
    raise exception using
      errcode = 'PT409',
      message = 'Your roadmap changed. Review the proposal again.';
  end if;

  v_version_number := v_head_revision + 1;
  v_version_id := gen_random_uuid();

  insert into public.roadmap_versions (
    id, user_id, version_number, source_proposal_id, previous_version_id,
    content, accepted_at
  )
  values (
    v_version_id, v_user_id, v_version_number, v_proposal.id,
    v_current_version_id, v_proposal.content, v_now
  );

  insert into public.roadmap_heads (
    user_id, revision, current_version_id, updated_at
  )
  values (v_user_id, v_version_number, v_version_id, v_now)
  on conflict (user_id)
  do update set
    revision = excluded.revision,
    current_version_id = excluded.current_version_id,
    updated_at = excluded.updated_at;

  insert into public.roadmap_proposal_decisions (
    proposal_id, user_id, decision, accepted_version_id, decided_at
  )
  values (v_proposal.id, v_user_id, 'accepted', v_version_id, v_now);

  return (v_proposal.id, v_version_id, v_version_number, 'accepted')
    ::public.roadmap_acceptance_receipt;
end;
$$;

revoke all privileges on function public.begin_roadmap_generation(
  text, text, date, date, bigint, text, uuid, text
) from public, anon, authenticated, service_role;
grant execute on function public.begin_roadmap_generation(
  text, text, date, date, bigint, text, uuid, text
) to authenticated;

revoke all privileges on function public.finish_roadmap_generation(
  uuid, text, text, text, text, text, text, uuid, text, text, jsonb, jsonb, text
) from public, anon, authenticated, service_role;
grant execute on function public.finish_roadmap_generation(
  uuid, text, text, text, text, text, text, uuid, text, text, jsonb, jsonb, text
) to authenticated;

revoke all privileges on function public.record_roadmap_memory_candidates(
  uuid, bigint, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.record_roadmap_memory_candidates(
  uuid, bigint, jsonb
) to authenticated;

revoke all privileges on function public.apply_roadmap_proposal_change(
  text, uuid, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.apply_roadmap_proposal_change(
  text, uuid, jsonb
) to authenticated;

revoke all privileges on function public.accept_roadmap_proposal(
  uuid, bigint
) from public, anon, authenticated, service_role;
grant execute on function public.accept_roadmap_proposal(
  uuid, bigint
) to authenticated;
