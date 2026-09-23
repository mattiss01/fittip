-- One reservation, one proposal.
--
-- `plan_proposals.spend_reservation_id` and `roadmap_proposals.spend_reservation_id`
-- name the `ai_spend_reservations` row that paid for the proposal. The finish
-- functions already prove that a reservation belongs to this owner, covers this
-- operation, is priced by the same rate card, and has settled -- but nothing
-- stopped the *same* settled reservation being named by a second proposal. An
-- owner calling the finish RPCs directly could therefore pay once and keep
-- several AI results, and the spend surface would report one charge against work
-- it did not cover.
--
-- The fix is a uniqueness the database holds rather than a check a caller could
-- skip. Both indexes already exist as plain partial indexes, so each is dropped
-- and recreated unique under its own name: the lookup they serve is unchanged,
-- and corrections here are forward-only, so altering the applied files was never
-- an option.
--
-- ## Why the two predicates differ
--
-- They are not symmetric, and making them symmetric would break editing a live
-- roadmap proposal.
--
-- `plan_proposals.origin` is constrained to `'ai_initial'` alone, and its only
-- insert is `finish_plan_generation`. Every row is a distinct purchase, so
-- uniqueness across all rows with a reservation is exactly the invariant.
--
-- `roadmap_proposals.origin` also admits `'owner_edit'`, and
-- `apply_roadmap_proposal_change` copies `spend_reservation_id` onto the edit it
-- creates -- deliberately, because an edit records which paid generation it
-- descends from. An edit is a derivative of an already-purchased proposal, not a
-- second purchase, so it is excluded. `'ai_regeneration'` is *not* excluded:
-- line 1114 of M3-02 shows it is produced by `finish_roadmap_generation` from a
-- generation that carried its own reservation, which is precisely the case this
-- index must cover.
--
-- The predicate is written as `origin <> 'owner_edit'` rather than as a positive
-- list of the AI origins, because the two ways of being wrong later do not cost
-- the same. A new *purchase* origin left out of a positive list would silently
-- reopen the hole this migration closes. A new *derivative* origin wrongly
-- caught by `<>` fails loudly the first time it is exercised, in development.
-- Fail toward the loud one.
--
-- ## Why this can be applied to existing data
--
-- Both predicates are partial on `spend_reservation_id is not null`, and a
-- non-null reservation is only ever written for an approved *live* provider
-- pairing -- fixture results are refused outright when they claim one
-- (`roadmap_technical_codes_are_accepted`). The coach has been fixture-only
-- throughout, so there is nothing for either index to conflict over. If that is
-- somehow wrong, the index build fails and the migration rolls back, which is
-- the safe direction.

drop index public.plan_proposals_spend_idx;

create unique index plan_proposals_spend_idx
  on public.plan_proposals (spend_reservation_id)
  where spend_reservation_id is not null;

drop index public.roadmap_proposals_spend_idx;

create unique index roadmap_proposals_spend_idx
  on public.roadmap_proposals (spend_reservation_id)
  where spend_reservation_id is not null and origin <> 'owner_edit';
