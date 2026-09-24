-- M3-16A: plan proposal application.
--
-- Three things are proved here.
--
-- First, the privilege boundary, against the functions themselves. All five are
-- `SECURITY DEFINER`, so they run as their owner and RLS on the plan-proposal
-- tables is not consulted for what they write. What stands between a caller and
-- those writes is `execute`, plus each function's own `auth.uid()` derivation.
-- So the assertions name the function, not the table: `authenticated` holds
-- `execute` and `public`, `anon` and `service_role` hold none; a call without a
-- subject claim is refused before anything is written; and a call carrying
-- another owner's proposal id reaches nothing of theirs.
--
-- Second, that the finish is the only thing that touches the plan, that it
-- touches it exactly once, and that it goes through
-- `apply_rolling_plan_change_set` rather than around it. The evidence is the
-- change set: one row, provenance `owner_ai_proposal`, with the applied sessions
-- carrying the very session ids the proposal allocated. A discard leaves the
-- plan's revision where it was.
--
-- Third, that a proposal is a permanent record. Applying it does not edit its
-- content, does not delete its items, and does not rewrite the choices that
-- produced it.
--
-- Dates are derived from UTC today rather than written as literals, because
-- `begin_plan_generation` refuses a start earlier than the day before its own
-- UTC date and `apply_rolling_plan_change_set` refuses an add before the
-- owner's local today. A fixed literal would pass until it did not.

begin;

create extension if not exists pgtap with schema extensions;

create function pg_temp.day(p_offset integer)
returns date
language sql
stable
as $$
  select ((clock_timestamp() at time zone 'utc')::date + p_offset)
$$;

-- A valid `fittip.seven-day-plan.v2` body over a three-day horizon with sessions
-- on the first and third day. The middle day is left empty on purpose: it is
-- what makes a recovery-day item exist to be decided.
create function pg_temp.plan_body(p_start date, p_end date)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'schemaVersion', 'fittip.seven-day-plan.v2',
    'weekDescription',
      'Two easy sessions with a planned rest day between them.',
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

select plan(96);

-- Shape ----------------------------------------------------------------------

select has_table('public', 'plan_generation_requests', 'the generation attempt table exists');
select has_table('public', 'plan_proposals', 'the proposal table exists');
select has_table('public', 'plan_proposal_items', 'the decidable item table exists');
select has_table('public', 'plan_proposal_sources', 'the provenance table exists');
select has_table('public', 'plan_proposal_item_decisions', 'the per-item decision table exists');
select has_table('public', 'plan_proposal_decisions', 'the terminal decision table exists');

select is(
  (select count(*)::integer
   from pg_tables
   where schemaname = 'public'
     and tablename in (
       'plan_generation_requests', 'plan_proposals', 'plan_proposal_items',
       'plan_proposal_sources', 'plan_proposal_item_decisions',
       'plan_proposal_decisions')
     and rowsecurity),
  6,
  'row level security is enabled on all six tables'
);

select is(
  (select count(*)::integer
   from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name in (
       'plan_generation_requests', 'plan_proposals', 'plan_proposal_items',
       'plan_proposal_sources', 'plan_proposal_item_decisions',
       'plan_proposal_decisions')
     and grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')
     and privilege_type <> 'SELECT'),
  0,
  'no role holds insert, update or delete on any plan proposal table'
);

select is(
  (select count(*)::integer
   from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name in (
       'plan_generation_requests', 'plan_proposals', 'plan_proposal_items',
       'plan_proposal_sources', 'plan_proposal_item_decisions',
       'plan_proposal_decisions')
     and grantee in ('anon', 'service_role', 'PUBLIC')),
  0,
  'anonymous, service and public roles hold nothing on any of them'
);

-- The completion token is the capability that permits closing a generation with
-- content the server never validated, so the owner cannot read their own.
select ok(
  not has_column_privilege(
    'authenticated', 'public.plan_generation_requests', 'completion_token', 'SELECT'
  ),
  'the completion token is not readable by the owner'
);
select ok(
  has_column_privilege(
    'authenticated', 'public.plan_generation_requests', 'status', 'SELECT'
  ) and has_column_privilege(
    'authenticated', 'public.plan_generation_requests', 'proposal_id', 'SELECT'
  ),
  'the owner can read the status and outcome of their own attempt'
);

select is(
  (select count(*)::integer
   from pg_policies
   where schemaname = 'public'
     and tablename in (
       'plan_generation_requests', 'plan_proposals', 'plan_proposal_items',
       'plan_proposal_sources', 'plan_proposal_item_decisions',
       'plan_proposal_decisions')
     and cmd = 'SELECT'
     and roles::text[] = array['authenticated']
     and qual like '%auth.uid()%'),
  6,
  'each table carries one owner-scoped select policy for authenticated'
);

-- Functions ------------------------------------------------------------------

select has_function(
  'public', 'begin_plan_generation',
  array['text', 'text', 'date', 'integer', 'bigint', 'text', 'uuid', 'text'],
  'the generation claim function exists'
);
select has_function(
  'public', 'finish_plan_generation',
  array['uuid', 'text', 'text', 'text', 'text', 'text', 'text', 'uuid',
        'text', 'jsonb', 'jsonb', 'text', 'text'],
  'the generation completion function exists'
);
select has_function(
  'public', 'decide_plan_proposal_item',
  array['uuid', 'integer', 'text'],
  'the per-item decision function exists'
);
select has_function(
  'public', 'finish_plan_proposal_review',
  array['uuid', 'bigint', 'uuid'],
  'the atomic finish function exists'
);
select has_function(
  'public', 'discard_plan_proposal',
  array['uuid'],
  'the discard function exists'
);

select is(
  (select count(*)::integer
   from pg_proc
   where oid in (
     'public.begin_plan_generation(text,text,date,integer,bigint,text,uuid,text)'::regprocedure,
     'public.finish_plan_generation(uuid,text,text,text,text,text,text,uuid,text,jsonb,jsonb,text,text)'::regprocedure,
     'public.decide_plan_proposal_item(uuid,integer,text)'::regprocedure,
     'public.finish_plan_proposal_review(uuid,bigint,uuid)'::regprocedure,
     'public.discard_plan_proposal(uuid)'::regprocedure)
     and prosecdef
     and proconfig = array['search_path=""']),
  5,
  'all five run as definer with an empty search path'
);

select is(
  (select count(*)::bigint
   from pg_proc
   cross join lateral unnest(coalesce(proargnames, array[]::text[])) argument
   where oid in (
     'public.begin_plan_generation(text,text,date,integer,bigint,text,uuid,text)'::regprocedure,
     'public.finish_plan_generation(uuid,text,text,text,text,text,text,uuid,text,jsonb,jsonb,text,text)'::regprocedure,
     'public.decide_plan_proposal_item(uuid,integer,text)'::regprocedure,
     'public.finish_plan_proposal_review(uuid,bigint,uuid)'::regprocedure,
     'public.discard_plan_proposal(uuid)'::regprocedure)
     and argument ilike '%user%'),
  0::bigint,
  'not one of them accepts an owner parameter'
);

select is(
  (select count(*)::integer
   from (values
     ('public.begin_plan_generation(text,text,date,integer,bigint,text,uuid,text)'),
     ('public.finish_plan_generation(uuid,text,text,text,text,text,text,uuid,text,jsonb,jsonb,text,text)'),
     ('public.decide_plan_proposal_item(uuid,integer,text)'),
     ('public.finish_plan_proposal_review(uuid,bigint,uuid)'),
     ('public.discard_plan_proposal(uuid)')
   ) as f(signature)
   where has_function_privilege('authenticated', f.signature, 'EXECUTE')),
  5,
  'authenticated owners can execute all five'
);

select is(
  (select count(*)::integer
   from (values
     ('public.begin_plan_generation(text,text,date,integer,bigint,text,uuid,text)'),
     ('public.finish_plan_generation(uuid,text,text,text,text,text,text,uuid,text,jsonb,jsonb,text,text)'),
     ('public.decide_plan_proposal_item(uuid,integer,text)'),
     ('public.finish_plan_proposal_review(uuid,bigint,uuid)'),
     ('public.discard_plan_proposal(uuid)')
   ) as f(signature)
   where has_function_privilege('anon', f.signature, 'EXECUTE')
      or has_function_privilege('service_role', f.signature, 'EXECUTE')),
  0,
  'anonymous and service roles can execute none of them'
);

select ok(
  not has_function_privilege(
    'authenticated', 'public.plan_content_is_valid(jsonb,date,date)', 'EXECUTE'
  ) and not has_function_privilege(
    'anon', 'public.plan_content_is_valid(jsonb,date,date)', 'EXECUTE'
  ),
  'the content validator is reachable only from inside the definer functions'
);

-- Owners ---------------------------------------------------------------------

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('7a000000-0000-4000-8000-000000000001', 'plan-owner@example.test', '{}', '{}'),
  ('7a000000-0000-4000-8000-000000000002', 'plan-outsider@example.test', '{}', '{}');
insert into public.profiles (user_id, timezone_name)
select id, 'UTC' from auth.users
where id in (
  '7a000000-0000-4000-8000-000000000001',
  '7a000000-0000-4000-8000-000000000002'
);

set local role authenticated;

-- No subject claim -----------------------------------------------------------

select set_config('request.jwt.claims', '{"role":"authenticated"}', true);

select throws_ok(
  format(
    $$select * from public.begin_plan_generation(
      'no-owner-key-0000000001', 'no-owner-fingerprint-0000000001',
      %L::date, 3, 0)$$,
    pg_temp.day(0)
  ),
  '42501', 'An authenticated FitTip user is required.',
  'a generation without an owner claim is refused before anything is written'
);
select throws_ok(
  $$select * from public.finish_plan_generation(
    '7a000000-0000-4000-8000-0000000000ff'::uuid, 'failed',
    p_safe_failure_code => 'provider_unavailable')$$,
  '42501', 'An authenticated FitTip user is required.',
  'closing a generation without an owner claim is refused'
);
select throws_ok(
  $$select public.decide_plan_proposal_item(
    '7a000000-0000-4000-8000-0000000000ff'::uuid, 0, 'staged')$$,
  '42501', 'An authenticated FitTip user is required.',
  'deciding an item without an owner claim is refused'
);
select throws_ok(
  $$select * from public.finish_plan_proposal_review(
    '7a000000-0000-4000-8000-0000000000ff'::uuid, 0,
    '7a000000-0000-4000-8000-0000000000fe'::uuid)$$,
  '42501', 'An authenticated FitTip user is required.',
  'finishing a review without an owner claim is refused'
);
select throws_ok(
  $$select * from public.discard_plan_proposal(
    '7a000000-0000-4000-8000-0000000000ff'::uuid)$$,
  '42501', 'An authenticated FitTip user is required.',
  'discarding without an owner claim is refused'
);

-- The owner's generation -----------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

create temporary table pg_temp_claim (
  generation_id uuid,
  completion_token uuid,
  state text,
  proposal_id uuid
) on commit drop;

insert into pg_temp_claim
select * from public.begin_plan_generation(
  'owner-plan-key-000000001', 'owner-plan-fingerprint-0001',
  pg_temp.day(0), 3, 0, 'I only have 45 minutes on weekdays'
);

select is(
  (select state from pg_temp_claim), 'claimed',
  'the caller whose insert opened the attempt is the one told claimed'
);

select is(
  (select state from public.begin_plan_generation(
    'owner-plan-key-000000001', 'owner-plan-fingerprint-0001',
    pg_temp.day(0), 3, 0, 'I only have 45 minutes on weekdays')),
  'pending',
  'the same key and fingerprint replays as pending and never buys a second call'
);

select throws_ok(
  format(
    $$select * from public.begin_plan_generation(
      'owner-plan-key-000000001', 'owner-plan-fingerprint-changed',
      %L::date, 3, 0, 'I only have 45 minutes on weekdays')$$,
    pg_temp.day(0)
  ),
  'PT409', 'That coaching request changed. Reload and try again.',
  'the same key with different input is a conflict, not a silent replay'
);

select is(
  (select proposal_id is not null from public.finish_plan_generation(
    (select completion_token from pg_temp_claim),
    'proposal',
    'fittip.seven-day-plan.v2',
    'seven-day-plan-v2-2026-08-12',
    'fixture',
    'fixture-corpus-v1',
    'fixture-no-spend',
    null,
    'I only have 45 minutes on weekdays',
    pg_temp.plan_body(pg_temp.day(0), pg_temp.day(2)),
    null,
    null
  )),
  true,
  'the claimed attempt closes with a proposal'
);

-- The id is captured while the owner is the caller. The outsider assertions
-- below need it, and row level security is exactly what stops them reading it
-- for themselves.
create temporary table pg_temp_proposal (id uuid) on commit drop;
insert into pg_temp_proposal
select proposal_id from public.plan_generation_requests
where idempotency_key = 'owner-plan-key-000000001';

-- Items ----------------------------------------------------------------------

select is(
  (select count(*)::integer from public.plan_proposal_items),
  3,
  'two proposed sessions and the one empty date between them are decidable'
);
select is(
  (select array_agg(kind order by ordinal) from public.plan_proposal_items),
  array['session', 'recovery_day', 'session'],
  'items are ordered by date, and the empty middle day is offered as recovery'
);
select is(
  (select array_agg(local_date order by ordinal) from public.plan_proposal_items),
  array[pg_temp.day(0), pg_temp.day(1), pg_temp.day(2)],
  'every date in the horizon carries exactly one decision'
);
select is(
  (select array_agg(content_index order by ordinal)
   from public.plan_proposal_items where kind = 'session'),
  array[0::smallint, 1::smallint],
  'session items point back at their place in the immutable content'
);
select ok(
  (select bool_and(session_id is not null)
   from public.plan_proposal_items where kind = 'session'),
  'a session item owns the plan session id it will be applied under'
);
select ok(
  (select bool_and(
     session_id is null and title is null and rationale is null)
   from public.plan_proposal_items where kind = 'recovery_day'),
  'a recovery-day item carries no coach-authored text, because the coach wrote none'
);
select is(
  (select expected_duration_minutes from public.plan_proposal_items where ordinal = 0),
  45,
  'the proposed duration is carried onto the item that will become a session'
);

-- Another owner cannot touch any of it ---------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select is(
  (select count(*)::integer from public.plan_proposals),
  0,
  'the outsider reads none of the owner''s proposals'
);
select is(
  (select count(*)::integer from public.plan_proposal_items),
  0,
  'the outsider reads none of the owner''s items'
);
select throws_ok(
  format(
    $$select public.decide_plan_proposal_item(%L::uuid, 0, 'staged')$$,
    (select id from pg_temp_proposal)
  ),
  'PT409', 'That proposed item is no longer available.',
  'the outsider cannot decide an item on the owner''s proposal'
);
select throws_ok(
  format(
    $$select * from public.finish_plan_proposal_review(
      %L::uuid, 0, '7a000000-0000-4000-8000-0000000000fd'::uuid)$$,
    (select id from pg_temp_proposal)
  ),
  'PT409', 'That proposal is no longer available.',
  'the outsider cannot finish the owner''s review'
);
select throws_ok(
  format(
    $$select * from public.discard_plan_proposal(%L::uuid)$$,
    (select id from pg_temp_proposal)
  ),
  'PT409', 'That proposal is no longer available.',
  'the outsider cannot discard the owner''s proposal'
);

-- Deciding and finishing -----------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select throws_ok(
  format(
    $$select * from public.finish_plan_proposal_review(
      %L::uuid, 0, '7a000000-0000-4000-8000-0000000000fc'::uuid)$$,
    (select id from pg_temp_proposal)
  ),
  'PT432', 'Every proposed item needs a choice before you can finish.',
  'a review with an undecided item cannot be finished'
);

select lives_ok(
  format(
    $$select public.decide_plan_proposal_item(%L::uuid, 0, 'staged'),
             public.decide_plan_proposal_item(%L::uuid, 1, 'staged'),
             public.decide_plan_proposal_item(%L::uuid, 2, 'rejected')$$,
    (select id from pg_temp_proposal),
    (select id from pg_temp_proposal),
    (select id from pg_temp_proposal)
  ),
  'the owner stages the first session and the rest day, and rejects the second'
);

select is(
  (select decision from public.plan_proposal_item_decisions where ordinal = 2),
  'rejected',
  'a rejection is a recorded choice, not an absence'
);

select lives_ok(
  format(
    $$select public.decide_plan_proposal_item(%L::uuid, 2, 'proposed')$$,
    (select id from pg_temp_proposal)
  ),
  'a decision can be taken back to proposed'
);
select is(
  (select count(*)::integer from public.plan_proposal_item_decisions),
  2,
  'and taking it back removes the row rather than storing a third value'
);
select throws_ok(
  format(
    $$select * from public.finish_plan_proposal_review(
      %L::uuid, 0, '7a000000-0000-4000-8000-0000000000fb'::uuid)$$,
    (select id from pg_temp_proposal)
  ),
  'PT432', 'Every proposed item needs a choice before you can finish.',
  'so the review is unfinishable again until that item is decided'
);

select lives_ok(
  format(
    $$select public.decide_plan_proposal_item(%L::uuid, 2, 'rejected')$$,
    (select id from pg_temp_proposal)
  ),
  'the owner rejects it again'
);

create temporary table pg_temp_receipt (
  proposal_id uuid,
  decision text,
  applied_count smallint,
  change_set_id uuid,
  plan_revision bigint,
  state text
) on commit drop;

insert into pg_temp_receipt
select * from public.finish_plan_proposal_review(
  (select id from pg_temp_proposal), 0,
  '7a000000-0000-4000-8000-0000000000fa'::uuid
);

select is(
  (select state from pg_temp_receipt), 'applied',
  'the finish applies'
);
select is(
  (select applied_count from pg_temp_receipt), 2::smallint,
  'applying exactly the two items that were staged: one session and one rest day'
);

-- What reached the plan ------------------------------------------------------

select is(
  (select count(*)::integer from public.rolling_plan_sessions),
  1,
  'only the staged session entered the plan'
);
select is(
  (select title from public.rolling_plan_sessions),
  'Easy aerobic session',
  'and it is the one the owner staged, not the one they rejected'
);
select ok(
  (select s.id = i.session_id
   from public.rolling_plan_sessions s, public.plan_proposal_items i
   where i.ordinal = 0),
  'the applied session owns the id the proposal allocated for it'
);
select is(
  (select position from public.rolling_plan_sessions), 0::smallint,
  'it is placed at the first free position on its date'
);
select ok(
  (select not is_locked from public.rolling_plan_sessions),
  'an applied session is not locked; the owner locks their own content'
);
select is(
  (select count(*)::integer from public.rolling_plan_recovery_days),
  1,
  'the staged rest day was applied as a recovery-day label'
);
select is(
  (select local_date from public.rolling_plan_recovery_days), pg_temp.day(1),
  'on the date the coach left empty'
);
select is(
  (select provenance from public.rolling_plan_change_sets),
  'owner_ai_proposal',
  'the plan write went through the plan''s own change function, with its lineage named'
);
select is(
  (select count(*)::integer from public.rolling_plan_change_sets),
  1,
  'and it was one change set, not one per staged item'
);
select is(
  (select revision from public.rolling_plans), 1::bigint,
  'the plan advanced exactly one revision'
);

-- The proposal is still the proposal ------------------------------------------

select is(
  (select content->'sessions'->1->>'title' from public.plan_proposals),
  'Steadier session',
  'applying a proposal did not edit what the coach proposed'
);
select is(
  (select count(*)::integer from public.plan_proposal_items),
  3,
  'nor delete the items that were rejected'
);
select is(
  (select decision from public.plan_proposal_decisions),
  'applied',
  'the terminal decision records what the owner did'
);
select ok(
  (select change_set_id = (select id from public.rolling_plan_change_sets)
   from public.plan_proposal_decisions),
  'and points at the exact plan change it produced'
);

-- A finished review is finished ----------------------------------------------

select is(
  (select state from public.finish_plan_proposal_review(
    (select id from pg_temp_proposal), 1,
    '7a000000-0000-4000-8000-0000000000f9'::uuid)),
  'replayed',
  'finishing again replays the recorded outcome'
);
select is(
  (select count(*)::integer from public.rolling_plan_sessions),
  1,
  'and writes nothing a second time'
);
select throws_ok(
  format(
    $$select public.decide_plan_proposal_item(%L::uuid, 2, 'staged')$$,
    (select id from pg_temp_proposal)
  ),
  'PT433', 'That review is already finished.',
  'a choice cannot be changed after it has been acted on'
);
select throws_ok(
  format(
    $$select * from public.discard_plan_proposal(%L::uuid)$$,
    (select id from pg_temp_proposal)
  ),
  'PT433', 'That review is already finished.',
  'and an applied review cannot then be discarded'
);

-- A discard writes nothing ---------------------------------------------------

create temporary table pg_temp_claim_two (
  generation_id uuid,
  completion_token uuid,
  state text,
  proposal_id uuid
) on commit drop;

insert into pg_temp_claim_two
select * from public.begin_plan_generation(
  'owner-plan-key-000000002', 'owner-plan-fingerprint-0002',
  pg_temp.day(4), 3, 1
);

select is(
  (select proposal_id is not null from public.finish_plan_generation(
    (select completion_token from pg_temp_claim_two),
    'proposal',
    'fittip.seven-day-plan.v2',
    'seven-day-plan-v2-2026-08-12',
    'fixture',
    'fixture-corpus-v1',
    'fixture-no-spend',
    null,
    null,
    pg_temp.plan_body(pg_temp.day(4), pg_temp.day(6)),
    null,
    null
  )),
  true,
  'a second attempt produces a second proposal'
);

select is(
  (select state from public.discard_plan_proposal(
    (select proposal_id from public.plan_generation_requests
     where idempotency_key = 'owner-plan-key-000000002'))),
  'discarded',
  'the owner discards it without deciding a single item'
);
select is(
  (select revision from public.rolling_plans), 1::bigint,
  'a discard does not advance the plan'
);
select is(
  (select count(*)::integer from public.rolling_plan_sessions),
  1,
  'and adds no session'
);
select is(
  (select count(*)::integer from public.plan_proposal_items),
  6,
  'the discarded proposal''s items are kept; discarding is a decision, not an erasure'
);
select throws_ok(
  format(
    $$select * from public.finish_plan_proposal_review(
      %L::uuid, 1, '7a000000-0000-4000-8000-0000000000f8'::uuid)$$,
    (select proposal_id from public.plan_generation_requests
     where idempotency_key = 'owner-plan-key-000000002')
  ),
  'PT433', 'That review is already finished.',
  'a discarded proposal cannot then be applied'
);

-- A stale plan revision stops the finish -------------------------------------

create temporary table pg_temp_claim_three (
  generation_id uuid,
  completion_token uuid,
  state text,
  proposal_id uuid
) on commit drop;

insert into pg_temp_claim_three
select * from public.begin_plan_generation(
  'owner-plan-key-000000003', 'owner-plan-fingerprint-0003',
  pg_temp.day(4), 3, 1
);
select is(
  (select proposal_id is not null from public.finish_plan_generation(
    (select completion_token from pg_temp_claim_three),
    'proposal', 'fittip.seven-day-plan.v2', 'seven-day-plan-v2-2026-08-12',
    'fixture', 'fixture-corpus-v1', 'fixture-no-spend', null, null,
    pg_temp.plan_body(pg_temp.day(4), pg_temp.day(6)), null, null
  )),
  true,
  'a third attempt produces a third proposal'
);

select lives_ok(
  format(
    $$select public.decide_plan_proposal_item(%L::uuid, 0, 'staged'),
             public.decide_plan_proposal_item(%L::uuid, 1, 'rejected'),
             public.decide_plan_proposal_item(%L::uuid, 2, 'rejected')$$,
    (select proposal_id from public.plan_generation_requests
     where idempotency_key = 'owner-plan-key-000000003'),
    (select proposal_id from public.plan_generation_requests
     where idempotency_key = 'owner-plan-key-000000003'),
    (select proposal_id from public.plan_generation_requests
     where idempotency_key = 'owner-plan-key-000000003')
  ),
  'the owner resolves every item on it'
);

select throws_ok(
  format(
    $$select * from public.finish_plan_proposal_review(
      %L::uuid, 0, '7a000000-0000-4000-8000-0000000000f7'::uuid)$$,
    (select proposal_id from public.plan_generation_requests
     where idempotency_key = 'owner-plan-key-000000003')
  ),
  'PT409', 'Your plan changed. Reload and try again.',
  'a finish against a stale plan revision is refused by the plan''s own check'
);
select is(
  (select count(*)::integer from public.plan_proposal_decisions),
  2,
  'and a refused finish records no terminal decision'
);

-- Nothing a rejected caller did left a trace ---------------------------------

select is(
  (select count(*)::integer from public.rolling_plan_change_sets),
  1,
  'one change set exists across the whole suite, from the one review that applied'
);

-- What the careful-lane review found ------------------------------------------
--
-- The provider codes are what the owner-facing "example" label rests on, so a
-- finish has to prove they are an approved pairing, and a live pairing has to
-- carry a settled reservation of this owner's, for this operation.

create temporary table pg_temp_claim_four (
  generation_id uuid,
  completion_token uuid,
  state text,
  proposal_id uuid
) on commit drop;

insert into pg_temp_claim_four
select * from public.begin_plan_generation(
  'owner-plan-key-000000004', 'owner-plan-fingerprint-0004',
  pg_temp.day(4), 3, 1
);

select throws_ok(
  format(
    $$select * from public.finish_plan_generation(
      %L::uuid, 'proposal', 'fittip.seven-day-plan.v2',
      'seven-day-plan-v2-2026-08-12', 'fixture', 'some-other-model',
      'fixture-no-spend', null, null, %L::jsonb, null, null)$$,
    (select completion_token from pg_temp_claim_four),
    pg_temp.plan_body(pg_temp.day(4), pg_temp.day(6))
  ),
  '22023', 'That coaching model is not approved.',
  'a provider and model that are not an approved pairing are refused'
);
select throws_ok(
  format(
    $$select * from public.finish_plan_generation(
      %L::uuid, 'proposal', 'fittip.seven-day-plan.v2',
      'seven-day-plan-v2-2026-08-12', 'fixture', 'fixture-corpus-v1',
      'fixture-no-spend', '7a000000-0000-4000-8000-0000000000e1'::uuid,
      null, %L::jsonb, null, null)$$,
    (select completion_token from pg_temp_claim_four),
    pg_temp.plan_body(pg_temp.day(4), pg_temp.day(6))
  ),
  '22023', 'That coaching model is not approved.',
  'a fixture result claiming a spend reservation is refused'
);
select throws_ok(
  format(
    $$select * from public.finish_plan_generation(
      %L::uuid, 'proposal', 'fittip.seven-day-plan.v2',
      'seven-day-plan-v2-2026-08-12', 'openai', 'gpt-5.6-luna',
      'openai-gpt-5.6-luna-2026-08-10',
      '7a000000-0000-4000-8000-0000000000e2'::uuid,
      null, %L::jsonb, null, null)$$,
    (select completion_token from pg_temp_claim_four),
    pg_temp.plan_body(pg_temp.day(4), pg_temp.day(6))
  ),
  '22023', 'Invalid plan result.',
  'a live result pointing at a reservation that is not this owner''s is refused'
);

select is(
  (select proposal_id is not null from public.finish_plan_generation(
    (select completion_token from pg_temp_claim_four),
    'proposal', 'fittip.seven-day-plan.v2', 'seven-day-plan-v2-2026-08-12',
    'fixture', 'fixture-corpus-v1', 'fixture-no-spend', null, null,
    pg_temp.plan_body(pg_temp.day(4), pg_temp.day(6)), null, null
  )),
  true,
  'the same attempt still closes with the approved fixture pairing'
);

-- The middle day of this horizon is already a recovery day, and the first day
-- already holds a session the owner moved to position 99.
select lives_ok(
  format(
    $$select * from public.apply_rolling_plan_change_set(
      1, '7a000000-0000-4000-8000-0000000000d1'::uuid, 'owner_manual',
      jsonb_build_array(
        jsonb_build_object(
          'operation', 'set_recovery_day',
          'localDate', %L,
          'isRecoveryDay', true),
        jsonb_build_object(
          'operation', 'add',
          'sessionId', '7a000000-0000-4000-8000-0000000000d2',
          'session', jsonb_build_object(
            'localDate', %L, 'position', 99, 'title', 'Late swim',
            'sport', 'Swimming', 'isLocked', false,
            'activities', '[]'::jsonb))))$$,
    pg_temp.day(5)::text, pg_temp.day(4)::text
  ),
  'the owner marks the middle day as rest and puts a session at position 99'
);

select lives_ok(
  format(
    $$select public.decide_plan_proposal_item(%1$L::uuid, 0, 'staged'),
             public.decide_plan_proposal_item(%1$L::uuid, 1, 'staged'),
             public.decide_plan_proposal_item(%1$L::uuid, 2, 'rejected')$$,
    (select proposal_id from public.plan_generation_requests
     where idempotency_key = 'owner-plan-key-000000004')
  ),
  'the owner stages the first session and the rest day that already holds'
);

create temporary table pg_temp_receipt_four (
  proposal_id uuid,
  decision text,
  applied_count smallint,
  change_set_id uuid,
  plan_revision bigint,
  state text
) on commit drop;

insert into pg_temp_receipt_four
select * from public.finish_plan_proposal_review(
  (select proposal_id from public.plan_generation_requests
   where idempotency_key = 'owner-plan-key-000000004'),
  2, '7a000000-0000-4000-8000-0000000000f6'::uuid
);

select is(
  (select state from pg_temp_receipt_four), 'applied',
  'a staged rest day that already holds does not take the rest of the finish down'
);
select is(
  (select applied_count from pg_temp_receipt_four), 1::smallint,
  'and it is not counted as applied, because nothing was'
);
select is(
  (select count(*)::integer from public.rolling_plan_recovery_days
   where local_date = pg_temp.day(5)),
  1,
  'the rest day is still exactly one label'
);
select is(
  (select position from public.rolling_plan_sessions
   where local_date = pg_temp.day(4) and title = 'Easy aerobic session'),
  0::smallint,
  'a session staged beside one at position 99 takes the first free slot, not 100'
);
select is(
  (select count(*)::integer from public.rolling_plan_sessions
   where local_date = pg_temp.day(4) and status = 'active'),
  2,
  'and the owner''s own session on that date is untouched'
);

-- A rest day is offered only on a genuinely empty date ------------------------
--
-- The owner's decision of 19 September 2026: a date that already holds their
-- own session, or is already labelled rest, is not offered as a recovery day,
-- whatever the coach left off it.

create function pg_temp.propose(p_key text, p_start integer)
returns uuid
language sql
as $$
  select (public.finish_plan_generation(
    (public.begin_plan_generation(
      p_key, p_key || '-fingerprint', pg_temp.day(p_start), 3,
      (select revision from public.rolling_plans)
    )).completion_token,
    'proposal', 'fittip.seven-day-plan.v2', 'seven-day-plan-v2-2026-08-12',
    'fixture', 'fixture-corpus-v1', 'fixture-no-spend', null, null,
    pg_temp.plan_body(pg_temp.day(p_start), pg_temp.day(p_start + 2)),
    null, null
  )).proposal_id
$$;

create temporary table pg_temp_empty_day (label text, proposal_id uuid)
  on commit drop;
insert into pg_temp_empty_day
values
  -- Middle day is day(4), which now holds two of the owner's sessions.
  ('planned', pg_temp.propose('owner-plan-key-000000005', 3)),
  -- Middle day is day(5), which is already labelled rest.
  ('labelled', pg_temp.propose('owner-plan-key-000000006', 4));

select is(
  (select count(*)::integer from public.plan_proposal_items
   where proposal_id = (select proposal_id from pg_temp_empty_day
                        where label = 'planned')
     and kind = 'recovery_day'),
  0,
  'a date that already holds the owner''s session is not offered as rest'
);
select is(
  (select count(*)::integer from public.plan_proposal_items
   where proposal_id = (select proposal_id from pg_temp_empty_day
                        where label = 'planned')
     and kind = 'session'),
  2,
  'while the coach''s own sessions on either side are still offered'
);
select is(
  (select count(*)::integer from public.plan_proposal_items
   where proposal_id = (select proposal_id from pg_temp_empty_day
                        where label = 'labelled')
     and kind = 'recovery_day'),
  0,
  'a date already labelled rest is not offered the same label again'
);
select is(
  (select count(*)::integer from public.plan_proposal_items
   where proposal_id = (select proposal_id from pg_temp_empty_day
                        where label = 'labelled')),
  2,
  'so that proposal asks about exactly its two sessions'
);

select set_config('request.jwt.claims', null, true);

select * from finish();
rollback;
