-- The coach's note on a session, and each activity's reason (ADR-040, owner,
-- 28 Oct 2026). Accepting a Fill with Coach suggestion used to leave nothing of
-- what the coach wrote but the activities, and a later ask read none of it, so
-- "give me more exercises" after "a push session" forgot the push. A session and
-- a series may now carry a coach's note, and their activities the coach's reason
-- for each; the app writes them from an accepted suggestion, the owner edits or
-- clears them like any other field, and the next ask reads them.
--
-- Additive: every existing row reads as having none. The functions below are
-- re-issued from their current definitions with only the `coachNote` and
-- `rationale` keys added: the four input validators, the two state readers (so
-- the change log's before/after carry them), the slice, the materializer (an
-- occurrence takes its series' note and reasons), the series-activity writer and
-- the change-set writer. Same signatures, so grants are unchanged.

alter table public.rolling_plan_sessions
  add column coach_note text,
  add constraint rolling_plan_sessions_coach_note_length
    check (coach_note is null or char_length(coach_note) between 1 and 1000);

alter table public.rolling_plan_series
  add column coach_note text,
  add constraint rolling_plan_series_coach_note_length
    check (coach_note is null or char_length(coach_note) between 1 and 1000);

alter table public.rolling_plan_activities
  add column rationale text,
  add constraint rolling_plan_activities_rationale_length
    check (rationale is null or char_length(rationale) between 1 and 300);

alter table public.rolling_plan_series_activities
  add column rationale text,
  add constraint rolling_plan_series_activities_rationale_length
    check (rationale is null or char_length(rationale) between 1 and 300);

CREATE OR REPLACE FUNCTION public.rolling_plan_activity_input_is_valid(p_value jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_position numeric;
  v_mode text;
begin
  if p_value is null or pg_catalog.jsonb_typeof(p_value) <> 'object'
    or p_value - array[
      'personalActivityId', 'position', 'name', 'sport', 'instructions',
      'rationale', 'measurementMode', 'target'
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
    or (p_value ? 'instructions' and pg_catalog.jsonb_typeof(p_value->'instructions') not in ('string', 'null'))
    or pg_catalog.char_length(coalesce(p_value->>'instructions', '')) > 2000
    -- The coach's reason for it, kept when its suggestion was accepted.
    or (p_value ? 'rationale'
      and pg_catalog.jsonb_typeof(p_value->'rationale') not in ('string', 'null'))
    or pg_catalog.char_length(coalesce(p_value->>'rationale', '')) > 300
    or not public.is_training_measurement_mode(v_mode)
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
$function$;

CREATE OR REPLACE FUNCTION public.rolling_plan_series_activity_input_is_valid(p_value jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_position numeric;
  v_mode text;
begin
  if p_value is null or pg_catalog.jsonb_typeof(p_value) <> 'object'
    or p_value - array[
      'personalActivityId', 'position', 'name', 'sport', 'instructions',
      'rationale', 'measurementMode', 'target'
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
    -- The coach's reason for it, kept when its suggestion was accepted.
    or (p_value ? 'rationale'
      and pg_catalog.jsonb_typeof(p_value->'rationale') not in ('string', 'null'))
    or pg_catalog.char_length(coalesce(p_value->>'rationale', '')) > 300
    or not public.is_training_measurement_mode(v_mode)
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
$function$;

CREATE OR REPLACE FUNCTION public.rolling_plan_session_input_is_valid(p_value jsonb, p_with_placement boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_activity jsonb;
  v_position numeric;
  v_positions smallint[] := array[]::smallint[];
begin
  if p_value is null or pg_catalog.jsonb_typeof(p_value) <> 'object'
    or p_value - (case when p_with_placement then array[
      'localDate', 'position', 'title', 'sport', 'intent',
      'expectedDurationMinutes', 'startTime', 'note', 'coachNote', 'activities',
      'seriesId', 'occurrenceDate'
    ] else array[
      'title', 'sport', 'intent', 'expectedDurationMinutes', 'startTime', 'note',
      'coachNote', 'activities'
    ] end) <> '{}'::jsonb
    or not (p_value ?& (case when p_with_placement then
      array['localDate', 'position', 'title', 'sport', 'activities']
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
    -- The coach's note: what the session was asked for and built to do.
    or (p_value ? 'coachNote'
      and pg_catalog.jsonb_typeof(p_value->'coachNote') not in ('string', 'null'))
    or pg_catalog.char_length(coalesce(p_value->>'coachNote', '')) > 1000
    -- A start time is optional, whole minutes on a 24-hour clock.
    or (p_value ? 'startTime'
      and pg_catalog.jsonb_typeof(p_value->'startTime') <> 'null'
      and (pg_catalog.jsonb_typeof(p_value->'startTime') <> 'string'
        or (p_value->>'startTime') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'))
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
$function$;

CREATE OR REPLACE FUNCTION public.rolling_plan_series_input_is_valid(p_value jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
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
      'title', 'sport', 'intent', 'expectedDurationMinutes', 'startTime', 'note',
      'coachNote', 'activities'
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
    -- A start time is optional, whole minutes on a 24-hour clock.
    or (p_value ? 'startTime'
      and pg_catalog.jsonb_typeof(p_value->'startTime') <> 'null'
      and (pg_catalog.jsonb_typeof(p_value->'startTime') <> 'string'
        or (p_value->>'startTime') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'))
    or (p_value ? 'intent'
      and pg_catalog.jsonb_typeof(p_value->'intent') not in ('string', 'null'))
    or pg_catalog.char_length(coalesce(p_value->>'intent', '')) > 500
    or (p_value ? 'note'
      and pg_catalog.jsonb_typeof(p_value->'note') not in ('string', 'null'))
    or pg_catalog.char_length(coalesce(p_value->>'note', '')) > 2000
    -- The coach's note: what the session was asked for and built to do.
    or (p_value ? 'coachNote'
      and pg_catalog.jsonb_typeof(p_value->'coachNote') not in ('string', 'null'))
    or pg_catalog.char_length(coalesce(p_value->>'coachNote', '')) > 1000
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
$function$;

CREATE OR REPLACE FUNCTION public.rolling_plan_session_state(p_user_id uuid, p_session_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select pg_catalog.jsonb_build_object(
    'localDate', s.local_date::text,
    'position', s.position,
    'title', s.title,
    'sport', s.sport,
    'intent', s.intent,
    'expectedDurationMinutes', s.expected_duration_minutes,
    'startTime', pg_catalog.to_char(s.start_time, 'HH24:MI'),
    'note', s.note,
    'coachNote', s.coach_note,
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
        'rationale', a.rationale,
        'measurementMode', a.measurement_mode,
        'target', a.target
      ) order by a.position, a.id)
      from public.rolling_plan_activities a
      where a.user_id = p_user_id and a.session_id = p_session_id
    ), '[]'::jsonb)
  )
  from public.rolling_plan_sessions s
  where s.user_id = p_user_id and s.id = p_session_id;
$function$;

CREATE OR REPLACE FUNCTION public.rolling_plan_series_state(p_user_id uuid, p_series_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
    'startTime', pg_catalog.to_char(s.start_time, 'HH24:MI'),
    'note', s.note,
    'coachNote', s.coach_note,
    'activities', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', a.id,
        'personalActivityId', a.personal_activity_id,
        'position', a.position,
        'name', a.name,
        'sport', a.sport,
        'instructions', a.instructions,
        'rationale', a.rationale,
        'measurementMode', a.measurement_mode,
        'target', a.target
      ) order by a.position, a.id)
      from public.rolling_plan_series_activities a
      where a.user_id = p_user_id and a.series_id = p_series_id
    ), '[]'::jsonb)
  )
  from public.rolling_plan_series s
  where s.user_id = p_user_id and s.id = p_series_id;
$function$;

CREATE OR REPLACE FUNCTION public.get_rolling_plan_slice(p_start_date date, p_end_date date)
 RETURNS rolling_plan_slice_receipt
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
      session.start_time,
      session.note,
      session.coach_note,
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
            'rationale', activity.rationale,
            'measurementMode', activity.measurement_mode,
            'target', activity.target
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
          'startTime', pg_catalog.to_char(session.start_time, 'HH24:MI'),
          'note', session.note,
          'coachNote', session.coach_note,
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
$function$;

CREATE OR REPLACE FUNCTION public.materialize_rolling_plan_series(p_expected_plan_revision bigint, p_idempotency_key uuid)
 RETURNS rolling_plan_materialization_receipt
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  -- R3b-2: today plus ninety days, thirteen weeks in all. It was `+ 13`.
  v_today := (pg_catalog.timezone(v_timezone, v_now))::date;
  v_window_end := v_today + 90;

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
            'rationale', activity.rationale,
            'measurementMode', activity.measurement_mode,
            'target', activity.target
          )) as item
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
      -- M3-20: nor is a date the owner deleted this series' occurrence from.
      if v_date = any(v_series.skipped_occurrence_dates) then continue; end if;

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
      -- R3b-2: at ninety-one days two daily series already exceed that on a
      -- first fill, so the application now calls again while this is reported.
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
          'startTime', pg_catalog.to_char(v_series.start_time, 'HH24:MI'),
          'note', v_series.note,
          'coachNote', v_series.coach_note,
          'seriesId', v_series.id,
          'occurrenceDate', v_key
        )) || pg_catalog.jsonb_build_object(
          'position', v_position,
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
$function$;

CREATE OR REPLACE FUNCTION public.rolling_plan_replace_series_activities(p_user_id uuid, p_series_id uuid, p_activities jsonb, p_now timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
      instructions, rationale, measurement_mode, target, created_at,
      updated_at
    ) values (
      p_user_id, p_series_id,
      (v_activity->>'personalActivityId')::uuid,
      (v_activity->>'position')::smallint,
      pg_catalog.btrim(v_activity->>'name'),
      pg_catalog.btrim(v_activity->>'sport'),
      nullif(v_activity->>'instructions', ''),
      nullif(v_activity->>'rationale', ''),
      v_activity->>'measurementMode',
      nullif(v_activity->'target', 'null'::jsonb),
      p_now, p_now
    );
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION public.apply_rolling_plan_change_set(p_expected_plan_revision bigint, p_idempotency_key uuid, p_provenance text, p_changes jsonb)
 RETURNS rolling_plan_change_receipt
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  v_occurrence_date date;
  -- Cancellation reason: the owner's optional why, kept beside the session.
  v_cancel_reason text;
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
          expected_duration_minutes, start_time, note, coach_note, created_at,
          updated_at
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
          (v_series_input->>'startTime')::time,
          nullif(v_series_input->>'note', ''),
          nullif(v_series_input->>'coachNote', ''),
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
            expected_duration_minutes, start_time, note, coach_note, created_at,
          updated_at
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
            (v_series_input->>'startTime')::time,
            nullif(v_series_input->>'note', ''),
            nullif(v_series_input->>'coachNote', ''),
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
            start_time = (v_series_input->>'startTime')::time,
            note = nullif(v_series_input->>'note', ''),
            coach_note = nullif(v_series_input->>'coachNote', ''),
            updated_at = v_now
          where id = v_series_id and user_id = v_user_id;
          perform public.rolling_plan_replace_series_activities(
            v_user_id, v_series_id, v_series_input->'activities', v_now
          );
          -- The rule changed, so every occurrence it already produced is stale.
          v_sweep_from := least(
            v_series.start_date, (v_series_input->>'startDate')::date
          );
          -- M3-20: a deleted occurrence is skipped only under the rule it was
          -- deleted from. The rule is being rewritten from here, and the sweep
          -- below already discards every cancelled and edited occurrence in
          -- the same range, so the owner's skips there go with them.
          update public.rolling_plan_series set
            skipped_occurrence_dates = array(
              select skipped from pg_catalog.unnest(skipped_occurrence_dates) as skipped
              where skipped < v_sweep_from order by skipped
            )
          where id = v_series_id and user_id = v_user_id;
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
          expected_duration_minutes, start_time, note, coach_note, status, series_id,
          occurrence_date, has_diverged, created_at, updated_at
        ) values (
          v_session_id, v_user_id, v_plan.id,
          v_local_date,
          (v_session_input->>'position')::smallint,
          pg_catalog.btrim(v_session_input->>'title'),
          pg_catalog.btrim(v_session_input->>'sport'),
          nullif(v_session_input->>'intent', ''),
          (v_session_input->>'expectedDurationMinutes')::integer,
          (v_session_input->>'startTime')::time,
          nullif(v_session_input->>'note', ''),
          nullif(v_session_input->>'coachNote', ''),
          'active', v_occurrence_series_id,
          (v_session_input->>'occurrenceDate')::date,
          false, v_now, v_now
        );
      elsif v_operation = 'delete' then
        -- M3-19: the one owner-driven hard delete of a planned session.
        --
        -- A cancelled row is admitted as well as an active one, because a
        -- session the owner already cancelled is exactly what they may next
        -- want gone. The past boundary still holds, as it does for every
        -- other operation.
        if v_change - array['operation', 'sessionId'] <> '{}'::jsonb then
          raise exception using errcode = '22023', message = 'Invalid rolling plan deletion.';
        end if;
        select session.local_date, session.series_id, session.occurrence_date
        into v_local_date, v_occurrence_series_id, v_occurrence_date
        from public.rolling_plan_sessions session
        where session.id = v_session_id and session.user_id = v_user_id
          and session.status in ('active', 'cancelled')
        for update;
        if not found then raise exception using errcode = '22023', message = 'Invalid rolling plan change.'; end if;
        if v_local_date < v_today then
          raise exception using errcode = 'PT422',
            message = 'A plan change cannot target a date before today.';
        end if;
        -- The record of what happened outlives the plan entry it was measured
        -- against, which is the same reasoning that made `planned_snapshot`
        -- write-once. `completions_plan_fkey` would refuse the delete anyway;
        -- raising here is what turns a raw foreign-key violation into an
        -- owner-visible refusal. The row lock above is stronger than the key
        -- share a concurrent completion insert takes, so this cannot be raced.
        if exists (
          select 1 from public.completions completion
          where completion.user_id = v_user_id
            and completion.plan_session_id = v_session_id
        ) then
          raise exception using errcode = 'PT425',
            message = 'This session has training logged against it, so its plan entry cannot be changed.';
        end if;
        v_session_dates := v_session_dates || v_local_date;
        v_before := public.rolling_plan_session_state(v_user_id, v_session_id);
        delete from public.rolling_plan_sessions
        where id = v_session_id and user_id = v_user_id;
        -- M3-20: without this the materializer finds the rule date empty and
        -- writes the occurrence straight back. The rule date is recorded, not
        -- the local date, because a moved occurrence is still the series'
        -- answer to its rule date. Dates behind today can never be filled
        -- again, so they are dropped here rather than kept forever.
        if v_occurrence_series_id is not null and v_occurrence_date >= v_today then
          update public.rolling_plan_series set
            skipped_occurrence_dates = array(
              select skipped from pg_catalog.unnest(
                skipped_occurrence_dates || v_occurrence_date
              ) as skipped
              where skipped >= v_today
              group by skipped order by skipped
            )
          where id = v_occurrence_series_id and user_id = v_user_id;
        end if;
        -- Exactly the entry `rolling_plan_sweep_series_occurrences` already
        -- writes for a removed occurrence: a dated `delete` naming no session,
        -- which is what survives `rolling_plan_change_entries_session_fkey`
        -- cascading this row's own earlier entries away.
        v_after := pg_catalog.jsonb_build_object(
          'localDate', v_local_date::text, 'deleted', true
        );
      elsif v_operation = 'reactivate' then
        -- M3-20: the one operation that admits only a cancelled session. Like
        -- delete it is the owner's individual act; the past boundary holds,
        -- because an active planned
        -- session in the past is something no operation may create. A session
        -- trained after it was cancelled is logged against the cancelled row,
        -- whose completion snapshot then records both facts.
        if v_change - array['operation', 'sessionId'] <> '{}'::jsonb then
          raise exception using errcode = '22023', message = 'Invalid rolling plan reactivation.';
        end if;
        select session.local_date into v_local_date
        from public.rolling_plan_sessions session
        where session.id = v_session_id and session.user_id = v_user_id
          and session.status = 'cancelled'
        for update;
        if not found then raise exception using errcode = '22023', message = 'Invalid rolling plan change.'; end if;
        if v_local_date < v_today then
          raise exception using errcode = 'PT422',
            message = 'A plan change cannot target a date before today.';
        end if;
        -- Logged session: a cancelled session that was trained anyway keeps
        -- the state its log was written against.
        if exists (
          select 1 from public.completions completion
          where completion.user_id = v_user_id
            and completion.plan_session_id = v_session_id
        ) then
          raise exception using errcode = 'PT425',
            message = 'This session has training logged against it, so its plan entry cannot be changed.';
        end if;
        v_session_dates := v_session_dates || v_local_date;
        v_before := public.rolling_plan_session_state(v_user_id, v_session_id);
        -- Cancelling freed the session's place in the day, and another session
        -- may hold it now. It returns after the last active one; a day that is
        -- already full is refused by the cap below, not here.
        select coalesce(pg_catalog.max(session.position), -1) + 1 into v_position
        from public.rolling_plan_sessions session
        where session.user_id = v_user_id and session.local_date = v_local_date
          and session.status = 'active';
        if v_position > 99 then
          select pg_catalog.min(candidate) into v_position
          from pg_catalog.generate_series(0, 99) as candidate
          where not exists (
            select 1 from public.rolling_plan_sessions session
            where session.user_id = v_user_id and session.local_date = v_local_date
              and session.status = 'active' and session.position = candidate
          );
        end if;
        update public.rolling_plan_sessions set
          status = 'active', cancelled_at = null,
          position = v_position::smallint, updated_at = v_now
        where id = v_session_id and user_id = v_user_id;
        -- Cancellation reason: a reactivated session is no longer cancelled,
        -- so why it was is no longer true of it (owner, 29 Sep 2026).
        delete from public.rolling_plan_session_cancellations
        where session_id = v_session_id and user_id = v_user_id;
      elsif v_operation in ('edit', 'move', 'cancel') then
        select session.local_date into v_local_date
        from public.rolling_plan_sessions session
        where session.id = v_session_id and session.user_id = v_user_id
          and session.status = 'active'
        for update;
        if not found then raise exception using errcode = '22023', message = 'Invalid rolling plan change.'; end if;
        -- A past session is history: the past boundary blocks the owner.
        if v_local_date < v_today then
          raise exception using errcode = 'PT422',
            message = 'A plan change cannot target a date before today.';
        end if;
        -- Logged session: what a log was measured against is settled, because
        -- the page that offers
        -- none of these is the rule being enforced. Behind the row lock
        -- above, as Delete's check is, so a log being written is waited for.
        if exists (
          select 1 from public.completions completion
          where completion.user_id = v_user_id
            and completion.plan_session_id = v_session_id
        ) then
          raise exception using errcode = 'PT425',
            message = 'This session has training logged against it, so its plan entry cannot be changed.';
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
            start_time = (v_session_input->>'startTime')::time,
            note = nullif(v_session_input->>'note', ''),
            coach_note = nullif(v_session_input->>'coachNote', ''),
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
        elsif v_operation = 'cancel' then
          -- Cancellation reason: `reason` is optional, and a cancel without
          -- one is exactly the cancel it always was.
          if v_change - array['operation', 'sessionId', 'reason'] <> '{}'::jsonb
            or (
              v_change ? 'reason'
              and pg_catalog.jsonb_typeof(v_change->'reason') <> 'null'
              and not public.rolling_plan_cancellation_reason_is_valid(v_change->'reason')
            )
          then
            raise exception using errcode = '22023', message = 'Invalid rolling plan cancellation.';
          end if;
          update public.rolling_plan_sessions set
            status = 'cancelled', cancelled_at = v_now, updated_at = v_now
          where id = v_session_id and user_id = v_user_id;
          v_cancel_reason := pg_catalog.btrim(v_change->>'reason', E' \t\r\n');
          if v_cancel_reason is not null then
            insert into public.rolling_plan_session_cancellations (
              session_id, user_id, reason, created_at, updated_at
            ) values (v_session_id, v_user_id, v_cancel_reason, v_now, v_now);
          end if;
        else
          -- M3-19: cancel used to be this chain's fallthrough. Now that one of
          -- the operations beside it destroys a row, an unrecognized operation
          -- has to land nowhere rather than in whichever branch happens to be
          -- written last.
          raise exception using errcode = '22023', message = 'Invalid rolling plan change.';
        end if;

        -- ADR-017, as amended 22 September 2026: an occurrence is diverged
        -- when its content no longer reads as its rule's, which only an edit
        -- does. A move and a cancel leave what it says alone, so they
        -- leave the flag alone. The materializer never revisits an existing
        -- occurrence either way.
        if v_operation = 'edit' then
          update public.rolling_plan_sessions set has_diverged = true
          where id = v_session_id and user_id = v_user_id
            and series_id is not null and not has_diverged;
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
            name, sport, instructions, rationale, measurement_mode, target,
            created_at, updated_at
          ) values (
            v_user_id, v_plan.id, v_session_id,
            (v_activity->>'personalActivityId')::uuid,
            (v_activity->>'position')::smallint,
            pg_catalog.btrim(v_activity->>'name'),
            pg_catalog.btrim(v_activity->>'sport'),
            nullif(v_activity->>'instructions', ''),
            nullif(v_activity->>'rationale', ''),
            v_activity->>'measurementMode', v_activity->'target',
            v_now, v_now
          );
        end loop;
      end if;

      if v_operation <> 'delete' then
        v_after := public.rolling_plan_session_state(v_user_id, v_session_id);
      end if;
    end if;

    if v_before is not null and v_before = v_after then
      raise exception using errcode = '22023', message = 'A plan change must change current state.';
    end if;
    insert into public.rolling_plan_change_entries (
      user_id, plan_id, change_set_id, session_id, series_id, local_date,
      ordinal, change_kind, before_state, after_state, created_at
    ) values (
      v_user_id, v_plan.id, v_change_set_id,
      case when v_operation in ('add', 'edit', 'move', 'cancel', 'reactivate')
        then v_session_id else null end,
      case when v_operation = 'add_series' then v_series_id
        when v_operation = 'end_series' then v_series_id
        when v_operation = 'edit_series'
          then coalesce(v_successor_series_id, v_series_id)
        else null end,
      case when v_operation in ('set_recovery_day', 'delete') then v_local_date
        else null end,
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
        'completedKept', v_sweep->'completedKept'
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
$function$;
