-- A plan proposal may change any session not locked, and suggest cancelling
-- one (owner, 19 Oct 2026; ADR-033, superseding ADR-024 in part).
--
-- The compose screen now sends every session the owner did not lock as
-- offered, so `begin_plan_generation` and the handle table are unchanged: the
-- database still records exactly what was offered for one request. What
-- changes is what the coach may do with an offered session, and what Finish
-- does to it.
--
--   * The coach may suggest cancelling an offered session (`cancels` in the
--     content). Each becomes a proposal item of kind `cancel`, carrying the
--     session's title and the coach's reason. `staged` cancels it, `rejected`
--     keeps it; `staged_beside` is refused.
--   * Finish cancels a replaced session instead of deleting it, so it can be
--     brought back, and cancels a staged cancel item's session, under the
--     same rechecks as before.
--   * `plan_proposal_cancellations` records what a finished review cancelled
--     and what replaced it. The Plan hides a replaced session on its day while
--     that row matches its current cancellation. No cancellation reason is
--     written: those reasons reach the coach as the athlete's own words.
--
-- Four functions are re-emitted from their live definitions and changed only
-- where they name the above. Nothing destructive: constraints are replaced
-- with wider ones, and no column, table or row is removed.

create table public.plan_proposal_cancellations (
  proposal_id uuid not null,
  session_id uuid not null,
  user_id uuid not null,
  replaced_by_session_id uuid,
  -- The session's `cancelled_at` when this review cancelled it. A session
  -- reactivated and cancelled again by hand carries another.
  cancelled_at timestamptz not null,
  constraint plan_proposal_cancellations_pkey
    primary key (proposal_id, session_id),
  constraint plan_proposal_cancellations_owner_fkey
    foreign key (user_id) references public.profiles (user_id) on delete cascade,
  -- Composite, so a row cannot hang on a record held under another owner.
  constraint plan_proposal_cancellations_proposal_fkey
    foreign key (proposal_id, user_id)
    references public.plan_proposals (id, user_id) on delete cascade,
  constraint plan_proposal_cancellations_session_fkey
    foreign key (session_id, user_id)
    references public.rolling_plan_sessions (id, user_id) on delete cascade,
  -- A replacement deleted later leaves the cancellation, now replaced by
  -- nothing, which the Plan shows as an ordinary cancelled session.
  constraint plan_proposal_cancellations_replacement_fkey
    foreign key (replaced_by_session_id, user_id)
    references public.rolling_plan_sessions (id, user_id)
    on delete set null (replaced_by_session_id)
);

create index plan_proposal_cancellations_owner_idx
  on public.plan_proposal_cancellations (user_id);
create index plan_proposal_cancellations_proposal_idx
  on public.plan_proposal_cancellations (proposal_id, user_id);
create index plan_proposal_cancellations_session_idx
  on public.plan_proposal_cancellations (session_id, user_id);
create index plan_proposal_cancellations_replacement_idx
  on public.plan_proposal_cancellations (replaced_by_session_id, user_id);

alter table public.plan_proposal_cancellations enable row level security;

revoke all privileges on table public.plan_proposal_cancellations
from public, anon, authenticated, service_role;

grant select on table public.plan_proposal_cancellations to authenticated;

create policy plan_proposal_cancellations_owner_select
on public.plan_proposal_cancellations
for select
to authenticated
using ((select auth.uid()) = user_id);

-- A suggested cancel is a third kind of item. It names the session through
-- `replaces_session_id`, keeps that session's title for the review, and
-- carries the coach's reason as its rationale.
alter table public.plan_proposal_items
  drop constraint plan_proposal_items_kind_check;
alter table public.plan_proposal_items
  add constraint plan_proposal_items_kind_check
  check (kind in ('session', 'recovery_day', 'cancel'));

alter table public.plan_proposal_items
  drop constraint plan_proposal_items_shape_check;
alter table public.plan_proposal_items
  add constraint plan_proposal_items_shape_check check (
    (kind = 'session'
      and session_id is not null and content_index is not null
      and title is not null and sport is not null
      and expected_duration_minutes is not null and rationale is not null)
    or (kind = 'recovery_day'
      and session_id is null and content_index is null
      and title is null and sport is null and intent is null
      and expected_duration_minutes is null and rationale is null)
    or (kind = 'cancel'
      and session_id is null and content_index is null
      and replaces_session_id is not null
      and title is not null and sport is null and intent is null
      and expected_duration_minutes is null and rationale is not null)
  );

alter table public.plan_proposal_items
  drop constraint plan_proposal_items_replaces_check;
alter table public.plan_proposal_items
  add constraint plan_proposal_items_replaces_check
  check (replaces_session_id is null or kind in ('session', 'cancel'));

-- Twenty-one sessions and twenty-one cancels at most.
alter table public.plan_proposal_items
  drop constraint plan_proposal_items_ordinal_check;
alter table public.plan_proposal_items
  add constraint plan_proposal_items_ordinal_check
  check (ordinal between 0 and 47);

CREATE OR REPLACE FUNCTION public.plan_content_is_valid(p_content jsonb, p_start_date date, p_end_date date)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_session jsonb;
  v_alternative jsonb;
  v_day_count integer;
  v_count integer;
  v_minutes jsonb;
  v_cancel jsonb;
begin
  if p_content is null or pg_catalog.jsonb_typeof(p_content) <> 'object' then
    return false;
  end if;

  if pg_catalog.octet_length(p_content::text) > 16000 then
    return false;
  end if;

  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    return false;
  end if;

  v_day_count := (p_end_date - p_start_date) + 1;
  if v_day_count not between 1 and 7 then
    return false;
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_object_keys(p_content) as key
    where key not in (
      'schemaVersion', 'weekDescription', 'startDate', 'endDate', 'sessions',
      'assumptions', 'uncertainties', 'safetyConsiderations', 'cancels'
    )
  ) then
    return false;
  end if;

  if p_content->>'schemaVersion' is distinct from 'fittip.seven-day-plan.v2'
    or pg_catalog.char_length(coalesce(p_content->>'weekDescription', ''))
       not between 1 and 600
    or (p_content->>'startDate')::date is distinct from p_start_date
    or (p_content->>'endDate')::date is distinct from p_end_date
  then
    return false;
  end if;

  if pg_catalog.jsonb_typeof(p_content->'sessions') <> 'array' then
    return false;
  end if;
  v_count := pg_catalog.jsonb_array_length(p_content->'sessions');
  if v_count not between 0 and (3 * v_day_count) then
    return false;
  end if;

  -- At most three sessions on any one date.
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_content->'sessions') as entry(value)
    group by entry.value->>'date'
    having pg_catalog.count(*) > 3
  ) then
    return false;
  end if;

  for v_session in
    select value from pg_catalog.jsonb_array_elements(p_content->'sessions')
  loop
    if pg_catalog.jsonb_typeof(v_session) <> 'object' then
      return false;
    end if;
    if exists (
      select 1
      from pg_catalog.jsonb_object_keys(v_session) as key
      where key not in (
        'date', 'title', 'sport', 'focus', 'intent', 'durationMinutes',
        'primaryGoalId', 'secondaryGoalIds', 'alternatives', 'rationale',
        'replaces'
      )
    ) then
      return false;
    end if;

    if (v_session->>'date')::date < p_start_date
      or (v_session->>'date')::date > p_end_date
      or pg_catalog.char_length(coalesce(v_session->>'title', ''))
         not between 1 and 120
      or pg_catalog.char_length(coalesce(v_session->>'sport', ''))
         not between 1 and 60
      or pg_catalog.char_length(coalesce(v_session->>'focus', ''))
         not between 1 and 300
      or pg_catalog.char_length(coalesce(v_session->>'intent', ''))
         not between 1 and 300
      or pg_catalog.char_length(coalesce(v_session->>'rationale', ''))
         not between 1 and 300
      or pg_catalog.char_length(coalesce(v_session->>'primaryGoalId', ''))
         not between 1 and 64
    then
      return false;
    end if;

    -- The handle of a session the owner marked replaceable, or absent. Only
    -- its shape is checked here; `finish_plan_generation` holds it to the
    -- marks of the request it answers.
    if v_session ? 'replaces'
      and pg_catalog.jsonb_typeof(v_session->'replaces') <> 'null'
      and (
        pg_catalog.jsonb_typeof(v_session->'replaces') <> 'string'
        or (v_session->>'replaces') !~ '^r[1-9][0-9]?$'
      )
    then
      return false;
    end if;

    v_minutes := v_session->'durationMinutes';
    if pg_catalog.jsonb_typeof(v_minutes) <> 'number'
      or (v_minutes::text)::numeric not between 10 and 240
      or (v_minutes::text)::numeric
         <> pg_catalog.trunc((v_minutes::text)::numeric)
    then
      return false;
    end if;

    if v_session ? 'secondaryGoalIds' and (
      pg_catalog.jsonb_typeof(v_session->'secondaryGoalIds') <> 'array'
      or pg_catalog.jsonb_array_length(v_session->'secondaryGoalIds') > 6
    ) then
      return false;
    end if;

    if v_session ? 'alternatives' then
      if pg_catalog.jsonb_typeof(v_session->'alternatives') <> 'array'
        or pg_catalog.jsonb_array_length(v_session->'alternatives') > 2
      then
        return false;
      end if;
      for v_alternative in
        select value
        from pg_catalog.jsonb_array_elements(v_session->'alternatives')
      loop
        if pg_catalog.jsonb_typeof(v_alternative) <> 'object'
          or exists (
            select 1
            from pg_catalog.jsonb_object_keys(v_alternative) as key
            where key not in ('title', 'whenToChoose')
          )
          or pg_catalog.char_length(coalesce(v_alternative->>'title', ''))
             not between 1 and 120
          or pg_catalog.char_length(
               coalesce(v_alternative->>'whenToChoose', '')
             ) not between 1 and 200
        then
          return false;
        end if;
      end loop;
    end if;
  end loop;

  if p_content ? 'assumptions' and (
    pg_catalog.jsonb_typeof(p_content->'assumptions') <> 'array'
    or pg_catalog.jsonb_array_length(p_content->'assumptions') > 4
  ) then
    return false;
  end if;

  if p_content ? 'uncertainties' and (
    pg_catalog.jsonb_typeof(p_content->'uncertainties') <> 'array'
    or pg_catalog.jsonb_array_length(p_content->'uncertainties') > 3
  ) then
    return false;
  end if;

  if p_content ? 'safetyConsiderations' and (
    pg_catalog.jsonb_typeof(p_content->'safetyConsiderations') <> 'array'
    or pg_catalog.jsonb_array_length(p_content->'safetyConsiderations') > 3
  ) then
    return false;
  end if;

  -- Sessions the coach suggests cancelling, each by the handle of a session
  -- the owner left open (ADR-033). Only the shape is checked here;
  -- `finish_plan_generation` holds each handle to the request it answers.
  if p_content ? 'cancels'
    and pg_catalog.jsonb_typeof(p_content->'cancels') <> 'null'
  then
    if pg_catalog.jsonb_typeof(p_content->'cancels') <> 'array'
      or pg_catalog.jsonb_array_length(p_content->'cancels') > 21
    then
      return false;
    end if;
    for v_cancel in
      select value from pg_catalog.jsonb_array_elements(p_content->'cancels')
    loop
      if pg_catalog.jsonb_typeof(v_cancel) <> 'object'
        or exists (
          select 1
          from pg_catalog.jsonb_object_keys(v_cancel) as key
          where key not in ('replaceHandle', 'reason')
        )
        or pg_catalog.jsonb_typeof(v_cancel->'replaceHandle')
           is distinct from 'string'
        or (v_cancel->>'replaceHandle') !~ '^r[1-9][0-9]?$'
        or pg_catalog.jsonb_typeof(v_cancel->'reason') is distinct from 'string'
        or pg_catalog.char_length(pg_catalog.btrim(v_cancel->>'reason'))
           not between 1 and 160
      then
        return false;
      end if;
    end loop;
  end if;

  return true;
exception
  when others then
    -- A malformed date or number cast is invalid content, not a server error.
    return false;
end;
$function$;

CREATE OR REPLACE FUNCTION public.finish_plan_generation(p_completion_token uuid, p_outcome text, p_schema_version text DEFAULT NULL::text, p_prompt_version text DEFAULT NULL::text, p_provider_code text DEFAULT NULL::text, p_model_code text DEFAULT NULL::text, p_rate_card_version text DEFAULT NULL::text, p_spend_reservation_id uuid DEFAULT NULL::uuid, p_planning_note text DEFAULT NULL::text, p_content jsonb DEFAULT NULL::jsonb, p_sources jsonb DEFAULT NULL::jsonb, p_safe_failure_code text DEFAULT NULL::text, p_regeneration_feedback text DEFAULT NULL::text)
 RETURNS plan_generation_result
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_request public.plan_generation_requests;
  v_note text;
  v_feedback text;
  v_proposal_id uuid;
  v_source jsonb;
  v_ordinal smallint := 0;
  v_kind text;
  v_record uuid;
  v_plan_revision bigint;
  v_named text[];
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'An authenticated FitTip user is required.';
  end if;

  if p_completion_token is null
    or p_outcome is null
    or p_outcome not in ('proposal', 'failed')
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid plan result.';
  end if;

  perform pg_catalog.set_config('lock_timeout', '3s', true);
  begin
    perform pg_catalog.pg_advisory_xact_lock(
      62007,
      pg_catalog.hashtext(v_user_id::text)
    );
  exception
    when lock_not_available then
      raise exception using
        errcode = 'PT409',
        message = 'Your plan changed. Reload and try again.';
  end;

  select * into v_request
  from public.plan_generation_requests
  where user_id = v_user_id and completion_token = p_completion_token
  for update;

  if not found then
    raise exception using
      errcode = 'PT409',
      message = 'That coaching request is no longer open.';
  end if;

  -- Replay. An already finished request returns its recorded result when the
  -- caller repeats the same outcome, and conflicts when it does not: a second
  -- call must never overwrite what the first one persisted.
  if v_request.status <> 'pending' then
    if (v_request.status = 'completed' and p_outcome = 'proposal')
      or (v_request.status = 'failed' and p_outcome = 'failed'
          and v_request.failure_code is not distinct from p_safe_failure_code)
    then
      return (v_request.status, v_request.proposal_id)
        ::public.plan_generation_result;
    end if;
    raise exception using
      errcode = 'PT409',
      message = 'That coaching request is already finished.';
  end if;

  if p_outcome = 'failed' then
    if p_safe_failure_code is null
      or p_safe_failure_code !~ '^[a-z][a-z0-9_]{1,63}$'
    then
      raise exception using
        errcode = '22023',
        message = 'Invalid plan result.';
    end if;
    update public.plan_generation_requests
    set status = 'failed', failure_code = p_safe_failure_code, updated_at = v_now
    where id = v_request.id and user_id = v_user_id;
    return ('failed', null)::public.plan_generation_result;
  end if;

  -- The planning note travels again on finish rather than being read back from
  -- the claim, which stores only its hash. The hash is what proves the text
  -- finish was given is the text begin claimed.
  v_note := public.roadmap_normalize_owner_text(p_planning_note);
  if v_note = '' then v_note := null; end if;

  -- The feedback travels again on finish for the reason the planning note
  -- does, and is proved the same way: the claim stored only a hash, so the
  -- hash is what shows this is the text the claim was made for.
  v_feedback := public.roadmap_normalize_owner_text(p_regeneration_feedback);
  if v_feedback = '' then v_feedback := null; end if;
  if public.roadmap_owner_text_hash(v_feedback)
     is distinct from v_request.regeneration_feedback_hash
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid plan result.';
  end if;
  if public.roadmap_owner_text_hash(v_note)
     is distinct from v_request.planning_note_hash
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid plan result.';
  end if;

  if p_schema_version is distinct from 'fittip.seven-day-plan.v2'
    or p_prompt_version is null
    or p_provider_code is null
    or p_model_code is null
    or p_rate_card_version is null
    or not public.plan_content_is_valid(
      p_content, v_request.requested_start_date, v_request.requested_end_date
    )
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid plan result.';
  end if;

  -- The provider, model and rate card must be a pairing somebody approved, and
  -- a live pairing must carry a reservation while the fixture one must not.
  -- This is what stops a paid call being recorded as a free fixture, and it is
  -- also what the owner-facing "example" label rests on: that label reads
  -- `provider_code`, so the database has to guarantee the code is honest. The
  -- function is the roadmap's; it names no operation, and M3-03's dropped plan
  -- migration used it the same way.
  if not public.roadmap_technical_codes_are_accepted(
    p_provider_code,
    p_model_code,
    p_rate_card_version,
    p_spend_reservation_id is not null
  ) then
    raise exception using
      errcode = '22023',
      message = 'That coaching model is not approved.';
  end if;

  -- A live result must carry a settled reservation belonging to this owner,
  -- for this operation, priced by the same rate card. Without it a proposal
  -- could point at another owner's reservation, or at one that paid for a
  -- roadmap.
  if p_spend_reservation_id is not null then
    -- Settled here, in the transaction that records the proposal, so the two
    -- commit together or neither does. Before this, a reservation the
    -- application failed to settle made the check below refuse a result the
    -- provider had already been paid for, and the proposal was thrown away.
    --
    -- The amount is what the reservation was holding, not the real usage: the
    -- real usage is known only to the caller that just failed to report it.
    -- Charging the ceiling is the conservative direction, and it applies only
    -- to runs where the settle had already gone wrong.
    update public.ai_spend_reservations
    set
      charged_micro_usd = reserved_micro_usd,
      settled_at = pg_catalog.now()
    where id = p_spend_reservation_id
      and user_id = v_user_id
      and operation = 'create_seven_day_plan'
      and rate_card_version = p_rate_card_version
      and settled_at is null;

    -- Asserted separately rather than from the update's row count, because a
    -- reservation the application settled normally matches no row above and is
    -- a perfectly good finish. What has to hold on every path is the same four
    -- things it always did, plus that the reservation is now closed.
    if not exists (
      select 1
      from public.ai_spend_reservations
      where id = p_spend_reservation_id
        and user_id = v_user_id
        and operation = 'create_seven_day_plan'
        and settled_at is not null
        and rate_card_version = p_rate_card_version
    ) then
      raise exception using
        errcode = '22023',
        message = 'Invalid plan result.';
    end if;
  end if;

  -- The proposal this one replaces closes here, with its replacement, and
  -- not before the coach is asked (owner, 17 Oct 2026): a failed answer
  -- leaves it open, the owner's choices on it intact. What the owner had not
  -- decided is declined; what they accepted is applied by the review's own
  -- finish, so the rules about what an ending means stay in one place. One
  -- the owner finished or discarded while waiting is left as they left it.
  if v_request.previous_proposal_id is not null and not exists (
    select 1
    from public.plan_proposal_decisions
    where proposal_id = v_request.previous_proposal_id
      and user_id = v_user_id
  ) then
    insert into public.plan_proposal_item_decisions (
      proposal_id, ordinal, user_id, decision, decided_at
    )
    select item.proposal_id, item.ordinal, v_user_id, 'rejected', v_now
    from public.plan_proposal_items item
    where item.proposal_id = v_request.previous_proposal_id
      and item.user_id = v_user_id
    on conflict (proposal_id, ordinal) do nothing;

    select revision into v_plan_revision
    from public.rolling_plans
    where user_id = v_user_id;

    perform public.finish_plan_proposal_review(
      v_request.previous_proposal_id,
      coalesce(v_plan_revision, 0),
      p_completion_token
    );
  end if;

  insert into public.plan_proposals (
    user_id, generation_request_id, origin, planning_note, schema_version,
    prompt_version, provider_code, model_code, rate_card_version,
    spend_reservation_id, content, source_proposal_id, regeneration_feedback,
    created_at
  ) values (
    v_user_id, v_request.id,
    case when v_request.regeneration_number > 0
      then 'ai_regeneration' else 'ai_initial' end,
    v_note, p_schema_version,
    p_prompt_version, p_provider_code, p_model_code, p_rate_card_version,
    p_spend_reservation_id, p_content, v_request.previous_proposal_id,
    v_feedback, v_now
  )
  returning id into v_proposal_id;

  -- A proposed session may stand in for one the owner left open, and the
  -- coach may suggest cancelling one, each named by its handle (ADR-024,
  -- ADR-033). A handle this request never issued, or one named twice across
  -- both, refuses the whole answer, exactly as invalid content does: half a
  -- proposal is not something the owner asked for.
  select coalesce(pg_catalog.array_agg(named.handle), '{}'::text[])
  into v_named
  from (
    select proposed.value->>'replaces' as handle
    from pg_catalog.jsonb_array_elements(p_content->'sessions') as proposed(value)
    where nullif(proposed.value->>'replaces', '') is not null
    union all
    select cancel.value->>'replaceHandle'
    from pg_catalog.jsonb_array_elements(
      case when pg_catalog.jsonb_typeof(p_content->'cancels') = 'array'
        then p_content->'cancels' else '[]'::jsonb end
    ) as cancel(value)
  ) as named;

  if exists (
    select 1
    from pg_catalog.unnest(v_named) as named(handle)
    where not exists (
      select 1
      from public.plan_generation_replaceable_sessions marked
      where marked.request_id = v_request.id
        and marked.user_id = v_user_id
        and marked.handle = named.handle
    )
  ) or pg_catalog.cardinality(v_named) <> (
    select pg_catalog.count(distinct named.handle)
    from pg_catalog.unnest(v_named) as named(handle)
  ) then
    raise exception using
      errcode = '22023',
      message = 'Invalid plan result.';
  end if;

  -- Items, in the order the surface reads them: by date, a suggested cancel
  -- before the sessions, then proposed sessions in the order the coach listed
  -- them. A cancel item carries the title of the session it names, as it was
  -- when the answer arrived, and the coach's reason as its rationale; one
  -- whose session is gone, cancelled or moved off those days since the
  -- request began is not offered. Only sessions: a free day is
  -- not offered as a recovery day (owner, 17 October 2026). `ordinal` is the
  -- owner's stable handle on a choice; `content_index` is the way back to the
  -- rest of what the coach said.
  insert into public.plan_proposal_items (
    proposal_id, ordinal, user_id, kind, content_index, session_id,
    local_date, title, sport, intent, expected_duration_minutes, rationale,
    replaces_session_id
  )
  select
    v_proposal_id,
    (pg_catalog.row_number() over (
      order by item.local_date, item.kind, item.content_index, item.replaces
    ) - 1)::smallint,
    v_user_id,
    item.kind,
    item.content_index,
    case when item.kind = 'session' then pg_catalog.gen_random_uuid() end,
    item.local_date,
    item.title,
    item.sport,
    item.intent,
    item.expected_duration_minutes,
    item.rationale,
    (
      select marked.session_id
      from public.plan_generation_replaceable_sessions marked
      where marked.request_id = v_request.id
        and marked.user_id = v_user_id
        and marked.handle = item.replaces
    )
  from (
    select
      'session' as kind,
      (session.ordinality - 1)::smallint as content_index,
      (session.value->>'date')::date as local_date,
      pg_catalog.btrim(session.value->>'title') as title,
      pg_catalog.btrim(session.value->>'sport') as sport,
      nullif(session.value->>'intent', '') as intent,
      (session.value->>'durationMinutes')::integer as expected_duration_minutes,
      pg_catalog.btrim(session.value->>'rationale') as rationale,
      nullif(session.value->>'replaces', '') as replaces
    from pg_catalog.jsonb_array_elements(p_content->'sessions')
      with ordinality as session(value, ordinality)
    union all
    select
      'cancel',
      null::smallint,
      target.local_date,
      target.title,
      null::text,
      null::text,
      null::integer,
      pg_catalog.btrim(cancel.value->>'reason'),
      cancel.value->>'replaceHandle'
    from pg_catalog.jsonb_array_elements(
      case when pg_catalog.jsonb_typeof(p_content->'cancels') = 'array'
        then p_content->'cancels' else '[]'::jsonb end
    ) as cancel(value)
    join public.plan_generation_replaceable_sessions marked
      on marked.request_id = v_request.id
      and marked.user_id = v_user_id
      and marked.handle = cancel.value->>'replaceHandle'
    join public.rolling_plan_sessions target
      on target.id = marked.session_id
      and target.user_id = v_user_id
    -- Only a session still active and still on the days asked about: the
    -- review shows those days alone, so an item dated elsewhere could never
    -- be decided and would hold the finish shut.
    where target.status = 'active'
      and target.local_date between v_request.requested_start_date
        and v_request.requested_end_date
  ) as item;

  -- Minimized provenance. Ids and revisions only; no copied source content.
  if p_sources is not null then
    if pg_catalog.jsonb_typeof(p_sources) <> 'array'
      or pg_catalog.jsonb_array_length(p_sources) > 256
    then
      raise exception using
        errcode = '22023',
        message = 'Invalid plan result.';
    end if;
    for v_source in select value from pg_catalog.jsonb_array_elements(p_sources) loop
      v_kind := v_source->>'kind';
      if v_kind is null
        or v_kind not in (
          'goal', 'memory', 'plan_session', 'completion', 'roadmap_version'
        )
      then
        raise exception using
          errcode = '22023',
          message = 'Invalid plan result.';
      end if;
      begin
        v_record := (v_source->>'recordId')::uuid;
      exception when others then
        raise exception using
          errcode = '22023',
          message = 'Invalid plan result.';
      end;
      insert into public.plan_proposal_sources (
        proposal_id, ordinal, user_id, source_kind, record_id,
        revision_id, revision_number
      ) values (
        v_proposal_id, v_ordinal, v_user_id, v_kind, v_record,
        case
          when pg_catalog.jsonb_typeof(v_source->'revisionId') = 'string'
          then (v_source->>'revisionId')::uuid
        end,
        case
          when pg_catalog.jsonb_typeof(v_source->'revisionNumber') = 'number'
          then (v_source->>'revisionNumber')::bigint
        end
      );
      v_ordinal := v_ordinal + 1;
    end loop;
  end if;

  update public.plan_generation_requests
  set status = 'completed', proposal_id = v_proposal_id, updated_at = v_now
  where id = v_request.id and user_id = v_user_id;

  return ('completed', v_proposal_id)::public.plan_generation_result;
exception
  when check_violation or invalid_datetime_format or invalid_text_representation then
    raise exception using errcode = '22023', message = 'Invalid plan result.';
end;
$function$;

CREATE OR REPLACE FUNCTION public.decide_plan_proposal_item(p_proposal_id uuid, p_ordinal integer, p_decision text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'An authenticated FitTip user is required.';
  end if;

  if p_proposal_id is null
    or p_ordinal is null
    or p_ordinal not between 0 and 47
    or p_decision is null
    or p_decision not in ('staged', 'staged_beside', 'rejected', 'proposed')
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid plan proposal decision.';
  end if;

  if not exists (
    select 1 from public.plan_proposal_items
    where proposal_id = p_proposal_id
      and ordinal = p_ordinal::smallint
      and user_id = v_user_id
  ) then
    raise exception using
      errcode = 'PT409',
      message = 'That proposed item is no longer available.';
  end if;

  -- The same lock the finish and the discard take. Without it, a choice made in
  -- one tab could read "not finished" just before another tab's finish
  -- committed, and then write after it — leaving the permanent record saying an
  -- item was staged that never entered the plan. Held, the terminal-row check
  -- below cannot be overtaken, and the finish sees a stable set of choices.
  perform pg_catalog.set_config('lock_timeout', '3s', true);
  begin
    perform pg_catalog.pg_advisory_xact_lock(
      62008,
      pg_catalog.hashtext(v_user_id::text)
    );
  exception
    when lock_not_available then
      raise exception using
        errcode = 'PT409',
        message = 'Your plan changed. Reload and try again.';
  end;

  if exists (
    select 1 from public.plan_proposal_decisions
    where proposal_id = p_proposal_id and user_id = v_user_id
  ) then
    raise exception using
      errcode = 'PT433',
      message = 'That review is already finished.';
  end if;

  -- "Add beside" is a choice about the session an item would replace, so an
  -- item that replaces nothing does not have it, and neither does a suggested
  -- cancel: there is nothing to add (ADR-033).
  if p_decision = 'staged_beside' and not exists (
    select 1 from public.plan_proposal_items
    where proposal_id = p_proposal_id
      and ordinal = p_ordinal::smallint
      and user_id = v_user_id
      and kind = 'session'
      and replaces_session_id is not null
  ) then
    raise exception using
      errcode = '22023',
      message = 'Invalid plan proposal decision.';
  end if;

  if p_decision = 'proposed' then
    delete from public.plan_proposal_item_decisions
    where proposal_id = p_proposal_id
      and ordinal = p_ordinal::smallint
      and user_id = v_user_id;
    return;
  end if;

  insert into public.plan_proposal_item_decisions (
    proposal_id, ordinal, user_id, decision, decided_at
  ) values (
    p_proposal_id, p_ordinal::smallint, v_user_id, p_decision,
    pg_catalog.clock_timestamp()
  )
  on conflict (proposal_id, ordinal) do update
  set decision = excluded.decision, decided_at = excluded.decided_at;
end;
$function$;

CREATE OR REPLACE FUNCTION public.finish_plan_proposal_review(p_proposal_id uuid, p_expected_plan_revision bigint, p_idempotency_key uuid)
 RETURNS plan_review_receipt
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_existing public.plan_proposal_decisions;
  v_unresolved integer;
  v_changes jsonb;
  v_applied smallint;
  v_cancels jsonb;
  v_cancel_count smallint;
  v_receipt public.rolling_plan_change_receipt;
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'An authenticated FitTip user is required.';
  end if;

  if p_proposal_id is null
    or p_expected_plan_revision is null
    or p_expected_plan_revision < 0
    or p_idempotency_key is null
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid plan review.';
  end if;

  if not exists (
    select 1 from public.plan_proposals
    where id = p_proposal_id and user_id = v_user_id
  ) then
    raise exception using
      errcode = 'PT409',
      message = 'That proposal is no longer available.';
  end if;

  perform pg_catalog.set_config('lock_timeout', '3s', true);
  begin
    perform pg_catalog.pg_advisory_xact_lock(
      62008,
      pg_catalog.hashtext(v_user_id::text)
    );
  exception
    when lock_not_available then
      raise exception using
        errcode = 'PT409',
        message = 'Your plan changed. Reload and try again.';
  end;

  -- Replay. A repeated finish returns what the first one did; a finish after a
  -- discard is a conflict, because there is nothing left to apply and saying
  -- 'applied' would be untrue.
  select * into v_existing
  from public.plan_proposal_decisions
  where proposal_id = p_proposal_id and user_id = v_user_id;
  if found then
    if v_existing.decision <> 'applied' then
      raise exception using
        errcode = 'PT433',
        message = 'That review is already finished.';
    end if;
    return (
      v_existing.proposal_id, v_existing.decision, v_existing.applied_count,
      v_existing.change_set_id, v_existing.plan_revision, 'replayed'
    )::public.plan_review_receipt;
  end if;

  select pg_catalog.count(*) into v_unresolved
  from public.plan_proposal_items item
  left join public.plan_proposal_item_decisions decision
    on decision.proposal_id = item.proposal_id
    and decision.ordinal = item.ordinal
    and decision.user_id = item.user_id
  where item.proposal_id = p_proposal_id
    and item.user_id = v_user_id
    and decision.decision is null;

  if v_unresolved > 0 then
    raise exception using
      errcode = 'PT432',
      message = 'Every proposed item needs a choice before you can finish.';
  end if;

  select
    pg_catalog.jsonb_agg(change.entry order by change.local_date, change.ordinal),
    pg_catalog.count(*)::smallint
  into v_changes, v_applied
  from (
    select
      staged.local_date,
      staged.ordinal,
      case staged.kind
        when 'recovery_day' then pg_catalog.jsonb_build_object(
          'operation', 'set_recovery_day',
          'localDate', staged.local_date::text,
          'isRecoveryDay', true
        )
        else pg_catalog.jsonb_build_object(
          'operation', 'add',
          'sessionId', staged.session_id,
          'session', pg_catalog.jsonb_build_object(
            'localDate', staged.local_date::text,
            -- The nth position on this date that no active session holds,
            -- where n is this item's place among the date's staged sessions.
            -- Not `max + n`: an owner who has moved a session to 99 would push
            -- that past the 0-99 bound and the whole finish would be refused.
            -- A date holds at most ten active sessions, so a free slot always
            -- exists below 100.
            'position', (
              select slot
              from pg_catalog.generate_series(0, 99) as slot
              where not exists (
                select 1
                from public.rolling_plan_sessions existing
                where existing.user_id = v_user_id
                  and existing.local_date = staged.local_date
                  and existing.status = 'active'
                  and existing.position = slot
              )
              order by slot
              offset staged.date_rank - 1
              limit 1
            )::smallint,
            'title', staged.title,
            'sport', staged.sport,
            'intent', staged.intent,
            'expectedDurationMinutes', staged.expected_duration_minutes,
            'activities', '[]'::jsonb
          )
        )
      end as entry
    from (
      select
        item.*,
        pg_catalog.row_number() over (
          partition by item.local_date, item.kind order by item.ordinal
        ) as date_rank
      from public.plan_proposal_items item
      join public.plan_proposal_item_decisions decision
        on decision.proposal_id = item.proposal_id
        and decision.ordinal = item.ordinal
        and decision.user_id = item.user_id
      where item.proposal_id = p_proposal_id
        and item.user_id = v_user_id
        and decision.decision in ('staged', 'staged_beside')
        -- A cancel item adds nothing; it is the second half below.
        and item.kind <> 'cancel'
        -- A staged rest day on a date that is already one is a choice whose
        -- outcome already holds. Sending it would be refused by the change
        -- function as a change that changes nothing, and that refusal would
        -- take every other staged item down with it. It is left out, and it
        -- is not counted as applied, because nothing was.
        and not (
          item.kind = 'recovery_day'
          and exists (
            select 1
            from public.rolling_plan_recovery_days recovery
            where recovery.user_id = v_user_id
              and recovery.local_date = item.local_date
          )
        )
    ) as staged
  ) as change;

  -- The other half of "replace", and a suggested cancel the owner staged
  -- (ADR-033): the owner's session is cancelled in the change set that adds
  -- the one standing in for it, so the swap happens whole or not at all.
  -- Replacing cancels and no longer deletes, so the session can be brought
  -- back. Four things are checked again here, because the mark is as old as
  -- the request: the session is still active, not behind today, still on one
  -- of the days asked about, and has no training logged against it. One that
  -- fails any of them is left alone (a replacing session is then added beside
  -- it, which is what the review shows for such an item). A session with a
  -- log is never cancelled here.
  select
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'sessionId', target.id,
        'replacedBy', case when item.kind = 'session' then item.session_id end
      )
      order by target.local_date, target.position, target.id
    ),
    pg_catalog.count(*) filter (where item.kind = 'cancel')::smallint
  into v_cancels, v_cancel_count
  from public.plan_proposal_items item
  join public.plan_proposal_item_decisions decision
    on decision.proposal_id = item.proposal_id
    and decision.ordinal = item.ordinal
    and decision.user_id = item.user_id
  join public.rolling_plan_sessions target
    on target.id = item.replaces_session_id
    and target.user_id = v_user_id
  where item.proposal_id = p_proposal_id
    and item.user_id = v_user_id
    and item.kind in ('session', 'cancel')
    and decision.decision = 'staged'
    and target.status = 'active'
    and target.local_date >= (
      select (pg_catalog.timezone(profile.timezone_name, v_now))::date
      from public.profiles profile
      where profile.user_id = v_user_id
    )
    -- Only a session this owner left open for this very proposal, and only
    -- while it is still on one of the days that proposal was asked about. A
    -- session moved elsewhere since is no longer the one the owner offered
    -- for those days, and the review, which reads those days, cannot show it.
    and exists (
      select 1
      from public.plan_proposals proposal
      join public.plan_generation_requests request
        on request.id = proposal.generation_request_id
        and request.user_id = proposal.user_id
      join public.plan_generation_replaceable_sessions marked
        on marked.request_id = request.id
        and marked.user_id = request.user_id
      where proposal.id = p_proposal_id
        and proposal.user_id = v_user_id
        and marked.session_id = target.id
        and target.local_date between request.requested_start_date
          and request.requested_end_date
    )
    and not exists (
      select 1 from public.completions completion
      where completion.user_id = v_user_id
        and completion.plan_session_id = target.id
    );

  -- A staged cancel counts as applied; a replacement was already counted by
  -- the session it adds.
  v_applied := coalesce(v_applied, 0) + coalesce(v_cancel_count, 0);

  if v_cancels is not null then
    v_changes := (
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'operation', 'cancel',
          'sessionId', entry.value->'sessionId'
        )
        order by entry.ordinality
      )
      from pg_catalog.jsonb_array_elements(v_cancels)
        with ordinality as entry(value, ordinality)
    ) || coalesce(v_changes, '[]'::jsonb);
  end if;

  if v_applied = 0 then
    insert into public.plan_proposal_decisions (
      proposal_id, user_id, decision, applied_count, decided_at
    ) values (p_proposal_id, v_user_id, 'applied', 0, v_now);
    return (p_proposal_id, 'applied', 0::smallint, null::uuid, null::bigint, 'applied')
      ::public.plan_review_receipt;
  end if;

  -- The plan's single door. Every refusal it can raise — a stale revision, a
  -- past date, a date already holding ten sessions — propagates unchanged, and
  -- the terminal row below is never written when one does.
  v_receipt := public.apply_rolling_plan_change_set(
    p_expected_plan_revision, p_idempotency_key, 'owner_ai_proposal', v_changes
  );

  -- What this review cancelled, with the session that replaced it, and the
  -- cancellation it is about: a session brought back and later cancelled by
  -- hand no longer matches, so the Plan shows it again.
  if v_cancels is not null then
    insert into public.plan_proposal_cancellations (
      proposal_id, session_id, user_id, replaced_by_session_id, cancelled_at
    )
    select
      p_proposal_id,
      target.id,
      v_user_id,
      (entry.value->>'replacedBy')::uuid,
      target.cancelled_at
    from pg_catalog.jsonb_array_elements(v_cancels) as entry(value)
    join public.rolling_plan_sessions target
      on target.id = (entry.value->>'sessionId')::uuid
      and target.user_id = v_user_id
      and target.status = 'cancelled';
  end if;

  insert into public.plan_proposal_decisions (
    proposal_id, user_id, decision, applied_count, change_set_id,
    plan_revision, decided_at
  ) values (
    p_proposal_id, v_user_id, 'applied', v_applied, v_receipt.change_set_id,
    v_receipt.plan_revision, v_now
  );

  return (
    p_proposal_id, 'applied', v_applied, v_receipt.change_set_id,
    v_receipt.plan_revision, 'applied'
  )::public.plan_review_receipt;
end;
$function$;

revoke all privileges on function public.plan_content_is_valid(jsonb, date, date)
from public, anon, authenticated, service_role;

revoke all privileges on function public.finish_plan_generation(
  uuid, text, text, text, text, text, text, uuid, text, jsonb, jsonb, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.finish_plan_generation(
  uuid, text, text, text, text, text, text, uuid, text, jsonb, jsonb, text, text
) to authenticated;

revoke all privileges on function public.decide_plan_proposal_item(uuid, integer, text)
from public, anon, authenticated, service_role;
grant execute on function public.decide_plan_proposal_item(uuid, integer, text)
to authenticated;

revoke all privileges on function public.finish_plan_proposal_review(uuid, bigint, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.finish_plan_proposal_review(uuid, bigint, uuid)
to authenticated;
