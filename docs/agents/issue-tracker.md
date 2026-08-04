# Issue tracker: Local Markdown

Issues (tickets) and specs for this repo live as markdown files in the repo,
not in GitHub Issues. The GitHub remote exists for code, PRs, and Vercel
deployments only — do not open, read, or close GitHub Issues as a tracker.

## Conventions

- Tickets are grouped by milestone: `docs/backlog/M<n>/`
- Each milestone has an index at `docs/backlog/M<n>/M<n>-BACKLOG.md` — a
  priority table with `Priority | Ticket | Status | Depends on | Scope |
  Approval gate` columns, plus a dependency chain
- One ticket per file: `docs/backlog/M<n>/M<n>-NN-<SLUG>.md`
- An approved ticket opens with an `## Agent brief` section immediately after
  the status header block — see AGENTS.md § Ticket agent brief. Aim for 40
  lines, treat 60 as the limit, name the tier, and end with
  "Read only this section unless you hit an ambiguity it does not resolve."
  Read only that section unless it leaves you stuck
- The spec (you may know it as a PRD) is a **feature brief** at
  `docs/product/F-00N-<SLUG>.md`. Tickets implement an approved feature brief.
  Don't confuse it with the ticket's `## Agent brief` — different documents
- Validation records are one file per ticket at
  `docs/validation/M<n>/M<n>-NN-VALIDATION.md`, with artefacts under
  `docs/validation/M<n>/evidence/`. Automated-test evidence is the CI run URL
  for the exact reviewed SHA, not pasted suite output (AGENTS.md §
  Continuous integration). The `validation-record` project skill writes these
- Delivery state is the `Status` column in the milestone index, using the
  lifecycle from AGENTS.md and Product Plan 15.1: `draft`/`proposed`,
  `approved`, `in development`, `testable`, `accepted`
- Triage state is a separate `Triage:` line near the top of the ticket file
  (see `triage-labels.md` for the role strings). It never replaces `Status`

## Approval gate — read before writing anything here

`docs/backlog/` and `docs/product/` are governed artefacts. Per AGENTS.md, a
ticket's move to `approved` and any change to its scope require product-owner
approval, and planning/governance changes are committed separately from
implementation branches.

So: a skill may **draft** a ticket or brief and propose it, and may update a
ticket's `Triage:` line freely. A skill must **not** silently set `Status` to
`approved`, widen an approved ticket's scope, or mark a ticket `accepted`.
Surface the proposal and stop.

A ticket gains its `## Agent brief` when it is approved for implementation, so
the brief matches the scope actually dispatched. Tickets already `accepted` are
permanent history and are not retrofitted — don't rewrite them.

`AGENTS.md`, `.agents/**`, and `skills-lock.json` are denied to agents in
`.claude/settings.json`. Propose those edits to the product owner as text; do
not attempt to write them.

Wayfinder effort files (see below) are exploration artefacts and are exempt
from this gate — but promoting a wayfinder finding into a delivery ticket is
not.

## When a skill says "publish to the issue tracker"

Add a file under `docs/backlog/M<n>/` for the owning milestone (creating the
directory if needed) and add its row to that milestone's `M<n>-BACKLOG.md`
table with `Status: proposed`. If the owning milestone is unclear, ask.

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the ticket ID
(e.g. `M2-01`) or the path directly; `M<n>-NN` resolves to
`docs/backlog/M<n>/M<n>-NN-*.md`. Read its validation record too when the
ticket is `in development` or later.

## Wayfinding operations

Used by `/wayfinder`. Efforts live inside the backlog, in their own directory
under the owning milestone. The **map** is a file with one **child** file per
ticket.

- **Map**: `docs/backlog/M<n>/<effort-slug>/map.md` — the Notes /
  Decisions-so-far / Fog body.
- **Child ticket**: `docs/backlog/M<n>/<effort-slug>/issues/NN-<slug>.md`,
  numbered from `01`, with the question in the body. A `Type:` line records the
  ticket type (`research`/`prototype`/`grilling`/`task`); a `Status:` line
  records `claimed`/`resolved`.
- **Blocking**: a `Blocked by: NN, NN` line near the top. A ticket is unblocked
  when every file it lists is `resolved`.
- **Frontier**: scan `docs/backlog/M<n>/<effort-slug>/issues/` for files that
  are open, unblocked, and unclaimed; first by number wins.
- **Claim**: set `Status: claimed` and save before any work.
- **Resolve**: append the answer under an `## Answer` heading, set
  `Status: resolved`, then append a context pointer (gist + link) to the map's
  Decisions-so-far in `map.md`.

If an effort doesn't belong to a milestone yet, put it under
`docs/backlog/exploration/<effort-slug>/` and move it once the milestone is
known.

### Keeping efforts distinct from delivery tickets

- An effort directory is **not** a row in the milestone's priority table. Link
  it from the milestone index under an `## Exploration efforts` heading instead,
  so the governed table keeps listing only delivery tickets.
- A wayfinder child ticket's `Status:` line (`claimed`/`resolved`) is the
  wayfinder state machine, not the delivery lifecycle. The two never appear on
  the same file.
- When an effort produces work worth building, draft a real ticket at
  `docs/backlog/M<n>/M<n>-NN-<SLUG>.md` with `Status: proposed`, link back to
  the effort, and take it through the approval gate above.
