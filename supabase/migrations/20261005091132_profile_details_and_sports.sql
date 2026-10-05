-- Profile details, the sports list, and a weight history.
--
-- Owner, 5 Oct 2026: guided setup opens with "About you" (name, birthday,
-- height, weight, gender) and "Your sports", before goals. Both are settings
-- of the profile rather than setup answers, so they are written here directly
-- and never pass through the setup draft or its review step. Units and the
-- time zone are guessed from the browser and shown for the owner to change;
-- the units land here, the zone in `timezone_name` (M3-12).
--
-- Decisions the owner made: only the name is asked for firmly, and that is
-- the form's rule, so every column is nullable; gender is one of three values
-- or unset; no sport is required; weight keeps a history.
--
-- Everything is stored metric. The units column says how to show it.
--
-- Nothing here is read by the coach. Which of these fields may cross to the AI
-- provider is ADR-021's decision and a later change; the name and the birthday
-- never do.
--
-- Writes follow the `timezone_name` precedent (M3-12): direct, owner-only,
-- column-scoped. There is no multi-row invariant to protect, so there is no
-- change function and no new privileged boundary.

-- 1. Profile columns ---------------------------------------------------------

alter table public.profiles
  add column display_name text,
  add column birth_date date,
  add column height_cm numeric(4, 1),
  add column gender text,
  add column units_system text,
  add column sports text[] not null default '{}',
  -- Trimmed of spaces, tabs and line breaks alike, so whitespace alone is
  -- never a name.
  add constraint profiles_display_name_check check (
    display_name is null
    or (
      display_name = pg_catalog.btrim(display_name, E' \t\r\n')
      and pg_catalog.char_length(display_name) between 1 and 80
    )
  ),
  -- A check cannot ask what today is, so "not in the future" is the
  -- application's rule; this one only refuses a date that is not a birthday.
  add constraint profiles_birth_date_check check (
    birth_date is null or birth_date >= date '1900-01-01'
  ),
  add constraint profiles_height_cm_check check (
    height_cm is null or height_cm between 50 and 272
  ),
  add constraint profiles_gender_check check (
    gender is null or gender in ('female', 'male', 'other')
  ),
  add constraint profiles_units_system_check check (
    units_system is null or units_system in ('metric', 'imperial')
  ),
  -- The same shape as `goals_activity_areas_check`: a count and a total length
  -- bound the column, and no entry is null or empty. One name's own length and
  -- "no name twice" are the application's rules.
  add constraint profiles_sports_check check (
    pg_catalog.cardinality(sports) <= 100
    and pg_catalog.char_length(pg_catalog.array_to_string(sports, '')) <= 6000
    and pg_catalog.array_position(sports, null) is null
    and pg_catalog.array_position(sports, '') is null
  );

-- Column-scoped, like `timezone_name`: `user_id` and `created_at` stay
-- unwritable, and the M3-12 owner update policy already confines the row.
grant update (
  display_name,
  birth_date,
  height_cm,
  gender,
  units_system,
  sports
) on table public.profiles to authenticated;

-- 2. Weight history ----------------------------------------------------------

-- One entry a day. A second weight on the same day corrects the first rather
-- than standing beside it, which is why the day is part of the key.
create table public.weight_entries (
  user_id uuid not null,
  measured_on date not null,
  weight_kg numeric(5, 2) not null,
  created_at timestamptz not null default now(),
  constraint weight_entries_pkey primary key (user_id, measured_on),
  constraint weight_entries_user_id_fkey
    foreign key (user_id)
    references public.profiles (user_id)
    on delete cascade,
  constraint weight_entries_measured_on_check check (
    measured_on >= date '1900-01-01'
  ),
  constraint weight_entries_weight_kg_check check (
    weight_kg between 20 and 400
  )
);

revoke all privileges on table public.weight_entries
  from public, anon, authenticated, service_role;
-- The owner may correct a day's weight and remove an entry: it is their own
-- measurement, and nothing else refers to it.
grant select, insert, delete on table public.weight_entries to authenticated;
grant update (weight_kg) on table public.weight_entries to authenticated;

alter table public.weight_entries enable row level security;

create policy weight_entries_owner_select
  on public.weight_entries
  for select to authenticated using ((select auth.uid()) = user_id);

create policy weight_entries_owner_insert
  on public.weight_entries
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy weight_entries_owner_update
  on public.weight_entries
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy weight_entries_owner_delete
  on public.weight_entries
  for delete to authenticated using ((select auth.uid()) = user_id);
