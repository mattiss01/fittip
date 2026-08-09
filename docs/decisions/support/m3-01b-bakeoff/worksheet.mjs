#!/usr/bin/env node
/**
 * Parses WORKSHEET.md and scores whatever the product owner pasted into it.
 *
 * Exists so that "Claude evaluates the results" is a script rather than an agent
 * reading JSON by eye. The scoring path is identical to the API harness — same
 * `evaluate.mjs`, same scenario probes — because a model scored generously for
 * arriving through a different door is worse than no comparison at all.
 *
 *   node worksheet.mjs
 *   node worksheet.mjs --file WORKSHEET.md
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { runProbes, validate } from "./evaluate.mjs";
import { getScenario } from "./scenarios/index.mjs";
import { renderReport } from "./report.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const fileIndex = argv.indexOf("--file");
const FILE = join(
  HERE,
  fileIndex >= 0 && argv[fileIndex + 1] ? argv[fileIndex + 1] : "WORKSHEET.md",
);

const source = readFileSync(FILE, "utf8");

// --- extraction ------------------------------------------------------------

function extractSlots(text) {
  const pattern =
    /<!--\s*BEGIN slot=(\w+) scenario=([\w-]+) op=(create_roadmap|create_seven_day_plan)\s*-->([\s\S]*?)<!--\s*END\s*-->/g;
  const slots = [];
  let match;
  while ((match = pattern.exec(text)) !== null) {
    slots.push({
      slot: match[1],
      scenario: match[2],
      operation: match[3],
      body: match[4].trim(),
    });
  }
  return slots;
}

/** The label table, so the report names models rather than letters. */
function extractLabels(text) {
  const labels = {};
  const section = text.split("**Record what you actually used:**")[1] ?? "";
  for (const row of section.split("\n").slice(0, 12)) {
    const match = row.match(/^\|\s*([ABC])\s*\|\s*(.*?)\s*\|\s*$/);
    if (match && match[2] && !/^-+$/.test(match[2])) labels[match[1]] = match[2];
  }
  return labels;
}

function extractNotes(text) {
  const match = text.match(
    /<!--\s*BEGIN notes\s*-->([\s\S]*?)<!--\s*END notes\s*-->/,
  );
  return match ? match[1].trim() : "";
}

/** Tolerate a fence, a "json" tag, and stray prose on either side. */
function parseJson(raw) {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : raw).trim();
  if (!candidate) return { parsed: null, error: "slot is empty" };
  try {
    return { parsed: JSON.parse(candidate), error: null };
  } catch {
    const first = candidate.indexOf("{");
    const last = candidate.lastIndexOf("}");
    if (first >= 0 && last > first) {
      try {
        return {
          parsed: JSON.parse(candidate.slice(first, last + 1)),
          error: null,
        };
      } catch (error) {
        return { parsed: null, error: `not valid JSON — ${error.message}` };
      }
    }
    return {
      parsed: null,
      error:
        "no JSON object found — if the model replied with prose or a clarifying question, that is itself the result",
    };
  }
}

// --- scoring ---------------------------------------------------------------

const labels = extractLabels(source);
const slots = extractSlots(source);

if (slots.length === 0) {
  console.error(
    `No slot markers found in ${FILE}.\nThe BEGIN/END comment pairs must stay in place — only the body between them is filled.`,
  );
  process.exit(1);
}

const results = slots.map((entry) => {
  const scenario = getScenario(entry.scenario);
  const skipped = entry.body === "";
  const { parsed, error } = skipped
    ? { parsed: null, error: null }
    : parseJson(entry.body);
  const failures = skipped
    ? []
    : parsed
      ? validate(entry.operation, parsed, scenario)
      : [error];

  return {
    label: labels[entry.slot] || `slot ${entry.slot}`,
    slot: entry.slot,
    scenario: entry.scenario,
    operation: entry.operation,
    skipped,
    parsed,
    schemaHeld: Boolean(parsed) && failures.length === 0,
    failures,
    probes: parsed ? runProbes(entry.operation, parsed, scenario) : null,
  };
});

const out = renderReport({
  title: "M3-01B model comparison — ChatGPT worksheet",
  source: FILE.split(/[\\/]/).pop(),
  results,
  notes: extractNotes(source),
  caveat: [
    "> **This cannot settle schema conformance.** A chat window has no",
    "> `response_format`, so the schema was an instruction rather than a grammar.",
    "> A pass below means the model complied naturally, not that `strict: true`",
    "> would enforce it. Token counts, latency, and prompt caching are unavailable",
    "> by this route and stay open for M3-01B's live pass.",
  ].join("\n"),
});

mkdirSync(join(HERE, "results"), { recursive: true });
const path = join(
  HERE,
  "results",
  `worksheet-${new Date().toISOString().replace(/[:.]/g, "-")}.md`,
);
writeFileSync(path, out, "utf8");
console.log(out);
console.log(`\n---\nWrote ${path}`);
