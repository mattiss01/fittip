# M3-15E: Roadmap surface restoration, read-only

**Status:** accepted — by the product owner on 15 September 2026 against
independently reviewed `693bd46`, after three review rounds; merged as
`3570c25`. Brief written, rescoped and Tier 2 dispatch approved on
14 September 2026. Split out of
[M3-15](M3-15-REPLACEMENT-CONSUMER-READINESS.md) on 29 August 2026, and split
again on 14 September 2026 — see *Rescope*.

**Triage:** needs-triage

**Milestone:** M3

**Priority:** P1

**Tier:** 2 — user-visible behaviour on an accepted schema and authorization
boundary. No migration, no privilege re-grant, no provider call.

**Depends on:** [M3-15D](M3-15D-AI-COMPLETION-CONTEXT.md) accepted and merged,
which it is, as `85567a9`. The dependency is real but narrower than it was
before the rescope: this ticket reads `hasSafetySignal` from M3-15D's
`selectTrainingHistoryContext` rather than building a second predicate over
completions.

**Blocks:** [M3-15F](M3-15F-ROADMAP-GENERATION.md), which puts controls on the
surface this ticket restores.

## Agent brief

**Outcome.** Restore `/home/plan/roadmap` from its `TrainingMaintenance` stub as
a read-only surface: the owner's current roadmap version, its history, and any
proposal left open, assembled server-side into one `RoadmapScreenState`.

**Tier:** 2 — user-visible behaviour on an accepted schema and authorization
boundary; every read is a plain table read under existing RLS. Stop and
re-dispatch as Tier 1 if a grant or migration turns out to be needed.

**Hard constraints:**

- Read only through `createRoadmapRepository()`, `createGoalRepository()` and
  `createMemoryRepository()`. No new SQL, no new client, no caller-supplied
  owner id.
- **Call none of the five revoked functions** (`begin_roadmap_generation`,
  `finish_roadmap_generation`, `record_roadmap_memory_candidates`,
  `apply_roadmap_proposal_change`, `accept_roadmap_proposal`). They are revoked
  from every role and stay revoked; they belong to M3-15F. The repository's read
  methods hit `roadmap_heads`, `roadmap_versions` and `roadmap_proposals`
  directly and need no grant.
- No Server Action, no write path, no `revalidatePath`. This mirrors M3-15C.
- Copy comes from `ROADMAP_COPY` in `roadmap-records.ts`. Do not inline a
  string; those wordings are approved product decisions.
- Every action-bearing control from the deleted surface is absent, not present
  and inert. No "Generate roadmap proposal" button that does nothing.
- An open or expired proposal is shown as a record carrying its decision state,
  including the `expired` state M3-11 wrote. It is not actionable here.
- `hasSafetySignal` comes from `selectTrainingHistoryContext` (M3-15D), not a
  fresh predicate over completions.

**Non-goals.** No generation, regeneration, acceptance, decline or edit — all
M3-15F. No migration, no privilege re-grant, no provider call, prompt, model or
spend change. No change to `fittip.roadmap.v2` or any preserved record.
`/home/plan/proposal` stays on the maintenance stub; that is M3-16.

**Acceptance criteria:**

1. `/home/plan/roadmap` renders the owner's current roadmap and its history at
   390px, and an honest empty state for an owner with neither.
2. An expired proposal appears as history with its state, and no control offers
   to act on it.
3. No code path reaches any of the five revoked functions, and a test proves it.
4. `m3-11-legacy-reset.test.ts` is updated deliberately for `page.tsx` only.
   `actions.ts` stays listed — this ticket creates none.
5. Signed-out and cross-owner access behave as every other `/home` route does.

**Expected files:** `src/app/home/plan/roadmap/{page.tsx,roadmap.module.css,
error.tsx,loading.tsx}`, read-only components under `src/components/roadmap/`,
their tests, and `src/architecture/m3-11-legacy-reset.test.ts`.

**Reference, not a target:** the deleted surface is at `e370dbe~1`, where
`roadmap-spine.tsx` is closest to this read view. `roadmap-service.ts`,
`completion-repository.ts` and `training-record-repository.ts` are gone for
good; do not restore them.

**Project skills:** `frontend-design` and `vercel-react-best-practices`, both at
`.agents/skills/<name>/SKILL.md`.

Read only this section unless you hit an ambiguity it does not resolve.

## Rescope, 14 September 2026

The 29 August shell described this ticket as re-granting five functions and
restoring "roughly 1,300 lines". Measured against `e370dbe`, the real deletion
is **4,239 lines**: 1,835 under `src/app/home/plan/roadmap/`, 1,855 under
`src/components/roadmap/`, and 549 for `roadmap-service.ts` and its test.

The shell is also right that `roadmap-records.ts`, `roadmap-edit.ts`, and
`roadmap-repository.ts` survive untouched, but does not say that four
dependencies of the deleted surface do not: `roadmap-service.ts`,
`completion-repository.ts`, `training-record-repository.ts`, and the whole of
`src/components/roadmap/`. So the restoration is a rewrite against
`coach-ai-service` and M3-15D's context source, never a revert.

One of those four needs no replacement. `coach-ai-service.ts` already handles
the `create_roadmap` operation, so `roadmap-service.ts` does not come back.

**The seam the split uses.** All five revoked functions are mutations. Every
roadmap *read* in `roadmap-repository.ts` goes directly at `roadmap_heads`,
`roadmap_versions` and `roadmap_proposals` under ordinary RLS — lines 114–223,
no RPC. A read-only roadmap surface therefore needs no migration and no
re-grant whatsoever.

That is why the split falls where it does, and the reason is not only size. As
shelled, the ticket would have re-granted execute on five privileged functions
in the same change that built a surface which mostly does not call them.
Splitting means the privilege arrives with its caller. The product owner chose
this split on 14 September 2026 over keeping one ticket.

## Non-goals

- No change to the roadmap product contract, the `fittip.roadmap.v2` schema, or
  any preserved roadmap record.
- No privilege re-grant, migration, or hosted founder database step — M3-15F.
- No generation, proposal application, per-item decisions, or regeneration —
  M3-15F, M3-16, and the rewritten M3-03B.
- No new prompt, provider, model, or spend ceiling, and no live provider call.

## Known input

M3-09 records a real same-key concurrency copy defect on the roadmap surface,
parked and outside the F-005 chain. It is reachable only through generation, so
it belongs to M3-15F rather than here; this ticket cannot trigger it because it
issues no writes.

## Approval boundary

The `## Agent brief` above was written by the lead on 14 September 2026 against
the code as it actually stands. The product owner approved the E/F split on
14 September 2026 and, as a separate decision the same day, **approved Tier 2
dispatch of this ticket**. No further product-owner prompt is needed to spawn
the builder and the independent reviewer.
