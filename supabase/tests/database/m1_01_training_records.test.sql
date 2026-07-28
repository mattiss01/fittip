begin;

create extension if not exists pgtap with schema extensions;

select plan(103);

select has_table('public', 'personal_activities', 'personal activities table exists');
select has_table('public', 'detailed_plan_versions', 'detailed plan versions table exists');
select has_table('public', 'detailed_plan_heads', 'detailed plan heads table exists');
select has_table('public', 'planned_sessions', 'planned sessions table exists');
select has_table('public', 'planned_activities', 'planned activities table exists');
select has_table('public', 'completed_sessions', 'completed sessions table exists');
select has_table('public', 'completion_heads', 'completion heads table exists');
select has_table('public', 'completed_activities', 'completed activities table exists');
select has_function(
  'public',
  'is_valid_training_measurement',
  array['text', 'jsonb'],
  'measurement validator exists'
);
select has_function(
  'public',
  'save_manual_plan_version',
  array['integer', 'integer', 'date', 'text', 'jsonb'],
  'atomic manual-plan function exists'
);
select is(
  (
    select count(*)::bigint
    from information_schema.columns
    where table_schema = 'public'
      and table_name in (
        'personal_activities',
        'detailed_plan_versions',
        'detailed_plan_heads',
        'planned_sessions',
        'planned_activities',
        'completed_sessions',
        'completion_heads',
        'completed_activities'
      )
      and column_name = 'user_id'
      and is_nullable = 'NO'
  ),
  8::bigint,
  'every owned training record has a required user id'
);
select ok(
  (
    select prosecdef
      and proconfig = array['search_path=""']
    from pg_proc
    where oid = 'public.save_manual_plan_version(integer,integer,date,text,jsonb)'::regprocedure
  ),
  'the plan-save function is security definer with an empty search path'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.personal_activities'::regclass),
  'personal activities has RLS'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.detailed_plan_versions'::regclass),
  'detailed plan versions has RLS'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.detailed_plan_heads'::regclass),
  'detailed plan heads has RLS'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.planned_sessions'::regclass),
  'planned sessions has RLS'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.planned_activities'::regclass),
  'planned activities has RLS'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.completed_sessions'::regclass),
  'completed sessions has RLS'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.completion_heads'::regclass),
  'completion heads has RLS'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.completed_activities'::regclass),
  'completed activities has RLS'
);

select ok(
  not has_table_privilege('anon', 'public.personal_activities', 'SELECT'),
  'anonymous users cannot select personal activities'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.save_manual_plan_version(integer,integer,date,text,jsonb)',
    'EXECUTE'
  ),
  'anonymous users cannot execute the plan-save function'
);
select ok(
  not exists (
    select 1
    from pg_proc
    cross join lateral aclexplode(
      coalesce(proacl, acldefault('f', proowner))
    )
    where oid = 'public.save_manual_plan_version(integer,integer,date,text,jsonb)'::regprocedure
      and grantee = 0
      and privilege_type = 'EXECUTE'
  ),
  'PUBLIC cannot execute the plan-save function'
);
select ok(
  (
    select bool_and(
      not has_table_privilege(
        'anon',
        format('public.%I', table_name),
        privilege_name
      )
    )
    from unnest(array[
      'personal_activities',
      'detailed_plan_versions',
      'detailed_plan_heads',
      'planned_sessions',
      'planned_activities',
      'completed_sessions',
      'completion_heads',
      'completed_activities'
    ]) as owned(table_name)
    cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE'])
      as privileges(privilege_name)
  ),
  'anonymous users have no CRUD privilege on any training table'
);
select ok(
  has_table_privilege('authenticated', 'public.personal_activities', 'SELECT'),
  'authenticated users can select personal activities'
);
select ok(
  has_table_privilege('authenticated', 'public.personal_activities', 'INSERT'),
  'authenticated users can insert personal activities'
);
select ok(
  has_table_privilege('authenticated', 'public.personal_activities', 'UPDATE'),
  'authenticated users can update personal activities'
);
select ok(
  has_table_privilege('authenticated', 'public.personal_activities', 'DELETE'),
  'authenticated users can delete unreferenced personal activities'
);
select ok(
  not has_table_privilege('authenticated', 'public.detailed_plan_versions', 'INSERT'),
  'authenticated users cannot directly insert plan versions'
);
select ok(
  has_table_privilege('authenticated', 'public.detailed_plan_versions', 'SELECT'),
  'authenticated users can select their plan versions'
);
select ok(
  not has_table_privilege('authenticated', 'public.detailed_plan_versions', 'UPDATE'),
  'authenticated users cannot update plan versions'
);
select ok(
  not has_table_privilege('authenticated', 'public.detailed_plan_versions', 'DELETE'),
  'authenticated users cannot delete plan versions'
);
select ok(
  (
    select bool_and(
      has_table_privilege(
        'authenticated',
        format('public.%I', table_name),
        'SELECT'
      )
      and not has_table_privilege(
        'authenticated',
        format('public.%I', table_name),
        'INSERT'
      )
      and not has_table_privilege(
        'authenticated',
        format('public.%I', table_name),
        'UPDATE'
      )
      and not has_table_privilege(
        'authenticated',
        format('public.%I', table_name),
        'DELETE'
      )
    )
    from unnest(array[
      'detailed_plan_versions',
      'detailed_plan_heads',
      'planned_sessions',
      'planned_activities',
      'completed_sessions',
      'completion_heads',
      'completed_activities'
    ]) as immutable(table_name)
  ),
  'authenticated direct access to immutable training records is read only'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.save_manual_plan_version(integer,integer,date,text,jsonb)',
    'EXECUTE'
  ),
  'authenticated users can execute the plan-save function'
);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('10000000-0000-4000-8000-000000000001', 'm1-user-a@example.test', '{}', '{}'),
  ('10000000-0000-4000-8000-000000000002', 'm1-user-b@example.test', '{}', '{}'),
  ('10000000-0000-4000-8000-000000000003', 'm1-no-claims@example.test', '{}', '{}');

insert into public.profiles (user_id)
values
  ('10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000003');

insert into public.personal_activities (
  id,
  user_id,
  name,
  sport,
  measurement_mode,
  default_measurement
)
values (
  '20000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000002',
  'User B activity',
  'Cycling',
  'duration_intensity',
  '{"duration_minutes":30,"intensity":"easy"}'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select lives_ok(
  $sql$
    insert into public.personal_activities (
      id,
      user_id,
      name,
      sport,
      measurement_mode,
      default_measurement
    )
    values (
      '20000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'Easy run',
      'Running',
      'time_distance_pace',
      '{"duration_seconds":1800}'
    )
  $sql$,
  'user A can create an owned personal activity'
);
select is(
  (
    select count(*)::bigint
    from public.personal_activities
    where user_id = '10000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'user A can read their personal activity'
);
select throws_ok(
  $sql$
    insert into public.personal_activities (
      user_id,
      name,
      sport,
      measurement_mode
    )
    values (
      '10000000-0000-4000-8000-000000000002',
      'Cross-user activity',
      'Running',
      'custom'
    )
  $sql$,
  '42501',
  'new row violates row-level security policy for table "personal_activities"',
  'user A cannot create an activity for user B'
);

select lives_ok(
  $sql$
    select public.save_manual_plan_version(
      0,
      1,
      '2026-07-28',
      'Europe/Berlin',
      '[
        {
          "local_date":"2026-07-28",
          "position":0,
          "title":"Morning run",
          "sport":"Running",
          "expected_duration_minutes":30,
          "activities":[
            {
              "personal_activity_id":"20000000-0000-4000-8000-000000000001",
              "position":0,
              "name":"Easy run snapshot",
              "sport":"Running",
              "measurement_mode":"time_distance_pace",
              "target":{"duration_seconds":1800}
            }
          ]
        }
      ]'::jsonb
    )
  $sql$,
  'user A can atomically save the first manual plan'
);
select is(
  (select count(*)::bigint from public.detailed_plan_versions),
  1::bigint,
  'the first plan creates one version'
);
select is(
  (select revision from public.detailed_plan_heads),
  1,
  'the first plan advances the current revision to one'
);
select is(
  (select count(*)::bigint from public.planned_sessions),
  1::bigint,
  'the plan stores its planned session separately'
);
select is(
  (select count(*)::bigint from public.planned_activities),
  1::bigint,
  'the plan stores its planned activity separately'
);
select ok(
  (
    select start_date = '2026-07-28'::date
      and end_date = '2026-07-28'::date
      and day_count = 1
    from public.detailed_plan_versions
  ),
  'a one-day plan stores exactly one owner-local date'
);
select is(
  (select name from public.planned_activities),
  'Easy run snapshot',
  'the plan stores an immutable activity snapshot'
);
select lives_ok(
  $sql$
    update public.personal_activities
    set name = 'Renamed future run', updated_at = now()
    where id = '20000000-0000-4000-8000-000000000001'
      and user_id = '10000000-0000-4000-8000-000000000001'
  $sql$,
  'the owner can edit a personal definition for future reuse'
);
select is(
  (select name from public.planned_activities),
  'Easy run snapshot',
  'editing a personal definition does not mutate history'
);
select lives_ok(
  $sql$
    update public.personal_activities
    set archived_at = now(), updated_at = now()
    where id = '20000000-0000-4000-8000-000000000001'
      and user_id = '10000000-0000-4000-8000-000000000001'
  $sql$,
  'the owner can archive a referenced personal definition'
);
select throws_ok(
  $sql$
    select public.save_manual_plan_version(
      1,
      1,
      '2026-07-29',
      'Europe/Berlin',
      '[{
        "local_date":"2026-07-29",
        "position":0,
        "title":"Archived reference",
        "sport":"Running",
        "activities":[{
          "personal_activity_id":"20000000-0000-4000-8000-000000000001",
          "position":0,
          "name":"Archived run",
          "sport":"Running",
          "measurement_mode":"time_distance_pace",
          "target":{"duration_seconds":1200}
        }]
      }]'::jsonb
    )
  $sql$,
  '42501',
  'The personal activity is unavailable.',
  'an archived personal definition cannot be reused in a new plan'
);
select is(
  (select count(*)::bigint from public.detailed_plan_versions),
  1::bigint,
  'a rejected archived reference creates no plan version'
);

select lives_ok(
  $sql$
    select public.save_manual_plan_version(
      1,
      2,
      '2026-07-29',
      'Europe/Berlin',
      '[]'::jsonb
    )
  $sql$,
  'a two-day second version is valid'
);
select lives_ok(
  $sql$
    select public.save_manual_plan_version(
      2,
      7,
      '2026-08-01',
      'Europe/Berlin',
      '[]'::jsonb
    )
  $sql$,
  'a seven-day third version is valid'
);
select lives_ok(
  $sql$
    select public.save_manual_plan_version(
      3,
      3,
      '2026-08-08',
      'Europe/Berlin',
      '[]'::jsonb
    )
  $sql$,
  'a fourth accepted version is valid'
);
select is(
  (select count(*)::bigint from public.detailed_plan_versions),
  4::bigint,
  'the fourth revision retains all four versions'
);
select is(
  (select revision from public.detailed_plan_heads),
  4,
  'the current pointer advances to revision four'
);
select is(
  (
    select version_number
    from public.detailed_plan_versions
    where id = (
      select current_version_id from public.detailed_plan_heads
    )
  ),
  4,
  'the current pointer identifies version four'
);
select is(
  (
    select parent_version_id
    from public.detailed_plan_versions
    where version_number = 1
  ),
  null::uuid,
  'the first version has no parent'
);
select is(
  (
    select parent.version_number
    from public.detailed_plan_versions child
    join public.detailed_plan_versions parent
      on parent.id = child.parent_version_id
     and parent.user_id = child.user_id
    where child.version_number = 4
  ),
  3,
  'version four unambiguously follows version three'
);
select throws_ok(
  $sql$
    select public.save_manual_plan_version(
      2,
      1,
      '2026-08-20',
      'Europe/Berlin',
      '[]'::jsonb
    )
  $sql$,
  'PT409',
  'The training plan changed before this save.',
  'a stale expected revision fails safely'
);
select is(
  (select count(*)::bigint from public.detailed_plan_versions),
  4::bigint,
  'a stale save creates no orphan version'
);
select throws_ok(
  $sql$
    select public.save_manual_plan_version(
      4,
      0,
      '2026-08-20',
      'Europe/Berlin',
      '[]'::jsonb
    )
  $sql$,
  '22023',
  'Invalid training plan payload.',
  'a zero-day request is rejected'
);
select throws_ok(
  $sql$
    select public.save_manual_plan_version(
      4,
      8,
      '2026-08-20',
      'Europe/Berlin',
      '[]'::jsonb
    )
  $sql$,
  '22023',
  'Invalid training plan payload.',
  'an eight-day request is rejected'
);
select throws_ok(
  $sql$
    select public.save_manual_plan_version(
      4,
      null,
      '2026-08-20',
      'Europe/Berlin',
      '[]'::jsonb
    )
  $sql$,
  '22023',
  'Invalid training plan payload.',
  'a null day count is rejected at the function boundary'
);
select throws_ok(
  $sql$
    select public.save_manual_plan_version(
      4,
      2,
      '2026-08-20',
      'Europe/Berlin',
      '[{
        "local_date":"2026-08-22",
        "position":0,
        "title":"Outside range",
        "sport":"Running",
        "activities":[]
      }]'::jsonb
    )
  $sql$,
  '22023',
  'Invalid planned session.',
  'a session outside the requested date count is rejected'
);
select throws_ok(
  $sql$
    select public.save_manual_plan_version(
      4,
      1,
      '2026-08-20',
      'Europe/Berlin',
      '[{
        "local_date":"2026-08-20",
        "position":0.5,
        "title":"Fractional position",
        "sport":"Running",
        "activities":[]
      }]'::jsonb
    )
  $sql$,
  '22023',
  'Invalid planned session.',
  'fractional session positions are rejected'
);
select throws_ok(
  $sql$
    select public.save_manual_plan_version(
      4,
      1,
      '2026-08-20',
      'Europe/Berlin',
      '[{
        "local_date":"2026-08-20",
        "position":0,
        "title":"Fractional activity position",
        "sport":"Running",
        "activities":[{
          "position":0.5,
          "name":"Invalid activity",
          "sport":"Running",
          "measurement_mode":"custom",
          "target":{"label":"Count","value":1,"unit":"count"}
        }]
      }]'::jsonb
    )
  $sql$,
  '22023',
  'Invalid planned activity.',
  'fractional activity positions are rejected'
);
select is(
  (select count(*)::bigint from public.detailed_plan_versions),
  4::bigint,
  'rejected plan payloads leave accepted history unchanged'
);

select ok(
  not public.is_valid_training_measurement(
    'sets_reps_load',
    '{"sets":4,"reps":6,"load":60}'::jsonb
  ),
  'sets and load reject a missing load unit'
);
select ok(
  public.is_valid_training_measurement(
    'sets_reps_load',
    '{"sets":4,"reps":6,"load":60,"load_unit":"kg"}'::jsonb
  ),
  'sets reps and load accept explicit units'
);
select ok(
  public.is_valid_training_measurement(
    'time_distance_pace',
    '{"distance":5,"distance_unit":"km","pace_seconds_per_unit":330,"pace_unit":"sec/km"}'::jsonb
  ),
  'time distance and pace accept explicit units'
);
select ok(
  public.is_valid_training_measurement(
    'duration_intensity',
    '{"duration_minutes":45,"perceived_effort":6}'::jsonb
  ),
  'duration and intensity accepts a sport-neutral effort'
);
select ok(
  public.is_valid_training_measurement(
    'skill_repetitions',
    '{"repetitions":20,"unit":"serves"}'::jsonb
  ),
  'skill repetitions accepts an explicit unit'
);
select ok(
  public.is_valid_training_measurement(
    'custom',
    '{"label":"Bouldering grade","value":"6A","unit":"Font"}'::jsonb
  ),
  'custom measurement accepts an explicit label and unit'
);
select ok(
  not public.is_valid_training_measurement(
    'custom',
    '{"label":"Bouldering grade","value":"6A"}'::jsonb
  ),
  'custom measurement rejects a missing unit'
);

reset role;
select lives_ok(
  $sql$
    with completion as (
      insert into public.completed_sessions (
        id,
        user_id,
        completion_group_id,
        revision_number,
        actual_local_date,
        timezone_name,
        status
      )
      values (
        '30000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001',
        '40000000-0000-4000-8000-000000000001',
        1,
        '2026-07-28',
        'Europe/Berlin',
        'unplanned'
      )
      returning id, user_id, completion_group_id, revision_number
    )
    insert into public.completion_heads (
      user_id,
      completion_group_id,
      current_completion_id,
      revision
    )
    select user_id, completion_group_id, id, revision_number
    from completion
  $sql$,
  'an unplanned factual completion is valid without a planned session'
);
select ok(
  (select count(*) = 1 from public.planned_sessions)
    and (select count(*) = 1 from public.completed_sessions),
  'planned and completed sessions remain separate records'
);
select lives_ok(
  $sql$
    insert into public.completed_activities (
      id,
      user_id,
      completed_session_id,
      planned_activity_id,
      personal_activity_id,
      position,
      name,
      sport,
      measurement_mode,
      actual_measurement
    )
    values (
      '60000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      (
        select id
        from public.planned_activities
        where user_id = '10000000-0000-4000-8000-000000000001'
        limit 1
      ),
      '20000000-0000-4000-8000-000000000001',
      0,
      'Completed run snapshot',
      'Running',
      'time_distance_pace',
      '{"duration_seconds":1775}'::jsonb
    )
  $sql$,
  'a factual activity snapshot can reference but does not replace its plan'
);
select is(
  (
    select name
    from public.completed_activities
    where id = '60000000-0000-4000-8000-000000000001'
  ),
  'Completed run snapshot',
  'completion history keeps its own immutable activity snapshot'
);
select lives_ok(
  $sql$
    with correction as (
      insert into public.completed_sessions (
        id,
        user_id,
        completion_group_id,
        revision_number,
        previous_completion_id,
        actual_local_date,
        timezone_name,
        status,
        correction_reason
      )
      values (
        '30000000-0000-4000-8000-000000000002',
        '10000000-0000-4000-8000-000000000001',
        '40000000-0000-4000-8000-000000000001',
        2,
        '30000000-0000-4000-8000-000000000001',
        '2026-07-28',
        'Europe/Berlin',
        'unplanned',
        'Corrected the duration'
      )
      returning id, user_id, completion_group_id, revision_number
    )
    update public.completion_heads heads
    set current_completion_id = correction.id,
        revision = correction.revision_number,
        updated_at = now()
    from correction
    where heads.user_id = correction.user_id
      and heads.completion_group_id = correction.completion_group_id
  $sql$,
  'a correction appends revision two and advances its exact head'
);
select is(
  (
    select revision
    from public.completion_heads
    where user_id = '10000000-0000-4000-8000-000000000001'
      and completion_group_id = '40000000-0000-4000-8000-000000000001'
  ),
  2,
  'the completion head identifies the second factual revision'
);
select throws_ok(
  $sql$
    insert into public.completed_sessions (
      user_id,
      completion_group_id,
      revision_number,
      previous_completion_id,
      actual_local_date,
      timezone_name,
      status,
      correction_reason
    )
    values (
      '10000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      3,
      '30000000-0000-4000-8000-000000000001',
      '2026-07-28',
      'Europe/Berlin',
      'unplanned',
      'Invalid branch'
    )
  $sql$,
  '23503',
  'insert or update on table "completed_sessions" violates foreign key constraint "completed_sessions_previous_fkey"',
  'a correction must reference the immediately previous group revision'
);
select throws_ok(
  $sql$
    insert into public.completed_sessions (
      user_id,
      completion_group_id,
      revision_number,
      actual_local_date,
      timezone_name,
      status
    )
    values (
      '10000000-0000-4000-8000-000000000001',
      gen_random_uuid(),
      1,
      '2026-07-28',
      'Europe/Berlin',
      'completed'
    )
  $sql$,
  '23514',
  'new row for relation "completed_sessions" violates check constraint "completed_sessions_unplanned_check"',
  'a completion without a planned source is explicitly unplanned'
);
select throws_ok(
  $sql$
    insert into public.completed_sessions (
      user_id,
      completion_group_id,
      revision_number,
      actual_local_date,
      timezone_name,
      status
    )
    values (
      '10000000-0000-4000-8000-000000000001',
      gen_random_uuid(),
      1,
      '2026-07-28',
      'Europe/Berlin',
      'invented'
    )
  $sql$,
  '23514',
  'new row for relation "completed_sessions" violates check constraint "completed_sessions_status_check"',
  'unknown completion status is rejected'
);
select throws_ok(
  $sql$
    insert into public.completed_sessions (
      user_id,
      completion_group_id,
      revision_number,
      previous_completion_id,
      actual_local_date,
      timezone_name,
      status
    )
    values (
      '10000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      2,
      '30000000-0000-4000-8000-000000000001',
      '2026-07-28',
      'Europe/Berlin',
      'unplanned'
    )
  $sql$,
  '23514',
  'new row for relation "completed_sessions" violates check constraint "completed_sessions_correction_check"',
  'a correction requires an append-only reason'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select is(
  (
    select count(*)::bigint
    from public.personal_activities
    where user_id = '10000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'user B cannot read user A personal activities'
);
select is(
  (
    select count(*)::bigint
    from public.detailed_plan_versions
    where user_id = '10000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'user B cannot read user A plan versions'
);
select is(
  (
    select count(*)::bigint
    from public.planned_sessions
    where user_id = '10000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'user B cannot read user A planned sessions'
);
select is(
  (
    select count(*)::bigint
    from public.completed_sessions
    where user_id = '10000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'user B cannot read user A completions'
);
select is(
  (
    select count(*)::bigint
    from public.detailed_plan_heads
    where user_id = '10000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'user B cannot read user A current-plan head'
);
select is(
  (
    select count(*)::bigint
    from public.planned_activities
    where user_id = '10000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'user B cannot read user A planned activities'
);
select is(
  (
    select count(*)::bigint
    from public.completion_heads
    where user_id = '10000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'user B cannot read user A completion heads'
);
select is(
  (
    select count(*)::bigint
    from public.completed_activities
    where user_id = '10000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'user B cannot read user A completed activities'
);
select is_empty(
  $sql$
    update public.personal_activities
    set name = 'Cross-user mutation'
    where id = '20000000-0000-4000-8000-000000000001'
      and user_id = '10000000-0000-4000-8000-000000000001'
    returning id
  $sql$,
  'user B cannot update user A personal activities'
);
select is_empty(
  $sql$
    delete from public.personal_activities
    where id = '20000000-0000-4000-8000-000000000001'
      and user_id = '10000000-0000-4000-8000-000000000001'
    returning id
  $sql$,
  'user B cannot delete user A personal activities'
);
select throws_ok(
  $sql$
    select public.save_manual_plan_version(
      0,
      1,
      '2026-07-28',
      'Europe/Berlin',
      '[{
        "local_date":"2026-07-28",
        "position":0,
        "title":"Cross-user reference",
        "sport":"Running",
        "activities":[{
          "personal_activity_id":"20000000-0000-4000-8000-000000000001",
          "position":0,
          "name":"Hidden activity",
          "sport":"Running",
          "measurement_mode":"custom",
          "target":{"label":"Count","value":1,"unit":"count"}
        }]
      }]'::jsonb
    )
  $sql$,
  '42501',
  'The personal activity is unavailable.',
  'user B cannot reference user A personal activity'
);
select lives_ok(
  $sql$
    select public.save_manual_plan_version(
      0,
      1,
      '2026-07-28',
      'Europe/Berlin',
      '[]'::jsonb
    )
  $sql$,
  'user B can save their own independent plan'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select is(
  (
    select count(*)::bigint
    from public.detailed_plan_versions
    where user_id = '10000000-0000-4000-8000-000000000002'
  ),
  0::bigint,
  'user A cannot read user B plan'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  'select * from public.personal_activities',
  '42501',
  'permission denied for table personal_activities',
  'anonymous reads are denied'
);
select throws_ok(
  $sql$
    select public.save_manual_plan_version(
      0,
      1,
      '2026-07-28',
      'Europe/Berlin',
      '[]'::jsonb
    )
  $sql$,
  '42501',
  'permission denied for function save_manual_plan_version',
  'anonymous plan saves are denied'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select is(
  (select count(*)::bigint from public.detailed_plan_versions),
  0::bigint,
  'an authenticated role without a user id reads no plans'
);
select throws_ok(
  $sql$
    select public.save_manual_plan_version(
      0,
      1,
      '2026-07-28',
      'Europe/Berlin',
      '[]'::jsonb
    )
  $sql$,
  '42501',
  'An authenticated FitTip user is required.',
  'an authenticated role without a user id cannot save'
);

reset role;
select throws_ok(
  $sql$
    insert into public.planned_activities (
      user_id,
      planned_session_id,
      position,
      name,
      sport,
      measurement_mode
    )
    values (
      '10000000-0000-4000-8000-000000000002',
      (
        select id
        from public.planned_sessions
        where user_id = '10000000-0000-4000-8000-000000000001'
        limit 1
      ),
      9,
      'Cross-owner child',
      'Running',
      'custom'
    )
  $sql$,
  '23503',
  'insert or update on table "planned_activities" violates foreign key constraint "planned_activities_session_fkey"',
  'same-owner foreign keys reject a cross-user child'
);
select throws_ok(
  $sql$
    insert into public.completed_sessions (
      user_id,
      completion_group_id,
      revision_number,
      planned_session_id,
      actual_local_date,
      timezone_name,
      status
    )
    values (
      '10000000-0000-4000-8000-000000000001',
      gen_random_uuid(),
      1,
      (
        select id
        from public.planned_sessions
        where user_id = '10000000-0000-4000-8000-000000000001'
        limit 1
      ),
      '2026-07-28',
      'Europe/Berlin',
      'unplanned'
    )
  $sql$,
  '23514',
  'new row for relation "completed_sessions" violates check constraint "completed_sessions_unplanned_check"',
  'an unplanned completion cannot claim a planned source'
);
select is(
  (
    select count(*)::bigint
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'personal_activities',
        'detailed_plan_versions',
        'detailed_plan_heads',
        'planned_sessions',
        'planned_activities',
        'completed_sessions',
        'completion_heads',
        'completed_activities'
      )
  ),
  11::bigint,
  'the training tables have only the approved owner policies'
);

select * from finish();

rollback;
