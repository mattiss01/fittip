-- Measurement categories (ADR-038).
--
-- Proved against the real function and constraints: sets hold reps or
-- seconds, never both, with a weight either way; intervals hold blocks of
-- repeats of a distance or a time with rest, and a distance unit exactly when
-- a block has a distance; Repetitions and Custom are refused everywhere a mode
-- is named; and the one list of modes is the helper the validators ask.

begin;

create extension if not exists pgtap with schema extensions;

select plan(24);

-- Sets ---------------------------------------------------------------------------------

select ok(
  public.is_valid_training_measurement('sets_reps_load',
    '{"groups":[{"sets":3,"seconds":45}]}'),
  'a plank: sets held for a time'
);
select ok(
  public.is_valid_training_measurement('sets_reps_load',
    '{"groups":[{"sets":3,"seconds":20,"load":10}],"load_unit":"kg"}'),
  'a weighted hang: seconds with a weight'
);
select ok(
  public.is_valid_training_measurement('sets_reps_load',
    '{"groups":[{"sets":3,"reps":8,"load":60},{"sets":2,"seconds":30}],"load_unit":"kg"}'),
  'reps in one block and seconds in the next'
);
select ok(
  public.is_valid_training_measurement('sets_reps_load',
    '{"groups":[{"sets":1,"reps":50}]}'),
  'a former Repetitions count: one set of fifty'
);
select ok(
  not public.is_valid_training_measurement('sets_reps_load',
    '{"groups":[{"sets":3,"reps":8,"seconds":30}]}'),
  'reps and seconds never in one block'
);
select ok(
  not public.is_valid_training_measurement('sets_reps_load',
    '{"groups":[{"sets":3,"seconds":0}]}'),
  'a set lasts at least a second'
);
select ok(
  not public.is_valid_training_measurement('sets_reps_load',
    '{"groups":[{"sets":3,"seconds":12.5}]}'),
  'seconds are whole'
);
select ok(
  not public.is_valid_training_measurement('sets_reps_load',
    '{"groups":[{"sets":3,"seconds":30,"load":10}]}'),
  'a weight still needs its unit'
);
select ok(
  public.is_valid_training_measurement('sets_reps_load',
    '{"sets":3,"reps":5,"load":60,"load_unit":"kg"}'),
  'the flat form sealed into history still reads'
);

-- Intervals -------------------------------------------------------------------------

select ok(
  public.is_valid_training_measurement('intervals',
    '{"blocks":[{"repeats":6,"distance":400,"rest_seconds":90},{"repeats":4,"distance":200,"rest_seconds":60}],"distance_unit":"m"}'),
  'a pyramid of distances with rest'
);
select ok(
  public.is_valid_training_measurement('intervals',
    '{"blocks":[{"repeats":5,"seconds":180,"rest_seconds":120}]}'),
  'repeats of a time, with no distance unit'
);
select ok(
  public.is_valid_training_measurement('intervals',
    '{"blocks":[{"repeats":8,"distance":400,"seconds":90}],"distance_unit":"m"}'),
  'a distance in a time: 400 m in 90 s'
);
select ok(
  not public.is_valid_training_measurement('intervals',
    '{"blocks":[{"repeats":6,"rest_seconds":90}]}'),
  'a block needs a distance or a time'
);
select ok(
  not public.is_valid_training_measurement('intervals',
    '{"blocks":[{"repeats":6,"distance":400}]}'),
  'a distance needs its unit'
);
select ok(
  not public.is_valid_training_measurement('intervals',
    '{"blocks":[{"repeats":6,"seconds":60}],"distance_unit":"m"}'),
  'and a unit needs a distance'
);
select ok(
  not public.is_valid_training_measurement('intervals',
    '{"blocks":[{"repeats":0,"seconds":60}]}'),
  'at least one repeat'
);
select ok(
  not public.is_valid_training_measurement('intervals',
    '{"blocks":[{"repeats":4,"seconds":60,"rest_seconds":3601}]}'),
  'rest is at most an hour'
);
select ok(
  not public.is_valid_training_measurement('intervals', '{"blocks":[]}'),
  'at least one block'
);

-- The removed modes --------------------------------------------------------------

select ok(
  not public.is_valid_training_measurement('skill_repetitions',
    '{"repetitions":50,"unit":"serves"}')
  and not public.is_valid_training_measurement('custom',
    '{"label":"Hang","value":12,"unit":"s"}'),
  'Repetitions and Custom measure nothing any more'
);
select ok(
  not public.is_training_measurement_mode('skill_repetitions')
  and not public.is_training_measurement_mode('custom')
  and public.is_training_measurement_mode('intervals')
  and public.is_training_measurement_mode('sets_reps_load'),
  'the one list of modes'
);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values ('76000000-0000-4000-8000-000000000001', 'modes@example.test', '{}', '{}');
insert into public.profiles (user_id, timezone_name)
values ('76000000-0000-4000-8000-000000000001', 'UTC');

select throws_ok(
  $$insert into public.personal_activities (user_id, name, sport, measurement_mode)
    values ('76000000-0000-4000-8000-000000000001', 'Serves', 'Tennis',
      'skill_repetitions')$$,
  '23514', null,
  'a library entry cannot be measured as Repetitions'
);
select throws_ok(
  $$insert into public.personal_activities (user_id, name, sport, measurement_mode)
    values ('76000000-0000-4000-8000-000000000001', 'Hang', 'Climbing', 'custom')$$,
  '23514', null,
  'nor as Custom'
);
select lives_ok(
  $$insert into public.personal_activities (
      user_id, name, sport, measurement_mode, default_measurement)
    values ('76000000-0000-4000-8000-000000000001', 'Track repeats', 'Running',
      'intervals',
      '{"blocks":[{"repeats":6,"distance":400,"rest_seconds":90}],"distance_unit":"m"}')$$,
  'a library entry measured in intervals'
);
select ok(
  not public.saved_session_activity_input_is_valid(
    '{"position":0,"name":"Serves","sport":"Tennis","measurementMode":"skill_repetitions"}')
  and public.saved_session_activity_input_is_valid(
    '{"position":0,"name":"Plank","sport":"Strength","measurementMode":"sets_reps_load","target":{"groups":[{"sets":3,"seconds":45}]}}'),
  'the input validators ask the same list'
);

select * from finish();
rollback;
