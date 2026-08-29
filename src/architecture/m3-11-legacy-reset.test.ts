import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

/**
 * M3-12 reopened `/home/plan` against the M3-10 rolling-plan model, so its
 * route module and server actions exist again under the same two paths. What
 * M3-11 closed was the legacy detailed-plan/proposal/completion runtime, and
 * that closure is still asserted here: the legacy server modules stay deleted,
 * no application code calls a removed table or RPC, and the reopened surface is
 * checked below to reach persistence only through the rolling-plan seam.
 */
const legacyModules = [
  "src/server/repositories/training-record-repository.ts",
  "src/server/repositories/completion-repository.ts",
  "src/server/repositories/plan-proposal-repository.ts",
  "src/server/training/training-records.ts",
  "src/server/training/past-plan-protection.ts",
  "src/server/completions/completion-records.ts",
  "src/server/plan-proposal/plan-proposal-service.ts",
  "src/app/home/log/actions.ts",
  "src/app/home/plan/proposal/actions.ts",
  "src/app/home/plan/roadmap/actions.ts",
] as const;

const maintenancePages = [
  "src/app/home/today/page.tsx",
  "src/app/home/log/page.tsx",
  "src/app/home/progress/page.tsx",
  "src/app/home/plan/roadmap/page.tsx",
  "src/app/home/plan/proposal/page.tsx",
] as const;

/** The reopened surface, which may reach only the M3-10 rolling-plan seam. */
const rollingPlanSurface = [
  "src/app/home/plan/page.tsx",
  "src/app/home/plan/actions.ts",
] as const;

/**
 * M3-15A rebuilds `completed_activities` on the rolling-plan foundation, so
 * that name is no longer a removed table and is deliberately absent here. What
 * M3-11 closed stays closed: `completed_sessions`, `completion_heads`, and the
 * legacy plan and proposal tables are still gone, and nothing may call them.
 */
const legacyTables = [
  "plan_proposal_decisions",
  "plan_proposal_sources",
  "plan_proposals",
  "plan_generation_requests",
  "completion_heads",
  "completed_sessions",
  "planned_activities",
  "planned_sessions",
  "detailed_plan_heads",
  "detailed_plan_versions",
] as const;

const legacyRpcs = [
  "save_manual_plan_version",
  "save_training_completion",
  "begin_plan_generation",
  "finish_plan_generation",
  "record_plan_memory_candidates",
  "reject_plan_proposal",
] as const;

describe("M3-11 legacy runtime closure", () => {
  it("removes every legacy server entry point", () => {
    for (const path of legacyModules) {
      expect(existsSync(join(root, path)), path).toBe(false);
    }
  });

  it("keeps every affected route on the one maintenance module", () => {
    for (const path of maintenancePages) {
      const source = readFileSync(join(root, path), "utf8");
      expect(source, path).toContain("TrainingMaintenance");
      expect(source, path).not.toMatch(/@\/server\/|@\/lib\/supabase/);
    }
  });

  it("keeps the reopened plan surface on the rolling-plan seam only", () => {
    for (const path of rollingPlanSurface) {
      const source = readFileSync(join(root, path), "utf8");
      expect(source, path).toMatch(/@\/server\/(rolling-plan|repositories)\//);
      expect(source, path).not.toMatch(
        /training-record|completion-repository|plan-proposal|past-plan-protection|@\/lib\/supabase/,
      );
    }
  });

  it("contains no application call to a removed table or RPC", () => {
    const source = sourceFiles(join(root, "src"))
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");

    for (const table of legacyTables) {
      expect(source).not.toContain(`.from("${table}")`);
    }
    for (const rpc of legacyRpcs) {
      expect(source).not.toContain(`.rpc("${rpc}"`);
    }
  });
});

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return [".ts", ".tsx"].includes(extname(entry.name)) ? [path] : [];
  });
}
