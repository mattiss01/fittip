-- Measurement categories (ADR-038).
--
-- Owner, 21 Oct 2026, after live tracking shipped: five ways to measure an
-- activity instead of six, and the two that were missing.
--
-- * Sets hold a time as well as reps: a block is sets × reps or sets × seconds,
--   with a weight if there is one (a plank 3×45 s, a weighted hang 3×20 s at
--   10 kg). Reps and seconds never together in one block.
-- * Intervals, a new mode: blocks of repeats × a distance or a time, with rest
--   between (6×400 m / 90 s, then 4×200 m / 60 s).
-- * Repetitions folds into Sets (50 serves is 1 × 50 reps; the counted word
--   goes, the activity's name says what is counted) and Custom goes.
--
-- The owner decided that no stored data needs to be kept. Rows in a removed
-- mode are converted where that is trivial - Repetitions to one set of its
-- count - and otherwise emptied: Custom becomes "nothing to count". That
-- includes measurements sealed into history (`completions.planned_snapshot`,
-- the change entries, proposals), so no reader has to know the removed shapes
-- again. `planned_snapshot` is guarded against rewrites by
-- `completions_immutable_facts`; the guard is switched off for this one update
-- and on again in the same transaction.
--
-- The five input validators that listed the modes by hand now ask one helper,
-- `is_training_measurement_mode`. They are re-issued from their current
-- definitions with only that list replaced: same signatures, same grants.

-- 1. Convert what is stored ---------------------------------------------------

create function public.fittip_converted_mode(p_mode text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_mode
    when 'skill_repetitions' then 'sets_reps_load'
    when 'custom' then 'unmeasured'
    else p_mode
  end
$$;

create function public.fittip_converted_measurement(p_mode text, p_value jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when p_value is null or pg_catalog.jsonb_typeof(p_value) = 'null' then p_value
    when p_mode = 'skill_repetitions' then pg_catalog.jsonb_build_object(
      'groups', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'sets', 1,
        'reps', least(greatest((p_value->>'repetitions')::numeric, 1), 10000)::integer
      ))
    )
    when p_mode = 'custom' then null
    else p_value
  end
$$;

-- Any object carrying `measurementMode`, however deep, with its `target` and
-- `actualMeasurement` beside it: the shape every embedded activity has.
create function public.fittip_converted_document(p_value jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_result jsonb;
  v_key text;
  v_item jsonb;
  v_mode text;
begin
  if p_value is null then
    return null;
  end if;
  if pg_catalog.jsonb_typeof(p_value) = 'array' then
    select coalesce(
      pg_catalog.jsonb_agg(public.fittip_converted_document(element.value)
        order by element.ordinality),
      '[]'::jsonb)
    into v_result
    from pg_catalog.jsonb_array_elements(p_value) with ordinality as element;
    return v_result;
  end if;
  if pg_catalog.jsonb_typeof(p_value) <> 'object' then
    return p_value;
  end if;
  v_result := '{}'::jsonb;
  for v_key, v_item in select key, value from pg_catalog.jsonb_each(p_value) loop
    v_result := v_result || pg_catalog.jsonb_build_object(
      v_key, public.fittip_converted_document(v_item));
  end loop;
  v_mode := v_result->>'measurementMode';
  if v_mode in ('skill_repetitions', 'custom') then
    v_result := v_result || pg_catalog.jsonb_build_object(
      'measurementMode', public.fittip_converted_mode(v_mode));
    if v_result ? 'target' then
      v_result := v_result || pg_catalog.jsonb_build_object('target',
        coalesce(public.fittip_converted_measurement(
          v_mode, v_result->'target'), 'null'::jsonb));
    end if;
    if v_result ? 'actualMeasurement' then
      v_result := v_result || pg_catalog.jsonb_build_object('actualMeasurement',
        coalesce(public.fittip_converted_measurement(
          v_mode, v_result->'actualMeasurement'), 'null'::jsonb));
    end if;
  end if;
  return v_result;
end;
$$;

-- What is about to be converted, said in the apply's output so the owner is
-- told what changed on the founder project.
do $$
declare
  v_line text;
begin
  for v_line in
    select format('%s: %s row(s) in a removed mode', name, total)
    from (values
      ('personal_activities', (select count(*) from public.personal_activities
        where measurement_mode in ('skill_repetitions', 'custom'))),
      ('rolling_plan_activities', (select count(*) from public.rolling_plan_activities
        where measurement_mode in ('skill_repetitions', 'custom'))),
      ('rolling_plan_series_activities', (select count(*)
        from public.rolling_plan_series_activities
        where measurement_mode in ('skill_repetitions', 'custom'))),
      ('saved_session_activities', (select count(*) from public.saved_session_activities
        where measurement_mode in ('skill_repetitions', 'custom'))),
      ('completion_activities', (select count(*) from public.completion_activities
        where measurement_mode in ('skill_repetitions', 'custom'))),
      ('completions.planned_snapshot', (select count(*) from public.completions
        where planned_snapshot::text like '%skill_repetitions%'
          or planned_snapshot::text like '%"custom"%')),
      ('rolling_plan_change_entries', (select count(*)
        from public.rolling_plan_change_entries
        where before_state::text like '%skill_repetitions%'
          or before_state::text like '%"custom"%'
          or after_state::text like '%skill_repetitions%'
          or after_state::text like '%"custom"%')),
      ('plan_proposals', (select count(*) from public.plan_proposals
        where content::text like '%skill_repetitions%'
          or content::text like '%"custom"%')),
      ('session_activity_proposals', (select count(*)
        from public.session_activity_proposals
        where content::text like '%skill_repetitions%'
          or content::text like '%"custom"%')),
      ('live_workouts (deleted)', (select count(*) from public.live_workouts
        where exists (
          select 1 from pg_catalog.jsonb_array_elements(state->'activities') as a
          where a->>'mode' in ('skill_repetitions', 'custom')
            or a->>'targetMode' in ('skill_repetitions', 'custom'))))
    ) as counted(name, total)
  loop
    raise notice '%', v_line;
  end loop;
end;
$$;

update public.personal_activities
set default_measurement = public.fittip_converted_measurement(
    measurement_mode, default_measurement),
  measurement_mode = public.fittip_converted_mode(measurement_mode)
where measurement_mode in ('skill_repetitions', 'custom');

update public.rolling_plan_activities
set target = public.fittip_converted_measurement(measurement_mode, target),
  measurement_mode = public.fittip_converted_mode(measurement_mode)
where measurement_mode in ('skill_repetitions', 'custom');

update public.rolling_plan_series_activities
set target = public.fittip_converted_measurement(measurement_mode, target),
  measurement_mode = public.fittip_converted_mode(measurement_mode)
where measurement_mode in ('skill_repetitions', 'custom');

update public.saved_session_activities
set target = public.fittip_converted_measurement(measurement_mode, target),
  measurement_mode = public.fittip_converted_mode(measurement_mode)
where measurement_mode in ('skill_repetitions', 'custom');

update public.completion_activities
set actual_measurement = public.fittip_converted_measurement(
    measurement_mode, actual_measurement),
  measurement_mode = public.fittip_converted_mode(measurement_mode)
where measurement_mode in ('skill_repetitions', 'custom');

alter table public.completions disable trigger completions_immutable_facts;
update public.completions
set planned_snapshot = public.fittip_converted_document(planned_snapshot)
where planned_snapshot::text like '%skill_repetitions%'
  or planned_snapshot::text like '%"custom"%';
alter table public.completions enable trigger completions_immutable_facts;

update public.rolling_plan_change_entries
set before_state = public.fittip_converted_document(before_state),
  after_state = public.fittip_converted_document(after_state)
where before_state::text like '%skill_repetitions%'
  or before_state::text like '%"custom"%'
  or after_state::text like '%skill_repetitions%'
  or after_state::text like '%"custom"%';

update public.plan_proposals
set content = public.fittip_converted_document(content)
where content::text like '%skill_repetitions%'
  or content::text like '%"custom"%';

update public.session_activity_proposals
set content = public.fittip_converted_document(content)
where content::text like '%skill_repetitions%'
  or content::text like '%"custom"%';

-- A workout in progress is a draft (ADR-037): one holding a removed mode is
-- dropped rather than converted.
delete from public.live_workouts
where exists (
  select 1 from pg_catalog.jsonb_array_elements(state->'activities') as a
  where a->>'mode' in ('skill_repetitions', 'custom')
    or a->>'targetMode' in ('skill_repetitions', 'custom')
);

drop function public.fittip_converted_document(jsonb);
drop function public.fittip_converted_measurement(text, jsonb);
drop function public.fittip_converted_mode(text);

-- 2. The measurement check ------------------------------------------------------

create or replace function public.is_valid_training_measurement(
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
  v_group jsonb;
  v_loaded boolean;
  v_measured boolean;
begin
  if p_value is null then
    return true;
  end if;

  if jsonb_typeof(p_value) is distinct from 'object'
    or octet_length(p_value::text) > 4096 then
    return false;
  end if;

  if p_mode = 'unmeasured' then
    return false;
  end if;

  if p_mode = 'sets_reps_load' then
    -- Grouped: each block is sets × reps or sets × seconds, either with a
    -- weight. Reps and seconds are two answers to one question, so a block
    -- carries at most one of them.
    if p_value ? 'groups' then
      if p_value - array['groups', 'load_unit'] <> '{}'::jsonb
        or jsonb_typeof(p_value -> 'groups') is distinct from 'array'
        or jsonb_array_length(p_value -> 'groups') not between 1 and 20 then
        return false;
      end if;

      v_loaded := false;
      for v_group in
        select value from jsonb_array_elements(p_value -> 'groups')
      loop
        if jsonb_typeof(v_group) is distinct from 'object'
          or v_group - array['sets', 'reps', 'seconds', 'load'] <> '{}'::jsonb
          or not (
            v_group ? 'sets' or v_group ? 'reps' or v_group ? 'seconds'
            or v_group ? 'load'
          )
          or (v_group ? 'reps' and v_group ? 'seconds') then
          return false;
        end if;

        if v_group ? 'sets' then
          if jsonb_typeof(v_group -> 'sets') is distinct from 'number' then
            return false;
          end if;
          v_first := (v_group ->> 'sets')::numeric;
          if v_first <> trunc(v_first) or v_first not between 1 and 100 then
            return false;
          end if;
        end if;

        if v_group ? 'reps' then
          if jsonb_typeof(v_group -> 'reps') is distinct from 'number' then
            return false;
          end if;
          v_second := (v_group ->> 'reps')::numeric;
          if v_second <> trunc(v_second) or v_second not between 1 and 10000 then
            return false;
          end if;
        end if;

        if v_group ? 'seconds' then
          if jsonb_typeof(v_group -> 'seconds') is distinct from 'number' then
            return false;
          end if;
          v_second := (v_group ->> 'seconds')::numeric;
          if v_second <> trunc(v_second) or v_second not between 1 and 86400 then
            return false;
          end if;
        end if;

        if v_group ? 'load' then
          if jsonb_typeof(v_group -> 'load') is distinct from 'number' then
            return false;
          end if;
          v_third := (v_group ->> 'load')::numeric;
          if v_third < 0 or v_third > 100000 then
            return false;
          end if;
          v_loaded := true;
        end if;
      end loop;

      -- The presence test first: absent, the comparison is NULL, and a check
      -- constraint passes a NULL (A2c).
      if v_loaded then
        return p_value ? 'load_unit'
          and jsonb_typeof(p_value -> 'load_unit') = 'string'
          and p_value ->> 'load_unit' in ('kg', 'lb');
      end if;
      return not (p_value ? 'load_unit');
    end if;

    -- The flat form nothing writes any more, readable for good (A2c).
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

  if p_mode = 'intervals' then
    -- Blocks of repeats, each of a distance or a time (or both: 400 m in
    -- 90 s), with rest between. The distance unit sits once at the top, as
    -- the load unit does, and is there exactly when a block has a distance.
    if p_value - array['blocks', 'distance_unit'] <> '{}'::jsonb
      or jsonb_typeof(p_value -> 'blocks') is distinct from 'array'
      or jsonb_array_length(p_value -> 'blocks') not between 1 and 20 then
      return false;
    end if;

    v_measured := false;
    for v_group in
      select value from jsonb_array_elements(p_value -> 'blocks')
    loop
      if jsonb_typeof(v_group) is distinct from 'object'
        or v_group - array['repeats', 'distance', 'seconds', 'rest_seconds']
          <> '{}'::jsonb
        or jsonb_typeof(v_group -> 'repeats') is distinct from 'number'
        or not (v_group ? 'distance' or v_group ? 'seconds') then
        return false;
      end if;

      v_first := (v_group ->> 'repeats')::numeric;
      if v_first <> trunc(v_first) or v_first not between 1 and 100 then
        return false;
      end if;

      if v_group ? 'distance' then
        if jsonb_typeof(v_group -> 'distance') is distinct from 'number' then
          return false;
        end if;
        v_second := (v_group ->> 'distance')::numeric;
        if v_second <= 0 or v_second > 1000000 then
          return false;
        end if;
        v_measured := true;
      end if;

      if v_group ? 'seconds' then
        if jsonb_typeof(v_group -> 'seconds') is distinct from 'number' then
          return false;
        end if;
        v_third := (v_group ->> 'seconds')::numeric;
        if v_third <> trunc(v_third) or v_third not between 1 and 86400 then
          return false;
        end if;
      end if;

      if v_group ? 'rest_seconds' then
        if jsonb_typeof(v_group -> 'rest_seconds') is distinct from 'number' then
          return false;
        end if;
        v_third := (v_group ->> 'rest_seconds')::numeric;
        if v_third <> trunc(v_third) or v_third not between 0 and 3600 then
          return false;
        end if;
      end if;
    end loop;

    if v_measured then
      return p_value ? 'distance_unit'
        and jsonb_typeof(p_value -> 'distance_unit') = 'string'
        and p_value ->> 'distance_unit' in ('m', 'km', 'mi', 'yd');
    end if;
    return not (p_value ? 'distance_unit');
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
      or jsonb_typeof(p_value -> 'duration_minutes') is distinct from 'number' then
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

  -- Repetitions and Custom are gone (ADR-038); an unknown mode is refused.
  return false;
exception
  when others then
    return false;
end;
$$;

-- 3. One list of modes -----------------------------------------------------------

create function public.is_training_measurement_mode(p_mode text)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select p_mode in (
    'unmeasured', 'sets_reps_load', 'time_distance_pace', 'duration_intensity',
    'intervals'
  )
$$;

-- The grants `is_valid_training_measurement` has: the owner and signed-in
-- users, whose writes the check constraints and validators run under.
revoke all privileges on function public.is_training_measurement_mode(text)
from public, anon, authenticated, service_role;
grant execute on function public.is_training_measurement_mode(text)
to authenticated;

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
    or (p_value ? 'instructions' and pg_catalog.jsonb_typeof(p_value->'instructions') not in ('string', 'null'))
    or pg_catalog.char_length(coalesce(p_value->>'instructions', '')) > 2000
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

CREATE OR REPLACE FUNCTION public.completion_activity_input_is_valid(p_value jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
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
    or not public.is_training_measurement_mode(v_mode)
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

CREATE OR REPLACE FUNCTION public.saved_session_activity_input_is_valid(p_value jsonb)
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
    or not public.is_training_measurement_mode(v_mode)
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
$function$;

CREATE OR REPLACE FUNCTION public.session_activities_content_is_valid(p_content jsonb, p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_activity jsonb;
  v_mode text;
  v_link text;
  v_entry jsonb;
begin
  if p_content is null
    or pg_catalog.jsonb_typeof(p_content) <> 'object'
    or exists (
      select 1 from pg_catalog.jsonb_object_keys(p_content) as key
      where key not in (
        'schemaVersion', 'summary', 'activities', 'safetyConsiderations'
      )
    )
    or p_content->>'schemaVersion' is distinct from 'fittip.session-activities.v1'
    or pg_catalog.jsonb_typeof(p_content->'summary') <> 'string'
    or pg_catalog.char_length(pg_catalog.btrim(p_content->>'summary'))
      not between 1 and 400
    or pg_catalog.jsonb_typeof(p_content->'activities') <> 'array'
    or pg_catalog.jsonb_array_length(p_content->'activities') not between 1 and 12
  then
    return false;
  end if;

  if p_content ? 'safetyConsiderations' then
    if pg_catalog.jsonb_typeof(p_content->'safetyConsiderations') <> 'array'
      or pg_catalog.jsonb_array_length(p_content->'safetyConsiderations') > 3
    then
      return false;
    end if;
    for v_entry in
      select value
      from pg_catalog.jsonb_array_elements(p_content->'safetyConsiderations')
    loop
      if pg_catalog.jsonb_typeof(v_entry) <> 'string'
        or pg_catalog.char_length(pg_catalog.btrim(v_entry #>> '{}'))
          not between 1 and 240
      then
        return false;
      end if;
    end loop;
  end if;

  for v_activity in
    select value from pg_catalog.jsonb_array_elements(p_content->'activities')
  loop
    if pg_catalog.jsonb_typeof(v_activity) <> 'object'
      or exists (
        select 1 from pg_catalog.jsonb_object_keys(v_activity) as key
        where key not in (
          'personalActivityId', 'name', 'sport', 'instructions',
          'measurementMode', 'target', 'rationale'
        )
      )
      or pg_catalog.jsonb_typeof(v_activity->'name') <> 'string'
      or pg_catalog.char_length(pg_catalog.btrim(v_activity->>'name'))
        not between 1 and 120
      or pg_catalog.jsonb_typeof(v_activity->'sport') <> 'string'
      or pg_catalog.char_length(pg_catalog.btrim(v_activity->>'sport'))
        not between 1 and 80
      or pg_catalog.jsonb_typeof(v_activity->'rationale') <> 'string'
      or pg_catalog.char_length(pg_catalog.btrim(v_activity->>'rationale'))
        not between 1 and 300
      or (
        coalesce(pg_catalog.jsonb_typeof(v_activity->'instructions'), 'null')
          <> 'null'
        and (
          pg_catalog.jsonb_typeof(v_activity->'instructions') <> 'string'
          or pg_catalog.char_length(pg_catalog.btrim(v_activity->>'instructions'))
            not between 1 and 500
        )
      )
    then
      return false;
    end if;

    v_mode := v_activity->>'measurementMode';
    if v_mode is null or not public.is_training_measurement_mode(v_mode) then
      return false;
    end if;

    if coalesce(pg_catalog.jsonb_typeof(v_activity->'target'), 'null') = 'null'
    then
      null;
    elsif v_mode = 'unmeasured'
      or not public.is_valid_training_measurement(v_mode, v_activity->'target')
    then
      return false;
    end if;

    if coalesce(pg_catalog.jsonb_typeof(v_activity->'personalActivityId'), 'null')
      <> 'null'
    then
      v_link := v_activity->>'personalActivityId';
      if not exists (
        select 1
        from public.personal_activities activity
        where activity.id = v_link::uuid
          and activity.user_id = p_user_id
          and activity.measurement_mode = v_mode
      ) then
        return false;
      end if;
    end if;
  end loop;

  return true;
exception
  when others then
    -- A malformed uuid or number cast is invalid content, not a server error.
    return false;
end;
$function$;

-- 4. The five columns that name a mode -----------------------------------------
-- Re-added after the conversion, so the re-add proves no stored row still
-- names a removed mode.

alter table public.personal_activities
  drop constraint personal_activities_measurement_mode_check,
  add constraint personal_activities_measurement_mode_check
    check (measurement_mode in (
      'unmeasured', 'sets_reps_load', 'time_distance_pace',
      'duration_intensity', 'intervals'
    ));

alter table public.rolling_plan_activities
  drop constraint rolling_plan_activities_measurement_mode_check,
  add constraint rolling_plan_activities_measurement_mode_check
    check (measurement_mode in (
      'unmeasured', 'sets_reps_load', 'time_distance_pace',
      'duration_intensity', 'intervals'
    ));

alter table public.rolling_plan_series_activities
  drop constraint rolling_plan_series_activities_measurement_mode_check,
  add constraint rolling_plan_series_activities_measurement_mode_check
    check (measurement_mode in (
      'unmeasured', 'sets_reps_load', 'time_distance_pace',
      'duration_intensity', 'intervals'
    ));

alter table public.saved_session_activities
  drop constraint saved_session_activities_measurement_mode_check,
  add constraint saved_session_activities_measurement_mode_check
    check (measurement_mode in (
      'unmeasured', 'sets_reps_load', 'time_distance_pace',
      'duration_intensity', 'intervals'
    ));

alter table public.completion_activities
  drop constraint completion_activities_measurement_mode_check,
  add constraint completion_activities_measurement_mode_check
    check (measurement_mode in (
      'unmeasured', 'sets_reps_load', 'time_distance_pace',
      'duration_intensity', 'intervals'
    ));
