begin;

create extension if not exists pgtap with schema extensions;

-- M2-03 built a setup draft: six tables, a change function and a nightly
-- cleanup. Guided setup saves directly since 6 Oct 2026 and the draft was
-- removed (`20261006175442_remove_setup_draft`, ADR-021). This file proved
-- the draft; it now proves that it is gone and that what Memory took from
-- M2-03 is still there.

select plan(17);

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

select * from finish();

rollback;
