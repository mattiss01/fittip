create type public.memory_change_receipt as (
  item_id uuid,
  collection_revision bigint,
  revision_number integer,
  result text
);

create table public.memory_collections (
  user_id uuid primary key,
  revision bigint not null default 0,
  updated_at timestamptz not null default now(),
  constraint memory_collections_owner_fkey
    foreign key (user_id)
    references public.profiles (user_id)
    on delete cascade,
  constraint memory_collections_revision_check check (revision >= 0)
);

-- The item row carries identity, status, provenance and expiry only. Every
-- copy of the user's text lives in memory_revisions, so permanently deleting
-- an item's revisions removes all of its content in one transaction.
create table public.memory_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  memory_type text not null,
  status text not null,
  provenance text not null,
  confidence smallint,
  source_reference text,
  expires_on date,
  current_revision_id uuid not null,
  user_confirmed_at timestamptz,
  status_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint memory_items_owner_fkey
    foreign key (user_id)
    references public.profiles (user_id)
    on delete cascade,
  constraint memory_items_owner_key unique (id, user_id),
  constraint memory_items_type_check
    check (
      memory_type in (
        'profile_fact',
        'constraint',
        'preference',
        'observed_pattern'
      )
    ),
  constraint memory_items_status_check
    check (status in ('active', 'proposed', 'rejected', 'archived')),
  constraint memory_items_provenance_check
    check (
      provenance in (
        'user_created',
        'intake_confirmed',
        'inferred_proposed'
      )
    ),
  -- Confidence is only meaningful for an inference and is never presented as
  -- certainty. A user-created or intake-confirmed item carries none.
  constraint memory_items_confidence_check
    check (
      confidence is null
      or (
        provenance = 'inferred_proposed'
        and confidence between 0 and 100
      )
    ),
  constraint memory_items_source_reference_check
    check (
      source_reference is null
      or char_length(trim(source_reference)) between 1 and 200
    ),
  -- A proposal is not yet context, so it cannot carry a user confirmation.
  constraint memory_items_confirmation_check
    check (status <> 'proposed' or user_confirmed_at is null)
);

create table public.memory_revisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  item_id uuid not null,
  revision_number integer not null,
  content text not null,
  author_class text not null,
  provenance text not null,
  change_kind text not null,
  status_after text not null,
  previous_revision_id uuid,
  created_at timestamptz not null default now(),
  constraint memory_revisions_owner_fkey
    foreign key (user_id)
    references public.profiles (user_id)
    on delete cascade,
  constraint memory_revisions_owner_key unique (id, user_id),
  -- Deferred so one transaction can write the first revision and the item that
  -- points at it, and so a permanent delete can purge revisions before the
  -- item without a transient reference breaking mid-transaction.
  constraint memory_revisions_item_fkey
    foreign key (item_id, user_id)
    references public.memory_items (id, user_id)
    on delete cascade
    deferrable initially deferred,
  constraint memory_revisions_previous_fkey
    foreign key (previous_revision_id, user_id)
    references public.memory_revisions (id, user_id)
    deferrable initially deferred,
  constraint memory_revisions_number_key
    unique (user_id, item_id, revision_number),
  constraint memory_revisions_number_check check (revision_number >= 1),
  constraint memory_revisions_content_check
    check (char_length(trim(content)) between 1 and 1000),
  constraint memory_revisions_author_check
    check (author_class in ('user', 'system')),
  constraint memory_revisions_provenance_check
    check (
      provenance in (
        'user_created',
        'intake_confirmed',
        'inferred_proposed'
      )
    ),
  constraint memory_revisions_change_kind_check
    check (
      change_kind in (
        'created',
        'edited',
        'accepted',
        'edited_and_accepted',
        'rejected',
        'disabled',
        'enabled',
        'renewed'
      )
    ),
  constraint memory_revisions_status_after_check
    check (status_after in ('active', 'proposed', 'rejected', 'archived')),
  constraint memory_revisions_first_revision_check
    check (
      (revision_number = 1 and previous_revision_id is null)
      or (revision_number > 1 and previous_revision_id is not null)
    )
);

alter table public.memory_items
add constraint memory_items_current_revision_fkey
  foreign key (current_revision_id, user_id)
  references public.memory_revisions (id, user_id)
  deferrable initially deferred;

-- Content-free evidence that a permanent deletion happened. It deliberately
-- stores no text from the deleted item.
create table public.memory_deletion_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  item_id uuid not null,
  memory_type text not null,
  purged_revision_count integer not null,
  collection_revision bigint not null,
  created_at timestamptz not null default now(),
  constraint memory_deletion_events_owner_fkey
    foreign key (user_id)
    references public.profiles (user_id)
    on delete cascade,
  constraint memory_deletion_events_type_check
    check (
      memory_type in (
        'profile_fact',
        'constraint',
        'preference',
        'observed_pattern'
      )
    ),
  constraint memory_deletion_events_count_check
    check (purged_revision_count >= 1),
  constraint memory_deletion_events_revision_check
    check (collection_revision > 0),
  constraint memory_deletion_events_item_key unique (user_id, item_id)
);

create index memory_items_owner_list_idx
  on public.memory_items (user_id, status, memory_type, created_at desc);
create index memory_items_owner_expiry_idx
  on public.memory_items (user_id, expires_on)
  where expires_on is not null;
create index memory_items_current_revision_idx
  on public.memory_items (current_revision_id, user_id);
create index memory_revisions_owner_item_idx
  on public.memory_revisions (user_id, item_id, revision_number desc);
create index memory_revisions_item_owner_idx
  on public.memory_revisions (item_id, user_id);
create index memory_revisions_previous_idx
  on public.memory_revisions (previous_revision_id, user_id);
create index memory_deletion_events_owner_idx
  on public.memory_deletion_events (user_id, created_at desc);

alter table public.memory_collections enable row level security;
alter table public.memory_items enable row level security;
alter table public.memory_revisions enable row level security;
alter table public.memory_deletion_events enable row level security;

revoke all privileges on table public.memory_collections
  from public, anon, authenticated;
revoke all privileges on table public.memory_items
  from public, anon, authenticated;
revoke all privileges on table public.memory_revisions
  from public, anon, authenticated;
revoke all privileges on table public.memory_deletion_events
  from public, anon, authenticated;

grant select on table
  public.memory_collections,
  public.memory_items,
  public.memory_revisions,
  public.memory_deletion_events
to authenticated;

create policy memory_collections_owner_select
on public.memory_collections
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy memory_items_owner_select
on public.memory_items
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy memory_revisions_owner_select
on public.memory_revisions
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy memory_deletion_events_owner_select
on public.memory_deletion_events
for select
to authenticated
using ((select auth.uid()) = user_id);

create function public.apply_memory_change(
  p_expected_collection_revision bigint,
  p_operation text,
  p_item_id uuid default null,
  p_memory_type text default null,
  p_content text default null,
  p_expires_on date default null
)
returns public.memory_change_receipt
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_current_revision bigint;
  v_new_revision bigint;
  v_item public.memory_items;
  v_current public.memory_revisions;
  v_item_id uuid;
  v_revision_id uuid;
  v_revision_number integer;
  v_content text;
  v_status text;
  v_change_kind text;
  v_provenance text;
  v_result text;
  v_purged integer;
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
      message = 'Invalid memory change.';
  end if;

  -- ADR-010. Every lock wait in this transaction is bounded. An unbounded wait
  -- would leave a second same-owner save hanging with no answer, which is the
  -- defect M2-01's review found in ADR-009's advisory lock. Exhaustion becomes
  -- a conflict the caller can act on rather than a silent hang.
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

  select revision
  into v_current_revision
  from public.memory_collections
  where user_id = v_user_id;

  v_current_revision := coalesce(v_current_revision, 0);

  if v_current_revision <> p_expected_collection_revision then
    raise exception using
      errcode = 'PT409',
      message = 'Memory changed. Reload and try again.';
  end if;

  v_new_revision := v_current_revision + 1;

  if p_operation not in (
    'create',
    'edit',
    'accept',
    'edit_and_accept',
    'reject',
    'disable',
    'enable',
    'renew',
    'delete'
  ) then
    raise exception using
      errcode = '22023',
      message = 'Invalid memory change.';
  end if;

  -- Every operation states exactly which inputs it accepts, so an unexpected
  -- field is a rejected change rather than a silently ignored one.
  if p_operation = 'create' then
    if p_item_id is not null
      or p_memory_type is null
      or p_content is null
    then
      raise exception using
        errcode = '22023',
        message = 'Invalid memory change.';
    end if;
  elsif p_operation in ('edit', 'edit_and_accept') then
    if p_item_id is null
      or p_memory_type is not null
      or p_content is null
    then
      raise exception using
        errcode = '22023',
        message = 'Invalid memory change.';
    end if;
  elsif p_operation = 'renew' then
    if p_item_id is null
      or p_memory_type is not null
      or p_content is not null
    then
      raise exception using
        errcode = '22023',
        message = 'Invalid memory change.';
    end if;
  else
    if p_item_id is null
      or p_memory_type is not null
      or p_content is not null
      or p_expires_on is not null
    then
      raise exception using
        errcode = '22023',
        message = 'Invalid memory change.';
    end if;
  end if;

  if p_memory_type is not null
    and p_memory_type not in (
      'profile_fact',
      'constraint',
      'preference',
      'observed_pattern'
    )
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid memory change.';
  end if;

  if p_content is not null then
    v_content := trim(p_content);
    if char_length(v_content) not between 1 and 1000 then
      raise exception using
        errcode = '22023',
        message = 'Invalid memory change.';
    end if;
  end if;

  if p_operation = 'create' then
    v_item_id := gen_random_uuid();
    v_revision_id := gen_random_uuid();
    v_revision_number := 1;
    -- Anything the owner states about themselves is active on save, whichever
    -- class it belongs to. `proposed` is reserved for content FitTip derived
    -- rather than content the owner wrote, and this path cannot produce that:
    -- provenance and author class are fixed below and are not caller inputs.
    v_status := 'active';

    insert into public.memory_revisions (
      id,
      user_id,
      item_id,
      revision_number,
      content,
      author_class,
      provenance,
      change_kind,
      status_after,
      previous_revision_id,
      created_at
    )
    values (
      v_revision_id,
      v_user_id,
      v_item_id,
      v_revision_number,
      v_content,
      'user',
      'user_created',
      'created',
      v_status,
      null,
      v_now
    );

    insert into public.memory_items (
      id,
      user_id,
      memory_type,
      status,
      provenance,
      expires_on,
      current_revision_id,
      user_confirmed_at,
      status_changed_at,
      created_at,
      updated_at
    )
    values (
      v_item_id,
      v_user_id,
      p_memory_type,
      v_status,
      'user_created',
      p_expires_on,
      v_revision_id,
      -- The owner wrote it and saved it, so it is confirmed at creation.
      v_now,
      v_now,
      v_now,
      v_now
    );
    v_result := 'created';

  else
    select *
    into v_item
    from public.memory_items
    where id = p_item_id
      and user_id = v_user_id;

    if not found then
      raise exception using
        errcode = 'PT409',
        message = 'Memory changed. Reload and try again.';
    end if;

    v_item_id := v_item.id;

    select *
    into v_current
    from public.memory_revisions
    where id = v_item.current_revision_id
      and user_id = v_user_id;

    if not found then
      raise exception using
        errcode = '23503',
        message = 'The memory change could not be completed.';
    end if;

    if p_operation = 'delete' then
      delete from public.memory_revisions
      where item_id = v_item.id
        and user_id = v_user_id;
      get diagnostics v_purged = row_count;

      delete from public.memory_items
      where id = v_item.id
        and user_id = v_user_id;

      -- Evidence that a deletion happened, carrying none of the deleted text.
      insert into public.memory_deletion_events (
        user_id,
        item_id,
        memory_type,
        purged_revision_count,
        collection_revision,
        created_at
      )
      values (
        v_user_id,
        v_item.id,
        v_item.memory_type,
        v_purged,
        v_new_revision,
        v_now
      );
      v_revision_number := null;
      v_result := 'deleted';

    else
      if p_operation = 'edit' then
        if v_item.status not in ('active', 'archived') then
          raise exception using
            errcode = 'PT409',
            message = 'Memory changed. Reload and try again.';
        end if;
        v_status := v_item.status;
        v_change_kind := 'edited';
        v_provenance := 'user_created';
        v_result := 'updated';

      elsif p_operation = 'edit_and_accept' then
        if v_item.status <> 'proposed' then
          raise exception using
            errcode = 'PT409',
            message = 'Memory changed. Reload and try again.';
        end if;
        v_status := 'active';
        v_change_kind := 'edited_and_accepted';
        v_provenance := 'user_created';
        v_result := 'accepted';

      elsif p_operation = 'accept' then
        if v_item.status <> 'proposed' then
          raise exception using
            errcode = 'PT409',
            message = 'Memory changed. Reload and try again.';
        end if;
        v_status := 'active';
        v_change_kind := 'accepted';
        -- Accepting does not rewrite the text, so the new revision keeps the
        -- provenance of the content it carries. The item's own provenance and
        -- its user_confirmed_at record who confirmed it.
        v_provenance := v_current.provenance;
        v_content := v_current.content;
        v_result := 'accepted';

      elsif p_operation = 'reject' then
        if v_item.status <> 'proposed' then
          raise exception using
            errcode = 'PT409',
            message = 'Memory changed. Reload and try again.';
        end if;
        v_status := 'rejected';
        v_change_kind := 'rejected';
        v_provenance := v_current.provenance;
        v_content := v_current.content;
        v_result := 'rejected';

      elsif p_operation = 'disable' then
        if v_item.status <> 'active' then
          raise exception using
            errcode = 'PT409',
            message = 'Memory changed. Reload and try again.';
        end if;
        v_status := 'archived';
        v_change_kind := 'disabled';
        v_provenance := v_current.provenance;
        v_content := v_current.content;
        v_result := 'disabled';

      elsif p_operation = 'enable' then
        if v_item.status <> 'archived' then
          raise exception using
            errcode = 'PT409',
            message = 'Memory changed. Reload and try again.';
        end if;
        v_status := 'active';
        v_change_kind := 'enabled';
        v_provenance := v_current.provenance;
        v_content := v_current.content;
        v_result := 'enabled';

      else
        if v_item.status <> 'active' then
          raise exception using
            errcode = 'PT409',
            message = 'Memory changed. Reload and try again.';
        end if;
        v_status := 'active';
        v_change_kind := 'renewed';
        v_provenance := v_current.provenance;
        v_content := v_current.content;
        v_result := 'renewed';
      end if;

      v_revision_id := gen_random_uuid();
      v_revision_number := v_current.revision_number + 1;

      insert into public.memory_revisions (
        id,
        user_id,
        item_id,
        revision_number,
        content,
        author_class,
        provenance,
        change_kind,
        status_after,
        previous_revision_id,
        created_at
      )
      values (
        v_revision_id,
        v_user_id,
        v_item.id,
        v_revision_number,
        v_content,
        'user',
        v_provenance,
        v_change_kind,
        v_status,
        v_current.id,
        v_now
      );

      update public.memory_items
      set
        status = v_status,
        expires_on = case
          when p_operation in ('edit', 'edit_and_accept', 'renew')
            then p_expires_on
          else expires_on
        end,
        current_revision_id = v_revision_id,
        user_confirmed_at = case
          when p_operation in ('edit', 'edit_and_accept', 'accept')
            then v_now
          else user_confirmed_at
        end,
        status_changed_at = case
          when v_status <> v_item.status then v_now
          else status_changed_at
        end,
        updated_at = v_now
      where id = v_item.id
        and user_id = v_user_id;
    end if;
  end if;

  insert into public.memory_collections (user_id, revision, updated_at)
  values (v_user_id, v_new_revision, v_now)
  on conflict (user_id)
  do update set
    revision = excluded.revision,
    updated_at = excluded.updated_at;

  -- The receipt carries no memory content.
  return (
    v_item_id,
    v_new_revision,
    v_revision_number,
    v_result
  )::public.memory_change_receipt;
end;
$$;

revoke all privileges on function public.apply_memory_change(
  bigint,
  text,
  uuid,
  text,
  text,
  date
) from public, anon, authenticated, service_role;

grant execute on function public.apply_memory_change(
  bigint,
  text,
  uuid,
  text,
  text,
  date
) to authenticated;
