# M2 backlog

**Planning state:** The former proposed M1 goals, memory, and onboarding work moved
to M2 on 28 July 2026 after the product owner chose manual training planning
and tracking as the first product milestone. No moved ticket was approved or
implemented by the renumbering.

The targeted
[M1 milestone closeout](../../validation/M1/M1-MILESTONE-CLOSEOUT.md) was
accepted on 29 July 2026. M2-01 and M2-02 are dependency-ready but remain
separately governed by their ticket approval gates. M2-01 was approved and
moved to **in development** on 29 July 2026, to **testable** on 30 July 2026
after its builder validation record was completed, and **accepted** the same
day against its Vercel Preview with the independent exact-commit re-review
explicitly waived. On 30 July 2026 the product owner withdrew that waiver, so
M2-01 returned to **testable**.

The required review then ran twice. The first, on 31 July 2026, returned
"correction required" over one finding, which was corrected and accepted under
M2-05. The second, on 1 August 2026, reviewed merged `master` and returned
"approved for re-acceptance", closing the four areas the first had declared out
of scope. M2-01 was **accepted** on 1 August 2026 with the second review's eight
findings open and routed to M2-07, which the product owner approved as a
separate explicit decision.

M2-02 was approved for implementation on 1 August 2026 and moved to
**in development**, its dependency on M2-01's acceptance now satisfied.

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
| P1 | [M2-01 Goal model and validation](M2-01-GOAL-MODEL-VALIDATION.md) | accepted | M1 milestone closeout accepted; M0-03 and M0-02-C1 accepted | Sport-agnostic goal CRUD; lifecycle; core/supporting ranks; maximum three active core goals; ownership/RLS; concurrency; archive/delete; 390px management | Builder implementation, exact-commit review, Preview verification, and product-owner acceptance |
| P1 | [M2-02 Memory model and management](M2-02-MEMORY-MODEL-MANAGEMENT.md) | in development | M1 milestone closeout accepted; M0-03 and M0-02-C1 accepted | Explicit facts, constraints, preferences, and proposed patterns; provenance/status/history; inspect/edit/disable/delete; ownership/RLS; sensitive-data handling; 390px management; no AI extraction | Approve statuses, provenance, history/expiry/delete, sensitive-data handling, mobile UX/copy, and consequential architecture |
| P1 | [M2-03 Guided onboarding and context review](M2-03-INTAKE-FACT-REVIEW.md) | proposed | M2-01 and M2-02 accepted | First-run/resumable onboarding for goals, baseline, possibilities, preferences, and optional constraints; separate candidates; explicit review; atomic publication into You; no production AI | Approve required fields, AI-readiness minimum, draft retention, atomicity, conflicts, safety, mobile UX/copy, privacy, and any transaction ADR |
| P1 | [M2-04 Targeted M2 milestone closeout](M2-04-M2-VALIDATION-SLICE.md) | proposed | M2-01 through M2-03 accepted | Reuse accepted ticket evidence; one hosted onboarding-to-You walkthrough plus current deployment, migration/RLS/advisor, active-context, and no-AI boundary checks | Approve the exact targeted closeout after all three feature slices are accepted |
| P1 | [M2-05 Intermittent goal mutations that do not apply](M2-05-INTERMITTENT-GOAL-MUTATIONS.md) | accepted | M2-01 implementation merged | Investigate two observed symptoms - a create that never appears and a reorder that never takes effect, both silent; identify lost write versus lost render; correct the cause; make failed mutations visible; add regression coverage | Approve the investigation, then normal implementation, review, Preview, and acceptance for any correction |
| P1 | [M2-06 Plan page intermittently does not finish rendering](M2-06-PLAN-PAGE-RENDER-TIMEOUT.md) | accepted | M1 milestone closeout accepted | Investigate a plan route that intermittently never replaces its loading state; identify what the render waits on; make a failed render show an honest error; stop a committed URL alone from passing the navigation assertion | Approve the investigation, then normal implementation, review, Preview, and acceptance for any correction |
| P2 | [M2-07 Goal review follow-ups](M2-07-GOAL-REVIEW-FOLLOWUPS.md) | proposed | M2-01 accepted | Eight findings from M2-01's second independent review; two pgTAP guards that cannot fail, unasserted RLS predicates, a wiped create draft, and four smaller client and test corrections; no migration expected | Approve the scope, then normal implementation, review, Preview, and acceptance |
| P2 | [M2-08 Regenerating database types breaks typecheck](M2-08-TYPE-GENERATION-DRIFT.md) | proposed | none | Documented type regeneration drops `\| null` from nine `save_training_completion` parameters and reddens typecheck on unchanged `master`; identify generator regression versus wrong RPC signature before proposing a fix | Approve the investigation; tier depends on the cause |

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

M2-05, M2-06, and M2-07 sit outside this chain. They correct already accepted
behavior rather than adding a slice, so none blocks M2-02 or M2-03. M2-05 and
M2-06 together blocked relying on a green continuous-integration run as a
delivery gate, because intermittent browser failures on unchanged code teach
every reader to re-run instead of read; both are now accepted. M2-05 covered
goal mutations that never apply; M2-06 covered a plan render that never
completes. They were deliberately kept separate.

M2-07 collects the eight findings from M2-01's second independent review. Two
of them are pgTAP guards that cannot fail, which is why the ticket exists at
all: a suite that reports a property it does not test is worse than one that
omits it. M2-02 should not copy those two patterns when it writes its own
memory authorization tests.

M2-08 is a tooling defect the M2-02 builder hit and reproduced on unchanged
`master`: running the documented type-generation step reddens `typecheck`. It
blocks nothing, but every schema ticket pays for it until it is fixed, and it
pushes builders toward exactly the hand-edit the project rules forbid.

## Ticket rule

Each ticket remains independently proposed, approved, implemented, reviewed,
and accepted. Moving a proposed ticket from M1 to M2 does not approve it.
Goals and memory become context for later AI only after explicit user review;
M2 introduces no provider call, generated plan, silent inference, or direct AI
write.
