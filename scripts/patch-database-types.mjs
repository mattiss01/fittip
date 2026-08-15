/**
 * The generated-type patch step remains in the documented schema workflow.
 * M3-11 removed the only function whose generated nullability needed repair,
 * so the step now guards that the superseded function never reappears.
 */

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export class TypePatchError extends Error {}

export function patchDatabaseTypes(source) {
  if (source.includes("save_training_completion:")) {
    throw new TypePatchError(
      'Legacy generated type "save_training_completion" must stay removed.',
    );
  }
  return source;
}

const typesPath = "src/lib/supabase/database.types.ts";
if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  patchDatabaseTypes(readFileSync(typesPath, "utf8"));
  console.log(`${typesPath} needs no post-generation patch after M3-11.`);
}
