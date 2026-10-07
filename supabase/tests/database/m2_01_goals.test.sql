begin;

create extension if not exists pgtap with schema extensions;

select plan(66);

select has_table('public', 'goals', 'goals table exists');
select has_table(
  'public',
  'goal_collections',
  'goal collections table exists'
);
select has_table(
  'public',
  'goal_lifecycle_events',
  'goal lifecycle events table exists'
);
select has_function(
  'public',
  'apply_goal_change',
  array[
    'bigint',
    'text',
    'uuid',
    'text',
    'text',
    'text[]',
    'date',
    'text',
    'smallint',
    'uuid[]'
  ],
  'the atomic goal change function exists'
);
select is(
  (
    select count(*)::bigint
    from information_schema.columns
    where table_schema = 'public'
      and table_name in (
        'goals',
        'goal_collections',
        'goal_lifecycle_events'
      )
      and column_name = 'user_id'
      and is_nullable = 'NO'
  ),
  3::bigint,
  'every goal record category has a required owner'
);
select has_column('public', 'goals', 'sports', 'a goal has sports');
select has_column(
  'public',
  'goals',
  'achieved_at',
  'a goal stores when it was achieved'
);
select is(
  (
    select count(*)::bigint
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'goals'
      and column_name in (
        'category',
        'activity_areas',
        'start_date',
        'target_detail',
        'target_metric_label',
        'target_metric_value',
        'target_metric_unit',
        'rationale',
        'constraints_text',
        'archived_at'
      )
  ),
  0::bigint,
  'the columns the goal form no longer asks are gone'
);
select ok(
  (
    select prosecdef
      and proconfig = array['search_path=""']
    from pg_proc
    where oid = 'public.apply_goal_change(bigint,text,uuid,text,text,text[],date,text,smallint,uuid[])'::regprocedure
  ),
  'the goal mutation is security definer with an empty search path'
);
select is(
  (
    select pg_get_userbyid(proowner)
    from pg_proc
    where oid = 'public.apply_goal_change(bigint,text,uuid,text,text,text[],date,text,smallint,uuid[])'::regprocedure
  ),
  'postgres',
  'the privileged goal mutation has the expected owner'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.goals'::regclass),
  'goals has RLS'
);
select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.goal_collections'::regclass
  ),
  'goal collections has RLS'
);
select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.goal_lifecycle_events'::regclass
  ),
  'goal lifecycle events has RLS'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.apply_goal_change(bigint,text,uuid,text,text,text[],date,text,smallint,uuid[])',
    'EXECUTE'
  ),
  'anonymous callers cannot execute goal mutations'
);
select ok(
  not exists (
    select 1
    from pg_proc
    cross join lateral aclexplode(
      coalesce(proacl, acldefault('f', proowner))
    )
    where oid = 'public.apply_goal_change(bigint,text,uuid,text,text,text[],date,text,smallint,uuid[])'::regprocedure
      and grantee = 0
      and privilege_type = 'EXECUTE'
  ),
  'PUBLIC cannot execute goal mutations'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.apply_goal_change(bigint,text,uuid,text,text,text[],date,text,smallint,uuid[])',
    'EXECUTE'
  ),
  'authenticated callers can execute goal mutations'
);
select ok(
  not has_function_privilege(
    'service_role',
    'public.apply_goal_change(bigint,text,uuid,text,text,text[],date,text,smallint,uuid[])',
    'EXECUTE'
  ),
  'the service role cannot bypass the authenticated goal mutation contract'
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
      'goals',
      'goal_collections',
      'goal_lifecycle_events'
    ]) as owned(table_name)
  ),
  'authenticated direct goal access is read only'
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
      'goals',
      'goal_collections',
      'goal_lifecycle_events'
    ]) as owned(table_name)
    cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE'])
      as privileges(privilege_name)
  ),
  'anonymous callers have no goal table privileges'
);
select ok(
  position(
    'execute ' || 'immediate'
    in lower(
      pg_get_functiondef(
        'public.apply_goal_change(bigint,text,uuid,text,text,text[],date,text,smallint,uuid[])'::regprocedure
      )
    )
  ) = 0,
  'the privileged function contains no dynamic SQL'
);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('51000000-0000-4000-8000-000000000001', 'm2-user-a@example.test', '{}', '{}'),
  ('51000000-0000-4000-8000-000000000002', 'm2-user-b@example.test', '{}', '{}');

insert into public.profiles (user_id)
values
  ('51000000-0000-4000-8000-000000000001'),
  ('51000000-0000-4000-8000-000000000002');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"51000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select lives_ok(
  $sql$
    select public.apply_goal_change(
      p_expected_collection_revision => 0,
      p_operation => 'create',
      p_title => 'Run a trail event',
      p_desired_outcome => 'Finish the local trail event with steady pacing.',
      p_sports => array['Trail running'],
      p_target_date => '2026-10-10',
      p_priority_tier => 'core'
    )
  $sql$,
  'the owner can create an active core goal'
);
select lives_ok(
  $sql$
    select public.apply_goal_change(
      p_expected_collection_revision => 1,
      p_operation => 'create',
      p_title => 'Move more freely',
      p_desired_outcome => 'Build a consistent mobility practice.',
      p_sports => array['Mobility'],
      p_priority_tier => 'supporting'
    )
  $sql$,
  'the owner can create an active supporting goal'
);
select is(
  (select revision from public.goal_collections),
  2::bigint,
  'each successful mutation advances the collection once'
);
select ok(
  (
    select bool_and(active_rank = 1)
    from public.goals
    where status = 'active'
  ),
  'core and supporting ranks start independently'
);
select throws_ok(
  $sql$
    insert into public.goals (
      user_id,
      title,
      desired_outcome,
      priority_tier,
      active_rank
    )
    values (
      '51000000-0000-4000-8000-000000000001',
      'Bypass',
      'Bypass the transaction.',
      'supporting',
      2
    )
  $sql$,
  '42501',
  'permission denied for table goals',
  'even the owner cannot write the goals table directly'
);
select is(
  (
    select count(*)::bigint
    from public.goals
    where user_id = '51000000-0000-4000-8000-000000000002'
  ),
  0::bigint,
  'user A cannot see user B goal rows'
);
select lives_ok(
  $sql$
    select public.apply_goal_change(
      p_expected_collection_revision => 2,
      p_operation => 'create',
      p_title => 'Practice ball control',
      p_desired_outcome => 'Improve close control for football.',
      p_sports => array['Football'],
      p_priority_tier => 'supporting'
    )
  $sql$,
  'a second supporting goal appends to its tier'
);
select lives_ok(
  format(
    $sql$
      select public.apply_goal_change(
        p_expected_collection_revision => 3,
        p_operation => 'reorder',
        p_priority_tier => 'supporting',
        p_ordered_goal_ids => array[%L::uuid,%L::uuid]
      )
    $sql$,
    (
      select id
      from public.goals
      where title = 'Practice ball control'
    ),
    (
      select id
      from public.goals
      where title = 'Move more freely'
    )
  ),
  'the owner can atomically reorder one complete tier'
);
select is(
  (
    select title
    from public.goals
    where priority_tier = 'supporting'
      and active_rank = 1
  ),
  'Practice ball control',
  'the saved supporting order is visible'
);
select lives_ok(
  format(
    $sql$
      select public.apply_goal_change(
        p_expected_collection_revision => 4,
        p_operation => 'pause',
        p_goal_id => %L::uuid
      )
    $sql$,
    (select id from public.goals where title = 'Practice ball control')
  ),
  'the owner can pause an active goal'
);
select is(
  (
    select active_rank
    from public.goals
    where title = 'Move more freely'
  ),
  1::smallint,
  'pausing closes the active supporting rank gap'
);
select lives_ok(
  format(
    $sql$
      select public.apply_goal_change(
        p_expected_collection_revision => 5,
        p_operation => 'resume',
        p_goal_id => %L::uuid,
        p_priority_tier => 'supporting',
        p_target_rank => 1::smallint
      )
    $sql$,
    (select id from public.goals where title = 'Practice ball control')
  ),
  'the owner can resume into an explicit rank'
);
select is(
  (
    select string_agg(active_rank::text, ',' order by active_rank)
    from public.goals
    where priority_tier = 'supporting'
      and status = 'active'
  ),
  '1,2',
  'resuming preserves contiguous supporting ranks'
);
select lives_ok(
  format(
    $sql$
      select public.apply_goal_change(
        p_expected_collection_revision => 6,
        p_operation => 'achieve',
        p_goal_id => %L::uuid
      )
    $sql$,
    (select id from public.goals where title = 'Run a trail event')
  ),
  'the owner can mark a goal achieved'
);
select ok(
  (
    select achieved_at is not null
    from public.goals
    where title = 'Run a trail event'
  ),
  'achieving a goal stores the moment'
);
select lives_ok(
  format(
    $sql$
      select public.apply_goal_change(
        p_expected_collection_revision => 7,
        p_operation => 'reopen',
        p_goal_id => %L::uuid,
        p_priority_tier => 'core'
      )
    $sql$,
    (select id from public.goals where title = 'Run a trail event')
  ),
  'the owner can explicitly reopen a terminal goal'
);
select ok(
  (
    select achieved_at is null
    from public.goals
    where title = 'Run a trail event'
  ),
  'reopening clears the achieved moment'
);
select is(
  (select count(*)::bigint from public.goal_lifecycle_events),
  1::bigint,
  'reopening stores one immutable lifecycle event'
);
select throws_ok(
  format(
    $sql$
      select public.apply_goal_change(
        p_expected_collection_revision => 7,
        p_operation => 'pause',
        p_goal_id => %L::uuid
      )
    $sql$,
    (select id from public.goals where title = 'Move more freely')
  ),
  'PT409',
  'Goals changed. Reload and try again.',
  'a stale mutation returns the explicit conflict'
);
select is(
  (select revision from public.goal_collections),
  8::bigint,
  'a stale mutation does not advance the collection'
);
select lives_ok(
  $sql$
    select public.apply_goal_change(
      p_expected_collection_revision => 8,
      p_operation => 'create',
      p_title => 'Improve swim endurance',
      p_desired_outcome => 'Swim continuously with calm technique.',
      p_sports => array['Swimming'],
      p_priority_tier => 'core'
    )
  $sql$,
  'the owner can create a second core goal'
);
select lives_ok(
  $sql$
    select public.apply_goal_change(
      p_expected_collection_revision => 9,
      p_operation => 'create',
      p_title => 'Build climbing skill',
      p_desired_outcome => 'Move efficiently on technical routes.',
      p_sports => array['Climbing'],
      p_priority_tier => 'core'
    )
  $sql$,
  'the owner can create a third core goal'
);
select throws_ok(
  $sql$
    select public.apply_goal_change(
      p_expected_collection_revision => 10,
      p_operation => 'create',
      p_title => 'Fourth core',
      p_desired_outcome => 'This must remain supporting.',
      p_sports => array['Hiking'],
      p_priority_tier => 'core'
    )
  $sql$,
  'PT409',
  'Three core goals are already active.',
  'a fourth active core goal is rejected'
);
select is(
  (
    select string_agg(active_rank::text, ',' order by active_rank)
    from public.goals
    where priority_tier = 'core'
      and status = 'active'
  ),
  '1,2,3',
  'the three-core rejection leaves contiguous core ranks'
);
select throws_ok(
  format(
    $sql$
      select public.apply_goal_change(
        p_expected_collection_revision => 10,
        p_operation => 'edit',
        p_goal_id => %L::uuid,
        p_title => 'Move more freely',
        p_desired_outcome => 'Build a consistent mobility practice.',
        p_sports => array['Mobility'],
        p_priority_tier => 'core'
      )
    $sql$,
    (select id from public.goals where title = 'Move more freely')
  ),
  'PT409',
  'Three core goals are already active.',
  'promotion cannot create a fourth core goal'
);
select lives_ok(
  $sql$
    select public.apply_goal_change(
      p_expected_collection_revision => 10,
      p_operation => 'create',
      p_title => 'Temporary goal',
      p_desired_outcome => 'Check a short-lived idea.',
      p_sports => array['Walking'],
      p_priority_tier => 'supporting'
    )
  $sql$,
  'an eligible temporary goal can be created'
);
select lives_ok(
  format(
    $sql$
      select public.apply_goal_change(
        p_expected_collection_revision => 11,
        p_operation => 'delete',
        p_goal_id => %L::uuid
      )
    $sql$,
    (select id from public.goals where title = 'Temporary goal')
  ),
  'an unreferenced non-terminal goal can be hard deleted'
);
select is(
  (select count(*)::bigint from public.goals where title = 'Temporary goal'),
  0::bigint,
  'hard delete removes only the eligible goal'
);
select lives_ok(
  format(
    $sql$
      select public.apply_goal_change(
        p_expected_collection_revision => 12,
        p_operation => 'abandon',
        p_goal_id => %L::uuid
      )
    $sql$,
    (select id from public.goals where title = 'Move more freely')
  ),
  'the owner can abandon an active goal'
);
select lives_ok(
  format(
    $sql$
      select public.apply_goal_change(
        p_expected_collection_revision => 13,
        p_operation => 'delete',
        p_goal_id => %L::uuid
      )
    $sql$,
    (select id from public.goals where title = 'Move more freely')
  ),
  'an abandoned goal can be hard deleted'
);
select is(
  (select count(*)::bigint from public.goals where title = 'Move more freely'),
  0::bigint,
  'the abandoned goal is gone'
);
select throws_ok(
  format(
    $sql$
      select public.apply_goal_change(
        p_expected_collection_revision => 14,
        p_operation => 'archive',
        p_goal_id => %L::uuid
      )
    $sql$,
    (select id from public.goals where title = 'Practice ball control')
  ),
  '22023',
  'Invalid goal change.',
  'archive is no longer an operation'
);
select lives_ok(
  format(
    $sql$
      select public.apply_goal_change(
        p_expected_collection_revision => 14,
        p_operation => 'delete',
        p_goal_id => %L::uuid
      )
    $sql$,
    (select id from public.goals where title = 'Run a trail event')
  ),
  'a goal that was reopened can be hard deleted'
);
select is(
  (select count(*)::bigint from public.goal_lifecycle_events),
  0::bigint,
  'deleting a goal removes its reopen history'
);
select is(
  (
    select string_agg(active_rank::text, ',' order by active_rank)
    from public.goals
    where priority_tier = 'core'
      and status = 'active'
  ),
  '1,2',
  'deleting an active goal closes the core rank gap'
);
select throws_ok(
  $sql$
    select public.apply_goal_change(
      p_expected_collection_revision => 15,
      p_operation => 'create',
      p_title => 'No sport',
      p_desired_outcome => 'Reject a goal that names no sport.',
      p_priority_tier => 'supporting'
    )
  $sql$,
  '22023',
  'Invalid goal change.',
  'a goal without a sport fails before persistence'
);
select is(
  (select revision from public.goal_collections),
  15::bigint,
  'invalid input does not advance the collection'
);

reset role;
select set_config('request.jwt.claims', '', true);

select lives_ok(
  $sql$
    set local role authenticated
  $sql$,
  'the authenticated role remains usable after mutation failures'
);
reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"51000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;
select lives_ok(
  $sql$
    select public.apply_goal_change(
      p_expected_collection_revision => 0,
      p_operation => 'create',
      p_title => 'User B private goal',
      p_desired_outcome => 'Remain isolated from user A.',
      p_sports => array['Walking'],
      p_priority_tier => 'supporting'
    )
  $sql$,
  'user B can create an independently owned goal collection'
);
select is(
  (select count(*)::bigint from public.goals),
  1::bigint,
  'RLS shows user B only their own goal'
);
select throws_ok(
  format(
    $sql$
      select public.apply_goal_change(
        p_expected_collection_revision => 0,
        p_operation => 'pause',
        p_goal_id => %L::uuid
      )
    $sql$,
    (
      select id
      from public.goals
      where title = 'User B private goal'
    )
  ),
  'PT409',
  'Goals changed. Reload and try again.',
  'a mismatched collection revision fails without writing'
);
select is(
  (select status from public.goals where title = 'User B private goal'),
  'active',
  'the rejected mutation leaves user B state unchanged'
);

select lives_ok(
  format(
    $sql$
      select public.apply_goal_change(
        p_expected_collection_revision => 1,
        p_operation => 'achieve',
        p_goal_id => %L::uuid
      )
    $sql$,
    (select id from public.goals where title = 'User B private goal')
  ),
  'user B can achieve their goal'
);
select lives_ok(
  format(
    $sql$
      select public.apply_goal_change(
        p_expected_collection_revision => 2,
        p_operation => 'edit',
        p_goal_id => %L::uuid,
        p_title => 'User B private goal',
        p_desired_outcome => 'Remain isolated from user A, reworded.',
        p_sports => array['Walking', 'Hiking'],
        p_priority_tier => 'supporting'
      )
    $sql$,
    (select id from public.goals where title = 'User B private goal')
  ),
  'an achieved goal can still be edited'
);
select ok(
  (
    select achieved_at is not null
      and achieved_at < updated_at
      and sports = array['Walking', 'Hiking']
    from public.goals
    where title = 'User B private goal'
  ),
  'editing an achieved goal leaves the achieved moment alone'
);

reset role;
select set_config('request.jwt.claims', '', true);
set local role anon;
select throws_ok(
  $sql$
    select public.apply_goal_change(
      p_expected_collection_revision => 0,
      p_operation => 'create'
    )
  $sql$,
  '42501',
  null,
  'anonymous execution is denied'
);

select * from finish();
rollback;
