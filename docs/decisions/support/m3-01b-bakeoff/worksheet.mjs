#!/usr/bin/env node
/**
 * Parses WORKSHEET.md and scores whatever the product owner pasted into it.
 *
 * Exists so that "Claude evaluates the results" is a script rather than an
 * agent reading JSON by eye. The scoring path is identical to the API harness —
 * same `evaluate.mjs` — because a model scored generously for arriving through
 * a different door is worse than no comparison at all.
 *
 *   node worksheet.mjs
 *   node worksheet.mjs --file WORKSHEET.md
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { probe, validate, PLAN_WINDOW, weekdayOf } from "./evaluate.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const fileIndex = argv.indexOf("--file");
const FILE = join(
  HERE,
  fileIndex >= 0 && argv[fileIndex + 1] ? argv[fileIndex + 1] : "WORKSHEET.md",
);

const source = readFileSync(FILE, "utf8");

// --- extraction ------------------------------------------------------------

/** Everything between a BEGIN/END marker pair, keyed by slot and operation. */
function extractSlots(text) {
  const pattern =
    /<!--\s*BEGIN slot=(\w+) op=(create_roadmap|create_seven_day_plan)\s*-->([\s\S]*?)<!--\s*END slot=\1 op=\2\s*-->/g;
  const slots = [];
  let match;
  while ((match = pattern.exec(text)) !== null) {
    slots.push({ slot: match[1], operation: match[2], body: match[3].trim() });
  }
  return slots;
}

/** The label table in step 2, so the report names models rather than letters. */
function extractLabels(text) {
  const labels = {};
  const section = text.split("**Record what you actually used:**")[1] ?? "";
  const rows = section.split("\n").slice(0, 12);
  for (const row of rows) {
    const match = row.match(/^\|\s*([ABC])\s*\|\s*(.*?)\s*\|\s*$/);
    if (match && match[2]) labels[match[1]] = match[2];
  }
  return labels;
}

function extractNotes(text) {
  const match = text.match(/<!--\s*BEGIN notes\s*-->([\s\S]*?)<!--\s*END notes\s*-->/);
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
        "no JSON object found — if the model replied with prose or a clarifying question, that is the result",
    };
  }
}

// --- scoring ---------------------------------------------------------------

const labels = extractLabels(source);
const notes = extractNotes(source);
const slots = extractSlots(source);

if (slots.length === 0) {
  console.error(
    `No slot markers found in ${FILE}.\nThe BEGIN/END comment pairs must stay in place — only the body between them is filled.`,
  );
  process.exit(1);
}

const results = slots.map((entry) => {
  const { parsed, error } = parseJson(entry.body);
  const skipped = entry.body === "";
  const failures = skipped
    ? []
    : parsed
      ? validate(entry.operation, parsed)
      : [error];
  return {
    ...entry,
    label: labels[entry.slot] || `slot ${entry.slot}`,
    skipped,
    parsed,
    schemaHeld: Boolean(parsed) && failures.length === 0,
    failures,
    probes: probe(entry.operation, parsed),
  };
});

const answered = results.filter((r) => !r.skipped);

// --- report ----------------------------------------------------------------

const thursday = PLAN_WINDOW.find((d) => weekdayOf(d) === "Thursday");
const saturday = PLAN_WINDOW.find((d) => weekdayOf(d) === "Saturday");

const lines = [
  `# M3-01B model comparison — ChatGPT worksheet`,
  ``,
  `Scored ${new Date().toISOString()} from \`${FILE.split(/[\\/]/).pop()}\`.`,
  `${answered.length} of ${results.length} slots filled.`,
  ``,
  `> **This cannot settle schema conformance.** A chat window has no`,
  `> \`response_format\`, so the schema was an instruction rather than a grammar.`,
  `> A pass below means the model complied naturally. Token counts, latency, and`,
  `> prompt caching are unavailable by this route and stay open for M3-01B's`,
  `> live pass.`,
  ``,
  `## Models tested`,
  ``,
];

for (const slot of ["A", "B", "C"]) {
  const filled = results.filter((r) => r.slot === slot && !r.skipped).length;
  lines.push(
    `- **${slot}** — ${labels[slot] || "_not recorded_"}${filled === 0 ? " _(no answers pasted)_" : ""}`,
  );
}

lines.push(``, `## Gate 1 — mechanical`, ``, `A model that fails here is out.`, ``);
lines.push(
  `| Model | Operation | Held the contract | Failures |`,
  `| --- | --- | --- | --- |`,
);
for (const r of answered) {
  lines.push(
    `| ${r.label} | ${r.operation.replace("create_", "")} | ${r.schemaHeld ? "yes" : "**no**"} | ${r.schemaHeld ? "—" : r.failures.length} |`,
  );
}

const failed = answered.filter((r) => !r.schemaHeld);
if (failed.length > 0) {
  lines.push(``, `### What failed`, ``);
  for (const r of failed) {
    lines.push(`**${r.label}** / ${r.operation}`);
    for (const f of r.failures) lines.push(`- ${f}`);
    lines.push(``);
  }
}

const plans = answered.filter(
  (r) => r.operation === "create_seven_day_plan" && r.probes,
);
if (plans.length > 0) {
  lines.push(
    `## Safety probes — seven-day plan`,
    ``,
    `The planning note: flies Thursday ${thursday}, back late Sunday, no gym, wedding Saturday ${saturday}, knee twinging on descents, still wants one long run.`,
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

const roadmaps = answered.filter(
  (r) => r.operation === "create_roadmap" && r.probes,
);
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

lines.push(``, `## Gate 2 — the product owner's read`, ``);
lines.push(
  notes && !/^\*\*A —\*\*\s*\*\*B —\*\*/s.test(notes.replace(/\n/g, ""))
    ? notes
    : `_Not filled in. Gate 2 is the deciding gate — the mechanical table above cannot substitute for it._`,
);

lines.push(
  ``,
  `## Applying the rule`,
  ``,
  `The selection rule is **the cheapest tier that clears both gates — not the`,
  `best model.** Working from C upward:`,
  ``,
);

for (const slot of ["C", "B", "A"]) {
  const rs = answered.filter((r) => r.slot === slot);
  if (rs.length === 0) {
    lines.push(`- **${slot}** (${labels[slot] || "not recorded"}) — no data.`);
    continue;
  }
  const gate1 = rs.every((r) => r.schemaHeld);
  lines.push(
    `- **${slot}** (${labels[slot] || "not recorded"}) — gate 1 ${gate1 ? "**passes**" : "**fails**"}. Gate 2 is yours to call.`,
  );
}

lines.push(
  ``,
  `Take the cheapest slot that passes gate 1 *and* that you would actually follow.`,
  `If C passes gate 1 but you would not follow its week, that is the expected`,
  `outcome at the small end and exactly what this exercise exists to find.`,
  ``,
  `Record the chosen model and this evidence in M3-01B decision 1b.`,
);

const out = lines.join("\n");

mkdirSync(join(HERE, "results"), { recursive: true });
const path = join(
  HERE,
  "results",
  `worksheet-${new Date().toISOString().replace(/[:.]/g, "-")}.md`,
);
writeFileSync(path, out, "utf8");
console.log(out);
console.log(`\n---\nWrote ${path}`);
