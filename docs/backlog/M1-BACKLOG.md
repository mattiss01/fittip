# M1 backlog

**Planning state:** On 28 July 2026 the product owner revised the first product
milestone and approved F-002 plus M1-01 through M1-03. M1-01 is accepted.
M1-02 and M1-03 are in development in separate ticket branches and isolated
worktrees under the ownership plan below. M1-04 and M1-05 remain proposed.

The governing visible-behavior brief is
[F-002 Manual training planning and factual tracking](../product/F-002-MANUAL-TRAINING-PLANNING-TRACKING.md),
which is approved.

The conceptual entities and milestone boundaries are shown in the
[visual data-model overview](../product/DATA-MODEL-OVERVIEW.md).

The former proposed goals/memory/intake briefs moved to
[M2](M2-BACKLOG.md). AI proposal briefs moved to [M3](M3-BACKLOG.md). No moved
ticket was approved or implemented by the renumbering.

**Founder boundary:** product-owner or synthetic data only, locally or in
accepted M0-06A founder staging. The separate [M0 backlog](M0-BACKLOG.md)
continues to govern every pre-friends/public/commercial requirement.

| Priority | Ticket | Status | Depends on | Scope | Approval gate |
|---|---|---|---|---|---|
| P1 | [M1-01 Training records and ownership foundation](M1-01-TRAINING-RECORDS-FOUNDATION.md) | accepted | M0-03 and M0-02-C1 accepted; M0-06A for hosted testing | Owner-scoped personal activities, immutable selected 1–7-day plan versions, planned sessions/activities, separate completions, generic measurements, RLS, concurrency | Product-owner acceptance recorded 28 July 2026 |
| P1 | [M1-02 Manual selectable-horizon training planning](M1-02-SELECTABLE-HORIZON-PLANNING.md) | in development | M1-01 accepted | Mobile 1–7-day selector and plan; create/edit/move/remove future sessions; personal activities; locks; explicit version save | Builder dispatched 28 July 2026; implement and independently review |
| P1 | [M1-03 Quick training logging](M1-03-QUICK-TRAINING-LOGGING.md) | in development | M1-01 accepted | Planned/unplanned quick actual; completion statuses; duration/effort/feeling/notes; replacements; correction history | Builder dispatched 28 July 2026 in an isolated worktree; implement and independently review |
| P1 | [M1-04 Today, history, and mobile navigation](M1-04-TODAY-HISTORY-NAVIGATION.md) | proposed | M1-02 and M1-03 accepted | Today action surface, plan-versus-actual history, versions/corrections, authenticated navigation and honest states | Approve navigation/default/Today/history/You/state-copy/safe-return/accessibility design |
| P1 | [M1-05 Consolidated M1 validation](M1-05-M1-VALIDATION-SLICE.md) | proposed | M1-01 through M1-04 accepted | Independent clean-migration, RLS, invariant, 390px end-to-end, accessibility, privacy/security, and regression validation | Dispatch only after all four slices are accepted and approve validator/evidence matrix |

## Dependency chain

```text
M1-01 training record foundation
  -> M1-02 manual planning
  -> M1-03 quick actual logging
  -> M1-04 Today and plan-versus-actual history
  -> M1-05 independent validation
```

M1-02 and M1-03 are approved and M1-01 is accepted. They may proceed in
parallel only with isolated worktrees and an explicit non-overlap/merge plan;
otherwise M1-03 remains queued. M1-04 integrates their accepted behavior.
M1-05 validates but adds no product behavior.

## M1-02 / M1-03 parallel ownership plan

**Isolation**

- M1-02 uses branch `ticket/m1-02-selectable-horizon` in worktree
  `.worktrees/m1-02`.
- M1-03 uses branch `ticket/m1-03-quick-logging` in worktree
  `.worktrees/m1-03`.
- The builders do not edit the root `master` worktree or each other's
  worktree.

**M1-02 ownership**

- `src/app/home/plan/**`, `src/components/planning/**`, and
  `src/features/planning/**`;
- the current-plan read operation in
  `src/server/repositories/training-record-repository.ts`;
- its existing `src/app/home/page.tsx` entry link and planning styles in
  `src/app/globals.css`;
- M1-02-specific unit, component, browser, and validation files.

**M1-03 ownership**

- a new completion domain module and a separate completion repository rather
  than edits to the M1-02-owned training-record repository;
- `src/app/home/log/**`, completion components, and route-local CSS modules;
- a forward-only M1-03 completion-write migration/RPC and its database tests;
- completion-related generated database-type updates and M1-03-specific unit,
  component, browser, and validation files.

**Shared boundaries and integration owner**

- M1-03 must not edit the Plan UI, `src/app/home/page.tsx`, or
  `src/app/globals.css`. Its direct mobile demo route may accept an optional
  planned-session id; M1-04 owns final Today/Plan navigation into logging and
  the post-save return path.
- Neither builder edits the other's validation record. Any unavoidable shared
  configuration edit must be reported before it is made and is serialized by
  the lead.
- The preferred merge order is M1-02 followed by M1-03, although either
  independently accepted ticket may merge first when the recorded boundaries
  remain disjoint. After both merges, the lead owns a combined full regression,
  migration, and `390x844` integration run before M1-04 starts.

## Milestone exit

The owner can select how many of the next 1–7 days to plan, create that
sport-agnostic plan, see today's training, record actual training without
changing the plan, and inspect preserved plan-versus-actual history at
`390x844`.

## Ticket rule

Approval is the automatic dispatch trigger only when dependencies are
accepted. The lead marks that one ticket `in development`, spawns a distinct
builder before any implementation edit, and spawns a different independent
reviewer after handoff. An approved ticket with unmet dependencies remains
queued.
