create function public.is_valid_training_measurement(
  p_mode text,
  p_value jsonb
)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_first numeric;
  v_second numeric;
  v_third numeric;
begin
  if p_value is null then
    return true;
  end if;

  if jsonb_typeof(p_value) is distinct from 'object'
    or octet_length(p_value::text) > 4096 then
    return false;
  end if;

  if p_mode = 'sets_reps_load' then
    if p_value - array['sets', 'reps', 'load', 'load_unit'] <> '{}'::jsonb
      or jsonb_typeof(p_value -> 'sets') is distinct from 'number'
      or jsonb_typeof(p_value -> 'reps') is distinct from 'number'
      or (
        p_value ? 'load'
        and jsonb_typeof(p_value -> 'load') is distinct from 'number'
      )
      or (
        p_value ? 'load'
        and jsonb_typeof(p_value -> 'load_unit') is distinct from 'string'
      )
      or (
        not (p_value ? 'load')
        and p_value ? 'load_unit'
      ) then
      return false;
    end if;

    v_first := (p_value ->> 'sets')::numeric;
    v_second := (p_value ->> 'reps')::numeric;
    if v_first <> trunc(v_first) or v_first not between 1 and 100
      or v_second <> trunc(v_second) or v_second not between 1 and 10000 then
      return false;
    end if;

    if p_value ? 'load' then
      v_third := (p_value ->> 'load')::numeric;
      if v_third < 0 or v_third > 100000
        or p_value ->> 'load_unit' not in ('kg', 'lb') then
        return false;
      end if;
    end if;

    return true;
  end if;

  if p_mode = 'time_distance_pace' then
    if p_value - array[
      'duration_seconds',
      'distance',
      'distance_unit',
      'pace_seconds_per_unit',
      'pace_unit'
    ] <> '{}'::jsonb
      or not (
        p_value ? 'duration_seconds'
        or p_value ? 'distance'
        or p_value ? 'pace_seconds_per_unit'
      ) then
      return false;
    end if;

    if p_value ? 'duration_seconds' then
      if jsonb_typeof(p_value -> 'duration_seconds') is distinct from 'number' then
        return false;
      end if;
      v_first := (p_value ->> 'duration_seconds')::numeric;
      if v_first <= 0 or v_first > 604800 then
        return false;
      end if;
    end if;

    if p_value ? 'distance' then
      if jsonb_typeof(p_value -> 'distance') is distinct from 'number'
        or jsonb_typeof(p_value -> 'distance_unit') is distinct from 'string' then
        return false;
      end if;
      v_second := (p_value ->> 'distance')::numeric;
      if v_second <= 0 or v_second > 1000000
        or p_value ->> 'distance_unit' not in ('m', 'km', 'mi', 'yd') then
        return false;
      end if;
    elsif p_value ? 'distance_unit' then
      return false;
    end if;

    if p_value ? 'pace_seconds_per_unit' then
      if jsonb_typeof(p_value -> 'pace_seconds_per_unit') is distinct from 'number'
        or jsonb_typeof(p_value -> 'pace_unit') is distinct from 'string' then
        return false;
      end if;
      v_third := (p_value ->> 'pace_seconds_per_unit')::numeric;
      if v_third <= 0 or v_third > 86400
        or p_value ->> 'pace_unit' not in (
          'sec/km',
          'sec/mi',
          'sec/100m',
          'sec/100yd'
        ) then
        return false;
      end if;
    elsif p_value ? 'pace_unit' then
      return false;
    end if;

    return true;
  end if;

  if p_mode = 'duration_intensity' then
    if p_value - array[
      'duration_minutes',
      'intensity',
      'perceived_effort'
    ] <> '{}'::jsonb
      or jsonb_typeof(p_value -> 'duration_minutes') is distinct from 'number'
      or not (p_value ? 'intensity' or p_value ? 'perceived_effort') then
      return false;
    end if;

    v_first := (p_value ->> 'duration_minutes')::numeric;
    if v_first <= 0 or v_first > 10080 then
      return false;
    end if;

    if p_value ? 'intensity' and (
      jsonb_typeof(p_value -> 'intensity') is distinct from 'string'
      or p_value ->> 'intensity' not in ('easy', 'moderate', 'hard', 'very_hard')
    ) then
      return false;
    end if;

    if p_value ? 'perceived_effort' then
      if jsonb_typeof(p_value -> 'perceived_effort') is distinct from 'number' then
        return false;
      end if;
      v_second := (p_value ->> 'perceived_effort')::numeric;
      if v_second <> trunc(v_second) or v_second not between 1 and 10 then
        return false;
      end if;
    end if;

    return true;
  end if;

  if p_mode = 'skill_repetitions' then
    if p_value - array['repetitions', 'unit'] <> '{}'::jsonb
      or jsonb_typeof(p_value -> 'repetitions') is distinct from 'number'
      or jsonb_typeof(p_value -> 'unit') is distinct from 'string' then
      return false;
    end if;

    v_first := (p_value ->> 'repetitions')::numeric;
    return v_first = trunc(v_first)
      and v_first between 1 and 1000000
      and char_length(trim(p_value ->> 'unit')) between 1 and 32;
  end if;

  if p_mode = 'custom' then
    if p_value - array['label', 'value', 'unit'] <> '{}'::jsonb
      or jsonb_typeof(p_value -> 'label') is distinct from 'string'
      or jsonb_typeof(p_value -> 'unit') is distinct from 'string'
      or not (p_value ? 'value')
      or jsonb_typeof(p_value -> 'value') is null
      or jsonb_typeof(p_value -> 'value') not in ('number', 'string', 'boolean') then
      return false;
    end if;

    return char_length(trim(p_value ->> 'label')) between 1 and 80
      and char_length(trim(p_value ->> 'unit')) between 1 and 32
      and char_length(p_value ->> 'value') <= 500;
  end if;

  return false;
exception
  when others then
    return false;
end;
$$;

create table public.personal_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  sport text not null,
  description text,
  measurement_mode text not null,
  default_measurement jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint personal_activities_owner_fkey
    foreign key (user_id)
    references public.profiles (user_id)
    on delete cascade,
  constraint personal_activities_owner_key unique (id, user_id),
  constraint personal_activities_name_check
    check (char_length(trim(name)) between 1 and 120),
  constraint personal_activities_sport_check
    check (char_length(trim(sport)) between 1 and 80),
  constraint personal_activities_description_check
    check (description is null or char_length(description) <= 2000),
  constraint personal_activities_measurement_mode_check
    check (
      measurement_mode in (
        'sets_reps_load',
        'time_distance_pace',
        'duration_intensity',
        'skill_repetitions',
        'custom'
      )
    ),
  constraint personal_activities_default_measurement_check
    check (
      public.is_valid_training_measurement(
        measurement_mode,
        default_measurement
      )
    )
);

create table public.detailed_plan_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  version_number integer not null,
  parent_version_id uuid,
  parent_version_number integer generated always as (version_number - 1) stored,
  day_count smallint not null,
  start_date date not null,
  end_date date not null,
  timezone_name text not null,
  source_kind text not null default 'manual',
  accepted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint detailed_plan_versions_owner_fkey
    foreign key (user_id)
    references public.profiles (user_id)
    on delete cascade,
  constraint detailed_plan_versions_owner_key unique (id, user_id),
  constraint detailed_plan_versions_owner_number_key
    unique (user_id, version_number),
  constraint detailed_plan_versions_owner_version_key
    unique (id, user_id, version_number),
  constraint detailed_plan_versions_parent_fkey
    foreign key (parent_version_id, user_id, parent_version_number)
    references public.detailed_plan_versions (id, user_id, version_number),
  constraint detailed_plan_versions_number_check
    check (version_number > 0),
  constraint detailed_plan_versions_parent_check
    check (
      (version_number = 1 and parent_version_id is null)
      or (version_number > 1 and parent_version_id is not null)
    ),
  constraint detailed_plan_versions_day_count_check
    check (day_count between 1 and 7),
  constraint detailed_plan_versions_range_check
    check (end_date = start_date + (day_count::integer - 1)),
  constraint detailed_plan_versions_timezone_check
    check (char_length(trim(timezone_name)) between 1 and 100),
  constraint detailed_plan_versions_source_check
    check (source_kind = 'manual')
);

create table public.detailed_plan_heads (
  user_id uuid primary key,
  current_version_id uuid not null,
  revision integer not null,
  updated_at timestamptz not null default now(),
  constraint detailed_plan_heads_owner_fkey
    foreign key (user_id)
    references public.profiles (user_id)
    on delete cascade,
  constraint detailed_plan_heads_current_fkey
    foreign key (current_version_id, user_id, revision)
    references public.detailed_plan_versions (id, user_id, version_number)
    on delete cascade,
  constraint detailed_plan_heads_revision_check
    check (revision > 0)
);

create table public.planned_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  plan_version_id uuid not null,
  local_date date not null,
  position smallint not null,
  title text not null,
  sport text not null,
  intent text,
  expected_duration_minutes integer,
  note text,
  is_locked boolean not null default false,
  created_at timestamptz not null default now(),
  constraint planned_sessions_owner_fkey
    foreign key (user_id)
    references public.profiles (user_id)
    on delete cascade,
  constraint planned_sessions_owner_key unique (id, user_id),
  constraint planned_sessions_plan_fkey
    foreign key (plan_version_id, user_id)
    references public.detailed_plan_versions (id, user_id)
    on delete cascade,
  constraint planned_sessions_order_key
    unique (plan_version_id, local_date, position),
  constraint planned_sessions_position_check
    check (position between 0 and 99),
  constraint planned_sessions_title_check
    check (char_length(trim(title)) between 1 and 120),
  constraint planned_sessions_sport_check
    check (char_length(trim(sport)) between 1 and 80),
  constraint planned_sessions_intent_check
    check (intent is null or char_length(intent) <= 500),
  constraint planned_sessions_duration_check
    check (
      expected_duration_minutes is null
      or expected_duration_minutes between 1 and 10080
    ),
  constraint planned_sessions_note_check
    check (note is null or char_length(note) <= 2000)
);

create table public.planned_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  planned_session_id uuid not null,
  personal_activity_id uuid,
  position smallint not null,
  name text not null,
  sport text not null,
  instructions text,
  measurement_mode text not null,
  target jsonb,
  is_locked boolean not null default false,
  created_at timestamptz not null default now(),
  constraint planned_activities_owner_fkey
    foreign key (user_id)
    references public.profiles (user_id)
    on delete cascade,
  constraint planned_activities_owner_key unique (id, user_id),
  constraint planned_activities_session_fkey
    foreign key (planned_session_id, user_id)
    references public.planned_sessions (id, user_id)
    on delete cascade,
  constraint planned_activities_personal_fkey
    foreign key (personal_activity_id, user_id)
    references public.personal_activities (id, user_id),
  constraint planned_activities_order_key
    unique (planned_session_id, position),
  constraint planned_activities_position_check
    check (position between 0 and 99),
  constraint planned_activities_name_check
    check (char_length(trim(name)) between 1 and 120),
  constraint planned_activities_sport_check
    check (char_length(trim(sport)) between 1 and 80),
  constraint planned_activities_instructions_check
    check (instructions is null or char_length(instructions) <= 2000),
  constraint planned_activities_measurement_mode_check
    check (
      measurement_mode in (
        'sets_reps_load',
        'time_distance_pace',
        'duration_intensity',
        'skill_repetitions',
        'custom'
      )
    ),
  constraint planned_activities_target_check
    check (
      public.is_valid_training_measurement(measurement_mode, target)
    )
);

create table public.completed_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  completion_group_id uuid not null,
  revision_number integer not null,
  previous_completion_id uuid,
  previous_revision_number integer
    generated always as (revision_number - 1) stored,
  planned_session_id uuid,
  actual_local_date date not null,
  actual_started_at timestamptz,
  timezone_name text not null,
  duration_minutes integer,
  status text not null,
  perceived_effort smallint,
  feeling text,
  note text,
  replacement_description text,
  pain_reported boolean not null default false,
  illness_reported boolean not null default false,
  injury_reported boolean not null default false,
  severe_fatigue_reported boolean not null default false,
  correction_reason text,
  created_at timestamptz not null default now(),
  constraint completed_sessions_owner_fkey
    foreign key (user_id)
    references public.profiles (user_id)
    on delete cascade,
  constraint completed_sessions_owner_key unique (id, user_id),
  constraint completed_sessions_group_revision_key
    unique (user_id, completion_group_id, revision_number),
  constraint completed_sessions_owner_group_revision_key
    unique (id, user_id, completion_group_id, revision_number),
  constraint completed_sessions_previous_fkey
    foreign key (
      previous_completion_id,
      user_id,
      completion_group_id,
      previous_revision_number
    )
    references public.completed_sessions (
      id,
      user_id,
      completion_group_id,
      revision_number
    ),
  constraint completed_sessions_plan_fkey
    foreign key (planned_session_id, user_id)
    references public.planned_sessions (id, user_id),
  constraint completed_sessions_revision_check
    check (revision_number > 0),
  constraint completed_sessions_correction_check
    check (
      (
        revision_number = 1
        and previous_completion_id is null
        and correction_reason is null
      )
      or (
        revision_number > 1
        and previous_completion_id is not null
        and correction_reason is not null
        and char_length(trim(correction_reason)) between 1 and 500
      )
    ),
  constraint completed_sessions_timezone_check
    check (char_length(trim(timezone_name)) between 1 and 100),
  constraint completed_sessions_duration_check
    check (duration_minutes is null or duration_minutes between 0 and 10080),
  constraint completed_sessions_status_check
    check (
      status in (
        'completed',
        'partially_completed',
        'skipped',
        'replaced',
        'rest',
        'unplanned'
      )
    ),
  constraint completed_sessions_effort_check
    check (perceived_effort is null or perceived_effort between 1 and 10),
  constraint completed_sessions_feeling_check
    check (
      feeling is null
      or feeling in ('very_bad', 'bad', 'neutral', 'good', 'very_good')
    ),
  constraint completed_sessions_note_check
    check (note is null or char_length(note) <= 2000),
  constraint completed_sessions_replacement_check
    check (
      (
        status = 'replaced'
        and replacement_description is not null
        and char_length(trim(replacement_description)) between 1 and 500
      )
      or (
        status <> 'replaced'
        and replacement_description is null
      )
    ),
  constraint completed_sessions_unplanned_check
    check (
      (status = 'unplanned' and planned_session_id is null)
      or (status <> 'unplanned' and planned_session_id is not null)
    )
);

create table public.completion_heads (
  user_id uuid not null,
  completion_group_id uuid not null,
  current_completion_id uuid not null,
  revision integer not null,
  updated_at timestamptz not null default now(),
  constraint completion_heads_pkey
    primary key (user_id, completion_group_id),
  constraint completion_heads_owner_fkey
    foreign key (user_id)
    references public.profiles (user_id)
    on delete cascade,
  constraint completion_heads_current_fkey
    foreign key (
      current_completion_id,
      user_id,
      completion_group_id,
      revision
    )
    references public.completed_sessions (
      id,
      user_id,
      completion_group_id,
      revision_number
    )
    on delete cascade,
  constraint completion_heads_revision_check
    check (revision > 0)
);

create table public.completed_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  completed_session_id uuid not null,
  planned_activity_id uuid,
  personal_activity_id uuid,
  position smallint not null,
  name text not null,
  sport text not null,
  instructions text,
  measurement_mode text not null,
  actual_measurement jsonb,
  created_at timestamptz not null default now(),
  constraint completed_activities_owner_fkey
    foreign key (user_id)
    references public.profiles (user_id)
    on delete cascade,
  constraint completed_activities_owner_key unique (id, user_id),
  constraint completed_activities_session_fkey
    foreign key (completed_session_id, user_id)
    references public.completed_sessions (id, user_id)
    on delete cascade,
  constraint completed_activities_planned_fkey
    foreign key (planned_activity_id, user_id)
    references public.planned_activities (id, user_id),
  constraint completed_activities_personal_fkey
    foreign key (personal_activity_id, user_id)
    references public.personal_activities (id, user_id),
  constraint completed_activities_order_key
    unique (completed_session_id, position),
  constraint completed_activities_position_check
    check (position between 0 and 99),
  constraint completed_activities_name_check
    check (char_length(trim(name)) between 1 and 120),
  constraint completed_activities_sport_check
    check (char_length(trim(sport)) between 1 and 80),
  constraint completed_activities_instructions_check
    check (instructions is null or char_length(instructions) <= 2000),
  constraint completed_activities_measurement_mode_check
    check (
      measurement_mode in (
        'sets_reps_load',
        'time_distance_pace',
        'duration_intensity',
        'skill_repetitions',
        'custom'
      )
    ),
  constraint completed_activities_measurement_check
    check (
      public.is_valid_training_measurement(
        measurement_mode,
        actual_measurement
      )
    )
);

create index personal_activities_owner_active_idx
  on public.personal_activities (user_id, archived_at, name);
create index detailed_plan_versions_owner_created_idx
  on public.detailed_plan_versions (user_id, created_at desc);
create index detailed_plan_versions_parent_idx
  on public.detailed_plan_versions (
    parent_version_id,
    user_id,
    parent_version_number
  );
create index detailed_plan_heads_current_idx
  on public.detailed_plan_heads (current_version_id, user_id, revision);
create index planned_sessions_owner_date_idx
  on public.planned_sessions (user_id, local_date, position);
create index planned_sessions_plan_idx
  on public.planned_sessions (plan_version_id, user_id);
create index planned_activities_owner_session_idx
  on public.planned_activities (user_id, planned_session_id, position);
create index planned_activities_personal_idx
  on public.planned_activities (personal_activity_id, user_id)
  where personal_activity_id is not null;
create index completed_sessions_owner_date_idx
  on public.completed_sessions (user_id, actual_local_date desc, created_at desc);
create index completed_sessions_previous_idx
  on public.completed_sessions (
    previous_completion_id,
    user_id,
    completion_group_id,
    previous_revision_number
  )
  where previous_completion_id is not null;
create index completed_sessions_plan_idx
  on public.completed_sessions (planned_session_id, user_id)
  where planned_session_id is not null;
create index completion_heads_current_idx
  on public.completion_heads (
    current_completion_id,
    user_id,
    completion_group_id,
    revision
  );
create index completed_activities_owner_session_idx
  on public.completed_activities (user_id, completed_session_id, position);
create index completed_activities_planned_idx
  on public.completed_activities (planned_activity_id, user_id)
  where planned_activity_id is not null;
create index completed_activities_personal_idx
  on public.completed_activities (personal_activity_id, user_id)
  where personal_activity_id is not null;

alter table public.personal_activities enable row level security;
alter table public.detailed_plan_versions enable row level security;
alter table public.detailed_plan_heads enable row level security;
alter table public.planned_sessions enable row level security;
alter table public.planned_activities enable row level security;
alter table public.completed_sessions enable row level security;
alter table public.completion_heads enable row level security;
alter table public.completed_activities enable row level security;

revoke all privileges on table public.personal_activities
  from public, anon, authenticated;
revoke all privileges on table public.detailed_plan_versions
  from public, anon, authenticated;
revoke all privileges on table public.detailed_plan_heads
  from public, anon, authenticated;
revoke all privileges on table public.planned_sessions
  from public, anon, authenticated;
revoke all privileges on table public.planned_activities
  from public, anon, authenticated;
revoke all privileges on table public.completed_sessions
  from public, anon, authenticated;
revoke all privileges on table public.completion_heads
  from public, anon, authenticated;
revoke all privileges on table public.completed_activities
  from public, anon, authenticated;

grant select, insert, update, delete
  on table public.personal_activities to authenticated;
grant select
  on table
    public.detailed_plan_versions,
    public.detailed_plan_heads,
    public.planned_sessions,
    public.planned_activities,
    public.completed_sessions,
    public.completion_heads,
    public.completed_activities
  to authenticated;

create policy personal_activities_owner_select
on public.personal_activities
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy personal_activities_owner_insert
on public.personal_activities
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy personal_activities_owner_update
on public.personal_activities
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy personal_activities_owner_delete
on public.personal_activities
for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy detailed_plan_versions_owner_select
on public.detailed_plan_versions
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy detailed_plan_heads_owner_select
on public.detailed_plan_heads
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy planned_sessions_owner_select
on public.planned_sessions
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy planned_activities_owner_select
on public.planned_activities
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy completed_sessions_owner_select
on public.completed_sessions
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy completion_heads_owner_select
on public.completion_heads
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy completed_activities_owner_select
on public.completed_activities
for select
to authenticated
using ((select auth.uid()) = user_id);

create function public.save_manual_plan_version(
  p_expected_revision integer,
  p_day_count integer,
  p_start_date date,
  p_timezone_name text,
  p_sessions jsonb
)
returns public.detailed_plan_versions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_current_revision integer;
  v_parent_version_id uuid;
  v_plan public.detailed_plan_versions;
  v_session jsonb;
  v_session_id uuid;
  v_session_date date;
  v_session_position integer;
  v_session_position_number numeric;
  v_activity jsonb;
  v_activity_position integer;
  v_activity_position_number numeric;
  v_personal_activity_id uuid;
  v_session_count integer;
  v_activity_count integer;
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

  if p_expected_revision is null or p_expected_revision < 0
    or p_day_count is null
    or p_day_count not between 1 and 7
    or p_start_date is null
    or p_timezone_name is null
    or char_length(trim(p_timezone_name)) not between 1 and 100
    or p_sessions is null
    or jsonb_typeof(p_sessions) is distinct from 'array'
    or octet_length(p_sessions::text) > 65536 then
    raise exception using
      errcode = '22023',
      message = 'Invalid training plan payload.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_timezone_names
    where name = p_timezone_name
  ) then
    raise exception using
      errcode = '22023',
      message = 'Invalid training plan timezone.';
  end if;

  v_session_count := jsonb_array_length(p_sessions);
  if v_session_count > 70 then
    raise exception using
      errcode = '22023',
      message = 'The training plan has too many sessions.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 0)
  );

  select revision, current_version_id
  into v_current_revision, v_parent_version_id
  from public.detailed_plan_heads
  where user_id = v_user_id
  for update;

  if not found then
    v_current_revision := 0;
    v_parent_version_id := null;
  end if;

  if p_expected_revision <> v_current_revision then
    raise exception using
      errcode = 'PT409',
      message = 'The training plan changed before this save.';
  end if;

  insert into public.detailed_plan_versions (
    user_id,
    version_number,
    parent_version_id,
    day_count,
    start_date,
    end_date,
    timezone_name,
    source_kind
  )
  values (
    v_user_id,
    v_current_revision + 1,
    v_parent_version_id,
    p_day_count,
    p_start_date,
    p_start_date + (p_day_count - 1),
    p_timezone_name,
    'manual'
  )
  returning * into v_plan;

  for v_session in
    select value
    from jsonb_array_elements(p_sessions)
  loop
    if jsonb_typeof(v_session) is distinct from 'object'
      or v_session - array[
        'local_date',
        'position',
        'title',
        'sport',
        'intent',
        'expected_duration_minutes',
        'note',
        'is_locked',
        'activities'
      ] <> '{}'::jsonb
      or jsonb_typeof(v_session -> 'local_date') is distinct from 'string'
      or jsonb_typeof(v_session -> 'position') is distinct from 'number'
      or jsonb_typeof(v_session -> 'title') is distinct from 'string'
      or jsonb_typeof(v_session -> 'sport') is distinct from 'string' then
      raise exception using
        errcode = '22023',
        message = 'Invalid planned session.';
    end if;

    v_session_date := (v_session ->> 'local_date')::date;
    v_session_position_number := (v_session ->> 'position')::numeric;

    if v_session_date < p_start_date
      or v_session_date > p_start_date + (p_day_count - 1)
      or v_session_position_number <> trunc(v_session_position_number)
      or v_session_position_number not between 0 and 99
      or char_length(trim(v_session ->> 'title')) not between 1 and 120
      or char_length(trim(v_session ->> 'sport')) not between 1 and 80
      or (
        v_session ? 'intent'
        and (
          jsonb_typeof(v_session -> 'intent') is distinct from 'string'
          or char_length(v_session ->> 'intent') > 500
        )
      )
      or (
        v_session ? 'expected_duration_minutes'
        and (
          jsonb_typeof(v_session -> 'expected_duration_minutes')
            is distinct from 'number'
          or (v_session ->> 'expected_duration_minutes')::numeric
            <> trunc((v_session ->> 'expected_duration_minutes')::numeric)
          or (v_session ->> 'expected_duration_minutes')::numeric
            not between 1 and 10080
        )
      )
      or (
        v_session ? 'note'
        and (
          jsonb_typeof(v_session -> 'note') is distinct from 'string'
          or char_length(v_session ->> 'note') > 2000
        )
      )
      or (
        v_session ? 'is_locked'
        and jsonb_typeof(v_session -> 'is_locked') is distinct from 'boolean'
      )
      or (
        v_session ? 'activities'
        and jsonb_typeof(v_session -> 'activities') is distinct from 'array'
      ) then
      raise exception using
        errcode = '22023',
        message = 'Invalid planned session.';
    end if;

    v_session_position := v_session_position_number::integer;

    insert into public.planned_sessions (
      user_id,
      plan_version_id,
      local_date,
      position,
      title,
      sport,
      intent,
      expected_duration_minutes,
      note,
      is_locked
    )
    values (
      v_user_id,
      v_plan.id,
      v_session_date,
      v_session_position,
      trim(v_session ->> 'title'),
      trim(v_session ->> 'sport'),
      nullif(trim(v_session ->> 'intent'), ''),
      (v_session ->> 'expected_duration_minutes')::integer,
      nullif(v_session ->> 'note', ''),
      coalesce((v_session ->> 'is_locked')::boolean, false)
    )
    returning id into v_session_id;

    v_activity_count := jsonb_array_length(
      coalesce(v_session -> 'activities', '[]'::jsonb)
    );
    if v_activity_count > 50 then
      raise exception using
        errcode = '22023',
        message = 'A planned session has too many activities.';
    end if;

    for v_activity in
      select value
      from jsonb_array_elements(
        coalesce(v_session -> 'activities', '[]'::jsonb)
      )
    loop
      if jsonb_typeof(v_activity) is distinct from 'object'
        or v_activity - array[
          'personal_activity_id',
          'position',
          'name',
          'sport',
          'instructions',
          'measurement_mode',
          'target',
          'is_locked'
        ] <> '{}'::jsonb
        or jsonb_typeof(v_activity -> 'position') is distinct from 'number'
        or jsonb_typeof(v_activity -> 'name') is distinct from 'string'
        or jsonb_typeof(v_activity -> 'sport') is distinct from 'string'
        or jsonb_typeof(v_activity -> 'measurement_mode')
          is distinct from 'string' then
        raise exception using
          errcode = '22023',
          message = 'Invalid planned activity.';
      end if;

      v_activity_position_number := (v_activity ->> 'position')::numeric;
      v_personal_activity_id :=
        nullif(v_activity ->> 'personal_activity_id', '')::uuid;

      if v_activity_position_number <> trunc(v_activity_position_number)
        or v_activity_position_number not between 0 and 99
        or char_length(trim(v_activity ->> 'name')) not between 1 and 120
        or char_length(trim(v_activity ->> 'sport')) not between 1 and 80
        or (
          v_activity ? 'instructions'
          and (
            jsonb_typeof(v_activity -> 'instructions') is distinct from 'string'
            or char_length(v_activity ->> 'instructions') > 2000
          )
        )
        or (
          v_activity ? 'is_locked'
          and jsonb_typeof(v_activity -> 'is_locked') is distinct from 'boolean'
        )
        or not public.is_valid_training_measurement(
          v_activity ->> 'measurement_mode',
          v_activity -> 'target'
        ) then
        raise exception using
          errcode = '22023',
          message = 'Invalid planned activity.';
      end if;

      v_activity_position := v_activity_position_number::integer;

      if v_personal_activity_id is not null and not exists (
        select 1
        from public.personal_activities
        where id = v_personal_activity_id
          and user_id = v_user_id
          and archived_at is null
      ) then
        raise exception using
          errcode = '42501',
          message = 'The personal activity is unavailable.';
      end if;

      insert into public.planned_activities (
        user_id,
        planned_session_id,
        personal_activity_id,
        position,
        name,
        sport,
        instructions,
        measurement_mode,
        target,
        is_locked
      )
      values (
        v_user_id,
        v_session_id,
        v_personal_activity_id,
        v_activity_position,
        trim(v_activity ->> 'name'),
        trim(v_activity ->> 'sport'),
        nullif(v_activity ->> 'instructions', ''),
        v_activity ->> 'measurement_mode',
        v_activity -> 'target',
        coalesce((v_activity ->> 'is_locked')::boolean, false)
      );
    end loop;
  end loop;

  insert into public.detailed_plan_heads (
    user_id,
    current_version_id,
    revision,
    updated_at
  )
  values (
    v_user_id,
    v_plan.id,
    v_plan.version_number,
    pg_catalog.now()
  )
  on conflict (user_id) do update
  set current_version_id = excluded.current_version_id,
      revision = excluded.revision,
      updated_at = excluded.updated_at;

  return v_plan;
exception
  when invalid_text_representation
    or numeric_value_out_of_range
    or datetime_field_overflow then
    raise exception using
      errcode = '22023',
      message = 'Invalid training plan payload.';
end;
$$;

revoke all privileges on function public.is_valid_training_measurement(text, jsonb)
  from public, anon, authenticated;
grant execute on function public.is_valid_training_measurement(text, jsonb)
  to authenticated;

revoke all privileges on function public.save_manual_plan_version(
  integer,
  integer,
  date,
  text,
  jsonb
) from public, anon, authenticated;
grant execute on function public.save_manual_plan_version(
  integer,
  integer,
  date,
  text,
  jsonb
) to authenticated;
