-- A4bc: every log owns its name, and its actuals can be corrected. Additive
-- only; the M3-23 definitions stand as history and are replaced here.
--
--   1. `completions` gains `title` and `sport`: what the owner called the
--      training when logging it. The plan and its snapshot are never written.
--      A planned log written before this keeps them null and reads the
--      snapshot's; an unplanned one has its name copied across from the one
--      activity that held it.
--   2. `completion_activities` gains `planned_position`: which activity of the
--      log's own snapshot an actual answers, null for one added while logging.
--      The actual's `position` is the order it was done in, which A4 made
--      independent of the plan's, so without this an actual can only be paired
--      with its planned activity by name.
--   3. A planned log's actuals may be corrected. M3-23 refused `activities` on
--      its edit, reading the actual list as though it were the snapshot.
--   4. `unmeasured` is admitted by the four activity validators that never
--      learned it: the completion's, the plan's, a recurring series' and the
--      saved library's. A2c added the mode to every table and to
--      `is_valid_training_measurement` but not to these, so the plan editor
--      could not save an unmeasured activity and no log could record one.
--
-- Compatibility with the app still deployed while this is applied: a create
-- that names nothing is named from its snapshot or its first activity, and an
-- edit that names nothing leaves the stored name alone.

alter table public.completions
  add column title text,
  add column sport text,
  add constraint completions_name_pair_check
    check ((title is null) = (sport is null)),
  add constraint completions_title_check
    check (title is null or char_length(btrim(title)) between 1 and 120),
  add constraint completions_sport_check
    check (sport is null or char_length(btrim(sport)) between 1 and 80);

alter table public.completion_activities
  add column planned_position smallint,
  add constraint completion_activities_planned_position_check
    check (planned_position is null or planned_position between 0 and 99);

-- One actual per planned activity. Partial, because any number of actuals may
-- have been added with no planned counterpart.
create unique index completion_activities_planned_key
  on public.completion_activities (completion_id, planned_position)
  where planned_position is not null;

-- Unplanned training kept its name as its one activity, at position 0. Filtered
-- to exactly those rows, and to logs that have no name yet; nothing is removed.
-- The activity row stays and reads as an ordinary activity from now on.
update public.completions completion
set title = activity.name, sport = activity.sport
from public.completion_activities activity
where activity.completion_id = completion.id
  and activity.user_id = completion.user_id
  and activity.position = 0
  and completion.plan_session_id is null
  and completion.title is null;

-- Unchanged from M3-15A except for the sixth mode and `plannedPosition`.
create or replace function public.completion_activity_input_is_valid(p_value jsonb)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_position numeric;
  v_planned numeric;
  v_mode text;
begin
  if p_value is null or pg_catalog.jsonb_typeof(p_value) <> 'object'
    or p_value - array[
      'personalActivityId', 'position', 'plannedPosition', 'name', 'sport',
      'instructions', 'measurementMode', 'actualMeasurement'
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
      'unmeasured', 'sets_reps_load', 'time_distance_pace', 'duration_intensity',
      'skill_repetitions', 'custom'
    )
    -- An absent measurement and an explicit null mean the same thing: this
    -- activity records no measured value.
    or not public.is_valid_training_measurement(
      v_mode, nullif(p_value->'actualMeasurement', 'null'::jsonb))
  then return false; end if;

  if p_value ? 'plannedPosition'
    and pg_catalog.jsonb_typeof(p_value->'plannedPosition') <> 'null'
  then
    if pg_catalog.jsonb_typeof(p_value->'plannedPosition') <> 'number' then
      return false;
    end if;
    v_planned := (p_value->>'plannedPosition')::numeric;
    if v_planned <> trunc(v_planned) or v_planned not between 0 and 99 then
      return false;
    end if;
  end if;

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

revoke all privileges on function public.completion_activity_input_is_valid(jsonb)
  from public, anon, authenticated, service_role;

-- The same omission on the plan side. A2c added `unmeasured` to the tables and
-- to `is_valid_training_measurement`, but not to the three validators the plan,
-- a recurring series and the saved library run before writing an activity, so
-- the plan editor could not save one either. Each is its original definition
-- with the sixth mode added and nothing else changed.

create or replace function public.rolling_plan_activity_input_is_valid(p_value jsonb)
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
      'unmeasured', 'sets_reps_load', 'time_distance_pace', 'duration_intensity',
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

revoke all privileges on function public.rolling_plan_activity_input_is_valid(jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.rolling_plan_series_activity_input_is_valid(p_value jsonb)
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
      'unmeasured', 'sets_reps_load', 'time_distance_pace', 'duration_intensity',
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

create or replace function public.saved_session_activity_input_is_valid(p_value jsonb)
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
      'unmeasured', 'sets_reps_load', 'time_distance_pace', 'duration_intensity',
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

revoke all privileges on function public.saved_session_activity_input_is_valid(jsonb)
  from public, anon, authenticated, service_role;

-- The payload validator. As M3-23, plus the log's own name.
create or replace function public.completion_input_is_valid(
  p_value jsonb,
  p_operation text
)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_status text;
  v_key text;
  v_number numeric;
  v_activity jsonb;
  v_positions integer[] := array[]::integer[];
begin
  if p_value is null or pg_catalog.jsonb_typeof(p_value) <> 'object'
    or p_value - (case when p_operation = 'create' then array[
        'planSessionId', 'status', 'actualLocalDate', 'actualStartedAt',
        'durationMinutes', 'perceivedEffort', 'feeling', 'note',
        'replacementDescription', 'painReported', 'illnessReported',
        'injuryReported', 'severeFatigueReported', 'activities', 'title', 'sport'
      ] else array[
        'status', 'actualLocalDate', 'actualStartedAt', 'durationMinutes',
        'perceivedEffort', 'feeling', 'note', 'replacementDescription',
        'painReported', 'illnessReported', 'injuryReported',
        'severeFatigueReported', 'activities', 'title', 'sport'
      ] end) <> '{}'::jsonb
    or not (p_value ?& array['status', 'actualLocalDate'])
    or pg_catalog.jsonb_typeof(p_value->'status') <> 'string'
    or pg_catalog.jsonb_typeof(p_value->'actualLocalDate') <> 'string'
  then return false; end if;

  v_status := p_value->>'status';
  -- The vocabulary is exactly these five. `rest` is not one of them: a
  -- recovery intention is a day-level planning label, not a completion.
  if v_status not in (
    'completed', 'partially_completed', 'skipped', 'replaced', 'unplanned'
  ) then return false; end if;
  if (p_value->>'actualLocalDate')::date::text <> p_value->>'actualLocalDate' then
    return false;
  end if;

  -- `unplanned` means exactly "no planned session", in both directions.
  if p_operation = 'create' then
    if (v_status = 'unplanned') <> (
      not (p_value ? 'planSessionId')
      or pg_catalog.jsonb_typeof(p_value->'planSessionId') = 'null'
    ) then return false; end if;
    if v_status <> 'unplanned' then
      if pg_catalog.jsonb_typeof(p_value->'planSessionId') <> 'string' then
        return false;
      end if;
      perform (p_value->>'planSessionId')::uuid;
    end if;
  end if;

  -- `replaced` means exactly "there is a description of what was done
  -- instead", in both directions.
  if (v_status = 'replaced') <> (
    p_value ? 'replacementDescription'
    and pg_catalog.jsonb_typeof(p_value->'replacementDescription') = 'string'
    and pg_catalog.char_length(
      pg_catalog.btrim(p_value->>'replacementDescription')) between 1 and 500
  ) then return false; end if;

  -- A log's own name, both halves or neither. Absent on a create means the
  -- write function supplies one; absent on an edit leaves the stored one.
  if (p_value ? 'title') <> (p_value ? 'sport') then return false; end if;
  if p_value ? 'title' and (
    pg_catalog.jsonb_typeof(p_value->'title') <> 'string'
    or pg_catalog.jsonb_typeof(p_value->'sport') <> 'string'
    or pg_catalog.char_length(pg_catalog.btrim(p_value->>'title'))
      not between 1 and 120
    or pg_catalog.char_length(pg_catalog.btrim(p_value->>'sport'))
      not between 1 and 80
  ) then return false; end if;

  if p_value ? 'actualStartedAt'
    and pg_catalog.jsonb_typeof(p_value->'actualStartedAt') <> 'null'
  then
    if pg_catalog.jsonb_typeof(p_value->'actualStartedAt') <> 'string' then
      return false;
    end if;
    perform (p_value->>'actualStartedAt')::timestamptz;
  end if;

  foreach v_key in array array['durationMinutes', 'perceivedEffort'] loop
    if p_value ? v_key and pg_catalog.jsonb_typeof(p_value->v_key) <> 'null' then
      if pg_catalog.jsonb_typeof(p_value->v_key) <> 'number' then
        return false;
      end if;
      v_number := (p_value->>v_key)::numeric;
      if v_number <> trunc(v_number)
        or (v_key = 'durationMinutes' and v_number not between 0 and 10080)
        or (v_key = 'perceivedEffort' and v_number not between 1 and 10)
      then return false; end if;
    end if;
  end loop;

  if p_value ? 'feeling'
    and pg_catalog.jsonb_typeof(p_value->'feeling') <> 'null'
    and (p_value->>'feeling') not in (
      'very_bad', 'bad', 'neutral', 'good', 'very_good')
  then return false; end if;
  if p_value ? 'note'
    and pg_catalog.jsonb_typeof(p_value->'note') not in ('string', 'null')
  then return false; end if;
  if pg_catalog.char_length(coalesce(p_value->>'note', '')) > 2000 then
    return false;
  end if;

  foreach v_key in array array[
    'painReported', 'illnessReported', 'injuryReported', 'severeFatigueReported'
  ] loop
    if p_value ? v_key
      and pg_catalog.jsonb_typeof(p_value->v_key) not in ('boolean', 'null')
    then return false; end if;
  end loop;

  -- A create states the whole list, including an empty one. An edit states it
  -- only to replace it; leaving the key out leaves the activities alone.
  if p_operation = 'create' and not (p_value ? 'activities') then
    return false;
  end if;
  if p_value ? 'activities' then
    if pg_catalog.jsonb_typeof(p_value->'activities') <> 'array'
      or pg_catalog.jsonb_array_length(p_value->'activities') > 50
    then return false; end if;
    for v_activity in
      select value from pg_catalog.jsonb_array_elements(p_value->'activities')
    loop
      if not public.completion_activity_input_is_valid(v_activity) then
        return false;
      end if;
      if (v_activity->>'position')::integer = any(v_positions) then
        return false;
      end if;
      v_positions := v_positions || (v_activity->>'position')::integer;
    end loop;
  end if;
  return true;
exception when others then return false;
end;
$$;

revoke all privileges on function public.completion_input_is_valid(jsonb, text)
  from public, anon, authenticated, service_role;

-- One owner-derived transaction for both completion writes. The owner comes
-- from `auth.uid()` and from nowhere else. A create captures the planned
-- snapshot from the live plan row here, so no caller can compose or forge one,
-- and an edit never touches it again.
--
-- This function advances no plan revision and writes no plan table. Planned
-- and actual are separate permanent streams, and logging what happened is not
-- a change to what was planned.
create or replace function public.apply_completion_change(
  p_operation text,
  p_completion_id uuid default null,
  p_expected_revision bigint default null,
  p_completion jsonb default null
)
returns public.completion_receipt
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_timezone text;
  v_completion_id uuid;
  v_revision bigint;
  v_plan_session_id uuid;
  v_snapshot jsonb;
  v_activity jsonb;
  v_constraint text;
  v_title text;
  v_sport text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501',
      message = 'An authenticated FitTip user is required.';
  end if;
  if p_operation is null or p_operation not in ('create', 'edit')
    or not public.completion_input_is_valid(p_completion, p_operation)
  then
    raise exception using errcode = '22023', message = 'Invalid completion change.';
  end if;

  if p_operation = 'create' then
    -- A create names no existing record and answers to no revision.
    if p_completion_id is not null or p_expected_revision is not null then
      raise exception using errcode = '22023', message = 'Invalid completion change.';
    end if;

    -- The record carries the zone its local date was written in, because the
    -- profile zone changes and a past date must not move with it.
    select profile.timezone_name into v_timezone
    from public.profiles profile where profile.user_id = v_user_id;
    if v_timezone is null then
      raise exception using errcode = 'PT428',
        message = 'Confirm your time zone before logging training.';
    end if;

    -- Nothing is completed before it happens.
    if (p_completion->>'actualLocalDate')::date
      > (v_now at time zone v_timezone)::date
    then
      raise exception using errcode = 'PT430',
        message = 'Training cannot be logged for a future date.';
    end if;

    if p_completion->>'status' <> 'unplanned' then
      v_plan_session_id := (p_completion->>'planSessionId')::uuid;
      -- Owner-scoped by construction: the state function reads the row only
      -- when it belongs to this owner, so another owner's session is simply
      -- not there. The snapshot is taken now and never read through again.
      v_snapshot := public.rolling_plan_session_state(v_user_id, v_plan_session_id);
      if v_snapshot is null then
        raise exception using errcode = '22023',
          message = 'That planned session does not exist.';
      end if;
      -- A duplicate is refused by `completions_plan_session_key` and reported
      -- from the handler below. Reading first would answer the same question
      -- twice and answer it differently under a race: two callers can both
      -- pass a non-serialized `exists` and only the constraint decides.
    end if;

    -- Every new log carries its own name. The caller states it; when it does
    -- not - the app deployed before this migration never does - the name is
    -- the planned session's, or for unplanned training the first activity's,
    -- which is exactly where that version kept it. The backfill above follows
    -- the same rule, so no log reads differently depending on when it was
    -- written.
    if p_completion ? 'title' then
      v_title := pg_catalog.btrim(p_completion->>'title');
      v_sport := pg_catalog.btrim(p_completion->>'sport');
    elsif v_snapshot is not null then
      v_title := v_snapshot->>'title';
      v_sport := v_snapshot->>'sport';
    else
      select pg_catalog.btrim(first.value->>'name'),
        pg_catalog.btrim(first.value->>'sport')
      into v_title, v_sport
      from pg_catalog.jsonb_array_elements(p_completion->'activities')
        as first(value)
      order by (first.value->>'position')::integer
      limit 1;
    end if;

    insert into public.completions (
      user_id, plan_session_id, status, actual_local_date, timezone_name,
      actual_started_at, duration_minutes, perceived_effort, feeling, note,
      replacement_description, pain_reported, illness_reported, injury_reported,
      severe_fatigue_reported, planned_snapshot, title, sport, created_at,
      updated_at
    ) values (
      v_user_id, v_plan_session_id, p_completion->>'status',
      (p_completion->>'actualLocalDate')::date, v_timezone,
      (p_completion->>'actualStartedAt')::timestamptz,
      (p_completion->>'durationMinutes')::integer,
      (p_completion->>'perceivedEffort')::smallint,
      p_completion->>'feeling', nullif(p_completion->>'note', ''),
      nullif(pg_catalog.btrim(
        coalesce(p_completion->>'replacementDescription', '')), ''),
      coalesce((p_completion->>'painReported')::boolean, false),
      coalesce((p_completion->>'illnessReported')::boolean, false),
      coalesce((p_completion->>'injuryReported')::boolean, false),
      coalesce((p_completion->>'severeFatigueReported')::boolean, false),
      v_snapshot, v_title, v_sport, v_now, v_now
    ) returning id, revision into v_completion_id, v_revision;

    for v_activity in
      select value from pg_catalog.jsonb_array_elements(p_completion->'activities')
    loop
      if v_activity ? 'personalActivityId'
        and pg_catalog.jsonb_typeof(v_activity->'personalActivityId') <> 'null'
        and not exists (
          select 1 from public.personal_activities
          where id = (v_activity->>'personalActivityId')::uuid
            and user_id = v_user_id
        )
      then
        raise exception using errcode = '22023',
          message = 'Invalid completed activity.';
      end if;
      -- An actual may answer one planned activity of this log's own snapshot
      -- and no other. Unplanned training has no snapshot, so it answers none.
      -- A second actual answering the same one is refused by
      -- `completion_activities_planned_key`.
      if v_activity ? 'plannedPosition'
        and pg_catalog.jsonb_typeof(v_activity->'plannedPosition') <> 'null'
        and not exists (
          select 1
          from pg_catalog.jsonb_array_elements(
            coalesce(v_snapshot->'activities', '[]'::jsonb)) as planned(value)
          where (planned.value->>'position')::integer
            = (v_activity->>'plannedPosition')::integer
        )
      then
        raise exception using errcode = '22023',
          message = 'Invalid completed activity.';
      end if;
      insert into public.completion_activities (
        user_id, completion_id, personal_activity_id, position, planned_position,
        name, sport, instructions, measurement_mode, actual_measurement,
        created_at, updated_at
      ) values (
        v_user_id, v_completion_id,
        (v_activity->>'personalActivityId')::uuid,
        (v_activity->>'position')::smallint,
        (v_activity->>'plannedPosition')::smallint,
        pg_catalog.btrim(v_activity->>'name'),
        pg_catalog.btrim(v_activity->>'sport'),
        nullif(v_activity->>'instructions', ''),
        v_activity->>'measurementMode',
        nullif(v_activity->'actualMeasurement', 'null'::jsonb), v_now, v_now
      );
    end loop;
    return (v_completion_id, v_revision, 'created')::public.completion_receipt;
  end if;

  -- An edit answers to the revision the owner last read.
  if p_completion_id is null or p_expected_revision is null
    or p_expected_revision < 0
  then
    raise exception using errcode = '22023', message = 'Invalid completion change.';
  end if;

  -- ADR-010. The wait is bounded, so a second same-owner save gets an answer
  -- rather than hanging. Locking the one row rather than the history lets two
  -- different completions be corrected at the same time.
  perform pg_catalog.set_config('lock_timeout', '3s', true);
  begin
    select completion.revision, completion.plan_session_id,
      completion.timezone_name, completion.planned_snapshot
    into v_revision, v_plan_session_id, v_timezone, v_snapshot
    from public.completions completion
    where completion.id = p_completion_id and completion.user_id = v_user_id
    for update;
  exception when lock_not_available then
    raise exception using errcode = 'PT409',
      message = 'That completion changed. Reload and try again.';
  end;

  -- A record another owner holds, or one already removed, is reported the same
  -- way: it changed. That is honest and leaks nothing.
  if v_revision is null or v_revision <> p_expected_revision then
    raise exception using errcode = 'PT409',
      message = 'That completion changed. Reload and try again.';
  end if;

  -- The planned link is immutable, so an edit can never cross the boundary
  -- between a planned completion and an unplanned one.
  if (p_completion->>'status' = 'unplanned') <> (v_plan_session_id is null) then
    raise exception using errcode = '22023', message = 'Invalid completion change.';
  end if;

  -- A planned log's actuals may be corrected like any other log's. What it
  -- was measured against is `planned_snapshot`, which this branch reads to
  -- check each `plannedPosition` and never writes: correcting what was done
  -- does not rewrite what was planned. (M3-23 refused this, reading the actual
  -- list as though it were the snapshot.)

  -- The completion's own zone, not the profile's: an edit must not be judged
  -- against a zone the owner has since moved to.
  if (p_completion->>'actualLocalDate')::date
    > (v_now at time zone v_timezone)::date
  then
    raise exception using errcode = 'PT430',
      message = 'Training cannot be logged for a future date.';
  end if;

  update public.completions set
    status = p_completion->>'status',
    actual_local_date = (p_completion->>'actualLocalDate')::date,
    actual_started_at = (p_completion->>'actualStartedAt')::timestamptz,
    duration_minutes = (p_completion->>'durationMinutes')::integer,
    perceived_effort = (p_completion->>'perceivedEffort')::smallint,
    feeling = p_completion->>'feeling',
    note = nullif(p_completion->>'note', ''),
    replacement_description = nullif(pg_catalog.btrim(
      coalesce(p_completion->>'replacementDescription', '')), ''),
    pain_reported = coalesce((p_completion->>'painReported')::boolean, false),
    illness_reported = coalesce((p_completion->>'illnessReported')::boolean, false),
    injury_reported = coalesce((p_completion->>'injuryReported')::boolean, false),
    severe_fatigue_reported =
      coalesce((p_completion->>'severeFatigueReported')::boolean, false),
    -- A name the edit does not state is left as it is: the app deployed
    -- before this migration sends none, and must not erase one.
    title = case when p_completion ? 'title'
      then pg_catalog.btrim(p_completion->>'title') else title end,
    sport = case when p_completion ? 'title'
      then pg_catalog.btrim(p_completion->>'sport') else sport end,
    revision = v_revision + 1,
    updated_at = v_now
  where id = p_completion_id and user_id = v_user_id;

  -- Replacing the list wholesale rather than updating rows in place: position
  -- is unique per completion, so a reorder would collide mid-statement, and the
  -- rows carry no history of their own.
  if p_completion ? 'activities' then
    delete from public.completion_activities
    where completion_id = p_completion_id and user_id = v_user_id;
    for v_activity in
      select value from pg_catalog.jsonb_array_elements(p_completion->'activities')
    loop
      if v_activity ? 'personalActivityId'
        and pg_catalog.jsonb_typeof(v_activity->'personalActivityId') <> 'null'
        and not exists (
          select 1 from public.personal_activities
          where id = (v_activity->>'personalActivityId')::uuid
            and user_id = v_user_id
        )
      then
        raise exception using errcode = '22023',
          message = 'Invalid completed activity.';
      end if;
      -- An actual may answer one planned activity of this log's own snapshot
      -- and no other. Unplanned training has no snapshot, so it answers none.
      -- A second actual answering the same one is refused by
      -- `completion_activities_planned_key`.
      if v_activity ? 'plannedPosition'
        and pg_catalog.jsonb_typeof(v_activity->'plannedPosition') <> 'null'
        and not exists (
          select 1
          from pg_catalog.jsonb_array_elements(
            coalesce(v_snapshot->'activities', '[]'::jsonb)) as planned(value)
          where (planned.value->>'position')::integer
            = (v_activity->>'plannedPosition')::integer
        )
      then
        raise exception using errcode = '22023',
          message = 'Invalid completed activity.';
      end if;
      insert into public.completion_activities (
        user_id, completion_id, personal_activity_id, position, planned_position,
        name, sport, instructions, measurement_mode, actual_measurement,
        created_at, updated_at
      ) values (
        v_user_id, p_completion_id,
        (v_activity->>'personalActivityId')::uuid,
        (v_activity->>'position')::smallint,
        (v_activity->>'plannedPosition')::smallint,
        pg_catalog.btrim(v_activity->>'name'),
        pg_catalog.btrim(v_activity->>'sport'),
        nullif(v_activity->>'instructions', ''),
        v_activity->>'measurementMode',
        nullif(v_activity->'actualMeasurement', 'null'::jsonb), v_now, v_now
      );
    end loop;
  end if;

  return (p_completion_id, v_revision + 1, 'updated')::public.completion_receipt;
exception
  when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    -- Its own code, whether the second caller arrives a minute or a
    -- millisecond late: the surface has to tell the owner which refusal this
    -- is, and nothing about the outcome, the date, or the numbers is wrong.
    if v_constraint = 'completions_plan_session_key' then
      raise exception using errcode = 'PT431',
        message = 'That session already has a completion.';
    end if;
    raise exception using errcode = '22023', message = 'Invalid completion change.';
  when foreign_key_violation or check_violation
    or not_null_violation or invalid_datetime_format then
    raise exception using errcode = '22023', message = 'Invalid completion change.';
end;
$$;

revoke all privileges on function public.apply_completion_change(text, uuid, bigint, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.apply_completion_change(text, uuid, bigint, jsonb)
  to authenticated;
