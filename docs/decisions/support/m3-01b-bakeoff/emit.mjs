#!/usr/bin/env node
/**
 * Writes self-contained, paste-ready prompts — one file per scenario per
 * operation — plus a WORKSHEET.md sized to the scenarios requested.
 *
 * A chat window has no `response_format`, so the JSON schema the API would
 * enforce as a grammar has to be stated in the prompt and hoped for. That is
 * why these paths cannot settle schema conformance; they show only whether a
 * model complies naturally.
 *
 *   node emit.mjs                       # the required scenarios
 *   node emit.mjs --all                 # every scenario
 *   node emit.mjs --scenarios a,b       # a specific set
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { OPERATIONS } from "./schemas.mjs";
import { buildMessages } from "./prompt.mjs";
import { SCENARIOS, REQUIRED, getScenario } from "./scenarios/index.mjs";
import { planWindow, weekdayOf } from "./evaluate.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "paste");

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const value = (n) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const names = flag("all")
  ? Object.keys(SCENARIOS)
  : value("scenarios")
    ? value("scenarios").split(",")
    : REQUIRED;

mkdirSync(OUT, { recursive: true });

const emitted = [];

for (const name of names) {
  const scenario = getScenario(name);
  for (const [operation, { schema }] of Object.entries(OPERATIONS)) {
    const { messages } = buildMessages(operation, scenario.context);
    const [system, user] = messages;

    const body = `${system.content}

## Output format

Return **only** a single JSON object and nothing else. No prose before or after,
no markdown code fence, no explanation. The object must validate against this
JSON Schema exactly:

\`\`\`json
${JSON.stringify(schema.schema, null, 2)}
\`\`\`

${user.content}
`;

    const file = `${name}__${operation}.txt`;
    writeFileSync(join(OUT, file), body, "utf8");
    emitted.push({ name, operation, file, chars: body.length });
  }
}

console.log(`Wrote ${emitted.length} prompt file(s) to ${OUT}\n`);
for (const e of emitted) {
  console.log(`  ${e.file.padEnd(48)} ${String(e.chars).padStart(6)} chars (~${Math.round(e.chars / 4)} tokens)`);
}

console.log(`\nScenarios emitted:\n`);
for (const name of names) {
  const s = getScenario(name);
  console.log(`  ${s.name}`);
  console.log(`    ${s.title}`);
  const window = planWindow(s.today);
  console.log(
    `    plan window ${window[0]} (${weekdayOf(window[0])}) .. ${window[6]} (${weekdayOf(window[6])})`,
  );
}

console.log(
  `\nNext: fill WORKSHEET.md, then ask Claude to run \`node worksheet.mjs\`.`,
);
