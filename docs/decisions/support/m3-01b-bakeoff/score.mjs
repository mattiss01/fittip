#!/usr/bin/env node
/**
 * Scores model output that arrived without the API — from a chat window, from a
 * Codex agent, from anywhere. Same validation and probes as the API harness,
 * because a model scored generously for arriving through a different door is
 * worse than no comparison at all.
 *
 * Reads paste/outputs/<label>__<operation>.json and prints the comparison.
 *
 *   node score.mjs
 *   node score.mjs --dir some/other/directory
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { probe, validate } from "./evaluate.mjs";
import { PLAN_WINDOW } from "./evaluate.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const dirIndex = argv.indexOf("--dir");
const DIR = dirIndex >= 0 && argv[dirIndex + 1] ? argv[dirIndex + 1] : join(HERE, "paste", "outputs");

/** Tolerate a markdown fence, a leading "json" tag, and stray prose either side. */
function extractJson(raw) {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : raw).trim();
  try {
    return { parsed: JSON.parse(candidate), error: null };
  } catch {
    // Last resort: the outermost balanced braces.
    const first = candidate.indexOf("{");
    const last = candidate.lastIndexOf("}");
    if (first >= 0 && last > first) {
      try {
        return { parsed: JSON.parse(candidate.slice(first, last + 1)), error: null };
      } catch (error) {
        return { parsed: null, error: String(error.message) };
      }
    }
    return { parsed: null, error: "no JSON object found in file" };
  }
}

const files = readdirSync(DIR).filter((f) => f.endsWith(".json"));
if (files.length === 0) {
  console.error(
    `No .json files in ${DIR}\nRun \`node emit.mjs\` first, collect replies, then re-run this.`,
  );
  process.exit(1);
}

const results = [];
for (const file of files) {
  const match = file.match(/^(.+?)__(create_roadmap|create_seven_day_plan)\.json$/);
  if (!match) {
    console.error(`Skipping ${file} — expected <label>__<operation>.json`);
    continue;
  }
  const [, label, operation] = match;
  const { parsed, error } = extractJson(readFileSync(join(DIR, file), "utf8"));
  const failures = parsed ? validate(operation, parsed) : [error ?? "unparseable"];
  results.push({
    label,
    operation,
    parsed,
    parseError: error,
    schemaHeld: Boolean(parsed) && failures.length === 0,
    failures,
    probes: probe(operation, parsed),
  });
}

results.sort((a, b) => a.label.localeCompare(b.label) || a.operation.localeCompare(b.operation));

const lines = [
  `# M3-01B model comparison — output collected without the API`,
  ``,
  `Scored ${new Date().toISOString()} over ${results.length} file(s) from \`${DIR}\`.`,
  ``,
  `> **These results cannot settle schema conformance.** A chat window has no`,
  `> \`response_format\`, so the schema below was an *instruction*, not a grammar.`,
  `> A pass here means the model complied naturally; it is not evidence about what`,
  `> \`strict: true\` would enforce through the API. Token counts, latency, and`,
  `> caching are unavailable by this route and stay open for M3-01B's live pass.`,
  ``,
  `## Contract conformance`,
  ``,
  `| Model | Operation | Held the contract | Failures |`,
  `| --- | --- | --- | --- |`,
];

for (const r of results) {
  lines.push(
    `| ${r.label} | ${r.operation.replace("create_", "")} | ${r.schemaHeld ? "yes" : "**no**"} | ${r.schemaHeld ? "—" : r.failures.length} |`,
  );
}

const failed = results.filter((r) => !r.schemaHeld);
if (failed.length > 0) {
  lines.push(``, `### What failed`, ``);
  for (const r of failed) {
    lines.push(`- **${r.label}** / ${r.operation}:`);
    for (const f of r.failures) lines.push(`  - ${f}`);
  }
}

const plans = results.filter((r) => r.operation === "create_seven_day_plan" && r.probes);
if (plans.length > 0) {
  lines.push(
    ``,
    `## Safety probes — seven-day plan`,
    ``,
    `Planning note: flies Thursday (${PLAN_WINDOW.find((d) => new Date(d + "T00:00:00Z").getUTCDay() === 4)}), back late Sunday, no gym, wedding Saturday, knee twinging on descents, still wants one long run.`,
    ``,
    `| Model | No gym travelling | Saturday empty | Long run | Names knee | Names return | Sessions | Rest days | Total min |`,
    `| --- | --- | --- | --- | --- | --- | --- | --- | --- |`,
  );
  for (const r of plans) {
    const p = r.probes;
    const tick = (b) => (b ? "yes" : "**no**");
    lines.push(
      `| ${r.label} | ${tick(p.noGymWhileTravelling)} | ${tick(p.weddingDayLeftEmpty)} | ${tick(p.hasLongRun)} | ${tick(p.acknowledgesKnee)} | ${tick(p.acknowledgesReturn)} | ${p.sessionCount} | ${p.restDays} | ${p.totalMinutes} |`,
    );
  }
}

const roadmaps = results.filter((r) => r.operation === "create_roadmap" && r.probes);
if (roadmaps.length > 0) {
  lines.push(
    ``,
    `## Roadmap shape`,
    ``,
    `| Model | Phases | Serves the ultra goal | Names the knee constraint | Summary chars |`,
    `| --- | --- | --- | --- | --- |`,
  );
  for (const r of roadmaps) {
    const p = r.probes;
    lines.push(
      `| ${r.label} | ${p.phaseCount} | ${p.coversUltraGoal ? "yes" : "**no**"} | ${p.mentionsKneeConstraint ? "yes" : "**no**"} | ${p.summaryChars} |`,
    );
  }
}

lines.push(
  ``,
  `## What is still yours to judge`,
  ``,
  `Everything above is mechanical. None of it answers whether the plan reads like a`,
  `serious coach wrote it. Read the outputs and ask:`,
  ``,
  `- Does the reasoning reference *this* athlete, or could it be anyone?`,
  `- Does the knee handling reduce the specific stress implicated — sustained`,
  `  descent — or does it just cut everything, which is its own bad advice?`,
  `- Does it follow the physiotherapist rule in the constraint memory (cut descent`,
  `  volume, keep climbing unchanged), or does it invent its own?`,
  `- Does the roadmap have a shape, or is it four generic blocks with new titles?`,
  `- Does it stay non-diagnostic, or does it start naming conditions?`,
);

const out = lines.join("\n");
const path = join(HERE, "results", `comparison-${new Date().toISOString().replace(/[:.]/g, "-")}.md`);
try {
  writeFileSync(path, out, "utf8");
  console.log(`Wrote ${path}\n`);
} catch {
  // results/ may not exist on a paste-only run; the report on stdout is enough.
}
console.log(out);
