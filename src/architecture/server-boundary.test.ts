import { readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";

import { describe, expect, it } from "vitest";

const CLIENT_DIRECTIVE = /^\s*["']use client["'];/m;
const SERVER_IMPORT =
  /from\s+["']@\/server\/|from\s+["'][^"']*profile-repository["']/;

describe("server repository import boundary", () => {
  it("keeps client components from importing server repositories", () => {
    const clientComponents = sourceFiles(join(process.cwd(), "src")).filter(
      (path) => CLIENT_DIRECTIVE.test(readFileSync(path, "utf8")),
    );

    for (const component of clientComponents) {
      expect(readFileSync(component, "utf8")).not.toMatch(SERVER_IMPORT);
    }
  });
});

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      return sourceFiles(path);
    }

    return [".ts", ".tsx"].includes(extname(entry.name)) ? [path] : [];
  });
}
