# M3-15A: Replacement completion foundation

**Status:** in development — Tier 1 dispatch approved by the product owner on
20 August 2026 against this contract, and dispatched to a builder the same day
on branch `ticket/m3-15a-completion-foundation`.

**Triage:** ready-for-agent

**Milestone:** M3

**Priority:** P1

**Tier:** 1 — new schema, ownership, RLS, grants, a privileged write function,
and a change to two accepted M3-14 privileged functions.

**Depends on:** [M3-14B](M3-14B-RECURRING-SERIES-SURFACE.md) accepted and
merged (`b49c58d`), and the 20 August 2026 owner-mutable-completion amendments
to [F-005](../../product/F-005-ROLLING-TRAINING-PLAN.md#recorded-amendments)
and
[ADR-013](../../decisions/ADR-013-AI-TRAINING-HISTORY-ELIGIBILITY.md#recorded-amendment-to-decisions-2-and-4-20-august-2026).

**Blocks:** [M3-15](M3-15-REPLACEMENT-CONSUMER-READINESS.md) and every later
F-005 replacement slice.

## Agent brief

**Outcome.** Rebuild the factual completion record M3-11 deleted, on the
rolling-plan foundation: one owner-editable completion, its activity snapshot,
the planned snapshot it was measured against, and the owner-derived write
function. **No surface** — M3-15 owns that. Tier 1.

**Hard constraints**

- One forward migration, additive; never edit an applied one. New
  `completions` and `completed_activities`: owner-scoped, immutable `user_id`
  trigger, RLS on with owner-bound policies, `select` to `authenticated` only.
  Mirror M3-13's `saved_sessions` privilege shape.
- `completions.plan_session_id` is nullable, references
  `rolling_plan_sessions (id, user_id)` **`on delete restrict`**. Status is
  exactly `completed`, `partially_completed`, `skipped`, `replaced`,
  `unplanned` — there is no `rest`. `unplanned` ⟺ null `plan_session_id`;
  `replaced` ⟺ `replacement_description` present.
- **No revision chain**: no `completion_group_id`, `revision_number`,
  `previous_completion_id`, `completion_heads`, or `correction_reason`.
  `revision integer` is a stale-write token only, on M3-13's precedent. Keep
  `timezone_name` per record — the profile zone changes, past dates must not.
- Store the **planned snapshot** of the session and activities as they stood
  when the completion was written, `jsonb`, shaped like
  `rolling_plan_change_entries.after_state`. Never read through to the live
  plan row: it is mutable, and F-005 Review history step 4 depends on this.
- `completed_activities` snapshots name, sport, instructions, position,
  `measurement_mode`, and `actual_measurement`, validated by the surviving
  `is_valid_training_measurement`, same-owner FKs. Full schema now, no actuals
  captured until the activity editor exists.
- **A session carrying a completion is never hard-deleted.** Teach `end_series`
  and `rolling_plan_sweep_series_occurrences` to keep a completed occurrence as
  they keep a locked one, and report it. M3-14 criterion 8 already promises it
  and was vacuously true; make it true without weakening locked-survivor
  behavior or `rolling_plan_change_entries_session_fkey`.
- One owner-derived write function: `security definer`,
  `set search_path = ''`, owner from `auth.uid()` alone and **no owner
  argument**, ADR-010 bounded lock waits, a composite receipt, `PT409` without
  retry. Follow `apply_rolling_plan_change_set`. It advances no plan revision
  and writes no plan table — planned and actual stay separate streams.
- New `src/server/completions/` mirroring `src/server/rolling-plan/`: one
  interface, one shared adapter contract run against an in-memory *and* the
  Postgres adapter, plus a repository under `src/server/repositories/`. Add the
  ADR-017 consequence 3 top-up there as a thin wrapper over the existing
  `materialize_rolling_plan_series` RPC, for M3-15 to call before reading.

**Non-goals.** No UI, route, page, or Server Action; the maintenance stubs
stay. No AI context wiring, roadmap re-grant, activity editor, or backfill.

**Acceptance criteria.** The nine below. **No 390px pass** — nothing is visible.

**Expected to change.** A new migration and its pgTAP file, an integration
harness, new `src/server/completions/**` and its repository,
`src/server/rolling-plan/**` for the two swept functions, `database.types.ts`.

**Skills** from `.agents/skills/<name>/SKILL.md`: `schema-change` (migration →
reset → pgTAP → types, in order), `codebase-design`, `validation-record`.
**Commit incrementally** — an interrupted builder loses uncommitted work.

Read only this section unless you hit an ambiguity it does not resolve.

## Outcome

Create the replacement factual completion record on the rolling-plan
foundation, with no user-visible surface.

This is deliberately the same shape as
[M3-10](M3-10-ROLLING-PLAN-FOUNDATION.md) and
[M3-14](M3-14-RECURRING-SESSION-SERIES.md), both of which delivered dormant
schema, history, and concurrency with no UI and were accepted on schema and
security evidence alone. [M3-15](M3-15-REPLACEMENT-CONSUMER-READINESS.md) then
makes it visible across Today, logging, Progress, roadmap, and AI context.

**On the numbering.** M3-14 used the base number for the foundation and the `B`
suffix for the surface; this split inverts that. M3-15 keeps the consumer scope
because ADR-017 consequence 3, F-005, and M3-16 all already say "M3-15" to mean
Today, Progress, and AI context. Renaming would silently redirect those
references to a schema ticket. This is the same reasoning the M3 backlog
recorded when M3-03 kept its number through its own four-way split.

## Contract

The binding constraints are in the Agent brief above and are deliberately not
repeated here. What follows is the acceptance bar, the decisions behind the
shape, and what this ticket knowingly leaves open.

### Acceptance criteria

1. Every migration applies from zero; db lint and the local and hosted advisors
   report no new category.
2. pgTAP proves the privilege and policy matrix, owner immutability, anonymous
   and cross-owner denial, and direct-write denial on both new tables.
3. The status vocabulary is enforced at the database: `rest` is rejected, an
   `unplanned` completion with a `plan_session_id` is rejected, a non-
   `unplanned` completion without one is rejected, and `replaced` without a
   `replacement_description` is rejected.
4. A completion carries the planned session and activity values as they stood
   when it was written. Editing, cancelling, or diverging the plan session
   afterwards leaves the stored snapshot byte-identical.
5. **`end_series` keeps a completed occurrence active**, exactly as it keeps a
   locked one, and reports it in its receipt. Every existing M3-14 criterion 8
   behavior — deleted, diverged-deleted, locked-kept counts, and the surviving
   `delete` change entries — is unchanged for occurrences without completions.
   `rolling_plan_sweep_series_occurrences` behaves the same way.
6. A hard delete of a `rolling_plan_sessions` row carrying a completion is
   refused by the database, not only by application code.
7. An owner may edit their own completion in place; the edit keeps no trail and
   requires no reason. A stale `revision` writes nothing and returns an honest
   `PT409` conflict.
8. The in-memory and Postgres adapters pass one shared contract, and a
   concurrency harness like M3-13's proves two simultaneous writes to one
   completion produce one writer and no blended row.
9. Completing a session advances no plan revision and writes no plan table.

### Decisions behind the shape

**Why there is no revision chain.** The product owner decided on 20 August 2026
that a completion is one editable record. The evidence was that the retired
chain had no consumer: ADR-013 decision 2 already sent the coach the current
head and never the trail, and F-005's Review history never asked to show an
owner their own edit history. The cost was a `correction_reason` that a check
constraint made mandatory on every revision after the first, which put a
required text field in front of an owner fixing a mistyped duration. Both
amendments are linked in **Depends on** above and are the authority for this
paragraph.

**Why the planned snapshot is not optional.** Dropping the correction trail
moves all the weight onto the other immutability. The plan side is mutable — a
session can be edited, cancelled, or swept by a series change after training
was logged against it — so a completion that read through to the live plan row
would silently rewrite what it appears to have been measured against. F-005
acceptance criterion 11 and Review history step 4 both survive the amendment
unchanged, and this is what makes them true.

**Why `rest` is gone.** M3-12 made Recovery day a day-level planning label that
F-005 defines as "not a session". The retired constraint admitted a
session-less completion only for `unplanned`, so a `rest` completion can
satisfy neither branch. Nothing becomes unrecordable: a recovery intention is a
label on the date, and the factual counterpart is a skipped planned session or
simply no completion.

**Why this touches two accepted M3-14 functions.** `end_series` hard-deletes
future occurrences. Until now nothing could collide with that, because
completions did not exist. They do now, and a completion pointing at a deleted
session would break the invariant that nothing but the owner alters a
completion. This is the single riskiest part of the ticket and the reason it is
Tier 1 rather than a purely additive migration.

### Known limitations this ticket accepts

- Per-activity actual measurement has schema but no capture path. Activities
  remain fixture-backed and read-only, as M3-14B recorded; the editor is a
  later ticket.
- Nothing is visible. Today, logging, Progress, roadmap, and AI context stay in
  maintenance until M3-15.
- The ADR-017 top-up wrapper ships with no caller in this ticket. M3-15 is its
  first consumer.

## Approval boundary

Tier 1 dispatch of this contract is approved. It does not approve M3-15, whose
contract is drafted after this ticket is accepted and merged. It authorizes no
provider call, spend, external user, or commercial use, and no founder database
change beyond applying this ticket's own committed migration under the ordinary
hosted-evidence rule.
