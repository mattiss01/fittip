import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const implementationFiles = [
  "src/app/home/you/onboarding/actions.ts",
  "src/components/onboarding/onboarding-manager.tsx",
  "src/server/repositories/onboarding-repository.ts",
].map((path) => readFileSync(join(process.cwd(), path), "utf8"));

describe("onboarding privacy boundary", () => {
  it("uses no browser persistence, analytics, external send, or logging sink", () => {
    const source = implementationFiles.join("\n");
    expect(source).not.toMatch(
      /\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b|\bsendBeacon\b/,
    );
    expect(source).not.toMatch(
      /\bconsole\.(?:log|info|warn|error)\b|\banalytics\b/,
    );
    expect(source).not.toMatch(/\bfetch\s*\(|https?:\/\//);
  });

  it("adds no service-role credential boundary", () => {
    const source = implementationFiles.join("\n");
    expect(source).not.toMatch(
      /service[_-]?role|SUPABASE_SERVICE_ROLE|secret[_-]?key/i,
    );
  });

  it("keeps intake values out of stable action messages", async () => {
    const marker = "synthetic-private-error-marker";
    const actions = implementationFiles[0];
    expect(actions).not.toContain(marker);
    expect(actions).not.toMatch(/JSON\.stringify\(formData|console/);
  });
});
