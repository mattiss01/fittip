alter table public.completed_sessions
  drop constraint completed_sessions_feeling_check,
  add constraint completed_sessions_feeling_check
    check (
      feeling is null
      or feeling in (
        'much_easier',
        'easier',
        'as_expected',
        'harder',
        'much_harder'
      )
    ),
  add column idempotency_key uuid,
  add column idempotency_fingerprint text;

update public.completed_sessions
set
  idempotency_key = gen_random_uuid(),
  idempotency_fingerprint = md5(id::text);

alter table public.completed_sessions
  alter column idempotency_key set default gen_random_uuid(),
  alter column idempotency_fingerprint set default md5(gen_random_uuid()::text),
  alter column idempotency_key set not null,
  alter column idempotency_fingerprint set not null,
  add constraint completed_sessions_idempotency_key
    unique (user_id, idempotency_key),
  add constraint completed_sessions_idempotency_fingerprint_check
    check (idempotency_fingerprint ~ '^[0-9a-f]{32}$');

create function public.save_training_completion(
  p_idempotency_key uuid,
  p_completion_group_id uuid,
  p_expected_revision integer,
  p_planned_session_id uuid,
  p_actual_local_date date,
  p_actual_started_at timestamptz,
  p_timezone_name text,
  p_duration_minutes integer,
  p_status text,
  p_perceived_effort integer,
  p_feeling text,
  p_note text,
  p_replacement_description text,
  p_pain_reported boolean,
  p_illness_reported boolean,
  p_injury_reported boolean,
  p_severe_fatigue_reported boolean,
  p_correction_reason text,
  p_activities jsonb
)
returns public.completed_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_group_id uuid;
  v_revision integer;
  v_previous_id uuid;
  v_result public.completed_sessions;
  v_existing public.completed_sessions;
  v_fingerprint text;
  v_activity jsonb;
  v_position integer;
  v_positions integer[] := array[]::integer[];
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if not exists (
    select 1 from public.profiles where user_id = v_user_id
  ) then
    raise exception using errcode = '42501', message = 'Profile required';
  end if;

  if p_idempotency_key is null
    or p_expected_revision is null
    or p_expected_revision < 0
    or p_actual_local_date is null
    or p_timezone_name is null
    or char_length(trim(p_timezone_name)) not between 1 and 100
    or p_status not in (
      'completed',
      'partially_completed',
      'skipped',
      'replaced',
      'rest',
      'unplanned'
    )
    or p_duration_minutes is not null
      and p_duration_minutes not between 0 and 10080
    or p_perceived_effort is not null
      and p_perceived_effort not between 1 and 10
    or p_feeling is not null
      and p_feeling not in (
        'much_easier',
        'easier',
        'as_expected',
        'harder',
        'much_harder'
      )
    or p_note is not null and char_length(p_note) > 2000
    or p_activities is null
    or jsonb_typeof(p_activities) is distinct from 'array'
    or jsonb_array_length(p_activities) > 50
    or (
      p_status = 'unplanned'
      and p_planned_session_id is not null
    )
    or (
      p_status <> 'unplanned'
      and p_planned_session_id is null
    )
    or (
      p_status = 'replaced'
      and (
        p_replacement_description is null
        or char_length(trim(p_replacement_description)) not between 1 and 500
      )
    )
    or (
      p_status <> 'replaced'
      and p_replacement_description is not null
    ) then
    raise exception using errcode = '22023', message = 'Invalid completion';
  end if;

  if p_completion_group_id is null then
    if p_expected_revision <> 0 or p_correction_reason is not null then
      raise exception using errcode = '22023', message = 'Invalid first revision';
    end if;
  elsif p_expected_revision < 1
    or p_correction_reason is null
    or char_length(trim(p_correction_reason)) not between 1 and 500 then
    raise exception using errcode = '22023', message = 'Invalid correction';
  end if;

  if p_planned_session_id is not null and not exists (
    select 1
    from public.planned_sessions
    where id = p_planned_session_id and user_id = v_user_id
  ) then
    raise exception using errcode = '42501', message = 'Planned session unavailable';
  end if;

  for v_activity in select value from jsonb_array_elements(p_activities)
  loop
    if jsonb_typeof(v_activity) is distinct from 'object'
      or v_activity - array[
        'planned_activity_id',
        'personal_activity_id',
        'position',
        'name',
        'sport',
        'instructions',
        'measurement_mode',
        'actual_measurement'
      ] <> '{}'::jsonb
      or jsonb_typeof(v_activity -> 'position') is distinct from 'number'
      or (v_activity ->> 'position')::numeric <> trunc((v_activity ->> 'position')::numeric)
      or (v_activity ->> 'position')::integer not between 0 and 99
      or jsonb_typeof(v_activity -> 'name') is distinct from 'string'
      or char_length(trim(v_activity ->> 'name')) not between 1 and 120
      or jsonb_typeof(v_activity -> 'sport') is distinct from 'string'
      or char_length(trim(v_activity ->> 'sport')) not between 1 and 80
      or (
        v_activity -> 'instructions' <> 'null'::jsonb
        and (
          jsonb_typeof(v_activity -> 'instructions') is distinct from 'string'
          or char_length(v_activity ->> 'instructions') > 2000
        )
      )
      or jsonb_typeof(v_activity -> 'measurement_mode') is distinct from 'string'
      or v_activity ->> 'measurement_mode' not in (
        'sets_reps_load',
        'time_distance_pace',
        'duration_intensity',
        'skill_repetitions',
        'custom'
      )
      or not public.is_valid_training_measurement(
        v_activity ->> 'measurement_mode',
        case
          when v_activity -> 'actual_measurement' = 'null'::jsonb then null
          else v_activity -> 'actual_measurement'
        end
      ) then
      raise exception using errcode = '22023', message = 'Invalid completion activity';
    end if;

    v_position := (v_activity ->> 'position')::integer;
    if v_position = any(v_positions) then
      raise exception using errcode = '22023', message = 'Duplicate activity position';
    end if;
    v_positions := array_append(v_positions, v_position);

    if v_activity -> 'planned_activity_id' <> 'null'::jsonb and not exists (
      select 1
      from public.planned_activities
      where id = (v_activity ->> 'planned_activity_id')::uuid
        and user_id = v_user_id
        and planned_session_id = p_planned_session_id
    ) then
      raise exception using errcode = '42501', message = 'Planned activity unavailable';
    end if;

    if v_activity -> 'personal_activity_id' <> 'null'::jsonb and not exists (
      select 1
      from public.personal_activities
      where id = (v_activity ->> 'personal_activity_id')::uuid
        and user_id = v_user_id
    ) then
      raise exception using errcode = '42501', message = 'Personal activity unavailable';
    end if;
  end loop;

  v_fingerprint := md5(jsonb_build_object(
    'completion_group_id', p_completion_group_id,
    'expected_revision', p_expected_revision,
    'planned_session_id', p_planned_session_id,
    'actual_local_date', p_actual_local_date,
    'actual_started_at', p_actual_started_at,
    'timezone_name', p_timezone_name,
    'duration_minutes', p_duration_minutes,
    'status', p_status,
    'perceived_effort', p_perceived_effort,
    'feeling', p_feeling,
    'note', p_note,
    'replacement_description', p_replacement_description,
    'pain_reported', p_pain_reported,
    'illness_reported', p_illness_reported,
    'injury_reported', p_injury_reported,
    'severe_fatigue_reported', p_severe_fatigue_reported,
    'correction_reason', p_correction_reason,
    'activities', p_activities
  )::text);

  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':' || p_idempotency_key::text, 0)
  );

  select *
  into v_existing
  from public.completed_sessions
  where user_id = v_user_id and idempotency_key = p_idempotency_key;

  if found then
    if v_existing.idempotency_fingerprint <> v_fingerprint then
      raise exception using errcode = 'PT409', message = 'Idempotency key conflict';
    end if;
    return v_existing;
  end if;

  if p_completion_group_id is null then
    v_group_id := gen_random_uuid();
    v_revision := 1;
    v_previous_id := null;
  else
    perform pg_advisory_xact_lock(
      hashtextextended(v_user_id::text || ':' || p_completion_group_id::text, 0)
    );
    select current_completion_id, revision
    into v_previous_id, v_revision
    from public.completion_heads
    where user_id = v_user_id
      and completion_group_id = p_completion_group_id
    for update;

    if not found or v_revision <> p_expected_revision then
      raise exception using errcode = 'PT409', message = 'Completion revision conflict';
    end if;
    v_group_id := p_completion_group_id;
    v_revision := v_revision + 1;
  end if;

  insert into public.completed_sessions (
    user_id,
    completion_group_id,
    revision_number,
    previous_completion_id,
    planned_session_id,
    actual_local_date,
    actual_started_at,
    timezone_name,
    duration_minutes,
    status,
    perceived_effort,
    feeling,
    note,
    replacement_description,
    pain_reported,
    illness_reported,
    injury_reported,
    severe_fatigue_reported,
    correction_reason,
    idempotency_key,
    idempotency_fingerprint
  )
  values (
    v_user_id,
    v_group_id,
    v_revision,
    v_previous_id,
    p_planned_session_id,
    p_actual_local_date,
    p_actual_started_at,
    p_timezone_name,
    p_duration_minutes,
    p_status,
    p_perceived_effort,
    p_feeling,
    p_note,
    p_replacement_description,
    coalesce(p_pain_reported, false),
    coalesce(p_illness_reported, false),
    coalesce(p_injury_reported, false),
    coalesce(p_severe_fatigue_reported, false),
    p_correction_reason,
    p_idempotency_key,
    v_fingerprint
  )
  returning * into v_result;

  insert into public.completed_activities (
    user_id,
    completed_session_id,
    planned_activity_id,
    personal_activity_id,
    position,
    name,
    sport,
    instructions,
    measurement_mode,
    actual_measurement
  )
  select
    v_user_id,
    v_result.id,
    nullif(value ->> 'planned_activity_id', '')::uuid,
    nullif(value ->> 'personal_activity_id', '')::uuid,
    (value ->> 'position')::integer,
    trim(value ->> 'name'),
    trim(value ->> 'sport'),
    nullif(value ->> 'instructions', ''),
    value ->> 'measurement_mode',
    case
      when value -> 'actual_measurement' = 'null'::jsonb then null
      else value -> 'actual_measurement'
    end
  from jsonb_array_elements(p_activities);

  if v_revision = 1 then
    insert into public.completion_heads (
      user_id,
      completion_group_id,
      current_completion_id,
      revision
    )
    values (v_user_id, v_group_id, v_result.id, v_revision);
  else
    update public.completion_heads
    set
      current_completion_id = v_result.id,
      revision = v_revision,
      updated_at = now()
    where user_id = v_user_id and completion_group_id = v_group_id;
  end if;

  return v_result;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = '22023', message = 'Invalid completion';
end;
$$;

revoke all privileges on function public.save_training_completion(
  uuid,
  uuid,
  integer,
  uuid,
  date,
  timestamptz,
  text,
  integer,
  text,
  integer,
  text,
  text,
  text,
  boolean,
  boolean,
  boolean,
  boolean,
  text,
  jsonb
) from public, anon, authenticated;

grant execute on function public.save_training_completion(
  uuid,
  uuid,
  integer,
  uuid,
  date,
  timestamptz,
  text,
  integer,
  text,
  integer,
  text,
  text,
  text,
  boolean,
  boolean,
  boolean,
  boolean,
  text,
  jsonb
) to authenticated;
