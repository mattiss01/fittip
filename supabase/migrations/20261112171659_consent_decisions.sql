-- B2 (ADR-043 decision 5): the terms first, then no coach call without a
-- recorded yes.
--
-- A person's decisions about FitTip's terms and about the coach, append-only:
-- agreeing, declining and withdrawing are each a new row, so the rows are the
-- record of what was decided, when, and against which text. Per kind, the
-- latest row is the decision in force.
--
-- `terms`: "I agree to the Terms", required before the app opens (owner,
-- 15 Nov 2026), so only ever agreed; not using FitTip is how it is declined.
-- `health`: the explicit consent to FitTip storing what a person writes about
-- their health (GDPR Art. 9(2)(a)), asked on its own line beside the terms and
-- also required (owner, 15 Nov 2026); withdrawn by deleting the account.
-- `coach`: the separate, optional yes to what the coach is sent (owner,
-- 12 Nov 2026), agreed or declined. Three decisions on purpose: a consent that
-- came bundled with accepting terms would not be one (EDPB 05/2020, para. 81).
--
-- The application also treats a decision made against an older version of
-- its text as no decision; the database checks the version's shape only.

create table public.consent_decisions (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid(),
  kind text not null,
  decision text not null,
  -- The text the person read, as `TERMS_VERSION` or `COACH_NOTICE_VERSION`
  -- names it: a date.
  version text not null,
  decided_at timestamptz not null default now(),
  constraint consent_decisions_user_id_fkey
    foreign key (user_id)
    references public.profiles (user_id)
    on delete cascade,
  constraint consent_decisions_kind_check
    check (kind in ('terms', 'health', 'coach')),
  constraint consent_decisions_decision_check
    check (
      decision = 'agreed'
      or (kind = 'coach' and decision = 'declined')
    ),
  constraint consent_decisions_version_check
    check (version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
);

-- The decision in force is the latest row for a person and kind.
create index consent_decisions_latest_idx
  on public.consent_decisions (user_id, kind, decided_at desc, id desc);

revoke all privileges on table public.consent_decisions
  from public, anon, authenticated, service_role;
grant select on table public.consent_decisions to authenticated;
-- Not `decided_at` or `id`: the time of a decision is the database's, never
-- the client's. No update and no delete: a decision is changed by a new one,
-- and the rows go only with the account (the cascade above, ADR-039).
grant insert (user_id, kind, decision, version)
  on table public.consent_decisions to authenticated;

alter table public.consent_decisions enable row level security;

create policy consent_decisions_owner_select
  on public.consent_decisions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy consent_decisions_owner_insert
  on public.consent_decisions
  for insert to authenticated with check ((select auth.uid()) = user_id);

comment on table public.consent_decisions is
  'ADR-043 decision 5: each person''s decisions about the terms, their health information and the coach, append-only; per kind, the latest is in force.';

-- Whether a person's coach decision in force is to agree.
create function private.coach_consent_agreed(p_user_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((
    select d.decision = 'agreed'
    from public.consent_decisions d
    where d.user_id = p_user_id
      and d.kind = 'coach'
    order by d.decided_at desc, d.id desc
    limit 1
  ), false);
$$;

revoke all privileges on function private.coach_consent_agreed(uuid)
  from public, anon, authenticated, service_role;

-- The backstop: every live coach call reserves spend first, so a person who
-- has not agreed is refused here even if the application's own check were
-- skipped. Same signature and body as before, plus the check after the
-- profile; `create or replace` keeps the function's owner and grants.
create or replace function public.reserve_ai_spend(
  p_operation text,
  p_reserved_micro_usd bigint,
  p_rate_card_version text,
  p_currency text
)
returns public.ai_spend_reservation_receipt
language plpgsql
security definer
set search_path = ''
as $$
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

  -- B2 (ADR-043 decision 5): no coach call without a yes in force.
  if not private.coach_consent_agreed(v_user_id) then
    raise exception using
      errcode = 'PT403',
      message = 'The coach needs your agreement first.';
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
$$;
