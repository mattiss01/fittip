# M2 milestone closeout

**Lifecycle state:** in progress — platform evidence complete, awaiting the
product owner's hosted walkthrough and decision

**Approval:** On 29 July 2026 the product owner requested the smallest useful
M2 validation slice, following the targeted M1 closeout model. Execution was
queued in [M2-04](../../backlog/M2/M2-04-M2-VALIDATION-SLICE.md) until M2-01
through M2-03 were individually accepted, merged, pushed, deployed, and hosted-
verified. All three conditions were met on 3 August 2026.

**Accepted slices:** [M2-01](M2-01-VALIDATION.md), [M2-02](M2-02-VALIDATION.md),
and [M2-03](M2-03-VALIDATION.md)

## Purpose

Close M2 without repeating the exhaustive database, RLS, concurrency, domain,
mobile, accessibility, privacy, and independent-review evidence already
recorded for its three accepted slices. This closeout adds no product, schema,
external-service, or AI behavior.

## Approved targeted evidence

The five checks approved in M2-04. Items 1, 3, 4 and the non-sensitive half of
5 are the lead's; item 2 and the attestation in 5 are the product owner's,
because the founder credentials are private.

## Exit rule

If the walkthrough or an authorization boundary fails, M2 remains open and the
finding returns to its owning accepted ticket as a focused correction. Otherwise
this record moves to **accepted**, M2 closes, and
[M3-01](../../backlog/M3/M3-01-LOCAL-AI-ADAPTER-CONTROLS.md) becomes
dependency-ready but remains separately proposed.

## Evidence

### Git and founder deployment

Every accepted M2 commit is an ancestor of pushed `master` at `2691eb3`:

| Ticket | Accepted commit | On `master` |
| --- | --- | --- |
| M2-01 | `ae7d3104` (`6542693` merged) | yes |
| M2-02 | `e5dab525` | yes |
| M2-03 | `2dd7824c` | yes |

Two commits have landed since M2-03's acceptance — `7f277b6` (its acceptance
record) and `2691eb3` (the M2-09 continuous-integration stopgap). Their combined
diff touches only `docs/` and `.github/workflows/ci.yml`. No file under `src/`,
`supabase/`, or `next.config.ts` changed, so M2-03's post-merge hosted database
evidence is not invalidated by anything after it.

Founder deployment `dpl_8vN1B9Rqqv5D8FJUkWDGUkTNdsno` is `Ready`, built from
branch `master`, and carries the `fittip-gilt.vercel.app`,
`fittip-mattis-3657s-projects.vercel.app`, and `fittip-git-master-...` aliases.

### Anonymous hosted boundary

Unauthenticated requests against the founder alias on 3 August 2026:

| Path | Result |
| --- | --- |
| `/` | `200`, sign-in surface |
| `/home/you` | `303` to `/` |
| `/home/you/onboarding` | `303` to `/` |

Both protected responses carry
`Cache-Control: private, no-cache, no-store, must-revalidate, max-age=0`,
`Pragma: no-cache`, `Expires: 0`, and
`X-Robots-Tag: noindex, nofollow, noarchive`. `/home/you/onboarding` is M2-03's
new surface and is covered by `src/proxy.ts`'s `/home/:path*` matcher rather
than by a route-specific rule.

Runtime logs for the exact founder deployment contain no `error` or `fatal`
entry. Every record is `level: info` on `branch: master`.

### Hosted database — reused, not re-queried

M2-03 recorded post-merge hosted verification on 3 August 2026: hosted migration
history ending at exact repository version `20260802201214`, all six onboarding
tables present with RLS enabled, and advisors showing only the intentional
authenticated-access entries, the pre-existing founder-staging leaked-password
warning, pre-existing unindexed foreign keys, and expected unused indexes.

That evidence is reused here under M2-04's "evidence reused without automatic
rerun" clause. The repository holds nine migrations and the newest is the one
hosted history ends at, so the hosted schema is current by inspection. **The
hosted database was not independently re-queried today**, because nothing
between M2-03's verification and `2691eb3` changed a migration, and because a
remote Supabase query needs the product owner's per-occasion override. If a
fresh confirmation is wanted before acceptance, say so and it will be run.

### Context eligibility for future AI

Memory has an explicit, documented, tested gate.
`selectActiveMemoryContext` (`src/server/memory/memory-records.ts:98`) admits an
item only when `status === "active"` and its review date has not passed. The
status set is exactly `active`, `proposed`, `rejected`, `archived`, and its unit
tests assert the admit/exclude decision for all four plus an expired-but-active
item, so the gate is covered exhaustively rather than by sample.

One naming note, because M2-04 step 3 asks about "a disabled context item" and
no such status exists. **Disabled is the user-facing name for `archived`** —
`src/components/memory/memory-manager.tsx:97` maps the status to the "Disabled"
label, and the surface says "Disabled memory stays inspectable and is excluded
from coaching context." Disabling is `archived`, which the selector excludes and
the tests cover. `disabled` and `enabled` do exist as `MEMORY_CHANGE_KINDS`, the
history verbs, and `inferred_proposed` is a provenance rather than a status.
The vocabulary diverges between the UI and the data model; the behavior asked
for is present.

Onboarding candidates are excluded structurally rather than by a filter. Drafts
and candidates live in six dedicated `onboarding_*` tables, each with RLS
enabled and owner-scoped policies, and reach `goals` or `memory_items` only
through explicit publication. A draft or rejected candidate is therefore not a
row the memory selector could return.

**Goals have no equivalent selector.** See the finding below.

### No-AI boundary

The full dependency set is `@supabase/ssr`, `@supabase/supabase-js`, `next`,
`react`, `react-dom`, `server-only`, and the toolchain. No AI provider or SDK is
declared, and no module under `src/` references a provider, model call, or
generation entry point. M2 introduces no provider call, generated plan, silent
inference, or direct AI write.

### Private owner walkthrough

**Pending the product owner.** Not yet performed.

## Findings

### F1 — no active-goal context selector

M2-04 acceptance criterion 3 requires that only active, explicitly accepted
**goals and memory** be eligible for future AI context. Memory satisfies this
through `selectActiveMemoryContext`. Goals do not have a counterpart.

The data supports the distinction: `goals.status` is constrained to `active`,
`paused`, `achieved`, or `abandoned`, and a check constraint ties `archived_at`
to a non-`active` status. What is missing is the accepted contract — no function
expresses "these are the goals an AI may read", and no test asserts that a
paused, achieved, abandoned, or archived goal is excluded.

Nothing is broken today, because nothing reads goals for AI. The cost is that
[M3-01](../../backlog/M3/M3-01-LOCAL-AI-ADAPTER-CONTROLS.md) would have to
invent that boundary itself, in the ticket that first introduces a provider —
which is the worst place to be defining what an AI is allowed to see.

Two honest dispositions, both the product owner's decision:

- **Accept M2 and carry F1 into M3-01** as an explicit named precondition, so
  the adapter ticket cannot start without defining the goal gate first.
- **Return a focused correction to M2-01**, adding `selectActiveGoalContext`
  with its unit tests before M2 closes. Small and self-contained; it is a pure
  server-side selector with no schema, UI, or authorization change.

## Acceptance

Pending. The decision requested is: **accept M2 as the goals, editable
coaching-context, and guided-onboarding foundation, or return a focused
correction to its owning ticket** — together with the disposition of F1.
