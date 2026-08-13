# M2-09 validation: App Router transitions intermittently drop a result

**Ticket:** [M2-09](../../backlog/M2/M2-09-APP-ROUTER-LOST-RENDER.md)

**Lifecycle state:** testable — awaiting independent exact-commit review

**Branch:** `ticket/m2-09-app-router-lost-render`

**Base:** `bb5885e83ba4100c6904559c64e59b3fd0dfd125` — the branch point, the
commit that approved the investigation

**Commits, in order:**

| SHA | Purpose |
| --- | --- |
| `e0542eae53a4da414026c74dd4c69741aa3f3abc` | the measurement harness |
| `ea210d76d974e0fe01301ffc7b34b1322b8dab16` | relocate and rename the shared recovery |
| `7a7bce0d219581e79d73435e7436eb831d19e3dc` | re-justify the continuous-integration stopgap (tooling, committed separately) |
| `297d1f49784a77b94d43ef57965a3875880d593a` | count the log navigation and the log save separately |
| `c9f1f7436999676e92376a8ea550584064d4ac1e` | bound the harness so a wedged surface cannot hang a run |

**Review target:** `c9f1f7436999676e92376a8ea550584064d4ac1e` — the branch
head at handoff. Review the range
`bb5885e83ba4100c6904559c64e59b3fd0dfd125..c9f1f7436999676e92376a8ea550584064d4ac1e`
plus the commit that adds this record.

## Summary

**The cause is identified.** It is not in this repository. Every symptom this
ticket collects — a completed `200` whose transition never commits, a segment
that never replaces its loading boundary, controls that stay disabled for ever
— is a defect in the React build that `next@16.2.11` vendors, and it is fixed
upstream in `next@16.3.0`.

Per the agent brief, this ticket **reports that and stops**. No version was
bumped; that is the product owner's decision and needs its own approval and its
own verification. No mitigation was removed, and no speculative fix was layered
on the two that exist.

What is delivered: the diagnosis and its evidence, the two measurements
acceptance criterion 2 asks for, the shared recovery moved out of
`src/features/goals/` into a home no feature owns, and the continuous-
integration stopgap re-justified in writing rather than quietly kept.

## The cause

### 1. This application does not run the React in `package.json`

`package.json` pins `react@19.2.7`, and that copy never reaches the browser.
Next aliases `react$`, `react-dom$` and the flight client to its own vendored
build for every App Router layer — `createVendoredReactAliases` in
`node_modules/next/dist/build/create-compiler-aliases.js`. `next@16.2.11`
vendors **`react@19.3.0-canary-3f0b9e61-20260317`**.

Confirmed against a local production build of this repository at the branch
point: three client chunks under `.next/static/chunks/` contain the string
`19.3.0-canary-3f0b9e61-20260317`, and **zero** contain `19.2.7`.

The consequence is decisive for the remedy: raising `react` and `react-dom` in
`package.json` cannot change the behavior of this defect. Only the `next`
version can.

### 2. Every segment's payload is routed through `useDeferredValue`

`node_modules/next/dist/client/components/layout-router.js:319`:

```js
const rsc = (0, _react.useDeferredValue)(cacheNode.rsc, resolvedPrefetchRsc);
```

`app-router.js:108` does the same for the document head. So a segment's
rendered payload — the prefetched one, the navigated one, and the one a
revalidating server action streams back — reaches the screen only if
`useDeferredValue` catches up to it.

### 3. `useDeferredValue` can stick on the stale value, in production only

[facebook/react#35821](https://github.com/facebook/react/issues/35821), "Bug:
`useDeferredValue` gets stuck with a stale value", opened 2026-02-18 and closed
2026-03-24. The reporter could not simplify the repro "past the 'render some
JSX from server action' repro case", and states: "In dev (`npm run dev`), the
second text area catches up. In prod (`npm run build + npm start`), the second
text area often gets stuck and never catches up."

That is this defect's signature, and it explains the two properties nobody had
accounted for. The dropped payload is complete and already rendered, because
the failure is downstream of everything that produces it. Waiting longer never
helps, because a stuck deferred value has nothing left to arrive.

Fixed by [facebook/react#36134](https://github.com/facebook/react/pull/36134),
"Fix useDeferredValue getting stuck", merged **2026-03-24** — one week after
the canary `next@16.2.11` vendors was cut.

### 4. Upstream closed this repository's exact symptom on that fix

[vercel/next.js#86055](https://github.com/vercel/next.js/issues/86055),
"`useTransition` stuck in loading state when using `router.refresh()` after
calling a server action", team-triaged (`linear: next`), reported against
16.0.1 and reproduced by its reporter on 16.0.2, 16.0.3, 16.0.4 and 16.1.0,
working on 15.4.7. Its incidental findings match this repository's: removing
`loading.tsx` changes the failure, and a page with more content fails more
often.

Closed 2026-07-03 by a React maintainer:

> This must have been fixed by https://github.com/react/react/pull/36134,
> which will go out in 16.3.0. I'm closing because this is also fixed in latest
> `canary`.

A second upstream defect in the same family,
[vercel/next.js#84299](https://github.com/vercel/next.js/issues/84299)
("Transition deadlock when navigating and double calling server action",
labelled `Server Actions`), was closed the same day, fixed by
`vercel/next.js#95391` and "Confirmed this is fixed in `16.3.0-canary.76`".

### 5. The fix is not in the `16.2.x` line at all

Read from the tagged `package.json` of each release:

| `next` | vendored React |
| --- | --- |
| `16.2.11` (this repository) | `19.3.0-canary-3f0b9e61-20260317` |
| `16.2.12` (latest `16.2.x`) | `19.3.0-canary-3f0b9e61-20260317` |
| `16.3.0` (`latest` on npm) | `19.3.0-canary-cbb046ab-20260731` |

Both `16.2.x` releases vendor the canary cut a week **before** the React fix
merged. There is no patch-level escape: the remedy is a minor upgrade to
`next@16.3.0`, which also carries the `#84299` fix.

**This is the product owner's decision and it is not taken here.** It needs its
own ticket: a version bump, a full re-measurement against these numbers, and
only then the removal of the mitigations and the continuous-integration
retries.

## What could not be established

Stated plainly, because the attribution above is strong but not complete.

- **Which upstream defect produced which recorded FitTip occurrence.** Two were
  fixed; both are absent from every `16.2.x` release; both arrive in `16.3.0`.
  The M2-05, M2-02 and M3-02 traces are consistent with `#35821` and were not
  re-run under instrumentation that could separate the two.
- **The reconciler was not stepped through.** The attribution rests on the
  symptom match, on the upstream maintainer's own diagnosis of this exact
  symptom, and on version arithmetic — not on observing the stuck fiber in this
  application. A React-internals repro was not built, because upstream already
  has one and a bisect here could not change the remedy.
- **Nothing was measured on Vercel.** Every rate below is a local production
  build. M2-06's gap on hosted rates is not closed by this ticket.
- **No before/after rate exists**, because nothing was fixed. Acceptance
  criterion 3 is conditional on a fix and does not apply.

## Measurements

Budget declared before running: **250 transitions per surface**, one local
production `build` + `start` on port 3019, one browser context, 390x844. Every
rate carries its denominator. A transition is counted lost when its surface has
not committed within 15 s; M2-06 measured healthy plan transitions at
11–478 ms and stuck ones as never recovering inside 60 s, so nothing sits
between those two outcomes.

| Surface and transition | Lost / attempts | Rate | Committed latency (min / median / p95 / max) |
| --- | --- | --- | --- |
| `/home/plan` client-side navigation | 10 / 250 | 4.00% | 3 / 378 / 394 / 432 ms over 240 samples |
| `/home/log` client-side navigation | 5 / 204 | 2.45% | 3 / 7 / 394 / 422 ms over 199 samples |
| `/home/log` quick-log save (`useActionState`) | 0 / 199 | 0.00% | 188 / 522 / 564 / 2301 ms over 199 samples |

The `/home/plan` figure comes from one run of 250; both `/home/log` figures
come from a second run after the harness was corrected. They are not one
continuous sample and are not presented as one.

The second run was **stopped at attempt 205 of 250**, so the `/home/log`
denominators are 204 and 199, not 250. It stopped making progress with no
further output: the click that opens the quick-log surface had no action
timeout at the time, so a control that never became actionable retried until
the run's own hour-long timeout. Each iteration leaves one more unplanned
actual behind, and by attempt 205 the Today surface carried about 200 of them.
Whether that was the defect on a large payload or an actionability problem
under a fixed overlay was **not diagnosed** — the run was killed and its trace
is gone. The harness now bounds actions and navigations and counts a thrown
iteration as `aborted`, separately from a lost render, so a repeat reports
instead of hanging. The synthetic account the killed run left behind was
deleted by hand and the local auth table verified empty.

### What the numbers say

**`/home/plan` exhibits it**, at 4.00% per navigation. That is the surface
continuous integration has been measuring at roughly one run in five without
anyone reading the measurement, and it is consistent with M2-06's local figure
of roughly 5% per navigation. Every loss ran into the 15 s ceiling; no
committed transition took longer than 432 ms. The distribution has no middle:
a transition commits in well under half a second or it never commits at all,
which is what a dropped commit looks like and is not what a slow render looks
like.

Ten of ten losses were recorded with the loading boundary **not** on screen —
the segment held neither `loading.tsx` nor the plan surface, exactly the empty
shell M2-06 described.

**`/home/log` exhibits it on navigation**, at 2.45% of 204. Arriving at the
quick-log surface is the same segment transition as arriving at the plan
surface and fails the same way — and all five losses ran into the 15 s ceiling
while no committed navigation exceeded 422 ms. The quick-log route has no
`loading.tsx`, so the answer to question 3's `loading.tsx` sub-question is that
a loading boundary is not required for this class; it only changes what the
user is left staring at.

**The `/home/log` save did not fail once in 199.** This is the sharpest
structural result in the run, and it lines up with the mechanism above:

`saveQuickLog` is the **only** mutating action in this application that does
not call `revalidatePath`. Goals, memory, roadmap, the plan proposal, the plan
editor and onboarding all revalidate, so their reply carries a re-rendered
server tree that must pass through `layout-router`'s `useDeferredValue`. The
quick-log reply carries a typed result and nothing else, and never touches that
path.

So the loss is in the **segment-payload path**, not in the action-reply path.
That is consistent with every occurrence this ticket collects — all of them on
surfaces that revalidate — and it is the first evidence anyone has produced
that separates the two. It is not proof: the log save's per-transition sample
is smaller than the rate it would have to detect, and a null result at this
denominator bounds the rate rather than excluding it.

## Every mutating surface, and whether it uses the shared recovery

Acceptance criterion 4.

| Surface | Revalidates | Uses the watchdog |
| --- | --- | --- |
| `/home/you/goals` | yes | yes, both verdicts |
| `/home/you/memory` | yes | yes, both verdicts |
| `/home/plan/roadmap` | yes | lost-render verdict only — a provider call has no honest fixed deadline |
| `/home/plan/proposal` | yes | lost-render verdict only, same reason |
| `/home/plan` (plan editor, activity library) | yes | **no** |
| `/home/you/onboarding` | yes | **no** |
| `/home/log` (quick log) | no | **no** |

The three that do not use it were deliberately left alone. Spreading the
mitigation to a fifth, sixth and seventh surface now — with the cause
identified and the remedy a version bump — would create code whose only future
is to be removed again, and the brief forbids layering further work on top of
the mitigations that exist. `/home/log` additionally measured clean on the save
itself. This is a recorded gap, not a claim that those surfaces are immune:
their navigations demonstrably are not.

## Delivered behavior

Nothing a user can observe changed. The watchdog's timing rules, budgets,
verdicts, notices and recovery reload are byte-for-byte the same behavior at a
new path, and the roadmap surface still takes only the lost-render half.

## Mobile demo path

There is no new surface to demonstrate. To reproduce the measurement at
390x844:

1. `npx.cmd supabase start`, then `npm.cmd run build`.
2. `npm.cmd run start -- -p 3019` with `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from `npx.cmd supabase status`.
3. With `SUPABASE_SERVICE_ROLE_KEY` also set at test runtime only:
   `npx.cmd playwright test --config=e2e/m2-09.playwright.config.ts --workers=1`
   Set `M2_09_PLAN_RUNS` and `M2_09_LOG_RUNS` to bound the run; each defaults
   to 120.
4. Read the `[M2-09] RESULT` lines. Without the service-role key the probe
   skips silently.

The four surfaces that use the watchdog keep their existing acceptance paths;
`e2e/m2-01-goals.spec.ts`, `e2e/m2-02-memory.spec.ts`, `e2e/m3-02-roadmap.spec.ts`
and `e2e/m3-03-plan-proposal.spec.ts` exercise them in continuous integration.

## Changed files

`git diff --stat bb5885e..c9f1f74`, excluding this record and the
`docs/validation/README.md` entry, which are added in the commit that follows:

```
 .github/workflows/ci.yml                           |  22 +-
 e2e/m2-09-lost-render.probe.ts                     | 315 +++++++++++++++++++++
 e2e/m2-09.playwright.config.ts                     |  25 ++
 src/components/goals/goal-manager.test.tsx         |   2 +-
 src/components/goals/goal-manager.tsx              |  14 +-
 src/components/memory/memory-manager.test.tsx      |   2 +-
 src/components/memory/memory-manager.tsx           |  22 +-
 .../plan-proposal/plan-proposal-manager.tsx        |   2 +-
 src/components/roadmap/roadmap-manager.test.tsx    |   2 +-
 src/components/roadmap/roadmap-manager.tsx         |  10 +-
 .../app-router/transition-watchdog.test.ts}        |  22 +-
 .../app-router/transition-watchdog.ts}             |  40 ++-
 12 files changed, 420 insertions(+), 58 deletions(-)
```

- `e2e/m2-09-lost-render.probe.ts` — the measurement harness. It asserts
  nothing about the product and never fails on the defect it counts; it drives
  a surface repeatedly and prints lost/attempts with the committed-latency
  distribution. Named `.probe.ts` deliberately: every other Playwright config
  in this repository matches `*.spec.ts`, so nothing else collects it and no
  continuous-integration step runs it. Hundreds of sequential transitions take
  minutes and this is an investigation, not a gate.
- `e2e/m2-09.playwright.config.ts` — its config: port 3019, pinned `testMatch`,
  390x844, fixed timezone.
- `src/lib/app-router/transition-watchdog.ts` — **renamed** from
  `src/features/goals/mutation-watchdog.ts`. Two identifiers renamed
  (`watchGoalMutation` → `watchTransition`, `GoalMutationWatch` →
  `TransitionWatch`); the four exported constants and `latestActionResponseAt`
  keep their names. No timing rule, budget or verdict changed. The header now
  records the upstream cause and the condition for removing the mitigation.
- `src/lib/app-router/transition-watchdog.test.ts` — **renamed** from
  `src/features/goals/mutation-watchdog.test.ts`; import path and function name
  only.
- `src/features/goals/` — **deleted**; the directory held only those two files.
- `.github/workflows/ci.yml` — comment only, in its own commit. The
  `--retries=2` on `Authentication and planning flows` is unchanged.

The four consumer components change by import path and identifier only, except
for the stale comments in `memory-manager.tsx` and `roadmap-manager.tsx` that
said renaming the module "belongs to a separate ticket" — this is that ticket,
so those two comments were replaced.

## Data, migration, API, privacy, and security effects

None. No schema, migration, policy, grant, RPC, generated type or package
version changed; `package.json` and `package-lock.json` are untouched. No
server action, route handler or authorization path changed. The browser stores
nothing new — the watchdog's session-scoped recovery markers are the same three
keys under their existing names.

The probe uses `SUPABASE_SERVICE_ROLE_KEY` at test runtime only, to create and
delete one disposable confirmed user, exactly as the existing specs do. It
never reaches application code and is never logged or persisted. Both runs
deleted their synthetic account.

## Tests and final results

Continuous integration for the reviewed SHA: **to be recorded by the lead after
the branch is pushed.** That run is the automated-test evidence for lint,
typecheck, `test:run`, `build`, the migration/advisor/pgTAP matrix, the
concurrency harnesses and the 390px browser flows; it is not re-run by hand
here.

What continuous integration cannot produce, run locally:

| Command or check | Result |
| --- | --- |
| `npm.cmd run typecheck` | passed, after each edit |
| `npm.cmd run lint` | passed |
| `npm.cmd run test:run -- src/lib/app-router/transition-watchdog.test.ts src/components/goals/goal-manager.test.tsx src/components/memory/memory-manager.test.tsx src/components/roadmap/roadmap-manager.test.tsx src/architecture` | 7 files, 68 tests passed |
| `npx.cmd prettier --write` on every changed source file | no formatting change beyond the edits |
| `git diff --check` | clean |
| The two 390x844 probe runs above | recorded in "Measurements" |

Tests added or changed: none, beyond moving
`transition-watchdog.test.ts` with its subject and updating its import and the
renamed function. The consolidation is a rename; its behavior is already
covered by that suite plus the three component suites, all of which exercise
the moved module through the surfaces that import it. `src/architecture` was
run because the module crossed a directory boundary.

The measurement harness is not a test and has no assertions to add.

## Known limitations

1. **The defect is not fixed.** It is explained. Users still see an
   unrequested self-reload on the four protected surfaces, and a blank segment
   on the unprotected ones, until `next@16.3.0` is adopted.
2. **The version bump is not done and must not be inferred as approved.** It
   needs its own ticket: bump, re-measure against the rates above, then decide
   about the mitigations and the retries.
3. **Attribution is by symptom, upstream diagnosis and version arithmetic**, not
   by observing the stuck fiber in this application. See "What could not be
   established".
4. **Two upstream defects, one remedy.** Which one produced which historical
   FitTip occurrence is unknown.
5. **Local only.** No hosted rate was measured, on Vercel or anywhere else.
6. **The `/home/log` save's null result bounds the rate; it does not exclude
   one.** A rate below roughly one in the sample size would not have shown up.
7. **The two runs are not one sample.** The first aborted partway into the log
   phase when a lost `/home/log` navigation failed a hard assertion; the
   harness was corrected to count that transition instead, and the log phase
   was re-run. The `/home/plan` figures come from the first run and are
   unaffected.
8. **The probe measures one browser, one machine, one build.** Rates on other
   hardware, and on a shared continuous-integration runner, differ — continuous
   integration sees roughly one run in five where this run saw one navigation
   in twenty-five.
9. **`/home/plan`'s own mutations were not measured**, only arrival at it. The
   plan editor saves through `useTransition` + `router.refresh()`, which is
   `#86055`'s exact shape; it is unmeasured and unprotected.
10. **No mitigation was removed** and the `--retries=2` stopgap stays, both
    deliberately, per acceptance criteria 5 and 6.

## Independent reviewer checklist

Review commit `c9f1f7436999676e92376a8ea550584064d4ac1e` on
`ticket/m2-09-app-router-lost-render`, diff range
`bb5885e83ba4100c6904559c64e59b3fd0dfd125..c9f1f7436999676e92376a8ea550584064d4ac1e`. Confirm the continuous-
integration run for that exact SHA is green; do not re-run its suites.

Judgment this record needs and continuous integration cannot supply:

1. **The consolidation is a move, not a redesign.** `git show -M ea210d76` puts
   the rename side by side; confirm that only the two goal-specific
   identifiers and the prose changed — no budget, threshold, comparison or
   verdict. The whole-range diff does not detect the rename, because the
   delete and the add are in the same commit but `git diff bb5885e..HEAD`
   spans four.
2. **The roadmap surface still takes only the lost-render half.** Confirm
   `roadmap-manager.tsx` imports no confirmation budget and that
   `useLostRenderRecovery` is unchanged in behavior. A provider call must not
   acquire a ten-second deadline through this move.
3. **No mitigation weakened.** Four surfaces still detect and recover; the
   notices still claim only that a reply arrived and never rendered, never that
   a change saved.
4. **The upstream claim is checkable.** The three facts that carry it are
   `create-compiler-aliases.js` aliasing `react$` to the vendored build,
   `layout-router.js:319` deferring `cacheNode.rsc`, and the vendored React
   canary dates in the `16.2.x` versus `16.3.0` tags. If any of those is wrong,
   the diagnosis is wrong.
5. **The measurements carry their denominators** and the two runs are not
   presented as one sample.
6. **Criterion 6 is satisfied by re-justification, not by silence.** The
   `.github/workflows/ci.yml` comment must state what would have to change for
   the retries to be removed.
7. **Nothing here bumps a framework version** or touches schema, authorization,
   privacy or spend.
