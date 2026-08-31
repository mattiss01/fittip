# M3-15C: Progress

**Status:** in development — the product owner approved dispatch on 31 August
2026 and the lead marked the ticket in development and spawned the builder onto
`ticket/m3-15c-progress` the same day. The agent brief below was written on
31 August 2026 against the product owner's scope decisions of that date. Split
out of [M3-15](M3-15-REPLACEMENT-CONSUMER-READINESS.md) on 29 August 2026.

**Triage:** ready-for-agent

**Milestone:** M3

**Priority:** P1

**Tier:** 2 — user-visible behavior on M3-15A's already accepted schema and
authorization boundary. Same escalation rule as M3-15B.

**Depends on:** [M3-15B](M3-15B-TODAY-AND-LOGGING.md) accepted and merged on
31 August 2026, so completions exist to display.

**Blocks:** nothing in the chain directly; [M3-15D](M3-15D-AI-COMPLETION-CONTEXT.md)
is sequenced after it.

## Agent brief

**Outcome.** Restore `/home/progress` as the owner's training record paged by
calendar month, and `/home/progress/[id]` as one completion beside the
immutable planned snapshot it was measured against. Progress reads only.

**Tier:** 2. Stop and re-dispatch against M3-15A if any schema, grant, or
privileged-function change turns out to be needed.

**Product decisions, 31 August 2026.** Completions only — plan change history
is M3-24. No computed figures of any kind: a dated record, nothing summarized.

**Hard constraints:**

- Read only through `createCompletionLog()`
  (`src/server/repositories/completion-log-repository.ts:136`): `list(start,
  end)` for the month, `get(id)` for the detail. No write path and no Server
  Action anywhere in this ticket.
- **The page bound is one calendar month**, settling M3-15A observation 3 —
  `list` enforces no maximum width and this is its first paginating caller. The
  month is a `month=YYYY-MM` search param, so the view is addressable and the
  back button works. Absent or unparseable falls back to the owner-local current
  month, never a server-local one; an owner with no confirmed time zone gets the
  same state Today gives them.
- **Do not call `readPlanWindowToppedUp`**, despite this ticket's own shell.
  ADR-017 consequence 3 binds a consumer that reads *plan sessions*; Progress
  reads completions. Adding it would materialize future occurrences as a side
  effect of viewing history.
- **Planned values come from the completion's stored `plannedSnapshot`**, never
  from a read-through to the live plan row: the plan side is mutable and F-005
  Review history step 4 rests on this. An unplanned log has no snapshot — show
  its title and sport from its first completion activity, as Today does.
- `/home/progress/[id]` takes an async `params` (Next.js 16). Reject a non-UUID
  before any read. A missing completion and one owned by someone else must be
  indistinguishable in status, copy, and timing.
- A month with nothing logged, an owner who has logged nothing ever, and a
  failed read are three different sentences. None of them is a zero.
- Update `src/architecture/m3-11-legacy-reset.test.ts` deliberately: drop
  `progress/page.tsx` from `maintenancePages`, add both progress routes to
  `rollingPlanSurface`, and extend `allowedServerModules` only by what they
  genuinely import.
- Owner, anonymous, and cross-owner checks on every read. Bound every query by
  the selected month.

**Non-goals.** No writing, editing, or deleting a completion — every write stays
on `/home/log`. No plan change history or change-set summary; that is M3-24. No
totals, counts, streaks, or charts. No AI context, roadmap, or proposal surface.
No per-activity actual measurements. No completion schema change. No new date
rule — M3-23 item 3 owns that.

**Acceptance:**

1. `/home/progress` shows one owner-local calendar month of completions, most
   recent first, and pages to the previous and next month.
2. Each entry shows its outcome, what the owner recorded, and any reported
   signal, with unplanned training shown by its own title and sport.
3. `/home/progress/[id]` shows one completion beside the full planned snapshot,
   and editing the plan afterwards does not change what that snapshot says.
4. The three empty and failed states each say so distinctly; 390px throughout.
5. Cross-owner and anonymous reads are impossible, and an unowned id is
   indistinguishable from a missing one.
6. Green exact-commit CI, including a new pinned 390px flow on its own port and
   config, added to `.github/workflows/ci.yml` as an additive step.

**Expected to change:** `src/app/home/progress/page.tsx`, a new
`src/app/home/progress/[id]/page.tsx`, Progress components with their CSS
module, `error.tsx` and `loading.tsx`,
`src/architecture/m3-11-legacy-reset.test.ts`, a new `e2e/m3-15c-*.spec.ts` with
its pinned config and port, `.github/workflows/ci.yml`, and this ticket's
validation record. No file under `supabase/`; if one needs touching, stop and
report.

**Skills.** `vercel-react-best-practices` and `frontend-design`, read from the
project copies at `.agents/skills/<name>/SKILL.md`.

Read only this section unless you hit an ambiguity it does not resolve.

## Why this shape

M3-11 deleted roughly 660 lines across these two routes. That old Progress was
a single timeline of two record kinds, plan versions and completions, with a
`kind:id` route parameter. Plan versions do not exist in the replacement model,
so this is a rebuild and not a revert, and the old structure is not a guide.

The completions half and the plan-history half were separated because they are
different products. The completions half needs no new server read path at all.
The plan-history half needs one that does not exist — the rolling-plan adapter
exposes `getPlanSlice`, `listSeries`, `applyChangeSet`, and `materializeSeries`
and nothing that reads `rolling_plan_change_entries` — plus copy that turns a
change set into an understandable sentence, plus ADR-017 consequence 1's
requirement that machine-provenance entries never be rendered as things the
owner did. That is its own ticket.

## Decisions taken

- **31 August 2026 — dispatch approved.** The product owner approved the brief
  as written and directed the lead to mark the ticket in development and spawn
  the builder. Tier 2, so a distinct builder followed by a distinct independent
  reviewer, on branch `ticket/m3-15c-progress`.
- **31 August 2026 — completions only.** The product owner chose the narrower
  of two scopes. F-005 Review history items 1 and 4 are covered here; items 2
  and 3 move to [M3-24](M3-24-PLAN-CHANGE-HISTORY.md).
- **31 August 2026 — no computed figures.** The product owner chose a record
  over a summary. Any metric is a claim about what the owner's training means,
  and adding one later is easier than withdrawing one people have begun to
  read. AGENTS.md already forbids a fabricated zero-progress chart; this goes
  further and forbids the honest ones too, for now.
- **31 August 2026 — the page bound is one calendar month**, decided by the
  lead against F-005's "every read is date-bounded" rule rather than by adding
  a row-count cursor, which would have needed a new adapter method. Recorded
  because M3-15A observation 3 asked for the bound to be chosen deliberately.
- **31 August 2026 — no plan window top-up**, correcting this ticket's own
  shell. See the brief.
- **31 August 2026 — the brief is 75 lines against AGENTS.md's limit of 60.**
  It was drafted at 88 and trimmed; the remainder is two routes, a pagination
  model, an authorization requirement, three distinct honest states, a
  deliberate invariant change, and a correction to this ticket's own shell.
  Cutting further would remove constraints rather than words. The rule says a
  brief this long usually means the ticket is too large, and one split was
  taken: plan change history left as M3-24. A second — shipping the list
  without `[id]` — was rejected, because the detail route is the whole of F-005
  Review history step 4 and a list that cannot show the planned snapshot is
  half a feature. Recorded rather than quietly tolerated, as M3-15B's overflow
  was not.
