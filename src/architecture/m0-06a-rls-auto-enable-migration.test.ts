import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const MIGRATION_FILENAME =
  "20260727082635_revoke_public_rls_auto_enable_execute.sql";
const migration = readFileSync(
  join(process.cwd(), "supabase", "migrations", MIGRATION_FILENAME),
  "utf8",
);

describe("M0-06A rls_auto_enable hardening migration", () => {
  it("revokes direct execution only when the platform helper exists", () => {
    expect(migration).toContain("to_regprocedure('public.rls_auto_enable()')");
    expect(migration).toMatch(
      /revoke\s+execute\s+on\s+function\s+public\.rls_auto_enable\(\)\s+from\s+public,\s+anon,\s+authenticated;/i,
    );
  });

  it("does not replace the helper, alter its event trigger, or grant privileges", () => {
    expect(migration).not.toMatch(/\b(?:alter|create|drop|grant)\b/i);
    expect(migration).not.toMatch(
      /\b(?:event\s+trigger|security\s+definer|search_path)\b/i,
    );
  });
});
