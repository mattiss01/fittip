# M3-15: Replacement consumer readiness

**Status:** proposed — not approved for implementation. Narrowed to the
consumer surfaces on 20 August 2026 when the completion foundation was split
out as [M3-15A](M3-15A-COMPLETION-FOUNDATION.md).

**Triage:** needs-triage

**Milestone:** M3

**Priority:** P1

**Tier:** 1 — restoring the roadmap operation re-grants revoked privileged
functions, and the AI context change crosses the ADR-013 boundary.

**Depends on:** [M3-15A](M3-15A-COMPLETION-FOUNDATION.md) accepted and merged.

**Blocks:** M3-16 and every later F-005 replacement slice.

**Absorbs:** the still-valid exact-source behavior from retired M3-08.

## Outcome

Make the replacement completion record visible and usable. Restore Today,
logging, Progress, and the roadmap operation on the rolling plan, and give AI
context its bounded completion-history interface for M3-16. Plan itself is
already active from M3-12; the completion schema, write path, and top-up
wrapper are already delivered by M3-15A.

## What the split left here

M3-15A owns the schema, the owner-derived write function, the planned
snapshot, the completion-blocks-deletion rule, and the ADR-017 top-up wrapper.
Everything below is what remains.

- Restore `/home/today` and `/home/log` from their `TrainingMaintenance` stubs:
  one consistent owner-local dated view of one-off, recurring, cancelled,
  locked, and **Recovery day** Plan content, plus the logging path onto
  M3-15A's write function for a planned session or valid unplanned training.
- Restore `/home/progress`: planned-versus-actual kept separate, a paginated
  history slice, and the immutable planned snapshot each completion was
  compared with. Recurrence and replanning never rewrite a completion.
- Restore `/home/plan/roadmap`. M3-11 revoked `begin_roadmap_generation`,
  `finish_roadmap_generation`, `record_roadmap_memory_candidates`,
  `apply_roadmap_proposal_change`, and `accept_roadmap_proposal` until
  replacement completion context existed. Re-grant them without changing the
  accepted roadmap product contract or any preserved record.
- Wire date-bounded AI context: the exact current Plan slice plus the
  separately bounded eligible completion history, through the existing
  `src/server/training/training-history-context.ts` allowlist. The
  `correction_reason` field is gone per the 20 August 2026 ADR-013 amendment.
- **M3-08's rule.** A proposal source records only completions actually
  transmitted to the Coach; byte-trimmed or otherwise unsent eligible
  completions are not sources. A correction to a sent completion conflicts;
  correction of an unsent one does not. Without a revision chain this is a
  comparison against the completion's `updated_at` and the proposal's dispatch
  time, which is cheaper than the retired design assumed. Keep the existing
  honest conflict copy unless the dispatch contract demonstrates a reason to
  change it.
- Every consumer calls M3-15A's top-up wrapper before reading, per ADR-017
  consequence 3. A consumer that is not the Plan otherwise reads an incomplete
  plan.
- Consumer parity, query bounds, owner/anonymous/cross-owner RLS and grants,
  source minimization, and the 390px mobile pass across all four surfaces.

## Non-goals

- No old-data deletion, compatibility synchronization, dual write, AI proposal
  review, regeneration, or additional founder reset.
- No change to the accepted training-history eligibility window or byte budget.
- No completion schema change. If one becomes necessary, stop and re-dispatch
  against M3-15A rather than widening this ticket.
- No activity editor and no per-activity actual-measurement capture. M3-15A
  ships that schema deliberately unused.

## Approval boundary

This shell records the narrowed scope only. After M3-15A is accepted, the exact
consumer contract requires an `## Agent brief` and separate product-owner
approval before Tier 1 implementation. This ticket is large enough that it may
itself need splitting once drafted; four surfaces plus a privilege re-grant is
close to the point where a 40-line brief stops being honest.

## History

The 14 August 2026 shell carried both the completion foundation and every
consumer. It was split on 20 August 2026, immediately before dispatch, because
the combined scope could not be expressed in a 40-line Agent brief and mixed a
new schema with four user-visible surfaces and a privilege re-grant. The
foundation became M3-15A; this ticket keeps its number so that ADR-017
consequence 3, F-005, and M3-16 — which all say "M3-15" to mean Today,
Progress, and AI context — continue to point at the right work.
