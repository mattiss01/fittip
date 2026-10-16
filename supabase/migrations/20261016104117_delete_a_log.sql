-- Delete a log (ADR-031; owner, 7 and 16 Oct 2026).
--
-- `apply_completion_change` gains a third operation, `delete`. It names a log
-- and the revision the owner read, under the same row lock and the same PT409
-- as an edit: a log that is gone, stale, or another owner's is answered the
-- same way. The log is removed with its activities, and so is every planned
-- log that was "Replaced" by it. Nothing is kept.
--
-- Structurally: the function is re-emitted verbatim from
-- `20261015093527_careful_fix_in_passing` (the latest migration to define
-- it), with three changes: the operation check admits `delete` with no
-- content, the revision comment names it, and the delete branch follows the
-- revision check. No table, policy or grant changes: `authenticated` still has
-- no DELETE on `completions`, and this definer function is the only path.

create or replace function public.apply_completion_change(
  p_operation text,
  p_completion_id uuid default null,
  p_expected_revision bigint default null,
  p_completion jsonb default null
)
returns public.completion_receipt
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_timezone text;
  v_completion_id uuid;
  v_revision bigint;
  v_plan_session_id uuid;
  v_snapshot jsonb;
  v_activity jsonb;
  v_constraint text;
  v_title text;
  v_sport text;
  v_replaced_by uuid;
  v_replacement public.completion_receipt;
begin
  if v_user_id is null then
    raise exception using errcode = '42501',
      message = 'An authenticated FitTip user is required.';
  end if;
  if p_operation is null or p_operation not in ('create', 'edit', 'delete')
    -- Delete (ADR-031) carries no content: it names a log and the revision
    -- read, and nothing else.
    or (p_operation = 'delete' and p_completion is not null)
    or (p_operation <> 'delete'
      and not public.completion_input_is_valid(p_completion, p_operation))
  then
    raise exception using errcode = '22023', message = 'Invalid completion change.';
  end if;

  -- What a replaced log points at. Written first when it is new: the
  -- recursive create is the same function under the same owner, so every rule
  -- unplanned training answers to is applied to it unchanged, and if anything
  -- after it fails the whole call rolls back and neither log exists.
  if p_completion ? 'replacement' then
    v_replacement := public.apply_completion_change(
      'create', null, null,
      (p_completion->'replacement') || pg_catalog.jsonb_build_object(
        'status', 'unplanned',
        'actualLocalDate', p_completion->'actualLocalDate',
        'painReported', false,
        'illnessReported', false,
        'injuryReported', false,
        'severeFatigueReported', false
      )
    );
    v_replaced_by := v_replacement.completion_id;
  elsif p_completion ? 'replacedByCompletionId' then
    v_replaced_by := (p_completion->>'replacedByCompletionId')::uuid;
    -- This owner's, and unplanned: a planned log replaces nothing and cannot
    -- itself stand for what was done instead. Another owner's log is simply
    -- not there, and is refused the same way a missing one is.
    if not exists (
      select 1 from public.completions target
      where target.id = v_replaced_by
        and target.user_id = v_user_id
        and target.plan_session_id is null
    ) then
      raise exception using errcode = '22023', message = 'Invalid completion change.';
    end if;
  end if;

  if p_operation = 'create' then
    -- A create names no existing record and answers to no revision.
    if p_completion_id is not null or p_expected_revision is not null then
      raise exception using errcode = '22023', message = 'Invalid completion change.';
    end if;

    -- The record carries the zone its local date was written in, because the
    -- profile zone changes and a past date must not move with it.
    select profile.timezone_name into v_timezone
    from public.profiles profile where profile.user_id = v_user_id;
    if v_timezone is null then
      raise exception using errcode = 'PT428',
        message = 'Confirm your time zone before logging training.';
    end if;

    -- Nothing is completed before it happens.
    if (p_completion->>'actualLocalDate')::date
      > (v_now at time zone v_timezone)::date
    then
      raise exception using errcode = 'PT430',
        message = 'Training cannot be logged for a future date.';
    end if;

    if p_completion->>'status' <> 'unplanned' then
      v_plan_session_id := (p_completion->>'planSessionId')::uuid;
      -- Owner-scoped by construction: the state function reads the row only
      -- when it belongs to this owner, so another owner's session is simply
      -- not there. The snapshot is taken now and never read through again.
      -- Snapshot lock: hold the planned row before it is read, so what is
      -- read is what the log is written against. No timeout of its own: this
      -- is the wait the insert's foreign key already made, moved earlier, and
      -- the only holder it can wait for is a plan change, which bounds its
      -- own waits at three seconds and commits or fails.
      perform 1 from public.rolling_plan_sessions session
      where session.id = v_plan_session_id and session.user_id = v_user_id
      for key share;
      v_snapshot := public.rolling_plan_session_state(v_user_id, v_plan_session_id);
      if v_snapshot is null then
        raise exception using errcode = '22023',
          message = 'That planned session does not exist.';
      end if;
      -- A duplicate is refused by `completions_plan_session_key` and reported
      -- from the handler below. Reading first would answer the same question
      -- twice and answer it differently under a race: two callers can both
      -- pass a non-serialized `exists` and only the constraint decides.
    end if;

    -- Every new log carries its own name. The caller states it; when it does
    -- not - the app deployed before this migration never does - the name is
    -- the planned session's, or for unplanned training the first activity's,
    -- which is exactly where that version kept it. The backfill above follows
    -- the same rule, so no log reads differently depending on when it was
    -- written.
    if p_completion ? 'title' then
      v_title := pg_catalog.btrim(p_completion->>'title');
      v_sport := pg_catalog.btrim(p_completion->>'sport');
    elsif v_snapshot is not null then
      v_title := v_snapshot->>'title';
      v_sport := v_snapshot->>'sport';
    else
      select pg_catalog.btrim(first.value->>'name'),
        pg_catalog.btrim(first.value->>'sport')
      into v_title, v_sport
      from pg_catalog.jsonb_array_elements(p_completion->'activities')
        as first(value)
      order by (first.value->>'position')::integer
      limit 1;
    end if;

    insert into public.completions (
      user_id, plan_session_id, status, actual_local_date, timezone_name,
      actual_started_at, duration_minutes, perceived_effort, note,
      replacement_description, pain_reported, illness_reported, injury_reported,
      severe_fatigue_reported, planned_snapshot, title, sport,
      replaced_by_completion_id, created_at, updated_at
    ) values (
      v_user_id, v_plan_session_id, p_completion->>'status',
      (p_completion->>'actualLocalDate')::date, v_timezone,
      (p_completion->>'actualStartedAt')::timestamptz,
      (p_completion->>'durationMinutes')::integer,
      (p_completion->>'perceivedEffort')::smallint,
      nullif(p_completion->>'note', ''),
      nullif(pg_catalog.btrim(
        coalesce(p_completion->>'replacementDescription', '')), ''),
      coalesce((p_completion->>'painReported')::boolean, false),
      coalesce((p_completion->>'illnessReported')::boolean, false),
      coalesce((p_completion->>'injuryReported')::boolean, false),
      coalesce((p_completion->>'severeFatigueReported')::boolean, false),
      v_snapshot, v_title, v_sport, v_replaced_by, v_now, v_now
    ) returning id, revision into v_completion_id, v_revision;

    for v_activity in
      select value from pg_catalog.jsonb_array_elements(p_completion->'activities')
    loop
      if v_activity ? 'personalActivityId'
        and pg_catalog.jsonb_typeof(v_activity->'personalActivityId') <> 'null'
        and not exists (
          select 1 from public.personal_activities
          where id = (v_activity->>'personalActivityId')::uuid
            and user_id = v_user_id
        )
      then
        raise exception using errcode = '22023',
          message = 'Invalid completed activity.';
      end if;
      -- An actual may answer one planned activity of this log's own snapshot
      -- and no other. Unplanned training has no snapshot, so it answers none.
      -- A second actual answering the same one is refused by
      -- `completion_activities_planned_key`.
      if v_activity ? 'plannedPosition'
        and pg_catalog.jsonb_typeof(v_activity->'plannedPosition') <> 'null'
        and not exists (
          select 1
          from pg_catalog.jsonb_array_elements(
            coalesce(v_snapshot->'activities', '[]'::jsonb)) as planned(value)
          where (planned.value->>'position')::integer
            = (v_activity->>'plannedPosition')::integer
        )
      then
        raise exception using errcode = '22023',
          message = 'Invalid completed activity.';
      end if;
      insert into public.completion_activities (
        user_id, completion_id, personal_activity_id, position, planned_position,
        name, sport, instructions, measurement_mode, actual_measurement,
        created_at, updated_at
      ) values (
        v_user_id, v_completion_id,
        (v_activity->>'personalActivityId')::uuid,
        (v_activity->>'position')::smallint,
        (v_activity->>'plannedPosition')::smallint,
        pg_catalog.btrim(v_activity->>'name'),
        pg_catalog.btrim(v_activity->>'sport'),
        nullif(v_activity->>'instructions', ''),
        v_activity->>'measurementMode',
        nullif(v_activity->'actualMeasurement', 'null'::jsonb), v_now, v_now
      );
    end loop;
    return (v_completion_id, v_revision, 'created')::public.completion_receipt;
  end if;

  -- An edit or a delete answers to the revision the owner last read.
  if p_completion_id is null or p_expected_revision is null
    or p_expected_revision < 0
  then
    raise exception using errcode = '22023', message = 'Invalid completion change.';
  end if;

  -- ADR-010. The wait is bounded, so a second same-owner save gets an answer
  -- rather than hanging. Locking the one row rather than the history lets two
  -- different completions be corrected at the same time.
  perform pg_catalog.set_config('lock_timeout', '3s', true);
  begin
    select completion.revision, completion.plan_session_id,
      completion.timezone_name, completion.planned_snapshot
    into v_revision, v_plan_session_id, v_timezone, v_snapshot
    from public.completions completion
    where completion.id = p_completion_id and completion.user_id = v_user_id
    for update;
  exception when lock_not_available then
    raise exception using errcode = 'PT409',
      message = 'That completion changed. Reload and try again.';
  end;

  -- A record another owner holds, or one already removed, is reported the same
  -- way: it changed. That is honest and leaks nothing.
  if v_revision is null or v_revision <> p_expected_revision then
    raise exception using errcode = 'PT409',
      message = 'That completion changed. Reload and try again.';
  end if;

  -- Delete a log (ADR-031). Really deleted: the row goes and its activities
  -- with it, by `completion_activities_completion_fkey`'s cascade. Planned
  -- sessions logged "Replaced" by this one go first, which the owner decided
  -- (16 Oct 2026) and which `completions_replaced_by_fkey` (no action) needs.
  -- Each was this owner's to delete: the pointer is checked to be the owner's
  -- own when it is written, and the predicate repeats it. A freed session is
  -- simply not logged; the settled rule tests for a log naming it.
  if p_operation = 'delete' then
    delete from public.completions replaced
    where replaced.replaced_by_completion_id = p_completion_id
      and replaced.user_id = v_user_id;
    delete from public.completions
    where id = p_completion_id and user_id = v_user_id;
    return (p_completion_id, v_revision, 'deleted')::public.completion_receipt;
  end if;

  -- The planned link is immutable, so an edit can never cross the boundary
  -- between a planned completion and an unplanned one.
  if (p_completion->>'status' = 'unplanned') <> (v_plan_session_id is null) then
    raise exception using errcode = '22023', message = 'Invalid completion change.';
  end if;

  -- A planned log's actuals may be corrected like any other log's. What it
  -- was measured against is `planned_snapshot`, which this branch reads to
  -- check each `plannedPosition` and never writes: correcting what was done
  -- does not rewrite what was planned. (M3-23 refused this, reading the actual
  -- list as though it were the snapshot.)

  -- The completion's own zone, not the profile's: an edit must not be judged
  -- against a zone the owner has since moved to.
  if (p_completion->>'actualLocalDate')::date
    > (v_now at time zone v_timezone)::date
  then
    raise exception using errcode = 'PT430',
      message = 'Training cannot be logged for a future date.';
  end if;

  update public.completions set
    status = p_completion->>'status',
    actual_local_date = (p_completion->>'actualLocalDate')::date,
    actual_started_at = (p_completion->>'actualStartedAt')::timestamptz,
    duration_minutes = (p_completion->>'durationMinutes')::integer,
    perceived_effort = (p_completion->>'perceivedEffort')::smallint,
    note = nullif(p_completion->>'note', ''),
    replacement_description = nullif(pg_catalog.btrim(
      coalesce(p_completion->>'replacementDescription', '')), ''),
    pain_reported = coalesce((p_completion->>'painReported')::boolean, false),
    illness_reported = coalesce((p_completion->>'illnessReported')::boolean, false),
    injury_reported = coalesce((p_completion->>'injuryReported')::boolean, false),
    severe_fatigue_reported =
      coalesce((p_completion->>'severeFatigueReported')::boolean, false),
    -- A name the edit does not state is left as it is: the app deployed
    -- before this migration sends none, and must not erase one.
    title = case when p_completion ? 'title'
      then pg_catalog.btrim(p_completion->>'title') else title end,
    sport = case when p_completion ? 'title'
      then pg_catalog.btrim(p_completion->>'sport') else sport end,
    -- Set on every edit, so a log corrected away from `replaced` no longer
    -- points anywhere; the validator admits a pointer only beside it.
    replaced_by_completion_id = v_replaced_by,
    revision = v_revision + 1,
    updated_at = v_now
  where id = p_completion_id and user_id = v_user_id;

  -- Replacing the list wholesale rather than updating rows in place: position
  -- is unique per completion, so a reorder would collide mid-statement, and the
  -- rows carry no history of their own.
  if p_completion ? 'activities' then
    delete from public.completion_activities
    where completion_id = p_completion_id and user_id = v_user_id;
    for v_activity in
      select value from pg_catalog.jsonb_array_elements(p_completion->'activities')
    loop
      if v_activity ? 'personalActivityId'
        and pg_catalog.jsonb_typeof(v_activity->'personalActivityId') <> 'null'
        and not exists (
          select 1 from public.personal_activities
          where id = (v_activity->>'personalActivityId')::uuid
            and user_id = v_user_id
        )
      then
        raise exception using errcode = '22023',
          message = 'Invalid completed activity.';
      end if;
      -- An actual may answer one planned activity of this log's own snapshot
      -- and no other. Unplanned training has no snapshot, so it answers none.
      -- A second actual answering the same one is refused by
      -- `completion_activities_planned_key`.
      if v_activity ? 'plannedPosition'
        and pg_catalog.jsonb_typeof(v_activity->'plannedPosition') <> 'null'
        and not exists (
          select 1
          from pg_catalog.jsonb_array_elements(
            coalesce(v_snapshot->'activities', '[]'::jsonb)) as planned(value)
          where (planned.value->>'position')::integer
            = (v_activity->>'plannedPosition')::integer
        )
      then
        raise exception using errcode = '22023',
          message = 'Invalid completed activity.';
      end if;
      insert into public.completion_activities (
        user_id, completion_id, personal_activity_id, position, planned_position,
        name, sport, instructions, measurement_mode, actual_measurement,
        created_at, updated_at
      ) values (
        v_user_id, p_completion_id,
        (v_activity->>'personalActivityId')::uuid,
        (v_activity->>'position')::smallint,
        (v_activity->>'plannedPosition')::smallint,
        pg_catalog.btrim(v_activity->>'name'),
        pg_catalog.btrim(v_activity->>'sport'),
        nullif(v_activity->>'instructions', ''),
        v_activity->>'measurementMode',
        nullif(v_activity->'actualMeasurement', 'null'::jsonb), v_now, v_now
      );
    end loop;
  end if;

  return (p_completion_id, v_revision + 1, 'updated')::public.completion_receipt;
exception
  when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    -- Its own code, whether the second caller arrives a minute or a
    -- millisecond late: the surface has to tell the owner which refusal this
    -- is, and nothing about the outcome, the date, or the numbers is wrong.
    if v_constraint = 'completions_plan_session_key' then
      raise exception using errcode = 'PT431',
        message = 'That session already has a completion.';
    end if;
    raise exception using errcode = '22023', message = 'Invalid completion change.';
  when foreign_key_violation or check_violation
    or not_null_violation or invalid_datetime_format
    or invalid_text_representation then
    raise exception using errcode = '22023', message = 'Invalid completion change.';
end;
$$;

revoke all privileges on function public.apply_completion_change(text, uuid, bigint, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.apply_completion_change(text, uuid, bigint, jsonb)
  to authenticated;
