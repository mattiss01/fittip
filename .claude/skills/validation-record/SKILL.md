---
name: validation-record
description: Write a FitTip ticket validation record — the persisted builder handoff with the complete change manifest, evidence, command results, limitations, and reviewer checklist. Use when finishing an implementation ticket, before requesting independent review or product-owner acceptance.
---

# Validation record

AGENTS.md requires the change manifest to be **persisted**, not chat-only. It lives at
`docs/validation/<MILESTONE>/<TICKET>-VALIDATION.md`, with images under
`docs/validation/<MILESTONE>/evidence/`. Read a recent accepted record first —
`docs/validation/M1/M1-04-VALIDATION.md` is the reference shape — and add the new file to
`docs/validation/README.md`.

Prettier ignores `docs/`, so hand-wrap at ~80 columns to match the neighbours.

## Required sections

1. **Header** — ticket link, lifecycle state, exact implementation review target (full SHA),
   initial commit, any correction commits with a one-line reason each, branch name.
2. **Delivered behavior** — what a user can now do, in factual terms.
3. **Mobile demo path** — numbered steps the product owner can follow at `390x844`, naming the
   exact commands and port used.
4. **Complete change manifest** — four subsections, `### Created`, `### Modified`,
   `### Deleted`, `### Renamed`. Every file listed with one brief explanation of what changed
   and why. Write `- None.` for an empty group; never omit the heading.
5. **Data, migration, API, privacy, and security effects** — schema/policy/RPC/type/package
   changes, ownership and RLS handling, what the browser stores, any credential used only at
   test runtime.
6. **Tests and final results** — lead with the continuous-integration run for the exact
   reviewed SHA: its run URL and conclusion. That run covers lint, typecheck, `test:run`,
   `build`, the migration/lint/advisor/pgTAP matrix, the concurrency harnesses, and the 390px
   browser flows, so do not re-run them by hand to fill a table. Add a short
   `| Command or check | Result |` table only for what CI does not cover — `git diff --check`,
   a hosted Vercel Preview check, a manual 390px observation, or a one-off local investigation
   — and name each honestly.
7. **Known limitations** — honest scope boundaries, warnings you accepted, and what remains
   gated.
8. **Independent reviewer checklist** — the exact commit to review, the exact
   `git diff <base>..<head>` range for manifest reconciliation, and the specific behaviors,
   authorization paths, and states to confirm. Point the reviewer at the CI run for that SHA;
   never ask it to re-run lint, typecheck, tests, build, or the browser flow. Reserve the
   checklist for judgment CI cannot supply.

## Rules

- Report what actually happened. A skipped step is written as skipped; a failure is written with
  its output. Never claim a command result you did not observe.
- The manifest must match the real Git diff — the reviewer reconciles them and reports any
  omitted, unexpected, or inaccurately described file.
- Every SHA is the full hash of a real commit on the ticket branch. Correction commits invalidate
  earlier approvals; add them, do not overwrite.
- Records of accepted tickets are permanent. Append acceptance and merge details; never rewrite
  delivered history.
