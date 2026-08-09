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
counts, latency, or prompt caching. Those stay open for M3-01B's live pass.

---

You are helping settle one open decision on ticket M3-01B: which model tier is
capable enough to write FitTip's coaching proposals. This is **decision support,
not implementation**.

## Hard constraints

- **Do not modify any file in the repository except `WORKSHEET.md`.** No source,
  no docs, no migrations, no commits, no branches. There is no approved ticket
  for this work and `AGENTS.md` does not permit implementation without one.
- **Do not improve, shorten, restructure, or "fix" the prompts.** They are the
  variable under test. If two models see different prompts the comparison is
  worthless. Read them and use them verbatim.
- **Do not read any other model's answers before producing your own**, and do
  not look at the probe implementations in `scenarios/`. Both would contaminate
  the result.

## What to do

1. List `docs/decisions/support/m3-01b-bakeoff/paste/`. Each file is named
   `<scenario>__<operation>.txt` and is self-contained: system prompt, output
   instructions, JSON schema, and that scenario's athlete context.
2. For each file, answer it **as the coaching model** — produce the JSON
   proposal it asks for. Do not analyse the prompt, critique it, or describe
   what a good answer would look like. Produce the answer itself.
3. Write each answer into `WORKSHEET.md`, into the slot whose marker matches
   your model letter, the scenario, and the operation:

   ```
   <!-- BEGIN slot=B scenario=cold-start op=create_seven_day_plan -->
   { ...your JSON... }
   <!-- END -->
   ```

   Leave the marker comments exactly as they are — only fill the body between
   them. Raw JSON, no markdown fence, no prose.
4. Record the model you used in the label table under "Record what you actually
   used", against the letter whose slots you filled. Ask which letter to use if
   it was not stated.
5. Report back only: which model was selected, which slots you filled, and
   whether anything in a prompt was ambiguous or unanswerable. **Do not
   self-assess the quality of your output** — it is scored separately, and a
   model grading its own coaching is worthless.

## What is being scored, so you understand the task

A separate scorer checks the contract mechanically — every `goalId` copied from
that scenario's `targetableGoals`, no achieved-goal references, dates
well-formed and inside the requested window, roadmap phases non-overlapping —
and then runs probes specific to each scenario's athlete.

Do not optimise for that. It is described here so you understand what a good
answer is, not so you can satisfy a checklist. A plan that games the probes and
reads like a template is exactly the failure mode this exercise exists to
detect.
