# M3-15F: Roadmap generation, acceptance, and privilege re-grant

**Status:** proposed — not approved for implementation, and without an
`## Agent brief`. Split out of
[M3-15E](M3-15E-ROADMAP-RESTORATION.md) on 14 September 2026, when the lead
measured the restoration and found a clean read/write seam. See that ticket's
*Rescope* section for the measurement and the reasoning.

**Triage:** needs-triage

**Milestone:** M3

**Priority:** P1

**Tier:** 1 — re-grants five privileged functions M3-11 revoked, and needs a
hosted founder migration applied and verified before acceptance.

**Depends on:** [M3-15E](M3-15E-ROADMAP-RESTORATION.md) accepted. There is no
surface to put controls on until it is. M3-15D supplies the context source and
is merged as `85567a9`.

**Blocks:** [M3-16](M3-16-AI-PROPOSAL-APPLICATION.md).

## Scope

- One forward migration re-granting `begin_roadmap_generation`,
  `finish_roadmap_generation`, `record_roadmap_memory_candidates`,
  `apply_roadmap_proposal_change`, and `accept_roadmap_proposal`, revoked at
  lines 67–79 of `20260814195107_m3_11_legacy_training_reset.sql`. Re-grant
  without changing the accepted roadmap product contract or any preserved
  record.
- Wire generation and regeneration through `coach-ai-service`'s existing
  `create_roadmap` operation and M3-15D's `CoachAIContextSource`.
  `roadmap-service.ts` is not restored; `coach-ai-service.ts` replaces it.
- Add the action-bearing controls to the surface M3-15E restored: generate,
  regenerate with feedback, edit, decline, accept. The copy already exists in
  `ROADMAP_COPY`.
- Rebuild the editing surface deleted with `src/components/roadmap/` — 364
  lines of `roadmap-editor.tsx` and the acting parts of the 799-line
  `roadmap-manager.tsx` — against whatever read components M3-15E built. This
  is a rewrite, not a revert; `completion-repository.ts` and
  `training-record-repository.ts` no longer exist.
- Update `src/architecture/m3-11-legacy-reset.test.ts` for
  `plan/roadmap/actions.ts` deliberately. `plan/proposal/page.tsx` stays on the
  maintenance module — that is M3-16.
- Owner, anonymous, and cross-owner checks on every re-granted function, proven
  in pgTAP against the function itself and not only through table RLS.
- Hosted evidence per AGENTS.md: apply the exact committed migration to the
  founder Supabase project in timestamp order, confirm remote history contains
  the repository's exact versions, verify the privilege boundary and advisors,
  exercise the authenticated hosted read path, and record all of it before
  requesting acceptance. The lead cannot produce any of this; write the runbook
  as one paste-ready block for the product owner before dispatch.
- The 390px pass.

## Non-goals

- No change to the roadmap product contract, the `fittip.roadmap.v2` schema, or
  any preserved roadmap record.
- No proposal application, per-item decisions, or regeneration of the applied
  plan — M3-16 and the rewritten M3-03B.
- No new prompt, provider, model, or spend ceiling.

## Known input

M3-09 records a real same-key concurrency copy defect on the roadmap surface,
parked and outside the F-005 chain. It is reachable only through generation, so
it lands here. This ticket is the first to put that path back in front of the
owner and should confirm the defect's current behaviour deliberately rather
than rediscover it during acceptance.

## Decisions needed before dispatch

1. **The live provider call.** Every AI ticket since 12 August 2026 has shipped
   fixture-only, and M3-15D's limitation records that the contract has never
   been exercised against `gpt-5.6-luna`. This is the ticket where a roadmap
   either generates for real or does not generate at all. If a live call is
   authorized it needs explicit per-run approval naming the exact call count,
   against the standing €10/month cap.
2. **Whether acceptance is in scope or splits again.** Generation and
   acceptance are separable: generating a proposal writes nothing the owner
   sees as current. Splitting would keep the first live-call ticket smaller.
3. **M3-09.** Confirm the defect's behaviour, fix it here, or re-park it with
   the reason recorded.

## Approval boundary

This shell records the scope only. The exact contract requires an
`## Agent brief` and separate product-owner approval before dispatch, and the
three decisions above have to be answered first.
