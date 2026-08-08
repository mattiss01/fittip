#!/usr/bin/env node
/**
 * Writes self-contained, paste-ready prompts for the no-API-key paths.
 *
 * A chat window has no `response_format`, so the JSON schema that the API would
 * enforce as a grammar has to be stated in the prompt as an instruction and
 * hoped for. That difference is the whole reason these paths cannot settle
 * schema conformance — they can only show whether a model complies *naturally*.
 * Say so in the report; do not let a clean-looking JSON blob be mistaken for
 * evidence that `strict: true` would hold.
 *
 *   node emit.mjs
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { OPERATIONS } from "./schemas.mjs";
import { assembleContext } from "./corpus.mjs";
import { buildMessages } from "./prompt.mjs";
import { PLAN_WINDOW, weekdayOf } from "./evaluate.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "paste");

const context = assembleContext();

mkdirSync(join(OUT, "outputs"), { recursive: true });

for (const [operation, { schema }] of Object.entries(OPERATIONS)) {
  const { messages } = buildMessages(operation, context);
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

  const path = join(OUT, `${operation}.txt`);
  writeFileSync(path, body, "utf8");
  console.log(
    `${path}\n  ${body.length} chars (~${Math.round(body.length / 4)} tokens)`,
  );
}

writeFileSync(
  join(OUT, "outputs", "README.txt"),
  `Save each model's reply here as raw JSON, one file per model per operation:

  <label>__create_roadmap.json
  <label>__create_seven_day_plan.json

<label> is whatever names the model in your picker — it is only used to label
the report, so "gpt-5-thinking" or "codex-gpt5" is fine.

Strip any markdown fence the model wrapped around the JSON; the scorer will
tolerate one, but the file should be the object itself.

Then:  node score.mjs
`,
  "utf8",
);

console.log(`\nPlan window for reference:`);
for (const date of PLAN_WINDOW) console.log(`  ${date}  ${weekdayOf(date)}`);
console.log(`\nSave replies into ${join(OUT, "outputs")} then run: node score.mjs`);
