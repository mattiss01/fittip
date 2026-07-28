create function public.reject_inactive_completion_activity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.completed_sessions
    where id = new.completed_session_id
      and user_id = new.user_id
      and status in ('skipped', 'rest')
  ) then
    raise exception using
      errcode = '23514',
      message = 'Skipped or rest completions cannot contain activity results';
  end if;
  return new;
end;
$$;

create trigger completed_activities_reject_inactive_result
before insert or update
on public.completed_activities
for each row
execute function public.reject_inactive_completion_activity();

revoke all privileges on function public.reject_inactive_completion_activity()
  from public, anon, authenticated;
