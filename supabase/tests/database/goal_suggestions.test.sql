-- The coach suggests a goal (ADR-034).
--
--   1. The table is the owner's to read and nobody's to write directly.
--   2. A suggestion is recorded only against a proposal with a planning note,
--      once, with a goal's bounds; a replay returns the same row.
--   3. Accept creates the goal through apply_goal_change, in the chosen tier,
--      and the three-core rule refuses a fourth core goal; Reject marks it.
--   4. Another owner can neither read nor decide it.
--   5. The per-request spend ceiling is 9,000.

begin;

create extension if not exists pgtap with schema extensions;

create function pg_temp.day(p_offset integer)
returns date
language sql
stable
as $$
  select ((clock_timestamp() at time zone 'utc')::date + p_offset)
$$;

create function pg_temp.plan_body(p_start date, p_end date)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'schemaVersion', 'fittip.seven-day-plan.v2',
    'weekDescription', 'Your week already holds what it should.',
    'startDate', p_start::text,
    'endDate', p_end::text,
    'sessions', '[]'::jsonb
  )
$$;

create temporary table pg_temp_claim (
  label text primary key,
  generation_id uuid,
  completion_token uuid,
  state text,
  proposal_id uuid
);
create temporary table pg_temp_decided (
  label text primary key,
  suggestion_id uuid,
  status text,
  goal_id uuid,
  goal_collection_revision bigint
);
create temporary table pg_temp_goal (
  label text primary key,
  goal_id uuid,
  collection_revision bigint,
  result text
);
grant all on pg_temp_claim, pg_temp_decided, pg_temp_goal to public;

create function pg_temp.finish(p_label text, p_note text)
returns uuid
language sql
as $$
  select proposal_id from public.finish_plan_generation(
    (select completion_token from pg_temp_claim where label = p_label),
    'proposal', 'fittip.seven-day-plan.v2', 'seven-day-plan-v2-2026-08-12',
    'fixture', 'fixture-corpus-v1', 'fixture-no-spend', null,
    p_note, pg_temp.plan_body(pg_temp.day(0), pg_temp.day(2)), null, null, null
  )
$$;

create function pg_temp.goal_revision(p_user_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select revision from public.goal_collections where user_id = p_user_id),
    0::bigint
  )
$$;

create function pg_temp.suggestion(p_title text, p_sports jsonb, p_target text)
returns jsonb
language sql
immutable
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'title', p_title,
    'desiredOutcome', 'Run 5 km without stopping, twice a week.',
    'sports', p_sports,
    'targetDate', p_target
  ))
$$;

select plan(21);

-- 1. The boundary -------------------------------------------------------------

select has_table('public', 'goal_suggestions', 'goal suggestions have a table');
select ok(
  (select relrowsecurity from pg_class
   where oid = 'public.goal_suggestions'::regclass),
  'with row level security on'
);
select ok(
  has_table_privilege('authenticated', 'public.goal_suggestions', 'SELECT')
  and not has_table_privilege('authenticated', 'public.goal_suggestions', 'INSERT')
  and not has_table_privilege('authenticated', 'public.goal_suggestions', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.goal_suggestions', 'DELETE')
  and not has_table_privilege('anon', 'public.goal_suggestions', 'SELECT'),
  'an owner may read them; nobody writes one directly'
);
select ok(
  has_function_privilege('authenticated',
    'public.record_goal_suggestion(text,uuid,jsonb)', 'EXECUTE')
  and has_function_privilege('authenticated',
    'public.decide_goal_suggestion(uuid,text,text,bigint)', 'EXECUTE')
  and not has_function_privilege('anon',
    'public.decide_goal_suggestion(uuid,text,text,bigint)', 'EXECUTE')
  and not has_function_privilege('authenticated',
    'public.goal_suggestion_fields_are_valid(jsonb,date)', 'EXECUTE'),
  'the owner records and decides through the two functions; the field check is internal'
);

-- Owners ---------------------------------------------------------------------

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('8c000000-0000-4000-8000-000000000001', 'goal-owner@example.test', '{}', '{}'),
  ('8c000000-0000-4000-8000-000000000002', 'goal-outsider@example.test', '{}', '{}');
insert into public.profiles (user_id, timezone_name)
select id, 'UTC' from auth.users
where id in (
  '8c000000-0000-4000-8000-000000000001',
  '8c000000-0000-4000-8000-000000000002'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"8c000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- A proposal with a planning note, and one without.
insert into pg_temp_claim
select 'noted', * from public.begin_plan_generation(
  'goal-key-00000000000001', 'goal-fingerprint-000001', pg_temp.day(0), 3, 0,
  'I want to run 5 km twice a week by January.', null, null, null);
select pg_temp.finish('noted', 'I want to run 5 km twice a week by January.');

insert into pg_temp_claim
select 'bare', * from public.begin_plan_generation(
  'goal-key-00000000000002', 'goal-fingerprint-000002', pg_temp.day(0), 3, 0,
  null, null, null, null);
select pg_temp.finish('bare', null);

-- 2. Recording ----------------------------------------------------------------

select throws_ok(
  format($q$select public.record_goal_suggestion('plan', %L::uuid, %L::jsonb)$q$,
    (select completion_token from pg_temp_claim where label = 'bare'),
    pg_temp.suggestion('Run 5 km', '["Running"]', null)),
  '22023', 'Invalid goal suggestion.',
  'a proposal without a planning note gets no suggestion'
);
select throws_ok(
  format($q$select public.record_goal_suggestion('plan', %L::uuid, %L::jsonb)$q$,
    (select completion_token from pg_temp_claim where label = 'noted'),
    pg_temp.suggestion('Run 5 km', '[]', null)),
  '22023', 'Invalid goal suggestion.',
  'a suggestion with no sport is refused, as a goal with none would be'
);
select throws_ok(
  format($q$select public.record_goal_suggestion('plan', %L::uuid, %L::jsonb)$q$,
    (select completion_token from pg_temp_claim where label = 'noted'),
    pg_temp.suggestion('Run 5 km', '["Running"]', pg_temp.day(-1)::text)),
  '22023', 'Invalid goal suggestion.',
  'and so is a target date already behind today'
);
select throws_ok(
  format($q$select public.record_goal_suggestion('plan', %L::uuid, %L::jsonb)$q$,
    (select completion_token from pg_temp_claim where label = 'noted'),
    pg_temp.suggestion('Run 5 km', '["Running"]', null)
      || '{"priorityTier":"core"}'::jsonb),
  '22023', 'Invalid goal suggestion.',
  'a suggestion carries no tier: the owner chooses one'
);
select throws_ok(
  format($q$select public.record_goal_suggestion('roadmap', %L::uuid, %L::jsonb)$q$,
    (select completion_token from pg_temp_claim where label = 'noted'),
    pg_temp.suggestion('Run 5 km', '["Running"]', null)),
  'PT409', 'That coaching request is no longer open.',
  'a plan token does not open a roadmap'
);

select throws_ok(
  format($q$select public.record_goal_suggestion('plan', %L::uuid, %L::jsonb)$q$,
    (select completion_token from pg_temp_claim where label = 'noted'),
    pg_temp.suggestion('Run 5 km', '["Running", " running "]', null)),
  '22023', 'Invalid goal suggestion.',
  'and so is one sport named twice, as a goal refuses it'
);

create temporary table pg_temp_suggestion (label text primary key, id uuid);
grant all on pg_temp_suggestion to public;

insert into pg_temp_suggestion
select 'first', public.record_goal_suggestion('plan',
  (select completion_token from pg_temp_claim where label = 'noted'),
  pg_temp.suggestion('  Run 5 km twice a week  ', '["Running", "Cycling"]',
    pg_temp.day(80)::text));

select is(
  (select title || '|' || array_to_string(sports, ',') || '|'
          || (target_date = pg_temp.day(80))::text || '|' || status
   from public.goal_suggestions
   where id = (select id from pg_temp_suggestion where label = 'first')),
  'Run 5 km twice a week|Running,Cycling|true|proposed',
  'a suggestion is recorded trimmed, proposed, with its sports and date'
);
select is(
  public.record_goal_suggestion('plan',
    (select completion_token from pg_temp_claim where label = 'noted'),
    pg_temp.suggestion('Something else', '["Yoga"]', null)),
  (select id from pg_temp_suggestion where label = 'first'),
  'a replay returns the row it made; one per proposal'
);

-- 4. Another owner --------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"8c000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is(
  (select count(*)::integer from public.goal_suggestions), 0,
  'another owner reads none'
);
select throws_ok(
  format($q$select public.decide_goal_suggestion(%L::uuid, 'reject')$q$,
    (select id from pg_temp_suggestion where label = 'first')),
  'PT409', 'That suggestion is no longer open.',
  'and decides none'
);
select set_config(
  'request.jwt.claims',
  '{"sub":"8c000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- 3. Deciding -------------------------------------------------------------------

select throws_ok(
  format($q$select public.decide_goal_suggestion(%L::uuid, 'accept')$q$,
    (select id from pg_temp_suggestion where label = 'first')),
  '22023', 'Invalid goal suggestion decision.',
  'Accept needs the tier the owner chose'
);

insert into pg_temp_decided
select 'first', * from public.decide_goal_suggestion(
  (select id from pg_temp_suggestion where label = 'first'), 'accept',
  'supporting', pg_temp.goal_revision('8c000000-0000-4000-8000-000000000001'));

select is(
  (select goal.title || '|' || goal.priority_tier || '|' || goal.status || '|'
          || suggestion.status
   from pg_temp_decided decided
   join public.goals goal on goal.id = decided.goal_id
   join public.goal_suggestions suggestion on suggestion.id = decided.suggestion_id
   where decided.label = 'first'),
  'Run 5 km twice a week|supporting|active|accepted',
  'Accept creates the goal in the chosen tier, through apply_goal_change, and links it'
);
select throws_ok(
  format($q$select public.decide_goal_suggestion(%L::uuid, 'reject')$q$,
    (select id from pg_temp_suggestion where label = 'first')),
  'PT409', 'That suggestion is no longer open.',
  'a decided suggestion is not decided twice'
);

-- Three core goals already, then a suggestion accepted as core.
insert into pg_temp_goal select 'c1', * from public.apply_goal_change(
  pg_temp.goal_revision('8c000000-0000-4000-8000-000000000001'), 'create', null,
  'Core one', 'Outcome.', array['Running'], null, 'core', null, null);
insert into pg_temp_goal select 'c2', * from public.apply_goal_change(
  pg_temp.goal_revision('8c000000-0000-4000-8000-000000000001'), 'create', null,
  'Core two', 'Outcome.', array['Running'], null, 'core', null, null);
insert into pg_temp_goal select 'c3', * from public.apply_goal_change(
  pg_temp.goal_revision('8c000000-0000-4000-8000-000000000001'), 'create', null,
  'Core three', 'Outcome.', array['Running'], null, 'core', null, null);

insert into pg_temp_claim
select 'third', * from public.begin_plan_generation(
  'goal-key-00000000000003', 'goal-fingerprint-000003', pg_temp.day(0), 3, 0,
  'And swim a mile this winter.', null, null, null);
select pg_temp.finish('third', 'And swim a mile this winter.');
insert into pg_temp_suggestion
select 'second', public.record_goal_suggestion('plan',
  (select completion_token from pg_temp_claim where label = 'third'),
  pg_temp.suggestion('Swim a mile', '["Swimming"]', null));

select throws_ok(
  format($q$select public.decide_goal_suggestion(%L::uuid, 'accept', 'core', %s)$q$,
    (select id from pg_temp_suggestion where label = 'second'),
    pg_temp.goal_revision('8c000000-0000-4000-8000-000000000001')),
  'PT409', 'Three core goals are already active.',
  'a fourth core goal is refused by the goal rule, and says so'
);

insert into pg_temp_decided
select 'second', * from public.decide_goal_suggestion(
  (select id from pg_temp_suggestion where label = 'second'), 'reject');
select is(
  (select status || ':' || (goal_id is null)::text || ':' || (decided_at is not null)::text
   from public.goal_suggestions
   where id = (select id from pg_temp_suggestion where label = 'second')),
  'rejected:true:true',
  'Reject marks it and creates nothing'
);

-- A suggestion left open past its target date becomes a goal without one.
insert into pg_temp_claim
select 'fourth', * from public.begin_plan_generation(
  'goal-key-00000000000004', 'goal-fingerprint-000004', pg_temp.day(0), 3, 0,
  'And a 10 km race next month.', null, null, null);
select pg_temp.finish('fourth', 'And a 10 km race next month.');
insert into pg_temp_suggestion
select 'third', public.record_goal_suggestion('plan',
  (select completion_token from pg_temp_claim where label = 'fourth'),
  pg_temp.suggestion('Race 10 km', '["Running"]', pg_temp.day(20)::text));

reset role;
update public.goal_suggestions set target_date = pg_temp.day(-1)
where id = (select id from pg_temp_suggestion where label = 'third');
set local role authenticated;

insert into pg_temp_decided
select 'third', * from public.decide_goal_suggestion(
  (select id from pg_temp_suggestion where label = 'third'), 'accept',
  'supporting', pg_temp.goal_revision('8c000000-0000-4000-8000-000000000001'));
select is(
  (select goal.title || ':' || coalesce(goal.target_date::text, 'none')
   from pg_temp_decided decided
   join public.goals goal on goal.id = decided.goal_id
   where decided.label = 'third'),
  'Race 10 km:none',
  'a target date that passed while it waited is not carried into the goal'
);

-- 5. Spend -----------------------------------------------------------------------

select ok(
  pg_get_functiondef('public.reserve_ai_spend(text,bigint,text,text)'::regprocedure)
    like '%c_per_request_ceiling constant bigint := 9000%',
  'the per-request ceiling is 9,000 micro-USD'
);

select * from finish();
rollback;
