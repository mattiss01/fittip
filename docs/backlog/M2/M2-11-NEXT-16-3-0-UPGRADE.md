# M2-11: Upgrade to `next@16.3.0` and re-measure the lost render

**Status:** proposed — not approved for implementation

**Triage:** ready-for-agent

**Milestone:** M2 — goals, editable coaching context, and guided onboarding

**Priority:** P1

**Depends on:** [M2-09 accepted](M2-09-APP-ROUTER-LOST-RENDER.md), which
identified the cause and built the apparatus this ticket measures with

**Origin:** the product owner chose on 13 August 2026 to take the remedy as a
separate ticket rather than fold it into M2-09, so that a before-and-after rate
exists on identical apparatus

**Blocks:** nothing. Every mutating surface keeps its recovery code and the
continuous-integration stopgap keeps its retries until this lands.

## Outcome

Take the upgrade that carries the fix, prove on measurement rather than on
inference that the race is gone, and only then remove what was built to survive
it.

## Why this is a separate ticket

M2-09 was an investigation and it stopped where a builder's authority ended: a
framework upgrade changes every runtime surface in the application, so it is the
product owner's decision. Keeping it separate also keeps the evidence clean. The
measurement and the change it measures are not in the same commit range, and the
before figures were recorded by an agent that did not know what the after would
be.

## What is already known, so nobody re-derives it

M2-09 established all of this and its record holds the evidence:

- This application never runs the `react@19.2.7` that `package.json` pins. Next
  aliases `react$` and `react-dom$` to its own vendored build, and `16.2.11`
  vendors `19.3.0-canary-3f0b9e61-20260317`.
- That canary was cut on 17 March 2026. The upstream fix,
  `facebook/react#36134`, merged on 24 March 2026 — a week later.
- `16.2.11` and `16.2.12` vendor the same pre-fix canary. `16.3.0` vendors
  `19.3.0-canary-cbb046ab-20260731`. There is no patch-level escape inside
  `16.2.x`.
- `vercel/next.js#86055` is this repository's exact symptom and was closed as
  fixed in `16.3.0`, which also carries the `#84299` fix.

So the hypothesis under test is narrow and falsifiable: **`next@16.3.0` takes the
`/home/plan` navigation loss rate from a floor of 4.00% to zero.** If it does
not, the M2-09 diagnosis is wrong and this ticket stops and says so rather than
searching for a second explanation.

## The before figures

From M2-09's validation record, measured on a local production build at 390x844
with a 15-second commit budget. Both navigation rates are **floors, not
two-sided estimates**, because the probe's clock starts after the URL assertion.

| Transition | Lost / attempts | Rate |
| --- | --- | --- |
| `/home/plan` client-side navigation | 10 / 250 | at least 4.00% |
| `/home/log` client-side navigation | 5 / 204 | at least 2.45% |
| `/home/log` quick-log save | 0 / 199 | 0.00% |

The apparatus is `e2e/m2-09-lost-render.probe.ts` on
`e2e/m2-09.playwright.config.ts`, port 3019. Reuse it. Do not write a second
harness: a rate measured on different apparatus is not comparable to these, and
comparability is the whole reason this ticket exists.

## The React pins are a real question, not a formality

`package.json` pins `react`, `react-dom`, and `@types/react` at `19.2.7`.
`next@16.3.0`'s peer range is `^19.0.0`, so `16.3.0` accepts them unchanged and
the upgrade does not force a React bump.

But those pins are not inert, and M2-09 only proved they are bypassed *in the
browser*. They are the React that the Vitest component suite runs against,
because jsdom tests do not go through Next's compiler aliasing. So the suite
tests one React and production runs another, and that gap widens with this
upgrade rather than narrowing.

Decide it deliberately: leave the pins and record that the suite runs a
different React than production, or raise them and say what that is expected to
change. Do not raise them silently as housekeeping.

## Non-goals

- No application redesign, no new recovery behavior, and no change to any
  surface's mutation flow.
- No Next.js 17, no canary, no React major.
- No removal of a mitigation before the after-measurement supports it. Criterion
  5 of M2-09 stands: no mitigation is removed without evidence that the race is
  gone.
- No new AI, planning, schema, authorization, or spend behavior.

## Acceptance criteria

1. `next` is at `16.3.0` and the vendored React canary in the installed tree is
   confirmed to be post-fix, by the same check M2-09 used rather than by trusting
   the version number.
2. `/home/plan` navigation is re-measured on M2-09's probe at the same
   denominator or larger, on a local production build. The rate is recorded with
   its denominator whatever it is.
3. `/home/log` navigation and the quick-log save are re-measured on the same
   probe, and recorded.
4. **`/home/plan`'s own save is measured for the first time.** It is
   `useTransition` plus `router.refresh()`, which is `#86055`'s exact reported
   shape, and M2-09 left it unmeasured and unprotected. It is measured before and
   after within this ticket, so it gets its own comparison.
5. The React pin decision above is taken and recorded, either way.
6. Mitigations are removed only where the after-measurement supports it. Each
   removal names the measurement that justifies it; each retention says why.
   Removing the recovery from a surface whose rate was never measured is not
   permitted.
7. The `--retries=2` stopgap on `Authentication and planning flows` is removed if
   the measurements support it, or re-justified again in writing. This is the
   condition M2-09 recorded for its removal, and this is the ticket that meets
   or fails it.
8. A green continuous-integration run for the reviewed commit, and an honest
   reading of the `flaky` count on the browser job before and after — that count
   is itself a measurement and M2-09 recorded it as one.
9. If the rate does not go to zero, the ticket reports that plainly, keeps every
   mitigation, and does not search for a second cause. That outcome is a valid
   result and re-opens the diagnosis rather than this ticket.

## Test plan

- The vendored canary check from M2-09, re-run against the upgraded tree.
- The probe at the M2-09 denominators or larger, on all four transitions,
  before and after within this ticket for `/home/plan`'s save.
- The existing suite and browser flows, via continuous integration rather than
  by hand.
- A `390x844` pass over the four watchdog surfaces, since the upgrade changes
  the router underneath all of them.

## Known risk

A minor Next upgrade can change routing, caching, or rendering behavior beyond
the defect it is taken for. The 390px acceptance pass matters more here than on
a scoped feature ticket, because the blast radius is the whole application and
continuous integration cannot judge whether a surface still looks and feels
right.

## Approval gate

The product owner approves the upgrade, the tier, and the React pin decision.
Expected **Tier 2** — no schema, authorization, privacy, or spend — but it
changes every runtime surface, so the product owner may raise it. It stops and
re-dispatches as Tier 1 if anything reaches schema, authorization, privacy, or
spend.
