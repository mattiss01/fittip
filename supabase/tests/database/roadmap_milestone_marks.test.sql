-- Whether a milestone was reached (ADR-026).
--
-- A mark is the owner's, on a milestone of the roadmap in force, holding the
-- owner's local day. It can be taken back. Proved here: the table's shape and
-- its privilege boundary (read by its owner, written by nobody directly); the
-- function's refusals, which are one and the same for every reason; that a
-- repeat changes nothing; that another owner and an anonymous caller get
-- nowhere; and that a roadmap which has been replaced can no longer be marked.
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

-- One valid `fittip.roadmap.v4` body: one phase, one milestone.
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
      'milestones', jsonb_build_array(jsonb_build_object(
        'title', 'Four steady weeks',
        'observableCriterion', 'Four consecutive weeks with every planned easy run logged.',
        'targetDate', pg_temp.day(84)::text,
        'goalIds', jsonb_build_array('00000000-0000-4000-8000-000000000001')
      ))
    ))
  )
$$;

-- Generates and accepts one roadmap as the current caller, and returns the
-- accepted version.
create function pg_temp.accept_roadmap(p_key text, p_head bigint)
returns uuid
language plpgsql
as $$
declare
  v_token uuid;
  v_proposal uuid;
  v_version uuid;
begin
  select completion_token into v_token
  from public.begin_roadmap_generation(
    p_key, p_key || '-fingerprint', pg_temp.day(0), pg_temp.day(84), p_head
  );
  select proposal_id into v_proposal
  from public.finish_roadmap_generation(
    v_token, 'proposal', 'fittip.roadmap.v4', 'roadmap-v4-2026-10-13',
    'fixture', 'fixture-corpus-v1', 'fixture-no-spend',
    p_content => pg_temp.roadmap(p_key), p_sources => '[]'::jsonb
  );
  select version_id into v_version
  from public.accept_roadmap_proposal(v_proposal, p_head);
  return v_version;
end;
$$;

create temporary table accepted (label text primary key, version_id uuid);
grant all on accepted to public;

select plan(38);

-- The table --------------------------------------------------------------------

select has_table('public', 'roadmap_milestone_marks', 'the marks have a table');
select columns_are(
  'public', 'roadmap_milestone_marks',
  array['user_id', 'version_id', 'phase_index', 'milestone_index', 'reached_on', 'created_at'],
  'and it holds the owner, the place and the day, and nothing else'
);
select col_type_is('public', 'roadmap_milestone_marks', 'reached_on', 'date', 'the day is a date');
select col_is_pk(
  'public', 'roadmap_milestone_marks',
  array['version_id', 'phase_index', 'milestone_index'],
  'one mark for a milestone'
);
select fk_ok(
  'public', 'roadmap_milestone_marks', array['version_id', 'user_id'],
  'public', 'roadmap_versions', array['id', 'user_id'],
  'a mark names a version and its owner together'
);
select has_index(
  'public', 'roadmap_milestone_marks', 'roadmap_milestone_marks_owner_idx',
  array['user_id', 'version_id'],
  'the owner''s marks of one version have an access path'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class
   where oid = 'public.roadmap_milestone_marks'::regclass),
  'row level security is on'
);
select policies_are(
  'public', 'roadmap_milestone_marks',
  array['roadmap_milestone_marks_owner_select'],
  'the one policy is the owner''s select'
);

-- The privilege boundary -------------------------------------------------------

select ok(
  has_table_privilege('authenticated', 'public.roadmap_milestone_marks', 'SELECT')
  and not has_table_privilege('authenticated', 'public.roadmap_milestone_marks', 'INSERT')
  and not has_table_privilege('authenticated', 'public.roadmap_milestone_marks', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.roadmap_milestone_marks', 'DELETE'),
  'authenticated may read marks and write none directly'
);
select ok(
  not has_table_privilege('anon', 'public.roadmap_milestone_marks', 'SELECT')
  and not has_table_privilege('service_role', 'public.roadmap_milestone_marks', 'SELECT'),
  'anon and service_role may not read them'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.set_roadmap_milestone_reached(uuid,integer,integer,boolean)', 'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.set_roadmap_milestone_reached(uuid,integer,integer,boolean)', 'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.set_roadmap_milestone_reached(uuid,integer,integer,boolean)', 'EXECUTE'
  ),
  'only authenticated may mark a milestone'
);
select is(
  (
    select count(*)::integer
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'set_roadmap_milestone_reached'
      and p.prosecdef
      and pg_catalog.array_to_string(p.proconfig, ',') = 'search_path=""'
  ),
  1,
  'the function runs as definer with an empty search path'
);

-- Two owners -------------------------------------------------------------------
--
-- The first is fourteen hours ahead of UTC, so for fourteen hours of a day its
-- date is not UTC's. The second has confirmed no time zone.

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('6e000000-0000-4000-8000-000000000001', 'marks-owner@example.test', '{}', '{}'),
  ('6e000000-0000-4000-8000-000000000002', 'marks-other@example.test', '{}', '{}');
insert into public.profiles (user_id, timezone_name)
values
  ('6e000000-0000-4000-8000-000000000001', 'Pacific/Kiritimati'),
  ('6e000000-0000-4000-8000-000000000002', null);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"6e000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

insert into accepted
select 'first', pg_temp.accept_roadmap('milestone-marks-first-key-0001', 0);

-- Refusals ---------------------------------------------------------------------

select throws_ok(
  format(
    'select public.set_roadmap_milestone_reached(%L::uuid, 1, 0, true)',
    (select version_id from accepted where label = 'first')
  ),
  '22023', 'Invalid milestone mark.',
  'a phase the roadmap does not have is refused'
);
select throws_ok(
  format(
    'select public.set_roadmap_milestone_reached(%L::uuid, 0, 1, true)',
    (select version_id from accepted where label = 'first')
  ),
  '22023', 'Invalid milestone mark.',
  'a milestone the phase does not have is refused'
);
select throws_ok(
  format(
    'select public.set_roadmap_milestone_reached(%L::uuid, 6, 0, true)',
    (select version_id from accepted where label = 'first')
  ),
  '22023', 'Invalid milestone mark.',
  'a position outside what a roadmap may hold is refused'
);
select throws_ok(
  format(
    'select public.set_roadmap_milestone_reached(%L::uuid, 0, -1, true)',
    (select version_id from accepted where label = 'first')
  ),
  '22023', 'Invalid milestone mark.',
  'a negative position is refused'
);
select throws_ok(
  format(
    'select public.set_roadmap_milestone_reached(%L::uuid, 0, 0, null)',
    (select version_id from accepted where label = 'first')
  ),
  '22023', 'Invalid milestone mark.',
  'neither reached nor not is refused'
);
select throws_ok(
  $$select public.set_roadmap_milestone_reached(
    '6e000000-0000-4000-8000-0000000000ff', 0, 0, true)$$,
  '22023', 'Invalid milestone mark.',
  'a version that does not exist is refused'
);
select throws_ok(
  format(
    $$insert into public.roadmap_milestone_marks
        (user_id, version_id, phase_index, milestone_index, reached_on)
      values ('6e000000-0000-4000-8000-000000000001', %L::uuid, 0, 0, current_date)$$,
    (select version_id from accepted where label = 'first')
  ),
  '42501', null,
  'a mark cannot be written past the function'
);

-- Marking ----------------------------------------------------------------------

select lives_ok(
  format(
    'select public.set_roadmap_milestone_reached(%L::uuid, 0, 0, true)',
    (select version_id from accepted where label = 'first')
  ),
  'the owner marks a milestone of the roadmap in force'
);
select is(
  (select reached_on from public.roadmap_milestone_marks
   where version_id = (select version_id from accepted where label = 'first')),
  (pg_catalog.timezone('Pacific/Kiritimati', pg_catalog.now()))::date,
  'the day is today where the owner is'
);

reset role;
update public.roadmap_milestone_marks
set reached_on = reached_on - 3
where user_id = '6e000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"6e000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok(
  format(
    'select public.set_roadmap_milestone_reached(%L::uuid, 0, 0, true)',
    (select version_id from accepted where label = 'first')
  ),
  'marking it again is not an error'
);
select is(
  (select array_agg(reached_on) from public.roadmap_milestone_marks),
  array[(pg_catalog.timezone('Pacific/Kiritimati', pg_catalog.now()))::date - 3],
  'and keeps the one mark, on the day it was first made'
);
select throws_ok(
  $$delete from public.roadmap_milestone_marks$$,
  '42501', null,
  'a mark cannot be deleted past the function either'
);

-- Another owner, and nobody ------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"6e000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

-- With a roadmap in force of their own, so that what is refused below is the
-- other owner's version and not the lack of any.
insert into accepted
select 'other', pg_temp.accept_roadmap('milestone-marks-other-key-00003', 0);

select is(
  (select count(*)::integer from public.roadmap_milestone_marks),
  0,
  'another owner reads none of these marks'
);
select throws_ok(
  format(
    'select public.set_roadmap_milestone_reached(%L::uuid, 0, 0, false)',
    (select version_id from accepted where label = 'first')
  ),
  '22023', 'Invalid milestone mark.',
  'and cannot take one back, with the refusal an unknown version gets'
);
select throws_ok(
  format(
    'select public.set_roadmap_milestone_reached(%L::uuid, 0, 0, true)',
    (select version_id from accepted where label = 'first')
  ),
  '22023', 'Invalid milestone mark.',
  'nor mark a milestone of a roadmap that is not theirs'
);
select lives_ok(
  format(
    'select public.set_roadmap_milestone_reached(%L::uuid, 0, 0, true)',
    (select version_id from accepted where label = 'other')
  ),
  'they mark a milestone of their own roadmap'
);
select is(
  (select array_agg(reached_on) from public.roadmap_milestone_marks),
  array[(pg_catalog.now() at time zone 'utc')::date],
  'and with no time zone confirmed, the day is UTC''s; it is the one mark they read'
);
select throws_ok(
  $$update public.roadmap_milestone_marks set reached_on = reached_on - 1$$,
  '42501', null,
  'a mark''s day cannot be changed past the function'
);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  format(
    'select public.set_roadmap_milestone_reached(%L::uuid, 0, 0, true)',
    (select version_id from accepted where label = 'first')
  ),
  '42501', null,
  'an anonymous caller cannot call the function'
);

-- Taking a mark back -------------------------------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"6e000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is(
  (select count(*)::integer from public.roadmap_milestone_marks),
  1,
  'the owner''s mark is untouched by all of that'
);
select lives_ok(
  format(
    'select public.set_roadmap_milestone_reached(%L::uuid, 0, 0, false)',
    (select version_id from accepted where label = 'first')
  ),
  'the owner takes the mark back'
);
select lives_ok(
  format(
    'select public.set_roadmap_milestone_reached(%L::uuid, 0, 0, false)',
    (select version_id from accepted where label = 'first')
  ),
  'taking back a mark that is not there is not an error'
);
select is(
  (select count(*)::integer from public.roadmap_milestone_marks),
  0,
  'and no mark is left, nor any trace of one'
);

-- A roadmap that has been replaced ------------------------------------------------

select public.set_roadmap_milestone_reached(
  (select version_id from accepted where label = 'first'), 0, 0, true
);
insert into accepted
select 'second', pg_temp.accept_roadmap('milestone-marks-second-key-0002', 1);

select throws_ok(
  format(
    'select public.set_roadmap_milestone_reached(%L::uuid, 0, 0, false)',
    (select version_id from accepted where label = 'first')
  ),
  '22023', 'Invalid milestone mark.',
  'a mark on a replaced roadmap can no longer be taken back'
);
select throws_ok(
  format(
    'select public.set_roadmap_milestone_reached(%L::uuid, 0, 0, true)',
    (select version_id from accepted where label = 'first')
  ),
  '22023', 'Invalid milestone mark.',
  'nor can a replaced roadmap be marked'
);
select is(
  (select count(*)::integer from public.roadmap_milestone_marks
   where version_id = (select version_id from accepted where label = 'first')),
  1,
  'and the mark it had stays as it was'
);

select * from finish();
rollback;
