# M3-13: Private saved-session library

**Status:** accepted 19 August 2026 — against independently reviewed `46c09c0`,
merged as `5e765fe`, founder migration `20260818143303` applied and verified.
Dispatch was approved on 18 August 2026 against this contract. Supersedes the
decomposition shell; the F-005 scope it recorded is preserved below. See
[`docs/validation/M3/M3-13-VALIDATION.md`](../../validation/M3/M3-13-VALIDATION.md).

**Triage:** ready

**Milestone:** M3

**Priority:** P1

**Tier:** 1 — private owner data, schema, authorization, RLS, and visible
behavior.

**Depends on:** M3-12 accepted, merged as `a1aada9`, founder migration applied
and verified (18 August 2026).

**Blocks:** M3-14 recurring session series, and through it M3-15 and the later
F-005 replacement slices.

## Agent brief

**Outcome.** Give the owner a private library of reusable saved sessions at
`/home/plan/saved`, and wire the two copy operations: save an owned planned
session into the library, and add a saved session into the Plan as a new
one-off session on a date the owner picks.

**Tier 1.** New owner-scoped tables, RLS, grants, owner-derived writes, and
visible behavior.

**Hard constraints:**

- One forward migration adding `saved_sessions` and `saved_session_activities`:
  owner-scoped, immutable `user_id`, RLS, deliberate grants, owner indexes, and
  the reusable field shape of `rolling_plan_sessions` and
  `rolling_plan_activities`. Never edit an applied migration.
- A saved session carries **no** `local_date`, `position`, `is_locked`,
  `status`, `cancelled_at`, `plan_id`, occurrence identity, completion state,
  proposal decision, or source history. It adds a required owner-given `name`.
- One mutable current record per saved session. No revision chain, no archive,
  no soft delete. Delete removes the row permanently, and the surface says so
  before it happens.
- Each saved session carries a `revision` the surface sends back on edit and
  delete. A write at a stale revision is refused with an honest conflict the
  owner can recover from; it is never silently applied or silently dropped.
  This is an optimistic token, **not** a revision chain: no history rows, no
  prior versions retained, nothing to browse.
- Save and reuse are **copy-by-value in both directions**. No foreign key from
  a plan session to a saved session, none from a saved session to its source.
  Editing or deleting a library entry changes no planned session already
  created from it, and editing a planned session changes no library entry.
- Reuse into the Plan goes through the existing `apply_rolling_plan_change_set`
  as a plain `add` carrying activities. **Add no new change operation and do
  not modify that function or its receipt.** M3-12's past-date rule (`PT422`)
  and ten-active-per-date cap (`PT423`) apply to a reuse unchanged.
- Library writes derive the owner from `auth.uid()`. Never from a client-sent
  owner, and never from user-editable metadata.
- A `390x844` serious-coach surface with honest loading, empty, invalid,
  offline-safe failure, and keyboard/focus states. An empty library reads as
  empty — never as a failure, a prompt, or something to earn. Use the M3-18
  focus treatment; never reintroduce `#efaa84` or `#f4cba0`. No `"use client"`
  file imports `@/server/**` or a repository.

**Non-goals:** no sharing, global or coach-authored library, cross-owner
discovery, live link, versioning, archive, synchronization, duplicate
detection, merging, or recommendation. No automatic save of AI output and **no
save-from-proposal** — M3-16 owns proposals. No recurrence (M3-14), activity
editor, replacement logging, Progress, regeneration, reset, or past planning.

**Acceptance:** migration applies from a clean reset; pgTAP covers both tables'
constraints, indexes, privileges, RLS, owner access, anonymous and cross-owner
denial, and `user_id` immutability; a test proves editing and then deleting a
saved session leaves a plan session previously created from it untouched, and
the reverse; a reuse that would break the past-date rule or the per-date cap is
refused by the unchanged change function; a concurrency test proves two
same-revision library edits produce one winner and one honest stale loser; both
rolling-plan adapters still pass the shared contract with no edit; a 390px
Playwright flow covers save, list, inspect, edit, reuse onto a date, and
delete; green exact-commit CI.

**Expected to change:** one migration; `src/server/saved-sessions/**`;
`src/server/repositories/saved-session-repository.ts`;
`src/app/home/plan/saved/**` with co-located components, CSS module, and server
actions; save and reuse entry points in `src/app/home/plan/**`;
`database.types.ts`; a new per-ticket Playwright config and spec; this ticket's
validation record.

**Skills.** Builder: `schema-change`, `codebase-design`,
`vercel-react-best-practices`, `frontend-design`, `mobile-e2e`,
`validation-record`. Reviewer: `code-review`, `schema-change`,
`vercel-react-best-practices`, `codebase-design`.

Read only this section unless you hit an ambiguity it does not resolve.

## Why this shape

M3-12 delivered the Plan surface and the owner-local rules. The library is the
first thing built beside it rather than inside it, and M3-14 depends on it: a
recurring series is created "from reviewed fields or the current same-owner
saved-session value without creating a continuing library dependency," which
only works if the copy seam is value-based from the start.

The route sits at `/home/plan/saved` because `/home/plan` already carries
sub-routes (`proposal`, `roadmap`), and both entry points — save from a
session, add from saved — live on the Plan itself.

**This ticket needs no change to `apply_rolling_plan_change_set`.** M3-12's
`add` operation already carries an activity list, so reuse composes out of what
exists. That is deliberate: M3-12's brief required adding no operation a
composed change set already expresses, and the same rule holds here. It also
keeps this migration purely additive — two new tables, nothing touched.

## Decisions taken on 18 August 2026

The product owner resolved both open questions when approving dispatch:

1. **One ticket, not a split.** The lead raised that the brief ran 66 lines
   against the 60-line AGENTS.md limit — the same overrun M3-12 ran, and the
   documented signal to split — and proposed cutting along the server/UI seam
   into a Tier 1 schema half and a Tier 2 integration half. The product owner
   chose to keep one ticket, as with M3-12. The counter-argument recorded at
   the time: a split would leave the Tier 1 half with no user-visible way to
   create a saved session, making its 390px acceptance pass thin.

   Adding decision 2's constraint took the brief to **73 lines**, its final
   length. The overrun is deliberate and every line in it is a live constraint.
   Do not treat it as licence to grow the brief further, and do not trim
   constraints to reach 60.
2. **The library record carries an optimistic revision token.** F-005 forbids a
   revision *chain*, which is not the same as forbidding a concurrency token.
   Without one, two open tabs editing the same saved session overwrite each
   other silently. Everywhere else this codebase produces an honest stale
   loser, and adding the column now costs far less than a later migration. The
   constraint is in the brief; the ban on history, archives, and browsable
   prior versions is unchanged.

## Known follow-ups, deliberately out of scope

- **Activities are not creatable anywhere yet.** M3-12 shipped no activity
  editor and AI proposals are M3-16, so every plan session today has an empty
  activity list. The copy path for activities must still be built and tested,
  but the mobile flow can only demonstrate it if the spec seeds activities
  through a privileged fixture. Expect that in the evidence rather than a
  visible activity list.
- Saving from a Coach suggestion, which F-005 describes, waits for M3-16 to
  make proposals exist.
- `service_role` holds `GRANT ALL` on `public.profiles` while lacking `EXECUTE`
  on `is_iana_timezone_name` (M3-12 validation, limitation 10). Unrelated to
  this ticket's tables, but any new privileged writer should know it.

## Scope preserved from the approved decomposition

- One mutable current record per owner-owned saved session, with create, list,
  inspect, edit, and delete behavior and no revision chain or archive state.
- Explicit save from an eligible owned planned session or Coach suggestion
  without adding, accepting, moving, or otherwise changing Plan content.
- Reuse into a reviewed one-off session now, and a stable copy boundary that
  M3-14 can use for recurring-series templates.
- Reusable sport-agnostic session and activity fields only; exclude dates,
  occurrences, completion state, Plan locks, proposal decisions, and source
  history.
- Duplicate entries allowed, with no automatic matching, merging, deduplication,
  global catalog, sharing, or cross-owner discovery.
- Same-owner references, owner-derived writes, RLS, grants, direct denial tests,
  and the complete mobile save/select/review flow at `390x844`.

## Approval boundary

The F-005 decomposition was approved on 14 August 2026. This contract records
the exact dispatch-ready scope, and the product owner approved Tier 1 dispatch
against it on 18 August 2026 as a separate decision, together with the two
choices recorded above.
