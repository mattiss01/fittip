# M2-05: Intermittent goal mutations that do not apply

**Status:** proposed - investigation not yet approved

**Milestone:** M2 - goals, editable coaching context, and guided onboarding

**Priority:** P1

**Feature brief:** [F-003 draft; direction approved](../../product/F-003-GOALS-MEMORY-GUIDED-ONBOARDING.md)

**Owning accepted ticket:** [M2-01 Goal model and validation](M2-01-GOAL-MODEL-VALIDATION.md)

**Related decision:** [ADR-009 M2 goal mutation transaction](../../decisions/ADR-009-M2-GOAL-MUTATION-TRANSACTION.md)

**Depends on:** [M2-01 accepted](M2-01-GOAL-MODEL-VALIDATION.md)

**Blocks:** treating a green continuous-integration run as a dependable
delivery gate, and therefore the evidence rule in `AGENTS.md`

## Outcome

Establish why an accepted goal mutation intermittently does not apply and
reports nothing to the user, then correct the cause. Two symptoms are recorded
below: a create that never appears, and a reorder that never takes effect.

This ticket is an investigation first. It does not authorize a redesign of the
goal model, a change to the accepted rank or lifecycle rules, new product
behavior, or an AI call. If the investigation finds a defect, the correction
returns to M2-01's accepted contract and follows the normal implementation,
review, Preview, deployment, and acceptance workflow.

## Observed behavior

On 30 July 2026 the `M2-01 goal management` browser flow failed twice in
continuous integration, on two commits that changed no application code, with
**two different symptoms**. Both are the same underlying shape: an accepted
goal mutation does not take effect, and nothing tells the user.

### Failure A - a create does not appear

Failed on a documentation-only commit. The immediately preceding and
immediately following runs of the same spec, on the same application code,
both passed.

- The spec failed at `e2e/m2-01-goals.spec.ts:271`, inside `createGoal`, called
  from line 217. The assertion was
  `expect(page.getByRole("heading", { name: "Temporary idea" })).toBeVisible()`
  and reported `element(s) not found` after its 5000 ms budget.
- The goal being created was **supporting**, not core, so the three-active-core
  constraint was not involved.
- The retained page snapshot shows the add panel still open and correctly
  filled: title `Temporary idea`, Attention `Supporting`, area `Walking`, start
  date `2026-07-29`.
- No error was rendered. The `alert` element in the snapshot is the empty live
  region, present in passing snapshots of other flows as well.
- The retained trace shows the failing assertion consuming its full 5.0 s
  budget while **every other action in the run completed in 0.5 s or less**.
  A create exceeding 5 s would be a tenfold outlier rather than marginal
  timing, which argues against a uniformly slow runner.
- The step immediately before the failing create is the abandon-lifecycle
  mutation, which asserts the status message `Goal marked abandoned.`

### Failure B - a reorder does not take effect

Failed on the `master` commit that added this ticket, which changed only
documentation. This is the run that left `master` red.

- The spec failed at `e2e/m2-01-goals.spec.ts:120`. The assertion was
  `expect(goalCard(page, "Trail event").getByLabel("Rank 2")).toBeVisible()`
  and reported `element(s) not found`.
- Line 114 clicks **Move up** on the Trail event card, moving it from rank 3
  to rank 2. The preceding assertion that Swim endurance holds `Rank 1` passed,
  but that assertion is **trivially true**: Swim endurance already held rank 1
  before the move, so it does not prove the reorder happened. The Trail event
  assertion is the first one that could detect the mutation, and it failed.
- The failing step runs immediately after the spec opens a **second browser
  page** on `/home/you/goals` (`stalePage`) to exercise stale-client conflict
  behavior. Two clients are therefore live against the same owner's goals.

### Failure C - a delete does not remove the goal

Failed on the master commit carrying the continuous-integration concurrency fix,
which changed only the workflow file.

- The spec failed at `e2e/m2-01-goals.spec.ts:237`, asserting
  `toBeHidden()` on the heading `Temporary idea` after the permanent-delete
  confirmation. The heading was still present, so the delete did not apply.
- This is the same goal the create in failure A could not produce, reached from
  the opposite direction: in A it never appeared, in C it never went away.

### Common shape

All three failures are an accepted mutation - a create, a reorder, and a delete
- that does not apply, renders no error, and leaves the surface looking as
though nothing was requested. All three sit in the transactional rank and
lifecycle path. Three different assertions failing this way, while the same
run's other flows pass, makes a test-only timing artifact substantially less
likely than a real defect.

**Not part of this ticket.** One run also failed `e2e/planning.spec.ts:29`,
waiting for the Plan page heading after navigation. That is a page render, not
a mutation, and it has happened once in six runs against M2-01's three in six.
Record it if it recurs, but do not fold it into this diagnosis; the shapes are
different and conflating them would send the investigation in the wrong
direction.

## Open questions

1. Can either failure be reproduced deliberately - by driving a lifecycle
   mutation and an immediate create with no settling time, by holding a second
   stale client open during a reorder, or by running the spec repeatedly?
2. Does the mutation reach the database at all in the failing case? A server
   log or an assertion on the mutation result would separate a lost write from
   a lost render.
3. Does ADR-009's transactional rank and lifecycle path serialize a lifecycle
   change, a create, and a concurrent reorder correctly? Can a rank conflict be
   resolved in a way that returns no row and no error to the caller? The
   concurrency harnesses in `supabase/tests/integration/` pass consistently in
   CI, so any defect is either outside what they cover or lives above the
   database boundary.
4. Does a second live client on the same goals change the outcome, and is that
   the accepted stale-client behavior or an unintended lost update?
5. Does the surface report every failure mode? A mutation that fails without
   rendering a message is a defect independently of the race, because a real
   user would see the page simply do nothing.
6. Is the 5000 ms `expect` budget in `e2e/m2-01.playwright.config.ts`, tighter
   than every other ticket config, appropriate once the cause is known?
7. Does `e2e/m2-01-goals.spec.ts:115` assert anything? It expects Swim
   endurance to hold `Rank 1`, which was already true before the reorder, so it
   cannot detect a failed move. Whatever the defect turns out to be, that
   assertion should prove the mutation applied.

## Scope

1. Reproduce the failure deterministically, or record precisely what was tried
   and what the observed rate is.
2. Identify whether the fault is a lost write, a lost render, or a test-only
   race.
3. Correct the identified cause in the owning layer.
4. Ensure any goal-mutation failure renders an honest, visible message.
5. Add the regression coverage that would have caught it.

## Non-goals

- No change to the accepted goal model, rank rules, lifecycle states, or the
  three-active-core constraint beyond what the identified defect requires.
- No memory, onboarding, roadmap, plan-proposal, or AI behavior.
- No new external service, provider call, or hosted resource.
- **Do not raise the `expect` budget to make the flow pass.** That hides the
  signal. The budget may be revisited only once the cause is understood, and
  only as a deliberate decision with its reason recorded.
- No broad refactor of the goal repository or domain service.

## Observed rate

Six completed attempts of this flow so far: three passed, three failed, with
three different symptoms. In the same runs the M1-03 and M1-04 flows passed six
times out of six, so the instability is specific to goal management rather than
to the runner.

A one-in-two failure rate on unchanged code is not a marginal flake, and it
currently leaves `master` red. A gate that fails this often trains every reader
to re-run it reflexively, which is worse than having no gate. Record the real
rate observed during the investigation.

## Validation

- The reproduction attempt and its result, stated honestly including a failure
  to reproduce.
- The identified cause, or an explicit statement that it remains unidentified
  and what was ruled out.
- Repeated runs of `e2e/m2-01-goals.spec.ts` after the correction, with the
  number of consecutive passes recorded.
- The continuous-integration run for the reviewed commit.
- Confirmation that a failed goal mutation renders a visible message at
  `390x844`.

## Approval gate

Product-owner approval of the investigation, then builder implementation,
exact-commit independent review, Preview verification, and acceptance for any
resulting correction.
