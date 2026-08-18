-- M3-13: the private saved-session library.
--
-- A saved session is a reusable owner-owned template. It carries only the
-- fields that survive being detached from a date: the reusable half of
-- `rolling_plan_sessions` and `rolling_plan_activities`, plus one required
-- owner-given `name`. It deliberately carries no `local_date`, `position`,
-- `is_locked`, `status`, `cancelled_at`, `plan_id`, occurrence identity,
-- completion state, proposal decision, or source history.
--
-- Both copy directions are by value. There is no foreign key from a plan
-- session to a saved session and none back, so editing or deleting a library
-- entry cannot reach a plan session already created from it, and editing a
-- plan session cannot reach the library. Reuse composes out of what M3-12
-- already accepts: a plain `add` on `apply_rolling_plan_change_set`, which
-- this migration does not touch.
--
-- One mutable current record per saved session. No revision chain, no archive,
-- no soft delete: `delete` removes the row and its activities permanently. The
-- `revision` column is an optimistic token only - the surface sends back the
-- revision it read, and a write at a stale one is refused rather than applied
-- or dropped. Nothing retains a prior version and nothing can browse one.
--
-- Owner-visible conditions raised by the change function:
--   PT409  the saved session changed, or no longer exists, under this owner

-- 1. The two owner-scoped tables ---------------------------------------------

create table public.saved_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  title text not null,
  sport text not null,
  intent text,
  expected_duration_minutes integer,
  note text,
  revision bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint saved_sessions_owner_fkey
    foreign key (user_id) references public.profiles (user_id) on delete cascade,
  constraint saved_sessions_owner_key unique (id, user_id),
  constraint saved_sessions_revision_check check (revision >= 0),
  constraint saved_sessions_name_check
    check (char_length(trim(name)) between 1 and 120),
  constraint saved_sessions_title_check
    check (char_length(trim(title)) between 1 and 120),
  constraint saved_sessions_sport_check
    check (char_length(trim(sport)) between 1 and 80),
  constraint saved_sessions_intent_check
    check (intent is null or char_length(intent) <= 500),
  constraint saved_sessions_duration_check
    check (expected_duration_minutes is null
      or expected_duration_minutes between 1 and 10080),
  constraint saved_sessions_note_check
    check (note is null or char_length(note) <= 2000)
);

-- The reusable half of `rolling_plan_activities`. `is_locked` is a Plan lock,
-- so it is not reusable content and is absent here; a reused activity enters
-- the Plan unlocked.
create table public.saved_session_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  saved_session_id uuid not null,
  personal_activity_id uuid,
  position smallint not null,
  name text not null,
  sport text not null,
  instructions text,
  measurement_mode text not null,
  target jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint saved_session_activities_owner_key unique (id, user_id),
  constraint saved_session_activities_session_fkey
    foreign key (saved_session_id, user_id)
    references public.saved_sessions (id, user_id) on delete cascade,
  constraint saved_session_activities_personal_fkey
    foreign key (personal_activity_id, user_id)
    references public.personal_activities (id, user_id),
  constraint saved_session_activities_order_key
    unique (saved_session_id, position),
  constraint saved_session_activities_position_check
    check (position between 0 and 99),
  constraint saved_session_activities_name_check
    check (char_length(trim(name)) between 1 and 120),
  constraint saved_session_activities_sport_check
    check (char_length(trim(sport)) between 1 and 80),
  constraint saved_session_activities_instructions_check
    check (instructions is null or char_length(instructions) <= 2000),
  constraint saved_session_activities_measurement_mode_check check (
    measurement_mode in (
      'sets_reps_load', 'time_distance_pace', 'duration_intensity',
      'skill_repetitions', 'custom'
    )
  ),
  constraint saved_session_activities_target_check
    check (public.is_valid_training_measurement(measurement_mode, target))
);

-- The library list is read by owner in name order, and the activities of one
-- entry by owner and entry in position order. The second index also serves the
-- same-owner foreign key, so a cascading delete of an entry does not scan.
create index saved_sessions_owner_name_idx
  on public.saved_sessions (user_id, name, id);
create index saved_session_activities_owner_session_idx
  on public.saved_session_activities (user_id, saved_session_id, position);
create index saved_session_activities_personal_idx
  on public.saved_session_activities (personal_activity_id, user_id)
  where personal_activity_id is not null;

alter table public.saved_sessions enable row level security;
alter table public.saved_session_activities enable row level security;

revoke all privileges on table public.saved_sessions
  from public, anon, authenticated, service_role;
revoke all privileges on table public.saved_session_activities
  from public, anon, authenticated, service_role;

-- Owners read their own library directly. Every write arrives through the
-- owner-derived transaction below, so no client can present an owner id.
grant select on table public.saved_sessions to authenticated;
grant select on table public.saved_session_activities to authenticated;

create policy saved_sessions_owner_select on public.saved_sessions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy saved_session_activities_owner_select
  on public.saved_session_activities
  for select to authenticated using ((select auth.uid()) = user_id);

-- The change function never updates `user_id`. The triggers state the
-- invariant anyway, so a later privileged path cannot quietly move a library
-- entry to another owner.
create function public.saved_sessions_reject_owner_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception using errcode = '42501',
      message = 'A saved session owner cannot be reassigned.';
  end if;
  return new;
end;
$$;

revoke all privileges on function public.saved_sessions_reject_owner_change()
  from public, anon, authenticated, service_role;

create trigger saved_sessions_owner_immutable
  before update on public.saved_sessions
  for each row
  execute function public.saved_sessions_reject_owner_change();

create trigger saved_session_activities_owner_immutable
  before update on public.saved_session_activities
  for each row
  execute function public.saved_sessions_reject_owner_change();

-- 2. The owner-derived write --------------------------------------------------

create type public.saved_session_receipt as (
  saved_session_id uuid,
  revision bigint,
  result text
);

create function public.saved_session_activity_input_is_valid(p_value jsonb)
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
      'measurementMode', 'target'
    ] <> '{}'::jsonb
    or not (p_value ?& array['position', 'name', 'sport', 'measurementMode'])
    or pg_catalog.jsonb_typeof(p_value->'position') <> 'number'
    or pg_catalog.jsonb_typeof(p_value->'name') <> 'string'
    or pg_catalog.jsonb_typeof(p_value->'sport') <> 'string'
    or pg_catalog.jsonb_typeof(p_value->'measurementMode') <> 'string'
  then return false; end if;

  v_position := (p_value->>'position')::numeric;
  v_mode := p_value->>'measurementMode';
  if v_position <> trunc(v_position) or v_position not between 0 and 99
    or pg_catalog.char_length(pg_catalog.btrim(p_value->>'name')) not between 1 and 120
    or pg_catalog.char_length(pg_catalog.btrim(p_value->>'sport')) not between 1 and 80
    or (p_value ? 'instructions'
      and pg_catalog.jsonb_typeof(p_value->'instructions') not in ('string', 'null'))
    or pg_catalog.char_length(coalesce(p_value->>'instructions', '')) > 2000
    or v_mode not in (
      'sets_reps_load', 'time_distance_pace', 'duration_intensity',
      'skill_repetitions', 'custom'
    )
    -- An absent target and an explicit null target mean the same thing here:
    -- the activity carries no measurement target.
    or not public.is_valid_training_measurement(
      v_mode, nullif(p_value->'target', 'null'::jsonb))
  then return false; end if;

  if p_value ? 'personalActivityId'
    and pg_catalog.jsonb_typeof(p_value->'personalActivityId') <> 'null'
  then
    if pg_catalog.jsonb_typeof(p_value->'personalActivityId') <> 'string' then
      return false;
    end if;
    perform (p_value->>'personalActivityId')::uuid;
  end if;
  return true;
exception when others then return false;
end;
$$;

-- One owner-derived transaction for all three library writes. The owner comes
-- from `auth.uid()` and from nowhere else, and a create copies the whole entry
-- - the record and every activity - or none of it.
create function public.apply_saved_session_change(
  p_operation text,
  p_saved_session_id uuid default null,
  p_expected_revision bigint default null,
  p_name text default null,
  p_title text default null,
  p_sport text default null,
  p_intent text default null,
  p_expected_duration_minutes integer default null,
  p_note text default null,
  p_activities jsonb default null
)
returns public.saved_session_receipt
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_saved_session_id uuid;
  v_revision bigint;
  v_activity jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '42501',
      message = 'An authenticated FitTip user is required.';
  end if;
  if p_operation is null
    or p_operation not in ('create', 'edit', 'delete')
  then
    raise exception using errcode = '22023', message = 'Invalid saved session change.';
  end if;

  if p_operation = 'create' then
    -- A create names no existing record and answers to no revision.
    if p_saved_session_id is not null or p_expected_revision is not null
      or p_activities is null
      or pg_catalog.jsonb_typeof(p_activities) <> 'array'
      or pg_catalog.jsonb_array_length(p_activities) > 50
    then
      raise exception using errcode = '22023', message = 'Invalid saved session.';
    end if;
    for v_activity in select value from pg_catalog.jsonb_array_elements(p_activities) loop
      if not public.saved_session_activity_input_is_valid(v_activity) then
        raise exception using errcode = '22023', message = 'Invalid saved session activity.';
      end if;
    end loop;

    insert into public.saved_sessions (
      user_id, name, title, sport, intent, expected_duration_minutes, note,
      created_at, updated_at
    ) values (
      v_user_id, pg_catalog.btrim(p_name), pg_catalog.btrim(p_title),
      pg_catalog.btrim(p_sport), nullif(p_intent, ''),
      p_expected_duration_minutes, nullif(p_note, ''), v_now, v_now
    ) returning id, revision into v_saved_session_id, v_revision;

    for v_activity in select value from pg_catalog.jsonb_array_elements(p_activities) loop
      if v_activity ? 'personalActivityId'
        and pg_catalog.jsonb_typeof(v_activity->'personalActivityId') <> 'null'
        and not exists (
          select 1 from public.personal_activities
          where id = (v_activity->>'personalActivityId')::uuid and user_id = v_user_id
        )
      then
        raise exception using errcode = '22023', message = 'Invalid saved session activity.';
      end if;
      insert into public.saved_session_activities (
        user_id, saved_session_id, personal_activity_id, position,
        name, sport, instructions, measurement_mode, target, created_at, updated_at
      ) values (
        v_user_id, v_saved_session_id,
        (v_activity->>'personalActivityId')::uuid,
        (v_activity->>'position')::smallint,
        pg_catalog.btrim(v_activity->>'name'),
        pg_catalog.btrim(v_activity->>'sport'),
        nullif(v_activity->>'instructions', ''),
        v_activity->>'measurementMode',
        nullif(v_activity->'target', 'null'::jsonb), v_now, v_now
      );
    end loop;
    return (v_saved_session_id, v_revision, 'created')::public.saved_session_receipt;
  end if;

  -- Edit and delete both answer to the revision the owner last read.
  if p_saved_session_id is null or p_expected_revision is null
    or p_expected_revision < 0
    or (p_operation = 'delete' and (
      p_name is not null or p_title is not null or p_sport is not null
      or p_intent is not null or p_expected_duration_minutes is not null
      or p_note is not null))
    -- An edit changes the record's own fields. There is no activity editor
    -- anywhere yet, so an edit carries no activity list and leaves the copied
    -- one exactly as it was saved.
    or p_activities is not null
  then
    raise exception using errcode = '22023', message = 'Invalid saved session change.';
  end if;

  -- ADR-010. The wait is bounded, so a second same-owner save gets an answer
  -- rather than hanging. Locking the one row rather than the whole library
  -- lets two different saved sessions be edited at the same time.
  perform pg_catalog.set_config('lock_timeout', '3s', true);
  begin
    select saved_session.revision into v_revision
    from public.saved_sessions saved_session
    where saved_session.id = p_saved_session_id
      and saved_session.user_id = v_user_id
    for update;
  exception when lock_not_available then
    raise exception using errcode = 'PT409',
      message = 'That saved session changed. Reload and try again.';
  end;

  -- A record another owner holds, or one already deleted elsewhere, is
  -- reported the same way: it changed. That is honest and leaks nothing.
  if v_revision is null or v_revision <> p_expected_revision then
    raise exception using errcode = 'PT409',
      message = 'That saved session changed. Reload and try again.';
  end if;

  if p_operation = 'delete' then
    delete from public.saved_sessions
    where id = p_saved_session_id and user_id = v_user_id;
    return (p_saved_session_id, v_revision, 'deleted')::public.saved_session_receipt;
  end if;

  update public.saved_sessions set
    name = pg_catalog.btrim(p_name),
    title = pg_catalog.btrim(p_title),
    sport = pg_catalog.btrim(p_sport),
    intent = nullif(p_intent, ''),
    expected_duration_minutes = p_expected_duration_minutes,
    note = nullif(p_note, ''),
    revision = v_revision + 1,
    updated_at = v_now
  where id = p_saved_session_id and user_id = v_user_id;
  return (p_saved_session_id, v_revision + 1, 'updated')::public.saved_session_receipt;
exception
  when unique_violation or foreign_key_violation or check_violation
    or not_null_violation then
    raise exception using errcode = '22023', message = 'Invalid saved session change.';
end;
$$;

revoke all privileges on function public.saved_session_activity_input_is_valid(jsonb)
  from public, anon, authenticated, service_role;
revoke all privileges on function public.apply_saved_session_change(
  text, uuid, bigint, text, text, text, text, integer, text, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.apply_saved_session_change(
  text, uuid, bigint, text, text, text, text, integer, text, jsonb
) to authenticated;
