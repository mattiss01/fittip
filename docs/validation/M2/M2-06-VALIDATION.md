# M2-06 validation: the plan page intermittently never finishes rendering

**Ticket:** [M2-06](../../backlog/M2/M2-06-PLAN-PAGE-RENDER-TIMEOUT.md)

**Lifecycle state:** testable — awaiting independent exact-commit review

**Branch:** `ticket/m2-06-plan-render`

**Base:** `6b8f9e6e90ae47e0aab659048e868c28b60675f9` — `origin/master` at dispatch

**Implementation commit:** `55e1a129cd592511497de5eab132b4c9648e632c`

**Review target:** `9bdabe9bb1c0a2191867fdbe9ebef19414a151a4` — the branch
head, a one-line correction to a comment in `e2e/planning.spec.ts`

**Mobile evidence:**
[failed plan server render at 390x844](evidence/M2-06-plan-error-390x844.png)

**Related:** [M2-05](M2-05-VALIDATION.md) is a different defect with the same
underlying framework mechanism. It was not touched.

## Summary

The failure was reproduced locally and diagnosed. The ticket's leading
alternative — that the render is merely slow on a shared runner — is
**refuted by measurement**. So is the ticket's description of the symptom.

What actually happens: the App Router transition to `/home/plan` commits the
address and then never renders the destination. The shell and the primary
navigation stay on screen and the segment holds **nothing at all** — not the
planning surface, not `loading.tsx`, not `error.tsx`. The user sees a blank
page under a working navigation bar. It does not resolve. Three separate
occurrences were held open deliberately: two for a full 30 s and one for a
full 60 s, each with no request outstanding and no change to the document in
between.

**No application code was changed.** A recovery was built, measured, and
removed; the reasoning is in "The correction, and what was deliberately not
corrected". What is delivered is an honest test that can detect this failure
class, a regression test for the error boundary, and this record.

## Does this affect users?

**In principle yes; in a hosted environment, unproven.** Stated precisely,
because the difference matters:

- The failing interaction is a plain link tap on the primary navigation.
  Nothing about Playwright is required to produce it, and the failure is a
  blank page that never recovers on its own. A user who hits it must tap
  another destination or reload.
- It has **never been observed on Vercel**. The product owner loaded the plan
  page on the production deployment on 31 July 2026 and it rendered normally.
  That observation stands, and this record does not dispute it — but one
  successful navigation is weak evidence against a defect measured at roughly
  5% per navigation locally. It is what a 95%-likely outcome looks like.
- This builder did **not** attempt to reproduce it on Vercel and did not
  measure hosted rates. That gap is real and is listed under known
  limitations.
- Every observed occurrence is the **first authenticated navigation after
  sign-in**, while `/home/today` is still streaming and the four navigation
  links are prefetching. That is a narrow window, and it is a window a real
  user passes through on every sign-in.

So: a real failure mode on a real interaction, at an unmeasured hosted rate.
"It happens in continuous integration" is not on its own an argument that
users are affected, which is why the argument above rests on what the
interaction is rather than on where it was seen.

## Observed rate, before

**Continuous integration**, counting every completed run whose browser job
executed the planning flow. `e2e/planning.spec.ts:29` failed in
[30557154507](https://github.com/mattiss01/fittip/actions/runs/30557154507),
[30558645534](https://github.com/mattiss01/fittip/actions/runs/30558645534),
[30558659712](https://github.com/mattiss01/fittip/actions/runs/30558659712),
[30598291389](https://github.com/mattiss01/fittip/actions/runs/30598291389)
and
[30632818567](https://github.com/mattiss01/fittip/actions/runs/30632818567).

| Window | Rate |
| --- | --- |
| 30–31 July, up to the M2-05 merge | **5 of 15 completed runs (33%)** |
| Including the five runs since | **5 of 20 completed runs (25%)** |

The other red runs in that window were M2-05, not this defect; each was
checked and attributed by its failing spec line rather than assumed.

**Locally**, against a production build (`npm.cmd run build` +
`npm.cmd run start -- -p 3000`) and the local Supabase stack:

| Batch | Result |
| --- | --- |
| `--repeat-each=8`, 30 s budget | 1 failed, 7 passed |
| `--repeat-each=8`, 30 s budget | 1 failed, 7 passed |
| `--repeat-each=40`, 30 s budget | 1 failed, 39 passed |
| `--repeat-each=60`, 60 s budget | 1 failed, 59 passed |
| **Measured baseline** | **4 failures in 116 runs (3.4%)** |

Local 3–5% against continuous integration's 25–33% is a real gap, not obviously
sampling noise at these counts. Contention plausibly widens the window in
which the transition is lost without being the cause of the loss — the 60 s
result below rules out contention as a sufficient explanation.

## The wait is unbounded, not long

This is the experiment the ticket's open question 2 asked for, and the one
M2-05 used to separate a lost update from a slow one.

The assertion budget was raised to 60 s and the flow run 60 times against the
unmodified application. The failure that occurred held the shell empty for the
**entire 60 s**:

```
Expect "toBeVisible" with timeout 60000ms
  - waiting for getByRole('heading', { name: /Plan what/ })
```

The retained trace shows the last network request of the whole run landing
immediately after the click, and then sixty seconds of silence. Two earlier
occurrences behaved identically against a 30 s budget, one of them measured at
30,018 ms with the same silence. Nothing was in flight; nothing was going to
arrive.

The distribution has no middle ground worth calling slowness:

| Outcome | Measurement |
| --- | --- |
| Normal | 11–478 ms. All 59 passes in the 60 s batch fell in 13–448 ms |
| Occasionally | about 4 s (3954 ms and 4009 ms, twice in a separate 40-run batch) |
| Otherwise | never — 30 s, 30 s and 60 s, three separate occurrences |

## What the server was doing: nothing slow

Every `/home/plan` payload was answered promptly in every failing run
inspected, including the runs that then rendered nothing:

| Trace | `/home/plan` RSC responses |
| --- | --- |
| Continuous integration `6c34f1c`, run 30632818567 | three requests, `200` in 18, 19 and 34 ms |
| Local failure, 30 s budget | three requests, `200` in 30, 54 and 73 ms |
| Local failure, 60 s budget | answered, then no further request for 60 s |

The server render is not the slow step, and the ticket's open question 3 —
which query or connection the render waits on — has no answer because the
render is not waiting on one.

## The symptom is a blank page, not a stuck loading state

The ticket, and the M2-05 record before it, assumed the surface sits on
"Opening your training ledger…". **It does not.** The retained page snapshot
from continuous integration and every local reproduction agree: the shell
holds the skip link, the primary navigation and the route announcer, and the
route segment is absent entirely.

```yaml
- generic [ref=e1]:
  - generic [ref=e2]:
    - link "Skip to content"
    - navigation "Primary": …
  - alert [ref=e22]
```

The screencast frame from the continuous-integration failure confirms it
visually: the previous route's loading card disappears, and what replaces it
is an empty page above the navigation bar. `loading.tsx` never rendered, so
raising or lowering its prominence would change nothing.

## A failed server render already shows an honest error

Ticket acceptance criterion 2 was **already satisfied before this ticket**,
and this record says so rather than manufacturing a change for it.

Verified by stopping the local PostgREST container mid-session so that
`getCurrentManualPlan()` fails, then loading `/home/plan` both as a fresh
document and by tapping Plan from `/home/today`. Both paths render
`src/app/home/plan/error.tsx` at `390x844`:

> **Your plan stayed untouched.** We could not load the current version.
> Nothing was changed or accepted. — *Try loading again*

Captured in
[evidence/M2-06-plan-error-390x844.png](evidence/M2-06-plan-error-390x844.png).

The gap was in coverage, not behavior: no test held `PlanPage` to letting a
persistence failure escape, so a future `catch` could have swallowed it and
left the route on its loading boundary with nothing to recover from. That test
now exists.

## What was ruled out

| Candidate | Result |
| --- | --- |
| Slow server render under contention (the ticket's leading alternative) | Refuted — every payload answered in 18–80 ms |
| A slow client render that would finish given time | Refuted — 30 s, 30 s and 60 s, no completion |
| The loading boundary sticking on screen | Refuted — the boundary never renders; the page is blank |
| A server error swallowed into an indefinite loading state | Refuted — `error.tsx` renders correctly on both paths |
| Navigating away while the previous route is still in its loading boundary | Tested with a 4 s artificial delay on `/home/today`, 12 of 12 passed — not sufficient on its own |
| A CPU-starved client | Tested at 8x CPU throttling, 15 of 15 navigations completed — slower, never lost |
| Authorization, ownership or RLS | Not implicated. No policy, grant or migration is involved, and the same account renders the page on reload |

The precise mechanism inside `next@16.2.11` / `react@19.2.7` is **not
identified**. What is established is that it is a lost client transition of
the same family M2-05 diagnosed, on a navigation rather than a Server Action
result, and that FitTip's server, data and authorization are not involved.

## The correction, and what was deliberately not corrected

Delivered:

1. `e2e/planning.spec.ts` no longer accepts a committed address as proof of a
   render. It asserts the planning surface is visible **and** that the loading
   boundary has been replaced, and it records how long that took on every run
   so the budget stays answerable to measurement.
2. `src/app/home/plan/page.test.tsx` holds the page to letting a persistence
   failure reach `error.tsx`.

**No application change.** A recovery was built and measured, and then
removed. It is recorded here rather than omitted, because the measurement is
the most useful thing this ticket produced about how to fix the defect:

- A client watchdog in the shared `/home` layout detected a transition that
  left the shell with no `<main>` for a budget, then explained itself and
  reloaded. Over 40 runs it recovered two lost transitions successfully.
- In the same 40 runs it **reloaded two legitimate transitions** that were
  going to render at 3954 ms and 4009 ms, on a 4 s budget. Both broke the
  flow. A recovery that manufactures a new failure mode at the measured rate
  of the one it fixes is not a correction.
- A budget of about 20 s would have caught all three lost transitions and
  neither slow one. That is the number a future attempt should start from.
- The only component that survives this failure is the shared `/home` layout,
  because nothing on the destination route mounts. Any recovery therefore
  changes Today, Progress and You as well, which is outside this ticket's
  plan-surface scope, and a page that reloads itself is a product decision of
  the kind the working agreement routes to the product owner.

This is recommended as a follow-up ticket, scoped to the shell, with a budget
set from the measurements above.

## Delivered behavior

No user-visible behavior changed. The plan page renders, fails and recovers
exactly as it did before this commit, including the honest error above.

What changed is that the browser flow can now detect the defect instead of
passing through it: `toHaveURL(/\/home\/plan$/)` passed in **every** observed
occurrence while the page was blank, so the step gave false assurance.

## Mobile demo path

Local production build with the local Supabase stack:

```powershell
npx.cmd supabase start
npm.cmd run build
npm.cmd run start -- -p 3000
npx.cmd playwright test e2e/planning.spec.ts --workers=1
```

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and
`SUPABASE_SERVICE_ROLE_KEY` must be exported from `npx.cmd supabase status`
first; the spec skips silently without the service-role key.

By hand at `390x844`:

1. Sign in and tap **Plan**. The planning surface opens. Repeat sign-in and
   the tap several times; roughly one navigation in twenty leaves a blank page
   under the navigation bar, which is the defect.
2. To see the honest error state, stop the local PostgREST container
   (`docker stop supabase_rest_fittip`), open `/home/plan`, and confirm the
   card in the screenshot above. Restart it with `docker start`.

## Changed files

`git diff --stat 6b8f9e6e90ae47e0aab659048e868c28b60675f9..9bdabe9bb1c0a2191867fdbe9ebef19414a151a4`:

```
 docs/validation/M2/M2-06-VALIDATION.md             | 396 +++++++++++++++++++++
 .../M2/evidence/M2-06-plan-error-390x844.png       | Bin 0 -> 22067 bytes
 docs/validation/README.md                          |   1 +
 e2e/planning.spec.ts                               |  36 +-
 src/app/home/plan/page.test.tsx                    |  14 +
 5 files changed, 444 insertions(+), 3 deletions(-)
```

The line counts above are for the two-commit range. `9bdabe9` is a one-line
correction to a comment in `e2e/planning.spec.ts`; `55e1a12` is everything
else.

Nothing was deleted or renamed. No file outside this list changed; in
particular `src/app/home/layout.tsx` is untouched, and the watchdog described
above exists in no commit on this branch.

Files whose purpose is not evident from the path and diff:

- `docs/validation/M2/evidence/M2-06-plan-error-390x844.png` — the plan route's
  `error.tsx` at `390x844`, captured with PostgREST stopped. It is evidence
  that acceptance criterion 2 was already met, not evidence of a change.

## Data, migration, API, privacy, and security effects

- **No migration.** No schema, policy, grant, index, constraint or RPC change.
  `supabase/migrations/` and `src/lib/supabase/database.types.ts` are
  untouched.
- **No application code changed at all.** No route, component, repository,
  Server Action or configuration file is in the diff.
- **No authorization change.** Ownership is still derived server-side; the
  defect is a client render and the same account renders the page on reload,
  which is itself evidence that authorization is not implicated. Tier 1
  escalation was considered on that basis and is not warranted.
- **No browser storage, no credential, no service, no provider, no spend
  change.** The service-role key remains a test-runtime-only value.

## Tests and final results

The continuous-integration run for the reviewed commit is the automated
evidence; see "Commit and continuous integration" for its URL and conclusion.

What continuous integration does not cover, run locally and reported honestly:

| Command or check | Result |
| --- | --- |
| `git diff --check` | Clean |
| `npx.cmd prettier --write` on the two changed files | No change beyond line endings |
| `npm.cmd run lint`, `npm.cmd run typecheck` | Clean |
| `npm.cmd run test:run -- src/app/home/plan/page.test.tsx` | 4 tests passed |
| Baseline reproduction, 30 s budget, unmodified application | 3 failed in 56 runs |
| Bounded-versus-hung experiment, 60 s budget, 60 runs | 1 failed, 59 passed; every pass in 13–448 ms |
| Shell watchdog trial (built, measured, **reverted**, in no commit) | 2 recoveries and 2 false reloads in 40 runs |
| 8x CPU-throttled navigation probe (throwaway, not committed) | 15 of 15 completed, 5.7–9.5 s end to end |
| Failed-server-render check with PostgREST stopped | `error.tsx` on both the document load and the client navigation |

Two throwaway Playwright probes and a temporary 4 s delay in
`src/app/home/today/page.tsx` were used during the investigation. All were
removed; `git status` is clean apart from the files listed above.

## Known limitations

- **The defect is not fixed.** This commit makes the browser flow detect it
  honestly; it does not stop it happening. The continuous-integration run for
  this commit may therefore be red on `Authentication and planning flows` at
  the measured rate, and a red run here means the defect occurred, not that
  the change regressed anything. Re-running is legitimate; recording a pass
  obtained that way without saying so is not.
- **The mechanism inside the framework is unidentified.** What is proven is
  where it is not: not the server, not the data, not authorization, not the
  loading boundary, not contention alone.
- **Hosted behavior is unmeasured.** No attempt was made to reproduce this on
  Vercel, and no hosted rate is claimed. The product owner's successful
  production load stands and is not contradicted by anything here.
- **The recovery is deferred, not rejected.** The measurements above say a
  ~20 s budget in the shared shell would work. That is a separate ticket.
- **`/home/today`, `/home/progress` and `/home/you` were not measured.** They
  use the same transition mechanism. The M1-03 and M1-04 flows have passed
  every run, but neither has been run at the counts used here.
- **The 60 s budget slows a failing run.** A hung transition now costs 60 s
  instead of 5 s before the flow fails. That is deliberate: it is what makes
  the failure message unambiguous.

## `vercel-react-best-practices` rules checked

`.agents/skills/vercel-react-best-practices/AGENTS.md` was read. No
server/client boundary, data fetching path or bundle behavior changed in this
commit, so no rule applies to the delivered diff. The rules were used to
assess the watchdog that was **not** shipped — 5.1 derived state during
render, 5.15 `useRef` for transient values, 8.2 initialize once — and are
recorded here only so a follow-up ticket does not have to rediscover that the
assessment was made.

## Independent reviewer checklist

Review the exact pushed commit named below, against
`git diff 6b8f9e6e90ae47e0aab659048e868c28b60675f9..<implementation commit>`.

Confirm the continuous-integration run for that SHA. Do not re-run lint,
typecheck, Vitest, the build or the browser flows.

Judgement this record asks for:

1. **Is "unbounded, not slow" established?** It rests on three held-open
   occurrences (30 s, 30 s, 60 s) with no request outstanding. Decide whether
   three is enough to close the ticket's central question.
2. **Is raising the assertion budget to 60 s a strengthening or a
   weakening?** The step now asserts strictly more than before — the surface
   visible *and* the loading boundary replaced — but it waits twelve times
   longer to say so. Check that the comment's justification matches the
   measurements in this record.
3. **Is declining to ship the recovery the right call?** This is the central
   decision in this ticket. The measured false-reload rate and the
   plan-surface scope boundary are the arguments; challenge either.
4. **Is the claim about user impact correctly hedged?** The record says a real
   interaction fails and that hosted rates are unmeasured. It should not be
   read as either "users are definitely affected" or "this is only a test
   artifact".
5. **Does the diff contain anything beyond the two test files and the
   documentation?** It should not. In particular confirm no watchdog,
   no layout change and no artificial delay survived the investigation.
6. **Tier:** confirm that no migration, authorization or RLS surface is
   implicated, and therefore that Tier 2 was correct.

## Commit and continuous integration

| Commit | Contents | CI run | Conclusion |
| ------ | -------- | ------ | ---------- |
| `55e1a129cd592511497de5eab132b4c9648e632c` | The test correction, the regression test and this record | [30670298686](https://github.com/mattiss01/fittip/actions/runs/30670298686) | **cancelled** — superseded by the commit below before it finished |
| `9bdabe9bb1c0a2191867fdbe9ebef19414a151a4` | One-line comment correction | [30670345598](https://github.com/mattiss01/fittip/actions/runs/30670345598) | **success** — all three jobs |

Run `30670345598` is green on `Lint, types, unit tests, build`,
`Migrations, RLS, advisors, concurrency` and
`390px production browser flows`, which includes the strengthened planning
step. That run's log carries the new measurement:

```
[M2-06] plan surface rendered in 21 ms
```

The defect did not occur on this run. At the measured 25–33% continuous
integration rate that is the expected majority outcome and is **not** evidence
that the defect is fixed — nothing in this commit changes the application. A
later red run on `Authentication and planning flows` means the transition was
lost again, which is exactly what the strengthened assertion now reports
honestly.

The follow-up commit that fills in the run URLs above touches only this file.
Review the branch head; its diff against `9bdabe9` is this section, the commit
range in "Changed files" and the header SHAs alone.
