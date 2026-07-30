# M2 backlog

**Planning state:** The former proposed M1 goals, memory, and onboarding work moved
to M2 on 28 July 2026 after the product owner chose manual training planning
and tracking as the first product milestone. No moved ticket was approved or
implemented by the renumbering.

The targeted
[M1 milestone closeout](../../validation/M1/M1-MILESTONE-CLOSEOUT.md) was
accepted on 29 July 2026. M2-01 and M2-02 are dependency-ready but remain
separately governed by their ticket approval gates. M2-01 was approved and
moved to **in development** on 29 July 2026, and to **testable** on 30 July
2026 after its builder validation record was completed; M2-02 remains
proposed.

The governing product direction is the draft
[F-003 goals, editable coaching context, and guided onboarding](../../product/F-003-GOALS-MEMORY-GUIDED-ONBOARDING.md).
The product owner approved the direction on 29 July 2026, but its detailed
field, privacy, safety, UX, and architecture decisions remain open.

**Founder boundary:** owner or synthetic data only, locally or in accepted
M0-06A founder staging. M0-03B, M0-04 and its later implementation, M0-05, and
M0-06 remain mandatory before friends, public registration, commercial use, or
production.

| Priority | Ticket | Status | Depends on | Scope | Approval gate |
|---|---|---|---|---|---|
| P1 | [M2-01 Goal model and validation](M2-01-GOAL-MODEL-VALIDATION.md) | testable | M1 milestone closeout accepted; M0-03 and M0-02-C1 accepted | Sport-agnostic goal CRUD; lifecycle; core/supporting ranks; maximum three active core goals; ownership/RLS; concurrency; archive/delete; 390px management | Builder implementation, exact-commit review, Preview verification, and product-owner acceptance |
| P1 | [M2-02 Memory model and management](M2-02-MEMORY-MODEL-MANAGEMENT.md) | proposed | M1 milestone closeout accepted; M0-03 and M0-02-C1 accepted | Explicit facts, constraints, preferences, and proposed patterns; provenance/status/history; inspect/edit/disable/delete; ownership/RLS; sensitive-data handling; 390px management; no AI extraction | Approve statuses, provenance, history/expiry/delete, sensitive-data handling, mobile UX/copy, and consequential architecture |
| P1 | [M2-03 Guided onboarding and context review](M2-03-INTAKE-FACT-REVIEW.md) | proposed | M2-01 and M2-02 accepted | First-run/resumable onboarding for goals, baseline, possibilities, preferences, and optional constraints; separate candidates; explicit review; atomic publication into You; no production AI | Approve required fields, AI-readiness minimum, draft retention, atomicity, conflicts, safety, mobile UX/copy, privacy, and any transaction ADR |
| P1 | [M2-04 Targeted M2 milestone closeout](M2-04-M2-VALIDATION-SLICE.md) | proposed | M2-01 through M2-03 accepted | Reuse accepted ticket evidence; one hosted onboarding-to-You walkthrough plus current deployment, migration/RLS/advisor, active-context, and no-AI boundary checks | Approve the exact targeted closeout after all three feature slices are accepted |

## Dependency chain

```text
Accepted M1 manual plan-and-track foundation
  -> M2-01 goals
  -> M2-02 memory
  -> M2-03 guided onboarding and explicit context review
  -> M2-04 targeted milestone closeout
  -> M3 AI adapter and proposal work
```

M2-01 and M2-02 may be approved and delivered separately after M1 acceptance.
M2-03 requires both destination models. M2-04 reuses their accepted evidence
and starts only after all three feature slices are accepted.

## Ticket rule

Each ticket remains independently proposed, approved, implemented, reviewed,
and accepted. Moving a proposed ticket from M1 to M2 does not approve it.
Goals and memory become context for later AI only after explicit user review;
M2 introduces no provider call, generated plan, silent inference, or direct AI
write.
