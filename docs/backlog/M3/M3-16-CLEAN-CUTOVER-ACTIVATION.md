# M3-16: Clean cutover and activation

**Status:** proposed — not approved for implementation or execution

**Triage:** needs-triage

**Milestone:** M3

**Priority:** P1

**Tier:** 1 — destructive migration, activation, permanent data boundary, and hosted deployment

**Depends on:** M3-10 through M3-15 and rewritten M3-03B accepted.

**Blocks:** completion of the rolling-plan replacement.

## Outcome

Activate every accepted replacement consumer together and perform the approved
one-time clean cutover. The founder environment returns as one complete
rolling-plan experience with empty new Plan/completion history and preserved
non-training domains.

This ticket also owns the narrow final hosted milestone closeout. There is no
separate exhaustive M3-05 validation pass.

## Scope to preserve when this ticket is drafted for approval

- A dedicated forward destructive migration that deletes exactly the approved
  pre-cutover plan, proposal, completion, and correction records in a safe order;
  expires affected undecided roadmap proposals; and initializes empty rolling
  plans without backfill, export, or application backup.
- Preserve profiles, goals, memory, onboarding, roadmaps, personal activities,
  spend/accounting, and security/audit records, with recorded count and
  dangling-reference preflights.
- Atomically activate Plan, Today, logging, Progress, and AI context on the
  replacement model; no runtime path may continue using emptied legacy tables.
- Prove the exact migration locally from clean and seeded legacy states and
  independently review the exact commit, migration, grants, RLS, and runbook.
- Verify a maintenance Preview and non-destructive hosted preflights without
  changing founder data, under the approved narrow migration-timing exception.
- Require a separate explicit **Run the destructive cutover** confirmation for
  the exact reviewed commit before touching the founder database.
- After execution, reconcile migration history and verify deployment READY,
  authentication, preserved-domain counts, empty Plan initialization,
  schema/RLS/privileges/advisors, owner and denied cross-owner paths, and the
  complete `390x844` Plan/Today/logging/Progress/AI story.
- Record the final hosted closeout using existing ticket evidence rather than
  duplicating every earlier ticket's automated suite.

## Non-goals

- No dual write, compatibility view, legacy archive, backfill, export, manual
  backup, partial activation, interim manual-only release, or post-commit
  application rollback.
- No new product behavior beyond activation and approved cutover handling.
- No friend, public, commercial, or external-user launch.

## Approval boundary

This shell does not authorize implementation and can never authorize execution
by itself. After every dependency is accepted, the exact migration, runbook,
maintenance UI, verification matrix, and Agent brief require separate
product-owner approval. Applying the founder migration then requires the later
explicit **Run the destructive cutover** confirmation against the exact
independently reviewed commit.
