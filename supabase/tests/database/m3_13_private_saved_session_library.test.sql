-- M3-13: the private saved-session library.
--
-- Two things are proved here that nothing else can prove. First, that the
-- library is owner-scoped in the same way the rest of the schema is: explicit
-- privileges, RLS, owner-derived writes, an immutable owner column, and no
-- cross-owner reach. Second, that both copy directions are by value - a plan
-- session made from a library entry survives that entry being edited and then
-- deleted, and the library entry survives the plan session being edited.
--
-- Dates follow the wall clock for the same reason M3-12's suite does: the
-- past-date rule is defined against owner-local today, so a fixed literal
-- would stop testing the rule. The owner is given a stored zone whose local
-- time is currently mid-day, so a suite that runs in about a second cannot
-- straddle an owner-local midnight whatever UTC hour it starts at.

begin;

create extension if not exists pgtap with schema extensions;

create temporary table library_zone as
select name
from pg_catalog.pg_timezone_names
where name in (
  'UTC', 'Europe/Berlin', 'Asia/Tokyo', 'Pacific/Auckland',
  'America/New_York', 'America/Los_Angeles'
)
  and pg_catalog.date_part(
    'hour', pg_catalog.timezone(name, pg_catalog.clock_timestamp())
  ) between 8 and 15
order by name
limit 1;

grant select on library_zone to public;

create function pg_temp.owner_day(p_offset integer)
returns text
language sql
stable
as $$
  select (
    (timezone((select name from library_zone), clock_timestamp()))::date + p_offset
  )::text
$$;

-- Reuse is a plain `add` composed from the stored library values, exactly as
-- the server action composes it. Nulls are stripped because an absent optional
-- key and an explicit null mean the same thing to the change function.
create function pg_temp.reuse_payload(
  p_saved_session_id uuid,
  p_session_id uuid,
  p_local_date text,
  p_position integer
)
returns jsonb
language sql
stable
as $$
  select jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
    'operation', 'add',
    'sessionId', p_session_id,
    'session', jsonb_strip_nulls(jsonb_build_object(
      'localDate', p_local_date,
      'position', p_position,
      'title', saved.title,
      'sport', saved.sport,
      'intent', saved.intent,
      'expectedDurationMinutes', saved.expected_duration_minutes,
      'note', saved.note,
      'isLocked', false,
      'activities', coalesce((
        select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
          'personalActivityId', activity.personal_activity_id,
          'position', activity.position,
          'name', activity.name,
          'sport', activity.sport,
          'instructions', activity.instructions,
          'measurementMode', activity.measurement_mode,
          'target', activity.target,
          'isLocked', false
        )) order by activity.position)
        from public.saved_session_activities activity
        where activity.saved_session_id = saved.id
      ), '[]'::jsonb)
    ))
  )))
  from public.saved_sessions saved
  where saved.id = p_saved_session_id;
$$;

select plan(71);

select is(
  (select count(*)::bigint from library_zone), 1::bigint,
  'a stored zone whose local time is mid-day is available at every UTC hour'
);

-- Structure ------------------------------------------------------------------

select has_table('public', 'saved_sessions', 'the library persists saved sessions');
select has_table('public', 'saved_session_activities', 'a saved session carries its own activities');
select col_not_null('public', 'saved_sessions', 'user_id', 'every saved session has a required owner');
select col_not_null('public', 'saved_session_activities', 'user_id', 'every saved activity has a required owner');
select col_not_null('public', 'saved_sessions', 'name', 'a saved session carries a required owner-given name');

select ok(
  (select count(*) = 0 from pg_attribute
   where attrelid = 'public.saved_sessions'::regclass and not attisdropped
     and attname in (
       'local_date', 'position', 'is_locked', 'status', 'cancelled_at',
       'plan_id', 'active_position', 'series_id', 'completed_at', 'proposal_id'
     )),
  'a saved session carries no date, placement, lock, status, plan or proposal column'
);
select ok(
  (select count(*) = 0 from pg_attribute
   where attrelid = 'public.saved_session_activities'::regclass and not attisdropped
     and attname in ('is_locked', 'plan_id', 'session_id')),
  'a saved activity carries no Plan lock and no Plan identity'
);
select ok(
  (select count(*) = 0 from pg_constraint
   where contype = 'f'
     and (
       (conrelid in (
          'public.saved_sessions'::regclass,
          'public.saved_session_activities'::regclass)
        and confrelid in (
          'public.rolling_plans'::regclass,
          'public.rolling_plan_sessions'::regclass,
          'public.rolling_plan_activities'::regclass))
       or (conrelid in (
          'public.rolling_plans'::regclass,
          'public.rolling_plan_sessions'::regclass,
          'public.rolling_plan_activities'::regclass)
        and confrelid in (
          'public.saved_sessions'::regclass,
          'public.saved_session_activities'::regclass))
     )),
  'neither copy direction creates a live link between the Plan and the library'
);
select ok(
  (select count(*) = 1 from pg_constraint
   where conrelid = 'public.saved_session_activities'::regclass
     and conname = 'saved_session_activities_session_fkey'
     and confrelid = 'public.saved_sessions'::regclass
     and confdeltype = 'c'),
  'deleting a saved session removes its own activities and nothing else'
);
select ok(
  (select count(*) = 1 from pg_constraint
   where conrelid = 'public.saved_session_activities'::regclass
     and conname = 'saved_session_activities_personal_fkey'
     and confrelid = 'public.personal_activities'::regclass),
  'a saved activity may only reference the same owner personal activity'
);
select ok(
  (select count(*) = 1 from pg_constraint
   where conrelid = 'public.saved_sessions'::regclass
     and conname = 'saved_sessions_revision_check'),
  'the optimistic token can never go negative'
);
select has_index('public', 'saved_sessions', 'saved_sessions_owner_name_idx',
  'the library list has an owner-ordered access path');
select has_index('public', 'saved_session_activities',
  'saved_session_activities_owner_session_idx',
  'an entry activities have an owner-scoped ordered access path');
select has_index('public', 'saved_session_activities',
  'saved_session_activities_personal_idx',
  'the personal-activity foreign key is indexed');

-- Privileges and policies ----------------------------------------------------

select ok(
  (select relrowsecurity from pg_class where oid = 'public.saved_sessions'::regclass)
  and (select relrowsecurity from pg_class
       where oid = 'public.saved_session_activities'::regclass),
  'RLS is enabled on both library tables'
);
select ok(
  has_table_privilege('authenticated', 'public.saved_sessions', 'SELECT')
  and not has_table_privilege('authenticated', 'public.saved_sessions', 'INSERT')
  and not has_table_privilege('authenticated', 'public.saved_sessions', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.saved_sessions', 'DELETE'),
  'owners read the library directly but can only write it through the change function'
);
select ok(
  has_table_privilege('authenticated', 'public.saved_session_activities', 'SELECT')
  and not has_table_privilege('authenticated', 'public.saved_session_activities', 'INSERT')
  and not has_table_privilege('authenticated', 'public.saved_session_activities', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.saved_session_activities', 'DELETE'),
  'the same holds for the activities of a saved session'
);
select ok(
  not has_table_privilege('anon', 'public.saved_sessions', 'SELECT')
  and not has_table_privilege('anon', 'public.saved_session_activities', 'SELECT'),
  'anonymous callers hold no library privilege'
);
select ok(
  not has_table_privilege('service_role', 'public.saved_sessions', 'SELECT')
  and not has_table_privilege('service_role', 'public.saved_session_activities', 'SELECT'),
  'no service role privilege is introduced on the library'
);
select is(
  (select count(*)::bigint from pg_policies
   where schemaname = 'public'
     and tablename in ('saved_sessions', 'saved_session_activities')),
  2::bigint,
  'each library table carries exactly one owner select policy and no mutation policy'
);
select ok(
  (select bool_and(qual = '(( SELECT auth.uid() AS uid) = user_id)')
   from pg_policies
   where schemaname = 'public'
     and tablename in ('saved_sessions', 'saved_session_activities')),
  'both policies confine reads to the calling owner'
);
select ok(
  has_function_privilege('authenticated', 'public.apply_saved_session_change(text, uuid, bigint, text, text, text, text, integer, text, jsonb)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.apply_saved_session_change(text, uuid, bigint, text, text, text, text, integer, text, jsonb)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.apply_saved_session_change(text, uuid, bigint, text, text, text, text, integer, text, jsonb)', 'EXECUTE'),
  'only an authenticated owner may call the library write'
);
select ok(
  not has_function_privilege('authenticated', 'public.saved_session_activity_input_is_valid(jsonb)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.saved_session_activity_input_is_valid(jsonb)', 'EXECUTE'),
  'the internal validator is reachable from no client role'
);
select ok(
  (select pg_get_constraintdef(oid) not like '%save%' from pg_constraint
   where conrelid = 'public.rolling_plan_change_entries'::regclass
     and conname = 'rolling_plan_change_entries_kind_check'),
  'reuse adds no plan change operation: the recorded change kinds are unchanged'
);

-- Owner behavior -------------------------------------------------------------

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('7e000000-0000-4000-8000-000000000001', 'library-owner@example.test', '{}', '{}'),
  ('7e000000-0000-4000-8000-000000000002', 'library-outsider@example.test', '{}', '{}');
insert into public.profiles (user_id, timezone_name)
select id, (select name from library_zone)
from auth.users where id in (
  '7e000000-0000-4000-8000-000000000001',
  '7e000000-0000-4000-8000-000000000002'
);
insert into public.personal_activities (id, user_id, name, sport, measurement_mode)
values (
  '7e000000-0000-4000-8000-0000000000a1',
  '7e000000-0000-4000-8000-000000000001',
  'Easy running', 'Running', 'duration_intensity'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok(
  $$select public.apply_saved_session_change(
    'create', null, null, 'Tempo', 'Tempo run', 'Running', null, 60, null, '[]'::jsonb
  )$$,
  '42501', 'An authenticated FitTip user is required.',
  'a call without an owner is refused before anything is written'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"7e000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select throws_ok(
  $$insert into public.saved_sessions (user_id, name, title, sport)
    values ('7e000000-0000-4000-8000-000000000001', 'Direct', 'Direct', 'Running')$$,
  '42501', 'permission denied for table saved_sessions',
  'direct authenticated insertion into the library is denied'
);
select throws_ok(
  $$insert into public.saved_session_activities (
      user_id, saved_session_id, position, name, sport, measurement_mode)
    values ('7e000000-0000-4000-8000-000000000001',
      '7e000000-0000-4000-8000-0000000000b1', 0, 'Direct', 'Running', 'custom')$$,
  '42501', 'permission denied for table saved_session_activities',
  'direct authenticated insertion of a saved activity is denied'
);

select is(
  (select result from public.apply_saved_session_change(
    'create', null, null, 'Tuesday tempo', 'Tempo run', 'Running',
    'Threshold work', 60, 'Shoes with the orange laces',
    '[{"position":0,"name":"Easy running","sport":"Running","measurementMode":"duration_intensity","target":{"duration_minutes":15,"intensity":"easy"},"personalActivityId":"7e000000-0000-4000-8000-0000000000a1"},
      {"position":1,"name":"Tempo blocks","sport":"Running","instructions":"3 x 8 minutes","measurementMode":"custom"}]'::jsonb
  )),
  'created',
  'the owner saves a session into the library'
);
select is(
  (select revision from public.saved_sessions where name = 'Tuesday tempo'),
  0::bigint,
  'a new library entry starts at revision zero'
);
select is(
  (select user_id from public.saved_sessions where name = 'Tuesday tempo'),
  '7e000000-0000-4000-8000-000000000001'::uuid,
  'the owner is derived from the caller, never from the call'
);
select is(
  (select count(*)::bigint from public.saved_session_activities),
  2::bigint,
  'the copy carries every activity of the source session'
);
select ok(
  (select personal_activity_id = '7e000000-0000-4000-8000-0000000000a1'::uuid
     and target = '{"duration_minutes":15,"intensity":"easy"}'::jsonb
   from public.saved_session_activities where position = 0),
  'a copied activity keeps its owner personal-activity reference and target'
);
select ok(
  (select target is null and instructions = '3 x 8 minutes'
   from public.saved_session_activities where position = 1),
  'an activity with no measurement target is copied as having none'
);

select throws_ok(
  $$select public.apply_saved_session_change(
    'create', null, null, 'Borrowed', 'Borrowed', 'Running', null, null, null,
    '[{"position":0,"name":"Someone else","sport":"Running","measurementMode":"custom","personalActivityId":"7e000000-0000-4000-8000-0000000000ff"}]'::jsonb
  )$$,
  '22023', 'Invalid saved session activity.',
  'a saved activity cannot reference a personal activity the owner does not hold'
);
select throws_ok(
  $$select public.apply_saved_session_change(
    'create', null, null, 'Collision', 'Collision', 'Running', null, null, null,
    '[{"position":0,"name":"First","sport":"Running","measurementMode":"custom"},
      {"position":0,"name":"Second","sport":"Running","measurementMode":"custom"}]'::jsonb
  )$$,
  '22023', 'Invalid saved session change.',
  'two activities cannot claim the same position'
);
select throws_ok(
  $$select public.apply_saved_session_change(
    'create', '7e000000-0000-4000-8000-0000000000c1', null,
    'Named', 'Named', 'Running', null, null, null, '[]'::jsonb
  )$$,
  '22023', 'Invalid saved session.',
  'a create cannot name the identity it is about to be given'
);
select throws_ok(
  $$select public.apply_saved_session_change(
    'create', null, null, '   ', 'Blank', 'Running', null, null, null, '[]'::jsonb
  )$$,
  '22023', 'Invalid saved session change.',
  'a library entry cannot be saved without a usable name'
);
select is(
  (select count(*)::bigint from public.saved_sessions), 1::bigint,
  'every refused create left the library exactly as it was'
);

-- Reuse into the Plan --------------------------------------------------------

select is(
  (select result from public.apply_rolling_plan_change_set(
    0, '7e000000-0000-4000-8000-000000000101', 'owner_manual',
    pg_temp.reuse_payload(
      (select id from public.saved_sessions where name = 'Tuesday tempo'),
      '7e000000-0000-4000-8000-0000000000d1', pg_temp.owner_day(1), 0
    )
  )),
  'applied',
  'reuse reaches the Plan through the unchanged change function'
);
select ok(
  (select title = 'Tempo run' and sport = 'Running'
     and intent = 'Threshold work' and expected_duration_minutes = 60
     and note = 'Shoes with the orange laces' and not is_locked
     and local_date::text = pg_temp.owner_day(1)
   from public.rolling_plan_sessions
   where id = '7e000000-0000-4000-8000-0000000000d1'),
  'the planned session carries the library values on the date the owner picked'
);
select is(
  (select count(*)::bigint from public.rolling_plan_activities
   where session_id = '7e000000-0000-4000-8000-0000000000d1'),
  2::bigint,
  'reuse copies the activities too'
);
select ok(
  (select bool_and(not is_locked) from public.rolling_plan_activities
   where session_id = '7e000000-0000-4000-8000-0000000000d1'),
  'a reused activity enters the Plan unlocked'
);

select throws_ok(
  format(
    $$select public.apply_rolling_plan_change_set(
      1, '7e000000-0000-4000-8000-000000000102', 'owner_manual',
      pg_temp.reuse_payload(
        (select id from public.saved_sessions where name = 'Tuesday tempo'),
        '7e000000-0000-4000-8000-0000000000d2', %L, 0
      )
    )$$,
    pg_temp.owner_day(-1)
  ),
  'PT422', 'A plan change cannot target a date before today.',
  'reuse cannot reach a date that has already passed'
);

-- Fill the date to the cap, then prove an eleventh reuse is refused.
select lives_ok(
  format(
    $$select public.apply_rolling_plan_change_set(
      1, '7e000000-0000-4000-8000-000000000103', 'owner_manual',
      (select jsonb_agg(jsonb_build_object(
        'operation', 'add',
        'sessionId', ('7e000000-0000-4000-8000-0000000000e' || to_hex(offset_index))::uuid,
        'session', jsonb_build_object(
          'localDate', %L, 'position', offset_index, 'title', 'Filler',
          'sport', 'Running', 'isLocked', false, 'activities', '[]'::jsonb)))
       from generate_series(1, 9) as offset_index)
    )$$,
    pg_temp.owner_day(1)
  ),
  'the reused session plus nine more fill the date to its cap'
);
select throws_ok(
  format(
    $$select public.apply_rolling_plan_change_set(
      2, '7e000000-0000-4000-8000-000000000104', 'owner_manual',
      pg_temp.reuse_payload(
        (select id from public.saved_sessions where name = 'Tuesday tempo'),
        '7e000000-0000-4000-8000-0000000000d3', %L, 10
      )
    )$$,
    pg_temp.owner_day(1)
  ),
  'PT423', 'A date holds at most ten planned sessions.',
  'reuse is held to the same per-date cap as any other addition'
);

-- Copy by value, in both directions ------------------------------------------

select is(
  (select result from public.apply_saved_session_change(
    'edit',
    (select id from public.saved_sessions where name = 'Tuesday tempo'),
    0, 'Tuesday tempo (v2)', 'Longer tempo run', 'Trail running',
    null, 80, null, null
  )),
  'updated',
  'the owner edits the library entry'
);
select is(
  (select revision from public.saved_sessions where name = 'Tuesday tempo (v2)'),
  1::bigint,
  'an accepted edit advances the optimistic token by one'
);
select ok(
  (select intent is null and note is null
   from public.saved_sessions where name = 'Tuesday tempo (v2)'),
  'an edit clears the fields the owner cleared'
);
select is(
  (select count(*)::bigint from public.saved_session_activities),
  2::bigint,
  'an edit leaves the copied activities exactly as they were saved'
);
select ok(
  (select title = 'Tempo run' and sport = 'Running'
     and expected_duration_minutes = 60 and intent = 'Threshold work'
   from public.rolling_plan_sessions
   where id = '7e000000-0000-4000-8000-0000000000d1'),
  'editing the library entry changes no planned session already made from it'
);

select lives_ok(
  $$select public.apply_rolling_plan_change_set(
    2, '7e000000-0000-4000-8000-000000000105', 'owner_manual',
    '[{"operation":"edit","sessionId":"7e000000-0000-4000-8000-0000000000d1","session":{"title":"Rewritten in the plan","sport":"Cycling","activities":[]}}]'::jsonb
  )$$,
  'the owner edits the planned session that came from the library'
);
select ok(
  (select title = 'Longer tempo run' and sport = 'Trail running'
   from public.saved_sessions where name = 'Tuesday tempo (v2)'),
  'editing the planned session changes no library entry'
);
select is(
  (select count(*)::bigint from public.saved_session_activities),
  2::bigint,
  'clearing the planned activities leaves the library activities untouched'
);

-- The optimistic token -------------------------------------------------------

select throws_ok(
  $$select public.apply_saved_session_change(
    'edit',
    (select id from public.saved_sessions where name = 'Tuesday tempo (v2)'),
    0, 'Stale', 'Stale', 'Running', null, null, null, null
  )$$,
  'PT409', 'That saved session changed. Reload and try again.',
  'a write at a stale revision is refused rather than applied'
);
select ok(
  (select name = 'Tuesday tempo (v2)' and revision = 1 from public.saved_sessions),
  'the refused write left the current record exactly as it was'
);
select throws_ok(
  $$select public.apply_saved_session_change(
    'delete',
    (select id from public.saved_sessions where name = 'Tuesday tempo (v2)'),
    0, null, null, null, null, null, null, null
  )$$,
  'PT409', 'That saved session changed. Reload and try again.',
  'a delete at a stale revision is refused too'
);
select throws_ok(
  $$select public.apply_saved_session_change(
    'delete', '7e000000-0000-4000-8000-0000000000ee', 0,
    null, null, null, null, null, null, null
  )$$,
  'PT409', 'That saved session changed. Reload and try again.',
  'a record that is not there is reported as changed, not as missing'
);
select throws_ok(
  $$select public.apply_saved_session_change(
    'edit',
    (select id from public.saved_sessions where name = 'Tuesday tempo (v2)'),
    1, 'With activities', 'With activities', 'Running', null, null, null, '[]'::jsonb
  )$$,
  '22023', 'Invalid saved session change.',
  'an edit carries no activity list, because nothing can edit activities yet'
);

-- Another owner and anonymous callers ----------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"7e000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select is(
  (select count(*)::bigint from public.saved_sessions), 0::bigint,
  'RLS hides another owner library entirely'
);
select is(
  (select count(*)::bigint from public.saved_session_activities), 0::bigint,
  'RLS hides another owner saved activities'
);
select throws_ok(
  $$select public.apply_saved_session_change(
    'edit', '7e000000-0000-4000-8000-0000000000ee', 1,
    'Taken', 'Taken', 'Running', null, null, null, null
  )$$,
  'PT409', 'That saved session changed. Reload and try again.',
  'another owner cannot reach into this library, and learns nothing about it'
);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$select count(*) from public.saved_sessions$$,
  '42501', 'permission denied for table saved_sessions',
  'anonymous library reads are denied'
);
select throws_ok(
  $$select public.apply_saved_session_change(
    'create', null, null, 'Anon', 'Anon', 'Running', null, null, null, '[]'::jsonb
  )$$,
  '42501',
  'permission denied for function apply_saved_session_change',
  'anonymous callers cannot reach the library write at all'
);

-- The owner column cannot be reassigned even from a privileged path -----------

reset role;
select throws_ok(
  $$update public.saved_sessions
    set user_id = '7e000000-0000-4000-8000-000000000002'$$,
  '42501', 'A saved session owner cannot be reassigned.',
  'the owner of a library entry is immutable'
);
select throws_ok(
  $$update public.saved_session_activities
    set user_id = '7e000000-0000-4000-8000-000000000002'$$,
  '42501', 'A saved session owner cannot be reassigned.',
  'the owner of a saved activity is immutable'
);

-- Deleting removes the record permanently ------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"7e000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select is(
  (select result from public.apply_saved_session_change(
    'delete',
    (select id from public.saved_sessions where name = 'Tuesday tempo (v2)'),
    1, null, null, null, null, null, null, null
  )),
  'deleted',
  'the owner deletes the library entry'
);
select is(
  (select count(*)::bigint from public.saved_sessions), 0::bigint,
  'a deleted library entry leaves no row, no archive and no tombstone'
);
select is(
  (select count(*)::bigint from public.saved_session_activities), 0::bigint,
  'its activities go with it'
);
select ok(
  (select count(*) = 10 from public.rolling_plan_sessions
   where user_id = '7e000000-0000-4000-8000-000000000001' and status = 'active'),
  'deleting the library entry changes no planned session made from it'
);
select is(
  (select count(*)::bigint from public.rolling_plan_activities
   where session_id in (
     '7e000000-0000-4000-8000-0000000000e1',
     '7e000000-0000-4000-8000-0000000000e2')),
  0::bigint,
  'the filler sessions never carried activities'
);

select * from finish();
rollback;
