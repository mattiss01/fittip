import { readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  COACH_AI_ERROR_CODES,
  CoachAIError,
  type CoachAIErrorCode,
} from "@/server/ai/errors";
import {
  COACH_AI_FIXTURE_CASES,
  COACH_AI_FIXTURE_CONTEXT,
} from "@/server/ai/fixtures/fixture-corpus";
import {
  COACH_AI_TELEMETRY_FIELDS,
  toCoachAITelemetryRecord,
  type CoachAITelemetryRecord,
} from "@/server/ai/telemetry";

/**
 * The leakage corpus for the AI boundary.
 *
 * Two things are being proven. First, that no module under `src/server/ai`
 * can reach a network or a log — checked against the source text, because a
 * behavioral test only proves the paths it happens to exercise. Second, that
 * the structures which do leave the boundary — telemetry records and error
 * messages — carry no user content.
 */

const AI_ROOT = join(process.cwd(), "src", "server", "ai");
const RUNTIME_FILES = sourceFiles(AI_ROOT).filter(
  (path) => !path.endsWith(".test.ts"),
);

/** A distinctive health-adjacent sentence, as an owner might really write. */
const SENSITIVE = "Sharp left knee pain on stairs since 12 July.";

describe("the AI boundary reaches nothing it should not", () => {
  it("covers the whole subtree", () => {
    expect(RUNTIME_FILES.length).toBeGreaterThan(8);
  });

  it.each([
    ["a network client", /\b(fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/],
    [
      "a Node HTTP module",
      /require\(["']https?["']\)|from\s+["']node:https?["']/,
    ],
    ["the console", /\bconsole\s*\./],
    ["browser storage", /\b(localStorage|sessionStorage|document\.cookie)\b/],
    ["a service role credential", /SERVICE_ROLE/],
  ])("uses no %s", (_case, pattern) => {
    for (const path of RUNTIME_FILES) {
      expect(readFileSync(path, "utf8")).not.toMatch(pattern);
    }
  });

  it("mentions the public variable prefix only where it detects a leak", () => {
    // `enablement.ts` names `NEXT_PUBLIC_` because it refuses to run when such
    // a variable exists. Anywhere else the prefix would mean the opposite.
    const mentioning = RUNTIME_FILES.filter((path) =>
      readFileSync(path, "utf8").includes("NEXT_PUBLIC_"),
    );

    expect(mentioning).toEqual([join(AI_ROOT, "enablement.ts")]);
    expect(readFileSync(join(AI_ROOT, "enablement.ts"), "utf8")).not.toMatch(
      /process\.env\.NEXT_PUBLIC_|environment\[["']NEXT_PUBLIC_/,
    );
  });

  it("marks every module server-only", () => {
    for (const path of RUNTIME_FILES) {
      expect(readFileSync(path, "utf8")).toMatch(/^import "server-only";/);
    }
  });

  it("names the credential variable in one place only", () => {
    const naming = RUNTIME_FILES.filter((path) =>
      readFileSync(path, "utf8").includes("FITTIP_AI_API_KEY"),
    );

    expect(naming).toEqual([join(AI_ROOT, "enablement.ts")]);
  });

  it("keeps every fixture body a literal rather than something fetched", () => {
    const corpus = readFileSync(
      join(AI_ROOT, "fixtures", "fixture-corpus.ts"),
      "utf8",
    );

    expect(corpus).not.toMatch(/readFile|await\s|import\(/);
    expect(COACH_AI_FIXTURE_CASES.length).toBeGreaterThan(15);
  });
});

describe("errors say nothing", () => {
  it.each(COACH_AI_ERROR_CODES)("keeps %s free of content", (code) => {
    const error = new CoachAIError(code as CoachAIErrorCode);

    expect(error.message).not.toContain(SENSITIVE);
    expect(error.message).not.toContain("knee");
    expect(`${error.message}${error.stack ?? ""}`).not.toContain(SENSITIVE);
    // Nothing names the provider, a variable, or a budget figure.
    expect(error.message).not.toMatch(/FITTIP_|provider=|\$|token/i);
  });

  it("gives every code a distinct, stable, non-empty message", () => {
    for (const code of COACH_AI_ERROR_CODES) {
      expect(new CoachAIError(code).message.length).toBeGreaterThan(10);
    }
  });
});

describe("telemetry carries counts, not content", () => {
  it("drops any field outside the allowlist", () => {
    const contaminated = {
      ...record(),
      rawBody: SENSITIVE,
      prompt: `Consider: ${SENSITIVE}`,
      apiKey: "not-a-real-key-0000000000000000",
    } as CoachAITelemetryRecord;

    const clean = toCoachAITelemetryRecord(contaminated);

    expect(Object.keys(clean).sort()).toEqual(
      [...COACH_AI_TELEMETRY_FIELDS].sort(),
    );
    expect(JSON.stringify(clean)).not.toContain("knee");
    expect(JSON.stringify(clean)).not.toContain("not-a-real-key");
  });

  it("defines no field that could hold content", () => {
    // The field list is the contract. A reviewer reading this sees exactly
    // what the boundary is allowed to record.
    expect([...COACH_AI_TELEMETRY_FIELDS]).not.toContain("body");
    expect([...COACH_AI_TELEMETRY_FIELDS]).not.toContain("prompt");
    expect([...COACH_AI_TELEMETRY_FIELDS]).not.toContain("ownerId");
    expect([...COACH_AI_TELEMETRY_FIELDS]).not.toContain("goalIds");
    expect([...COACH_AI_TELEMETRY_FIELDS]).not.toContain("memoryIds");
  });
});

describe("the fixture corpus is safe to keep in the repository", () => {
  it("contains no real credential-shaped string", () => {
    const corpus = COACH_AI_FIXTURE_CASES.map((entry) => entry.body).join("\n");

    expect(corpus).not.toMatch(/sk-[A-Za-z0-9]{20,}/);
    expect(corpus).not.toMatch(/sb_secret_/);
    expect(corpus).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}\./);
  });

  it("uses synthetic context, not owner data", () => {
    expect(JSON.stringify(COACH_AI_FIXTURE_CONTEXT)).not.toContain("knee");
  });
});

function record(): CoachAITelemetryRecord {
  return {
    requestId: "request-1",
    idempotencyKey: "ck_deadbeefdeadbeef",
    environment: "local",
    operation: "create_roadmap",
    adapterKind: "fixture",
    providerCode: "fixture",
    modelCode: "fixture-corpus-v1",
    promptVersion: "roadmap-stub-v1",
    schemaVersion: "fittip.roadmap.v1",
    startedAt: "2026-08-04T09:00:00.000Z",
    latencyMs: 12,
    attemptCount: 1,
    contextGoalCount: 2,
    contextMemoryCount: 1,
    contextBytes: 480,
    reportedInputTokens: null,
    reportedOutputTokens: null,
    estimatedCostMicroUsd: 54_000,
    chargedCostMicroUsd: 54_000,
    currency: "USD",
    rateCardVersion: "fixture-2026-08",
    costReconciled: false,
    outcome: "accepted",
    rejectionReason: null,
    errorCode: null,
  };
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return [".ts", ".tsx"].includes(extname(entry.name)) ? [path] : [];
  });
}
