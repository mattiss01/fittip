-- A roadmap written by hand (ADR-029).
--
-- Proved against the real functions: `write_roadmap` stores an `owner_written`
-- proposal with no coach provenance and accepts it in the same transaction;
-- it refuses a stale head, content that is not a roadmap, and a horizon a
-- coach request could not have; a repeat of a write that landed is a replay;
-- a coach proposal made before it can no longer be accepted; the table's new
-- check holds both ways; a roadmap may have no summary; and another owner, or
-- no owner, gets nothing.
--
-- Dates are derived from UTC today, as the function's horizon is.

begin;

create extension if not exists pgtap with schema extensions;

create function pg_temp.day(p_offset integer)
returns date
language sql
stable
as $$
  select ((clock_timestamp() at time zone 'utc')::date + p_offset)
$$;

create function pg_temp.roadmap(
  p_title text,
  p_start integer default 0,
  p_end integer default 84
)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'schemaVersion', 'fittip.roadmap.v4',
    'title', p_title,
    'startDate', pg_temp.day(p_start)::text,
    'endDate', pg_temp.day(p_end)::text,
    'phases', jsonb_build_array(jsonb_build_object(
      'title', 'Base',
      'focus', 'Easy volume.',
      'startDate', pg_temp.day(p_start)::text,
      'endDate', pg_temp.day(p_end)::text,
      'goalAttention', jsonb_build_array(jsonb_build_object(
        'goalId', '00000000-0000-4000-8000-000000000001',
        'level', 'primary'
      )),
      'milestones', '[]'::jsonb
    ))
  )
$$;

create temporary table made (label text primary key, id uuid);
grant all on made to public;
create temporary table coach (proposal_id uuid);
grant all on coach to public;

select plan(25);

-- The function and the table ------------------------------------------------------

select ok(
  has_function_privilege(
    'authenticated', 'public.write_roadmap(jsonb,bigint)', 'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'public.write_roadmap(jsonb,bigint)', 'EXECUTE'
  )
  and not has_function_privilege(
    'service_role', 'public.write_roadmap(jsonb,bigint)', 'EXECUTE'
  )
  and not has_function_privilege(
    'public', 'public.write_roadmap(jsonb,bigint)', 'EXECUTE'
  ),
  'only authenticated may write a roadmap'
);
select is(
  (select p.prosecdef
     and pg_catalog.array_to_string(p.proconfig, ',') = 'search_path=""'
   from pg_catalog.pg_proc as p
   join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'write_roadmap'),
  true,
  'it runs as definer with an empty search path'
);
select ok(
  not has_function_privilege(
    'authenticated', 'public.roadmap_content_is_valid(jsonb,date,date)', 'EXECUTE'
  ),
  'the content check is still callable by no one but its callers'
);
select col_is_null('public', 'roadmap_proposals', 'generation_request_id',
  'a proposal may have no request');
select col_is_null('public', 'roadmap_proposals', 'provider_code',
  'or provider code');
select col_not_null('public', 'roadmap_proposals', 'origin',
  'but always an origin');

select ok(
  public.roadmap_content_is_valid(
    pg_temp.roadmap('No summary'), pg_temp.day(0), pg_temp.day(84)
  ),
  'a roadmap with no summary is valid'
);
select ok(
  not public.roadmap_content_is_valid(
    pg_temp.roadmap('Empty summary') || '{"summary": ""}'::jsonb,
    pg_temp.day(0), pg_temp.day(84)
  )
  and not public.roadmap_content_is_valid(
    pg_temp.roadmap('Null summary') || '{"summary": null}'::jsonb,
    pg_temp.day(0), pg_temp.day(84)
  ),
  'but an empty or null one is not a summary left out'
);

-- One owner ----------------------------------------------------------------------

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('71000000-0000-4000-8000-000000000001', 'written-owner@example.test', '{}', '{}');
insert into public.profiles (user_id, timezone_name)
values ('71000000-0000-4000-8000-000000000001', 'UTC');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- A coach proposal, open while the owner writes their own.
insert into coach
select proposal_id
from public.finish_roadmap_generation(
  (select completion_token from public.begin_roadmap_generation(
    'written-coach-key-0000000001', 'written-coach-key-0000000001-f',
    pg_temp.day(0), pg_temp.day(84), 0)),
  'proposal', 'fittip.roadmap.v4', 'roadmap-v4.2-2026-10-13',
  'fixture', 'fixture-corpus-v1', 'fixture-no-spend',
  p_content => pg_temp.roadmap('The coach''s'), p_sources => '[]'::jsonb
);

-- Refusals, before anything is in force.
select throws_ok(
  format('select * from public.write_roadmap(%L::jsonb, 0)',
    pg_temp.roadmap('Yesterday and before', -2, 82)),
  '22023', 'Invalid roadmap.',
  'a roadmap that started before yesterday is refused'
);
select throws_ok(
  format('select * from public.write_roadmap(%L::jsonb, 0)',
    pg_temp.roadmap('Three weeks', 0, 20)),
  '22023', 'Invalid roadmap.',
  'one shorter than four weeks is refused'
);
select throws_ok(
  format('select * from public.write_roadmap(%L::jsonb, 0)',
    pg_temp.roadmap('Two years', 0, 400)),
  '22023', 'Invalid roadmap.',
  'one longer than fifty-two weeks is refused'
);
select throws_ok(
  format('select * from public.write_roadmap(%L::jsonb, 0)',
    pg_temp.roadmap('Extra key') || '{"reviewPoints": []}'::jsonb),
  '22023', 'Invalid roadmap.',
  'content that is not a v4 roadmap is refused'
);
select throws_ok(
  format('select * from public.write_roadmap(%L::jsonb, 1)',
    pg_temp.roadmap('Ahead of itself')),
  'PT409', 'Your roadmap changed. Reload and try again.',
  'a head that is not the real one is refused'
);

-- The write.
insert into made
select 'written', proposal_id
from public.write_roadmap(pg_temp.roadmap('My own'), 0);

select is(
  (select origin || ' ' || coalesce(provider_code, '-') || ' '
     || coalesce(generation_request_id::text, '-') || ' '
     || coalesce(source_proposal_id::text, '-')
   from public.roadmap_proposals
   where id = (select id from made where label = 'written')),
  'owner_written - - -',
  'it is stored as a hand-written proposal with no coach behind it'
);
select is(
  (select decision from public.roadmap_proposal_decisions
   where proposal_id = (select id from made where label = 'written')),
  'accepted',
  'accepted in the same step'
);
select is(
  (select version.content->>'title' || ' ' || head.revision::text
   from public.roadmap_heads head
   join public.roadmap_versions version on version.id = head.current_version_id),
  'My own 1',
  'and it is the roadmap in force'
);
select is(
  (select result || ' ' || head_revision::text
   from public.write_roadmap(pg_temp.roadmap('My own'), 0)),
  'replayed 1',
  'writing it again from the same page is a replay'
);
select is(
  (select count(*)::integer from public.roadmap_versions),
  1,
  'which made no second version'
);
select throws_ok(
  format('select * from public.write_roadmap(%L::jsonb, 0)',
    pg_temp.roadmap('Another, from a stale page')),
  'PT409', 'Your roadmap changed. Reload and try again.',
  'a different roadmap from the stale page is refused'
);
select throws_ok(
  format('select * from public.accept_roadmap_proposal(%L::uuid, 1)',
    (select proposal_id from coach)),
  'PT409',
  'Your roadmap changed since this was proposed. Decline it and ask again.',
  'the coach proposal made before it can no longer be accepted'
);
select is(
  (select result || ' ' || head_revision::text
   from public.write_roadmap(pg_temp.roadmap('My second', 0, 120), 1)),
  'accepted 2',
  'a second hand-written roadmap replaces the first'
);

-- The table's check, both ways -----------------------------------------------------

reset role;
select throws_ok(
  format(
    $sql$insert into public.roadmap_proposals
      (user_id, generation_request_id, origin, schema_version, content)
      values ('71000000-0000-4000-8000-000000000001', %L::uuid,
        'owner_written', 'fittip.roadmap.v4', '{}'::jsonb)$sql$,
    (select generation_request_id from public.roadmap_proposals
     where id = (select proposal_id from coach))
  ),
  '23514', null,
  'a hand-written proposal cannot claim a coach request'
);
select throws_ok(
  format(
    $sql$insert into public.roadmap_proposals
      (user_id, generation_request_id, origin, schema_version, content)
      values ('71000000-0000-4000-8000-000000000001', %L::uuid,
        'ai_initial', 'fittip.roadmap.v4', '{}'::jsonb)$sql$,
    (select generation_request_id from public.roadmap_proposals
     where id = (select proposal_id from coach))
  ),
  '23514', null,
  'a coach proposal cannot leave out the codes of its call'
);

-- Nobody else -------------------------------------------------------------------------

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('71000000-0000-4000-8000-000000000002', 'written-other@example.test', '{}', '{}');
insert into public.profiles (user_id, timezone_name)
values ('71000000-0000-4000-8000-000000000002', 'UTC');
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"71000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select is(
  (select count(*)::integer from public.roadmap_proposals)
    + (select count(*)::integer from public.roadmap_versions),
  0,
  'another owner reads none of it'
);

reset role;
set local role anon;
select throws_ok(
  format('select * from public.write_roadmap(%L::jsonb, 0)',
    pg_temp.roadmap('Anonymous')),
  '42501', null,
  'and no one signed in may write one'
);

select * from finish();
rollback;
