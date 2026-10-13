-- That a roadmap was reviewed (ADR-027).
--
-- A review is due as each phase of the roadmap in force ends; which one is
-- arithmetic on the accepted version and today. What is stored is that the
-- owner looked: the latest phase marked reviewed, per accepted version.
-- Proved here: the table's shape and its privilege boundary (read by its
-- owner, written by nobody directly); that only a phase which has ended can
-- be marked, on the caller's own roadmap in force; that a mark only moves
-- forward; that another owner and an anonymous caller get nowhere; and that
-- the day is the owner's.
--
-- Dates are derived from UTC today, because `begin_roadmap_generation` refuses
-- a start earlier than the day before its own UTC date. The first phase is one
-- day long, so it ends today and can be reviewed at once.

begin;

create extension if not exists pgtap with schema extensions;

create function pg_temp.day(p_offset integer)
returns date
language sql
stable
as $$
  select ((clock_timestamp() at time zone 'utc')::date + p_offset)
$$;

create function pg_temp.phase(p_title text, p_start integer, p_end integer)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'title', p_title,
    'focus', 'Easy volume, consistent weeks, no intensity worth the name.',
    'startDate', pg_temp.day(p_start)::text,
    'endDate', pg_temp.day(p_end)::text,
    'goalAttention', jsonb_build_array(jsonb_build_object(
      'goalId', '00000000-0000-4000-8000-000000000001',
      'level', 'primary'
    )),
    'milestones', '[]'::jsonb
  )
$$;

-- One valid `fittip.roadmap.v4` body in three phases: today, then two more.
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
    'phases', jsonb_build_array(
      pg_temp.phase('Start', 0, 0),
      pg_temp.phase('Base', 1, 42),
      pg_temp.phase('Sharpen', 43, 84)
    )
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

select plan(34);

-- The table --------------------------------------------------------------------

select has_table('public', 'roadmap_review_marks', 'the marks have a table');
select columns_are(
  'public', 'roadmap_review_marks',
  array['version_id', 'user_id', 'phase_index', 'reviewed_on', 'updated_at'],
  'and it holds the version, its owner, the phase and the day, and nothing else'
);
select col_is_pk(
  'public', 'roadmap_review_marks', 'version_id', 'one mark for a version'
);
select fk_ok(
  'public', 'roadmap_review_marks', array['version_id', 'user_id'],
  'public', 'roadmap_versions', array['id', 'user_id'],
  'a mark names a version and its owner together'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class
   where oid = 'public.roadmap_review_marks'::regclass),
  'row level security is on'
);
select policies_are(
  'public', 'roadmap_review_marks',
  array['roadmap_review_marks_owner_select'],
  'the one policy is the owner''s select'
);

-- The privilege boundary -------------------------------------------------------

select ok(
  has_table_privilege('authenticated', 'public.roadmap_review_marks', 'SELECT')
  and not has_table_privilege('authenticated', 'public.roadmap_review_marks', 'INSERT')
  and not has_table_privilege('authenticated', 'public.roadmap_review_marks', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.roadmap_review_marks', 'DELETE'),
  'authenticated may read marks and write none directly'
);
select ok(
  not has_table_privilege('anon', 'public.roadmap_review_marks', 'SELECT')
  and not has_table_privilege('service_role', 'public.roadmap_review_marks', 'SELECT'),
  'anon and service_role may not read them'
);
select ok(
  has_function_privilege(
    'authenticated', 'public.set_roadmap_reviewed(uuid,integer)', 'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'public.set_roadmap_reviewed(uuid,integer)', 'EXECUTE'
  )
  and not has_function_privilege(
    'service_role', 'public.set_roadmap_reviewed(uuid,integer)', 'EXECUTE'
  ),
  'only authenticated may mark a roadmap reviewed'
);
select is(
  (
    select count(*)::integer
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'set_roadmap_reviewed'
      and p.prosecdef
      and pg_catalog.array_to_string(p.proconfig, ',') = 'search_path=""'
  ),
  1,
  'the function runs as definer with an empty search path'
);

-- Two owners -------------------------------------------------------------------
--
-- The second is fourteen hours ahead of UTC, and its day is its own.

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('6f000000-0000-4000-8000-000000000001', 'reviews-owner@example.test', '{}', '{}'),
  ('6f000000-0000-4000-8000-000000000002', 'reviews-other@example.test', '{}', '{}');
insert into public.profiles (user_id, timezone_name)
values
  ('6f000000-0000-4000-8000-000000000001', 'UTC'),
  ('6f000000-0000-4000-8000-000000000002', 'Pacific/Kiritimati');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"6f000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

insert into accepted
select 'first', pg_temp.accept_roadmap('roadmap-review-marks-first-key-01', 0);

-- Refusals ---------------------------------------------------------------------

select throws_ok(
  format(
    'select public.set_roadmap_reviewed(%L::uuid, 1)',
    (select version_id from accepted where label = 'first')
  ),
  '22023', 'Invalid roadmap review.',
  'a phase that has not ended cannot be marked reviewed'
);
select throws_ok(
  format(
    'select public.set_roadmap_reviewed(%L::uuid, 3)',
    (select version_id from accepted where label = 'first')
  ),
  '22023', 'Invalid roadmap review.',
  'a phase the roadmap does not have is refused'
);
select throws_ok(
  format(
    'select public.set_roadmap_reviewed(%L::uuid, 6)',
    (select version_id from accepted where label = 'first')
  ),
  '22023', 'Invalid roadmap review.',
  'a position outside what a roadmap may hold is refused'
);
select throws_ok(
  format(
    'select public.set_roadmap_reviewed(%L::uuid, -1)',
    (select version_id from accepted where label = 'first')
  ),
  '22023', 'Invalid roadmap review.',
  'a negative position is refused'
);
select throws_ok(
  $$select public.set_roadmap_reviewed(
    '6f000000-0000-4000-8000-0000000000ff', 0)$$,
  '22023', 'Invalid roadmap review.',
  'a version that does not exist is refused'
);
select throws_ok(
  format(
    $$insert into public.roadmap_review_marks
        (version_id, user_id, phase_index, reviewed_on)
      values (%L::uuid, '6f000000-0000-4000-8000-000000000001', 0, current_date)$$,
    (select version_id from accepted where label = 'first')
  ),
  '42501', null,
  'a mark cannot be written past the function'
);

-- Marking ----------------------------------------------------------------------

select lives_ok(
  format(
    'select public.set_roadmap_reviewed(%L::uuid, 0)',
    (select version_id from accepted where label = 'first')
  ),
  'the owner marks the phase that ended today reviewed'
);
select is(
  (select phase_index::integer || ' ' || reviewed_on::text
   from public.roadmap_review_marks),
  '0 ' || (pg_catalog.now() at time zone 'utc')::date::text,
  'it holds that phase and the owner''s day'
);
select throws_ok(
  $$update public.roadmap_review_marks set phase_index = 2$$,
  '42501', null,
  'a mark cannot be changed past the function'
);
select throws_ok(
  $$delete from public.roadmap_review_marks$$,
  '42501', null,
  'nor deleted'
);

-- Forward only -------------------------------------------------------------------
--
-- Time is moved by hand, as the table owner: the second phase is made to have
-- ended today too. Nothing in the application can do this to an accepted
-- version; it is the only way a test can stand on a later day.

reset role;
update public.roadmap_versions
set content = jsonb_set(content, '{phases,1,endDate}', to_jsonb(pg_temp.day(0)::text))
where id = (select version_id from accepted where label = 'first');
update public.roadmap_review_marks set reviewed_on = reviewed_on - 5;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"6f000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok(
  format(
    'select public.set_roadmap_reviewed(%L::uuid, 0)',
    (select version_id from accepted where label = 'first')
  ),
  'marking the same phase again is not an error'
);
select is(
  (select phase_index::integer || ' ' || reviewed_on::text
   from public.roadmap_review_marks),
  '0 ' || ((pg_catalog.now() at time zone 'utc')::date - 5)::text,
  'and changes nothing, the day included'
);
select lives_ok(
  format(
    'select public.set_roadmap_reviewed(%L::uuid, 1)',
    (select version_id from accepted where label = 'first')
  ),
  'a later phase that has ended can be marked'
);
select is(
  (select phase_index::integer || ' ' || reviewed_on::text
   from public.roadmap_review_marks),
  '1 ' || (pg_catalog.now() at time zone 'utc')::date::text,
  'and the one mark moves to it, on today'
);
select lives_ok(
  format(
    'select public.set_roadmap_reviewed(%L::uuid, 0)',
    (select version_id from accepted where label = 'first')
  ),
  'an earlier phase sent afterwards is not an error'
);
select is(
  (select phase_index::integer from public.roadmap_review_marks),
  1,
  'and does not move the mark back'
);

-- Another owner, and nobody ------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"6f000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

-- With a roadmap in force of their own, so that what is refused below is the
-- other owner's version and not the lack of any.
insert into accepted
select 'other', pg_temp.accept_roadmap('roadmap-review-marks-other-key-02', 0);

select is(
  (select count(*)::integer from public.roadmap_review_marks),
  0,
  'another owner reads none of these marks'
);
-- The phase the first owner already marked: it has ended, so only whose
-- roadmap it is can refuse this.
select throws_ok(
  format(
    'select public.set_roadmap_reviewed(%L::uuid, 1)',
    (select version_id from accepted where label = 'first')
  ),
  '22023', 'Invalid roadmap review.',
  'and cannot mark a roadmap that is not theirs, with the refusal an unknown version gets'
);
select lives_ok(
  format(
    'select public.set_roadmap_reviewed(%L::uuid, 0)',
    (select version_id from accepted where label = 'other')
  ),
  'they mark their own'
);
select is(
  (select array_agg(reviewed_on) from public.roadmap_review_marks),
  array[(pg_catalog.timezone('Pacific/Kiritimati', pg_catalog.now()))::date],
  'on today where they are; it is the one mark they read'
);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  format(
    'select public.set_roadmap_reviewed(%L::uuid, 0)',
    (select version_id from accepted where label = 'first')
  ),
  '42501', null,
  'an anonymous caller cannot call the function'
);

-- A roadmap that has been replaced ------------------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"6f000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is(
  (select phase_index::integer from public.roadmap_review_marks),
  1,
  'the owner''s mark is untouched by all of that'
);

insert into accepted
select 'second', pg_temp.accept_roadmap('roadmap-review-marks-second-key-3', 1);

select throws_ok(
  format(
    'select public.set_roadmap_reviewed(%L::uuid, 1)',
    (select version_id from accepted where label = 'first')
  ),
  '22023', 'Invalid roadmap review.',
  'a replaced roadmap can no longer be marked reviewed'
);
select is(
  (select count(*)::integer from public.roadmap_review_marks
   where version_id = (select version_id from accepted where label = 'second')),
  0,
  'and the roadmap that replaced it starts with no review marked'
);

select * from finish();
rollback;
