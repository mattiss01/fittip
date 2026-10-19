-- The coach suggests a goal (owner, 19 Oct 2026; ADR-034).
--
-- A plan or roadmap answer may carry one goal suggestion, drawn only from the
-- planning note. It is its own record, never a goal: the coach writes no
-- user data. The owner accepts it as Core or Supporting, which creates the
-- goal through the existing `apply_goal_change`, so the three-core rule,
-- ranks and the goal collection revision are enforced exactly where they
-- always were; or rejects it.
--
--   * `goal_suggestions`: owner-select only, written by the three functions
--     below and nothing else.
--   * `record_plan_goal_suggestion`, `record_roadmap_goal_suggestion`: called
--     with the completion token after a proposal is recorded, as the memory
--     candidates are. A planning note is required; one per proposal; a
--     replay returns the existing row.
--   * `decide_goal_suggestion`: Accept (with a tier) or Reject.
--   * `reserve_ai_spend`: the per-request ceiling 8,000 -> 9,000 micro-USD,
--     so the input ceiling can rise 18,000 -> 20,000 tokens for the prompt
--     room the suggestion needs (owner). Re-emitted from its live body with
--     only that constant changed.
--
-- Nothing destructive.

create table public.goal_suggestions (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  -- `plan-proposal:<id>` or `roadmap-proposal:<id>`, the convention the
  -- memory candidates use. Not a foreign key: two proposal tables.
  source_reference text not null,
  title text not null,
  desired_outcome text not null,
  sports text[] not null,
  target_date date,
  status text not null default 'proposed',
  goal_id uuid,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  constraint goal_suggestions_pkey primary key (id),
  constraint goal_suggestions_owner_key unique (id, user_id),
  -- One suggestion per proposal.
  constraint goal_suggestions_source_key unique (user_id, source_reference),
  constraint goal_suggestions_owner_fkey
    foreign key (user_id) references public.profiles (user_id) on delete cascade,
  constraint goal_suggestions_goal_fkey
    foreign key (goal_id, user_id) references public.goals (id, user_id)
    on delete set null (goal_id),
  constraint goal_suggestions_source_check check (
    source_reference ~ '^(plan|roadmap)-proposal:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  -- The bounds a goal holds (`goals`), so an accepted one always fits.
  constraint goal_suggestions_title_check check (
    title = pg_catalog.btrim(title) and char_length(title) between 1 and 120
  ),
  constraint goal_suggestions_desired_outcome_check check (
    desired_outcome = pg_catalog.btrim(desired_outcome)
    and char_length(desired_outcome) between 1 and 1000
  ),
  constraint goal_suggestions_sports_check check (
    cardinality(sports) between 1 and 10
    and array_position(sports, null::text) is null
    and char_length(array_to_string(sports, '')) <= 600
  ),
  constraint goal_suggestions_status_check
    check (status in ('proposed', 'accepted', 'rejected')),
  constraint goal_suggestions_decided_check check (
    (status = 'proposed') = (decided_at is null)
    and (goal_id is null or status = 'accepted')
  )
);

create index goal_suggestions_owner_status_idx
  on public.goal_suggestions (user_id, status, created_at);
create index goal_suggestions_goal_idx
  on public.goal_suggestions (goal_id, user_id);

alter table public.goal_suggestions enable row level security;

revoke all privileges on table public.goal_suggestions
from public, anon, authenticated, service_role;

grant select on table public.goal_suggestions to authenticated;

create policy goal_suggestions_owner_select
on public.goal_suggestions
for select
to authenticated
using ((select auth.uid()) = user_id);

-- The suggestion's fields, checked and cleaned. Shared by both record
-- functions; refuses anything but the four keys and the goal bounds.
create function public.goal_suggestion_fields_are_valid(
  p_suggestion jsonb,
  p_today date
)
returns boolean
language plpgsql
stable
set search_path to ''
as $function$
declare
  v_sport jsonb;
  v_seen text[] := array[]::text[];
  v_clean text;
begin
  if p_suggestion is null
    or pg_catalog.jsonb_typeof(p_suggestion) <> 'object'
    or exists (
      select 1 from pg_catalog.jsonb_object_keys(p_suggestion) as key
      where key not in ('title', 'desiredOutcome', 'sports', 'targetDate')
    )
    or pg_catalog.jsonb_typeof(p_suggestion->'title') is distinct from 'string'
    or pg_catalog.char_length(pg_catalog.btrim(p_suggestion->>'title'))
       not between 1 and 120
    or pg_catalog.jsonb_typeof(p_suggestion->'desiredOutcome')
       is distinct from 'string'
    or pg_catalog.char_length(pg_catalog.btrim(p_suggestion->>'desiredOutcome'))
       not between 1 and 1000
    or pg_catalog.jsonb_typeof(p_suggestion->'sports') is distinct from 'array'
    or pg_catalog.jsonb_array_length(p_suggestion->'sports') not between 1 and 10
  then
    return false;
  end if;

  for v_sport in
    select value from pg_catalog.jsonb_array_elements(p_suggestion->'sports')
  loop
    if pg_catalog.jsonb_typeof(v_sport) <> 'string' then
      return false;
    end if;
    v_clean := pg_catalog.btrim(v_sport #>> '{}');
    if pg_catalog.char_length(v_clean) not between 1 and 60
      or pg_catalog.lower(v_clean) = any (v_seen)
    then
      return false;
    end if;
    v_seen := v_seen || pg_catalog.lower(v_clean);
  end loop;

  if p_suggestion ? 'targetDate'
    and pg_catalog.jsonb_typeof(p_suggestion->'targetDate') <> 'null'
  then
    if pg_catalog.jsonb_typeof(p_suggestion->'targetDate') <> 'string'
      or (p_suggestion->>'targetDate')::date::text <> p_suggestion->>'targetDate'
      or (p_suggestion->>'targetDate')::date < p_today
    then
      return false;
    end if;
  end if;

  return true;
exception
  when others then
    return false;
end;
$function$;

revoke all privileges on function public.goal_suggestion_fields_are_valid(jsonb, date)
from public, anon, authenticated, service_role;

-- Records one suggestion against the proposal a completion token names.
create function public.record_goal_suggestion(
  p_source text,
  p_completion_token uuid,
  p_suggestion jsonb
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_proposal_id uuid;
  v_note text;
  v_origin text;
  v_today date;
  v_reference text;
  v_existing uuid;
  v_id uuid;
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'An authenticated FitTip user is required.';
  end if;

  if p_source not in ('plan', 'roadmap') or p_completion_token is null then
    raise exception using
      errcode = '22023',
      message = 'Invalid goal suggestion.';
  end if;

  if p_source = 'plan' then
    select proposal.id, proposal.planning_note, null
    into v_proposal_id, v_note, v_origin
    from public.plan_generation_requests request
    join public.plan_proposals proposal
      on proposal.id = request.proposal_id
      and proposal.user_id = request.user_id
    where request.user_id = v_user_id
      and request.completion_token = p_completion_token
      and request.status = 'completed';
  else
    select proposal.id, proposal.planning_note, proposal.origin
    into v_proposal_id, v_note, v_origin
    from public.roadmap_generation_requests request
    join public.roadmap_proposals proposal
      on proposal.id = request.proposal_id
      and proposal.user_id = request.user_id
    where request.user_id = v_user_id
      and request.completion_token = p_completion_token
      and request.status = 'completed';
  end if;

  if v_proposal_id is null or v_origin is not distinct from 'owner_edit' then
    raise exception using
      errcode = 'PT409',
      message = 'That coaching request is no longer open.';
  end if;

  -- Only from the planning note (owner): without one there is nothing to
  -- draw a suggestion from.
  if v_note is null then
    raise exception using
      errcode = '22023',
      message = 'Invalid goal suggestion.';
  end if;

  v_reference := p_source || '-proposal:' || v_proposal_id::text;

  -- A replay returns the row it made; one per proposal either way.
  select id into v_existing
  from public.goal_suggestions
  where user_id = v_user_id and source_reference = v_reference;
  if found then
    return v_existing;
  end if;

  select coalesce(
    (pg_catalog.timezone(profile.timezone_name, pg_catalog.clock_timestamp()))::date,
    (pg_catalog.clock_timestamp() at time zone 'utc')::date
  )
  into v_today
  from public.profiles profile
  where profile.user_id = v_user_id;

  if not public.goal_suggestion_fields_are_valid(p_suggestion, v_today) then
    raise exception using
      errcode = '22023',
      message = 'Invalid goal suggestion.';
  end if;

  insert into public.goal_suggestions (
    user_id, source_reference, title, desired_outcome, sports, target_date
  ) values (
    v_user_id,
    v_reference,
    pg_catalog.btrim(p_suggestion->>'title'),
    pg_catalog.btrim(p_suggestion->>'desiredOutcome'),
    array(
      select pg_catalog.btrim(sport.value #>> '{}')
      from pg_catalog.jsonb_array_elements(p_suggestion->'sports')
        with ordinality as sport(value, ordinality)
      order by sport.ordinality
    ),
    case
      when pg_catalog.jsonb_typeof(p_suggestion->'targetDate') = 'string'
      then (p_suggestion->>'targetDate')::date
    end
  )
  returning id into v_id;

  return v_id;
end;
$function$;

revoke all privileges on function public.record_goal_suggestion(text, uuid, jsonb)
from public, anon, authenticated, service_role;
grant execute on function public.record_goal_suggestion(text, uuid, jsonb)
to authenticated;

create type public.goal_suggestion_receipt as (
  suggestion_id uuid,
  status text,
  goal_id uuid,
  goal_collection_revision bigint
);

-- Accept (as Core or Supporting) or Reject one open suggestion. Accept creates
-- the goal through `apply_goal_change` in this same transaction, so every
-- goal rule holds and its refusals reach the owner unchanged.
create function public.decide_goal_suggestion(
  p_suggestion_id uuid,
  p_decision text,
  p_priority_tier text default null,
  p_expected_goal_revision bigint default null
)
returns public.goal_suggestion_receipt
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_suggestion public.goal_suggestions;
  v_receipt public.goal_change_receipt;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'An authenticated FitTip user is required.';
  end if;

  if p_suggestion_id is null
    or p_decision is null
    or p_decision not in ('accept', 'reject')
    or (p_decision = 'accept' and (
      p_priority_tier is null
      or p_priority_tier not in ('core', 'supporting')
      or p_expected_goal_revision is null
    ))
    or (p_decision = 'reject' and p_priority_tier is not null)
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid goal suggestion decision.';
  end if;

  select * into v_suggestion
  from public.goal_suggestions
  where id = p_suggestion_id and user_id = v_user_id
  for update;

  if not found or v_suggestion.status <> 'proposed' then
    raise exception using
      errcode = 'PT409',
      message = 'That suggestion is no longer open.';
  end if;

  if p_decision = 'reject' then
    update public.goal_suggestions
    set status = 'rejected', decided_at = v_now
    where id = v_suggestion.id and user_id = v_user_id;
    return (v_suggestion.id, 'rejected', null::uuid, null::bigint)
      ::public.goal_suggestion_receipt;
  end if;

  v_receipt := public.apply_goal_change(
    p_expected_goal_revision, 'create', null,
    v_suggestion.title, v_suggestion.desired_outcome, v_suggestion.sports,
    v_suggestion.target_date, p_priority_tier, null, null
  );

  update public.goal_suggestions
  set status = 'accepted', goal_id = v_receipt.goal_id, decided_at = v_now
  where id = v_suggestion.id and user_id = v_user_id;

  return (
    v_suggestion.id, 'accepted', v_receipt.goal_id,
    v_receipt.collection_revision
  )::public.goal_suggestion_receipt;
end;
$function$;

revoke all privileges on function public.decide_goal_suggestion(uuid, text, text, bigint)
from public, anon, authenticated, service_role;
grant execute on function public.decide_goal_suggestion(uuid, text, text, bigint)
to authenticated;

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
  -- 9,000 since 19 October 2026 (owner, ADR-034): the input ceiling rose to
  -- 20,000 tokens, and a reservation is 2,500 + 5,750 = 8,250.
  c_per_request_ceiling constant bigint := 9000;
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

revoke all privileges on function public.reserve_ai_spend(text, bigint, text, text)
from public, anon, authenticated, service_role;
grant execute on function public.reserve_ai_spend(text, bigint, text, text)
to authenticated;
