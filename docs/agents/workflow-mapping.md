# Workflow mapping

How the `mattpocock/skills` engineering flow maps onto FitTip's delivery
protocol. Read this before invoking one of those skills on FitTip work.

The two are different layers and neither replaces the other:

- **AGENTS.md is governance** — who may act, what evidence counts, who
  approves. It exists because FitTip touches Row Level Security, migrations
  against a hosted Supabase project, and a product owner who accepts on
  Vercel.
- **The skills are production technique** — how to sharpen a fuzzy idea, slice
  it, and write the code test-first. AGENTS.md is nearly silent on all of that.

Where they disagree, AGENTS.md wins. A skill never widens approved scope, sets
`Status: approved`, or substitutes for a gate — that rule is already stated in
`issue-tracker.md` and applies to every skill named here.

The tracker, triage, and domain abstractions these skills assume are already
redirected onto FitTip's structures by `issue-tracker.md`,
`triage-labels.md`, and `domain.md`. This file covers what those three do not:
which skill runs in **whose context**, at **which point** in the protocol.

## Where each skill sits

| Skill                            | Role in the FitTip protocol                     |
| -------------------------------- | ----------------------------------------------- |
| `/grill-with-docs`               | Sharpen an idea pre-brief. Lead, plan mode      |
| `/to-spec`                       | Draft a brief at `docs/product/F-00N-<SLUG>.md` |
| `/to-tickets`                    | Slice a brief into `proposed` backlog tickets   |
| `/implement`                     | **Builder subagent only**, never the lead       |
| `/tdd`                           | Inside `/implement`, at the ticket's seams      |
| `/code-review`                   | Pre-handoff self-check, not independent review  |
| `/triage`                        | Incoming reports the lead did not author        |
| `/diagnosing-bugs`               | Diagnosis pre-fix-ticket. Lead, plan mode       |
| `/wayfinder`                     | See `issue-tracker.md` § Wayfinding operations  |
| `/prototype`                     | Throwaway design answer. Never merged           |
| `/research`, `/handoff`          | Context tools; no governed output               |
| `/improve-codebase-architecture` | Survey; its proposals still need approval       |

## The three collisions

Everything above the line is additive. These three overlap real AGENTS.md
rules and need an explicit resolution.

### `/to-tickets` — drop the parallel frontier

The skill produces tickets that are grabbable in parallel: "any ticket whose
blockers are all done can be grabbed." AGENTS.md forbids concurrent builders
outright, even when tickets are independent and dependency-ready.

Use the skill for what it is good at — tracer-bullet vertical slicing and
honest blocking edges — and land the result as `proposed` rows in the
milestone index, with the blocking edges in the `Depends on` column. Delivery
order stays strictly sequential, one accepted ticket at a time.

The skill also does not produce an `## Agent brief` or a tier. Both are
written by the lead when the product owner approves the ticket, not at
slicing time, so the brief matches the scope actually dispatched.

### `/implement` — the builder runs it, not the lead

The skill ends "commit your work to the current branch." On Tier 1 and Tier 2
the lead is forbidden from implementing at all: it spawns a distinct builder
subagent, then a **different** independent reviewer.

So `/implement` is a skill the lead **names in the builder handoff** and the
builder invokes in its own context. The lead may invoke it directly only on
Tier 3.

Two of its instructions are superseded here:

- "Run the full test suite once at the end" — do not. Run the narrow tests
  the change touches; the green CI run for the pushed commit is the
  automated-test evidence (AGENTS.md § Continuous integration).
- Its commit step does not end the ticket. The builder still writes the
  validation record (`validation-record` skill), and the lead still pushes,
  waits for the Preview, and applies any migrations to the founder project.

### `/code-review` — a self-check, not the independent reviewer

The two-axis review is genuinely useful and its Spec axis will find the
feature brief through `issue-tracker.md`. It still does not satisfy the
independent-review requirement, because that requires a **separate agent**
reviewing the **exact pushed commit**, reconciling the change manifest, and
judging what CI cannot: authorization, ownership predicates, product
invariants, history and versioning behavior, and honest empty/error states.

Run it before handoff. The independent reviewer may run it too, as one input
among several — never as the review itself.

## Smaller deltas

- `/to-spec` writes to its own PRD template. FitTip feature briefs have an
  established shape; match the existing `docs/product/F-00N-*.md` files and
  hand-wrap at ~80 columns, since Prettier ignores `docs/`.
- `/to-spec` and `/to-tickets` apply `ready-for-agent`. That is the `Triage:`
  line only. It means *well specified*, never *approved* — see
  `triage-labels.md`.
- `/tdd` places refactoring in the review stage. FitTip does not refactor
  broadly without an approved ticket; keep refactoring inside the ticket's
  scope and raise anything wider as a proposal.
- `/triage` requires an AI-generated disclaimer on every tracker comment.
  This tracker is markdown files with no comment surface; put the disclaimer
  in the ticket body when a skill authored it.
- `/improve-codebase-architecture` looks for ADRs in `docs/adr/`. They are in
  `docs/decisions/` — see `domain.md`.
- `/prototype` writes throwaway code. It is not ticket work, never lands on
  `master`, and its value is the answer, not the code.

## Skill directories are not interchangeable

`.agents/skills/` is read by Codex, `.claude/skills/` by Claude Code. An agent
cannot use a skill its own directory lacks, so when naming skills in a handoff,
name ones the receiving agent can actually load.

The three FitTip-authored operational skills — `schema-change`, `mobile-e2e`,
and `validation-record` — are mirrored byte-identically into both directories,
because they carry the migration and acceptance-evidence procedure that any
builder needs whichever agent it runs on. Keep the two copies in sync when one
changes. They are locally authored, so they do not belong in
`skills-lock.json`, which records upstream provenance for third-party skills
only.

Four third-party skills remain `.agents/`-only: `frontend-design`,
`vercel-react-best-practices`, `find-skills`, and `sleek-design-mobile-apps`.
Claude Code does not auto-discover them; `CLAUDE.md` covers the workaround —
`Read` the `.agents/skills/<name>/SKILL.md` path explicitly when a handoff
names one.
