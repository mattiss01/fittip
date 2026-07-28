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

  it("disables retries only for the atomic manual-plan RPC", () => {
    const sources = sourceFiles(join(process.cwd(), "src")).filter(
      (path) => !path.endsWith(".test.ts") && !path.endsWith(".test.tsx"),
    );
    const retryFiles = sources.filter((path) =>
      readFileSync(path, "utf8").includes(".retry(false)"),
    );
    const repositoryPath = join(
      process.cwd(),
      "src",
      "server",
      "repositories",
      "training-record-repository.ts",
    );
    const repository = readFileSync(repositoryPath, "utf8");

    expect(retryFiles).toEqual([repositoryPath]);
    expect(repository.match(/\.retry\(false\)/g)).toHaveLength(1);
    expect(repository).toMatch(
      /\.rpc\(\s*"save_manual_plan_version",[\s\S]*?\)\s*\.retry\(false\)/,
    );
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
