# M3-10 validation record: rolling-plan foundation

**Ticket:**
[M3-10](../../backlog/M3/M3-10-ROLLING-PLAN-FOUNDATION.md)

**Lifecycle state:** in development

**Tier:** 1 — schema, authorization, RLS, privileged writes, and concurrency

**Product-owner approval:** 14 August 2026

**Branch:** `ticket/m3-10-rolling-plan-foundation`

**Implementation base:**
`ef1a0de4e0d4e8e5d2fe4d3d7a8ada056535dbb7`

**Exact implementation review target:** pending builder commit

**Initial implementation commit:** pending

**Builder correction commits:** none yet

## Delivered behavior

Pending builder handoff. The approved contract is a dormant foundation and has
no user-visible route or activated consumer.

## Mobile demo path

None for this ticket. M3-10 intentionally changes no visible Plan behavior.
The existing `390x844` CI flows must remain green as regression evidence.

## Changed files

Pending builder commit. Record `git diff --stat
ef1a0de4e0d4e8e5d2fe4d3d7a8ada056535dbb7..<review-target>` here, followed only
by navigation notes for non-obvious files and explicit deleted/renamed entries.

## Data, migration, API, privacy, and security effects

Pending implementation evidence. The approved direction is one forward local
migration, owner-scoped dormant records, a least-privilege owner-derived atomic
transaction, RLS and same-owner constraints, generated types, and no browser
storage, external service, provider call, spend, old-data mutation, activation,
or hosted builder command.

## Tests and final results

**Exact-commit CI:** pending builder commit and push.

| Command or check | Result |
|---|---|
| `git diff --check` | Pending builder handoff |
| Hosted Vercel Preview | Pending lead push and deployment |
| Founder migration/history/RLS verification | Pending independently reviewed commit |

The builder uses focused tests while implementing. The exact reviewed commit's
CI run is the recorded evidence for formatting, lint, TypeScript, Vitest, build,
clean migrations, database lint/advisors, pgTAP, concurrency, and browser flows.

## Known limitations

- The new model remains dormant; no application consumer may read or write it.
- No recurrence, saved-session library, Recovery day label, completion path,
  proposal behavior, AI call, migration of old data, activation, or cutover is
  part of M3-10.
- Builder work is local and branch-only. Hosted migration application and
  founder verification remain lead-owned gates after independent review.

## Independent reviewer checklist

- Review the exact builder commit recorded above, not an uncommitted tree.
- Reconcile the complete manifest against `git diff
  ef1a0de4e0d4e8e5d2fe4d3d7a8ada056535dbb7..<review-target>` and report every
  omitted, unexpected, out-of-scope, or inaccurately described file.
- Apply `code-review` with separate Standards and Spec axes, using the M3-10
  Agent brief as the spec and the exact fixed point above.
- Confirm the module interface is small and both Postgres and in-memory adapters
  exercise the same behavior without leaking persistence mechanics to callers.
- Confirm ownership derives from verified Auth, direct mutation cannot bypass
  atomic history, and RLS/grants/same-owner constraints deny anonymous and
  cross-owner access.
- Confirm cancellation, rollback, idempotency, stale revision, and genuine
  same-revision concurrency preserve current state, history, and revision as one
  atomic unit.
- Confirm no legacy table/data, visible route, consumer, AI/provider path,
  remote resource, secret, or later F-005 slice changed.
- Use the exact-SHA CI run for automated suites; do not duplicate those suites
  during review. Judge the diff, authorization boundary, evidence honesty, and
  matching Vercel Preview.
