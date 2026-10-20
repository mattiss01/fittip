-- Deleting the roadmap (ADR-036).
--
-- Proved against the real functions: `delete_roadmap` erases every roadmap
-- record of its caller, the versions, the proposals open or decided, the
-- coach requests, sources, decisions, ticks and reviews; it refuses a version
-- that is not the one in force, a new roadmap's included; with no roadmap in force it reports a replay and touches
-- nothing, so a retry cannot erase what came after; another owner's roadmap is
-- untouched; anonymous callers are refused; and a new roadmap can be accepted
-- afterwards, from revision 0.

begin;

create extension if not exists pgtap with schema extensions;

create function pg_temp.day(p_offset integer)
returns text
language sql
stable
as $$
  select ((clock_timestamp() at time zone 'utc')::date + p_offset)::text
$$;

create function pg_temp.roadmap(p_title text)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'schemaVersion', 'fittip.roadmap.v4',
    'title', p_title,
    'startDate', pg_temp.day(-10),
    'endDate', pg_temp.day(40),
    'phases', jsonb_build_array(
      jsonb_build_object(
        'title', 'Base',
        'focus', 'Training.',
        'startDate', pg_temp.day(-10),
        'endDate', pg_temp.day(-3),
        'goalAttention', jsonb_build_array(jsonb_build_object(
          'goalId', '00000000-0000-4000-8000-000000000001',
          'level', 'primary'
        )),
        'milestones', jsonb_build_array(jsonb_build_object(
          'title', 'A', 'targetDate', pg_temp.day(-5), 'goalIds', '[]'::jsonb
        ))
      ),
      jsonb_build_object(
        'title', 'Build',
        'focus', 'Training.',
        'startDate', pg_temp.day(-2),
        'endDate', pg_temp.day(40),
        'goalAttention', jsonb_build_array(jsonb_build_object(
          'goalId', '00000000-0000-4000-8000-000000000001',
          'level', 'primary'
        )),
        'milestones', '[]'::jsonb
      )
    )
  )
$$;

-- Every roadmap row one owner has, across the eight tables.
create function pg_temp.roadmap_rows(p_user uuid)
returns bigint
language sql
stable
as $$
  select
    (select count(*) from public.roadmap_heads where user_id = p_user)
    + (select count(*) from public.roadmap_versions where user_id = p_user)
    + (select count(*) from public.roadmap_milestone_marks where user_id = p_user)
    + (select count(*) from public.roadmap_review_marks where user_id = p_user)
    + (select count(*) from public.roadmap_proposals where user_id = p_user)
    + (select count(*) from public.roadmap_proposal_decisions where user_id = p_user)
    + (select count(*) from public.roadmap_proposal_sources where user_id = p_user)
    + (select count(*) from public.roadmap_generation_requests where user_id = p_user)
$$;

create temporary table made (label text primary key, id uuid);
grant all on made to public;

select plan(15);

-- The function ----------------------------------------------------------------------

select ok(
  has_function_privilege(
    'authenticated', 'public.delete_roadmap(uuid)', 'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'public.delete_roadmap(uuid)', 'EXECUTE'
  )
  and not has_function_privilege(
    'service_role', 'public.delete_roadmap(uuid)', 'EXECUTE'
  )
  and not has_function_privilege(
    'public', 'public.delete_roadmap(uuid)', 'EXECUTE'
  ),
  'only authenticated may delete a roadmap'
);
select is(
  (select p.prosecdef
     and pg_catalog.array_to_string(p.proconfig, ',') = 'search_path=""'
   from pg_catalog.pg_proc as p
   join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'delete_roadmap'),
  true,
  'it runs as definer with an empty search path'
);

-- Two owners, each with a roadmap ---------------------------------------------------

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('74000000-0000-4000-8000-000000000001', 'delete-owner@example.test', '{}', '{}'),
  ('74000000-0000-4000-8000-000000000002', 'delete-other@example.test', '{}', '{}');
insert into public.profiles (user_id, timezone_name)
values
  ('74000000-0000-4000-8000-000000000001', 'UTC'),
  ('74000000-0000-4000-8000-000000000002', 'UTC');

with stored as (
  insert into public.roadmap_proposals (user_id, origin, schema_version, content)
  values
    ('74000000-0000-4000-8000-000000000001', 'owner_written',
      'fittip.roadmap.v4', pg_temp.roadmap('Owner')),
    ('74000000-0000-4000-8000-000000000002', 'owner_written',
      'fittip.roadmap.v4', pg_temp.roadmap('Other'))
  returning id, user_id
)
insert into made
select case when user_id = '74000000-0000-4000-8000-000000000001'
  then 'owner proposal' else 'other proposal' end, id
from stored;

-- An open proposal the owner has not decided, and a coach request still
-- running, both of which go with the roadmap.
insert into public.roadmap_proposals (user_id, origin, schema_version, content)
values (
  '74000000-0000-4000-8000-000000000001', 'owner_written',
  'fittip.roadmap.v4', pg_temp.roadmap('Undecided')
);
insert into public.roadmap_generation_requests (
  user_id, completion_token, idempotency_key, request_fingerprint,
  requested_start_date, requested_end_date, expected_head_revision,
  regeneration_number, status
)
values (
  '74000000-0000-4000-8000-000000000001', gen_random_uuid(),
  'delete-roadmap-running-request', 'delete-roadmap-fingerprint',
  pg_temp.day(0)::date, pg_temp.day(60)::date, 1, 0, 'pending'
);

set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"74000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select ok(
  (select version_id is not null
   from public.accept_roadmap_proposal(
     (select id from made where label = 'other proposal'), 0)),
  'the other owner has a roadmap in force'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"74000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
insert into made
select 'v1', version_id
from public.accept_roadmap_proposal(
  (select id from made where label = 'owner proposal'), 0
);
do $$
begin
  perform public.set_roadmap_milestone_reached(
    (select id from made where label = 'v1'), 0, 0, true);
  perform public.set_roadmap_reviewed((select id from made where label = 'v1'), 0);
end;
$$;

reset role;
select ok(
  pg_temp.roadmap_rows('74000000-0000-4000-8000-000000000001') >= 8,
  'the owner has a version, a tick, a review, proposals and a request'
);
set local role authenticated;

-- Refusals ------------------------------------------------------------------------------

select throws_ok(
  'select public.delete_roadmap(null)',
  '22023', 'Invalid roadmap.',
  'no version names no roadmap to delete'
);
select throws_ok(
  format('select public.delete_roadmap(%L)', gen_random_uuid()),
  'PT409', 'Your roadmap changed. Reload and try again.',
  'a version that is not the one in force is refused'
);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  format('select public.delete_roadmap(%L)',
    (select id from made where label = 'v1')),
  '42501', 'permission denied for function delete_roadmap',
  'anonymous callers cannot delete'
);

-- The delete ----------------------------------------------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"74000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is(
  public.delete_roadmap((select id from made where label = 'v1')),
  'deleted',
  'the roadmap is deleted'
);

reset role;
select is(
  pg_temp.roadmap_rows('74000000-0000-4000-8000-000000000001'),
  0::bigint,
  'nothing of it is left in any roadmap table'
);
select is(
  (select count(*) from public.roadmap_heads
   where user_id = '74000000-0000-4000-8000-000000000002'),
  1::bigint,
  'the other owner keeps theirs'
);
set local role authenticated;

select is(
  public.delete_roadmap((select id from made where label = 'v1')),
  'replayed',
  'a repeat finds nothing in force and reports a replay'
);

-- Another owner naming this owner's version reaches only their own roadmap,
-- and is refused.
select set_config(
  'request.jwt.claims',
  '{"sub":"74000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok(
  format('select public.delete_roadmap(%L)',
    (select id from made where label = 'v1')),
  'PT409', 'Your roadmap changed. Reload and try again.',
  'the other owner answers to their own roadmap'
);

-- Afterwards -----------------------------------------------------------------------------

reset role;
with fresh as (
  insert into public.roadmap_proposals (user_id, origin, schema_version, content)
  values (
    '74000000-0000-4000-8000-000000000001', 'owner_written',
    'fittip.roadmap.v4', pg_temp.roadmap('Again')
  )
  returning id
)
insert into made select 'fresh', id from fresh;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"74000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is(
  (select head_revision
   from public.accept_roadmap_proposal(
     (select id from made where label = 'fresh'), 0)),
  1::bigint,
  'a new roadmap starts again from no roadmap'
);
select is(
  (select count(*) from public.roadmap_milestone_marks),
  0::bigint,
  'with no tick carried over'
);
-- A question left open from before the delete names the old version, and
-- cannot erase the new roadmap at the same revision.
select throws_ok(
  format('select public.delete_roadmap(%L)',
    (select id from made where label = 'v1')),
  'PT409', 'Your roadmap changed. Reload and try again.',
  'a stale question cannot delete the new roadmap'
);

select * from finish();

rollback;
