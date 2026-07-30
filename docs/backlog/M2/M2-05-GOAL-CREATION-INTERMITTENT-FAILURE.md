# M2-05: Intermittent goal-creation failure after a lifecycle mutation

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

Establish why creating a goal immediately after a lifecycle mutation
intermittently produces no goal and no error, then correct the cause.

This ticket is an investigation first. It does not authorize a redesign of the
goal model, a change to the accepted rank or lifecycle rules, new product
behavior, or an AI call. If the investigation finds a defect, the correction
returns to M2-01's accepted contract and follows the normal implementation,
review, Preview, deployment, and acceptance workflow.

## Observed behavior

On 30 July 2026 the `M2-01 goal management` browser flow failed in continuous
integration on a documentation-only commit that changed no application code.
The immediately preceding and immediately following runs of the same spec, on
the same application code, both passed.

Evidence from the failing run:

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

## Open questions

1. Can the failure be reproduced deliberately, for example by driving the
   abandon mutation and the subsequent create with no settling time between
   them, or by running the spec repeatedly?
2. Does the create reach the database at all in the failing case? A server log
   or an added assertion on the mutation result would separate a lost write
   from a lost render.
3. Does ADR-009's transactional rank and lifecycle path serialize an abandon
   and a create correctly, and can a rank conflict be resolved in a way that
   returns no row and no error to the caller?
4. Does the form surface every failure mode? A mutation that fails without
   rendering a message is a defect independently of the race, because a real
   user would see the form simply do nothing.
5. Is the 5000 ms `expect` budget in `e2e/m2-01.playwright.config.ts`, tighter
   than every other ticket config, appropriate once the cause is known?

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

Three completed runs of this spec so far: two passed, one failed. That sample
is far too small to estimate a rate, but a gate that fails on unchanged code
trains every reader to re-run it reflexively, which is worse than having no
gate. Record the real rate observed during the investigation.

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
