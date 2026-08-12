# M2-09: App Router transitions intermittently drop a mutation result

**Status:** proposed — not approved for implementation

**Milestone:** M2 — goals, editable coaching context, and guided onboarding

**Priority:** P1

**Owning accepted work:** [M2-05 intermittent goal mutations](M2-05-INTERMITTENT-GOAL-MUTATIONS.md)

**Depends on:** nothing

**Source:** recorded as a known limitation by
[M2-05](../../validation/M2/M2-05-VALIDATION.md#known-limitations) on 31 July
2026, which asked for exactly this ticket; confirmed on a second surface by the
M2-02 builder on 2 August 2026, and on a third by M3-02 on 12 August 2026 at the
highest rate yet measured

**Blocks:** nothing today. Every surface that mutates data will keep paying a
per-ticket mitigation tax until it is understood.

## Observed behavior

A server action returns `200` with a complete, correct body, and the App Router
transition carrying that result never commits. The surface stays in its
pre-submit state with controls disabled, and without a mitigation the user sees
a form that silently did nothing.

Three surfaces have now measured it directly.

**Goals, M2-05, 31 July 2026.** Three recoveries in twenty flows on
`next@16.2.11` / `react@19.2.7`. M2-05 built detection and recovery for the
goals surface and recorded the framework defect as unfixed.

**Memory, M2-02, 2 August 2026.** One failure in six full flows before the
mitigation, at a different mutation than the one that failed in continuous
integration. The trace is unusually clean evidence:

- the failing `POST` started at `02:09:02.182` and completed in **33.485 ms**
  (21 ms wait, 12.5 ms receive), HTTP `200`;
- the body was complete and correct, carrying the re-rendered props and the new
  item at `"status":"proposed"`, with no error and no digest;
- the page snapshot at the moment of failure still showed "Saving memory
  change…", every control disabled, and the collection revision from *before*
  the save.

The reply reached the browser in 33 ms and the transition never committed.
Waiting longer would have changed nothing, because there was nothing left to
arrive. That rules out slowness, server error, and lock contention, which is
more than M2-05 was able to rule out.

Estimated per-mutation rate on the memory surface: **~1.5%**, which is why a
twelve-mutation flow failed roughly one run in six.

**Roadmap, M3-02, 12 August 2026.** **Three of six** local compose runs left the
screen on "Building your roadmap proposal…" for ever — by far the highest rate
recorded, and on the surface with the fewest mutations per flow. In every case
the server had already answered `200` in about 300 ms with a complete payload
carrying both the action result and the revalidated page including the rendered
spine, and a manual reload showed the proposal every time. No page error, no
failed request. Recorded as M3-02's limitation 11, mitigated and not fixed.

Two things that measurement adds:

- **The result was not merely complete, it was rendered.** The dropped payload
  contained the revalidated page's own markup, which narrows the failure to the
  commit rather than to anything upstream of it.
- **`mutation-watchdog.ts` now has a third consumer**, and M3-02 used only its
  "a reply arrived and never rendered" half — `watchGoalMutation`'s ten-second
  confirmation budget belongs to a form save, while a roadmap generation is one
  provider call with no honest fixed deadline. A module named for goals is now
  load-bearing for three features and one of them needs half of it. That is
  acceptance criterion 4 arriving whether or not a root cause is found.

## Why this is worth its own ticket

M2-05 wrote: *"Only the goals surface is protected. `/home/plan` and `/home/log`
use the same App Router mechanism and were not measured under this ticket.
Neither has failed in continuous integration, but neither is immune. This is
worth a separate ticket rather than a silent widening of scope here."*

That ticket was never opened, and M2-02 then hit the same defect and paid the
same cost a second time — including a red continuous-integration run, a trace
investigation, and an unplanned correction commit.

The cost is now visible and repeating:

- Every new mutating surface must independently discover the race, usually
  through an intermittent browser failure that looks like a flake.
- Each one carries its own recovery code. `src/features/goals/mutation-watchdog.ts`
  is now imported by the memory **and** roadmap surfaces, so a module named for
  goals is load-bearing for three features. Its name is wrong and its home is
  wrong, but renaming it touches M2-05's accepted code and so keeps being
  deferred.
- Users still see an unrequested self-reload roughly once in sixty-odd
  mutations. The mitigation is honest, but it is a mitigation.
- `/home/plan` and `/home/log` remain unmeasured and unprotected.

## Investigation first

The cause is not known. Do not design a fix before it is.

Nobody has yet explained *why* the transition drops the result. Establish that
before proposing anything, and treat a truthful "not identified, here is what
was ruled out" as a valid outcome — it is worth more than a speculative fix
layered on two existing mitigations.

Questions the evidence does not yet answer:

1. Is this a known defect in `next@16.2.11` or `react@19.2.7`? Check the
   upstream issue trackers and release notes before writing any code. If it is
   fixed upstream, the correction may be a version bump with its own
   verification rather than application code.
2. Is it specific to `useActionState` with a revalidating server action, or does
   it affect any transition?
3. Does it correlate with anything observable — concurrent revalidation, the
   `PerformanceObserver` both surfaces install, `force-dynamic`, or the
   production `build` + `start` path specifically?
4. Do `/home/plan` and `/home/log` exhibit it? They have never been measured.

## Continuous-integration stopgap

Question 4 is no longer open on `/home/plan`. It exhibits it, and continuous
integration has been measuring the rate without anyone reading the measurement:
the `Authentication and planning flows` step reddened **seven of the last
thirty-five runs**, always on
`planning.spec.ts:244 › expectPlanSurfaceReplacedLoading`, and four of those
seven were commits that changed only documentation. That is the assertion
[M2-06](M2-06-PLAN-PAGE-RENDER-TIMEOUT.md) added so the class would be visible,
working exactly as designed.

On 3 August 2026 the product owner approved `--retries=2` on that one step as a
**Tier 3** stopgap, because a gate that fires on unchanged code one run in five
teaches every reader to re-run instead of read — the precise failure the
milestone backlog already warned about. Retries absorb intermittency, not
breakage: a genuinely broken plan surface fails all three attempts and still
blocks, and Playwright reports a recovered run as `flaky`, so the occurrence
rate keeps accruing rather than being lost to a red job.

This ticket owns removing it. The stopgap is not a fix and does not reduce this
ticket's scope; it only stops the defect from spending everyone's attention
while it waits to be explained.

## Non-goals

- No redesign of the accepted goal or memory models, schemas, or actions.
- No removal of the M2-05 or M2-02 recoveries before a root cause is confirmed.
  They are the only thing standing between a user and a silently dead form.
- No new AI, planning, or onboarding behavior.

## Acceptance criteria

1. The cause is identified and recorded, or explicitly recorded as unidentified
   with the hypotheses ruled out and the evidence for each.
2. `/home/plan` and `/home/log` are measured under repeated runs, and the result
   is recorded whether or not it is positive.
3. If a root cause is found and fixed, the per-mutation failure rate is measured
   before and after on at least the goals and memory surfaces.
4. If no root cause is found, the shared recovery is consolidated into one
   correctly named module that is not owned by any single feature, and every
   mutating surface either uses it or records why it does not.
5. No mitigation is removed without evidence that the race is gone.
6. The `--retries=2` stopgap on `Authentication and planning flows` is removed
   if this ticket fixes the race, or is explicitly re-justified in writing if it
   does not. It does not survive by being forgotten.
7. A green continuous-integration run for the reviewed commit.

## Approval gate

The product owner approves the investigation. Tier depends on the outcome: a
measurement-and-report pass is **Tier 3**; consolidating the shared recovery or
changing framework versions is **Tier 2**; anything touching schema,
authorization, or spend stops and re-dispatches as **Tier 1**.
