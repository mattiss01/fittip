import { readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * FitTip writes to the console from exactly one place.
 *
 * The memory and coaching modules forbid the console outright
 * (`memory-privacy.test.ts`, `ai-privacy.test.ts`), because what they hold is
 * the owner's own words. On 28 September 2026 the owner approved one log line
 * outside them: the SQLSTATE of a memory candidate batch that failed, and
 * nothing else. That was a decision about one line, not about logging, so a
 * second call site anywhere in `src` is a new decision about what leaves the
 * process — and it fails here before it ships.
 */

const SRC = join(process.cwd(), "src");
const CONSOLE = /\bconsole\s*\./;

describe("the console", () => {
  it("is written to by one approved module and no other", () => {
    const writing = sourceFiles(SRC).filter((path) =>
      CONSOLE.test(readFileSync(path, "utf8")),
    );

    expect(writing).toEqual([
      join(SRC, "server", "proposal-logging", "memory-candidate-batch.ts"),
    ]);
  });
});

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return [".ts", ".tsx"].includes(extname(entry.name)) &&
      !/\.test\.tsx?$/.test(entry.name)
      ? [path]
      : [];
  });
}
