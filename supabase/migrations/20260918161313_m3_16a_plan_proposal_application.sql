-- M3-16A: plan proposal application.
--
-- M3-11 dropped `plan_generation_requests`, `plan_proposals`,
-- `plan_proposal_sources` and `plan_proposal_decisions` together with their
-- five functions, so this is not M3-15F's re-grant of a surviving boundary. It
-- is the same product shape built again against the rolling plan, and it
-- differs from what was dropped in two ways that matter.
--
-- First, a proposal now has *items*. The dropped schema recorded one terminal
-- decision per proposal because there was nothing to decide item by item; the
-- approved F-005 behaviour is per-session choices, so the sessions the coach
-- proposed are rows with stable identity rather than offsets into a jsonb
-- array. Each item carries the session id it will own if it is ever applied,
-- allocated here rather than at apply time: a caller-supplied id is what makes
-- `apply_rolling_plan_change_set` idempotent, and an id fixed at proposal time
-- means a retried finish cannot insert the same session twice under two ids.
--
-- Second, the finish does not write plan rows. It assembles a change set and
-- calls `apply_rolling_plan_change_set`, the function every other plan write
-- already goes through. Reimplementing the insert here would mean a second copy
-- of the revision check, the advisory lock, the session validator and the
-- change-entry history, and two copies of that is two ways for the plan's write
-- rules to drift. Nesting one `security definer` function inside another is
-- safe precisely because neither takes an owner id: both read `auth.uid()`,
-- which is a transaction-scoped claim the nesting does not change.
--
-- What this migration deliberately does not add: memory candidates. The roadmap
-- records them and the plan's `record_plan_memory_candidates` was dropped with
-- the rest. Rebuilding it here would be a second privileged boundary in a
-- migration that already has five, and a plan proposal that proposes no memory
-- item is honest rather than wrong. It is a follow-up line, not an omission
-- being hidden.

-- ---------------------------------------------------------------------------
-- Receipt types.
-- ---------------------------------------------------------------------------

-- `state` is the discriminator the generation path turns on: only 'claimed'
-- authorizes a provider call, and it is returned to exactly one caller.
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

-- `applied_count` is the number of staged items that entered the plan — sessions
-- and recovery-day labels alike — and not the number of items decided: a finish
-- where every item was rejected is a legitimate finish that writes nothing, and
-- `change_set_id` is null there.
create type public.plan_review_receipt as (
  proposal_id uuid,
  decision text,
  applied_count smallint,
  change_set_id uuid,
  plan_revision bigint,
  state text
);

-- ---------------------------------------------------------------------------
-- Tables.
-- ---------------------------------------------------------------------------

-- The attempt. One row per claimed generation, and the completion token is the
-- capability that permits closing it.
--
-- `expected_plan_revision` is recorded because it is what the proposal was
-- composed against. It is not what the finish revalidates — the owner may edit
-- their plan while reviewing, and refusing the finish for that would be hostile
-- — but it is what lets 16B say honestly that the context has moved.
create table public.plan_generation_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  completion_token uuid not null default gen_random_uuid(),
  idempotency_key text not null,
  request_fingerprint text not null,
  requested_start_date date not null,
  requested_end_date date not null,
  day_count smallint not null,
  expected_plan_revision bigint not null,
  planning_note_hash text,
  status text not null default 'pending',
  proposal_id uuid,
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plan_generation_requests_owner_fkey
    foreign key (user_id) references public.profiles (user_id) on delete cascade,
  constraint plan_generation_requests_owner_key unique (id, user_id),
  constraint plan_generation_requests_key_key unique (user_id, idempotency_key),
  constraint plan_generation_requests_token_key unique (user_id, completion_token),
  constraint plan_generation_requests_key_check
    check (char_length(idempotency_key) between 16 and 128),
  constraint plan_generation_requests_fingerprint_check
    check (char_length(request_fingerprint) between 16 and 256),
  constraint plan_generation_requests_status_check
    check (status in ('pending', 'completed', 'failed')),
  -- One to seven consecutive owner-local dates, inclusive. A one-day horizon is
  -- valid and is the case an `end > start` bound would have silently excluded.
  constraint plan_generation_requests_day_count_check check (day_count between 1 and 7),
  constraint plan_generation_requests_horizon_check
    check (requested_end_date = requested_start_date + (day_count - 1)),
  constraint plan_generation_requests_revision_check check (expected_plan_revision >= 0),
  constraint plan_generation_requests_note_hash_check
    check (planning_note_hash is null or char_length(planning_note_hash) = 64),
  constraint plan_generation_requests_failure_code_check
    check (failure_code is null or failure_code ~ '^[a-z][a-z0-9_]{1,63}$'),
  -- Terminal state and its evidence move together.
  constraint plan_generation_requests_terminal_check check (
    (status = 'pending' and proposal_id is null and failure_code is null)
    or (status = 'completed' and proposal_id is not null and failure_code is null)
    or (status = 'failed' and proposal_id is null and failure_code is not null)
  )
);

-- Immutable proposal content. Nothing updates a row in this table, and applying
-- a proposal does not change it: a plan and the proposal it came from are
-- separate permanent records.
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
    foreign key (user_id) references public.profiles (user_id) on delete cascade,
  constraint plan_proposals_owner_key unique (id, user_id),
  constraint plan_proposals_request_fkey
    foreign key (generation_request_id, user_id)
    references public.plan_generation_requests (id, user_id) on delete cascade,
  constraint plan_proposals_spend_fkey
    foreign key (spend_reservation_id)
    references public.ai_spend_reservations (id) on delete set null,
  -- Regeneration is a non-goal of M3-16, so there is one origin. The column
  -- exists so that adding one later is a check-constraint change rather than a
  -- table reshape.
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

-- One row per thing the owner decides, derived from validated content by
-- `finish_plan_generation` and never written by a caller.
--
-- Two kinds, because the approved behaviour is per-session *and* recovery-day
-- choices. A session item is a session the coach proposed. A recovery-day item
-- is a date in the horizon the coach left empty: `fittip.seven-day-plan.v2` has
-- no rest field, and the coach's own week description calls those days planned
-- rest rather than leftovers, so the proposal offers them as a label the owner
-- can accept. Nothing about a recovery-day item is coach-authored text — it has
-- no rationale, and the surface supplies its own words for it.
--
-- `session_id` is the id a session item will own in the plan if it is applied.
-- It is allocated now, and it is unique across the table, so two finishes of the
-- same proposal cannot produce two sessions for one proposed item — the second
-- `add` is refused by `rolling_plan_sessions`' own primary key before it can.
--
-- `content_index` is the item's index into `content -> 'sessions'`, so a surface
-- that wants the parts of a proposed session this table does not carry — its
-- focus, its alternatives, the goals it serves — reads them from the immutable
-- content rather than from a second copy that could disagree with it.
create table public.plan_proposal_items (
  proposal_id uuid not null,
  ordinal smallint not null,
  user_id uuid not null,
  kind text not null,
  content_index smallint,
  session_id uuid,
  local_date date not null,
  title text,
  sport text,
  intent text,
  expected_duration_minutes integer,
  rationale text,
  constraint plan_proposal_items_pkey primary key (proposal_id, ordinal),
  constraint plan_proposal_items_session_key unique (session_id),
  constraint plan_proposal_items_content_key unique (proposal_id, content_index),
  constraint plan_proposal_items_owner_fkey
    foreign key (user_id) references public.profiles (user_id) on delete cascade,
  constraint plan_proposal_items_proposal_fkey
    foreign key (proposal_id, user_id)
    references public.plan_proposals (id, user_id) on delete cascade,
  constraint plan_proposal_items_kind_check check (kind in ('session', 'recovery_day')),
  constraint plan_proposal_items_ordinal_check check (ordinal between 0 and 27),
  constraint plan_proposal_items_content_index_check
    check (content_index is null or content_index between 0 and 20),
  constraint plan_proposal_items_title_check
    check (title is null or char_length(trim(title)) between 1 and 120),
  constraint plan_proposal_items_sport_check
    check (sport is null or char_length(trim(sport)) between 1 and 80),
  constraint plan_proposal_items_intent_check
    check (intent is null or char_length(intent) <= 500),
  constraint plan_proposal_items_duration_check
    check (expected_duration_minutes is null
      or expected_duration_minutes between 1 and 10080),
  constraint plan_proposal_items_rationale_check
    check (rationale is null or char_length(trim(rationale)) between 1 and 300),
  -- Each kind carries exactly its own fields. A recovery-day item with a title
  -- or a rationale would be this table inventing coaching text, and a session
  -- item without a session id could never be applied.
  constraint plan_proposal_items_shape_check check (
    (kind = 'session'
      and session_id is not null and content_index is not null
      and title is not null and sport is not null
      and expected_duration_minutes is not null and rationale is not null)
    or (kind = 'recovery_day'
      and session_id is null and content_index is null
      and title is null and sport is null and intent is null
      and expected_duration_minutes is null and rationale is null)
  )
);

-- At most one recovery-day item per date. A session item has no such bound: the
-- coach may propose up to three sessions on one date.
create unique index plan_proposal_items_recovery_day_key
  on public.plan_proposal_items (proposal_id, local_date)
  where kind = 'recovery_day';

-- Minimized provenance. Ids and revisions only; no copied source content.
create table public.plan_proposal_sources (
  proposal_id uuid not null,
  ordinal smallint not null,
  user_id uuid not null,
  source_kind text not null,
  record_id uuid not null,
  revision_id uuid,
  revision_number bigint,
  constraint plan_proposal_sources_pkey primary key (proposal_id, ordinal),
  constraint plan_proposal_sources_owner_fkey
    foreign key (user_id) references public.profiles (user_id) on delete cascade,
  -- Composite, so a proposal cannot reference a row recorded under another
  -- owner even if a caller supplied one.
  constraint plan_proposal_sources_proposal_fkey
    foreign key (proposal_id, user_id)
    references public.plan_proposals (id, user_id) on delete cascade,
  constraint plan_proposal_sources_kind_check
    check (source_kind in ('goal', 'memory', 'plan_session', 'completion')),
  constraint plan_proposal_sources_ordinal_check check (ordinal between 0 and 255),
  constraint plan_proposal_sources_revision_check
    check (revision_number is null or revision_number >= 0)
);

-- The owner's choice for one item. No row means 'Proposed': an undecided item
-- is the absence of a decision rather than a stored value, so "every item is
-- resolved" is a count the database can check rather than a state the surface
-- claims.
create table public.plan_proposal_item_decisions (
  proposal_id uuid not null,
  ordinal smallint not null,
  user_id uuid not null,
  decision text not null,
  decided_at timestamptz not null default now(),
  constraint plan_proposal_item_decisions_pkey primary key (proposal_id, ordinal),
  constraint plan_proposal_item_decisions_owner_fkey
    foreign key (user_id) references public.profiles (user_id) on delete cascade,
  constraint plan_proposal_item_decisions_item_fkey
    foreign key (proposal_id, ordinal)
    references public.plan_proposal_items (proposal_id, ordinal) on delete cascade,
  constraint plan_proposal_item_decisions_owner_item_fkey
    foreign key (proposal_id, user_id)
    references public.plan_proposals (id, user_id) on delete cascade,
  constraint plan_proposal_item_decisions_decision_check
    check (decision in ('staged', 'rejected'))
);

-- Append-only, one terminal row per proposal. Reaching it closes the review: no
-- further item decision is accepted, and a repeated finish replays this row
-- rather than writing the plan a second time.
create table public.plan_proposal_decisions (
  proposal_id uuid primary key,
  user_id uuid not null,
  decision text not null,
  applied_count smallint not null default 0,
  change_set_id uuid,
  plan_revision bigint,
  decided_at timestamptz not null default now(),
  constraint plan_proposal_decisions_owner_fkey
    foreign key (user_id) references public.profiles (user_id) on delete cascade,
  constraint plan_proposal_decisions_owner_key unique (proposal_id, user_id),
  constraint plan_proposal_decisions_proposal_fkey
    foreign key (proposal_id, user_id)
    references public.plan_proposals (id, user_id) on delete cascade,
  constraint plan_proposal_decisions_change_set_fkey
    foreign key (change_set_id, user_id)
    references public.rolling_plan_change_sets (id, user_id) on delete restrict,
  constraint plan_proposal_decisions_decision_check
    check (decision in ('applied', 'discarded')),
  constraint plan_proposal_decisions_count_check
    check (applied_count between 0 and 28),
  -- A discard never writes the plan, and an apply carries a change set exactly
  -- when it applied something. Both directions, so neither can be claimed
  -- without the other being true.
  constraint plan_proposal_decisions_evidence_check check (
    (decision = 'discarded' and applied_count = 0
      and change_set_id is null and plan_revision is null)
    or (decision = 'applied' and applied_count = 0
      and change_set_id is null and plan_revision is null)
    or (decision = 'applied' and applied_count > 0
      and change_set_id is not null and plan_revision is not null)
  )
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
create index plan_proposal_items_owner_idx
  on public.plan_proposal_items (user_id, proposal_id, local_date, ordinal);
create index plan_proposal_sources_owner_idx
  on public.plan_proposal_sources (user_id, proposal_id);
create index plan_proposal_item_decisions_owner_idx
  on public.plan_proposal_item_decisions (user_id, proposal_id);
create index plan_proposal_decisions_owner_idx
  on public.plan_proposal_decisions (user_id, decided_at desc);
create index plan_proposal_decisions_change_set_idx
  on public.plan_proposal_decisions (change_set_id, user_id)
  where change_set_id is not null;

-- ---------------------------------------------------------------------------
-- Row Level Security, privileges, and policies.
-- ---------------------------------------------------------------------------

alter table public.plan_generation_requests enable row level security;
alter table public.plan_proposals enable row level security;
alter table public.plan_proposal_items enable row level security;
alter table public.plan_proposal_sources enable row level security;
alter table public.plan_proposal_item_decisions enable row level security;
alter table public.plan_proposal_decisions enable row level security;

revoke all privileges on table public.plan_generation_requests
  from public, anon, authenticated, service_role;
revoke all privileges on table public.plan_proposals
  from public, anon, authenticated, service_role;
revoke all privileges on table public.plan_proposal_items
  from public, anon, authenticated, service_role;
revoke all privileges on table public.plan_proposal_sources
  from public, anon, authenticated, service_role;
revoke all privileges on table public.plan_proposal_item_decisions
  from public, anon, authenticated, service_role;
revoke all privileges on table public.plan_proposal_decisions
  from public, anon, authenticated, service_role;

-- Column-level SELECT, deliberately, and for the same reason the roadmap's is:
-- `completion_token` is the capability that permits finishing a generation, and
-- an owner who could read it could close their own attempt with content the
-- server never validated.
grant select (
  id,
  user_id,
  idempotency_key,
  request_fingerprint,
  requested_start_date,
  requested_end_date,
  day_count,
  expected_plan_revision,
  planning_note_hash,
  status,
  proposal_id,
  failure_code,
  created_at,
  updated_at
) on table public.plan_generation_requests to authenticated;

grant select on table
  public.plan_proposals,
  public.plan_proposal_items,
  public.plan_proposal_sources,
  public.plan_proposal_item_decisions,
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

create policy plan_proposal_items_owner_select
on public.plan_proposal_items
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy plan_proposal_sources_owner_select
on public.plan_proposal_sources
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy plan_proposal_item_decisions_owner_select
on public.plan_proposal_item_decisions
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy plan_proposal_decisions_owner_select
on public.plan_proposal_decisions
for select
to authenticated
using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Structural bounds on the stored envelope.
-- ---------------------------------------------------------------------------
--
-- The application validates the complete `fittip.seven-day-plan.v2` contract and
-- every business rule before it calls finish. This function is the independent
-- floor: it enforces the sizes, enums, horizon and array bounds needed to keep
-- what is stored safe to read back, so a bug in the application cannot write an
-- unbounded or mis-horizoned envelope into permanent history.
--
-- Two bounds here are the ones M3-03 decision 4 set: at most three sessions on
-- any one date, and at most three times the day count across the horizon. There
-- is no minutes cap and no required rest day, so a horizon with neither is valid
-- and must not be rejected here.
--
-- Note what the key allowlists exclude. No level of this schema admits a weight,
-- a percentage, or an attention share, and the allowlist is what makes that
-- mechanical rather than a rule someone has to remember.
--
-- This is M3-03's `plan_content_is_valid`, which M3-11 dropped, restored
-- unchanged against the same unchanged contract version.
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

-- ---------------------------------------------------------------------------
-- Function 1: claim the provider attempt.
-- ---------------------------------------------------------------------------
--
-- ADR-015's shape. The claim is durable and taken before the coach is called,
-- so two serverless instances carrying the same key cannot both call out: only
-- the caller whose insert actually opened the attempt is told 'claimed', and
-- 'claimed' is the only state that authorizes a call.
--
-- The unique-violation branch on the insert is M3-15F's fix to M3-09, applied
-- here at the outset rather than left to be rediscovered. Two simultaneous
-- same-key calls both read "not found" before serializing on the advisory lock;
-- the loser must re-read the winner's now-committed row and replay it, not
-- escape as an unmapped 23505 that the surface reports as a failed generation.
-- That path ends in 'pending', which authorizes nothing.
--
-- `roadmap_normalize_owner_text` and `roadmap_owner_text_hash` are reused rather
-- than duplicated under a plan name. They are general owner-text helpers that
-- happen to carry the prefix of the ticket that introduced them, and a second
-- copy is a second thing that can drift from `normalizeOwnerText`.
create function public.begin_plan_generation(
  p_idempotency_key text,
  p_request_fingerprint text,
  p_start_date date,
  p_day_count integer,
  p_expected_plan_revision bigint,
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
  v_end_date date;
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
      expected_plan_revision, planning_note_hash, created_at, updated_at
    ) values (
      v_user_id, p_idempotency_key, p_request_fingerprint,
      p_start_date, v_end_date, p_day_count::smallint,
      p_expected_plan_revision, public.roadmap_owner_text_hash(v_note),
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
$$;

-- ---------------------------------------------------------------------------
-- Function 2: close the attempt, persist the proposal and its items.
-- ---------------------------------------------------------------------------
--
-- The items are derived here from content this function has just validated,
-- rather than accepted from the caller as a parallel array. A caller that could
-- supply items could supply items that disagree with the content beside them,
-- and then the record of what the coach proposed and the record of what the
-- owner decided on would be two different things.
--
-- Recovery-day items are the horizon's dates that carry no proposed session.
-- They are derived, not authored: nothing in `fittip.seven-day-plan.v2` names a
-- rest day, so an empty date is offered as a label the owner may accept and
-- never as a claim the coach made.
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

  if p_schema_version is null
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

  -- Items, in the order the surface reads them: by date, sessions on a date
  -- before that date's recovery-day label, and proposed sessions in the order
  -- the coach listed them. `ordinal` is the owner's stable handle on a choice;
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
        or v_kind not in ('goal', 'memory', 'plan_session', 'completion')
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
$$;

-- ---------------------------------------------------------------------------
-- Function 3: decide one item.
-- ---------------------------------------------------------------------------
--
-- Idempotent by construction: a decision is a value the owner sets, not an
-- event they append, so repeating it is not a second act. Clearing one back to
-- Proposed is deleting the row rather than storing a third value, which is what
-- keeps "every item is resolved" a count instead of a comparison.
--
-- A closed proposal accepts no further decision. Once the review is finished the
-- choices that produced it are the record of what the owner decided, and a later
-- edit to them would describe a plan write that did not happen.
create function public.decide_plan_proposal_item(
  p_proposal_id uuid,
  p_ordinal integer,
  p_decision text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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
    or p_decision not in ('staged', 'rejected', 'proposed')
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

  if exists (
    select 1 from public.plan_proposal_decisions
    where proposal_id = p_proposal_id and user_id = v_user_id
  ) then
    raise exception using
      errcode = 'PT433',
      message = 'That review is already finished.';
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
$$;

-- ---------------------------------------------------------------------------
-- Function 4: finish the review.
-- ---------------------------------------------------------------------------
--
-- One action, one transaction, and one door into the plan. Everything staged
-- enters the plan together or nothing does, and what enters it goes through
-- `apply_rolling_plan_change_set` — the same function the manual editor, the
-- series materializer and the saved-session library already use. That is what
-- keeps the revision check, the idempotency key, the advisory lock, the session
-- validator, the past-date rule, the ten-per-date cap and the change-entry
-- history in one place. This function adds no plan rule of its own and could
-- not weaken one if it tried: it hands over a change set and is bound by the
-- answer.
--
-- Positions are computed per date as one past whatever the date already holds,
-- so a staged session is appended after the owner's existing sessions rather
-- than displacing one. Two staged sessions on the same date keep the order the
-- coach proposed them in.
--
-- A finish that stages nothing is a legitimate finish. It closes the proposal,
-- writes no plan row, and records `applied_count` 0 with no change set, which is
-- exactly what happened.
create function public.finish_plan_proposal_review(
  p_proposal_id uuid,
  p_expected_plan_revision bigint,
  p_idempotency_key uuid
)
returns public.plan_review_receipt
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_existing public.plan_proposal_decisions;
  v_unresolved integer;
  v_changes jsonb;
  v_applied smallint;
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
      item.local_date,
      item.ordinal,
      case item.kind
        when 'recovery_day' then pg_catalog.jsonb_build_object(
          'operation', 'set_recovery_day',
          'localDate', item.local_date::text,
          'isRecoveryDay', true
        )
        else pg_catalog.jsonb_build_object(
          'operation', 'add',
          'sessionId', item.session_id,
          'session', pg_catalog.jsonb_build_object(
            'localDate', item.local_date::text,
            'position', (
              coalesce((
                select pg_catalog.max(existing.position)
                from public.rolling_plan_sessions existing
                where existing.user_id = v_user_id
                  and existing.local_date = item.local_date
                  and existing.status = 'active'
              ), -1)
              + pg_catalog.row_number() over (
                  partition by item.local_date order by item.ordinal
                )
            )::smallint,
            'title', item.title,
            'sport', item.sport,
            'intent', item.intent,
            'expectedDurationMinutes', item.expected_duration_minutes,
            'isLocked', false,
            'activities', '[]'::jsonb
          )
        )
      end as entry
    from public.plan_proposal_items item
    join public.plan_proposal_item_decisions decision
      on decision.proposal_id = item.proposal_id
      and decision.ordinal = item.ordinal
      and decision.user_id = item.user_id
    where item.proposal_id = p_proposal_id
      and item.user_id = v_user_id
      and decision.decision = 'staged'
  ) as change;

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
$$;

-- ---------------------------------------------------------------------------
-- Function 5: discard the review.
-- ---------------------------------------------------------------------------
--
-- No plan write, in any branch. The proposal and every choice made against it
-- stay exactly as they are: discarding is deciding not to apply, which is a
-- thing worth having a record of, not a thing that erases one.
create function public.discard_plan_proposal(p_proposal_id uuid)
returns public.plan_review_receipt
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing public.plan_proposal_decisions;
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'An authenticated FitTip user is required.';
  end if;

  if p_proposal_id is null then
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

  select * into v_existing
  from public.plan_proposal_decisions
  where proposal_id = p_proposal_id and user_id = v_user_id;
  if found then
    if v_existing.decision <> 'discarded' then
      raise exception using
        errcode = 'PT433',
        message = 'That review is already finished.';
    end if;
    return (
      v_existing.proposal_id, v_existing.decision, v_existing.applied_count,
      v_existing.change_set_id, v_existing.plan_revision, 'replayed'
    )::public.plan_review_receipt;
  end if;

  insert into public.plan_proposal_decisions (
    proposal_id, user_id, decision, applied_count, decided_at
  ) values (
    p_proposal_id, v_user_id, 'discarded', 0, pg_catalog.clock_timestamp()
  );

  return (p_proposal_id, 'discarded', 0::smallint, null::uuid, null::bigint, 'discarded')
    ::public.plan_review_receipt;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges. `authenticated` only, and never `public`, `anon` or
-- `service_role`: every one of these derives its owner from `auth.uid()`, so a
-- role that has no owner has nothing it could legitimately do with them.
-- ---------------------------------------------------------------------------

revoke all privileges on function public.begin_plan_generation(
  text, text, date, integer, bigint, text
) from public, anon, authenticated, service_role;
grant execute on function public.begin_plan_generation(
  text, text, date, integer, bigint, text
) to authenticated;

revoke all privileges on function public.finish_plan_generation(
  uuid, text, text, text, text, text, text, uuid, text, jsonb, jsonb, text
) from public, anon, authenticated, service_role;
grant execute on function public.finish_plan_generation(
  uuid, text, text, text, text, text, text, uuid, text, jsonb, jsonb, text
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

revoke all privileges on function public.discard_plan_proposal(
  uuid
) from public, anon, authenticated, service_role;
grant execute on function public.discard_plan_proposal(
  uuid
) to authenticated;
