-- The approved provider/model list, as the database holds it.
--
-- Every function that records a proposal asks
-- `roadmap_technical_codes_are_accepted`, so this list is the second refusal
-- behind `src/server/ai/model-binding.ts`. Since 17 October 2026 its one live
-- pair is `gpt-6-luna`; `gpt-5.6-luna` must be refused, not kept beside it.

begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

select ok(
  public.roadmap_technical_codes_are_accepted(
    'openai', 'gpt-6-luna', 'openai-gpt-6-luna-2026-10-17', true
  ),
  'gpt-6-luna at its rate card, with a reservation, is accepted'
);

select ok(
  not public.roadmap_technical_codes_are_accepted(
    'openai', 'gpt-6-luna', 'openai-gpt-6-luna-2026-10-17', false
  ),
  'a live pair without a spend reservation is refused'
);

select ok(
  not public.roadmap_technical_codes_are_accepted(
    'openai', 'gpt-5.6-luna', 'openai-gpt-5.6-luna-2026-08-10', true
  ),
  'gpt-5.6-luna is no longer accepted'
);

select ok(
  not public.roadmap_technical_codes_are_accepted(
    'openai', 'gpt-6-luna', 'openai-gpt-5.6-luna-2026-08-10', true
  ),
  'gpt-6-luna priced by the old rate card is refused'
);

select ok(
  public.roadmap_technical_codes_are_accepted(
    'fixture', 'fixture-corpus-v1', 'fixture-no-spend', false
  ),
  'the fixture pair, without a reservation, is still accepted'
);

select ok(
  not public.roadmap_technical_codes_are_accepted(
    'fixture', 'fixture-corpus-v1', 'fixture-no-spend', true
  ),
  'the fixture pair cannot carry a reservation'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.roadmap_technical_codes_are_accepted(text, text, text, boolean)',
    'execute'
  ),
  'authenticated cannot call the check directly'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.roadmap_technical_codes_are_accepted(text, text, text, boolean)',
    'execute'
  ),
  'anon cannot call the check directly'
);

select * from finish();
rollback;
