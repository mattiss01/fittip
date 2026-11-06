-- The owner's sports, each with its own colour (owner, 6 Nov 2026): the table
-- and its grants, a new sport's swatch and place, the limit, renaming a sport
-- everywhere and onto another, deleting one, setup's chips, and that nobody
-- reads or changes another owner's sports.

begin;

create extension if not exists pgtap with schema extensions;

select plan(64);

-- The objects --------------------------------------------------------------------

select has_table('public', 'sports', 'there is a sports table');
select hasnt_column('public', 'profiles', 'sports', 'the profile no longer holds a list');
select col_type_is('public', 'sports', 'name', 'text', 'a sport has a name');
select col_type_is('public', 'sports', 'colour', 'text', 'and a colour');
select col_type_is('public', 'sports', 'position', 'integer', 'and a place');
select fk_ok('public', 'sports', 'user_id', 'public', 'profiles', 'user_id',
  'a sport belongs to a profile');
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.sports'::regclass),
  'row level security is on'
);
select is(
  (select array_agg(policyname::text order by policyname::text)
   from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'sports'),
  array['sports_owner_delete', 'sports_owner_insert', 'sports_owner_select',
    'sports_owner_update'],
  'one owner policy for each of select, insert, update and delete'
);
select ok(
  exists (
    select 1 from pg_catalog.pg_indexes
    where schemaname = 'public' and tablename = 'sports'
      and indexname = 'sports_name_key' and indexdef like 'CREATE UNIQUE INDEX%'
  ),
  'a name is unique per owner'
);
select ok(
  not has_table_privilege('anon', 'public.sports', 'SELECT')
  and not has_table_privilege('anon', 'public.sports', 'INSERT')
  and not has_table_privilege('anon', 'public.sports', 'UPDATE')
  and not has_table_privilege('anon', 'public.sports', 'DELETE'),
  'anon has nothing on sports'
);
select is(
  (select array_agg(column_name::text order by column_name::text)
   from information_schema.column_privileges
   where table_schema = 'public' and table_name = 'sports'
     and grantee = 'authenticated' and privilege_type = 'UPDATE'),
  array['colour'],
  'the owner may update a colour, never a name directly'
);
select is(
  (select array_agg(column_name::text order by column_name::text)
   from information_schema.column_privileges
   where table_schema = 'public' and table_name = 'sports'
     and grantee = 'authenticated' and privilege_type = 'INSERT'),
  array['colour', 'name', 'user_id'],
  'and add a name with a colour'
);
select ok(
  exists (
    select 1 from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rename_sport' and p.prosecdef
      and pg_catalog.array_to_string(p.proconfig, ',') = 'search_path=""'
  )
  and (
    select pg_catalog.count(*) = 3 from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('keep_sports', 'set_sports', 'add_sport')
      and not p.prosecdef
      and pg_catalog.array_to_string(p.proconfig, ',') = 'search_path=""'
  ),
  'rename_sport is the one definer; the others run as the caller'
);
select ok(
  has_function_privilege('authenticated', 'public.rename_sport(uuid,text,boolean)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.keep_sports(text[])', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.set_sports(text[])', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.add_sport(text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.add_sport(text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.rename_sport(uuid,text,boolean)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.keep_sports(text[])', 'EXECUTE')
  and not has_function_privilege('anon', 'public.set_sports(text[])', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.rename_sport(uuid,text,boolean)', 'EXECUTE'),
  'only authenticated may call the sport functions'
);

-- Two owners ---------------------------------------------------------------------

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('72000000-0000-4000-8000-000000000001', 'sports-owner@example.test', '{}', '{}'),
  ('72000000-0000-4000-8000-000000000002', 'sports-other@example.test', '{}', '{}');
insert into public.profiles (user_id, timezone_name)
values
  ('72000000-0000-4000-8000-000000000001', 'UTC'),
  ('72000000-0000-4000-8000-000000000002', 'UTC');
insert into public.goals (id, user_id, title, desired_outcome, sports, priority_tier, active_rank)
values
  ('72000000-0000-4000-8000-0000000000a1', '72000000-0000-4000-8000-000000000001',
   'Run a 10k', 'Under 48 minutes.', array['running', 'Cycling'], 'core', 1),
  ('72000000-0000-4000-8000-0000000000b1', '72000000-0000-4000-8000-000000000002',
   'Run a 10k', 'Under 50 minutes.', array['Running'], 'core', 1);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"72000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- A typed sport joins the list -----------------------------------------------------

select keep_sports(array['Running', 'Cycling']);
select is(
  (select array_agg(name || ':' || colour || ':' || position order by position)
   from public.sports),
  array['Running:sport-1:0', 'Cycling:sport-2:1'],
  'new sports take the first free swatches, in the order typed'
);
select keep_sports(array[
  ' running ', 'Swim', 'swim', 'Running, cycling', '', repeat('x', 61), null
]);
select is(
  (select array_agg(name order by position) from public.sports),
  array['Running', 'Cycling', 'Swim'],
  'a known sport, a repeat, a comma, an empty name and an overlong one are passed over'
);
select lives_ok(
  $$update public.sports set colour = 'sport-9' where name = 'Swim'$$,
  'the owner recolours a sport'
);
select throws_ok(
  $$update public.sports set colour = 'red' where name = 'Swim'$$,
  '23514', null, 'a colour that is not a swatch is refused'
);
select throws_ok(
  $$update public.sports set name = 'Swimming' where name = 'Swim'$$,
  '42501', null, 'a name is not updated directly'
);
select lives_ok(
  $$select public.add_sport(' Rowing ')$$,
  'the owner adds a sport by name'
);
select is(
  (select colour from public.sports where name = 'Rowing'),
  'sport-3',
  'and it takes the least-worn swatch'
);
select throws_ok(
  $$select public.add_sport('rowing')$$,
  '23505', null, 'the same name in another case is refused'
);
select throws_ok(
  $$insert into public.sports (name) values (' Yoga')$$,
  '23514', null, 'an untrimmed name is refused'
);
select throws_ok(
  $$insert into public.sports (user_id, name)
    values ('72000000-0000-4000-8000-000000000002', 'Yoga')$$,
  '42501', null, 'a sport cannot be added to another owner'
);

-- The owner's records ------------------------------------------------------------

select lives_ok(
  $$select public.apply_saved_session_change(
    'create', p_name => 'Tempo', p_title => 'Tempo', p_sport => 'Running',
    p_activities => '[]'::jsonb)$$,
  'a saved session names Running'
);
select lives_ok(
  format($$select * from public.apply_completion_change('create', null, null,
    jsonb_build_object('status', 'unplanned', 'actualLocalDate', %L,
      'title', 'Easy run', 'sport', 'RUNNING',
      'activities', jsonb_build_array(
        jsonb_build_object('position', 0, 'name', 'Easy running',
          'sport', 'Running', 'measurementMode', 'unmeasured'))))$$,
    (clock_timestamp() at time zone 'utc')::date),
  'and so does a log, in another case'
);
select lives_ok(
  format($$select * from public.apply_completion_change('create', null, null,
    jsonb_build_object('status', 'unplanned', 'actualLocalDate', %L,
      'title', 'Gym', 'sport', 'Strength',
      'activities', jsonb_build_array(
        jsonb_build_object('position', 0, 'name', 'Warm-up jog',
          'sport', ' running ', 'measurementMode', 'unmeasured'))))$$,
    (clock_timestamp() at time zone 'utc')::date),
  'and an activity of a log of another sport'
);

select set_config('request.jwt.claims',
  '{"sub":"72000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select keep_sports(array['Running']);
select lives_ok(
  $$select public.apply_saved_session_change(
    'create', p_name => 'Tempo', p_title => 'Tempo', p_sport => 'Running',
    p_activities => '[]'::jsonb)$$,
  'another owner has Running too'
);

-- Another owner's sports are out of reach ----------------------------------------

select is((select pg_catalog.count(*)::int from public.sports), 1,
  'another owner reads only their own sports');
select lives_ok(
  $$select public.add_sport('  Open   water ')$$,
  'another owner adds a sport typed with stray spaces'
);
select is(
  (select name from public.sports where pg_catalog.lower(name) like 'open%'),
  'Open water',
  'and it is kept as a person reads it, its spaces tidied'
);
select is_empty(
  $$update public.sports set colour = 'sport-12'
    where user_id = '72000000-0000-4000-8000-000000000001' returning id$$,
  'nor recolours the owner''s'
);
select is_empty(
  $$delete from public.sports
    where user_id = '72000000-0000-4000-8000-000000000001' returning id$$,
  'nor deletes them'
);
reset role;
create temporary table ids as
  select name, id from public.sports
  where user_id = '72000000-0000-4000-8000-000000000001';
grant select on ids to public;
set local role authenticated;
select throws_ok(
  $$select public.rename_sport((select id from ids where name = 'Running'), 'Hijacked')$$,
  'P0002', 'That sport is no longer on your list.',
  'nor renames them'
);
select throws_ok(
  $$select public.rename_sport((select id from ids where name = 'Running'), 'Running', true)$$,
  'P0002', 'That sport is no longer on your list.',
  'nor merges them'
);
select lives_ok(
  $$select public.set_sports(array['Running'])$$,
  'another owner''s setup save'
);

-- Renaming everywhere ------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"72000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$select public.rename_sport((select id from ids where name = 'Running'), 'Trail, running')$$,
  '22023', null, 'a name with a comma is refused'
);
reset role;
create temporary table before_rename as
  select title, revision from public.completions
  where user_id = '72000000-0000-4000-8000-000000000001';
grant select on before_rename to public;
set local role authenticated;
select is(
  public.rename_sport((select id from ids where name = 'Running'), ' Trail running '),
  (select id from ids where name = 'Running'),
  'a rename keeps the sport'
);
select is(
  (select name || ':' || colour from public.sports
   where id = (select id from ids where name = 'Running')),
  'Trail running:sport-1',
  'with its new name and its colour'
);
select is(
  (select sport from public.saved_sessions),
  'Trail running',
  'the saved session follows'
);
select is(
  (select sport from public.completions where title = 'Easy run'),
  'Trail running',
  'the log follows, whatever case it was in'
);
select is(
  (select sport from public.completion_activities
   where completion_id = (select id from public.completions where title = 'Easy run')),
  'Trail running',
  'and so does its activity'
);
select is(
  (select revision from public.completions where title = 'Easy run'),
  (select revision + 1 from before_rename where title = 'Easy run'),
  'and the log''s revision moves on, so a form opened before is refused'
);
select is(
  (select sport from public.completions where title = 'Gym'),
  'Strength',
  'a log of another sport keeps its own'
);
select is(
  (select sport from public.completion_activities
   where completion_id = (select id from public.completions where title = 'Gym')),
  'Trail running',
  'while its activity of the renamed sport follows'
);
select is(
  (select revision from public.completions where title = 'Gym'),
  (select revision + 1 from before_rename where title = 'Gym'),
  'and that log''s revision moves on too, since its form rewrites its activities'
);
select is(
  (select sports from public.goals),
  array['Trail running', 'Cycling'],
  'and the goal'
);

reset role;
select is(
  (select sport from public.saved_sessions
   where user_id = '72000000-0000-4000-8000-000000000002'),
  'Running',
  'another owner''s records are untouched'
);
select is(
  (select pg_catalog.count(*)::int from public.sports
   where user_id = '72000000-0000-4000-8000-000000000001'),
  4,
  'and their setup save left the owner''s list alone'
);
select is(
  (select sports from public.goals
   where user_id = '72000000-0000-4000-8000-000000000002'),
  array['Running'],
  'their goal too'
);
set local role authenticated;

-- Renaming onto another sport merges ----------------------------------------------

select throws_ok(
  $$select public.rename_sport((select id from ids where name = 'Running'), 'cycling')$$,
  '23505', 'You already have that sport.',
  'renaming onto a sport the owner has is refused unless the call merges'
);
select is(
  public.rename_sport((select id from ids where name = 'Running'), 'cycling', true),
  (select id from ids where name = 'Cycling'),
  'and with it, answers with that sport'
);
select is(
  (select array_agg(name || ':' || colour order by position) from public.sports),
  array['Cycling:sport-2', 'Swim:sport-9', 'Rowing:sport-3'],
  'the renamed one is gone and the other keeps its name and colour'
);
select is(
  (select sport from public.completions where title = 'Easy run'),
  'Cycling',
  'its log is now Cycling'
);
select is(
  (select sports from public.goals),
  array['Cycling'],
  'and the goal names Cycling once'
);

-- Deleting a sport -----------------------------------------------------------------

delete from public.sports where name = 'Cycling';
select is(
  (select sport from public.completions where title = 'Easy run'),
  'Cycling',
  'a deleted sport''s log keeps it'
);

-- Setup's chips ----------------------------------------------------------------------

select set_sports(array['Swim', 'Climbing']);
select is(
  (select array_agg(name || ':' || colour order by position) from public.sports),
  array['Swim:sport-9', 'Climbing:sport-1'],
  'a chosen sport keeps its colour, a new one joins, the rest leave the list'
);

-- The limit --------------------------------------------------------------------------

reset role;
insert into public.sports (user_id, name)
select '72000000-0000-4000-8000-000000000001', 'Sport ' || n
from generate_series(1, 98) as n;
set local role authenticated;
select keep_sports(array['Diving', 'Surfing']);
select is((select pg_catalog.count(*)::int from public.sports), 100,
  'keep_sports stops at a hundred without an error');
select throws_ok(
  $$insert into public.sports (name) values ('Surfing')$$,
  '23514', 'You have 100 sports, which is the most there can be.',
  'and a hundred-and-first sport is refused'
);

-- Anonymous callers --------------------------------------------------------------

reset role;
set local role anon;
select throws_ok(
  $$select public.keep_sports(array['Running'])$$,
  '42501', null,
  'anonymous callers cannot keep sports'
);
select throws_ok(
  $$select count(*) from public.sports$$,
  '42501', null,
  'nor read any'
);
select throws_ok(
  $$select public.add_sport('Running')$$,
  '42501', null,
  'nor add one'
);
select throws_ok(
  $$select public.set_sports(array['Running'])$$,
  '42501', null,
  'nor save setup''s list'
);
select throws_ok(
  $$select public.rename_sport('72000000-0000-4000-8000-0000000000ff', 'Running', true)$$,
  '42501', null,
  'nor rename one'
);

select * from finish();

rollback;
