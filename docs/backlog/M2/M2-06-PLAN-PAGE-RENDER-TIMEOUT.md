# M2-06: Plan page intermittently does not finish rendering

**Status:** in development - approved 31 July 2026, dispatched to a builder the same day on branch `ticket/m2-06-plan-render`. Tier 2.

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

## Agent brief

**Outcome.** `/home/plan` intermittently never replaces its loading state with
the planning surface. Establish why, then correct it. Investigation first: the
cause is not known.

**Tier 2.** User-visible behavior on an accepted schema. Escalate to Tier 1 and
stop if the cause turns out to sit in a migration, authorization, or RLS.

**Hard constraints.**

- Establish whether this affects users at all before changing application code.
  The product owner checked the plan page on the Vercel production deployment
  on 31 July 2026 and it loaded normally. Nobody has observed this outside
  continuous integration.
- Raising the expectation budget is a legitimate outcome here **if** the
  evidence shows slowness rather than a hang, but only with the measurement
  recorded. It is not a legitimate way to silence a failure you have not
  explained.
- Never weaken or delete a check to make continuous integration green.
- A truthful "not reproduced", with what was tried and ruled out, is a valid
  outcome and is worth more than a speculative fix.
- Goal mutations that never apply are a different defect, M2-05. Do not fix it
  here.

**Non-goals.** No change to the accepted planning model, horizon selection,
plan versioning, session composition, or activity behavior beyond what the
identified defect requires. No goals, memory, onboarding, or AI behavior. No
new external service or hosted resource.

**Acceptance criteria.**

1. The cause is identified, or explicitly recorded as unidentified with what
   was ruled out.
2. A server render that fails shows an honest error instead of an indefinite
   loading state.
3. `e2e/planning.spec.ts` no longer passes on a committed URL alone; it asserts
   the loading state was replaced.
4. Repeated runs after the correction, with the consecutive pass count
   recorded.
5. A green continuous-integration run for the reviewed commit.

**Expected files.** `e2e/planning.spec.ts`, and whichever of
`src/app/home/plan/page.tsx`, `src/app/home/plan/loading.tsx`,
`src/app/home/plan/error.tsx`, or the planning repository the cause turns out
to implicate.

**Project skills.** `mobile-e2e` for the browser flow, `validation-record` for
the handoff. Read `.agents/skills/vercel-react-best-practices/AGENTS.md`
explicitly if server/client boundaries or data fetching change.

**Start here.** The observed behavior below is measured, not inferred. Read it,
and read the lead from M2-05 immediately after it, before forming a theory.

**Do not assume M2-05's cause.** The lead below is a hypothesis carried over
from a different surface. The product owner has since verified the plan page
loads normally on Vercel production, which is evidence against a user-facing
hang. Measure first.

**Leading lead from M2-05.** M2-05 proved that the App Router transition in
`next@16.2.11` / `react@19.2.7` intermittently never commits after a Server
Action: the write lands, the server returns 200 in tens of milliseconds, and
React then never renders again. `/home/plan` uses the same mechanism. Test
whether this defect is the same one before assuming it is a plan-specific
latency problem. Note the differences honestly: M2-05 was a Server Action
result, this is a navigation render, and a 60 s budget was already shown not to
help M2-05. If it is the same defect, the recovery approach in
`src/features/goals/mutation-watchdog.ts` on `ticket/m2-05-goal-mutation-lock`
is the precedent to follow rather than reinvent.

Read only this section unless you hit an ambiguity it does not resolve.

## Observed behavior

Between 30 and 31 July 2026 the `Authentication and planning flows` step failed
three times in eight continuous-integration runs, every time on the same
assertion, on commits that changed no application code.

**It has never been observed outside continuous integration.** On 31 July 2026
the product owner loaded the plan page on the Vercel production deployment and
it rendered normally after a brief loading state. Treat the scope of this
defect as unestablished: what is measured is that one assertion, with a five
second budget, failed three times in eight runs on a shared runner.

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

1. **Is this a product defect at all, or an artifact of the test environment?**
   Answer this first; everything else depends on it. The failing assertion gets
   Playwright's default 5 s, not the 180 s test budget, and the run is a
   brand-new account's first authenticated render with Supabase, the
   application server, and the browser sharing one small runner. Measure how
   long the render actually takes when it is slow. If it completes at six or
   ten seconds, this is latency under contention and the correction belongs in
   the test, not the application.
2. If it never completes, how does that differ from M2-05? There the builder
   proved the update never arrives by leaving a 60 s budget and still failing.
   **That experiment has not been run here.** Run it before assuming the same
   cause.
3. What is the server render waiting on? `/home/plan` is a dynamic
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
