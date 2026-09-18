# ADR-018: The lead agent applies founder-staging migrations

**Status:** accepted

**Date:** 18 September 2026

**Approval:** The product owner asked for it directly on 18 September 2026,
chose the scope from four options, and accepted the risk recorded below.

**Amends:** ADR-007, which created the founder-staging environment. Nothing
about that environment's classification, cost posture, or data boundary
changes. This ADR changes only who may run the commands that reach it.

## Context

Every schema ticket ended the same way: the lead prepared a migration, and the
product owner ran four terminal commands to apply it, because `supabase link`
and `db push` were denied to agents in `.claude/settings.json`. The product
owner has now done that often enough to object to it, which is the honest
signal that the friction outweighed what it bought.

What it bought was a human between a generated migration and the only copy of
the owner's training data. What it cost was a manual step in the middle of
every schema change, held by the one person the process exists to serve.

Two facts lower the stakes. ADR-007 classifies this environment as *disposable
founder staging, not production*, with no backup or durability promise. And
since 18 September 2026 every migration passes a continuous-integration run
that applies all migrations from zero, proves the RLS and privilege boundary in
pgTAP, and runs the database advisors, before anything reaches the hosted
project.

## Decision

The lead agent may apply migrations to the founder Supabase project, and may
read from it for diagnosis. Specifically it may run `supabase link`,
`db push --linked`, `migration list --linked`, `db advisors --linked`,
`db dump`, `db diff`, and `inspect`.

It may not run `db reset --linked`, `migration repair`, `db remote`,
`secrets`, `projects`, or `branches`. Wiping the database, rewriting its
migration history, reading or writing its secrets, and altering the project or
its paid branches stay outside what an agent may do.

Three conditions bind every hosted apply:

1. **A green CI run for the exact commit first.** That run is what proves the
   migration applies from zero and keeps the ownership boundary intact. Without
   it there is no apply.
2. **Verify and report afterwards.** `migration list --linked` must show the
   repository's exact version in remote history, and the security advisors must
   be clean. Both outputs go to the product owner and into the merge log.
3. **Destructive DDL still asks first.** A migration containing `drop table`,
   `drop column`, `truncate`, or an unfiltered `delete` goes to the product
   owner before it is applied, whatever the permissions allow.

`db dump` reaches the product owner's real training data. It stays on this
machine: no agent sends that data to an external service, and no AI provider
call is composed from it. The ADR-013 allowlist remains the only path by which
training history reaches a model.

## Consequences

- A schema change now completes without the product owner running anything,
  which is the point.
- A bad migration reaches the hosted database without a human in between. CI is
  the check that replaces that human, so weakening CI now costs more than it
  did before, and the known-defect habit of re-running a red run until it is
  green would be a direct route to hosted data loss.
- The environment has no backup. If a migration destroys data, it is gone. This
  was already true when the product owner applied migrations by hand; the
  change is who is holding the tool.
- If this environment is ever reclassified as production, or once it holds
  anyone's data but the product owner's, this ADR is superseded rather than
  extended. A second person's data is not the product owner's to risk.
