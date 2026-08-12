# M3-09: Two simultaneous roadmap requests report a failure that did not happen

**Status:** proposed — not approved for implementation

**Triage:** ready-for-agent

**Milestone:** M3 — AI coaching proposals

**Priority:** P3

**Owning accepted work:** [M3-02 roadmap proposal](M3-02-ROADMAP-PROPOSAL.md)

**Depends on:** nothing.

**Source:** raised by the independent reviewer of `593a6c2` on 12 August 2026
and carried forward as limitation 14 in
[M3-02](../../validation/M3/M3-02-VALIDATION.md#known-limitations) as a
follow-up rather than an acceptance blocker.

## Observed behavior

`begin_roadmap_generation` runs its existing-row `SELECT` **before** taking the
advisory lock. Two genuinely simultaneous requests with the same idempotency key
therefore both find nothing and both proceed. One inserts and gets its
`'claimed'` receipt. The other blocks on the lock, then hits a `23505` unique
violation on `roadmap_generation_requests_key_key` that nothing catches. It
surfaces as `RoadmapPersistenceError` and the owner sees:

> That proposal could not be prepared. Nothing was saved; try again.

Both halves of that sentence are wrong for this case. A proposal **is** being
prepared, by the request that won, and something **was** saved — its row. The
honest message is the one the replay path already produces: a generation for
this key is already running.

## What this is not

- **Not a spend defect.** The loser never receives `'claimed'`, and only
  `'claimed'` authorizes a provider call. That is the discriminator added in
  `593a6c2` for defect 8, and it holds here. No second provider call is bought.
- **Not a data defect.** The unique constraint does its job; exactly one request
  row exists per key. Nothing is duplicated, corrupted, or left half-written.
- **Not new.** It is pre-existing at `cb1f6c5` and was not introduced by the
  defect-8 fix.

It is a copy and user-experience edge, reachable only by two truly concurrent
same-key submits, which in practice means a double-tap that outruns the disabled
state or a retried request racing its original.

## The likely shape of the fix

Catch `unique_violation` inside `begin_roadmap_generation`, after the lock, and
fall into the same replay path a sequential duplicate already takes — re-read the
stored row and return its stored status. That turns a race into the case the
function already handles correctly, rather than adding a second way to describe
the same situation.

Alternatively, move the existing-row `SELECT` after the advisory lock so the
race cannot open. Judge which is safer against the replay and `PT409`
fingerprint-mismatch paths; do not do both without a reason.

Corrections are forward-only. The applied migration is not edited; this needs a
new one.

## Non-goals

- No change to the `'claimed'` discriminator or to what authorizes a provider
  call. That is the spend boundary and it is correct.
- No change to the `PT409` different-fingerprint-same-key behaviour.
- No new user-facing copy beyond reusing what the already-running case says.
- No change to the roadmap surface's client-side submit handling. Debouncing the
  button would hide the race rather than close it.

## Acceptance criteria

1. Two genuinely simultaneous same-key requests produce exactly one request row,
   one `'claimed'` receipt, and — for the loser — the already-running state
   rather than a persistence error. Proven by the concurrency harness
   (`npm run test:m3-02-concurrency` and its CI step), not by pgTAP alone: a
   single-connection pgTAP file cannot express this, which is why the defect
   survived a 106-assertion suite.
2. The loser makes no provider call, and no second spend reservation exists.
3. Sequential replay, the `PT409` fingerprint mismatch, and the regeneration
   preconditions all behave exactly as they do today, with their existing pgTAP
   assertions unmodified.
4. A forward migration; the applied `20260810213904` file is untouched.
5. A green continuous-integration run for the reviewed commit.

## Approval gate

**Tier 1.** It changes a migration and an ADR-015 `SECURITY DEFINER` function on
the spend path, even though the spend boundary itself is not moving: approved
ticket, distinct builder, distinct independent reviewer, hosted migration
against the founder project with its evidence recorded, Preview verification,
and product-owner acceptance.
