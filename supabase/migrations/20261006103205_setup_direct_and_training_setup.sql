-- Guided setup saves directly, and the training setup it asks for.
--
-- Owner, 5 and 6 Oct 2026: everything setup asked after goals is replaced.
-- It now asks how often the owner wants to train, which days are out, where
-- they can train and what they have at home. Those four are settings of the
-- profile, changed on Settings, and never memory items. What the owner says
-- in words on the last screen becomes ordinary memory items, and goals are
-- saved as goals at their own step. Nothing waits in a draft for a review any
-- more, so where setup stands is three columns on the profile.
--
-- This migration only adds. The draft's tables and `apply_onboarding_change`
-- are left in place, unused, and are dropped by a later migration once no
-- deployed code calls them. What they recorded that still matters (finished,
-- skipped, begun) is carried over below.
--
-- Nothing here is read by the coach. Whether the training setup may cross to
-- the AI provider is a later decision with its own record.
--
-- Writes follow the `timezone_name` precedent (M3-12): direct, owner-only,
-- column-scoped. There is no multi-row invariant to protect, so there is no
-- change function and no new privileged boundary.

-- 1. Columns -----------------------------------------------------------------

alter table public.profiles
  add column sessions_per_week smallint,
  add column unavailable_days text[] not null default '{}',
  add column availability_note text,
  add column training_places text[] not null default '{}',
  add column home_equipment text[] not null default '{}',
  -- Which of setup's screens the owner is on. Null means setup was never
  -- begun for this account. The screens are the application's to count.
  add column setup_step smallint,
  add column setup_finished_at timestamptz,
  add column setup_skipped_at timestamptz,
  add constraint profiles_sessions_per_week_check check (
    sessions_per_week is null or sessions_per_week between 1 and 14
  ),
  -- Each day at most once is the application's rule; seven entries drawn from
  -- seven names is the most this lets through.
  add constraint profiles_unavailable_days_check check (
    pg_catalog.cardinality(unavailable_days) <= 7
    and unavailable_days <@ array[
      'monday', 'tuesday', 'wednesday', 'thursday',
      'friday', 'saturday', 'sunday'
    ]::text[]
    and pg_catalog.array_position(unavailable_days, null) is null
  ),
  add constraint profiles_availability_note_check check (
    availability_note is null
    or (
      availability_note = pg_catalog.btrim(availability_note, E' \t\r\n')
      and pg_catalog.char_length(availability_note) between 1 and 300
    )
  ),
  -- The same shape as `profiles_sports_check`: a count and a total length
  -- bound the column, and no entry is null or empty.
  add constraint profiles_training_places_check check (
    pg_catalog.cardinality(training_places) <= 20
    and pg_catalog.char_length(
      pg_catalog.array_to_string(training_places, '')
    ) <= 1200
    and pg_catalog.array_position(training_places, null) is null
    and pg_catalog.array_position(training_places, '') is null
  ),
  add constraint profiles_home_equipment_check check (
    pg_catalog.cardinality(home_equipment) <= 40
    and pg_catalog.char_length(
      pg_catalog.array_to_string(home_equipment, '')
    ) <= 2400
    and pg_catalog.array_position(home_equipment, null) is null
    and pg_catalog.array_position(home_equipment, '') is null
  ),
  add constraint profiles_setup_step_check check (
    setup_step is null or setup_step between 1 and 99
  );

grant update (
  sessions_per_week,
  unavailable_days,
  availability_note,
  training_places,
  home_equipment,
  setup_step,
  setup_finished_at,
  setup_skipped_at
) on table public.profiles to authenticated;

-- 2. What the draft recorded -------------------------------------------------

-- Finished: setup was published at least once.
update public.profiles as profile
set setup_finished_at = receipt.published_at
from (
  select user_id, pg_catalog.min(published_at) as published_at
  from public.onboarding_publication_receipts
  group by user_id
) as receipt
where receipt.user_id = profile.user_id;

-- Skipped: the owner chose "Continue later" or dismissed the invitation.
update public.profiles as profile
set setup_skipped_at = prompt.dismissed_at
from public.onboarding_prompt_states as prompt
where prompt.user_id = profile.user_id;

-- Begun: a draft that has not expired. Setup opens at its first screen, with
-- what the profile and Goals already hold filled in.
update public.profiles as profile
set setup_step = 1
from public.onboarding_drafts as draft
where draft.user_id = profile.user_id
  and draft.expires_at > pg_catalog.statement_timestamp()
  and profile.setup_finished_at is null;
