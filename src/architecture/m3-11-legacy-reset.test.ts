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
  "src/app/home/plan/proposal/actions.ts",
  "src/app/home/plan/roadmap/actions.ts",
] as const;

const maintenancePages = [
  "src/app/home/progress/page.tsx",
  "src/app/home/plan/roadmap/page.tsx",
  "src/app/home/plan/proposal/page.tsx",
] as const;

/**
 * The reopened surface, which may reach only the M3-10 rolling-plan seam and
 * the M3-15A completion seam beside it. M3-15B moved Today and logging off the
 * maintenance module and onto those two, so they are constrained here rather
 * than left unchecked: dropping them from the list above without adding them
 * here would have retired the only assertion covering how they reach
 * persistence.
 */
const rollingPlanSurface = [
  "src/app/home/plan/page.tsx",
  "src/app/home/plan/actions.ts",
  "src/app/home/today/page.tsx",
  "src/app/home/log/page.tsx",
  "src/app/home/log/actions.ts",
] as const;

/**
 * Every `@/server/**` module the reopened surface may reach. This is an
 * allowlist rather than a pattern on purpose: the substring check below only
 * ever proved that *one* seam import was present, so any of these modules
 * could have imported an arbitrary additional persistence module and still
 * passed. Two of these files also moved here from `maintenancePages`, whose
 * predicate forbade `@/server/**` outright, so without this the move would
 * have traded a strict check for a loose one.
 */
const allowedServerModules = [
  "@/server/completions/completion-log",
  "@/server/completions/plan-window-top-up",
  "@/server/repositories/completion-log-repository",
  "@/server/repositories/profile-repository",
  "@/server/repositories/rolling-plan-repository",
  "@/server/rolling-plan/rolling-plan",
] as const;

const legacyTables = [
  "plan_proposal_decisions",
  "plan_proposal_sources",
  "plan_proposals",
  "plan_generation_requests",
  "completed_activities",
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

  it("lets the reopened surface reach only allowlisted server modules", () => {
    for (const path of rollingPlanSurface) {
      const source = readFileSync(join(root, path), "utf8");
      const imported = [...source.matchAll(/from "(@\/server\/[^"]+)"/g)].map(
        (match) => match[1],
      );
      expect(imported.length, path).toBeGreaterThan(0);
      for (const specifier of imported) {
        expect(
          allowedServerModules as readonly string[],
          `${path} imports ${specifier}`,
        ).toContain(specifier);
      }
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
