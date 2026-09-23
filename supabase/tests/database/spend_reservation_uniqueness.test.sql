-- One reservation, one proposal.
--
-- The finish functions already prove a reservation is this owner's, covers this
-- operation, is priced by the same rate card, and has settled. What they never
-- proved is that no *other* proposal already named it. This file proves the
-- database now does, and -- just as important -- that it still lets through the
-- one case where two proposal rows legitimately share a reservation.
--
-- The behavioural assertions go through the real RPCs rather than writing the
-- tables directly, because `authenticated` holds no insert on either table: a
-- direct insert would prove something about a privilege nobody has. Both
-- reservations are settled first, since an unsettled one is refused by an
-- earlier check and would hide the uniqueness behind it.

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

select plan(12);

-- Shape ----------------------------------------------------------------------
--
-- The predicates are asserted, not just the uniqueness, because the whole point
-- of this migration is that the two differ and that the difference is deliberate.

select is(
  (select indisunique
   from pg_index
   where indexrelid = 'public.plan_proposals_spend_idx'::regclass),
  true,
  'a settled reservation may be named by only one plan proposal'
);

select is(
  (select pg_get_expr(indpred, indrelid)
   from pg_index
   where indexrelid = 'public.plan_proposals_spend_idx'::regclass),
  '(spend_reservation_id IS NOT NULL)',
  'the plan index covers every row naming a reservation, because every plan proposal is a purchase'
);

select is(
  (select indisunique
   from pg_index
   where indexrelid = 'public.roadmap_proposals_spend_idx'::regclass),
  true,
  'a settled reservation may be named by only one purchased roadmap proposal'
);

select is(
  (select pg_get_expr(indpred, indrelid)
   from pg_index
   where indexrelid = 'public.roadmap_proposals_spend_idx'::regclass),
  '((spend_reservation_id IS NOT NULL) AND (origin <> ''owner_edit''::text))',
  'the roadmap index exempts owner edits, which inherit the reservation they descend from'
);

-- Owner ----------------------------------------------------------------------

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values ('7b000000-0000-4000-8000-000000000001', 'spend-owner@example.test', '{}', '{}');
insert into public.profiles (user_id, timezone_name)
values ('7b000000-0000-4000-8000-000000000001', 'UTC');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"7b000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- A settled reservation for each operation -----------------------------------

create temporary table pg_temp_spend (
  label text,
  reservation_id uuid,
  settlement_token uuid,
  spend_day date,
  reserved_micro_usd bigint,
  expires_at timestamptz
) on commit drop;

insert into pg_temp_spend
select 'plan', * from public.reserve_ai_spend(
  'create_seven_day_plan', 5000, 'openai-gpt-5.6-luna-2026-08-10', 'USD');
insert into pg_temp_spend
select 'roadmap', * from public.reserve_ai_spend(
  'create_roadmap', 5000, 'openai-gpt-5.6-luna-2026-08-10', 'USD');

select public.settle_ai_spend(
  (select settlement_token from pg_temp_spend where label = 'plan'), 4000);
select public.settle_ai_spend(
  (select settlement_token from pg_temp_spend where label = 'roadmap'), 4000);

-- The plan side --------------------------------------------------------------

create temporary table pg_temp_plan_claim (
  label text,
  generation_id uuid,
  completion_token uuid,
  state text,
  proposal_id uuid
) on commit drop;

insert into pg_temp_plan_claim
select 'first', * from public.begin_plan_generation(
  'spend-plan-key-0000000001', 'spend-plan-fingerprint-0001',
  pg_temp.day(0), 3, 0);
insert into pg_temp_plan_claim
select 'second', * from public.begin_plan_generation(
  'spend-plan-key-0000000002', 'spend-plan-fingerprint-0002',
  pg_temp.day(4), 3, 0);

select is(
  (select proposal_id is not null from public.finish_plan_generation(
    (select completion_token from pg_temp_plan_claim where label = 'first'),
    'proposal', 'fittip.seven-day-plan.v2', 'seven-day-plan-v2-2026-08-12',
    'openai', 'gpt-5.6-luna', 'openai-gpt-5.6-luna-2026-08-10',
    (select reservation_id from pg_temp_spend where label = 'plan'),
    null, pg_temp.plan_body(pg_temp.day(0), pg_temp.day(2)), null, null
  )),
  true,
  'the first live plan result attaches its settled reservation and is recorded'
);

select throws_ok(
  format(
    $q$select * from public.finish_plan_generation(
      %L::uuid, 'proposal', 'fittip.seven-day-plan.v2',
      'seven-day-plan-v2-2026-08-12', 'openai', 'gpt-5.6-luna',
      'openai-gpt-5.6-luna-2026-08-10', %L::uuid, null, %L::jsonb, null, null)$q$,
    (select completion_token from pg_temp_plan_claim where label = 'second'),
    (select reservation_id from pg_temp_spend where label = 'plan'),
    pg_temp.plan_body(pg_temp.day(4), pg_temp.day(6))
  ),
  '23505', NULL,
  'a second plan proposal naming the same settled reservation is refused by the database'
);

select is(
  (select count(*)::integer
   from public.plan_proposals
   where spend_reservation_id
     = (select reservation_id from pg_temp_spend where label = 'plan')),
  1,
  'one reservation still pays for exactly one plan proposal'
);

-- The roadmap side -----------------------------------------------------------

create temporary table pg_temp_roadmap_claim (
  label text,
  generation_id uuid,
  completion_token uuid,
  state text,
  regeneration_number integer,
  proposal_id uuid
) on commit drop;

insert into pg_temp_roadmap_claim
select 'first', * from public.begin_roadmap_generation(
  'spend-roadmap-key-000000001', 'spend-roadmap-fingerprint-0001',
  pg_temp.day(0), pg_temp.day(84), 0);

select is(
  (select proposal_id is not null from public.finish_roadmap_generation(
    (select completion_token from pg_temp_roadmap_claim where label = 'first'),
    'proposal', 'fittip.roadmap.v2', 'roadmap-2026-08-10',
    'openai', 'gpt-5.6-luna', 'openai-gpt-5.6-luna-2026-08-10',
    (select reservation_id from pg_temp_spend where label = 'roadmap'),
    p_content => pg_temp.roadmap_body(
      pg_temp.day(0), pg_temp.day(84), 'Paid for once'),
    p_sources => '[]'::jsonb
  )),
  true,
  'the first live roadmap result attaches its settled reservation and is recorded'
);

insert into pg_temp_roadmap_claim
select 'second', * from public.begin_roadmap_generation(
  'spend-roadmap-key-000000002', 'spend-roadmap-fingerprint-0002',
  pg_temp.day(0), pg_temp.day(84), 0);

select throws_ok(
  format(
    $q$select * from public.finish_roadmap_generation(
      %L::uuid, 'proposal', 'fittip.roadmap.v2', 'roadmap-2026-08-10',
      'openai', 'gpt-5.6-luna', 'openai-gpt-5.6-luna-2026-08-10', %L::uuid,
      p_content => %L::jsonb, p_sources => '[]'::jsonb)$q$,
    (select completion_token from pg_temp_roadmap_claim where label = 'second'),
    (select reservation_id from pg_temp_spend where label = 'roadmap'),
    pg_temp.roadmap_body(pg_temp.day(0), pg_temp.day(84), 'Paid for twice')
  ),
  '23505', NULL,
  'a second roadmap generation naming the same settled reservation is refused by the database'
);

-- The exemption, which is the reason the two predicates differ. Editing a live
-- proposal copies its reservation onto the new `owner_edit` row on purpose; a
-- uniqueness that did not exempt it would have made a paid roadmap uneditable.

select lives_ok(
  format(
    $q$select * from public.apply_roadmap_proposal_change(
      'edit', %L::uuid, %L::jsonb)$q$,
    (select id from public.roadmap_proposals
     where origin <> 'owner_edit'
       and spend_reservation_id
         = (select reservation_id from pg_temp_spend where label = 'roadmap')
     limit 1),
    pg_temp.roadmap_body(pg_temp.day(0), pg_temp.day(84), 'Edited by the owner')
  ),
  'a purchased roadmap proposal can still be edited'
);

select is(
  (select count(*)::integer
   from public.roadmap_proposals
   where spend_reservation_id
     = (select reservation_id from pg_temp_spend where label = 'roadmap')),
  2,
  'the edit carries the same reservation, so two rows name it and only one is a purchase'
);

select is(
  (select count(*)::integer
   from public.roadmap_proposals
   where origin <> 'owner_edit'
     and spend_reservation_id
       = (select reservation_id from pg_temp_spend where label = 'roadmap')),
  1,
  'one reservation still pays for exactly one roadmap generation'
);

select * from finish();
rollback;
