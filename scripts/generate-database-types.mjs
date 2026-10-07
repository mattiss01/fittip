/**
 * Regenerates the committed database types from the local stack, as one step.
 *
 * It is the README's three-step sequence (generate, format, patch) behind one
 * command, added on 7 Oct 2026 so the agent can run it: the permission rules
 * deny it any direct write to the generated file, which stays true, and this
 * script is the one door. It also checks what the CLI printed before that
 * becomes the committed file, because the CLI can append a telemetry error
 * line to stdout after the TypeScript.
 */

import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { patchDatabaseTypes } from "./patch-database-types.mjs";

export class TypeGenerationError extends Error {}

/**
 * What the CLI printed, reduced to the generated TypeScript. A trailing line
 * of CLI noise is dropped; output that is not the types at all is refused
 * rather than written over the committed file.
 */
export function cleanGeneratedTypes(output) {
  const lines = output.replace(/\r\n/g, "\n").split("\n");
  const kept = lines.filter((line) => !line.startsWith('{"_tag":"Error"'));
  const source = `${kept.join("\n").trimEnd()}\n`;
  if (!source.includes("export type Database =")) {
    throw new TypeGenerationError(
      "The Supabase CLI did not print generated types. Is the local stack running?",
    );
  }
  return source;
}

const typesPath = "src/lib/supabase/database.types.ts";
if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  // No `--schema public`: the committed file also carries `graphql_public`.
  const generated = spawnSync(
    "npx supabase gen types --local --lang typescript",
    { encoding: "utf8", shell: true, maxBuffer: 64 * 1024 * 1024 },
  );
  if (generated.status !== 0) {
    throw new TypeGenerationError(
      `supabase gen types failed: ${generated.stderr?.trim() || generated.status}`,
    );
  }
  writeFileSync(typesPath, cleanGeneratedTypes(generated.stdout), "utf8");

  const formatted = spawnSync(`npx prettier --write ${typesPath}`, {
    encoding: "utf8",
    shell: true,
  });
  if (formatted.status !== 0) {
    throw new TypeGenerationError(
      `Prettier could not format the generated types: ${formatted.stderr?.trim()}`,
    );
  }
  patchDatabaseTypes(cleanGeneratedTypes(generated.stdout));
  console.log(`${typesPath} regenerated from the local stack.`);
}
