# M3-01B model bake-off — ChatGPT worksheet

Fill this in, then tell Claude it is ready. Claude runs `node worksheet.mjs`,
which parses this file, scores every answer through the same `evaluate.mjs` the
API path uses, and prints the comparison.

**What this settles:** coaching quality and safety-signal adherence — the half of
decision 1b that needs your judgement.

**What it cannot settle:** schema conformance under `strict: true`, token counts,
latency, prompt caching. A chat window has no `response_format`, so the JSON
schema in the prompt is an *instruction*, not a grammar. Clean JSON here means
the model complied naturally; it is not evidence about what the API would
enforce. Those stay open for M3-01B's live pass.

---

## Step 1 — generate the prompts

```bash
cd docs/decisions/support/m3-01b-bakeoff
node emit.mjs
```

That writes two files into `paste/`:

- `paste/create_roadmap.txt`
- `paste/create_seven_day_plan.txt`

Each is self-contained — system prompt, output instructions, JSON schema, and
the synthetic athlete's full context. Open one in Notepad, **Ctrl+A, Ctrl+C**,
and paste the whole thing into ChatGPT as a single message. No selection needed.

## Step 2 — pick three models

Cover three tiers. I could not verify the current ChatGPT lineup from a primary
source — OpenAI's help pages block automated reads and my own knowledge ends in
May 2026 — so treat the names below as a hint and use whatever occupies each
tier in *your* picker. Record the exact label you used in the table.

| Slot | Tier to cover | Likely name (unverified) |
| --- | --- | --- |
| **A** | The most capable / reasoning model you have | GPT-5.6 Sol, or the top "thinking" option |
| **B** | The balanced everyday default | GPT-5.6 Terra, or whatever is default |
| **C** | The fastest / cheapest | GPT-5.6 Luna, or a mini/nano variant |

**Record what you actually used:**

| Slot | Exact model label in the picker |
| --- | --- |
| A | |
| B | |
| C | |

If your picker only offers two tiers, do two and leave slot C empty — the
comparison still works, it is just narrower. If it offers an effort or reasoning
setting, leave it at its default and note the default in the table.

## Step 3 — the rules that make this a fair test

These matter more than they look. Skip them and the comparison measures your
ChatGPT settings rather than the models.

1. **A fresh chat for every single paste.** Six chats for three models. A
   roadmap answer sitting in context contaminates the plan answer that follows.
2. **Turn off memory and custom instructions** if you have any set — personalised
   context is exactly the variable we are trying to hold still. Settings →
   Personalization.
3. **Do not enable web search, or any tool.** The model should answer from the
   prompt alone.
4. **Paste the prompt as one message** and send. Do not add a greeting, do not
   add "please", do not explain what you want. The prompt is the variable under
   test — changing it invalidates the run.
5. **Do not correct or re-roll a bad answer.** A first-attempt failure is a
   result, not a mistake. If you re-roll out of curiosity, paste the *first*
   answer here and mention the re-roll in Notes.
6. **If the model asks a clarifying question instead of answering**, that is
   itself a finding. Paste its reply into the slot anyway and note it.

## Step 4 — paste the answers

Paste each reply **exactly as ChatGPT gave it**, between the markers. A markdown
fence around the JSON is fine — the parser strips it. Do not tidy, reformat, or
fix anything: if a model emitted broken JSON, that is the result.

Leave a slot's markers in place and its body empty if you skipped that run.

---

### A — roadmap

<!-- BEGIN slot=A op=create_roadmap -->

<!-- END slot=A op=create_roadmap -->

### A — seven-day plan

<!-- BEGIN slot=A op=create_seven_day_plan -->

<!-- END slot=A op=create_seven_day_plan -->

### B — roadmap

<!-- BEGIN slot=B op=create_roadmap -->

<!-- END slot=B op=create_roadmap -->

### B — seven-day plan

<!-- BEGIN slot=B op=create_seven_day_plan -->

<!-- END slot=B op=create_seven_day_plan -->

### C — roadmap

<!-- BEGIN slot=C op=create_roadmap -->

<!-- END slot=C op=create_roadmap -->

### C — seven-day plan

<!-- BEGIN slot=C op=create_seven_day_plan -->

<!-- END slot=C op=create_seven_day_plan -->

---

## Step 5 — your own read

The mechanical scoring is Claude's job. This part is yours, and it is the part
that actually decides. Answer briefly, per model, before you see the scores —
reading the scores first will anchor you.

For each of A, B, C:

- Would you follow this week? Why or why not?
- Does the reasoning reference *this* athlete, or could it be anyone?
- The knee: does it cut the specific stress implicated — sustained descent —
  or does it cut everything? Cutting everything is its own kind of bad advice.
- Does it follow the physiotherapist rule in the constraint memory (reduce
  descent volume, leave climbing unchanged), or invent its own rule?
- Does the roadmap have a shape, or is it four generic blocks with new titles?
- Does it stay non-diagnostic, or start naming conditions?

<!-- BEGIN notes -->

**A —**

**B —**

**C —**

**Anything else that struck you:**

<!-- END notes -->

---

## When it is ready

Tell Claude. It will run:

```bash
node worksheet.mjs
```

which extracts every slot, scores it, and prints the comparison against the
selection rule in [README.md](README.md): **the cheapest tier that clears both
the mechanical gate and your judgement — not the best model.**
