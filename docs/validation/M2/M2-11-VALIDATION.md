# M2-11 validation: upgrade to `next@16.3.0` and re-measure the lost render

**Ticket:** [M2-11](../../backlog/M2/M2-11-NEXT-16-3-0-UPGRADE.md)

**Lifecycle state:** accepted — product owner accepted exact independently
reviewed commit `7585f1f` on 13 August 2026

**Branch:** `ticket/m2-11-next-16-3-0-upgrade`

**Base:** `843c06bd` — the commit that approved the upgrade and added the agent
brief

**Commits, in order:** recorded in "Changed files" below.

## The before measurements, taken before anything was upgraded

This section is written and committed **before** the `next` pin is touched, so
the pre-upgrade figures cannot be revised once the after figures are known.

Apparatus: `e2e/m2-09-lost-render.probe.ts` on
`e2e/m2-09.playwright.config.ts`, port 3019, one local production `build` +
`start`, one browser context, 390x844, `Europe/Berlin`, 15-second commit
budget. Harness commit `fe6e9f38`, which is M2-09's reviewed harness plus the
appended plan-editor-save phase and nothing else.

Declared budget, before running: **250 transitions per surface**, one run.
Actual cost: one run, 27.5 minutes wall clock.

| Transition | Lost / attempts | Rate | Committed latency (min / median / p95 / max) |
| --- | --- | --- | --- |
| `/home/plan` client-side navigation | 9 / 250 | 3.60% | 2 / 372 / 391 / 401 ms over 241 samples |
| `/home/log` client-side navigation | 2 / 250 | 0.80% | 2 / 6 / 388 / 399 ms over 199 samples |
| `/home/log` quick-log save | 0 / 199 | 0.00% | 378 / 521 / 557 / 1615 ms over 199 samples |
| `/home/plan` editor save | 0 / 250 | 0.00% | 140 / 167 / 197 / 2963 ms over 250 samples |

Every figure above is a `[M2-09] RESULT` line printed by the probe's own
`report()`. None was hand-computed. That is a difference from M2-09, where the
two `/home/log` rows were recovered by hand from per-iteration lines because
the run was killed before `report()` ran.

### This run is the control the after-measurement needs

`/home/plan` navigation was measured at **3.60% (9/250)** here against M2-09's
**4.00% (10/250)**. One fewer loss in the same 250. The defect therefore still
reproduces on this machine, on this build, today, at the rate M2-09 recorded —
so an after-measurement of zero on the same apparatus is attributable to the
change rather than to a machine that had stopped exhibiting the defect. Without
this control an after figure of zero would prove nothing.

All nine losses ran into the 15-second ceiling; no committed navigation
exceeded 401 ms. Nine of nine were recorded with the loading boundary **not**
on screen, matching M2-09's ten of ten.

### The `/home/log` navigation denominator, stated honestly

The printed rate is 2 lost / 250, but 49 of those 250 attempts were `aborted`,
not measured. The aborts are contiguous: attempts 1–201 all returned a
measurement, and attempts 202–250 all aborted with
`locator.click: Timeout 20000ms exceeded` on the "Log unplanned" link.

That is the same stall M2-09 hit at attempt 205, for the same reason — each
iteration leaves one more unplanned actual on the Today surface, and past
roughly 200 the link stops becoming actionable inside the budget. M2-09 was
killed by it; the bounded action timeout its reviewer added turns it into
counted aborts instead, which is the harness working as intended.

So the honest comparison to M2-09's 5 / 204 is **2 lost / 201 measured
attempts, 1.00%**, not 2 / 250. Both denominators are given wherever this row
appears.

### `/home/plan`'s own save exhibits nothing before the upgrade

This is the first measurement of this transition; M2-09 recorded it as
limitation 9 and left it unmeasured. **0 lost / 250, 0.00%.**

That result is load-bearing for what this ticket can claim, and it points the
opposite way from the expectation in the ticket. `/home/plan`'s save is
`useTransition` + `router.refresh()` — `#86055`'s exact reported shape — and it
did not fail once in 250 attempts on the pre-fix build. Whatever the after
figure turns out to be, this transition cannot supply evidence that the upgrade
fixed anything, because there was nothing to fix at this denominator.

Its distribution also differs from the navigation's: a 167 ms median with a
197 ms p95 and one 2963 ms outlier that still committed. Nothing sits near the
15-second ceiling.

The measured plan carries **no sessions** — the probe alternates the horizon
between 6 and 7 days to make each iteration a genuine change, and saves an
otherwise empty plan. `#86055` reports that a page with more content fails more
often, so this null result bounds the rate for a minimal payload and does not
exclude one for a full plan. Recorded as a known limitation rather than
resolved.

## The after measurements

Same apparatus, same denominators, same machine, same session. `next@16.3.0`,
harness commit `fe6e9f38` unchanged, application code unchanged. One run,
26.2 minutes wall clock.

| Transition | Before — `16.2.11` | After — `16.3.0` |
| --- | --- | --- |
| `/home/plan` client-side navigation | 9 / 250 — 3.60% | **0 / 250 — 0.00%** |
| `/home/log` client-side navigation | 2 / 250 — 0.80% (2 / 201 measured — 1.00%) | **0 / 250 — 0.00% (0 / 199 measured)** |
| `/home/log` quick-log save | 0 / 199 — 0.00% | 0 / 199 — 0.00% |
| `/home/plan` editor save | 0 / 250 — 0.00% | 0 / 250 — 0.00% |

Committed latency after the upgrade (min / median / p95 / max):

| Transition | Latency | Samples |
| --- | --- | --- |
| `/home/plan` navigation | 4 / 10 / 387 / 406 ms | 250 |
| `/home/log` navigation | 5 / 386 / 404 / 419 ms | 199 |
| `/home/log` quick-log save | 403 / 549 / 1604 / 1665 ms | 199 |
| `/home/plan` editor save | 136 / 170 / 229 / 479 ms | 250 |

All four figures are `[M2-09] RESULT` lines from the probe's own `report()`.
The run completed; nothing was hand-computed and nothing was recovered from
per-iteration lines.

### The hypothesis held

The ticket put one falsifiable claim under test: `next@16.3.0` takes
`/home/plan` navigation from a floor of 4.00% to zero. **It did.** Zero losses
in 250 transitions, on the apparatus that recorded nine in 250 on the same
machine roughly an hour earlier, and ten in 250 when M2-09 measured it.

`/home/log` navigation moved with it, from 2 / 201 measured to 0 / 199. That
is the second surface M2-09 identified as exhibiting the same segment
transition, and it is now clean at its own denominator.

Neither result is proof that the rate is exactly zero. A null result at 250
bounds the rate; it does not exclude one below roughly one in 250. What
carries the conclusion is the paired design: the same harness, machine, build
pipeline and session produced 9 / 250 before and 0 / 250 after, with the only
change being the vendored React build.

### What did not move, and why that is not evidence of a fix

Two of the four transitions were already at zero before the upgrade and are
still at zero after it. They contribute nothing to the case that the upgrade
fixed anything, and they are not presented as if they did.

- **`/home/log` quick-log save**: 0 / 199 before, 0 / 199 after. Consistent
  with M2-09's structural finding that `saveQuickLog` is the one mutating
  action that does not `revalidatePath`, so its reply never passes through
  `layout-router`'s `useDeferredValue`.
- **`/home/plan` editor save**: 0 / 250 before, 0 / 250 after. This is the
  transition the ticket expected to be most exposed, being `#86055`'s exact
  shape. It was not exposed at this denominator on the pre-fix build.

### An unclaimed observation about latency

`/home/plan` navigation's committed-latency median moved from 372 ms to 10 ms,
while `/home/log` navigation's moved the other way, from 6 ms to 386 ms. Both
distributions still span the same 4–420 ms range, and both remain two orders
of magnitude below the 15-second ceiling that separates committed from lost,
so neither shift affects a single classification.

These look like changes in when the router serves a prefetched segment rather
than a rendered one. That is a guess, it was not investigated, and no
conclusion in this record depends on it. It is written down because it is
visible in the data and a reader would otherwise wonder whether it was noticed.

### Both runs' aborts, and why they are not losses

The `/home/log` phase aborts in both runs for the reason M2-09 diagnosed: each
iteration leaves one more unplanned actual on the Today surface, and past
roughly 200 the "Log unplanned" link stops becoming actionable inside the
20-second action budget.

| Run | Measured before the stall | Aborted |
| --- | --- | --- |
| Before, `16.2.11` | 201 | 49 |
| After, `16.3.0` | 199 | 51 |

The stall onset is essentially identical across the upgrade, which is what a
harness limitation rather than a product behavior should look like. Every
abort in both runs is a `locator.click: Timeout 20000ms exceeded` on that link;
no abort in either run was a navigation or a save.

### Why these numbers should be believed

The before figures were written into this record and committed as `91ba7a9e`
**before** the `next` pin was touched. At that moment the after figures did not
exist and could not be guessed. No before figure in this record has been edited
since; the commit history shows it.

That ordering is the reason a reader should trust the comparison, and it was
the point of taking the upgrade as a separate ticket from M2-09. The one
number the whole ticket turns on — 9 lost of 250 on the pre-fix build — was
recorded by an agent that did not yet know whether the after would be zero.

## Mitigation decisions — acceptance criterion 6

M2-09's criterion 5 stands: no mitigation is removed without a measurement
behind it, and a surface whose rate was never measured keeps its recovery
whatever the other surfaces show.

**One mitigation was removed. Every application-side mitigation stays.**
`src/` is untouched across this ticket's entire commit range.

| Mitigation | Decision | The measurement, or the absence of one |
| --- | --- | --- |
| `--retries=2` on CI's `Authentication and planning flows` | **removed**, `8cc53f0f` | `planning.spec.ts` opens `/home/plan` through the transition this ticket measured at 9 / 250 before and 0 / 250 after |
| `transition-watchdog` on `/home/you/goals` | kept | never measured, on either build |
| `transition-watchdog` on `/home/you/memory` | kept | never measured, on either build |
| `transition-watchdog` lost-render half on `/home/plan/roadmap` | kept | never measured, on either build |
| `transition-watchdog` lost-render half on `/home/plan/proposal` | kept | never measured, on either build |

### Why a clean navigation number does not license removing the watchdog

This is the distinction the ticket is most likely to be got wrong on, so it is
written out rather than left implicit.

What was measured is **arrival at a segment** on `/home/plan` and `/home/log`,
plus two **saves** on `/home/log` and `/home/plan`. What the watchdog protects
is something else: the **mutation reply** on goals, memory, roadmap and the
plan proposal — a `useActionState` or `useTransition` submission whose
revalidated tree must commit before the surface stops looking frozen.

Those are not two descriptions of one transition, and the code settles it
rather than the prose. `watchTransition` is armed by `submittedAt`,
`respondedAt` and `consumedAt`: it can only reach a verdict about a submission
that is outstanding, and it has no input by which a navigation could even
register. **It structurally cannot fire on a segment arrival.** So the four
kept surfaces are not merely unmeasured — they are a different transition
class, and a clean navigation figure is not a weak signal about them but no
signal at all.

Those four surfaces produced no number on `16.2.11` and no number on `16.3.0`.
M2-09 did not measure them and neither did this ticket. The mechanism argues
they are the same class — they all `revalidatePath`, so their replies all pass
through `layout-router`'s `useDeferredValue`, and the upstream fix should reach
them identically. But an argument from mechanism is exactly what criterion 6
refuses to accept in place of a measurement, and it is what M2-09 already
supplied. Removing four surfaces' recovery on it would be inferring the result
this ticket exists to observe.

So they keep it. The cost of that decision is bounded and visible: some code
whose only future is to be deleted, on four surfaces where the reload it
triggers should now never fire. The cost of the other decision is a user
losing a saved goal to a silently dead form.

### What would license removing them later

A ticket that measures those four surfaces' own mutation replies on `16.3.0`,
at a denominator comparable to this one, and finds zero. That is a
straightforward extension of `e2e/m2-09-lost-render.probe.ts` — a fifth,
sixth, seventh and eighth phase — and it is deliberately not done here,
because measuring four more surfaces is not the ticket that was dispatched.

A cheaper, weaker signal is already accruing: the watchdog fires a visible
recovery reload, and CI's `m2-01`, `m2-02`, `m3-02` and `m3-03` browser flows
exercise all four surfaces on every push. A run of those flows that never
recovers is evidence, just not measured evidence.

### The CI retry removal, and the limit of what justifies it

Criterion 7 asked for removal-if-supported or re-justification in writing.
It is removed, and the honest scope of the justification is this:

The paired local measurement is strong for the transition and weak for the
runner. M2-09 recorded that CI saw this defect in roughly one run in five,
far above the 4% per navigation measured locally, on hardware nobody here
controls. A single green CI run for this commit is therefore consistent with
the removal being safe without establishing it — at the historical rate, one
clean run would happen about four times in five by chance even if nothing had
been fixed.

What carries the removal is the 250-transition paired measurement **together
with the mechanism behind it**, not the one CI run. The distinction matters:
the change is a fixed defect in the vendored React build, not a probabilistic
improvement that a runner's timing could undo. A rate that moved for a known
reason generalises to other hardware in a way that a rate which merely
improved would not. The local figure is the evidence that the fix reached this
application; the fix itself is why it should hold on a runner nobody here
controls.

If that step reddens on the plan surface after this lands, the correct
response is to restore `--retries=2` and re-open the removal, not to re-open
M2-09's diagnosis.

### Criterion 8's flaky count, and why the after figure has to be read carefully

Removing the retries changes what CI can report. With `--retries=2`, an
occurrence of this defect surfaced as `flaky`; without them it is a hard
failure. Both configurations still detect an occurrence — a green run without
retries means the same thing a zero-flaky run with retries would have meant —
but the word `flaky` will not appear for this step again whatever happens, so
a future reader must not read its absence as the measurement.

Before, from M2-09's record: seven of thirty-five runs red on the plan
transition, and the retry count accruing as the running measurement. After: to
be read from the CI run for this branch's head, which the lead records below.

## Delivered behavior

Users of the four watchdog surfaces should stop seeing the unrequested
self-reload the watchdog performs, because the race that triggers it is fixed
upstream — but nothing in this ticket changes what happens if it fires, and
that claim is inference, not measurement. See the mitigation section.

What is measured: arriving at `/home/plan` and `/home/log` no longer
intermittently leaves an empty shell or a stale surface. On the pre-fix build
that happened to roughly one navigation in twenty-eight; in 250 attempts each
after the upgrade it did not happen at all.

No surface changed shape, copy, layout or interaction. `src/` is untouched.

## Mobile demo path

There is no new surface to demonstrate. To reproduce either measurement at
390x844:

1. `npx.cmd supabase start`.
2. Build and serve with the local coordinates in the environment — this
   repository has no committed `.env.local`, and `NEXT_PUBLIC_*` values are
   inlined into the client bundle at build time, so they must be set for
   `build`, not only for `start`:

   ```
   NEXT_PUBLIC_SUPABASE_URL=<from npx.cmd supabase status>
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<sb_publishable_... from the same>
   npm.cmd run build
   npm.cmd run start -- -p 3019
   ```

3. With `SUPABASE_SERVICE_ROLE_KEY` also set at test runtime only:

   ```
   npx.cmd playwright test --config=e2e/m2-09.playwright.config.ts --workers=1
   ```

   `M2_09_PLAN_RUNS`, `M2_09_LOG_RUNS` and `M2_09_PLAN_SAVE_RUNS` bound each
   phase and each default to 120. Both runs in this record used 250. Setting a
   phase to 0 skips it, which is how a single transition can be re-measured
   without paying for the others.

4. Read the four `[M2-09] RESULT` lines. Without the service-role key the
   probe skips silently.

A run takes about 26 minutes at 250 per phase, most of it the `/home/log`
phase's aborts. The whole `/home/plan` editor-save phase costs about four
minutes.

**The six screenshots** under `docs/validation/M2/evidence/` were produced
against the same `build` + `start` on port 3019, at 390x844 in
`Europe/Berlin`, by a throwaway Playwright spec that is deliberately not
committed: it signs a disposable confirmed user in, visits
`/home/you/goals`, `/home/you/memory`, `/home/plan/roadmap`,
`/home/plan/proposal`, `/home/plan` and `/home/today`, waits for
`networkidle`, screenshots each, and asserts nothing. It compares
`document.documentElement.scrollWidth` against `clientWidth` for horizontal
overflow and collects `console` errors and `pageerror` events, then deletes
the user. It is not committed because it is an observational one-off for a
framework upgrade, not a flow this repository should keep running; every
surface it visits already has a committed CI flow.

## Changed files

`git diff --stat 843c06b..f2d49ea`:

```
 .github/workflows/ci.yml                           |  47 +-
 docs/backlog/M2/M2-11-NEXT-16-3-0-UPGRADE.md       |   6 +-
 docs/validation/M2/M2-11-VALIDATION.md             | 596 +++++++++++++++++++++
 .../validation/M2/evidence/M2-11-goals-390x844.png | Bin 0 -> 40899 bytes
 .../M2/evidence/M2-11-memory-390x844.png           | Bin 0 -> 34031 bytes
 .../M2/evidence/M2-11-plan-editor-390x844.png      | Bin 0 -> 45646 bytes
 .../M2/evidence/M2-11-plan-proposal-390x844.png    | Bin 0 -> 41619 bytes
 .../M2/evidence/M2-11-roadmap-390x844.png          | Bin 0 -> 38403 bytes
 .../validation/M2/evidence/M2-11-today-390x844.png | Bin 0 -> 48049 bytes
 docs/validation/README.md                          |   5 +
 e2e/m2-09-lost-render.probe.ts                     |  92 ++++
 package-lock.json                                  | 417 +++++++-------
 package.json                                       |   2 +-
 src/lib/app-router/transition-watchdog.ts          |  27 +-
 14 files changed, 957 insertions(+), 235 deletions(-)
```

That stat is taken at `f2d49ea`, the last commit before this section was
corrected, so its line count for this record is lower than the file's final
length. The only file the following commit touches is this record.

Excluding `docs/`, the whole ticket is five files:
`.github/workflows/ci.yml`, `e2e/m2-09-lost-render.probe.ts`,
`package.json`, `package-lock.json`, and
`src/lib/app-router/transition-watchdog.ts`.

Commits, in order:

| SHA | Purpose |
| --- | --- |
| `fe6e9f358f95c76d804c4a7483a65985bb6f61a7` | the plan-editor-save phase on M2-09's probe |
| `91ba7a9e85920dc6080964a69dedf8d7df07107e` | the before measurements, committed pre-upgrade |
| `8910ed03d900a181382e9db8b279e5d6d0821b46` | `next` 16.2.11 → 16.3.0 |
| `60698af886b9d8f88c00fea2cdd38d9728899653` | the after measurements |
| `8cc53f0fdf945b111c33331e383e70407143b76f` | the CI retry stopgap, removed (tooling, committed separately) |
| `37199a1cfefecd3596d525701a56368e07db1fa8` | the 390x844 evidence |
| `6476ac6e28d61e33ef9f8fea4270c3ca91865e46` | the mitigation decisions |
| `cf98ec1fde8a55735fd4f2852fcfab22b4d5c2f6` | the manifest, effects, limitations and reviewer checklist |
| `87643249f77722ebb24a422e35454e2ba007eea6` | the ticket to `testable` |

**After independent review**, which returned approved with no blocking
findings, four corrections:

| SHA | Correction |
| --- | --- |
| `6f0664f5b230b0d299475cc4fe6695058364b46a` | `ci.yml`: restore the retry-scoping norm the rewrite dropped (tooling, committed separately) |
| `4741e78bbbc818c4912b30d52477a3e8db758fcc` | `transition-watchdog.ts`: the header stated the opposite of the truth after the bump |
| `f2d49eaf71dc5a1e4c4c2a6548e6bf609e9f175b` | the retention argument, the plan-save null's second bound, and one over-claiming sentence |
| this commit | the manifest, which did not cover the full reviewed range |

None of the four changes a measured value, a rate, a denominator or a
mitigation decision.

Nothing was deleted or renamed. No file's purpose is obscure from its path
except:

- `e2e/m2-09-lost-render.probe.ts` — M2-09's harness, extended by one appended
  phase and a header paragraph. The three existing phases are byte-identical
  and still run first, in their original order, so their rates stay comparable
  to M2-09's. This is the file the reviewer should read most carefully, because
  a change to an existing measurement function would silently invalidate the
  comparison this whole ticket rests on.
- `src/lib/app-router/transition-watchdog.ts` — **comment only**, and the only
  `src/` file this ticket touches. Its header asserted that the repository did
  not run `next@16.3.0` and that the watchdog must not be removed before it
  did; both became false at `8910ed0`. No timing rule, budget, threshold,
  comparison or verdict changed. Verify with
  `git diff 843c06b..HEAD -- src/` — every changed line is inside the leading
  block comment.
- `docs/validation/README.md` — the index entry this record is required to
  have.
- `docs/backlog/M2/M2-11-NEXT-16-3-0-UPGRADE.md` — the `Status:` line moved
  from `in development` to `testable`. No acceptance criterion, constraint or
  brief line was edited.

## Data, migration, API, privacy, and security effects

No schema, migration, policy, grant, RPC or generated type changed. No server
action, route handler or authorization path changed. `src/` is untouched. The
browser stores nothing new.

Package changes, which are the only supply-chain surface here. The npm install
summary's "111 packages added" counts per-platform optional binaries; the
lockfile's actual delta is two packages added, one removed, 36 versions
changed:

| Package | Change | Why |
| --- | --- | --- |
| `next` | 16.2.11 → 16.3.0 | the ticket |
| `@next/env`, `@next/swc-*` (8 platforms) | 16.2.11 → 16.3.0 | `next`'s own pinned binaries |
| `sharp` and `@img/sharp-*` (24 platforms) | 0.34.5 → 0.35.3 | transitive through `next`; two new wasm platform packages appear |
| `postcss` | 8.5.22 → 8.5.23 | transitive through `next` |

`react`, `react-dom` and `@types/react` are unchanged at `19.2.7`.

High-severity npm advisories drop from **6 to 3**. The `next`, `sharp` and
`postcss` advisories are resolved by this bump; `brace-expansion`, `js-yaml`
and `nanoid` remain and are unrelated to it, transitive through the toolchain,
and untouched by this ticket.

The probe and the screenshot pass each use `SUPABASE_SERVICE_ROLE_KEY` at test
runtime only, to create and delete one disposable confirmed user, exactly as
the existing specs do. It never reaches application code and is never logged or
persisted. Both runs deleted their own account; `auth.users` was verified empty
after each.

## Tests and final results

Continuous integration for the reviewed SHA: **to be recorded by the lead after
the branch is pushed.** That run is the automated-test evidence for lint,
typecheck, `test:run`, `build`, the migration/advisor/pgTAP matrix, the
concurrency harnesses and the 390px browser flows.

It matters more than usual on this ticket. A minor framework upgrade changes
every runtime surface, and the browser job is the only place the four watchdog
surfaces, onboarding, progress and the auth flows are exercised end to end
against `16.3.0`.

What CI cannot produce, run locally:

| Command or check | Result |
| --- | --- |
| Vendored-React check on the built chunks | 3 chunks carry `19.3.0-canary-cbb046ab-20260731`, 0 carry `19.2.7` |
| The two 390x844 probe runs | recorded above; 27.5 min before, 26.2 min after |
| The 390x844 screenshot pass over six surfaces | no horizontal overflow, no console error, no page error |
| `npm.cmd run typecheck` | passed on `16.3.0` |
| `npm.cmd run lint` | passed on `16.3.0` |
| `npm.cmd run test:run` | 78 files, 816 tests passed on `16.3.0` |
| `npm.cmd run build` | passed on `16.3.0` |
| `git diff --check` | clean |
| `auth.users` after each run | empty |

The full Vitest suite was run once by hand despite the usual rule against it,
because a framework upgrade's blast radius is the whole application and
"the narrow tests your change touches" has no smaller honest reading here. It
is not offered as the evidence; the CI run is.

Tests added or changed: one appended phase in `e2e/m2-09-lost-render.probe.ts`,
which is a measurement harness and not a test — it asserts nothing about the
product and cannot fail on the defect it counts. No unit or component test was
added or changed, because no application code changed.

## Known limitations

1. **A null result at 250 bounds the rate; it does not prove zero.** A residual
   rate below roughly one in 250 would not have shown up in either after
   figure.
2. **Local only.** One machine, one browser, one build, one session. Nothing
   was measured on Vercel or on a CI runner, so M2-06's and M2-09's gap on
   hosted rates is still open. This matters specifically for the CI retry
   removal, where the historical rate was far higher than the local one.
3. **The four watchdog surfaces were not measured, on either build.** Their
   mitigations are kept for that reason. This ticket's clean navigation
   numbers are not evidence about them — `watchTransition` cannot fire on a
   navigation at all, so they are a different transition class rather than a
   related one.
4. **`/home/plan`'s editor save was already zero before the upgrade**, so it
   supplies no before/after signal. Criterion 4 is satisfied by measuring it
   twice, not by it showing an improvement.
5. **That save's null result is bounded on two axes, and both matter because
   criterion 4 exists to test `#86055`'s shape.**
   - *Payload.* The measured plan carries no sessions. `#86055` reports that a
     page with more content fails more often, so the null bounds the rate for a
     minimal payload. A full seven-day plan with sessions and activities was
     not measured.
   - *Client warmth.* Every iteration begins `page.goto("/home/plan")`, so
     every measured save was the first client transition after a fresh
     hydration on a cold router cache. `#86055` concerns saves on a **warm**
     client, where a segment has already been navigated to and cached. A
     repeated save without an intervening document load was never measured.

   Either bound alone is enough reason not to read the pre-upgrade 0/250 as
   "this surface does not exhibit the defect". The honest reading is that this
   surface did not exhibit it *under these two preconditions*.

   **This does not weaken the navigation figures.** `measurePlanNavigation`
   starts from a fresh document too — `page.goto("/home/today")`, then a
   `next/link` click — and it still reproduced the defect at 3.60% before the
   upgrade. So a fresh document is demonstrably not a precondition that
   suppresses this class; it just happens to be the one under which the save
   was measured.
6. **The `/home/log` navigation denominator is 201 before and 199 after**, not
   250. The remaining attempts aborted on the accumulated-actuals stall that
   M2-09 first hit. The rate is reported both ways wherever it appears.
7. **Both navigation rates remain floors, not two-sided estimates**, for
   M2-09's reason: the probe's clock starts after the URL assertion, which
   runs on a 5-second budget, so a transition that stalled before the URL
   changed would count as `aborted` rather than `lost`. Neither run recorded a
   navigation abort, so nothing was actually lost this way.
8. **The test-versus-production React divergence is not closed and cannot be.**
   The Vitest component suite runs against the pinned `react@19.2.7`; the
   browser runs `19.3.0-canary-cbb046ab-20260731`, which Next aliases in.
   Verified in the upgraded tree rather than taken from the ticket: npm's
   `react` `latest` is `19.2.8`, every `19.3.0` entry in the registry is a
   canary, and `next@16.3.0`'s peer range is
   `^18.2.0 || 19.0.0-rc-de68d2f4-20241204 || ^19.0.0`, which accepts `19.2.7`
   unchanged. No available stable pin brings the `useDeferredValue` fix to the
   suite. This closes when React 19.3 ships stable, which is not this ticket's
   event to wait for.
9. **The latency shifts on both navigations are unexplained** and deliberately
   uninvestigated. See "An unclaimed observation about latency".
10. **`sharp` moved a minor version** as a transitive dependency. This
    application does not use `next/image`, and nothing in the diff touches
    image handling, but the bump is real and was not separately exercised.
11. **The local Node version is `22.14.0` while the repository requires
    `>=24.18.0 <25`** and `.nvmrc` pins `24.18.0`. Every local result in this
    record was produced on 22.14.0, and `npm install` warned `EBADENGINE`
    accordingly. This predates the ticket and is not caused by it — the engines
    field and `.nvmrc` are unchanged — but it means CI, which uses `.nvmrc`,
    runs a different Node than every figure above was measured on.
12. **The screenshot spec is not committed.** Its behavior is described in
    "Mobile demo path" precisely enough to rebuild, but it cannot be re-run
    from this repository as-is.
13. **The upgrade was not exercised against a hosted database or a Preview**
    by the builder. That is the lead's step and this record does not claim it.

## Independent reviewer checklist

Review the branch head on `ticket/m2-11-next-16-3-0-upgrade`, diff range
`843c06bd..<head>`. The first review covered `843c06b..8764324` and returned
approved; the four post-review corrections above are what a re-review needs to
cover, and under AGENTS.md they invalidate approval of `8764324` until then.
Confirm the CI run for the exact head SHA is green; do not re-run its suites.

Judgment this record needs and continuous integration cannot supply:

1. **The three M2-09 measurement functions are unchanged.** This is the single
   most load-bearing check. Diff `e2e/m2-09-lost-render.probe.ts` across the
   range; it must show additions only — a header paragraph, one constant, one
   dialog handler, one loop, one `report()` call and `measurePlanSave`. If
   `measurePlanNavigation`, `measureQuickLogArrival`, `measureQuickLogSave`,
   `COMMIT_BUDGET_MS`, `record`, `report` or the config changed in any way,
   the before/after comparison is between two different instruments and the
   ticket's conclusion does not follow.
2. **The before figures predate the upgrade in the commit history.** `91ba7a9e`
   must contain every before figure, and `8910ed03` — the pin change — must
   come after it. Confirm no later commit edits a before figure:
   `git log -p 91ba7a9e..HEAD -- docs/validation/M2/M2-11-VALIDATION.md`
   should show the before table only as unchanged context.
3. **No mitigation was removed without a number, and none was kept without a
   reason.** `git diff 843c06b..HEAD -- src/` must touch exactly one file and,
   within it, only the leading block comment — no timing rule, budget,
   threshold, comparison or verdict. The one behavioral removal is in
   `.github/workflows/ci.yml` alone. Judge whether the transition that
   `planning.spec.ts` exercises really is the one measured at 9/250 → 0/250 —
   if it is not, that removal is unjustified.
4. **The kept mitigations are kept for the right reason.** The record's claim
   is that goals, memory, roadmap and plan-proposal mutation replies were never
   measured. Confirm that from M2-09's record and this one, rather than from
   the prose here.
5. **The vendored-React claim is checkable and was not taken from the version
   number.** Build the tree and confirm client chunks under
   `.next/static/chunks/` contain `19.3.0-canary-cbb046ab-20260731` and none
   contains `19.2.7`. That canary was cut 31 July 2026; React PR 36134 merged
   24 March 2026. If the built canary predates the fix, criterion 1 fails
   whatever `package.json` says.
6. **The React pins really are unchanged and really cannot help.** `19.2.7` in
   `package.json` for all three, and npm's `react@latest` still on the 19.2
   line.
7. **The lockfile delta is only what the record claims.** `next`, its SWC
   binaries, `sharp`, `postcss` — nothing else, and no new direct dependency.
8. **The null results are presented as null.** The two saves were zero on both
   builds; confirm the record nowhere counts them as corroboration that the
   upgrade fixed something.
9. **Nothing here touches schema, authorization, privacy or spend.** No
   migration, no policy, no AI provider call. The screenshot pass pressed no
   control that could reach a provider.
10. **The 390px judgment is the product owner's, not CI's and not this
    record's.** The six screenshots attest that six surfaces render without
    overflow or console errors on `16.3.0`; they do not attest that anything
    looks or feels right.

## Criterion 8, the independent review, and the lead's hosted gates — 13 August 2026

### Criterion 8: the continuous-integration runs, and what the flaky count now means

Both runs on the ticket branch are green, and neither claims an exception:

| Commit | Run | Result |
| --- | --- | --- |
| `8764324` — the reviewed implementation | [31725108592](https://github.com/mattiss01/fittip/actions/runs/31725108592) | green |
| `7585f1f` — the four post-review corrections | [31740289410](https://github.com/mattiss01/fittip/actions/runs/31740289410) | green |

**The post-removal flaky reading: zero, across both runs.** The string `flaky`
does not appear anywhere in either run's log, and no retry was attempted,
because `--retries=2` no longer exists on the step. The Vitest suite reports 78
files / 816 tests.

That reading has to be stated carefully, and this record already explains why:
before the removal, `flaky` was the signal that a run had failed and recovered,
so its absence was informative. After the removal there is no retry, so a
recovered run is impossible and the word cannot appear whatever happens. The
measurement has changed instrument. What "zero flaky" now means is only that
the step passed on its first and only attempt, twice.

**Two green runs is weak evidence, and is not what carries the removal.** At the
historical rate M2-09 measured — seven red in thirty-five runs, about one in
five — two consecutive clean runs would occur roughly 64% of the time by chance
even if nothing had been fixed. The removal rests on the local paired
measurement of 9/250 against 0/250 and on the upstream mechanism, exactly as the
mitigation section and `.github/workflows/ci.yml` both state. These two runs are
consistent with that case; they do not establish it. The rollback trigger stands
unchanged: a red `Authentication and planning flows` on unchanged code means
restore the line, not re-open the diagnosis.

### Independent review

A reviewer distinct from the builder, and from M2-09's reviewer, approved
`843c06b..8764324` with six non-blocking observations, then re-reviewed
`8764324..7585f1f` after all four corrections and returned the range
`843c06b..7585f1f` approved with no blocking findings.

Two things it verified mechanically rather than by reading the claim, both of
which are the kind of thing a record cannot self-certify:

- The record is **append-only after the before figures landed**. Across every
  subsequent commit there is no deletion originating in the before-measurements
  section, so no rate, denominator or latency figure has been altered since
  `91ba7a9` — a stronger property than "no number changed".
- The `src/` correction is **comment-only**, established by stripping all
  comments from `transition-watchdog.ts` at both commits and comparing: 37 code
  lines to 37, identical, with every budget and verdict intact.

### Hosted verification is scoped, for the same reason it was on M2-09

Preview for `7585f1f`: `https://fittip-6b4qmhq9o-mattis-3657s-projects.vercel.app`,
state `Ready`, deployment `dpl_9TuLuiPnLU5kLwLunwT7vGcrczPS`, which is the
identifier GitHub's Vercel commit status reports for that commit.

Vercel deployment protection gates the Preview, so application behavior is not
observable there by the lead or the reviewer. Attested: the deployment exists,
reached `Ready`, and is bound to `7585f1f`. **Not attested: any application-level
behavior on the Preview**, including the `390x844` rendering of the six surfaces
and the unauthenticated boundary. No protection-bypass token was used or
requested.

This matters more on this ticket than it did on M2-09, and the difference should
not be glossed. M2-09 changed no route, action, or rendered output; this ticket
upgrades the framework underneath every one of them. Continuous integration
executed the full 390px production browser matrix on `16.3.0` at both commits,
and the six committed screenshots show the upgraded build's surfaces — but
neither can judge whether a surface looks and feels right. **The product owner's
`390x844` pass on the Preview is the evidence this ticket most needs and is the
one thing no agent here can supply.**

## Product-owner acceptance — 13 August 2026

The product owner accepted exact independently reviewed commit
`7585f1fa71dc5a1e4c4c2a6548e6bf609e9f175b` in chat, against Preview
`https://fittip-6b4qmhq9o-mattis-3657s-projects.vercel.app`, with all five
known limitations stated in the acceptance request — including that hosted
verification was scoped rather than passed, and that the `390x844` judgment on
`16.3.0` was theirs to make because no agent in this pipeline could supply it.

`origin/master` was `843c06b` and had not diverged from the branch point, so the
accepted commit and its evidence-only descendant integrated as a fast-forward
rather than a merge commit. `7585f1f` is contained in `master` exactly as
reviewed, with no conflict resolution and no integration edit in the range.
