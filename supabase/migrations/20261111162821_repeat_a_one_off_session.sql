-- R2: a one-off session can become the first session of a new series (owner,
-- 5 and 10 Nov 2026).
--
-- `repeat_session` takes a one-off and a rule. The session itself becomes the
-- series' occurrence on its own date: it keeps its id, activities, notes,
-- coach's note and any log, and is never copied and deleted, because a copy
-- loses what hangs off the session and a delete would remove a log's session,
-- which only the owner's own delete may do (ADR-031). The series template is
-- read from the session row, never from the request, and its activities are
-- copies of the session's.
--
-- Checked from the session row: the owner's, active, not already in a series,
-- dated today or later and no later than the last date recurring sessions are
-- written through (today plus ninety, as `materialize_rolling_plan_series`
-- fills). The rule must fall on the session's own date, so it is a true first
-- occurrence. A session with a log is admitted, and its log and the log's link
-- to the session stay exactly as they are (owner, 5 Nov 2026).
--
-- The rest of the window is filled afterwards by the materializer, as after
-- `add_series`, with the same ten-a-day skip and receipt.

-- 1. The change log admits the new kind ---------------------------------------

-- It names both what it acted on and what it made: the session, which
-- survives, and the new series.
alter table public.rolling_plan_change_entries
  drop constraint rolling_plan_change_entries_kind_check,
  add constraint rolling_plan_change_entries_kind_check check (
    change_kind = any (array[
      'add', 'edit', 'move', 'set_lock', 'cancel', 'set_recovery_day',
      'add_series', 'edit_series', 'end_series', 'delete', 'reactivate',
      'repeat_session'
    ])
  ),
  drop constraint rolling_plan_change_entries_target_check,
  add constraint rolling_plan_change_entries_target_check check (
    (change_kind = any (array['set_recovery_day', 'delete'])
      and session_id is null and series_id is null and local_date is not null)
    or (change_kind = any (array['add_series', 'edit_series', 'end_series'])
      and session_id is null and series_id is not null and local_date is null)
    or (change_kind = any (array['add', 'edit', 'move', 'set_lock', 'cancel', 'reactivate'])
      and session_id is not null and series_id is null and local_date is null)
    or (change_kind = 'repeat_session'
      and session_id is not null and series_id is not null and local_date is null)
  );

-- 2. The operation ------------------------------------------------------------

create function private.plan_change_repeat_session(
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
  v_series_id uuid;
  v_input jsonb;
begin
  if p_change - array['operation', 'sessionId', 'seriesId', 'rule'] <> '{}'::jsonb
    or not (p_change ?& array['seriesId', 'rule'])
    or pg_catalog.jsonb_typeof(p_change->'seriesId') <> 'string'
    or pg_catalog.jsonb_typeof(p_change->'rule') <> 'object'
    or (p_change->'rule')
      - array['frequency', 'intervalCount', 'weekdays', 'endDate'] <> '{}'::jsonb
  then raise exception using errcode = '22023', message = 'Invalid rolling plan repeat.'; end if;
  begin v_series_id := (p_change->>'seriesId')::uuid;
  exception when others then
    raise exception using errcode = '22023', message = 'Invalid rolling plan repeat.';
  end;
  if exists (select 1 from public.rolling_plan_series where id = v_series_id) then
    raise exception using errcode = '22023', message = 'Invalid rolling plan repeat.';
  end if;

  -- Locked as every session operation locks it, so a log being written is
  -- waited for. Unlike an edit, a log does not refuse it: the log stays.
  select * into v_session
  from public.rolling_plan_sessions session
  where session.id = p_session_id and session.user_id = p_user_id
    and session.status = 'active'
  for update;
  if not found then
    raise exception using errcode = '22023', message = 'Invalid rolling plan change.';
  end if;
  perform private.plan_change_refuse_past(v_session.local_date, p_today);
  if v_session.series_id is not null or v_session.local_date > p_today + 90 then
    raise exception using errcode = '22023', message = 'Invalid rolling plan repeat.';
  end if;
  v_outcome.before_state := public.rolling_plan_session_state(p_user_id, p_session_id);

  -- The template is the session as it stands, from its own date.
  v_input := (p_change->'rule') || pg_catalog.jsonb_build_object(
    'startDate', v_session.local_date::text,
    'title', v_session.title,
    'sport', v_session.sport,
    'intent', v_session.intent,
    'expectedDurationMinutes', v_session.expected_duration_minutes,
    'startTime', pg_catalog.to_char(v_session.start_time, 'HH24:MI'),
    'note', v_session.note,
    'coachNote', v_session.coach_note,
    'activities', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'personalActivityId', activity.personal_activity_id,
        'position', activity.position,
        'name', activity.name,
        'sport', activity.sport,
        'instructions', activity.instructions,
        'rationale', activity.rationale,
        'measurementMode', activity.measurement_mode,
        'target', activity.target
      ) order by activity.position, activity.id)
      from public.rolling_plan_activities activity
      where activity.user_id = p_user_id and activity.session_id = p_session_id
    ), '[]'::jsonb)
  );
  if not public.rolling_plan_series_input_is_valid(v_input)
    -- The session is the series' first occurrence, so its date must be one
    -- the rule repeats on.
    or not exists (
      select 1 from public.rolling_plan_series_dates(
        v_input->>'frequency',
        (v_input->>'intervalCount')::smallint,
        public.rolling_plan_weekday_set(v_input->'weekdays'),
        v_session.local_date,
        (v_input->>'endDate')::date,
        v_session.local_date,
        v_session.local_date
      )
    )
  then raise exception using errcode = '22023', message = 'Invalid rolling plan repeat.'; end if;

  perform private.plan_change_insert_series(
    p_user_id, p_plan_id, v_series_id, null, v_session.local_date, v_input, p_now
  );
  -- Only what makes it an occurrence changes. Its content already is the
  -- template, so it has not diverged.
  update public.rolling_plan_sessions set
    series_id = v_series_id,
    occurrence_date = v_session.local_date,
    has_diverged = false,
    updated_at = p_now
  where id = p_session_id and user_id = p_user_id;

  v_outcome.after_state := public.rolling_plan_session_state(p_user_id, p_session_id)
    || pg_catalog.jsonb_build_object(
      'series', public.rolling_plan_series_state(p_user_id, v_series_id)
    );
  v_outcome.entry_session_id := p_session_id;
  v_outcome.entry_series_id := v_series_id;
  return v_outcome;
end;
$$;

revoke all privileges on function private.plan_change_repeat_session(
  uuid, uuid, date, timestamptz, jsonb, uuid
) from public, anon, authenticated, service_role;

-- 3. The dispatcher, with one more case ---------------------------------------

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
        when 'repeat_session' then
          v_outcome := private.plan_change_repeat_session(
            v_user_id, v_plan.id, v_today, v_now, v_change, v_id
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
