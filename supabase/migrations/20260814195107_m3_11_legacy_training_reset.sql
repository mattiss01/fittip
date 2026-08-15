-- M3-11 / F-005: one-way reset of the superseded bounded-plan model.
--
-- This migration deliberately avoids CASCADE. Every removed object is named so
-- an unexpected dependency aborts the transaction instead of widening the
-- approved destructive scope. The eleven legacy tables are empty after the
-- DELETE block and absent after the DROP block. Preserved domains are not
-- rewritten, except for fail-closed roadmap expiration and function grants.

set lock_timeout = '5s';
set statement_timeout = '2min';

-- A roadmap proposal that recorded a legacy plan or completion as source can
-- no longer be accepted after those records disappear. Preserve its content
-- and provenance, but append the explicit terminal state before the reset.
alter table public.roadmap_proposal_decisions
  drop constraint roadmap_proposal_decisions_decision_check,
  drop constraint roadmap_proposal_decisions_version_check;

alter table public.roadmap_proposal_decisions
  add constraint roadmap_proposal_decisions_decision_check
    check (decision in ('accepted', 'rejected', 'expired')),
  add constraint roadmap_proposal_decisions_version_check
    check (
      (decision = 'accepted' and accepted_version_id is not null)
      or (decision in ('rejected', 'expired') and accepted_version_id is null)
    );

insert into public.roadmap_proposal_decisions (
  proposal_id,
  user_id,
  decision,
  accepted_version_id,
  decided_at
)
-- Selected from roadmap_proposals alone, with both predicates as EXISTS
-- subqueries. A join to roadmap_proposal_sources would fan out to one row per
-- matching source, and DISTINCT cannot collapse that fan-out here because
-- clock_timestamp() is VOLATILE and is evaluated per input row beneath the
-- unique step, making every duplicate tuple distinct. A real proposal carries
-- one plan_version source plus one completion source per completion group, so
-- the join shape would raise a duplicate-key error on the proposal_id primary
-- key and abort the whole reset. Selecting from the primary-key relation emits
-- exactly one row per proposal by construction.
select
  proposal.id,
  proposal.user_id,
  'expired',
  null::uuid,
  pg_catalog.clock_timestamp()
from public.roadmap_proposals as proposal
where exists (
    select 1
    from public.roadmap_proposal_sources as source
    where source.proposal_id = proposal.id
      and source.user_id = proposal.user_id
      and source.source_kind in ('plan_version', 'completion')
  )
  and not exists (
    select 1
    from public.roadmap_proposal_decisions as decision
    where decision.proposal_id = proposal.id
  );

-- The roadmap runtime currently composes legacy completion context. Its rows
-- remain readable, but every mutation fails closed until M3-15 supplies the
-- replacement context and deliberately restores grants.
revoke execute on function public.begin_roadmap_generation(
  text, text, date, date, bigint, text, uuid, text
) from public, anon, authenticated, service_role;
revoke execute on function public.finish_roadmap_generation(
  uuid, text, text, text, text, text, text, uuid, text, text, jsonb, jsonb, text
) from public, anon, authenticated, service_role;
revoke execute on function public.record_roadmap_memory_candidates(
  uuid, bigint, jsonb
) from public, anon, authenticated, service_role;
revoke execute on function public.apply_roadmap_proposal_change(
  text, uuid, jsonb
) from public, anon, authenticated, service_role;
revoke execute on function public.accept_roadmap_proposal(
  uuid, bigint
) from public, anon, authenticated, service_role;

-- Remove the last function body that names a legacy relation. Keeping the
-- signature lets M3-15 replace the implementation without reconstructing its
-- preserved roadmap receipt type, while every non-owner role remains revoked.
create or replace function public.accept_roadmap_proposal(
  p_proposal_id uuid,
  p_expected_head_revision bigint
)
returns public.roadmap_acceptance_receipt
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform p_proposal_id, p_expected_head_revision;

  raise exception using
    errcode = '42501',
    message = 'Roadmap changes are unavailable during the training reset.';
end;
$$;

-- Delete in child-to-parent order before removing schema objects. This is
-- intentionally redundant with DROP TABLE: it makes the destructive data
-- step visible and independently testable inside the transaction.
delete from public.plan_proposal_decisions;
delete from public.plan_proposal_sources;
delete from public.plan_proposals;
delete from public.plan_generation_requests;
delete from public.completed_activities;
delete from public.completion_heads;
delete from public.completed_sessions;
delete from public.planned_activities;
delete from public.planned_sessions;
delete from public.detailed_plan_heads;
delete from public.detailed_plan_versions;

drop trigger completed_activities_reject_inactive_result
  on public.completed_activities;

drop function public.reject_inactive_completion_activity();
drop function public.save_training_completion(
  uuid, uuid, integer, uuid, date, timestamptz, text, integer, text, integer,
  text, text, text, boolean, boolean, boolean, boolean, text, jsonb
);
drop function public.save_manual_plan_version(
  integer, integer, date, text, jsonb
);

drop function public.reject_plan_proposal(uuid);
drop function public.record_plan_memory_candidates(uuid, bigint, jsonb);
drop function public.finish_plan_generation(
  uuid, text, text, text, text, text, text, uuid, text, jsonb, jsonb, text
);
drop function public.begin_plan_generation(text, text, date, integer, text);
drop function public.plan_content_is_valid(jsonb, date, date);

drop table public.plan_proposal_decisions;
drop table public.plan_proposal_sources;
drop table public.plan_proposals;
drop table public.plan_generation_requests;
drop table public.completed_activities;
drop table public.completion_heads;
drop table public.completed_sessions;
drop table public.planned_activities;
drop table public.planned_sessions;
drop table public.detailed_plan_heads;
drop table public.detailed_plan_versions;

drop type public.plan_proposal_decision_receipt;
drop type public.plan_memory_candidate_receipt;
drop type public.plan_generation_result;
drop type public.plan_generation_receipt;
