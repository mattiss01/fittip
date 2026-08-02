# M2-09: App Router transitions intermittently drop a mutation result

**Status:** proposed — not approved for implementation

**Milestone:** M2 — goals, editable coaching context, and guided onboarding

**Priority:** P1

**Owning accepted work:** [M2-05 intermittent goal mutations](M2-05-INTERMITTENT-GOAL-MUTATIONS.md)

**Depends on:** nothing

**Source:** recorded as a known limitation by
[M2-05](../../validation/M2/M2-05-VALIDATION.md#known-limitations) on 31 July
2026, which asked for exactly this ticket; confirmed on a second surface by the
M2-02 builder on 2 August 2026

**Blocks:** nothing today. Every surface that mutates data will keep paying a
per-ticket mitigation tax until it is understood.

## Observed behavior

A server action returns `200` with a complete, correct body, and the App Router
transition carrying that result never commits. The surface stays in its
pre-submit state with controls disabled, and without a mitigation the user sees
a form that silently did nothing.

Two surfaces have now measured it directly.

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
  is now imported by the memory surface, so a module named for goals is
  load-bearing for a second feature. Its name is wrong and its home is wrong,
  but renaming it touches M2-05's accepted code and so keeps being deferred.
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
6. A green continuous-integration run for the reviewed commit.

## Approval gate

The product owner approves the investigation. Tier depends on the outcome: a
measurement-and-report pass is **Tier 3**; consolidating the shared recovery or
changing framework versions is **Tier 2**; anything touching schema,
authorization, or spend stops and re-dispatches as **Tier 1**.
