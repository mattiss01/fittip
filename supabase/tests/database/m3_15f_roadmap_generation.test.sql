-- M3-15F: the restored roadmap write path.
--
-- Two things are proved here, and neither is provable anywhere else.
--
-- First, the privilege boundary, against the functions themselves. Table RLS
-- is not the control that matters for these five: every one is
-- `SECURITY DEFINER`, so it runs as its owner and RLS on the roadmap tables is
-- not consulted for what it writes. What stands between a caller and those
-- writes is `execute`, plus each function's own `auth.uid()` derivation. So the
-- assertions below name the function, not the table: `authenticated` holds
-- `execute` and `public`, `anon` and `service_role` hold none of it; an
-- authenticated call without a subject claim is refused; and a call carrying
-- another owner's ids reaches nothing of theirs.
--
-- Second, M3-09. Two simultaneous same-key generations used to end with one of
-- them raising an unmapped `unique_violation`, which the application reported
-- as a failed generation while the other tab's generation ran normally. The
-- rewritten `begin_roadmap_generation` treats that collision as the replay it
-- is. A genuinely concurrent pair needs two sessions and lives in
-- `supabase/tests/integration/m3_15f_concurrent_generation.mjs`; what is proved
-- here is the contract that harness depends on — the losing caller's path
-- returns the stored receipt, never `claimed`, and a differing fingerprint on
-- that same path is still a conflict.
--
-- Dates are derived from UTC today rather than written as literals, because
-- `begin_roadmap_generation` refuses a start earlier than the day before its
-- own UTC date. A fixed literal would pass until it did not.

begin;

create extension if not exists pgtap with schema extensions;

create function pg_temp.day(p_offset integer)
returns date
language sql
stable
as $$
  select ((clock_timestamp() at time zone 'utc')::date + p_offset)
$$;

-- One valid `fittip.roadmap.v2` body for the horizon the tests use. Built from
-- the same two dates the generation request carries, so content validation is
-- exercised rather than sidestepped.
create function pg_temp.roadmap(p_start date, p_end date, p_title text)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'schemaVersion', 'fittip.roadmap.v2',
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
        'level', 'primary',
        'reason', 'It is the only goal with a date inside this horizon.'
      )),
      'milestones', jsonb_build_array(jsonb_build_object(
        'title', 'Four steady weeks',
        'observableCriterion', 'Four consecutive weeks with every planned easy run logged.',
        'targetDate', p_end::text,
        'goalIds', jsonb_build_array('00000000-0000-4000-8000-000000000001')
      ))
    )),
    'reviewPoints', jsonb_build_array(jsonb_build_object(
      'title', 'Halfway check',
      'triggerDate', p_start::text,
      'question', 'Is the weekly volume still repeatable without soreness?'
    ))
  )
$$;

-- Receipts are captured rather than re-read: `(f()).*` evaluates the function
-- once per output column, which would run a write more than once.
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

select plan(56);

-- The privilege boundary ---------------------------------------------------

select ok(
  has_function_privilege(
    'authenticated',
    'public.begin_roadmap_generation(text,text,date,date,bigint,text,uuid,text)',
    'EXECUTE'
  ),
  'authenticated may begin roadmap generation again'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.finish_roadmap_generation(uuid,text,text,text,text,text,text,uuid,text,text,jsonb,jsonb,text)',
    'EXECUTE'
  ),
  'authenticated may finish roadmap generation again'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.record_roadmap_memory_candidates(uuid,bigint,jsonb)',
    'EXECUTE'
  ),
  'authenticated may record roadmap memory candidates again'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.apply_roadmap_proposal_change(text,uuid,jsonb)',
    'EXECUTE'
  ),
  'authenticated may edit and decline roadmap proposals again'
);
select ok(
  has_function_privilege(
    'authenticated', 'public.accept_roadmap_proposal(uuid,bigint)', 'EXECUTE'
  ),
  'authenticated may accept roadmap proposals again'
);

-- Nobody else. Checked against the catalog rather than with
-- `has_function_privilege`, because that predicate answers for the role's
-- effective privilege and a `public` grant would make every role report true
-- while the ACL still named only `public`. The ACL is the fact.
select is(
  (
    select array_agg(distinct grantee::text order by grantee::text)
    from information_schema.role_routine_grants
    where specific_schema = 'public'
      and routine_name in (
        'begin_roadmap_generation',
        'finish_roadmap_generation',
        'record_roadmap_memory_candidates',
        'apply_roadmap_proposal_change',
        'accept_roadmap_proposal'
      )
      and privilege_type = 'EXECUTE'
      and grantee <> 'postgres'
  ),
  array['authenticated'],
  'execute on the five roadmap functions is held by authenticated and nobody else'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.begin_roadmap_generation(text,text,date,date,bigint,text,uuid,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.finish_roadmap_generation(uuid,text,text,text,text,text,text,uuid,text,text,jsonb,jsonb,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'public.record_roadmap_memory_candidates(uuid,bigint,jsonb)', 'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'public.apply_roadmap_proposal_change(text,uuid,jsonb)', 'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'public.accept_roadmap_proposal(uuid,bigint)', 'EXECUTE'
  ),
  'anonymous holds execute on none of the five roadmap functions'
);
select ok(
  not has_function_privilege(
    'service_role',
    'public.begin_roadmap_generation(text,text,date,date,bigint,text,uuid,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.finish_roadmap_generation(uuid,text,text,text,text,text,text,uuid,text,text,jsonb,jsonb,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.record_roadmap_memory_candidates(uuid,bigint,jsonb)', 'EXECUTE'
  )
  and not has_function_privilege(
    'service_role', 'public.apply_roadmap_proposal_change(text,uuid,jsonb)', 'EXECUTE'
  )
  and not has_function_privilege(
    'service_role', 'public.accept_roadmap_proposal(uuid,bigint)', 'EXECUTE'
  ),
  'the service role holds execute on none of the five roadmap functions'
);

-- The internal helpers stay unreachable from every client role: they are how
-- the five validate their own inputs, and a caller that could run them could
-- not thereby write anything, but the boundary is stated rather than assumed.
select ok(
  not has_function_privilege(
    'authenticated', 'public.roadmap_content_is_valid(jsonb, date, date)', 'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated', 'public.roadmap_normalize_owner_text(text)', 'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated', 'public.roadmap_owner_text_hash(text)', 'EXECUTE'
  ),
  'the roadmap validators are reachable from no client role'
);

select ok(
  pg_get_functiondef(
    'public.accept_roadmap_proposal(uuid,bigint)'::regprocedure
  ) !~ '(detailed_plan|completion_heads)',
  'the restored acceptance names no relation M3-11 dropped'
);
select ok(
  pg_get_functiondef(
    'public.accept_roadmap_proposal(uuid,bigint)'::regprocedure
  ) ~ 'public\.completions',
  'the restored acceptance rechecks a completion source against M3-15A''s record'
);
select ok(
  pg_get_functiondef(
    'public.accept_roadmap_proposal(uuid,bigint)'::regprocedure
  ) !~ 'training reset',
  'the maintenance stub is gone rather than merely re-granted'
);

-- The five are still `SECURITY DEFINER` with a pinned search path, which is
-- what makes the `execute` grant the whole boundary.
select is(
  (
    select count(*)::integer
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'begin_roadmap_generation',
        'finish_roadmap_generation',
        'record_roadmap_memory_candidates',
        'apply_roadmap_proposal_change',
        'accept_roadmap_proposal'
      )
      and p.prosecdef
      and pg_catalog.array_to_string(p.proconfig, ',') like 'search_path=%'
  ),
  5,
  'all five run as definer with an empty search path'
);

-- Owners --------------------------------------------------------------------

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('6a000000-0000-4000-8000-000000000001', 'roadmap-owner@example.test', '{}', '{}'),
  ('6a000000-0000-4000-8000-000000000002', 'roadmap-outsider@example.test', '{}', '{}');
insert into public.profiles (user_id, timezone_name)
select id, 'UTC' from auth.users
where id in (
  '6a000000-0000-4000-8000-000000000001',
  '6a000000-0000-4000-8000-000000000002'
);

-- M3-15A completion records, so the rewritten source recheck in
-- `accept_roadmap_proposal` has real rows to verify a proposal against. They
-- are written here, above the role switch, because `authenticated` holds only
-- `select` on `public.completions`: every completion write arrives through
-- M3-15A's own owner-derived function.
insert into public.completions (
  id, user_id, status, actual_local_date, timezone_name, revision
)
values
  ('6c000000-0000-4000-8000-000000000001',
   '6a000000-0000-4000-8000-000000000001', 'unplanned', pg_temp.day(-7),
   'UTC', 0),
  ('6c000000-0000-4000-8000-000000000002',
   '6a000000-0000-4000-8000-000000000001', 'unplanned', pg_temp.day(-6),
   'UTC', 0),
  ('6c000000-0000-4000-8000-000000000003',
   '6a000000-0000-4000-8000-000000000002', 'unplanned', pg_temp.day(-5),
   'UTC', 0);

set local role authenticated;

-- No subject claim -----------------------------------------------------------

select set_config('request.jwt.claims', '{"role":"authenticated"}', true);

select throws_ok(
  format(
    $$select * from public.begin_roadmap_generation(
      'no-owner-key-0000000001', 'no-owner-fingerprint-0000000001',
      %L::date, %L::date, 0)$$,
    pg_temp.day(0), pg_temp.day(84)
  ),
  '42501', 'An authenticated FitTip user is required.',
  'generation without an owner claim is refused before anything is written'
);
select throws_ok(
  $$select * from public.finish_roadmap_generation(
    '6a000000-0000-4000-8000-0000000000ff'::uuid, 'failed',
    p_safe_failure_code => 'provider_unavailable')$$,
  '42501', 'An authenticated FitTip user is required.',
  'finishing without an owner claim is refused'
);
select throws_ok(
  $$select * from public.record_roadmap_memory_candidates(
    '6a000000-0000-4000-8000-0000000000ff'::uuid, 0, '[]'::jsonb)$$,
  '42501', 'An authenticated FitTip user is required.',
  'recording memory candidates without an owner claim is refused'
);
select throws_ok(
  $$select * from public.apply_roadmap_proposal_change(
    'reject', '6a000000-0000-4000-8000-0000000000ff'::uuid)$$,
  '42501', 'An authenticated FitTip user is required.',
  'declining without an owner claim is refused'
);
select throws_ok(
  $$select * from public.accept_roadmap_proposal(
    '6a000000-0000-4000-8000-0000000000ff'::uuid, 0)$$,
  '42501', 'An authenticated FitTip user is required.',
  'accepting without an owner claim is refused'
);

-- The owner ------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"6a000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select throws_ok(
  $$insert into public.roadmap_proposals (
      user_id, generation_request_id, origin, schema_version, prompt_version,
      provider_code, model_code, rate_card_version, content)
    values ('6a000000-0000-4000-8000-000000000001',
      '6a000000-0000-4000-8000-0000000000ff', 'ai_initial', 'fittip.roadmap.v2',
      'p', 'fixture', 'fixture-corpus-v1', 'fixture-no-spend', '{}'::jsonb)$$,
  '42501', 'permission denied for table roadmap_proposals',
  'the owner still cannot write a proposal except through a function'
);

insert into claim
select 'first', * from public.begin_roadmap_generation(
  'owner-initial-key-000000001',
  'owner-initial-fingerprint-000000001',
  pg_temp.day(0),
  pg_temp.day(84),
  0
);

select is(
  (select state from claim where label = 'first'), 'claimed',
  'the caller whose insert opened the attempt is the one told claimed'
);

-- M3-09: the same key again, as a plain sequential replay.
insert into claim
select 'replay', * from public.begin_roadmap_generation(
  'owner-initial-key-000000001',
  'owner-initial-fingerprint-000000001',
  pg_temp.day(0),
  pg_temp.day(84),
  0
);

select is(
  (select state from claim where label = 'replay'), 'pending',
  'a same-key replay returns the stored pending state and never claimed'
);
select is(
  (select completion_token from claim where label = 'replay'),
  (select completion_token from claim where label = 'first'),
  'the replay returns the original attempt rather than opening a second one'
);
select is(
  (select count(*)::integer from public.roadmap_generation_requests
   where user_id = '6a000000-0000-4000-8000-000000000001'),
  1,
  'one attempt exists for one key, however many times it is claimed'
);

select throws_ok(
  format(
    $$select * from public.begin_roadmap_generation(
      'owner-initial-key-000000001', 'a-different-fingerprint-000000001',
      %L::date, %L::date, 0)$$,
    pg_temp.day(0), pg_temp.day(84)
  ),
  'PT409', 'That coaching request changed. Reload and try again.',
  'the same key with different input is a conflict, not a silent replay'
);

-- Finish it with a fixture-authored proposal.
insert into finished
select 'first', * from public.finish_roadmap_generation(
  (select completion_token from claim where label = 'first'),
  'proposal',
  'fittip.roadmap.v2',
  'roadmap-2026-08-10',
  'fixture',
  'fixture-corpus-v1',
  'fixture-no-spend',
  p_content => pg_temp.roadmap(pg_temp.day(0), pg_temp.day(84), 'Base into race'),
  p_sources => '[]'::jsonb
);

select is(
  (select status from finished where label = 'first'), 'completed',
  'a validated fixture proposal is persisted'
);
select is(
  (select provider_code from public.roadmap_proposals
   where id = (select proposal_id from finished where label = 'first')),
  'fixture',
  'the stored provenance says fixture, which is what the example label reads'
);

-- Decline, then regenerate against it, then edit the regeneration.
insert into change
select 'decline', * from public.apply_roadmap_proposal_change(
  'reject', (select proposal_id from finished where label = 'first')
);
select is(
  (select result from change where label = 'decline'), 'rejected',
  'the owner can decline their own proposal'
);

insert into change
select 'decline-replay', * from public.apply_roadmap_proposal_change(
  'reject', (select proposal_id from finished where label = 'first')
);
select is(
  (select proposal_id from change where label = 'decline-replay'),
  (select proposal_id from finished where label = 'first'),
  'replaying a decline returns the existing decision rather than a conflict'
);

insert into claim
select 'regeneration', * from public.begin_roadmap_generation(
  'owner-regeneration-key-00000001',
  'owner-regeneration-fingerprint-00000001',
  pg_temp.day(0),
  pg_temp.day(84),
  0,
  p_previous_proposal_id => (select proposal_id from finished where label = 'first'),
  p_regeneration_feedback => 'Too much volume in the first month.'
);
select is(
  (select regeneration_number from claim where label = 'regeneration'), 1,
  'a declined predecessor on the same horizon opens regeneration one'
);

insert into finished
select 'regeneration', * from public.finish_roadmap_generation(
  (select completion_token from claim where label = 'regeneration'),
  'proposal',
  'fittip.roadmap.v2',
  'roadmap-2026-08-10',
  'fixture',
  'fixture-corpus-v1',
  'fixture-no-spend',
  p_regeneration_feedback => 'Too much volume in the first month.',
  p_content => pg_temp.roadmap(pg_temp.day(0), pg_temp.day(84), 'Gentler base'),
  p_sources => '[]'::jsonb
);
select is(
  (select origin from public.roadmap_proposals
   where id = (select proposal_id from finished where label = 'regeneration')),
  'ai_regeneration',
  'the regeneration is recorded as one rather than as a fresh request'
);

insert into change
select 'edit', * from public.apply_roadmap_proposal_change(
  'edit',
  (select proposal_id from finished where label = 'regeneration'),
  pg_temp.roadmap(pg_temp.day(0), pg_temp.day(84), 'Gentler base, my wording')
);
select is(
  (select result from change where label = 'edit'), 'edited',
  'an edit is accepted'
);
select isnt(
  (select proposal_id from change where label = 'edit'),
  (select proposal_id from finished where label = 'regeneration'),
  'an edit creates a new proposal instead of rewriting its source'
);
select is(
  (select content from public.roadmap_proposals
   where id = (select proposal_id from finished where label = 'regeneration')),
  pg_temp.roadmap(pg_temp.day(0), pg_temp.day(84), 'Gentler base'),
  'the edited source keeps its own content, byte for byte'
);
select is(
  (select provider_code from public.roadmap_proposals
   where id = (select proposal_id from change where label = 'edit')),
  'fixture',
  'an edit inherits its source provenance, so it is still labelled an example'
);

-- Accept the edit.
insert into acceptance
select 'accept', * from public.accept_roadmap_proposal(
  (select proposal_id from change where label = 'edit'), 0
);

select is(
  (select result from acceptance where label = 'accept'), 'accepted',
  'the owner can accept a proposal again'
);
select is(
  (select head_revision from acceptance where label = 'accept'), 1::bigint,
  'acceptance advances the head to revision one'
);
select is(
  (select current_version_id from public.roadmap_heads
   where user_id = '6a000000-0000-4000-8000-000000000001'),
  (select version_id from acceptance where label = 'accept'),
  'the head points at the version acceptance created'
);
select is(
  (select content from public.roadmap_versions
   where id = (select version_id from acceptance where label = 'accept')),
  pg_temp.roadmap(pg_temp.day(0), pg_temp.day(84), 'Gentler base, my wording'),
  'the accepted version carries the content that was accepted'
);

insert into acceptance
select 'accept-replay', * from public.accept_roadmap_proposal(
  (select proposal_id from change where label = 'edit'), 1
);
select is(
  (select result from acceptance where label = 'accept-replay'), 'replayed',
  'accepting the same proposal twice replays rather than creating a version'
);
select is(
  (select count(*)::integer from public.roadmap_versions
   where user_id = '6a000000-0000-4000-8000-000000000001'),
  1,
  'one acceptance, one version'
);

select throws_ok(
  format(
    $$select * from public.accept_roadmap_proposal(%L::uuid, 0)$$,
    (select proposal_id from finished where label = 'regeneration')
  ),
  'PT409', 'Your roadmap changed. Review the proposal again.',
  'a stale expected head revision refuses the acceptance'
);

-- A previous version is preserved rather than replaced.
insert into claim
select 'second-roadmap', * from public.begin_roadmap_generation(
  'owner-second-key-0000000001',
  'owner-second-fingerprint-0000000001',
  pg_temp.day(0),
  pg_temp.day(84),
  1
);
insert into finished
select 'second-roadmap', * from public.finish_roadmap_generation(
  (select completion_token from claim where label = 'second-roadmap'),
  'proposal',
  'fittip.roadmap.v2',
  'roadmap-2026-08-10',
  'fixture',
  'fixture-corpus-v1',
  'fixture-no-spend',
  p_content => pg_temp.roadmap(pg_temp.day(0), pg_temp.day(84), 'After the first block'),
  p_sources => '[]'::jsonb
);
insert into acceptance
select 'second-roadmap', * from public.accept_roadmap_proposal(
  (select proposal_id from finished where label = 'second-roadmap'), 1
);

select is(
  (select array_agg(version_number order by version_number)
   from public.roadmap_versions
   where user_id = '6a000000-0000-4000-8000-000000000001'),
  array[1::bigint, 2::bigint],
  'accepting again preserves the earlier version beside the new one'
);
select is(
  (select previous_version_id from public.roadmap_versions
   where id = (select version_id from acceptance where label = 'second-roadmap')),
  (select version_id from acceptance where label = 'accept'),
  'the new version links back to the one it superseded'
);

-- The source recheck, on a proposal that carries a real source ---------------
--
-- Every acceptance above travelled with no sources at all, so the loop in
-- `accept_roadmap_proposal` never ran. It is the substantive thing this
-- migration rewrote — M3-11 dropped `completion_heads`, and the recheck now
-- reads M3-15A's `public.completions` instead — and it is the live path: the
-- context source emits a `completion` source per session in the owner's
-- training window, so any owner with logged training accepts through this loop.
--
-- A wrong predicate here fails in one of two directions, and both are the
-- failure the function exists to prevent: an owner who can never accept their
-- roadmap, or one who accepts a proposal built on training data that has since
-- been corrected. The three cases below pin both directions and the ownership
-- half.

insert into claim
select 'completion-source', * from public.begin_roadmap_generation(
  'owner-completion-key-000000001',
  'owner-completion-fingerprint-000000001',
  pg_temp.day(0),
  pg_temp.day(84),
  2
);
insert into finished
select 'completion-source', * from public.finish_roadmap_generation(
  (select completion_token from claim where label = 'completion-source'),
  'proposal',
  'fittip.roadmap.v2',
  'roadmap-2026-08-10',
  'fixture',
  'fixture-corpus-v1',
  'fixture-no-spend',
  p_content => pg_temp.roadmap(
    pg_temp.day(0), pg_temp.day(84), 'Built on logged training'),
  p_sources => '[{"kind":"completion",
                  "recordId":"6c000000-0000-4000-8000-000000000001",
                  "revisionNumber":0}]'::jsonb
);

-- Asserted rather than assumed: with no row here the acceptance below would
-- pass without the loop iterating once, which is exactly how this path came to
-- be untested in the first place.
select is(
  (select count(*)::integer from public.roadmap_proposal_sources
   where proposal_id = (
     select proposal_id from finished where label = 'completion-source')
     and source_kind = 'completion'),
  1,
  'the completion source is recorded, so the acceptance has one to recheck'
);

insert into acceptance
select 'completion-source', * from public.accept_roadmap_proposal(
  (select proposal_id from finished where label = 'completion-source'), 2
);
select is(
  (select result from acceptance where label = 'completion-source'), 'accepted',
  'a completion still at the revision that travelled verifies and accepts'
);

-- The other direction: a completion corrected after it travelled.
insert into claim
select 'completion-corrected', * from public.begin_roadmap_generation(
  'owner-corrected-key-0000000001',
  'owner-corrected-fingerprint-0000000001',
  pg_temp.day(0),
  pg_temp.day(84),
  3
);
insert into finished
select 'completion-corrected', * from public.finish_roadmap_generation(
  (select completion_token from claim where label = 'completion-corrected'),
  'proposal',
  'fittip.roadmap.v2',
  'roadmap-2026-08-10',
  'fixture',
  'fixture-corpus-v1',
  'fixture-no-spend',
  p_content => pg_temp.roadmap(
    pg_temp.day(0), pg_temp.day(84), 'Built on a record since corrected'),
  p_sources => '[{"kind":"completion",
                  "recordId":"6c000000-0000-4000-8000-000000000002",
                  "revisionNumber":0}]'::jsonb
);

-- M3-15A's correction bumps `revision`. Applied as the session role because
-- `authenticated` cannot write this table; the role is restored immediately.
reset role;
update public.completions
set revision = 1
where id = '6c000000-0000-4000-8000-000000000002';
set local role authenticated;

select throws_ok(
  format(
    $$select * from public.accept_roadmap_proposal(%L::uuid, 3)$$,
    (select proposal_id from finished where label = 'completion-corrected')
  ),
  'PT409', 'Your training history changed. Review the proposal again.',
  'a completion corrected after it travelled refuses the acceptance'
);

-- The ownership half: a source naming a completion owned by somebody else
-- verifies against nothing, whatever revision it claims.
insert into claim
select 'completion-outsider', * from public.begin_roadmap_generation(
  'owner-outsider-key-00000000001',
  'owner-outsider-fingerprint-00000000001',
  pg_temp.day(0),
  pg_temp.day(84),
  3
);
insert into finished
select 'completion-outsider', * from public.finish_roadmap_generation(
  (select completion_token from claim where label = 'completion-outsider'),
  'proposal',
  'fittip.roadmap.v2',
  'roadmap-2026-08-10',
  'fixture',
  'fixture-corpus-v1',
  'fixture-no-spend',
  p_content => pg_temp.roadmap(
    pg_temp.day(0), pg_temp.day(84), 'Built on training that is not mine'),
  p_sources => '[{"kind":"completion",
                  "recordId":"6c000000-0000-4000-8000-000000000003",
                  "revisionNumber":0}]'::jsonb
);

select throws_ok(
  format(
    $$select * from public.accept_roadmap_proposal(%L::uuid, 3)$$,
    (select proposal_id from finished where label = 'completion-outsider')
  ),
  'PT409', 'Your training history changed. Review the proposal again.',
  'a source naming another owner''s completion never verifies'
);

-- Cross-owner ----------------------------------------------------------------
--
-- The outsider holds `execute` on all five, because `execute` is granted to the
-- role and not to a person. What stops them is that every function derives its
-- own owner from `auth.uid()` and scopes every read by it, so another owner's
-- ids are simply not found.

select set_config(
  'request.jwt.claims',
  '{"sub":"6a000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select throws_ok(
  format(
    $$select * from public.accept_roadmap_proposal(%L::uuid, 0)$$,
    (select proposal_id from finished where label = 'first')
  ),
  'PT409', 'That proposal is no longer available.',
  'another owner cannot accept a proposal that is not theirs'
);
select throws_ok(
  format(
    $$select * from public.apply_roadmap_proposal_change('reject', %L::uuid)$$,
    (select proposal_id from change where label = 'edit')
  ),
  'PT409', 'That proposal is no longer available.',
  'another owner cannot decline a proposal that is not theirs'
);
select throws_ok(
  format(
    $$select * from public.apply_roadmap_proposal_change('edit', %L::uuid, %L::jsonb)$$,
    (select proposal_id from change where label = 'edit'),
    pg_temp.roadmap(pg_temp.day(0), pg_temp.day(84), 'Not mine to edit')
  ),
  'PT409', 'That proposal is no longer available.',
  'another owner cannot edit a proposal that is not theirs'
);
select throws_ok(
  format(
    $$select * from public.finish_roadmap_generation(
      %L::uuid, 'proposal', 'fittip.roadmap.v2', 'roadmap-2026-08-10',
      'fixture', 'fixture-corpus-v1', 'fixture-no-spend',
      p_content => %L::jsonb, p_sources => '[]'::jsonb)$$,
    (select completion_token from claim where label = 'second-roadmap'),
    pg_temp.roadmap(pg_temp.day(0), pg_temp.day(84), 'Not mine to finish')
  ),
  'PT409', 'That coaching request is no longer open.',
  'a stolen completion token finishes nothing for another owner'
);
-- A well-formed batch, so the refusal is the ownership check rather than the
-- input check that runs before it.
select throws_ok(
  format(
    $$select * from public.record_roadmap_memory_candidates(
      %L::uuid, 0,
      '[{"memoryType":"constraint","sourceExcerpt":"Tuesdays are impossible."}]'::jsonb)$$,
    (select completion_token from claim where label = 'second-roadmap')
  ),
  'PT409', 'That coaching request is no longer open.',
  'a stolen completion token records no memory for another owner'
);

select is(
  (select count(*)::integer from public.roadmap_versions
   where user_id = '6a000000-0000-4000-8000-000000000002'),
  0,
  'nothing the outsider attempted created a record of their own'
);
-- The outsider reads nothing of the owner's either: that is table RLS rather
-- than `execute`, and it is asserted here because the two boundaries have to
-- hold together for the surface above them to be safe.
select is(
  (select count(*)::integer from public.roadmap_proposals),
  0,
  'the owner''s proposals are unreadable to another owner'
);

-- Back as the owner, because RLS makes the previous two counts unreadable from
-- the outsider's session and a zero there proves concealment rather than
-- preservation.
select set_config(
  'request.jwt.claims',
  '{"sub":"6a000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is(
  (select count(*)::integer from public.roadmap_versions),
  3,
  'and nothing they attempted changed the owner''s history'
);
select is(
  (select array_agg(decision order by decided_at)
   from public.roadmap_proposal_decisions),
  array['rejected', 'accepted', 'accepted', 'accepted'],
  'every decision on the owner''s record is still one the owner made'
);

select set_config('request.jwt.claims', null, true);

select * from finish();
rollback;
