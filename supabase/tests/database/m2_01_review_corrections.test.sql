begin;

create extension if not exists pgtap with schema extensions;

select plan(40);

select is(
  (
    select string_agg(att.attname, ',' order by keys.ordinality)
    from pg_class idx
    join pg_index ind on ind.indexrelid = idx.oid
    cross join lateral unnest(ind.indkey)
      with ordinality as keys(attnum, ordinality)
    join pg_attribute att
      on att.attrelid = ind.indrelid
      and att.attnum = keys.attnum
    where idx.oid =
      'public.goal_lifecycle_events_goal_owner_idx'::regclass
  ),
  'goal_id,user_id',
  'the lifecycle-event foreign key has a covering index in FK column order'
);
select ok(
  (
    select position(
      'array_position(activity_areas, NULL::text) IS NULL'
      in pg_get_constraintdef(oid)
    ) > 0
    from pg_constraint
    where conrelid = 'public.goals'::regclass
      and conname = 'goals_activity_areas_check'
  ),
  'the table constraint rejects NULL activity-area elements'
);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  (
    '53000000-0000-4000-8000-000000000001',
    'm2-review-user-a@example.test',
    '{}',
    '{}'
  ),
  (
    '53000000-0000-4000-8000-000000000002',
    'm2-review-user-b@example.test',
    '{}',
    '{}'
  );

insert into public.profiles (user_id)
values
  ('53000000-0000-4000-8000-000000000001'),
  ('53000000-0000-4000-8000-000000000002');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"53000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select lives_ok(
  $sql$
    select public.apply_goal_change(
      p_expected_collection_revision => 0,
      p_operation => 'create',
      p_title => 'Core one',
      p_desired_outcome => 'Keep core one measurable.',
      p_category => 'other',
      p_activity_areas => array['Running'],
      p_start_date => '2026-07-29',
      p_priority_tier => 'core'
    )
  $sql$,
  'user A creates core one'
);
select lives_ok(
  $sql$
    select public.apply_goal_change(
      p_expected_collection_revision => 1,
      p_operation => 'create',
      p_title => 'Core two',
      p_desired_outcome => 'Keep core two measurable.',
      p_category => 'other',
      p_activity_areas => array['Swimming'],
      p_start_date => '2026-07-29',
      p_priority_tier => 'core'
    )
  $sql$,
  'user A creates core two'
);
select lives_ok(
  $sql$
    select public.apply_goal_change(
      p_expected_collection_revision => 2,
      p_operation => 'create',
      p_title => 'Support one',
      p_desired_outcome => 'Keep support one measurable.',
      p_category => 'other',
      p_activity_areas => array['Mobility'],
      p_start_date => '2026-07-29',
      p_priority_tier => 'supporting'
    )
  $sql$,
  'user A creates supporting one'
);
select lives_ok(
  $sql$
    select public.apply_goal_change(
      p_expected_collection_revision => 3,
      p_operation => 'create',
      p_title => 'Support two',
      p_desired_outcome => 'Keep support two measurable.',
      p_category => 'other',
      p_activity_areas => array['Walking'],
      p_start_date => '2026-07-29',
      p_priority_tier => 'supporting'
    )
  $sql$,
  'user A creates supporting two'
);

select throws_ok(
  $sql$
    select public.apply_goal_change(
      p_expected_collection_revision => 4,
      p_operation => 'create',
      p_title => 'Null area through function',
      p_desired_outcome => 'This must roll back.',
      p_category => 'other',
      p_activity_areas => array['Cycling', null],
      p_start_date => '2026-07-29',
      p_priority_tier => 'supporting'
    )
  $sql$,
  '23514',
  null,
  'the function path rejects a NULL activity-area label'
);
select is(
  (
    select revision
    from public.goal_collections
    where user_id = '53000000-0000-4000-8000-000000000001'
  ),
  4::bigint,
  'the rejected function mutation does not advance the revision'
);
select is(
  (
    select count(*)::bigint
    from public.goals
    where title = 'Null area through function'
  ),
  0::bigint,
  'the rejected function mutation persists no goal'
);

reset role;
select throws_ok(
  $sql$
    insert into public.goals (
      user_id,
      title,
      desired_outcome,
      category,
      activity_areas,
      start_date,
      priority_tier,
      active_rank
    )
    values (
      '53000000-0000-4000-8000-000000000001',
      'Null area direct',
      'The table constraint must reject this.',
      'other',
      array['Cycling', null],
      '2026-07-29',
      'supporting',
      3
    )
  $sql$,
  '23514',
  null,
  'the table boundary directly rejects a NULL activity-area label'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"53000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select lives_ok(
  format(
    $sql$
      select public.apply_goal_change(
        p_expected_collection_revision => 4,
        p_operation => 'edit',
        p_goal_id => %L::uuid,
        p_title => 'Core one',
        p_desired_outcome => 'Keep core one measurable.',
        p_category => 'other',
        p_activity_areas => array['Running'],
        p_start_date => '2026-07-29',
        p_priority_tier => 'supporting'
      )
    $sql$,
    (select id from public.goals where title = 'Core one')
  ),
  'core to supporting appends without submitting the old tier rank'
);
select is(
  (
    select string_agg(active_rank::text, ',' order by active_rank)
    from public.goals
    where priority_tier = 'core'
      and status = 'active'
  ),
  '1',
  'core to supporting closes the source-tier gap'
);
select is(
  (
    select string_agg(title, ',' order by active_rank)
    from public.goals
    where priority_tier = 'supporting'
      and status = 'active'
  ),
  'Support one,Support two,Core one',
  'core to supporting appends at the destination tier'
);
select lives_ok(
  format(
    $sql$
      select public.apply_goal_change(
        p_expected_collection_revision => 5,
        p_operation => 'edit',
        p_goal_id => %L::uuid,
        p_title => 'Core one',
        p_desired_outcome => 'Keep core one measurable.',
        p_category => 'other',
        p_activity_areas => array['Running'],
        p_start_date => '2026-07-29',
        p_priority_tier => 'core'
      )
    $sql$,
    (select id from public.goals where title = 'Core one')
  ),
  'supporting to core appends without submitting the old tier rank'
);
select is(
  (
    select string_agg(title, ',' order by active_rank)
    from public.goals
    where priority_tier = 'core'
      and status = 'active'
  ),
  'Core two,Core one',
  'supporting to core appends at the destination tier'
);
select is(
  (
    select string_agg(active_rank::text, ',' order by active_rank)
    from public.goals
    where priority_tier = 'supporting'
      and status = 'active'
  ),
  '1,2',
  'supporting to core leaves contiguous source-tier ranks'
);
select lives_ok(
  $sql$
    select public.apply_goal_change(
      p_expected_collection_revision => 6,
      p_operation => 'create',
      p_title => 'Core three',
      p_desired_outcome => 'Fill the remaining core slot.',
      p_category => 'other',
      p_activity_areas => array['Climbing'],
      p_start_date => '2026-07-29',
      p_priority_tier => 'core'
    )
  $sql$,
  'user A fills the third core slot'
);
select throws_ok(
  format(
    $sql$
      select public.apply_goal_change(
        p_expected_collection_revision => 7,
        p_operation => 'edit',
        p_goal_id => %L::uuid,
        p_title => 'Support one',
        p_desired_outcome => 'Keep support one measurable.',
        p_category => 'other',
        p_activity_areas => array['Mobility'],
        p_start_date => '2026-07-29',
        p_priority_tier => 'core'
      )
    $sql$,
    (select id from public.goals where title = 'Support one')
  ),
  'PT409',
  'Three core goals are already active.',
  'supporting to core rejects a full destination tier'
);
select is(
  (
    select revision
    from public.goal_collections
    where user_id = '53000000-0000-4000-8000-000000000001'
  ),
  7::bigint,
  'the full-core conflict does not advance the revision'
);
select is(
  (
    select string_agg(active_rank::text, ',' order by active_rank)
    from public.goals
    where priority_tier = 'core'
      and status = 'active'
  ),
  '1,2,3',
  'the full-core conflict leaves core order contiguous'
);

select throws_ok(
  $sql$
    select public.apply_goal_change(
      p_expected_collection_revision => 6,
      p_operation => 'create',
      p_title => 'Stale create',
      p_desired_outcome => 'This must roll back.',
      p_category => 'other',
      p_start_date => '2026-07-29',
      p_priority_tier => 'supporting'
    )
  $sql$,
  'PT409',
  'Goals changed. Reload and try again.',
  'stale create is rejected'
);
select is(
  (select count(*)::bigint from public.goals where title = 'Stale create'),
  0::bigint,
  'stale create persists no goal'
);
select throws_ok(
  format(
    $sql$
      select public.apply_goal_change(
        p_expected_collection_revision => 6,
        p_operation => 'edit',
        p_goal_id => %L::uuid,
        p_title => 'Stale edit',
        p_desired_outcome => 'This must roll back.',
        p_category => 'other',
        p_start_date => '2026-07-29',
        p_priority_tier => 'supporting'
      )
    $sql$,
    (select id from public.goals where title = 'Support one')
  ),
  'PT409',
  'Goals changed. Reload and try again.',
  'stale edit is rejected'
);
select is(
  (select title from public.goals where title = 'Support one'),
  'Support one',
  'stale edit preserves the stored goal'
);
select throws_ok(
  format(
    $sql$
      select public.apply_goal_change(
        p_expected_collection_revision => 6,
        p_operation => 'archive',
        p_goal_id => %L::uuid
      )
    $sql$,
    (select id from public.goals where title = 'Support one')
  ),
  'PT409',
  'Goals changed. Reload and try again.',
  'stale archive is rejected'
);
select is(
  (select archived_at from public.goals where title = 'Support one'),
  null::timestamptz,
  'stale archive leaves the goal unarchived'
);
select throws_ok(
  format(
    $sql$
      select public.apply_goal_change(
        p_expected_collection_revision => 6,
        p_operation => 'delete',
        p_goal_id => %L::uuid
      )
    $sql$,
    (select id from public.goals where title = 'Support one')
  ),
  'PT409',
  'Goals changed. Reload and try again.',
  'stale delete is rejected'
);
select is(
  (select count(*)::bigint from public.goals where title = 'Support one'),
  1::bigint,
  'stale delete preserves the goal'
);
select lives_ok(
  format(
    $sql$
      select public.apply_goal_change(
        p_expected_collection_revision => 7,
        p_operation => 'achieve',
        p_goal_id => %L::uuid
      )
    $sql$,
    (select id from public.goals where title = 'Support two')
  ),
  'user A creates a terminal goal for stale reopen coverage'
);
select throws_ok(
  format(
    $sql$
      select public.apply_goal_change(
        p_expected_collection_revision => 7,
        p_operation => 'reopen',
        p_goal_id => %L::uuid,
        p_priority_tier => 'supporting'
      )
    $sql$,
    (select id from public.goals where title = 'Support two')
  ),
  'PT409',
  'Goals changed. Reload and try again.',
  'stale reopen is rejected'
);
select is(
  (select status from public.goals where title = 'Support two'),
  'achieved',
  'stale reopen preserves the terminal status'
);
select is(
  (
    select revision
    from public.goal_collections
    where user_id = '53000000-0000-4000-8000-000000000001'
  ),
  8::bigint,
  'all stale mutations leave user A at the last committed revision'
);
select is(
  (
    select count(*)::bigint
    from public.goal_lifecycle_events
    where user_id = '53000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'stale reopen creates no lifecycle audit event'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"53000000-0000-4000-8000-000000000002","role":"authenticated"}',
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
      p_category => 'other',
      p_activity_areas => array['Cycling'],
      p_start_date => '2026-07-29',
      p_priority_tier => 'supporting'
    )
  $sql$,
  'user B creates private data before direct cross-owner attempts'
);
select set_config(
  'test.user_b_goal_id',
  (select id::text from public.goals where title = 'User B private goal'),
  true
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"53000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;
select throws_ok(
  format(
    $sql$
      select public.apply_goal_change(
        p_expected_collection_revision => 8,
        p_operation => 'pause',
        p_goal_id => %L::uuid
      )
    $sql$,
    current_setting('test.user_b_goal_id')
  ),
  'PT409',
  'Goals changed. Reload and try again.',
  'user A cannot mutate user B by directly submitting user B goal id'
);
select is(
  (
    select revision
    from public.goal_collections
    where user_id = '53000000-0000-4000-8000-000000000001'
  ),
  8::bigint,
  'the cross-owner id attempt does not advance user A revision'
);
select throws_ok(
  format(
    $sql$
      select public.apply_goal_change(
        p_expected_collection_revision => 8,
        p_operation => 'reorder',
        p_priority_tier => 'supporting',
        p_ordered_goal_ids => array[%L::uuid]
      )
    $sql$,
    current_setting('test.user_b_goal_id')
  ),
  'PT409',
  'Goals changed. Reload and try again.',
  'user A cannot inject user B goal id into a reorder array'
);
select is(
  (
    select active_rank
    from public.goals
    where title = 'Support one'
  ),
  1::smallint,
  'the cross-owner reorder array leaves user A order unchanged'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"53000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;
select is(
  (
    select status || ':' || active_rank::text
    from public.goals
    where id = current_setting('test.user_b_goal_id')::uuid
  ),
  'active:1',
  'user B goal remains unchanged after user A direct attempts'
);
select is(
  (
    select revision
    from public.goal_collections
    where user_id = '53000000-0000-4000-8000-000000000002'
  ),
  1::bigint,
  'user B collection revision remains independent'
);

select * from finish();
rollback;
