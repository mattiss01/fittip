-- A4d: a replaced session points at what replaced it. Additive only; the
-- A4bc definitions stand as history and are replaced here.
--
-- A replaced planned log now carries `replaced_by_completion_id`: the
-- unplanned log of what was done instead. It is written in the same call when
-- the owner logs that training inline, or named when it was already logged.
-- One unplanned log may replace several planned sessions, so the pointer lives
-- on the planned side and nothing is stored on the unplanned one.
--
-- `replacement_description`, which used to be the pointer, is kept: a log
-- written before this reads exactly as it did, and saving one again keeps its
-- text beside the new link. New logs no longer need it.
--
-- No log can be deleted today - `authenticated` holds only SELECT and the
-- write function creates and edits - so there is no deletion path to design.
-- The foreign key is NO ACTION rather than RESTRICT on purpose: a lone delete
-- of a linked log is refused, which leaves the choice to whoever adds deletion,
-- while the account cascade from `profiles`, which removes both rows in one
-- statement, is checked only once it has finished and so is not refused.

alter table public.completions
  add column replaced_by_completion_id uuid,
  add constraint completions_replaced_by_fkey
    foreign key (replaced_by_completion_id, user_id)
    references public.completions (id, user_id)
    on delete no action;

-- The M3-15A rule said `replaced` exactly when there is a description. It now
-- says `replaced` exactly when there is something to point at - the link, or
-- for a log written before it, the text - and that neither appears on any
-- other outcome. Same name, so a reader of either migration finds the one
-- rule; it only admits more rows than before, and every existing row
-- satisfied the old one, so every existing row satisfies this.
alter table public.completions
  drop constraint completions_replacement_check,
  add constraint completions_replacement_check check (
    (
      status = 'replaced'
      and (
        replaced_by_completion_id is not null
        or replacement_description is not null
      )
      and (
        replacement_description is null
        or char_length(trim(replacement_description)) between 1 and 500
      )
    )
    or (
      status <> 'replaced'
      and replacement_description is null
      and replaced_by_completion_id is null
    )
  );

create index completions_replaced_by_idx
  on public.completions (user_id, replaced_by_completion_id)
  where replaced_by_completion_id is not null;

-- The payload validator. As A4bc, with `replaced` answering to a pointer.
create or replace function public.completion_input_is_valid(
  p_value jsonb,
  p_operation text
)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_status text;
  v_key text;
  v_number numeric;
  v_activity jsonb;
  v_positions integer[] := array[]::integer[];
begin
  if p_value is null or pg_catalog.jsonb_typeof(p_value) <> 'object'
    or p_value - (case when p_operation = 'create' then array[
        'planSessionId', 'status', 'actualLocalDate', 'actualStartedAt',
        'durationMinutes', 'perceivedEffort', 'feeling', 'note',
        'replacementDescription', 'painReported', 'illnessReported',
        'injuryReported', 'severeFatigueReported', 'activities', 'title', 'sport',
        'replacedByCompletionId', 'replacement'
      ] else array[
        'status', 'actualLocalDate', 'actualStartedAt', 'durationMinutes',
        'perceivedEffort', 'feeling', 'note', 'replacementDescription',
        'painReported', 'illnessReported', 'injuryReported',
        'severeFatigueReported', 'activities', 'title', 'sport',
        'replacedByCompletionId', 'replacement'
      ] end) <> '{}'::jsonb
    or not (p_value ?& array['status', 'actualLocalDate'])
    or pg_catalog.jsonb_typeof(p_value->'status') <> 'string'
    or pg_catalog.jsonb_typeof(p_value->'actualLocalDate') <> 'string'
  then return false; end if;

  v_status := p_value->>'status';
  -- The vocabulary is exactly these five. `rest` is not one of them: a
  -- recovery intention is a day-level planning label, not a completion.
  if v_status not in (
    'completed', 'partially_completed', 'skipped', 'replaced', 'unplanned'
  ) then return false; end if;
  if (p_value->>'actualLocalDate')::date::text <> p_value->>'actualLocalDate' then
    return false;
  end if;

  -- `unplanned` means exactly "no planned session", in both directions.
  if p_operation = 'create' then
    if (v_status = 'unplanned') <> (
      not (p_value ? 'planSessionId')
      or pg_catalog.jsonb_typeof(p_value->'planSessionId') = 'null'
    ) then return false; end if;
    if v_status <> 'unplanned' then
      if pg_catalog.jsonb_typeof(p_value->'planSessionId') <> 'string' then
        return false;
      end if;
      perform (p_value->>'planSessionId')::uuid;
    end if;
  end if;

  -- `replaced` means exactly "this points at what was done instead": either
  -- the unplanned log it names, or one written in the same call. Exactly one,
  -- and neither on any other outcome. A4d replaced the old rule, under which
  -- the pointer was a line of text; that text is now optional, is admitted
  -- only beside `replaced`, and survives so a log written before the link
  -- keeps what the owner typed.
  if (v_status = 'replaced') <> (
    p_value ? 'replacedByCompletionId' or p_value ? 'replacement'
  ) then return false; end if;
  if p_value ? 'replacedByCompletionId' and p_value ? 'replacement' then
    return false;
  end if;
  if p_value ? 'replacedByCompletionId' then
    if pg_catalog.jsonb_typeof(p_value->'replacedByCompletionId') <> 'string' then
      return false;
    end if;
    perform (p_value->>'replacedByCompletionId')::uuid;
  end if;
  -- Only the shape is judged here. The recursive create that writes it runs
  -- this validator again as unplanned training, which judges the contents.
  if p_value ? 'replacement' and (
    pg_catalog.jsonb_typeof(p_value->'replacement') <> 'object'
    or (p_value->'replacement') - array[
      'title', 'sport', 'durationMinutes', 'perceivedEffort', 'feeling',
      'activities'
    ] <> '{}'::jsonb
    or not ((p_value->'replacement') ?& array['title', 'sport', 'activities'])
  ) then return false; end if;
  if p_value ? 'replacementDescription'
    and pg_catalog.jsonb_typeof(p_value->'replacementDescription') <> 'null'
    and (
      v_status <> 'replaced'
      or pg_catalog.jsonb_typeof(p_value->'replacementDescription') <> 'string'
      or pg_catalog.char_length(
        pg_catalog.btrim(p_value->>'replacementDescription')) not between 1 and 500
    )
  then return false; end if;

  -- A log's own name, both halves or neither. Absent on a create means the
  -- write function supplies one; absent on an edit leaves the stored one.
  if (p_value ? 'title') <> (p_value ? 'sport') then return false; end if;
  if p_value ? 'title' and (
    pg_catalog.jsonb_typeof(p_value->'title') <> 'string'
    or pg_catalog.jsonb_typeof(p_value->'sport') <> 'string'
    or pg_catalog.char_length(pg_catalog.btrim(p_value->>'title'))
      not between 1 and 120
    or pg_catalog.char_length(pg_catalog.btrim(p_value->>'sport'))
      not between 1 and 80
  ) then return false; end if;

  if p_value ? 'actualStartedAt'
    and pg_catalog.jsonb_typeof(p_value->'actualStartedAt') <> 'null'
  then
    if pg_catalog.jsonb_typeof(p_value->'actualStartedAt') <> 'string' then
      return false;
    end if;
    perform (p_value->>'actualStartedAt')::timestamptz;
  end if;

  foreach v_key in array array['durationMinutes', 'perceivedEffort'] loop
    if p_value ? v_key and pg_catalog.jsonb_typeof(p_value->v_key) <> 'null' then
      if pg_catalog.jsonb_typeof(p_value->v_key) <> 'number' then
        return false;
      end if;
      v_number := (p_value->>v_key)::numeric;
      if v_number <> trunc(v_number)
        or (v_key = 'durationMinutes' and v_number not between 0 and 10080)
        or (v_key = 'perceivedEffort' and v_number not between 1 and 10)
      then return false; end if;
    end if;
  end loop;

  if p_value ? 'feeling'
    and pg_catalog.jsonb_typeof(p_value->'feeling') <> 'null'
    and (p_value->>'feeling') not in (
      'very_bad', 'bad', 'neutral', 'good', 'very_good')
  then return false; end if;
  if p_value ? 'note'
    and pg_catalog.jsonb_typeof(p_value->'note') not in ('string', 'null')
  then return false; end if;
  if pg_catalog.char_length(coalesce(p_value->>'note', '')) > 2000 then
    return false;
  end if;

  foreach v_key in array array[
    'painReported', 'illnessReported', 'injuryReported', 'severeFatigueReported'
  ] loop
    if p_value ? v_key
      and pg_catalog.jsonb_typeof(p_value->v_key) not in ('boolean', 'null')
    then return false; end if;
  end loop;

  -- A create states the whole list, including an empty one. An edit states it
  -- only to replace it; leaving the key out leaves the activities alone.
  if p_operation = 'create' and not (p_value ? 'activities') then
    return false;
  end if;
  if p_value ? 'activities' then
    if pg_catalog.jsonb_typeof(p_value->'activities') <> 'array'
      or pg_catalog.jsonb_array_length(p_value->'activities') > 50
    then return false; end if;
    for v_activity in
      select value from pg_catalog.jsonb_array_elements(p_value->'activities')
    loop
      if not public.completion_activity_input_is_valid(v_activity) then
        return false;
      end if;
      if (v_activity->>'position')::integer = any(v_positions) then
        return false;
      end if;
      v_positions := v_positions || (v_activity->>'position')::integer;
    end loop;
  end if;
  return true;
exception when others then return false;
end;
$$;

revoke all privileges on function public.completion_input_is_valid(jsonb, text)
  from public, anon, authenticated, service_role;

-- One owner-derived transaction for both completion writes. The owner comes
-- from `auth.uid()` and from nowhere else. A create captures the planned
-- snapshot from the live plan row here, so no caller can compose or forge one,
-- and an edit never touches it again.
--
-- This function advances no plan revision and writes no plan table. Planned
-- and actual are separate permanent streams, and logging what happened is not
-- a change to what was planned.
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
  if p_operation is null or p_operation not in ('create', 'edit')
    or not public.completion_input_is_valid(p_completion, p_operation)
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
      actual_started_at, duration_minutes, perceived_effort, feeling, note,
      replacement_description, pain_reported, illness_reported, injury_reported,
      severe_fatigue_reported, planned_snapshot, title, sport,
      replaced_by_completion_id, created_at, updated_at
    ) values (
      v_user_id, v_plan_session_id, p_completion->>'status',
      (p_completion->>'actualLocalDate')::date, v_timezone,
      (p_completion->>'actualStartedAt')::timestamptz,
      (p_completion->>'durationMinutes')::integer,
      (p_completion->>'perceivedEffort')::smallint,
      p_completion->>'feeling', nullif(p_completion->>'note', ''),
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

  -- An edit answers to the revision the owner last read.
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
    feeling = p_completion->>'feeling',
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
    or not_null_violation or invalid_datetime_format then
    raise exception using errcode = '22023', message = 'Invalid completion change.';
end;
$$;

revoke all privileges on function public.apply_completion_change(text, uuid, bigint, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.apply_completion_change(text, uuid, bigint, jsonb)
  to authenticated;
