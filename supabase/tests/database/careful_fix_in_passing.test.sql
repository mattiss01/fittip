-- The database half of "Fix in passing" (15 Oct 2026), against the real
-- functions: one saved session per title, a typed sport kept in one write,
-- asking again tied to the roadmap its predecessor was made under, and a
-- malformed completion number answered as an invalid change.

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
    'startDate', pg_temp.day(0)::text,
    'endDate', pg_temp.day(84)::text,
    'phases', jsonb_build_array(jsonb_build_object(
      'title', 'Base',
      'focus', 'Easy volume, consistent weeks.',
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

create function pg_temp.propose(p_key text, p_head bigint)
returns uuid
language plpgsql
as $$
declare
  v_token uuid;
  v_proposal uuid;
begin
  select completion_token into v_token
  from public.begin_roadmap_generation(
    p_key, p_key || '-fingerprint', pg_temp.day(0), pg_temp.day(84), p_head
  );
  select proposal_id into v_proposal
  from public.finish_roadmap_generation(
    v_token, 'proposal', 'fittip.roadmap.v4', 'roadmap-v4.2-2026-10-13',
    'fixture', 'fixture-corpus-v1', 'fixture-no-spend',
    p_content => pg_temp.roadmap(p_key), p_sources => '[]'::jsonb
  );
  return v_proposal;
end;
$$;

create function pg_temp.save(p_title text)
returns text
language sql
as $$
  select result from public.apply_saved_session_change(
    'create', p_name => p_title, p_title => p_title, p_sport => 'Running',
    p_activities => '[]'::jsonb
  )
$$;

create temporary table made (label text primary key, proposal_id uuid);
grant all on made to public;

select plan(17);

-- The objects --------------------------------------------------------------------

select ok(
  exists (
    select 1 from pg_catalog.pg_indexes
    where schemaname = 'public' and tablename = 'saved_sessions'
      and indexname = 'saved_sessions_title_key'
      and indexdef like 'CREATE UNIQUE INDEX%'
  ),
  'saved session titles are unique per owner'
);
select ok(
  has_function_privilege('authenticated', 'public.keep_sports(text[])', 'EXECUTE')
  and not has_function_privilege('anon', 'public.keep_sports(text[])', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.keep_sports(text[])', 'EXECUTE'),
  'only authenticated may keep sports'
);
select ok(
  exists (
    select 1
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'keep_sports'
      and not p.prosecdef
      and pg_catalog.array_to_string(p.proconfig, ',') = 'search_path=""'
  ),
  'keep_sports runs as the caller, with an empty search path'
);
select ok(
  has_function_privilege('authenticated',
    'public.apply_saved_session_change(text,uuid,bigint,text,text,text,text,integer,text,jsonb)',
    'EXECUTE')
  and not has_function_privilege('anon',
    'public.apply_saved_session_change(text,uuid,bigint,text,text,text,text,integer,text,jsonb)',
    'EXECUTE'),
  'the library function kept its privileges'
);

-- Two owners ---------------------------------------------------------------------

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('71000000-0000-4000-8000-000000000001', 'careful-owner@example.test', '{}', '{}'),
  ('71000000-0000-4000-8000-000000000002', 'careful-other@example.test', '{}', '{}');
insert into public.profiles (user_id, timezone_name, sports)
values
  ('71000000-0000-4000-8000-000000000001', 'UTC', array['Running']),
  ('71000000-0000-4000-8000-000000000002', 'UTC', array['Rowing']);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- 1. One saved session per title ------------------------------------------------

select is(pg_temp.save('Intervals'), 'created', 'a first entry is saved');
select throws_ok(
  $$select pg_temp.save('  intervals ')$$,
  'PT434', 'A saved session with that title already exists.',
  'the same title in another case and spacing is refused with its own code'
);
select is(pg_temp.save('Intervals (2)'), 'created', 'another title is saved');

select set_config('request.jwt.claims',
  '{"sub":"71000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is(pg_temp.save('Intervals'), 'created',
  'another owner may use the same title');

-- 2. Sports in one write --------------------------------------------------------

select keep_sports(array['Running', 'Cycling']);
select is(
  (select sports from public.profiles
   where user_id = '71000000-0000-4000-8000-000000000002'),
  array['Rowing', 'Running', 'Cycling'],
  'new sports are appended to the caller''s own list'
);
-- Read past RLS, which would hide the other row from the caller anyway.
reset role;
select is(
  (select sports from public.profiles
   where user_id = '71000000-0000-4000-8000-000000000001'),
  array['Running'],
  'and nobody else''s'
);
set local role authenticated;

select set_config('request.jwt.claims',
  '{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select keep_sports(array[
  ' running ', 'Swim', 'swim', 'Running, cycling', '', repeat('x', 61), null
]);
select is(
  (select sports from public.profiles
   where user_id = '71000000-0000-4000-8000-000000000001'),
  array['Running', 'Swim'],
  'a known sport, a repeat, a comma, an empty name and an overlong one are passed over'
);

reset role;
update public.profiles
set sports = array(select 'Sport ' || n from generate_series(1, 99) as n)
where user_id = '71000000-0000-4000-8000-000000000001';
set local role authenticated;
select keep_sports(array['Climbing', 'Diving']);
select is(
  (select cardinality(sports) from public.profiles
   where user_id = '71000000-0000-4000-8000-000000000001'),
  100,
  'the list stops at its limit'
);

-- 3. Asking again is tied to its roadmap -----------------------------------------

insert into made select 'declined', pg_temp.propose('careful-declined-key-00001', 0);
insert into made select 'accepted', pg_temp.propose('careful-accepted-key-00002', 0);
select is(
  (select result from public.apply_roadmap_proposal_change(
    'reject', (select proposal_id from made where label = 'declined'))),
  'rejected',
  'the first proposal is declined'
);
select is(
  (select result from public.accept_roadmap_proposal(
    (select proposal_id from made where label = 'accepted'), 0)),
  'accepted',
  'and another roadmap is accepted after it'
);
select throws_ok(
  format(
    $f$select * from public.begin_roadmap_generation(
      'careful-ask-again-key-0003', 'careful-ask-again-f', %L::date, %L::date, 1,
      p_previous_proposal_id => %L::uuid,
      p_regeneration_feedback => 'Fewer long runs.')$f$,
    pg_temp.day(0), pg_temp.day(84),
    (select proposal_id from made where label = 'declined')
  ),
  'PT409', 'Your roadmap changed. Reload and try again.',
  'asking again after a proposal made under an earlier roadmap is refused'
);

-- 4. A malformed number is an invalid change -------------------------------------

select throws_ok(
  format(
    $f$select * from public.apply_completion_change('create', null, null, %L::jsonb)$f$,
    jsonb_build_object(
      'status', 'unplanned',
      'actualLocalDate', pg_temp.day(0)::text,
      'title', 'Easy run', 'sport', 'Running',
      'activities', jsonb_build_array(jsonb_build_object(
        'position', '1.0'::jsonb, 'name', 'Easy running', 'sport', 'Running',
        'measurementMode', 'unmeasured'
      ))
    )
  ),
  '22023', 'Invalid completion change.',
  'a position of 1.0 is an invalid change, not a raw 22P02'
);

-- Anonymous callers --------------------------------------------------------------

reset role;
set local role anon;
select throws_ok(
  $$select public.keep_sports(array['Running'])$$,
  '42501', null,
  'anonymous callers cannot keep sports'
);

select * from finish();

rollback;
