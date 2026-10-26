-- Deleting an account (ADR-039, owner 23 Oct 2026).
--
-- Proved here: the function's boundary (who may call it, as whom, with what);
-- that it refuses without a caller and without the word DELETE, deleting
-- nothing; and that for an owner with rows on the protective links of ADR-031
-- (a replaced log of a planned session, plan and series activities from the
-- library, a goal with its history, memory with a revision chain, a proposal
-- decision naming a change set) it leaves no row with their id in any public
-- table and no sign-in, while another owner with the same data keeps all of it.
--
-- The count is taken over every public table with a user_id column, so a new
-- owned table that a delete would leave behind, or that blocks the delete,
-- fails here.

begin;

create extension if not exists pgtap with schema extensions;

create function pg_temp.today()
returns date
language sql
stable
as $$
  select (clock_timestamp() at time zone 'utc')::date
$$;

create function pg_temp.rev(p_user_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select plan.revision from public.rolling_plans plan where plan.user_id = p_user_id),
    0::bigint
  )
$$;

-- Every row with this owner's id, across every public table that has one.
create function pg_temp.rows_of(p_user_id uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_table record;
  v_count bigint;
  v_total bigint := 0;
begin
  for v_table in
    select c.relname
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace s on s.oid = c.relnamespace
    join pg_catalog.pg_attribute a on a.attrelid = c.oid
    where s.nspname = 'public' and c.relkind = 'r' and a.attname = 'user_id'
  loop
    execute pg_catalog.format(
      'select count(*) from public.%I where user_id = $1', v_table.relname)
      into v_count using p_user_id;
    v_total := v_total + v_count;
  end loop;
  return v_total;
end;
$$;

create function pg_temp.act_as(p_user_id uuid)
returns void
language sql
as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_user_id, 'role', 'authenticated')::text, true)
$$;

create temporary table seeded (
  label text primary key,
  user_id uuid,
  change_set_id uuid,
  plan_revision bigint,
  proposal_id uuid
);
create temporary table claim (
  label text primary key,
  generation_id uuid,
  completion_token uuid,
  state text,
  proposal_id uuid
);
grant all on seeded, claim to public;

select plan(14);

-- The boundary --------------------------------------------------------------------

select ok(
  has_function_privilege('authenticated', 'public.delete_my_account(text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.delete_my_account(text)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.delete_my_account(text)', 'EXECUTE')
  and not has_function_privilege('public', 'public.delete_my_account(text)', 'EXECUTE'),
  'only a signed-in user may call it'
);
select ok(
  (select prosecdef and proconfig @> array['search_path=""']
   from pg_proc where oid = 'public.delete_my_account(text)'::regprocedure),
  'it runs as its owner with an empty search path'
);
select is(
  pg_get_function_identity_arguments('public.delete_my_account(text)'::regprocedure),
  'p_confirmation text',
  'and takes no user: the owner is the caller'
);

-- Two owners with the same data -----------------------------------------------------

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('7f390000-0000-4000-8000-0000000000a1', 'leaving@example.test', '{}', '{}'),
  ('7f390000-0000-4000-8000-0000000000b1', 'staying@example.test', '{}', '{}');
insert into public.profiles (user_id, timezone_name)
values
  ('7f390000-0000-4000-8000-0000000000a1', 'UTC'),
  ('7f390000-0000-4000-8000-0000000000b1', 'UTC');

-- Seeds one owner. p is a hex digit that keeps each owner's ids apart.
create function pg_temp.seed(p_user_id uuid, p text)
returns void
language plpgsql
as $$
declare
  v_library uuid := ('7f390000-0000-4000-8000-0000000' || p || '0001')::uuid;
  v_session uuid := ('7f390000-0000-4000-8000-0000000' || p || '0002')::uuid;
  v_series uuid := ('7f390000-0000-4000-8000-0000000' || p || '0003')::uuid;
  v_goal uuid := ('7f390000-0000-4000-8000-0000000' || p || '0004')::uuid;
  v_item uuid := ('7f390000-0000-4000-8000-0000000' || p || '0005')::uuid;
  v_rev1 uuid := ('7f390000-0000-4000-8000-0000000' || p || '0006')::uuid;
  v_rev2 uuid := ('7f390000-0000-4000-8000-0000000' || p || '0007')::uuid;
  v_activity jsonb;
  v_receipt record;
begin
  -- Rows written as the database, where no owner flow is needed to prove the
  -- link: a library activity, a goal with history, memory with a revision chain.
  insert into public.personal_activities (id, user_id, name, sport, measurement_mode)
  values (v_library, p_user_id, 'Squat', 'Strength', 'unmeasured');
  insert into public.goals (id, user_id, title, desired_outcome, priority_tier, status, active_rank)
  values (v_goal, p_user_id, 'Run 10 km', 'Comfortably', 'supporting', 'active', 1);
  insert into public.goal_lifecycle_events (user_id, goal_id, from_status, to_status, collection_revision)
  values (p_user_id, v_goal, 'abandoned', 'active', 1);
  set constraints public.memory_items_current_revision_fkey,
    public.memory_revisions_previous_fkey deferred;
  insert into public.memory_items (id, user_id, memory_type, status, provenance, current_revision_id)
  values (v_item, p_user_id, 'profile_fact', 'active', 'user_created', v_rev2);
  insert into public.memory_revisions (id, user_id, item_id, revision_number, content,
    author_class, provenance, change_kind, status_after, previous_revision_id)
  values
    (v_rev1, p_user_id, v_item, 1, 'Left knee was sore', 'user', 'user_created', 'created', 'active', null),
    (v_rev2, p_user_id, v_item, 2, 'Left knee is fine again', 'user', 'user_created', 'edited', 'active', v_rev1);

  -- Rows written as the owner, through the functions the app calls.
  perform pg_temp.act_as(p_user_id);
  set local role authenticated;
  v_activity := jsonb_build_array(jsonb_build_object(
    'position', 0, 'name', 'Squat', 'sport', 'Strength',
    'personalActivityId', v_library, 'measurementMode', 'unmeasured'));
  select * into v_receipt from public.apply_rolling_plan_change_set(
    pg_temp.rev(p_user_id), gen_random_uuid(), 'owner_manual',
    jsonb_build_array(
      jsonb_build_object('operation', 'add', 'sessionId', v_session,
        'session', jsonb_build_object('localDate', pg_temp.today()::text,
          'position', 0, 'title', 'Legs', 'sport', 'Strength',
          'activities', v_activity)),
      jsonb_build_object('operation', 'add_series', 'seriesId', v_series,
        'series', jsonb_build_object('frequency', 'daily', 'intervalCount', 1,
          'startDate', (pg_temp.today() + 2)::text,
          'endDate', (pg_temp.today() + 3)::text,
          'title', 'Legs again', 'sport', 'Strength',
          'activities', v_activity))));
  insert into seeded (label, user_id, change_set_id, plan_revision)
  values (p, p_user_id, v_receipt.change_set_id, v_receipt.plan_revision);

  -- A planned session replaced by unplanned training: two logs, one pointing
  -- at the other, and the planned one naming its session.
  perform public.apply_completion_change('create', null, null,
    jsonb_build_object('planSessionId', v_session, 'status', 'replaced',
      'actualLocalDate', pg_temp.today()::text, 'activities', '[]'::jsonb,
      'replacement', jsonb_build_object('title', 'Hill ride', 'sport', 'Cycling',
        'durationMinutes', 70, 'activities', '[]'::jsonb)));

  -- A coach proposal, recorded and then decided.
  insert into claim
  select p, * from public.begin_plan_generation(
    'delete-account-key-000000' || p, 'delete-account-fp-00000' || p,
    pg_temp.today(), 3, pg_temp.rev(p_user_id), null, null, null, array[]::uuid[]);
  update seeded set proposal_id = (
    select proposal_id from public.finish_plan_generation(
      (select completion_token from claim where label = p),
      'proposal', 'fittip.seven-day-plan.v2', 'seven-day-plan-v2-2026-08-12',
      'fixture', 'fixture-corpus-v1', 'fixture-no-spend', null, null,
      jsonb_build_object('schemaVersion', 'fittip.seven-day-plan.v2',
        'weekDescription', 'Nothing to add this time.',
        'startDate', pg_temp.today()::text,
        'endDate', (pg_temp.today() + 2)::text,
        'sessions', '[]'::jsonb),
      null, null, null))
  where label = p;
  reset role;

  -- Its decision names the owner's change set, the restrict link to cover.
  insert into public.plan_proposal_decisions
    (proposal_id, user_id, decision, applied_count, change_set_id, plan_revision)
  select proposal_id, user_id, 'applied', 1, change_set_id, plan_revision
  from seeded where label = p;
end;
$$;

select pg_temp.seed('7f390000-0000-4000-8000-0000000000a1', 'a');
select pg_temp.seed('7f390000-0000-4000-8000-0000000000b1', 'b');

select ok(
  (select count(*) = 2 from public.completions
   where user_id = '7f390000-0000-4000-8000-0000000000a1'
     and (replaced_by_completion_id is not null or status = 'unplanned'))
  and exists (select 1 from public.rolling_plan_activities
    where user_id = '7f390000-0000-4000-8000-0000000000a1' and personal_activity_id is not null)
  and exists (select 1 from public.rolling_plan_series_activities
    where user_id = '7f390000-0000-4000-8000-0000000000a1' and personal_activity_id is not null)
  and exists (select 1 from public.goal_lifecycle_events
    where user_id = '7f390000-0000-4000-8000-0000000000a1')
  and exists (select 1 from public.memory_revisions
    where user_id = '7f390000-0000-4000-8000-0000000000a1' and previous_revision_id is not null)
  and exists (select 1 from public.plan_proposal_decisions
    where user_id = '7f390000-0000-4000-8000-0000000000a1' and change_set_id is not null),
  'the leaving owner holds a row on each protective link'
);

create temporary table counted as
select pg_temp.rows_of('7f390000-0000-4000-8000-0000000000b1') as staying;
grant all on counted to public;

-- Refusals --------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok(
  $$select public.delete_my_account('DELETE')$$,
  '42501', 'An authenticated FitTip user is required.',
  'without a caller nothing is deleted'
);

select pg_temp.act_as('7f390000-0000-4000-8000-0000000000a1');
select throws_ok(
  $$select public.delete_my_account('delete')$$,
  '22023', 'Type DELETE to delete your account.',
  'the word must be DELETE exactly'
);
select throws_ok(
  $$select public.delete_my_account(null)$$,
  '22023', 'Type DELETE to delete your account.',
  'and must be given'
);
reset role;
select ok(
  pg_temp.rows_of('7f390000-0000-4000-8000-0000000000a1') > 0
  and exists (select 1 from auth.users where id = '7f390000-0000-4000-8000-0000000000a1'),
  'a refused call deleted nothing'
);

-- Deleting ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('7f390000-0000-4000-8000-0000000000a1');
select lives_ok(
  $$select public.delete_my_account('DELETE')$$,
  'the owner deletes their account'
);
reset role;

select is(
  pg_temp.rows_of('7f390000-0000-4000-8000-0000000000a1'), 0::bigint,
  'no public table holds a row of theirs'
);
select is(
  (select count(*) from auth.users where id = '7f390000-0000-4000-8000-0000000000a1'),
  0::bigint,
  'their sign-in is gone'
);
select is(
  (select count(*) from public.profiles where user_id = '7f390000-0000-4000-8000-0000000000a1'),
  0::bigint,
  'and their profile'
);
select is(
  pg_temp.rows_of('7f390000-0000-4000-8000-0000000000b1'),
  (select staying from counted),
  'another owner keeps every row'
);

-- The protective links still stop every other path.
select throws_ok(
  $$delete from public.goals where user_id = '7f390000-0000-4000-8000-0000000000b1'$$,
  '23503', null,
  'a goal with history still cannot be removed on its own'
);

select * from finish();
rollback;
