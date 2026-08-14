# M3-17: Final rolling-plan closeout

**Status:** proposed — not approved for implementation

**Triage:** needs-triage

**Milestone:** M3

**Priority:** P1

**Tier:** 3 unless an integration defect requires a separately scoped ticket

**Depends on:** M3-10 through M3-16 and rewritten M3-03B accepted.

**Blocks:** completion of the rolling-plan replacement.

## Outcome

Close the replacement milestone after every user-visible and persistence path
is already active. Confirm that the founder environment presents one coherent
rolling-plan experience and record the narrow integrated evidence not already
owned by an accepted ticket.

## Scope to preserve when this ticket is drafted for approval

- Verify authentication plus the complete `390x844`
  Plan/Today/logging/Progress/AI story against the already-deployed replacement
  model.
- Reconcile the accepted ticket evidence, current migration history,
  schema/RLS/privilege/advisor state, owner reads/writes, denied cross-owner
  access, and preserved non-training domains without duplicating each suite.
- Confirm no application or database dependency on the removed legacy training
  model remains and no maintenance state is still reachable from primary
  navigation.
- Record the final founder deployment SHA and immutable URL.

## Non-goals

- No destructive migration, activation switch, schema addition, data rewrite,
  compatibility path, AI/provider change, or new product behavior.
- No second exhaustive M3-05-style test pass. A defect discovered here receives
  its own correctly tiered ticket instead of being repaired inside closeout.
- No friend, public, commercial, or external-user launch.

## Approval boundary

This shell records the approved revised decomposition only. After every
dependency is accepted, draft the smallest honest closeout contract and obtain
separate product-owner approval. If the work turns out to change user-visible
behavior, schema, authorization, privacy, or spend, stop and re-tier it rather
than treating it as documentation-only closeout.
