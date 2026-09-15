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

/**
 * M3-15E reopened `/home/plan/roadmap`, so only the proposal route is still on
 * the maintenance module. `/home/plan/proposal` is M3-16 and stays here.
 */
const maintenancePages = ["src/app/home/plan/proposal/page.tsx"] as const;

/**
 * The reopened roadmap route, which reads and does not write.
 *
 * It gets its own allowlist rather than joining `rollingPlanSurface` below,
 * because `allowedServerModules` is shared with the Plan and Today: adding the
 * roadmap, goal and completion modules there would hand those two routes a
 * roadmap repository they have no business holding, which is the loosening
 * that list exists to prevent.
 */
const roadmapReadSurface = ["src/app/home/plan/roadmap/page.tsx"] as const;

const allowedRoadmapModules = [
  "@/server/goals/goal-records",
  "@/server/repositories/completion-log-repository",
  "@/server/repositories/goal-repository",
  "@/server/repositories/profile-repository",
  "@/server/repositories/roadmap-repository",
  "@/server/roadmap/roadmap-records",
  "@/server/roadmap/roadmap-safety",
  "@/server/training/training-history-context",
] as const;

/**
 * The whole reopened roadmap surface: the route and the components only it
 * renders. The revoked-function assertion covers both, because a control that
 * reached one of the five would be written in a component, not in the page.
 */
const roadmapSurfaceDirectories = [
  "src/app/home/plan/roadmap",
  "src/components/roadmap",
] as const;

/**
 * M3-11 revoked all five from every role and they stay revoked until M3-15F
 * restores them deliberately. Naming the repository methods as well as the
 * functions is the point: the repository is the only application path to them,
 * so a read surface that never calls one of these methods cannot reach a
 * revoked function however the SQL below it changes.
 */
const revokedRoadmapFunctions = [
  "begin_roadmap_generation",
  "finish_roadmap_generation",
  "record_roadmap_memory_candidates",
  "apply_roadmap_proposal_change",
  "accept_roadmap_proposal",
] as const;

const revokedRoadmapMethods = [
  "beginGeneration",
  "finishGenerationWithProposal",
  "finishGenerationAsFailed",
  "recordMemoryCandidates",
  "editProposal",
  "declineProposal",
  "acceptProposal",
] as const;

/**
 * The reopened surface, which may reach only the M3-10 rolling-plan seam and
 * the M3-15A completion seam beside it. M3-15B moved Today and logging off the
 * maintenance module and onto those two, so they are constrained here rather
 * than left unchecked: dropping them from the list above without adding them
 * here would have retired the only assertion covering how they reach
 * persistence. M3-15C moves the two Progress routes the same way, for the same
 * reason. This list alone does not stop those two reaching the plan, because
 * the allowlist below is shared with the routes that legitimately do;
 * `completionOnlySurface` carries that half of the constraint.
 */
const rollingPlanSurface = [
  "src/app/home/plan/page.tsx",
  "src/app/home/plan/actions.ts",
  "src/app/home/today/page.tsx",
  "src/app/home/log/page.tsx",
  "src/app/home/log/actions.ts",
  "src/app/home/progress/page.tsx",
  "src/app/home/progress/[id]/page.tsx",
] as const;

/**
 * The routes that read completions and nothing else. `allowedServerModules` is
 * shared across the whole reopened surface and rightly carries the plan
 * modules for the Plan and Today, so it cannot express this exclusion; without
 * the assertion below, either Progress route could import
 * `readPlanWindowToppedUp` and still pass every other check here.
 *
 * The exclusion is the point of M3-15C's read: ADR-017 consequence 3's top-up
 * materializes future occurrences, so a history surface that called it would
 * write plan rows as a side effect of somebody looking at the past.
 */
const completionOnlySurface = [
  "src/app/home/progress/page.tsx",
  "src/app/home/progress/[id]/page.tsx",
] as const;

/**
 * Every `@/server/**` module the reopened surface may reach. This is an
 * allowlist rather than a pattern on purpose: the substring check below only
 * ever proved that *one* seam import was present, so any of these modules
 * could have imported an arbitrary additional persistence module and still
 * passed. Four of these files also moved here from `maintenancePages`, whose
 * predicate forbade `@/server/**` outright, so without this the move would
 * have traded a strict check for a loose one.
 *
 * M3-15C added no entry: both Progress routes reach only modules that were
 * already on this list.
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

  it("lets the reopened roadmap route reach only its own allowlist", () => {
    for (const path of roadmapReadSurface) {
      const source = readFileSync(join(root, path), "utf8");
      const imported = [...source.matchAll(/from "(@\/server\/[^"]+)"/g)].map(
        (match) => match[1],
      );
      expect(imported.length, path).toBeGreaterThan(0);
      for (const specifier of imported) {
        expect(
          allowedRoadmapModules as readonly string[],
          `${path} imports ${specifier}`,
        ).toContain(specifier);
      }
      expect(source, path).not.toMatch(/@\/lib\/supabase/);
    }
  });

  it("keeps the reopened roadmap surface away from every revoked function", () => {
    const files = roadmapSurfaceDirectories.flatMap((directory) =>
      sourceFiles(join(root, directory)),
    );
    expect(files.length).toBeGreaterThan(3);

    for (const path of files) {
      const source = readFileSync(path, "utf8");
      for (const name of revokedRoadmapFunctions) {
        expect(source, `${path} names ${name}`).not.toContain(name);
      }
      for (const method of revokedRoadmapMethods) {
        expect(source, `${path} calls ${method}`).not.toContain(`${method}(`);
      }
      // A read surface has no write path at all, so it has nothing to
      // revalidate and no action to declare.
      expect(source, path).not.toContain('"use server"');
      expect(source, path).not.toContain("revalidatePath");
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

  it("keeps the completion-only surface away from every plan read", () => {
    for (const path of completionOnlySurface) {
      const source = readFileSync(join(root, path), "utf8");
      expect(source, path).not.toMatch(/plan-window-top-up|rolling-plan/);
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
