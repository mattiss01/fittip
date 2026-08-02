-- M2-03 guided onboarding
--
-- Draft content is owner-scoped, read-only through the Data API, and writable
-- only through apply_onboarding_change. Publication delegates destination
-- mutations to the accepted goal and memory boundaries inside one transaction.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated, service_role;

alter table public.memory_items
add column intake_field_key text;

alter table public.memory_items
add constraint memory_items_intake_field_key_check check (
  intake_field_key is null
  or (
    provenance = 'intake_confirmed'
    and char_length(intake_field_key) between 1 and 80
  )
);

create unique index memory_items_owner_intake_field_key_idx
  on public.memory_items (user_id, intake_field_key)
  where intake_field_key is not null;

create type public.onboarding_change_receipt as (
  draft_id uuid,
  draft_revision bigint,
  result text,
  idempotency_key uuid,
  publication_id uuid,
  goal_collection_revision bigint,
  memory_collection_revision bigint
);

create table public.onboarding_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  revision bigint not null default 0,
  current_step smallint not null default 1,
  training_status text,
  available_days text[] not null default '{}',
  sessions_per_week smallint,
  session_duration_minutes smallint,
  access_labels text[] not null default '{}',
  timezone_name text,
  units_system text,
  idempotency_key uuid not null default gen_random_uuid(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint onboarding_drafts_owner_fkey
    foreign key (user_id)
    references public.profiles (user_id)
    on delete cascade,
  constraint onboarding_drafts_owner_key unique (id, user_id),
  constraint onboarding_drafts_idempotency_key
    unique (user_id, idempotency_key),
  constraint onboarding_drafts_revision_check check (revision >= 0),
  constraint onboarding_drafts_step_check check (current_step between 1 and 6),
  constraint onboarding_drafts_training_status_check check (
    training_status is null or training_status in ('current', 'none')
  ),
  constraint onboarding_drafts_days_check check (
    cardinality(available_days) <= 7
  ),
  constraint onboarding_drafts_sessions_check check (
    sessions_per_week is null or sessions_per_week between 1 and 14
  ),
  constraint onboarding_drafts_duration_check check (
    session_duration_minutes is null
    or session_duration_minutes between 5 and 1440
  ),
  constraint onboarding_drafts_access_check check (
    cardinality(access_labels) <= 10
  ),
  constraint onboarding_drafts_timezone_check check (
    timezone_name is null or char_length(timezone_name) between 1 and 100
  ),
  constraint onboarding_drafts_units_check check (
    units_system is null or units_system in ('metric', 'imperial')
  ),
  constraint onboarding_drafts_expiry_check check (expires_at > created_at)
);

create table public.onboarding_training_activities (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null,
  user_id uuid not null,
  position smallint not null,
  name text not null,
  sessions_per_week smallint not null,
  duration_minutes smallint not null,
  detail text,
  constraint onboarding_training_activities_owner_fkey
    foreign key (user_id)
    references public.profiles (user_id)
    on delete cascade,
  constraint onboarding_training_activities_draft_fkey
    foreign key (draft_id, user_id)
    references public.onboarding_drafts (id, user_id)
    on delete cascade,
  constraint onboarding_training_activities_position_key
    unique (draft_id, position),
  constraint onboarding_training_activities_position_check
    check (position between 1 and 10),
  constraint onboarding_training_activities_name_check
    check (char_length(trim(name)) between 1 and 60),
  constraint onboarding_training_activities_sessions_check
    check (sessions_per_week between 1 and 14),
  constraint onboarding_training_activities_duration_check
    check (duration_minutes between 1 and 1440),
  constraint onboarding_training_activities_detail_check
    check (detail is null or char_length(detail) between 1 and 500)
);

create table public.onboarding_goal_candidates (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null,
  user_id uuid not null,
  position smallint not null,
  title text not null,
  desired_outcome text not null,
  category text not null,
  activity_areas text[] not null default '{}',
  start_date date not null,
  target_date date,
  target_detail text,
  target_metric_label text,
  target_metric_value text,
  target_metric_unit text,
  priority_tier text not null,
  target_rank smallint,
  rationale text,
  constraints_text text,
  decision text not null default 'pending',
  resolution text,
  target_goal_id uuid,
  constraint onboarding_goal_candidates_owner_fkey
    foreign key (user_id)
    references public.profiles (user_id)
    on delete cascade,
  constraint onboarding_goal_candidates_draft_fkey
    foreign key (draft_id, user_id)
    references public.onboarding_drafts (id, user_id)
    on delete cascade,
  constraint onboarding_goal_candidates_target_fkey
    foreign key (target_goal_id, user_id)
    references public.goals (id, user_id),
  constraint onboarding_goal_candidates_position_key
    unique (draft_id, position),
  constraint onboarding_goal_candidates_position_check
    check (position between 1 and 3),
  constraint onboarding_goal_candidates_title_check
    check (char_length(trim(title)) between 1 and 120),
  constraint onboarding_goal_candidates_outcome_check
    check (char_length(trim(desired_outcome)) between 1 and 1000),
  constraint onboarding_goal_candidates_category_check check (
    category in (
      'performance_event',
      'skill',
      'strength',
      'endurance',
      'mobility',
      'body_composition',
      'recovery_general_fitness',
      'other'
    )
  ),
  constraint onboarding_goal_candidates_areas_check
    check (cardinality(activity_areas) <= 10),
  constraint onboarding_goal_candidates_dates_check
    check (target_date is null or target_date >= start_date),
  constraint onboarding_goal_candidates_detail_check
    check (target_detail is null or char_length(target_detail) <= 500),
  constraint onboarding_goal_candidates_metric_check check (
    (
      target_metric_label is null
      and target_metric_value is null
      and target_metric_unit is null
    )
    or (
      char_length(trim(target_metric_label)) between 1 and 80
      and char_length(trim(target_metric_value)) between 1 and 120
      and (
        target_metric_unit is null
        or char_length(trim(target_metric_unit)) between 1 and 40
      )
    )
  ),
  constraint onboarding_goal_candidates_tier_check
    check (priority_tier in ('core', 'supporting')),
  constraint onboarding_goal_candidates_rank_check check (
    target_rank is null
    or (
      target_rank >= 1
      and (priority_tier = 'supporting' or target_rank <= 3)
    )
  ),
  constraint onboarding_goal_candidates_rationale_check
    check (rationale is null or char_length(rationale) <= 500),
  constraint onboarding_goal_candidates_constraints_check
    check (constraints_text is null or char_length(constraints_text) <= 1000),
  constraint onboarding_goal_candidates_decision_check
    check (decision in ('pending', 'accepted', 'rejected')),
  constraint onboarding_goal_candidates_resolution_check check (
    (
      decision in ('pending', 'rejected')
      and resolution is null
      and target_goal_id is null
    )
    or (
      decision = 'accepted'
      and (
        (resolution = 'create' and target_goal_id is null)
        or (
          resolution in ('keep', 'update')
          and target_goal_id is not null
        )
      )
    )
  )
);

create table public.onboarding_memory_candidates (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null,
  user_id uuid not null,
  position smallint not null,
  field_key text not null,
  memory_type text not null,
  content text not null,
  decision text not null default 'pending',
  resolution text,
  target_memory_id uuid,
  constraint onboarding_memory_candidates_owner_fkey
    foreign key (user_id)
    references public.profiles (user_id)
    on delete cascade,
  constraint onboarding_memory_candidates_draft_fkey
    foreign key (draft_id, user_id)
    references public.onboarding_drafts (id, user_id)
    on delete cascade,
  constraint onboarding_memory_candidates_target_fkey
    foreign key (target_memory_id, user_id)
    references public.memory_items (id, user_id),
  constraint onboarding_memory_candidates_field_key
    unique (draft_id, field_key),
  constraint onboarding_memory_candidates_position_check
    check (position between 1 and 40),
  constraint onboarding_memory_candidates_field_check
    check (char_length(field_key) between 1 and 80),
  constraint onboarding_memory_candidates_type_check check (
    memory_type in (
      'profile_fact',
      'constraint',
      'preference',
      'observed_pattern'
    )
  ),
  constraint onboarding_memory_candidates_content_check
    check (char_length(trim(content)) between 1 and 1000),
  constraint onboarding_memory_candidates_decision_check
    check (decision in ('pending', 'accepted', 'rejected')),
  constraint onboarding_memory_candidates_resolution_check check (
    (
      decision in ('pending', 'rejected')
      and resolution is null
      and target_memory_id is null
    )
    or (
      decision = 'accepted'
      and (
        (resolution = 'create' and target_memory_id is null)
        or (
          resolution in ('keep', 'update')
          and target_memory_id is not null
        )
      )
    )
  )
);

create table public.onboarding_prompt_states (
  user_id uuid primary key,
  dismissed_at timestamptz not null default now(),
  constraint onboarding_prompt_states_owner_fkey
    foreign key (user_id)
    references public.profiles (user_id)
    on delete cascade
);

create table public.onboarding_publication_receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  idempotency_key uuid not null,
  published_at timestamptz not null default now(),
  goal_ids uuid[] not null default '{}',
  memory_ids uuid[] not null default '{}',
  goal_collection_revision bigint not null,
  memory_collection_revision bigint not null,
  constraint onboarding_publication_receipts_owner_fkey
    foreign key (user_id)
    references public.profiles (user_id)
    on delete cascade,
  constraint onboarding_publication_receipts_idempotency_key
    unique (user_id, idempotency_key),
  constraint onboarding_publication_receipts_goal_revision_check
    check (goal_collection_revision >= 0),
  constraint onboarding_publication_receipts_memory_revision_check
    check (memory_collection_revision >= 0)
);

create index onboarding_training_activities_owner_draft_idx
  on public.onboarding_training_activities (user_id, draft_id, position);
create index onboarding_training_activities_draft_owner_idx
  on public.onboarding_training_activities (draft_id, user_id);
create index onboarding_goal_candidates_owner_draft_idx
  on public.onboarding_goal_candidates (user_id, draft_id, position);
create index onboarding_goal_candidates_draft_owner_idx
  on public.onboarding_goal_candidates (draft_id, user_id);
create index onboarding_goal_candidates_target_owner_idx
  on public.onboarding_goal_candidates (target_goal_id, user_id)
  where target_goal_id is not null;
create index onboarding_memory_candidates_owner_draft_idx
  on public.onboarding_memory_candidates (user_id, draft_id, position);
create index onboarding_memory_candidates_draft_owner_idx
  on public.onboarding_memory_candidates (draft_id, user_id);
create index onboarding_memory_candidates_target_owner_idx
  on public.onboarding_memory_candidates (target_memory_id, user_id)
  where target_memory_id is not null;
create index onboarding_publication_receipts_owner_published_idx
  on public.onboarding_publication_receipts (user_id, published_at desc);

alter table public.onboarding_drafts enable row level security;
alter table public.onboarding_training_activities enable row level security;
alter table public.onboarding_goal_candidates enable row level security;
alter table public.onboarding_memory_candidates enable row level security;
alter table public.onboarding_prompt_states enable row level security;
alter table public.onboarding_publication_receipts enable row level security;

revoke all privileges on table public.onboarding_drafts
  from public, anon, authenticated, service_role;
revoke all privileges on table public.onboarding_training_activities
  from public, anon, authenticated, service_role;
revoke all privileges on table public.onboarding_goal_candidates
  from public, anon, authenticated, service_role;
revoke all privileges on table public.onboarding_memory_candidates
  from public, anon, authenticated, service_role;
revoke all privileges on table public.onboarding_prompt_states
  from public, anon, authenticated, service_role;
revoke all privileges on table public.onboarding_publication_receipts
  from public, anon, authenticated, service_role;

grant select on table
  public.onboarding_drafts,
  public.onboarding_training_activities,
  public.onboarding_goal_candidates,
  public.onboarding_memory_candidates,
  public.onboarding_prompt_states,
  public.onboarding_publication_receipts
to authenticated;

create policy onboarding_drafts_owner_select
on public.onboarding_drafts
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy onboarding_training_activities_owner_select
on public.onboarding_training_activities
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy onboarding_goal_candidates_owner_select
on public.onboarding_goal_candidates
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy onboarding_memory_candidates_owner_select
on public.onboarding_memory_candidates
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy onboarding_prompt_states_owner_select
on public.onboarding_prompt_states
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy onboarding_publication_receipts_owner_select
on public.onboarding_publication_receipts
for select
to authenticated
using ((select auth.uid()) = user_id);

create function private.onboarding_exact_keys(
  p_value jsonb,
  p_keys text[]
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    pg_catalog.jsonb_typeof(p_value) = 'object'
    and p_value ?& p_keys
    and (
      select count(*)
      from pg_catalog.jsonb_object_keys(p_value)
    ) = cardinality(p_keys);
$$;

create function private.onboarding_text_array(
  p_value jsonb,
  p_max_count integer,
  p_max_length integer
)
returns text[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_result text[] := array[]::text[];
  v_text text;
begin
  if pg_catalog.jsonb_typeof(p_value) <> 'array'
    or pg_catalog.jsonb_array_length(p_value) > p_max_count
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid onboarding change.';
  end if;

  for v_text in
    select value
    from pg_catalog.jsonb_array_elements_text(p_value) as value
  loop
    v_text := trim(v_text);
    if char_length(v_text) not between 1 and p_max_length
      or lower(v_text) = any (
        select lower(existing_value)
        from unnest(v_result) as existing_value
      )
    then
      raise exception using
        errcode = '22023',
        message = 'Invalid onboarding change.';
    end if;
    v_result := array_append(v_result, v_text);
  end loop;

  return v_result;
exception
  when invalid_parameter_value then
    raise exception using
      errcode = '22023',
      message = 'Invalid onboarding change.';
end;
$$;

revoke all privileges on function private.onboarding_exact_keys(jsonb, text[])
  from public, anon, authenticated, service_role;
revoke all privileges on function private.onboarding_text_array(
  jsonb,
  integer,
  integer
) from public, anon, authenticated, service_role;

create function public.apply_onboarding_change(
  p_expected_draft_revision bigint,
  p_operation text,
  p_payload jsonb default '{}'::jsonb,
  p_expected_goal_revision bigint default null,
  p_expected_memory_revision bigint default null,
  p_idempotency_key uuid default null
)
returns public.onboarding_change_receipt
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_draft public.onboarding_drafts;
  v_goal_candidate public.onboarding_goal_candidates;
  v_memory_candidate public.onboarding_memory_candidates;
  v_goal_receipt public.goal_change_receipt;
  v_memory_receipt public.memory_change_receipt;
  v_publication public.onboarding_publication_receipts;
  v_entry jsonb;
  v_areas text[];
  v_values text[];
  v_seen_ids uuid[] := array[]::uuid[];
  v_id uuid;
  v_target_id uuid;
  v_position integer;
  v_count integer;
  v_current_goal_revision bigint;
  v_current_memory_revision bigint;
  v_goal_ids uuid[] := array[]::uuid[];
  v_memory_ids uuid[] := array[]::uuid[];
  v_content text;
  v_field_key text;
  v_label text;
  v_advance boolean;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
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

  if p_expected_draft_revision is null or p_expected_draft_revision < 0
    or p_operation not in (
      'start',
      'dismiss_prompt',
      'save_goals',
      'save_training',
      'save_context',
      'save_preferences',
      'save_constraints',
      'save_review',
      'cancel',
      'publish'
    )
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid onboarding change.';
  end if;

  perform pg_catalog.set_config('lock_timeout', '3s', true);
  perform pg_catalog.set_config('statement_timeout', '12s', true);
  begin
    perform pg_catalog.pg_advisory_xact_lock(
      62003,
      pg_catalog.hashtext(v_user_id::text)
    );
  exception
    when lock_not_available or query_canceled then
      raise exception using
        errcode = 'PT409',
        message = 'Onboarding changed. Reload and try again.';
  end;

  if p_operation = 'publish' and p_idempotency_key is not null then
    select *
    into v_publication
    from public.onboarding_publication_receipts
    where user_id = v_user_id
      and idempotency_key = p_idempotency_key;

    if found then
      return (
        null,
        null,
        'already_published',
        v_publication.idempotency_key,
        v_publication.id,
        v_publication.goal_collection_revision,
        v_publication.memory_collection_revision
      )::public.onboarding_change_receipt;
    end if;
  end if;

  delete from public.onboarding_drafts
  where user_id = v_user_id
    and expires_at <= v_now;

  select *
  into v_draft
  from public.onboarding_drafts
  where user_id = v_user_id;

  if p_operation = 'dismiss_prompt' then
    if not private.onboarding_exact_keys(p_payload, '{}') then
      raise exception using
        errcode = '22023',
        message = 'Invalid onboarding change.';
    end if;
    insert into public.onboarding_prompt_states (user_id, dismissed_at)
    values (v_user_id, v_now)
    on conflict (user_id)
    do update set dismissed_at = excluded.dismissed_at;
    return (
      v_draft.id,
      v_draft.revision,
      'prompt_dismissed',
      v_draft.idempotency_key,
      null,
      null,
      null
    )::public.onboarding_change_receipt;
  end if;

  if p_operation = 'start' then
    if not private.onboarding_exact_keys(p_payload, '{}')
      or p_expected_draft_revision <> coalesce(v_draft.revision, 0)
    then
      raise exception using
        errcode = 'PT409',
        message = 'Onboarding changed. Reload and try again.';
    end if;

    if v_draft.id is null then
      insert into public.onboarding_drafts (
        user_id,
        revision,
        current_step,
        expires_at,
        created_at,
        updated_at
      )
      values (
        v_user_id,
        0,
        1,
        v_now + interval '30 days',
        v_now,
        v_now
      )
      returning * into v_draft;
    end if;

    return (
      v_draft.id,
      v_draft.revision,
      'started',
      v_draft.idempotency_key,
      null,
      null,
      null
    )::public.onboarding_change_receipt;
  end if;

  if v_draft.id is null
    or v_draft.revision <> p_expected_draft_revision
  then
    raise exception using
      errcode = 'PT409',
      message = 'Onboarding changed. Reload and try again.';
  end if;

  if p_operation = 'cancel' then
    if not private.onboarding_exact_keys(p_payload, '{}') then
      raise exception using
        errcode = '22023',
        message = 'Invalid onboarding change.';
    end if;
    delete from public.onboarding_drafts
    where id = v_draft.id and user_id = v_user_id;
    return (
      v_draft.id,
      v_draft.revision + 1,
      'canceled',
      v_draft.idempotency_key,
      null,
      null,
      null
    )::public.onboarding_change_receipt;
  end if;

  if p_operation = 'save_goals' then
    if not private.onboarding_exact_keys(p_payload, array['goals', 'advance'])
      or pg_catalog.jsonb_typeof(p_payload -> 'goals') <> 'array'
      or pg_catalog.jsonb_array_length(p_payload -> 'goals') > 3
      or pg_catalog.jsonb_array_length(p_payload -> 'goals') < 1
      or pg_catalog.jsonb_typeof(p_payload -> 'advance') <> 'boolean'
    then
      raise exception using
        errcode = '22023',
        message = 'Invalid onboarding change.';
    end if;
    v_advance := (p_payload ->> 'advance')::boolean;

    delete from public.onboarding_goal_candidates
    where draft_id = v_draft.id and user_id = v_user_id;

    v_position := 0;
    for v_entry in
      select value
      from pg_catalog.jsonb_array_elements(p_payload -> 'goals') as value
    loop
      v_position := v_position + 1;
      if not private.onboarding_exact_keys(
        v_entry,
        array[
          'title',
          'desiredOutcome',
          'category',
          'activityAreas',
          'startDate',
          'targetDate',
          'targetDetail',
          'targetMetricLabel',
          'targetMetricValue',
          'targetMetricUnit',
          'priorityTier',
          'targetRank',
          'rationale',
          'constraints'
        ]
      ) then
        raise exception using
          errcode = '22023',
          message = 'Invalid onboarding change.';
      end if;

      v_areas := private.onboarding_text_array(
        v_entry -> 'activityAreas',
        10,
        60
      );

      insert into public.onboarding_goal_candidates (
        draft_id,
        user_id,
        position,
        title,
        desired_outcome,
        category,
        activity_areas,
        start_date,
        target_date,
        target_detail,
        target_metric_label,
        target_metric_value,
        target_metric_unit,
        priority_tier,
        target_rank,
        rationale,
        constraints_text
      )
      values (
        v_draft.id,
        v_user_id,
        v_position,
        trim(v_entry ->> 'title'),
        trim(v_entry ->> 'desiredOutcome'),
        v_entry ->> 'category',
        v_areas,
        (v_entry ->> 'startDate')::date,
        nullif(v_entry ->> 'targetDate', '')::date,
        nullif(trim(v_entry ->> 'targetDetail'), ''),
        nullif(trim(v_entry ->> 'targetMetricLabel'), ''),
        nullif(trim(v_entry ->> 'targetMetricValue'), ''),
        nullif(trim(v_entry ->> 'targetMetricUnit'), ''),
        v_entry ->> 'priorityTier',
        nullif(v_entry ->> 'targetRank', '')::smallint,
        nullif(trim(v_entry ->> 'rationale'), ''),
        nullif(trim(v_entry ->> 'constraints'), '')
      );
    end loop;

    if exists (
      select 1
      from public.onboarding_goal_candidates a
      join public.onboarding_goal_candidates b
        on b.draft_id = a.draft_id
       and b.user_id = a.user_id
       and b.position > a.position
       and lower(b.title) = lower(a.title)
      where a.draft_id = v_draft.id and a.user_id = v_user_id
    ) then
      raise exception using
        errcode = '22023',
        message = 'Invalid onboarding change.';
    end if;

    update public.onboarding_drafts
    set
      revision = revision + 1,
      current_step = greatest(current_step, case when v_advance then 2 else 1 end),
      expires_at = v_now + interval '30 days',
      updated_at = v_now
    where id = v_draft.id and user_id = v_user_id
    returning * into v_draft;

  elsif p_operation = 'save_training' then
    if not private.onboarding_exact_keys(
      p_payload,
      array['trainingStatus', 'activities', 'advance']
    )
      or p_payload ->> 'trainingStatus' not in ('current', 'none')
      or pg_catalog.jsonb_typeof(p_payload -> 'activities') <> 'array'
      or pg_catalog.jsonb_array_length(p_payload -> 'activities') > 10
      or pg_catalog.jsonb_typeof(p_payload -> 'advance') <> 'boolean'
      or (
        p_payload ->> 'trainingStatus' = 'none'
        and pg_catalog.jsonb_array_length(p_payload -> 'activities') <> 0
      )
      or (
        p_payload ->> 'trainingStatus' = 'current'
        and pg_catalog.jsonb_array_length(p_payload -> 'activities') < 1
      )
    then
      raise exception using
        errcode = '22023',
        message = 'Invalid onboarding change.';
    end if;
    v_advance := (p_payload ->> 'advance')::boolean;

    delete from public.onboarding_training_activities
    where draft_id = v_draft.id and user_id = v_user_id;
    delete from public.onboarding_memory_candidates
    where draft_id = v_draft.id
      and user_id = v_user_id
      and field_key like 'baseline:%';

    v_position := 0;
    for v_entry in
      select value
      from pg_catalog.jsonb_array_elements(p_payload -> 'activities') as value
    loop
      v_position := v_position + 1;
      if not private.onboarding_exact_keys(
        v_entry,
        array['name', 'sessionsPerWeek', 'durationMinutes', 'detail']
      ) then
        raise exception using
          errcode = '22023',
          message = 'Invalid onboarding change.';
      end if;

      insert into public.onboarding_training_activities (
        draft_id,
        user_id,
        position,
        name,
        sessions_per_week,
        duration_minutes,
        detail
      )
      values (
        v_draft.id,
        v_user_id,
        v_position,
        trim(v_entry ->> 'name'),
        (v_entry ->> 'sessionsPerWeek')::smallint,
        (v_entry ->> 'durationMinutes')::smallint,
        nullif(trim(v_entry ->> 'detail'), '')
      );

      v_content := pg_catalog.format(
        'Current training: %s, %s sessions per week, usually %s minutes.%s',
        trim(v_entry ->> 'name'),
        (v_entry ->> 'sessionsPerWeek')::smallint,
        (v_entry ->> 'durationMinutes')::smallint,
        case
          when nullif(trim(v_entry ->> 'detail'), '') is null then ''
          else ' ' || trim(v_entry ->> 'detail')
        end
      );

      insert into public.onboarding_memory_candidates (
        draft_id,
        user_id,
        position,
        field_key,
        memory_type,
        content
      )
      values (
        v_draft.id,
        v_user_id,
        v_position,
        'baseline:' || v_position,
        'profile_fact',
        v_content
      );
    end loop;

    if p_payload ->> 'trainingStatus' = 'none' then
      insert into public.onboarding_memory_candidates (
        draft_id,
        user_id,
        position,
        field_key,
        memory_type,
        content
      )
      values (
        v_draft.id,
        v_user_id,
        1,
        'baseline:none',
        'profile_fact',
        'I am not training currently.'
      );
    end if;

    update public.onboarding_drafts
    set
      training_status = p_payload ->> 'trainingStatus',
      revision = revision + 1,
      current_step = greatest(current_step, case when v_advance then 3 else 2 end),
      expires_at = v_now + interval '30 days',
      updated_at = v_now
    where id = v_draft.id and user_id = v_user_id
    returning * into v_draft;

  elsif p_operation = 'save_context' then
    if not private.onboarding_exact_keys(
      p_payload,
      array[
        'availableDays',
        'sessionsPerWeek',
        'durationMinutes',
        'accessLabels',
        'timezoneName',
        'units',
        'advance'
      ]
    )
      or pg_catalog.jsonb_typeof(p_payload -> 'advance') <> 'boolean'
    then
      raise exception using
        errcode = '22023',
        message = 'Invalid onboarding change.';
    end if;
    v_advance := (p_payload ->> 'advance')::boolean;
    v_values := private.onboarding_text_array(
      p_payload -> 'availableDays',
      7,
      12
    );
    if cardinality(v_values) < 1
      or exists (
        select 1
        from unnest(v_values) as requested_day
        where requested_day not in (
          'Monday',
          'Tuesday',
          'Wednesday',
          'Thursday',
          'Friday',
          'Saturday',
          'Sunday',
          'Varies'
        )
      )
      or ('Varies' = any(v_values) and cardinality(v_values) <> 1)
    then
      raise exception using
        errcode = '22023',
        message = 'Invalid onboarding change.';
    end if;
    v_areas := private.onboarding_text_array(
      p_payload -> 'accessLabels',
      10,
      60
    );
    if cardinality(v_areas) < 1
      or (p_payload ->> 'sessionsPerWeek')::integer not between 1 and 14
      or (p_payload ->> 'durationMinutes')::integer not between 5 and 1440
      or p_payload ->> 'units' not in ('metric', 'imperial')
      or not exists (
        select 1
        from pg_catalog.pg_timezone_names
        where name = p_payload ->> 'timezoneName'
      )
    then
      raise exception using
        errcode = '22023',
        message = 'Invalid onboarding change.';
    end if;

    delete from public.onboarding_memory_candidates
    where draft_id = v_draft.id
      and user_id = v_user_id
      and field_key like 'context:%';

    insert into public.onboarding_memory_candidates (
      draft_id,
      user_id,
      position,
      field_key,
      memory_type,
      content
    )
    values
      (
        v_draft.id,
        v_user_id,
        11,
        'context:availability',
        'preference',
        pg_catalog.format(
          'Availability: %s; %s sessions per week; usually %s minutes.',
          array_to_string(v_values, ', '),
          (p_payload ->> 'sessionsPerWeek')::integer,
          (p_payload ->> 'durationMinutes')::integer
        )
      ),
      (
        v_draft.id,
        v_user_id,
        12,
        'context:access',
        'profile_fact',
        'Access and equipment: ' || array_to_string(v_areas, ', ') || '.'
      ),
      (
        v_draft.id,
        v_user_id,
        13,
        'context:timezone',
        'profile_fact',
        'Timezone: ' || (p_payload ->> 'timezoneName') || '.'
      ),
      (
        v_draft.id,
        v_user_id,
        14,
        'context:units',
        'preference',
        'Units: ' || initcap(p_payload ->> 'units') || '.'
      );

    update public.onboarding_drafts
    set
      available_days = v_values,
      sessions_per_week = (p_payload ->> 'sessionsPerWeek')::smallint,
      session_duration_minutes =
        (p_payload ->> 'durationMinutes')::smallint,
      access_labels = v_areas,
      timezone_name = p_payload ->> 'timezoneName',
      units_system = p_payload ->> 'units',
      revision = revision + 1,
      current_step = greatest(current_step, case when v_advance then 4 else 3 end),
      expires_at = v_now + interval '30 days',
      updated_at = v_now
    where id = v_draft.id and user_id = v_user_id
    returning * into v_draft;

  elsif p_operation = 'save_preferences' then
    if not private.onboarding_exact_keys(
      p_payload,
      array['preferences', 'advance']
    )
      or pg_catalog.jsonb_typeof(p_payload -> 'advance') <> 'boolean'
    then
      raise exception using
        errcode = '22023',
        message = 'Invalid onboarding change.';
    end if;
    v_advance := (p_payload ->> 'advance')::boolean;
    v_values := private.onboarding_text_array(
      p_payload -> 'preferences',
      10,
      1000
    );

    delete from public.onboarding_memory_candidates
    where draft_id = v_draft.id
      and user_id = v_user_id
      and field_key like 'preference:%';

    v_position := 20;
    foreach v_content in array v_values
    loop
      v_position := v_position + 1;
      insert into public.onboarding_memory_candidates (
        draft_id,
        user_id,
        position,
        field_key,
        memory_type,
        content
      )
      values (
        v_draft.id,
        v_user_id,
        v_position,
        'preference:' || (v_position - 20),
        'preference',
        v_content
      );
    end loop;

    update public.onboarding_drafts
    set
      revision = revision + 1,
      current_step = greatest(current_step, case when v_advance then 5 else 4 end),
      expires_at = v_now + interval '30 days',
      updated_at = v_now
    where id = v_draft.id and user_id = v_user_id
    returning * into v_draft;

  elsif p_operation = 'save_constraints' then
    if not private.onboarding_exact_keys(
      p_payload,
      array['constraints', 'advance']
    )
      or pg_catalog.jsonb_typeof(p_payload -> 'constraints') <> 'array'
      or pg_catalog.jsonb_array_length(p_payload -> 'constraints') > 4
      or pg_catalog.jsonb_typeof(p_payload -> 'advance') <> 'boolean'
    then
      raise exception using
        errcode = '22023',
        message = 'Invalid onboarding change.';
    end if;
    v_advance := (p_payload ->> 'advance')::boolean;

    delete from public.onboarding_memory_candidates
    where draft_id = v_draft.id
      and user_id = v_user_id
      and field_key like 'constraint:%';

    v_position := 30;
    v_values := '{}';
    for v_entry in
      select value
      from pg_catalog.jsonb_array_elements(p_payload -> 'constraints') as value
    loop
      if not private.onboarding_exact_keys(
        v_entry,
        array['category', 'detail']
      )
        or v_entry ->> 'category' not in (
          'pain_injury',
          'illness_recovery',
          'unusual_fatigue',
          'other'
        )
        or v_entry ->> 'category' = any(v_values)
      then
        raise exception using
          errcode = '22023',
          message = 'Invalid onboarding change.';
      end if;
      v_values := array_append(v_values, v_entry ->> 'category');
      v_position := v_position + 1;
      v_label := case v_entry ->> 'category'
        when 'pain_injury' then 'Pain or injury'
        when 'illness_recovery' then 'Illness or recovery'
        when 'unusual_fatigue' then 'Unusual fatigue'
        else 'Other constraint'
      end;
      v_content := case
        when nullif(trim(v_entry ->> 'detail'), '') is null
          then v_label || '.'
        else v_label || ': ' || trim(v_entry ->> 'detail')
      end;
      if char_length(v_content) > 1000 then
        raise exception using
          errcode = '22023',
          message = 'Invalid onboarding change.';
      end if;

      insert into public.onboarding_memory_candidates (
        draft_id,
        user_id,
        position,
        field_key,
        memory_type,
        content
      )
      values (
        v_draft.id,
        v_user_id,
        v_position,
        'constraint:' || (v_entry ->> 'category'),
        'constraint',
        v_content
      );
    end loop;

    update public.onboarding_drafts
    set
      revision = revision + 1,
      current_step = greatest(current_step, case when v_advance then 6 else 5 end),
      expires_at = v_now + interval '30 days',
      updated_at = v_now
    where id = v_draft.id and user_id = v_user_id
    returning * into v_draft;

  elsif p_operation = 'save_review' then
    if not private.onboarding_exact_keys(p_payload, array['decisions'])
      or pg_catalog.jsonb_typeof(p_payload -> 'decisions') <> 'array'
      or pg_catalog.jsonb_array_length(p_payload -> 'decisions') <> (
        select count(*)
        from (
          select id
          from public.onboarding_goal_candidates
          where draft_id = v_draft.id and user_id = v_user_id
          union all
          select id
          from public.onboarding_memory_candidates
          where draft_id = v_draft.id and user_id = v_user_id
        ) as candidates
      )
    then
      raise exception using
        errcode = '22023',
        message = 'Invalid onboarding change.';
    end if;

    for v_entry in
      select value
      from pg_catalog.jsonb_array_elements(p_payload -> 'decisions') as value
    loop
      if not private.onboarding_exact_keys(
        v_entry,
        array['kind', 'id', 'decision', 'resolution', 'targetId']
      ) then
        raise exception using
          errcode = '22023',
          message = 'Invalid onboarding change.';
      end if;
      v_id := (v_entry ->> 'id')::uuid;
      if v_id = any(v_seen_ids)
        or v_entry ->> 'kind' not in ('goal', 'memory')
        or v_entry ->> 'decision' not in ('accepted', 'rejected')
      then
        raise exception using
          errcode = '22023',
          message = 'Invalid onboarding change.';
      end if;
      v_seen_ids := array_append(v_seen_ids, v_id);
      v_target_id := nullif(v_entry ->> 'targetId', '')::uuid;

      if v_entry ->> 'decision' = 'rejected' then
        if v_entry ->> 'resolution' is not null or v_target_id is not null then
          raise exception using
            errcode = '22023',
            message = 'Invalid onboarding change.';
        end if;
      elsif v_entry ->> 'resolution' = 'create' then
        if v_target_id is not null then
          raise exception using
            errcode = '22023',
            message = 'Invalid onboarding change.';
        end if;
      elsif v_entry ->> 'resolution' in ('keep', 'update') then
        if v_target_id is null then
          raise exception using
            errcode = '22023',
            message = 'Invalid onboarding change.';
        end if;
      else
        raise exception using
          errcode = '22023',
          message = 'Invalid onboarding change.';
      end if;

      if v_entry ->> 'kind' = 'goal' then
        if v_target_id is not null and not exists (
          select 1
          from public.goals
          where id = v_target_id
            and user_id = v_user_id
            and archived_at is null
        ) then
          raise exception using
            errcode = 'PT409',
            message = 'Onboarding changed. Reload and try again.';
        end if;
        update public.onboarding_goal_candidates
        set
          decision = v_entry ->> 'decision',
          resolution = v_entry ->> 'resolution',
          target_goal_id = v_target_id
        where id = v_id
          and draft_id = v_draft.id
          and user_id = v_user_id;
      else
        if v_target_id is not null and not exists (
          select 1
          from public.memory_items
          where id = v_target_id and user_id = v_user_id
        ) then
          raise exception using
            errcode = 'PT409',
            message = 'Onboarding changed. Reload and try again.';
        end if;
        update public.onboarding_memory_candidates
        set
          decision = v_entry ->> 'decision',
          resolution = v_entry ->> 'resolution',
          target_memory_id = v_target_id
        where id = v_id
          and draft_id = v_draft.id
          and user_id = v_user_id;
      end if;
      get diagnostics v_count = row_count;
      if v_count <> 1 then
        raise exception using
          errcode = '22023',
          message = 'Invalid onboarding change.';
      end if;
    end loop;

    update public.onboarding_drafts
    set
      revision = revision + 1,
      current_step = 6,
      expires_at = v_now + interval '30 days',
      updated_at = v_now
    where id = v_draft.id and user_id = v_user_id
    returning * into v_draft;

  elsif p_operation = 'publish' then
    if not private.onboarding_exact_keys(p_payload, '{}')
      or p_expected_goal_revision is null
      or p_expected_memory_revision is null
      or p_idempotency_key is null
      or p_idempotency_key <> v_draft.idempotency_key
      or exists (
        select 1
        from public.onboarding_goal_candidates
        where draft_id = v_draft.id
          and user_id = v_user_id
          and decision = 'pending'
      )
      or exists (
        select 1
        from public.onboarding_memory_candidates
        where draft_id = v_draft.id
          and user_id = v_user_id
          and decision = 'pending'
      )
    then
      raise exception using
        errcode = '22023',
        message = 'Invalid onboarding change.';
    end if;

    -- ADR-011 canonical order: onboarding (already held), goals, memory.
    begin
      perform pg_catalog.pg_advisory_xact_lock(
        62001,
        pg_catalog.hashtext(v_user_id::text)
      );
      perform pg_catalog.pg_advisory_xact_lock(
        62002,
        pg_catalog.hashtext(v_user_id::text)
      );
    exception
      when lock_not_available or query_canceled then
        raise exception using
          errcode = 'PT409',
          message = 'Onboarding changed. Reload and try again.';
    end;

    select coalesce((
      select revision
      from public.goal_collections
      where user_id = v_user_id
    ), 0)
    into v_current_goal_revision;
    select coalesce((
      select revision
      from public.memory_collections
      where user_id = v_user_id
    ), 0)
    into v_current_memory_revision;

    if v_current_goal_revision <> p_expected_goal_revision
      or v_current_memory_revision <> p_expected_memory_revision
    then
      raise exception using
        errcode = 'PT409',
        message = 'Onboarding changed. Reload and try again.';
    end if;

    for v_goal_candidate in
      select *
      from public.onboarding_goal_candidates
      where draft_id = v_draft.id
        and user_id = v_user_id
        and decision = 'accepted'
      order by position
    loop
      if v_goal_candidate.resolution = 'keep' then
        v_goal_ids := array_append(
          v_goal_ids,
          v_goal_candidate.target_goal_id
        );
        continue;
      end if;

      if v_goal_candidate.resolution = 'create' then
        select id
        into v_target_id
        from public.goals
        where user_id = v_user_id
          and archived_at is null
          and title = v_goal_candidate.title
          and desired_outcome = v_goal_candidate.desired_outcome
          and category = v_goal_candidate.category
          and activity_areas = v_goal_candidate.activity_areas
          and start_date = v_goal_candidate.start_date
          and target_date is not distinct from v_goal_candidate.target_date
          and target_detail is not distinct from v_goal_candidate.target_detail
          and target_metric_label is not distinct from
            v_goal_candidate.target_metric_label
          and target_metric_value is not distinct from
            v_goal_candidate.target_metric_value
          and target_metric_unit is not distinct from
            v_goal_candidate.target_metric_unit
          and priority_tier = v_goal_candidate.priority_tier
          and rationale is not distinct from v_goal_candidate.rationale
          and constraints_text is not distinct from
            v_goal_candidate.constraints_text
        limit 1;
        if found then
          v_goal_ids := array_append(v_goal_ids, v_target_id);
          continue;
        end if;
        if exists (
          select 1
          from public.goals
          where user_id = v_user_id
            and archived_at is null
            and lower(title) = lower(v_goal_candidate.title)
        ) then
          raise exception using
            errcode = 'PT409',
            message = 'Onboarding changed. Reload and try again.';
        end if;
      end if;

      v_goal_receipt := public.apply_goal_change(
        v_current_goal_revision,
        case
          when v_goal_candidate.resolution = 'update' then 'edit'
          else 'create'
        end,
        v_goal_candidate.target_goal_id,
        v_goal_candidate.title,
        v_goal_candidate.desired_outcome,
        v_goal_candidate.category,
        v_goal_candidate.activity_areas,
        v_goal_candidate.start_date,
        v_goal_candidate.target_date,
        v_goal_candidate.target_detail,
        v_goal_candidate.target_metric_label,
        v_goal_candidate.target_metric_value,
        v_goal_candidate.target_metric_unit,
        v_goal_candidate.priority_tier,
        v_goal_candidate.target_rank,
        v_goal_candidate.rationale,
        v_goal_candidate.constraints_text,
        null
      );
      v_current_goal_revision := (v_goal_receipt).collection_revision;
      v_goal_ids := array_append(v_goal_ids, (v_goal_receipt).goal_id);
    end loop;

    for v_memory_candidate in
      select *
      from public.onboarding_memory_candidates
      where draft_id = v_draft.id
        and user_id = v_user_id
        and decision = 'accepted'
      order by position, field_key
    loop
      v_field_key := case
        when v_memory_candidate.field_key like 'context:%'
          or v_memory_candidate.field_key like 'constraint:%'
        then v_memory_candidate.field_key
        else null
      end;

      if v_memory_candidate.resolution = 'keep' then
        v_memory_ids := array_append(
          v_memory_ids,
          v_memory_candidate.target_memory_id
        );
        continue;
      end if;

      if v_memory_candidate.resolution = 'create' then
        select item.id
        into v_target_id
        from public.memory_items item
        join public.memory_revisions revision
          on revision.id = item.current_revision_id
         and revision.user_id = item.user_id
        where item.user_id = v_user_id
          and item.memory_type = v_memory_candidate.memory_type
          and revision.content = v_memory_candidate.content
        limit 1;
        if found then
          v_memory_ids := array_append(v_memory_ids, v_target_id);
          continue;
        end if;
        if v_field_key is not null and exists (
          select 1
          from public.memory_items
          where user_id = v_user_id
            and intake_field_key = v_field_key
        ) then
          raise exception using
            errcode = 'PT409',
            message = 'Onboarding changed. Reload and try again.';
        end if;
      end if;

      if v_memory_candidate.resolution = 'update' then
        v_memory_receipt := public.apply_memory_change(
          v_current_memory_revision,
          case
            when exists (
              select 1
              from public.memory_items
              where id = v_memory_candidate.target_memory_id
                and user_id = v_user_id
                and status = 'proposed'
            ) then 'edit_and_accept'
            else 'edit'
          end,
          v_memory_candidate.target_memory_id,
          null,
          v_memory_candidate.content,
          null
        );
      else
        v_memory_receipt := public.apply_memory_change(
          v_current_memory_revision,
          'create',
          null,
          v_memory_candidate.memory_type,
          v_memory_candidate.content,
          null
        );
      end if;
      v_current_memory_revision := (v_memory_receipt).collection_revision;
      v_memory_ids := array_append(v_memory_ids, (v_memory_receipt).item_id);

      if v_memory_candidate.resolution = 'create' then
        update public.memory_items
        set
          provenance = 'intake_confirmed',
          confidence = null,
          source_reference = null,
          intake_field_key = v_field_key
        where id = (v_memory_receipt).item_id
          and user_id = v_user_id;
        update public.memory_revisions
        set provenance = 'intake_confirmed'
        where id = (
          select current_revision_id
          from public.memory_items
          where id = (v_memory_receipt).item_id
            and user_id = v_user_id
        )
          and user_id = v_user_id;
      elsif v_memory_candidate.resolution = 'update' then
        update public.memory_items
        set
          confidence = null,
          intake_field_key = case
            when v_field_key is null then intake_field_key
            else coalesce(intake_field_key, v_field_key)
          end
        where id = (v_memory_receipt).item_id
          and user_id = v_user_id
          and (
            v_field_key is null
            or intake_field_key is null
            or intake_field_key = v_field_key
          );
        get diagnostics v_count = row_count;
        if v_count <> 1 then
          raise exception using
            errcode = 'PT409',
            message = 'Onboarding changed. Reload and try again.';
        end if;
      end if;
    end loop;

    insert into public.onboarding_publication_receipts (
      user_id,
      idempotency_key,
      published_at,
      goal_ids,
      memory_ids,
      goal_collection_revision,
      memory_collection_revision
    )
    values (
      v_user_id,
      v_draft.idempotency_key,
      v_now,
      v_goal_ids,
      v_memory_ids,
      v_current_goal_revision,
      v_current_memory_revision
    )
    returning * into v_publication;

    delete from public.onboarding_drafts
    where id = v_draft.id and user_id = v_user_id;

    return (
      v_draft.id,
      v_draft.revision + 1,
      'published',
      v_publication.idempotency_key,
      v_publication.id,
      v_publication.goal_collection_revision,
      v_publication.memory_collection_revision
    )::public.onboarding_change_receipt;
  else
    raise exception using
      errcode = '22023',
      message = 'Invalid onboarding change.';
  end if;

  return (
    v_draft.id,
    v_draft.revision,
    'saved',
    v_draft.idempotency_key,
    null,
    null,
    null
  )::public.onboarding_change_receipt;
exception
  when invalid_text_representation
    or numeric_value_out_of_range
    or datetime_field_overflow
    or check_violation
    or not_null_violation
    or foreign_key_violation
    or unique_violation
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid onboarding change.';
end;
$$;

revoke all privileges on function public.apply_onboarding_change(
  bigint,
  text,
  jsonb,
  bigint,
  bigint,
  uuid
) from public, anon, authenticated, service_role;

grant execute on function public.apply_onboarding_change(
  bigint,
  text,
  jsonb,
  bigint,
  bigint,
  uuid
) to authenticated;
