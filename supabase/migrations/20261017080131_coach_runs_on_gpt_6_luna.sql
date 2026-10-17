-- The coach runs on `gpt-6-luna` (owner, 17 October 2026).
--
-- `roadmap_technical_codes_are_accepted` is the database's copy of the
-- approved provider/model list in `src/server/ai/model-binding.ts`: every
-- function that records a proposal asks it, so a proposal recorded against a
-- pair the application does not price is refused here too. The live pair
-- becomes `gpt-6-luna` with the rate card read that day, and `gpt-5.6-luna`
-- leaves the list rather than staying beside it. No live call was ever made
-- with 5.6 Luna, so no stored proposal names it; and the function is asked only
-- when a proposal is written, so a stored row would not be re-checked anyway.
--
-- The fixture pair is unchanged. `create or replace` keeps the signature, so
-- every caller is untouched, and keeps the privileges; they are revoked again
-- below so this file says what it leaves behind.

create or replace function public.roadmap_technical_codes_are_accepted(
  p_provider_code text,
  p_model_code text,
  p_rate_card_version text,
  p_has_spend_reservation boolean
)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select
    (
      p_provider_code = 'openai'
      and p_model_code = 'gpt-6-luna'
      and p_rate_card_version = 'openai-gpt-6-luna-2026-10-17'
      and p_has_spend_reservation
    )
    or (
      p_provider_code = 'fixture'
      and p_model_code = 'fixture-corpus-v1'
      and p_rate_card_version = 'fixture-no-spend'
      and not p_has_spend_reservation
    );
$$;

revoke all privileges on function public.roadmap_technical_codes_are_accepted(
  text, text, text, boolean
) from public, anon, authenticated, service_role;
