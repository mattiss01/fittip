-- A6: a saved session's activities can be edited.
--
-- Since A2, Save to library copies a planned session's activities into the
-- entry, and M3-13's `apply_saved_session_change` refused any activity list on
-- an edit: "there is no activity editor anywhere yet". So every entry saved
-- since then showed activities nothing could change. This replaces the
-- function in place, with the same signature, and changes only the edit branch:
--
--   * `p_activities` null keeps the entry's list exactly as it is. That is what
--     the app deployed before this migration sends, so an edit made between
--     this migration and the deploy still means what it meant.
--   * an array replaces the whole list, as the Plan's and the series' editors
--     do: every element is validated first with the same function a create
--     uses, then the old rows go and the submitted ones are written at
--     positions 0..n-1 in array order. The owner still comes from `auth.uid()`
--     and nowhere else, and a personal activity must be the owner's own.
--
-- The revision advances once for the whole edit. Create and delete are
-- unchanged. Grants are restated after the replace, as ADR-019 did, so the
-- function's reach is stated here rather than inherited.

create or replace function public.apply_saved_session_change(
  p_operation text,
  p_saved_session_id uuid default null,
  p_expected_revision bigint default null,
  p_name text default null,
  p_title text default null,
  p_sport text default null,
  p_intent text default null,
  p_expected_duration_minutes integer default null,
  p_note text default null,
  p_activities jsonb default null
)
returns public.saved_session_receipt
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_saved_session_id uuid;
  v_revision bigint;
  v_activity jsonb;
  v_position smallint;
begin
  if v_user_id is null then
    raise exception using errcode = '42501',
      message = 'An authenticated FitTip user is required.';
  end if;
  if p_operation is null
    or p_operation not in ('create', 'edit', 'delete')
  then
    raise exception using errcode = '22023', message = 'Invalid saved session change.';
  end if;

  if p_operation = 'create' then
    -- A create names no existing record and answers to no revision.
    if p_saved_session_id is not null or p_expected_revision is not null
      or p_activities is null
      or pg_catalog.jsonb_typeof(p_activities) <> 'array'
      or pg_catalog.jsonb_array_length(p_activities) > 50
    then
      raise exception using errcode = '22023', message = 'Invalid saved session.';
    end if;
    for v_activity in select value from pg_catalog.jsonb_array_elements(p_activities) loop
      if not public.saved_session_activity_input_is_valid(v_activity) then
        raise exception using errcode = '22023', message = 'Invalid saved session activity.';
      end if;
    end loop;

    insert into public.saved_sessions (
      user_id, name, title, sport, intent, expected_duration_minutes, note,
      created_at, updated_at
    ) values (
      v_user_id, pg_catalog.btrim(p_name), pg_catalog.btrim(p_title),
      pg_catalog.btrim(p_sport), nullif(p_intent, ''),
      p_expected_duration_minutes, nullif(p_note, ''), v_now, v_now
    ) returning id, revision into v_saved_session_id, v_revision;

    for v_activity in select value from pg_catalog.jsonb_array_elements(p_activities) loop
      if v_activity ? 'personalActivityId'
        and pg_catalog.jsonb_typeof(v_activity->'personalActivityId') <> 'null'
        and not exists (
          select 1 from public.personal_activities
          where id = (v_activity->>'personalActivityId')::uuid and user_id = v_user_id
        )
      then
        raise exception using errcode = '22023', message = 'Invalid saved session activity.';
      end if;
      insert into public.saved_session_activities (
        user_id, saved_session_id, personal_activity_id, position,
        name, sport, instructions, measurement_mode, target, created_at, updated_at
      ) values (
        v_user_id, v_saved_session_id,
        (v_activity->>'personalActivityId')::uuid,
        (v_activity->>'position')::smallint,
        pg_catalog.btrim(v_activity->>'name'),
        pg_catalog.btrim(v_activity->>'sport'),
        nullif(v_activity->>'instructions', ''),
        v_activity->>'measurementMode',
        nullif(v_activity->'target', 'null'::jsonb), v_now, v_now
      );
    end loop;
    return (v_saved_session_id, v_revision, 'created')::public.saved_session_receipt;
  end if;

  -- Edit and delete both answer to the revision the owner last read.
  if p_saved_session_id is null or p_expected_revision is null
    or p_expected_revision < 0
    or (p_operation = 'delete' and (
      p_name is not null or p_title is not null or p_sport is not null
      or p_intent is not null or p_expected_duration_minutes is not null
      or p_note is not null or p_activities is not null))
    -- A6: an edit may carry the whole activity list. Null keeps it as saved.
    -- A CASE rather than OR, because OR does not promise to test the type
    -- before the length.
    or (p_operation = 'edit' and p_activities is not null and case
      when pg_catalog.jsonb_typeof(p_activities) = 'array'
        then pg_catalog.jsonb_array_length(p_activities) > 50
      else true
    end)
  then
    raise exception using errcode = '22023', message = 'Invalid saved session change.';
  end if;

  -- Every element is judged before anything is locked or written, so a list
  -- with one bad activity refuses the whole edit.
  if p_operation = 'edit' and p_activities is not null then
    for v_activity in select value from pg_catalog.jsonb_array_elements(p_activities) loop
      if not public.saved_session_activity_input_is_valid(v_activity) then
        raise exception using errcode = '22023', message = 'Invalid saved session activity.';
      end if;
    end loop;
  end if;

  -- ADR-010. The wait is bounded, so a second same-owner save gets an answer
  -- rather than hanging. Locking the one row rather than the whole library
  -- lets two different saved sessions be edited at the same time.
  perform pg_catalog.set_config('lock_timeout', '3s', true);
  begin
    select saved_session.revision into v_revision
    from public.saved_sessions saved_session
    where saved_session.id = p_saved_session_id
      and saved_session.user_id = v_user_id
    for update;
  exception when lock_not_available then
    raise exception using errcode = 'PT409',
      message = 'That saved session changed. Reload and try again.';
  end;

  -- A record another owner holds, or one already deleted elsewhere, is
  -- reported the same way: it changed. That is honest and leaks nothing.
  if v_revision is null or v_revision <> p_expected_revision then
    raise exception using errcode = 'PT409',
      message = 'That saved session changed. Reload and try again.';
  end if;

  if p_operation = 'delete' then
    delete from public.saved_sessions
    where id = p_saved_session_id and user_id = v_user_id;
    return (p_saved_session_id, v_revision, 'deleted')::public.saved_session_receipt;
  end if;

  update public.saved_sessions set
    name = pg_catalog.btrim(p_name),
    title = pg_catalog.btrim(p_title),
    sport = pg_catalog.btrim(p_sport),
    intent = nullif(p_intent, ''),
    expected_duration_minutes = p_expected_duration_minutes,
    note = nullif(p_note, ''),
    revision = v_revision + 1,
    updated_at = v_now
  where id = p_saved_session_id and user_id = v_user_id;

  if p_activities is not null then
    -- A replacement, as the Plan's editor makes one: the rows the owner
    -- removed are gone because they are absent here. Positions are the array's
    -- order, so the submitted `position` values are not trusted to be dense.
    delete from public.saved_session_activities
    where saved_session_id = p_saved_session_id and user_id = v_user_id;
    for v_activity, v_position in
      select value, ordinality - 1
      from pg_catalog.jsonb_array_elements(p_activities) with ordinality
    loop
      if v_activity ? 'personalActivityId'
        and pg_catalog.jsonb_typeof(v_activity->'personalActivityId') <> 'null'
        and not exists (
          select 1 from public.personal_activities
          where id = (v_activity->>'personalActivityId')::uuid and user_id = v_user_id
        )
      then
        raise exception using errcode = '22023', message = 'Invalid saved session activity.';
      end if;
      insert into public.saved_session_activities (
        user_id, saved_session_id, personal_activity_id, position,
        name, sport, instructions, measurement_mode, target, created_at, updated_at
      ) values (
        v_user_id, p_saved_session_id,
        (v_activity->>'personalActivityId')::uuid,
        v_position,
        pg_catalog.btrim(v_activity->>'name'),
        pg_catalog.btrim(v_activity->>'sport'),
        nullif(v_activity->>'instructions', ''),
        v_activity->>'measurementMode',
        nullif(v_activity->'target', 'null'::jsonb), v_now, v_now
      );
    end loop;
  end if;
  return (p_saved_session_id, v_revision + 1, 'updated')::public.saved_session_receipt;
exception
  when unique_violation or foreign_key_violation or check_violation
    or not_null_violation then
    raise exception using errcode = '22023', message = 'Invalid saved session change.';
end;
$$;

revoke all privileges on function public.apply_saved_session_change(
  text, uuid, bigint, text, text, text, text, integer, text, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.apply_saved_session_change(
  text, uuid, bigint, text, text, text, text, integer, text, jsonb
) to authenticated;
