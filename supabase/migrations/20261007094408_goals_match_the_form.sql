-- The goals table holds what the goal form asks, and nothing else (owner,
-- 7 Oct 2026).
--
-- The form was slimmed on 5 Oct 2026 to title, desired outcome, sports, an
-- optional target date and core or supporting, without touching the database.
-- Until now seven unasked columns travelled hidden through every edit,
-- `category` was written as `other` for every new goal, Archive had left the
-- screen and stayed on the server, and "Achieved on" showed a goal's
-- last-changed time. The owner decided:
--
--   * `start_date`, `target_detail`, the three `target_metric_*`, `rationale`,
--     `constraints_text` and `category` go, with whatever they hold.
--     Destructive and not reversible.
--   * `activity_areas` is renamed `sports`. The coach reads it in place of
--     category (ADR-012, amended the same day).
--   * Archive is removed. Goals archived earlier are deleted here, with their
--     reopen history. `archived_at` goes.
--   * Any goal can be deleted at any time, whatever its status and whether or
--     not it was ever reopened. "This goal must be archived." no longer exists.
--   * Pause and Abandoned both stay.
--   * An achieved goal stores the moment it was achieved.
--
-- Structurally: `apply_goal_change` loses eight parameters and renames one, so
-- the 18-argument function is dropped and a 10-argument one created. Its body
-- is the one from `20260729161854_m2_01_goal_model`, with the changes marked
-- "Changed" below. `accept_roadmap_proposal` is re-emitted verbatim from
-- `20260916075522_m3_15f_roadmap_generation` without its `archived_at`
-- predicate; it is the only other function that read the column.
--
-- Owner-visible conditions: a page left open from before this migration sends
-- the old arguments and is refused, because no function of that shape exists.
-- A goal a roadmap proposal read can now be deleted; accepting that proposal
-- answers "Your goals changed. Review the proposal again.", as it already did
-- for a goal that was paused or archived.

-- 1. Goals archived earlier ---------------------------------------------------

delete from public.goal_lifecycle_events as event
using public.goals as goal
where goal.id = event.goal_id
  and goal.user_id = event.user_id
  and goal.archived_at is not null;

delete from public.goals
where archived_at is not null;

-- 2. The table ----------------------------------------------------------------

drop index public.goals_owner_list_idx;

alter table public.goals
  drop constraint goals_active_rank_check,
  drop constraint goals_target_date_check,
  drop constraint goals_category_check,
  drop constraint goals_target_detail_check,
  drop constraint goals_target_metric_check,
  drop constraint goals_rationale_check,
  drop constraint goals_constraints_text_check,
  drop constraint goals_activity_areas_check;

alter table public.goals
  drop column category,
  drop column start_date,
  drop column target_detail,
  drop column target_metric_label,
  drop column target_metric_value,
  drop column target_metric_unit,
  drop column rationale,
  drop column constraints_text,
  drop column archived_at;

alter table public.goals
  rename column activity_areas to sports;

alter table public.goals
  add column achieved_at timestamptz;

-- The nearest thing to the day that exists: until now nothing wrote to an
-- achieved goal after `achieve` except an edit.
update public.goals
set achieved_at = updated_at
where status = 'achieved';

alter table public.goals
  add constraint goals_sports_check check (
    cardinality(sports) <= 10
    and array_position(sports, null) is null
    and char_length(array_to_string(sports, '')) <= 600
  ),
  add constraint goals_achieved_at_check check (
    (status = 'achieved') = (achieved_at is not null)
  ),
  add constraint goals_active_rank_check check (
    (
      status = 'active'
      and active_rank is not null
      and active_rank > 0
      and (priority_tier <> 'core' or active_rank <= 3)
    )
    or (
      status <> 'active'
      and active_rank is null
    )
  );

create index goals_owner_list_idx
  on public.goals (user_id, status, priority_tier, active_rank);

-- 3. apply_goal_change --------------------------------------------------------

drop function public.apply_goal_change(
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
);

create function public.apply_goal_change(
  p_expected_collection_revision bigint,
  p_operation text,
  p_goal_id uuid default null,
  p_title text default null,
  p_desired_outcome text default null,
  p_sports text[] default null,
  p_target_date date default null,
  p_priority_tier text default null,
  p_target_rank smallint default null,
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
  v_sport text;
  v_clean_sports text[] := array[]::text[];
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
      or p_priority_tier is null
      or p_priority_tier not in ('core', 'supporting')
    then
      raise exception using
        errcode = '22023',
        message = 'Invalid goal change.';
    end if;

    -- Changed: a goal names one to ten sports. Until now only the form
    -- required one. `coalesce` because `cardinality(null)` is null, which
    -- would pass a comparison rather than fail it.
    if cardinality(coalesce(p_sports, '{}')) not between 1 and 10 then
      raise exception using
        errcode = '22023',
        message = 'Invalid goal change.';
    end if;

    foreach v_sport in array p_sports
    loop
      v_sport := trim(v_sport);
      if v_sport is null
        or char_length(v_sport) not between 1 and 60
        or lower(v_sport) = any (
          select lower(existing_sport)
          from unnest(v_clean_sports) as existing_sport
        )
      then
        raise exception using
          errcode = '22023',
          message = 'Invalid goal change.';
      end if;
      v_clean_sports := array_append(v_clean_sports, v_sport);
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
      and priority_tier = p_priority_tier
      and active_rank >= v_target_rank;

    insert into public.goals (
      user_id,
      title,
      desired_outcome,
      sports,
      target_date,
      priority_tier,
      status,
      active_rank,
      last_active_rank,
      created_at,
      updated_at
    )
    values (
      v_user_id,
      trim(p_title),
      trim(p_desired_outcome),
      v_clean_sports,
      p_target_date,
      p_priority_tier,
      'active',
      v_target_rank,
      v_target_rank,
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
      and user_id = v_user_id;

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
          and priority_tier = v_old_tier
          and active_rank > v_old_rank;

        update public.goals
        set
          active_rank = active_rank + 1,
          last_active_rank = active_rank + 1,
          updated_at = v_now
        where user_id = v_user_id
          and status = 'active'
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
      sports = v_clean_sports,
      target_date = p_target_date,
      priority_tier = p_priority_tier,
      active_rank = v_target_rank,
      last_active_rank = coalesce(v_target_rank, last_active_rank),
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
      and priority_tier = p_priority_tier;
    v_result := 'reordered';

  elsif p_operation in (
    'pause',
    'resume',
    'achieve',
    'abandon',
    'reopen',
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
      if v_goal.status <> 'active' then
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
        -- Changed: the moment a goal was achieved is its own column.
        achieved_at = case when p_operation = 'achieve' then v_now end,
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
        and priority_tier = v_old_tier
        and active_rank > v_old_rank;
      v_result := case
        when p_operation = 'pause' then 'paused'
        when p_operation = 'achieve' then 'achieved'
        else 'abandoned'
      end;

    elsif p_operation in ('resume', 'reopen') then
      if (
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
        and priority_tier = v_old_tier
        and active_rank >= v_target_rank;

      update public.goals
      set
        priority_tier = v_old_tier,
        status = 'active',
        achieved_at = null,
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

    else
      -- Changed: any goal can be deleted, whatever its status and whether or
      -- not it was reopened (owner, 7 Oct 2026). Its reopen history goes
      -- first, because that table's foreign key restricts the delete.
      delete from public.goal_lifecycle_events
      where goal_id = v_goal.id
        and user_id = v_user_id;

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
  text[],
  date,
  text,
  smallint,
  uuid[]
) from public, anon, authenticated, service_role;

grant execute on function public.apply_goal_change(
  bigint,
  text,
  uuid,
  text,
  text,
  text[],
  date,
  text,
  smallint,
  uuid[]
) to authenticated;

-- 4. accept_roadmap_proposal --------------------------------------------------
--
-- Verbatim from `20260916075522_m3_15f_roadmap_generation`, less the
-- `archived_at is null` line of the goal-source check.

create or replace function public.accept_roadmap_proposal(
  p_proposal_id uuid,
  p_expected_head_revision bigint
)
returns public.roadmap_acceptance_receipt
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_proposal public.roadmap_proposals;
  v_decision public.roadmap_proposal_decisions;
  v_head public.roadmap_heads;
  v_head_revision bigint;
  v_current_version_id uuid;
  v_source public.roadmap_proposal_sources;
  v_version_id uuid;
  v_version_number bigint;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'An authenticated FitTip user is required.';
  end if;

  if p_proposal_id is null
    or p_expected_head_revision is null
    or p_expected_head_revision < 0
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid roadmap acceptance.';
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

  select * into v_proposal
  from public.roadmap_proposals
  where id = p_proposal_id and user_id = v_user_id;

  if not found then
    raise exception using
      errcode = 'PT409',
      message = 'That proposal is no longer available.';
  end if;

  -- Replaying acceptance of the same proposal returns its existing version.
  select * into v_decision
  from public.roadmap_proposal_decisions
  where proposal_id = v_proposal.id and user_id = v_user_id;

  if found then
    if v_decision.decision = 'accepted' then
      select revision into v_head_revision
      from public.roadmap_heads
      where user_id = v_user_id;
      return (
        v_proposal.id,
        v_decision.accepted_version_id,
        coalesce(v_head_revision, 0),
        'replayed'
      )::public.roadmap_acceptance_receipt;
    end if;
    raise exception using
      errcode = 'PT409',
      message = 'That proposal has already been decided.';
  end if;

  -- Every stored source must still point at the same current eligible revision.
  -- Unrelated new records create no conflict, because only what actually
  -- travelled is recorded here.
  for v_source in
    select * from public.roadmap_proposal_sources
    where proposal_id = v_proposal.id and user_id = v_user_id
  loop
    if v_source.source_kind = 'goal' then
      if not exists (
        select 1 from public.goals
        where id = v_source.record_id
          and user_id = v_user_id
          and status in ('active', 'achieved')
      ) then
        raise exception using
          errcode = 'PT409',
          message = 'Your goals changed. Review the proposal again.';
      end if;

    elsif v_source.source_kind = 'memory' then
      -- Compared by revision number rather than revision id: the item view the
      -- application reads exposes the number, and the two are equivalent
      -- because memory revisions are append-only and monotonic per item. An
      -- edited or disabled item therefore fails this check, while an unrelated
      -- new memory item does not appear here at all.
      if not exists (
        select 1
        from public.memory_items i
        join public.memory_revisions r
          on r.id = i.current_revision_id and r.user_id = i.user_id
        where i.id = v_source.record_id
          and i.user_id = v_user_id
          and i.status = 'active'
          and r.revision_number = v_source.revision_number
      ) then
        raise exception using
          errcode = 'PT409',
          message = 'Your memory changed. Review the proposal again.';
      end if;

    elsif v_source.source_kind = 'completion' then
      -- M3-15A's factual record. A correction bumps `revision`, so a completion
      -- edited since it travelled fails here and the owner is told to look
      -- again; a completion logged since then was never a source and is not
      -- compared.
      if not exists (
        select 1 from public.completions
        where id = v_source.record_id
          and user_id = v_user_id
          and revision = v_source.revision_number
      ) then
        raise exception using
          errcode = 'PT409',
          message = 'Your training history changed. Review the proposal again.';
      end if;

    else
      -- 'plan_version'. Unverifiable since M3-11 dropped the relation that
      -- carried it, and therefore never verified.
      raise exception using
        errcode = 'PT409',
        message = 'Your plan changed. Review the proposal again.';
    end if;
  end loop;

  select * into v_head
  from public.roadmap_heads
  where user_id = v_user_id
  for update;

  v_head_revision := coalesce(v_head.revision, 0);
  v_current_version_id := v_head.current_version_id;

  if v_head_revision <> p_expected_head_revision then
    raise exception using
      errcode = 'PT409',
      message = 'Your roadmap changed. Review the proposal again.';
  end if;

  v_version_number := v_head_revision + 1;
  v_version_id := gen_random_uuid();

  insert into public.roadmap_versions (
    id, user_id, version_number, source_proposal_id, previous_version_id,
    content, accepted_at
  )
  values (
    v_version_id, v_user_id, v_version_number, v_proposal.id,
    v_current_version_id, v_proposal.content, v_now
  );

  insert into public.roadmap_heads (
    user_id, revision, current_version_id, updated_at
  )
  values (v_user_id, v_version_number, v_version_id, v_now)
  on conflict (user_id)
  do update set
    revision = excluded.revision,
    current_version_id = excluded.current_version_id,
    updated_at = excluded.updated_at;

  insert into public.roadmap_proposal_decisions (
    proposal_id, user_id, decision, accepted_version_id, decided_at
  )
  values (v_proposal.id, v_user_id, 'accepted', v_version_id, v_now);

  return (v_proposal.id, v_version_id, v_version_number, 'accepted')
    ::public.roadmap_acceptance_receipt;
end;
$$;

revoke all privileges on function public.accept_roadmap_proposal(
  uuid, bigint
) from public, anon, authenticated, service_role;
grant execute on function public.accept_roadmap_proposal(
  uuid, bigint
) to authenticated;
