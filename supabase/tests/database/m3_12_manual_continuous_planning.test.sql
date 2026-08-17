-- M3-12: the durable owner time zone, Recovery day labels, and the two rules
-- M3-10 left out. Dates here follow the wall clock on purpose: the past
-- boundary is defined against owner-local today, so a fixed literal would test
-- something else. `pg_temp.owner_day` freezes the reference to the
-- transaction timestamp so a run spanning UTC midnight stays consistent.

begin;

create extension if not exists pgtap with schema extensions;

create function pg_temp.owner_day(p_offset integer)
returns text
language sql
stable
as $$ select ((timezone('UTC', now()))::date + p_offset)::text $$;

select plan(57);

-- Structure, privileges, and policies --------------------------------------

select has_column('public', 'profiles', 'timezone_name', 'the profile carries the owner time zone');
select col_type_is('public', 'profiles', 'timezone_name', 'text', 'the stored zone is a text IANA name');
select ok(
  (select not attnotnull from pg_attribute
   where attrelid = 'public.profiles'::regclass and attname = 'timezone_name'),
  'a profile may exist before its owner has confirmed a zone'
);
select ok(
  (select count(*) = 1 from pg_constraint
   where conrelid = 'public.profiles'::regclass
     and conname = 'profiles_timezone_name_check'),
  'the stored zone is constrained at the column'
);
select ok(
  has_column_privilege('authenticated', 'public.profiles', 'timezone_name', 'UPDATE'),
  'an owner may write their own zone'
);
select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'user_id', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.profiles', 'created_at', 'UPDATE'),
  'the update grant reaches no other profile column'
);
select ok(
  not has_column_privilege('anon', 'public.profiles', 'timezone_name', 'UPDATE'),
  'anonymous callers cannot write a zone'
);
select ok(
  has_function_privilege('authenticated', 'public.is_iana_timezone_name(text)', 'EXECUTE'),
  'the writing role can evaluate the zone constraint'
);
select ok(
  not has_function_privilege('anon', 'public.is_iana_timezone_name(text)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.is_iana_timezone_name(text)', 'EXECUTE'),
  'no other role holds the zone validator'
);

select has_table('public', 'rolling_plan_recovery_days', 'recovery day labels are persisted');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.rolling_plan_recovery_days'::regclass),
  'RLS is enabled on recovery day labels'
);
select col_not_null('public', 'rolling_plan_recovery_days', 'user_id', 'every label has a required owner');
select ok(
  has_table_privilege('authenticated', 'public.rolling_plan_recovery_days', 'SELECT')
  and not has_table_privilege('authenticated', 'public.rolling_plan_recovery_days', 'INSERT')
  and not has_table_privilege('authenticated', 'public.rolling_plan_recovery_days', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.rolling_plan_recovery_days', 'DELETE'),
  'owners read labels directly but can only write them through the change set'
);
select ok(
  not has_table_privilege('anon', 'public.rolling_plan_recovery_days', 'SELECT'),
  'anonymous callers have no label privilege'
);
select is(
  (select count(*)::bigint from pg_policies
   where schemaname = 'public' and tablename = 'rolling_plan_recovery_days'),
  1::bigint,
  'labels carry exactly one owner select policy and no mutation policy'
);
select ok(
  (select count(*) = 1 from pg_constraint
   where conrelid = 'public.rolling_plan_recovery_days'::regclass
     and conname = 'rolling_plan_recovery_days_owner_date_key'
     and contype = 'u'),
  'one label per owner-date, indexed by owner and date'
);
select ok(
  (select count(*) = 1 from pg_constraint
   where conrelid = 'public.rolling_plan_recovery_days'::regclass
     and conname = 'rolling_plan_recovery_days_plan_fkey'
     and contype = 'f'),
  'a label belongs to the same owner plan'
);
select ok(
  (select count(*) = 1 from pg_trigger
   where tgrelid = 'public.rolling_plan_recovery_days'::regclass
     and tgname = 'rolling_plan_recovery_days_owner_immutable'
     and not tgisinternal),
  'a label owner cannot be reassigned'
);

select has_column('public', 'rolling_plan_change_entries', 'local_date', 'history can target a date instead of a session');
select ok(
  (select not attnotnull from pg_attribute
   where attrelid = 'public.rolling_plan_change_entries'::regclass and attname = 'session_id'),
  'a date-targeted entry carries no session identity'
);
select ok(
  (select count(*) = 1 from pg_constraint
   where conrelid = 'public.rolling_plan_change_entries'::regclass
     and conname = 'rolling_plan_change_entries_target_check'),
  'each entry targets exactly one of a session or a date'
);
select ok(
  (select pg_get_constraintdef(oid) like '%set_recovery_day%' from pg_constraint
   where conrelid = 'public.rolling_plan_change_entries'::regclass
     and conname = 'rolling_plan_change_entries_kind_check'),
  'recovery day changes are a recorded change kind'
);
select ok(
  (select count(*) = 1 from pg_attribute
   where attrelid = (select typrelid from pg_type where oid = 'public.rolling_plan_slice_receipt'::regtype)
     and attname = 'recovery_dates' and not attisdropped),
  'one bounded read carries the labels beside the sessions'
);

-- Owner behavior ------------------------------------------------------------

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('7c000000-0000-4000-8000-000000000001', 'plan-owner@example.test', '{}', '{}'),
  ('7c000000-0000-4000-8000-000000000002', 'plan-outsider@example.test', '{}', '{}');
insert into public.profiles (user_id) values
  ('7c000000-0000-4000-8000-000000000001'),
  ('7c000000-0000-4000-8000-000000000002');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"7c000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select throws_ok(
  format(
    $$select public.apply_rolling_plan_change_set(
      0, '7c000000-0000-4000-8000-000000000101', 'owner_manual',
      '[{"operation":"add","sessionId":"7c000000-0000-4000-8000-000000000011","session":{"localDate":"%s","position":0,"title":"Aerobic run","sport":"Running","isLocked":false,"activities":[]}}]'::jsonb
    )$$,
    pg_temp.owner_day(1)
  ),
  'PT428', 'Confirm your time zone before changing your plan.',
  'without a stored zone the owner is told what to fix, not what failed'
);
select is(
  (select count(*)::bigint from public.rolling_plans), 0::bigint,
  'a refused change over a missing zone materializes no plan'
);

select throws_ok(
  $$update public.profiles set timezone_name = 'Nowhere/Imaginary'
    where user_id = '7c000000-0000-4000-8000-000000000001'$$,
  '23514',
  'new row for relation "profiles" violates check constraint "profiles_timezone_name_check"',
  'an invented zone name is refused'
);
select throws_ok(
  $$update public.profiles set created_at = now()
    where user_id = '7c000000-0000-4000-8000-000000000001'$$,
  '42501', 'permission denied for table profiles',
  'the zone grant opens no other profile column'
);
select lives_ok(
  $$update public.profiles set timezone_name = 'UTC'
    where user_id = '7c000000-0000-4000-8000-000000000001'$$,
  'the owner confirms a real IANA zone'
);
-- The write is confined by RLS rather than refused, so it matches no row. The
-- PT428 assertion at the end of this file proves the other owner still has no
-- stored zone afterwards.
select lives_ok(
  $$update public.profiles set timezone_name = 'Pacific/Auckland'
    where user_id = '7c000000-0000-4000-8000-000000000002'$$,
  'an owner-scoped zone write reaches no other owner row'
);
select is(
  (select count(*)::bigint from public.profiles
   where user_id = '7c000000-0000-4000-8000-000000000002'),
  0::bigint,
  'RLS hides the other owner profile from the attempt entirely'
);

select throws_ok(
  format(
    $$select public.apply_rolling_plan_change_set(
      0, '7c000000-0000-4000-8000-000000000102', 'owner_manual',
      '[{"operation":"add","sessionId":"7c000000-0000-4000-8000-000000000012","session":{"localDate":"%s","position":0,"title":"Yesterday","sport":"Running","isLocked":false,"activities":[]}}]'::jsonb
    )$$,
    pg_temp.owner_day(-1)
  ),
  'PT422', 'A plan change cannot target a date before today.',
  'a session cannot be added to a past date'
);
select throws_ok(
  format(
    $$select public.apply_rolling_plan_change_set(
      0, '7c000000-0000-4000-8000-000000000103', 'owner_manual',
      '[{"operation":"set_recovery_day","localDate":"%s","isRecoveryDay":true}]'::jsonb
    )$$,
    pg_temp.owner_day(-1)
  ),
  'PT422', 'A plan change cannot target a date before today.',
  'a label cannot be attached to a past date'
);

select lives_ok(
  format(
    $$select public.apply_rolling_plan_change_set(
      0, '7c000000-0000-4000-8000-000000000104', 'owner_manual',
      '[{"operation":"add","sessionId":"7c000000-0000-4000-8000-000000000013","session":{"localDate":"%s","position":0,"title":"Aerobic run","sport":"Running","isLocked":false,"activities":[]}},{"operation":"set_recovery_day","localDate":"%s","isRecoveryDay":true}]'::jsonb
    )$$,
    pg_temp.owner_day(0), pg_temp.owner_day(2)
  ),
  'owner-local today accepts a session, and a later date accepts a label'
);
select is(
  (select revision from public.rolling_plans), 1::bigint,
  'a session and a label advance exactly one revision together'
);
select is(
  (select local_date::text from public.rolling_plan_recovery_days),
  pg_temp.owner_day(2),
  'the label is directly readable by its owner'
);
select ok(
  (select session_id is null and local_date::text = pg_temp.owner_day(2)
     and before_state->>'isRecoveryDay' = 'false'
     and after_state->>'isRecoveryDay' = 'true'
   from public.rolling_plan_change_entries where change_kind = 'set_recovery_day'),
  'a label change records its date and its before-after state'
);
select ok(
  (
    select recovery_dates = format('["%s"]', pg_temp.owner_day(2))::jsonb
    from public.get_rolling_plan_slice(
      pg_temp.owner_day(0)::date, pg_temp.owner_day(30)::date
    )
  ),
  'the bounded read returns the labels inside its own window'
);
select ok(
  (
    select recovery_dates = '[]'::jsonb
    from public.get_rolling_plan_slice(
      pg_temp.owner_day(10)::date, pg_temp.owner_day(30)::date
    )
  ),
  'a label outside the window is not returned'
);

select throws_ok(
  format(
    $$select public.apply_rolling_plan_change_set(
      1, '7c000000-0000-4000-8000-000000000105', 'owner_manual',
      '[{"operation":"set_recovery_day","localDate":"%s","isRecoveryDay":true}]'::jsonb
    )$$,
    pg_temp.owner_day(2)
  ),
  '22023', 'A plan change must change current state.',
  'relabeling an already labeled date is not a change'
);
select lives_ok(
  format(
    $$select public.apply_rolling_plan_change_set(
      1, '7c000000-0000-4000-8000-000000000106', 'owner_manual',
      '[{"operation":"set_recovery_day","localDate":"%s","isRecoveryDay":false}]'::jsonb
    )$$,
    pg_temp.owner_day(2)
  ),
  'the owner clears the label again'
);
select is(
  (select count(*)::bigint from public.rolling_plan_recovery_days), 0::bigint,
  'a cleared label leaves no row'
);
select is(
  (select count(*)::bigint from public.rolling_plan_change_entries
   where change_kind = 'set_recovery_day'), 2::bigint,
  'setting and clearing are both recorded'
);

-- The per-date cap ----------------------------------------------------------

select lives_ok(
  format(
    $$select public.apply_rolling_plan_change_set(
      2, '7c000000-0000-4000-8000-000000000107', 'owner_manual',
      (select jsonb_agg(jsonb_build_object(
        'operation', 'add',
        'sessionId', ('7c000000-0000-4000-8000-00000000002' || n)::uuid,
        'session', jsonb_build_object(
          'localDate', '%s', 'position', n + 1, 'title', 'Session ' || n,
          'sport', 'Running', 'isLocked', false, 'activities', '[]'::jsonb
        )
      )) from generate_series(0, 8) n)
    )$$,
    pg_temp.owner_day(0)
  ),
  'ten active sessions on one date are accepted'
);
select is(
  (select count(*)::bigint from public.rolling_plan_sessions
   where status = 'active' and local_date::text = pg_temp.owner_day(0)),
  10::bigint,
  'the date holds exactly ten'
);
select throws_ok(
  format(
    $$select public.apply_rolling_plan_change_set(
      3, '7c000000-0000-4000-8000-000000000108', 'owner_manual',
      '[{"operation":"add","sessionId":"7c000000-0000-4000-8000-000000000031","session":{"localDate":"%s","position":11,"title":"Eleventh","sport":"Running","isLocked":false,"activities":[]}}]'::jsonb
    )$$,
    pg_temp.owner_day(0)
  ),
  'PT423', 'A date holds at most ten planned sessions.',
  'an eleventh session on one date is refused'
);
select is(
  (select revision from public.rolling_plans), 3::bigint,
  'a refused cap change advances no revision'
);
select lives_ok(
  format(
    $$select public.apply_rolling_plan_change_set(
      3, '7c000000-0000-4000-8000-000000000109', 'owner_manual',
      '[{"operation":"cancel","sessionId":"7c000000-0000-4000-8000-000000000020"},{"operation":"add","sessionId":"7c000000-0000-4000-8000-000000000031","session":{"localDate":"%s","position":11,"title":"Eleventh","sport":"Running","isLocked":false,"activities":[]}}]'::jsonb
    )$$,
    pg_temp.owner_day(0)
  ),
  'the cap judges the state the whole change set leaves behind'
);
select lives_ok(
  format(
    $$select public.apply_rolling_plan_change_set(
      4, '7c000000-0000-4000-8000-00000000010a', 'owner_manual',
      '[{"operation":"set_recovery_day","localDate":"%s","isRecoveryDay":true}]'::jsonb
    )$$,
    pg_temp.owner_day(0)
  ),
  'a label never counts toward the per-date cap'
);

-- A past session stays history ---------------------------------------------

reset role;
insert into public.rolling_plan_sessions (
  id, user_id, plan_id, local_date, position, title, sport
) select
  '7c000000-0000-4000-8000-0000000000f1', plan.user_id, plan.id,
  (pg_temp.owner_day(-3))::date, 0, 'Last week', 'Running'
from public.rolling_plans plan
where plan.user_id = '7c000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"7c000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select throws_ok(
  $$select public.apply_rolling_plan_change_set(
    5, '7c000000-0000-4000-8000-00000000010b', 'owner_manual',
    '[{"operation":"cancel","sessionId":"7c000000-0000-4000-8000-0000000000f1"}]'::jsonb
  )$$,
  'PT422', 'A plan change cannot target a date before today.',
  'a past session cannot be cancelled'
);
select throws_ok(
  format(
    $$select public.apply_rolling_plan_change_set(
      5, '7c000000-0000-4000-8000-00000000010c', 'owner_manual',
      '[{"operation":"move","sessionId":"7c000000-0000-4000-8000-0000000000f1","localDate":"%s","position":0}]'::jsonb
    )$$,
    pg_temp.owner_day(1)
  ),
  'PT422', 'A plan change cannot target a date before today.',
  'a past session cannot be moved into the future'
);
select throws_ok(
  format(
    $$select public.apply_rolling_plan_change_set(
      5, '7c000000-0000-4000-8000-00000000010d', 'owner_manual',
      '[{"operation":"move","sessionId":"7c000000-0000-4000-8000-000000000013","localDate":"%s","position":0}]'::jsonb
    )$$,
    pg_temp.owner_day(-1)
  ),
  'PT422', 'A plan change cannot target a date before today.',
  'a future session cannot be moved into the past'
);
select throws_ok(
  $$insert into public.rolling_plan_recovery_days (user_id, plan_id, local_date)
    select plan.user_id, plan.id, current_date from public.rolling_plans plan$$,
  '42501', 'permission denied for table rolling_plan_recovery_days',
  'direct authenticated label insertion is denied'
);

-- Another owner and anonymous callers ---------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"7c000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select is(
  (select count(*)::bigint from public.rolling_plan_recovery_days), 0::bigint,
  'RLS hides another owner labels'
);
select ok(
  (
    select recovery_dates = '[]'::jsonb
    from public.get_rolling_plan_slice(
      pg_temp.owner_day(-30)::date, pg_temp.owner_day(30)::date
    )
  ),
  'the bounded read exposes no other-owner label'
);
select throws_ok(
  format(
    $$select public.apply_rolling_plan_change_set(
      0, '7c000000-0000-4000-8000-000000000201', 'owner_manual',
      '[{"operation":"set_recovery_day","localDate":"%s","isRecoveryDay":true}]'::jsonb
    )$$,
    pg_temp.owner_day(1)
  ),
  'PT428', 'Confirm your time zone before changing your plan.',
  'another owner is held to the same zone requirement'
);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$select count(*) from public.rolling_plan_recovery_days$$,
  '42501', 'permission denied for table rolling_plan_recovery_days',
  'anonymous label reads are denied'
);

-- The owner column cannot be reassigned even from a privileged path ---------

reset role;
select throws_ok(
  $$update public.rolling_plan_recovery_days
    set user_id = '7c000000-0000-4000-8000-000000000002'$$,
  '42501', 'A recovery day owner cannot be reassigned.',
  'the owner of a label is immutable'
);

select * from finish();
rollback;
