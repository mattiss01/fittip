# M3-15: Replacement consumer readiness

**Status:** split — do not dispatch. Narrowed to the consumer surfaces on
29 August 2026 when the completion foundation was split out as
[M3-15A](M3-15A-COMPLETION-FOUNDATION.md), then split again the same day into
four tickets when sizing showed the remainder was still four surfaces, a new
context source, and a privilege re-grant. This file is retained as the record
of the narrowed scope and the reasoning; the work lives in:

- [M3-15B Today and logging](M3-15B-TODAY-AND-LOGGING.md) — Tier 2
- [M3-15C Progress](M3-15C-PROGRESS.md) — Tier 2
- [M3-15D Bounded AI completion context](M3-15D-AI-COMPLETION-CONTEXT.md) —
  Tier 1
- [M3-15E Roadmap restoration and privilege re-grant](M3-15E-ROADMAP-RESTORATION.md)
  — Tier 1

[M3-19](M3-19-DELETE-A-PLANNED-SESSION.md) is sequenced ahead of all four.

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
  `correction_reason` field is gone per the 29 August 2026 ADR-013 amendment.
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
- **Surface `completedKept`.** M3-15A taught `end_series` and the sweep to keep
  a completed occurrence and to report it in their receipt, but
  `src/app/home/plan/series-actions.ts` still tells the owner only how many
  were removed and how many locked ones were kept, and `SeriesEffectView` does
  not carry the field. The count is always zero until this ticket ships a
  completion write path, and non-zero the moment it does. M3-15A's independent
  reviewer flagged it on 29 August 2026 for this ticket to inherit.
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

Superseded by the four split tickets listed in the status header, each of which
carries its own approval boundary. The warning this section originally
recorded — that four surfaces plus a privilege re-grant is close to the point
where a 40-line brief stops being honest — turned out to be an understatement,
and is the reason for the second split. See [Second split](#second-split-29-august-2026).

## History

The 14 August 2026 shell carried both the completion foundation and every
consumer. It was split on 29 August 2026, immediately before dispatch, because
the combined scope could not be expressed in a 40-line Agent brief and mixed a
new schema with four user-visible surfaces and a privilege re-grant. The
foundation became M3-15A; this ticket keeps its number so that ADR-017
consequence 3, F-005, and M3-16 — which all say "M3-15" to mean Today,
Progress, and AI context — continue to point at the right work.

## Second split, 29 August 2026

Sizing the remainder before dispatch found three things the 14 August shell had
not accounted for.

**The AI context slice is a new context source, not a rewiring.**
`CoachAIContextSource` in `src/server/ai/context-source.ts` is a bare interface
whose own comment records that no legacy database adapter survived M3-11. There
is no production implementation. Every existing implementation is a fixture or
a test stub.

**The roadmap slice depends on the AI slice, not the other way round.** M3-11
revoked the five roadmap functions until replacement completion context
existed. Restoring the surface without a context source produces a roadmap
generated against empty training history, which is worse than the maintenance
stub because it looks like it worked.

**The restore is a rebuild.** M3-11 deleted roughly 4,100 lines across the four
routes. None of it can be reverted, because it targets the retired model.

The split is therefore four tickets, in a forced order: M3-15B before M3-15C
because Progress has nothing to display until completions can be written, and
M3-15D before M3-15E for the reason above. M3-19 precedes all four so that
Today inherits the corrected Cancel/Delete card verbs instead of shipping the
ambiguous "Remove" label and changing it a ticket later.
