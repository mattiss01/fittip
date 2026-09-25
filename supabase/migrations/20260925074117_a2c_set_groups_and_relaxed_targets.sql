-- A2c — a target that fits what the owner actually prescribes.
--
-- Three changes to one function and the five check constraints that name the
-- measurement modes. All of them widen what is accepted; none narrows it, so
-- no value that is valid today becomes invalid, and no row needs rewriting.
--
-- 1. `sets_reps_load` gains a grouped form. A squat that ramps — 3×5 at 60 kg,
--    then 1×3 at 100 kg — was three separate activities repeating one name,
--    because the shape held a single uniform prescription. It now holds a list
--    of groups, each carrying its own sets, reps and load. The owner's point
--    on 25 September 2026 is what makes this cheap: a group carries a count,
--    so the uniform case is simply the one-group case and no mode toggle is
--    needed to tell them apart.
--
--    The flat shape stays valid exactly as written. That is not politeness
--    towards old rows — it is required. `is_valid_training_measurement` does
--    not guard `completions.planned_snapshot` or
--    `rolling_plan_change_entries.before_state`, which are permanent history
--    and must never be rewritten, so a flat measurement sealed into either
--    must stay readable for good. Since the reader has to handle both shapes
--    regardless, having the validator accept both costs one branch and saves a
--    backfill, and nothing here depends on what the founder project holds.
--
-- 2. `duration_intensity` requires only its minutes. It refused a duration
--    carrying neither an intensity nor a perceived effort, so "40 minutes"
--    alone could not be stored. The owner asked for both to be optional.
--
-- 3. A sixth mode, `unmeasured`, for an activity with nothing to count — a
--    tennis drill listed by name and no more. Until now such a row had to
--    claim a measurement mode nobody chose, which said it was counted in sets
--    and reps while counting nothing, and would have told a later Progress
--    surface it was chartable. A row in this mode must have no target at all.
--
-- Relaxation within a group deserves a note. Each group needs at least one of
-- sets, reps or load rather than all three, which is the rule
-- `time_distance_pace` has followed in this same function since M1-01 — "three
-- optional fields, at least one present" is an existing precedent here, not a
-- new kind of looseness.

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
begin
  if p_value is null then
    return true;
  end if;

  if jsonb_typeof(p_value) is distinct from 'object'
    or octet_length(p_value::text) > 4096 then
    return false;
  end if;

  -- An unmeasured activity has nothing to carry, so any object at all is a
  -- contradiction. `null` is the only value this mode admits, and it was
  -- returned above.
  if p_mode = 'unmeasured' then
    return false;
  end if;

  if p_mode = 'sets_reps_load' then
    -- The grouped form. Recognised by the key rather than by trying the flat
    -- form first and falling through, so a value carrying both is refused
    -- instead of being read as whichever branch happens to come first.
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
          or v_group - array['sets', 'reps', 'load'] <> '{}'::jsonb
          or not (
            v_group ? 'sets' or v_group ? 'reps' or v_group ? 'load'
          ) then
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

      -- The unit sits once at the top rather than on every group, because a
      -- prescription does not switch between kilograms and pounds partway
      -- down. It is required exactly when some group carries a load, which is
      -- the same paired rule the flat form applies.
      -- The presence test comes first and is not decoration. Without it,
      -- `jsonb_typeof(p_value -> 'load_unit')` is NULL when the key is absent,
      -- the comparison is NULL, and the function returns NULL — which a check
      -- constraint treats as passing. A grouped load with no unit would have
      -- been accepted by every one of the five columns.
      if v_loaded then
        return p_value ? 'load_unit'
          and jsonb_typeof(p_value -> 'load_unit') = 'string'
          and p_value ->> 'load_unit' in ('kg', 'lb');
      end if;
      return not (p_value ? 'load_unit');
    end if;

    -- The flat form, unchanged from M1-01.
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
    -- Minutes alone is now a prescription. Intensity and perceived effort stay
    -- optional and stay validated when present; what went is the requirement
    -- that one of them be there.
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

-- The five columns that name the modes. Each is dropped and re-added rather
-- than altered, because a check constraint has no in-place edit; the re-add
-- re-validates every existing row, which is the proof that widening the list
-- broke nothing.
alter table public.personal_activities
  drop constraint personal_activities_measurement_mode_check,
  add constraint personal_activities_measurement_mode_check
    check (
      measurement_mode in (
        'unmeasured',
        'sets_reps_load',
        'time_distance_pace',
        'duration_intensity',
        'skill_repetitions',
        'custom'
      )
    );

alter table public.rolling_plan_activities
  drop constraint rolling_plan_activities_measurement_mode_check,
  add constraint rolling_plan_activities_measurement_mode_check
    check (
      measurement_mode in (
        'unmeasured',
        'sets_reps_load',
        'time_distance_pace',
        'duration_intensity',
        'skill_repetitions',
        'custom'
      )
    );

alter table public.rolling_plan_series_activities
  drop constraint rolling_plan_series_activities_measurement_mode_check,
  add constraint rolling_plan_series_activities_measurement_mode_check
    check (
      measurement_mode in (
        'unmeasured',
        'sets_reps_load',
        'time_distance_pace',
        'duration_intensity',
        'skill_repetitions',
        'custom'
      )
    );

alter table public.saved_session_activities
  drop constraint saved_session_activities_measurement_mode_check,
  add constraint saved_session_activities_measurement_mode_check
    check (
      measurement_mode in (
        'unmeasured',
        'sets_reps_load',
        'time_distance_pace',
        'duration_intensity',
        'skill_repetitions',
        'custom'
      )
    );

alter table public.completion_activities
  drop constraint completion_activities_measurement_mode_check,
  add constraint completion_activities_measurement_mode_check
    check (
      measurement_mode in (
        'unmeasured',
        'sets_reps_load',
        'time_distance_pace',
        'duration_intensity',
        'skill_repetitions',
        'custom'
      )
    );
