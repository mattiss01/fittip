# M3-15D: Bounded AI completion context

**Status:** proposed — not approved for implementation. Split out of
[M3-15](M3-15-REPLACEMENT-CONSUMER-READINESS.md) on 29 August 2026.

**Triage:** needs-triage

**Milestone:** M3

**Priority:** P1

**Tier:** 1 — crosses the ADR-013 training-history boundary and decides what
owner data reaches a paid external provider.

**Depends on:** [M3-15C](M3-15C-PROGRESS.md) accepted and merged.

**Blocks:** [M3-15E](M3-15E-ROADMAP-RESTORATION.md), which cannot generate
anything without a context source, and M3-16.

## Scope

**The central fact this ticket exists for:** `CoachAIContextSource` in
`src/server/ai/context-source.ts` is a bare interface with **no production
implementation at all**. M3-11 deleted the legacy database adapter and its
comment records that no replacement survives. Every fixture, test, and
composition-root stub implements it; nothing reads the database. So this is a
new context source, not a rewiring.

- Build the production `CoachAIContextSource`: goals, memory, the profile
  timezone, the exact current Plan slice, and the separately bounded eligible
  completion history, assembled for `buildCoachAIContext`.
- Route completion history through the existing
  `src/server/training/training-history-context.ts` allowlist. Deny by default:
  a column added to a completion later stays invisible until that file and
  ADR-013 change together.
- `CORRECTION_REASON_MAX_LENGTH` and every reference to `correction_reason` are
  dead — the field does not exist in the replacement schema, per the
  29 August 2026 ADR-013 amendment. Remove them rather than leave a constant
  that describes a column nobody has.
- Calls `readPlanWindowToppedUp` before reading the plan slice, per ADR-017
  consequence 3. An AI that plans against an un-topped-up window plans around
  sessions the owner does have.
- **M3-08's exact-source rule.** A proposal source records only completions
  actually transmitted to the Coach; byte-trimmed or otherwise unsent eligible
  completions are not sources. A correction to a sent completion conflicts;
  correction of an unsent one does not. Without a revision chain this is a
  comparison of the completion's `updated_at` against the proposal's dispatch
  time — cheaper than the retired design assumed. Keep the existing honest
  conflict copy unless the dispatch contract demonstrates a reason to change
  it.
- Trimming must stay **disclosed**, per ADR-013 decision 1. A coach that
  silently receives a subset reasons as though it saw everything.

## Non-goals

- No change to the accepted eligibility window, session cap, or byte budget.
  `TRAINING_HISTORY_WINDOW_DAYS`, `TRAINING_HISTORY_MAX_SESSIONS`, and the
  `context.ts` sub-budgets are accepted values; changing one is an ADR-013
  amendment, not a builder decision.
- No new prompt, provider, model, or spend ceiling.
- No surface. The roadmap surface is M3-15E and proposal application is M3-16.
- No live provider call without separate, explicit per-run product-owner
  authorization naming the exact call count.

## Approval boundary

This shell records the narrowed scope only. The exact contract requires an
`## Agent brief` and separate product-owner approval before dispatch.
