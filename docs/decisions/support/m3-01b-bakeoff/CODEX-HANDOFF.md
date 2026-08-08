# Codex handoff — M3-01B model bake-off

Paste everything below the line into a Codex session in the FitTip project, once
per model you want to compare. Change the model in Codex's picker between runs.

Run `node emit.mjs` from this directory first — the prompt files the brief
points at are generated and gitignored.

**Before you do, know what this proves and what it does not.** A Codex agent is
not a raw model call: it wraps its own system prompt and tool scaffolding around
whichever model you select, and its picker offers coding-selected models rather
than the API lineup a FitTip adapter would call. So this route can indicate
**coaching quality and safety-signal adherence** — the half that needs your
judgement — and it cannot settle schema conformance under `strict: true`, token
counts, latency, or prompt caching. Those stay open for M3-01B's own live pass.

---

You are helping settle one open decision on ticket M3-01B: which model tier is
capable enough to write FitTip's coaching proposals. This is **decision support,
not implementation**.

## Hard constraints

- **Do not modify any file in the repository.** No source, no docs, no
  migrations, no commits, no branches. There is no approved ticket for this work
  and `AGENTS.md` does not permit implementation without one.
- **Write exactly two files**, both under this directory:

  ```
  docs/decisions/support/m3-01b-bakeoff/paste/outputs/<label>__create_roadmap.json
  docs/decisions/support/m3-01b-bakeoff/paste/outputs/<label>__create_seven_day_plan.json
  ```

  Replace `<label>` with the model you have selected in Codex, e.g.
  `gpt-5__create_roadmap.json`. The label is only used to name rows in a report.

- **Do not improve, shorten, restructure, or "fix" the prompt.** It is the
  variable under test. If two models see different prompts the comparison is
  worthless. Read it and use it verbatim.

## What to do

1. Read `docs/decisions/support/m3-01b-bakeoff/paste/create_roadmap.txt`. It is self-contained:
   system prompt, output instructions, JSON schema, and the athlete's context.
2. Answer it **as the coaching model** — produce the JSON proposal it asks for.
   Do not analyse the prompt, critique it, or explain what a good answer would
   look like. Produce the answer itself.
3. Write the raw JSON object to
   `paste/outputs/<label>__create_roadmap.json`. No markdown fence, no prose.
4. Repeat steps 1–3 with `paste/create_seven_day_plan.txt`, writing to
   `paste/outputs/<label>__create_seven_day_plan.json`.
5. Report back only: which model was selected, and whether anything in the
   prompt was ambiguous or unanswerable. Do not self-assess the quality of your
   output — that is scored separately and independently.

## What is being scored, so you know what matters

A separate scorer checks, mechanically:

- every `goalId` copied exactly from `targetableGoals` — no invented ids, and no
  reference to the achieved goals in `historicalGoals`
- dates well-formed, inside the requested window, never in the past
- roadmap phases non-overlapping
- whether the plan respects the planning note: no gym while travelling, the
  wedding Saturday left empty, a long run present, the knee signal and the
  return from illness acknowledged in the reasoning

Do not optimise for that list. It is published here so you understand the task,
not so you can satisfy a checklist — a plan that games the probes and reads like
a template is exactly the failure mode this exercise is trying to detect.
