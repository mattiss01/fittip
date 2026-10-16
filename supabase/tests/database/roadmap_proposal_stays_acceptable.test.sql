-- A roadmap proposal stays acceptable (owner, 16 Oct 2026).
--
-- Proved here: sources changed after they travelled no longer block
-- acceptance, whatever their kind, and a goal the coach was given but the
-- roadmap does not name may go too; the one refusal left is a named goal that
-- is no longer the owner's active or achieved goal, and it changes nothing.

begin;

create extension if not exists pgtap with schema extensions;

create function pg_temp.day(p_offset integer)
returns date
language sql
stable
as $$
  select ((clock_timestamp() at time zone 'utc')::date + p_offset)
$$;

-- One valid v4 body naming one goal, in a phase's attention and a milestone.
create function pg_temp.roadmap(p_goal_id uuid, p_title text)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'schemaVersion', 'fittip.roadmap.v4',
    'title', p_title,
    'summary', 'Build an aerobic base.',
    'startDate', pg_temp.day(0)::text,
    'endDate', pg_temp.day(84)::text,
    'phases', jsonb_build_array(jsonb_build_object(
      'title', 'Base',
      'focus', 'Easy volume, consistent weeks.',
      'startDate', pg_temp.day(0)::text,
      'endDate', pg_temp.day(84)::text,
      'goalAttention', jsonb_build_array(jsonb_build_object(
        'goalId', p_goal_id, 'level', 'primary')),
      'milestones', jsonb_build_array(jsonb_build_object(
        'title', 'Four steady weeks',
        'targetDate', pg_temp.day(84)::text,
        'goalIds', jsonb_build_array(p_goal_id)))
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
create temporary table finished (
  label text primary key,
  status text,
  proposal_id uuid
);
create temporary table acceptance (
  label text primary key,
  proposal_id uuid,
  version_id uuid,
  head_revision bigint,
  result text
);
grant all on claim, finished, acceptance to public;

-- One proposal, begun under `p_head`, naming `p_goal_id`, with `p_sources`.
create function pg_temp.propose(
  p_label text, p_head bigint, p_goal_id uuid, p_sources jsonb
)
returns void
language plpgsql
as $$
begin
  insert into claim
  select p_label, * from public.begin_roadmap_generation(
    rpad('key-' || p_label, 30, '0'),
    rpad('fingerprint-' || p_label, 38, '0'),
    pg_temp.day(0), pg_temp.day(84), p_head);
  insert into finished
  select p_label, * from public.finish_roadmap_generation(
    (select completion_token from claim where label = p_label),
    'proposal', 'fittip.roadmap.v4', 'roadmap-2026-08-10',
    'fixture', 'fixture-corpus-v1', 'fixture-no-spend',
    p_content => pg_temp.roadmap(p_goal_id, p_label),
    p_sources => p_sources);
end;
$$;

select plan(7);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values ('7e000000-0000-4000-8000-000000000001', 'stays-open@example.test', '{}', '{}');
insert into public.profiles (user_id, timezone_name)
values ('7e000000-0000-4000-8000-000000000001', 'UTC');
-- g1 is named and stays; g2 is named and is deleted; g3 is given to the coach
-- but named by nothing, and is deleted.
insert into public.goals (id, user_id, title, desired_outcome, sports, priority_tier, active_rank)
values
  ('7e000000-0000-4000-8000-0000000000a1', '7e000000-0000-4000-8000-000000000001',
   'Run a 10k', 'Under 48 minutes.', array['Running'], 'core', 1),
  ('7e000000-0000-4000-8000-0000000000a2', '7e000000-0000-4000-8000-000000000001',
   'Swim a mile', 'Without stopping.', array['Swimming'], 'core', 2),
  ('7e000000-0000-4000-8000-0000000000a3', '7e000000-0000-4000-8000-000000000001',
   'Stretch daily', 'Ten minutes a day.', array['Mobility'], 'supporting', 3);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"7e000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- Sources that no longer match anything: a log at a revision it never had, a
-- memory item that does not exist, and the goal named by nothing.
select pg_temp.propose('changed-sources', 0,
  '7e000000-0000-4000-8000-0000000000a1',
  '[{"kind":"goal","recordId":"7e000000-0000-4000-8000-0000000000a1"},
    {"kind":"goal","recordId":"7e000000-0000-4000-8000-0000000000a3"},
    {"kind":"completion","recordId":"7e000000-0000-4000-8000-0000000000c1","revisionNumber":9},
    {"kind":"memory","recordId":"7e000000-0000-4000-8000-0000000000d1","revisionNumber":2}]'::jsonb);
-- The same goal and no other change, but read under the roadmap before the
-- acceptance below: its page is stale.
select pg_temp.propose('old-page', 0,
  '7e000000-0000-4000-8000-0000000000a1',
  '[{"kind":"goal","recordId":"7e000000-0000-4000-8000-0000000000a1"}]'::jsonb);
select pg_temp.propose('named-goal-gone', 0,
  '7e000000-0000-4000-8000-0000000000a2',
  '[{"kind":"goal","recordId":"7e000000-0000-4000-8000-0000000000a2"}]'::jsonb);

reset role;
delete from public.goals where id in (
  '7e000000-0000-4000-8000-0000000000a2', '7e000000-0000-4000-8000-0000000000a3');
set local role authenticated;

select ok(
  (select count(*) from public.roadmap_proposal_sources
   where proposal_id = (select proposal_id from finished where label = 'changed-sources')) = 4,
  'the proposal carries all four sources, so acceptance has them to ignore'
);

-- The one refusal left -------------------------------------------------------

select throws_ok(
  format($$select * from public.accept_roadmap_proposal(%L::uuid, 0)$$,
    (select proposal_id from finished where label = 'named-goal-gone')),
  'PT409', 'Your goals changed. A goal this proposal names is no longer active.',
  'a proposal naming a goal since deleted cannot be put in force'
);
select is(
  (select count(*)::integer from public.roadmap_versions
   where user_id = '7e000000-0000-4000-8000-000000000001'),
  0,
  'and the refusal put nothing in force'
);

-- Everything else stays acceptable --------------------------------------------

insert into acceptance
select 'changed-sources', * from public.accept_roadmap_proposal(
  (select proposal_id from finished where label = 'changed-sources'), 0);
select is(
  (select result from acceptance where label = 'changed-sources'), 'accepted',
  'changed logs and memory, and a deleted goal it does not name, do not block'
);
select is(
  (select current_version_id from public.roadmap_heads
   where user_id = '7e000000-0000-4000-8000-000000000001'),
  (select version_id from acceptance where label = 'changed-sources'),
  'the accepted proposal is the roadmap in force'
);

-- The kept checks still hold ---------------------------------------------------

select throws_ok(
  format($$select * from public.accept_roadmap_proposal(%L::uuid, 0)$$,
    (select proposal_id from finished where label = 'old-page')),
  'PT409', 'Your roadmap changed. Review the proposal again.',
  'a page that read an older roadmap is still refused'
);
select ok(
  (select prosecdef and proconfig @> array['search_path=""']
   from pg_proc
   where oid = 'public.accept_roadmap_proposal(uuid, bigint)'::regprocedure)
  and has_function_privilege('authenticated',
    'public.accept_roadmap_proposal(uuid, bigint)', 'EXECUTE')
  and not has_function_privilege('anon',
    'public.accept_roadmap_proposal(uuid, bigint)', 'EXECUTE'),
  'it is still a security definer only an authenticated owner may call'
);

select * from finish();
rollback;
