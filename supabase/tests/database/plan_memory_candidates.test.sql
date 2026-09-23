-- Plan proposal memory candidates.
--
-- ADR-010 decision 16 permits this route and names what it must prove: that it
-- creates only `proposed` items carrying system author class and inferred
-- provenance, that it cannot move an item out of `proposed`, that a candidate
-- quoting text absent from the owner's planning note is refused, and that a
-- replayed batch returns the existing items rather than duplicating them. Those
-- four are the spine of this file; the privilege boundary and the owner scoping
-- are asserted alongside them because a definer function is only as narrow as
-- its grants.
--
-- "Cannot move an item out of `proposed`" is proved the only way a function with
-- no operation parameter can be: an item the owner has already accepted is left
-- untouched by a later batch, and every row this route creates is `proposed` on
-- creation and stays that way. There is no code path here that updates a
-- `memory_items` row at all.

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
    'weekDescription', 'Two easy sessions with a planned rest day between them.',
    'startDate', p_start::text,
    'endDate', p_end::text,
    'sessions', jsonb_build_array(
      jsonb_build_object(
        'date', p_start::text,
        'title', 'Easy aerobic session',
        'sport', 'Running',
        'focus', 'Repeatable easy work you could do again tomorrow.',
        'intent', 'Conversational the whole way.',
        'durationMinutes', 45,
        'primaryGoalId', 'goal-1',
        'rationale', 'Most of this horizon stays easy so the work is repeatable.'
      ),
      jsonb_build_object(
        'date', p_end::text,
        'title', 'Steadier session',
        'sport', 'Running',
        'focus', 'A little more effort, still well short of a hard day.',
        'intent', 'Comfortably hard in the middle.',
        'durationMinutes', 50,
        'primaryGoalId', 'goal-1',
        'rationale', 'One slightly firmer day gives the week some shape.'
      )
    )
  )
$$;

select plan(25);

-- The function and its privilege boundary ------------------------------------

select has_function(
  'public', 'record_plan_memory_candidates',
  array['uuid', 'bigint', 'jsonb'],
  'the plan memory candidate route exists'
);

select is(
  (select prosecdef
   from pg_proc
   where oid = 'public.record_plan_memory_candidates(uuid,bigint,jsonb)'::regprocedure),
  true,
  'it is security definer, as ADR-010 decision 16 requires'
);

select is(
  (select proconfig
   from pg_proc
   where oid = 'public.record_plan_memory_candidates(uuid,bigint,jsonb)'::regprocedure),
  array['search_path=""'],
  'it runs with an empty search path, so every object it names is schema-qualified'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.record_plan_memory_candidates(uuid,bigint,jsonb)', 'EXECUTE'
  ),
  'the owner may propose candidates from their own plan generation'
);

select ok(
  not has_function_privilege(
    'anon', 'public.record_plan_memory_candidates(uuid,bigint,jsonb)', 'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.record_plan_memory_candidates(uuid,bigint,jsonb)', 'EXECUTE'
  ),
  'no anonymous or service role holds it, because neither has an owner to be scoped by'
);

-- Owners ---------------------------------------------------------------------

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('7c000000-0000-4000-8000-000000000001', 'plan-memory-owner@example.test', '{}', '{}'),
  ('7c000000-0000-4000-8000-000000000002', 'plan-memory-outsider@example.test', '{}', '{}');
insert into public.profiles (user_id, timezone_name)
select id, 'UTC' from auth.users
where id in (
  '7c000000-0000-4000-8000-000000000001',
  '7c000000-0000-4000-8000-000000000002'
);

set local role authenticated;

-- No subject claim -----------------------------------------------------------

select set_config('request.jwt.claims', '{"role":"authenticated"}', true);

select throws_ok(
  $$select * from public.record_plan_memory_candidates(
    '7c000000-0000-4000-8000-0000000000ff'::uuid, 0,
    '[{"memoryType":"constraint","sourceExcerpt":"anything"}]'::jsonb)$$,
  '42501', 'An authenticated FitTip user is required.',
  'proposing without an owner claim is refused before anything is written'
);

-- The owner's proposal -------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"7c000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

create temporary table pg_temp_claim (
  label text,
  generation_id uuid,
  completion_token uuid,
  state text,
  proposal_id uuid
) on commit drop;

insert into pg_temp_claim
select 'noted', * from public.begin_plan_generation(
  'plan-memory-key-0000000001', 'plan-memory-fingerprint-0001',
  pg_temp.day(0), 3, 0,
  'I only have 45 minutes on weekdays and my left knee complains on hills'
);

select is(
  (select proposal_id is not null from public.finish_plan_generation(
    (select completion_token from pg_temp_claim where label = 'noted'),
    'proposal', 'fittip.seven-day-plan.v2', 'seven-day-plan-v2-2026-08-12',
    'fixture', 'fixture-corpus-v1', 'fixture-no-spend', null,
    'I only have 45 minutes on weekdays and my left knee complains on hills',
    pg_temp.plan_body(pg_temp.day(0), pg_temp.day(2)), null, null
  )),
  true,
  'the generation closes with a proposal the candidates can cite'
);

-- A candidate the coach invented ---------------------------------------------
--
-- This is the limit decision 16 calls non-optional, so it is asserted before the
-- happy path: text that is not in the owner's planning note cannot become a
-- durable claim about them, however confident the coach is.

select throws_ok(
  $$select * from public.record_plan_memory_candidates(
    (select completion_token from pg_temp_claim where label = 'noted'), 0,
    '[{"memoryType":"constraint",
       "sourceExcerpt":"trains best in the early morning",
       "confidence":95}]'::jsonb)$$,
  '22023', 'Invalid memory candidates.',
  'a candidate quoting text absent from the planning note is refused'
);

select is(
  (select count(*)::integer from public.memory_items
   where user_id = '7c000000-0000-4000-8000-000000000001'),
  0,
  'and the refusal wrote nothing'
);

-- A stale collection revision ------------------------------------------------

select throws_ok(
  $$select * from public.record_plan_memory_candidates(
    (select completion_token from pg_temp_claim where label = 'noted'), 7,
    '[{"memoryType":"constraint",
       "sourceExcerpt":"only have 45 minutes on weekdays"}]'::jsonb)$$,
  'PT409', 'Memory changed. Reload and try again.',
  'a caller holding a stale memory revision is told to reload rather than silently merged'
);

-- The batch ------------------------------------------------------------------

create temporary table pg_temp_receipt (
  collection_revision bigint,
  item_ids uuid[]
) on commit drop;

insert into pg_temp_receipt
select * from public.record_plan_memory_candidates(
  (select completion_token from pg_temp_claim where label = 'noted'), 0,
  '[{"memoryType":"constraint",
     "sourceExcerpt":"only have 45 minutes on weekdays",
     "confidence":80},
    {"memoryType":"observed_pattern",
     "sourceExcerpt":"left knee complains on hills"}]'::jsonb
);

select is(
  (select pg_catalog.array_length(item_ids, 1) from pg_temp_receipt),
  2,
  'both candidates quoting the planning note become items'
);

select is(
  (select collection_revision from pg_temp_receipt),
  1::bigint,
  'the collection revision moves once for the batch, not once per item'
);

-- What the route is allowed to create, which is the whole of decision 16 ------

select is(
  (select count(*)::integer from public.memory_items
   where user_id = '7c000000-0000-4000-8000-000000000001'
     and status = 'proposed'
     and provenance = 'inferred_proposed'),
  2,
  'every item it created is proposed and carries inferred provenance'
);

select is(
  (select count(*)::integer from public.memory_items
   where user_id = '7c000000-0000-4000-8000-000000000001'
     and (status <> 'proposed' or provenance <> 'inferred_proposed')),
  0,
  'and it created nothing else'
);

select is(
  (select count(*)::integer from public.memory_revisions
   where user_id = '7c000000-0000-4000-8000-000000000001'
     and author_class = 'system'
     and provenance = 'inferred_proposed'
     and status_after = 'proposed'
     and revision_number = 1),
  2,
  'each item opens with one system-authored revision recorded as proposed'
);

select is(
  (select count(*)::integer from public.memory_items
   where user_id = '7c000000-0000-4000-8000-000000000001'
     and source_reference like 'plan-proposal:%'),
  2,
  'the source reference names the plan proposal, so a roadmap batch cannot collide with it'
);

select is(
  (select count(*)::integer from public.memory_items
   where user_id = '7c000000-0000-4000-8000-000000000001'
     and user_confirmed_at is not null),
  0,
  'nothing it creates is marked as confirmed by the owner'
);

-- The content is the owner's own words, not the coach's ----------------------

select is(
  (select count(*)::integer from public.memory_revisions
   where user_id = '7c000000-0000-4000-8000-000000000001'
     and strpos(
       'I only have 45 minutes on weekdays and my left knee complains on hills',
       content) = 0),
  0,
  'every stored revision quotes the planning note the owner wrote'
);

-- Replay ---------------------------------------------------------------------

create temporary table pg_temp_replay (
  collection_revision bigint,
  item_ids uuid[]
) on commit drop;

insert into pg_temp_replay
select * from public.record_plan_memory_candidates(
  (select completion_token from pg_temp_claim where label = 'noted'), 0,
  '[{"memoryType":"constraint",
     "sourceExcerpt":"only have 45 minutes on weekdays",
     "confidence":80},
    {"memoryType":"observed_pattern",
     "sourceExcerpt":"left knee complains on hills"}]'::jsonb
);

select is(
  (select count(*)::integer from public.memory_items
   where user_id = '7c000000-0000-4000-8000-000000000001'),
  2,
  'a replayed batch duplicates nothing'
);

select is(
  (select item_ids from pg_temp_replay),
  (select item_ids from pg_temp_receipt),
  'and returns the very items the first call created'
);

-- It cannot move an item out of proposed -------------------------------------
--
-- The owner accepts one item through the surface that owns that decision, then
-- the route runs again. A function that could promote or demote anything would
-- show it here.

select public.apply_memory_change(
  (select revision from public.memory_collections
   where user_id = '7c000000-0000-4000-8000-000000000001'),
  'accept',
  (select id from public.memory_items
   where user_id = '7c000000-0000-4000-8000-000000000001'
     and memory_type = 'constraint')
);

select is(
  (select status from public.memory_items
   where user_id = '7c000000-0000-4000-8000-000000000001'
     and memory_type = 'constraint'),
  'active',
  'the owner accepting a candidate is what makes it active'
);

select lives_ok(
  $$select * from public.record_plan_memory_candidates(
    (select completion_token from pg_temp_claim where label = 'noted'), 0,
    '[{"memoryType":"constraint",
       "sourceExcerpt":"only have 45 minutes on weekdays"}]'::jsonb)$$,
  'the route runs again against a proposal whose candidate has since been accepted'
);

select is(
  (select status from public.memory_items
   where user_id = '7c000000-0000-4000-8000-000000000001'
     and memory_type = 'constraint'),
  'active',
  'and it did not move the accepted item back to proposed'
);

-- Another owner --------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"7c000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select throws_ok(
  $$select * from public.record_plan_memory_candidates(
    (select completion_token from pg_temp_claim where label = 'noted'), 0,
    '[{"memoryType":"constraint",
       "sourceExcerpt":"only have 45 minutes on weekdays"}]'::jsonb)$$,
  'PT409', 'That coaching request is no longer open.',
  'a stolen completion token proposes nothing against another owner''s plan'
);

select is(
  (select count(*)::integer from public.memory_items
   where user_id = '7c000000-0000-4000-8000-000000000002'),
  0,
  'and the outsider holds no memory of their own as a result'
);

select set_config('request.jwt.claims', null, true);

select * from finish();
rollback;
