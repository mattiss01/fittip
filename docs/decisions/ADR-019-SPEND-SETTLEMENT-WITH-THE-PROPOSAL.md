# ADR-019: Spend settlement happens with the proposal

**Status:** accepted — the product owner decided both questions on
24 September 2026, in plain terms, after the two failures were explained as a
bar tab: hold the card, close the tab, save the plan.

**Date:** 24 September 2026

**Ticket:** the "A paid proposal must not be lost when the settle fails" line in
[`docs/backlog/NEXT.md`](../backlog/NEXT.md)

**Builds on:** [ADR-015](ADR-015-M3-ROADMAP-TRANSACTIONS.md). The spend ledger's
original decisions are in `docs/backlog/M3/M3-01B-REAL-PROVIDER-ADAPTER.md`,
which is retired history the working agreement forbids extending — which is why
this is an ADR rather than another function comment.

## Context

Reserving spend, settling it, and recording the proposal were three separate
durable writes with no transaction spanning them. Two failures followed, and the
M3-16A re-review found both.

**A paid proposal could be thrown away.** `reserve_ai_spend` holds the ceiling
before the provider is called. The provider answers, so real money is owed.
`coach-ai-service.ts` then settles the reservation on a best-effort basis, its
rejection deliberately swallowed so that a settlement failure could not turn a
completed proposal into a failed one. But the finish functions refused any
result whose reservation was not already settled. So a failed settle meant the
provider had been paid and the proposal was discarded.

The owner could not even retry. The generation claim stays `pending` under that
idempotency key and never calls the coach again, so recovering the answer meant
asking a fresh question and paying a second time.

**Money that was spent could vanish from the ceiling.** `reserve_ai_spend`
counted a reservation as its charge when settled, as its hold while unexpired,
and as **zero** otherwise. Fifteen minutes after a failed settle, real spend
stopped counting against the daily and lifetime ceilings entirely.

Both were harmless while the coach is fixture-only — a fixture result claiming a
reservation is refused outright — and both would bite the first time
`FITTIP_AI_LIVE=enabled`.

## Decision

1. **Both finish functions settle an open reservation themselves**, inside the
   transaction that inserts the proposal. The charge and the proposal commit
   together or neither does. A paid result can no longer be lost because a
   separate call failed.

2. **They settle it at the amount it was holding, not at the real usage.** The
   real usage is known only to the caller that just failed to report it.

3. **Everything the finish already checked still refuses**: the reservation must
   be this owner's, for this operation, and priced by the same rate card, and a
   fixture pairing may not claim one at all. A refused finish settles nothing.

4. **A reservation that was already settled is still accepted, and its real
   charge is not overwritten.** The normal path keeps exact accounting; the
   ceiling amount applies only where the normal path failed.

5. **An unsettled reservation counts as its hold forever**, rather than falling
   to zero on expiry. A spend ceiling may overcount. It must never let money
   that was actually spent disappear.

## What was rejected, and why

### Passing the charged amount and the settlement token into the finish

This would keep exact accounting on every path. It was rejected for what it
spreads. `settlementToken` is a capability, not an identifier: the database
withholds it from the owner's own `SELECT` grant, and `src/server/ai/spend.ts`
says possessing it is what proves a settlement came from the server that made
the reservation. Passing it into `generatePlanProposal` and through the
repository would widen where a credential travels, permanently, to buy exactness
on a path that only runs when something has already gone wrong.

The owner chose the conservative amount instead, knowing it means being charged
the ceiling rather than real usage on those runs.

### Awaiting the settle harder, or letting its failure throw

Neither fixes anything. The settle promise is already awaited, but it was
`.catch`ed at creation, so awaiting it reports success either way. Removing the
catch would turn a paid, valid proposal into a thrown error — the exact outcome
the catch exists to prevent. Either way the proposal is lost.

### Leaving the ceiling arithmetic alone

Rejected as the more dangerous half. Decision 1 cannot reach it: a provider call
that *fails* has no proposal to attach to, so its settle stays standalone, and
if that settle fails the charge is still forgiven. A ceiling that silently
forgets real spend is not a ceiling.

## Consequences

- A paid result is never discarded for want of a settlement, on either the plan
  or the roadmap path.
- Accounting stays exact whenever the application's own settle succeeds, which
  is the ordinary case.
- **A genuinely abandoned reservation now holds its ceiling for the rest of the
  day instead of releasing it.** This is the cost, and it is a real reversal:
  the 15-minute TTL was introduced precisely so a crashed call could not lock
  the owner out with no visible cause. The numbers make it tolerable — the
  per-request ceiling is 8,000 micro-USD against a daily ceiling of 2,000,000,
  so one abandoned reservation consumes 0.4% of a day's budget and it would take
  250 of them in one day to lock the owner out. Against the 20,000,000 lifetime
  ceiling the effect accumulates permanently, at 2,500 abandonments to exhaust
  it. Both are far outside anything a single-athlete app produces by accident,
  but neither is zero, and nothing currently reports an abandoned reservation to
  the owner.
- The finish functions now write to `ai_spend_reservations`, which they did not
  before. They remain `SECURITY DEFINER` with the owner derived from
  `auth.uid()`, and the update is constrained by owner, operation, rate card and
  `settled_at is null`, so it can close only a reservation the same call already
  proved it may use.
- `settle_ai_spend` is unchanged and still required: a provider call that fails
  produces no proposal, so its settlement has nowhere else to live.
