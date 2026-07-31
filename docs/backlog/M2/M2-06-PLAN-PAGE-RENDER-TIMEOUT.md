# M2-06: Plan page intermittently does not finish rendering

**Status:** proposed - investigation not yet approved

**Milestone:** M2 - goals, editable coaching context, and guided onboarding

**Priority:** P1

**Owning accepted work:** [M1-02 selectable-horizon planning](../M1/M1-02-SELECTABLE-HORIZON-PLANNING.md)
and [M1-04 Today and Progress navigation](../M1/M1-04-TODAY-PROGRESS-NAVIGATION.md)

**Depends on:** M1 milestone closeout accepted

**Related:** [M2-05 intermittent goal mutations](M2-05-INTERMITTENT-GOAL-MUTATIONS.md)
is a different defect observed in the same runs. Do not merge the two
investigations; see "Relationship to M2-05" below.

**Blocks:** treating a green continuous-integration run as a dependable
delivery gate, together with M2-05

## Outcome

Establish why `/home/plan` intermittently fails to replace its loading state
with the planning surface within five seconds, then correct the cause.

This ticket is an investigation first. It authorizes no change to the accepted
planning model, plan versioning, horizon rules, or activity behavior. If it
finds a defect, the correction returns to the owning accepted ticket and
follows the normal implementation, review, Preview, deployment, and acceptance
workflow.

## Observed behavior

Between 30 and 31 July 2026 the `Authentication and planning flows` step failed
three times in eight continuous-integration runs, every time on the same
assertion, on commits that changed no application code.

- The spec fails at `e2e/planning.spec.ts:29`:
  `expect(page.getByRole("heading", { name: /Plan what/ })).toBeVisible()`,
  reporting `element(s) not found` after the root config's default 5000 ms
  expectation budget.
- The preceding assertion at line 26,
  `expect(page).toHaveURL(/\/home\/plan$/)`, **passes**. Navigation therefore
  commits while the destination content is still absent.
- `src/app/home/plan/loading.tsx` renders a route-level loading boundary whose
  heading is `Opening your training ledger…`. Because that boundary exists, the
  App Router can commit the URL immediately and stream the real surface
  afterwards. A URL assertion consequently proves nothing about whether the
  page rendered.
- In the same eight runs the M1-03 and M1-04 browser flows passed every time,
  so the runner is not simply slow.
- The failure survived the save-dock spacing correction and is unrelated to it.
  That fix addressed a deterministic click interception at
  `e2e/planning.spec.ts:89`; this is a render that never completes at line 29.

The trace for the most recent occurrence was lost because the browser steps
shared one Playwright output directory and a later step cleared it. That has
been corrected, so the next occurrence will retain a trace and a page snapshot.

## Open questions

1. What is the server render actually waiting on? `/home/plan` is a dynamic
   authenticated route that reads the current plan head and versions. Identify
   whether a specific query, the Supabase connection, or the initial session
   verification is the slow step.
2. Is the delay unbounded or merely longer than five seconds? A render that
   eventually completes at six seconds and one that never completes need
   different corrections.
3. Does the delay depend on prior state in the flow - the account having just
   been created and confirmed, or the first authenticated render after sign-in?
4. Is the loading boundary masking a real error? Confirm whether a failed or
   rejected server render surfaces `error.tsx` or silently keeps the loading
   state visible.
5. Should the spec assert the loading state has been replaced rather than
   relying on `toHaveURL`, which cannot detect this class of failure? Whatever
   the cause, line 26 currently gives false assurance.
6. Does the same latency affect Today, Progress, or the goals surface, which
   share the authenticated shell and session verification?

## Scope

1. Reproduce the failure, or record precisely what was tried and the observed
   rate.
2. Identify what the render waits on, and whether the wait is bounded.
3. Correct the identified cause in the owning layer.
4. Ensure a server render that fails surfaces an honest error rather than an
   indefinite loading state.
5. Strengthen the navigation assertion so a committed URL alone cannot pass.

## Non-goals

- No change to the accepted planning model, horizon selection, plan versioning,
  session composition, or activity behavior beyond what the defect requires.
- No goal, memory, onboarding, or AI behavior. Goal mutations are M2-05.
- **Do not raise the expectation budget to make the flow pass.** The budget may
  be revisited once the cause is known, and only as a deliberate decision with
  its reason recorded.
- No new external service, provider call, or hosted resource.

## Relationship to M2-05

Both defects surfaced in the same continuous-integration runs and both leave a
surface looking as though nothing happened, but they are different failures and
must not be investigated as one.

| | M2-06 | M2-05 |
| --- | --- | --- |
| Surface | `/home/plan` | `/home/you/goals` |
| Failing thing | a page render that never completes | a mutation that never applies |
| Assertion | one, always the same | three different ones |
| Rate | 3 of 8 runs | 4 of 9 attempts |

Folding them together would attribute a render latency problem to the goal
mutation path, or the reverse, and send both investigations wrong.

## Validation

- The reproduction attempt and its result, stated honestly including a failure
  to reproduce.
- The identified cause, or an explicit statement that it remains unidentified
  and what was ruled out.
- Repeated runs of `e2e/planning.spec.ts` after the correction, with the number
  of consecutive passes recorded.
- The continuous-integration run for the reviewed commit.
- Confirmation that a failed server render on an authenticated route shows an
  honest error at `390x844` rather than an indefinite loading state.

## Approval gate

Product-owner approval of the investigation, then builder implementation,
exact-commit independent review, Preview verification, and acceptance for any
resulting correction.
