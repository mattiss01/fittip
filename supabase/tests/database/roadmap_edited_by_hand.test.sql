-- Editing the roadmap in force (ADR-030).
--
-- Proved against the real functions: `edit_roadmap` puts a change in force as
-- an `owner_written` proposal; it refuses a changed ended phase, a moved
-- start, a phase not ended that now ends before today, and a stale head; a
-- repeat is a replay; an unchanged milestone keeps its tick and its day, in
-- whatever phase it now sits, and a changed one loses it; a done review stays
-- with its phase, and falls back a phase when its phase is lengthened; and no
-- one else, signed in or not, can edit.
--
-- The profiles are in UTC, so the owner's today is UTC's, as the helper's is.

begin;

create extension if not exists pgtap with schema extensions;

create function pg_temp.day(p_offset integer)
returns text
language sql
stable
as $$
  select ((clock_timestamp() at time zone 'utc')::date + p_offset)::text
$$;

create function pg_temp.milestone(p_title text, p_day integer)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'title', p_title,
    'targetDate', pg_temp.day(p_day),
    'goalIds', '[]'::jsonb
  )
$$;

create function pg_temp.phase(
  p_title text,
  p_start integer,
  p_end integer,
  p_milestones jsonb default '[]'::jsonb
)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'title', p_title,
    'focus', 'Training.',
    'startDate', pg_temp.day(p_start),
    'endDate', pg_temp.day(p_end),
    'goalAttention', jsonb_build_array(jsonb_build_object(
      'goalId', '00000000-0000-4000-8000-000000000001',
      'level', 'primary'
    )),
    'milestones', p_milestones
  )
$$;

create function pg_temp.roadmap(
  p_title text,
  p_start integer,
  p_end integer,
  p_phases jsonb
)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'schemaVersion', 'fittip.roadmap.v4',
    'title', p_title,
    'startDate', pg_temp.day(p_start),
    'endDate', pg_temp.day(p_end),
    'phases', p_phases
  )
$$;

-- The roadmap in force: started forty days ago, its first phase over.
create function pg_temp.original()
returns jsonb
language sql
stable
as $$
  select pg_temp.roadmap('Spring', -40, 44, jsonb_build_array(
    pg_temp.phase('Base', -40, -15,
      jsonb_build_array(pg_temp.milestone('A', -20))),
    pg_temp.phase('Build', -14, 10, jsonb_build_array(
      pg_temp.milestone('B', 0), pg_temp.milestone('C', 5))),
    pg_temp.phase('Peak', 11, 44,
      jsonb_build_array(pg_temp.milestone('D', 30)))
  ))
$$;

-- The edit: Build longer, C renamed, a new block, D in a phase of its own.
create function pg_temp.edited()
returns jsonb
language sql
stable
as $$
  select pg_temp.roadmap('Spring, changed', -40, 44, jsonb_build_array(
    pg_temp.phase('Base', -40, -15,
      jsonb_build_array(pg_temp.milestone('A', -20))),
    pg_temp.phase('Build', -14, 20, jsonb_build_array(
      pg_temp.milestone('B', 0), pg_temp.milestone('C renamed', 5))),
    pg_temp.phase('New block', 21, 24),
    pg_temp.phase('Peak', 25, 44,
      jsonb_build_array(pg_temp.milestone('D', 30)))
  ))
$$;

create temporary table made (label text primary key, id uuid);
grant all on made to public;

select plan(19);

-- The function ----------------------------------------------------------------------

select ok(
  has_function_privilege(
    'authenticated', 'public.edit_roadmap(jsonb,bigint)', 'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'public.edit_roadmap(jsonb,bigint)', 'EXECUTE'
  )
  and not has_function_privilege(
    'service_role', 'public.edit_roadmap(jsonb,bigint)', 'EXECUTE'
  )
  and not has_function_privilege(
    'public', 'public.edit_roadmap(jsonb,bigint)', 'EXECUTE'
  ),
  'only authenticated may edit a roadmap'
);
select is(
  (select p.prosecdef
     and pg_catalog.array_to_string(p.proconfig, ',') = 'search_path=""'
   from pg_catalog.pg_proc as p
   join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'edit_roadmap'),
  true,
  'it runs as definer with an empty search path'
);

-- One owner, with a roadmap that has started --------------------------------------

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('73000000-0000-4000-8000-000000000001', 'edit-owner@example.test', '{}', '{}'),
  ('73000000-0000-4000-8000-000000000002', 'edit-other@example.test', '{}', '{}');
insert into public.profiles (user_id, timezone_name)
values
  ('73000000-0000-4000-8000-000000000001', 'UTC'),
  ('73000000-0000-4000-8000-000000000002', 'UTC');

-- Stored as written forty days ago, which `write_roadmap` would now refuse.
with stored as (
  insert into public.roadmap_proposals (user_id, origin, schema_version, content)
  values (
    '73000000-0000-4000-8000-000000000001', 'owner_written',
    'fittip.roadmap.v4', pg_temp.original()
  )
  returning id
)
insert into made select 'original', id from stored;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"73000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

insert into made
select 'v1', version_id
from public.accept_roadmap_proposal(
  (select id from made where label = 'original'), 0
);

do $$
declare
  v_version uuid := (select id from made where label = 'v1');
begin
  perform public.set_roadmap_milestone_reached(v_version, 0, 0, true);
  perform public.set_roadmap_milestone_reached(v_version, 1, 0, true);
  perform public.set_roadmap_milestone_reached(v_version, 1, 1, true);
  perform public.set_roadmap_milestone_reached(v_version, 2, 0, true);
  perform public.set_roadmap_reviewed(v_version, 0);
end;
$$;

-- Refusals ------------------------------------------------------------------------------

select throws_ok(
  format('select * from public.edit_roadmap(%L::jsonb, 1)',
    jsonb_set(pg_temp.edited(), '{phases,0,title}', '"Base, rewritten"')),
  '22023', 'Invalid roadmap.',
  'a phase that has ended cannot change'
);
select throws_ok(
  format('select * from public.edit_roadmap(%L::jsonb, 1)',
    pg_temp.roadmap('Later start', -39, 44, jsonb_build_array(
      pg_temp.phase('Base', -39, -15,
        jsonb_build_array(pg_temp.milestone('A', -20))),
      pg_temp.phase('Rest', -14, 44)))),
  '22023', 'Invalid roadmap.',
  'nor the start'
);
select throws_ok(
  format('select * from public.edit_roadmap(%L::jsonb, 1)',
    pg_temp.roadmap('Build cut short', -40, 44, jsonb_build_array(
      pg_temp.phase('Base', -40, -15,
        jsonb_build_array(pg_temp.milestone('A', -20))),
      pg_temp.phase('Build', -14, -1),
      pg_temp.phase('Rest', 0, 44)))),
  '22023', 'Invalid roadmap.',
  'the current phase cannot now end before today'
);
select throws_ok(
  format('select * from public.edit_roadmap(%L::jsonb, 1)',
    pg_temp.roadmap('Base stretched', -40, 44, jsonb_build_array(
      pg_temp.phase('Base', -40, -15,
        jsonb_build_array(pg_temp.milestone('A', -20))),
      pg_temp.phase('Build', -12, 44)))),
  '22023', 'Invalid roadmap.',
  'and keeps its start'
);
select throws_ok(
  format('select * from public.edit_roadmap(%L::jsonb, 2)', pg_temp.edited()),
  'PT409', 'Your roadmap changed. Reload and try again.',
  'a head that is not the real one is refused'
);

-- The edit ------------------------------------------------------------------------------

insert into made
select 'edit', proposal_id
from public.edit_roadmap(pg_temp.edited(), 1);

select is(
  (select proposal.origin || ' ' || head.revision::text || ' '
     || (version.content->>'title')
   from public.roadmap_heads head
   join public.roadmap_versions version on version.id = head.current_version_id
   join public.roadmap_proposals proposal on proposal.id = version.source_proposal_id
   where proposal.id = (select id from made where label = 'edit')),
  'owner_written 2 Spring, changed',
  'the change is in force at once, stored as written by hand'
);
select is(
  (select result || ' ' || head_revision::text
   from public.edit_roadmap(pg_temp.edited(), 1)),
  'replayed 2',
  'saving it again from the same page is a replay'
);
select is(
  (select array_agg(mark.phase_index || ':' || mark.milestone_index
     order by mark.phase_index, mark.milestone_index)
   from public.roadmap_milestone_marks mark
   join public.roadmap_heads head on head.current_version_id = mark.version_id),
  array['0:0', '1:0', '3:0'],
  'A and B keep their ticks, D keeps it in its new phase, renamed C loses it'
);
select is(
  (select count(*)::integer
   from public.roadmap_milestone_marks mark
   join public.roadmap_heads head on head.current_version_id = mark.version_id
   where mark.reached_on <> (clock_timestamp() at time zone 'utc')::date),
  0,
  'each with the day it was ticked'
);
select is(
  (select count(*)::integer from public.roadmap_milestone_marks
   where version_id = (select id from made where label = 'v1')),
  4,
  'the earlier version keeps its own ticks'
);
select is(
  (select mark.phase_index::integer
   from public.roadmap_review_marks mark
   join public.roadmap_heads head on head.current_version_id = mark.version_id),
  0,
  'the done review stays with its phase'
);

-- A milestone with a new date loses its tick.
do $$
begin
  perform public.edit_roadmap(
    jsonb_set(pg_temp.edited(), '{phases,1,milestones,0,targetDate}',
      to_jsonb(pg_temp.day(1))),
    2
  );
end;
$$;
select is(
  (select array_agg(mark.phase_index || ':' || mark.milestone_index
     order by mark.phase_index, mark.milestone_index)
   from public.roadmap_milestone_marks mark
   join public.roadmap_heads head on head.current_version_id = mark.version_id),
  array['0:0', '3:0'],
  'B, moved to another day, starts unticked'
);

-- Someone else, and no one ------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"73000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select throws_ok(
  format('select * from public.edit_roadmap(%L::jsonb, 3)', pg_temp.edited()),
  'PT409', 'Your roadmap changed. Reload and try again.',
  'another owner, with no roadmap, cannot edit the first one''s'
);
select is(
  (select count(*)::integer from public.roadmap_versions)
    + (select count(*)::integer from public.roadmap_milestone_marks),
  0,
  'and reads none of it'
);

reset role;
set local role anon;
select throws_ok(
  format('select * from public.edit_roadmap(%L::jsonb, 1)', pg_temp.edited()),
  '42501', null,
  'no one signed in may edit one'
);

-- A review on a phase's last day, and the phase then lengthened ----------------------

reset role;
with stored as (
  insert into public.roadmap_proposals (user_id, origin, schema_version, content)
  values (
    '73000000-0000-4000-8000-000000000002', 'owner_written', 'fittip.roadmap.v4',
    pg_temp.roadmap('Ends today', -30, 54, jsonb_build_array(
      pg_temp.phase('First', -30, -10),
      pg_temp.phase('Second', -9, 0),
      pg_temp.phase('Third', 1, 54)))
  )
  returning id
)
insert into made select 'second', id from stored;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"73000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

insert into made
select 'second-v1', version_id
from public.accept_roadmap_proposal((select id from made where label = 'second'), 0);
do $$
begin
  perform public.set_roadmap_reviewed(
    (select id from made where label = 'second-v1'), 1
  );
end;
$$;

select is(
  (select result
   from public.edit_roadmap(
     pg_temp.roadmap('Ends today', -30, 54, jsonb_build_array(
       pg_temp.phase('First', -30, -10),
       pg_temp.phase('Second', -9, 3),
       pg_temp.phase('Third', 4, 54))),
     1)),
  'accepted',
  'the phase that ends today may still be lengthened'
);
select is(
  (select mark.phase_index::integer
   from public.roadmap_review_marks mark
   join public.roadmap_heads head on head.current_version_id = mark.version_id),
  0,
  'and its review falls back to the phase before, which has ended'
);

select * from finish();
rollback;
