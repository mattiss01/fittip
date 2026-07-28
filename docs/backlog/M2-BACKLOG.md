# M2 backlog

**Planning state:** The former proposed M1 goals, memory, and intake work moved
to M2 on 28 July 2026 after the product owner chose manual training planning
and tracking as the first product milestone. No moved ticket was approved or
implemented by the renumbering.

**Founder boundary:** owner or synthetic data only, locally or in accepted
M0-06A founder staging. M0-03B, M0-04 and its later implementation, M0-05, and
M0-06 remain mandatory before friends, public registration, commercial use, or
production.

| Priority | Ticket | Status | Depends on | Scope | Approval gate |
|---|---|---|---|---|---|
| P1 | [M2-01 Goal model and validation](M2-01-GOAL-MODEL-VALIDATION.md) | proposed | M1-05 accepted; M0-03 and M0-02-C1 accepted | Sport-agnostic goal CRUD; lifecycle; core/supporting ranks; maximum three active core goals; ownership/RLS; concurrency; archive/delete; 390px management | Approve goal fields, lifecycle/rank, archive/delete, concurrency architecture, mobile UX/copy, and privacy classification |
| P1 | [M2-02 Memory model and management](M2-02-MEMORY-MODEL-MANAGEMENT.md) | proposed | M1-05 accepted; M0-03 and M0-02-C1 accepted | Explicit facts, constraints, preferences, and proposed patterns; provenance/status/history; inspect/edit/disable/delete; ownership/RLS; sensitive-data handling; 390px management; no AI extraction | Approve statuses, provenance, history/expiry/delete, sensitive-data handling, mobile UX/copy, and consequential architecture |
| P1 | [M2-03 Structured intake and fact review](M2-03-INTAKE-FACT-REVIEW.md) | proposed | M2-01 and M2-02 accepted | Structured intake; separate candidates; explicit accept/edit/reject; partial selection and atomic publication; duplicate/conflict; resume/retry; conservative safety copy; no production AI | Approve required fields, draft retention, atomicity, conflicts, safety, mobile UX/copy, privacy, and any transaction ADR |
| P1 | [M2-04 Consolidated M2 validation](M2-04-M2-VALIDATION-SLICE.md) | proposed | M2-01 through M2-03 accepted | Independent clean-migration, RLS, invariant, 390px, accessibility, privacy/security, quality, and regression validation; no product changes | Dispatch only after the three feature slices are accepted and approve the exact validator/evidence matrix |

## Dependency chain

```text
Accepted M1 manual plan-and-track foundation
  -> M2-01 goals
  -> M2-02 memory
  -> M2-03 structured intake and explicit fact review
  -> M2-04 independent validation
  -> M3 AI adapter and proposal work
```

M2-01 and M2-02 may be approved and delivered separately after M1 acceptance.
M2-03 requires both destination models. M2-04 starts only after all three
feature slices are accepted.

## Ticket rule

Each ticket remains independently proposed, approved, implemented, reviewed,
and accepted. Moving a proposed ticket from M1 to M2 does not approve it.
Goals and memory become context for later AI only after explicit user review;
M2 introduces no provider call, generated plan, silent inference, or direct AI
write.
