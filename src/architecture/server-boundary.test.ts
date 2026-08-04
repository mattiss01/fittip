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

  // M2-03 adds the fifth call site deliberately: each allowlisted RPC is an
  // atomic owner-scoped mutation whose conflict must reach the caller
  // unchanged, so an automatic retry could re-run a change the user was told
  // to review.
  it("disables retries only for the five approved atomic RPCs", () => {
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
    const goalRepositoryPath = join(
      process.cwd(),
      "src",
      "server",
      "repositories",
      "goal-repository.ts",
    );
    const memoryRepositoryPath = join(
      process.cwd(),
      "src",
      "server",
      "repositories",
      "memory-repository.ts",
    );
    const onboardingRepositoryPath = join(
      process.cwd(),
      "src",
      "server",
      "repositories",
      "onboarding-repository.ts",
    );
    const trainingRepository = readFileSync(trainingRepositoryPath, "utf8");
    const completionRepository = readFileSync(completionRepositoryPath, "utf8");
    const goalRepository = readFileSync(goalRepositoryPath, "utf8");
    const memoryRepository = readFileSync(memoryRepositoryPath, "utf8");
    const onboardingRepository = readFileSync(onboardingRepositoryPath, "utf8");

    expect(retryFiles.sort()).toEqual(
      [
        trainingRepositoryPath,
        completionRepositoryPath,
        goalRepositoryPath,
        memoryRepositoryPath,
        onboardingRepositoryPath,
      ].sort(),
    );
    expect(trainingRepository.match(/\.retry\(false\)/g)).toHaveLength(1);
    expect(trainingRepository).toMatch(
      /\.rpc\(\s*"save_manual_plan_version",[\s\S]*?\)\s*\.retry\(false\)/,
    );
    expect(completionRepository.match(/\.retry\(false\)/g)).toHaveLength(1);
    expect(completionRepository).toMatch(
      /\.rpc\(\s*"save_training_completion",[\s\S]*?\)\s*\.retry\(false\)/,
    );
    expect(goalRepository.match(/\.retry\(false\)/g)).toHaveLength(1);
    expect(goalRepository).toMatch(
      /\.rpc\(\s*"apply_goal_change",[\s\S]*?\)\s*\.retry\(false\)/,
    );
    expect(memoryRepository.match(/\.retry\(false\)/g)).toHaveLength(1);
    expect(memoryRepository).toMatch(
      /\.rpc\(\s*"apply_memory_change",[\s\S]*?\)\s*\.retry\(false\)/,
    );
    expect(onboardingRepository.match(/\.retry\(false\)/g)).toHaveLength(1);
    expect(onboardingRepository).toMatch(
      /\.rpc\(\s*"apply_onboarding_change",[\s\S]*?\)\s*\.retry\(false\)/,
    );
  });
});

/**
 * M3-01 adds `src/server/ai`, the module that decides what user data may ever
 * leave this system. Two invariants protect it: the browser cannot import it,
 * and inside it only the two named seams may reach the database.
 */
describe("server-only AI boundary", () => {
  const aiRoot = join(process.cwd(), "src", "server", "ai");
  /** The only modules permitted to touch Auth claims or a repository. */
  const databaseSeams = [
    join(aiRoot, "owner.ts"),
    join(aiRoot, "context-source.ts"),
  ];

  it("keeps client components from importing the AI module", () => {
    const aiImport =
      /from\s+["'](?:@\/server\/ai\/|[^"']*\.{1,2}\/server\/ai\/)/;
    const clientComponents = sourceFiles(join(process.cwd(), "src")).filter(
      (path) => CLIENT_DIRECTIVE.test(readFileSync(path, "utf8")),
    );

    // The general rule already covers `@/server/**`; this asserts the AI case
    // explicitly so narrowing that rule later cannot quietly uncover it.
    expect(SERVER_IMPORT.test('from "@/server/ai/coach-ai-service"')).toBe(
      true,
    );
    expect(aiImport.test('from "@/server/ai/coach-ai-service"')).toBe(true);
    expect(clientComponents.length).toBeGreaterThan(0);

    for (const component of clientComponents) {
      expect(readFileSync(component, "utf8")).not.toMatch(aiImport);
    }
  });

  it("lets only the two named seams reach the database", () => {
    const databaseImport =
      /from\s+["'](?:@\/server\/repositories\/|@\/lib\/supabase\/|@\/lib\/auth\/verified-user)/;
    const aiFiles = sourceFiles(aiRoot).filter(
      (path) => !path.endsWith(".test.ts"),
    );

    expect(aiFiles.length).toBeGreaterThan(8);

    for (const path of aiFiles) {
      if (databaseSeams.includes(path)) continue;
      expect(readFileSync(path, "utf8")).not.toMatch(databaseImport);
    }
  });

  it("keeps every adapter out of the database entirely", () => {
    // An adapter receives an already-authorized payload. If it could query, it
    // could widen the context past what the domain service authorized.
    for (const path of sourceFiles(join(aiRoot, "fixtures"))) {
      expect(readFileSync(path, "utf8")).not.toMatch(
        /from\s+["'](?:@\/server\/repositories\/|@\/lib\/)/,
      );
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
