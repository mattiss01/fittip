# M3-22: The offline segment of two browser flows fails at random

**Status:** proposed — not approved for implementation. Diagnosed by the lead
on 30 August 2026 from CI run
[33309063845](https://github.com/mattiss01/fittip/actions/runs/33309063845).

**Triage:** needs-triage

**Milestone:** M3

**Priority:** P1 — not because the product is wrong, but because a
non-deterministic gate is worse than no gate. Every red run it produces has to
be diagnosed by hand before anyone can tell whether it means anything, and the
standing temptation is to re-run until green, which is exactly the habit
`AGENTS.md` forbids the known-defect exception from becoming.

**Tier:** 3 — test-only. No product behavior, schema, or authorization change.

**Depends on:** nothing.

**Blocks:** nothing formally. In practice it will keep interrupting ticket
delivery until it is fixed.

## The defect

`e2e/m3-14b-recurring-series.spec.ts` collects every browser console error for
the whole test and asserts at `:275` that the list is empty:

```ts
if (message.type() === "error") consoleErrors.push(message.text());
...
expect(consoleErrors).toEqual([]);
```

Between those two points the test deliberately takes the browser offline to
check the honest recovery surface:

```ts
await page.context().setOffline(true);
await expect(page.getByText(/^Offline\./)).toBeVisible();
await page.context().setOffline(false);
```

Any network request in flight across that window logs
`Failed to load resource: net::ERR_INTERNET_DISCONNECTED` to the console, and
the assertion 30 lines later counts it as a product error.

`e2e/m3-11-maintenance.spec.ts:45,117` uses the same collector and the same
final assertion, so it carries the same latent defect wherever it goes offline.

## The evidence

Run 33309063845 failed with three such errors. The trace names them:

| URL | Request headers |
| --- | --- |
| `/home/today?_rsc=...` | `rsc: 1`, `next-router-segment-prefetch: /_tree`, `Referer: /home/plan` |
| `/home/progress?_rsc=...` | same |
| `/home/you?_rsc=...` | same |

All three are App Router prefetches of the persistent bottom-navigation links,
issued by the shared home layout. None is a plan surface, and none belongs to
the ticket the run was gating.

The timing, from the same trace, is decisive:

| Time (ms) | Event |
| --- | --- |
| 10366.1 | `setOffline(true)` |
| 10428.2 | `setOffline(false)` |
| 10430.9 – 10431.4 | the three console errors |

The offline window is **62 ms** wide. Whether a prefetch happens to be in
flight across it is a race. The likely trigger is that the preceding step
submits a form, whose Server Action calls `revalidatePath`, which invalidates
the client router cache and re-queues a prefetch for every visible link.

## Why this is a flake and not a regression

The three URLs are shared-layout navigation targets; no ticket has changed
them. The failure first appeared on a commit that changed only plan-surface
copy and one exported predicate, which cannot cause a nav prefetch to fail —
it can only shift the preceding steps' timing by a few milliseconds, which is
all this assertion needs to flip.

Re-running the identical SHA is the confirmation and should be recorded here
when this ticket is approved.

## Shape of the fix

Not a specification. Two directions, and the ticket should pick one on
approval rather than leaving it to the builder:

1. **Scope the collection.** Stop collecting while deliberately offline, so
   the window's own noise is never counted. This keeps the assertion strict
   everywhere else, which is its value.
2. **Filter the message.** Ignore `net::ERR_INTERNET_DISCONNECTED`
   specifically. Simpler, but it is a blanket filter that would also hide a
   genuine offline-handling error, and the whole point of the assertion is to
   catch what the surface does wrong.

Direction 1 is the recommendation. Whichever is chosen, apply it to both specs;
fixing only the one that has failed so far leaves the other armed.

## Scope boundaries

- Test-only. Do not change `ConnectionNotice`, prefetch behavior, or any
  product code to make the assertion pass.
- Do not delete the offline segment or the console assertion. Both check
  something real; only their overlap is wrong.
- Do not weaken the assertion beyond the deliberate offline window.

## Acceptance signals to write into the brief on approval

- The offline segment's own disconnection noise no longer reaches the
  assertion, in both specs.
- A console error produced anywhere else in either test still fails it,
  demonstrated rather than asserted.
- Green exact-commit CI.
