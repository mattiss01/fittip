/**
 * M2-08: restore the argument nullability the Supabase type generator cannot
 * express.
 *
 * `supabase gen types` emits an RPC argument as `name?: T` when the parameter
 * declares a default and `name: T` otherwise. It never emits `| null`, because
 * PostgreSQL has no per-argument nullability to read: every argument of a
 * non-`STRICT` function accepts NULL, so nothing in the catalog distinguishes
 * one argument from another.
 *
 * `public.save_training_completion` is not `STRICT` and genuinely accepts NULL
 * for nine of its nineteen arguments. `completion-repository.ts` passes NULL
 * for exactly those nine. The generated types are therefore narrower than the
 * database, and typecheck fails on a tree whose only change was running the
 * documented generation command.
 *
 * The nine parameters cannot simply be given `default null`: PostgreSQL
 * requires every parameter after a defaulted one to have a default too, and
 * these sit at positions 2, 4, 6, 8, 10-13 and 18 of nineteen, interspersed
 * with parameters that must stay required. Correcting the signature means
 * dropping and recreating a `security definer` function that guards accepted
 * training data, which the product owner declined for a typecheck defect.
 *
 * So the pipeline restores the annotations instead. The patched file describes
 * the database *more* accurately than the generator's own output, and this
 * script is the single place that knowledge lives.
 *
 * Run it after every regeneration:
 *   node scripts/patch-database-types.mjs
 *
 * It is idempotent, and it fails loudly rather than silently doing nothing if
 * the generated shape stops matching what it expects.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const TARGET_FUNCTION = "save_training_completion";

/**
 * The arguments `save_training_completion` accepts as NULL. Ordered as the
 * generator emits them (alphabetically), not as PostgreSQL declares them.
 */
export const NULLABLE_ARGUMENTS = [
  "p_actual_started_at",
  "p_completion_group_id",
  "p_correction_reason",
  "p_duration_minutes",
  "p_feeling",
  "p_note",
  "p_perceived_effort",
  "p_planned_session_id",
  "p_replacement_description",
];

export class TypePatchError extends Error {}

/**
 * Returns the source with `| null` restored on every argument in
 * {@link NULLABLE_ARGUMENTS}. Throws {@link TypePatchError} when the generated
 * shape is not what this patch was written against, so a generator change
 * surfaces as a failed command rather than as types that quietly stop matching
 * the database.
 */
export function patchDatabaseTypes(source) {
  const functionIndex = source.indexOf(`${TARGET_FUNCTION}: {`);
  if (functionIndex === -1) {
    throw new TypePatchError(
      `Could not find "${TARGET_FUNCTION}" in the generated types. If the ` +
        `function was renamed or removed, update scripts/patch-database-types.mjs.`,
    );
  }

  const argsIndex = source.indexOf("Args: {", functionIndex);
  if (argsIndex === -1) {
    throw new TypePatchError(
      `Found "${TARGET_FUNCTION}" but no Args block after it.`,
    );
  }

  const argsStart = argsIndex + "Args: {".length;
  // Raw generator output has no semicolons and closes with `}`; Prettier turns
  // that into `};`. Accept both so the "run format first" check below is what
  // reports the ordering mistake, rather than this producing a cryptic
  // formatting complaint.
  //
  // `\r?` is not decoration. `core.autocrlf=true` gives this repository CRLF
  // working files on Windows, which is where the schema workflow actually runs,
  // while continuous integration checks out LF and would never see the
  // difference. An LF-only pattern passes every hosted run and fails every
  // developer.
  const argsEnd = source.slice(argsStart).search(/\r?\n {8}};?\r?\n/);
  if (argsEnd === -1) {
    throw new TypePatchError(
      `Could not find the end of the "${TARGET_FUNCTION}" Args block. The ` +
        `generator's formatting may have changed.`,
    );
  }

  const before = source.slice(0, argsStart);
  const args = source.slice(argsStart, argsStart + argsEnd);
  const after = source.slice(argsStart + argsEnd);

  // This patch rewrites `name: T;` declarations, which only exist once Prettier
  // has run. Say so plainly: the alternative is nine identical "argument
  // missing" errors that describe the symptom and not the cause.
  if (!/\n\s+p_[a-z_]+: [^;\n]+;/.test(args)) {
    throw new TypePatchError(
      `The generated types are not formatted yet. Run \`npm run format\` ` +
        `before this script - see the sequence in README.md.`,
    );
  }

  let patched = args;
  for (const argument of NULLABLE_ARGUMENTS) {
    // Optional (`name?: T`) means the generator saw a default, which would mean
    // the signature changed under us. Match the required form only.
    const declaration = new RegExp(`(\\n\\s+${argument}: )([^;\\n]+);`);
    const match = patched.match(declaration);

    if (!match) {
      if (patched.includes(`${argument}?:`)) {
        throw new TypePatchError(
          `"${argument}" is now optional, so ${TARGET_FUNCTION} declares a ` +
            `default for it. The signature changed - re-read M2-08 before ` +
            `patching anything.`,
        );
      }
      throw new TypePatchError(
        `"${argument}" is missing from ${TARGET_FUNCTION}'s Args block. The ` +
          `signature changed - re-read M2-08 before patching anything.`,
      );
    }

    if (match[2].trim().endsWith("| null")) continue; // already patched
    patched = patched.replace(declaration, `$1$2 | null;`);
  }

  return before + patched + after;
}

const TYPES_PATH = "src/lib/supabase/database.types.ts";

// Exact match, not a suffix test: a silent no-op here would look identical to
// a successful patch, which is the one failure mode this script must not have.
if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  const source = readFileSync(TYPES_PATH, "utf8");
  const patched = patchDatabaseTypes(source);
  if (patched === source) {
    console.log(`${TYPES_PATH} already carries all argument nullability.`);
  } else {
    writeFileSync(TYPES_PATH, patched);
    console.log(
      `Restored | null on ${NULLABLE_ARGUMENTS.length} ${TARGET_FUNCTION} arguments in ${TYPES_PATH}.`,
    );
  }
}
