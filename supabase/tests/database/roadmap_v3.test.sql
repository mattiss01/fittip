-- Roadmap v3 (ADR-025): what may be stored from now on, and what happens to
-- what already is.
--
-- Three things are proved here.
--
-- First, the envelope, by name. `roadmap_content_is_valid` is the database's
-- own check on what a roadmap holds, independent of the application's
-- validator. A v3 roadmap has no assumptions, uncertainties, safety sentences
-- or reason beside an attention level, and a coach or a hand-made call that
-- still sends one is refused rather than stored. A phase may have no
-- milestone.
--
-- Second, that nothing stored under v2 is stranded. Proposals and accepted
-- versions are permanent records. A v2 proposal keeps its content and its
-- version, can still be accepted, and an edit of it is saved as a v3 row
-- beside it.
--
-- Third, that the two re-emitted functions kept their privileges: `execute`
-- for `authenticated` and for nobody else.
--
-- Dates are derived from UTC today, because `begin_roadmap_generation` refuses
-- a start earlier than the day before its own UTC date.

begin;

create extension if not exists pgtap with schema extensions;

create function pg_temp.day(p_offset integer)
returns date
language sql
stable
as $$
  select ((clock_timestamp() at time zone 'utc')::date + p_offset)
$$;

-- One valid `fittip.roadmap.v3` body for the horizon the tests use.
create function pg_temp.roadmap(p_title text)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'schemaVersion', 'fittip.roadmap.v3',
    'title', p_title,
    'summary', 'Build an aerobic base, then sharpen into the target race.',
    'startDate', pg_temp.day(0)::text,
    'endDate', pg_temp.day(84)::text,
    'phases', jsonb_build_array(jsonb_build_object(
      'title', 'Base',
      'focus', 'Easy volume, consistent weeks, no intensity worth the name.',
      'startDate', pg_temp.day(0)::text,
      'endDate', pg_temp.day(84)::text,
      'goalAttention', jsonb_build_array(jsonb_build_object(
        'goalId', '00000000-0000-4000-8000-000000000001',
        'level', 'primary'
      )),
      'milestones', jsonb_build_array(jsonb_build_object(
        'title', 'Four steady weeks',
        'observableCriterion', 'Four consecutive weeks with every planned easy run logged.',
        'targetDate', pg_temp.day(84)::text,
        'goalIds', jsonb_build_array('00000000-0000-4000-8000-000000000001')
      ))
    )),
    'reviewPoints', jsonb_build_array(jsonb_build_object(
      'title', 'Halfway check',
      'triggerDate', pg_temp.day(42)::text,
      'question', 'Is the weekly volume still repeatable without soreness?'
    ))
  )
$$;

-- The same roadmap as v2 stored it: a reason beside the level, and the three
-- lists v3 dropped.
create function pg_temp.legacy_roadmap(p_title text)
returns jsonb
language sql
stable
as $$
  select jsonb_set(
    pg_temp.roadmap(p_title),
    '{phases,0,goalAttention,0,reason}',
    '"It is the only goal with a date inside this horizon."'
  ) || jsonb_build_object(
    'schemaVersion', 'fittip.roadmap.v2',
    'assumptions', jsonb_build_array('Three training days a week are available.'),
    'uncertainties', jsonb_build_array(jsonb_build_object(
      'statement', 'Weekday sessions may stay short.',
      'whyItMatters', 'Hill work needs time.',
      'whatToWatch', 'Whether the weekend run carries the load.'
    )),
    'safetyConsiderations', jsonb_build_array('Load on the knee stays flat.')
  )
$$;

create function pg_temp.valid(p_content jsonb)
returns boolean
language sql
stable
as $$
  select public.roadmap_content_is_valid(
    p_content, pg_temp.day(0), pg_temp.day(84)
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
create temporary table finished (
  label text primary key,
  status text,
  proposal_id uuid
);
create temporary table change (
  label text primary key,
  proposal_id uuid,
  result text
);
create temporary table acceptance (
  label text primary key,
  proposal_id uuid,
  version_id uuid,
  head_revision bigint,
  result text
);

grant all on claim, finished, change, acceptance to public;

select plan(33);

-- The envelope ---------------------------------------------------------------

select ok(pg_temp.valid(pg_temp.roadmap('Base into race')), 'a v3 roadmap is valid');
select ok(
  pg_temp.valid(
    jsonb_set(pg_temp.roadmap('No milestone'), '{phases,0,milestones}', '[]')
  ),
  'a phase may have no milestone'
);
select ok(
  not pg_temp.valid(pg_temp.roadmap('No list') #- '{phases,0,milestones}'),
  'a phase without a milestone list at all is refused'
);
select ok(
  not pg_temp.valid(
    jsonb_set(
      pg_temp.roadmap('Four'),
      '{phases,0,milestones}',
      (pg_temp.roadmap('Four') #> '{phases,0,milestones}')
        || (pg_temp.roadmap('Four') #> '{phases,0,milestones}')
        || (pg_temp.roadmap('Four') #> '{phases,0,milestones}')
        || (pg_temp.roadmap('Four') #> '{phases,0,milestones}')
    )
  ),
  'a fourth milestone in a phase is refused'
);
select ok(
  not pg_temp.valid(
    jsonb_set(
      pg_temp.roadmap('Reason'), '{phases,0,goalAttention,0,reason}', '"Why."'
    )
  ),
  'a reason beside an attention level is refused'
);
select ok(
  not pg_temp.valid(
    jsonb_set(pg_temp.roadmap('Scalar'), '{phases,0,goalAttention}', '["primary"]')
  ),
  'an attention entry that is not an object is refused'
);
select ok(
  not pg_temp.valid(
    jsonb_set(pg_temp.roadmap('Level'), '{phases,0,goalAttention,0,level}', '"60%"')
  ),
  'an attention level outside the four is refused'
);
select ok(
  not pg_temp.valid(pg_temp.roadmap('Empty') #- '{phases,0,goalAttention,0}'),
  'a phase attending to no goal is still refused'
);
select ok(
  not pg_temp.valid(pg_temp.roadmap('A') || '{"assumptions":["One."]}'::jsonb),
  'assumptions are refused'
);
select ok(
  not pg_temp.valid(pg_temp.roadmap('U') || '{"uncertainties":[]}'::jsonb),
  'uncertainties are refused, even empty'
);
select ok(
  not pg_temp.valid(
    pg_temp.roadmap('S') || '{"safetyConsiderations":["Held flat."]}'::jsonb
  ),
  'safety sentences are refused'
);
select ok(
  not pg_temp.valid(pg_temp.legacy_roadmap('Legacy')),
  'a v2 roadmap is no longer something that may be written'
);
select ok(
  not pg_temp.valid(
    pg_temp.roadmap('Named v2') || '{"schemaVersion":"fittip.roadmap.v2"}'::jsonb
  ),
  'v3 content under the v2 name is refused'
);
select ok(
  not pg_temp.valid(pg_temp.roadmap('No review') || '{"reviewPoints":[]}'::jsonb),
  'a roadmap still needs a review point'
);

-- The privilege boundary -----------------------------------------------------

select ok(
  has_function_privilege(
    'authenticated',
    'public.finish_roadmap_generation(uuid,text,text,text,text,text,text,uuid,text,text,jsonb,jsonb,text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated', 'public.apply_roadmap_proposal_change(text,uuid,jsonb)', 'EXECUTE'
  ),
  'authenticated may still finish a generation and change a proposal'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.finish_roadmap_generation(uuid,text,text,text,text,text,text,uuid,text,text,jsonb,jsonb,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'public.apply_roadmap_proposal_change(text,uuid,jsonb)', 'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.finish_roadmap_generation(uuid,text,text,text,text,text,text,uuid,text,text,jsonb,jsonb,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role', 'public.apply_roadmap_proposal_change(text,uuid,jsonb)', 'EXECUTE'
  ),
  'anon and service_role may do neither'
);
select ok(
  not has_function_privilege(
    'authenticated', 'public.roadmap_content_is_valid(jsonb,date,date)', 'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'public.roadmap_content_is_valid(jsonb,date,date)', 'EXECUTE'
  ),
  'the content check itself is callable by no client role'
);
select is(
  (
    select count(*)::integer
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'finish_roadmap_generation', 'apply_roadmap_proposal_change'
      )
      and p.prosecdef
      and pg_catalog.array_to_string(p.proconfig, ',') like 'search_path=%'
  ),
  2,
  'both re-emitted functions still run as definer with an empty search path'
);
select ok(
  (
    select pg_catalog.pg_get_constraintdef(oid)
    from pg_catalog.pg_constraint
    where conname = 'roadmap_proposals_schema_check'
  ) like '%fittip.roadmap.v2%fittip.roadmap.v3%',
  'the stored schema version may be v2 or v3 and nothing else'
);

-- Owner ----------------------------------------------------------------------

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('6d000000-0000-4000-8000-000000000001', 'roadmap-v3-owner@example.test', '{}', '{}');
insert into public.profiles (user_id, timezone_name)
values ('6d000000-0000-4000-8000-000000000001', 'UTC');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"6d000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- Writing ------------------------------------------------------------------

insert into claim
select 'first', * from public.begin_roadmap_generation(
  'roadmap-v3-initial-key-00000001',
  'roadmap-v3-initial-fingerprint-00000001',
  pg_temp.day(0),
  pg_temp.day(84),
  0
);

select throws_ok(
  format(
    $$select * from public.finish_roadmap_generation(
      %L::uuid, 'proposal', 'fittip.roadmap.v2', 'roadmap-v3-2026-10-10',
      'fixture', 'fixture-corpus-v1', 'fixture-no-spend',
      p_content => pg_temp.legacy_roadmap('Legacy'), p_sources => '[]'::jsonb)$$,
    (select completion_token from claim where label = 'first')
  ),
  '22023', 'Invalid roadmap result.',
  'a result that names v2 is refused'
);
select throws_ok(
  format(
    $$select * from public.finish_roadmap_generation(
      %L::uuid, 'proposal', 'fittip.roadmap.v3', 'roadmap-v3-2026-10-10',
      'fixture', 'fixture-corpus-v1', 'fixture-no-spend',
      p_content => pg_temp.roadmap('Held back')
        || '{"safetyConsiderations":["Held flat."]}'::jsonb,
      p_sources => '[]'::jsonb)$$,
    (select completion_token from claim where label = 'first')
  ),
  '22023', 'Invalid roadmap result.',
  'a v3 result that still carries safety sentences is refused, not stored'
);

insert into finished
select 'first', * from public.finish_roadmap_generation(
  (select completion_token from claim where label = 'first'),
  'proposal',
  'fittip.roadmap.v3',
  'roadmap-v3-2026-10-10',
  'fixture',
  'fixture-corpus-v1',
  'fixture-no-spend',
  p_content => pg_temp.roadmap('Base into race'),
  p_sources => '[]'::jsonb
);

select is(
  (select status from finished where label = 'first'), 'completed',
  'a v3 result is persisted'
);
select is(
  (select schema_version from public.roadmap_proposals
   where id = (select proposal_id from finished where label = 'first')),
  'fittip.roadmap.v3',
  'and is stored as v3'
);

-- What was stored before ------------------------------------------------------
--
-- No function can produce a v2 row any more, so the one this section needs is
-- made by hand, as the table owner: the proposal above becomes what it would
-- have been had it been generated the day before this migration.

reset role;
update public.roadmap_proposals
set schema_version = 'fittip.roadmap.v2',
    prompt_version = 'roadmap-v2-2026-08-10',
    content = pg_temp.legacy_roadmap('Base into race')
where id = (select proposal_id from finished where label = 'first');
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"6d000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select throws_ok(
  format(
    $$select * from public.apply_roadmap_proposal_change(
      'edit', %L::uuid, pg_temp.legacy_roadmap('Still v2'))$$,
    (select proposal_id from finished where label = 'first')
  ),
  '22023', 'Invalid roadmap change.',
  'an edit cannot write v2 content, even onto a v2 proposal'
);

insert into change
select 'edit', * from public.apply_roadmap_proposal_change(
  'edit',
  (select proposal_id from finished where label = 'first'),
  pg_temp.roadmap('My own wording')
);

select is(
  (select result from change where label = 'edit'), 'edited',
  'a v2 proposal can be edited'
);
select is(
  (select schema_version from public.roadmap_proposals
   where id = (select proposal_id from change where label = 'edit')),
  'fittip.roadmap.v3',
  'the edit is stored under the version of its own content'
);
select is(
  (select content from public.roadmap_proposals
   where id = (select proposal_id from change where label = 'edit')),
  pg_temp.roadmap('My own wording'),
  'and holds exactly what was sent'
);
select is(
  (select prompt_version || ' ' || provider_code || ' ' || origin
   from public.roadmap_proposals
   where id = (select proposal_id from change where label = 'edit')),
  'roadmap-v2-2026-08-10 fixture owner_edit',
  'it still inherits the prompt and provider of the proposal it came from'
);
select is(
  (select schema_version || ' ' || (content = pg_temp.legacy_roadmap('Base into race'))::text
   from public.roadmap_proposals
   where id = (select proposal_id from finished where label = 'first')),
  'fittip.roadmap.v2 true',
  'the v2 proposal keeps its version and its content, byte for byte'
);

insert into change
select 'edit-replay', * from public.apply_roadmap_proposal_change(
  'edit',
  (select proposal_id from finished where label = 'first'),
  pg_temp.roadmap('My own wording')
);
select is(
  (select proposal_id from change where label = 'edit-replay'),
  (select proposal_id from change where label = 'edit'),
  'replaying the edit returns the existing one'
);

-- A v2 proposal that was never edited away can still be accepted as it is.
insert into acceptance
select 'legacy', * from public.accept_roadmap_proposal(
  (select proposal_id from finished where label = 'first'), 0
);

select is(
  (select result from acceptance where label = 'legacy'), 'accepted',
  'a v2 proposal can still be accepted'
);
select is(
  (select content from public.roadmap_versions
   where id = (select version_id from acceptance where label = 'legacy')),
  pg_temp.legacy_roadmap('Base into race'),
  'and the accepted version holds what the proposal held, old sections included'
);
select is(
  (select count(*)::integer from public.roadmap_proposals
   where user_id = '6d000000-0000-4000-8000-000000000001'),
  2,
  'nothing was written beyond the proposal and its one edit'
);

select * from finish();
rollback;
