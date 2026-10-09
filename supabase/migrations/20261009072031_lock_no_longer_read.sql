-- A lock is no longer read (owner, 9 Oct 2026).
--
-- Nothing told the owner what Lock meant, and they decided it goes: a session
-- they placed simply stays, and the choice a lock stood for - "keep this" or
-- "this can be replaced" - will be asked where a coach proposal is requested,
-- once a proposal can replace a session at all. Today it only adds.
--
-- A lock did one thing in the database: `rolling_plan_sweep_series_occurrences`
-- kept a locked occurrence when a series was ended or changed "from this one
-- on" (ADR-017, 19 August 2026). The owner decided nothing takes its place:
-- every later occurrence goes, the edited ones with the rest as ADR-017 already
-- says, and only an occurrence with training logged against it stays.
--
-- Structurally: the function is re-emitted from
-- `20260829073444_m3_15a_completion_foundation` without its three `is_locked`
-- predicates. One of them excluded a locked occurrence from `completedKept`,
-- so that a locked and logged one was counted once, as locked; it is now
-- counted as what keeps it. `lockedKept` stays in the result as a constant 0,
-- because `apply_rolling_plan_change_set` forwards that key into the receipt
-- and is not replaced here.
--
-- Not changed, on purpose, and inert from here on: the `is_locked` columns on
-- `rolling_plan_sessions` and `rolling_plan_activities`, the `isLocked` key the
-- payload validators require, and the `set_lock` branch of
-- `apply_rolling_plan_change_set`. The application no longer sends `set_lock`
-- and reads the flag nowhere. Removing them means re-emitting that function
-- and seven more, which belongs to its next replacement (`NEXT.md`). No row is
-- rewritten: a session locked before this keeps its stored flag, and the flag
-- no longer protects it from a sweep.

create or replace function public.rolling_plan_sweep_series_occurrences(
  p_user_id uuid,
  p_plan_id uuid,
  p_change_set_id uuid,
  p_series_id uuid,
  p_from_date date,
  p_today date,
  p_first_ordinal integer,
  p_now timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_occurrence record;
  v_ordinal integer := p_first_ordinal;
  v_deleted integer := 0;
  v_diverged integer := 0;
  v_completed_kept integer := 0;
begin
  select pg_catalog.count(*) into v_completed_kept
  from public.rolling_plan_sessions occurrence
  where occurrence.user_id = p_user_id
    and occurrence.series_id = p_series_id
    and occurrence.occurrence_date >= p_from_date
    and occurrence.local_date >= p_today
    and exists (
      select 1 from public.completions completion
      where completion.user_id = p_user_id
        and completion.plan_session_id = occurrence.id
    );

  for v_occurrence in
    select occurrence.id, occurrence.local_date, occurrence.has_diverged
    from public.rolling_plan_sessions occurrence
    where occurrence.user_id = p_user_id
      and occurrence.series_id = p_series_id
      and occurrence.occurrence_date >= p_from_date
      and occurrence.local_date >= p_today
      and not exists (
        select 1 from public.completions completion
        where completion.user_id = p_user_id
          and completion.plan_session_id = occurrence.id
      )
    order by occurrence.local_date, occurrence.position, occurrence.id
    for update
  loop
    insert into public.rolling_plan_change_entries (
      user_id, plan_id, change_set_id, session_id, series_id, local_date,
      ordinal, change_kind, before_state, after_state, created_at
    ) values (
      p_user_id, p_plan_id, p_change_set_id, null, null,
      v_occurrence.local_date, v_ordinal, 'delete',
      public.rolling_plan_session_state(p_user_id, v_occurrence.id),
      pg_catalog.jsonb_build_object(
        'localDate', v_occurrence.local_date::text, 'deleted', true
      ),
      p_now
    );
    delete from public.rolling_plan_sessions
    where id = v_occurrence.id and user_id = p_user_id;
    v_ordinal := v_ordinal + 1;
    v_deleted := v_deleted + 1;
    if v_occurrence.has_diverged then v_diverged := v_diverged + 1; end if;
  end loop;

  return pg_catalog.jsonb_build_object(
    'deleted', v_deleted,
    'divergedDeleted', v_diverged,
    -- Always 0: nothing is kept for a lock any more. The key stays because
    -- the receipt `apply_rolling_plan_change_set` builds still names it.
    'lockedKept', 0,
    'completedKept', v_completed_kept,
    'nextOrdinal', v_ordinal
  );
end;
$$;

revoke all privileges on function public.rolling_plan_sweep_series_occurrences(
  uuid, uuid, uuid, uuid, date, date, integer, timestamptz
) from public, anon, authenticated, service_role;
