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
import {
  extractSlots,
  extractLabels,
  extractNotes,
  parseJson,
} from "./parse-worksheet.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const fileIndex = argv.indexOf("--file");
const FILE = join(
  HERE,
  fileIndex >= 0 && argv[fileIndex + 1] ? argv[fileIndex + 1] : "WORKSHEET.md",
);

const source = readFileSync(FILE, "utf8");

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
