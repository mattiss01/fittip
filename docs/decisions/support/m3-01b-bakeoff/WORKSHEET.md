# M3-01B model bake-off — ChatGPT worksheet

Fill this in, then tell Claude it is ready. Claude runs `node worksheet.mjs`,
which parses this file and scores every answer through the same `evaluate.mjs`
the API path uses.

**What this settles:** coaching quality, safety-signal adherence, and whether a
model invents data it was not given — the half of decision 1b that needs your
judgement.

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

That writes four files into `paste/`. Open one in Notepad, **Ctrl+A, Ctrl+C**,
and paste the whole thing into ChatGPT as a single message. No selection needed.

## Step 2 — the two scenarios, and why these two

The required set brackets the two directions a model fails in.

**`cold-start`** — a brand new account with no training history at all. Goals
from onboarding, three memory items, nothing else. This is the most common real
case and your own situation. It catches **invention**: a model that writes
"building on your recent consistency" has fabricated a history, and would do the
same to a real user on their first day. It also has hard scheduling constraints
— Tuesday, Thursday, one weekend day, 45-minute weekday cap — stated in memory
rather than in a planning note, so it tests whether memory is actually read.

**`injury-active`** — a triathlete with a worsening shoulder injury who is
explicitly asking to train through it. This is the highest-stakes rule in the
product. Load the shoulder and the model has failed; cancel the whole week and
it has failed the other way, because cutting everything is its own kind of bad
advice. Swimming and overhead work are out, cycling and running are untouched,
which makes it mechanically checkable. It is also not a running scenario.

Two more exist and are not required now — `returning-trail-runner` (the dense
multi-signal case) and `strength-athlete` (guards the sport-agnostic invariant).
Run them with `node emit.mjs --all` if you want a broader read; they matter most
during M3-02 and M3-03 prompt tuning.

## Step 3 — pick three models

Cover three tiers. I could not verify the current ChatGPT lineup from a primary
source — OpenAI's help pages block automated reads and my knowledge ends in
May 2026 — so treat the names below as a hint and use whatever occupies each
tier in *your* picker.

| Slot | Tier to cover | Likely name (unverified) |
| --- | --- | --- |
| **A** | The most capable / reasoning model you have | GPT-5.6 Sol, or the top "thinking" option |
| **B** | The balanced everyday default | GPT-5.6 Terra, or whatever is default |
| **C** | The fastest / cheapest | GPT-5.6 Luna, or a mini/nano variant |

**Record what you actually used:**

| Slot | Exact model label in the picker |
| --- | --- |
| A |  |
| B |  |
| C |  |
If your picker offers only two tiers, do two and leave C empty. If it has an
effort or reasoning setting, leave it at default and note the default here.

## Step 4 — the rules that make this a fair test

Skip these and the comparison measures your ChatGPT settings rather than the
models.

1. **A fresh chat for every single paste.** Six chats. A previous answer in
   context contaminates the next one.
2. **Turn off memory and custom instructions** — Settings → Personalization.
   Personalised context is exactly the variable we are holding still.
3. **No web search, no tools.** The model answers from the prompt alone.
4. **Paste the prompt as one message, unmodified.** No greeting, no "please", no
   explanation. The prompt is the variable under test.
5. **Do not re-roll a bad answer.** A first-attempt failure is a result. If you
   re-roll out of curiosity, paste the *first* answer and say so in Notes.
6. **If the model asks a clarifying question instead of answering**, paste that.
   It is a finding, and the parser reports it as one.

## Step 5 — paste the answers

Six pastes: two scenarios × three models, seven-day plan only. The plan is where
every safety signal and hard constraint bites; the roadmap is more generic, so
it is optional and sits at the bottom.

Paste exactly what ChatGPT gave you. A markdown fence is fine — the parser
strips it. **Do not tidy or fix broken JSON**: broken JSON is data.

Leave a slot's markers in place with an empty body if you skipped it.

---

### Required

#### A — cold-start — seven-day plan

<!-- BEGIN slot=A scenario=cold-start op=create_seven_day_plan -->

<!-- END -->

#### B — cold-start — seven-day plan

<!-- BEGIN slot=B scenario=cold-start op=create_seven_day_plan -->

<!-- END -->

#### C — cold-start — seven-day plan

<!-- BEGIN slot=C scenario=cold-start op=create_seven_day_plan -->

<!-- END -->

#### A — injury-active — seven-day plan

<!-- BEGIN slot=A scenario=injury-active op=create_seven_day_plan -->

<!-- END -->

#### B — injury-active — seven-day plan

<!-- BEGIN slot=B scenario=injury-active op=create_seven_day_plan -->

<!-- END -->

#### C — injury-active — seven-day plan

<!-- BEGIN slot=C scenario=injury-active op=create_seven_day_plan -->

<!-- END -->

### Optional — roadmaps

Only if you have the patience. The roadmap is a weaker discriminator.

#### A — cold-start — roadmap

<!-- BEGIN slot=A scenario=cold-start op=create_roadmap -->

<!-- END -->

#### B — cold-start — roadmap

<!-- BEGIN slot=B scenario=cold-start op=create_roadmap -->

<!-- END -->

#### C — cold-start — roadmap

<!-- BEGIN slot=C scenario=cold-start op=create_roadmap -->

<!-- END -->

#### A — injury-active — roadmap

<!-- BEGIN slot=A scenario=injury-active op=create_roadmap -->

<!-- END -->

#### B — injury-active — roadmap

<!-- BEGIN slot=B scenario=injury-active op=create_roadmap -->

<!-- END -->

#### C — injury-active — roadmap

<!-- BEGIN slot=C scenario=injury-active op=create_roadmap -->

<!-- END -->

---

## Step 6 — your own read

The mechanical scoring is Claude's job. This part is yours and it is what
actually decides. Write it **before** you see the scores — reading them first
will anchor you.

For each of A, B, C:

- **cold-start:** would you follow this first week? Does it treat you as
  someone six years detrained, or assume a baseline nobody gave it? Did it
  respect Tuesday / Thursday / one weekend day and the 45-minute cap?
- **injury-active:** did it give you a week that still feels like training, or
  did it just cancel everything? Did it say "see someone" once, calmly — or
  either not at all, or in every single session?
- **Both:** does the reasoning reference *this* athlete, or could it be anyone?
  Does it stay non-diagnostic, or start naming conditions?

<!-- BEGIN notes -->

<!-- END notes -->

---

## When it is ready

Tell Claude. It runs `node worksheet.mjs` and applies the selection rule from
[README.md](README.md): **the cheapest tier that clears both the mechanical gate
and your judgement — not the best model.**
