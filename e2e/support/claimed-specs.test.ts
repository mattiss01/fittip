import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { claimedSpecs } from "./claimed-specs";

describe("specs a per-ticket config claims", () => {
  it("names the spec each config pins and nothing else", () => {
    const directory = mkdtempSync(join(tmpdir(), "claimed-specs-"));
    writeFileSync(
      join(directory, "m9-01.playwright.config.ts"),
      [
        "export default defineConfig({",
        '  // `testMatch: "commented.spec.ts"` in a comment is not a claim.',
        '  testMatch: "m9-01-flow.spec.ts",',
        "});",
      ].join("\n"),
    );
    writeFileSync(join(directory, "m9-02-plain.spec.ts"), "");
    writeFileSync(join(directory, "other.config.ts"), 'testMatch: "x.ts"');

    expect(claimedSpecs(directory)).toEqual(["m9-01-flow.spec.ts"]);
  });

  it("reads the repository's own configs", () => {
    expect(claimedSpecs(join(process.cwd(), "e2e"))).toContain(
      "m3-12-plan.spec.ts",
    );
  });
});
