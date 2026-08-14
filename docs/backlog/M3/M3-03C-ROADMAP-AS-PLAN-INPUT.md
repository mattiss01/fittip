# M3-03C: The roadmap as an optional plan input

**Status:** retired — merged into M3-16 by the product owner on 14 August 2026

**Triage:** wontfix

**Disposition:** Do not dispatch this standalone contract. Its roadmap-input
and visible proposal-reasoning behavior moves into M3-16; its whole-version and
legacy Progress assumptions do not.

**Milestone:** M3

**Priority:** P2

**Depends on:** [M3-02 accepted](M3-02-ROADMAP-PROPOSAL.md) for the accepted
roadmap version and its stored source references, and
[M3-03 accepted](M3-03-SELECTED-HORIZON-PLAN-PROPOSAL.md) for the generation it
feeds. The Progress section below additionally needs
[M3-04](M3-04-PLAN-EDIT-LOCK-ACCEPTANCE.md) — see the note on it.

**Split from:** [M3-03](M3-03-SELECTED-HORIZON-PLAN-PROPOSAL.md) on 12 August
2026. See its "Split into three tickets" section for the boundary.

**Origin:** the roadmap became an optional input rather than a precondition on
8 August 2026; the Progress reasoning section was decided 9 August 2026 under
ADR-014 decision 3.

**Blocks:** nothing.

## Outcome

Where a current accepted roadmap covers the requested dates, it is used
automatically — the owner makes no extra choice — and the compose screen names
it in the context summary so its influence is visible rather than hidden. The
planning note is the override: "ignore the roadmap this week, I am travelling"
is expressed in prose, not by a control.

M3-03 ships generation from goals alone, and that path stays first-class after
this ticket. This adds direction where direction exists; it does not turn the
no-roadmap path into a degraded state.

## A stale roadmap is used and marked stale

If the goals a roadmap was accepted against have changed since, the roadmap
still travels, carrying an explicit marker that it predates the current goals,
and the context summary says so. The coach reconciles the two rather than
guessing, and the owner can see why.

The two alternatives were considered and rejected. Silently dropping the roadmap
on a goal edit would make direction vanish from a small change. Blocking
generation would gate the owner out of planning their week because of a record
they may not remember accepting.

Staleness is determined from the source record ids and versions M3-02 stores on
the accepted roadmap version. **The exact predicate is open decision 1 below and
must be answered before dispatch** — the candidates are not equivalent and the
choice changes how often the owner sees the word "stale".

## The "why does this plan look like this" section

Decided 9 August 2026 under ADR-014 decision 3. Against an accepted plan
version, Progress shows a section that is **collapsed by default and expands**
to reveal:

- the owner's planning note for that proposal, and
- the coach's description of the week, from the `fittip.seven-day-plan.v2` field
  M3-03 defines.

**Display only.** The owner cannot add their own text to it — that was
considered and deliberately not taken, because a user-editable annotation on an
accepted plan version would either mutate an immutable record or require its own
annotation table keyed to the version. Neither is in scope here. If it is wanted
later it is a separate ticket, and the data model must not be designed into a
corner that forbids it.

The section is what makes "why does this week look like this" answerable at all:
without it, an accepted plan is a list of sessions with no trace of what was
asked for or why the coach answered that way.

**Sequencing note, and a question for the product owner.** This section displays
against an **accepted plan version**, which does not exist until
[M3-04](M3-04-PLAN-EDIT-LOCK-ACCEPTANCE.md) ships acceptance. It is grouped here
because it and the roadmap input are the two display-side concerns the original
M3-03 carried, but it is genuinely coupled to M3-04 rather than to the roadmap.
Folding it into M3-04 instead would be defensible and arguably cleaner. That is
the product owner's call; it is recorded here rather than moved unilaterally,
because M3-04 is a separate proposed ticket with its own scope.

## Non-goals

- No change to how a plan is generated without a roadmap. That path is M3-03's
  and it stays exactly as accepted.
- No new roadmap behavior, schema, or surface. M3-02's accepted roadmap is read,
  never written or re-judged here.
- No regeneration behavior; that is M3-03B. A roadmap in play simply travels on
  a regeneration the same way it travels on a first generation.
- No editing, locking, or acceptance of a plan; those are M3-04.
- No blocking of generation for any roadmap state, stale or otherwise.

## Acceptance criteria

1. Where a current accepted roadmap covers the requested dates it is used with
   **no extra owner action** and is named in the context summary.
2. A stale roadmap is used, marked stale to both the coach and the owner, and is
   neither dropped nor allowed to block generation.
3. The no-roadmap path is unchanged and still exercised end to end at
   `390x844`. It is not a fallback state, an empty state, or a warning.
4. A roadmap that does not cover the requested dates is not sent, and the
   context summary says so honestly rather than silently omitting it.
5. The staleness predicate is exactly the approved one from decision 1, asserted
   directly rather than inferred from a downstream effect.
6. A planning note can override the roadmap in prose without any control, and
   cannot alter the horizon, schema, limits, or safety rule while doing so.
7. Where the Progress section ships here, it is collapsed by default, is display
   only, and shows the planning note and the coach's description for that
   accepted version.
8. Source references record whether a roadmap was used and whether it was stale.
9. No accepted plan, lock, completion, replan, external sink, secret, or
   unapproved spend is added.

## Test plan

- Roadmap-absent, roadmap-present, and roadmap-stale generation paths, each
  asserting what reaches the boundary and what the context summary reports.
- A roadmap whose horizon does not cover the requested dates: not sent, and
  reported as not sent.
- The staleness predicate under each candidate input — a changed goal set, a
  changed target date or tier on a referenced goal, and an elapsed roadmap
  horizon — asserting the approved one fires and the others do not, unless the
  approved predicate is the union.
- A planning note that contradicts the roadmap: generation succeeds, the note
  wins as prose, and no limit or schema moves.
- Source references record roadmap presence and staleness, under
  owner/anonymous/cross-user RLS tests.
- Playwright `390x844` run once with no roadmap and once with one, plus a stale
  run, covering the context summary's roadmap line in each state.
- Where the Progress section ships here: collapsed by default, expands, is not
  editable, and renders honestly when the description field is absent on an
  older version.

## Open decisions

Moved here from M3-03 on 12 August 2026, renumbered from their original
positions 10, 11, and 18.

1. **The staleness predicate for an accepted roadmap.** Candidates: any change
   to the goal set it referenced; a change to a referenced goal's target date or
   tier; or the roadmap's own horizon having elapsed. These are not equivalent
   and the choice changes how often "stale" appears. (Originally decision 10.)
2. **Compose-screen copy and grouping for the context summary**, including how a
   stale roadmap is described to the owner without alarming them. (Originally
   decision 11.)
3. **Whether the "why does this plan look like this" section also appears
   against a proposal the owner is still reviewing, or only after acceptance.**
   Showing it earlier helps the accept/reject judgement; showing it only after
   keeps the review screen focused on the plan itself. (Originally decision 18.)
4. **Whether that section belongs in this ticket at all**, or in M3-04 with the
   acceptance it depends on. See the sequencing note above.

## Approval gate

**Tier 2** if it changes no schema — it reads M3-02's accepted roadmap and adds
context assembly and display on top of M3-03's accepted boundary. It becomes
**Tier 1** the moment it needs a migration, which recording roadmap presence and
staleness on the proposal's source references may well require; decide that at
dispatch and choose the higher tier when in doubt. Either way: approved ticket,
distinct builder, distinct independent reviewer, Preview verification, and
product-owner acceptance. The four open decisions must be answered before
dispatch.
