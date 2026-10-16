-- The database half of "Fix in passing" (owner, 15 Oct 2026). Four changes,
-- each re-issuing a function from the migration that last defined it with one
-- edit, so the rest of each body is exactly what was applied before.
--
--   1. One saved session per title. Two saves of one session, and older
--      entries once told apart only by name, looked identical in the library
--      and every picker. Titles compare as the activity library's names do
--      (`20260927094109`): case-insensitively, trimmed, inner spaces
--      collapsed. Entries that already share a title are renamed rather than
--      deleted (owner): the oldest keeps it, later ones become "Title (2)",
--      "Title (3)". A save that meets a taken title raises PT434, which the
--      app answers with "Update it" or "Keep both".
--   2. A typed sport joins the owner's sports in one statement. It was read
--      and then written by the application, so a sport removed in Settings
--      in between came back. `keep_sports` runs as the caller, under the
--      profile's own column grant and RLS, and appends under the row lock.
--   3. Asking again is refused when the roadmap in force is no longer the one
--      the declined proposal was made under. Only a hand-made request could
--      reach it; the page offers asking again on the newest proposal only.
--   4. `apply_completion_change` answers a malformed number such as a
--      `position` of "1.0" with 22023 rather than a raw 22P02.

-- ---- 1. One saved session per title: existing entries --------------------

-- Entry by entry, oldest first, so each later copy takes the first number
-- whose title no entry of that owner holds yet, a "Title (2)" written by the
-- owner included. A title holds 120 characters, so the base gives way to the
-- number.
do $$
declare
  v_entry record;
  v_copy integer;
  v_candidate text;
begin
  for v_entry in
    select entry.id, entry.user_id, entry.title
    from public.saved_sessions as entry
    where exists (
      select 1
      from public.saved_sessions as earlier
      where earlier.user_id = entry.user_id
        and pg_catalog.lower(pg_catalog.btrim(
          pg_catalog.regexp_replace(earlier.title, '\s+', ' ', 'g')))
          = pg_catalog.lower(pg_catalog.btrim(
            pg_catalog.regexp_replace(entry.title, '\s+', ' ', 'g')))
        and (earlier.created_at, earlier.id) < (entry.created_at, entry.id)
    )
    order by entry.created_at, entry.id
  loop
    v_copy := 2;
    loop
      v_candidate := pg_catalog.rtrim(pg_catalog.left(
        pg_catalog.btrim(v_entry.title),
        120 - pg_catalog.char_length(' (' || v_copy || ')')
      )) || ' (' || v_copy || ')';
      exit when not exists (
        select 1
        from public.saved_sessions as other
        where other.user_id = v_entry.user_id
          and pg_catalog.lower(pg_catalog.btrim(
            pg_catalog.regexp_replace(other.title, '\s+', ' ', 'g')))
            = pg_catalog.lower(pg_catalog.btrim(
              pg_catalog.regexp_replace(v_candidate, '\s+', ' ', 'g')))
      );
      v_copy := v_copy + 1;
    end loop;
    update public.saved_sessions
    set
      title = v_candidate,
      name = v_candidate,
      revision = revision + 1,
      updated_at = pg_catalog.clock_timestamp()
    where id = v_entry.id;
  end loop;
end;
$$;

create unique index saved_sessions_title_key
  on public.saved_sessions (
    user_id,
    pg_catalog.lower(
      pg_catalog.btrim(pg_catalog.regexp_replace(title, '\s+', ' ', 'g'))
    )
  );

-- ---- 2. A typed sport joins the owner's sports in one write ---------------

-- Names are kept as typed, trimmed. One that is empty, longer than 60
-- characters or holds a comma stays where it was typed (the list is sent with
-- commas between its names), as does one the owner already has in any case.
-- Up to the list's limit of 100; past it the record keeps its sport and the
-- list is simply not longer.
create function public.keep_sports(p_names text[])
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.profiles as profile
  set sports = profile.sports || array(
    select fresh.name
    from (
      select distinct on (pg_catalog.lower(typed.name)) typed.name, given.ord
      from pg_catalog.unnest(p_names) with ordinality as given(raw, ord)
      cross join lateral (select pg_catalog.btrim(given.raw) as name) as typed
      where typed.name <> ''
        and pg_catalog.char_length(typed.name) <= 60
        and pg_catalog.strpos(typed.name, ',') = 0
        and not exists (
          select 1
          from pg_catalog.unnest(profile.sports) as owned(sport)
          where pg_catalog.lower(owned.sport) = pg_catalog.lower(typed.name)
        )
      order by pg_catalog.lower(typed.name), given.ord
    ) as fresh
    order by fresh.ord
    limit greatest(0, 100 - pg_catalog.cardinality(profile.sports))
  )
  where profile.user_id = (select auth.uid());
$$;

revoke all privileges on function public.keep_sports(text[])
  from public, anon, authenticated, service_role;
grant execute on function public.keep_sports(text[]) to authenticated;

-- ---- 1. One saved session per title: the function --------------------------

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
  v_constraint text;
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
  when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    -- Its own code: the surface offers to update the entry with that title
    -- or to keep both under another (owner, 15 Oct 2026).
    if v_constraint = 'saved_sessions_title_key' then
      raise exception using errcode = 'PT434',
        message = 'A saved session with that title already exists.';
    end if;
    raise exception using errcode = '22023', message = 'Invalid saved session change.';
  when foreign_key_violation or check_violation
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

-- ---- 3. Asking again is tied to its roadmap -------------------------------

CREATE OR REPLACE FUNCTION public.begin_roadmap_generation(p_idempotency_key text, p_request_fingerprint text, p_start_date date, p_end_date date, p_expected_head_revision bigint, p_planning_note text DEFAULT NULL::text, p_previous_proposal_id uuid DEFAULT NULL::uuid, p_regeneration_feedback text DEFAULT NULL::text, p_change_roadmap boolean DEFAULT false)
 RETURNS public.roadmap_generation_receipt
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  v_user_id uuid;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_existing public.roadmap_generation_requests;
  v_head_revision bigint;
  v_note text;
  v_feedback text;
  v_previous public.roadmap_proposals;
  v_previous_request public.roadmap_generation_requests;
  v_regeneration integer := 0;
  v_changes_roadmap boolean := false;
  v_receipt public.roadmap_generation_receipt;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'An authenticated FitTip user is required.';
  end if;

  if not exists (
    select 1 from public.profiles where user_id = v_user_id
  ) then
    raise exception using
      errcode = '23503',
      message = 'A FitTip profile is required.';
  end if;

  if p_idempotency_key is null
    or pg_catalog.char_length(p_idempotency_key) not between 16 and 128
    or p_request_fingerprint is null
    or pg_catalog.char_length(p_request_fingerprint) not between 16 and 256
    or p_start_date is null
    or p_end_date is null
    or p_expected_head_revision is null
    or p_expected_head_revision < 0
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid roadmap request.';
  end if;

  -- Decision 1: four to fifty-two weeks, and a start no earlier than the day
  -- before UTC today. The single day of slack is deliberate: the owner's local
  -- today can legitimately be one day behind or ahead of the server's.
  if p_start_date < (v_now at time zone 'utc')::date - 1
    or p_end_date < p_start_date + 27
    or p_end_date > p_start_date + 365
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid roadmap request.';
  end if;

  v_note := public.roadmap_normalize_owner_text(p_planning_note);
  if v_note = '' then v_note := null; end if;
  v_feedback := public.roadmap_normalize_owner_text(p_regeneration_feedback);
  if v_feedback = '' then v_feedback := null; end if;

  if v_note is not null and pg_catalog.char_length(v_note) > 1000 then
    raise exception using
      errcode = '22023',
      message = 'Invalid roadmap request.';
  end if;
  if v_feedback is not null and pg_catalog.char_length(v_feedback) > 500 then
    raise exception using
      errcode = '22023',
      message = 'Invalid roadmap request.';
  end if;

  -- Same key, same fingerprint replays the claim, returning the stored status —
  -- pending, completed, or failed — and never 'claimed'. That is the whole
  -- discriminator: only the fresh insert below reports 'claimed', so only the
  -- caller that actually opened the attempt invokes the provider. A different
  -- fingerprint under the same key is a conflict, not a silent second call.
  select * into v_existing
  from public.roadmap_generation_requests
  where user_id = v_user_id
    and idempotency_key = p_idempotency_key;

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
      v_existing.regeneration_number,
      v_existing.proposal_id
    )::public.roadmap_generation_receipt;
  end if;

  perform pg_catalog.set_config('lock_timeout', '3s', true);
  begin
    perform pg_catalog.pg_advisory_xact_lock(
      62005,
      pg_catalog.hashtext(v_user_id::text)
    );
  exception
    when lock_not_available then
      raise exception using
        errcode = 'PT409',
        message = 'Your roadmap changed. Reload and try again.';
  end;

  select coalesce(revision, 0) into v_head_revision
  from public.roadmap_heads
  where user_id = v_user_id;
  v_head_revision := coalesce(v_head_revision, 0);

  if v_head_revision <> p_expected_head_revision then
    raise exception using
      errcode = 'PT409',
      message = 'Your roadmap changed. Reload and try again.';
  end if;

  if p_previous_proposal_id is null then
    -- An initial request carries no feedback at all.
    if v_feedback is not null then
      raise exception using
        errcode = '22023',
        message = 'Invalid roadmap request.';
    end if;
    v_regeneration := 0;
    -- ADR-028. A request to change the roadmap in force says so, and there has
    -- to be one. Whether there is one is read here, never taken from the caller.
    v_changes_roadmap := coalesce(p_change_roadmap, false);
    if v_changes_roadmap and not exists (
      select 1 from public.roadmap_heads
      where user_id = v_user_id and current_version_id is not null
    ) then
      raise exception using
        errcode = '22023',
        message = 'Invalid roadmap request.';
    end if;
  else
    -- A regeneration needs an owned, rejected immediate predecessor, the same
    -- horizon, and non-empty feedback. The ceiling is enforced here, before any
    -- provider call, because a fourth round must cost nothing.
    if v_feedback is null then
      raise exception using
        errcode = '22023',
        message = 'Invalid roadmap request.';
    end if;

    select * into v_previous
    from public.roadmap_proposals
    where id = p_previous_proposal_id
      and user_id = v_user_id;

    if not found then
      raise exception using
        errcode = 'PT409',
        message = 'That proposal is no longer available.';
    end if;

    if not exists (
      select 1
      from public.roadmap_proposal_decisions
      where proposal_id = v_previous.id
        and user_id = v_user_id
        and decision = 'rejected'
    ) then
      raise exception using
        errcode = 'PT409',
        message = 'Decline that proposal before asking for another.';
    end if;

    select * into v_previous_request
    from public.roadmap_generation_requests
    where id = v_previous.generation_request_id
      and user_id = v_user_id;

    if not found
      or v_previous_request.requested_start_date <> p_start_date
      or v_previous_request.requested_end_date <> p_end_date
    then
      raise exception using
        errcode = '22023',
        message = 'Invalid roadmap request.';
    end if;

    -- Asked again under the roadmap its predecessor was made under, or not
    -- at all: otherwise the coach is sent a newer roadmap beside an outline
    -- made from an older one (15 Oct 2026).
    if v_previous_request.expected_head_revision <> v_head_revision then
      raise exception using
        errcode = 'PT409',
        message = 'Your roadmap changed. Reload and try again.';
    end if;

    v_regeneration := v_previous_request.regeneration_number + 1;
    -- Another answer to a change request is a change request: inherited from
    -- the predecessor, whatever the caller sent.
    v_changes_roadmap := v_previous_request.changes_roadmap;
    if v_regeneration > 3 then
      raise exception using
        errcode = 'PT429',
        message = 'This roadmap has reached its regeneration limit.';
    end if;
  end if;

  begin
    insert into public.roadmap_generation_requests (
      user_id,
      idempotency_key,
      request_fingerprint,
      requested_start_date,
      requested_end_date,
      expected_head_revision,
      previous_proposal_id,
      regeneration_number,
      planning_note_hash,
      regeneration_feedback_hash,
      changes_roadmap,
      status,
      created_at,
      updated_at
    )
    values (
      v_user_id,
      p_idempotency_key,
      p_request_fingerprint,
      p_start_date,
      p_end_date,
      p_expected_head_revision,
      p_previous_proposal_id,
      v_regeneration,
      public.roadmap_owner_text_hash(v_note),
      public.roadmap_owner_text_hash(v_feedback),
      v_changes_roadmap,
      'pending',
      v_now,
      v_now
    )
    -- The row is stored 'pending'; the receipt reports 'claimed'. Only this path
    -- runs for the caller that won the insert, so 'claimed' is the one state that
    -- authorizes a provider call. A replay above returns the stored 'pending'
    -- instead, and stops.
    returning id, completion_token, 'claimed', regeneration_number, proposal_id
    into v_receipt;
  exception
    when unique_violation then
      -- M3-09. The key was claimed by a concurrent caller between this
      -- transaction's replay read and its insert. That is a replay, not a
      -- failure, and it is answered exactly as the sequential replay above is:
      -- the fingerprint decides, and the stored receipt is returned unchanged.
      -- The stored status can only be 'pending' here, so this path never
      -- reports 'claimed' and never authorizes a second provider call.
      select * into v_existing
      from public.roadmap_generation_requests
      where user_id = v_user_id
        and idempotency_key = p_idempotency_key;

      if not found then
        -- The violation was not this key's. Nothing about it is understood, so
        -- nothing is claimed about it either.
        raise;
      end if;

      if v_existing.request_fingerprint is distinct from p_request_fingerprint
      then
        raise exception using
          errcode = 'PT409',
          message = 'That coaching request changed. Reload and try again.';
      end if;

      return (
        v_existing.id,
        v_existing.completion_token,
        v_existing.status,
        v_existing.regeneration_number,
        v_existing.proposal_id
      )::public.roadmap_generation_receipt;
  end;

  return v_receipt;
end;
$$;

revoke all privileges on function public.begin_roadmap_generation(
  text, text, date, date, bigint, text, uuid, text, boolean
) from public, anon, authenticated, service_role;
grant execute on function public.begin_roadmap_generation(
  text, text, date, date, bigint, text, uuid, text, boolean
) to authenticated;

-- ---- 4. A malformed number is an invalid change ---------------------------

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
