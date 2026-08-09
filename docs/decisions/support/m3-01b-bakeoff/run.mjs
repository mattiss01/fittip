#!/usr/bin/env node
/**
 * M3-01B model bake-off — the API path.
 *
 * The only route that can settle schema conformance under `strict: true`, real
 * token counts, latency, and whether prompt caching fires. The worksheet and
 * Codex paths answer coaching quality; this one answers everything else.
 *
 * It never prints, logs, or writes the API key.
 *
 *   node run.mjs --dry-run                      # no key: sizes and windows
 *   node run.mjs --list-models                  # what this account can see
 *   node run.mjs --models a,b,c                 # required scenarios
 *   node run.mjs --models a,b --all             # every scenario
 *   node run.mjs --models a --scenarios cold-start --repeats 3
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { OPERATIONS } from "./schemas.mjs";
import { getScenario, REQUIRED, SCENARIOS } from "./scenarios/index.mjs";
import { buildMessages } from "./prompt.mjs";
import { planWindow, runProbes, validate, weekdayOf } from "./evaluate.mjs";
import { renderReport } from "./report.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const API = "https://api.openai.com/v1";

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const MODELS = value("models", "").split(",").filter(Boolean);
const REPEATS = Number(value("repeats", "2"));
const OPS = value("operations", "create_roadmap,create_seven_day_plan").split(",");
const SCENARIO_NAMES = flag("all")
  ? Object.keys(SCENARIOS)
  : value("scenarios")
    ? value("scenarios").split(",")
    : REQUIRED;

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

async function runOne(model, scenario, operation, key) {
  const { messages, staticChars } = buildMessages(operation, scenario.context);
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
    {
      method: "POST",
      body: JSON.stringify({ ...base, max_completion_tokens: 4000 }),
    },
    key,
  );
  if (
    !response.ok &&
    /unsupported|unknown|not supported/i.test(
      JSON.stringify(response.body?.error ?? {}),
    )
  ) {
    response = await callOpenAI(
      "/chat/completions",
      { method: "POST", body: JSON.stringify(base) },
      key,
    );
  }
  const latencyMs = Date.now() - started;

  const common = {
    label: model,
    scenario: scenario.name,
    operation,
    skipped: false,
    latencyMs,
  };

  if (!response.ok) {
    return {
      ...common,
      parsed: null,
      schemaHeld: false,
      failures: [response.body?.error?.message ?? `HTTP ${response.status}`],
      probes: null,
    };
  }

  const content = response.body?.choices?.[0]?.message?.content ?? "";
  const usage = response.body?.usage ?? {};

  let parsed = null;
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = null;
  }

  const failures = parsed
    ? validate(operation, parsed, scenario)
    : ["response was not JSON"];

  return {
    ...common,
    inputTokens: usage.prompt_tokens ?? null,
    outputTokens: usage.completion_tokens ?? null,
    reasoningTokens: usage.completion_tokens_details?.reasoning_tokens ?? null,
    cachedInputTokens: usage.prompt_tokens_details?.cached_tokens ?? null,
    staticPrefixChars: staticChars,
    parsed,
    schemaHeld: Boolean(parsed) && failures.length === 0,
    failures,
    probes: parsed ? runProbes(operation, parsed, scenario) : null,
  };
}

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
  console.log(`\nPick three spanning the tiers:\n  node run.mjs --models <a>,<b>,<c>\n`);
}

function dryRun() {
  const bytes = (v) => Buffer.byteLength(JSON.stringify(v), "utf8");

  for (const name of SCENARIO_NAMES) {
    const scenario = getScenario(name);
    const context = scenario.context;
    const whole = bytes(context);

    console.log(`\n=== ${scenario.name} ===`);
    console.log(`    ${scenario.title}\n`);
    console.log(`  goals (targetable)      ${String(context.targetableGoals.length).padStart(5)}`);
    console.log(`  goals (historical)      ${String(context.historicalGoals.length).padStart(5)}`);
    console.log(`  memory items            ${String(context.memory.length).padStart(5)}`);
    console.log(`  history entries         ${String(context.trainingHistory.length).padStart(5)}`);
    console.log(`  planning note bytes     ${String(bytes(context.planningNote)).padStart(5)}`);
    console.log(`  whole context bytes     ${String(whole).padStart(5)}`);
    console.log(
      `    vs ADR-013 ceiling 30000 -> ${Math.round((whole / 30000) * 100)}%`,
    );
    console.log(
      `    vs shipped ceiling 10000 -> ${Math.round((whole / 10000) * 100)}%${whole > 10000 ? "  EXCEEDS TODAY'S CODE" : ""}`,
    );

    const { messages, staticChars } = buildMessages(
      "create_seven_day_plan",
      context,
    );
    const chars = messages.reduce((n, m) => n + m.content.length, 0);
    console.log(
      `  ~input tokens           ${String(Math.round(chars / 4)).padStart(5)}  (4 chars/token estimate)`,
    );
    console.log(
      `    budget.ts maxInputTokens 8000 -> ${Math.round(chars / 4) > 8000 ? "EXCEEDED" : "within"}`,
    );
    console.log(
      `  static prefix           ${String(Math.round(staticChars / 4)).padStart(5)} tokens -> caching ${staticChars / 4 > 1024 ? "can fire" : "will NOT fire (below 1024)"}`,
    );

    const w = planWindow(scenario.today);
    console.log(`  plan window             ${w[0]} (${weekdayOf(w[0])}) .. ${w[6]} (${weekdayOf(w[6])})`);
    console.log(`  plan probes             ${scenario.planProbes.length} (${scenario.planProbes.filter((p) => p.mustPass).length} must pass)`);
  }
  console.log();
}

async function fullRun() {
  const key = requireKey();
  if (MODELS.length === 0) {
    console.error("No models given. Run --list-models first, then --models a,b,c");
    process.exit(1);
  }

  const results = [];
  for (const model of MODELS) {
    for (const name of SCENARIO_NAMES) {
      const scenario = getScenario(name);
      for (const operation of OPS) {
        for (let attempt = 1; attempt <= REPEATS; attempt += 1) {
          process.stdout.write(`  ${model} / ${name} / ${operation} / ${attempt} ... `);
          const result = await runOne(model, scenario, operation, key);
          results.push(result);
          console.log(
            result.schemaHeld
              ? `ok  ${result.latencyMs}ms  in=${result.inputTokens} out=${result.outputTokens} cached=${result.cachedInputTokens ?? 0}`
              : `${result.failures.length} failure(s)  ${result.latencyMs}ms`,
          );
        }
      }
    }
  }

  const out = renderReport({
    title: "M3-01B model bake-off — API",
    source: "OpenAI API",
    results,
    notes: "",
    caveat: null,
  });

  const measured = results.filter((r) => r.inputTokens);
  const tokenLines = ["", "## Measured numbers for M3-01B decision 4", ""];
  for (const model of MODELS) {
    const rs = measured.filter((r) => r.label === model);
    if (rs.length === 0) continue;
    const max = (f) => Math.max(...rs.map((r) => r[f] ?? 0));
    tokenLines.push(
      `- **${model}** — peak input ${max("inputTokens")}, peak output ${max("outputTokens")}, peak latency ${max("latencyMs")}ms, best cached ${max("cachedInputTokens")}`,
    );
  }
  tokenLines.push(
    "",
    "`COACH_AI_FIXTURE_LIMITS` sets `maxInputTokens: 8000`, `maxOutputTokens: 2000`,",
    "`deadlineMs: 30000`. Those were guesses. Size decision 4 against the peaks",
    "above plus headroom.",
  );

  const full = out + "\n" + tokenLines.join("\n");

  mkdirSync(join(HERE, "results"), { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  writeFileSync(join(HERE, "results", `api-${stamp}.json`), JSON.stringify(results, null, 2), "utf8");
  writeFileSync(join(HERE, "results", `api-${stamp}.md`), full, "utf8");
  console.log(`\n${full}`);
}

if (flag("list-models")) await listModels();
else if (flag("dry-run")) dryRun();
else await fullRun();
