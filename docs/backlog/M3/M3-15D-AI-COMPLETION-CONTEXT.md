# M3-15D: Bounded AI completion context

**Status:** in development — the lead wrote the agent brief below on
14 September 2026 and the product owner approved Tier 1 dispatch the same day,
together with the five decisions recorded under *Approval boundary*. Split out
of [M3-15](M3-15-REPLACEMENT-CONSUMER-READINESS.md) on 29 August 2026.

**Triage:** ready-for-agent

**Milestone:** M3

**Priority:** P1

**Tier:** 1 — crosses the ADR-013 training-history boundary and decides what
owner data reaches a paid external provider.

**Depends on:** [M3-15C](M3-15C-PROGRESS.md) accepted and merged.

**Blocks:** [M3-15E](M3-15E-ROADMAP-RESTORATION.md), which cannot generate
anything without a context source, and M3-16.

## Agent brief

**Outcome.** Build the production `CoachAIContextSource` — the only
implementation of a seam that currently has none. It loads goals, memory, the
owner's stored zone, the current plan slice, and bounded completion history
into one `CoachAIOwnedRecords` for `buildCoachAIContext`. No surface, no prompt
change, no provider call.

**Tier:** 1 — it decides what owner data reaches a paid external provider. Stop
and re-dispatch if any schema, grant, or privileged-function change is needed.

**Hard constraints:**

- Read only through the existing factories: `createGoalRepository()`,
  `createMemoryRepository()`, `createProfileRepository()`, `createRollingPlan()`
  and `createCompletionLog()`. No new SQL, no new client, and no owner id
  accepted from a caller — every adapter derives it from the session already.
- Completion history reaches `CoachAIOwnedRecords.training` **only** through
  `selectTrainingHistoryContext()`. Map `Completion` to
  `TrainingHistoryCompletion` field by field; never spread a record. Do not
  widen the allowlist — `actualStartedAt` stays out, decided 14 September 2026.
  A column added to a completion later must stay invisible until
  `training-history-context.ts` and ADR-013 change together.
- `correctionReason` and `CORRECTION_REASON_MAX_LENGTH` describe a column the
  replacement schema does not have, per the 29 August 2026 ADR-013 amendment.
  Remove both from `training-history-context.ts` and `contracts.ts` and fix the
  two dependants (`context.test.ts`, `fixture-corpus.ts`). Four files total.
- Call `readPlanWindowToppedUp` before reading the plan slice, per ADR-017
  consequence 3, and nowhere else. Progress deliberately does not (M3-15C).
- `timezoneName` comes from the profile and is required in fact for
  `create_seven_day_plan`. An owner with no confirmed zone is refused with an
  honest error, never defaulted to a server zone.
- `sources` records only the completions actually transmitted — the ones
  `selectTrainingHistoryContext` returned, not the ones it read past. This is
  M3-08's exact-source rule, and why the field is carried from the source.
- Trimming stays disclosed through `sessionsIncluded`. Add no silent subset.

**Non-goals.** No new prompt, model, provider, or ceiling. No change to
`TRAINING_HISTORY_WINDOW_DAYS`, `TRAINING_HISTORY_MAX_SESSIONS`, or the
`context.ts` sub-budgets — ADR-013 amendments, not builder decisions. No UI;
that is M3-15E and M3-16. **No live provider call:** every check is fixture.

**Acceptance criteria:**

1. A production `CoachAIContextSource` exists and is what the composition root
   receives for a real request; every existing stub stays test-only.
2. A completion carrying a field outside the allowlist cannot reach a provider
   payload, and a test proves it by adding one.
3. An owner with no confirmed zone is refused rather than defaulted.
4. `correction_reason` and `correctionReason` appear nowhere under `src/`.
5. The `coach-ai-service` and `context` suites still pass, changed only where
   `correctionReason` was removed.

**Expected files:** `src/server/ai/context-source.ts`,
`src/server/training/training-history-context.ts`, `src/server/ai/contracts.ts`,
`ai/fixtures/fixture-corpus.ts`, their tests, and one new production module.

**Project skills:** none — server-only, no React, no route, no visible surface.

Read only this section unless you hit an ambiguity it does not resolve.

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

The scope below was narrowed on 29 August 2026; the `## Agent brief` above was
written by the lead on 14 September 2026 against it and against the code as it
actually stands. **Tier 1 dispatch was approved by the product owner on
14 September 2026**, together with these five decisions:

1. **The data boundary is approved as the allowlist already defines it.** Up to
   20 completions from the last 56 owner-local days, carrying `localDate`,
   `status`, `title`, `sport`, `durationMinutes`, `perceivedEffort`, `feeling`,
   the four health booleans, `note` (400 chars), `replacementDescription`
   (240), and `activityNames` — plus goals, memory, the profile zone, and the
   plan slice. The product owner was asked to approve the four health signals
   deliberately and separately, because ADR-013 approved them in the abstract
   on 9 August 2026 and this ticket is where real pain, illness, injury, and
   severe-fatigue data first leaves for a US provider. Approved as listed.
2. **Fixture-only.** No live provider call in this ticket, continuing the
   standing 12 August 2026 position. The consequence is accepted and recorded:
   M3-15D ships without ever having been exercised against `gpt-5.6-luna`, so
   whether the real provider holds the contract stays open, as it does for
   M3-02 limitation 3.
3. **`correctionReason` is deleted**, per the 29 August 2026 ADR-013 amendment.
4. **The `readPlanWindowToppedUp` write side effect is accepted**, per ADR-017
   consequence 3 — deliberately the opposite of M3-15C, where viewing history
   must not materialize future occurrences.
5. **`actualStartedAt` stays out of the allowlist.** It exists on every
   completion and is coaching-relevant, but the case was not judged strong
   enough to widen what leaves the country on the first real run. Adding it
   later is an ADR-013 amendment, not a builder decision.
