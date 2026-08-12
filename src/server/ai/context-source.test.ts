import { describe, expect, it, vi } from "vitest";

import { RepositoryCoachAIContextSource } from "@/server/ai/context-source";
import { CoachAIError } from "@/server/ai/errors";
import type { CoachAIOwner } from "@/server/ai/owner";

/**
 * The seam where owner records become coaching context.
 *
 * What matters here is what leaves the database and in what shape: ADR-013
 * decision 4 names the fields, and the source references are ids and revisions
 * rather than copied content.
 */

const TODAY = "2026-08-10";
const OWNER = {
  id: "00000000-0000-4000-8000-000000000001",
} as unknown as CoachAIOwner;
const COMPLETION_ID = "00000000-0000-4000-8000-000000000030";
const GROUP_ID = "00000000-0000-4000-8000-000000000031";
const MEMORY_ID = "00000000-0000-4000-8000-000000000040";
const GOAL_ID = "00000000-0000-4000-8000-000000000050";
const PLAN_VERSION_ID = "00000000-0000-4000-8000-000000000060";

describe("RepositoryCoachAIContextSource", () => {
  // M3-02 limitation 5: `sport` was null on every completion, because a
  // completion has no sport column and the read that fed this one returned no
  // activities at all.
  it("takes the session title and sport from the recorded activity", async () => {
    const source = new RepositoryCoachAIContextSource(
      goals(),
      memory(),
      completions(),
      plans(),
      () => TODAY,
    );

    const loaded = await source.load(OWNER);

    expect(loaded.training.completions).toEqual([
      expect.objectContaining({
        localDate: "2026-08-08",
        status: "completed",
        title: "Hill repeats",
        sport: "Running",
        durationMinutes: 45,
      }),
    ]);
  });

  it("carries provenance as ids and revisions, never as content", async () => {
    const source = new RepositoryCoachAIContextSource(
      goals(),
      memory(),
      completions(),
      plans(),
      () => TODAY,
    );

    const loaded = await source.load(OWNER);

    expect(loaded.sources).toEqual([
      { kind: "goal", recordId: GOAL_ID },
      { kind: "memory", recordId: MEMORY_ID, revisionNumber: 2 },
      {
        kind: "completion",
        recordId: GROUP_ID,
        revisionId: COMPLETION_ID,
        revisionNumber: 1,
      },
      { kind: "plan_version", recordId: PLAN_VERSION_ID, revisionNumber: 4 },
    ]);
    expect(JSON.stringify(loaded.sources)).not.toContain("Hill repeats");
  });

  // A proposed memory candidate is exactly what a roadmap planning note
  // creates. Recording one as a source would make the proposal's own side
  // effect block its acceptance, because acceptance requires every stored
  // memory source to still be active.
  it("records no source for a record that never reached the coach", async () => {
    const source = new RepositoryCoachAIContextSource(
      goals([
        { id: GOAL_ID, status: "active", archivedAt: null },
        {
          id: "00000000-0000-4000-8000-000000000051",
          status: "paused",
          archivedAt: null,
        },
      ]),
      memory(TODAY, [
        { id: MEMORY_ID, status: "active", revisionNumber: 2 },
        {
          id: "00000000-0000-4000-8000-000000000041",
          status: "proposed",
          revisionNumber: 1,
        },
      ]),
      completions(),
      plans(),
      () => TODAY,
    );

    const loaded = await source.load(OWNER);

    expect(
      loaded.sources.filter(({ kind }) => kind === "goal" || kind === "memory"),
    ).toEqual([
      { kind: "goal", recordId: GOAL_ID },
      { kind: "memory", recordId: MEMORY_ID, revisionNumber: 2 },
    ]);
  });

  it("judges adherence by date without inventing a miss", async () => {
    const source = new RepositoryCoachAIContextSource(
      goals(),
      memory(),
      completions(),
      plans(),
      () => TODAY,
    );

    const loaded = await source.load(OWNER);

    expect(loaded.training.plannedSessions).toEqual([
      expect.objectContaining({ localDate: "2026-08-08", hasCompletion: true }),
      expect.objectContaining({
        localDate: "2026-08-11",
        hasCompletion: false,
      }),
    ]);
  });

  it("refuses to build context when the two reads disagree about today", async () => {
    const source = new RepositoryCoachAIContextSource(
      goals(),
      memory("2026-08-09"),
      completions(),
      plans(),
      () => TODAY,
    );

    await expect(source.load(OWNER)).rejects.toBeInstanceOf(CoachAIError);
  });
});

function goals(rows = [{ id: GOAL_ID, status: "active", archivedAt: null }]) {
  return {
    list: vi.fn().mockResolvedValue({
      revision: 3,
      goals: rows.map((row) => ({
        title: "Run a hilly half marathon",
        priorityTier: "core",
        ...row,
      })),
    }),
  } as never;
}

function memory(
  today = TODAY,
  rows = [{ id: MEMORY_ID, status: "active", revisionNumber: 2 }],
) {
  return {
    list: vi.fn().mockResolvedValue({
      revision: 5,
      today,
      items: rows.map((row) => ({
        content: "Runs at dawn.",
        memoryType: "constraint",
        reviewDueDate: null,
        ...row,
      })),
    }),
  } as never;
}

function completions() {
  return {
    listCoachingCompletions: vi.fn().mockResolvedValue([
      {
        id: COMPLETION_ID,
        completionGroupId: GROUP_ID,
        revisionNumber: 1,
        actualLocalDate: "2026-08-08",
        status: "completed",
        durationMinutes: 45,
        perceivedEffort: 6,
        feeling: "as_expected",
        painReported: false,
        illnessReported: false,
        injuryReported: false,
        severeFatigueReported: false,
        activities: [{ name: "Hill repeats", sport: "Running" }],
      },
    ]),
  } as never;
}

function plans() {
  return {
    getCurrentManualPlan: vi.fn().mockResolvedValue({
      head: { revision: 4 },
      version: { id: PLAN_VERSION_ID },
      plan: {
        sessions: [
          {
            localDate: "2026-08-08",
            title: "Hill repeats",
            sport: "Running",
            isLocked: false,
          },
          {
            localDate: "2026-08-11",
            title: "Easy run",
            sport: "Running",
            isLocked: true,
          },
        ],
      },
    }),
  } as never;
}
