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
**in development**, its dependency on M2-01's acceptance now satisfied. It was
**accepted** on 2 August 2026 after three independent review rounds and hosted
database verification. During acceptance the product owner overturned ADR-010
decision 7, so a user-created `observed_pattern` is active on save; the cost is
that the review actions have no browser coverage until M2-03 produces real
proposals. M2-03's destination models are now both accepted.

On 2 August 2026 the product owner approved M2-03's nine-part field, UX,
persistence, atomicity, conflict, safety, privacy, and confidence decision set.
With both destination models accepted, M2-03 moved to **in development** as a
Tier 1 ticket under ADR-011.

On 3 August 2026 M2-04 executed and **M2 closed**. The
[M2 milestone closeout](../../validation/M2/M2-MILESTONE-CLOSEOUT.md) holds the
evidence: every accepted M2 commit integrated on `master`, the anonymous hosted
boundary, the reused hosted database verification, the no-AI boundary, and the
product owner's `390x844` walkthrough of onboarding through to editing published
records under **You**. Its one finding — goals had no counterpart to the memory
context gate — was resolved by
[ADR-012](../../decisions/ADR-012-AI-GOAL-CONTEXT-ELIGIBILITY.md) rather than by
a correction, and its implementation is assigned to M3-01.

M2 closed with M2-07, M2-08, M2-09, and M2-10 open. That is deliberate and none
of them blocks anything; the closeout records why each remains. M3-01 is now
dependency-ready and still separately proposed.

**M2-08 was accepted later the same day**, after M2 had closed. It was
dispatched Tier 1 on the lead's diagnosis, then re-scoped to Tier 3 when the
builder proved the prescribed migration is not executable: PostgreSQL requires
every parameter after a defaulted one to have a default, and the nine
interspersed parameters make that impossible without dropping and recreating
the `security definer` function behind M1-03's completion write. The product
owner declined that blast radius and chose to patch the generated types, which
also fixed a second defect — the documented command silently dropped the
`graphql_public` schema. Its entry is appended to the closeout under
post-closure Tier 3 entries. M2-07 and M2-10 remain open.

The governing product direction is the approved
[F-003 goals, editable coaching context, and guided onboarding](../../product/F-003-GOALS-MEMORY-GUIDED-ONBOARDING.md).
The product owner approved the direction on 29 July 2026 and its detailed
M2-03 decisions on 2 August 2026.

**Founder boundary:** owner or synthetic data only, locally or in accepted
M0-06A founder staging. M0-03B, M0-04 and its later implementation, M0-05, and
M0-06 remain mandatory before friends, public registration, commercial use, or
production.

| Priority | Ticket | Status | Depends on | Scope | Approval gate |
|---|---|---|---|---|---|
| P1 | [M2-01 Goal model and validation](M2-01-GOAL-MODEL-VALIDATION.md) | accepted | M1 milestone closeout accepted; M0-03 and M0-02-C1 accepted | Sport-agnostic goal CRUD; lifecycle; core/supporting ranks; maximum three active core goals; ownership/RLS; concurrency; archive/delete; 390px management | Builder implementation, exact-commit review, Preview verification, and product-owner acceptance |
| P1 | [M2-02 Memory model and management](M2-02-MEMORY-MODEL-MANAGEMENT.md) | accepted | M1 milestone closeout accepted; M0-03 and M0-02-C1 accepted | Explicit facts, constraints, preferences, and proposed patterns; provenance/status/history; inspect/edit/disable/delete; ownership/RLS; sensitive-data handling; 390px management; no AI extraction | Approve statuses, provenance, history/expiry/delete, sensitive-data handling, mobile UX/copy, and consequential architecture |
| P1 | [M2-03 Guided onboarding and context review](M2-03-INTAKE-FACT-REVIEW.md) | in development | M2-01 and M2-02 accepted | First-run/resumable onboarding for goals, baseline, possibilities, preferences, and optional constraints; separate candidates; explicit review; atomic publication into You; no production AI | Distinct builder, exact-commit independent review, green CI, Preview verification, and product-owner acceptance |
| P1 | [M2-04 Targeted M2 milestone closeout](M2-04-M2-VALIDATION-SLICE.md) | accepted | M2-01 through M2-03 accepted | Reuse accepted ticket evidence; one hosted onboarding-to-You walkthrough plus current deployment, migration/RLS/advisor, active-context, and no-AI boundary checks | Approve the exact targeted closeout after all three feature slices are accepted |
| P1 | [M2-05 Intermittent goal mutations that do not apply](M2-05-INTERMITTENT-GOAL-MUTATIONS.md) | accepted | M2-01 implementation merged | Investigate two observed symptoms - a create that never appears and a reorder that never takes effect, both silent; identify lost write versus lost render; correct the cause; make failed mutations visible; add regression coverage | Approve the investigation, then normal implementation, review, Preview, and acceptance for any correction |
| P1 | [M2-06 Plan page intermittently does not finish rendering](M2-06-PLAN-PAGE-RENDER-TIMEOUT.md) | accepted | M1 milestone closeout accepted | Investigate a plan route that intermittently never replaces its loading state; identify what the render waits on; make a failed render show an honest error; stop a committed URL alone from passing the navigation assertion | Approve the investigation, then normal implementation, review, Preview, and acceptance for any correction |
| P2 | [M2-07 Goal review follow-ups](M2-07-GOAL-REVIEW-FOLLOWUPS.md) | proposed | M2-01 accepted | Eight findings from M2-01's second independent review; two pgTAP guards that cannot fail, unasserted RLS predicates, a wiped create draft, and four smaller client and test corrections; no migration expected | Approve the scope, then normal implementation, review, Preview, and acceptance |
| P2 | [M2-08 Regenerating database types breaks typecheck](M2-08-TYPE-GENERATION-DRIFT.md) | accepted | none | Documented type regeneration drops `\| null` from nine `save_training_completion` parameters and reddens typecheck on unchanged `master`; identify generator regression versus wrong RPC signature before proposing a fix | Approve the investigation; tier depends on the cause |
| P1 | [M2-09 App Router transitions drop a mutation result](M2-09-APP-ROUTER-LOST-RENDER.md) | accepted | none | A server action returns 200 with a correct body and the transition never commits; measured on goals (3 in 20), memory (1 in 6, with a 33ms trace ruling out slowness), and roadmap (3 in 6); identify the cause, measure `/home/plan` and `/home/log`, and consolidate the shared recovery if none is found | Accepted 13 August 2026 at `3677421`. The cause is upstream and not in this repository; the remedy is a `next@16.3.0` upgrade taken as a separate ticket |
| P2 | [M2-10 Focus is lost after every mutation](M2-10-FOCUS-LOST-AFTER-MUTATION.md) | proposed | M2-02 accepted | Both management surfaces drop focus to `body` when the acting control unmounts, so a keyboard or screen-reader user restarts from the top after every change; decide where focus belongs per mutation kind and apply it to goals and memory together | Approve the focus destinations, then normal implementation, review, Preview, and acceptance |
| P1 | [M2-11 Upgrade to `next@16.3.0` and re-measure](M2-11-NEXT-16-3-0-UPGRADE.md) | proposed | M2-09 accepted | Take the upgrade carrying the upstream `useDeferredValue` fix; re-measure all four transitions on M2-09's probe, measure `/home/plan`'s own save for the first time, decide the React pins, and remove a mitigation or the CI retries only where the after-measurement supports it | Approve the upgrade, the tier, and the React pin decision; expected Tier 2 |

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

M2-10 came out of M2-02's independent review, which checked the goals surface
before reporting and found the identical gap there. Fixing it inside M2-02
would have made memory diverge from an accepted surface with nothing recording
why, and left goals broken, so it is one ticket deciding one answer for both.

M2-09 is the framework race that M2-05 mitigated on goals and asked to have
filed separately. It was not filed, and M2-02 then paid for it again — a red
continuous-integration run, a trace investigation, and an unplanned correction.
**It was accepted on 13 August 2026, and the answer is that the defect is not in
this repository.** Next vendors its own React build, so the `react` pin in
`package.json` never runs; the vendored canary in every `16.2.x` release
predates the upstream `useDeferredValue` fix by a week. The remedy is a
`next@16.3.0` upgrade, which the product owner chose to take as a separate
ticket so the rate can be re-measured on the same probe. That is
[M2-11](M2-11-NEXT-16-3-0-UPGRADE.md), drafted 13 August 2026 and still
proposed. It carries a falsifiable hypothesis rather than a task list: if
`16.3.0` does not take `/home/plan` to zero, the M2-09 diagnosis is wrong and
the ticket says so instead of hunting a second cause.

On 3 August 2026 `/home/plan` stopped being unmeasured: the
`Authentication and planning flows` step had reddened seven of the last
thirty-five runs on M2-06's plan-render assertion, four of them on commits that
changed only documentation. The product owner approved a Tier 3 `--retries=2`
stopgap on that one step so the gate stops firing on unchanged code, and M2-09
owned removing it. It did not remove it: no application change can, so the
stopgap was re-justified in writing with a checkable condition for removal —
the accepted framework upgrade. Both `/home/plan` and `/home/log` are now
measured, at a floor of 4.00% and 2.45% per navigation.

## Ticket rule

Each ticket remains independently proposed, approved, implemented, reviewed,
and accepted. Moving a proposed ticket from M1 to M2 does not approve it.
Goals and memory become context for later AI only after explicit user review;
M2 introduces no provider call, generated plan, silent inference, or direct AI
write.
