-- A roadmap proposal knows which roadmap it was made under.
--
-- Two things are proved here, against the real functions.
--
-- First, the two-tab case. A proposal left open while a different roadmap is
-- accepted can no longer be accepted afterwards: it was made under another
-- roadmap than the one in force. It can still be declined, an edit of it is
-- refused the same way, and nothing about a proposal made under the current
-- roadmap changes.
--
-- Second, that a request records whether it asked for the roadmap in force to
-- be changed (ADR-028): stored on a first request, refused when there is no
-- roadmap to change, and inherited by a regeneration whatever the caller says.
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

create function pg_temp.roadmap(p_title text)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'schemaVersion', 'fittip.roadmap.v4',
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
      'milestones', '[]'::jsonb
    ))
  )
$$;

-- Opens a request under the head given and finishes it with a proposal.
-- `p_previous` and `p_feedback` make it a regeneration.
create function pg_temp.propose(
  p_key text,
  p_head bigint,
  p_change boolean default false,
  p_previous uuid default null,
  p_feedback text default null
)
returns uuid
language plpgsql
as $$
declare
  v_token uuid;
  v_proposal uuid;
begin
  select completion_token into v_token
  from public.begin_roadmap_generation(
    p_key, p_key || '-fingerprint', pg_temp.day(0), pg_temp.day(84), p_head,
    p_previous_proposal_id => p_previous,
    p_regeneration_feedback => p_feedback,
    p_change_roadmap => p_change
  );
  select proposal_id into v_proposal
  from public.finish_roadmap_generation(
    v_token, 'proposal', 'fittip.roadmap.v4', 'roadmap-v4.2-2026-10-13',
    'fixture', 'fixture-corpus-v1', 'fixture-no-spend',
    p_regeneration_feedback => p_feedback,
    p_content => pg_temp.roadmap(p_key), p_sources => '[]'::jsonb
  );
  return v_proposal;
end;
$$;

create temporary table made (label text primary key, proposal_id uuid);
grant all on made to public;

select plan(22);

-- The functions -----------------------------------------------------------------

select has_column(
  'public', 'roadmap_generation_requests', 'changes_roadmap',
  'a request records whether it asked for a change'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.begin_roadmap_generation(text,text,date,date,bigint,text,uuid,text,boolean)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.begin_roadmap_generation(text,text,date,date,bigint,text,uuid,text,boolean)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.begin_roadmap_generation(text,text,date,date,bigint,text,uuid,text,boolean)',
    'EXECUTE'
  ),
  'only authenticated may open a request'
);
select is(
  (select count(*)::integer
   from pg_catalog.pg_proc as p
   join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'begin_roadmap_generation'),
  1,
  'the earlier signature is gone, not left beside the new one'
);
select is(
  (select count(*)::integer
   from pg_catalog.pg_proc as p
   join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('begin_roadmap_generation', 'accept_roadmap_proposal')
     and p.prosecdef
     and pg_catalog.array_to_string(p.proconfig, ',') = 'search_path=""'),
  2,
  'both functions run as definer with an empty search path'
);
select ok(
  has_function_privilege(
    'authenticated', 'public.accept_roadmap_proposal(uuid,bigint)', 'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'public.accept_roadmap_proposal(uuid,bigint)', 'EXECUTE'
  ),
  'acceptance kept its privileges'
);

-- One owner ----------------------------------------------------------------------

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('70000000-0000-4000-8000-000000000001', 'lineage-owner@example.test', '{}', '{}');
insert into public.profiles (user_id, timezone_name)
values ('70000000-0000-4000-8000-000000000001', 'UTC');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"70000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- A change with nothing to change -------------------------------------------------

select throws_ok(
  $$select * from public.begin_roadmap_generation(
    'lineage-change-without-roadmap-01', 'lineage-change-without-roadmap-01-f',
    pg_temp.day(0), pg_temp.day(84), 0, p_change_roadmap => true)$$,
  '22023', 'Invalid roadmap request.',
  'a request to change a roadmap is refused while none is in force'
);

-- Two proposals under no roadmap, as two tabs would make them ---------------------

insert into made select 'tab-one', pg_temp.propose('lineage-tab-one-key-0000001', 0);
insert into made select 'tab-two', pg_temp.propose('lineage-tab-two-key-0000002', 0);

select is(
  (select result from public.accept_roadmap_proposal(
    (select proposal_id from made where label = 'tab-two'), 0)),
  'accepted',
  'a proposal made under the roadmap in force is accepted'
);
select is(
  (select result from public.accept_roadmap_proposal(
    (select proposal_id from made where label = 'tab-two'), 0)),
  'replayed',
  'and accepting it again still returns its receipt'
);

-- The page has reloaded, so it sends the head it now reads: 1.
select throws_ok(
  format(
    'select * from public.accept_roadmap_proposal(%L::uuid, 1)',
    (select proposal_id from made where label = 'tab-one')
  ),
  'PT409',
  'Your roadmap changed since this was proposed. Decline it and ask again.',
  'the proposal left open under the earlier roadmap can no longer be accepted'
);
select is(
  (select count(*)::integer from public.roadmap_versions),
  1,
  'and no second version was made'
);

-- An edit of it shares its request, and so its roadmap.
insert into made
select 'tab-one-edit', proposal_id
from public.apply_roadmap_proposal_change(
  'edit',
  (select proposal_id from made where label = 'tab-one'),
  pg_temp.roadmap('My own wording')
);
select throws_ok(
  format(
    'select * from public.accept_roadmap_proposal(%L::uuid, 1)',
    (select proposal_id from made where label = 'tab-one-edit')
  ),
  'PT409',
  'Your roadmap changed since this was proposed. Decline it and ask again.',
  'an edit of it is refused the same way'
);
select is(
  (select result from public.apply_roadmap_proposal_change(
    'reject', (select proposal_id from made where label = 'tab-one-edit'))),
  'rejected',
  'and can be declined, which is what the refusal asks for'
);

-- A change request ----------------------------------------------------------------

insert into made
select 'change', pg_temp.propose('lineage-change-key-000000003', 1, true);

select is(
  (select request.changes_roadmap
   from public.roadmap_generation_requests request
   join public.roadmap_proposals proposal
     on proposal.generation_request_id = request.id
   where proposal.id = (select proposal_id from made where label = 'change')),
  true,
  'a request to change the roadmap in force is stored as one'
);
select is(
  (select request.changes_roadmap
   from public.roadmap_generation_requests request
   join public.roadmap_proposals proposal
     on proposal.generation_request_id = request.id
   where proposal.id = (select proposal_id from made where label = 'tab-one')),
  false,
  'and an ordinary request is not'
);

select is(
  (select result from public.apply_roadmap_proposal_change(
    'reject', (select proposal_id from made where label = 'change'))),
  'rejected',
  'the change proposal is declined'
);

-- Asking again: the caller says it is not a change, and it is one all the same.
insert into made
select 'change-again', pg_temp.propose(
  'lineage-change-again-key-00004', 1, false,
  (select proposal_id from made where label = 'change'),
  'Start easier.'
);
select is(
  (select request.changes_roadmap::text || ' ' || request.regeneration_number::text
   from public.roadmap_generation_requests request
   join public.roadmap_proposals proposal
     on proposal.generation_request_id = request.id
   where proposal.id = (select proposal_id from made where label = 'change-again')),
  'true 1',
  'asking again after a declined change is a change request, whatever the caller sent'
);

-- And the reverse: asking again after an ordinary proposal is never a change.
insert into made
select 'plain', pg_temp.propose('lineage-plain-key-0000000005', 1);
select is(
  (select result from public.apply_roadmap_proposal_change(
    'reject', (select proposal_id from made where label = 'change-again'))),
  'rejected',
  'the second change proposal is declined'
);
select is(
  (select result from public.apply_roadmap_proposal_change(
    'reject', (select proposal_id from made where label = 'plain'))),
  'rejected',
  'an ordinary proposal is declined'
);
insert into made
select 'plain-again', pg_temp.propose(
  'lineage-plain-again-key-000006', 1, true,
  (select proposal_id from made where label = 'plain'),
  'Less volume.'
);
select is(
  (select request.changes_roadmap
   from public.roadmap_generation_requests request
   join public.roadmap_proposals proposal
     on proposal.generation_request_id = request.id
   where proposal.id = (select proposal_id from made where label = 'plain-again')),
  false,
  'asking again after an ordinary proposal is not a change, whatever the caller sent'
);

-- Made under the roadmap in force, it is accepted as before.
select is(
  (select result || ' ' || head_revision::text
   from public.accept_roadmap_proposal(
     (select proposal_id from made where label = 'plain-again'), 1)),
  'accepted 2',
  'a proposal made under the roadmap in force is still accepted'
);

-- Another owner cannot learn anything from the new check.
reset role;
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('70000000-0000-4000-8000-000000000002', 'lineage-other@example.test', '{}', '{}');
insert into public.profiles (user_id, timezone_name)
values ('70000000-0000-4000-8000-000000000002', 'UTC');
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"70000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select throws_ok(
  format(
    'select * from public.accept_roadmap_proposal(%L::uuid, 0)',
    (select proposal_id from made where label = 'tab-one')
  ),
  'PT409', 'That proposal is no longer available.',
  'another owner is told only that the proposal is not available'
);
select is(
  (select count(*)::integer from public.roadmap_generation_requests),
  0,
  'and reads none of these requests'
);

select * from finish();
rollback;
