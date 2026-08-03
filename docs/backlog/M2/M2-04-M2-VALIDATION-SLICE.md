# M2-04: Targeted goals, coaching-context, and onboarding closeout

**Status:** accepted - executed and accepted on 3 August 2026 against `master`
`02ce95e` and founder deployment `dpl_8vN1B9Rqqv5D8FJUkWDGUkTNdsno`. M2 is
closed. Evidence and the decision are in
[the M2 milestone closeout](../../validation/M2/M2-MILESTONE-CLOSEOUT.md); its
one finding was resolved by
[ADR-012](../../decisions/ADR-012-AI-GOAL-CONTEXT-ELIGIBILITY.md)

**Milestone:** M2 - goals, editable coaching context, and guided onboarding

**Priority:** P1

**Feature brief:** [F-003 draft; direction approved](../../product/F-003-GOALS-MEMORY-GUIDED-ONBOARDING.md)

**Direction approval:** On 29 July 2026 the product owner requested the
smallest useful M2 validation slice, following the targeted M1 closeout model.

**Depends on:** [M2-01 accepted](M2-01-GOAL-MODEL-VALIDATION.md), [M2-02 accepted](M2-02-MEMORY-MODEL-MANAGEMENT.md), and [M2-03 accepted](M2-03-INTAKE-FACT-REVIEW.md)

**Blocks:** [M3-01](../M3/M3-01-LOCAL-AI-ADAPTER-CONTROLS.md)

## Outcome

Close M2 without repeating the exhaustive database, RLS, concurrency, domain,
mobile, accessibility, privacy, and independent-review evidence already
recorded for M2-01 through M2-03.

This closeout adds no product, schema, external-service, or AI behavior. If it
finds a problem, the correction returns to the owning accepted ticket and
follows that ticket's implementation, review, Preview, deployment, and
acceptance workflow.

## Evidence reused without automatic rerun

The closeout references the exact accepted validation records for:

- goal ownership, maximum-three enforcement, ranking, lifecycle, concurrency,
  archive/delete, and stale writes from M2-01;
- memory type, provenance, status, history, expiry, disable/delete,
  active-context selection, and sensitive-content behavior from M2-02; and
- onboarding drafts/candidates, explicit review, conflict handling, atomic
  publication, resume/skip/retry/cancel, safety copy, and **You** integration
  from M2-03.

Do not rerun their complete suites unless integration drift, a failed targeted
check, a merge conflict, or another material regression risk invalidates the
accepted evidence.

## Approved minimal closeout target

1. Confirm the exact accepted M2-01 through M2-03 commits are integrated on
   pushed `master` and the founder Vercel deployment is `READY`.
2. At `390x844`, run one owner/synthetic hosted walkthrough:
   **start/resume onboarding -> add and prioritize goals -> add coaching
   context -> review/edit/reject candidates -> publish selected records ->
   inspect and edit the resulting Goals and Coach context under You**.
3. Confirm drafts, rejected candidates, and a disabled context item are absent
   from the active server-side context selector. No AI call is made.
4. Confirm the current hosted migration list, RLS flags for new exposed
   tables, advisor disposition, anonymous protected-route redirect, private
   caching, noindex boundary, and recent runtime-error state.
5. Record product-owner manual attestation for the private walkthrough when
   credentials remain private, together with the lead's non-sensitive platform
   evidence.

## Acceptance criteria

1. The exact accepted M2 commits and their validation records are identified.
2. The single hosted onboarding-to-**You** walkthrough passes at `390x844`.
3. Only active, explicitly accepted goals and memory are eligible for future
   AI context; draft, rejected, disabled, archived, and expired content is
   excluded.
4. Current hosted migration/RLS/advisor and founder-boundary checks have no
   unresolved blocker.
5. No AI provider, plan generation, external-user, analytics, or production
   behavior is introduced.
6. `docs/validation/M2/M2-MILESTONE-CLOSEOUT.md` records the concise evidence
   and the precise decision.

## Execution and handoff

This is a lead-run milestone closeout, not an implementation ticket and not a
second independent feature-review cycle. It requires no ticket branch,
builder, Preview, or exhaustive rerun when it changes no behavior. Existing
ticket evidence remains the source for detailed verification.

The handoff provides the founder URL, exact integrated commits, one mobile demo
path, targeted platform results, known limitations, and the decision:
**accept M2 as the goals, editable coaching-context, and guided-onboarding
foundation, or return a focused correction to its owning ticket**.

## Approval gate

The minimal-closeout direction is approved. Execution remains queued until
M2-01 through M2-03 are individually accepted, merged, pushed, deployed, and
their hosted evidence is recorded. Any proposed expansion beyond this targeted
scope requires a new product-owner decision.
