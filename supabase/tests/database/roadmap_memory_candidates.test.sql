-- Roadmap memory candidates in the coach's own words.
--
-- ADR-010 decision 16, amended 18 October 2026: a candidate is one sentence the
-- coach writes, no longer an exact excerpt of the planning note. The plan route
-- is proved in `plan_memory_candidates.test.sql`; this file proves the roadmap
-- twin changed the same way and kept the rest of the decision: only
-- `proposed` items with system author class and inferred provenance, a
-- proposal without a planning note refused, 200 characters at most, and a
-- replayed batch returning its existing items.

begin;

create extension if not exists pgtap with schema extensions;

create function pg_temp.day(p_offset integer)
returns date
language sql
stable
as $$
  select ((clock_timestamp() at time zone 'utc')::date + p_offset)
$$;

create function pg_temp.roadmap(p_start date, p_end date, p_title text)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'schemaVersion', 'fittip.roadmap.v4',
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
        'level', 'primary'
      )),
      'milestones', jsonb_build_array(jsonb_build_object(
        'title', 'Four steady weeks',
        'observableCriterion', 'Four consecutive weeks with every planned easy run logged.',
        'targetDate', p_end::text,
        'goalIds', jsonb_build_array('00000000-0000-4000-8000-000000000001')
      ))
    ))
  )
$$;

create temporary table claim (
  label text primary key,
  generation_id uuid,
  completion_token uuid,
  state text,
  regeneration_number integer,
  proposal_id uuid
);
create temporary table receipt (
  label text primary key,
  collection_revision bigint,
  item_ids uuid[]
);
grant all on claim, receipt to public;

select plan(10);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('7d000000-0000-4000-8000-000000000001', 'noted-owner@example.test', '{}', '{}'),
  ('7d000000-0000-4000-8000-000000000002', 'noteless-owner@example.test', '{}', '{}');
insert into public.profiles (user_id, timezone_name)
select id, 'UTC' from auth.users
where id in (
  '7d000000-0000-4000-8000-000000000001',
  '7d000000-0000-4000-8000-000000000002'
);

set local role authenticated;

-- A roadmap with a planning note ---------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"7d000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

insert into claim
select 'noted', * from public.begin_roadmap_generation(
  'roadmap-memory-key-00000001', 'roadmap-memory-fingerprint-01',
  pg_temp.day(0), pg_temp.day(84), 0,
  p_planning_note => 'I only have 45 minutes on weekdays and my left knee complains on hills'
);

select is(
  (select state from public.finish_roadmap_generation(
    (select completion_token from claim where label = 'noted'),
    'proposal', 'fittip.roadmap.v4', 'roadmap-2026-08-10',
    'fixture', 'fixture-corpus-v1', 'fixture-no-spend',
    p_planning_note => 'I only have 45 minutes on weekdays and my left knee complains on hills',
    p_content => pg_temp.roadmap(pg_temp.day(0), pg_temp.day(84), 'Base'),
    p_sources => '[]'::jsonb
  )),
  'completed',
  'the generation closes with a proposal that has a planning note'
);

-- Refusals first: a recorded batch would turn every later call into a replay.

select throws_ok(
  $$select * from public.record_roadmap_memory_candidates(
    (select completion_token from claim where label = 'noted'), 0,
    '[{"memoryType":"constraint",
       "sourceExcerpt":"only have 45 minutes on weekdays"}]'::jsonb)$$,
  '22023', 'Invalid memory candidates.',
  'a candidate under the retired excerpt key is refused'
);

select throws_ok(
  format(
    $$select * from public.record_roadmap_memory_candidates(
      (select completion_token from claim where label = 'noted'), 0,
      jsonb_build_array(jsonb_build_object(
        'memoryType', 'constraint', 'content', %L)))$$,
    repeat('a', 201)
  ),
  '22023', 'Invalid memory candidates.',
  'a candidate over 200 characters is refused'
);

select throws_ok(
  $$select * from public.record_roadmap_memory_candidates(
    (select completion_token from claim where label = 'noted'), 7,
    '[{"memoryType":"constraint",
       "content":"Has only 45 minutes on weekdays."}]'::jsonb)$$,
  'PT409', 'Memory changed. Reload and try again.',
  'a caller holding a stale memory revision is told to reload'
);

-- The batch: neither sentence is a substring of the note.

insert into receipt
select 'batch', * from public.record_roadmap_memory_candidates(
  (select completion_token from claim where label = 'noted'), 0,
  '[{"memoryType":"constraint",
     "content":"Has only 45 minutes on weekdays.",
     "confidence":80},
    {"memoryType":"observed_pattern",
     "content":"Left knee complains on hills."}]'::jsonb
);

select is(
  (select pg_catalog.array_length(item_ids, 1) from receipt where label = 'batch'),
  2,
  'both sentences the coach wrote become items'
);

select is(
  (select array_agg(content order by content)
   from public.memory_revisions
   where user_id = '7d000000-0000-4000-8000-000000000001'),
  array['Has only 45 minutes on weekdays.', 'Left knee complains on hills.'],
  'the stored revisions are the coach''s sentences, not the note''s words'
);

select is(
  (select count(*)::integer from public.memory_items
   where user_id = '7d000000-0000-4000-8000-000000000001'
     and status = 'proposed'
     and provenance = 'inferred_proposed'
     and user_confirmed_at is null),
  2,
  'every item is proposed, inferred, and unconfirmed'
);

select is(
  (select count(*)::integer from public.memory_revisions
   where user_id = '7d000000-0000-4000-8000-000000000001'
     and author_class = 'system'),
  2,
  'and authored by the system, not the owner'
);

insert into receipt
select 'replay', * from public.record_roadmap_memory_candidates(
  (select completion_token from claim where label = 'noted'), 1,
  '[{"memoryType":"constraint","content":"Something else entirely."}]'::jsonb
);

select is(
  (select item_ids from receipt where label = 'replay'),
  (select item_ids from receipt where label = 'batch'),
  'a replayed batch returns the existing items rather than adding any'
);

-- A roadmap without one -------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"7d000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

insert into claim
select 'noteless', * from public.begin_roadmap_generation(
  'roadmap-memory-key-00000002', 'roadmap-memory-fingerprint-02',
  pg_temp.day(0), pg_temp.day(84), 0
);

select public.finish_roadmap_generation(
  (select completion_token from claim where label = 'noteless'),
  'proposal', 'fittip.roadmap.v4', 'roadmap-2026-08-10',
  'fixture', 'fixture-corpus-v1', 'fixture-no-spend',
  p_content => pg_temp.roadmap(pg_temp.day(0), pg_temp.day(84), 'Base'),
  p_sources => '[]'::jsonb
);

select throws_ok(
  $$select * from public.record_roadmap_memory_candidates(
    (select completion_token from claim where label = 'noteless'), 0,
    '[{"memoryType":"constraint","content":"Has only 45 minutes on weekdays."}]'::jsonb)$$,
  '22023', 'Invalid memory candidates.',
  'a proposal without a planning note gets no candidates'
);

select set_config('request.jwt.claims', null, true);

select * from finish();
rollback;
