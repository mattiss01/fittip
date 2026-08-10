-- M3-01B decision 8: durable AI spend state a capped owner cannot reset.
--
-- This is the one place in FitTip where "the owner owns their rows" is the
-- wrong answer. Every other table trusts the owner with their own data because
-- the owner is the only party harmed by changing it. A spend counter is the
-- opposite: the owner is exactly the party the counter constrains, and this
-- repository has no service-role client by rule, so every write carries the
-- capped user's own JWT. An ordinary owned table with RLS would therefore let
-- the capped user reset their own cap.
--
-- The shape that follows from that: the table is readable and nothing else,
-- both writes go through SECURITY DEFINER functions that derive the owner from
-- auth.uid(), and the ceilings live inside those functions as constants rather
-- than as parameters, because `authenticated` holds EXECUTE and a parameter is
-- something the caller chooses.

create type public.ai_spend_reservation_receipt as (
  reservation_id uuid,
  settlement_token uuid,
  spend_day date,
  reserved_micro_usd bigint,
  expires_at timestamptz
);

create type public.ai_spend_settlement_receipt as (
  reservation_id uuid,
  charged_micro_usd bigint
);

-- One row per reservation. A row is created before the provider call and
-- settled after it, so an unsettled row is either in flight or abandoned.
create table public.ai_spend_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  -- The capability that permits settlement. Generated here, returned only in
  -- the reserve receipt, and withheld from the owner by a column-level SELECT
  -- grant below. Without it the owner could read their own reservation id --
  -- RLS requires that they can -- race the server, and settle a live
  -- reservation at zero, which would make "settle once only" meaningless.
  settlement_token uuid not null default gen_random_uuid(),
  operation text not null,
  -- The UTC day the reservation counts against, derived inside the function.
  spend_day date not null,
  reserved_micro_usd bigint not null,
  -- Null until settled. Money is integer micro-USD (1e-6 USD) throughout, as
  -- in src/server/ai/budget.ts: floating point near a hard ceiling is how a
  -- ceiling stops being hard.
  charged_micro_usd bigint,
  rate_card_version text not null,
  currency text not null default 'USD',
  expires_at timestamptz not null,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  constraint ai_spend_reservations_owner_fkey
    foreign key (user_id)
    references public.profiles (user_id)
    on delete cascade,
  constraint ai_spend_reservations_operation_check
    check (operation in ('create_roadmap', 'create_seven_day_plan')),
  -- A reservation always costs something. A zero-cost reservation would be a
  -- free hold on the concurrency and ceiling arithmetic.
  constraint ai_spend_reservations_reserved_check
    check (reserved_micro_usd between 1 and 1000000),
  constraint ai_spend_reservations_charged_check
    check (
      charged_micro_usd is null
      or charged_micro_usd between 0 and 1000000
    ),
  -- Settled and charged move together, so a row can never claim to be settled
  -- without saying for how much.
  constraint ai_spend_reservations_settlement_check
    check ((settled_at is null) = (charged_micro_usd is null)),
  constraint ai_spend_reservations_currency_check check (currency = 'USD'),
  constraint ai_spend_reservations_rate_card_check
    check (char_length(trim(rate_card_version)) between 1 and 100),
  constraint ai_spend_reservations_expiry_check check (expires_at > created_at),
  constraint ai_spend_reservations_token_key unique (user_id, settlement_token)
);

-- The ceiling arithmetic reads by owner and day; the settle path reads by
-- owner and token, which the unique constraint above already indexes.
create index ai_spend_reservations_owner_day_idx
  on public.ai_spend_reservations (user_id, spend_day);
create index ai_spend_reservations_owner_open_idx
  on public.ai_spend_reservations (user_id, expires_at)
  where settled_at is null;

alter table public.ai_spend_reservations enable row level security;

revoke all privileges on table public.ai_spend_reservations
  from public, anon, authenticated;

-- Column-level SELECT, deliberately. `settlement_token` is absent, so an owner
-- can inspect every figure in their own spend history and still cannot obtain
-- the capability that settles a reservation. INSERT, UPDATE and DELETE are not
-- granted at all, so there is no direct write path to revoke later.
grant select (
  id,
  user_id,
  operation,
  spend_day,
  reserved_micro_usd,
  charged_micro_usd,
  rate_card_version,
  currency,
  expires_at,
  settled_at,
  created_at
) on table public.ai_spend_reservations to authenticated;

create policy ai_spend_reservations_owner_select
on public.ai_spend_reservations
for select
to authenticated
using ((select auth.uid()) = user_id);

-- Reserve the upper bound before the call.
--
-- The owner is derived, never passed: a user_id parameter would let any
-- authenticated caller reserve against somebody else's budget. The ceilings are
-- constants rather than parameters for the same reason -- `authenticated` holds
-- EXECUTE on this function, so anything it accepts as an argument is a number
-- the capped user chooses.
create function public.reserve_ai_spend(
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
  c_per_request_ceiling constant bigint := 8000;
  c_daily_ceiling constant bigint := 2000000;
  c_total_ceiling constant bigint := 20000000;
  -- Longer than the 30s deadlineMs by 30x, which leaves room for the
  -- settlement round trip, clock skew, and a frozen serverless instance
  -- between the provider response and the settle call. Far shorter than a day,
  -- so a crashed call cannot hold budget until midnight and lock the owner out
  -- with no visible cause.
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
    or p_operation not in ('create_roadmap', 'create_seven_day_plan')
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
  -- insert itself, so there is no window between deciding and writing. An
  -- unsettled reservation holds its reserved amount until it expires and then
  -- holds nothing; a settled one holds exactly what it was charged.
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
          when r.expires_at > v_now then r.reserved_micro_usd
          else 0
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
          when r.expires_at > v_now then r.reserved_micro_usd
          else 0
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

-- Reconcile a reservation against provider-reported usage.
--
-- Its own function because the owner cannot UPDATE the table, and it settles a
-- reservation once: the `settled_at is null` predicate is evaluated under the
-- row lock the UPDATE itself takes, so a second settlement matches no row.
-- Matching on the settlement token rather than on the reservation id is what
-- stops the owner settling a reservation the server made on their behalf.
create function public.settle_ai_spend(
  p_settlement_token uuid,
  p_charged_micro_usd bigint
)
returns public.ai_spend_settlement_receipt
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_receipt public.ai_spend_settlement_receipt;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'An authenticated FitTip user is required.';
  end if;

  if p_settlement_token is null
    or p_charged_micro_usd is null
    or p_charged_micro_usd < 0
    or p_charged_micro_usd > 1000000
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid coaching spend settlement.';
  end if;

  update public.ai_spend_reservations
  set
    charged_micro_usd = p_charged_micro_usd,
    settled_at = pg_catalog.now()
  where user_id = v_user_id
    and settlement_token = p_settlement_token
    and settled_at is null
  returning id, charged_micro_usd
  into v_receipt;

  if not found then
    raise exception using
      errcode = 'PT409',
      message = 'That coaching spend reservation is not open.';
  end if;

  return v_receipt;
end;
$$;

revoke all privileges on function public.reserve_ai_spend(
  text,
  bigint,
  text,
  text
) from public, anon, authenticated, service_role;

grant execute on function public.reserve_ai_spend(
  text,
  bigint,
  text,
  text
) to authenticated;

revoke all privileges on function public.settle_ai_spend(
  uuid,
  bigint
) from public, anon, authenticated, service_role;

grant execute on function public.settle_ai_spend(
  uuid,
  bigint
) to authenticated;
