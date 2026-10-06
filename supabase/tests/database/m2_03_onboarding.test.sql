begin;

create extension if not exists pgtap with schema extensions;

-- M2-03 built a setup draft: six tables, a change function and a nightly
-- cleanup. Guided setup saves directly since 6 Oct 2026 and the draft was
-- removed (`20261006175442_remove_setup_draft`, ADR-021). This file proved
-- the draft; it now proves that it is gone and that what Memory took from
-- M2-03 is still there.

select plan(23);

-- 1. Gone --------------------------------------------------------------------

select hasnt_table('public', 'onboarding_drafts', 'the draft table is gone');
select hasnt_table('public', 'onboarding_training_activities', 'the draft''s activities are gone');
select hasnt_table('public', 'onboarding_goal_candidates', 'the goal candidates are gone');
select hasnt_table('public', 'onboarding_memory_candidates', 'the memory candidates are gone');
select hasnt_table('public', 'onboarding_prompt_states', 'the prompt states are gone');
select hasnt_table('public', 'onboarding_publication_receipts', 'the publication receipts are gone');
select hasnt_function('public', 'apply_onboarding_change', 'the change function is gone');
select hasnt_function('private', 'purge_expired_onboarding_drafts', 'the cleanup function is gone');
select hasnt_function('private', 'onboarding_exact_keys', 'the key helper is gone');
select hasnt_function('private', 'onboarding_text_array', 'the array helper is gone');
select hasnt_type('public', 'onboarding_change_receipt', 'the receipt type is gone');
select is(
  (select count(*)::bigint from cron.job where jobname = 'fittip-onboarding-expiry-cleanup'),
  0::bigint,
  'the nightly cleanup is off the scheduler'
);
-- Nothing left in the exposed schemas still carries the name.
select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname in ('public', 'private')
      and relation.relname like 'onboarding%'
  ),
  0::bigint,
  'no table, index or sequence of the draft is left'
);

-- 2. Kept, because Memory uses it --------------------------------------------

select has_column('public', 'memory_items', 'intake_field_key', 'items filed by the old setup keep their field key');
select has_trigger(
  'public',
  'memory_items',
  'memory_items_clear_confidence_after_owner_edit',
  'an owner''s edit still clears a confidence'
);
select has_function('private', 'clear_memory_confidence_after_owner_edit', 'the trigger''s function is still there');

select ok(
  (
    select pg_catalog.pg_get_constraintdef(oid) like '%intake_confirmed%'
    from pg_catalog.pg_constraint
    where conname = 'memory_items_provenance_check'
  ),
  'the intake_confirmed provenance is still accepted'
);

select has_index(
  'public',
  'memory_items',
  'memory_items_owner_intake_field_key_idx',
  'the field key is still unique for an owner'
);
select ok(
  exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'memory_items_intake_field_key_check'
  ),
  'the field key still belongs to intake_confirmed items only'
);

-- 3. Kept behaviour ----------------------------------------------------------

-- M2-03 also changed Memory itself, and that stays: a rejected item can be
-- accepted, and an owner's ordinary edit clears an inferred item's
-- confidence. The draft's own tests proved both; they are proved here now.
-- No authenticated path makes an inferred item, so two are seeded.
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values ('54000000-0000-4000-8000-0000000000e5', 'draft-gone@example.test', '{}', '{}');
insert into public.profiles (user_id)
values ('54000000-0000-4000-8000-0000000000e5');
insert into public.memory_revisions (
  id, user_id, item_id, revision_number, content,
  author_class, provenance, change_kind, status_after
)
values
  (
    '54000000-0000-4000-8000-0000000000a1',
    '54000000-0000-4000-8000-0000000000e5',
    '54000000-0000-4000-8000-0000000000b1',
    1, 'Recovers slowly after hard sessions.',
    'system', 'inferred_proposed', 'created', 'proposed'
  ),
  (
    '54000000-0000-4000-8000-0000000000a2',
    '54000000-0000-4000-8000-0000000000e5',
    '54000000-0000-4000-8000-0000000000b2',
    1, 'Trains hardest on Tuesday evenings.',
    'system', 'inferred_proposed', 'created', 'proposed'
  );
insert into public.memory_items (
  id, user_id, memory_type, status, provenance, confidence,
  source_reference, current_revision_id
)
values
  (
    '54000000-0000-4000-8000-0000000000b1',
    '54000000-0000-4000-8000-0000000000e5',
    'observed_pattern', 'proposed', 'inferred_proposed', 60,
    'seeded:draft-removal-test',
    '54000000-0000-4000-8000-0000000000a1'
  ),
  (
    '54000000-0000-4000-8000-0000000000b2',
    '54000000-0000-4000-8000-0000000000e5',
    'observed_pattern', 'proposed', 'inferred_proposed', 55,
    'seeded:draft-removal-test',
    '54000000-0000-4000-8000-0000000000a2'
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"54000000-0000-4000-8000-0000000000e5","role":"authenticated"}',
  true
);

select lives_ok(
  $sql$
    select public.apply_memory_change(
      p_expected_collection_revision => 0,
      p_operation => 'reject',
      p_item_id => '54000000-0000-4000-8000-0000000000b1'
    )
  $sql$,
  'the owner can reject a proposal'
);
select lives_ok(
  $sql$
    select public.apply_memory_change(
      p_expected_collection_revision => 1,
      p_operation => 'accept',
      p_item_id => '54000000-0000-4000-8000-0000000000b1'
    )
  $sql$,
  'a rejected item can still be accepted'
);
select lives_ok(
  $sql$
    select public.apply_memory_change(
      p_expected_collection_revision => 2,
      p_operation => 'accept',
      p_item_id => '54000000-0000-4000-8000-0000000000b2'
    );
    select public.apply_memory_change(
      p_expected_collection_revision => 3,
      p_operation => 'edit',
      p_item_id => '54000000-0000-4000-8000-0000000000b2',
      p_content => 'Owner wording after an ordinary edit.'
    )
  $sql$,
  'the owner can accept an inferred item and then edit it'
);
select ok(
  (
    select first.status = 'active' and first.confidence = 60
      and second.confidence is null
      and second.provenance = 'inferred_proposed'
    from public.memory_items as first, public.memory_items as second
    where first.id = '54000000-0000-4000-8000-0000000000b1'
      and second.id = '54000000-0000-4000-8000-0000000000b2'
  ),
  'the accepted item keeps its confidence; the owner''s edit cleared the other''s'
);

reset role;

select * from finish();

rollback;
