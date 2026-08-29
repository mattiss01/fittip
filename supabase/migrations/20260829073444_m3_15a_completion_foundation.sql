-- M3-15A: the replacement factual completion record.
--
-- One completion is one owner-editable record of what actually happened. The
-- retired M1-01 model is deliberately not rebuilt: there is no
-- `completion_group_id`, `revision_number`, `previous_completion_id`,
-- `completion_heads`, or `correction_reason`, and no `rest` status. The
-- product amendment of 20 August 2026 recorded in F-005 and ADR-013 is the
-- authority for that, and its reasoning was that the correction chain had no
-- consumer while its mandatory reason had a real cost.
--
-- `revision` here is an optimistic token on M3-13's precedent, not a chain: no
-- prior version is retained and none can be browsed. A write at a stale token
-- is refused rather than applied or blended.
--
-- Two immutabilities carry the weight the retired chain used to carry:
--
--   * `planned_snapshot` is the planned session and its activities exactly as
--     they stood when the completion was written, and is write-once. The plan
--     side is mutable - a session can be edited, cancelled, or swept by a
--     series change after training was logged against it - so a completion
--     that read through to the live row would silently rewrite what it appears
--     to have been measured against. F-005 Review history step 4 depends on
--     this.
--   * a `rolling_plan_sessions` row carrying a completion is never hard
--     deleted. The foreign key below restricts it, and section 4 teaches the
--     one function that hard deletes occurrences to keep a completed one.
--
-- `timezone_name` is kept per record because the profile zone changes and a
-- past date must not move with it.
--
-- Owner-visible conditions raised by the change function:
--   PT409  the completion changed, or no longer exists, under this owner
--   PT428  the owner has confirmed no zone, so no local date can be anchored

-- 1. The two owner-scoped tables ---------------------------------------------

create table public.completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  -- Null exactly when the completion is `unplanned`. `on delete restrict`
  -- rather than `cascade`: nothing but the owner may alter a completion, and
  -- deleting the plan row out from under one would do exactly that.
  plan_session_id uuid,
  status text not null,
  actual_local_date date not null,
  timezone_name text not null,
  actual_started_at timestamptz,
  duration_minutes integer,
  perceived_effort smallint,
  feeling text,
  note text,
  replacement_description text,
  pain_reported boolean not null default false,
  illness_reported boolean not null default false,
  injury_reported boolean not null default false,
  severe_fatigue_reported boolean not null default false,
  -- Shaped exactly like `rolling_plan_change_entries.after_state`, because it
  -- is produced by the same `rolling_plan_session_state` function.
  planned_snapshot jsonb,
  revision bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint completions_owner_fkey
    foreign key (user_id) references public.profiles (user_id) on delete cascade,
  constraint completions_owner_key unique (id, user_id),
  constraint completions_plan_fkey
    foreign key (plan_session_id, user_id)
    references public.rolling_plan_sessions (id, user_id) on delete restrict,
  constraint completions_revision_check check (revision >= 0),
  constraint completions_status_check check (
    status in (
      'completed', 'partially_completed', 'skipped', 'replaced', 'unplanned'
    )
  ),
  -- Recovery day is a day-level planning label that F-005 defines as "not a
  -- session", so a session-less `rest` completion could satisfy neither branch
  -- of this rule. The factual counterpart of a recovery intention is a skipped
  -- planned session, or simply no completion.
  constraint completions_unplanned_check check (
    (status = 'unplanned' and plan_session_id is null)
    or (status <> 'unplanned' and plan_session_id is not null)
  ),
  -- A completion measured against a planned session carries what that session
  -- said; an unplanned one has nothing to have been measured against.
  constraint completions_snapshot_check check (
    (plan_session_id is null and planned_snapshot is null)
    or (
      plan_session_id is not null
      and planned_snapshot is not null
      and jsonb_typeof(planned_snapshot) = 'object'
    )
  ),
  constraint completions_replacement_check check (
    (
      status = 'replaced'
      and replacement_description is not null
      and char_length(trim(replacement_description)) between 1 and 500
    )
    or (status <> 'replaced' and replacement_description is null)
  ),
  constraint completions_timezone_check
    check (char_length(trim(timezone_name)) between 1 and 100),
  constraint completions_duration_check
    check (duration_minutes is null or duration_minutes between 0 and 10080),
  constraint completions_effort_check
    check (perceived_effort is null or perceived_effort between 1 and 10),
  constraint completions_feeling_check check (
    feeling is null
    or feeling in ('very_bad', 'bad', 'neutral', 'good', 'very_good')
  ),
  constraint completions_note_check
    check (note is null or char_length(note) <= 2000)
);

-- The factual counterpart of a planned activity. It carries the values as they
-- were performed, not a live link to a plan activity: a plan activity is
-- replaced wholesale by an edit, so a reference to one would dangle or lie.
create table public.completion_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  completion_id uuid not null,
  personal_activity_id uuid,
  position smallint not null,
  name text not null,
  sport text not null,
  instructions text,
  measurement_mode text not null,
  actual_measurement jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint completion_activities_owner_key unique (id, user_id),
  constraint completion_activities_completion_fkey
    foreign key (completion_id, user_id)
    references public.completions (id, user_id) on delete cascade,
  constraint completion_activities_personal_fkey
    foreign key (personal_activity_id, user_id)
    references public.personal_activities (id, user_id),
  constraint completion_activities_order_key unique (completion_id, position),
  constraint completion_activities_position_check
    check (position between 0 and 99),
  constraint completion_activities_name_check
    check (char_length(trim(name)) between 1 and 120),
  constraint completion_activities_sport_check
    check (char_length(trim(sport)) between 1 and 80),
  constraint completion_activities_instructions_check
    check (instructions is null or char_length(instructions) <= 2000),
  constraint completion_activities_measurement_mode_check check (
    measurement_mode in (
      'sets_reps_load', 'time_distance_pace', 'duration_intensity',
      'skill_repetitions', 'custom'
    )
  ),
  constraint completion_activities_measurement_check
    check (public.is_valid_training_measurement(
      measurement_mode, actual_measurement))
);

-- At most one completion per planned session. A second logging of the same
-- session is an edit of the record that already exists, which is what makes
-- "the completion of this session" a well-defined thing to read. An unplanned
-- completion names no session and is excluded, so a day may hold any number.
create unique index completions_plan_session_key
  on public.completions (user_id, plan_session_id)
  where plan_session_id is not null;

-- History is read by owner, most recent first, over a bounded window.
create index completions_owner_date_idx
  on public.completions (user_id, actual_local_date desc, id);
-- Serves the restricting foreign key and the "does this session carry a
-- completion" test the series sweep in section 4 performs per occurrence.
create index completions_plan_session_idx
  on public.completions (plan_session_id, user_id)
  where plan_session_id is not null;
create index completion_activities_owner_completion_idx
  on public.completion_activities (user_id, completion_id, position);
create index completion_activities_personal_idx
  on public.completion_activities (personal_activity_id, user_id)
  where personal_activity_id is not null;

alter table public.completions enable row level security;
alter table public.completion_activities enable row level security;

revoke all privileges on table public.completions
  from public, anon, authenticated, service_role;
revoke all privileges on table public.completion_activities
  from public, anon, authenticated, service_role;

-- Owners read their own history directly. Every write arrives through the
-- owner-derived transaction in section 3, so no client presents an owner id.
grant select on table public.completions to authenticated;
grant select on table public.completion_activities to authenticated;

create policy completions_owner_select on public.completions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy completion_activities_owner_select on public.completion_activities
  for select to authenticated using ((select auth.uid()) = user_id);

-- 2. What no update may ever move ---------------------------------------------

-- The change function never updates any of these. The triggers state the
-- invariant anyway, so a later privileged path cannot quietly reassign a
-- completion, repoint it at a different planned session, or rewrite the
-- planned values it was measured against.
create function public.completions_reject_immutable_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception using errcode = '42501',
      message = 'A completion owner cannot be reassigned.';
  end if;
  if new.plan_session_id is distinct from old.plan_session_id
    or new.planned_snapshot is distinct from old.planned_snapshot
    or new.timezone_name is distinct from old.timezone_name
  then
    raise exception using errcode = '42501',
      message = 'What a completion was measured against cannot be rewritten.';
  end if;
  return new;
end;
$$;

revoke all privileges on function public.completions_reject_immutable_change()
  from public, anon, authenticated, service_role;

create function public.completion_activities_reject_immutable_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id
    or new.completion_id is distinct from old.completion_id
  then
    raise exception using errcode = '42501',
      message = 'A completed activity cannot change owner or completion.';
  end if;
  return new;
end;
$$;

revoke all privileges on function public.completion_activities_reject_immutable_change()
  from public, anon, authenticated, service_role;

create trigger completions_immutable_facts
  before update on public.completions
  for each row
  execute function public.completions_reject_immutable_change();

create trigger completion_activities_immutable_facts
  before update on public.completion_activities
  for each row
  execute function public.completion_activities_reject_immutable_change();

-- 3. The owner-derived write --------------------------------------------------

create type public.completion_receipt as (
  completion_id uuid,
  revision bigint,
  result text
);

create function public.completion_activity_input_is_valid(p_value jsonb)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_position numeric;
  v_mode text;
begin
  if p_value is null or pg_catalog.jsonb_typeof(p_value) <> 'object'
    or p_value - array[
      'personalActivityId', 'position', 'name', 'sport', 'instructions',
      'measurementMode', 'actualMeasurement'
    ] <> '{}'::jsonb
    or not (p_value ?& array['position', 'name', 'sport', 'measurementMode'])
    or pg_catalog.jsonb_typeof(p_value->'position') <> 'number'
    or pg_catalog.jsonb_typeof(p_value->'name') <> 'string'
    or pg_catalog.jsonb_typeof(p_value->'sport') <> 'string'
    or pg_catalog.jsonb_typeof(p_value->'measurementMode') <> 'string'
  then return false; end if;

  v_position := (p_value->>'position')::numeric;
  v_mode := p_value->>'measurementMode';
  if v_position <> trunc(v_position) or v_position not between 0 and 99
    or pg_catalog.char_length(pg_catalog.btrim(p_value->>'name')) not between 1 and 120
    or pg_catalog.char_length(pg_catalog.btrim(p_value->>'sport')) not between 1 and 80
    or (p_value ? 'instructions'
      and pg_catalog.jsonb_typeof(p_value->'instructions') not in ('string', 'null'))
    or pg_catalog.char_length(coalesce(p_value->>'instructions', '')) > 2000
    or v_mode not in (
      'sets_reps_load', 'time_distance_pace', 'duration_intensity',
      'skill_repetitions', 'custom'
    )
    -- An absent measurement and an explicit null mean the same thing: this
    -- activity records no measured value. Nothing captures one yet.
    or not public.is_valid_training_measurement(
      v_mode, nullif(p_value->'actualMeasurement', 'null'::jsonb))
  then return false; end if;

  if p_value ? 'personalActivityId'
    and pg_catalog.jsonb_typeof(p_value->'personalActivityId') <> 'null'
  then
    if pg_catalog.jsonb_typeof(p_value->'personalActivityId') <> 'string' then
      return false;
    end if;
    perform (p_value->>'personalActivityId')::uuid;
  end if;
  return true;
exception when others then return false;
end;
$$;

revoke all privileges on function public.completion_activity_input_is_valid(jsonb)
  from public, anon, authenticated, service_role;

-- The whole payload, validated before anything is locked or written. A create
-- carries the planned link and the activity list; an edit carries neither,
-- because the planned link is immutable and no activity editor exists yet.
create function public.completion_input_is_valid(
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
        'injuryReported', 'severeFatigueReported', 'activities'
      ] else array[
        'status', 'actualLocalDate', 'actualStartedAt', 'durationMinutes',
        'perceivedEffort', 'feeling', 'note', 'replacementDescription',
        'painReported', 'illnessReported', 'injuryReported',
        'severeFatigueReported'
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

  -- `replaced` means exactly "there is a description of what was done
  -- instead", in both directions.
  if (v_status = 'replaced') <> (
    p_value ? 'replacementDescription'
    and pg_catalog.jsonb_typeof(p_value->'replacementDescription') = 'string'
    and pg_catalog.char_length(
      pg_catalog.btrim(p_value->>'replacementDescription')) between 1 and 500
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

  if p_operation = 'create' then
    if not (p_value ? 'activities')
      or pg_catalog.jsonb_typeof(p_value->'activities') <> 'array'
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
create function public.apply_completion_change(
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
      if exists (
        select 1 from public.completions existing
        where existing.user_id = v_user_id
          and existing.plan_session_id = v_plan_session_id
      ) then
        raise exception using errcode = '22023',
          message = 'That session already has a completion.';
      end if;
    end if;

    insert into public.completions (
      user_id, plan_session_id, status, actual_local_date, timezone_name,
      actual_started_at, duration_minutes, perceived_effort, feeling, note,
      replacement_description, pain_reported, illness_reported, injury_reported,
      severe_fatigue_reported, planned_snapshot, created_at, updated_at
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
      v_snapshot, v_now, v_now
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
      insert into public.completion_activities (
        user_id, completion_id, personal_activity_id, position, name, sport,
        instructions, measurement_mode, actual_measurement, created_at, updated_at
      ) values (
        v_user_id, v_completion_id,
        (v_activity->>'personalActivityId')::uuid,
        (v_activity->>'position')::smallint,
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
    select completion.revision, completion.plan_session_id
    into v_revision, v_plan_session_id
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
    revision = v_revision + 1,
    updated_at = v_now
  where id = p_completion_id and user_id = v_user_id;
  return (p_completion_id, v_revision + 1, 'updated')::public.completion_receipt;
exception
  when unique_violation or foreign_key_violation or check_violation
    or not_null_violation or invalid_datetime_format then
    raise exception using errcode = '22023', message = 'Invalid completion change.';
end;
$$;

revoke all privileges on function public.apply_completion_change(text, uuid, bigint, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.apply_completion_change(text, uuid, bigint, jsonb)
  to authenticated;

-- 4. A session carrying a completion is never hard deleted --------------------

-- `rolling_plan_sweep_series_occurrences` is the only thing in this schema that
-- hard deletes a plan session. M3-14 criterion 8 already promised that a
-- completed occurrence survives a series change, and until now that promise was
-- vacuously true because completions did not exist. This replacement makes it
-- true: the M3-14 body is unchanged except for a fourth exclusion and the count
-- that reports it.
--
-- The exclusions are absolute and all four live here:
--
--   * a locked occurrence is kept and left active - a lock now excludes a
--     session from bulk removal, not only from AI replacement;
--   * an occurrence carrying a completion is kept and left active, because
--     nothing but the owner may alter a completion and removing what it was
--     measured against would do exactly that. The restricting foreign key on
--     `completions.plan_session_id` would refuse the delete anyway; skipping it
--     here is what turns a failed change set into a reported survivor;
--   * an occurrence whose date has already passed is history and is never in
--     scope, whatever its rule date says;
--   * only occurrences of this segment on or after the effective rule date are
--     swept, so the sweep runs forward only.
--
-- `lockedKept` keeps exactly the M3-14 predicate, so the counts an occurrence
-- without a completion produces are unchanged. `completedKept` counts the
-- unlocked survivors, so the two never double-count one occurrence.
--
-- Everything else goes, including an occurrence the owner had edited. Each
-- deletion leaves a `delete` entry with a null `session_id`, which survives the
-- cascade that destroys the row's own earlier entries. A kept occurrence leaves
-- no entry at all, because nothing happened to it.
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
  v_locked_kept integer := 0;
  v_completed_kept integer := 0;
begin
  select pg_catalog.count(*) into v_locked_kept
  from public.rolling_plan_sessions occurrence
  where occurrence.user_id = p_user_id
    and occurrence.series_id = p_series_id
    and occurrence.occurrence_date >= p_from_date
    and occurrence.local_date >= p_today
    and occurrence.is_locked;

  select pg_catalog.count(*) into v_completed_kept
  from public.rolling_plan_sessions occurrence
  where occurrence.user_id = p_user_id
    and occurrence.series_id = p_series_id
    and occurrence.occurrence_date >= p_from_date
    and occurrence.local_date >= p_today
    and not occurrence.is_locked
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
      and not occurrence.is_locked
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
    'lockedKept', v_locked_kept,
    'completedKept', v_completed_kept,
    'nextOrdinal', v_ordinal
  );
end;
$$;

revoke all privileges on function public.rolling_plan_sweep_series_occurrences(
  uuid, uuid, uuid, uuid, date, date, integer, timestamptz
) from public, anon, authenticated, service_role;

-- `apply_rolling_plan_change_set` is re-emitted verbatim from M3-14 with one
-- change: the series-effect entry it composes now carries `completedKept`
-- alongside `lockedKept`, so `end_series` and `edit_series` report a completed
-- survivor the same way they already report a locked one. PL/pgSQL has no
-- partial replacement, so the whole body has to be restated to change one key.

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
        else
          if v_change - array['operation', 'sessionId'] <> '{}'::jsonb then
            raise exception using errcode = '22023', message = 'Invalid rolling plan cancellation.';
          end if;
          update public.rolling_plan_sessions set
            status = 'cancelled', cancelled_at = v_now, updated_at = v_now
          where id = v_session_id and user_id = v_user_id;
        end if;

        -- ADR-017: an occurrence the owner has changed is diverged from its
        -- rule from here on. The materializer never revisits an existing
        -- occurrence, and the divergence is what a later consumer reads.
        update public.rolling_plan_sessions set has_diverged = true
        where id = v_session_id and user_id = v_user_id
          and series_id is not null and not has_diverged;
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

      v_after := public.rolling_plan_session_state(v_user_id, v_session_id);
    end if;

    if v_before is not null and v_before = v_after then
      raise exception using errcode = '22023', message = 'A plan change must change current state.';
    end if;
    insert into public.rolling_plan_change_entries (
      user_id, plan_id, change_set_id, session_id, series_id, local_date,
      ordinal, change_kind, before_state, after_state, created_at
    ) values (
      v_user_id, v_plan.id, v_change_set_id,
      case when v_operation in ('add', 'edit', 'move', 'set_lock', 'cancel')
        then v_session_id else null end,
      case when v_operation = 'add_series' then v_series_id
        when v_operation = 'end_series' then v_series_id
        when v_operation = 'edit_series'
          then coalesce(v_successor_series_id, v_series_id)
        else null end,
      case when v_operation = 'set_recovery_day' then v_local_date else null end,
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
