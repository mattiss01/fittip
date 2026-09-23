-- Plan proposal memory candidates.
--
-- The plan coach already returns memory candidates and `validateMemoryCandidates`
-- already checks them against the planning note. What was missing was the route
-- that records them: M3-11 dropped the plan's `record_plan_memory_candidates`
-- with the rest of the old plan-proposal schema, and M3-16A deliberately did not
-- rebuild it -- it said so in its own comment and left a line on the list rather
-- than hide the gap. So `generatePlanProposal` has been dropping every candidate
-- on the floor, and a planning note that states a durable constraint has proposed
-- nothing on the memory surface. This is that route.
--
-- ## What permits it
--
-- ADR-010 decision 16, added 23 September 2026. This is the second route it
-- permits and it holds to all of it: `security definer` granted to
-- `authenticated` alone, the owner derived from `auth.uid()` and never taken as
-- input, creating nothing but `proposed` items carrying `author_class = 'system'`
-- and `provenance = 'inferred_proposed'`, and unable to accept, enable, edit,
-- delete, or otherwise move an item out of `proposed`. Only the owner does that,
-- through `apply_memory_change`.
--
-- The two limits decision 16 calls non-optional are both here. A `proposed` item
-- is never eligible coaching context, so this route cannot feed its own output
-- back to the coach as fact. And every candidate must quote text the owner wrote:
-- `strpos(planning_note, excerpt) = 0` refuses anything the coach phrased itself,
-- which is what stops it inventing a durable claim about the owner. A proposal
-- with no planning note therefore has nothing a candidate could cite and is
-- refused outright.
--
-- ## Differences from the roadmap route, all of them structural
--
-- `record_roadmap_memory_candidates` is the model and this is deliberately its
-- shape, because two routes that differ without reason are two things to review.
-- Three differences are forced by the tables rather than chosen:
--
-- First, there is no `origin = 'owner_edit'` guard. The roadmap route needs one
-- because a roadmap proposal can be edited into a derived row whose text is the
-- owner's, not the coach's. `plan_proposals_origin_check` admits only
-- `'ai_initial'`, so every plan proposal is a coach proposal and there is nothing
-- to exclude. If that constraint is ever widened, this function needs the guard.
--
-- Second, the source reference prefix is `plan-proposal:` rather than
-- `roadmap-proposal:`. That is what keeps the two routes' replay detection from
-- colliding on one owner's memory: a plan batch replayed returns the plan's
-- existing items and cannot be confused with a roadmap batch.
--
-- Third, `roadmap_normalize_owner_text` is reused rather than copied. M3-16A
-- already reuses it for the plan's planning note (line 668), so the text this
-- function compares against was normalized by the same code that normalized the
-- note it is compared to. Copying it would be two normalizers that must agree
-- forever, and a substring check between two differently-normalized strings is a
-- silent refusal of valid candidates.

-- ---------------------------------------------------------------------------
-- The receipt.
-- ---------------------------------------------------------------------------
--
-- The item ids let the caller report how many were created without reading the
-- items back, and the collection revision is what a caller holding a stale one
-- needs in order to refresh. Neither carries memory content: ADR-010 decision 8
-- applies to this receipt as much as to `apply_memory_change`'s.
create type public.plan_memory_candidate_receipt as (
  collection_revision bigint,
  item_ids uuid[]
);

create function public.record_plan_memory_candidates(
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
  v_excerpt text;
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

  -- With no planning note there is nothing for a candidate to cite, so every
  -- candidate would fail the excerpt check below. Refusing here says why.
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
      where key not in ('memoryType', 'sourceExcerpt', 'confidence')
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

    -- The excerpt must appear in the planning note the owner wrote. This is the
    -- limit ADR-010 decision 16 calls non-optional: without it the coach could
    -- author a durable claim about the owner in its own words.
    v_excerpt := public.roadmap_normalize_owner_text(
      v_candidate->>'sourceExcerpt'
    );
    if v_excerpt is null
      or pg_catalog.char_length(v_excerpt) not between 1 and 200
      or pg_catalog.strpos(v_proposal.planning_note, v_excerpt) = 0
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
      v_revision_id, v_user_id, v_item_id, 1, v_excerpt, 'system',
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

-- ---------------------------------------------------------------------------
-- The privilege boundary.
-- ---------------------------------------------------------------------------
--
-- `authenticated` and nobody else, stated rather than inherited: the revoke runs
-- first so the ACL does not depend on what `public` picks up by default. `anon`
-- and `service_role` stay revoked -- this function derives its owner from
-- `auth.uid()`, so a role with no owner could only ever fail, and a role that
-- bypasses RLS must never hold a capability it cannot be scoped by.
revoke all privileges on function public.record_plan_memory_candidates(
  uuid, bigint, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.record_plan_memory_candidates(
  uuid, bigint, jsonb
) to authenticated;
