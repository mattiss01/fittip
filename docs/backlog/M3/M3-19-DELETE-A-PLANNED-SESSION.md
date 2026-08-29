# M3-19: Delete a planned session

**Status:** approved for implementation — the product owner approved the third
session verb and the card relabelling on 29 August 2026, against the
[F-005 amendment recorded the same day](../../product/F-005-ROLLING-TRAINING-PLAN.md#deleting-a-planned-session-29-august-2026).
Tier 1 dispatch approved 29 August 2026.

**Triage:** ready-for-agent

**Milestone:** M3

**Priority:** P1

**Tier:** 1 — a new operation inside the accepted privileged
`apply_rolling_plan_change_set`, and the first owner-driven hard delete of a
planned session.

**Depends on:** [M3-15A](M3-15A-COMPLETION-FOUNDATION.md) accepted and merged,
whose `on delete restrict` foreign key is the guard this operation reports on.

**Blocks:** [M3-15B](M3-15B-TODAY-AND-LOGGING.md), which inherits the corrected
card verbs.

## Agent brief

**Outcome.** Give the owner a third verb over one future planned session:
**Delete**, which hard-deletes the row, beside the existing **Cancel**, which
keeps it. Correct the card control that says "Remove" and performs a cancel.
Tier 1.

**Hard constraints**

- One forward, additive migration that `create or replace`s
  `apply_rolling_plan_change_set` to add a `remove` operation. Never edit an
  applied migration. Re-emit the function body verbatim apart from the new
  branch, so its diff is reviewable as a small number of hunks — M3-15A's
  reviewer checked exactly that and will again.
- **Reuse M3-14's audit shape; do not invent one.** A removal writes a
  `change_kind = 'delete'` entry carrying `before_state` and `local_date` and a
  **null `session_id`**, which is why it survives
  `rolling_plan_change_entries_session_fkey` cascading. The kind check, the
  target check, and the states check all already admit it. No constraint,
  table, column, or index changes.
- **`cancel` is currently the `else` fallthrough branch.** Make it an explicit
  `elsif v_operation = 'cancel'` and make the new `else` reject an unknown
  operation. A silent fallthrough that deletes would be the worst possible bug
  in this function.
- **A session carrying a completion cannot be deleted.** The
  `completions_plan_fkey` `on delete restrict` already refuses it; raise
  **`PT425`** with an owner-visible message first, so the surface never shows a
  raw foreign-key violation. `PT425` is unused; do not reuse `PT422`.
- **A lock does not block it.** F-005's 19 August 2026 amendment settles this:
  a lock stops a sweep, not the owner's deliberate individual act. Do not add a
  lock check.
- Deleting is allowed for an `active` **or** a `cancelled` session — a
  cancelled row is exactly what an owner may next want gone. `requireSession`
  in `actions.ts` currently admits `active` only.
- Past dates stay closed: refuse a session whose `local_date` is before the
  owner-local today, with the existing `PT422` copy the other operations use.
- The operation advances the plan revision and joins a change set like every
  other, obeys ADR-010 bounded lock waits, and stays inside the existing
  idempotency-key behavior. Do not touch `materialize_rolling_plan_series`,
  `end_series`, `rolling_plan_sweep_series_occurrences`, or anything M3-15A
  changed.
- Mirror the operation through the whole seam: the `RollingPlanChange` union
  and its parser, the in-memory adapter, and the shared adapter contract that
  both adapters run. A behavior proven in only one adapter is not proven.
- Surface: session cards expose **Edit**, **Cancel**, **Delete**, and the lock
  control. Rename the existing control and its copy from "Remove" to "Cancel";
  keep it inside its current disclosure so neither destructive verb is one
  stray tap away, and give **Delete** the same two-step treatment with copy
  that says the session will not be kept on the record.

**Non-goals.** No completion delete — completions stay create/edit, and a
mistaken log is edited to `skipped`. No bulk or multi-select delete. No undo,
trash, or restore. No change to cancel's own behavior, to any series operation,
or to any completion table. No new surface beyond `/home/plan`; Today and
Progress are M3-15B and M3-15C.

**Acceptance criteria**

1. An owner deletes one future planned session; the row is gone, the plan
   revision advances, and a dated `delete` change entry with a null
   `session_id` carries its before state.
2. Deleting a session that carries a completion is refused with `PT425` and an
   owner-visible message; the session and the completion both survive.
3. A locked session is deleted successfully when the owner asks directly.
4. A cancelled session can be deleted; a past-dated one cannot.
5. An unknown operation string is rejected rather than falling through to
   cancel or to delete.
6. Cross-owner and anonymous deletion are impossible, proven in pgTAP against
   the privileged function, not only through RLS on the table.
7. The card shows Edit, Cancel, Delete, and the lock control; Cancel's copy
   says the session is kept on the record and Delete's says it is not.
8. The 390px flow covers cancel and delete on one session each, including the
   completion refusal.

**Expected files.**
`supabase/migrations/<new>_m3_19_delete_a_planned_session.sql`,
`supabase/tests/database/m3_19_delete_a_planned_session.test.sql`,
`src/server/rolling-plan/rolling-plan.ts`,
`src/server/rolling-plan/in-memory-rolling-plan-adapter.ts`,
`src/server/rolling-plan/rolling-plan-contract.ts`,
`src/server/repositories/rolling-plan-repository.ts`,
`src/app/home/plan/actions.ts`, `src/app/home/plan/action-state.ts`,
`src/app/home/plan/plan-manager.tsx`, `src/app/home/plan/plan.module.css`, and
a new per-ticket Playwright spec and config with their own `testMatch` and
port.

**Project skills.** Read `.agents/skills/vercel-react-best-practices/SKILL.md`
and `.agents/skills/frontend-design/SKILL.md` from the repository, not a global
copy. The `schema-change` skill governs the migration.

Read only this section unless you hit an ambiguity it does not resolve.

## Why this ticket exists separately

F-005's 20 August 2026 revision already gave session cards a **Remove**
control. M3-12 shipped it as a cancel, with copy admitting as much: "Removing
keeps the session on the record as cancelled." That was coherent while cancel
was the only removal verb. It stopped being coherent once the product owner
asked, on 29 August 2026, for deletion as well.

The work is Tier 1 because it changes an accepted privileged function and
performs the first owner-driven hard delete of a planned session — but it is
small, because two of the three hard parts already exist. M3-14 built the
date-anchored `delete` change entry so that series removal could survive the
session foreign key, and M3-15A built the `on delete restrict` that makes a
completed session undeletable. This ticket exposes both to the owner.

It is sequenced before the M3-15 consumer slices so that Today inherits the
corrected verbs rather than shipping the ambiguous "Remove" label and then
changing it.

## Decisions taken

- **29 August 2026 — delete applies to the planned session only.** Completions
  remain create/edit. The product owner considered and declined a completion
  delete, which would have required amending the AGENTS.md invariant that
  completions are permanent records and re-opening M3-15A's schema.
- **29 August 2026 — the card reads Cancel and Delete.** "Remove" is retired as
  a label because it cannot distinguish the two verbs. This changes accepted
  M3-12 copy deliberately.
- **29 August 2026 — skip is not a planning verb.** It is a completion status
  and lands on Today in M3-15B.
