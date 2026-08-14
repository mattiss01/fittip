-- M3-10: dormant rolling-plan persistence.
-- Current state is directly readable; authenticated writes can only use the
-- owner-derived transaction that also appends history and advances revision.

create table public.rolling_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  revision bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rolling_plans_owner_fkey
    foreign key (user_id) references public.profiles (user_id) on delete cascade,
  constraint rolling_plans_owner_key unique (id, user_id),
  constraint rolling_plans_revision_check check (revision >= 0)
);

create table public.rolling_plan_sessions (
  id uuid primary key,
  user_id uuid not null,
  plan_id uuid not null,
  local_date date not null,
  position smallint not null,
  title text not null,
  sport text not null,
  intent text,
  expected_duration_minutes integer,
  note text,
  is_locked boolean not null default false,
  status text not null default 'active',
  active_position smallint generated always as (
    case when status = 'active' then position else null end
  ) stored,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rolling_plan_sessions_owner_key unique (id, user_id),
  constraint rolling_plan_sessions_plan_key unique (id, user_id, plan_id),
  constraint rolling_plan_sessions_plan_fkey
    foreign key (plan_id, user_id)
    references public.rolling_plans (id, user_id) on delete cascade,
  constraint rolling_plan_sessions_active_order_key
    unique (user_id, local_date, active_position)
    deferrable initially deferred,
  constraint rolling_plan_sessions_position_check check (position between 0 and 99),
  constraint rolling_plan_sessions_title_check
    check (char_length(trim(title)) between 1 and 120),
  constraint rolling_plan_sessions_sport_check
    check (char_length(trim(sport)) between 1 and 80),
  constraint rolling_plan_sessions_intent_check
    check (intent is null or char_length(intent) <= 500),
  constraint rolling_plan_sessions_duration_check
    check (expected_duration_minutes is null or expected_duration_minutes between 1 and 10080),
  constraint rolling_plan_sessions_note_check
    check (note is null or char_length(note) <= 2000),
  constraint rolling_plan_sessions_status_check check (status in ('active', 'cancelled')),
  constraint rolling_plan_sessions_cancelled_check check (
    (status = 'active' and cancelled_at is null)
    or (status = 'cancelled' and cancelled_at is not null)
  )
);

create table public.rolling_plan_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  plan_id uuid not null,
  session_id uuid not null,
  personal_activity_id uuid,
  position smallint not null,
  name text not null,
  sport text not null,
  instructions text,
  measurement_mode text not null,
  target jsonb,
  is_locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rolling_plan_activities_owner_key unique (id, user_id),
  constraint rolling_plan_activities_session_fkey
    foreign key (session_id, user_id, plan_id)
    references public.rolling_plan_sessions (id, user_id, plan_id) on delete cascade,
  constraint rolling_plan_activities_personal_fkey
    foreign key (personal_activity_id, user_id)
    references public.personal_activities (id, user_id),
  constraint rolling_plan_activities_order_key unique (session_id, position),
  constraint rolling_plan_activities_position_check check (position between 0 and 99),
  constraint rolling_plan_activities_name_check
    check (char_length(trim(name)) between 1 and 120),
  constraint rolling_plan_activities_sport_check
    check (char_length(trim(sport)) between 1 and 80),
  constraint rolling_plan_activities_instructions_check
    check (instructions is null or char_length(instructions) <= 2000),
  constraint rolling_plan_activities_measurement_mode_check check (
    measurement_mode in (
      'sets_reps_load', 'time_distance_pace', 'duration_intensity',
      'skill_repetitions', 'custom'
    )
  ),
  constraint rolling_plan_activities_target_check
    check (public.is_valid_training_measurement(measurement_mode, target))
);

create table public.rolling_plan_change_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  plan_id uuid not null,
  plan_revision bigint not null,
  idempotency_key uuid not null,
  request_fingerprint text not null,
  provenance text not null,
  created_at timestamptz not null default now(),
  constraint rolling_plan_change_sets_owner_key unique (id, user_id),
  constraint rolling_plan_change_sets_plan_key unique (id, user_id, plan_id),
  constraint rolling_plan_change_sets_plan_fkey
    foreign key (plan_id, user_id)
    references public.rolling_plans (id, user_id) on delete cascade,
  constraint rolling_plan_change_sets_revision_key unique (user_id, plan_revision),
  constraint rolling_plan_change_sets_idempotency_key unique (user_id, idempotency_key),
  constraint rolling_plan_change_sets_revision_check check (plan_revision > 0),
  constraint rolling_plan_change_sets_fingerprint_check
    check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint rolling_plan_change_sets_provenance_check
    check (provenance ~ '^[a-z][a-z0-9_]{0,63}$')
);

create table public.rolling_plan_change_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  plan_id uuid not null,
  change_set_id uuid not null,
  session_id uuid not null,
  ordinal smallint not null,
  change_kind text not null,
  before_state jsonb,
  after_state jsonb not null,
  created_at timestamptz not null default now(),
  constraint rolling_plan_change_entries_change_set_fkey
    foreign key (change_set_id, user_id, plan_id)
    references public.rolling_plan_change_sets (id, user_id, plan_id) on delete cascade,
  constraint rolling_plan_change_entries_session_fkey
    foreign key (session_id, user_id, plan_id)
    references public.rolling_plan_sessions (id, user_id, plan_id) on delete cascade,
  constraint rolling_plan_change_entries_order_key unique (change_set_id, ordinal),
  constraint rolling_plan_change_entries_ordinal_check check (ordinal between 0 and 99),
  constraint rolling_plan_change_entries_kind_check
    check (change_kind in ('add', 'edit', 'move', 'set_lock', 'cancel')),
  constraint rolling_plan_change_entries_states_check check (
    (change_kind = 'add' and before_state is null)
    or (change_kind <> 'add' and before_state is not null)
  ),
  constraint rolling_plan_change_entries_before_size_check
    check (before_state is null or octet_length(before_state::text) <= 262144),
  constraint rolling_plan_change_entries_after_size_check
    check (octet_length(after_state::text) <= 262144)
);

create index rolling_plan_sessions_owner_slice_idx
  on public.rolling_plan_sessions (user_id, local_date, position, id);
create index rolling_plan_sessions_plan_idx
  on public.rolling_plan_sessions (plan_id, user_id);
create index rolling_plan_activities_owner_session_idx
  on public.rolling_plan_activities (user_id, session_id, position);
create index rolling_plan_activities_personal_idx
  on public.rolling_plan_activities (personal_activity_id, user_id)
  where personal_activity_id is not null;
create index rolling_plan_change_sets_owner_history_idx
  on public.rolling_plan_change_sets (user_id, plan_revision desc);
create index rolling_plan_change_sets_plan_idx
  on public.rolling_plan_change_sets (plan_id, user_id);
create index rolling_plan_change_entries_owner_history_idx
  on public.rolling_plan_change_entries (user_id, change_set_id, ordinal);
create index rolling_plan_change_entries_session_history_idx
  on public.rolling_plan_change_entries (user_id, session_id, created_at desc);

alter table public.rolling_plans enable row level security;
alter table public.rolling_plan_sessions enable row level security;
alter table public.rolling_plan_activities enable row level security;
alter table public.rolling_plan_change_sets enable row level security;
alter table public.rolling_plan_change_entries enable row level security;

revoke all privileges on table public.rolling_plans from public, anon, authenticated, service_role;
revoke all privileges on table public.rolling_plan_sessions from public, anon, authenticated, service_role;
revoke all privileges on table public.rolling_plan_activities from public, anon, authenticated, service_role;
revoke all privileges on table public.rolling_plan_change_sets from public, anon, authenticated, service_role;
revoke all privileges on table public.rolling_plan_change_entries from public, anon, authenticated, service_role;

grant select on table public.rolling_plans to authenticated;
grant select on table public.rolling_plan_sessions to authenticated;
grant select on table public.rolling_plan_activities to authenticated;
grant select on table public.rolling_plan_change_sets to authenticated;
grant select on table public.rolling_plan_change_entries to authenticated;

create policy rolling_plans_owner_select on public.rolling_plans
  for select to authenticated using ((select auth.uid()) = user_id);
create policy rolling_plan_sessions_owner_select on public.rolling_plan_sessions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy rolling_plan_activities_owner_select on public.rolling_plan_activities
  for select to authenticated using ((select auth.uid()) = user_id);
create policy rolling_plan_change_sets_owner_select on public.rolling_plan_change_sets
  for select to authenticated using ((select auth.uid()) = user_id);
create policy rolling_plan_change_entries_owner_select on public.rolling_plan_change_entries
  for select to authenticated using ((select auth.uid()) = user_id);

create type public.rolling_plan_change_receipt as (
  plan_id uuid,
  plan_revision bigint,
  change_set_id uuid,
  result text
);

create type public.rolling_plan_slice_receipt as (
  plan_id uuid,
  plan_revision bigint,
  sessions jsonb
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
    ), '[]'::jsonb)
  )::public.rolling_plan_slice_receipt;
$$;

create function public.rolling_plan_activity_input_is_valid(p_value jsonb)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_position numeric;
  v_mode text;
begin
  if p_value is null or pg_catalog.jsonb_typeof(p_value) <> 'object'
    or p_value - array[
      'personalActivityId', 'position', 'name', 'sport', 'instructions',
      'measurementMode', 'target', 'isLocked'
    ] <> '{}'::jsonb
    or not (p_value ?& array['position', 'name', 'sport', 'measurementMode', 'isLocked'])
    or pg_catalog.jsonb_typeof(p_value->'position') <> 'number'
    or pg_catalog.jsonb_typeof(p_value->'name') <> 'string'
    or pg_catalog.jsonb_typeof(p_value->'sport') <> 'string'
    or pg_catalog.jsonb_typeof(p_value->'measurementMode') <> 'string'
    or pg_catalog.jsonb_typeof(p_value->'isLocked') <> 'boolean'
  then return false; end if;

  v_position := (p_value->>'position')::numeric;
  v_mode := p_value->>'measurementMode';
  if v_position <> trunc(v_position) or v_position not between 0 and 99
    or pg_catalog.char_length(pg_catalog.btrim(p_value->>'name')) not between 1 and 120
    or pg_catalog.char_length(pg_catalog.btrim(p_value->>'sport')) not between 1 and 80
    or (p_value ? 'instructions' and pg_catalog.jsonb_typeof(p_value->'instructions') not in ('string', 'null'))
    or pg_catalog.char_length(coalesce(p_value->>'instructions', '')) > 2000
    or v_mode not in (
      'sets_reps_load', 'time_distance_pace', 'duration_intensity',
      'skill_repetitions', 'custom'
    )
    or not public.is_valid_training_measurement(v_mode, p_value->'target')
  then return false; end if;

  if p_value ? 'personalActivityId'
    and pg_catalog.jsonb_typeof(p_value->'personalActivityId') <> 'null'
  then
    if pg_catalog.jsonb_typeof(p_value->'personalActivityId') <> 'string' then return false; end if;
    perform (p_value->>'personalActivityId')::uuid;
  end if;
  return true;
exception when others then return false;
end;
$$;

create function public.rolling_plan_session_input_is_valid(
  p_value jsonb,
  p_with_placement boolean
)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_activity jsonb;
  v_position numeric;
  v_positions smallint[] := array[]::smallint[];
begin
  if p_value is null or pg_catalog.jsonb_typeof(p_value) <> 'object'
    or p_value - (case when p_with_placement then array[
      'localDate', 'position', 'title', 'sport', 'intent',
      'expectedDurationMinutes', 'note', 'isLocked', 'activities'
    ] else array[
      'title', 'sport', 'intent', 'expectedDurationMinutes', 'note', 'activities'
    ] end) <> '{}'::jsonb
    or not (p_value ?& (case when p_with_placement then
      array['localDate', 'position', 'title', 'sport', 'isLocked', 'activities']
    else array['title', 'sport', 'activities'] end))
    or pg_catalog.jsonb_typeof(p_value->'title') <> 'string'
    or pg_catalog.jsonb_typeof(p_value->'sport') <> 'string'
    or pg_catalog.jsonb_typeof(p_value->'activities') <> 'array'
    or pg_catalog.jsonb_array_length(p_value->'activities') > 50
    or pg_catalog.char_length(pg_catalog.btrim(p_value->>'title')) not between 1 and 120
    or pg_catalog.char_length(pg_catalog.btrim(p_value->>'sport')) not between 1 and 80
    or (p_value ? 'intent' and pg_catalog.jsonb_typeof(p_value->'intent') not in ('string', 'null'))
    or pg_catalog.char_length(coalesce(p_value->>'intent', '')) > 500
    or (p_value ? 'note' and pg_catalog.jsonb_typeof(p_value->'note') not in ('string', 'null'))
    or pg_catalog.char_length(coalesce(p_value->>'note', '')) > 2000
  then return false; end if;

  if p_value ? 'expectedDurationMinutes'
    and pg_catalog.jsonb_typeof(p_value->'expectedDurationMinutes') <> 'null'
  then
    if pg_catalog.jsonb_typeof(p_value->'expectedDurationMinutes') <> 'number' then return false; end if;
    v_position := (p_value->>'expectedDurationMinutes')::numeric;
    if v_position <> trunc(v_position) or v_position not between 1 and 10080 then return false; end if;
  end if;

  if p_with_placement then
    if pg_catalog.jsonb_typeof(p_value->'localDate') <> 'string'
      or (p_value->>'localDate')::date::text <> p_value->>'localDate'
      or pg_catalog.jsonb_typeof(p_value->'position') <> 'number'
      or pg_catalog.jsonb_typeof(p_value->'isLocked') <> 'boolean'
    then return false; end if;
    v_position := (p_value->>'position')::numeric;
    if v_position <> trunc(v_position) or v_position not between 0 and 99 then return false; end if;
  end if;

  for v_activity in select value from pg_catalog.jsonb_array_elements(p_value->'activities') loop
    if not public.rolling_plan_activity_input_is_valid(v_activity) then return false; end if;
    v_position := (v_activity->>'position')::numeric;
    if v_position::smallint = any(v_positions) then return false; end if;
    v_positions := v_positions || v_position::smallint;
  end loop;
  return true;
exception when others then return false;
end;
$$;

create function public.rolling_plan_session_state(p_user_id uuid, p_session_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'localDate', s.local_date::text,
    'position', s.position,
    'title', s.title,
    'sport', s.sport,
    'intent', s.intent,
    'expectedDurationMinutes', s.expected_duration_minutes,
    'note', s.note,
    'isLocked', s.is_locked,
    'status', s.status,
    'cancelledAt', s.cancelled_at,
    'activities', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', a.id,
        'personalActivityId', a.personal_activity_id,
        'position', a.position,
        'name', a.name,
        'sport', a.sport,
        'instructions', a.instructions,
        'measurementMode', a.measurement_mode,
        'target', a.target,
        'isLocked', a.is_locked
      ) order by a.position, a.id)
      from public.rolling_plan_activities a
      where a.user_id = p_user_id and a.session_id = p_session_id
    ), '[]'::jsonb)
  )
  from public.rolling_plan_sessions s
  where s.user_id = p_user_id and s.id = p_session_id;
$$;

create function public.apply_rolling_plan_change_set(
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
  v_plan public.rolling_plans;
  v_existing public.rolling_plan_change_sets;
  v_fingerprint text;
  v_change_set_id uuid := gen_random_uuid();
  v_new_revision bigint;
  v_change jsonb;
  v_operation text;
  v_session_input jsonb;
  v_session_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_activity jsonb;
  v_ordinal integer := 0;
  v_position numeric;
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
      or not (v_change ?& array['operation', 'sessionId'])
      or pg_catalog.jsonb_typeof(v_change->'operation') <> 'string'
      or pg_catalog.jsonb_typeof(v_change->'sessionId') <> 'string'
    then raise exception using errcode = '22023', message = 'Invalid rolling plan change.'; end if;

    begin v_session_id := (v_change->>'sessionId')::uuid;
    exception when others then
      raise exception using errcode = '22023', message = 'Invalid rolling plan change.';
    end;
    v_operation := v_change->>'operation';
    v_before := null;

    if v_operation = 'add' then
      if v_change - array['operation', 'sessionId', 'session'] <> '{}'::jsonb
        or not (v_change ? 'session')
        or not public.rolling_plan_session_input_is_valid(v_change->'session', true)
        or exists (select 1 from public.rolling_plan_sessions where id = v_session_id)
      then raise exception using errcode = '22023', message = 'Invalid rolling plan addition.'; end if;
      v_session_input := v_change->'session';
      insert into public.rolling_plan_sessions (
        id, user_id, plan_id, local_date, position, title, sport, intent,
        expected_duration_minutes, note, is_locked, status, created_at, updated_at
      ) values (
        v_session_id, v_user_id, v_plan.id,
        (v_session_input->>'localDate')::date,
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
      perform 1 from public.rolling_plan_sessions
      where id = v_session_id and user_id = v_user_id and status = 'active' for update;
      if not found then raise exception using errcode = '22023', message = 'Invalid rolling plan change.'; end if;
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
        update public.rolling_plan_sessions set
          local_date = (v_change->>'localDate')::date,
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
    if v_before is not null and v_before = v_after then
      raise exception using errcode = '22023', message = 'A plan change must change current state.';
    end if;
    insert into public.rolling_plan_change_entries (
      user_id, plan_id, change_set_id, session_id, ordinal, change_kind,
      before_state, after_state, created_at
    ) values (
      v_user_id, v_plan.id, v_change_set_id, v_session_id, v_ordinal,
      v_operation, v_before, v_after, v_now
    );
    v_ordinal := v_ordinal + 1;
  end loop;

  set constraints public.rolling_plan_sessions_active_order_key immediate;
  update public.rolling_plans set revision = v_new_revision, updated_at = v_now
  where id = v_plan.id and user_id = v_user_id;
  return (v_plan.id, v_new_revision, v_change_set_id, 'applied')
    ::public.rolling_plan_change_receipt;
exception
  when unique_violation or foreign_key_violation or check_violation or invalid_datetime_format then
    raise exception using errcode = '22023', message = 'Invalid rolling plan change set.';
end;
$$;

revoke all privileges on function public.rolling_plan_activity_input_is_valid(jsonb)
  from public, anon, authenticated, service_role;
revoke all privileges on function public.rolling_plan_session_input_is_valid(jsonb, boolean)
  from public, anon, authenticated, service_role;
revoke all privileges on function public.rolling_plan_session_state(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all privileges on function public.get_rolling_plan_slice(date, date)
  from public, anon, authenticated, service_role;
revoke all privileges on function public.apply_rolling_plan_change_set(bigint, uuid, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.get_rolling_plan_slice(date, date)
  to authenticated;
grant execute on function public.apply_rolling_plan_change_set(bigint, uuid, text, jsonb)
  to authenticated;
