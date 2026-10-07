-- A logged session is settled on the server too (owner, 7 Oct 2026).
--
-- Since 3 Oct 2026 a logged session's page offers only Edit log and Save to
-- library, but only Delete was refused here: a page left open from before the
-- log, or a hand-made request, could still edit, move, lock or cancel the
-- session a log was measured against, or reactivate a cancelled one that was
-- trained anyway. The owner decided:
--
--   * Edit, move, lock, cancel and reactivate are refused on a logged session,
--     with PT425, the code Delete already answers with.
--   * Any log settles it, a skip logged ahead included: the test is the one
--     Delete uses, a `completions` row naming the session.
--   * Deleting a log should be possible one day (`NEXT.md`). This rule needs
--     no change for that: no log, no refusal.
--
-- Structurally: `apply_rolling_plan_change_set` is re-emitted verbatim from
-- `20260929143946_session_cancellation_reason` (its live definition matched
-- that file) with the changes marked "Logged session". The check sits behind
-- the same `for update` row lock Delete's does, which is stronger than the key
-- share a concurrent completion insert takes, so it cannot be raced. The past
-- boundary is still asked first, the order the owner already sees the two
-- refusals in.
--
-- Not changed, on purpose: a series edit or "delete this and all future"
-- already keeps a logged occurrence (`completedKept`); a coach's plan proposal
-- only adds sessions and sets recovery days; and the cancellation reason's own
-- setter records what happened rather than changing the plan.
--
-- `begin_session_activity_generation` is re-emitted from
-- `20260928093803_a7_3_session_activity_proposals` with one check, so no paid
-- coach call starts for a session whose activities can no longer be saved.
-- Accepting a suggestion needs nothing here: it is the owner's own Save, an
-- `edit`, and is refused above.
--
-- Owner-visible conditions: PT425 now also answers edit, move, set_lock,
-- cancel and reactivate. No table, column, type, signature or grant changes.

-- 1. The change function -----------------------------------------------------

create or replace function public.apply_rolling_plan_change_set(
  p_expected_plan_revision bigint,
  p_idempotency_key uuid,
  p_provenance text,
  p_changes jsonb
)
returns public.rolling_plan_change_receipt
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_timezone text;
  v_today date;
  v_plan public.rolling_plans;
  v_existing public.rolling_plan_change_sets;
  v_fingerprint text;
  v_change_set_id uuid := gen_random_uuid();
  v_new_revision bigint;
  v_change jsonb;
  v_operation text;
  v_session_input jsonb;
  v_session_id uuid;
  v_local_date date;
  v_target_date date;
  v_before jsonb;
  v_after jsonb;
  v_activity jsonb;
  v_ordinal integer := 0;
  v_position numeric;
  v_session_dates date[] := array[]::date[];
  v_series public.rolling_plan_series;
  v_series_id uuid;
  v_series_input jsonb;
  v_effective_date date;
  v_successor_series_id uuid;
  v_sweep_from date;
  v_sweep jsonb;
  v_series_effects jsonb := '[]'::jsonb;
  v_occurrence_series_id uuid;
  v_occurrence_date date;
  -- Cancellation reason: the owner's optional why, kept beside the session.
  v_cancel_reason text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'An authenticated FitTip user is required.';
  end if;
  if p_expected_plan_revision is null or p_expected_plan_revision < 0
    or p_idempotency_key is null or p_provenance is null
    or p_provenance !~ '^[a-z][a-z0-9_]{0,63}$'
    or p_changes is null or pg_catalog.jsonb_typeof(p_changes) <> 'array'
    or pg_catalog.jsonb_array_length(p_changes) not between 1 and 100
  then
    raise exception using errcode = '22023', message = 'Invalid rolling plan change set.';
  end if;

  -- Owner-local today comes from the stored profile zone and auth.uid() only.
  -- A caller cannot supply either, so neither rule below can be argued away.
  select profile.timezone_name into v_timezone
  from public.profiles profile where profile.user_id = v_user_id;
  if v_timezone is null then
    raise exception using errcode = 'PT428',
      message = 'Confirm your time zone before changing your plan.';
  end if;
  v_today := (pg_catalog.timezone(v_timezone, v_now))::date;

  v_fingerprint := pg_catalog.encode(extensions.digest(
    pg_catalog.convert_to(pg_catalog.jsonb_build_object(
      'expectedPlanRevision', p_expected_plan_revision,
      'provenance', p_provenance,
      'changes', p_changes
    )::text, 'UTF8'), 'sha256'), 'hex');

  perform pg_catalog.set_config('lock_timeout', '3s', true);
  begin
    perform pg_catalog.pg_advisory_xact_lock(62006, pg_catalog.hashtext(v_user_id::text));
  exception when lock_not_available then
    raise exception using errcode = 'PT409', message = 'Your plan changed. Reload and try again.';
  end;

  select * into v_existing from public.rolling_plan_change_sets
  where user_id = v_user_id and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.request_fingerprint <> v_fingerprint then
      raise exception using errcode = 'PT409', message = 'That plan change key was already used.';
    end if;
    return (
      v_existing.plan_id, v_existing.plan_revision, v_existing.id, 'replayed', null
    )::public.rolling_plan_change_receipt;
  end if;

  select * into v_plan from public.rolling_plans where user_id = v_user_id for update;
  if not found then
    if p_expected_plan_revision <> 0 then
      raise exception using errcode = 'PT409', message = 'Your plan changed. Reload and try again.';
    end if;
    insert into public.rolling_plans (user_id) values (v_user_id) returning * into v_plan;
  elsif v_plan.revision <> p_expected_plan_revision then
    raise exception using errcode = 'PT409', message = 'Your plan changed. Reload and try again.';
  end if;

  v_new_revision := v_plan.revision + 1;
  insert into public.rolling_plan_change_sets (
    id, user_id, plan_id, plan_revision, idempotency_key,
    request_fingerprint, provenance, created_at
  ) values (
    v_change_set_id, v_user_id, v_plan.id, v_new_revision,
    p_idempotency_key, v_fingerprint, p_provenance, v_now
  );

  for v_change in select value from pg_catalog.jsonb_array_elements(p_changes) loop
    if pg_catalog.jsonb_typeof(v_change) <> 'object'
      or not (v_change ? 'operation')
      or pg_catalog.jsonb_typeof(v_change->'operation') <> 'string'
    then raise exception using errcode = '22023', message = 'Invalid rolling plan change.'; end if;
    v_operation := v_change->>'operation';
    v_before := null;
    v_session_id := null;
    v_local_date := null;
    v_series_id := null;
    v_successor_series_id := null;
    v_sweep_from := null;

    if v_operation = 'set_recovery_day' then
      if v_change - array['operation', 'localDate', 'isRecoveryDay'] <> '{}'::jsonb
        or not (v_change ?& array['localDate', 'isRecoveryDay'])
        or pg_catalog.jsonb_typeof(v_change->'localDate') <> 'string'
        or (v_change->>'localDate')::date::text <> v_change->>'localDate'
        or pg_catalog.jsonb_typeof(v_change->'isRecoveryDay') <> 'boolean'
      then raise exception using errcode = '22023', message = 'Invalid rolling plan recovery day.'; end if;
      v_local_date := (v_change->>'localDate')::date;
      if v_local_date < v_today then
        raise exception using errcode = 'PT422',
          message = 'A plan change cannot target a date before today.';
      end if;

      -- A label is not a session, so it never counts toward the per-date cap.
      v_before := pg_catalog.jsonb_build_object(
        'localDate', v_local_date::text,
        'isRecoveryDay', exists (
          select 1 from public.rolling_plan_recovery_days recovery
          where recovery.user_id = v_user_id and recovery.local_date = v_local_date
        )
      );
      if (v_change->>'isRecoveryDay')::boolean then
        insert into public.rolling_plan_recovery_days (
          user_id, plan_id, local_date, created_at
        ) values (v_user_id, v_plan.id, v_local_date, v_now)
        on conflict (user_id, local_date) do nothing;
      else
        delete from public.rolling_plan_recovery_days recovery
        where recovery.user_id = v_user_id and recovery.local_date = v_local_date;
      end if;
      v_after := pg_catalog.jsonb_build_object(
        'localDate', v_local_date::text,
        'isRecoveryDay', (v_change->>'isRecoveryDay')::boolean
      );
    elsif v_operation in ('add_series', 'edit_series', 'end_series') then
      if not (v_change ? 'seriesId')
        or pg_catalog.jsonb_typeof(v_change->'seriesId') <> 'string'
      then raise exception using errcode = '22023', message = 'Invalid rolling plan series change.'; end if;
      begin v_series_id := (v_change->>'seriesId')::uuid;
      exception when others then
        raise exception using errcode = '22023', message = 'Invalid rolling plan series change.';
      end;

      if v_operation = 'add_series' then
        if v_change - array['operation', 'seriesId', 'series'] <> '{}'::jsonb
          or not (v_change ? 'series')
          or not public.rolling_plan_series_input_is_valid(v_change->'series')
          or exists (select 1 from public.rolling_plan_series where id = v_series_id)
        then raise exception using errcode = '22023', message = 'Invalid rolling plan series.'; end if;
        v_series_input := v_change->'series';
        if (v_series_input->>'startDate')::date < v_today then
          raise exception using errcode = 'PT422',
            message = 'A plan change cannot target a date before today.';
        end if;
        insert into public.rolling_plan_series (
          id, user_id, plan_id, predecessor_series_id, frequency, interval_count,
          weekdays, start_date, end_date, title, sport, intent,
          expected_duration_minutes, note, created_at, updated_at
        ) values (
          v_series_id, v_user_id, v_plan.id, null,
          v_series_input->>'frequency',
          (v_series_input->>'intervalCount')::smallint,
          public.rolling_plan_weekday_set(v_series_input->'weekdays'),
          (v_series_input->>'startDate')::date,
          (v_series_input->>'endDate')::date,
          pg_catalog.btrim(v_series_input->>'title'),
          pg_catalog.btrim(v_series_input->>'sport'),
          nullif(v_series_input->>'intent', ''),
          (v_series_input->>'expectedDurationMinutes')::integer,
          nullif(v_series_input->>'note', ''),
          v_now, v_now
        );
        perform public.rolling_plan_replace_series_activities(
          v_user_id, v_series_id, v_series_input->'activities', v_now
        );
        v_after := public.rolling_plan_series_state(v_user_id, v_series_id);
      else
        select * into v_series from public.rolling_plan_series
        where id = v_series_id and user_id = v_user_id for update;
        if not found then
          raise exception using errcode = '22023', message = 'Invalid rolling plan series change.';
        end if;
        v_before := public.rolling_plan_series_state(v_user_id, v_series_id);

        if v_operation = 'end_series' then
          if v_change - array['operation', 'seriesId', 'effectiveDate'] <> '{}'::jsonb
            or not (v_change ? 'effectiveDate')
            or pg_catalog.jsonb_typeof(v_change->'effectiveDate') <> 'string'
            or (v_change->>'effectiveDate')::date::text <> v_change->>'effectiveDate'
          then raise exception using errcode = '22023', message = 'Invalid rolling plan series change.'; end if;
          v_effective_date := (v_change->>'effectiveDate')::date;
          if v_effective_date < v_today then
            raise exception using errcode = 'PT422',
              message = 'A plan change cannot target a date before today.';
          end if;
          -- Ending a segment never lengthens it. A segment that already
          -- ends earlier keeps its own end date, because the sweep below only
          -- runs from the effective date forward and so could never remove the
          -- occurrences a pushed-out end date would let the next
          -- materialization write into the reopened gap.
          update public.rolling_plan_series set
            end_date = least(
              coalesce(end_date, 'infinity'::date), v_effective_date - 1
            ),
            updated_at = v_now
          where id = v_series_id and user_id = v_user_id;
          v_sweep_from := v_effective_date;
          v_after := public.rolling_plan_series_state(v_user_id, v_series_id);
        elsif v_change ? 'effectiveDate' then
          -- This and future: close the running segment and open a successor
          -- that points back at it. Occurrences before the split date are never
          -- touched, so what they meant is preserved.
          if v_change - array[
            'operation', 'seriesId', 'effectiveDate', 'successorSeriesId', 'series'
          ] <> '{}'::jsonb
            or not (v_change ?& array['successorSeriesId', 'series'])
            or pg_catalog.jsonb_typeof(v_change->'effectiveDate') <> 'string'
            or (v_change->>'effectiveDate')::date::text <> v_change->>'effectiveDate'
            or pg_catalog.jsonb_typeof(v_change->'successorSeriesId') <> 'string'
            or not public.rolling_plan_series_input_is_valid(v_change->'series')
          then raise exception using errcode = '22023', message = 'Invalid rolling plan series change.'; end if;
          v_series_input := v_change->'series';
          v_effective_date := (v_change->>'effectiveDate')::date;
          begin v_successor_series_id := (v_change->>'successorSeriesId')::uuid;
          exception when others then
            raise exception using errcode = '22023', message = 'Invalid rolling plan series change.';
          end;
          if v_effective_date < v_today then
            raise exception using errcode = 'PT422',
              message = 'A plan change cannot target a date before today.';
          end if;
          -- The successor starts on the split date and the predecessor keeps
          -- at least its own first day, so a split is never a whole-series
          -- edit wearing a different name.
          if v_effective_date <= v_series.start_date
            or (v_series_input->>'startDate')::date <> v_effective_date
            or exists (select 1 from public.rolling_plan_series where id = v_successor_series_id)
          then raise exception using errcode = '22023', message = 'Invalid rolling plan series change.'; end if;
          -- Closing the predecessor never lengthens it either; the clamp is
          -- the same one `end_series` applies, for the same reason.
          update public.rolling_plan_series set
            end_date = least(
              coalesce(end_date, 'infinity'::date), v_effective_date - 1
            ),
            updated_at = v_now
          where id = v_series_id and user_id = v_user_id
          returning end_date into v_series.end_date;
          insert into public.rolling_plan_series (
            id, user_id, plan_id, predecessor_series_id, frequency, interval_count,
            weekdays, start_date, end_date, title, sport, intent,
            expected_duration_minutes, note, created_at, updated_at
          ) values (
            v_successor_series_id, v_user_id, v_plan.id, v_series_id,
            v_series_input->>'frequency',
            (v_series_input->>'intervalCount')::smallint,
            public.rolling_plan_weekday_set(v_series_input->'weekdays'),
            v_effective_date,
            (v_series_input->>'endDate')::date,
            pg_catalog.btrim(v_series_input->>'title'),
            pg_catalog.btrim(v_series_input->>'sport'),
            nullif(v_series_input->>'intent', ''),
            (v_series_input->>'expectedDurationMinutes')::integer,
            nullif(v_series_input->>'note', ''),
            v_now, v_now
          );
          perform public.rolling_plan_replace_series_activities(
            v_user_id, v_successor_series_id, v_series_input->'activities', v_now
          );
          v_sweep_from := v_effective_date;
          v_after := public.rolling_plan_series_state(v_user_id, v_successor_series_id)
            || pg_catalog.jsonb_build_object(
              'predecessorSeriesId', v_series_id,
              'predecessorEndDate', v_series.end_date::text
            );
        else
          -- A whole-series edit rewrites what every occurrence of the segment
          -- means, so it is only offered while the segment has not started.
          if v_change - array['operation', 'seriesId', 'series'] <> '{}'::jsonb
            or not (v_change ? 'series')
            or not public.rolling_plan_series_input_is_valid(v_change->'series')
          then raise exception using errcode = '22023', message = 'Invalid rolling plan series change.'; end if;
          -- No occurrence can precede the segment's own start date, so a
          -- segment that still starts today or later has had none.
          if v_series.start_date < v_today then
            raise exception using errcode = 'PT424',
              message = 'This series has already started. Change it from a date instead.';
          end if;
          v_series_input := v_change->'series';
          if (v_series_input->>'startDate')::date < v_today then
            raise exception using errcode = 'PT422',
              message = 'A plan change cannot target a date before today.';
          end if;
          update public.rolling_plan_series set
            frequency = v_series_input->>'frequency',
            interval_count = (v_series_input->>'intervalCount')::smallint,
            weekdays = public.rolling_plan_weekday_set(v_series_input->'weekdays'),
            start_date = (v_series_input->>'startDate')::date,
            end_date = (v_series_input->>'endDate')::date,
            title = pg_catalog.btrim(v_series_input->>'title'),
            sport = pg_catalog.btrim(v_series_input->>'sport'),
            intent = nullif(v_series_input->>'intent', ''),
            expected_duration_minutes = (v_series_input->>'expectedDurationMinutes')::integer,
            note = nullif(v_series_input->>'note', ''),
            updated_at = v_now
          where id = v_series_id and user_id = v_user_id;
          perform public.rolling_plan_replace_series_activities(
            v_user_id, v_series_id, v_series_input->'activities', v_now
          );
          -- The rule changed, so every occurrence it already produced is stale.
          v_sweep_from := least(
            v_series.start_date, (v_series_input->>'startDate')::date
          );
          -- M3-20: a deleted occurrence is skipped only under the rule it was
          -- deleted from. The rule is being rewritten from here, and the sweep
          -- below already discards every cancelled and edited occurrence in
          -- the same range, so the owner's skips there go with them.
          update public.rolling_plan_series set
            skipped_occurrence_dates = array(
              select skipped from pg_catalog.unnest(skipped_occurrence_dates) as skipped
              where skipped < v_sweep_from order by skipped
            )
          where id = v_series_id and user_id = v_user_id;
          v_after := public.rolling_plan_series_state(v_user_id, v_series_id);
        end if;
      end if;
    else
      if not (v_change ? 'sessionId')
        or pg_catalog.jsonb_typeof(v_change->'sessionId') <> 'string'
      then raise exception using errcode = '22023', message = 'Invalid rolling plan change.'; end if;
      begin v_session_id := (v_change->>'sessionId')::uuid;
      exception when others then
        raise exception using errcode = '22023', message = 'Invalid rolling plan change.';
      end;

      if v_operation = 'add' then
        if v_change - array['operation', 'sessionId', 'session'] <> '{}'::jsonb
          or not (v_change ? 'session')
          or not public.rolling_plan_session_input_is_valid(v_change->'session', true)
          or exists (select 1 from public.rolling_plan_sessions where id = v_session_id)
        then raise exception using errcode = '22023', message = 'Invalid rolling plan addition.'; end if;
        v_session_input := v_change->'session';
        v_local_date := (v_session_input->>'localDate')::date;
        if v_local_date < v_today then
          raise exception using errcode = 'PT422',
            message = 'A plan change cannot target a date before today.';
        end if;
        v_occurrence_series_id := (v_session_input->>'seriesId')::uuid;
        if v_occurrence_series_id is not null and not exists (
          select 1 from public.rolling_plan_series
          where id = v_occurrence_series_id and user_id = v_user_id
        ) then
          raise exception using errcode = '22023', message = 'Invalid rolling plan addition.';
        end if;
        v_session_dates := v_session_dates || v_local_date;
        insert into public.rolling_plan_sessions (
          id, user_id, plan_id, local_date, position, title, sport, intent,
          expected_duration_minutes, note, is_locked, status, series_id,
          occurrence_date, has_diverged, created_at, updated_at
        ) values (
          v_session_id, v_user_id, v_plan.id,
          v_local_date,
          (v_session_input->>'position')::smallint,
          pg_catalog.btrim(v_session_input->>'title'),
          pg_catalog.btrim(v_session_input->>'sport'),
          nullif(v_session_input->>'intent', ''),
          (v_session_input->>'expectedDurationMinutes')::integer,
          nullif(v_session_input->>'note', ''),
          (v_session_input->>'isLocked')::boolean,
          'active', v_occurrence_series_id,
          (v_session_input->>'occurrenceDate')::date,
          false, v_now, v_now
        );
      elsif v_operation = 'delete' then
        -- M3-19: the one owner-driven hard delete of a planned session.
        --
        -- A cancelled row is admitted as well as an active one, because a
        -- session the owner already cancelled is exactly what they may next
        -- want gone. A lock is deliberately not consulted: F-005's amendment
        -- of 19 August 2026 settles that a lock stops a sweep taking a session
        -- along with others, not the owner's own deliberate individual act.
        -- The past boundary still holds, as it does for every other operation.
        if v_change - array['operation', 'sessionId'] <> '{}'::jsonb then
          raise exception using errcode = '22023', message = 'Invalid rolling plan deletion.';
        end if;
        select session.local_date, session.series_id, session.occurrence_date
        into v_local_date, v_occurrence_series_id, v_occurrence_date
        from public.rolling_plan_sessions session
        where session.id = v_session_id and session.user_id = v_user_id
          and session.status in ('active', 'cancelled')
        for update;
        if not found then raise exception using errcode = '22023', message = 'Invalid rolling plan change.'; end if;
        if v_local_date < v_today then
          raise exception using errcode = 'PT422',
            message = 'A plan change cannot target a date before today.';
        end if;
        -- The record of what happened outlives the plan entry it was measured
        -- against, which is the same reasoning that made `planned_snapshot`
        -- write-once. `completions_plan_fkey` would refuse the delete anyway;
        -- raising here is what turns a raw foreign-key violation into an
        -- owner-visible refusal. The row lock above is stronger than the key
        -- share a concurrent completion insert takes, so this cannot be raced.
        if exists (
          select 1 from public.completions completion
          where completion.user_id = v_user_id
            and completion.plan_session_id = v_session_id
        ) then
          raise exception using errcode = 'PT425',
            message = 'This session has training logged against it, so its plan entry cannot be changed.';
        end if;
        v_session_dates := v_session_dates || v_local_date;
        v_before := public.rolling_plan_session_state(v_user_id, v_session_id);
        delete from public.rolling_plan_sessions
        where id = v_session_id and user_id = v_user_id;
        -- M3-20: without this the materializer finds the rule date empty and
        -- writes the occurrence straight back. The rule date is recorded, not
        -- the local date, because a moved occurrence is still the series'
        -- answer to its rule date. Dates behind today can never be filled
        -- again, so they are dropped here rather than kept forever.
        if v_occurrence_series_id is not null and v_occurrence_date >= v_today then
          update public.rolling_plan_series set
            skipped_occurrence_dates = array(
              select skipped from pg_catalog.unnest(
                skipped_occurrence_dates || v_occurrence_date
              ) as skipped
              where skipped >= v_today
              group by skipped order by skipped
            )
          where id = v_occurrence_series_id and user_id = v_user_id;
        end if;
        -- Exactly the entry `rolling_plan_sweep_series_occurrences` already
        -- writes for a removed occurrence: a dated `delete` naming no session,
        -- which is what survives `rolling_plan_change_entries_session_fkey`
        -- cascading this row's own earlier entries away.
        v_after := pg_catalog.jsonb_build_object(
          'localDate', v_local_date::text, 'deleted', true
        );
      elsif v_operation = 'reactivate' then
        -- M3-20: the one operation that admits only a cancelled session. Like
        -- delete it is the owner's individual act, so the lock is not
        -- consulted; the past boundary holds, because an active planned
        -- session in the past is something no operation may create. A session
        -- trained after it was cancelled is logged against the cancelled row,
        -- whose completion snapshot then records both facts.
        if v_change - array['operation', 'sessionId'] <> '{}'::jsonb then
          raise exception using errcode = '22023', message = 'Invalid rolling plan reactivation.';
        end if;
        select session.local_date into v_local_date
        from public.rolling_plan_sessions session
        where session.id = v_session_id and session.user_id = v_user_id
          and session.status = 'cancelled'
        for update;
        if not found then raise exception using errcode = '22023', message = 'Invalid rolling plan change.'; end if;
        if v_local_date < v_today then
          raise exception using errcode = 'PT422',
            message = 'A plan change cannot target a date before today.';
        end if;
        -- Logged session: a cancelled session that was trained anyway keeps
        -- the state its log was written against.
        if exists (
          select 1 from public.completions completion
          where completion.user_id = v_user_id
            and completion.plan_session_id = v_session_id
        ) then
          raise exception using errcode = 'PT425',
            message = 'This session has training logged against it, so its plan entry cannot be changed.';
        end if;
        v_session_dates := v_session_dates || v_local_date;
        v_before := public.rolling_plan_session_state(v_user_id, v_session_id);
        -- Cancelling freed the session's place in the day, and another session
        -- may hold it now. It returns after the last active one; a day that is
        -- already full is refused by the cap below, not here.
        select coalesce(pg_catalog.max(session.position), -1) + 1 into v_position
        from public.rolling_plan_sessions session
        where session.user_id = v_user_id and session.local_date = v_local_date
          and session.status = 'active';
        if v_position > 99 then
          select pg_catalog.min(candidate) into v_position
          from pg_catalog.generate_series(0, 99) as candidate
          where not exists (
            select 1 from public.rolling_plan_sessions session
            where session.user_id = v_user_id and session.local_date = v_local_date
              and session.status = 'active' and session.position = candidate
          );
        end if;
        update public.rolling_plan_sessions set
          status = 'active', cancelled_at = null,
          position = v_position::smallint, updated_at = v_now
        where id = v_session_id and user_id = v_user_id;
        -- Cancellation reason: a reactivated session is no longer cancelled,
        -- so why it was is no longer true of it (owner, 29 Sep 2026).
        delete from public.rolling_plan_session_cancellations
        where session_id = v_session_id and user_id = v_user_id;
      elsif v_operation in ('edit', 'move', 'set_lock', 'cancel') then
        select session.local_date into v_local_date
        from public.rolling_plan_sessions session
        where session.id = v_session_id and session.user_id = v_user_id
          and session.status = 'active'
        for update;
        if not found then raise exception using errcode = '22023', message = 'Invalid rolling plan change.'; end if;
        -- A past session is history. The owner's own lock never blocks them,
        -- but the past boundary does.
        if v_local_date < v_today then
          raise exception using errcode = 'PT422',
            message = 'A plan change cannot target a date before today.';
        end if;
        -- Logged session: what a log was measured against is settled, for
        -- the lock as much as for the content, because the page that offers
        -- none of these is the rule being enforced. Behind the row lock
        -- above, as Delete's check is, so a concurrent log cannot slip past.
        if exists (
          select 1 from public.completions completion
          where completion.user_id = v_user_id
            and completion.plan_session_id = v_session_id
        ) then
          raise exception using errcode = 'PT425',
            message = 'This session has training logged against it, so its plan entry cannot be changed.';
        end if;
        v_session_dates := v_session_dates || v_local_date;
        v_before := public.rolling_plan_session_state(v_user_id, v_session_id);

        if v_operation = 'edit' then
          if v_change - array['operation', 'sessionId', 'session'] <> '{}'::jsonb
            or not (v_change ? 'session')
            or not public.rolling_plan_session_input_is_valid(v_change->'session', false)
          then raise exception using errcode = '22023', message = 'Invalid rolling plan edit.'; end if;
          v_session_input := v_change->'session';
          update public.rolling_plan_sessions set
            title = pg_catalog.btrim(v_session_input->>'title'),
            sport = pg_catalog.btrim(v_session_input->>'sport'),
            intent = nullif(v_session_input->>'intent', ''),
            expected_duration_minutes = (v_session_input->>'expectedDurationMinutes')::integer,
            note = nullif(v_session_input->>'note', ''),
            updated_at = v_now
          where id = v_session_id and user_id = v_user_id;
          delete from public.rolling_plan_activities
          where session_id = v_session_id and user_id = v_user_id;
        elsif v_operation = 'move' then
          if v_change - array['operation', 'sessionId', 'localDate', 'position'] <> '{}'::jsonb
            or not (v_change ?& array['localDate', 'position'])
            or pg_catalog.jsonb_typeof(v_change->'localDate') <> 'string'
            or (v_change->>'localDate')::date::text <> v_change->>'localDate'
            or pg_catalog.jsonb_typeof(v_change->'position') <> 'number'
          then raise exception using errcode = '22023', message = 'Invalid rolling plan move.'; end if;
          v_position := (v_change->>'position')::numeric;
          if v_position <> trunc(v_position) or v_position not between 0 and 99 then
            raise exception using errcode = '22023', message = 'Invalid rolling plan move.';
          end if;
          v_target_date := (v_change->>'localDate')::date;
          if v_target_date < v_today then
            raise exception using errcode = 'PT422',
              message = 'A plan change cannot target a date before today.';
          end if;
          v_session_dates := v_session_dates || v_target_date;
          update public.rolling_plan_sessions set
            local_date = v_target_date,
            position = v_position::smallint, updated_at = v_now
          where id = v_session_id and user_id = v_user_id;
        elsif v_operation = 'set_lock' then
          if v_change - array['operation', 'sessionId', 'isLocked'] <> '{}'::jsonb
            or pg_catalog.jsonb_typeof(v_change->'isLocked') <> 'boolean'
          then raise exception using errcode = '22023', message = 'Invalid rolling plan lock change.'; end if;
          update public.rolling_plan_sessions set
            is_locked = (v_change->>'isLocked')::boolean, updated_at = v_now
          where id = v_session_id and user_id = v_user_id;
        elsif v_operation = 'cancel' then
          -- Cancellation reason: `reason` is optional, and a cancel without
          -- one is exactly the cancel it always was.
          if v_change - array['operation', 'sessionId', 'reason'] <> '{}'::jsonb
            or (
              v_change ? 'reason'
              and pg_catalog.jsonb_typeof(v_change->'reason') <> 'null'
              and not public.rolling_plan_cancellation_reason_is_valid(v_change->'reason')
            )
          then
            raise exception using errcode = '22023', message = 'Invalid rolling plan cancellation.';
          end if;
          update public.rolling_plan_sessions set
            status = 'cancelled', cancelled_at = v_now, updated_at = v_now
          where id = v_session_id and user_id = v_user_id;
          v_cancel_reason := pg_catalog.btrim(v_change->>'reason', E' \t\r\n');
          if v_cancel_reason is not null then
            insert into public.rolling_plan_session_cancellations (
              session_id, user_id, reason, created_at, updated_at
            ) values (v_session_id, v_user_id, v_cancel_reason, v_now, v_now);
          end if;
        else
          -- M3-19: cancel used to be this chain's fallthrough. Now that one of
          -- the operations beside it destroys a row, an unrecognized operation
          -- has to land nowhere rather than in whichever branch happens to be
          -- written last.
          raise exception using errcode = '22023', message = 'Invalid rolling plan change.';
        end if;

        -- ADR-017, as amended 22 September 2026: an occurrence is diverged
        -- when its content no longer reads as its rule's, which only an edit
        -- does. A move, a lock and a cancel leave what it says alone, so they
        -- leave the flag alone. The materializer never revisits an existing
        -- occurrence either way.
        if v_operation = 'edit' then
          update public.rolling_plan_sessions set has_diverged = true
          where id = v_session_id and user_id = v_user_id
            and series_id is not null and not has_diverged;
        end if;
      else
        raise exception using errcode = '22023', message = 'Invalid rolling plan change.';
      end if;

      if v_operation in ('add', 'edit') then
        for v_activity in
          select value from pg_catalog.jsonb_array_elements(v_session_input->'activities')
        loop
          if v_activity ? 'personalActivityId'
            and pg_catalog.jsonb_typeof(v_activity->'personalActivityId') <> 'null'
            and not exists (
              select 1 from public.personal_activities
              where id = (v_activity->>'personalActivityId')::uuid and user_id = v_user_id
            )
          then raise exception using errcode = '22023', message = 'Invalid rolling plan activity.'; end if;
          insert into public.rolling_plan_activities (
            user_id, plan_id, session_id, personal_activity_id, position,
            name, sport, instructions, measurement_mode, target, is_locked,
            created_at, updated_at
          ) values (
            v_user_id, v_plan.id, v_session_id,
            (v_activity->>'personalActivityId')::uuid,
            (v_activity->>'position')::smallint,
            pg_catalog.btrim(v_activity->>'name'),
            pg_catalog.btrim(v_activity->>'sport'),
            nullif(v_activity->>'instructions', ''),
            v_activity->>'measurementMode', v_activity->'target',
            (v_activity->>'isLocked')::boolean, v_now, v_now
          );
        end loop;
      end if;

      if v_operation <> 'delete' then
        v_after := public.rolling_plan_session_state(v_user_id, v_session_id);
      end if;
    end if;

    if v_before is not null and v_before = v_after then
      raise exception using errcode = '22023', message = 'A plan change must change current state.';
    end if;
    insert into public.rolling_plan_change_entries (
      user_id, plan_id, change_set_id, session_id, series_id, local_date,
      ordinal, change_kind, before_state, after_state, created_at
    ) values (
      v_user_id, v_plan.id, v_change_set_id,
      case when v_operation in ('add', 'edit', 'move', 'set_lock', 'cancel', 'reactivate')
        then v_session_id else null end,
      case when v_operation = 'add_series' then v_series_id
        when v_operation = 'end_series' then v_series_id
        when v_operation = 'edit_series'
          then coalesce(v_successor_series_id, v_series_id)
        else null end,
      case when v_operation in ('set_recovery_day', 'delete') then v_local_date
        else null end,
      v_ordinal, v_operation, v_before, v_after, v_now
    );
    v_ordinal := v_ordinal + 1;

    if v_sweep_from is not null then
      v_sweep := public.rolling_plan_sweep_series_occurrences(
        v_user_id, v_plan.id, v_change_set_id, v_series_id,
        v_sweep_from, v_today, v_ordinal, v_now
      );
      v_ordinal := (v_sweep->>'nextOrdinal')::integer;
      v_series_effects := v_series_effects || pg_catalog.jsonb_build_object(
        'seriesId', v_series_id,
        'operation', v_operation,
        'deleted', v_sweep->'deleted',
        'divergedDeleted', v_sweep->'divergedDeleted',
        'lockedKept', v_sweep->'lockedKept',
        'completedKept', v_sweep->'completedKept'
      );
    end if;
  end loop;

  set constraints public.rolling_plan_sessions_active_order_key immediate;

  -- The cap is judged on the state the whole change set leaves behind, not on
  -- any one subchange, so a swap that stays within ten never trips it.
  if exists (
    select 1 from public.rolling_plan_sessions session
    where session.user_id = v_user_id and session.status = 'active'
      and session.local_date = any(v_session_dates)
    group by session.local_date
    having pg_catalog.count(*) > 10
  ) then
    raise exception using errcode = 'PT423',
      message = 'A date holds at most ten planned sessions.';
  end if;

  update public.rolling_plans set revision = v_new_revision, updated_at = v_now
  where id = v_plan.id and user_id = v_user_id;
  return (
    v_plan.id, v_new_revision, v_change_set_id, 'applied',
    case when pg_catalog.jsonb_array_length(v_series_effects) = 0
      then null else v_series_effects end
  )::public.rolling_plan_change_receipt;
exception
  when unique_violation or foreign_key_violation or check_violation or invalid_datetime_format then
    raise exception using errcode = '22023', message = 'Invalid rolling plan change set.';
end;
$$;

revoke all privileges on function public.apply_rolling_plan_change_set(bigint, uuid, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.apply_rolling_plan_change_set(bigint, uuid, text, jsonb)
  to authenticated;

-- 2. Asking the coach to fill a session ---------------------------------------

create or replace function public.begin_session_activity_generation(
  p_idempotency_key text,
  p_request_fingerprint text,
  p_session_id uuid,
  p_expected_plan_revision bigint,
  p_note text default null
)
returns public.plan_generation_receipt
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_existing public.session_activity_requests;
  v_session public.rolling_plan_sessions;
  v_note text;
  v_receipt public.plan_generation_receipt;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'An authenticated FitTip user is required.';
  end if;

  if not exists (select 1 from public.profiles where user_id = v_user_id) then
    raise exception using
      errcode = '23503',
      message = 'A FitTip profile is required.';
  end if;

  if p_idempotency_key is null
    or pg_catalog.char_length(p_idempotency_key) not between 16 and 128
    or p_request_fingerprint is null
    or pg_catalog.char_length(p_request_fingerprint) not between 16 and 256
    or p_session_id is null
    or p_expected_plan_revision is null
    or p_expected_plan_revision < 0
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid session activity request.';
  end if;

  v_note := public.roadmap_normalize_owner_text(p_note);
  if v_note = '' then v_note := null; end if;
  if v_note is not null and pg_catalog.char_length(v_note) > 500 then
    raise exception using
      errcode = '22023',
      message = 'Invalid session activity request.';
  end if;

  -- Replay first, so a repeated request for a session that has since been
  -- deleted or passed still answers with what it already did.
  select * into v_existing
  from public.session_activity_requests
  where user_id = v_user_id and idempotency_key = p_idempotency_key;

  if found then
    if v_existing.request_fingerprint is distinct from p_request_fingerprint then
      raise exception using
        errcode = 'PT409',
        message = 'That coaching request changed. Reload and try again.';
    end if;
    return (
      v_existing.id,
      v_existing.completion_token,
      v_existing.status,
      v_existing.proposal_id
    )::public.plan_generation_receipt;
  end if;

  select * into v_session
  from public.rolling_plan_sessions
  where id = p_session_id and user_id = v_user_id;

  -- Another owner's session and no session at all are the same answer.
  if not found or v_session.status <> 'active' then
    raise exception using
      errcode = 'PT409',
      message = 'That session is no longer available.';
  end if;

  -- Logged session: its activities can no longer be saved, so the coach is
  -- not asked. The same answer as a session that is gone, because for
  -- planning it is. No row lock is taken here, so a log written in the
  -- same moment can still let one request through; its suggestion is then
  -- refused at Save by the rule above.
  if exists (
    select 1 from public.completions completion
    where completion.user_id = v_user_id
      and completion.plan_session_id = v_session.id
  ) then
    raise exception using
      errcode = 'PT409',
      message = 'That session is no longer available.';
  end if;

  if v_session.local_date < (v_now at time zone 'utc')::date - 1 then
    raise exception using
      errcode = 'PT422',
      message = 'That session is already in the past.';
  end if;

  perform pg_catalog.set_config('lock_timeout', '3s', true);
  begin
    perform pg_catalog.pg_advisory_xact_lock(
      62009,
      pg_catalog.hashtext(v_user_id::text)
    );
  exception
    when lock_not_available then
      raise exception using
        errcode = 'PT409',
        message = 'Your plan changed. Reload and try again.';
  end;

  begin
    insert into public.session_activity_requests (
      user_id, idempotency_key, request_fingerprint, session_id, local_date,
      expected_plan_revision, note_hash, created_at, updated_at
    ) values (
      v_user_id, p_idempotency_key, p_request_fingerprint, v_session.id,
      v_session.local_date, p_expected_plan_revision,
      public.roadmap_owner_text_hash(v_note), v_now, v_now
    )
    returning id, completion_token, 'claimed', proposal_id into v_receipt;
  exception
    when unique_violation then
      -- The race loser: answered exactly as a sequential replay would be.
      select * into v_existing
      from public.session_activity_requests
      where user_id = v_user_id and idempotency_key = p_idempotency_key;
      if not found then
        raise exception using
          errcode = 'PT409',
          message = 'Your plan changed. Reload and try again.';
      end if;
      if v_existing.request_fingerprint is distinct from p_request_fingerprint then
        raise exception using
          errcode = 'PT409',
          message = 'That coaching request changed. Reload and try again.';
      end if;
      return (
        v_existing.id,
        v_existing.completion_token,
        v_existing.status,
        v_existing.proposal_id
      )::public.plan_generation_receipt;
  end;

  return v_receipt;
end;
$$;

revoke all privileges on function public.begin_session_activity_generation(
  text, text, uuid, bigint, text
) from public, anon, authenticated, service_role;
grant execute on function public.begin_session_activity_generation(
  text, text, uuid, bigint, text
) to authenticated;
