-- The coach words its own memory suggestions.
--
-- Owner, 18 Oct 2026. Until now a memory candidate had to be an exact excerpt
-- of the planning note: `strpos(planning_note, excerpt) = 0` refused anything
-- else, and the coach's suggestions almost never survived it. ADR-010 decision
-- 16 is amended the same day: a candidate is one sentence in the coach's own
-- words, with no quote required, for plan and roadmap alike.
--
-- What changes, in both routes: the candidate's key is `content` rather than
-- `sourceExcerpt`, and the substring check is gone. The text is still
-- normalized by `roadmap_normalize_owner_text`, as the application normalizes
-- it, and still 1 to 200 characters.
--
-- What does not change, and is the rest of decision 16: `security definer`
-- granted to `authenticated` alone, the owner taken from `auth.uid()`, only
-- `proposed` items with `author_class = 'system'` and
-- `provenance = 'inferred_proposed'`, nothing able to move an item out of
-- `proposed`, a proposal without a planning note refused, and a replayed batch
-- returning its existing items.
--
-- The limit given up, stated so nobody assumes it still holds: the database
-- can no longer prove that text from the regeneration feedback stays out of
-- memory. The prompt says to draw on the note alone, and the owner accepting or
-- rejecting the proposal is the check.

create or replace function public.record_plan_memory_candidates(
  p_completion_token uuid,
  p_expected_memory_revision bigint,
  p_candidates jsonb
)
returns public.plan_memory_candidate_receipt
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_request public.plan_generation_requests;
  v_proposal public.plan_proposals;
  v_current_revision bigint;
  v_new_revision bigint;
  v_candidate jsonb;
  v_ordinal integer := 0;
  v_content text;
  v_type text;
  v_confidence smallint;
  v_item_id uuid;
  v_revision_id uuid;
  v_source_reference text;
  v_item_ids uuid[] := array[]::uuid[];
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'An authenticated FitTip user is required.';
  end if;

  if p_completion_token is null
    or p_expected_memory_revision is null
    or p_expected_memory_revision < 0
    or p_candidates is null
    or pg_catalog.jsonb_typeof(p_candidates) <> 'array'
    or pg_catalog.jsonb_array_length(p_candidates) not between 1 and 4
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid memory candidates.';
  end if;

  select * into v_request
  from public.plan_generation_requests
  where user_id = v_user_id
    and completion_token = p_completion_token
    and status = 'completed';

  if not found then
    raise exception using
      errcode = 'PT409',
      message = 'That coaching request is no longer open.';
  end if;

  select * into v_proposal
  from public.plan_proposals
  where id = v_request.proposal_id
    and user_id = v_user_id;

  if not found then
    raise exception using
      errcode = 'PT409',
      message = 'That coaching request is no longer open.';
  end if;

  -- With no planning note there is nothing for a candidate to be drawn from.
  if v_proposal.planning_note is null then
    raise exception using
      errcode = '22023',
      message = 'Invalid memory candidates.';
  end if;

  -- ADR-010's owner lock, stale-revision check and collection increment, with
  -- decision 11's bounded wait: a contended save answers with a conflict the
  -- caller can act on rather than hanging. The lock key matches the roadmap
  -- route's, because both serialize the same owner's memory collection.
  perform pg_catalog.set_config('lock_timeout', '3s', true);
  begin
    perform pg_catalog.pg_advisory_xact_lock(
      62002,
      pg_catalog.hashtext(v_user_id::text)
    );
  exception
    when lock_not_available then
      raise exception using
        errcode = 'PT409',
        message = 'Memory changed. Reload and try again.';
  end;

  -- Retry returns the existing candidates rather than duplicating them. The
  -- source reference is the proposal plus the candidate ordinal, so the same
  -- batch replayed maps onto the same rows.
  if exists (
    select 1
    from public.memory_items
    where user_id = v_user_id
      and source_reference like 'plan-proposal:' || v_proposal.id::text || ':%'
  ) then
    select
      coalesce(
        (select revision from public.memory_collections where user_id = v_user_id),
        0
      ),
      pg_catalog.array_agg(id order by source_reference)
    into v_new_revision, v_item_ids
    from public.memory_items
    where user_id = v_user_id
      and source_reference like 'plan-proposal:' || v_proposal.id::text || ':%';

    return (v_new_revision, v_item_ids)
      ::public.plan_memory_candidate_receipt;
  end if;

  select revision into v_current_revision
  from public.memory_collections
  where user_id = v_user_id;
  v_current_revision := coalesce(v_current_revision, 0);

  if v_current_revision <> p_expected_memory_revision then
    raise exception using
      errcode = 'PT409',
      message = 'Memory changed. Reload and try again.';
  end if;

  v_new_revision := v_current_revision + 1;

  for v_candidate in
    select value from pg_catalog.jsonb_array_elements(p_candidates)
  loop
    if exists (
      select 1
      from pg_catalog.jsonb_object_keys(v_candidate) as key
      where key not in ('memoryType', 'content', 'confidence')
    ) then
      raise exception using
        errcode = '22023',
        message = 'Invalid memory candidates.';
    end if;

    v_type := v_candidate->>'memoryType';
    if v_type not in (
      'profile_fact', 'constraint', 'preference', 'observed_pattern'
    ) then
      raise exception using
        errcode = '22023',
        message = 'Invalid memory candidates.';
    end if;

    -- The coach's own sentence (ADR-010 decision 16, amended 18 Oct 2026).
    -- Normalized as the application normalized it, and bounded; nothing ties
    -- it to the note's wording any more, which is the owner's decision.
    v_content := public.roadmap_normalize_owner_text(
      v_candidate->>'content'
    );
    if v_content is null
      or pg_catalog.char_length(v_content) not between 1 and 200
    then
      raise exception using
        errcode = '22023',
        message = 'Invalid memory candidates.';
    end if;

    v_confidence := null;
    if v_candidate ? 'confidence'
      and pg_catalog.jsonb_typeof(v_candidate->'confidence') <> 'null'
    then
      if pg_catalog.jsonb_typeof(v_candidate->'confidence') <> 'number' then
        raise exception using
          errcode = '22023',
          message = 'Invalid memory candidates.';
      end if;
      v_confidence := (v_candidate->>'confidence')::numeric;
      if v_confidence not between 0 and 100 then
        raise exception using
          errcode = '22023',
          message = 'Invalid memory candidates.';
      end if;
    end if;

    v_item_id := gen_random_uuid();
    v_revision_id := gen_random_uuid();
    v_source_reference :=
      'plan-proposal:' || v_proposal.id::text || ':' || v_ordinal::text;

    -- Owner, provenance, author class, status and timestamps are derived here.
    -- None of them is a caller input, which is what keeps this route unable to
    -- create anything but a proposal.
    insert into public.memory_revisions (
      id, user_id, item_id, revision_number, content, author_class,
      provenance, change_kind, status_after, previous_revision_id, created_at
    )
    values (
      v_revision_id, v_user_id, v_item_id, 1, v_content, 'system',
      'inferred_proposed', 'created', 'proposed', null, v_now
    );

    insert into public.memory_items (
      id, user_id, memory_type, status, provenance, confidence,
      source_reference, expires_on, current_revision_id, user_confirmed_at,
      status_changed_at, created_at, updated_at
    )
    values (
      v_item_id, v_user_id, v_type, 'proposed', 'inferred_proposed',
      v_confidence, v_source_reference, null, v_revision_id, null,
      v_now, v_now, v_now
    );

    v_item_ids := v_item_ids || v_item_id;
    v_ordinal := v_ordinal + 1;
  end loop;

  insert into public.memory_collections (user_id, revision, updated_at)
  values (v_user_id, v_new_revision, v_now)
  on conflict (user_id)
  do update set revision = excluded.revision, updated_at = excluded.updated_at;

  return (v_new_revision, v_item_ids)
    ::public.plan_memory_candidate_receipt;
end;
$$;

create or replace function public.record_roadmap_memory_candidates(
  p_completion_token uuid,
  p_expected_memory_revision bigint,
  p_candidates jsonb
)
returns public.roadmap_memory_candidate_receipt
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_request public.roadmap_generation_requests;
  v_proposal public.roadmap_proposals;
  v_current_revision bigint;
  v_new_revision bigint;
  v_candidate jsonb;
  v_ordinal integer := 0;
  v_content text;
  v_type text;
  v_confidence smallint;
  v_item_id uuid;
  v_revision_id uuid;
  v_source_reference text;
  v_item_ids uuid[] := array[]::uuid[];
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'An authenticated FitTip user is required.';
  end if;

  if p_completion_token is null
    or p_expected_memory_revision is null
    or p_expected_memory_revision < 0
    or p_candidates is null
    or pg_catalog.jsonb_typeof(p_candidates) <> 'array'
    or pg_catalog.jsonb_array_length(p_candidates) not between 1 and 4
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid memory candidates.';
  end if;

  select * into v_request
  from public.roadmap_generation_requests
  where user_id = v_user_id
    and completion_token = p_completion_token
    and status = 'completed';

  if not found then
    raise exception using
      errcode = 'PT409',
      message = 'That coaching request is no longer open.';
  end if;

  select * into v_proposal
  from public.roadmap_proposals
  where id = v_request.proposal_id
    and user_id = v_user_id;

  if not found or v_proposal.origin = 'owner_edit' then
    raise exception using
      errcode = 'PT409',
      message = 'That coaching request is no longer open.';
  end if;

  -- With no planning note there is nothing for a candidate to be drawn from.
  if v_proposal.planning_note is null then
    raise exception using
      errcode = '22023',
      message = 'Invalid memory candidates.';
  end if;

  -- ADR-010's owner lock, stale-revision check and collection increment.
  perform pg_catalog.set_config('lock_timeout', '3s', true);
  begin
    perform pg_catalog.pg_advisory_xact_lock(
      62002,
      pg_catalog.hashtext(v_user_id::text)
    );
  exception
    when lock_not_available then
      raise exception using
        errcode = 'PT409',
        message = 'Memory changed. Reload and try again.';
  end;

  -- Retry returns the existing candidates rather than duplicating them. The
  -- source reference is the proposal plus the candidate ordinal, so the same
  -- batch replayed maps onto the same rows.
  if exists (
    select 1
    from public.memory_items
    where user_id = v_user_id
      and source_reference like 'roadmap-proposal:' || v_proposal.id::text || ':%'
  ) then
    select
      coalesce(
        (select revision from public.memory_collections where user_id = v_user_id),
        0
      ),
      pg_catalog.array_agg(id order by source_reference)
    into v_new_revision, v_item_ids
    from public.memory_items
    where user_id = v_user_id
      and source_reference like 'roadmap-proposal:' || v_proposal.id::text || ':%';

    return (v_new_revision, v_item_ids)
      ::public.roadmap_memory_candidate_receipt;
  end if;

  select revision into v_current_revision
  from public.memory_collections
  where user_id = v_user_id;
  v_current_revision := coalesce(v_current_revision, 0);

  if v_current_revision <> p_expected_memory_revision then
    raise exception using
      errcode = 'PT409',
      message = 'Memory changed. Reload and try again.';
  end if;

  v_new_revision := v_current_revision + 1;

  for v_candidate in
    select value from pg_catalog.jsonb_array_elements(p_candidates)
  loop
    if exists (
      select 1
      from pg_catalog.jsonb_object_keys(v_candidate) as key
      where key not in ('memoryType', 'content', 'confidence')
    ) then
      raise exception using
        errcode = '22023',
        message = 'Invalid memory candidates.';
    end if;

    v_type := v_candidate->>'memoryType';
    if v_type not in (
      'profile_fact', 'constraint', 'preference', 'observed_pattern'
    ) then
      raise exception using
        errcode = '22023',
        message = 'Invalid memory candidates.';
    end if;

    -- The coach's own sentence (ADR-010 decision 16, amended 18 Oct 2026).
    -- Normalized as the application normalized it, and bounded; nothing ties
    -- it to the note's wording any more, which is the owner's decision.
    v_content := public.roadmap_normalize_owner_text(
      v_candidate->>'content'
    );
    if v_content is null
      or pg_catalog.char_length(v_content) not between 1 and 200
    then
      raise exception using
        errcode = '22023',
        message = 'Invalid memory candidates.';
    end if;

    v_confidence := null;
    if v_candidate ? 'confidence'
      and pg_catalog.jsonb_typeof(v_candidate->'confidence') <> 'null'
    then
      if pg_catalog.jsonb_typeof(v_candidate->'confidence') <> 'number' then
        raise exception using
          errcode = '22023',
          message = 'Invalid memory candidates.';
      end if;
      v_confidence := (v_candidate->>'confidence')::numeric;
      if v_confidence not between 0 and 100 then
        raise exception using
          errcode = '22023',
          message = 'Invalid memory candidates.';
      end if;
    end if;

    v_item_id := gen_random_uuid();
    v_revision_id := gen_random_uuid();
    v_source_reference :=
      'roadmap-proposal:' || v_proposal.id::text || ':' || v_ordinal::text;

    -- Owner, provenance, author class, status and timestamps are derived here.
    -- None of them is a caller input, which is what keeps this route unable to
    -- create anything but a proposal.
    insert into public.memory_revisions (
      id, user_id, item_id, revision_number, content, author_class,
      provenance, change_kind, status_after, previous_revision_id, created_at
    )
    values (
      v_revision_id, v_user_id, v_item_id, 1, v_content, 'system',
      'inferred_proposed', 'created', 'proposed', null, v_now
    );

    insert into public.memory_items (
      id, user_id, memory_type, status, provenance, confidence,
      source_reference, expires_on, current_revision_id, user_confirmed_at,
      status_changed_at, created_at, updated_at
    )
    values (
      v_item_id, v_user_id, v_type, 'proposed', 'inferred_proposed',
      v_confidence, v_source_reference, null, v_revision_id, null,
      v_now, v_now, v_now
    );

    v_item_ids := v_item_ids || v_item_id;
    v_ordinal := v_ordinal + 1;
  end loop;

  insert into public.memory_collections (user_id, revision, updated_at)
  values (v_user_id, v_new_revision, v_now)
  on conflict (user_id)
  do update set revision = excluded.revision, updated_at = excluded.updated_at;

  return (v_new_revision, v_item_ids)
    ::public.roadmap_memory_candidate_receipt;
end;
$$;

-- `create or replace` keeps the ACL, but it is stated here rather than
-- inherited, as every migration that replaces one of these does.
revoke all privileges on function public.record_plan_memory_candidates(
  uuid, bigint, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.record_plan_memory_candidates(
  uuid, bigint, jsonb
) to authenticated;

revoke all privileges on function public.record_roadmap_memory_candidates(
  uuid, bigint, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.record_roadmap_memory_candidates(
  uuid, bigint, jsonb
) to authenticated;
