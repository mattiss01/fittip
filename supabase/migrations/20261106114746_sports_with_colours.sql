-- The owner's sports, each with its own colour (owner, 6 Nov 2026; ADR-041).
--
-- Plan and Progress each gave a sport a colour by its place in a list, the one
-- alphabetically and the other by use, so the same sport could be orange on
-- one and green on the other, and a new sport moved the rest. Now a sport has
-- one colour wherever it is drawn, chosen by the owner from twelve swatches in
-- Settings, where they also add, rename and delete their sports.
--
-- The owner chose a table of their own over a colour map beside the old list,
-- and to drop `profiles.sports` once it is copied. A record still names its
-- sport as text; this table is the owner's list and each sport's colour, and a
-- sport a record names that is not on it is drawn grey.
--
--   * `sports`: one row per sport. The owner reads it, adds to it, recolours,
--     reorders and deletes directly, under RLS, as with `weight_entries`. A new
--     row takes the least-used swatch, and a place at the end, from a trigger
--     that also holds the hundred-sport limit `profiles.sports` had.
--   * A name is never updated directly. `rename_sport` renames a sport and,
--     in the same transaction, every record of the owner's that names it
--     (owner, 6 Nov 2026: history included). Renaming onto a sport they
--     already have merges the two, keeping the other's colour.
--   * Deleting a sport removes its row and nothing else (ADR-031): its sessions
--     and logs keep their sport, which is then drawn grey.
--   * `keep_sports` keeps its signature and rule for the ten callers that add a
--     typed sport; `add_sport` is Settings' field and `set_sports` guided
--     setup's chip form.

-- 1. The table ----------------------------------------------------------------

create table public.sports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  name text not null,
  -- Filled by `sports_before_insert` when not given.
  colour text not null,
  position integer not null,
  created_at timestamptz not null default now(),
  constraint sports_user_id_fkey
    foreign key (user_id)
    references public.profiles (user_id)
    on delete cascade,
  -- The rule `keep_sports` has applied since 15 Oct 2026: trimmed, up to sixty
  -- characters, and no comma, since names are still sent as a list.
  constraint sports_name_check check (
    name = pg_catalog.btrim(name)
    and pg_catalog.char_length(name) between 1 and 60
    and pg_catalog.strpos(name, ',') = 0
  ),
  -- A swatch, not a colour: the palette lives in `globals.css` and may be
  -- retuned there without touching a row.
  constraint sports_colour_check check (
    colour in (
      'sport-1', 'sport-2', 'sport-3', 'sport-4', 'sport-5', 'sport-6',
      'sport-7', 'sport-8', 'sport-9', 'sport-10', 'sport-11', 'sport-12'
    )
  ),
  constraint sports_position_check check (position >= 0)
);

-- One sport per name as a person reads it, whatever the case.
create unique index sports_name_key
  on public.sports (user_id, pg_catalog.lower(name));
create index sports_user_position_idx on public.sports (user_id, position);

revoke all privileges on table public.sports
  from public, anon, authenticated, service_role;
grant select, delete on table public.sports to authenticated;
grant insert (user_id, name, colour) on table public.sports to authenticated;
-- Not `name`: a rename goes through `rename_sport`, so the records follow.
grant update (colour, position) on table public.sports to authenticated;

alter table public.sports enable row level security;

create policy sports_owner_select on public.sports
  for select to authenticated using ((select auth.uid()) = user_id);
create policy sports_owner_insert on public.sports
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy sports_owner_update on public.sports
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy sports_owner_delete on public.sports
  for delete to authenticated using ((select auth.uid()) = user_id);

-- A new sport's colour and place, and the limit. The owner's profile row is
-- locked first, so two sports added at once count and colour one after the
-- other rather than both taking the same swatch or the hundred-and-first place.
create function public.sports_before_insert()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform 1 from public.profiles where user_id = new.user_id for update;

  if (select pg_catalog.count(*) from public.sports where user_id = new.user_id)
    >= 100
  then
    raise exception using errcode = '23514',
      message = 'You have 100 sports, which is the most there can be.';
  end if;

  if new.colour is null then
    -- The swatch fewest of the owner's sports wear, the first of those on a tie.
    select 'sport-' || swatch.n into new.colour
    from pg_catalog.generate_series(1, 12) as swatch(n)
    order by (
      select pg_catalog.count(*) from public.sports as owned
      where owned.user_id = new.user_id
        and owned.colour = 'sport-' || swatch.n
    ), swatch.n
    limit 1;
  end if;

  if new.position is null then
    select coalesce(pg_catalog.max(position) + 1, 0) into new.position
    from public.sports where user_id = new.user_id;
  end if;

  return new;
end;
$$;

revoke all privileges on function public.sports_before_insert()
  from public, anon, authenticated, service_role;

create trigger sports_before_insert
  before insert on public.sports
  for each row
  execute function public.sports_before_insert();

-- 2. The lists move across -----------------------------------------------------

-- In the order the owner had them, a name as `keep_sports` would have kept it,
-- the first spelling of one written twice, and the swatches in turn.
insert into public.sports (user_id, name, colour, position)
select
  kept.user_id,
  kept.name,
  'sport-' || (((kept.rank - 1) % 12) + 1),
  kept.rank - 1
from (
  select
    listed_first.user_id,
    listed_first.name,
    pg_catalog.row_number() over (
      partition by listed_first.user_id order by listed_first.ord
    ) as rank
  from (
    select distinct on (profile.user_id, pg_catalog.lower(pg_catalog.btrim(listed.raw)))
      profile.user_id,
      pg_catalog.btrim(listed.raw) as name,
      listed.ord
    from public.profiles as profile
    cross join lateral pg_catalog.unnest(profile.sports)
      with ordinality as listed(raw, ord)
    where pg_catalog.btrim(listed.raw) <> ''
      and pg_catalog.char_length(pg_catalog.btrim(listed.raw)) <= 60
      and pg_catalog.strpos(listed.raw, ',') = 0
    order by profile.user_id, pg_catalog.lower(pg_catalog.btrim(listed.raw)),
      listed.ord
  ) as listed_first
) as kept;

drop function public.keep_sports(text[]);
-- Takes `profiles_sports_check` and the column's update grant with it.
alter table public.profiles drop column sports;

-- 3. A typed sport joins the list ---------------------------------------------

-- The rule of 15 Oct 2026, on the table: names kept as typed, trimmed; one
-- that is empty, longer than sixty characters, holds a comma or is already
-- the owner's in any case stays where it was typed; and past a hundred the
-- record keeps its sport and the list is simply not longer. Never an error for
-- a name: the save it came with has already gone through.
create function public.keep_sports(p_names text[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_raw text;
  v_name text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501',
      message = 'An authenticated FitTip user is required.';
  end if;
  -- Without a profile there is no list to add to.
  perform 1 from public.profiles where user_id = v_user_id for update;
  if not found then return; end if;

  foreach v_raw in array coalesce(p_names, '{}'::text[]) loop
    v_name := pg_catalog.btrim(v_raw);
    continue when v_name is null or v_name = ''
      or pg_catalog.char_length(v_name) > 60
      or pg_catalog.strpos(v_name, ',') > 0;
    exit when (
      select pg_catalog.count(*) from public.sports where user_id = v_user_id
    ) >= 100;
    insert into public.sports (user_id, name)
    values (v_user_id, v_name)
    on conflict (user_id, pg_catalog.lower(name)) do nothing;
  end loop;
end;
$$;

revoke all privileges on function public.keep_sports(text[])
  from public, anon, authenticated, service_role;
grant execute on function public.keep_sports(text[]) to authenticated;

-- Settings: one sport added by name, which unlike a typed one is refused when
-- the owner already has it (23505), so the field can say so. The trigger gives
-- it its colour and place.
create function public.add_sport(p_name text)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  insert into public.sports (user_id, name)
  values (auth.uid(), pg_catalog.btrim(p_name))
  returning id;
$$;

revoke all privileges on function public.add_sport(text)
  from public, anon, authenticated, service_role;
grant execute on function public.add_sport(text) to authenticated;

-- 4. Guided setup's chips -------------------------------------------------------

-- The sports chosen on setup's screen become the list: those kept keep their
-- colour, the new ones join, and the rest leave the list only (ADR-031).
create function public.set_sports(p_names text[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using errcode = '42501',
      message = 'An authenticated FitTip user is required.';
  end if;
  perform 1 from public.profiles where user_id = v_user_id for update;
  if not found then return; end if;

  delete from public.sports as owned
  where owned.user_id = v_user_id
    and not exists (
      select 1 from pg_catalog.unnest(coalesce(p_names, '{}'::text[])) as chosen(raw)
      where pg_catalog.lower(pg_catalog.btrim(chosen.raw))
        = pg_catalog.lower(owned.name)
    );
  perform public.keep_sports(p_names);
end;
$$;

revoke all privileges on function public.set_sports(text[])
  from public, anon, authenticated, service_role;
grant execute on function public.set_sports(text[]) to authenticated;

-- 5. Renaming a sport, everywhere ---------------------------------------------

-- Owner, 6 Nov 2026: a renamed sport is renamed on everything of theirs that
-- names it, past logs included, so its history and its colour stay together.
-- The owner asks for it by name in Settings; nothing renames a sport for them.
--
-- Definer, because the records are written by their own change functions and
-- the owner holds no update grant on them. It acts on `auth.uid()` alone and
-- touches only that owner's rows. A record matches as the list does, by its
-- trimmed name in any case.
--
-- Left as they are: what a log was measured against (`planned_snapshot`, which
-- a trigger keeps), the coach's own proposals and goal suggestions, and text
-- inside JSON. A log written before logs had a sport of their own reads its
-- plan's, so one whose plan named the old sport is given the new one.
--
-- Returns the sport the name now belongs to: this one, or on a merge the one
-- the owner already had, whose colour and place it keeps.
create function public.rename_sport(p_sport_id uuid, p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_old text;
  v_new text := pg_catalog.btrim(p_name);
  v_kept uuid;
  v_existing text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501',
      message = 'An authenticated FitTip user is required.';
  end if;
  if v_new is null or v_new = ''
    or pg_catalog.char_length(v_new) > 60
    or pg_catalog.strpos(v_new, ',') > 0
  then
    raise exception using errcode = '22023',
      message = 'A sport is a name of up to 60 characters, without a comma.';
  end if;

  perform 1 from public.profiles where user_id = v_user_id for update;
  select name into v_old
  from public.sports
  where id = p_sport_id and user_id = v_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'That sport is no longer on your list.';
  end if;

  select id, name into v_kept, v_existing
  from public.sports
  where user_id = v_user_id and id <> p_sport_id
    and pg_catalog.lower(name) = pg_catalog.lower(v_new);
  if found then
    delete from public.sports where id = p_sport_id;
    v_new := v_existing;
  else
    update public.sports set name = v_new where id = p_sport_id;
    v_kept := p_sport_id;
  end if;

  update public.rolling_plan_sessions set sport = v_new
  where user_id = v_user_id
    and pg_catalog.lower(pg_catalog.btrim(sport)) = pg_catalog.lower(v_old);
  update public.rolling_plan_activities set sport = v_new
  where user_id = v_user_id
    and pg_catalog.lower(pg_catalog.btrim(sport)) = pg_catalog.lower(v_old);
  update public.rolling_plan_series set sport = v_new
  where user_id = v_user_id
    and pg_catalog.lower(pg_catalog.btrim(sport)) = pg_catalog.lower(v_old);
  update public.rolling_plan_series_activities set sport = v_new
  where user_id = v_user_id
    and pg_catalog.lower(pg_catalog.btrim(sport)) = pg_catalog.lower(v_old);
  update public.saved_sessions set sport = v_new
  where user_id = v_user_id
    and pg_catalog.lower(pg_catalog.btrim(sport)) = pg_catalog.lower(v_old);
  update public.saved_session_activities set sport = v_new
  where user_id = v_user_id
    and pg_catalog.lower(pg_catalog.btrim(sport)) = pg_catalog.lower(v_old);
  update public.personal_activities set sport = v_new
  where user_id = v_user_id
    and pg_catalog.lower(pg_catalog.btrim(sport)) = pg_catalog.lower(v_old);
  update public.live_workouts set sport = v_new
  where user_id = v_user_id
    and pg_catalog.lower(pg_catalog.btrim(sport)) = pg_catalog.lower(v_old);
  update public.completion_activities set sport = v_new
  where user_id = v_user_id
    and pg_catalog.lower(pg_catalog.btrim(sport)) = pg_catalog.lower(v_old);
  update public.completions set sport = v_new
  where user_id = v_user_id
    and (
      pg_catalog.lower(pg_catalog.btrim(sport)) = pg_catalog.lower(v_old)
      or (
        sport is null
        and pg_catalog.lower(pg_catalog.btrim(planned_snapshot ->> 'sport'))
          = pg_catalog.lower(v_old)
      )
    );

  -- A goal names each sport once, so a merge leaves one of the two.
  update public.goals as goal
  set sports = array(
    select renamed.name
    from (
      select distinct on (pg_catalog.lower(entry.name)) entry.name, entry.ord
      from (
        select
          case
            when pg_catalog.lower(pg_catalog.btrim(listed.raw))
              = pg_catalog.lower(v_old) then v_new
            else listed.raw
          end as name,
          listed.ord
        from pg_catalog.unnest(goal.sports) with ordinality as listed(raw, ord)
      ) as entry
      order by pg_catalog.lower(entry.name), entry.ord
    ) as renamed
    order by renamed.ord
  )
  where goal.user_id = v_user_id
    and exists (
      select 1 from pg_catalog.unnest(goal.sports) as listed(raw)
      where pg_catalog.lower(pg_catalog.btrim(listed.raw)) = pg_catalog.lower(v_old)
    );

  return v_kept;
end;
$$;

revoke all privileges on function public.rename_sport(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.rename_sport(uuid, text) to authenticated;

comment on function public.rename_sport(uuid, text) is
  'Renames the caller''s sport and every record of theirs that names it (owner, 6 Nov 2026). Owner from auth.uid() only.';
