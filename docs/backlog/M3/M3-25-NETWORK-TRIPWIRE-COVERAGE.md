# M3-25: The network tripwire does not watch two roots it claims to

**Status:** proposed — not approved for implementation. Raised by the round 2
independent reviewer of [M3-15D](M3-15D-AI-COMPLETION-CONTEXT.md) on
14 September 2026 and recorded in that ticket's validation record; the product
owner chose on the same day to carry it as a follow-up rather than reopen
M3-15D for a third correction round.

**Triage:** needs-triage

**Milestone:** M3

**Priority:** P2 — nothing is leaking today, and the gap is not a regression.
It is a control whose stated coverage is wider than its real coverage, which is
the specific way a tripwire stops being trusted.

**Tier:** 3 — test-only. No product behavior, schema, authorization, or
provider change. Adds two directories to a list and corrects a comment.

**Depends on:** nothing. M3-15D is merged as `85567a9`.

**Blocks:** nothing.

## The defect

`src/architecture/coach-ai-network-gate.test.ts` enumerates the roots it scans
in `PROVIDER_BOUND_ROOTS`, reads every non-test file beneath them, and asserts
that exactly one — the OpenAI adapter — contains a network primitive. Its
header says the list names "every root that holds such a module". It does not.

Two roots hold modules that select and shape owner data on its way to the
provider, and neither is scanned:

- **`src/server/completions`** — `plan-window-top-up.ts` selects the plan
  window that becomes `training.plannedSessions`, and `completion-log.ts`
  defines the `Completion` record the context source reduces to the ADR-013
  allowlist.
- **`src/server/rolling-plan`** — `rolling-plan.ts` defines
  `RollingPlanSession`, whose `localDate`, `title`, `sport`, and `isLocked` are
  copied verbatim into the payload at
  `src/server/context/coach-ai-context-source.ts:281-287`.

This is round 1 of M3-15D's finding one directory over. That round found the
tripwire scanning only `src/server/ai` while the new context source sat in
`src/server/context`; the correction named five roots and stopped there.

## Why it is not urgent

Both roots were grepped for network primitives during the M3-15D round 2
review, on 14 September 2026. Neither contains one, so no module currently
escapes the gate and no exemption is needed to add them. The failure this
prevents is prospective: a telemetry ping or enrichment `fetch` added later to
`plan-window-top-up.ts` — a module handling an owner's entire
completion-and-plan window — would pass the gate silently.

## Scope

- Add `src/server/completions` and `src/server/rolling-plan` to
  `PROVIDER_BOUND_ROOTS`.
- Confirm the `expect(reaching).toEqual([openai-adapter.ts])` assertion still
  holds over the wider set, unchanged. If it does not, stop: a second module
  reaches the network today and that is a Tier 1 finding, not this ticket.
- Add a path pin for at least one file under each new root, matching the two
  pins M3-15D added. A scan that silently matches nothing passes vacuously, and
  the pins are what rule that out.
- Correct the header so its claim matches its list, or state the rule by which
  a root belongs rather than asserting completeness.

## Non-goals

- No widening of `NETWORK_PRIMITIVE`. The pattern is deliberately broad
  already; changing it is a separate judgment.
- **`src/server/roadmap` stays out.** It shapes provider *output*, not owner
  input, and was considered and rejected during the M3-15D review.
- No change to any module the scan covers. This ticket adds coverage; it does
  not act on what coverage finds.

## Open question for the product owner

The reviewer also observed that the two path pins cover two *files*, so
dropping `src/server/goals` or `src/server/memory` from the list would fail
nothing. Whether every root earns a pin, or whether the list is asserted some
other way, is a design choice this ticket should settle rather than inherit.
