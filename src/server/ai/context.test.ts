import { describe, expect, it } from "vitest";

import {
  buildCoachAIContext,
  COACH_AI_CONTEXT_LIMITS,
  type CoachAIGoalRecord,
  type CoachAIOwnedRecords,
} from "@/server/ai/context";
import { CoachAIError } from "@/server/ai/errors";
import type { MemoryItemView } from "@/server/memory/memory-records";

const TODAY = "2026-08-04";
const OWNER = "53000000-0000-4000-8000-000000000001";

describe("coaching context assembly", () => {
  it("sends only active goals as targetable and achieved goals as history", () => {
    const assembled = buildCoachAIContext(
      "create_roadmap",
      records({
        goals: [
          goal({ id: uuid(1), status: "active" }),
          goal({ id: uuid(2), status: "achieved" }),
          goal({ id: uuid(3), status: "paused" }),
          goal({ id: uuid(4), status: "abandoned" }),
          goal({ id: uuid(5), status: "active", archivedAt: "2026-07-01" }),
        ],
      }),
    );

    expect(assembled.context.targetableGoals.map((entry) => entry.id)).toEqual([
      uuid(1),
    ]);
    expect(assembled.context.historicalGoals.map((entry) => entry.id)).toEqual([
      uuid(2),
    ]);
  });

  it("sends only active, non-review-due memory", () => {
    const assembled = buildCoachAIContext(
      "create_roadmap",
      records({
        memory: [
          memory({ id: uuid(11) }),
          memory({ id: uuid(12), status: "proposed" }),
          memory({ id: uuid(13), status: "rejected" }),
          memory({ id: uuid(14), status: "archived" }),
          memory({ id: uuid(15), expiresOn: "2026-08-03" }),
        ],
      }),
    );

    expect(assembled.context.memory.map((entry) => entry.id)).toEqual([
      uuid(11),
    ]);
  });

  it("copies only the allowlisted fields", () => {
    // A row carrying extra columns, as a repository result would.
    const wide = {
      ...goal({ id: uuid(1) }),
      userId: OWNER,
      rationale: "Because the hills hurt.",
      constraints: "No running on consecutive days.",
      createdAt: "2026-01-01T00:00:00.000Z",
    } as CoachAIGoalRecord;

    const assembled = buildCoachAIContext(
      "create_roadmap",
      records({ goals: [wide] }),
    );

    expect(Object.keys(assembled.context.targetableGoals[0]).sort()).toEqual([
      "category",
      "id",
      "priorityTier",
      "targetDate",
      "title",
    ]);
    expect(assembled.serialized).not.toContain("hills hurt");
    expect(assembled.serialized).not.toContain(OWNER);
  });

  it("keeps memory to its three allowlisted fields", () => {
    const assembled = buildCoachAIContext(
      "create_roadmap",
      records({ memory: [memory({ id: uuid(11) })] }),
    );

    expect(Object.keys(assembled.context.memory[0]).sort()).toEqual([
      "content",
      "id",
      "memoryType",
    ]);
    // Revision history and confirmation timestamps are not context.
    expect(assembled.serialized).not.toContain("revisionNumber");
    expect(assembled.serialized).not.toContain("userConfirmedAt");
  });

  it("reports which owner records informed the request", () => {
    const assembled = buildCoachAIContext(
      "create_roadmap",
      records({
        goals: [
          goal({ id: uuid(1), status: "active" }),
          goal({ id: uuid(2), status: "achieved" }),
        ],
        memory: [memory({ id: uuid(11) })],
      }),
    );

    expect(assembled.references).toEqual({
      goalIds: [uuid(1), uuid(2)],
      memoryIds: [uuid(11)],
    });
  });

  it("fails closed past the reference ceilings", () => {
    const limits = COACH_AI_CONTEXT_LIMITS.create_roadmap;

    expect(() =>
      buildCoachAIContext(
        "create_roadmap",
        records({
          goals: Array.from({ length: limits.maxTargetableGoals + 1 }, (_, i) =>
            goal({ id: uuid(100 + i) }),
          ),
        }),
      ),
    ).toThrow(new CoachAIError("context_too_large"));

    expect(() =>
      buildCoachAIContext(
        "create_roadmap",
        records({
          memory: Array.from({ length: limits.maxMemoryItems + 1 }, (_, i) =>
            memory({ id: uuid(200 + i) }),
          ),
        }),
      ),
    ).toThrow(new CoachAIError("context_too_large"));
  });

  it("fails closed past the serialized size ceiling", () => {
    expect(() =>
      buildCoachAIContext(
        "create_roadmap",
        records({
          memory: Array.from({ length: 20 }, (_, i) =>
            memory({ id: uuid(200 + i), content: "n".repeat(900) }),
          ),
        }),
      ),
    ).toThrow(new CoachAIError("context_too_large"));
  });

  it.each([
    ["a goal id that is not a uuid", records({ goals: [goal({ id: "1" })] })],
    [
      "a blank goal title",
      records({ goals: [goal({ id: uuid(1), title: "" })] }),
    ],
    [
      "an unrecognized priority tier",
      records({
        goals: [
          goal({
            id: uuid(1),
            priorityTier: "urgent" as "core" | "supporting",
          }),
        ],
      }),
    ],
    [
      "an impossible target date",
      records({ goals: [goal({ id: uuid(1), targetDate: "2026-02-30" })] }),
    ],
    [
      "a memory id that is not a uuid",
      records({ memory: [memory({ id: "later" })] }),
    ],
    ["an impossible owner date", records({ today: "2026-02-30" })],
  ])("rejects %s", (_case, input) => {
    expect(() => buildCoachAIContext("create_roadmap", input)).toThrow(
      new CoachAIError("context_invalid"),
    );
  });

  it("produces an empty context rather than failing for a new owner", () => {
    const assembled = buildCoachAIContext(
      "create_roadmap",
      records({ goals: [], memory: [] }),
    );

    expect(assembled.context.targetableGoals).toEqual([]);
    expect(assembled.context.historicalGoals).toEqual([]);
    expect(assembled.context.memory).toEqual([]);
    expect(assembled.references).toEqual({ goalIds: [], memoryIds: [] });
  });
});

function records(
  overrides: Partial<CoachAIOwnedRecords> = {},
): CoachAIOwnedRecords {
  return {
    ownerId: OWNER,
    today: TODAY,
    goalCollectionRevision: 3,
    memoryCollectionRevision: 5,
    goals: [],
    memory: [],
    ...overrides,
  };
}

function goal(overrides: Partial<CoachAIGoalRecord> = {}): CoachAIGoalRecord {
  return {
    id: uuid(1),
    title: "Run a hilly half marathon",
    category: "performance_event",
    priorityTier: "core",
    targetDate: "2026-11-15",
    status: "active",
    archivedAt: null,
    ...overrides,
  };
}

function memory(overrides: Partial<MemoryItemView> = {}): MemoryItemView {
  return {
    id: uuid(11),
    memoryType: "constraint",
    status: "active",
    provenance: "user_created",
    confidence: null,
    sourceReference: null,
    expiresOn: null,
    userConfirmedAt: null,
    content: "Trains before work on weekdays.",
    revisionNumber: 1,
    createdAt: "2026-08-01T09:00:00.000Z",
    updatedAt: "2026-08-01T09:00:00.000Z",
    history: [],
    ...overrides,
  };
}

function uuid(index: number): string {
  return `a1000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}
