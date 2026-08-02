begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

-- Structure and authorization ------------------------------------------------

select has_table('public', 'onboarding_drafts', 'draft table exists');
select has_table(
  'public',
  'onboarding_training_activities',
  'training answer table exists'
);
select has_table(
  'public',
  'onboarding_goal_candidates',
  'goal candidate table exists'
);
select has_table(
  'public',
  'onboarding_memory_candidates',
  'memory candidate table exists'
);
select has_table(
  'public',
  'onboarding_prompt_states',
  'content-free prompt state exists'
);
select has_table(
  'public',
  'onboarding_publication_receipts',
  'content-free publication receipt exists'
);
select has_function(
  'public',
  'apply_onboarding_change',
  array['bigint', 'text', 'jsonb', 'bigint', 'bigint', 'uuid'],
  'the one onboarding write function exists'
);
select ok(
  (
    select prosecdef and proconfig = array['search_path=""']
    from pg_proc
    where oid =
      'public.apply_onboarding_change(bigint,text,jsonb,bigint,bigint,uuid)'::regprocedure
  ),
  'the onboarding boundary is security definer with an empty search path'
);
select is(
  position(
    'execute'
    in lower(
      pg_get_functiondef(
        'public.apply_onboarding_change(bigint,text,jsonb,bigint,bigint,uuid)'::regprocedure
      )
    )
  ),
  0,
  'the onboarding boundary contains no dynamic SQL'
);
select ok(
  pg_get_functiondef(
    'public.apply_onboarding_change(bigint,text,jsonb,bigint,bigint,uuid)'::regprocedure
  ) ~ '62003.*62001.*62002',
  'the function text records canonical onboarding, goal, then memory locks'
);
select ok(
  pg_get_functiondef(
    'public.apply_onboarding_change(bigint,text,jsonb,bigint,bigint,uuid)'::regprocedure
  ) ~ 'set_config\(''lock_timeout'', ''3s'', true\)',
  'lock waits are bounded'
);
select is(
  (
    select count(*)::bigint
    from information_schema.columns
    where table_schema = 'public'
      and table_name in (
        'onboarding_drafts',
        'onboarding_training_activities',
        'onboarding_goal_candidates',
        'onboarding_memory_candidates',
        'onboarding_prompt_states',
        'onboarding_publication_receipts'
      )
      and column_name = 'user_id'
      and is_nullable = 'NO'
  ),
  6::bigint,
  'every onboarding record has a required owner'
);
select is(
  (
    select count(*)::bigint
    from pg_class
    where oid in (
      'public.onboarding_drafts'::regclass,
      'public.onboarding_training_activities'::regclass,
      'public.onboarding_goal_candidates'::regclass,
      'public.onboarding_memory_candidates'::regclass,
      'public.onboarding_prompt_states'::regclass,
      'public.onboarding_publication_receipts'::regclass
    )
      and relrowsecurity
  ),
  6::bigint,
  'RLS is enabled on every exposed onboarding table'
);
select is(
  (
    select count(*)::bigint
    from pg_policies
    where schemaname = 'public'
      and tablename like 'onboarding_%'
      and cmd = 'SELECT'
      and roles = array['authenticated']::name[]
      and qual = '(( SELECT auth.uid() AS uid) = user_id)'
      and with_check is null
  ),
  6::bigint,
  'each onboarding table has exactly the owner-select predicate'
);
select is(
  (
    select count(*)::bigint
    from pg_policies
    where schemaname = 'public'
      and tablename like 'onboarding_%'
  ),
  6::bigint,
  'no direct-write policy was added'
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
      'onboarding_drafts',
      'onboarding_training_activities',
      'onboarding_goal_candidates',
      'onboarding_memory_candidates',
      'onboarding_prompt_states',
      'onboarding_publication_receipts'
    ]) as owned(table_name)
  ),
  'authenticated onboarding table access is read-only'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.apply_onboarding_change(bigint,text,jsonb,bigint,bigint,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.apply_onboarding_change(bigint,text,jsonb,bigint,bigint,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.apply_onboarding_change(bigint,text,jsonb,bigint,bigint,uuid)',
    'EXECUTE'
  ),
  'only authenticated API callers execute the write boundary'
);
select ok(
  not has_schema_privilege('authenticated', 'private', 'USAGE')
  and not has_function_privilege(
    'authenticated',
    'private.onboarding_text_array(jsonb,integer,integer)',
    'EXECUTE'
  ),
  'private helpers grant no API-role access'
);
select is(
  (
    select count(*)::bigint
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'onboarding_publication_receipts'
      and column_name in (
        'id',
        'user_id',
        'idempotency_key',
        'published_at',
        'goal_ids',
        'memory_ids',
        'goal_collection_revision',
        'memory_collection_revision'
      )
  ),
  8::bigint,
  'the receipt contains only identifiers, timestamps and revisions'
);
select hasnt_column(
  'public',
  'onboarding_publication_receipts',
  'content',
  'the publication receipt has no content column'
);

-- Owner flow -----------------------------------------------------------------

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  (
    '54000000-0000-4000-8000-000000000001',
    'm2-03-user-a@example.test',
    '{}',
    '{}'
  ),
  (
    '54000000-0000-4000-8000-000000000002',
    'm2-03-user-b@example.test',
    '{}',
    '{}'
  );

insert into public.profiles (user_id)
values
  ('54000000-0000-4000-8000-000000000001'),
  ('54000000-0000-4000-8000-000000000002');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"54000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select lives_ok(
  $sql$
    select public.apply_onboarding_change(0, 'start')
  $sql$,
  'a verified owner can start setup'
);
select ok(
  (
    select revision = 0
      and current_step = 1
      and expires_at between now() + interval '29 days'
        and now() + interval '31 days'
    from public.onboarding_drafts
  ),
  'a new draft starts at revision zero with a thirty-day expiry'
);
select throws_ok(
  $sql$
    insert into public.onboarding_memory_candidates (
      draft_id,
      user_id,
      position,
      field_key,
      memory_type,
      content
    )
    select
      id,
      user_id,
      1,
      'forged',
      'preference',
      'forged direct write'
    from public.onboarding_drafts
  $sql$,
  '42501',
  'permission denied for table onboarding_memory_candidates',
  'even the owner cannot write candidates directly'
);

select lives_ok(
  $sql$
    select public.apply_onboarding_change(
      0,
      'save_goals',
      jsonb_build_object(
        'advance', true,
        'goals', jsonb_build_array(
          jsonb_build_object(
            'title', 'Finish a calm 10K',
            'desiredOutcome', 'Run the autumn 10K with even pacing.',
            'category', 'performance_event',
            'activityAreas', jsonb_build_array('Running'),
            'startDate', '2026-08-02',
            'targetDate', '2026-10-18',
            'targetDetail', '',
            'targetMetricLabel', '',
            'targetMetricValue', '',
            'targetMetricUnit', '',
            'priorityTier', 'core',
            'targetRank', 1,
            'rationale', '',
            'constraints', ''
          )
        )
      )
    )
  $sql$,
  'the goal step maps a bounded goal candidate'
);
select is(
  (
    select title
    from public.onboarding_goal_candidates
  ),
  'Finish a calm 10K',
  'goal wording remains a candidate rather than a destination write'
);

select lives_ok(
  $sql$
    select public.apply_onboarding_change(
      1,
      'save_training',
      jsonb_build_object(
        'advance', true,
        'trainingStatus', 'current',
        'activities', jsonb_build_array(
          jsonb_build_object(
            'name', 'Easy running',
            'sessionsPerWeek', 3,
            'durationMinutes', 40,
            'detail', 'Mostly conversational.'
          )
        )
      )
    )
  $sql$,
  'the baseline step creates deterministic candidate wording'
);
select is(
  (
    select content
    from public.onboarding_memory_candidates
    where field_key = 'baseline:1'
  ),
  'Current training: Easy running, 3 sessions per week, usually 40 minutes. Mostly conversational.',
  'baseline mapping is deterministic'
);

select lives_ok(
  $sql$
    select public.apply_onboarding_change(
      2,
      'save_context',
      jsonb_build_object(
        'advance', true,
        'availableDays', jsonb_build_array('Monday', 'Wednesday', 'Saturday'),
        'sessionsPerWeek', 3,
        'durationMinutes', 50,
        'accessLabels', jsonb_build_array('Road', 'Home weights'),
        'timezoneName', 'Europe/Berlin',
        'units', 'metric'
      )
    )
  $sql$,
  'availability, access, timezone and units save as structured context'
);
select is(
  (
    select count(*)::bigint
    from public.onboarding_memory_candidates
    where field_key like 'context:%'
  ),
  4::bigint,
  'the context step prepares its four deterministic memory candidates'
);

select lives_ok(
  $sql$
    select public.apply_onboarding_change(
      3,
      'save_preferences',
      jsonb_build_object(
        'advance', true,
        'preferences', jsonb_build_array(
          'Keep hard sessions concise.',
          'Prefer outdoor training.'
        )
      )
    )
  $sql$,
  'optional preference statements save without a narrative blob'
);
select lives_ok(
  $sql$
    select public.apply_onboarding_change(
      4,
      'save_constraints',
      jsonb_build_object(
        'advance', true,
        'constraints', jsonb_build_array(
          jsonb_build_object(
            'category', 'pain_injury',
            'detail', 'Avoid jumping while the ankle settles.'
          )
        )
      )
    )
  $sql$,
  'an optional limitation saves without severity inference'
);
select is(
  (select count(*)::bigint from public.memory_items),
  0::bigint,
  'draft candidates are excluded from active Memory before publication'
);
select is(
  (select count(*)::bigint from public.goals),
  0::bigint,
  'draft candidates are excluded from Goals before publication'
);

select lives_ok(
  $sql$
    select public.apply_onboarding_change(
      5,
      'save_review',
      jsonb_build_object(
        'decisions',
        (
          select jsonb_agg(
            jsonb_build_object(
              'kind', kind,
              'id', id,
              'decision', 'accepted',
              'resolution', 'create',
              'targetId', null
            )
            order by kind, id
          )
          from (
            select 'goal' as kind, id
            from public.onboarding_goal_candidates
            union all
            select 'memory' as kind, id
            from public.onboarding_memory_candidates
          ) as all_candidates
        )
      )
    )
  $sql$,
  'every candidate receives an explicit review decision'
);
select is(
  (
    select count(*)::bigint
    from (
      select decision
      from public.onboarding_goal_candidates
      union all
      select decision
      from public.onboarding_memory_candidates
    ) as decisions
    where decision = 'pending'
  ),
  0::bigint,
  'nothing remains preaccepted or undecided'
);

select lives_ok(
  $sql$
    select public.apply_onboarding_change(
      6,
      'publish',
      '{}'::jsonb,
      0,
      0,
      (select idempotency_key from public.onboarding_drafts)
    )
  $sql$,
  'accepted goal and memory candidates publish atomically'
);
select is(
  (select count(*)::bigint from public.onboarding_drafts),
  0::bigint,
  'publication purges the draft'
);
select is(
  (
    select count(*)::bigint
    from public.onboarding_goal_candidates
  ),
  0::bigint,
  'publication purges goal candidate content'
);
select is(
  (
    select count(*)::bigint
    from public.onboarding_memory_candidates
  ),
  0::bigint,
  'publication purges memory candidate content'
);
select ok(
  (
    select provenance = 'intake_confirmed'
      and confidence is null
      and user_confirmed_at is not null
    from public.memory_items
    order by created_at
    limit 1
  ),
  'published memory has trusted intake provenance and no confidence'
);
select is(
  (
    select count(*)::bigint
    from public.onboarding_publication_receipts
  ),
  1::bigint,
  'one content-free publication receipt remains'
);
select is(
  (
    select result
    from public.apply_onboarding_change(
      6,
      'publish',
      '{}'::jsonb,
      0,
      0,
      (
        select idempotency_key
        from public.onboarding_publication_receipts
      )
    )
  ),
  'already_published',
  'a repeated callback returns the committed result'
);
select is(
  (select count(*)::bigint from public.goals),
  1::bigint,
  'idempotent retry creates no duplicate goal'
);

-- The accepted goal boundary still rejects a fourth core goal atomically.
select lives_ok(
  $sql$
    select public.apply_goal_change(
      p_expected_collection_revision => (
        select revision from public.goal_collections
      ),
      p_operation => 'create',
      p_title => 'Improve swim endurance',
      p_desired_outcome => 'Swim continuously with calm technique.',
      p_category => 'endurance',
      p_activity_areas => array['Swimming'],
      p_start_date => '2026-08-02',
      p_priority_tier => 'core'
    )
  $sql$,
  'the owner can prepare a second core goal'
);
select lives_ok(
  $sql$
    select public.apply_goal_change(
      p_expected_collection_revision => (
        select revision from public.goal_collections
      ),
      p_operation => 'create',
      p_title => 'Build climbing skill',
      p_desired_outcome => 'Move efficiently on technical routes.',
      p_category => 'skill',
      p_activity_areas => array['Climbing'],
      p_start_date => '2026-08-02',
      p_priority_tier => 'core'
    )
  $sql$,
  'the owner can prepare a third core goal'
);
select lives_ok(
  $sql$ select public.apply_onboarding_change(0, 'start') $sql$,
  'the owner can start another guided review'
);
select lives_ok(
  $sql$
    select public.apply_onboarding_change(
      0,
      'save_goals',
      jsonb_build_object(
        'advance', true,
        'goals', jsonb_build_array(
          jsonb_build_object(
            'title', 'Fourth core',
            'desiredOutcome', 'This must remain supporting.',
            'category', 'other',
            'activityAreas', jsonb_build_array('Hiking'),
            'startDate', '2026-08-02',
            'targetDate', '',
            'targetDetail', '',
            'targetMetricLabel', '',
            'targetMetricValue', '',
            'targetMetricUnit', '',
            'priorityTier', 'core',
            'targetRank', 1,
            'rationale', '',
            'constraints', ''
          )
        )
      )
    )
  $sql$,
  'a fourth core candidate remains reviewable'
);
select lives_ok(
  $sql$
    select public.apply_onboarding_change(
      1,
      'save_review',
      jsonb_build_object(
        'decisions',
        (
          select jsonb_agg(
            jsonb_build_object(
              'kind', 'goal',
              'id', id,
              'decision', 'accepted',
              'resolution', 'create',
              'targetId', null
            )
          )
          from public.onboarding_goal_candidates
        )
      )
    )
  $sql$,
  'the fourth core candidate can be explicitly accepted for validation'
);
select throws_ok(
  $sql$
    select public.apply_onboarding_change(
      2,
      'publish',
      '{}'::jsonb,
      (select revision from public.goal_collections),
      (select revision from public.memory_collections),
      (select idempotency_key from public.onboarding_drafts)
    )
  $sql$,
  'PT409',
  'Three core goals are already active.',
  'publication preserves the accepted fourth-core rejection'
);
select ok(
  (select count(*) = 3 from public.goals)
    and (select count(*) = 1 from public.onboarding_drafts),
  'a rejected fourth core writes no goal and keeps the reviewable draft'
);

-- Cross-owner isolation, expiry, and cancellation -----------------------------

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"54000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select is(
  (select count(*)::bigint from public.onboarding_publication_receipts),
  0::bigint,
  'another owner cannot read the first owner receipt'
);
select is(
  (select count(*)::bigint from public.goals),
  0::bigint,
  'another owner cannot read the first owner goal'
);
select lives_ok(
  $sql$ select public.apply_onboarding_change(0, 'start') $sql$,
  'the second owner receives an independent draft'
);

reset role;
update public.onboarding_drafts
set
  created_at = now() - interval '31 days',
  expires_at = now() - interval '1 minute'
where user_id = '54000000-0000-4000-8000-000000000002';
insert into public.onboarding_memory_candidates (
  draft_id,
  user_id,
  position,
  field_key,
  memory_type,
  content
)
select
  id,
  user_id,
  1,
  'preference:expired',
  'preference',
  'synthetic-expired-marker'
from public.onboarding_drafts
where user_id = '54000000-0000-4000-8000-000000000002';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"54000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select lives_ok(
  $sql$ select public.apply_onboarding_change(0, 'start') $sql$,
  'starting after expiry purges the old draft and creates a fresh one'
);
select is(
  (
    select count(*)::bigint
    from public.onboarding_memory_candidates
    where content = 'synthetic-expired-marker'
  ),
  0::bigint,
  'expired candidate content is purged'
);
select lives_ok(
  $sql$
    select public.apply_onboarding_change(
      0,
      'save_preferences',
      '{"advance":false,"preferences":["synthetic-cancel-marker"]}'::jsonb
    )
  $sql$,
  'a resumable save retains content until a named deletion action'
);
select lives_ok(
  $sql$ select public.apply_onboarding_change(1, 'cancel') $sql$,
  'cancel is an explicit permanent deletion'
);
select is(
  (
    select count(*)::bigint
    from public.onboarding_memory_candidates
    where content = 'synthetic-cancel-marker'
  ),
  0::bigint,
  'cancel purges candidate content'
);

-- Confidence and atomic-failure regression -----------------------------------

reset role;
set constraints all deferred;
insert into public.memory_revisions (
  id,
  user_id,
  item_id,
  revision_number,
  content,
  author_class,
  provenance,
  change_kind,
  status_after
)
values (
  '54000000-0000-4000-8000-000000000201',
  '54000000-0000-4000-8000-000000000002',
  '54000000-0000-4000-8000-000000000101',
  1,
  'System wording.',
  'system',
  'inferred_proposed',
  'created',
  'proposed'
);
insert into public.memory_items (
  id,
  user_id,
  memory_type,
  status,
  provenance,
  confidence,
  source_reference,
  current_revision_id
)
values (
  '54000000-0000-4000-8000-000000000101',
  '54000000-0000-4000-8000-000000000002',
  'preference',
  'proposed',
  'inferred_proposed',
  0.8,
  'synthetic-system-proposal',
  '54000000-0000-4000-8000-000000000201'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"54000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select lives_ok(
  $sql$ select public.apply_onboarding_change(0, 'start') $sql$,
  'user B can start the confidence regression review'
);
select lives_ok(
  $sql$
    select public.apply_onboarding_change(
      0,
      'save_preferences',
      '{"advance":true,"preferences":["Owner-edited wording."]}'::jsonb
    )
  $sql$,
  'onboarding prepares owner-edited wording for explicit review'
);
select lives_ok(
  $sql$
    select public.apply_onboarding_change(
      1,
      'save_review',
      jsonb_build_object(
        'decisions',
        jsonb_build_array(
          jsonb_build_object(
            'kind', 'memory',
            'id', (select id from public.onboarding_memory_candidates),
            'decision', 'accepted',
            'resolution', 'update',
            'targetId', '54000000-0000-4000-8000-000000000101'
          )
        )
      )
    )
  $sql$,
  'the owner explicitly chooses to update the compared Memory item'
);
select lives_ok(
  $sql$
    select public.apply_onboarding_change(
      2,
      'publish',
      '{}'::jsonb,
      0,
      0,
      (select idempotency_key from public.onboarding_drafts)
    )
  $sql$,
  'onboarding publishes the reviewed wording through the accepted boundary'
);
select ok(
  (
    select confidence is null
      and provenance = 'inferred_proposed'
      and user_confirmed_at is not null
    from public.memory_items
    where id = '54000000-0000-4000-8000-000000000101'
  ),
  'an owner content edit clears confidence while preserving origin provenance'
);

-- User B: prepare a mixed goal+memory publication, inject a database failure
-- on the second destination, and prove the earlier goal write rolls back.
select lives_ok(
  $sql$ select public.apply_onboarding_change(0, 'start') $sql$,
  'user B can start a draft after cancel'
);
select lives_ok(
  $sql$
    select public.apply_onboarding_change(
      0,
      'save_goals',
      jsonb_build_object(
        'advance', true,
        'goals', jsonb_build_array(
          jsonb_build_object(
            'title', 'Rollback marker goal',
            'desiredOutcome', 'This goal must never survive the injected failure.',
            'category', 'other',
            'activityAreas', jsonb_build_array(),
            'startDate', '2026-08-02',
            'targetDate', '',
            'targetDetail', '',
            'targetMetricLabel', '',
            'targetMetricValue', '',
            'targetMetricUnit', '',
            'priorityTier', 'supporting',
            'targetRank', 1,
            'rationale', '',
            'constraints', ''
          )
        )
      )
    )
  $sql$,
  'the rollback scenario prepares a goal'
);
select lives_ok(
  $sql$
    select public.apply_onboarding_change(
      1,
      'save_preferences',
      '{"advance":true,"preferences":["Rollback marker memory"]}'::jsonb
    )
  $sql$,
  'the rollback scenario prepares memory'
);
select lives_ok(
  $sql$
    select public.apply_onboarding_change(
      2,
      'save_review',
      jsonb_build_object(
        'decisions',
        (
          select jsonb_agg(
            jsonb_build_object(
              'kind', kind,
              'id', id,
              'decision', 'accepted',
              'resolution', 'create',
              'targetId', null
            )
          )
          from (
            select 'goal' as kind, id
            from public.onboarding_goal_candidates
            union all
            select 'memory' as kind, id
            from public.onboarding_memory_candidates
          ) candidates
        )
      )
    )
  $sql$,
  'the rollback scenario records all decisions'
);

reset role;
create function private.fail_m2_03_memory_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'synthetic M2-03 transaction failure';
end;
$$;
create trigger fail_m2_03_memory_insert
before insert on public.memory_items
for each row execute function private.fail_m2_03_memory_insert();

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"54000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select throws_ok(
  $sql$
    select public.apply_onboarding_change(
      3,
      'publish',
      '{}'::jsonb,
      0,
      1,
      (select idempotency_key from public.onboarding_drafts)
    )
  $sql$,
  'P0001',
  'synthetic M2-03 transaction failure',
  'a failure after the goal write aborts the mixed publication'
);
select is(
  (
    select count(*)::bigint
    from public.goals
    where title = 'Rollback marker goal'
  ),
  0::bigint,
  'the earlier goal write rolled back'
);
select is(
  (
    select count(*)::bigint
    from public.onboarding_drafts
  ),
  1::bigint,
  'the reviewed draft remains after failed publication'
);

reset role;
drop trigger fail_m2_03_memory_insert on public.memory_items;
drop function private.fail_m2_03_memory_insert();

-- Prohibited sinks are structural: application source and the content-free
-- receipt schema are scanned separately in Vitest. Database errors stay fixed.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"54000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select throws_ok(
  $sql$
    select public.apply_onboarding_change(
      3,
      'save_preferences',
      '{"advance":true,"preferences":["synthetic-private-error-marker"],"extra":"forbidden"}'::jsonb
    )
  $sql$,
  '22023',
  'Invalid onboarding change.',
  'database validation errors never echo submitted intake text'
);

reset role;
select set_config('request.jwt.claims', '', true);
set local role anon;
select throws_ok(
  $sql$ select public.apply_onboarding_change(0, 'start') $sql$,
  '42501',
  null,
  'anonymous callers cannot start onboarding'
);
select throws_ok(
  $sql$ select * from public.onboarding_drafts $sql$,
  '42501',
  'permission denied for table onboarding_drafts',
  'anonymous callers cannot read draft content'
);

reset role;

select * from finish();
rollback;
