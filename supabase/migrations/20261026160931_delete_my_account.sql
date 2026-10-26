-- Deleting an account (ADR-039, owner 23 Oct 2026).
--
-- A person deletes their own account and everything in it. The application has
-- no service-role key (ADR-002), so this function is the only path: it runs as
-- its owner, takes no user argument, and acts on `auth.uid()` alone.
--
-- Every owned table cascades from the account, but ten links between owned
-- tables deliberately do not, so that nothing is removed as a side effect of
-- something else (ADR-031). They would stop one cascading delete, so the
-- caller's rows are removed here in an order those links allow, and only then
-- the sign-in, whose cascade takes the profile and whatever remains:
--
--   completions -> rolling_plan_sessions            restrict
--   completions -> completions (replaced by)        no action, one statement
--   completion_activities -> personal_activities    no action, gone with their log
--   plan_proposal_decisions -> change sets          restrict
--   goal_lifecycle_events -> goals                  restrict
--   memory_items <-> memory_revisions               deferrable, deferred here
--   rolling_plan_activities, rolling_plan_series_activities,
--   saved_session_activities -> personal_activities no action, gone with their
--                                                   plan and saved sessions
--
-- The links themselves are unchanged and still stop every other path.

create function public.delete_my_account(p_confirmation text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using errcode = '42501',
      message = 'An authenticated FitTip user is required.';
  end if;
  -- The application asks for the word first; this is the backstop.
  if p_confirmation is distinct from 'DELETE' then
    raise exception using errcode = '22023',
      message = 'Type DELETE to delete your account.';
  end if;

  -- One account deletion at a time, and a write racing it fails on the lock
  -- or on the missing profile rather than leaving a row behind.
  perform 1 from public.profiles where user_id = v_user_id for update;

  delete from public.completions where user_id = v_user_id;
  delete from public.plan_proposal_decisions where user_id = v_user_id;
  delete from public.goal_lifecycle_events where user_id = v_user_id;

  -- An item names its current revision and each revision its previous one;
  -- both links are deferrable, so the pair is checked once both are gone.
  set constraints public.memory_items_current_revision_fkey,
    public.memory_revisions_previous_fkey deferred;
  delete from public.memory_items where user_id = v_user_id;

  delete from public.rolling_plans where user_id = v_user_id;
  delete from public.saved_sessions where user_id = v_user_id;

  delete from auth.users where id = v_user_id;
end;
$$;

revoke all on function public.delete_my_account(text) from public, anon, service_role;
grant execute on function public.delete_my_account(text) to authenticated;

comment on function public.delete_my_account(text) is
  'ADR-039: deletes the calling user''s account and every row they own. Owner from auth.uid() only.';
