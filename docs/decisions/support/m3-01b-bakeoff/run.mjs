#!/usr/bin/env node
/**
 * M3-01B model bake-off harness.
 *
 * Answers the one question decision 1b actually turns on: which OpenAI model is
 * capable enough to produce a coaching proposal that holds the contract's schema
 * AND respects the safety signals in the context. Everything else about the
 * model choice is a rounding error at this scale.
 *
 * It never prints, logs, or writes the API key.
 *
 * Usage:
 *   node run.mjs --dry-run                 # no key, no calls: sizes and probes
 *   node run.mjs --list-models             # what this account can actually see
 *   node run.mjs --models a,b,c            # the real pass
 *   node run.mjs --models a,b --repeats 3  # conformance is a rate, not a coin flip
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { OPERATIONS } from "./schemas.mjs";
import { assembleContext, contextByteSizes, TODAY } from "./corpus.mjs";
import { buildMessages } from "./prompt.mjs";
import { PLAN_WINDOW, probe, validate, weekdayOf } from "./evaluate.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const API = "https://api.openai.com/v1";

// --- argument parsing ------------------------------------------------------

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name, fallback) => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const DRY_RUN = flag("dry-run");
const LIST_MODELS = flag("list-models");
const MODELS = value("models", "").split(",").filter(Boolean);
const REPEATS = Number(value("repeats", "2"));
const OPS = value("operations", "create_roadmap,create_seven_day_plan").split(",");

// --- key handling ----------------------------------------------------------

/**
 * Read once, never echoed. Nothing below interpolates it into a message, a
 * result record, or an error — a key in a thrown error string is a key in a log.
 */
function requireKey() {
  const key = process.env.OPENAI_API_KEY;
  if (!key || key.trim().length < 20) {
    console.error(
      "OPENAI_API_KEY is not set.\n" +
        "Set it for this session (the value is never written to disk or echoed):\n" +
        '  $env:OPENAI_API_KEY = "sk-proj-..."\n',
    );
    process.exit(1);
  }
  return key.trim();
}

async function callOpenAI(path, init, key) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 2000) };
  }
  return { ok: response.ok, status: response.status, body };
}

// --- one call --------------------------------------------------------------

async function runOne(model, operation, context, key) {
  const { messages, staticChars } = buildMessages(operation, context);
  const { schema } = OPERATIONS[operation];

  const base = {
    model,
    messages,
    response_format: { type: "json_schema", json_schema: schema },
  };

  const started = Date.now();
  // Newer models reject `max_completion_tokens` alongside some settings, and
  // older ones reject the parameter name entirely. Try capped, fall back once.
  let response = await callOpenAI(
    "/chat/completions",
    { method: "POST", body: JSON.stringify({ ...base, max_completion_tokens: 4000 }) },
    key,
  );
  let cappedOutput = true;
  if (!response.ok && /unsupported|unknown|not supported/i.test(JSON.stringify(response.body?.error ?? {}))) {
    response = await callOpenAI(
      "/chat/completions",
      { method: "POST", body: JSON.stringify(base) },
      key,
    );
    cappedOutput = false;
  }
  const latencyMs = Date.now() - started;

  if (!response.ok) {
    return {
      model,
      operation,
      ok: false,
      latencyMs,
      error: response.body?.error?.message ?? `HTTP ${response.status}`,
      errorType: response.body?.error?.type ?? null,
    };
  }

  const content = response.body?.choices?.[0]?.message?.content ?? "";
  const refusal = response.body?.choices?.[0]?.message?.refusal ?? null;
  const usage = response.body?.usage ?? {};

  let parsed = null;
  let parseError = null;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    parseError = String(error.message);
  }

  const failures = parsed ? validate(operation, parsed) : ["response was not JSON"];

  return {
    model,
    operation,
    ok: true,
    latencyMs,
    cappedOutput,
    refusal,
    parseError,
    inputTokens: usage.prompt_tokens ?? null,
    outputTokens: usage.completion_tokens ?? null,
    reasoningTokens: usage.completion_tokens_details?.reasoning_tokens ?? null,
    cachedInputTokens: usage.prompt_tokens_details?.cached_tokens ?? null,
    staticPrefixChars: staticChars,
    schemaHeld: failures.length === 0,
    failures,
    probes: probe(operation, parsed),
    output: parsed,
  };
}

// --- modes -----------------------------------------------------------------

async function listModels() {
  const key = requireKey();
  const { ok, body } = await callOpenAI("/models", {}, key);
  if (!ok) {
    console.error("Could not list models:", body?.error?.message ?? body);
    process.exit(1);
  }
  const ids = body.data
    .map((m) => m.id)
    .filter((id) => /^(gpt|o[0-9]|chatgpt)/.test(id))
    .sort();
  console.log(`${ids.length} chat-capable models visible to this key:\n`);
  for (const id of ids) console.log(`  ${id}`);
  console.log(
    "\nPick three or four spanning the tiers, then:\n  node run.mjs --models <a>,<b>,<c>\n",
  );
}

function dryRun() {
  const context = assembleContext();
  const sizes = contextByteSizes();

  console.log("=== Context size ===\n");
  for (const [key, bytes] of Object.entries(sizes)) {
    if (key === "historyEntryCount") continue;
    console.log(`  ${key.padEnd(28)} ${String(bytes).padStart(7)} bytes`);
  }
  console.log(`\n  training history entries     ${sizes.historyEntryCount}`);
  console.log(
    `\n  ADR-013 projected ceiling      30000 bytes  -> corpus is at ${Math.round((sizes.whole / 30000) * 100)}%`,
  );
  console.log(
    `  M3-01 accepted ceiling (plan)  10000 bytes  -> corpus is at ${Math.round((sizes.whole / 10000) * 100)}%`,
  );

  console.log("\n=== Prompt ordering (prompt-caching precondition) ===\n");
  for (const operation of OPS) {
    const { messages, staticChars } = buildMessages(operation, context);
    const volatileChars = messages[1].content.length;
    console.log(`  ${operation}`);
    console.log(
      `    static prefix   ${String(staticChars).padStart(6)} chars  (~${Math.round(staticChars / 4)} tokens)`,
    );
    console.log(`    volatile suffix ${String(volatileChars).padStart(6)} chars`);
    console.log(
      `    cacheable?      ${staticChars / 4 > 1024 ? "yes — prefix clears OpenAI's 1024-token threshold" : "NO — prefix is below the 1024-token threshold, caching will not fire"}`,
    );
  }

  console.log("\n=== Seven-day plan window ===\n");
  for (const date of PLAN_WINDOW) {
    console.log(`  ${date}  ${weekdayOf(date)}`);
  }

  console.log("\n=== Rough request size ===\n");
  const { messages } = buildMessages("create_seven_day_plan", context);
  const chars = messages.reduce((n, m) => n + m.content.length, 0);
  console.log(
    `  ~${Math.round(chars / 4)} input tokens (4 chars/token estimate; the real pass replaces this with measured counts)`,
  );
  console.log(
    `  budget.ts COACH_AI_FIXTURE_LIMITS.maxInputTokens is 8000 -> ${Math.round(chars / 4) > 8000 ? "EXCEEDED" : "within"}\n`,
  );
}

async function fullRun() {
  const key = requireKey();
  if (MODELS.length === 0) {
    console.error("No models given. Run --list-models first, then --models a,b,c");
    process.exit(1);
  }

  const context = assembleContext();
  const results = [];

  for (const model of MODELS) {
    for (const operation of OPS) {
      for (let attempt = 1; attempt <= REPEATS; attempt += 1) {
        process.stdout.write(`  ${model} / ${operation} / ${attempt} ... `);
        const result = await runOne(model, operation, context, key);
        result.attempt = attempt;
        results.push(result);
        console.log(
          result.ok
            ? `${result.schemaHeld ? "schema OK" : `${result.failures.length} failure(s)`}  ${result.latencyMs}ms  in=${result.inputTokens} out=${result.outputTokens} cached=${result.cachedInputTokens ?? 0}`
            : `ERROR — ${result.error}`,
        );
      }
    }
  }

  mkdirSync(join(HERE, "results"), { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = join(HERE, "results", `bakeoff-${stamp}.json`);
  const mdPath = join(HERE, "results", `bakeoff-${stamp}.md`);
  writeFileSync(jsonPath, JSON.stringify({ TODAY, results }, null, 2), "utf8");
  writeFileSync(mdPath, report(results), "utf8");

  console.log(`\nWrote:\n  ${jsonPath}\n  ${mdPath}\n`);
  console.log(report(results));
}

function report(results) {
  const models = [...new Set(results.map((r) => r.model))];
  const lines = [
    `# M3-01B model bake-off`,
    ``,
    `Run ${new Date().toISOString()} against the synthetic athlete, context date ${TODAY}.`,
    ``,
    `## Mechanical results`,
    ``,
    `| Model | Op | Schema held | Latency | In | Cached in | Out | Reasoning |`,
    `| --- | --- | --- | --- | --- | --- | --- | --- |`,
  ];

  for (const r of results) {
    lines.push(
      `| ${r.model} | ${r.operation.replace("create_", "")} | ${
        r.ok ? (r.schemaHeld ? "yes" : `**no** (${r.failures.length})`) : "call failed"
      } | ${r.latencyMs}ms | ${r.inputTokens ?? "—"} | ${r.cachedInputTokens ?? 0} | ${r.outputTokens ?? "—"} | ${r.reasoningTokens ?? "—"} |`,
    );
  }

  lines.push(``, `## Contract failures`, ``);
  const failed = results.filter((r) => r.ok && !r.schemaHeld);
  if (failed.length === 0) {
    lines.push(`None. Every model held the contract on every attempt.`);
  } else {
    for (const r of failed) {
      lines.push(`- **${r.model}** / ${r.operation} attempt ${r.attempt}:`);
      for (const f of r.failures) lines.push(`  - ${f}`);
    }
  }

  lines.push(``, `## Safety probes — seven-day plan`, ``);
  lines.push(
    `The planning note: flies Thursday, back late Sunday, no gym, wedding Saturday, knee twinging on descents, still wants one long run.`,
    ``,
    `| Model | No gym while travelling | Saturday empty | Long run | Names the knee | Names the return | Sessions | Total min |`,
    `| --- | --- | --- | --- | --- | --- | --- | --- |`,
  );
  for (const r of results.filter(
    (r) => r.operation === "create_seven_day_plan" && r.probes,
  )) {
    const p = r.probes;
    const tick = (b) => (b ? "yes" : "**no**");
    lines.push(
      `| ${r.model} | ${tick(p.noGymWhileTravelling)} | ${tick(p.weddingDayLeftEmpty)} | ${tick(p.hasLongRun)} | ${tick(p.acknowledgesKnee)} | ${tick(p.acknowledgesReturn)} | ${p.sessionCount} | ${p.totalMinutes} |`,
    );
  }

  lines.push(
    ``,
    `## What a human still has to judge`,
    ``,
    `Every column above is mechanical. None of it answers whether the plan reads like a`,
    `serious coach wrote it. Read the full \`output\` for each model in the JSON file and`,
    `judge: does the reasoning reference *this* athlete, or could it be anyone? Does the`,
    `knee handling reduce the specific stress implicated, or does it just cut everything?`,
    `Does the roadmap have a shape, or is it four generic blocks?`,
    ``,
    `## Measured numbers for M3-01B decision 4`,
    ``,
  );
  for (const model of models) {
    const rs = results.filter((r) => r.model === model && r.ok);
    if (rs.length === 0) continue;
    const max = (f) => Math.max(...rs.map((r) => r[f] ?? 0));
    lines.push(
      `- **${model}** — peak input ${max("inputTokens")} tokens, peak output ${max("outputTokens")} tokens, peak latency ${max("latencyMs")}ms`,
    );
  }
  lines.push(
    ``,
    `\`COACH_AI_FIXTURE_LIMITS\` currently sets \`maxInputTokens: 8000\`, \`maxOutputTokens: 2000\`,`,
    `\`deadlineMs: 30000\`. Those were guesses. Size decision 4 against the peaks above plus`,
    `headroom, not against the guesses.`,
  );

  return lines.join("\n");
}

// --- entry -----------------------------------------------------------------

if (LIST_MODELS) await listModels();
else if (DRY_RUN) dryRun();
else await fullRun();
