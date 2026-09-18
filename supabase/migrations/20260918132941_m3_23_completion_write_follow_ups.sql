-- M3-23: three corrections to the completion write path, all in the one
-- function that owns it. Forward-only: the M3-15A definitions stand as history
-- and are replaced here.
--
--   1. A duplicate is refused with its own errcode. The branch already said the
--      right thing; `22023` threw the message away at the repository, which
--      collapses every validation failure into one error with no detail.
--   2. An unplanned completion's activities can be corrected. The edit branch
--      admits an `activities` key and replaces the list wholesale, for a
--      completion with no planned link. The link itself stays immutable, and
--      this is deliberately not the general activity editor.
--   3. No completion may be dated after the owner's today. Time passing is not
--      completion, and you cannot have completed tomorrow's session either -
--      so this applies to planned and unplanned alike. The rule is anchored in
--      the zone the completion carries, never the current profile zone, because
--      a completion's date must not move when the profile zone changes.

-- The payload validator. Unchanged except that an edit may now carry
-- `activities`, where a create must.
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
        'injuryReported', 'severeFatigueReported', 'activities'
      ] else array[
        'status', 'actualLocalDate', 'actualStartedAt', 'durationMinutes',
        'perceivedEffort', 'feeling', 'note', 'replacementDescription',
        'painReported', 'illnessReported', 'injuryReported',
        'severeFatigueReported', 'activities'
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
      -- Its own code: the surface has to tell the owner which of several
      -- refusals this is, and it cannot read that back out of `22023`.
      if exists (
        select 1 from public.completions existing
        where existing.user_id = v_user_id
          and existing.plan_session_id = v_plan_session_id
      ) then
        raise exception using errcode = 'PT431',
          message = 'That session already has a completion.';
      end if;
    end if;

    insert into public.completions (
      user_id, plan_session_id, status, actual_local_date, timezone_name,
      actual_started_at, duration_minutes, perceived_effort, feeling, note,
      replacement_description, pain_reported, illness_reported, injury_reported,
      severe_fatigue_reported, planned_snapshot, created_at, updated_at
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
      v_snapshot, v_now, v_now
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
      insert into public.completion_activities (
        user_id, completion_id, personal_activity_id, position, name, sport,
        instructions, measurement_mode, actual_measurement, created_at, updated_at
      ) values (
        v_user_id, v_completion_id,
        (v_activity->>'personalActivityId')::uuid,
        (v_activity->>'position')::smallint,
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
    select completion.revision, completion.plan_session_id, completion.timezone_name
    into v_revision, v_plan_session_id, v_timezone
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

  -- Only unplanned training may have its activities corrected. A planned
  -- completion is measured against its snapshot, and what it was measured
  -- against cannot be rewritten.
  if p_completion ? 'activities' and v_plan_session_id is not null then
    raise exception using errcode = '22023', message = 'Invalid completion change.';
  end if;

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
      insert into public.completion_activities (
        user_id, completion_id, personal_activity_id, position, name, sport,
        instructions, measurement_mode, actual_measurement, created_at, updated_at
      ) values (
        v_user_id, p_completion_id,
        (v_activity->>'personalActivityId')::uuid,
        (v_activity->>'position')::smallint,
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
  when unique_violation or foreign_key_violation or check_violation
    or not_null_violation or invalid_datetime_format then
    raise exception using errcode = '22023', message = 'Invalid completion change.';
end;
$$;

revoke all privileges on function public.apply_completion_change(text, uuid, bigint, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.apply_completion_change(text, uuid, bigint, jsonb)
  to authenticated;
