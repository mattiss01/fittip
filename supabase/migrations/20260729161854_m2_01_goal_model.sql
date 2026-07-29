create type public.goal_change_receipt as (
  goal_id uuid,
  collection_revision bigint,
  result text
);

create table public.goal_collections (
  user_id uuid primary key,
  revision bigint not null default 0,
  updated_at timestamptz not null default now(),
  constraint goal_collections_owner_fkey
    foreign key (user_id)
    references public.profiles (user_id)
    on delete cascade,
  constraint goal_collections_revision_check check (revision >= 0)
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
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
  status text not null default 'active',
  active_rank smallint,
  last_active_rank smallint,
  rationale text,
  constraints_text text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint goals_owner_fkey
    foreign key (user_id)
    references public.profiles (user_id)
    on delete cascade,
  constraint goals_owner_key unique (id, user_id),
  constraint goals_title_check
    check (char_length(trim(title)) between 1 and 120),
  constraint goals_desired_outcome_check
    check (char_length(trim(desired_outcome)) between 1 and 1000),
  constraint goals_category_check
    check (
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
  constraint goals_activity_areas_check
    check (
      cardinality(activity_areas) <= 10
      and char_length(array_to_string(activity_areas, '')) <= 600
    ),
  constraint goals_target_date_check
    check (target_date is null or target_date >= start_date),
  constraint goals_target_detail_check
    check (target_detail is null or char_length(target_detail) <= 500),
  constraint goals_target_metric_check
    check (
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
  constraint goals_priority_tier_check
    check (priority_tier in ('core', 'supporting')),
  constraint goals_status_check
    check (status in ('active', 'paused', 'achieved', 'abandoned')),
  constraint goals_active_rank_check
    check (
      (
        status = 'active'
        and archived_at is null
        and active_rank is not null
        and active_rank > 0
        and (priority_tier <> 'core' or active_rank <= 3)
      )
      or (
        (status <> 'active' or archived_at is not null)
        and active_rank is null
      )
    ),
  constraint goals_last_active_rank_check
    check (
      last_active_rank is null
      or (
        last_active_rank > 0
        and (priority_tier <> 'core' or last_active_rank <= 3)
      )
    ),
  constraint goals_rationale_check
    check (rationale is null or char_length(rationale) <= 500),
  constraint goals_constraints_text_check
    check (
      constraints_text is null
      or char_length(constraints_text) <= 1000
    ),
  constraint goals_active_rank_key
    unique (user_id, priority_tier, active_rank)
    deferrable initially deferred
);

create table public.goal_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  goal_id uuid not null,
  from_status text not null,
  to_status text not null,
  collection_revision bigint not null,
  created_at timestamptz not null default now(),
  constraint goal_lifecycle_events_owner_fkey
    foreign key (user_id)
    references public.profiles (user_id)
    on delete cascade,
  constraint goal_lifecycle_events_goal_fkey
    foreign key (goal_id, user_id)
    references public.goals (id, user_id)
    on delete restrict,
  constraint goal_lifecycle_events_transition_check
    check (
      from_status in ('achieved', 'abandoned')
      and to_status = 'active'
    ),
  constraint goal_lifecycle_events_revision_check
    check (collection_revision > 0),
  constraint goal_lifecycle_events_revision_key
    unique (user_id, collection_revision)
);

create index goals_owner_list_idx
  on public.goals (
    user_id,
    archived_at,
    status,
    priority_tier,
    active_rank
  );
create index goal_lifecycle_events_owner_goal_idx
  on public.goal_lifecycle_events (user_id, goal_id, created_at desc);

alter table public.goal_collections enable row level security;
alter table public.goals enable row level security;
alter table public.goal_lifecycle_events enable row level security;

revoke all privileges on table public.goal_collections
  from public, anon, authenticated;
revoke all privileges on table public.goals
  from public, anon, authenticated;
revoke all privileges on table public.goal_lifecycle_events
  from public, anon, authenticated;

grant select on table
  public.goal_collections,
  public.goals,
  public.goal_lifecycle_events
to authenticated;

create policy goal_collections_owner_select
on public.goal_collections
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy goals_owner_select
on public.goals
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy goal_lifecycle_events_owner_select
on public.goal_lifecycle_events
for select
to authenticated
using ((select auth.uid()) = user_id);

create function public.apply_goal_change(
  p_expected_collection_revision bigint,
  p_operation text,
  p_goal_id uuid default null,
  p_title text default null,
  p_desired_outcome text default null,
  p_category text default null,
  p_activity_areas text[] default null,
  p_start_date date default null,
  p_target_date date default null,
  p_target_detail text default null,
  p_target_metric_label text default null,
  p_target_metric_value text default null,
  p_target_metric_unit text default null,
  p_priority_tier text default null,
  p_target_rank smallint default null,
  p_rationale text default null,
  p_constraints_text text default null,
  p_ordered_goal_ids uuid[] default null
)
returns public.goal_change_receipt
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_current_revision bigint;
  v_new_revision bigint;
  v_goal public.goals;
  v_goal_id uuid;
  v_result text;
  v_old_tier text;
  v_old_rank smallint;
  v_old_status text;
  v_target_rank smallint;
  v_active_count integer;
  v_order_count integer;
  v_area text;
  v_clean_areas text[] := array[]::text[];
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'An authenticated FitTip user is required.';
  end if;

  if not exists (
    select 1
    from public.profiles
    where user_id = v_user_id
  ) then
    raise exception using
      errcode = '23503',
      message = 'A FitTip profile is required.';
  end if;

  if p_expected_collection_revision is null
    or p_expected_collection_revision < 0
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid goal change.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    62001,
    pg_catalog.hashtext(v_user_id::text)
  );

  select revision
  into v_current_revision
  from public.goal_collections
  where user_id = v_user_id;

  v_current_revision := coalesce(v_current_revision, 0);

  if v_current_revision <> p_expected_collection_revision then
    raise exception using
      errcode = 'PT409',
      message = 'Goals changed. Reload and try again.';
  end if;

  v_new_revision := v_current_revision + 1;
  set constraints public.goals_active_rank_key deferred;

  if p_operation in ('create', 'edit') then
    if p_title is null
      or char_length(trim(p_title)) not between 1 and 120
      or p_desired_outcome is null
      or char_length(trim(p_desired_outcome)) not between 1 and 1000
      or p_category not in (
        'performance_event',
        'skill',
        'strength',
        'endurance',
        'mobility',
        'body_composition',
        'recovery_general_fitness',
        'other'
      )
      or p_start_date is null
      or (p_target_date is not null and p_target_date < p_start_date)
      or (
        p_target_detail is not null
        and char_length(p_target_detail) > 500
      )
      or (
        p_rationale is not null
        and char_length(p_rationale) > 500
      )
      or (
        p_constraints_text is not null
        and char_length(p_constraints_text) > 1000
      )
      or p_priority_tier not in ('core', 'supporting')
    then
      raise exception using
        errcode = '22023',
        message = 'Invalid goal change.';
    end if;

    if (
      p_target_metric_label is null
      and p_target_metric_value is null
      and p_target_metric_unit is null
    ) then
      null;
    elsif p_target_metric_label is null
      or char_length(trim(p_target_metric_label)) not between 1 and 80
      or p_target_metric_value is null
      or char_length(trim(p_target_metric_value)) not between 1 and 120
      or (
        p_target_metric_unit is not null
        and char_length(trim(p_target_metric_unit)) not between 1 and 40
      )
    then
      raise exception using
        errcode = '22023',
        message = 'Invalid goal change.';
    end if;

    if cardinality(coalesce(p_activity_areas, '{}')) > 10 then
      raise exception using
        errcode = '22023',
        message = 'Invalid goal change.';
    end if;

    foreach v_area in array coalesce(p_activity_areas, '{}')
    loop
      v_area := trim(v_area);
      if char_length(v_area) not between 1 and 60
        or lower(v_area) = any (
          select lower(existing_area)
          from unnest(v_clean_areas) as existing_area
        )
      then
        raise exception using
          errcode = '22023',
          message = 'Invalid goal change.';
      end if;
      v_clean_areas := array_append(v_clean_areas, v_area);
    end loop;
  end if;

  if p_operation = 'create' then
    if p_goal_id is not null or p_ordered_goal_ids is not null then
      raise exception using
        errcode = '22023',
        message = 'Invalid goal change.';
    end if;

    select count(*)
    into v_active_count
    from public.goals
    where user_id = v_user_id
      and status = 'active'
      and archived_at is null
      and priority_tier = p_priority_tier;

    if p_priority_tier = 'core' and v_active_count >= 3 then
      raise exception using
        errcode = 'PT409',
        message = 'Three core goals are already active.';
    end if;

    v_target_rank := coalesce(p_target_rank, v_active_count + 1);
    if v_target_rank < 1
      or v_target_rank > v_active_count + 1
      or (p_priority_tier = 'core' and v_target_rank > 3)
    then
      raise exception using
        errcode = '22023',
        message = 'Invalid goal change.';
    end if;

    update public.goals
    set
      active_rank = active_rank + 1,
      last_active_rank = active_rank + 1,
      updated_at = v_now
    where user_id = v_user_id
      and status = 'active'
      and archived_at is null
      and priority_tier = p_priority_tier
      and active_rank >= v_target_rank;

    insert into public.goals (
      user_id,
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
      status,
      active_rank,
      last_active_rank,
      rationale,
      constraints_text,
      created_at,
      updated_at
    )
    values (
      v_user_id,
      trim(p_title),
      trim(p_desired_outcome),
      p_category,
      v_clean_areas,
      p_start_date,
      p_target_date,
      nullif(trim(p_target_detail), ''),
      nullif(trim(p_target_metric_label), ''),
      nullif(trim(p_target_metric_value), ''),
      nullif(trim(p_target_metric_unit), ''),
      p_priority_tier,
      'active',
      v_target_rank,
      v_target_rank,
      nullif(trim(p_rationale), ''),
      nullif(trim(p_constraints_text), ''),
      v_now,
      v_now
    )
    returning id into v_goal_id;
    v_result := 'created';

  elsif p_operation = 'edit' then
    if p_goal_id is null or p_ordered_goal_ids is not null then
      raise exception using
        errcode = '22023',
        message = 'Invalid goal change.';
    end if;

    select *
    into v_goal
    from public.goals
    where id = p_goal_id
      and user_id = v_user_id
      and archived_at is null;

    if not found then
      raise exception using
        errcode = 'PT409',
        message = 'Goals changed. Reload and try again.';
    end if;

    v_goal_id := v_goal.id;
    v_old_tier := v_goal.priority_tier;
    v_old_rank := v_goal.active_rank;

    if v_goal.status = 'active' then
      select count(*)
      into v_active_count
      from public.goals
      where user_id = v_user_id
        and status = 'active'
        and archived_at is null
        and priority_tier = p_priority_tier
        and id <> v_goal.id;

      if p_priority_tier = 'core' and v_active_count >= 3 then
        raise exception using
          errcode = 'PT409',
          message = 'Three core goals are already active.';
      end if;

      v_target_rank := coalesce(
        p_target_rank,
        case
          when v_old_tier = p_priority_tier then v_old_rank
          else v_active_count + 1
        end
      );
      if v_target_rank < 1
        or v_target_rank > v_active_count + 1
        or (p_priority_tier = 'core' and v_target_rank > 3)
      then
        raise exception using
          errcode = '22023',
          message = 'Invalid goal change.';
      end if;

      if v_old_tier = p_priority_tier then
        if v_target_rank < v_old_rank then
          update public.goals
          set
            active_rank = active_rank + 1,
            last_active_rank = active_rank + 1,
            updated_at = v_now
          where user_id = v_user_id
            and status = 'active'
            and archived_at is null
            and priority_tier = v_old_tier
            and id <> v_goal.id
            and active_rank >= v_target_rank
            and active_rank < v_old_rank;
        elsif v_target_rank > v_old_rank then
          update public.goals
          set
            active_rank = active_rank - 1,
            last_active_rank = active_rank - 1,
            updated_at = v_now
          where user_id = v_user_id
            and status = 'active'
            and archived_at is null
            and priority_tier = v_old_tier
            and id <> v_goal.id
            and active_rank > v_old_rank
            and active_rank <= v_target_rank;
        end if;
      else
        update public.goals
        set
          active_rank = active_rank - 1,
          last_active_rank = active_rank - 1,
          updated_at = v_now
        where user_id = v_user_id
          and status = 'active'
          and archived_at is null
          and priority_tier = v_old_tier
          and active_rank > v_old_rank;

        update public.goals
        set
          active_rank = active_rank + 1,
          last_active_rank = active_rank + 1,
          updated_at = v_now
        where user_id = v_user_id
          and status = 'active'
          and archived_at is null
          and priority_tier = p_priority_tier
          and active_rank >= v_target_rank;
      end if;
    else
      v_target_rank := null;
    end if;

    update public.goals
    set
      title = trim(p_title),
      desired_outcome = trim(p_desired_outcome),
      category = p_category,
      activity_areas = v_clean_areas,
      start_date = p_start_date,
      target_date = p_target_date,
      target_detail = nullif(trim(p_target_detail), ''),
      target_metric_label = nullif(trim(p_target_metric_label), ''),
      target_metric_value = nullif(trim(p_target_metric_value), ''),
      target_metric_unit = nullif(trim(p_target_metric_unit), ''),
      priority_tier = p_priority_tier,
      active_rank = v_target_rank,
      last_active_rank = coalesce(v_target_rank, last_active_rank),
      rationale = nullif(trim(p_rationale), ''),
      constraints_text = nullif(trim(p_constraints_text), ''),
      updated_at = v_now
    where id = v_goal.id
      and user_id = v_user_id;
    v_result := 'updated';

  elsif p_operation = 'reorder' then
    if p_goal_id is not null
      or p_priority_tier not in ('core', 'supporting')
      or p_ordered_goal_ids is null
      or p_target_rank is not null
    then
      raise exception using
        errcode = '22023',
        message = 'Invalid goal change.';
    end if;

    select count(*)
    into v_active_count
    from public.goals
    where user_id = v_user_id
      and status = 'active'
      and archived_at is null
      and priority_tier = p_priority_tier;

    select count(distinct goal_id)
    into v_order_count
    from unnest(p_ordered_goal_ids) as goal_id;

    if cardinality(p_ordered_goal_ids) <> v_active_count
      or v_order_count <> v_active_count
      or exists (
        select 1
        from unnest(p_ordered_goal_ids) as requested_goal_id
        where not exists (
          select 1
          from public.goals
          where id = requested_goal_id
            and user_id = v_user_id
            and status = 'active'
            and archived_at is null
            and priority_tier = p_priority_tier
        )
      )
    then
      raise exception using
        errcode = 'PT409',
        message = 'Goals changed. Reload and try again.';
    end if;

    update public.goals
    set
      active_rank = array_position(p_ordered_goal_ids, id),
      last_active_rank = array_position(p_ordered_goal_ids, id),
      updated_at = v_now
    where user_id = v_user_id
      and status = 'active'
      and archived_at is null
      and priority_tier = p_priority_tier;
    v_result := 'reordered';

  elsif p_operation in (
    'pause',
    'resume',
    'achieve',
    'abandon',
    'reopen',
    'archive',
    'delete'
  ) then
    if p_goal_id is null or p_ordered_goal_ids is not null then
      raise exception using
        errcode = '22023',
        message = 'Invalid goal change.';
    end if;

    select *
    into v_goal
    from public.goals
    where id = p_goal_id
      and user_id = v_user_id;

    if not found then
      raise exception using
        errcode = 'PT409',
        message = 'Goals changed. Reload and try again.';
    end if;

    v_goal_id := v_goal.id;
    v_old_tier := v_goal.priority_tier;
    v_old_rank := v_goal.active_rank;
    v_old_status := v_goal.status;

    if p_operation in ('pause', 'achieve', 'abandon') then
      if v_goal.archived_at is not null or v_goal.status <> 'active' then
        raise exception using
          errcode = 'PT409',
          message = 'Goals changed. Reload and try again.';
      end if;

      update public.goals
      set
        status = case
          when p_operation = 'pause' then 'paused'
          when p_operation = 'achieve' then 'achieved'
          else 'abandoned'
        end,
        active_rank = null,
        last_active_rank = v_old_rank,
        updated_at = v_now
      where id = v_goal.id
        and user_id = v_user_id;

      update public.goals
      set
        active_rank = active_rank - 1,
        last_active_rank = active_rank - 1,
        updated_at = v_now
      where user_id = v_user_id
        and status = 'active'
        and archived_at is null
        and priority_tier = v_old_tier
        and active_rank > v_old_rank;
      v_result := case
        when p_operation = 'pause' then 'paused'
        when p_operation = 'achieve' then 'achieved'
        else 'abandoned'
      end;

    elsif p_operation in ('resume', 'reopen') then
      if v_goal.archived_at is not null
        or (
          p_operation = 'resume'
          and v_goal.status <> 'paused'
        )
        or (
          p_operation = 'reopen'
          and v_goal.status not in ('achieved', 'abandoned')
        )
      then
        raise exception using
          errcode = 'PT409',
          message = 'Goals changed. Reload and try again.';
      end if;

      if p_priority_tier is not null
        and p_priority_tier not in ('core', 'supporting')
      then
        raise exception using
          errcode = '22023',
          message = 'Invalid goal change.';
      end if;
      v_old_tier := coalesce(p_priority_tier, v_goal.priority_tier);

      select count(*)
      into v_active_count
      from public.goals
      where user_id = v_user_id
        and status = 'active'
        and archived_at is null
        and priority_tier = v_old_tier;

      if v_old_tier = 'core' and v_active_count >= 3 then
        raise exception using
          errcode = 'PT409',
          message = 'Three core goals are already active.';
      end if;

      v_target_rank := coalesce(p_target_rank, v_active_count + 1);
      if v_target_rank < 1
        or v_target_rank > v_active_count + 1
        or (v_old_tier = 'core' and v_target_rank > 3)
      then
        raise exception using
          errcode = '22023',
          message = 'Invalid goal change.';
      end if;

      update public.goals
      set
        active_rank = active_rank + 1,
        last_active_rank = active_rank + 1,
        updated_at = v_now
      where user_id = v_user_id
        and status = 'active'
        and archived_at is null
        and priority_tier = v_old_tier
        and active_rank >= v_target_rank;

      update public.goals
      set
        priority_tier = v_old_tier,
        status = 'active',
        active_rank = v_target_rank,
        last_active_rank = v_target_rank,
        updated_at = v_now
      where id = v_goal.id
        and user_id = v_user_id;

      if p_operation = 'reopen' then
        insert into public.goal_lifecycle_events (
          user_id,
          goal_id,
          from_status,
          to_status,
          collection_revision,
          created_at
        )
        values (
          v_user_id,
          v_goal.id,
          v_old_status,
          'active',
          v_new_revision,
          v_now
        );
        v_result := 'reopened';
      else
        v_result := 'resumed';
      end if;

    elsif p_operation = 'archive' then
      if v_goal.archived_at is not null then
        raise exception using
          errcode = 'PT409',
          message = 'Goals changed. Reload and try again.';
      end if;

      update public.goals
      set
        active_rank = null,
        last_active_rank = coalesce(v_old_rank, last_active_rank),
        archived_at = v_now,
        updated_at = v_now
      where id = v_goal.id
        and user_id = v_user_id;

      if v_old_rank is not null then
        update public.goals
        set
          active_rank = active_rank - 1,
          last_active_rank = active_rank - 1,
          updated_at = v_now
        where user_id = v_user_id
          and status = 'active'
          and archived_at is null
          and priority_tier = v_old_tier
          and active_rank > v_old_rank;
      end if;
      v_result := 'archived';

    else
      if v_goal.archived_at is not null
        or v_goal.status not in ('active', 'paused')
        or exists (
          select 1
          from public.goal_lifecycle_events
          where user_id = v_user_id
            and goal_id = v_goal.id
        )
      then
        raise exception using
          errcode = 'PT409',
          message = 'This goal must be archived.';
      end if;

      delete from public.goals
      where id = v_goal.id
        and user_id = v_user_id;

      if v_old_rank is not null then
        update public.goals
        set
          active_rank = active_rank - 1,
          last_active_rank = active_rank - 1,
          updated_at = v_now
        where user_id = v_user_id
          and status = 'active'
          and archived_at is null
          and priority_tier = v_old_tier
          and active_rank > v_old_rank;
      end if;
      v_result := 'deleted';
    end if;

  else
    raise exception using
      errcode = '22023',
      message = 'Invalid goal change.';
  end if;

  if exists (
    select 1
    from (
      select
        priority_tier,
        count(*) as goal_count,
        min(active_rank) as min_rank,
        max(active_rank) as max_rank,
        count(distinct active_rank) as distinct_rank_count
      from public.goals
      where user_id = v_user_id
        and status = 'active'
        and archived_at is null
      group by priority_tier
    ) as ordering
    where min_rank <> 1
      or max_rank <> goal_count
      or distinct_rank_count <> goal_count
      or (priority_tier = 'core' and goal_count > 3)
  ) then
    raise exception using
      errcode = '23514',
      message = 'Goal ordering could not be completed.';
  end if;

  insert into public.goal_collections (user_id, revision, updated_at)
  values (v_user_id, v_new_revision, v_now)
  on conflict (user_id)
  do update set
    revision = excluded.revision,
    updated_at = excluded.updated_at;

  return (
    v_goal_id,
    v_new_revision,
    v_result
  )::public.goal_change_receipt;
end;
$$;

revoke all privileges on function public.apply_goal_change(
  bigint,
  text,
  uuid,
  text,
  text,
  text,
  text[],
  date,
  date,
  text,
  text,
  text,
  text,
  text,
  smallint,
  text,
  text,
  uuid[]
) from public, anon, authenticated, service_role;

grant execute on function public.apply_goal_change(
  bigint,
  text,
  uuid,
  text,
  text,
  text,
  text[],
  date,
  date,
  text,
  text,
  text,
  text,
  text,
  smallint,
  text,
  text,
  uuid[]
) to authenticated;
