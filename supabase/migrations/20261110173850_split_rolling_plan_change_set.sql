-- The plan's change function, split by operation (owner, 10 Nov 2026).
--
-- `apply_rolling_plan_change_set` had grown to 723 lines, and every migration
-- that changed one operation restated all ten. It now keeps only what the
-- change set as a whole owns: the owner and their zone, the request
-- fingerprint, the owner lock, idempotent replay, the plan revision, the change
-- log entry, the series sweep, the ten-a-day cap, the receipt and the mapping of
-- constraint errors. Each operation is a helper in `private`, which the API does
-- not publish, and returns a `private.plan_change_outcome` saying what the
-- dispatcher writes to the log and sweeps.
--
-- No behaviour changes. Each helper holds its operation's code as it stood in
-- 20261028141230_session_coach_note.sql, checks in the same order, so every
-- refusal keeps its code and its message. The checks that were written out
-- several times are now one helper each: a date before today, the locked and
-- unlogged session, the locked series, inserting a series, inserting a
-- session's activities.
--
-- The helpers are invoker functions. They run only inside the dispatcher, which
-- is a definer function owned by `postgres`, and no other role may call them.
-- Same signature for the dispatcher, so its grant is unchanged.

-- 1. What an operation hands back ---------------------------------------------

create type private.plan_change_outcome as (
  -- The change log entry's own columns. Each operation names what it is about.
  entry_session_id uuid,
  entry_series_id uuid,
  entry_local_date date,
  before_state jsonb,
  after_state jsonb,
  -- Dates whose active sessions the ten-a-day cap must judge at the end.
  cap_dates date[],
  -- Set when the operation leaves a series' occurrences stale from a date.
  sweep_series_id uuid,
  sweep_from date
);

-- 2. Shared checks and writes -------------------------------------------------

create function private.plan_change_refuse_past(p_date date, p_today date)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_date < p_today then
    raise exception using errcode = 'PT422',
      message = 'A plan change cannot target a date before today.';
  end if;
end;
$$;

-- The owner's session in one of the given states, locked, not in the past, and
-- with no log against it. Delete, reactivate, edit, move and cancel all begin
-- here.
create function private.plan_change_lock_session(
  p_user_id uuid,
  p_session_id uuid,
  p_statuses text[],
  p_today date
)
returns public.rolling_plan_sessions
language plpgsql
set search_path = ''
as $$
declare
  v_session public.rolling_plan_sessions;
begin
  select * into v_session
  from public.rolling_plan_sessions session
  where session.id = p_session_id and session.user_id = p_user_id
    and session.status = any(p_statuses)
  for update;
  if not found then
    raise exception using errcode = '22023', message = 'Invalid rolling plan change.';
  end if;
  -- A past session is history: the past boundary blocks the owner.
  perform private.plan_change_refuse_past(v_session.local_date, p_today);
  -- Logged session: what a log was measured against is settled, and the record
  -- of what happened outlives the plan entry it was measured against.
  -- `completions_plan_fkey` would refuse a delete anyway; raising here turns a
  -- raw foreign-key violation into an owner-visible refusal. The row lock above
  -- is stronger than the key share a concurrent completion insert takes, so a
  -- log being written is waited for and this cannot be raced.
  if exists (
    select 1 from public.completions completion
    where completion.user_id = p_user_id
      and completion.plan_session_id = p_session_id
  ) then
    raise exception using errcode = 'PT425',
      message = 'This session has training logged against it, so its plan entry cannot be changed.';
  end if;
  return v_session;
end;
$$;

create function private.plan_change_lock_series(p_user_id uuid, p_series_id uuid)
returns public.rolling_plan_series
language plpgsql
set search_path = ''
as $$
declare
  v_series public.rolling_plan_series;
begin
  select * into v_series from public.rolling_plan_series
  where id = p_series_id and user_id = p_user_id for update;
  if not found then
    raise exception using errcode = '22023', message = 'Invalid rolling plan series change.';
  end if;
  return v_series;
end;
$$;

-- A new series segment and its activity template, from an input already
-- validated by `rolling_plan_series_input_is_valid`.
create function private.plan_change_insert_series(
  p_user_id uuid,
  p_plan_id uuid,
  p_series_id uuid,
  p_predecessor_series_id uuid,
  p_start_date date,
  p_input jsonb,
  p_now timestamptz
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into public.rolling_plan_series (
    id, user_id, plan_id, predecessor_series_id, frequency, interval_count,
    weekdays, start_date, end_date, title, sport, intent,
    expected_duration_minutes, start_time, note, coach_note, created_at,
    updated_at
  ) values (
    p_series_id, p_user_id, p_plan_id, p_predecessor_series_id,
    p_input->>'frequency',
    (p_input->>'intervalCount')::smallint,
    public.rolling_plan_weekday_set(p_input->'weekdays'),
    p_start_date,
    (p_input->>'endDate')::date,
    pg_catalog.btrim(p_input->>'title'),
    pg_catalog.btrim(p_input->>'sport'),
    nullif(p_input->>'intent', ''),
    (p_input->>'expectedDurationMinutes')::integer,
    (p_input->>'startTime')::time,
    nullif(p_input->>'note', ''),
    nullif(p_input->>'coachNote', ''),
    p_now, p_now
  );
  perform public.rolling_plan_replace_series_activities(
    p_user_id, p_series_id, p_input->'activities', p_now
  );
end;
$$;

-- A session's activities, from a session input already validated by
-- `rolling_plan_session_input_is_valid`. A library link must be the owner's own.
create function private.plan_change_insert_activities(
  p_user_id uuid,
  p_plan_id uuid,
  p_session_id uuid,
  p_activities jsonb,
  p_now timestamptz
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_activity jsonb;
begin
  for v_activity in
    select value from pg_catalog.jsonb_array_elements(p_activities)
  loop
    if v_activity ? 'personalActivityId'
      and pg_catalog.jsonb_typeof(v_activity->'personalActivityId') <> 'null'
      and not exists (
        select 1 from public.personal_activities
        where id = (v_activity->>'personalActivityId')::uuid and user_id = p_user_id
      )
    then raise exception using errcode = '22023', message = 'Invalid rolling plan activity.'; end if;
    insert into public.rolling_plan_activities (
      user_id, plan_id, session_id, personal_activity_id, position,
      name, sport, instructions, rationale, measurement_mode, target,
      created_at, updated_at
    ) values (
      p_user_id, p_plan_id, p_session_id,
      (v_activity->>'personalActivityId')::uuid,
      (v_activity->>'position')::smallint,
      pg_catalog.btrim(v_activity->>'name'),
      pg_catalog.btrim(v_activity->>'sport'),
      nullif(v_activity->>'instructions', ''),
      nullif(v_activity->>'rationale', ''),
      v_activity->>'measurementMode', v_activity->'target',
      p_now, p_now
    );
  end loop;
end;
$$;

-- 3. Recovery days ------------------------------------------------------------

create function private.plan_change_set_recovery_day(
  p_user_id uuid,
  p_plan_id uuid,
  p_today date,
  p_now timestamptz,
  p_change jsonb
)
returns private.plan_change_outcome
language plpgsql
set search_path = ''
as $$
declare
  v_outcome private.plan_change_outcome;
  v_local_date date;
begin
  if p_change - array['operation', 'localDate', 'isRecoveryDay'] <> '{}'::jsonb
    or not (p_change ?& array['localDate', 'isRecoveryDay'])
    or pg_catalog.jsonb_typeof(p_change->'localDate') <> 'string'
    or (p_change->>'localDate')::date::text <> p_change->>'localDate'
    or pg_catalog.jsonb_typeof(p_change->'isRecoveryDay') <> 'boolean'
  then raise exception using errcode = '22023', message = 'Invalid rolling plan recovery day.'; end if;
  v_local_date := (p_change->>'localDate')::date;
  perform private.plan_change_refuse_past(v_local_date, p_today);

  -- A label is not a session, so it never counts toward the per-date cap.
  v_outcome.before_state := pg_catalog.jsonb_build_object(
    'localDate', v_local_date::text,
    'isRecoveryDay', exists (
      select 1 from public.rolling_plan_recovery_days recovery
      where recovery.user_id = p_user_id and recovery.local_date = v_local_date
    )
  );
  if (p_change->>'isRecoveryDay')::boolean then
    insert into public.rolling_plan_recovery_days (
      user_id, plan_id, local_date, created_at
    ) values (p_user_id, p_plan_id, v_local_date, p_now)
    on conflict (user_id, local_date) do nothing;
  else
    delete from public.rolling_plan_recovery_days recovery
    where recovery.user_id = p_user_id and recovery.local_date = v_local_date;
  end if;
  v_outcome.after_state := pg_catalog.jsonb_build_object(
    'localDate', v_local_date::text,
    'isRecoveryDay', (p_change->>'isRecoveryDay')::boolean
  );
  v_outcome.entry_local_date := v_local_date;
  return v_outcome;
end;
$$;

-- 4. Series -------------------------------------------------------------------

create function private.plan_change_add_series(
  p_user_id uuid,
  p_plan_id uuid,
  p_today date,
  p_now timestamptz,
  p_change jsonb,
  p_series_id uuid
)
returns private.plan_change_outcome
language plpgsql
set search_path = ''
as $$
declare
  v_outcome private.plan_change_outcome;
  v_input jsonb;
begin
  if p_change - array['operation', 'seriesId', 'series'] <> '{}'::jsonb
    or not (p_change ? 'series')
    or not public.rolling_plan_series_input_is_valid(p_change->'series')
    or exists (select 1 from public.rolling_plan_series where id = p_series_id)
  then raise exception using errcode = '22023', message = 'Invalid rolling plan series.'; end if;
  v_input := p_change->'series';
  perform private.plan_change_refuse_past((v_input->>'startDate')::date, p_today);
  perform private.plan_change_insert_series(
    p_user_id, p_plan_id, p_series_id, null,
    (v_input->>'startDate')::date, v_input, p_now
  );
  v_outcome.after_state := public.rolling_plan_series_state(p_user_id, p_series_id);
  v_outcome.entry_series_id := p_series_id;
  return v_outcome;
end;
$$;

create function private.plan_change_end_series(
  p_user_id uuid,
  p_today date,
  p_now timestamptz,
  p_change jsonb,
  p_series_id uuid
)
returns private.plan_change_outcome
language plpgsql
set search_path = ''
as $$
declare
  v_outcome private.plan_change_outcome;
  v_effective_date date;
begin
  perform private.plan_change_lock_series(p_user_id, p_series_id);
  v_outcome.before_state := public.rolling_plan_series_state(p_user_id, p_series_id);
  if p_change - array['operation', 'seriesId', 'effectiveDate'] <> '{}'::jsonb
    or not (p_change ? 'effectiveDate')
    or pg_catalog.jsonb_typeof(p_change->'effectiveDate') <> 'string'
    or (p_change->>'effectiveDate')::date::text <> p_change->>'effectiveDate'
  then raise exception using errcode = '22023', message = 'Invalid rolling plan series change.'; end if;
  v_effective_date := (p_change->>'effectiveDate')::date;
  perform private.plan_change_refuse_past(v_effective_date, p_today);
  -- Ending a segment never lengthens it. A segment that already ends earlier
  -- keeps its own end date, because the sweep only runs from the effective date
  -- forward and so could never remove the occurrences a pushed-out end date
  -- would let the next materialization write into the reopened gap.
  update public.rolling_plan_series set
    end_date = least(
      coalesce(end_date, 'infinity'::date), v_effective_date - 1
    ),
    updated_at = p_now
  where id = p_series_id and user_id = p_user_id;
  v_outcome.after_state := public.rolling_plan_series_state(p_user_id, p_series_id);
  v_outcome.entry_series_id := p_series_id;
  v_outcome.sweep_series_id := p_series_id;
  v_outcome.sweep_from := v_effective_date;
  return v_outcome;
end;
$$;

-- This and future: close the running segment and open a successor that points
-- back at it. Occurrences before the split date are never touched, so what they
-- meant is preserved. The sweep runs on the closed segment; the log entry is
-- the successor's.
create function private.plan_change_split_series(
  p_user_id uuid,
  p_plan_id uuid,
  p_today date,
  p_now timestamptz,
  p_change jsonb,
  p_series_id uuid
)
returns private.plan_change_outcome
language plpgsql
set search_path = ''
as $$
declare
  v_outcome private.plan_change_outcome;
  v_series public.rolling_plan_series;
  v_input jsonb;
  v_effective_date date;
  v_successor_series_id uuid;
begin
  v_series := private.plan_change_lock_series(p_user_id, p_series_id);
  v_outcome.before_state := public.rolling_plan_series_state(p_user_id, p_series_id);
  if p_change - array[
    'operation', 'seriesId', 'effectiveDate', 'successorSeriesId', 'series'
  ] <> '{}'::jsonb
    or not (p_change ?& array['successorSeriesId', 'series'])
    or pg_catalog.jsonb_typeof(p_change->'effectiveDate') <> 'string'
    or (p_change->>'effectiveDate')::date::text <> p_change->>'effectiveDate'
    or pg_catalog.jsonb_typeof(p_change->'successorSeriesId') <> 'string'
    or not public.rolling_plan_series_input_is_valid(p_change->'series')
  then raise exception using errcode = '22023', message = 'Invalid rolling plan series change.'; end if;
  v_input := p_change->'series';
  v_effective_date := (p_change->>'effectiveDate')::date;
  begin v_successor_series_id := (p_change->>'successorSeriesId')::uuid;
  exception when others then
    raise exception using errcode = '22023', message = 'Invalid rolling plan series change.';
  end;
  perform private.plan_change_refuse_past(v_effective_date, p_today);
  -- The successor starts on the split date and the predecessor keeps at least
  -- its own first day, so a split is never a whole-series edit wearing a
  -- different name.
  if v_effective_date <= v_series.start_date
    or (v_input->>'startDate')::date <> v_effective_date
    or exists (select 1 from public.rolling_plan_series where id = v_successor_series_id)
  then raise exception using errcode = '22023', message = 'Invalid rolling plan series change.'; end if;
  -- Closing the predecessor never lengthens it either; the clamp is the one
  -- `end_series` applies, for the same reason.
  update public.rolling_plan_series set
    end_date = least(
      coalesce(end_date, 'infinity'::date), v_effective_date - 1
    ),
    updated_at = p_now
  where id = p_series_id and user_id = p_user_id
  returning end_date into v_series.end_date;
  perform private.plan_change_insert_series(
    p_user_id, p_plan_id, v_successor_series_id, p_series_id,
    v_effective_date, v_input, p_now
  );
  v_outcome.after_state := public.rolling_plan_series_state(p_user_id, v_successor_series_id)
    || pg_catalog.jsonb_build_object(
      'predecessorSeriesId', p_series_id,
      'predecessorEndDate', v_series.end_date::text
    );
  v_outcome.entry_series_id := v_successor_series_id;
  v_outcome.sweep_series_id := p_series_id;
  v_outcome.sweep_from := v_effective_date;
  return v_outcome;
end;
$$;

-- A whole-series edit rewrites what every occurrence of the segment means, so
-- it is only offered while the segment has not started.
create function private.plan_change_edit_series(
  p_user_id uuid,
  p_today date,
  p_now timestamptz,
  p_change jsonb,
  p_series_id uuid
)
returns private.plan_change_outcome
language plpgsql
set search_path = ''
as $$
declare
  v_outcome private.plan_change_outcome;
  v_series public.rolling_plan_series;
  v_input jsonb;
  v_sweep_from date;
begin
  v_series := private.plan_change_lock_series(p_user_id, p_series_id);
  v_outcome.before_state := public.rolling_plan_series_state(p_user_id, p_series_id);
  if p_change - array['operation', 'seriesId', 'series'] <> '{}'::jsonb
    or not (p_change ? 'series')
    or not public.rolling_plan_series_input_is_valid(p_change->'series')
  then raise exception using errcode = '22023', message = 'Invalid rolling plan series change.'; end if;
  -- No occurrence can precede the segment's own start date, so a segment that
  -- still starts today or later has had none.
  if v_series.start_date < p_today then
    raise exception using errcode = 'PT424',
      message = 'This series has already started. Change it from a date instead.';
  end if;
  v_input := p_change->'series';
  perform private.plan_change_refuse_past((v_input->>'startDate')::date, p_today);
  update public.rolling_plan_series set
    frequency = v_input->>'frequency',
    interval_count = (v_input->>'intervalCount')::smallint,
    weekdays = public.rolling_plan_weekday_set(v_input->'weekdays'),
    start_date = (v_input->>'startDate')::date,
    end_date = (v_input->>'endDate')::date,
    title = pg_catalog.btrim(v_input->>'title'),
    sport = pg_catalog.btrim(v_input->>'sport'),
    intent = nullif(v_input->>'intent', ''),
    expected_duration_minutes = (v_input->>'expectedDurationMinutes')::integer,
    start_time = (v_input->>'startTime')::time,
    note = nullif(v_input->>'note', ''),
    coach_note = nullif(v_input->>'coachNote', ''),
    updated_at = p_now
  where id = p_series_id and user_id = p_user_id;
  perform public.rolling_plan_replace_series_activities(
    p_user_id, p_series_id, v_input->'activities', p_now
  );
  -- The rule changed, so every occurrence it already produced is stale.
  v_sweep_from := least(v_series.start_date, (v_input->>'startDate')::date);
  -- M3-20: a deleted occurrence is skipped only under the rule it was deleted
  -- from. The rule is being rewritten from here, and the sweep already discards
  -- every cancelled and edited occurrence in the same range, so the owner's
  -- skips there go with them.
  update public.rolling_plan_series set
    skipped_occurrence_dates = array(
      select skipped from pg_catalog.unnest(skipped_occurrence_dates) as skipped
      where skipped < v_sweep_from order by skipped
    )
  where id = p_series_id and user_id = p_user_id;
  v_outcome.after_state := public.rolling_plan_series_state(p_user_id, p_series_id);
  v_outcome.entry_series_id := p_series_id;
  v_outcome.sweep_series_id := p_series_id;
  v_outcome.sweep_from := v_sweep_from;
  return v_outcome;
end;
$$;

-- 5. Sessions -----------------------------------------------------------------

create function private.plan_change_add(
  p_user_id uuid,
  p_plan_id uuid,
  p_today date,
  p_now timestamptz,
  p_change jsonb,
  p_session_id uuid
)
returns private.plan_change_outcome
language plpgsql
set search_path = ''
as $$
declare
  v_outcome private.plan_change_outcome;
  v_input jsonb;
  v_local_date date;
  v_series_id uuid;
begin
  if p_change - array['operation', 'sessionId', 'session'] <> '{}'::jsonb
    or not (p_change ? 'session')
    or not public.rolling_plan_session_input_is_valid(p_change->'session', true)
    or exists (select 1 from public.rolling_plan_sessions where id = p_session_id)
  then raise exception using errcode = '22023', message = 'Invalid rolling plan addition.'; end if;
  v_input := p_change->'session';
  v_local_date := (v_input->>'localDate')::date;
  perform private.plan_change_refuse_past(v_local_date, p_today);
  v_series_id := (v_input->>'seriesId')::uuid;
  if v_series_id is not null and not exists (
    select 1 from public.rolling_plan_series
    where id = v_series_id and user_id = p_user_id
  ) then
    raise exception using errcode = '22023', message = 'Invalid rolling plan addition.';
  end if;
  insert into public.rolling_plan_sessions (
    id, user_id, plan_id, local_date, position, title, sport, intent,
    expected_duration_minutes, start_time, note, coach_note, status, series_id,
    occurrence_date, has_diverged, created_at, updated_at
  ) values (
    p_session_id, p_user_id, p_plan_id,
    v_local_date,
    (v_input->>'position')::smallint,
    pg_catalog.btrim(v_input->>'title'),
    pg_catalog.btrim(v_input->>'sport'),
    nullif(v_input->>'intent', ''),
    (v_input->>'expectedDurationMinutes')::integer,
    (v_input->>'startTime')::time,
    nullif(v_input->>'note', ''),
    nullif(v_input->>'coachNote', ''),
    'active', v_series_id,
    (v_input->>'occurrenceDate')::date,
    false, p_now, p_now
  );
  perform private.plan_change_insert_activities(
    p_user_id, p_plan_id, p_session_id, v_input->'activities', p_now
  );
  v_outcome.after_state := public.rolling_plan_session_state(p_user_id, p_session_id);
  v_outcome.entry_session_id := p_session_id;
  v_outcome.cap_dates := array[v_local_date];
  return v_outcome;
end;
$$;

-- M3-19: the one owner-driven hard delete of a planned session. A cancelled row
-- is admitted as well as an active one, because a session the owner already
-- cancelled is exactly what they may next want gone.
create function private.plan_change_delete(
  p_user_id uuid,
  p_today date,
  p_change jsonb,
  p_session_id uuid
)
returns private.plan_change_outcome
language plpgsql
set search_path = ''
as $$
declare
  v_outcome private.plan_change_outcome;
  v_session public.rolling_plan_sessions;
begin
  if p_change - array['operation', 'sessionId'] <> '{}'::jsonb then
    raise exception using errcode = '22023', message = 'Invalid rolling plan deletion.';
  end if;
  v_session := private.plan_change_lock_session(
    p_user_id, p_session_id, array['active', 'cancelled'], p_today
  );
  v_outcome.before_state := public.rolling_plan_session_state(p_user_id, p_session_id);
  delete from public.rolling_plan_sessions
  where id = p_session_id and user_id = p_user_id;
  -- M3-20: without this the materializer finds the rule date empty and writes
  -- the occurrence straight back. The rule date is recorded, not the local
  -- date, because a moved occurrence is still the series' answer to its rule
  -- date. Dates behind today can never be filled again, so they are dropped
  -- here rather than kept forever.
  if v_session.series_id is not null and v_session.occurrence_date >= p_today then
    update public.rolling_plan_series set
      skipped_occurrence_dates = array(
        select skipped from pg_catalog.unnest(
          skipped_occurrence_dates || v_session.occurrence_date
        ) as skipped
        where skipped >= p_today
        group by skipped order by skipped
      )
    where id = v_session.series_id and user_id = p_user_id;
  end if;
  -- Exactly the entry `rolling_plan_sweep_series_occurrences` writes for a
  -- removed occurrence: a dated `delete` naming no session, which is what
  -- survives `rolling_plan_change_entries_session_fkey` cascading this row's
  -- own earlier entries away.
  v_outcome.after_state := pg_catalog.jsonb_build_object(
    'localDate', v_session.local_date::text, 'deleted', true
  );
  v_outcome.entry_local_date := v_session.local_date;
  v_outcome.cap_dates := array[v_session.local_date];
  return v_outcome;
end;
$$;

-- M3-20: the one operation that admits only a cancelled session. Like delete it
-- is the owner's individual act, and the past boundary holds, because an active
-- planned session in the past is something no operation may create. A session
-- trained after it was cancelled is logged against the cancelled row, and keeps
-- the state its log was written against.
create function private.plan_change_reactivate(
  p_user_id uuid,
  p_today date,
  p_now timestamptz,
  p_change jsonb,
  p_session_id uuid
)
returns private.plan_change_outcome
language plpgsql
set search_path = ''
as $$
declare
  v_outcome private.plan_change_outcome;
  v_session public.rolling_plan_sessions;
  v_position numeric;
begin
  if p_change - array['operation', 'sessionId'] <> '{}'::jsonb then
    raise exception using errcode = '22023', message = 'Invalid rolling plan reactivation.';
  end if;
  v_session := private.plan_change_lock_session(
    p_user_id, p_session_id, array['cancelled'], p_today
  );
  v_outcome.before_state := public.rolling_plan_session_state(p_user_id, p_session_id);
  -- Cancelling freed the session's place in the day, and another session may
  -- hold it now. It returns after the last active one; a day that is already
  -- full is refused by the dispatcher's cap, not here.
  select coalesce(pg_catalog.max(session.position), -1) + 1 into v_position
  from public.rolling_plan_sessions session
  where session.user_id = p_user_id and session.local_date = v_session.local_date
    and session.status = 'active';
  if v_position > 99 then
    select pg_catalog.min(candidate) into v_position
    from pg_catalog.generate_series(0, 99) as candidate
    where not exists (
      select 1 from public.rolling_plan_sessions session
      where session.user_id = p_user_id and session.local_date = v_session.local_date
        and session.status = 'active' and session.position = candidate
    );
  end if;
  update public.rolling_plan_sessions set
    status = 'active', cancelled_at = null,
    position = v_position::smallint, updated_at = p_now
  where id = p_session_id and user_id = p_user_id;
  -- Cancellation reason: a reactivated session is no longer cancelled, so why
  -- it was is no longer true of it (owner, 29 Sep 2026).
  delete from public.rolling_plan_session_cancellations
  where session_id = p_session_id and user_id = p_user_id;
  v_outcome.after_state := public.rolling_plan_session_state(p_user_id, p_session_id);
  v_outcome.entry_session_id := p_session_id;
  v_outcome.cap_dates := array[v_session.local_date];
  return v_outcome;
end;
$$;

create function private.plan_change_edit(
  p_user_id uuid,
  p_plan_id uuid,
  p_today date,
  p_now timestamptz,
  p_change jsonb,
  p_session_id uuid
)
returns private.plan_change_outcome
language plpgsql
set search_path = ''
as $$
declare
  v_outcome private.plan_change_outcome;
  v_session public.rolling_plan_sessions;
  v_input jsonb;
begin
  v_session := private.plan_change_lock_session(
    p_user_id, p_session_id, array['active'], p_today
  );
  v_outcome.before_state := public.rolling_plan_session_state(p_user_id, p_session_id);
  if p_change - array['operation', 'sessionId', 'session'] <> '{}'::jsonb
    or not (p_change ? 'session')
    or not public.rolling_plan_session_input_is_valid(p_change->'session', false)
  then raise exception using errcode = '22023', message = 'Invalid rolling plan edit.'; end if;
  v_input := p_change->'session';
  update public.rolling_plan_sessions set
    title = pg_catalog.btrim(v_input->>'title'),
    sport = pg_catalog.btrim(v_input->>'sport'),
    intent = nullif(v_input->>'intent', ''),
    expected_duration_minutes = (v_input->>'expectedDurationMinutes')::integer,
    start_time = (v_input->>'startTime')::time,
    note = nullif(v_input->>'note', ''),
    coach_note = nullif(v_input->>'coachNote', ''),
    updated_at = p_now
  where id = p_session_id and user_id = p_user_id;
  delete from public.rolling_plan_activities
  where session_id = p_session_id and user_id = p_user_id;
  -- ADR-017, as amended 22 September 2026: an occurrence is diverged when its
  -- content no longer reads as its rule's, which only an edit does. A move and
  -- a cancel leave what it says alone, so they leave the flag alone. The
  -- materializer never revisits an existing occurrence either way.
  update public.rolling_plan_sessions set has_diverged = true
  where id = p_session_id and user_id = p_user_id
    and series_id is not null and not has_diverged;
  perform private.plan_change_insert_activities(
    p_user_id, p_plan_id, p_session_id, v_input->'activities', p_now
  );
  v_outcome.after_state := public.rolling_plan_session_state(p_user_id, p_session_id);
  v_outcome.entry_session_id := p_session_id;
  v_outcome.cap_dates := array[v_session.local_date];
  return v_outcome;
end;
$$;

create function private.plan_change_move(
  p_user_id uuid,
  p_today date,
  p_now timestamptz,
  p_change jsonb,
  p_session_id uuid
)
returns private.plan_change_outcome
language plpgsql
set search_path = ''
as $$
declare
  v_outcome private.plan_change_outcome;
  v_session public.rolling_plan_sessions;
  v_position numeric;
  v_target_date date;
begin
  v_session := private.plan_change_lock_session(
    p_user_id, p_session_id, array['active'], p_today
  );
  v_outcome.before_state := public.rolling_plan_session_state(p_user_id, p_session_id);
  if p_change - array['operation', 'sessionId', 'localDate', 'position'] <> '{}'::jsonb
    or not (p_change ?& array['localDate', 'position'])
    or pg_catalog.jsonb_typeof(p_change->'localDate') <> 'string'
    or (p_change->>'localDate')::date::text <> p_change->>'localDate'
    or pg_catalog.jsonb_typeof(p_change->'position') <> 'number'
  then raise exception using errcode = '22023', message = 'Invalid rolling plan move.'; end if;
  v_position := (p_change->>'position')::numeric;
  if v_position <> trunc(v_position) or v_position not between 0 and 99 then
    raise exception using errcode = '22023', message = 'Invalid rolling plan move.';
  end if;
  v_target_date := (p_change->>'localDate')::date;
  perform private.plan_change_refuse_past(v_target_date, p_today);
  update public.rolling_plan_sessions set
    local_date = v_target_date,
    position = v_position::smallint, updated_at = p_now
  where id = p_session_id and user_id = p_user_id;
  v_outcome.after_state := public.rolling_plan_session_state(p_user_id, p_session_id);
  v_outcome.entry_session_id := p_session_id;
  v_outcome.cap_dates := array[v_session.local_date, v_target_date];
  return v_outcome;
end;
$$;

create function private.plan_change_cancel(
  p_user_id uuid,
  p_today date,
  p_now timestamptz,
  p_change jsonb,
  p_session_id uuid
)
returns private.plan_change_outcome
language plpgsql
set search_path = ''
as $$
declare
  v_outcome private.plan_change_outcome;
  v_session public.rolling_plan_sessions;
  v_reason text;
begin
  v_session := private.plan_change_lock_session(
    p_user_id, p_session_id, array['active'], p_today
  );
  v_outcome.before_state := public.rolling_plan_session_state(p_user_id, p_session_id);
  -- Cancellation reason: `reason` is optional, and a cancel without one is
  -- exactly the cancel it always was.
  if p_change - array['operation', 'sessionId', 'reason'] <> '{}'::jsonb
    or (
      p_change ? 'reason'
      and pg_catalog.jsonb_typeof(p_change->'reason') <> 'null'
      and not public.rolling_plan_cancellation_reason_is_valid(p_change->'reason')
    )
  then
    raise exception using errcode = '22023', message = 'Invalid rolling plan cancellation.';
  end if;
  update public.rolling_plan_sessions set
    status = 'cancelled', cancelled_at = p_now, updated_at = p_now
  where id = p_session_id and user_id = p_user_id;
  v_reason := pg_catalog.btrim(p_change->>'reason', E' \t\r\n');
  if v_reason is not null then
    insert into public.rolling_plan_session_cancellations (
      session_id, user_id, reason, created_at, updated_at
    ) values (p_session_id, p_user_id, v_reason, p_now, p_now);
  end if;
  v_outcome.after_state := public.rolling_plan_session_state(p_user_id, p_session_id);
  v_outcome.entry_session_id := p_session_id;
  v_outcome.cap_dates := array[v_session.local_date];
  return v_outcome;
end;
$$;

-- 6. Nobody but the dispatcher ------------------------------------------------

revoke all privileges on function private.plan_change_refuse_past(date, date)
  from public, anon, authenticated, service_role;
revoke all privileges on function private.plan_change_lock_session(uuid, uuid, text[], date)
  from public, anon, authenticated, service_role;
revoke all privileges on function private.plan_change_lock_series(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all privileges on function private.plan_change_insert_series(
  uuid, uuid, uuid, uuid, date, jsonb, timestamptz
) from public, anon, authenticated, service_role;
revoke all privileges on function private.plan_change_insert_activities(
  uuid, uuid, uuid, jsonb, timestamptz
) from public, anon, authenticated, service_role;
revoke all privileges on function private.plan_change_set_recovery_day(
  uuid, uuid, date, timestamptz, jsonb
) from public, anon, authenticated, service_role;
revoke all privileges on function private.plan_change_add_series(
  uuid, uuid, date, timestamptz, jsonb, uuid
) from public, anon, authenticated, service_role;
revoke all privileges on function private.plan_change_end_series(
  uuid, date, timestamptz, jsonb, uuid
) from public, anon, authenticated, service_role;
revoke all privileges on function private.plan_change_split_series(
  uuid, uuid, date, timestamptz, jsonb, uuid
) from public, anon, authenticated, service_role;
revoke all privileges on function private.plan_change_edit_series(
  uuid, date, timestamptz, jsonb, uuid
) from public, anon, authenticated, service_role;
revoke all privileges on function private.plan_change_add(
  uuid, uuid, date, timestamptz, jsonb, uuid
) from public, anon, authenticated, service_role;
revoke all privileges on function private.plan_change_delete(
  uuid, date, jsonb, uuid
) from public, anon, authenticated, service_role;
revoke all privileges on function private.plan_change_reactivate(
  uuid, date, timestamptz, jsonb, uuid
) from public, anon, authenticated, service_role;
revoke all privileges on function private.plan_change_edit(
  uuid, uuid, date, timestamptz, jsonb, uuid
) from public, anon, authenticated, service_role;
revoke all privileges on function private.plan_change_move(
  uuid, date, timestamptz, jsonb, uuid
) from public, anon, authenticated, service_role;
revoke all privileges on function private.plan_change_cancel(
  uuid, date, timestamptz, jsonb, uuid
) from public, anon, authenticated, service_role;
revoke all privileges on type private.plan_change_outcome
  from public, anon, authenticated, service_role;

-- 7. The dispatcher -----------------------------------------------------------

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
  v_id uuid;
  v_outcome private.plan_change_outcome;
  v_ordinal integer := 0;
  v_cap_dates date[] := array[]::date[];
  v_sweep jsonb;
  v_series_effects jsonb := '[]'::jsonb;
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
  -- A caller cannot supply either, so no rule an operation applies can be
  -- argued away.
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

    if v_operation = 'set_recovery_day' then
      v_outcome := private.plan_change_set_recovery_day(
        v_user_id, v_plan.id, v_today, v_now, v_change
      );
    elsif v_operation in ('add_series', 'edit_series', 'end_series') then
      if not (v_change ? 'seriesId')
        or pg_catalog.jsonb_typeof(v_change->'seriesId') <> 'string'
      then raise exception using errcode = '22023', message = 'Invalid rolling plan series change.'; end if;
      begin v_id := (v_change->>'seriesId')::uuid;
      exception when others then
        raise exception using errcode = '22023', message = 'Invalid rolling plan series change.';
      end;
      if v_operation = 'add_series' then
        v_outcome := private.plan_change_add_series(
          v_user_id, v_plan.id, v_today, v_now, v_change, v_id
        );
      elsif v_operation = 'end_series' then
        v_outcome := private.plan_change_end_series(
          v_user_id, v_today, v_now, v_change, v_id
        );
      elsif v_change ? 'effectiveDate' then
        v_outcome := private.plan_change_split_series(
          v_user_id, v_plan.id, v_today, v_now, v_change, v_id
        );
      else
        v_outcome := private.plan_change_edit_series(
          v_user_id, v_today, v_now, v_change, v_id
        );
      end if;
    else
      if not (v_change ? 'sessionId')
        or pg_catalog.jsonb_typeof(v_change->'sessionId') <> 'string'
      then raise exception using errcode = '22023', message = 'Invalid rolling plan change.'; end if;
      begin v_id := (v_change->>'sessionId')::uuid;
      exception when others then
        raise exception using errcode = '22023', message = 'Invalid rolling plan change.';
      end;
      -- An unrecognized operation lands nowhere rather than in whichever
      -- branch happens to be written last (M3-19).
      case v_operation
        when 'add' then
          v_outcome := private.plan_change_add(
            v_user_id, v_plan.id, v_today, v_now, v_change, v_id
          );
        when 'delete' then
          v_outcome := private.plan_change_delete(
            v_user_id, v_today, v_change, v_id
          );
        when 'reactivate' then
          v_outcome := private.plan_change_reactivate(
            v_user_id, v_today, v_now, v_change, v_id
          );
        when 'edit' then
          v_outcome := private.plan_change_edit(
            v_user_id, v_plan.id, v_today, v_now, v_change, v_id
          );
        when 'move' then
          v_outcome := private.plan_change_move(
            v_user_id, v_today, v_now, v_change, v_id
          );
        when 'cancel' then
          v_outcome := private.plan_change_cancel(
            v_user_id, v_today, v_now, v_change, v_id
          );
        else
          raise exception using errcode = '22023', message = 'Invalid rolling plan change.';
      end case;
    end if;

    v_cap_dates := v_cap_dates || coalesce(v_outcome.cap_dates, array[]::date[]);
    if v_outcome.before_state is not null
      and v_outcome.before_state = v_outcome.after_state
    then
      raise exception using errcode = '22023', message = 'A plan change must change current state.';
    end if;
    insert into public.rolling_plan_change_entries (
      user_id, plan_id, change_set_id, session_id, series_id, local_date,
      ordinal, change_kind, before_state, after_state, created_at
    ) values (
      v_user_id, v_plan.id, v_change_set_id,
      v_outcome.entry_session_id, v_outcome.entry_series_id, v_outcome.entry_local_date,
      v_ordinal, v_operation, v_outcome.before_state, v_outcome.after_state, v_now
    );
    v_ordinal := v_ordinal + 1;

    if v_outcome.sweep_from is not null then
      v_sweep := public.rolling_plan_sweep_series_occurrences(
        v_user_id, v_plan.id, v_change_set_id, v_outcome.sweep_series_id,
        v_outcome.sweep_from, v_today, v_ordinal, v_now
      );
      v_ordinal := (v_sweep->>'nextOrdinal')::integer;
      v_series_effects := v_series_effects || pg_catalog.jsonb_build_object(
        'seriesId', v_outcome.sweep_series_id,
        'operation', v_operation,
        'deleted', v_sweep->'deleted',
        'divergedDeleted', v_sweep->'divergedDeleted',
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
      and session.local_date = any(v_cap_dates)
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
