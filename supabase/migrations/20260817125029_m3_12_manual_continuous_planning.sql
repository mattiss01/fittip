-- M3-12: manual continuous planning.
--
-- M3-10 shipped the rolling-plan persistence, the atomic change set, and the
-- owner revision, but deliberately left out three things this migration adds:
--
--   1. a durable owner time zone, so owner-local "today" is a stored fact
--      rather than a browser claim;
--   2. Recovery day labels, carried by the same change-set transaction as the
--      sessions they sit beside;
--   3. the two planning rules F-005 settled - no change may target a date
--      before owner-local today, and no change set may leave more than ten
--      active sessions on one date.
--
-- Both rules live inside the privileged change function. The surface enforces
-- them too, but the surface is not where they are true.
--
-- New owner-visible conditions raised by the change function:
--   PT422  the change targets a date before owner-local today
--   PT423  the change set would leave more than ten active sessions on a date
--   PT428  the owner has no stored time zone, so today cannot be derived

-- 1. The durable owner time zone -------------------------------------------

-- A check constraint cannot contain a subquery, so the catalog lookup is
-- wrapped. The constraint is evaluated as the writing role, which is why
-- `authenticated` keeps the privilege to call it; it reads nothing but a
-- catalog view every role can already read.
create function public.is_iana_timezone_name(p_value text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from pg_catalog.pg_timezone_names where name = p_value
  );
$$;

revoke all privileges on function public.is_iana_timezone_name(text)
  from public, anon, authenticated, service_role;
grant execute on function public.is_iana_timezone_name(text) to authenticated;

alter table public.profiles
  add column timezone_name text,
  add constraint profiles_timezone_name_check check (
    timezone_name is null
    or (
      pg_catalog.char_length(timezone_name) between 1 and 100
      and public.is_iana_timezone_name(timezone_name)
    )
  );

-- The owner confirms their own zone. The grant is column-scoped, so no other
-- profile column becomes writable and `user_id` cannot be reassigned.
grant update (timezone_name) on table public.profiles to authenticated;

create policy profiles_owner_update_timezone on public.profiles
  for update
  to authenticated
  using (
    (select auth.uid()) is not null
    and (select auth.uid()) = user_id
  )
  with check (
    (select auth.uid()) is not null
    and (select auth.uid()) = user_id
  );

-- 2. Recovery day labels ----------------------------------------------------

-- One row per owner-date. A label carries no payload beyond its own existence:
-- an unlabeled date is unplanned, not incomplete.
create table public.rolling_plan_recovery_days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  plan_id uuid not null,
  local_date date not null,
  created_at timestamptz not null default now(),
  constraint rolling_plan_recovery_days_owner_key unique (id, user_id),
  constraint rolling_plan_recovery_days_plan_fkey
    foreign key (plan_id, user_id)
    references public.rolling_plans (id, user_id) on delete cascade,
  constraint rolling_plan_recovery_days_owner_date_key unique (user_id, local_date)
);

-- `rolling_plan_recovery_days_owner_date_key` is the owner/date access path
-- for both the bounded read and the label lookup, so no further index is added.

alter table public.rolling_plan_recovery_days enable row level security;

revoke all privileges on table public.rolling_plan_recovery_days
  from public, anon, authenticated, service_role;
grant select on table public.rolling_plan_recovery_days to authenticated;

create policy rolling_plan_recovery_days_owner_select
  on public.rolling_plan_recovery_days
  for select to authenticated using ((select auth.uid()) = user_id);

-- Writes only ever arrive through the change function, which inserts and
-- deletes but never updates. The trigger states the invariant anyway, so a
-- later privileged path cannot quietly move a label to another owner.
create function public.rolling_plan_recovery_days_reject_owner_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception using errcode = '42501',
      message = 'A recovery day owner cannot be reassigned.';
  end if;
  return new;
end;
$$;

revoke all privileges on function public.rolling_plan_recovery_days_reject_owner_change()
  from public, anon, authenticated, service_role;

create trigger rolling_plan_recovery_days_owner_immutable
  before update on public.rolling_plan_recovery_days
  for each row
  execute function public.rolling_plan_recovery_days_reject_owner_change();

-- 3. History carries recovery-day changes -----------------------------------

-- A recovery-day entry targets a date rather than a session identity, so the
-- entry's target becomes exactly one of the two.
alter table public.rolling_plan_change_entries
  alter column session_id drop not null,
  add column local_date date;

alter table public.rolling_plan_change_entries
  drop constraint rolling_plan_change_entries_kind_check;

alter table public.rolling_plan_change_entries
  add constraint rolling_plan_change_entries_kind_check check (
    change_kind in (
      'add', 'edit', 'move', 'set_lock', 'cancel', 'set_recovery_day'
    )
  ),
  add constraint rolling_plan_change_entries_target_check check (
    (
      change_kind = 'set_recovery_day'
      and session_id is null
      and local_date is not null
    )
    or (
      change_kind <> 'set_recovery_day'
      and session_id is not null
      and local_date is null
    )
  );

-- 4. The bounded read carries the labels beside the sessions ----------------

drop function public.get_rolling_plan_slice(date, date);
drop type public.rolling_plan_slice_receipt;

create type public.rolling_plan_slice_receipt as (
  plan_id uuid,
  plan_revision bigint,
  sessions jsonb,
  recovery_dates jsonb
);

create function public.get_rolling_plan_slice(
  p_start_date date,
  p_end_date date
)
returns public.rolling_plan_slice_receipt
language sql
stable
security invoker
set search_path = ''
as $$
  with caller as (
    select auth.uid() as user_id
  ),
  owner_plan as (
    select plan.id, plan.revision
    from public.rolling_plans plan
    cross join caller
    where plan.user_id = caller.user_id
  ),
  bounded_sessions as (
    select
      session.id,
      session.user_id,
      session.local_date,
      session.position,
      session.title,
      session.sport,
      session.intent,
      session.expected_duration_minutes,
      session.note,
      session.is_locked,
      session.status,
      session.cancelled_at,
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', activity.id,
            'personalActivityId', activity.personal_activity_id,
            'position', activity.position,
            'name', activity.name,
            'sport', activity.sport,
            'instructions', activity.instructions,
            'measurementMode', activity.measurement_mode,
            'target', activity.target,
            'isLocked', activity.is_locked
          ) order by activity.position, activity.id
        )
        from public.rolling_plan_activities activity
        where activity.user_id = session.user_id
          and activity.session_id = session.id
      ), '[]'::jsonb) as activities
    from public.rolling_plan_sessions session
    cross join caller
    where session.user_id = caller.user_id
      and session.local_date between p_start_date and p_end_date
  ),
  bounded_recovery as (
    select recovery.local_date
    from public.rolling_plan_recovery_days recovery
    cross join caller
    where recovery.user_id = caller.user_id
      and recovery.local_date between p_start_date and p_end_date
  )
  select (
    (select id from owner_plan),
    coalesce((select revision from owner_plan), 0),
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', session.id,
          'localDate', session.local_date,
          'position', session.position,
          'title', session.title,
          'sport', session.sport,
          'intent', session.intent,
          'expectedDurationMinutes', session.expected_duration_minutes,
          'note', session.note,
          'isLocked', session.is_locked,
          'status', session.status,
          'cancelledAt', session.cancelled_at,
          'activities', session.activities
        ) order by session.local_date, session.position, session.id
      ) from bounded_sessions session
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(recovery.local_date::text order by recovery.local_date)
      from bounded_recovery recovery
    ), '[]'::jsonb)
  )::public.rolling_plan_slice_receipt;
$$;

revoke all privileges on function public.get_rolling_plan_slice(date, date)
  from public, anon, authenticated, service_role;
grant execute on function public.get_rolling_plan_slice(date, date)
  to authenticated;

-- 5. The change function carries the labels and enforces both rules ---------

create or replace function public.apply_rolling_plan_change_set(
  p_expected_plan_revision bigint,
  p_idempotency_key uuid,
  p_provenance text,
  p_changes jsonb
)
returns public.rolling_plan_change_receipt
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_timezone text;
  v_today date;
  v_plan public.rolling_plans;
  v_existing public.rolling_plan_change_sets;
  v_fingerprint text;
  v_change_set_id uuid := gen_random_uuid();
  v_new_revision bigint;
  v_change jsonb;
  v_operation text;
  v_session_input jsonb;
  v_session_id uuid;
  v_local_date date;
  v_target_date date;
  v_before jsonb;
  v_after jsonb;
  v_activity jsonb;
  v_ordinal integer := 0;
  v_position numeric;
  v_session_dates date[] := array[]::date[];
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'An authenticated FitTip user is required.';
  end if;
  if p_expected_plan_revision is null or p_expected_plan_revision < 0
    or p_idempotency_key is null or p_provenance is null
    or p_provenance !~ '^[a-z][a-z0-9_]{0,63}$'
    or p_changes is null or pg_catalog.jsonb_typeof(p_changes) <> 'array'
    or pg_catalog.jsonb_array_length(p_changes) not between 1 and 100
  then
    raise exception using errcode = '22023', message = 'Invalid rolling plan change set.';
  end if;

  -- Owner-local today comes from the stored profile zone and auth.uid() only.
  -- A caller cannot supply either, so neither rule below can be argued away.
  select profile.timezone_name into v_timezone
  from public.profiles profile where profile.user_id = v_user_id;
  if v_timezone is null then
    raise exception using errcode = 'PT428',
      message = 'Confirm your time zone before changing your plan.';
  end if;
  v_today := (pg_catalog.timezone(v_timezone, v_now))::date;

  v_fingerprint := pg_catalog.encode(extensions.digest(
    pg_catalog.convert_to(pg_catalog.jsonb_build_object(
      'expectedPlanRevision', p_expected_plan_revision,
      'provenance', p_provenance,
      'changes', p_changes
    )::text, 'UTF8'), 'sha256'), 'hex');

  perform pg_catalog.set_config('lock_timeout', '3s', true);
  begin
    perform pg_catalog.pg_advisory_xact_lock(62006, pg_catalog.hashtext(v_user_id::text));
  exception when lock_not_available then
    raise exception using errcode = 'PT409', message = 'Your plan changed. Reload and try again.';
  end;

  select * into v_existing from public.rolling_plan_change_sets
  where user_id = v_user_id and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.request_fingerprint <> v_fingerprint then
      raise exception using errcode = 'PT409', message = 'That plan change key was already used.';
    end if;
    return (v_existing.plan_id, v_existing.plan_revision, v_existing.id, 'replayed')
      ::public.rolling_plan_change_receipt;
  end if;

  select * into v_plan from public.rolling_plans where user_id = v_user_id for update;
  if not found then
    if p_expected_plan_revision <> 0 then
      raise exception using errcode = 'PT409', message = 'Your plan changed. Reload and try again.';
    end if;
    insert into public.rolling_plans (user_id) values (v_user_id) returning * into v_plan;
  elsif v_plan.revision <> p_expected_plan_revision then
    raise exception using errcode = 'PT409', message = 'Your plan changed. Reload and try again.';
  end if;

  v_new_revision := v_plan.revision + 1;
  insert into public.rolling_plan_change_sets (
    id, user_id, plan_id, plan_revision, idempotency_key,
    request_fingerprint, provenance, created_at
  ) values (
    v_change_set_id, v_user_id, v_plan.id, v_new_revision,
    p_idempotency_key, v_fingerprint, p_provenance, v_now
  );

  for v_change in select value from pg_catalog.jsonb_array_elements(p_changes) loop
    if pg_catalog.jsonb_typeof(v_change) <> 'object'
      or not (v_change ? 'operation')
      or pg_catalog.jsonb_typeof(v_change->'operation') <> 'string'
    then raise exception using errcode = '22023', message = 'Invalid rolling plan change.'; end if;
    v_operation := v_change->>'operation';
    v_before := null;
    v_session_id := null;
    v_local_date := null;

    if v_operation = 'set_recovery_day' then
      if v_change - array['operation', 'localDate', 'isRecoveryDay'] <> '{}'::jsonb
        or not (v_change ?& array['localDate', 'isRecoveryDay'])
        or pg_catalog.jsonb_typeof(v_change->'localDate') <> 'string'
        or (v_change->>'localDate')::date::text <> v_change->>'localDate'
        or pg_catalog.jsonb_typeof(v_change->'isRecoveryDay') <> 'boolean'
      then raise exception using errcode = '22023', message = 'Invalid rolling plan recovery day.'; end if;
      v_local_date := (v_change->>'localDate')::date;
      if v_local_date < v_today then
        raise exception using errcode = 'PT422',
          message = 'A plan change cannot target a date before today.';
      end if;

      -- A label is not a session, so it never counts toward the per-date cap.
      v_before := pg_catalog.jsonb_build_object(
        'localDate', v_local_date::text,
        'isRecoveryDay', exists (
          select 1 from public.rolling_plan_recovery_days recovery
          where recovery.user_id = v_user_id and recovery.local_date = v_local_date
        )
      );
      if (v_change->>'isRecoveryDay')::boolean then
        insert into public.rolling_plan_recovery_days (
          user_id, plan_id, local_date, created_at
        ) values (v_user_id, v_plan.id, v_local_date, v_now)
        on conflict (user_id, local_date) do nothing;
      else
        delete from public.rolling_plan_recovery_days recovery
        where recovery.user_id = v_user_id and recovery.local_date = v_local_date;
      end if;
      v_after := pg_catalog.jsonb_build_object(
        'localDate', v_local_date::text,
        'isRecoveryDay', (v_change->>'isRecoveryDay')::boolean
      );
    else
      if not (v_change ? 'sessionId')
        or pg_catalog.jsonb_typeof(v_change->'sessionId') <> 'string'
      then raise exception using errcode = '22023', message = 'Invalid rolling plan change.'; end if;
      begin v_session_id := (v_change->>'sessionId')::uuid;
      exception when others then
        raise exception using errcode = '22023', message = 'Invalid rolling plan change.';
      end;

      if v_operation = 'add' then
        if v_change - array['operation', 'sessionId', 'session'] <> '{}'::jsonb
          or not (v_change ? 'session')
          or not public.rolling_plan_session_input_is_valid(v_change->'session', true)
          or exists (select 1 from public.rolling_plan_sessions where id = v_session_id)
        then raise exception using errcode = '22023', message = 'Invalid rolling plan addition.'; end if;
        v_session_input := v_change->'session';
        v_local_date := (v_session_input->>'localDate')::date;
        if v_local_date < v_today then
          raise exception using errcode = 'PT422',
            message = 'A plan change cannot target a date before today.';
        end if;
        v_session_dates := v_session_dates || v_local_date;
        insert into public.rolling_plan_sessions (
          id, user_id, plan_id, local_date, position, title, sport, intent,
          expected_duration_minutes, note, is_locked, status, created_at, updated_at
        ) values (
          v_session_id, v_user_id, v_plan.id,
          v_local_date,
          (v_session_input->>'position')::smallint,
          pg_catalog.btrim(v_session_input->>'title'),
          pg_catalog.btrim(v_session_input->>'sport'),
          nullif(v_session_input->>'intent', ''),
          (v_session_input->>'expectedDurationMinutes')::integer,
          nullif(v_session_input->>'note', ''),
          (v_session_input->>'isLocked')::boolean,
          'active', v_now, v_now
        );
      elsif v_operation in ('edit', 'move', 'set_lock', 'cancel') then
        select session.local_date into v_local_date
        from public.rolling_plan_sessions session
        where session.id = v_session_id and session.user_id = v_user_id
          and session.status = 'active'
        for update;
        if not found then raise exception using errcode = '22023', message = 'Invalid rolling plan change.'; end if;
        -- A past session is history. The owner's own lock never blocks them,
        -- but the past boundary does.
        if v_local_date < v_today then
          raise exception using errcode = 'PT422',
            message = 'A plan change cannot target a date before today.';
        end if;
        v_session_dates := v_session_dates || v_local_date;
        v_before := public.rolling_plan_session_state(v_user_id, v_session_id);

        if v_operation = 'edit' then
          if v_change - array['operation', 'sessionId', 'session'] <> '{}'::jsonb
            or not (v_change ? 'session')
            or not public.rolling_plan_session_input_is_valid(v_change->'session', false)
          then raise exception using errcode = '22023', message = 'Invalid rolling plan edit.'; end if;
          v_session_input := v_change->'session';
          update public.rolling_plan_sessions set
            title = pg_catalog.btrim(v_session_input->>'title'),
            sport = pg_catalog.btrim(v_session_input->>'sport'),
            intent = nullif(v_session_input->>'intent', ''),
            expected_duration_minutes = (v_session_input->>'expectedDurationMinutes')::integer,
            note = nullif(v_session_input->>'note', ''),
            updated_at = v_now
          where id = v_session_id and user_id = v_user_id;
          delete from public.rolling_plan_activities
          where session_id = v_session_id and user_id = v_user_id;
        elsif v_operation = 'move' then
          if v_change - array['operation', 'sessionId', 'localDate', 'position'] <> '{}'::jsonb
            or not (v_change ?& array['localDate', 'position'])
            or pg_catalog.jsonb_typeof(v_change->'localDate') <> 'string'
            or (v_change->>'localDate')::date::text <> v_change->>'localDate'
            or pg_catalog.jsonb_typeof(v_change->'position') <> 'number'
          then raise exception using errcode = '22023', message = 'Invalid rolling plan move.'; end if;
          v_position := (v_change->>'position')::numeric;
          if v_position <> trunc(v_position) or v_position not between 0 and 99 then
            raise exception using errcode = '22023', message = 'Invalid rolling plan move.';
          end if;
          v_target_date := (v_change->>'localDate')::date;
          if v_target_date < v_today then
            raise exception using errcode = 'PT422',
              message = 'A plan change cannot target a date before today.';
          end if;
          v_session_dates := v_session_dates || v_target_date;
          update public.rolling_plan_sessions set
            local_date = v_target_date,
            position = v_position::smallint, updated_at = v_now
          where id = v_session_id and user_id = v_user_id;
        elsif v_operation = 'set_lock' then
          if v_change - array['operation', 'sessionId', 'isLocked'] <> '{}'::jsonb
            or pg_catalog.jsonb_typeof(v_change->'isLocked') <> 'boolean'
          then raise exception using errcode = '22023', message = 'Invalid rolling plan lock change.'; end if;
          update public.rolling_plan_sessions set
            is_locked = (v_change->>'isLocked')::boolean, updated_at = v_now
          where id = v_session_id and user_id = v_user_id;
        else
          if v_change - array['operation', 'sessionId'] <> '{}'::jsonb then
            raise exception using errcode = '22023', message = 'Invalid rolling plan cancellation.';
          end if;
          update public.rolling_plan_sessions set
            status = 'cancelled', cancelled_at = v_now, updated_at = v_now
          where id = v_session_id and user_id = v_user_id;
        end if;
      else
        raise exception using errcode = '22023', message = 'Invalid rolling plan change.';
      end if;

      if v_operation in ('add', 'edit') then
        for v_activity in
          select value from pg_catalog.jsonb_array_elements(v_session_input->'activities')
        loop
          if v_activity ? 'personalActivityId'
            and pg_catalog.jsonb_typeof(v_activity->'personalActivityId') <> 'null'
            and not exists (
              select 1 from public.personal_activities
              where id = (v_activity->>'personalActivityId')::uuid and user_id = v_user_id
            )
          then raise exception using errcode = '22023', message = 'Invalid rolling plan activity.'; end if;
          insert into public.rolling_plan_activities (
            user_id, plan_id, session_id, personal_activity_id, position,
            name, sport, instructions, measurement_mode, target, is_locked,
            created_at, updated_at
          ) values (
            v_user_id, v_plan.id, v_session_id,
            (v_activity->>'personalActivityId')::uuid,
            (v_activity->>'position')::smallint,
            pg_catalog.btrim(v_activity->>'name'),
            pg_catalog.btrim(v_activity->>'sport'),
            nullif(v_activity->>'instructions', ''),
            v_activity->>'measurementMode', v_activity->'target',
            (v_activity->>'isLocked')::boolean, v_now, v_now
          );
        end loop;
      end if;

      v_after := public.rolling_plan_session_state(v_user_id, v_session_id);
    end if;

    if v_before is not null and v_before = v_after then
      raise exception using errcode = '22023', message = 'A plan change must change current state.';
    end if;
    insert into public.rolling_plan_change_entries (
      user_id, plan_id, change_set_id, session_id, local_date, ordinal,
      change_kind, before_state, after_state, created_at
    ) values (
      v_user_id, v_plan.id, v_change_set_id,
      case when v_operation = 'set_recovery_day' then null else v_session_id end,
      case when v_operation = 'set_recovery_day' then v_local_date else null end,
      v_ordinal, v_operation, v_before, v_after, v_now
    );
    v_ordinal := v_ordinal + 1;
  end loop;

  set constraints public.rolling_plan_sessions_active_order_key immediate;

  -- The cap is judged on the state the whole change set leaves behind, not on
  -- any one subchange, so a swap that stays within ten never trips it.
  if exists (
    select 1 from public.rolling_plan_sessions session
    where session.user_id = v_user_id and session.status = 'active'
      and session.local_date = any(v_session_dates)
    group by session.local_date
    having pg_catalog.count(*) > 10
  ) then
    raise exception using errcode = 'PT423',
      message = 'A date holds at most ten planned sessions.';
  end if;

  update public.rolling_plans set revision = v_new_revision, updated_at = v_now
  where id = v_plan.id and user_id = v_user_id;
  return (v_plan.id, v_new_revision, v_change_set_id, 'applied')
    ::public.rolling_plan_change_receipt;
exception
  when unique_violation or foreign_key_violation or check_violation or invalid_datetime_format then
    raise exception using errcode = '22023', message = 'Invalid rolling plan change set.';
end;
$$;
