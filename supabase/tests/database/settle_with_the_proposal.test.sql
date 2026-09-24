-- Settling the reservation in the transaction that records the proposal.
--
-- The behaviour this proves is the one that used to lose money: a reservation
-- the application failed to settle made the finish refuse a result the provider
-- had already been paid for, and the proposal was thrown away. The finish now
-- settles it itself, so the charge and the proposal commit together.
--
-- Four things matter and each is asserted on both the plan and the roadmap
-- side, because the two finishes are separate functions and a fix applied to
-- one of them is the failure mode worth catching:
--
--   1. An open reservation is settled by the finish, at the amount it was
--      holding, and the proposal is recorded.
--   2. A reservation the application already settled is still accepted, and its
--      real charge is not overwritten with the ceiling.
--   3. The four things the finish always checked still refuse: wrong owner,
--      wrong operation, wrong rate card, and a fixture result claiming a
--      reservation at all. The roadmap finish carries its own hand-written copy
--      of that predicate, so it is exercised rather than inferred from the
--      plan side passing.
--   4. Nothing is settled when the finish refuses -- including when the refusal
--      comes *after* the settle has already run. A bad source list is validated
--      downstream of it, and that case is what proves the function really is one
--      transaction rather than a settle followed by some other work.

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

create function pg_temp.roadmap_body(p_start date, p_end date, p_title text)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'schemaVersion', 'fittip.roadmap.v2',
    'title', p_title,
    'summary', 'Build an aerobic base, then sharpen into the target race.',
    'startDate', p_start::text,
    'endDate', p_end::text,
    'phases', jsonb_build_array(jsonb_build_object(
      'title', 'Base',
      'focus', 'Easy volume, consistent weeks, no intensity worth the name.',
      'startDate', p_start::text,
      'endDate', p_end::text,
      'goalAttention', jsonb_build_array(jsonb_build_object(
        'goalId', '00000000-0000-4000-8000-000000000001',
        'level', 'primary',
        'reason', 'It is the only goal with a date inside this horizon.'
      )),
      'milestones', jsonb_build_array(jsonb_build_object(
        'title', 'Four steady weeks',
        'observableCriterion', 'Four consecutive weeks with every planned easy run logged.',
        'targetDate', p_end::text,
        'goalIds', jsonb_build_array('00000000-0000-4000-8000-000000000001')
      ))
    )),
    'reviewPoints', jsonb_build_array(jsonb_build_object(
      'title', 'Halfway check',
      'triggerDate', p_start::text,
      'question', 'Is the weekly volume still repeatable without soreness?'
    ))
  )
$$;

select plan(21);

-- Owners ---------------------------------------------------------------------

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('7d000000-0000-4000-8000-000000000001', 'settle-owner@example.test', '{}', '{}'),
  ('7d000000-0000-4000-8000-000000000002', 'settle-outsider@example.test', '{}', '{}');
insert into public.profiles (user_id, timezone_name)
select id, 'UTC' from auth.users
where id in (
  '7d000000-0000-4000-8000-000000000001',
  '7d000000-0000-4000-8000-000000000002'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"7d000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

create temporary table pg_temp_spend (
  label text,
  reservation_id uuid,
  settlement_token uuid,
  spend_day date,
  reserved_micro_usd bigint,
  expires_at timestamptz
) on commit drop;

create temporary table pg_temp_claim (
  label text,
  generation_id uuid,
  completion_token uuid,
  state text,
  proposal_id uuid
) on commit drop;

create temporary table pg_temp_roadmap_claim (
  label text,
  generation_id uuid,
  completion_token uuid,
  state text,
  regeneration_number integer,
  proposal_id uuid
) on commit drop;

-- 1. The plan finish settles an open reservation --------------------------

insert into pg_temp_spend
select 'plan-open', * from public.reserve_ai_spend(
  'create_seven_day_plan', 5000, 'openai-gpt-5.6-luna-2026-08-10', 'USD');

insert into pg_temp_claim
select 'plan-open', * from public.begin_plan_generation(
  'settle-plan-key-0000000001', 'settle-plan-fingerprint-0001',
  pg_temp.day(0), 3, 0);

select is(
  (select proposal_id is not null from public.finish_plan_generation(
    (select completion_token from pg_temp_claim where label = 'plan-open'),
    'proposal', 'fittip.seven-day-plan.v2', 'seven-day-plan-v2-2026-08-12',
    'openai', 'gpt-5.6-luna', 'openai-gpt-5.6-luna-2026-08-10',
    (select reservation_id from pg_temp_spend where label = 'plan-open'),
    null, pg_temp.plan_body(pg_temp.day(0), pg_temp.day(2)), null, null
  )),
  true,
  'a plan result whose reservation is still open is recorded rather than refused'
);

select is(
  (select settled_at is not null from public.ai_spend_reservations
   where id = (select reservation_id from pg_temp_spend where label = 'plan-open')),
  true,
  'and the finish closed the reservation itself'
);

select is(
  (select charged_micro_usd from public.ai_spend_reservations
   where id = (select reservation_id from pg_temp_spend where label = 'plan-open')),
  5000::bigint,
  'at the amount it was holding, which is the conservative direction'
);

-- 2. A reservation the application settled first is untouched --------------

insert into pg_temp_spend
select 'plan-settled', * from public.reserve_ai_spend(
  'create_seven_day_plan', 5000, 'openai-gpt-5.6-luna-2026-08-10', 'USD');
select public.settle_ai_spend(
  (select settlement_token from pg_temp_spend where label = 'plan-settled'), 1200);

insert into pg_temp_claim
select 'plan-settled', * from public.begin_plan_generation(
  'settle-plan-key-0000000002', 'settle-plan-fingerprint-0002',
  pg_temp.day(4), 3, 0);

select is(
  (select proposal_id is not null from public.finish_plan_generation(
    (select completion_token from pg_temp_claim where label = 'plan-settled'),
    'proposal', 'fittip.seven-day-plan.v2', 'seven-day-plan-v2-2026-08-12',
    'openai', 'gpt-5.6-luna', 'openai-gpt-5.6-luna-2026-08-10',
    (select reservation_id from pg_temp_spend where label = 'plan-settled'),
    null, pg_temp.plan_body(pg_temp.day(4), pg_temp.day(6)), null, null
  )),
  true,
  'a plan result whose reservation was already settled is still accepted'
);

select is(
  (select charged_micro_usd from public.ai_spend_reservations
   where id = (select reservation_id from pg_temp_spend where label = 'plan-settled')),
  1200::bigint,
  'and its real charge is not overwritten with the ceiling'
);

-- 3. What the finish always refused, it still refuses ----------------------

insert into pg_temp_claim
select 'plan-refused', * from public.begin_plan_generation(
  'settle-plan-key-0000000003', 'settle-plan-fingerprint-0003',
  pg_temp.day(8), 3, 0);

-- A reservation for the other operation. Settling by accident here would be
-- the worst version of this change: the finish closing a hold that paid for
-- something else.
insert into pg_temp_spend
select 'wrong-operation', * from public.reserve_ai_spend(
  'create_roadmap', 5000, 'openai-gpt-5.6-luna-2026-08-10', 'USD');

select throws_ok(
  format(
    $q$select * from public.finish_plan_generation(
      %L::uuid, 'proposal', 'fittip.seven-day-plan.v2',
      'seven-day-plan-v2-2026-08-12', 'openai', 'gpt-5.6-luna',
      'openai-gpt-5.6-luna-2026-08-10', %L::uuid, null, %L::jsonb, null, null)$q$,
    (select completion_token from pg_temp_claim where label = 'plan-refused'),
    (select reservation_id from pg_temp_spend where label = 'wrong-operation'),
    pg_temp.plan_body(pg_temp.day(8), pg_temp.day(10))
  ),
  '22023', 'Invalid plan result.',
  'a plan result pointing at a roadmap reservation is still refused'
);

select is(
  (select settled_at from public.ai_spend_reservations
   where id = (select reservation_id from pg_temp_spend where label = 'wrong-operation')),
  null,
  'and the refused finish settled nothing'
);

select throws_ok(
  format(
    $q$select * from public.finish_plan_generation(
      %L::uuid, 'proposal', 'fittip.seven-day-plan.v2',
      'seven-day-plan-v2-2026-08-12', 'openai', 'gpt-5.6-luna',
      'a-rate-card-that-was-never-approved', %L::uuid, null, %L::jsonb,
      null, null)$q$,
    (select completion_token from pg_temp_claim where label = 'plan-refused'),
    (select reservation_id from pg_temp_spend where label = 'plan-open'),
    pg_temp.plan_body(pg_temp.day(8), pg_temp.day(10))
  ),
  '22023', 'That coaching model is not approved.',
  'a rate card the pairing does not name is still refused'
);

select throws_ok(
  format(
    $q$select * from public.finish_plan_generation(
      %L::uuid, 'proposal', 'fittip.seven-day-plan.v2',
      'seven-day-plan-v2-2026-08-12', 'fixture', 'fixture-corpus-v1',
      'fixture-no-spend', %L::uuid, null, %L::jsonb, null, null)$q$,
    (select completion_token from pg_temp_claim where label = 'plan-refused'),
    (select reservation_id from pg_temp_spend where label = 'plan-open'),
    pg_temp.plan_body(pg_temp.day(8), pg_temp.day(10))
  ),
  '22023', 'That coaching model is not approved.',
  'a fixture result claiming a reservation is still refused'
);

-- A refusal that happens AFTER the settle ---------------------------------
--
-- The sharper half of decision 3. The checks above refuse before the settle is
-- reached, so they prove little about it. A bad source list is validated after
-- the reservation has already been closed, which is the case that says whether
-- the whole function really is one transaction: it must roll the settle back
-- with everything else, leaving the reservation open and reusable.

insert into pg_temp_spend
select 'post-settle', * from public.reserve_ai_spend(
  'create_seven_day_plan', 5000, 'openai-gpt-5.6-luna-2026-08-10', 'USD');

insert into pg_temp_claim
select 'post-settle', * from public.begin_plan_generation(
  'settle-plan-key-0000000004', 'settle-plan-fingerprint-0004',
  pg_temp.day(12), 3, 0);

select throws_ok(
  format(
    $q$select * from public.finish_plan_generation(
      %L::uuid, 'proposal', 'fittip.seven-day-plan.v2',
      'seven-day-plan-v2-2026-08-12', 'openai', 'gpt-5.6-luna',
      'openai-gpt-5.6-luna-2026-08-10', %L::uuid, null, %L::jsonb,
      '[{"kind":"not-a-source-kind","recordId":"7d000000-0000-4000-8000-0000000000aa"}]'::jsonb,
      null)$q$,
    (select completion_token from pg_temp_claim where label = 'post-settle'),
    (select reservation_id from pg_temp_spend where label = 'post-settle'),
    pg_temp.plan_body(pg_temp.day(12), pg_temp.day(14))
  ),
  '22023', 'Invalid plan result.',
  'a source list the finish rejects still refuses the whole result'
);

select is(
  (select settled_at from public.ai_spend_reservations
   where id = (select reservation_id from pg_temp_spend where label = 'post-settle')),
  null,
  'and the settle it had already done was rolled back with it'
);

-- 4. The roadmap finish, which is a separate function ----------------------

insert into pg_temp_spend
select 'roadmap-open', * from public.reserve_ai_spend(
  'create_roadmap', 5000, 'openai-gpt-5.6-luna-2026-08-10', 'USD');

insert into pg_temp_roadmap_claim
select 'roadmap-open', * from public.begin_roadmap_generation(
  'settle-roadmap-key-000000001', 'settle-roadmap-fingerprint-0001',
  pg_temp.day(0), pg_temp.day(84), 0);

select is(
  (select proposal_id is not null from public.finish_roadmap_generation(
    (select completion_token from pg_temp_roadmap_claim where label = 'roadmap-open'),
    'proposal', 'fittip.roadmap.v2', 'roadmap-2026-08-10',
    'openai', 'gpt-5.6-luna', 'openai-gpt-5.6-luna-2026-08-10',
    (select reservation_id from pg_temp_spend where label = 'roadmap-open'),
    p_content => pg_temp.roadmap_body(
      pg_temp.day(0), pg_temp.day(84), 'Settled by the finish'),
    p_sources => '[]'::jsonb
  )),
  true,
  'a roadmap result whose reservation is still open is recorded rather than refused'
);

select is(
  (select settled_at is not null from public.ai_spend_reservations
   where id = (select reservation_id from pg_temp_spend where label = 'roadmap-open')),
  true,
  'and the roadmap finish closed the reservation itself'
);

select is(
  (select charged_micro_usd from public.ai_spend_reservations
   where id = (select reservation_id from pg_temp_spend where label = 'roadmap-open')),
  5000::bigint,
  'at the amount it was holding, as on the plan side'
);

insert into pg_temp_spend
select 'roadmap-settled', * from public.reserve_ai_spend(
  'create_roadmap', 5000, 'openai-gpt-5.6-luna-2026-08-10', 'USD');
select public.settle_ai_spend(
  (select settlement_token from pg_temp_spend where label = 'roadmap-settled'), 900);

insert into pg_temp_roadmap_claim
select 'roadmap-settled', * from public.begin_roadmap_generation(
  'settle-roadmap-key-000000002', 'settle-roadmap-fingerprint-0002',
  pg_temp.day(0), pg_temp.day(84), 0);

select is(
  (select proposal_id is not null from public.finish_roadmap_generation(
    (select completion_token from pg_temp_roadmap_claim where label = 'roadmap-settled'),
    'proposal', 'fittip.roadmap.v2', 'roadmap-2026-08-10',
    'openai', 'gpt-5.6-luna', 'openai-gpt-5.6-luna-2026-08-10',
    (select reservation_id from pg_temp_spend where label = 'roadmap-settled'),
    p_content => pg_temp.roadmap_body(
      pg_temp.day(0), pg_temp.day(84), 'Settled by the application'),
    p_sources => '[]'::jsonb
  )),
  true,
  'a roadmap result whose reservation was already settled is still accepted'
);

select is(
  (select charged_micro_usd from public.ai_spend_reservations
   where id = (select reservation_id from pg_temp_spend where label = 'roadmap-settled')),
  900::bigint,
  'and its real charge survives the finish'
);

-- The roadmap refusals, which are a second copy of the same predicate --------
--
-- `finish_roadmap_generation` carries its own hand-written version of the
-- five-part WHERE clause. Proving the plan side says nothing about it, and a
-- dropped predicate there is precisely the mistake that would survive review.

insert into pg_temp_roadmap_claim
select 'roadmap-refused', * from public.begin_roadmap_generation(
  'settle-roadmap-key-000000003', 'settle-roadmap-fingerprint-0003',
  pg_temp.day(0), pg_temp.day(84), 0);

select throws_ok(
  format(
    $q$select * from public.finish_roadmap_generation(
      %L::uuid, 'proposal', 'fittip.roadmap.v2', 'roadmap-2026-08-10',
      'openai', 'gpt-5.6-luna', 'openai-gpt-5.6-luna-2026-08-10', %L::uuid,
      p_content => %L::jsonb, p_sources => '[]'::jsonb)$q$,
    (select completion_token from pg_temp_roadmap_claim where label = 'roadmap-refused'),
    (select reservation_id from pg_temp_spend where label = 'plan-settled'),
    pg_temp.roadmap_body(pg_temp.day(0), pg_temp.day(84), 'Wrong operation')
  ),
  '22023', 'Invalid roadmap result.',
  'a roadmap result pointing at a plan reservation is refused'
);

insert into pg_temp_spend
select 'roadmap-post-settle', * from public.reserve_ai_spend(
  'create_roadmap', 5000, 'openai-gpt-5.6-luna-2026-08-10', 'USD');

-- The roadmap function's post-settle refusals are bare raises with no
-- enclosing handler, unlike the plan side's. Same outcome, different mechanism,
-- so it is worth exercising rather than inferring.
select throws_ok(
  format(
    $q$select * from public.finish_roadmap_generation(
      %L::uuid, 'proposal', 'fittip.roadmap.v2', 'roadmap-2026-08-10',
      'openai', 'gpt-5.6-luna', 'openai-gpt-5.6-luna-2026-08-10', %L::uuid,
      p_content => %L::jsonb,
      p_sources => '[{"kind":"not-a-source-kind","recordId":"7d000000-0000-4000-8000-0000000000bb"}]'::jsonb)$q$,
    (select completion_token from pg_temp_roadmap_claim where label = 'roadmap-refused'),
    (select reservation_id from pg_temp_spend where label = 'roadmap-post-settle'),
    pg_temp.roadmap_body(pg_temp.day(0), pg_temp.day(84), 'Bad sources')
  ),
  '22023', 'Invalid roadmap result.',
  'a roadmap source list the finish rejects still refuses the whole result'
);

select is(
  (select settled_at from public.ai_spend_reservations
   where id = (select reservation_id from pg_temp_spend where label = 'roadmap-post-settle')),
  null,
  'and the roadmap settle it had already done was rolled back with it'
);

-- 5. Another owner's reservation is neither usable nor settled -------------

select set_config(
  'request.jwt.claims',
  '{"sub":"7d000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

insert into pg_temp_spend
select 'outsider', * from public.reserve_ai_spend(
  'create_seven_day_plan', 5000, 'openai-gpt-5.6-luna-2026-08-10', 'USD');

select set_config(
  'request.jwt.claims',
  '{"sub":"7d000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select throws_ok(
  format(
    $q$select * from public.finish_plan_generation(
      %L::uuid, 'proposal', 'fittip.seven-day-plan.v2',
      'seven-day-plan-v2-2026-08-12', 'openai', 'gpt-5.6-luna',
      'openai-gpt-5.6-luna-2026-08-10', %L::uuid, null, %L::jsonb, null, null)$q$,
    (select completion_token from pg_temp_claim where label = 'plan-refused'),
    (select reservation_id from pg_temp_spend where label = 'outsider'),
    pg_temp.plan_body(pg_temp.day(8), pg_temp.day(10))
  ),
  '22023', 'Invalid plan result.',
  'a result pointing at another owner''s reservation is still refused'
);

-- Read as a role RLS does not filter. As `authenticated` acting for owner 1
-- this row is invisible, so `settled_at` comes back null whether the finish
-- left it open or closed it -- and `is(null, null)` passes either way. The
-- count is asserted alongside the state for the same reason: a check that
-- cannot see the row proves nothing about it.
reset role;

select is(
  (select count(*)::bigint from public.ai_spend_reservations
   where id = (select reservation_id from pg_temp_spend where label = 'outsider')
     and user_id = '7d000000-0000-4000-8000-000000000002'
     and settled_at is null),
  1::bigint,
  'and the outsider''s reservation is still there, still open, still theirs'
);

set local role authenticated;
select set_config('request.jwt.claims', null, true);

select * from finish();
rollback;
