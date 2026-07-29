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

  it("disables retries only for the atomic plan and completion RPCs", () => {
    const sources = sourceFiles(join(process.cwd(), "src")).filter(
      (path) => !path.endsWith(".test.ts") && !path.endsWith(".test.tsx"),
    );
    const retryFiles = sources.filter((path) =>
      readFileSync(path, "utf8").includes(".retry(false)"),
    );
    const trainingRepositoryPath = join(
      process.cwd(),
      "src",
      "server",
      "repositories",
      "training-record-repository.ts",
    );
    const completionRepositoryPath = join(
      process.cwd(),
      "src",
      "server",
      "repositories",
      "completion-repository.ts",
    );
    const trainingRepository = readFileSync(trainingRepositoryPath, "utf8");
    const completionRepository = readFileSync(completionRepositoryPath, "utf8");

    expect(retryFiles.sort()).toEqual(
      [trainingRepositoryPath, completionRepositoryPath].sort(),
    );
    expect(trainingRepository.match(/\.retry\(false\)/g)).toHaveLength(1);
    expect(trainingRepository).toMatch(
      /\.rpc\(\s*"save_manual_plan_version",[\s\S]*?\)\s*\.retry\(false\)/,
    );
    expect(completionRepository.match(/\.retry\(false\)/g)).toHaveLength(1);
    expect(completionRepository).toMatch(
      /\.rpc\(\s*"save_training_completion",[\s\S]*?\)\s*\.retry\(false\)/,
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
