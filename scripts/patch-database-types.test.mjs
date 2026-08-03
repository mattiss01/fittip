import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  NULLABLE_ARGUMENTS,
  TARGET_FUNCTION,
  TypePatchError,
  patchDatabaseTypes,
} from "./patch-database-types.mjs";

/** The generator's shape, reduced to what the patch actually navigates. */
function generated({ args } = {}) {
  const body =
    args ??
    `
          p_activities: Json;
          p_actual_started_at: string;
          p_completion_group_id: string;
          p_correction_reason: string;
          p_duration_minutes: number;
          p_expected_revision: number;
          p_feeling: string;
          p_note: string;
          p_perceived_effort: number;
          p_planned_session_id: string;
          p_replacement_description: string;
          p_status: string;`;
  return `      ${TARGET_FUNCTION}: {
        Args: {${body}
        };
        Returns: {
          actual_started_at: string | null;
        };
      };
`;
}

describe("patchDatabaseTypes", () => {
  it("restores | null on every nullable argument", () => {
    const patched = patchDatabaseTypes(generated());

    for (const argument of NULLABLE_ARGUMENTS) {
      expect(patched).toMatch(
        new RegExp(`${argument}: (string|number) \\| null;`),
      );
    }
  });

  it("leaves genuinely required arguments alone", () => {
    const patched = patchDatabaseTypes(generated());

    expect(patched).toContain("p_expected_revision: number;");
    expect(patched).toContain("p_status: string;");
    expect(patched).toContain("p_activities: Json;");
  });

  it("does not touch the Returns block", () => {
    const patched = patchDatabaseTypes(generated());

    // Already nullable there, and a second ` | null` would be a real defect.
    expect(patched).toContain("actual_started_at: string | null;");
    expect(patched).not.toContain("| null | null");
  });

  it("is idempotent", () => {
    const once = patchDatabaseTypes(generated());

    expect(patchDatabaseTypes(once)).toBe(once);
  });

  it("handles CRLF working files", () => {
    // `core.autocrlf=true` gives this repository CRLF working files on Windows,
    // where the schema workflow actually runs. Continuous integration checks
    // out LF, so it cannot catch an LF-only pattern: this assertion is the only
    // thing standing between a developer and a script that always throws.
    const crlf = generated().replace(/\r?\n/g, "\r\n");

    const patched = patchDatabaseTypes(crlf);

    expect(patched).toContain("p_note: string | null;");
    expect(patched).not.toContain("\n\n"); // no line endings mangled
    expect(patched.split("\r\n").length).toBe(crlf.split("\r\n").length);
  });

  it("throws when the function is gone", () => {
    expect(() => patchDatabaseTypes("export type Database = {};")).toThrow(
      TypePatchError,
    );
  });

  it("throws when an expected argument is missing", () => {
    const withoutNote = generated().replace("          p_note: string;\n", "");

    expect(() => patchDatabaseTypes(withoutNote)).toThrow(/p_note/);
  });

  it("names the real cause when the types are not formatted yet", () => {
    // Raw generator output has no semicolons. Running the patch before
    // Prettier is the easy mistake, so it must not surface as nine
    // "argument missing" errors.
    const raw = generated().replace(/;$/gm, "").replace(/};/g, "}");

    expect(() => patchDatabaseTypes(raw)).toThrow(/not formatted yet/);
  });

  it("throws when an argument became optional", () => {
    // A default on the parameter means the signature changed, so restoring
    // nullability would be guessing rather than correcting.
    const optional = generated().replace("p_note: string;", "p_note?: string;");

    expect(() => patchDatabaseTypes(optional)).toThrow(/signature changed/);
  });
});

describe("committed database types", () => {
  // The guard that makes the pipeline honest. Regenerating without running the
  // patch drops these annotations, and without this test that lands silently
  // and reddens typecheck for whoever pulls next.
  it("already carries the restored nullability", () => {
    const committed = readFileSync(
      "src/lib/supabase/database.types.ts",
      "utf8",
    );

    expect(patchDatabaseTypes(committed)).toBe(committed);
  });
});
