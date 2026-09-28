-- A7-3: persistence for `fill_session_activities`.
--
-- What is proved here:
--   1. The four tables are RLS-enabled, readable by their owner only, and
--      writable by nobody but the three functions; the completion token is
--      withheld from the owner's own SELECT.
--   2. A claim is for this owner's active, not-yet-past session; a replay
--      answers with what was recorded and never 'claimed' twice.
--   3. The finish records a fixture proposal without spend, settles an open
--      live reservation with the proposal (ADR-019), refuses a reservation for
--      another operation, and one reservation pays for one proposal.
--   4. Content the plan would refuse is refused here too, and a library link
--      must be one of this owner's definitions in the same measurement mode.
--   5. A decision is final: the same decision replays, the other is refused.
--   6. Deleting the session keeps the proposal, with its session id cleared.

begin;

create extension if not exists pgtap with schema extensions;

select plan(49);

-- Owners, a plan, three sessions and a library entry ------------------------

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('a7300000-0000-4000-8000-000000000001', 'fill-owner@example.test', '{}', '{}'),
  ('a7300000-0000-4000-8000-000000000002', 'fill-outsider@example.test', '{}', '{}');
insert into public.profiles (user_id, timezone_name)
select id, 'UTC' from auth.users
where id in (
  'a7300000-0000-4000-8000-000000000001',
  'a7300000-0000-4000-8000-000000000002'
);

insert into public.rolling_plans (user_id)
values
  ('a7300000-0000-4000-8000-000000000001'),
  ('a7300000-0000-4000-8000-000000000002');

insert into public.rolling_plan_sessions (
  id, user_id, plan_id, local_date, position, title, sport, status, cancelled_at
)
select session.id, plan.user_id, plan.id, session.local_date, 0,
  session.title, 'Strength', session.status,
  case when session.status = 'cancelled' then now() end
from (values
  ('a7300000-0000-4000-8000-0000000000f1'::uuid,
    'a7300000-0000-4000-8000-000000000001'::uuid,
    (clock_timestamp() at time zone 'utc')::date + 2, 'Lower body', 'active'),
  ('a7300000-0000-4000-8000-0000000000f2',
    'a7300000-0000-4000-8000-000000000001',
    (clock_timestamp() at time zone 'utc')::date + 3, 'Called off', 'cancelled'),
  ('a7300000-0000-4000-8000-0000000000f3',
    'a7300000-0000-4000-8000-000000000001',
    (clock_timestamp() at time zone 'utc')::date - 5, 'Last week', 'active'),
  ('a7300000-0000-4000-8000-0000000000f9',
    'a7300000-0000-4000-8000-000000000002',
    (clock_timestamp() at time zone 'utc')::date + 2, 'Not yours', 'active')
) as session(id, user_id, local_date, title, status)
join public.rolling_plans plan on plan.user_id = session.user_id;

insert into public.personal_activities (
  id, user_id, name, sport, measurement_mode
) values
  ('a7300000-0000-4000-8000-0000000000a1',
    'a7300000-0000-4000-8000-000000000001', 'Back squat', 'Strength',
    'sets_reps_load'),
  ('a7300000-0000-4000-8000-0000000000a9',
    'a7300000-0000-4000-8000-000000000002', 'Their squat', 'Strength',
    'sets_reps_load');

insert into public.ai_spend_reservations (
  id, user_id, operation, spend_day, reserved_micro_usd, rate_card_version,
  expires_at
) values (
  'a7300000-0000-4000-8000-0000000000c9',
  'a7300000-0000-4000-8000-000000000002', 'fill_session_activities',
  (now() at time zone 'utc')::date, 5600, 'openai-gpt-5.6-luna-2026-08-10',
  now() + interval '15 minutes'
);

create function pg_temp.body(p_link text default null, p_target jsonb default null)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'schemaVersion', 'fittip.session-activities.v1',
    'summary', 'Squats from last week, then lunges.',
    'activities', jsonb_build_array(
      jsonb_build_object(
        'personalActivityId', p_link,
        'name', 'Back squat',
        'sport', 'Strength',
        'instructions', null,
        'measurementMode', 'sets_reps_load',
        'target', coalesce(
          p_target,
          '{"groups":[{"sets":3,"reps":5,"load":80}],"load_unit":"kg"}'::jsonb
        ),
        'rationale', 'A small step over last week.'
      )
    )
  )
$$;

-- 1. Structure and privileges ----------------------------------------------

select ok(
  (select bool_and(relrowsecurity) from pg_class
   where relname in (
     'session_activity_requests', 'session_activity_proposals',
     'session_activity_proposal_sources', 'session_activity_decisions'
   ) and relnamespace = 'public'::regnamespace),
  'every A7-3 table has row level security enabled'
);

select ok(
  not has_table_privilege('authenticated', 'public.session_activity_proposals', 'INSERT')
  and not has_table_privilege('authenticated', 'public.session_activity_proposals', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.session_activity_decisions', 'INSERT')
  and not has_table_privilege('authenticated', 'public.session_activity_requests', 'DELETE'),
  'an owner writes nothing directly; only the functions do'
);

select ok(
  not has_column_privilege(
    'authenticated', 'public.session_activity_requests', 'completion_token', 'SELECT'),
  'the completion token is withheld from the owner''s own SELECT'
);

select ok(
  not has_table_privilege('anon', 'public.session_activity_proposals', 'SELECT'),
  'anonymous callers read nothing'
);

select ok(
  has_function_privilege('authenticated',
    'public.begin_session_activity_generation(text, text, uuid, bigint, text)', 'EXECUTE')
  and not has_function_privilege('anon',
    'public.begin_session_activity_generation(text, text, uuid, bigint, text)', 'EXECUTE')
  and not has_function_privilege('authenticated',
    'public.session_activities_content_is_valid(jsonb, uuid)', 'EXECUTE'),
  'the claim is callable by an owner only, and the content check by nobody'
);

select ok(
  not has_function_privilege('anon',
    'public.finish_session_activity_generation(uuid, text, text, text, text, text, text, uuid, text, jsonb, jsonb, text)',
    'EXECUTE')
  and not has_function_privilege('anon',
    'public.decide_session_activity_proposal(uuid, text)', 'EXECUTE'),
  'anonymous callers can neither finish nor decide'
);

select ok(
  not has_function_privilege('service_role',
    'public.begin_session_activity_generation(text, text, uuid, bigint, text)', 'EXECUTE')
  and not has_function_privilege('service_role',
    'public.finish_session_activity_generation(uuid, text, text, text, text, text, text, uuid, text, jsonb, jsonb, text)',
    'EXECUTE')
  and not has_function_privilege('service_role',
    'public.decide_session_activity_proposal(uuid, text)', 'EXECUTE'),
  'service_role is granted none of the three'
);

select ok(
  has_function_privilege('authenticated',
    'public.reserve_ai_spend(text, bigint, text, text)', 'EXECUTE')
  and not has_function_privilege('anon',
    'public.reserve_ai_spend(text, bigint, text, text)', 'EXECUTE'),
  'reserve_ai_spend keeps its grants after the replacement'
);

-- As the owner -----------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a7300000-0000-4000-8000-000000000001","role":"authenticated"}', true);

create temporary table claim (
  label text, generation_id uuid, completion_token uuid, state text, proposal_id uuid
) on commit drop;
create temporary table spend (
  label text, reservation_id uuid, settlement_token uuid, spend_day date,
  reserved_micro_usd bigint, expires_at timestamptz
) on commit drop;

-- 2. Claiming ----------------------------------------------------------------

insert into claim
select 'fixture', * from public.begin_session_activity_generation(
  'fill-key-000000000000001', 'fill-fingerprint-000001',
  'a7300000-0000-4000-8000-0000000000f1', 0, 'Only 45 minutes.');

select is((select state from claim where label = 'fixture'), 'claimed',
  'the first claim for an active session is the one that may call the coach');

select is(
  (select state from public.begin_session_activity_generation(
    'fill-key-000000000000001', 'fill-fingerprint-000001',
    'a7300000-0000-4000-8000-0000000000f1', 0, 'Only 45 minutes.')),
  'pending',
  'the same key replays the stored state rather than claiming again'
);

select throws_ok(
  $$ select * from public.begin_session_activity_generation(
    'fill-key-000000000000001', 'fill-fingerprint-changed',
    'a7300000-0000-4000-8000-0000000000f1', 0, null) $$,
  'PT409', null,
  'the same key with a different request conflicts'
);

select throws_ok(
  $$ select * from public.begin_session_activity_generation(
    'fill-key-000000000000002', 'fill-fingerprint-000002',
    'a7300000-0000-4000-8000-0000000000f9', 0, null) $$,
  'PT409', null,
  'another owner''s session is refused as if it did not exist'
);

select throws_ok(
  $$ select * from public.begin_session_activity_generation(
    'fill-key-000000000000003', 'fill-fingerprint-000003',
    'a7300000-0000-4000-8000-0000000000f2', 0, null) $$,
  'PT409', null,
  'a cancelled session is refused'
);

select throws_ok(
  $$ select * from public.begin_session_activity_generation(
    'fill-key-000000000000004', 'fill-fingerprint-000004',
    'a7300000-0000-4000-8000-0000000000f3', 0, null) $$,
  'PT422', null,
  'a session already in the past is refused'
);

select throws_ok(
  $$ select * from public.begin_session_activity_generation(
    'fill-key-000000000000005', 'fill-fingerprint-000005',
    'a7300000-0000-4000-8000-0000000000f1', 0, repeat('x', 501)) $$,
  '22023', null,
  'a note over 500 characters is refused'
);

-- 3. Finishing: fixture, content, note -----------------------------------------

select throws_ok(
  $$ select * from public.finish_session_activity_generation(
    (select completion_token from claim where label = 'fixture'), 'proposal',
    'fittip.session-activities.v1', 'session-activities-v1-2026-09-28',
    'fixture', 'fixture-corpus-v1', 'fixture-no-spend', null,
    'A different note.', pg_temp.body(), null, null) $$,
  '22023', null,
  'a note that is not the one the claim was made for is refused'
);

select throws_ok(
  $$ select * from public.finish_session_activity_generation(
    (select completion_token from claim where label = 'fixture'), 'proposal',
    'fittip.session-activities.v1', 'session-activities-v1-2026-09-28',
    'fixture', 'fixture-corpus-v1', 'fixture-no-spend', null,
    'Only 45 minutes.',
    pg_temp.body(null, '{"groups":[{"sets":3,"reps":5,"load":80}]}'), null, null) $$,
  '22023', null,
  'a target the plan would refuse (a load without its unit) is refused'
);

select throws_ok(
  $$ select * from public.finish_session_activity_generation(
    (select completion_token from claim where label = 'fixture'), 'proposal',
    'fittip.session-activities.v1', 'session-activities-v1-2026-09-28',
    'fixture', 'fixture-corpus-v1', 'fixture-no-spend', null,
    'Only 45 minutes.',
    pg_temp.body('a7300000-0000-4000-8000-0000000000a9'), null, null) $$,
  '22023', null,
  'a link to another owner''s library entry is refused'
);

select throws_ok(
  $$ select * from public.finish_session_activity_generation(
    (select completion_token from claim where label = 'fixture'), 'proposal',
    'fittip.session-activities.v1', 'session-activities-v1-2026-09-28',
    'fixture', 'fixture-corpus-v1', 'fixture-no-spend', null,
    'Only 45 minutes.',
    jsonb_set(pg_temp.body(), '{activities}',
      (select jsonb_agg(pg_temp.body() -> 'activities' -> 0)
       from generate_series(1, 13))), null, null) $$,
  '22023', null,
  'more than twelve activities is refused'
);

select throws_ok(
  $$ select * from public.finish_session_activity_generation(
    (select completion_token from claim where label = 'fixture'), 'proposal',
    'fittip.session-activities.v1', 'session-activities-v1-2026-09-28',
    'fixture', 'fixture-corpus-v1', 'fixture-no-spend', null,
    'Only 45 minutes.',
    jsonb_set(pg_temp.body(), '{activities,0,measurementMode}', '"unmeasured"'),
    null, null) $$,
  '22023', null,
  'an unmeasured activity carrying a target is refused'
);

select throws_ok(
  $$ select * from public.finish_session_activity_generation(
    (select completion_token from claim where label = 'fixture'), 'proposal',
    'fittip.session-activities.v1', 'session-activities-v1-2026-09-28',
    'fixture', 'fixture-corpus-v1', 'fixture-no-spend', null,
    'Only 45 minutes.',
    pg_temp.body() || '{"safetyConsiderations":["   "]}'::jsonb, null, null) $$,
  '22023', null,
  'a blank safety consideration is refused, as the application refuses it'
);

select throws_ok(
  $$ select * from public.finish_session_activity_generation(
    (select completion_token from claim where label = 'fixture'), 'proposal',
    'fittip.session-activities.v1', 'session-activities-v1-2026-09-28',
    'fixture', 'fixture-corpus-v1', 'fixture-no-spend',
    '00000000-0000-4000-8000-000000000000',
    'Only 45 minutes.', pg_temp.body(), null, null) $$,
  '22023', null,
  'a fixture result claiming a reservation is refused'
);

select is(
  (select state from public.finish_session_activity_generation(
    (select completion_token from claim where label = 'fixture'), 'proposal',
    'fittip.session-activities.v1', 'session-activities-v1-2026-09-28',
    'fixture', 'fixture-corpus-v1', 'fixture-no-spend', null,
    'Only 45 minutes.',
    pg_temp.body('a7300000-0000-4000-8000-0000000000a1'),
    jsonb_build_array(
      jsonb_build_object('kind', 'plan_session',
        'recordId', 'a7300000-0000-4000-8000-0000000000f1'),
      jsonb_build_object('kind', 'personal_activity',
        'recordId', 'a7300000-0000-4000-8000-0000000000a1')
    ), null)),
  'completed',
  'a valid fixture result linking the owner''s own library entry is recorded'
);

select is(
  (select session_id from public.session_activity_proposals
   where request_id = (select generation_id from claim where label = 'fixture')),
  'a7300000-0000-4000-8000-0000000000f1'::uuid,
  'the proposal names the session it was for'
);

select is(
  (select note from public.session_activity_proposals
   where request_id = (select generation_id from claim where label = 'fixture')),
  'Only 45 minutes.',
  'and keeps the owner''s note with it'
);

select is(
  (select array_agg(source_kind order by ordinal)
   from public.session_activity_proposal_sources
   where proposal_id = (select proposal_id from public.session_activity_requests
     where id = (select generation_id from claim where label = 'fixture'))),
  array['plan_session', 'personal_activity'],
  'the sources that reached the coach are recorded in order'
);

select is(
  (select proposal_id is not null from public.finish_session_activity_generation(
    (select completion_token from claim where label = 'fixture'), 'proposal',
    'fittip.session-activities.v1', 'session-activities-v1-2026-09-28',
    'fixture', 'fixture-corpus-v1', 'fixture-no-spend', null,
    'Only 45 minutes.', pg_temp.body(), null, null)),
  true,
  'a repeated finish replays the recorded proposal'
);

select throws_ok(
  $$ select * from public.finish_session_activity_generation(
    (select completion_token from claim where label = 'fixture'), 'failed',
    p_safe_failure_code => 'provider_unavailable') $$,
  'PT409', null,
  'a finished request cannot be re-finished as a failure'
);

-- 4. Finishing live: spend -------------------------------------------------------

insert into spend
select 'fill', * from public.reserve_ai_spend(
  'fill_session_activities', 5600, 'openai-gpt-5.6-luna-2026-08-10', 'USD');

select is((select count(*)::integer from spend where label = 'fill'), 1,
  'reserve_ai_spend accepts the new operation');

insert into spend
select 'plan', * from public.reserve_ai_spend(
  'create_seven_day_plan', 5600, 'openai-gpt-5.6-luna-2026-08-10', 'USD');

insert into claim
select 'live', * from public.begin_session_activity_generation(
  'fill-key-000000000000010', 'fill-fingerprint-000010',
  'a7300000-0000-4000-8000-0000000000f1', 0, null);

select throws_ok(
  $$ select * from public.finish_session_activity_generation(
    (select completion_token from claim where label = 'live'), 'proposal',
    'fittip.session-activities.v1', 'session-activities-v1-2026-09-28',
    'openai', 'gpt-5.6-luna', 'openai-gpt-5.6-luna-2026-08-10',
    (select reservation_id from spend where label = 'plan'),
    null, pg_temp.body(), null, null) $$,
  '22023', null,
  'a reservation that paid for another operation is refused'
);

select is(
  (select settled_at is null from public.ai_spend_reservations
   where id = (select reservation_id from spend where label = 'plan')),
  true,
  'and the refusal settled nothing'
);

select throws_ok(
  $$ select * from public.finish_session_activity_generation(
    (select completion_token from claim where label = 'live'), 'proposal',
    'fittip.session-activities.v1', 'session-activities-v1-2026-09-28',
    'openai', 'gpt-5.6-luna', 'openai-gpt-5.6-luna-2026-08-10',
    'a7300000-0000-4000-8000-0000000000c9',
    null, pg_temp.body(), null, null) $$,
  '22023', null,
  'another owner''s reservation for this operation is refused'
);

select throws_ok(
  $$ select * from public.finish_session_activity_generation(
    (select completion_token from claim where label = 'live'), 'proposal',
    'fittip.session-activities.v1', 'session-activities-v1-2026-09-28',
    'openai', 'gpt-5.6-luna', 'openai-gpt-5.6-luna-2026-08-10',
    (select reservation_id from spend where label = 'fill'),
    null, pg_temp.body(), '[{"kind":"x","recordId":"a7300000-0000-4000-8000-0000000000f1"}]',
    null) $$,
  '22023', null,
  'a bad source list is refused after the settle has already run'
);

select is(
  (select settled_at is null from public.ai_spend_reservations
   where id = (select reservation_id from spend where label = 'fill')),
  true,
  'and that settle rolled back with the refusal: one transaction, not two'
);

select is(
  (select state from public.finish_session_activity_generation(
    (select completion_token from claim where label = 'live'), 'proposal',
    'fittip.session-activities.v1', 'session-activities-v1-2026-09-28',
    'openai', 'gpt-5.6-luna', 'openai-gpt-5.6-luna-2026-08-10',
    (select reservation_id from spend where label = 'fill'),
    null, pg_temp.body(), null, null)),
  'completed',
  'a live result with its own open reservation is recorded'
);

select is(
  (select charged_micro_usd from public.ai_spend_reservations
   where id = (select reservation_id from spend where label = 'fill')),
  5600::bigint,
  'and the finish settled that reservation at what it was holding'
);

insert into claim
select 'reuse', * from public.begin_session_activity_generation(
  'fill-key-000000000000011', 'fill-fingerprint-000011',
  'a7300000-0000-4000-8000-0000000000f1', 0, null);

select throws_ok(
  $$ select * from public.finish_session_activity_generation(
    (select completion_token from claim where label = 'reuse'), 'proposal',
    'fittip.session-activities.v1', 'session-activities-v1-2026-09-28',
    'openai', 'gpt-5.6-luna', 'openai-gpt-5.6-luna-2026-08-10',
    (select reservation_id from spend where label = 'fill'),
    null, pg_temp.body(), null, null) $$,
  '23505', null,
  'one reservation pays for exactly one proposal'
);

select is(
  (select state from public.finish_session_activity_generation(
    (select completion_token from claim where label = 'reuse'), 'failed',
    p_safe_failure_code => 'output_invalid')),
  'failed',
  'a failed attempt is closed with its bounded code'
);

-- 5. Decisions ------------------------------------------------------------------

select is(
  public.decide_session_activity_proposal(
    (select proposal_id from public.session_activity_requests
     where id = (select generation_id from claim where label = 'fixture')),
    'accepted'),
  'accepted',
  'the owner accepts their proposal'
);

select is(
  public.decide_session_activity_proposal(
    (select proposal_id from public.session_activity_requests
     where id = (select generation_id from claim where label = 'fixture')),
    'accepted'),
  'accepted',
  'the same decision again replays'
);

select throws_ok(
  format($$ select public.decide_session_activity_proposal(%L, 'dismissed') $$,
    (select proposal_id from public.session_activity_requests
     where id = (select generation_id from claim where label = 'fixture'))),
  'PT433', null,
  'a decided proposal cannot be decided the other way'
);

-- Kept while still the owner: the outsider cannot read it back.
create temporary table decided on commit drop as
select proposal_id from public.session_activity_requests
where id = (select generation_id from claim where label = 'fixture');

-- As the outsider ------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"a7300000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select is(
  (select count(*)::integer from public.session_activity_proposals),
  0,
  'another owner sees none of these proposals'
);

select is(
  (select count(*)::integer from public.session_activity_requests),
  0,
  'nor the requests'
);

select is(
  (select count(*)::integer from public.session_activity_decisions),
  0,
  'nor the decisions'
);

select throws_ok(
  format($$ select * from public.finish_session_activity_generation(%L, 'failed',
    p_safe_failure_code => 'provider_unavailable') $$,
    (select completion_token from claim where label = 'live')),
  'PT409', null,
  'another owner cannot close this owner''s attempt with its token'
);

select throws_ok(
  format($$ select public.decide_session_activity_proposal(%L, 'dismissed') $$,
    (select proposal_id from decided)),
  'PT409', null,
  'nor decide this owner''s proposal'
);

-- 6. Deleting the session keeps the record ---------------------------------------

reset role;
delete from public.rolling_plan_sessions
where id = 'a7300000-0000-4000-8000-0000000000f1';

select is(
  (select count(*)::integer from public.session_activity_proposals
   where user_id = 'a7300000-0000-4000-8000-000000000001'),
  2,
  'the proposals outlive the session they were for'
);

select is(
  (select count(*)::integer from public.session_activity_proposals
   where user_id = 'a7300000-0000-4000-8000-000000000001'
     and session_id is null),
  2,
  'with the session id cleared rather than pointing at nothing'
);

select is(
  (select count(*)::integer from public.session_activity_decisions
   where user_id = 'a7300000-0000-4000-8000-000000000001'),
  1,
  'and the owner''s decision stays with it'
);

select * from finish();
rollback;
