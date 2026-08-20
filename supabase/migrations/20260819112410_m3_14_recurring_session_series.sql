-- M3-14: the recurring session series foundation.
--
-- ADR-017 decided that an occurrence inside the Plan's fourteen-day owner-local
-- window is an ordinary `rolling_plan_sessions` row rather than a projection.
-- This migration adds the rule and the template that produce those rows, the
-- owner-derived function that materializes them, and the three series
-- operations the existing change function now carries.
--
-- Nothing here is user-visible. M3-14B owns the surface.
--
-- Four things are deliberately true of the shape below:
--
--   1. Every date is an owner-local `date`. No timestamp appears in a rule, so
--      expansion across a daylight-saving transition is correct by
--      construction rather than by arithmetic.
--   2. A series is stored as one effective-dated *segment* per row. A
--      this-and-future edit closes the current segment and inserts a successor
--      that points back at it, so what earlier occurrences meant is preserved.
--   3. Series writes reach the database only through
--      `apply_rolling_plan_change_set`. Its transaction, its grouped change
--      set, its single revision advance, and its one honest stale loser are
--      unchanged; it simply understands three more operations.
--   4. Ending a segment *deletes* its future occurrences (ADR-017). The
--      surviving record is a `delete` change entry whose `session_id` is null,
--      which is what lets it outlive the row that
--      `rolling_plan_change_entries_session_fkey` cascades away.
--
-- New owner-visible condition raised by the change function:
--   PT424  a whole-series edit was attempted after the segment already started

-- 1. The weekday set ----------------------------------------------------------

-- A weekly rule names the weekdays it fires on, as Postgres numbers them:
-- 0 is Sunday through 6 is Saturday, matching `extract(dow from date)`. The
-- stored array must be sorted and free of duplicates, so one rule has exactly
-- one representation and two rules can be compared as values.
create function public.rolling_plan_weekday_set_is_valid(p_value smallint[])
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select p_value is not null
    and pg_catalog.array_length(p_value, 1) between 1 and 7
    and p_value <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]
    and p_value = (
      select pg_catalog.array_agg(distinct weekday order by weekday)
      from pg_catalog.unnest(p_value) as weekday
    );
$$;

revoke all privileges on function public.rolling_plan_weekday_set_is_valid(smallint[])
  from public, anon, authenticated, service_role;

-- 2. The series and its template ----------------------------------------------

create table public.rolling_plan_series (
  id uuid primary key,
  user_id uuid not null,
  plan_id uuid not null,
  -- The segment this one succeeds, set only by a this-and-future edit.
  predecessor_series_id uuid,
  frequency text not null,
  interval_count smallint not null,
  weekdays smallint[],
  start_date date not null,
  -- Null is an explicitly open-ended series. Expansion is still bounded,
  -- because the materializer only ever asks for the fourteen-day window.
  end_date date,
  title text not null,
  sport text not null,
  intent text,
  expected_duration_minutes integer,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rolling_plan_series_owner_key unique (id, user_id),
  constraint rolling_plan_series_plan_fkey
    foreign key (plan_id, user_id)
    references public.rolling_plans (id, user_id) on delete cascade,
  constraint rolling_plan_series_predecessor_fkey
    foreign key (predecessor_series_id, user_id)
    references public.rolling_plan_series (id, user_id) on delete cascade,
  constraint rolling_plan_series_frequency_check
    check (frequency in ('daily', 'weekly')),
  constraint rolling_plan_series_rule_check check (
    (
      frequency = 'daily'
      and weekdays is null
      and interval_count between 1 and 365
    )
    or (
      frequency = 'weekly'
      and interval_count between 1 and 52
      and public.rolling_plan_weekday_set_is_valid(weekdays)
    )
  ),
  -- A segment closed on the day before it starts yields no dates at all. That
  -- is exactly what ending a series from its own start date leaves behind, so
  -- it is a reachable state rather than a corrupt one.
  constraint rolling_plan_series_range_check
    check (end_date is null or end_date >= start_date - 1),
  constraint rolling_plan_series_self_check
    check (predecessor_series_id is null or predecessor_series_id <> id),
  constraint rolling_plan_series_title_check
    check (char_length(trim(title)) between 1 and 120),
  constraint rolling_plan_series_sport_check
    check (char_length(trim(sport)) between 1 and 80),
  constraint rolling_plan_series_intent_check
    check (intent is null or char_length(intent) <= 500),
  constraint rolling_plan_series_duration_check
    check (expected_duration_minutes is null
      or expected_duration_minutes between 1 and 10080),
  constraint rolling_plan_series_note_check
    check (note is null or char_length(note) <= 2000)
);

-- The reusable half of a planned activity, exactly as `saved_session_activities`
-- carries it: a Plan lock belongs to a dated session, not to a rule, so an
-- occurrence enters the Plan unlocked.
create table public.rolling_plan_series_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  series_id uuid not null,
  personal_activity_id uuid,
  position smallint not null,
  name text not null,
  sport text not null,
  instructions text,
  measurement_mode text not null,
  target jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rolling_plan_series_activities_owner_key unique (id, user_id),
  constraint rolling_plan_series_activities_series_fkey
    foreign key (series_id, user_id)
    references public.rolling_plan_series (id, user_id) on delete cascade,
  constraint rolling_plan_series_activities_personal_fkey
    foreign key (personal_activity_id, user_id)
    references public.personal_activities (id, user_id),
  constraint rolling_plan_series_activities_order_key
    unique (series_id, position),
  constraint rolling_plan_series_activities_position_check
    check (position between 0 and 99),
  constraint rolling_plan_series_activities_name_check
    check (char_length(trim(name)) between 1 and 120),
  constraint rolling_plan_series_activities_sport_check
    check (char_length(trim(sport)) between 1 and 80),
  constraint rolling_plan_series_activities_instructions_check
    check (instructions is null or char_length(instructions) <= 2000),
  constraint rolling_plan_series_activities_measurement_mode_check check (
    measurement_mode in (
      'sets_reps_load', 'time_distance_pace', 'duration_intensity',
      'skill_repetitions', 'custom'
    )
  ),
  constraint rolling_plan_series_activities_target_check
    check (public.is_valid_training_measurement(measurement_mode, target))
);

create index rolling_plan_series_owner_window_idx
  on public.rolling_plan_series (user_id, start_date, id);
create index rolling_plan_series_plan_idx
  on public.rolling_plan_series (plan_id, user_id);
create index rolling_plan_series_predecessor_idx
  on public.rolling_plan_series (predecessor_series_id, user_id)
  where predecessor_series_id is not null;
create index rolling_plan_series_activities_owner_series_idx
  on public.rolling_plan_series_activities (user_id, series_id, position);
create index rolling_plan_series_activities_personal_idx
  on public.rolling_plan_series_activities (personal_activity_id, user_id)
  where personal_activity_id is not null;

alter table public.rolling_plan_series enable row level security;
alter table public.rolling_plan_series_activities enable row level security;

revoke all privileges on table public.rolling_plan_series
  from public, anon, authenticated, service_role;
revoke all privileges on table public.rolling_plan_series_activities
  from public, anon, authenticated, service_role;

grant select on table public.rolling_plan_series to authenticated;
grant select on table public.rolling_plan_series_activities to authenticated;

create policy rolling_plan_series_owner_select on public.rolling_plan_series
  for select to authenticated using ((select auth.uid()) = user_id);
create policy rolling_plan_series_activities_owner_select
  on public.rolling_plan_series_activities
  for select to authenticated using ((select auth.uid()) = user_id);

-- The change function never updates `user_id`. The triggers state the
-- invariant anyway, so a later privileged path cannot quietly move a series to
-- another owner.
create function public.rolling_plan_series_reject_owner_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception using errcode = '42501',
      message = 'A recurring series owner cannot be reassigned.';
  end if;
  return new;
end;
$$;

revoke all privileges on function public.rolling_plan_series_reject_owner_change()
  from public, anon, authenticated, service_role;

create trigger rolling_plan_series_owner_immutable
  before update on public.rolling_plan_series
  for each row
  execute function public.rolling_plan_series_reject_owner_change();

create trigger rolling_plan_series_activities_owner_immutable
  before update on public.rolling_plan_series_activities
  for each row
  execute function public.rolling_plan_series_reject_owner_change();

-- 3. An occurrence is an ordinary session that remembers its rule -------------

-- All three columns are nullable or defaulted, so every one-off session
-- written before this migration and every one written after it is untouched.
alter table public.rolling_plan_sessions
  add column series_id uuid,
  add column occurrence_date date,
  add column has_diverged boolean not null default false,
  add constraint rolling_plan_sessions_series_fkey
    foreign key (series_id, user_id)
    references public.rolling_plan_series (id, user_id) on delete cascade,
  -- One row per rule date. This is what makes materialization idempotent: a
  -- date the series already covers - diverged, cancelled or untouched - cannot
  -- gain a second occurrence.
  add constraint rolling_plan_sessions_occurrence_key
    unique (series_id, occurrence_date),
  add constraint rolling_plan_sessions_occurrence_check check (
    (series_id is null and occurrence_date is null and not has_diverged)
    or (series_id is not null and occurrence_date is not null)
  );

-- 4. History carries series changes and surviving deletions -------------------

alter table public.rolling_plan_change_entries
  add column series_id uuid,
  add constraint rolling_plan_change_entries_series_fkey
    foreign key (series_id, user_id)
    references public.rolling_plan_series (id, user_id) on delete cascade;

create index rolling_plan_change_entries_series_history_idx
  on public.rolling_plan_change_entries (user_id, series_id, created_at desc)
  where series_id is not null;

alter table public.rolling_plan_change_entries
  drop constraint rolling_plan_change_entries_kind_check,
  drop constraint rolling_plan_change_entries_target_check,
  drop constraint rolling_plan_change_entries_states_check;

alter table public.rolling_plan_change_entries
  add constraint rolling_plan_change_entries_kind_check check (
    change_kind in (
      'add', 'edit', 'move', 'set_lock', 'cancel', 'set_recovery_day',
      'add_series', 'edit_series', 'end_series', 'delete'
    )
  ),
  -- Exactly one target. A `delete` entry names a date and no session, which is
  -- the whole reason it survives `rolling_plan_change_entries_session_fkey`
  -- cascading the row away.
  add constraint rolling_plan_change_entries_target_check check (
    (
      change_kind in ('set_recovery_day', 'delete')
      and session_id is null and series_id is null and local_date is not null
    )
    or (
      change_kind in ('add_series', 'edit_series', 'end_series')
      and session_id is null and series_id is not null and local_date is null
    )
    or (
      change_kind in ('add', 'edit', 'move', 'set_lock', 'cancel')
      and session_id is not null and series_id is null and local_date is null
    )
  ),
  add constraint rolling_plan_change_entries_states_check check (
    (change_kind in ('add', 'add_series') and before_state is null)
    or (change_kind not in ('add', 'add_series') and before_state is not null)
  );

-- 5. Rule expansion -----------------------------------------------------------

-- The only place a recurrence rule becomes dates. It is bounded by its own
-- arguments: the caller asks for a window and gets at most that many rows, so
-- an open-ended series can never produce an unbounded query.
create function public.rolling_plan_series_dates(
  p_frequency text,
  p_interval_count smallint,
  p_weekdays smallint[],
  p_start_date date,
  p_end_date date,
  p_from date,
  p_to date
)
returns setof date
language sql
immutable
security invoker
set search_path = ''
as $$
  select day::date
  from pg_catalog.generate_series(
    greatest(p_start_date, p_from)::timestamp,
    least(coalesce(p_end_date, p_to), p_to)::timestamp,
    '1 day'::interval
  ) as day
  where case
    when p_frequency = 'daily' then
      pg_catalog.mod(
        (day::date - p_start_date)::integer, p_interval_count::integer
      ) = 0
    -- The week the interval counts must be the same week the weekday numbers
    -- describe. `dow` numbers Sunday 0 through Saturday 6, so a week here runs
    -- Sunday to Saturday and is anchored on the week holding the start date.
    -- `date_trunc('week', ...)` would anchor on Monday instead, which splits
    -- every Sunday off into the previous cycle: "every two weeks on Sunday and
    -- Monday" would then fire Monday first and Sunday nine days later.
    when p_frequency = 'weekly' then
      extract(dow from day)::smallint = any(p_weekdays)
      and pg_catalog.mod(
        (
          (day::date - extract(dow from day)::integer)
          - (p_start_date - extract(dow from p_start_date)::integer)
        ) / 7,
        p_interval_count::integer
      ) = 0
    else false
  end;
$$;

revoke all privileges on function public.rolling_plan_series_dates(
  text, smallint, smallint[], date, date, date, date
) from public, anon, authenticated, service_role;

-- 6. The recorded shape of a series -------------------------------------------

create function public.rolling_plan_series_state(p_user_id uuid, p_series_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'predecessorSeriesId', s.predecessor_series_id,
    'frequency', s.frequency,
    'intervalCount', s.interval_count,
    'weekdays', pg_catalog.to_jsonb(s.weekdays),
    'startDate', s.start_date::text,
    'endDate', s.end_date::text,
    'title', s.title,
    'sport', s.sport,
    'intent', s.intent,
    'expectedDurationMinutes', s.expected_duration_minutes,
    'note', s.note,
    'activities', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', a.id,
        'personalActivityId', a.personal_activity_id,
        'position', a.position,
        'name', a.name,
        'sport', a.sport,
        'instructions', a.instructions,
        'measurementMode', a.measurement_mode,
        'target', a.target
      ) order by a.position, a.id)
      from public.rolling_plan_series_activities a
      where a.user_id = p_user_id and a.series_id = p_series_id
    ), '[]'::jsonb)
  )
  from public.rolling_plan_series s
  where s.user_id = p_user_id and s.id = p_series_id;
$$;

revoke all privileges on function public.rolling_plan_series_state(uuid, uuid)
  from public, anon, authenticated, service_role;

-- A series activity carries the same reusable shape as a saved-session
-- activity and, like it, no Plan lock. The validator is written out rather
-- than delegating to `saved_session_activity_input_is_valid`, so the library
-- shape and the series shape can move independently instead of one silently
-- redefining the other.
create function public.rolling_plan_series_activity_input_is_valid(p_value jsonb)
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

revoke all privileges on function public.rolling_plan_series_activity_input_is_valid(jsonb)
  from public, anon, authenticated, service_role;

create function public.rolling_plan_series_input_is_valid(p_value jsonb)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_activity jsonb;
  v_number numeric;
  v_weekday jsonb;
  v_positions smallint[] := array[]::smallint[];
  v_weekdays smallint[] := array[]::smallint[];
begin
  if p_value is null or pg_catalog.jsonb_typeof(p_value) <> 'object'
    or p_value - array[
      'frequency', 'intervalCount', 'weekdays', 'startDate', 'endDate',
      'title', 'sport', 'intent', 'expectedDurationMinutes', 'note',
      'activities'
    ] <> '{}'::jsonb
    or not (p_value ?& array[
      'frequency', 'intervalCount', 'startDate', 'title', 'sport', 'activities'
    ])
    or pg_catalog.jsonb_typeof(p_value->'frequency') <> 'string'
    or pg_catalog.jsonb_typeof(p_value->'intervalCount') <> 'number'
    or pg_catalog.jsonb_typeof(p_value->'startDate') <> 'string'
    or (p_value->>'startDate')::date::text <> p_value->>'startDate'
    or pg_catalog.jsonb_typeof(p_value->'title') <> 'string'
    or pg_catalog.jsonb_typeof(p_value->'sport') <> 'string'
    or pg_catalog.jsonb_typeof(p_value->'activities') <> 'array'
    or pg_catalog.jsonb_array_length(p_value->'activities') > 50
    or pg_catalog.char_length(pg_catalog.btrim(p_value->>'title')) not between 1 and 120
    or pg_catalog.char_length(pg_catalog.btrim(p_value->>'sport')) not between 1 and 80
    or (p_value ? 'intent'
      and pg_catalog.jsonb_typeof(p_value->'intent') not in ('string', 'null'))
    or pg_catalog.char_length(coalesce(p_value->>'intent', '')) > 500
    or (p_value ? 'note'
      and pg_catalog.jsonb_typeof(p_value->'note') not in ('string', 'null'))
    or pg_catalog.char_length(coalesce(p_value->>'note', '')) > 2000
  then return false; end if;

  if p_value ? 'endDate' and pg_catalog.jsonb_typeof(p_value->'endDate') <> 'null'
  then
    if pg_catalog.jsonb_typeof(p_value->'endDate') <> 'string'
      or (p_value->>'endDate')::date::text <> p_value->>'endDate'
      or (p_value->>'endDate')::date < (p_value->>'startDate')::date
    then return false; end if;
  end if;

  if p_value ? 'expectedDurationMinutes'
    and pg_catalog.jsonb_typeof(p_value->'expectedDurationMinutes') <> 'null'
  then
    if pg_catalog.jsonb_typeof(p_value->'expectedDurationMinutes') <> 'number' then
      return false;
    end if;
    v_number := (p_value->>'expectedDurationMinutes')::numeric;
    if v_number <> trunc(v_number) or v_number not between 1 and 10080 then
      return false;
    end if;
  end if;

  v_number := (p_value->>'intervalCount')::numeric;
  if v_number <> trunc(v_number) then return false; end if;

  if p_value->>'frequency' = 'daily' then
    if v_number not between 1 and 365 or p_value ? 'weekdays' then
      return false;
    end if;
  elsif p_value->>'frequency' = 'weekly' then
    if v_number not between 1 and 52
      or pg_catalog.jsonb_typeof(p_value->'weekdays') <> 'array'
      or pg_catalog.jsonb_array_length(p_value->'weekdays') not between 1 and 7
    then return false; end if;
    for v_weekday in
      select value from pg_catalog.jsonb_array_elements(p_value->'weekdays')
    loop
      if pg_catalog.jsonb_typeof(v_weekday) <> 'number' then return false; end if;
      v_number := v_weekday::text::numeric;
      if v_number <> trunc(v_number) or v_number not between 0 and 6
        or v_number::smallint = any(v_weekdays)
      then return false; end if;
      v_weekdays := v_weekdays || v_number::smallint;
    end loop;
  else
    return false;
  end if;

  for v_activity in
    select value from pg_catalog.jsonb_array_elements(p_value->'activities')
  loop
    if not public.rolling_plan_series_activity_input_is_valid(v_activity) then
      return false;
    end if;
    v_number := (v_activity->>'position')::numeric;
    if v_number::smallint = any(v_positions) then return false; end if;
    v_positions := v_positions || v_number::smallint;
  end loop;
  return true;
exception when others then return false;
end;
$$;

revoke all privileges on function public.rolling_plan_series_input_is_valid(jsonb)
  from public, anon, authenticated, service_role;

-- 7. A session's recorded state now carries its occurrence identity ----------

-- `before_state` on a `delete` entry is the only surviving trace of a removed
-- occurrence, so it has to say which rule produced it and whether the owner had
-- changed it.
create or replace function public.rolling_plan_session_state(
  p_user_id uuid,
  p_session_id uuid
)
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
    'seriesId', s.series_id,
    'occurrenceDate', s.occurrence_date::text,
    'hasDiverged', s.has_diverged,
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

-- An `add` may carry an occurrence identity. Nothing outside this database
-- ever composes one: the TypeScript parser rejects both keys, and the only
-- producer is `materialize_rolling_plan_series` below.
create or replace function public.rolling_plan_session_input_is_valid(
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
      'expectedDurationMinutes', 'note', 'isLocked', 'activities',
      'seriesId', 'occurrenceDate'
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

    -- An occurrence names both halves of its identity or neither.
    if (p_value ? 'seriesId') <> (p_value ? 'occurrenceDate') then return false; end if;
    if p_value ? 'seriesId' then
      if pg_catalog.jsonb_typeof(p_value->'seriesId') <> 'string'
        or pg_catalog.jsonb_typeof(p_value->'occurrenceDate') <> 'string'
        or (p_value->>'occurrenceDate')::date::text <> p_value->>'occurrenceDate'
      then return false; end if;
      perform (p_value->>'seriesId')::uuid;
    end if;
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

-- 8. The bounded read carries occurrence identity -----------------------------

create or replace function public.get_rolling_plan_slice(
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
      session.series_id,
      session.occurrence_date,
      session.has_diverged,
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
          'seriesId', session.series_id,
          'occurrenceDate', session.occurrence_date,
          'hasDiverged', session.has_diverged,
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

-- 9. Removing the future occurrences of one segment ---------------------------

-- ADR-017: ending a segment deletes rather than cancels, because a cancelled
-- tombstone per occurrence makes the Plan unreadable. Three exclusions are
-- absolute and all three live here:
--
--   * a locked occurrence is kept and left active - a lock now excludes a
--     session from bulk removal, not only from AI replacement;
--   * an occurrence whose date has already passed is history and is never in
--     scope, whatever its rule date says;
--   * only occurrences of this segment on or after the effective rule date are
--     swept, so the sweep runs forward only.
--
-- Everything else goes, including an occurrence the owner had edited. Each
-- deletion leaves a `delete` entry with a null `session_id`, which survives the
-- cascade that destroys the row's own earlier entries.
create function public.rolling_plan_sweep_series_occurrences(
  p_user_id uuid,
  p_plan_id uuid,
  p_change_set_id uuid,
  p_series_id uuid,
  p_from_date date,
  p_today date,
  p_first_ordinal integer,
  p_now timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_occurrence record;
  v_ordinal integer := p_first_ordinal;
  v_deleted integer := 0;
  v_diverged integer := 0;
  v_locked_kept integer := 0;
begin
  select pg_catalog.count(*) into v_locked_kept
  from public.rolling_plan_sessions occurrence
  where occurrence.user_id = p_user_id
    and occurrence.series_id = p_series_id
    and occurrence.occurrence_date >= p_from_date
    and occurrence.local_date >= p_today
    and occurrence.is_locked;

  for v_occurrence in
    select occurrence.id, occurrence.local_date, occurrence.has_diverged
    from public.rolling_plan_sessions occurrence
    where occurrence.user_id = p_user_id
      and occurrence.series_id = p_series_id
      and occurrence.occurrence_date >= p_from_date
      and occurrence.local_date >= p_today
      and not occurrence.is_locked
    order by occurrence.local_date, occurrence.position, occurrence.id
    for update
  loop
    insert into public.rolling_plan_change_entries (
      user_id, plan_id, change_set_id, session_id, series_id, local_date,
      ordinal, change_kind, before_state, after_state, created_at
    ) values (
      p_user_id, p_plan_id, p_change_set_id, null, null,
      v_occurrence.local_date, v_ordinal, 'delete',
      public.rolling_plan_session_state(p_user_id, v_occurrence.id),
      pg_catalog.jsonb_build_object(
        'localDate', v_occurrence.local_date::text, 'deleted', true
      ),
      p_now
    );
    delete from public.rolling_plan_sessions
    where id = v_occurrence.id and user_id = p_user_id;
    v_ordinal := v_ordinal + 1;
    v_deleted := v_deleted + 1;
    if v_occurrence.has_diverged then v_diverged := v_diverged + 1; end if;
  end loop;

  return pg_catalog.jsonb_build_object(
    'deleted', v_deleted,
    'divergedDeleted', v_diverged,
    'lockedKept', v_locked_kept,
    'nextOrdinal', v_ordinal
  );
end;
$$;

revoke all privileges on function public.rolling_plan_sweep_series_occurrences(
  uuid, uuid, uuid, uuid, date, date, integer, timestamptz
) from public, anon, authenticated, service_role;

-- 10. One occurrence identity per rule date -----------------------------------

-- Derived rather than random so a materialization retried under the same
-- idempotency key composes a byte-identical request and replays cleanly
-- instead of colliding with its own earlier attempt.
create function public.rolling_plan_occurrence_id(
  p_series_id uuid,
  p_occurrence_date date
)
returns uuid
language sql
immutable
security invoker
set search_path = ''
as $$
  select (
    pg_catalog.substr(digest_hex, 1, 8) || '-'
    || pg_catalog.substr(digest_hex, 9, 4) || '-4'
    || pg_catalog.substr(digest_hex, 14, 3) || '-8'
    || pg_catalog.substr(digest_hex, 18, 3) || '-'
    || pg_catalog.substr(digest_hex, 21, 12)
  )::uuid
  from (
    select pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
      p_series_id::text || '|' || p_occurrence_date::text, 'UTF8'
    ), 'sha256'), 'hex') as digest_hex
  ) as derived;
$$;

revoke all privileges on function public.rolling_plan_occurrence_id(uuid, date)
  from public, anon, authenticated, service_role;

-- 11. Series template activities ----------------------------------------------

create function public.rolling_plan_weekday_set(p_value jsonb)
returns smallint[]
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when p_value is null or pg_catalog.jsonb_typeof(p_value) <> 'array' then null
    else (
      select pg_catalog.array_agg(distinct (element#>>'{}')::smallint
        order by (element#>>'{}')::smallint)
      from pg_catalog.jsonb_array_elements(p_value) as element
    )
  end;
$$;

revoke all privileges on function public.rolling_plan_weekday_set(jsonb)
  from public, anon, authenticated, service_role;

-- A series template owns its activities outright: replacing them is how an
-- edit changes them, exactly as an `edit` on a session replaces that session's.
create function public.rolling_plan_replace_series_activities(
  p_user_id uuid,
  p_series_id uuid,
  p_activities jsonb,
  p_now timestamptz
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_activity jsonb;
begin
  delete from public.rolling_plan_series_activities
  where series_id = p_series_id and user_id = p_user_id;

  for v_activity in
    select value from pg_catalog.jsonb_array_elements(p_activities)
  loop
    if v_activity ? 'personalActivityId'
      and pg_catalog.jsonb_typeof(v_activity->'personalActivityId') <> 'null'
      and not exists (
        select 1 from public.personal_activities
        where id = (v_activity->>'personalActivityId')::uuid
          and user_id = p_user_id
      )
    then
      raise exception using errcode = '22023',
        message = 'Invalid rolling plan series activity.';
    end if;
    insert into public.rolling_plan_series_activities (
      user_id, series_id, personal_activity_id, position, name, sport,
      instructions, measurement_mode, target, created_at, updated_at
    ) values (
      p_user_id, p_series_id,
      (v_activity->>'personalActivityId')::uuid,
      (v_activity->>'position')::smallint,
      pg_catalog.btrim(v_activity->>'name'),
      pg_catalog.btrim(v_activity->>'sport'),
      nullif(v_activity->>'instructions', ''),
      v_activity->>'measurementMode',
      nullif(v_activity->'target', 'null'::jsonb),
      p_now, p_now
    );
  end loop;
end;
$$;

revoke all privileges on function public.rolling_plan_replace_series_activities(
  uuid, uuid, jsonb, timestamptz
) from public, anon, authenticated, service_role;

-- 12. The change function carries the three series operations -----------------

-- The receipt gains one field. A series operation that removes occurrences has
-- to report how many went, how many of those the owner had edited, and how many
-- locked ones it deliberately left alone; nothing else in the transaction can
-- carry that back.
drop function public.apply_rolling_plan_change_set(bigint, uuid, text, jsonb);
drop type public.rolling_plan_change_receipt;

create type public.rolling_plan_change_receipt as (
  plan_id uuid,
  plan_revision bigint,
  change_set_id uuid,
  result text,
  series_effects jsonb
);

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
  v_series public.rolling_plan_series;
  v_series_id uuid;
  v_series_input jsonb;
  v_effective_date date;
  v_successor_series_id uuid;
  v_sweep_from date;
  v_sweep jsonb;
  v_series_effects jsonb := '[]'::jsonb;
  v_occurrence_series_id uuid;
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
    return (
      v_existing.plan_id, v_existing.plan_revision, v_existing.id, 'replayed', null
    )::public.rolling_plan_change_receipt;
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
    v_series_id := null;
    v_successor_series_id := null;
    v_sweep_from := null;

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
    elsif v_operation in ('add_series', 'edit_series', 'end_series') then
      if not (v_change ? 'seriesId')
        or pg_catalog.jsonb_typeof(v_change->'seriesId') <> 'string'
      then raise exception using errcode = '22023', message = 'Invalid rolling plan series change.'; end if;
      begin v_series_id := (v_change->>'seriesId')::uuid;
      exception when others then
        raise exception using errcode = '22023', message = 'Invalid rolling plan series change.';
      end;

      if v_operation = 'add_series' then
        if v_change - array['operation', 'seriesId', 'series'] <> '{}'::jsonb
          or not (v_change ? 'series')
          or not public.rolling_plan_series_input_is_valid(v_change->'series')
          or exists (select 1 from public.rolling_plan_series where id = v_series_id)
        then raise exception using errcode = '22023', message = 'Invalid rolling plan series.'; end if;
        v_series_input := v_change->'series';
        if (v_series_input->>'startDate')::date < v_today then
          raise exception using errcode = 'PT422',
            message = 'A plan change cannot target a date before today.';
        end if;
        insert into public.rolling_plan_series (
          id, user_id, plan_id, predecessor_series_id, frequency, interval_count,
          weekdays, start_date, end_date, title, sport, intent,
          expected_duration_minutes, note, created_at, updated_at
        ) values (
          v_series_id, v_user_id, v_plan.id, null,
          v_series_input->>'frequency',
          (v_series_input->>'intervalCount')::smallint,
          public.rolling_plan_weekday_set(v_series_input->'weekdays'),
          (v_series_input->>'startDate')::date,
          (v_series_input->>'endDate')::date,
          pg_catalog.btrim(v_series_input->>'title'),
          pg_catalog.btrim(v_series_input->>'sport'),
          nullif(v_series_input->>'intent', ''),
          (v_series_input->>'expectedDurationMinutes')::integer,
          nullif(v_series_input->>'note', ''),
          v_now, v_now
        );
        perform public.rolling_plan_replace_series_activities(
          v_user_id, v_series_id, v_series_input->'activities', v_now
        );
        v_after := public.rolling_plan_series_state(v_user_id, v_series_id);
      else
        select * into v_series from public.rolling_plan_series
        where id = v_series_id and user_id = v_user_id for update;
        if not found then
          raise exception using errcode = '22023', message = 'Invalid rolling plan series change.';
        end if;
        v_before := public.rolling_plan_series_state(v_user_id, v_series_id);

        if v_operation = 'end_series' then
          if v_change - array['operation', 'seriesId', 'effectiveDate'] <> '{}'::jsonb
            or not (v_change ? 'effectiveDate')
            or pg_catalog.jsonb_typeof(v_change->'effectiveDate') <> 'string'
            or (v_change->>'effectiveDate')::date::text <> v_change->>'effectiveDate'
          then raise exception using errcode = '22023', message = 'Invalid rolling plan series change.'; end if;
          v_effective_date := (v_change->>'effectiveDate')::date;
          if v_effective_date < v_today then
            raise exception using errcode = 'PT422',
              message = 'A plan change cannot target a date before today.';
          end if;
          -- Ending a segment never lengthens it. A segment that already
          -- ends earlier keeps its own end date, because the sweep below only
          -- runs from the effective date forward and so could never remove the
          -- occurrences a pushed-out end date would let the next
          -- materialization write into the reopened gap.
          update public.rolling_plan_series set
            end_date = least(
              coalesce(end_date, 'infinity'::date), v_effective_date - 1
            ),
            updated_at = v_now
          where id = v_series_id and user_id = v_user_id;
          v_sweep_from := v_effective_date;
          v_after := public.rolling_plan_series_state(v_user_id, v_series_id);
        elsif v_change ? 'effectiveDate' then
          -- This and future: close the running segment and open a successor
          -- that points back at it. Occurrences before the split date are never
          -- touched, so what they meant is preserved.
          if v_change - array[
            'operation', 'seriesId', 'effectiveDate', 'successorSeriesId', 'series'
          ] <> '{}'::jsonb
            or not (v_change ?& array['successorSeriesId', 'series'])
            or pg_catalog.jsonb_typeof(v_change->'effectiveDate') <> 'string'
            or (v_change->>'effectiveDate')::date::text <> v_change->>'effectiveDate'
            or pg_catalog.jsonb_typeof(v_change->'successorSeriesId') <> 'string'
            or not public.rolling_plan_series_input_is_valid(v_change->'series')
          then raise exception using errcode = '22023', message = 'Invalid rolling plan series change.'; end if;
          v_series_input := v_change->'series';
          v_effective_date := (v_change->>'effectiveDate')::date;
          begin v_successor_series_id := (v_change->>'successorSeriesId')::uuid;
          exception when others then
            raise exception using errcode = '22023', message = 'Invalid rolling plan series change.';
          end;
          if v_effective_date < v_today then
            raise exception using errcode = 'PT422',
              message = 'A plan change cannot target a date before today.';
          end if;
          -- The successor starts on the split date and the predecessor keeps
          -- at least its own first day, so a split is never a whole-series
          -- edit wearing a different name.
          if v_effective_date <= v_series.start_date
            or (v_series_input->>'startDate')::date <> v_effective_date
            or exists (select 1 from public.rolling_plan_series where id = v_successor_series_id)
          then raise exception using errcode = '22023', message = 'Invalid rolling plan series change.'; end if;
          -- Closing the predecessor never lengthens it either; the clamp is
          -- the same one `end_series` applies, for the same reason.
          update public.rolling_plan_series set
            end_date = least(
              coalesce(end_date, 'infinity'::date), v_effective_date - 1
            ),
            updated_at = v_now
          where id = v_series_id and user_id = v_user_id
          returning end_date into v_series.end_date;
          insert into public.rolling_plan_series (
            id, user_id, plan_id, predecessor_series_id, frequency, interval_count,
            weekdays, start_date, end_date, title, sport, intent,
            expected_duration_minutes, note, created_at, updated_at
          ) values (
            v_successor_series_id, v_user_id, v_plan.id, v_series_id,
            v_series_input->>'frequency',
            (v_series_input->>'intervalCount')::smallint,
            public.rolling_plan_weekday_set(v_series_input->'weekdays'),
            v_effective_date,
            (v_series_input->>'endDate')::date,
            pg_catalog.btrim(v_series_input->>'title'),
            pg_catalog.btrim(v_series_input->>'sport'),
            nullif(v_series_input->>'intent', ''),
            (v_series_input->>'expectedDurationMinutes')::integer,
            nullif(v_series_input->>'note', ''),
            v_now, v_now
          );
          perform public.rolling_plan_replace_series_activities(
            v_user_id, v_successor_series_id, v_series_input->'activities', v_now
          );
          v_sweep_from := v_effective_date;
          v_after := public.rolling_plan_series_state(v_user_id, v_successor_series_id)
            || pg_catalog.jsonb_build_object(
              'predecessorSeriesId', v_series_id,
              'predecessorEndDate', v_series.end_date::text
            );
        else
          -- A whole-series edit rewrites what every occurrence of the segment
          -- means, so it is only offered while the segment has not started.
          if v_change - array['operation', 'seriesId', 'series'] <> '{}'::jsonb
            or not (v_change ? 'series')
            or not public.rolling_plan_series_input_is_valid(v_change->'series')
          then raise exception using errcode = '22023', message = 'Invalid rolling plan series change.'; end if;
          -- No occurrence can precede the segment's own start date, so a
          -- segment that still starts today or later has had none.
          if v_series.start_date < v_today then
            raise exception using errcode = 'PT424',
              message = 'This series has already started. Change it from a date instead.';
          end if;
          v_series_input := v_change->'series';
          if (v_series_input->>'startDate')::date < v_today then
            raise exception using errcode = 'PT422',
              message = 'A plan change cannot target a date before today.';
          end if;
          update public.rolling_plan_series set
            frequency = v_series_input->>'frequency',
            interval_count = (v_series_input->>'intervalCount')::smallint,
            weekdays = public.rolling_plan_weekday_set(v_series_input->'weekdays'),
            start_date = (v_series_input->>'startDate')::date,
            end_date = (v_series_input->>'endDate')::date,
            title = pg_catalog.btrim(v_series_input->>'title'),
            sport = pg_catalog.btrim(v_series_input->>'sport'),
            intent = nullif(v_series_input->>'intent', ''),
            expected_duration_minutes = (v_series_input->>'expectedDurationMinutes')::integer,
            note = nullif(v_series_input->>'note', ''),
            updated_at = v_now
          where id = v_series_id and user_id = v_user_id;
          perform public.rolling_plan_replace_series_activities(
            v_user_id, v_series_id, v_series_input->'activities', v_now
          );
          -- The rule changed, so every occurrence it already produced is stale.
          v_sweep_from := least(
            v_series.start_date, (v_series_input->>'startDate')::date
          );
          v_after := public.rolling_plan_series_state(v_user_id, v_series_id);
        end if;
      end if;
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
        v_occurrence_series_id := (v_session_input->>'seriesId')::uuid;
        if v_occurrence_series_id is not null and not exists (
          select 1 from public.rolling_plan_series
          where id = v_occurrence_series_id and user_id = v_user_id
        ) then
          raise exception using errcode = '22023', message = 'Invalid rolling plan addition.';
        end if;
        v_session_dates := v_session_dates || v_local_date;
        insert into public.rolling_plan_sessions (
          id, user_id, plan_id, local_date, position, title, sport, intent,
          expected_duration_minutes, note, is_locked, status, series_id,
          occurrence_date, has_diverged, created_at, updated_at
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
          'active', v_occurrence_series_id,
          (v_session_input->>'occurrenceDate')::date,
          false, v_now, v_now
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

        -- ADR-017: an occurrence the owner has changed is diverged from its
        -- rule from here on. The materializer never revisits an existing
        -- occurrence, and the divergence is what a later consumer reads.
        update public.rolling_plan_sessions set has_diverged = true
        where id = v_session_id and user_id = v_user_id
          and series_id is not null and not has_diverged;
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
      user_id, plan_id, change_set_id, session_id, series_id, local_date,
      ordinal, change_kind, before_state, after_state, created_at
    ) values (
      v_user_id, v_plan.id, v_change_set_id,
      case when v_operation in ('add', 'edit', 'move', 'set_lock', 'cancel')
        then v_session_id else null end,
      case when v_operation = 'add_series' then v_series_id
        when v_operation = 'end_series' then v_series_id
        when v_operation = 'edit_series'
          then coalesce(v_successor_series_id, v_series_id)
        else null end,
      case when v_operation = 'set_recovery_day' then v_local_date else null end,
      v_ordinal, v_operation, v_before, v_after, v_now
    );
    v_ordinal := v_ordinal + 1;

    if v_sweep_from is not null then
      v_sweep := public.rolling_plan_sweep_series_occurrences(
        v_user_id, v_plan.id, v_change_set_id, v_series_id,
        v_sweep_from, v_today, v_ordinal, v_now
      );
      v_ordinal := (v_sweep->>'nextOrdinal')::integer;
      v_series_effects := v_series_effects || pg_catalog.jsonb_build_object(
        'seriesId', v_series_id,
        'operation', v_operation,
        'deleted', v_sweep->'deleted',
        'divergedDeleted', v_sweep->'divergedDeleted',
        'lockedKept', v_sweep->'lockedKept'
      );
    end if;
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
  return (
    v_plan.id, v_new_revision, v_change_set_id, 'applied',
    case when pg_catalog.jsonb_array_length(v_series_effects) = 0
      then null else v_series_effects end
  )::public.rolling_plan_change_receipt;
exception
  when unique_violation or foreign_key_violation or check_violation or invalid_datetime_format then
    raise exception using errcode = '22023', message = 'Invalid rolling plan change set.';
end;
$$;

revoke all privileges on function public.apply_rolling_plan_change_set(bigint, uuid, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.apply_rolling_plan_change_set(bigint, uuid, text, jsonb)
  to authenticated;

-- 13. Materialization ---------------------------------------------------------

create type public.rolling_plan_materialization_receipt as (
  plan_id uuid,
  plan_revision bigint,
  change_set_id uuid,
  result text,
  created_count integer,
  skipped jsonb
);

-- The owner-derived top-up. It writes every occurrence the fourteen-day
-- owner-local window is missing as ordinary `add` changes in one change set
-- under the machine provenance `series_expansion`, and it returns `unchanged`
-- without advancing the revision when nothing is missing.
--
-- That last property is not a nicety. Two open tabs both call this; the second
-- must be able to learn "you are already current" without consuming a revision
-- and without being told its own revision is stale. So the missing set is
-- computed before the revision is compared at all, and the comparison happens
-- only inside `apply_rolling_plan_change_set`, which is reached only when there
-- is something to write. A caller that loses that race gets one honest PT409.
--
-- A date already holding ten active sessions is skipped rather than refused:
-- the series survives, and the dates it could not reach are returned so a
-- surface can say so. Nothing here can report them to an owner who is not
-- looking - that is a known M3-14 limitation, not an oversight.
create function public.materialize_rolling_plan_series(
  p_expected_plan_revision bigint,
  p_idempotency_key uuid
)
returns public.rolling_plan_materialization_receipt
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_timezone text;
  v_today date;
  v_window_end date;
  v_plan public.rolling_plans;
  v_series public.rolling_plan_series;
  v_date date;
  v_key text;
  v_count integer;
  v_position integer;
  v_counts jsonb;
  v_positions jsonb;
  v_activities jsonb;
  v_changes jsonb := '[]'::jsonb;
  v_skipped jsonb := '[]'::jsonb;
  v_receipt public.rolling_plan_change_receipt;
begin
  if v_user_id is null then
    raise exception using errcode = '42501',
      message = 'An authenticated FitTip user is required.';
  end if;
  if p_expected_plan_revision is null or p_expected_plan_revision < 0
    or p_idempotency_key is null
  then
    raise exception using errcode = '22023',
      message = 'Invalid rolling plan materialization.';
  end if;

  select profile.timezone_name into v_timezone
  from public.profiles profile where profile.user_id = v_user_id;
  if v_timezone is null then
    raise exception using errcode = 'PT428',
      message = 'Confirm your time zone before changing your plan.';
  end if;
  -- The window is owner-local and comes from the stored zone alone. A caller
  -- cannot name a date, so it cannot widen what gets written.
  v_today := (pg_catalog.timezone(v_timezone, v_now))::date;
  v_window_end := v_today + 13;

  select * into v_plan from public.rolling_plans where user_id = v_user_id;
  if not found then
    return (null, 0::bigint, null, 'unchanged', 0, '[]'::jsonb)
      ::public.rolling_plan_materialization_receipt;
  end if;

  select coalesce(pg_catalog.jsonb_object_agg(dated.local_date::text, dated.total), '{}'::jsonb)
  into v_counts
  from (
    select session.local_date, pg_catalog.count(*)::integer as total
    from public.rolling_plan_sessions session
    where session.user_id = v_user_id and session.status = 'active'
      and session.local_date between v_today and v_window_end
    group by session.local_date
  ) as dated;

  select coalesce(pg_catalog.jsonb_object_agg(dated.local_date::text, dated.highest), '{}'::jsonb)
  into v_positions
  from (
    select session.local_date, pg_catalog.max(session.position)::integer as highest
    from public.rolling_plan_sessions session
    where session.user_id = v_user_id and session.status = 'active'
      and session.local_date between v_today and v_window_end
    group by session.local_date
  ) as dated;

  for v_series in
    select series.* from public.rolling_plan_series series
    where series.user_id = v_user_id
      and series.start_date <= v_window_end
      and (series.end_date is null or series.end_date >= v_today)
    order by series.created_at, series.id
  loop
    v_activities := coalesce((
      select pg_catalog.jsonb_agg(ordered.item order by ordered.position)
      from (
        select
          activity.position,
          pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
            'personalActivityId', activity.personal_activity_id,
            'position', activity.position,
            'name', activity.name,
            'sport', activity.sport,
            'instructions', activity.instructions,
            'measurementMode', activity.measurement_mode,
            'target', activity.target
          )) || pg_catalog.jsonb_build_object('isLocked', false) as item
        from public.rolling_plan_series_activities activity
        where activity.user_id = v_user_id and activity.series_id = v_series.id
      ) as ordered
    ), '[]'::jsonb);

    for v_date in
      select rule_date from public.rolling_plan_series_dates(
        v_series.frequency, v_series.interval_count, v_series.weekdays,
        v_series.start_date, v_series.end_date, v_today, v_window_end
      ) as rule_date
    loop
      -- A date the series already covers is never revisited, whether the
      -- occurrence is untouched, diverged, or cancelled.
      if exists (
        select 1 from public.rolling_plan_sessions occurrence
        where occurrence.series_id = v_series.id
          and occurrence.occurrence_date = v_date
      ) then continue; end if;

      v_key := v_date::text;
      v_count := coalesce((v_counts->>v_key)::integer, 0);
      if v_count >= 10 then
        v_skipped := v_skipped || pg_catalog.jsonb_build_object(
          'seriesId', v_series.id,
          'occurrenceDate', v_key,
          'reason', 'daily_session_limit'
        );
        continue;
      end if;
      -- `apply_rolling_plan_change_set` accepts at most one hundred changes, so
      -- a very full window is finished by the next call rather than refused.
      if pg_catalog.jsonb_array_length(v_changes) >= 100 then
        v_skipped := v_skipped || pg_catalog.jsonb_build_object(
          'seriesId', v_series.id,
          'occurrenceDate', v_key,
          'reason', 'change_set_limit'
        );
        continue;
      end if;

      v_position := coalesce((v_positions->>v_key)::integer, -1) + 1;
      v_changes := v_changes || pg_catalog.jsonb_build_object(
        'operation', 'add',
        'sessionId', public.rolling_plan_occurrence_id(v_series.id, v_date),
        'session', pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
          'localDate', v_key,
          'title', v_series.title,
          'sport', v_series.sport,
          'intent', v_series.intent,
          'expectedDurationMinutes', v_series.expected_duration_minutes,
          'note', v_series.note,
          'seriesId', v_series.id,
          'occurrenceDate', v_key
        )) || pg_catalog.jsonb_build_object(
          'position', v_position,
          'isLocked', false,
          'activities', v_activities
        )
      );
      v_counts := v_counts || pg_catalog.jsonb_build_object(v_key, v_count + 1);
      v_positions := v_positions || pg_catalog.jsonb_build_object(v_key, v_position);
    end loop;
  end loop;

  if pg_catalog.jsonb_array_length(v_changes) = 0 then
    return (
      v_plan.id, v_plan.revision, null, 'unchanged', 0, v_skipped
    )::public.rolling_plan_materialization_receipt;
  end if;

  v_receipt := public.apply_rolling_plan_change_set(
    p_expected_plan_revision, p_idempotency_key, 'series_expansion', v_changes
  );
  return (
    v_receipt.plan_id, v_receipt.plan_revision, v_receipt.change_set_id,
    v_receipt.result, pg_catalog.jsonb_array_length(v_changes), v_skipped
  )::public.rolling_plan_materialization_receipt;
end;
$$;

revoke all privileges on function public.materialize_rolling_plan_series(bigint, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.materialize_rolling_plan_series(bigint, uuid)
  to authenticated;
