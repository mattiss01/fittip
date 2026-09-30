import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentVersionMock } = vi.hoisted(() => ({
  getCurrentVersionMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/repositories/roadmap-repository", async () => {
  class RoadmapAuthenticationError extends Error {}
  class RoadmapPersistenceError extends Error {}
  return {
    RoadmapAuthenticationError,
    RoadmapPersistenceError,
    createRoadmapRepository: async () => ({
      getCurrentVersion: getCurrentVersionMock,
    }),
  };
});

import { readCurrentRoadmapPhases } from "./roadmap-phases";

import {
  RoadmapAuthenticationError,
  RoadmapPersistenceError,
} from "@/server/repositories/roadmap-repository";

describe("readCurrentRoadmapPhases", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes only each phase's title, focus and dates", async () => {
    getCurrentVersionMock.mockResolvedValue({
      content: {
        phases: [
          {
            title: "Base",
            focus: "Easy volume",
            startDate: "2026-10-01",
            endDate: "2026-10-31",
            goalAttention: [{ goalId: "g" }],
            milestones: [{ title: "m" }],
          },
        ],
      },
    });

    await expect(readCurrentRoadmapPhases()).resolves.toEqual([
      {
        title: "Base",
        focus: "Easy volume",
        startDate: "2026-10-01",
        endDate: "2026-10-31",
      },
    ]);
  });

  it("reads no phases when there is no accepted roadmap", async () => {
    getCurrentVersionMock.mockResolvedValue(null);
    await expect(readCurrentRoadmapPhases()).resolves.toEqual([]);
  });

  it("leaves the band off when the roadmap cannot be read", async () => {
    getCurrentVersionMock.mockRejectedValue(new RoadmapPersistenceError());
    await expect(readCurrentRoadmapPhases()).resolves.toEqual([]);
  });

  it("does not swallow a lost sign-in", async () => {
    getCurrentVersionMock.mockRejectedValue(new RoadmapAuthenticationError());
    await expect(readCurrentRoadmapPhases()).rejects.toBeInstanceOf(
      RoadmapAuthenticationError,
    );
  });
});
