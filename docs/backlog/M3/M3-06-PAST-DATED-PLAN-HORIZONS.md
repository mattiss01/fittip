# M3-06: A plan never starts in the past

**Status:** proposed — not approved for implementation

**Triage:** needs-triage

**Milestone:** M3 (filed here as the active milestone; the behaviour being
changed is M1's, following the M2-06 precedent)

**Priority:** P2

**Depends on:** none. Nothing blocks on this and it blocks nothing, but it
should land before the M3 proposal surfaces so the product has one rule rather
than two.

**Raised:** 8 August 2026, during the M3 decision session. The product owner
stated that a plan should never contain past days, and on being shown that this
contradicts accepted M1 behaviour, chose to change M1 rather than accept a
divergence.

## What exists today

`src/server/training/past-plan-protection.ts` implements
`assertPastPlanContentIsImmutable`. A manual plan version **may** span dates
that have already passed; the past portion must be byte-identical to the current
version. Past content is frozen, not forbidden. There is no `start_date >=
today` constraint in `20260728105226_m1_01_training_records_foundation.sql` —
the only date constraints are `end_date = start_date + (day_count - 1)` and that
sessions fall inside that range.

M1-02's open decision 2 recommended "default to today and let the owner select
another start date" and never set a floor, so this is accepted, deliberate
behaviour rather than an oversight. It is being changed on its merits, not
corrected as a defect.

## The change

A plan version's `start_date` must be the owner's local today or later. This
applies to manual planning and to AI proposals alike, so the product has one
rule.

The consequence to be explicit about: **the horizon shrinks as the week
passes.** A Mon–Sun plan edited on Wednesday produces a new version covering
Wed–Sun with `day_count` 5. The Mon–Sun version is retained immutably and keeps
Monday and Tuesday's planned content as history. Nothing is lost; it moves into
the superseded version rather than travelling forward.

## Open questions the builder must not answer alone

1. **Existing accepted plan versions already start in the past.** A table
   `CHECK` would reject rows that are permanent history. The constraint likely
   belongs in the write path — the `save_manual_plan_version` RPC and the server
   repository — or as a `NOT VALID` constraint. This is an ADR-008-adjacent
   transaction decision.
2. **Does `past-plan-protection.ts` go away entirely?** If no new version can
   contain a past day, there is no past content in a proposed version to
   protect, and the module plus its test file become dead. Confirm that before
   deleting: deleting a guard because it looks unreachable is how guards get
   deleted while still reachable.
3. **Does Progress still resolve plan-versus-actual for a past day?** A
   completion logged on Monday references a planned session that now lives only
   in a superseded version. M1-04's plan-versus-actual view must read the
   version that was current on that date, not the current one. If it reads the
   current version, this change breaks Monday's history display — which would be
   a regression against an accepted M1 exit criterion, and the reason this
   question is listed rather than assumed.
4. **What does the owner see when editing a plan whose start date has passed?**
   The horizon silently changing from 7 days to 5 is honest but surprising. The
   copy needs approval.

## Non-goals

- No change to completed sessions, corrections, or the append-only completion
  history.
- No change to AI proposal behaviour, which already starts today or later by
  M3-03's decision and is unaffected by this ticket.
- No change to `day_count`'s 1–7 range.

## Test plan

- A new plan version starting before owner-local today is rejected, in the RPC
  and in the repository, with timezone and DST cases at the day boundary.
- Editing a plan whose start date has passed produces a new version starting
  today with a reduced `day_count`, and the prior version is retained intact.
- Existing past-dated accepted versions remain readable and are not mutated or
  rejected on read.
- Plan-versus-actual for a date in a superseded version still resolves — the
  regression open question 3 names.
- Whatever remains of past-plan-protection still fails on the case it was
  written for, or is removed with its tests and a recorded reason.

## Approval gate

Tier 1: schema and transaction behaviour on accepted M1 records. Approved
ticket, distinct builder, distinct independent reviewer, Preview verification,
and product-owner acceptance. The four open questions above are product-owner
decisions and must be answered before dispatch. Accepted M1 validation records
are permanent history and are not rewritten; a new record covers this change.
