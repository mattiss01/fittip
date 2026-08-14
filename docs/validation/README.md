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

- [M3-10 rolling-plan foundation](M3/M3-10-VALIDATION.md) — in development;
  Tier 1 builder and independent reviewer dispatched
- [M3-01 server-only AI boundary and fixture adapters](M3/M3-01-VALIDATION.md) — in development; builder handoff complete, independent review, CI, Preview verification, and acceptance pending
- [M3-01B one approved real-provider adapter](M3/M3-01B-VALIDATION.md) — accepted 10 August 2026 against the independently reviewed commit `e5adc9b` after two review rounds; migration applied and verified on the founder project; limitation 17 carries into M3-02 as a hard constraint
- [M3-03 selected-horizon plan proposal](M3/M3-03-VALIDATION.md) — **incomplete**; commit `0cf2eca` delivers the plan-proposal schema and its `SECURITY DEFINER` transactions, the `fittip.seven-day-plan.v2` contract and validator, the selected-horizon derivation with the context-minimum refusal, and the v2 prompt and grammar. The repository, domain service, safety-tier decision, server actions, `390x844` interface, and Playwright flow are not delivered, so the commit is not ready for independent review as a ticket or for acceptance
- [M3-02 high-level roadmap proposal](M3/M3-02-VALIDATION.md) — **incomplete**; commit `94880d6` delivers the ADR-015 schema, the `fittip.roadmap.v2` contract, the per-source context allocation, and the composition root that closes M3-01B limitation 17. The repository, server actions, `390x844` interface, and Playwright flow are not delivered, so the commit is not ready for independent review or acceptance
