-- A workout in progress (ADR-037).
--
-- Owner, 21 Oct 2026: a session can be logged live, set by set, and an
-- unfinished one is kept in the database so it survives a reload, a phone that
-- sleeps, or a switch of device. It is a draft, never a log: nothing here is a
-- completion, nothing reads it as training that happened, and the coach is not
-- sent it. Finishing opens the ordinary log steps filled in from it, and
-- `apply_live_workout_log` writes that log and removes the workout in one
-- transaction, so a workout cannot be logged twice.
--
-- * One per owner (`live_workouts_owner_one_key`): a second start is refused,
--   and the app leads back to the one running instead.
-- * Written directly by its owner under RLS, as `weight_entries` is: insert of
--   the four columns a start sets, update of the columns a running workout
--   changes, delete to discard. `user_id` and `started_at` are defaulted by
--   the database and never written by a client, so the clock starts on the
--   server's time.
-- * `plan_session_id` names the planned session it was started from, owner-
--   scoped by the composite key, and is cleared if that session is deleted:
--   the workout then finishes as unplanned training.
-- * `state` is the activity list being worked through, as the client edits
--   it. The database bounds its shape and size; the server parses it on every
--   read and write, and the log it becomes is validated by
--   `apply_completion_change` like any other.
--
-- Nothing destructive.

create table public.live_workouts (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  plan_session_id uuid,
  title text not null,
  sport text not null,
  started_at timestamptz not null default now(),
  paused_at timestamptz,
  paused_seconds integer not null default 0,
  state jsonb not null default '{"activities": []}'::jsonb,
  revision bigint not null default 1,
  constraint live_workouts_pkey primary key (id),
  constraint live_workouts_owner_key unique (id, user_id),
  constraint live_workouts_owner_one_key unique (user_id),
  constraint live_workouts_owner_fkey
    foreign key (user_id) references public.profiles (user_id) on delete cascade,
  constraint live_workouts_session_fkey
    foreign key (plan_session_id, user_id)
    references public.rolling_plan_sessions (id, user_id)
    on delete set null (plan_session_id),
  -- The bounds a log's own name holds (`completions`), so a finished workout
  -- always fits the log it becomes.
  constraint live_workouts_title_check
    check (char_length(btrim(title)) between 1 and 120),
  constraint live_workouts_sport_check
    check (char_length(btrim(sport)) between 1 and 80),
  constraint live_workouts_paused_seconds_check
    check (paused_seconds between 0 and 864000),
  constraint live_workouts_revision_check check (revision >= 1),
  -- A log holds at most fifty activities (`COMPLETION_ACTIVITY_LIMIT`).
  constraint live_workouts_state_check check (
    pg_catalog.jsonb_typeof(state) = 'object'
    and pg_catalog.jsonb_typeof(state->'activities') = 'array'
    and pg_catalog.jsonb_array_length(state->'activities') <= 50
    and pg_catalog.octet_length(state::text) <= 65536
  )
);

create index live_workouts_session_idx
  on public.live_workouts (plan_session_id, user_id);

alter table public.live_workouts enable row level security;

revoke all privileges on table public.live_workouts
from public, anon, authenticated, service_role;

grant select, delete on table public.live_workouts to authenticated;
grant insert (plan_session_id, title, sport, state)
  on table public.live_workouts to authenticated;
grant update (title, sport, paused_at, paused_seconds, state, revision)
  on table public.live_workouts to authenticated;

create policy live_workouts_owner_select
on public.live_workouts
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy live_workouts_owner_insert
on public.live_workouts
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy live_workouts_owner_update
on public.live_workouts
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy live_workouts_owner_delete
on public.live_workouts
for delete
to authenticated
using ((select auth.uid()) = user_id);

-- Finishing: the log is written and the workout removed together. The delete
-- comes first and holds the row, so a second finish of the same workout waits
-- for the first, then finds nothing and is refused rather than writing a
-- second log. If the log is refused - a planned session already logged, a
-- future date, a bad number - the whole call rolls back and the workout is
-- still there to correct and finish. Invoker rights: the delete is the
-- owner's own under RLS, and `apply_completion_change` applies every rule a
-- log answers to, unchanged.
create function public.apply_live_workout_log(
  p_live_workout_id uuid,
  p_completion jsonb
)
returns public.completion_receipt
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
  if p_live_workout_id is null then
    raise exception using errcode = '22023', message = 'Invalid completion change.';
  end if;

  delete from public.live_workouts workout
  where workout.id = p_live_workout_id and workout.user_id = v_user_id;
  if not found then
    raise exception using errcode = 'PT409',
      message = 'That workout was already logged or discarded.';
  end if;

  return public.apply_completion_change('create', null, null, p_completion);
end;
$$;

revoke all privileges on function public.apply_live_workout_log(uuid, jsonb)
from public, anon, authenticated, service_role;
grant execute on function public.apply_live_workout_log(uuid, jsonb)
to authenticated;
