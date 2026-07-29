begin;

create extension if not exists pgtap with schema extensions;

select plan(33);

select has_function(
  'public',
  'save_training_completion',
  array[
    'uuid', 'uuid', 'integer', 'uuid', 'date', 'timestamp with time zone',
    'text', 'integer', 'text', 'integer', 'text', 'text', 'text', 'boolean',
    'boolean', 'boolean', 'boolean', 'text', 'jsonb'
  ],
  'atomic completion function exists'
);
select ok(
  (
    select prosecdef and proconfig = array['search_path=""']
    from pg_proc
    where oid = 'public.save_training_completion(uuid,uuid,integer,uuid,date,timestamptz,text,integer,text,integer,text,text,text,boolean,boolean,boolean,boolean,text,jsonb)'::regprocedure
  ),
  'completion function is security definer with empty search path'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.save_training_completion(uuid,uuid,integer,uuid,date,timestamptz,text,integer,text,integer,text,text,text,boolean,boolean,boolean,boolean,text,jsonb)',
    'EXECUTE'
  ),
  'authenticated users can execute completion writes'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.save_training_completion(uuid,uuid,integer,uuid,date,timestamptz,text,integer,text,integer,text,text,text,boolean,boolean,boolean,boolean,text,jsonb)',
    'EXECUTE'
  ),
  'anonymous users cannot execute completion writes'
);
select ok(
  not exists (
    select 1
    from pg_proc
    cross join lateral aclexplode(coalesce(proacl, acldefault('f', proowner)))
    where oid = 'public.save_training_completion(uuid,uuid,integer,uuid,date,timestamptz,text,integer,text,integer,text,text,text,boolean,boolean,boolean,boolean,text,jsonb)'::regprocedure
      and grantee = 0
      and privilege_type = 'EXECUTE'
  ),
  'PUBLIC cannot execute completion writes'
);
select has_column(
  'public',
  'completed_sessions',
  'idempotency_key',
  'completed sessions store an idempotency key'
);
select ok(
  not has_table_privilege('authenticated', 'public.completed_sessions', 'INSERT')
    and not has_table_privilege('authenticated', 'public.completed_sessions', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.completed_sessions', 'DELETE'),
  'completed sessions remain directly immutable'
);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('30000000-0000-4000-8000-000000000001', 'm1-03-a@example.test', '{}', '{}'),
  ('30000000-0000-4000-8000-000000000002', 'm1-03-b@example.test', '{}', '{}');

insert into public.profiles (user_id)
values
  ('30000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000002');

insert into public.detailed_plan_versions (
  id, user_id, version_number, day_count, start_date, end_date, timezone_name
)
values
  (
    '31000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    1, 1, '2026-07-28', '2026-07-28', 'Europe/Berlin'
  ),
  (
    '31000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000002',
    1, 1, '2026-07-28', '2026-07-28', 'Europe/Berlin'
  );

insert into public.planned_sessions (
  id, user_id, plan_version_id, local_date, position, title, sport
)
values
  (
    '32000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    '31000000-0000-4000-8000-000000000001',
    '2026-07-28', 0, 'Owner A run', 'Running'
  ),
  (
    '32000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000002',
    '31000000-0000-4000-8000-000000000002',
    '2026-07-28', 0, 'Owner B ride', 'Cycling'
  );

insert into public.planned_activities (
  id, user_id, planned_session_id, position, name, sport, measurement_mode
)
values (
  '33000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '32000000-0000-4000-8000-000000000001',
  0, 'Easy run', 'Running', 'time_distance_pace'
);

create function pg_temp.save_completion(
  p_key uuid,
  p_group uuid default null,
  p_expected integer default 0,
  p_planned uuid default '32000000-0000-4000-8000-000000000001',
  p_status text default 'completed',
  p_effort integer default 6,
  p_feeling text default 'as_expected',
  p_replacement text default null,
  p_reason text default null,
  p_activities jsonb default '[{
    "planned_activity_id":"33000000-0000-4000-8000-000000000001",
    "personal_activity_id":null,
    "position":0,
    "name":"Easy run",
    "sport":"Running",
    "instructions":null,
    "measurement_mode":"time_distance_pace",
    "actual_measurement":{"distance":5,"distance_unit":"km"}
  }]'::jsonb
)
returns uuid
language sql
as $$
  select id
  from public.save_training_completion(
    p_key,
    p_group,
    p_expected,
    p_planned,
    '2026-07-28',
    '2026-07-28T06:00:00+02:00',
    'Europe/Berlin',
    42,
    p_status,
    p_effort,
    p_feeling,
    'Private factual note',
    p_replacement,
    false,
    false,
    false,
    false,
    p_reason,
    p_activities
  );
$$;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select lives_ok(
  $$select pg_temp.save_completion('34000000-0000-4000-8000-000000000001')$$,
  'owner can save a planned completion'
);
select is(
  (select count(*)::bigint from public.completed_sessions),
  1::bigint,
  'first save creates one factual session'
);
select is(
  (select revision from public.completion_heads),
  1,
  'first save creates a revision-one current pointer'
);
select is(
  (select count(*)::bigint from public.completed_activities),
  1::bigint,
  'actual activity measurement is snapshotted separately'
);
select is(
  (
    select title || ':' || sport
    from public.planned_sessions
    where id = '32000000-0000-4000-8000-000000000001'
  ),
  'Owner A run:Running',
  'saving actual leaves the source plan unchanged'
);
select lives_ok(
  $$select pg_temp.save_completion('34000000-0000-4000-8000-000000000001')$$,
  'an identical idempotent retry succeeds'
);
select is(
  (select count(*)::bigint from public.completed_sessions),
  1::bigint,
  'an idempotent retry creates no duplicate fact'
);
select throws_ok(
  $$select pg_temp.save_completion(
    '34000000-0000-4000-8000-000000000001',
    null, 0, '32000000-0000-4000-8000-000000000001',
    'completed', 9
  )$$,
  'PT409',
  'Idempotency key conflict',
  'reusing an idempotency key for changed content is a conflict'
);

select lives_ok(
  format(
    $$select pg_temp.save_completion(
      '34000000-0000-4000-8000-000000000002',
      %L, 1, '32000000-0000-4000-8000-000000000001',
      'partially_completed', 7, 'harder', null, 'Corrected from watch'
    )$$,
    (select completion_group_id from public.completed_sessions limit 1)
  ),
  'owner can append a correction'
);
select is(
  (select revision from public.completion_heads),
  2,
  'correction advances the current pointer'
);
select is(
  (select count(*)::bigint from public.completed_sessions),
  2::bigint,
  'correction retains the original factual revision'
);
select is(
  (
    select correction_reason
    from public.completed_sessions
    where revision_number = 2
  ),
  'Corrected from watch',
  'correction reason is retained'
);
select throws_ok(
  format(
    $$select pg_temp.save_completion(
      '34000000-0000-4000-8000-000000000003',
      %L, 1, '32000000-0000-4000-8000-000000000001',
      'completed', 6, 'as_expected', null, 'Stale browser'
    )$$,
    (select completion_group_id from public.completed_sessions limit 1)
  ),
  'PT409',
  'Completion revision conflict',
  'a stale correction is rejected'
);
select is(
  (select count(*)::bigint from public.completed_sessions),
  2::bigint,
  'a stale correction creates no orphan revision'
);
select throws_ok(
  $$select pg_temp.save_completion(
    '34000000-0000-4000-8000-000000000004',
    null, 0, '32000000-0000-4000-8000-000000000001',
    'completed', 6, 'as_expected', null, null,
    '[{
      "planned_activity_id":"33000000-0000-4000-8000-000000000001",
      "personal_activity_id":null,
      "position":0,
      "name":"Easy run",
      "sport":"Running",
      "instructions":null,
      "measurement_mode":"time_distance_pace",
      "actual_measurement":{"distance":5}
    }]'::jsonb
  )$$,
  '22023',
  'Invalid completion activity',
  'malformed measurement fails safely'
);
select throws_ok(
  $$select pg_temp.save_completion(
    '34000000-0000-4000-8000-000000000005',
    null, 0, '32000000-0000-4000-8000-000000000001',
    'completed', 11
  )$$,
  '22023',
  'Invalid completion',
  'out-of-range effort fails safely'
);
select throws_ok(
  $$select pg_temp.save_completion(
    '34000000-0000-4000-8000-000000000006',
    null, 0, '32000000-0000-4000-8000-000000000001',
    'replaced', 6, 'as_expected'
  )$$,
  '22023',
  'Invalid completion',
  'replacement requires an actual description'
);
select throws_ok(
  $$select pg_temp.save_completion(
    '34000000-0000-4000-8000-00000000000a',
    null, 0, '32000000-0000-4000-8000-000000000001',
    'skipped', null, null
  )$$,
  '23514',
  'Skipped or rest completions cannot contain activity results',
  'skipped completion rejects activity results atomically'
);
select throws_ok(
  $$select pg_temp.save_completion(
    '34000000-0000-4000-8000-00000000000b',
    null, 0, '32000000-0000-4000-8000-000000000001',
    'rest', null, null
  )$$,
  '23514',
  'Skipped or rest completions cannot contain activity results',
  'rest completion rejects activity results atomically'
);
select is(
  (
    select count(*)::bigint
    from public.completed_sessions
    where idempotency_key in (
      '34000000-0000-4000-8000-00000000000a',
      '34000000-0000-4000-8000-00000000000b'
    )
  ),
  0::bigint,
  'rejected inactive-result writes leave no factual session'
);
select throws_ok(
  $$select pg_temp.save_completion(
    '34000000-0000-4000-8000-000000000007',
    null, 0, '32000000-0000-4000-8000-000000000001',
    'unplanned', 6, 'as_expected', null, null, '[]'::jsonb
  )$$,
  '22023',
  'Invalid completion',
  'unplanned outcome rejects a planned-session reference'
);
select lives_ok(
  $$select pg_temp.save_completion(
    '34000000-0000-4000-8000-000000000008',
    null, 0, null, 'unplanned', 5, 'easier', null, null, '[]'::jsonb
  )$$,
  'unplanned completion needs no planned-session reference'
);
select throws_ok(
  $$select pg_temp.save_completion(
    '34000000-0000-4000-8000-000000000009',
    null, 0, '32000000-0000-4000-8000-000000000002',
    'completed', 5, 'as_expected', null, null, '[]'::jsonb
  )$$,
  '42501',
  'Planned session unavailable',
  'cross-user planned-session logging is denied'
);
select throws_ok(
  $$insert into public.completed_sessions (
    user_id, completion_group_id, revision_number, planned_session_id,
    actual_local_date, timezone_name, status, idempotency_key,
    idempotency_fingerprint
  ) values (
    '30000000-0000-4000-8000-000000000001',
    gen_random_uuid(), 1,
    '32000000-0000-4000-8000-000000000001',
    '2026-07-28', 'Europe/Berlin', 'completed',
    gen_random_uuid(), md5('direct')
  )$$,
  '42501',
  'permission denied for table completed_sessions',
  'authenticated clients cannot bypass the completion RPC'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"30000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select is(
  (select count(*)::bigint from public.completed_sessions),
  0::bigint,
  'RLS hides owner A completions from owner B'
);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$select public.save_training_completion(
    gen_random_uuid(), null, 0, null, '2026-07-28', null, 'UTC', null,
    'unplanned', null, null, null, null, false, false, false, false, null,
    '[]'::jsonb
  )$$,
  '42501',
  'permission denied for function save_training_completion',
  'anonymous completion writes are denied'
);

select * from finish();
rollback;
