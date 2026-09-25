-- A2c: what a target may now say, and what it still may not.
--
-- The whole ticket is one immutable function and the five check constraints
-- that name the measurement modes, so this suite is unusual for the project:
-- it has no rows, no owner, and no RLS to prove. `is_valid_training_measurement`
-- is `security invoker` and `immutable`, reads nothing, and is already granted
-- to `authenticated` and `anon` from M1-01, so there is no new privileged
-- boundary here and nothing for a cross-user assertion to bite on. What there
-- is instead is a decision table, and that is what is asserted.
--
-- Two properties matter more than any individual case.
--
-- **Nothing valid became invalid.** The migration only widens. Every flat
-- `sets_reps_load` value the old function accepted is still accepted, which is
-- what lets a measurement already sealed into `completions.planned_snapshot`
-- or `rolling_plan_change_entries.before_state` — neither guarded by this
-- function, both permanent history — stay readable for good.
--
-- **The grouped form did not become a hole.** It is a second accepted shape
-- for the same mode, so the risk is that it admits something the flat form
-- would have refused: a group with no numbers at all, a load with no unit, a
-- mode carrying both shapes at once, or an unbounded list. Each is asserted
-- false below.

begin;
select plan(35);

-- ---------------------------------------------------------------------------
-- The flat form, exactly as M1-01 left it.
-- ---------------------------------------------------------------------------

select ok(
  public.is_valid_training_measurement('sets_reps_load', '{"sets":5,"reps":5}'),
  'flat sets and reps is still accepted'
);
select ok(
  public.is_valid_training_measurement(
    'sets_reps_load',
    '{"sets":5,"reps":5,"load":82.5,"load_unit":"kg"}'
  ),
  'flat with a load and its unit is still accepted'
);
select ok(
  not public.is_valid_training_measurement('sets_reps_load', '{"sets":5}'),
  'the flat form still refuses sets without reps'
);
select ok(
  not public.is_valid_training_measurement(
    'sets_reps_load',
    '{"sets":5,"reps":5,"load":82.5}'
  ),
  'the flat form still refuses a load with no unit'
);

-- ---------------------------------------------------------------------------
-- The grouped form.
-- ---------------------------------------------------------------------------

select ok(
  public.is_valid_training_measurement(
    'sets_reps_load',
    '{"groups":[{"sets":3,"reps":5,"load":60},{"sets":1,"reps":3,"load":100}],"load_unit":"kg"}'
  ),
  'a squat that ramps is one measurement'
);
select ok(
  public.is_valid_training_measurement(
    'sets_reps_load',
    '{"groups":[{"sets":5,"reps":5,"load":82.5}],"load_unit":"kg"}'
  ),
  'the uniform case is the one-group case'
);
select ok(
  public.is_valid_training_measurement(
    'sets_reps_load',
    '{"groups":[{"sets":3}]}'
  ),
  'three sets with nothing else is a prescription'
);
select ok(
  public.is_valid_training_measurement(
    'sets_reps_load',
    '{"groups":[{"reps":8}]}'
  ),
  'reps alone is a prescription'
);
select ok(
  public.is_valid_training_measurement(
    'sets_reps_load',
    '{"groups":[{"load":100}],"load_unit":"lb"}'
  ),
  'a load alone is a prescription when its unit is there'
);
select ok(
  not public.is_valid_training_measurement(
    'sets_reps_load',
    '{"groups":[{}],"load_unit":"kg"}'
  ),
  'a group carrying no numbers at all is refused'
);
select ok(
  not public.is_valid_training_measurement(
    'sets_reps_load',
    '{"groups":[{"sets":3,"load":60}]}'
  ),
  'a grouped load with no unit is refused, as in the flat form'
);
select ok(
  not public.is_valid_training_measurement(
    'sets_reps_load',
    '{"groups":[{"sets":3,"reps":5}],"load_unit":"kg"}'
  ),
  'a unit with no load anywhere is refused'
);
select ok(
  not public.is_valid_training_measurement(
    'sets_reps_load',
    '{"groups":[{"sets":3,"load":60}],"load_unit":"stone"}'
  ),
  'a unit outside kg and lb is refused'
);
select ok(
  not public.is_valid_training_measurement('sets_reps_load', '{"groups":[]}'),
  'an empty group list is refused'
);
select ok(
  not public.is_valid_training_measurement(
    'sets_reps_load',
    (
      '{"groups":' ||
      (select jsonb_agg('{"sets":1}'::jsonb) from generate_series(1, 21))::text ||
      '}'
    )::jsonb
  ),
  'more than twenty groups is refused'
);
select ok(
  not public.is_valid_training_measurement(
    'sets_reps_load',
    '{"groups":[{"sets":3,"reps":5}],"sets":5,"reps":5}'
  ),
  'a value carrying both shapes at once is refused rather than read as one'
);
select ok(
  not public.is_valid_training_measurement(
    'sets_reps_load',
    '{"groups":[{"sets":0}]}'
  ),
  'a group bound is enforced as the flat one is: sets start at one'
);
select ok(
  not public.is_valid_training_measurement(
    'sets_reps_load',
    '{"groups":[{"sets":1.5}]}'
  ),
  'a fractional set is refused'
);
select ok(
  not public.is_valid_training_measurement(
    'sets_reps_load',
    '{"groups":[{"sets":3,"tempo":"3-1-1"}]}'
  ),
  'an unknown key inside a group is refused'
);
select ok(
  not public.is_valid_training_measurement(
    'sets_reps_load',
    '{"groups":"3x5"}'
  ),
  'groups that are not an array are refused'
);
select ok(
  not public.is_valid_training_measurement(
    'sets_reps_load',
    '{"groups":[[{"sets":3}]]}'
  ),
  'a group that is not an object is refused'
);

-- ---------------------------------------------------------------------------
-- Duration and intensity: minutes alone is now enough.
-- ---------------------------------------------------------------------------

select ok(
  public.is_valid_training_measurement(
    'duration_intensity',
    '{"duration_minutes":40}'
  ),
  'forty minutes alone is a prescription'
);
select ok(
  public.is_valid_training_measurement(
    'duration_intensity',
    '{"duration_minutes":40,"intensity":"easy"}'
  ),
  'minutes with an intensity is still accepted'
);
select ok(
  public.is_valid_training_measurement(
    'duration_intensity',
    '{"duration_minutes":40,"perceived_effort":7}'
  ),
  'a stored perceived effort is still accepted, though no surface writes one'
);
select ok(
  not public.is_valid_training_measurement('duration_intensity', '{}'),
  'the minutes themselves are still required'
);
select ok(
  not public.is_valid_training_measurement(
    'duration_intensity',
    '{"duration_minutes":40,"intensity":"brutal"}'
  ),
  'an intensity outside the four is still refused'
);
select ok(
  not public.is_valid_training_measurement(
    'duration_intensity',
    '{"duration_minutes":40,"perceived_effort":11}'
  ),
  'an effort outside one to ten is still refused'
);

-- ---------------------------------------------------------------------------
-- The unmeasured mode.
-- ---------------------------------------------------------------------------

select ok(
  public.is_valid_training_measurement('unmeasured', null),
  'an unmeasured activity carries no target'
);
select ok(
  not public.is_valid_training_measurement('unmeasured', '{}'),
  'an unmeasured activity carrying even an empty object is a contradiction'
);
select ok(
  not public.is_valid_training_measurement(
    'unmeasured',
    '{"sets":5,"reps":5}'
  ),
  'an unmeasured activity carrying a real target is refused'
);

-- ---------------------------------------------------------------------------
-- The five columns admit the new mode, and still admit nothing else.
-- ---------------------------------------------------------------------------

select col_has_check(
  'public',
  'rolling_plan_activities',
  'measurement_mode',
  'the plan activity still constrains its mode'
);
select col_has_check(
  'public',
  'completion_activities',
  'measurement_mode',
  'the completion activity still constrains its mode'
);
select col_has_check(
  'public',
  'saved_session_activities',
  'measurement_mode',
  'the saved session activity still constrains its mode'
);
select col_has_check(
  'public',
  'rolling_plan_series_activities',
  'measurement_mode',
  'the series template activity still constrains its mode'
);
select col_has_check(
  'public',
  'personal_activities',
  'measurement_mode',
  'the personal activity definition still constrains its mode'
);

select * from finish();
rollback;
