# M2-11 validation: upgrade to `next@16.3.0` and re-measure the lost render

**Ticket:** [M2-11](../../backlog/M2/M2-11-NEXT-16-3-0-UPGRADE.md)

**Lifecycle state:** in development — builder handoff

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

What carries the removal is the 250-transition paired measurement, not the
one CI run. If that step reddens on the plan surface after this lands, the
correct response is to restore `--retries=2` and re-open the removal, not to
re-open M2-09's diagnosis.

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
