-- Deleting the roadmap (ADR-036).
--
-- The owner decided on 19 October 2026 that the roadmap can be deleted from
-- its menu, and that a delete erases it completely: every version, every
-- proposal (open, declined or accepted), the coach requests behind them, their
-- sources and decisions, and the milestone ticks and done reviews. Nothing is
-- kept, there is no undo, and the Roadmap page afterwards reads as it did
-- before the first roadmap.
--
-- What stays, because it is not the roadmap's:
--
--   * spend: `ai_spend_reservations` is its own ledger, and a roadmap
--     proposal only points at it (`on delete set null` the other way round),
--     so a delete neither refunds nor resets a cap;
--   * memory and goal suggestions a roadmap request produced are memory and
--     goal records, decided on their own pages; their `source_reference`
--     keeps an id that points at nothing, as a deleted log's does (ADR-031);
--   * a plan proposal's `roadmap_version` source likewise keeps its id.
--
-- The delete answers to the version the owner was shown, by id, under the
-- same per-owner lock every roadmap write takes, so it cannot interleave with
-- an acceptance, an edit, or a coach result being stored. Not to the head
-- revision: that starts again from 0 after a delete, so a question left open
-- from before one could match a new roadmap's revision and erase it. A version
-- id is never reused. A coach request still running when the roadmap goes has
-- nothing left to finish into, and its result is refused as an unknown
-- request.
--
-- With no roadmap in force there is nothing to delete, and the call reports
-- `replayed` without touching anything. That makes a transport retry of a
-- delete that landed safe (the roadmap repository keeps the client's retry),
-- and it cannot erase a proposal the owner started after the delete.

create or replace function public.delete_roadmap(
  p_version_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_current uuid;
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'An authenticated FitTip user is required.';
  end if;

  if p_version_id is null then
    raise exception using
      errcode = '22023',
      message = 'Invalid roadmap.';
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

  select head.current_version_id into v_current
  from public.roadmap_heads head
  where head.user_id = v_user_id
  for update;

  if not found then
    return 'replayed';
  end if;

  if v_current <> p_version_id then
    raise exception using
      errcode = 'PT409',
      message = 'Your roadmap changed. Reload and try again.';
  end if;

  -- Children first, so no cascade decides what goes. Every statement is held
  -- to the caller's own rows.
  delete from public.roadmap_heads where user_id = v_user_id;
  delete from public.roadmap_milestone_marks where user_id = v_user_id;
  delete from public.roadmap_review_marks where user_id = v_user_id;
  delete from public.roadmap_proposal_decisions where user_id = v_user_id;
  delete from public.roadmap_versions where user_id = v_user_id;
  delete from public.roadmap_proposal_sources where user_id = v_user_id;
  delete from public.roadmap_proposals where user_id = v_user_id;
  delete from public.roadmap_generation_requests where user_id = v_user_id;

  return 'deleted';
end;
$$;

revoke all privileges on function public.delete_roadmap(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.delete_roadmap(uuid) to authenticated;
