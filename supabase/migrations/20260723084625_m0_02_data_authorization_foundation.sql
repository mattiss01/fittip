create table public.profiles (
  user_id uuid not null,
  username text not null,
  created_at timestamptz not null default now(),
  constraint profiles_pkey primary key (user_id),
  constraint profiles_user_id_fkey
    foreign key (user_id)
    references auth.users (id)
    on delete cascade,
  constraint profiles_username_format_check
    check (
      username = lower(username)
      and username ~ '^[a-z][a-z0-9_]{2,29}$'
    ),
  constraint profiles_username_key unique (username)
);

alter table public.profiles enable row level security;

revoke all privileges on table public.profiles from public, anon, authenticated;
grant select, insert on table public.profiles to authenticated;

create policy profiles_owner_select
on public.profiles
for select
to authenticated
using (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
);

create policy profiles_owner_insert
on public.profiles
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
);
