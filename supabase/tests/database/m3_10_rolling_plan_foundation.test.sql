begin;

create extension if not exists pgtap with schema extensions;

select plan(56);

select has_table('public', 'rolling_plans', 'rolling plans table exists');
select has_table('public', 'rolling_plan_sessions', 'rolling sessions table exists');
select has_table('public', 'rolling_plan_activities', 'rolling activities table exists');
select has_table('public', 'rolling_plan_change_sets', 'rolling change sets table exists');
select has_table('public', 'rolling_plan_change_entries', 'rolling change entries table exists');
select has_function(
  'public', 'apply_rolling_plan_change_set',
  array['bigint', 'uuid', 'text', 'jsonb'],
  'the owner-derived atomic change function exists'
);
select ok(
  (
    select prosecdef and proconfig = array['search_path=""']
    from pg_proc
    where oid = 'public.apply_rolling_plan_change_set(bigint,uuid,text,jsonb)'::regprocedure
  ),
  'the change function is security definer with an empty search path'
);
select is(
  (
    select count(*)::bigint
    from pg_proc
    cross join lateral unnest(coalesce(proargnames, array[]::text[])) argument
    where oid = 'public.apply_rolling_plan_change_set(bigint,uuid,text,jsonb)'::regprocedure
      and argument ilike '%user%'
  ), 0::bigint,
  'the change function accepts no owner parameter'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.apply_rolling_plan_change_set(bigint,uuid,text,jsonb)',
    'EXECUTE'
  ),
  'authenticated owners can execute the atomic change function'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.apply_rolling_plan_change_set(bigint,uuid,text,jsonb)',
    'EXECUTE'
  ),
  'anonymous callers cannot execute the change function'
);
select is(
  (
    select count(*)::bigint from pg_class
    where oid in (
      'public.rolling_plans'::regclass,
      'public.rolling_plan_sessions'::regclass,
      'public.rolling_plan_activities'::regclass,
      'public.rolling_plan_change_sets'::regclass,
      'public.rolling_plan_change_entries'::regclass
    ) and relrowsecurity
  ), 5::bigint,
  'RLS is enabled on every rolling-plan table'
);
select ok(
  not exists (
    select 1 from (values
      ('rolling_plans'), ('rolling_plan_sessions'), ('rolling_plan_activities'),
      ('rolling_plan_change_sets'), ('rolling_plan_change_entries')
    ) names(table_name)
    where has_table_privilege('authenticated', 'public.' || table_name, 'INSERT')
      or has_table_privilege('authenticated', 'public.' || table_name, 'UPDATE')
      or has_table_privilege('authenticated', 'public.' || table_name, 'DELETE')
  ),
  'authenticated callers have no direct mutation privilege'
);
select ok(
  not exists (
    select 1 from (values
      ('rolling_plans'), ('rolling_plan_sessions'), ('rolling_plan_activities'),
      ('rolling_plan_change_sets'), ('rolling_plan_change_entries')
    ) names(table_name)
    where not has_table_privilege('authenticated', 'public.' || table_name, 'SELECT')
  ),
  'authenticated owners can directly read current state and history'
);
select is(
  (
    select count(*)::bigint from pg_policies
    where schemaname = 'public'
      and tablename in (
        'rolling_plans', 'rolling_plan_sessions', 'rolling_plan_activities',
        'rolling_plan_change_sets', 'rolling_plan_change_entries'
      ) and cmd = 'SELECT'
  ), 5::bigint,
  'each rolling-plan table has one owner select policy'
);
select is(
  (
    select count(*)::bigint from pg_policies
    where schemaname = 'public'
      and tablename like 'rolling_plan%'
      and cmd <> 'SELECT'
  ), 0::bigint,
  'no rolling-plan table has a direct mutation policy'
);
select is(
  (
    select count(*)::bigint from information_schema.columns
    where table_schema = 'public'
      and table_name in (
        'rolling_plans', 'rolling_plan_sessions', 'rolling_plan_activities',
        'rolling_plan_change_sets', 'rolling_plan_change_entries'
      ) and column_name = 'user_id' and is_nullable = 'NO'
  ), 5::bigint,
  'every owned record has a required owner'
);
select is(
  (
    select count(*)::bigint from pg_constraint
    where conname in (
      'rolling_plans_owner_key', 'rolling_plan_sessions_plan_fkey',
      'rolling_plan_activities_session_fkey',
      'rolling_plan_activities_personal_fkey',
      'rolling_plan_change_sets_plan_fkey',
      'rolling_plan_change_entries_change_set_fkey',
      'rolling_plan_change_entries_session_fkey'
    )
  ), 7::bigint,
  'same-owner plan, session, activity, and history references are constrained'
);
select is(
  (
    select count(*)::bigint from pg_indexes
    where schemaname = 'public' and indexname in (
      'rolling_plan_sessions_active_order_idx',
      'rolling_plan_sessions_owner_slice_idx',
      'rolling_plan_activities_owner_session_idx',
      'rolling_plan_change_sets_owner_history_idx',
      'rolling_plan_change_entries_owner_history_idx',
      'rolling_plan_change_entries_session_history_idx'
    )
  ), 6::bigint,
  'owner slice, ordering, and history indexes exist'
);
select ok(
  not has_function_privilege('authenticated', 'public.rolling_plan_activity_input_is_valid(jsonb)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.rolling_plan_session_input_is_valid(jsonb,boolean)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.rolling_plan_session_state(uuid,uuid)', 'EXECUTE'),
  'internal validation and history helpers are not exposed'
);
select is(
  position(
    'execute' in lower(pg_get_functiondef(
      'public.apply_rolling_plan_change_set(bigint,uuid,text,jsonb)'::regprocedure
    ))
  ), 0,
  'the privileged function contains no dynamic SQL'
);
select ok(
  (
    select case
      when v ~ '^[0-9]+(\.[0-9]+)?\s*(ms|s|min|h|milliseconds?|seconds?|minutes?|hours?)$'
        then v::interval > interval '0' and v::interval <= interval '10 seconds'
      else false
    end
    from (
      select substring(
        pg_get_functiondef(
          'public.apply_rolling_plan_change_set(bigint,uuid,text,jsonb)'::regprocedure
        ) from 'set_config\(\s*''lock_timeout''\s*,\s*''([^'']+)'''
      ) v
    ) configured
  ),
  'the owner lock has a non-zero wait of at most ten seconds'
);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('77000000-0000-4000-8000-000000000001', 'rolling-a@example.test', '{}', '{}'),
  ('77000000-0000-4000-8000-000000000002', 'rolling-b@example.test', '{}', '{}');
insert into public.profiles (user_id) values
  ('77000000-0000-4000-8000-000000000001'),
  ('77000000-0000-4000-8000-000000000002');
insert into public.personal_activities (
  id, user_id, name, sport, measurement_mode
) values (
  '77000000-0000-4000-8000-0000000000a1',
  '77000000-0000-4000-8000-000000000001',
  'Easy run', 'Running', 'duration_intensity'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"77000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select is((select count(*)::bigint from public.rolling_plans), 0::bigint, 'an owner starts with no materialized plan');
select lives_ok(
  $$select public.apply_rolling_plan_change_set(
    0,
    '77000000-0000-4000-8000-000000000101',
    'owner_manual',
    '[{"operation":"add","sessionId":"77000000-0000-4000-8000-000000000011","session":{"localDate":"2026-08-16","position":0,"title":"Aerobic run","sport":"Running","intent":"Build endurance","expectedDurationMinutes":60,"note":null,"isLocked":false,"activities":[{"personalActivityId":"77000000-0000-4000-8000-0000000000a1","position":0,"name":"Easy run","sport":"Running","measurementMode":"duration_intensity","target":{"duration_minutes":60,"intensity":"easy"},"isLocked":false}]}}]'::jsonb
  )$$,
  'one owner transaction adds current session and activity state'
);
select is((select revision from public.rolling_plans), 1::bigint, 'one change set advances exactly one revision');
select is((select count(*)::bigint from public.rolling_plan_sessions where status = 'active'), 1::bigint, 'the current session is directly readable');
select is((select count(*)::bigint from public.rolling_plan_activities), 1::bigint, 'the current activity is directly readable');
select is((select count(*)::bigint from public.rolling_plan_change_sets), 1::bigint, 'one grouped change set is appended');
select is((select count(*)::bigint from public.rolling_plan_change_entries), 1::bigint, 'one before-after entry is appended');
select ok(
  (select before_state is null and after_state->>'title' = 'Aerobic run' from public.rolling_plan_change_entries),
  'an addition records null before and complete after state'
);
select lives_ok(
  $$select public.apply_rolling_plan_change_set(
    0,
    '77000000-0000-4000-8000-000000000101',
    'owner_manual',
    '[{"operation":"add","sessionId":"77000000-0000-4000-8000-000000000011","session":{"localDate":"2026-08-16","position":0,"title":"Aerobic run","sport":"Running","intent":"Build endurance","expectedDurationMinutes":60,"note":null,"isLocked":false,"activities":[{"personalActivityId":"77000000-0000-4000-8000-0000000000a1","position":0,"name":"Easy run","sport":"Running","measurementMode":"duration_intensity","target":{"duration_minutes":60,"intensity":"easy"},"isLocked":false}]}}]'::jsonb
  )$$,
  'an exact idempotency replay succeeds despite the old expected revision'
);
select is(
  (select count(*)::bigint from public.rolling_plan_change_sets), 1::bigint,
  'an idempotency replay appends no history'
);
select throws_ok(
  $$select public.apply_rolling_plan_change_set(
    1, '77000000-0000-4000-8000-000000000101', 'owner_manual',
    '[{"operation":"cancel","sessionId":"77000000-0000-4000-8000-000000000011"}]'::jsonb
  )$$,
  'PT409', 'That plan change key was already used.',
  'reusing a key for different content is an honest conflict'
);
select is((select revision from public.rolling_plans), 1::bigint, 'a conflicting replay writes no revision');
select lives_ok(
  $$select public.apply_rolling_plan_change_set(
    1,
    '77000000-0000-4000-8000-000000000102',
    'owner_manual',
    '[{"operation":"edit","sessionId":"77000000-0000-4000-8000-000000000011","session":{"title":"Long aerobic run","sport":"Running","expectedDurationMinutes":75,"activities":[]}},{"operation":"move","sessionId":"77000000-0000-4000-8000-000000000011","localDate":"2026-08-17","position":1},{"operation":"set_lock","sessionId":"77000000-0000-4000-8000-000000000011","isLocked":true}]'::jsonb
  )$$,
  'edit, move, and lock apply as one grouped owner action'
);
select is((select revision from public.rolling_plans), 2::bigint, 'three subchanges advance only one owner revision');
select is(
  (select count(*)::bigint from public.rolling_plan_change_entries where change_set_id = (
    select id from public.rolling_plan_change_sets where plan_revision = 2
  )), 3::bigint,
  'the grouped action has three ordered before-after entries'
);
select ok(
  (select title = 'Long aerobic run' and local_date = '2026-08-17' and position = 1 and is_locked
   from public.rolling_plan_sessions),
  'edit, move, and lock are visible in current state'
);
select throws_ok(
  $$select public.apply_rolling_plan_change_set(
    2,
    '77000000-0000-4000-8000-000000000103',
    'owner_manual',
    '[{"operation":"add","sessionId":"77000000-0000-4000-8000-000000000012","session":{"localDate":"2026-08-18","position":0,"title":"Ride","sport":"Cycling","isLocked":false,"activities":[]}},{"operation":"add","sessionId":"77000000-0000-4000-8000-000000000013","session":{"localDate":"2026-08-18","position":0,"title":"Swim","sport":"Swimming","isLocked":false,"activities":[]}}]'::jsonb
  )$$,
  '22023', 'Invalid rolling plan change set.',
  'a failed subchange rolls the entire grouped action back'
);
select is((select revision from public.rolling_plans), 2::bigint, 'failed grouped input advances no revision');
select is(
  (select count(*)::bigint from public.rolling_plan_sessions), 1::bigint,
  'failed grouped input leaves no partial current session'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"77000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select is((select count(*)::bigint from public.rolling_plan_sessions), 0::bigint, 'RLS hides another owner current state');
select is((select count(*)::bigint from public.rolling_plan_change_entries), 0::bigint, 'RLS hides another owner history');
select throws_ok(
  $$select public.apply_rolling_plan_change_set(
    0,
    '77000000-0000-4000-8000-000000000201',
    'owner_manual',
    '[{"operation":"edit","sessionId":"77000000-0000-4000-8000-000000000011","session":{"title":"Attack","sport":"Running","activities":[]}}]'::jsonb
  )$$,
  '22023', 'Invalid rolling plan change.',
  'a cross-owner session identity cannot be changed'
);
select throws_ok(
  $$select public.apply_rolling_plan_change_set(
    0,
    '77000000-0000-4000-8000-000000000202',
    'owner_manual',
    '[{"operation":"add","sessionId":"77000000-0000-4000-8000-000000000021","session":{"localDate":"2026-08-19","position":0,"title":"Attack","sport":"Running","isLocked":false,"activities":[{"personalActivityId":"77000000-0000-4000-8000-0000000000a1","position":0,"name":"Stolen","sport":"Running","measurementMode":"duration_intensity","target":{"duration_minutes":10,"intensity":"easy"},"isLocked":false}]}}]'::jsonb
  )$$,
  '22023', 'Invalid rolling plan activity.',
  'a cross-owner personal activity reference is denied atomically'
);
select is((select count(*)::bigint from public.rolling_plans), 0::bigint, 'denied cross-owner writes leave the attacker no partial plan');

select set_config(
  'request.jwt.claims',
  '{"sub":"77000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select lives_ok(
  $$select public.apply_rolling_plan_change_set(
    2,
    '77000000-0000-4000-8000-000000000104',
    'owner_manual',
    '[{"operation":"cancel","sessionId":"77000000-0000-4000-8000-000000000011"}]'::jsonb
  )$$,
  'cancellation succeeds without deleting the stable identity'
);
select ok(
  (select status = 'cancelled' and cancelled_at is not null from public.rolling_plan_sessions),
  'cancelled current state remains directly readable'
);
select is(
  (select count(*)::bigint from public.rolling_plan_change_entries where change_kind = 'cancel'),
  1::bigint,
  'cancellation appends its before-after history'
);
select throws_ok(
  $$select public.apply_rolling_plan_change_set(
    2,
    '77000000-0000-4000-8000-000000000105',
    'owner_manual',
    '[{"operation":"add","sessionId":"77000000-0000-4000-8000-000000000014","session":{"localDate":"2026-08-20","position":0,"title":"Stale","sport":"Run","isLocked":false,"activities":[]}}]'::jsonb
  )$$,
  'PT409', 'Your plan changed. Reload and try again.',
  'a stale expected revision is rejected'
);
select is((select revision from public.rolling_plans), 3::bigint, 'a stale request writes no revision');
select is((select count(*)::bigint from public.rolling_plan_sessions), 1::bigint, 'a stale request writes no session');
select throws_ok(
  $$insert into public.rolling_plan_sessions (
    id, user_id, plan_id, local_date, position, title, sport
  ) select
    '77000000-0000-4000-8000-000000000099', user_id, id,
    '2026-08-20', 0, 'Direct', 'Run'
  from public.rolling_plans$$,
  '42501', 'permission denied for table rolling_plan_sessions',
  'direct authenticated current-state insertion is denied'
);
select throws_ok(
  $$update public.rolling_plan_change_entries set after_state = '{}'::jsonb$$,
  '42501', 'permission denied for table rolling_plan_change_entries',
  'direct authenticated history mutation is denied'
);

select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok(
  $$select public.apply_rolling_plan_change_set(
    0, '77000000-0000-4000-8000-000000000301', 'owner_manual',
    '[{"operation":"cancel","sessionId":"77000000-0000-4000-8000-000000000011"}]'::jsonb
  )$$,
  '42501', 'An authenticated FitTip user is required.',
  'an authenticated session without a subject cannot write'
);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$select count(*) from public.rolling_plan_sessions$$,
  '42501', 'permission denied for table rolling_plan_sessions',
  'anonymous reads expose no current state'
);
select throws_ok(
  $$select public.apply_rolling_plan_change_set(
    0, '77000000-0000-4000-8000-000000000302', 'owner_manual', '[]'::jsonb
  )$$,
  '42501', 'permission denied for function apply_rolling_plan_change_set',
  'anonymous writes are denied before the transaction'
);

select * from finish();
rollback;
