import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { TypePatchError, patchDatabaseTypes } from "./patch-database-types.mjs";

describe("patchDatabaseTypes", () => {
  it("is a no-op for the replacement schema", () => {
    const source = "export type Database = {};";
    expect(patchDatabaseTypes(source)).toBe(source);
  });

  it("rejects the removed completion RPC surface", () => {
    expect(() =>
      patchDatabaseTypes("save_training_completion: { Args: {} }"),
    ).toThrow(TypePatchError);
  });

  it("accepts the committed generated types without changing them", () => {
    const committed = readFileSync(
      "src/lib/supabase/database.types.ts",
      "utf8",
    );
    expect(patchDatabaseTypes(committed)).toBe(committed);
  });
});
