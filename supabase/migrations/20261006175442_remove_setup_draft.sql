-- The setup draft is removed.
--
-- Owner, 6 Oct 2026. Guided setup saves every screen where its answer lives
-- (`20261006103205_setup_direct_and_training_setup`): the profile, Goals or
-- Memory. Nothing waits in a draft for a review any more, and no deployed code
-- reads or writes what M2-03 built for that. ADR-021 records the decision and
-- retires ADR-011, the publication boundary this removes.
--
-- What the draft knew that still matters was carried to the profile by the
-- migration named above: finished, skipped, begun. An unfinished draft's own
-- answers are lost here, which the owner accepted.
--
-- Kept from M2-03, because Memory uses them and items filed by the old setup
-- still carry them: the `intake_confirmed` provenance, the
-- `memory_items.intake_field_key` column with its check and index, and the
-- trigger that clears a confidence after the owner edits an item. The
-- scheduler extension stays too; only this job is taken off it.

-- 1. The nightly cleanup, before the function it calls ------------------------

select cron.unschedule(jobid)
from cron.job
where jobname = 'fittip-onboarding-expiry-cleanup';

drop function private.purge_expired_onboarding_drafts();

-- 2. The change function and its helpers --------------------------------------

drop function public.apply_onboarding_change(
  bigint,
  text,
  jsonb,
  bigint,
  bigint,
  uuid
);
drop function private.onboarding_exact_keys(jsonb, text[]);
drop function private.onboarding_text_array(jsonb, integer, integer);
drop type public.onboarding_change_receipt;

-- 3. The tables, children first -----------------------------------------------

drop table public.onboarding_training_activities;
drop table public.onboarding_goal_candidates;
drop table public.onboarding_memory_candidates;
drop table public.onboarding_drafts;
drop table public.onboarding_prompt_states;
drop table public.onboarding_publication_receipts;
