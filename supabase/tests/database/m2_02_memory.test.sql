begin;

create extension if not exists pgtap with schema extensions;

select plan(93);

-- Structure -----------------------------------------------------------------

select has_table('public', 'memory_collections', 'memory collections table exists');
select has_table('public', 'memory_items', 'memory items table exists');
select has_table('public', 'memory_revisions', 'memory revisions table exists');
select has_table(
  'public',
  'memory_deletion_events',
  'memory deletion evidence table exists'
);
select has_function(
  'public',
  'apply_memory_change',
  array['bigint', 'text', 'uuid', 'text', 'text', 'date'],
  'the atomic memory change function exists'
);
select ok(
  (
    select prosecdef
      and proconfig = array['search_path=""']
    from pg_proc
    where oid = 'public.apply_memory_change(bigint,text,uuid,text,text,date)'::regprocedure
  ),
  'the memory mutation is security definer with an empty search path'
);
select is(
  (
    select pg_get_userbyid(proowner)
    from pg_proc
    where oid = 'public.apply_memory_change(bigint,text,uuid,text,text,date)'::regprocedure
  ),
  'postgres',
  'the privileged memory mutation has the expected owner'
);
-- PL/pgSQL builds dynamic SQL with EXECUTE, so the word appearing anywhere in
-- the definition is the signal. This fails if dynamic SQL is ever introduced.
select is(
  position(
    'execute'
    in lower(
      pg_get_functiondef(
        'public.apply_memory_change(bigint,text,uuid,text,text,date)'::regprocedure
      )
    )
  ),
  0,
  'the privileged function contains no dynamic SQL'
);
-- Extracts the configured value rather than searching for the setting's name.
-- A `lock_timeout` of '0' disables the timeout entirely and '30min' is no
-- bound worth having; both contain the string, so a presence check would pass
-- for a function that hangs. The CASE keeps a malformed or absent value a
-- failure rather than a cast error that would abort the file.
select ok(
  (
    select case
      when v ~ '^[0-9]+(\.[0-9]+)?\s*(ms|s|min|h|milliseconds?|seconds?|minutes?|hours?)$'
        then v::interval > interval '0'
         and v::interval <= interval '10 seconds'
      else false
    end
    from (
      select substring(
        pg_get_functiondef(
          'public.apply_memory_change(bigint,text,uuid,text,text,date)'::regprocedure
        )
        from 'set_config\(\s*''lock_timeout''\s*,\s*''([^'']+)'''
      ) as v
    ) as configured
  ),
  'the privileged function bounds its lock wait to a non-zero interval of at most ten seconds'
);
-- Asserts the mapping, not the mere presence of the condition name: an
-- unhandled `lock_not_available` would surface as a generic failure rather
-- than the conflict the caller can act on.
select ok(
  pg_get_functiondef(
    'public.apply_memory_change(bigint,text,uuid,text,text,date)'::regprocedure
  ) ~ 'when\s+lock_not_available\s+then\s+raise\s+exception\s+using\s+errcode\s*=\s*''PT409''',
  'lock exhaustion is mapped to the explicit conflict, not left to hang'
);
select is(
  (
    select count(*)::bigint
    from information_schema.columns
    where table_schema = 'public'
      and table_name in (
        'memory_collections',
        'memory_items',
        'memory_revisions',
        'memory_deletion_events'
      )
      and column_name = 'user_id'
      and is_nullable = 'NO'
  ),
  4::bigint,
  'every memory record category has a required owner'
);
select col_not_null(
  'public',
  'memory_items',
  'current_revision_id',
  'an item always points at a current revision'
);
select is(
  (
    select count(*)::bigint
    from pg_constraint
    where conrelid = 'public.memory_items'::regclass
      and conname in (
        'memory_items_owner_key',
        'memory_items_current_revision_fkey',
        'memory_items_confidence_check',
        'memory_items_confirmation_check'
      )
  ),
  4::bigint,
  'memory items keep their owner key, current pointer and provenance guards'
);
select is(
  (
    select count(*)::bigint
    from pg_constraint
    where conrelid = 'public.memory_revisions'::regclass
      and conname in (
        'memory_revisions_item_fkey',
        'memory_revisions_previous_fkey',
        'memory_revisions_number_key',
        'memory_revisions_content_check'
      )
  ),
  4::bigint,
  'memory revisions keep their same-owner parent, chain and content guards'
);
-- Both revision references carry user_id, so a revision can never point at
-- another owner's item or predecessor.
select is(
  (
    select count(*)::bigint
    from pg_constraint
    where conrelid = 'public.memory_revisions'::regclass
      and conname in (
        'memory_revisions_item_fkey',
        'memory_revisions_previous_fkey'
      )
      and array_length(conkey, 1) = 2
  ),
  2::bigint,
  'revision references are owner-scoped composite keys'
);
select is(
  (
    select count(*)::bigint
    from pg_constraint
    where conrelid = 'public.memory_items'::regclass
      and conname = 'memory_items_current_revision_fkey'
      and array_length(conkey, 1) = 2
  ),
  1::bigint,
  'the current revision pointer is owner-scoped'
);
select is(
  (
    select count(*)::bigint
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'memory_deletion_events'
  ),
  7::bigint,
  'deletion evidence has exactly the seven approved columns'
);
select hasnt_column(
  'public',
  'memory_deletion_events',
  'content',
  'deletion evidence stores no memory content'
);
select is(
  (
    select count(*)::bigint
    from information_schema.columns
    where table_schema = 'public'
      and table_name in (
        'memory_collections',
        'memory_items',
        'memory_deletion_events'
      )
      and data_type = 'text'
      and column_name in ('content', 'summary', 'value', 'note')
  ),
  0::bigint,
  'memory text lives only in the revision history'
);
select is(
  (
    select count(*)::bigint
    from pg_indexes
    where schemaname = 'public'
      and indexname in (
        'memory_items_owner_list_idx',
        'memory_items_owner_expiry_idx',
        'memory_items_current_revision_idx',
        'memory_revisions_owner_item_idx',
        'memory_revisions_item_owner_idx',
        'memory_revisions_previous_idx',
        'memory_deletion_events_owner_idx'
      )
  ),
  7::bigint,
  'ownership and ordering access paths are indexed'
);

-- Row level security ---------------------------------------------------------

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.memory_collections'::regclass
  ),
  'memory collections has RLS'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.memory_items'::regclass),
  'memory items has RLS'
);
select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.memory_revisions'::regclass
  ),
  'memory revisions has RLS'
);
select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.memory_deletion_events'::regclass
  ),
  'memory deletion evidence has RLS'
);

-- Each policy is asserted by name, command, target roles and exact predicate,
-- so a later `using (true)` cannot leave this file green.
select is(
  (
    select count(*)::bigint
    from pg_policies
    where schemaname = 'public'
      and tablename = 'memory_collections'
      and policyname = 'memory_collections_owner_select'
      and cmd = 'SELECT'
      and permissive = 'PERMISSIVE'
      and roles = array['authenticated']::name[]
      and qual = '(( SELECT auth.uid() AS uid) = user_id)'
      and with_check is null
  ),
  1::bigint,
  'memory collections expose only the owner predicate to authenticated users'
);
select is(
  (
    select count(*)::bigint
    from pg_policies
    where schemaname = 'public'
      and tablename = 'memory_items'
      and policyname = 'memory_items_owner_select'
      and cmd = 'SELECT'
      and permissive = 'PERMISSIVE'
      and roles = array['authenticated']::name[]
      and qual = '(( SELECT auth.uid() AS uid) = user_id)'
      and with_check is null
  ),
  1::bigint,
  'memory items expose only the owner predicate to authenticated users'
);
select is(
  (
    select count(*)::bigint
    from pg_policies
    where schemaname = 'public'
      and tablename = 'memory_revisions'
      and policyname = 'memory_revisions_owner_select'
      and cmd = 'SELECT'
      and permissive = 'PERMISSIVE'
      and roles = array['authenticated']::name[]
      and qual = '(( SELECT auth.uid() AS uid) = user_id)'
      and with_check is null
  ),
  1::bigint,
  'memory revisions expose only the owner predicate to authenticated users'
);
select is(
  (
    select count(*)::bigint
    from pg_policies
    where schemaname = 'public'
      and tablename = 'memory_deletion_events'
      and policyname = 'memory_deletion_events_owner_select'
      and cmd = 'SELECT'
      and permissive = 'PERMISSIVE'
      and roles = array['authenticated']::name[]
      and qual = '(( SELECT auth.uid() AS uid) = user_id)'
      and with_check is null
  ),
  1::bigint,
  'deletion evidence exposes only the owner predicate to authenticated users'
);
select is(
  (
    select count(*)::bigint
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'memory_collections',
        'memory_items',
        'memory_revisions',
        'memory_deletion_events'
      )
  ),
  4::bigint,
  'the memory tables carry exactly the four approved policies'
);

-- Privileges -----------------------------------------------------------------

select ok(
  (
    select bool_and(
      has_table_privilege('authenticated', format('public.%I', table_name), 'SELECT')
      and not has_table_privilege(
        'authenticated',
        format('public.%I', table_name),
        'INSERT'
      )
      and not has_table_privilege(
        'authenticated',
        format('public.%I', table_name),
        'UPDATE'
      )
      and not has_table_privilege(
        'authenticated',
        format('public.%I', table_name),
        'DELETE'
      )
    )
    from unnest(array[
      'memory_collections',
      'memory_items',
      'memory_revisions',
      'memory_deletion_events'
    ]) as owned(table_name)
  ),
  'authenticated direct memory access is read only'
);
select ok(
  (
    select bool_and(
      not has_table_privilege('anon', format('public.%I', table_name), privilege_name)
    )
    from unnest(array[
      'memory_collections',
      'memory_items',
      'memory_revisions',
      'memory_deletion_events'
    ]) as owned(table_name)
    cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE'])
      as privileges(privilege_name)
  ),
  'anonymous callers have no memory table privileges'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.apply_memory_change(bigint,text,uuid,text,text,date)',
    'EXECUTE'
  ),
  'anonymous callers cannot execute memory mutations'
);
select ok(
  not exists (
    select 1
    from pg_proc
    cross join lateral aclexplode(coalesce(proacl, acldefault('f', proowner)))
    where oid = 'public.apply_memory_change(bigint,text,uuid,text,text,date)'::regprocedure
      and grantee = 0
      and privilege_type = 'EXECUTE'
  ),
  'PUBLIC cannot execute memory mutations'
);
select ok(
  not has_function_privilege(
    'service_role',
    'public.apply_memory_change(bigint,text,uuid,text,text,date)',
    'EXECUTE'
  ),
  'the service role cannot bypass the authenticated memory contract'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.apply_memory_change(bigint,text,uuid,text,text,date)',
    'EXECUTE'
  ),
  'authenticated callers can execute memory mutations'
);

-- Owner behaviour ------------------------------------------------------------

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('53000000-0000-4000-8000-000000000001', 'm2-02-user-a@example.test', '{}', '{}'),
  ('53000000-0000-4000-8000-000000000002', 'm2-02-user-b@example.test', '{}', '{}');

insert into public.profiles (user_id)
values
  ('53000000-0000-4000-8000-000000000001'),
  ('53000000-0000-4000-8000-000000000002');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"53000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select lives_ok(
  $sql$
    select public.apply_memory_change(
      p_expected_collection_revision => 0,
      p_operation => 'create',
      p_memory_type => 'profile_fact',
      p_content => 'Trains four mornings a week before work.'
    )
  $sql$,
  'the owner can create a profile fact'
);
select is(
  (select status from public.memory_items where memory_type = 'profile_fact'),
  'active',
  'a user-created fact is active immediately'
);
select lives_ok(
  $sql$
    select public.apply_memory_change(
      p_expected_collection_revision => 1,
      p_operation => 'create',
      p_memory_type => 'observed_pattern',
      p_content => 'Often misses Thursday training.'
    )
  $sql$,
  'the owner can record an observed pattern'
);
-- Overturned by the product owner on 2 August 2026: an observed pattern the
-- owner writes is active on save like any other class. `proposed` is reserved
-- for content FitTip derived, which no authenticated path can create.
select ok(
  (
    select status = 'active'
      and provenance = 'user_created'
      and user_confirmed_at is not null
    from public.memory_items
    where memory_type = 'observed_pattern'
  ),
  'a user-written observed pattern is active and confirmed like any other class'
);
select is(
  (
    select count(*)::bigint
    from public.memory_items
    where status = 'proposed'
  ),
  0::bigint,
  'no authenticated create produces a proposal'
);
select throws_ok(
  $sql$
    insert into public.memory_items (
      user_id,
      memory_type,
      status,
      provenance,
      current_revision_id
    )
    values (
      '53000000-0000-4000-8000-000000000001',
      'preference',
      'active',
      'inferred_proposed',
      gen_random_uuid()
    )
  $sql$,
  '42501',
  'permission denied for table memory_items',
  'even the owner cannot forge an item directly'
);
select throws_ok(
  $sql$
    insert into public.memory_revisions (
      user_id,
      item_id,
      revision_number,
      content,
      author_class,
      provenance,
      change_kind,
      status_after
    )
    values (
      '53000000-0000-4000-8000-000000000001',
      gen_random_uuid(),
      1,
      'Forged system memory.',
      'system',
      'inferred_proposed',
      'created',
      'active'
    )
  $sql$,
  '42501',
  'permission denied for table memory_revisions',
  'even the owner cannot forge system-authored history'
);
select throws_ok(
  $sql$
    update public.memory_items set provenance = 'inferred_proposed'
  $sql$,
  '42501',
  'permission denied for table memory_items',
  'the owner cannot reassign provenance directly'
);
select throws_ok(
  $sql$ delete from public.memory_revisions $sql$,
  '42501',
  'permission denied for table memory_revisions',
  'the owner cannot erase history outside the approved operation'
);
select lives_ok(
  format(
    $sql$
      select public.apply_memory_change(
        p_expected_collection_revision => 2,
        p_operation => 'edit',
        p_item_id => %L::uuid,
        p_content => 'Trains five mornings a week before work.'
      )
    $sql$,
    (select id from public.memory_items where memory_type = 'profile_fact')
  ),
  'the owner can edit an active fact'
);
select is(
  (
    select count(*)::bigint
    from public.memory_revisions r
    join public.memory_items i on i.id = r.item_id
    where i.memory_type = 'profile_fact'
  ),
  2::bigint,
  'editing appends a revision instead of overwriting'
);
select is(
  (
    select content
    from public.memory_revisions r
    join public.memory_items i on i.id = r.item_id
    where i.memory_type = 'profile_fact'
      and r.revision_number = 1
  ),
  'Trains four mornings a week before work.',
  'the prior revision text stays inspectable'
);
select ok(
  (
    select r.revision_number = 2
      and r.change_kind = 'edited'
      and r.previous_revision_id is not null
    from public.memory_items i
    join public.memory_revisions r on r.id = i.current_revision_id
    where i.memory_type = 'profile_fact'
  ),
  'the current pointer moves to the newest revision'
);
select is(
  (select status from public.memory_items where memory_type = 'profile_fact'),
  'active',
  'editing an active fact leaves its status alone'
);
select lives_ok(
  format(
    $sql$
      select public.apply_memory_change(
        p_expected_collection_revision => 3,
        p_operation => 'disable',
        p_item_id => %L::uuid
      )
    $sql$,
    (select id from public.memory_items where memory_type = 'profile_fact')
  ),
  'the owner can disable an active item'
);
select is(
  (select status from public.memory_items where memory_type = 'profile_fact'),
  'archived',
  'disable archives the item rather than deleting it'
);
select lives_ok(
  format(
    $sql$
      select public.apply_memory_change(
        p_expected_collection_revision => 4,
        p_operation => 'enable',
        p_item_id => %L::uuid
      )
    $sql$,
    (select id from public.memory_items where memory_type = 'profile_fact')
  ),
  'the owner can re-enable a disabled item'
);
select is(
  (select status from public.memory_items where memory_type = 'profile_fact'),
  'active',
  'enable restores the item to active context'
);
-- There is nothing to accept: the owner's own writing is already active.
select throws_ok(
  format(
    $sql$
      select public.apply_memory_change(
        p_expected_collection_revision => 5,
        p_operation => 'accept',
        p_item_id => %L::uuid
      )
    $sql$,
    (select id from public.memory_items where memory_type = 'observed_pattern')
  ),
  'PT409',
  'Memory changed. Reload and try again.',
  'an active item cannot be accepted again'
);

-- No authenticated path can create a proposal, so the three that the review
-- queue acts on are seeded directly as system-derived content. This is the
-- contract M2-03 will produce against; it is proven here at the database
-- level because no browser flow can reach it until then.
reset role;
insert into public.memory_revisions (
  id,
  user_id,
  item_id,
  revision_number,
  content,
  author_class,
  provenance,
  change_kind,
  status_after
)
values
  (
    '53000000-0000-4000-8000-0000000000a1',
    '53000000-0000-4000-8000-000000000001',
    '53000000-0000-4000-8000-0000000000b1',
    1,
    'Recovers slowly after two hard sessions in a row.',
    'system',
    'inferred_proposed',
    'created',
    'proposed'
  ),
  (
    '53000000-0000-4000-8000-0000000000a2',
    '53000000-0000-4000-8000-000000000001',
    '53000000-0000-4000-8000-0000000000b2',
    1,
    'Trains hardest on Tuesday evenings.',
    'system',
    'inferred_proposed',
    'created',
    'proposed'
  ),
  (
    '53000000-0000-4000-8000-0000000000a3',
    '53000000-0000-4000-8000-000000000001',
    '53000000-0000-4000-8000-0000000000b3',
    1,
    'Prefers to avoid hill sessions.',
    'system',
    'inferred_proposed',
    'created',
    'proposed'
  );
insert into public.memory_items (
  id,
  user_id,
  memory_type,
  status,
  provenance,
  confidence,
  source_reference,
  current_revision_id
)
values
  (
    '53000000-0000-4000-8000-0000000000b1',
    '53000000-0000-4000-8000-000000000001',
    'observed_pattern',
    'proposed',
    'inferred_proposed',
    70,
    'seeded:m2-02-test',
    '53000000-0000-4000-8000-0000000000a1'
  ),
  (
    '53000000-0000-4000-8000-0000000000b2',
    '53000000-0000-4000-8000-000000000001',
    'observed_pattern',
    'proposed',
    'inferred_proposed',
    55,
    'seeded:m2-02-test',
    '53000000-0000-4000-8000-0000000000a2'
  ),
  (
    '53000000-0000-4000-8000-0000000000b3',
    '53000000-0000-4000-8000-000000000001',
    'observed_pattern',
    'proposed',
    'inferred_proposed',
    40,
    'seeded:m2-02-test',
    '53000000-0000-4000-8000-0000000000a3'
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"53000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select lives_ok(
  $sql$
    select public.apply_memory_change(
      p_expected_collection_revision => 5,
      p_operation => 'accept',
      p_item_id => '53000000-0000-4000-8000-0000000000b2'
    )
  $sql$,
  'the owner can accept a system proposal unchanged'
);
select ok(
  (
    select status = 'active'
      and provenance = 'inferred_proposed'
      and confidence = 55
      and user_confirmed_at is not null
    from public.memory_items
    where id = '53000000-0000-4000-8000-0000000000b2'
  ),
  'accepting activates the proposal and records who confirmed it'
);
select ok(
  (
    select r.author_class = 'user'
      and r.provenance = 'inferred_proposed'
      and r.change_kind = 'accepted'
      and r.content = 'Trains hardest on Tuesday evenings.'
    from public.memory_items i
    join public.memory_revisions r on r.id = i.current_revision_id
    where i.id = '53000000-0000-4000-8000-0000000000b2'
  ),
  'an accepted revision keeps the provenance of the text it carries'
);
select lives_ok(
  $sql$
    select public.apply_memory_change(
      p_expected_collection_revision => 6,
      p_operation => 'edit_and_accept',
      p_item_id => '53000000-0000-4000-8000-0000000000b1',
      p_content => 'Needs an easy day after two hard sessions in a row.'
    )
  $sql$,
  'the owner can edit and accept a system proposal'
);
select ok(
  (
    select provenance = 'inferred_proposed'
      and confidence is null
      and status = 'active'
      and user_confirmed_at is not null
    from public.memory_items
    where id = '53000000-0000-4000-8000-0000000000b1'
  ),
  'edit and accept clears obsolete confidence and records confirmation'
);
select ok(
  (
    select r.author_class = 'user'
      and r.provenance = 'user_created'
      and r.change_kind = 'edited_and_accepted'
      and r.previous_revision_id = '53000000-0000-4000-8000-0000000000a1'
    from public.memory_items i
    join public.memory_revisions r on r.id = i.current_revision_id
    where i.id = '53000000-0000-4000-8000-0000000000b1'
  ),
  'the confirmed text is recorded as user-authored on top of the proposal'
);
select is(
  (
    select provenance
    from public.memory_revisions
    where id = '53000000-0000-4000-8000-0000000000a1'
  ),
  'inferred_proposed',
  'the original inference stays in history as an inference'
);
select lives_ok(
  $sql$
    select public.apply_memory_change(
      p_expected_collection_revision => 7,
      p_operation => 'reject',
      p_item_id => '53000000-0000-4000-8000-0000000000b3'
    )
  $sql$,
  'the owner can reject a system proposal'
);
select is(
  (
    select count(*)::bigint
    from public.memory_items
    where status = 'rejected'
  ),
  1::bigint,
  'rejecting keeps the item out of active use'
);
select throws_ok(
  format(
    $sql$
      select public.apply_memory_change(
        p_expected_collection_revision => 8,
        p_operation => 'enable',
        p_item_id => %L::uuid
      )
    $sql$,
    (select id from public.memory_items where status = 'rejected')
  ),
  'PT409',
  'Memory changed. Reload and try again.',
  'a declined proposal cannot be switched on as fact'
);
select lives_ok(
  $sql$
    select public.apply_memory_change(
      p_expected_collection_revision => 8,
      p_operation => 'create',
      p_memory_type => 'constraint',
      p_content => 'No pool access until the local pool reopens.',
      p_expires_on => '2020-01-01'
    )
  $sql$,
  'the owner can set a review date on a constraint'
);
select ok(
  (
    select status = 'active' and expires_on = date '2020-01-01'
    from public.memory_items
    where memory_type = 'constraint'
  ),
  'a passed review date never silently archives or deletes the item'
);
select lives_ok(
  format(
    $sql$
      select public.apply_memory_change(
        p_expected_collection_revision => 9,
        p_operation => 'renew',
        p_item_id => %L::uuid,
        p_expires_on => '2027-01-01'
      )
    $sql$,
    (select id from public.memory_items where memory_type = 'constraint')
  ),
  'the owner can renew a review date'
);
select ok(
  (
    select i.expires_on = date '2027-01-01'
      and r.change_kind = 'renewed'
      and r.content = 'No pool access until the local pool reopens.'
    from public.memory_items i
    join public.memory_revisions r on r.id = i.current_revision_id
    where i.memory_type = 'constraint'
  ),
  'renewing records an inspectable revision and keeps the text'
);
select throws_ok(
  format(
    $sql$
      select public.apply_memory_change(
        p_expected_collection_revision => 9,
        p_operation => 'disable',
        p_item_id => %L::uuid
      )
    $sql$,
    (select id from public.memory_items where memory_type = 'profile_fact')
  ),
  'PT409',
  'Memory changed. Reload and try again.',
  'a stale memory change returns the explicit conflict'
);
select is(
  (select revision from public.memory_collections),
  10::bigint,
  'a stale memory change does not advance the collection'
);
select throws_ok(
  $sql$
    select public.apply_memory_change(
      p_expected_collection_revision => 10,
      p_operation => 'create',
      p_memory_type => 'preference',
      p_content => '   '
    )
  $sql$,
  '22023',
  'Invalid memory change.',
  'empty content is rejected before persistence'
);
select throws_ok(
  $sql$
    select public.apply_memory_change(
      p_expected_collection_revision => 10,
      p_operation => 'create',
      p_memory_type => 'equipment_catalog',
      p_content => 'Anything.'
    )
  $sql$,
  '22023',
  'Invalid memory change.',
  'an unapproved memory type is rejected'
);
select lives_ok(
  $sql$
    select public.apply_memory_change(
      p_expected_collection_revision => 10,
      p_operation => 'create',
      p_memory_type => 'preference',
      p_content => 'Purge sentinel alpha bravo.'
    )
  $sql$,
  'the owner can create an item that will be permanently deleted'
);
select lives_ok(
  format(
    $sql$
      select public.apply_memory_change(
        p_expected_collection_revision => 11,
        p_operation => 'edit',
        p_item_id => %L::uuid,
        p_content => 'Purge sentinel charlie delta.'
      )
    $sql$,
    (
      select id
      from public.memory_items
      where memory_type = 'preference'
    )
  ),
  'the item about to be deleted has more than one content revision'
);
select lives_ok(
  format(
    $sql$
      select public.apply_memory_change(
        p_expected_collection_revision => 12,
        p_operation => 'delete',
        p_item_id => %L::uuid
      )
    $sql$,
    (
      select id
      from public.memory_items
      where memory_type = 'preference'
    )
  ),
  'the owner can permanently delete an item'
);
select is(
  (
    select count(*)::bigint
    from public.memory_revisions
    where content like 'Purge sentinel%'
  ),
  0::bigint,
  'permanent deletion purges every content-bearing revision'
);
select is(
  (
    select count(*)::bigint
    from public.memory_items
    where memory_type = 'preference'
  ),
  0::bigint,
  'permanent deletion removes the item itself'
);
select ok(
  (
    select purged_revision_count = 2 and memory_type = 'preference'
    from public.memory_deletion_events
  ),
  'permanent deletion leaves content-free evidence'
);
select is(
  (select count(*)::bigint from public.memory_deletion_events),
  1::bigint,
  'deletion evidence is recorded once per deleted item'
);

-- Cross-owner isolation -------------------------------------------------------

reset role;
select set_config('request.jwt.claims', '', true);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"53000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

select lives_ok(
  $sql$
    select public.apply_memory_change(
      p_expected_collection_revision => 0,
      p_operation => 'create',
      p_memory_type => 'preference',
      p_content => 'Belongs to user B alone.'
    )
  $sql$,
  'user B owns an independent memory collection'
);
-- Deliberately unfiltered: an owner predicate that stopped working would show
-- user A's rows here.
select is(
  (select count(*)::bigint from public.memory_items),
  1::bigint,
  'user B sees only their own memory items'
);
select is(
  (select count(*)::bigint from public.memory_revisions),
  1::bigint,
  'user B sees only their own memory revisions'
);
select is(
  (select count(*)::bigint from public.memory_deletion_events),
  0::bigint,
  'user B sees none of user A deletion evidence'
);
select is(
  (select count(*)::bigint from public.memory_collections),
  1::bigint,
  'user B sees only their own collection revision'
);
-- User B's own collection is at 1, so this passes the revision check and can
-- only fail on ownership. Passing a stale revision here would let the
-- assertion succeed without ever testing cross-owner access.
select throws_ok(
  $sql$
    select public.apply_memory_change(
      p_expected_collection_revision => 1,
      p_operation => 'disable',
      p_item_id => '53000000-0000-4000-8000-0000000000b1'
    )
  $sql$,
  'PT409',
  'Memory changed. Reload and try again.',
  'user B cannot act on user A item and learns nothing about it'
);

reset role;
select set_config('request.jwt.claims', '', true);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"53000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select is(
  (select count(*)::bigint from public.memory_items),
  6::bigint,
  'user A still sees only their own memory items'
);
select is(
  (
    select status
    from public.memory_items
    where id = '53000000-0000-4000-8000-0000000000b1'
  ),
  'active',
  'user B attempt left user A item unchanged'
);
select is(
  (select revision from public.memory_collections),
  13::bigint,
  'user A collection revision is untouched by user B activity'
);

reset role;
select set_config('request.jwt.claims', '', true);
set local role anon;
select throws_ok(
  $sql$ select * from public.memory_items $sql$,
  '42501',
  'permission denied for table memory_items',
  'anonymous memory reads are denied'
);
select throws_ok(
  $sql$ select * from public.memory_revisions $sql$,
  '42501',
  'permission denied for table memory_revisions',
  'anonymous history reads are denied'
);
select throws_ok(
  $sql$
    select public.apply_memory_change(
      p_expected_collection_revision => 0,
      p_operation => 'create',
      p_memory_type => 'preference',
      p_content => 'Anonymous.'
    )
  $sql$,
  '42501',
  null,
  'anonymous memory mutation is denied'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select is(
  (select count(*)::bigint from public.memory_items),
  0::bigint,
  'an authenticated role without a subject reads no memory'
);
select throws_ok(
  $sql$
    select public.apply_memory_change(
      p_expected_collection_revision => 0,
      p_operation => 'create',
      p_memory_type => 'preference',
      p_content => 'No subject.'
    )
  $sql$,
  '42501',
  'An authenticated FitTip user is required.',
  'an authenticated role without a subject cannot mutate memory'
);

reset role;

select * from finish();
rollback;
