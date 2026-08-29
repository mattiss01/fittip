# M3-15E: Roadmap restoration and privilege re-grant

**Status:** proposed — not approved for implementation. Split out of
[M3-15](M3-15-REPLACEMENT-CONSUMER-READINESS.md) on 29 August 2026.

**Triage:** needs-triage

**Milestone:** M3

**Priority:** P1

**Tier:** 1 — re-grants five privileged functions M3-11 revoked, and needs a
hosted founder migration applied and verified before acceptance.

**Depends on:** [M3-15D](M3-15D-AI-COMPLETION-CONTEXT.md) accepted and merged.
The roadmap cannot generate anything until a production
`CoachAIContextSource` exists; M3-11 revoked these grants precisely "until
replacement completion context existed".

**Blocks:** M3-16.

## Scope

- One forward migration re-granting `begin_roadmap_generation`,
  `finish_roadmap_generation`, `record_roadmap_memory_candidates`,
  `apply_roadmap_proposal_change`, and `accept_roadmap_proposal`, revoked at
  lines 67–79 of `20260814195107_m3_11_legacy_training_reset.sql`. Re-grant
  without changing the accepted roadmap product contract or any preserved
  record.
- Restore `/home/plan/roadmap` from its `TrainingMaintenance` stub. M3-11
  deleted the page, `actions.ts`, `action-state.ts`, the error and loading
  boundaries, and the stylesheet — roughly 1,300 lines. The server modules
  survive untouched: `src/server/roadmap/roadmap-records.ts`,
  `roadmap-edit.ts`, and `src/server/repositories/roadmap-repository.ts`.
- Update the `src/architecture/m3-11-legacy-reset.test.ts` invariant for
  `plan/roadmap/page.tsx` deliberately. `plan/proposal/page.tsx` stays on the
  maintenance module — that is M3-16.
- Hosted evidence per AGENTS.md: apply the exact committed migration to the
  founder Supabase project in timestamp order, confirm remote history contains
  the repository's exact versions, verify the privilege boundary and advisors,
  exercise the authenticated hosted read path, and record all of it before
  requesting acceptance.
- Owner, anonymous, and cross-owner checks on every re-granted function, proven
  in pgTAP against the function and not only through table RLS.
- The 390px pass.

## Non-goals

- No change to the roadmap product contract, the `fittip.roadmap.v2` schema, or
  any preserved roadmap record.
- No proposal application, per-item decisions, or regeneration — M3-16 and the
  rewritten M3-03B.
- No new prompt, provider, model, or spend ceiling, and no live provider call
  without separate explicit per-run authorization naming the exact call count.

## Known input

M3-09 records a real same-key concurrency copy defect on the roadmap surface,
parked and outside the F-005 chain. It is not in scope here, but this ticket is
the first to put that surface back in front of the owner and should confirm the
defect's current behavior rather than rediscover it during acceptance.

## Approval boundary

This shell records the narrowed scope only. The exact contract requires an
`## Agent brief` and separate product-owner approval before dispatch.
