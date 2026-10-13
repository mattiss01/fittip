-- Whether a milestone was reached (ADR-026).
--
-- A milestone of the roadmap in force can be marked reached, and the mark can
-- be taken back. The owner decided the shape on 13 Oct 2026: one answer,
-- reached; a milestone not marked is open and nothing ever says missed; a
-- mark holds the owner's local day and nothing else; taking it back removes
-- it and keeps no history; no coach call reads it.
--
-- A mark is a record beside the roadmap, as a log is beside the plan. An
-- accepted version is immutable and stays so: nothing here writes to
-- `roadmap_versions`.
--
-- A milestone has no id of its own. It is addressed by where it sits in an
-- accepted version, which never changes once written: the version, the
-- phase's position, and the milestone's position in that phase. A mark
-- therefore belongs to one accepted roadmap, and a new roadmap's milestones
-- start unmarked.

-- 1. The marks -----------------------------------------------------------------

create table public.roadmap_milestone_marks (
  user_id uuid not null,
  version_id uuid not null,
  phase_index smallint not null,
  milestone_index smallint not null,
  reached_on date not null,
  created_at timestamptz not null default now(),
  constraint roadmap_milestone_marks_pkey
    primary key (version_id, phase_index, milestone_index),
  constraint roadmap_milestone_marks_owner_fkey
    foreign key (user_id)
    references public.profiles (user_id)
    on delete cascade,
  -- The version and its owner together, so a mark cannot name a version that
  -- belongs to somebody else.
  constraint roadmap_milestone_marks_version_fkey
    foreign key (version_id, user_id)
    references public.roadmap_versions (id, user_id)
    on delete cascade,
  -- What a roadmap may hold: one to six phases, up to three milestones each.
  constraint roadmap_milestone_marks_phase_check
    check (phase_index between 0 and 5),
  constraint roadmap_milestone_marks_milestone_check
    check (milestone_index between 0 and 2)
);

create index roadmap_milestone_marks_owner_idx
  on public.roadmap_milestone_marks (user_id, version_id);

alter table public.roadmap_milestone_marks enable row level security;

revoke all privileges on table public.roadmap_milestone_marks
  from public, anon, authenticated, service_role;
-- Read only. Every write goes through the function below.
grant select on table public.roadmap_milestone_marks to authenticated;

create policy roadmap_milestone_marks_owner_select
  on public.roadmap_milestone_marks
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- 2. Marking, and taking a mark back -------------------------------------------

-- The owner's own roadmap in force only, found by auth.uid(). Neither the
-- owner nor the day is a caller's to give: the day is today where the owner
-- is, from the confirmed time zone, and UTC's where none is confirmed.
--
-- One refusal for every reason a mark cannot be made, so the function does
-- not say whether a version exists, whose it is, or what it holds.
--
-- Replay-safe both ways. Marking a marked milestone changes nothing and keeps
-- the day it was first marked; taking back a mark that is not there succeeds.
create or replace function public.set_roadmap_milestone_reached(
  p_version_id uuid,
  p_phase_index integer,
  p_milestone_index integer,
  p_reached boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_content jsonb;
  v_today date;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'An authenticated FitTip user is required.';
  end if;
  if p_version_id is null or p_reached is null
    or p_phase_index is null or p_phase_index not between 0 and 5
    or p_milestone_index is null or p_milestone_index not between 0 and 2
  then
    raise exception using errcode = '22023', message = 'Invalid milestone mark.';
  end if;

  -- The head is locked for the length of the change, so a roadmap accepted at
  -- the same moment cannot leave a mark on the version it replaced.
  select version.content into v_content
  from public.roadmap_heads head
  join public.roadmap_versions version
    on version.id = head.current_version_id and version.user_id = head.user_id
  where head.user_id = v_user_id and head.current_version_id = p_version_id
  for update of head;
  if not found
    or pg_catalog.jsonb_typeof(
      v_content -> 'phases' -> p_phase_index -> 'milestones' -> p_milestone_index
    ) is distinct from 'object'
  then
    raise exception using errcode = '22023', message = 'Invalid milestone mark.';
  end if;

  if not p_reached then
    delete from public.roadmap_milestone_marks
    where version_id = p_version_id and user_id = v_user_id
      and phase_index = p_phase_index and milestone_index = p_milestone_index;
    return;
  end if;

  select (pg_catalog.timezone(
    coalesce(profile.timezone_name, 'UTC'), pg_catalog.now()
  ))::date into v_today
  from public.profiles profile
  where profile.user_id = v_user_id;

  insert into public.roadmap_milestone_marks (
    user_id, version_id, phase_index, milestone_index, reached_on
  )
  values (
    v_user_id, p_version_id, p_phase_index, p_milestone_index, v_today
  )
  on conflict (version_id, phase_index, milestone_index) do nothing;
end;
$$;

revoke all privileges on function public.set_roadmap_milestone_reached(uuid, integer, integer, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.set_roadmap_milestone_reached(uuid, integer, integer, boolean)
  to authenticated;
