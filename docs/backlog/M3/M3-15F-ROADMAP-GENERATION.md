# M3-15F: Roadmap generation, acceptance, and privilege re-grant

**Status:** in development — the lead wrote the `## Agent brief` below on
16 September 2026 against the product owner's decisions of 15-16 September 2026
(see *Decisions taken before dispatch*), and the product owner approved Tier 1
dispatch on 16 September 2026. Split out of
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

## Agent brief

**Outcome.** Restore the roadmap's write path on the read surface M3-15E
built: generate a proposal, regenerate it with feedback, edit it, decline it,
accept it. With no provider credential configured the built-in fixture coach
answers, and everything it authors is labelled an example wherever it appears.

**Tier:** 1 — re-grants five revoked functions, replaces an accepted function
body, and needs a forward migration applied to the founder project and verified
there before acceptance.

**Hard constraints:**

- **One forward migration.** Re-grant `execute` on `begin_roadmap_generation`,
  `finish_roadmap_generation`, `record_roadmap_memory_candidates`,
  `apply_roadmap_proposal_change` and `accept_roadmap_proposal` **to
  `authenticated` only**, matching the original grants at
  `20260810213904_m3_02_roadmap_proposals.sql:1796-1829`. Do not widen to
  `public`, `anon` or `service_role`. In the same migration, fix M3-09 by
  replacing `begin_roadmap_generation` so that a `unique_violation` raised
  after the advisory lock falls into the replay path the function already has
  for a sequential duplicate. No other schema change.
- **No paid provider call, in any environment.** Generation runs through
  `CoachAIService.propose` and resolves to `FixtureCoachAI`. Leave
  `src/server/ai/enablement.ts` and the `FITTIP_AI_LIVE` gate exactly as they
  are — do not set, bypass, widen or "temporarily" relax any of it.
- **Controls are always visible and always work.** Nothing is hidden by
  environment, and no control is present but inert.
- **Fixture-authored records are labelled examples.** A proposal or version
  whose stored `provider_code` is `fixture` is marked as an example on every
  surface that shows it, history included. `RoadmapProposalView` and
  `RoadmapVersionView` must carry `providerCode` read from the row; never infer
  provenance from `origin`.
- Writes go through the existing `createRoadmapRepository()` methods only. No
  new SQL, no caller-supplied owner id. Server Actions re-verify the owner and
  revalidate the roadmap route.
- Copy comes from `ROADMAP_COPY`, which already holds every control string
  (`generateAction`, `regenerateAction`, `acceptAction`, `editAction`,
  `declineAction`, and their support and confirm strings). New strings — the
  example label included — go there too. Do not inline one.
- pgTAP proves owner, anonymous and cross-owner behaviour against each
  re-granted **function**, not only through table RLS.
- Fix the two copy defects M3-15E deferred; see *Known input*.

**Non-goals.** No live provider call, prompt, model or spend change. No
proposal application to the plan, per-item decisions, or `/home/plan/proposal`
— that is M3-16, and its page stays on the maintenance stub. No change to
`fittip.roadmap.v2`, the roadmap product contract, or any preserved record.

**Acceptance criteria:**

1. At 390px the owner can generate, regenerate within the existing limit, edit,
   decline and accept a proposal from `/home/plan/roadmap`; an accepted
   proposal becomes the current roadmap and the previous version is preserved.
2. Every fixture-authored proposal and version is labelled an example; a
   coach-authored one is not.
3. A test proves generation reaches the fixture adapter and no paid provider
   while live enablement is absent.
4. Two simultaneous same-key generations report the running generation instead
   of a false failure (M3-09), proven in the concurrency harness.
5. Uncertainty entries show their "Why it matters:" and "Watch for:" labels
   again, the M3-02 wordings still inlined in the four roadmap components move
   into `ROADMAP_COPY` unchanged, and `reviewPointsHeading` is used or removed.
6. Anonymous and cross-owner callers are refused by each re-granted function in
   pgTAP.

**Expected to change:** one migration; `src/app/home/plan/roadmap/actions.ts`
(new) and that route's components, including a rebuilt editor;
`src/server/roadmap/roadmap-records.ts`;
`src/server/repositories/roadmap-repository.ts` (view fields only);
`src/architecture/m3-11-legacy-reset.test.ts` (deliberately, for `actions.ts`);
the pgTAP suite and concurrency harness; a per-ticket Playwright config and
spec with its own `testMatch` and port.

**Project skills:** `schema-change`, `vercel-react-best-practices`,
`frontend-design`, `validation-record`.

**Hosted evidence — commands, not a script.** The lead cannot apply the
migration or reach the founder database. On 16 September 2026 the product
owner narrowed this to the fewest possible terminal commands and no SQL
verification: *"it doesnt have to be a script. i just want the commands i need
to run for the migration but not do any sql tests"*. Ship no script and no
verification queries. The product owner runs, in this order:

```bash
npx.cmd supabase link --project-ref <founder project ref>   # only if not linked
npx.cmd supabase db push --linked
npx.cmd supabase migration list --linked
npx.cmd supabase db advisors --linked --type security --level warn
```

Never run any of them yourself, and never write the founder project ref into
the repository. Record their output in the validation record before requesting
acceptance. This deliberately narrows AGENTS.md's hosted verification: nothing
queries the hosted privilege boundary, and the authenticated hosted read is the
product owner's own acceptance pass rather than a scripted check. Record that
narrowing as a known limitation.

Read only this section unless you hit an ambiguity it does not resolve.

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

M3-15E's round 3 review left two copy defects on the read components this
ticket reworks, which the product owner routed here on 15 September 2026 (see
`docs/validation/M3/M3-15E-VALIDATION.md`, *Round 3 review*):

- Restore the M3-02 "Why it matters:" and "Watch for:" labels on uncertainty
  entries in `roadmap-detail.tsx`, via `ROADMAP_COPY`.
- Move the approved M3-02 wordings still inlined in the roadmap `page.tsx`,
  `roadmap-screen.tsx`, `roadmap-detail.tsx` and `roadmap-spine.tsx` into
  `ROADMAP_COPY`, unchanged, and remove or use the orphaned
  `reviewPointsHeading`.

## Decisions taken before dispatch

Answered by the product owner on 15-16 September 2026. They are recorded here
because they shaped the brief; the brief is what a builder reads.

1. **No live provider call.** Not in this ticket. Generation ships against the
   fixture adapter, and the `FITTIP_AI_LIVE` gate is untouched. Authorizing a
   live call, with an exact per-run call count against the standing EUR 10 per
   month cap, remains a separate decision on a later ticket.
2. **The controls are visible and functional even without a credential.** The
   product owner chose this over hiding them or gating them on an environment
   flag, after being told that a fixture generation writes a canned roadmap
   into permanent history: "the founder account is just for testing etc for now
   anyways". The mitigation is the example label in the brief, which rests on
   the `provider_code` of `fixture` that `FixtureCoachAI` already stamps.
3. **Acceptance stays in this ticket** rather than splitting again. Without the
   provider the ticket is already smaller, and accepting is what makes an edit
   matter.
4. **M3-09 is fixed here**, in the same migration, rather than staying parked.
5. **One ticket, and a brief over the 60-line limit.** The drafted brief runs
   82 lines. AGENTS.md treats that as a signal to split, and the lead offered
   two splits — generation then decision, or the reverse. The product owner
   chose to keep the work in one ticket on 16 September 2026, accepting the
   longer brief, one migration and one hosted runbook over two Tier 1 cycles.
   Recorded here so the overrun reads as a decision rather than as drift.
6. **No hosted runbook, and no script either.** The product owner first asked
   for the least possible number of terminal commands, which the lead drafted
   as one committed verification script. On 16 September 2026 they narrowed it
   again — *"it doesnt have to be a script. i just want the commands i need to
   run for the migration but not do any sql tests"* — so the hosted step is a
   short list of CLI commands the product owner runs by hand, with no SQL
   verification of the hosted privilege boundary. On 17 September 2026, after
   the independent reviewer objected that nothing would then prove the
   migration had landed, the product owner added `supabase migration list`.
   The brief under *Hosted evidence* is the authority; this decision was not
   carried into it until 17 September 2026, which caused the reviewer to read
   the validation record as claiming an authorization the ticket did not
   contain. That was a lead error, not a builder one.

## Approval boundary

This shell records the scope only. The exact contract requires an
`## Agent brief` and separate product-owner approval before dispatch, and the
three decisions above have to be answered first.
