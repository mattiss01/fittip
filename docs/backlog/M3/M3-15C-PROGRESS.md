# M3-15C: Progress

**Status:** proposed — not approved for implementation. Split out of
[M3-15](M3-15-REPLACEMENT-CONSUMER-READINESS.md) on 29 August 2026.

**Triage:** needs-triage

**Milestone:** M3

**Priority:** P1

**Tier:** 2 — user-visible behavior on M3-15A's already accepted schema and
authorization boundary. Same escalation rule as M3-15B.

**Depends on:** [M3-15B](M3-15B-TODAY-AND-LOGGING.md) accepted and merged.
Progress has nothing to display until completions can be written.

**Blocks:** nothing in the chain directly; [M3-15D](M3-15D-AI-COMPLETION-CONTEXT.md)
may proceed in parallel order but is sequenced after it.

## Scope

- Restore `/home/progress` and `/home/progress/[id]` from the
  `TrainingMaintenance` stub. M3-11 deleted roughly 660 lines across the two
  routes; this is a rebuild against the replacement model, not a revert.
- Planned versus actual kept visibly separate. Recurrence and replanning never
  rewrite a completion.
- A paginated history slice, and the immutable `planned_snapshot` each
  completion was compared with. F-005 Review history step 4 depends on that
  snapshot being what the completion stored, never a read-through to the live
  plan row.
- Calls `readPlanWindowToppedUp` before reading, per ADR-017 consequence 3.
- Honest empty state: an owner with no completions yet must see that, not an
  error and not a fabricated zero-progress chart.
- Update the `src/architecture/m3-11-legacy-reset.test.ts` invariant for
  `progress/page.tsx` deliberately.
- Owner, anonymous, and cross-owner checks, query bounds, and the 390px pass.

## Non-goals

- No completion writing — that is M3-15B's path, and Progress reads only.
- No AI context, roadmap, or proposal surface.
- No per-activity actual measurements; the schema stays deliberately unused.
- No completion schema change. If one becomes necessary, stop and re-dispatch
  against M3-15A.

## Known input

`CompletionLog.list` enforces no maximum window width, recorded as M3-15A's
non-blocking observation 3. It is owner-scoped and RLS-confined, and matches
the accepted `RollingPlan.getPlanSlice` precedent, so it is existing precedent
rather than a new gap — but this ticket is the first to paginate over it and
should decide its bound explicitly rather than inherit one by accident.

## Approval boundary

This shell records the narrowed scope only. The exact contract requires an
`## Agent brief` and separate product-owner approval before dispatch.
