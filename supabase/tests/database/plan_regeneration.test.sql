-- Plan regeneration with feedback.
--
-- What this proves, in the order it matters:
--
--   1. The boundary. Two new signatures, granted to `authenticated` alone, and
--      the old arities gone rather than left callable beside them.
--   2. Feedback and a previous proposal travel together or not at all.
--   3. A proposal cannot be regenerated while it is still open. Closing it is
--      the caller's act, through the review or the discard, and that is what
--      keeps the owner's accepted days.
--   4. A regeneration is recorded as one: origin `ai_regeneration`, the source
--      proposal named, the feedback stored, the chain counted.
--   5. The feedback is the text the claim was made for, proved by its hash, the
--      same way the planning note already is.
--   6. None of it reaches across owners.

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

select plan(31);

-- 1. The boundary ------------------------------------------------------------

select has_function(
  'public', 'begin_plan_generation',
  array['text', 'text', 'date', 'integer', 'bigint', 'text', 'uuid', 'text',
        'uuid[]'],
  'the claim function takes a previous proposal and feedback'
);
select has_function(
  'public', 'finish_plan_generation',
  array['uuid', 'text', 'text', 'text', 'text', 'text', 'text', 'uuid',
        'text', 'jsonb', 'jsonb', 'text', 'text'],
  'the completion function takes the feedback again'
);

-- The old arities are gone rather than left beside the new ones. A second way
-- in that skips the regeneration rules is the drift this migration avoids.
select hasnt_function(
  'public', 'begin_plan_generation',
  array['text', 'text', 'date', 'integer', 'bigint', 'text'],
  'the pre-regeneration claim signature is dropped, not shadowed'
);
select hasnt_function(
  'public', 'finish_plan_generation',
  array['uuid', 'text', 'text', 'text', 'text', 'text', 'text', 'uuid',
        'text', 'jsonb', 'jsonb', 'text'],
  'the pre-regeneration completion signature is dropped, not shadowed'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.begin_plan_generation(text,text,date,integer,bigint,text,uuid,text,uuid[])',
    'EXECUTE'
  ) and has_function_privilege(
    'authenticated',
    'public.finish_plan_generation(uuid,text,text,text,text,text,text,uuid,text,jsonb,jsonb,text,text)',
    'EXECUTE'
  ),
  'the owner may claim and finish a regeneration'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.begin_plan_generation(text,text,date,integer,bigint,text,uuid,text,uuid[])',
    'EXECUTE'
  ) and not has_function_privilege(
    'service_role',
    'public.finish_plan_generation(uuid,text,text,text,text,text,text,uuid,text,jsonb,jsonb,text,text)',
    'EXECUTE'
  ),
  'and no anonymous or service role holds either'
);

-- Owners ---------------------------------------------------------------------

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('7e000000-0000-4000-8000-000000000001', 'regen-owner@example.test', '{}', '{}'),
  ('7e000000-0000-4000-8000-000000000002', 'regen-outsider@example.test', '{}', '{}'),
  ('7e000000-0000-4000-8000-000000000003', 'regen-keeper@example.test', '{}', '{}');
insert into public.profiles (user_id, timezone_name)
select id, 'UTC' from auth.users
where id in (
  '7e000000-0000-4000-8000-000000000001',
  '7e000000-0000-4000-8000-000000000002',
  '7e000000-0000-4000-8000-000000000003'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"7e000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

create temporary table pg_temp_claim (
  label text,
  generation_id uuid,
  completion_token uuid,
  state text,
  proposal_id uuid
) on commit drop;

-- 2. The pair travels together -----------------------------------------------

select throws_ok(
  $$select * from public.begin_plan_generation(
    'regen-key-00000000000001', 'regen-fingerprint-000001',
    current_date, 3, 0, null, null, 'This is too hard.')$$,
  '22023', 'Invalid plan request.',
  'feedback with no proposal to attach it to is refused'
);

select throws_ok(
  format(
    $q$select * from public.begin_plan_generation(
      'regen-key-00000000000002', 'regen-fingerprint-000002',
      %L::date, 3, 0, null, '7e000000-0000-4000-8000-0000000000ff'::uuid, null)$q$,
    pg_temp.day(0)
  ),
  '22023', 'Invalid plan request.',
  'a proposal with no feedback is refused, being a question already paid for'
);

-- The first proposal ---------------------------------------------------------

insert into pg_temp_claim
select 'first', * from public.begin_plan_generation(
  'regen-key-00000000000010', 'regen-fingerprint-000010',
  pg_temp.day(0), 3, 0, 'I only have 45 minutes on weekdays');

select is(
  (select proposal_id is not null from public.finish_plan_generation(
    (select completion_token from pg_temp_claim where label = 'first'),
    'proposal', 'fittip.seven-day-plan.v2', 'seven-day-plan-v2-2026-08-12',
    'fixture', 'fixture-corpus-v1', 'fixture-no-spend', null,
    'I only have 45 minutes on weekdays',
    pg_temp.plan_body(pg_temp.day(0), pg_temp.day(2)), null, null, null
  )),
  true,
  'a first proposal is recorded'
);

select is(
  (select origin from public.plan_proposals
   where user_id = '7e000000-0000-4000-8000-000000000001'),
  'ai_initial',
  'and it is an initial one, naming no source and carrying no feedback'
);

select is(
  (select count(*)::integer from public.plan_proposals
   where user_id = '7e000000-0000-4000-8000-000000000001'
     and (source_proposal_id is not null or regeneration_feedback is not null)),
  0,
  'which the shape constraint requires of it'
);

-- 3. It is asked again while it is still open --------------------------------
--
-- Owner, 17 Oct 2026: the proposal stays open until its replacement exists, so
-- a failed answer costs the owner nothing. One request at a time per source.

insert into pg_temp_claim
select 'pending-regen', * from public.begin_plan_generation(
  'regen-key-00000000000011', 'regen-fingerprint-000011',
  pg_temp.day(0), 3, 0, null,
  (select id from public.plan_proposals
   where user_id = '7e000000-0000-4000-8000-000000000001'),
  'Too much running, not enough rest.');

select is(
  (select state from pg_temp_claim where label = 'pending-regen'),
  'claimed',
  'an open proposal can be asked again'
);

select throws_ok(
  format(
    $q$select * from public.begin_plan_generation(
      'regen-key-0000000000011b', 'regen-fingerprint-00011b',
      %L::date, 3, 0, null, %L::uuid, 'Asking twice at once.')$q$,
    pg_temp.day(0),
    (select id from public.plan_proposals
     where user_id = '7e000000-0000-4000-8000-000000000001')
  ),
  'PT409', 'The coach is already being asked again about that proposal.',
  'but not twice at once'
);

-- A request pending far longer than any call can wait is a dead server's.
-- Run as the table owner: the owner cannot write `created_at` themselves.
reset role;
update public.plan_generation_requests
set created_at = pg_catalog.now() - interval '11 minutes'
where id = (select generation_id from pg_temp_claim where label = 'pending-regen');
set local role authenticated;

insert into pg_temp_claim
select 'after-stale', * from public.begin_plan_generation(
  'regen-key-0000000000011c', 'regen-fingerprint-00011c',
  pg_temp.day(0), 3, 0, null,
  (select id from public.plan_proposals
   where user_id = '7e000000-0000-4000-8000-000000000001'),
  'Too much running, not enough rest.');

select is(
  (select state from pg_temp_claim where label = 'after-stale'),
  'claimed',
  'a request pending longer than any call can wait blocks nothing'
);

select public.finish_plan_generation(
  completion_token,
  'failed', null, null, null, null, null, null, null, null, null,
  'provider_unavailable', null)
from pg_temp_claim
where label in ('pending-regen', 'after-stale');

select is(
  (select count(*)::integer from public.plan_proposal_decisions
   where user_id = '7e000000-0000-4000-8000-000000000001'),
  0,
  'a failed answer leaves the proposal open, as the owner left it'
);

-- 4. The regeneration ---------------------------------------------------------

insert into pg_temp_claim
select 'regen', * from public.begin_plan_generation(
  'regen-key-00000000000012', 'regen-fingerprint-000012',
  pg_temp.day(0), 3, 0, 'I only have 45 minutes on weekdays',
  (select id from public.plan_proposals
   where user_id = '7e000000-0000-4000-8000-000000000001'),
  'Too much running, not enough rest.');

select is(
  (select state from pg_temp_claim where label = 'regen'),
  'claimed',
  'and after a failed answer it can be asked again'
);

select is(
  (select regeneration_number from public.plan_generation_requests
   where id = (select generation_id from pg_temp_claim where label = 'regen')),
  1::smallint,
  'and the chain is counted from the request it descends from'
);

-- 5. The feedback is the text the claim was made for --------------------------

select throws_ok(
  format(
    $q$select * from public.finish_plan_generation(
      %L::uuid, 'proposal', 'fittip.seven-day-plan.v2',
      'seven-day-plan-v2-2026-08-12', 'fixture', 'fixture-corpus-v1',
      'fixture-no-spend', null, 'I only have 45 minutes on weekdays',
      %L::jsonb, null, null, 'Something else entirely.')$q$,
    (select completion_token from pg_temp_claim where label = 'regen'),
    pg_temp.plan_body(pg_temp.day(0), pg_temp.day(2))
  ),
  '22023', 'Invalid plan result.',
  'finishing with feedback the claim never saw is refused'
);

select is(
  (select proposal_id is not null from public.finish_plan_generation(
    (select completion_token from pg_temp_claim where label = 'regen'),
    'proposal', 'fittip.seven-day-plan.v2', 'seven-day-plan-v2-2026-08-12',
    'fixture', 'fixture-corpus-v1', 'fixture-no-spend', null,
    'I only have 45 minutes on weekdays',
    pg_temp.plan_body(pg_temp.day(0), pg_temp.day(2)), null, null,
    'Too much running, not enough rest.'
  )),
  true,
  'and the same finish with the claimed feedback closes it'
);

select is(
  (select origin from public.plan_proposals
   where user_id = '7e000000-0000-4000-8000-000000000001'
     and source_proposal_id is not null),
  'ai_regeneration',
  'the new proposal is recorded as a regeneration'
);

select is(
  (select regeneration_feedback from public.plan_proposals
   where user_id = '7e000000-0000-4000-8000-000000000001'
     and origin = 'ai_regeneration'),
  'Too much running, not enough rest.',
  'carrying the feedback the owner wrote, so the surface can show it back'
);

select is(
  (select count(*)::integer from public.plan_proposals p
   join public.plan_proposals source on source.id = p.source_proposal_id
   where p.user_id = '7e000000-0000-4000-8000-000000000001'
     and source.origin = 'ai_initial'),
  1,
  'and naming the proposal it replaced, which is still a permanent record'
);

select is(
  (select decision || ':' || applied_count from public.plan_proposal_decisions
   where user_id = '7e000000-0000-4000-8000-000000000001'),
  'applied:0',
  'which closed in the same step, with nothing accepted and nothing applied'
);

-- 5b. One proposal, one replacement -------------------------------------------
--
-- Without this the chain cap is not a cap. It reads the count from whichever
-- predecessor the caller names, and a closed proposal stays closed, so an owner
-- pointing repeatedly at the first proposal of a lineage would get number 1
-- every time and never reach the ceiling. Measured against a local database
-- before the check existed: two regenerations from one source, both numbered 1.

select throws_ok(
  format(
    $q$select * from public.begin_plan_generation(
      'regen-key-00000000000013', 'regen-fingerprint-000013',
      %L::date, 3, 0, null, %L::uuid, 'Asking the same one twice.')$q$,
    pg_temp.day(0),
    (select id from public.plan_proposals
     where user_id = '7e000000-0000-4000-8000-000000000001'
       and origin = 'ai_initial')
  ),
  'PT409', 'That proposal has already been replaced.',
  'a proposal that has already been replaced cannot be replaced again'
);

-- 6. Across owners -------------------------------------------------------------
--
-- The target id is captured here, while the owner can still see it. Read from
-- inside the outsider's session it would come back null -- RLS hides the row --
-- and the call would then be refused for having no proposal rather than for
-- naming someone else's, which proves the wrong thing entirely.

create temporary table pg_temp_target (id uuid) on commit drop;
insert into pg_temp_target
select id from public.plan_proposals
where user_id = '7e000000-0000-4000-8000-000000000001'
  and origin = 'ai_initial';

select set_config(
  'request.jwt.claims',
  '{"sub":"7e000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select throws_ok(
  format(
    $q$select * from public.begin_plan_generation(
      'regen-key-00000000000020', 'regen-fingerprint-000020',
      %L::date, 3, 0, null, %L::uuid, 'I want something different.')$q$,
    pg_temp.day(0),
    (select id from pg_temp_target)
  ),
  'PT409', 'That proposal is no longer open.',
  'another owner''s proposal cannot be regenerated, and is not even acknowledged'
);

select is(
  (select count(*)::integer from public.plan_generation_requests
   where user_id = '7e000000-0000-4000-8000-000000000002'),
  0,
  'and the refusal claimed nothing on their behalf'
);

-- 6b. What the owner accepted arrives with the replacement --------------------
--
-- The owner keeps one day and leaves the rest undecided, then asks again.
-- Nothing reaches the plan while the coach is asked; the kept day is applied,
-- and the undecided ones declined, in the step that records the new proposal.

select set_config(
  'request.jwt.claims',
  '{"sub":"7e000000-0000-4000-8000-000000000003","role":"authenticated"}', true);

insert into pg_temp_claim
select 'keep', * from public.begin_plan_generation(
  'keep-key-000000000000001', 'keep-fingerprint-0000001',
  pg_temp.day(0), 3, 0, 'note');

select public.finish_plan_generation(
  (select completion_token from pg_temp_claim where label = 'keep'),
  'proposal', 'fittip.seven-day-plan.v2', 'seven-day-plan-v2-2026-08-12',
  'fixture', 'fixture-corpus-v1', 'fixture-no-spend', null, 'note',
  pg_temp.plan_body(pg_temp.day(0), pg_temp.day(2)), null, null, null);

select public.decide_plan_proposal_item(
  (select id from public.plan_proposals
   where user_id = '7e000000-0000-4000-8000-000000000003'),
  (select min(ordinal) from public.plan_proposal_items
   where user_id = '7e000000-0000-4000-8000-000000000003' and kind = 'session'),
  'staged');

insert into pg_temp_claim
select 'keep-regen', * from public.begin_plan_generation(
  'keep-key-000000000000002', 'keep-fingerprint-0000002',
  pg_temp.day(0), 3, 0, 'note',
  (select id from public.plan_proposals
   where user_id = '7e000000-0000-4000-8000-000000000003'),
  'Too much running.');

select is(
  (select count(*)::integer from public.rolling_plan_sessions
   where user_id = '7e000000-0000-4000-8000-000000000003'),
  0,
  'nothing reaches the plan while the coach is asked'
);

select public.finish_plan_generation(
  (select completion_token from pg_temp_claim where label = 'keep-regen'),
  'proposal', 'fittip.seven-day-plan.v2', 'seven-day-plan-v2-2026-08-12',
  'fixture', 'fixture-corpus-v1', 'fixture-no-spend', null, 'note',
  pg_temp.plan_body(pg_temp.day(0), pg_temp.day(2)), null, null,
  'Too much running.');

select is(
  (select count(*)::integer from public.rolling_plan_sessions
   where user_id = '7e000000-0000-4000-8000-000000000003'),
  1,
  'the kept day arrives with the replacement'
);

select is(
  (select count(*)::integer from public.plan_proposal_item_decisions d
   join public.plan_proposals source on source.id = d.proposal_id
   where d.user_id = '7e000000-0000-4000-8000-000000000003'
     and source.origin = 'ai_initial'
     and d.decision = 'rejected'),
  (select count(*)::integer - 1 from public.plan_proposal_items item
   join public.plan_proposals source on source.id = item.proposal_id
   where item.user_id = '7e000000-0000-4000-8000-000000000003'
     and source.origin = 'ai_initial'),
  'and every day the owner left undecided is declined'
);

select set_config('request.jwt.claims', null, true);

-- 7. Deleting a source proposal ----------------------------------------------
--
-- Pinned because the first version of this migration got it wrong. The self
-- reference is a *composite* key, and `on delete set null` on one of those
-- nulls every referencing column — `user_id` among them, which is `not null`.
-- Deleting any proposal then failed on a row nobody had touched. Cascade is
-- both correct and what the roadmap's identical reference already used.
--
-- Run as a role that may delete: `authenticated` holds no delete on either
-- table, so the owner could not reach this even if it were broken. What can
-- reach it is a profile being deleted, which cascades this far.
reset role;

select lives_ok(
  $q$delete from public.plan_proposals
     where user_id = '7e000000-0000-4000-8000-000000000001'
       and origin = 'ai_initial'$q$,
  'deleting a proposal a regeneration descends from cascades rather than failing'
);

select is(
  (select count(*)::integer from public.plan_proposals
   where user_id = '7e000000-0000-4000-8000-000000000001'),
  0,
  'and takes the proposal derived from it with it'
);

select * from finish();
rollback;
