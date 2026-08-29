# Validation

Validation records and their visual evidence are grouped by milestone.

## M0

- [M0-01 repository and tooling baseline](M0/M0-01-VALIDATION.md)
- [M0-02 data and authorization foundation](M0/M0-02-VALIDATION.md)
- [M0-03 authentication](M0/M0-03-VALIDATION.md)
- [M0-06A founder-hosted staging](M0/M0-06A-VALIDATION.md)
- [M0 visual evidence](M0/evidence/)

## M1

- [M1-01 training-record foundation](M1/M1-01-VALIDATION.md)
- [M1-02 selectable-horizon planning](M1/M1-02-VALIDATION.md)
- [M1-03 quick training logging](M1/M1-03-VALIDATION.md)
- [M1-02/M1-03 integration](M1/M1-02-M1-03-INTEGRATION-VALIDATION.md)
- [M1-04 Today and Progress](M1/M1-04-VALIDATION.md)
- [M1 milestone closeout](M1/M1-MILESTONE-CLOSEOUT.md)
- [M1 visual evidence](M1/evidence/)

## M2

- [M2-03 guided onboarding and context review](M2/M2-03-VALIDATION.md) — in development; builder handoff complete, independent review and hosted verification pending

- [M2-01 goal model and management](M2/M2-01-VALIDATION.md) — accepted 1 August 2026 after the required independent exact-commit review; follow-ups in M2-07
- [M2-02 memory model and management](M2/M2-02-VALIDATION.md) — accepted 2 August 2026 after three independent review rounds; follow-ups in M2-09 and M2-10
- [M2-05 intermittent goal mutations](M2/M2-05-VALIDATION.md) — accepted
- [M2-06 plan page render](M2/M2-06-VALIDATION.md) — accepted
- [M2-09 App Router lost render](M2/M2-09-VALIDATION.md) — testable; cause
  identified upstream and fixed in `next@16.3.0`, which this repository does
  not run. No fix and no version bump in this ticket; the shared recovery is
  consolidated and the two unmeasured surfaces are measured
- [M2-11 next@16.3.0 upgrade and re-measurement](M2/M2-11-VALIDATION.md) —
  builder handoff; `/home/plan` navigation measured at 9/250 before the
  upgrade and 0/250 after on M2-09's probe. The CI retry stopgap is removed on
  that measurement; every application-side mitigation stays, because the four
  watchdog surfaces were never measured on either build
- [M2 visual evidence](M2/evidence/)

## M3

- [M3-19 delete a planned session](M3/M3-19-VALIDATION.md) — testable;
  Tier 1, correction round 2 complete against `d422f81`. A forward migration
  re-emits `apply_rolling_plan_change_set` with a `delete` operation beside
  `cancel`: it hard deletes an active or cancelled future session, ignores
  the lock, and refuses a session carrying a completion with `PT425` before
  the restricting foreign key can fire. `cancel` stops being the operation
  chain's fallthrough. The audit entry is M3-14's dated `delete` shape,
  reused unchanged, so nothing structural moves. Session cards retire the
  "Remove" label for **Cancel** and **Delete**. Round 1 of independent review
  rejected `1e12dce`: the top-up that follows every plan change writes a
  deleted occurrence straight back, so deleting a cancelled occurrence
  returned it active. The product owner accepted the behavior on
  29 August 2026; `437d470` makes the copy and the toast describe it and
  pins it in the shared adapter contract. Round 2 approved `437d470` with
  findings and no blocking defect, and `d422f81` closes four of them: the
  divergence loss the occurrence warning omitted, the real label of the
  control it points at, coverage of the unknown refill branch, and two
  record corrections. A fresh CI run, re-review, a fresh Preview, the
  founder migration and acceptance are outstanding
- [M3-15A replacement completion foundation](M3/M3-15A-VALIDATION.md) —
  accepted; Tier 1, independently reviewed and accepted against `0cc8d46`.
  Rebuilds the factual completion record M3-11 deleted, on the rolling-plan
  foundation: one
  owner-editable completion, its activity snapshot, the write-once planned
  snapshot it was measured against, and the owner-derived write. No revision
  chain, no `rest` status, and no surface — M3-15 owns that. `end_series` and
  the series sweep now keep a completed occurrence as they keep a locked one.
  The first CI run was red on the `M3-11 seeded legacy reset` step because the
  dispatched brief reused a retired legacy table name; the lead corrected the
  brief in `e56fcfc` and `0cc8d46` renames the table to `completion_activities`,
  leaving every M3-11 assertion exactly as M3-11 wrote it. CI is green and the
  Preview is `READY` for `267b886`, and independent review approved `0cc8d46`
  with one record-only correction, now applied. Accepted 29 Aug 2026. The
  founder migration is applied on the product owner's attestation; the hosted
  history, advisor, and authenticated-read output was not captured and is
  recorded as limitation 9, which the product owner then closed in full:
  history aligned at all 19 positions, one new advisor warning in the existing
  ADR-008 category, the privilege boundary confirmed, and the
  `authenticated` / `anon` read pair behaving as specified. Merged as
  `47a9fd7`; `master` CI green and the
  founder deployment `READY`.
- [M3-14B recurring series surface](M3/M3-14B-VALIDATION.md) — accepted;
  corrected implementation `49ae94b` is independently approved, owner-accepted
  and merged to `master` as `b49c58d`. Founder smoke/security checks are
  recorded. One Plan-level Create session flow owns single and recurring
  creation; cards are limited to Edit, Remove, and Lock
- [M3-14 recurring session series foundation](M3/M3-14-VALIDATION.md) — in
  development; Tier 1 builder handoff complete against `15e3f3c`. The migration
  adds `rolling_plan_series` and `rolling_plan_series_activities`, the
  occurrence identity on `rolling_plan_sessions`, the three series operations on
  `apply_rolling_plan_change_set`, and the owner-derived
  `materialize_rolling_plan_series`. No user-visible surface and no 390px pass —
  M3-14B owns those. Picked up from a stopped builder's never-executed draft
  (`0b5dd12`), which was verified rather than trusted; one weekly-anchoring
  defect was found and fixed. Independent review, the CI run for the reviewed
  SHA, the founder migration, and acceptance are pending
- [M3-13 private saved-session library](M3/M3-13-VALIDATION.md) — accepted
  19 August 2026; Tier 1. One additive migration adds `saved_sessions` and
  `saved_session_activities` with owner-scoped RLS, select-only client grants,
  and one owner-derived write carrying an optimistic revision token;
  `/home/plan/saved` lists, inspects, edits, reuses and deletes entries, and
  both copy directions are by value. `apply_rolling_plan_change_set` is
  untouched. Round 1 of independent review rejected `9c27a98` on one blocking
  browser regression — a `hasText` disclosure filter in the M3-12 spec that
  M3-13's consequence copy made ambiguous — corrected in `46c09c0`; the schema,
  authorization and copy-by-value work was verified unchanged. Round 2 approved
  `46c09c0` on green run 32167697854; founder migration `20260818143303` applied
  and verified; accepted against `46c09c0` and merged as `5e765fe` with green
  `master` run 32233970170 and founder deployment `5979056149`
- [M3-12 manual continuous planning](M3/M3-12-VALIDATION.md) — accepted
  18 August 2026; Tier 1. The migration adds the durable owner time zone,
  Recovery day labels, and the two planning rules M3-10 left out; the
  `/home/plan` stub is replaced by the owner's one continuous plan. Round 1 of
  independent review rejected `2a09b6c` on two delivery-gate blockers and three
  defects, all corrected in `093b21d`; the schema, authorization and atomicity
  work was accepted unchanged. Accepted against `093b21d` and merged as
  `a1aada9`, with founder migration `20260817125029` applied and verified
- [M3-18 residual focus-ring contrast](M3/M3-18-VALIDATION.md) — accepted
  17 August 2026 against `5f78071` with green CI and a confirmed Preview.
  Tier 3, lead-implemented. Every failing focus ring now computes at least
  11.39:1 against the surfaces the 2px offset exposes
- [M3-11 legacy training reset](M3/M3-11-VALIDATION.md) — in development;
  Tier 1 builder handoff complete, destructive founder cutover not executed
- [M3-10 rolling-plan foundation](M3/M3-10-VALIDATION.md) — in development;
  Tier 1 builder and independent reviewer dispatched
- [M3-01 server-only AI boundary and fixture adapters](M3/M3-01-VALIDATION.md) — in development; builder handoff complete, independent review, CI, Preview verification, and acceptance pending
- [M3-01B one approved real-provider adapter](M3/M3-01B-VALIDATION.md) — accepted 10 August 2026 against the independently reviewed commit `e5adc9b` after two review rounds; migration applied and verified on the founder project; limitation 17 carries into M3-02 as a hard constraint
- [M3-03 selected-horizon plan proposal](M3/M3-03-VALIDATION.md) — **incomplete**; commit `0cf2eca` delivers the plan-proposal schema and its `SECURITY DEFINER` transactions, the `fittip.seven-day-plan.v2` contract and validator, the selected-horizon derivation with the context-minimum refusal, and the v2 prompt and grammar. The repository, domain service, safety-tier decision, server actions, `390x844` interface, and Playwright flow are not delivered, so the commit is not ready for independent review as a ticket or for acceptance
- [M3-02 high-level roadmap proposal](M3/M3-02-VALIDATION.md) — **incomplete**; commit `94880d6` delivers the ADR-015 schema, the `fittip.roadmap.v2` contract, the per-source context allocation, and the composition root that closes M3-01B limitation 17. The repository, server actions, `390x844` interface, and Playwright flow are not delivered, so the commit is not ready for independent review or acceptance
