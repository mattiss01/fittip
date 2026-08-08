# M3-01B model bake-off

Decision support for [M3-01B](../../../backlog/M3/M3-01B-REAL-PROVIDER-ADAPTER.md)
open decision 1b — which OpenAI model FitTip's coaching adapter should call.

Committed rather than left in a scratchpad because the synthetic corpus is a
scope line in that ticket: M3-02 and M3-03 reuse it for prompt tuning, and the
product owner has too little real training history for their own data to
exercise the context assembly.

**This is decision-support tooling. It ships nothing.** No file here is imported
by application code, and nothing in `src/` may ever import from this directory.

## Why it exists

At 50–200 development calls against ~€5 of credit, the spend difference across
the whole model range is roughly €0.20 against €20. Cost carries no signal. The
risk that matters is the opposite one: proving the concept on a model too small
to do it, then recording that in M3-02 as a product finding when it was a tier
artifact.

## How the model actually gets selected

Two gates and a rule. The rule is the point — without it this is a pile of
output nobody can decide from.

**Gate 1 — mechanical, decided by `score.mjs`. A model that fails is out.**

- Every `goalId` copied exactly from `targetableGoals`. An invented id, or a
  reference to an achieved goal in `historicalGoals`, is disqualifying: it means
  the model treats a finished objective as something to train for.
- Dates well-formed, inside the requested window, never in the past.
- Roadmap phases non-overlapping.
- The planning note respected: no gym session while travelling, the wedding
  Saturday left empty, a long run present, the knee signal and the return from
  illness acknowledged in the reasoning.

**Gate 2 — judgement, and only the product owner can decide it.** Read the
outputs and ask:

- Does the reasoning reference *this* athlete, or could it be anyone?
- Does the knee handling reduce the specific stress implicated — sustained
  descent — or does it cut everything, which is its own bad advice?
- Does it follow the physiotherapist rule in the constraint memory (cut descent
  volume, keep climbing unchanged), or invent its own?
- Does the roadmap have a shape, or is it four generic blocks with new titles?
- Does it stay non-diagnostic, or start naming conditions?

**The rule: choose the cheapest tier that clears both gates.** Not the best
model — the cheapest adequate one. Start capable so that a failure is a real
product finding rather than a tier artifact, then walk down until a gate breaks,
and take the tier above the break. Record the chosen model and the evidence in
M3-01B decision 1b.

A model that clears gate 1 and fails gate 2 is the expected outcome at the small
end, and it is the whole reason this exercise exists.

## Files

| File | What it is |
| --- | --- |
| `schemas.mjs` | The two response schemas, mirroring `src/server/ai/contracts.ts` exactly. Not an idealised schema — M3-01B non-goal 2 forbids changing the contract, so the bake-off must prove a model can hit the shape that already exists. |
| `corpus.mjs` | The synthetic athlete. Authored, not generated — every element exercises a named rule; see its header comment. |
| `prompt.mjs` | Draft system prompt carrying the safety rules. **Not** the shipped prompt: the real ones belong to M3-02 and M3-03 and depend on ADR-013/014 landing. |
| `evaluate.mjs` | Contract validation and safety probes, shared by every path so they cannot drift. |
| `run.mjs` | The API path. Needs `OPENAI_API_KEY`; never prints or writes it. |
| `emit.mjs` | Writes self-contained paste-ready prompts for the no-key paths. |
| `score.mjs` | Scores output that arrived from anywhere — chat window, Codex, API. |
| `CODEX-HANDOFF.md` | A brief to paste into a Codex session, one run per model. |

Generated output (`paste/`, `results/`) is gitignored. Regenerate with
`node emit.mjs`.

## Running it

```bash
cd docs/decisions/support/m3-01b-bakeoff

# No key needed. Context sizes, prompt ordering, plan window.
node run.mjs --dry-run

# Highest fidelity. The key stays in your shell; nothing writes or echoes it.
node run.mjs --list-models
node run.mjs --models <a>,<b>,<c> --repeats 3

# No-key paths: emit prompts, collect replies into paste/outputs/, then score.
node emit.mjs
node score.mjs
```

Budget for a full API pass: 3 models x 2 operations x 3 repeats = 18 calls.
Cents.

## What each path can and cannot prove

| Path | Contract conformance under `strict: true` | Coaching quality and safety | Tokens, latency, caching |
| --- | --- | --- | --- |
| `run.mjs` with an API key | yes | yes | yes |
| Codex agent | no — no `response_format` | indicative; Codex adds its own scaffolding | no |
| ChatGPT copy-paste | no — no `response_format` | yes | no |

A chat window has no `response_format`, so the schema is an *instruction*, not a
grammar. Clean JSON from that route means the model complied naturally. It is
not evidence about what `strict: true` would enforce, and `score.mjs` prints
that caveat at the top of its own report so it cannot get lost.

## Findings from the dry run, 8 August 2026

Three things fell out before a single API call. All three are recorded in
M3-01B; repeated here only because this is where they were measured.

**1. The corpus is 10,451 bytes — 105% of the ceiling the accepted code
enforces.** `COACH_AI_CONTEXT_LIMITS.create_seven_day_plan.maxSerializedBytes`
is `10_000` (`src/server/ai/context.ts:46`). A context this rich is rejected
today with `context_too_large`. That is the ADR-013/014 gap made concrete.

**2. Training history is 6,143 bytes for only 12 entries.** Eight weeks at four
sessions a week lands near 16 KB for history alone. ADR-013's projected 30,000
total is plausible but not generous, and this corpus sits at 35% of it while
being deliberately rich.

**3. The static prompt prefix is ~880 tokens, below OpenAI's 1024-token caching
threshold.** M3-01B calls prompt caching "more significant than model choice at
the margin" — but a tight, well-written system prompt is *too short to trigger
it*. The JSON schema also counts toward the cacheable prefix, so this may clear
the bar in practice; `run.mjs` reads `cached_tokens` to settle it.

That third one is a genuine design tension: caching rewards a long static
prefix, good prompt engineering rewards a short one. If caching does not fire,
the honest answer at this scale is to accept that rather than pad the prompt to
suit the billing system — but it should be a recorded decision, not an accident.
