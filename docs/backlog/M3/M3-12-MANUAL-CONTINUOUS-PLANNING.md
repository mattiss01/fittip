# M3-12: Manual continuous planning

**Status:** in development — the product owner approved Tier 1 dispatch on
17 August 2026 against this contract.

**Triage:** ready

**Milestone:** M3

**Priority:** P1

**Tier:** 1 — owner-scoped writes, schema, authorization, RLS, and visible
behavior.

**Depends on:** M3-11 accepted and its founder cutover recorded (both complete,
17 August 2026). M3-18 accepted and merged, so this surface is built against a
compliant focus ring.

**Blocks:** M3-13 and every later F-005 replacement slice.

## Agent brief

**Outcome.** Replace the `/home/plan` stub with the owner's one continuous
Plan: read a bounded date slice, and add, edit, move, duplicate, lock, unlock,
or cancel one-off sessions and set or clear **Recovery day** labels, on
owner-local today or a future date.

**Tier 1.** Schema, authorization, RLS, privileged writes, visible behavior.

**Hard constraints:**

- One forward migration, never editing an applied one. It adds
  `profiles.timezone_name` (IANA, validated against
  `pg_catalog.pg_timezone_names`) and `rolling_plan_recovery_days`
  (owner-scoped, one row per owner-date, immutable `user_id`, RLS, deliberate
  grants, owner/date index), and replaces `apply_rolling_plan_change_set` to
  carry recovery-day operations and enforce the two rules M3-10 left out.
- Enforce both inside that function, not only in the UI: reject a change
  targeting a date before owner-local today, and reject a change set leaving
  more than 10 active sessions on one date. Labels never count toward the cap.
- Derive owner-local today from the stored profile timezone and `auth.uid()`.
  Never let a browser-supplied timezone or owner identity decide either rule.
  With no stored timezone, reject with an honest, recoverable error.
- The Plan surface captures the browser timezone into the profile as an
  explicit owner confirmation before the first change. Do not touch the M2-03
  onboarding publication transaction.
- Every write goes through the M3-10 change-set and expected-revision boundary:
  one transaction, one grouped before/after change set, one revision advance.
  One winner, one honest stale loser, no partial state.
- Duplicate is an `add` copying session and activity fields under a new
  identity, carrying no date, lock, or history. Unlock is `set_lock false`. Add
  no operation a composed change set already expresses.
- A lock constrains AI replacement only (F-005); it never blocks the owner's
  own edit, move, or cancel. Cancellation records cancelled state and history
  and never hard-deletes an identity.
- A `390x844` serious-coach surface with honest loading, empty, stale-revision,
  invalid, offline-safe failure, and keyboard/focus states. An unlabeled empty
  date is unplanned; never imply completion, streak, trend, or judgment. No
  `"use client"` file imports `@/server/**` or a repository. Use the M3-18
  focus treatment; never reintroduce `#efaa84` or `#f4cba0`.

**Non-goals:** no saved-session library, recurrence, replacement logging,
Progress, AI proposal, regeneration, reset, past planning, completion mutation,
whole-plan version, legacy compatibility path, or global activity library.
**No visible plan-history surface** — change sets keep recording, nothing
displays them here.

**Acceptance:** migration applies from a clean reset; pgTAP covers the new
table and column, their constraints, indexes, privileges, RLS, owner access,
anonymous/cross-owner denial, timezone validation, past-date rejection, and the
cap; a concurrency harness proves one winner on a same-revision race including
a recovery-day change; both adapters pass the same contract; a 390px Playwright
flow covers every listed operation plus a recovery day; green exact-commit CI.

**Expected to change:** one migration; `src/server/rolling-plan/**`;
`rolling-plan-repository.ts`; a profile timezone path;
`src/app/home/plan/page.tsx` with co-located components, CSS module, and server
actions; `database.types.ts`; a new per-ticket Playwright config and spec; this
ticket's validation record.

**Skills.** Builder: `schema-change`, `codebase-design`,
`vercel-react-best-practices`, `frontend-design`, `mobile-e2e`,
`validation-record`. Reviewer: `code-review`, `schema-change`,
`vercel-react-best-practices`, `codebase-design`.

Read only this section unless you hit an ambiguity it does not resolve.

## Why this shape

This is the first user-visible client of the M3-10 foundation after M3-11
removed the legacy training model. It replaces `/home/plan` directly; there is
no parallel review route and no compatibility path.

M3-10 built the persistence, the atomic change set, and the owner revision, but
deliberately shipped **no** date-window rule and **no** per-date cap, and
excluded Recovery day labels. Those three gaps are exactly what this ticket
closes, which is why it needs a migration rather than only a UI.

## Decisions taken on 17 August 2026

The product owner resolved the following when this contract was drafted:

1. **No visible plan history.** The shell scoped an "understandable plan
   history" surface. In a single-owner app where the owner made every change
   moments earlier, a change list earns very little. The M3-10 change sets keep
   recording regardless, so deferring costs nothing and a later ticket can
   surface real history instead of an empty list.
2. **Recovery days stay in this ticket.** With history dropped, the proposed
   M3-12A/M3-12B split had nothing left in its second half, so M3-12 remains
   one ticket — roughly a third smaller than the shell scoped it.
3. **The owner timezone lives on the profile.** A timezone is already stored as
   `timezone_name` on `public.onboarding_drafts`, but the publication
   transaction deletes that draft
   (`20260802201214_m2_03_guided_onboarding.sql:1950`), so it vanishes when
   onboarding completes and cannot anchor a permanent planning rule. A profile
   column is the durable source. ADR-016 notes that recurrence needs
   owner-local calendar logic too, so M3-14 would have required this anyway.
4. **M3-18 first.** The focus-ring correction was dispatched and accepted ahead
   of this ticket so the new form-heavy surface is built against a compliant
   ring rather than swept afterwards.
5. **One ticket, with a 66-line brief.** The agent brief exceeds the 60-line
   limit in AGENTS.md. The lead raised this as a split signal and proposed
   cutting along the server/UI seam — a dormant Tier 1 schema half and a Tier 2
   surface half, mirroring M3-10/M3-11. The product owner chose to keep one
   ticket and accept the longer brief. The overrun is deliberate and every line
   in it is a live constraint; do not treat it as licence to grow the brief
   further, and do not trim constraints to reach 60.

Rules already settled by F-005 and not reopened here: the past boundary and the
10-active-sessions-per-date limit (decisions 2 and 3, 14 August 2026),
recovery-day semantics (decision 11), and locks constraining AI replacement
only.

## Known follow-ups, deliberately out of scope

- The M2-03 onboarding publication transaction still discards the collected
  timezone. This ticket adds the profile column and captures the value on the
  Plan surface instead. Wiring onboarding to populate the profile directly is a
  separate change against an accepted transaction.
- Nothing currently supplies `timezoneName` to `src/server/ai/context.ts`,
  which refuses plan creation without a resolved zone. That consumer belongs to
  the incomplete M3-03 work and is picked up by M3-16, which can now read the
  profile column this ticket adds.

## Approval boundary

The F-005 decomposition was approved on 14 August 2026. This contract records
the exact dispatch-ready scope, and the product owner approved Tier 1 dispatch
against it on 17 August 2026 as a separate decision.
