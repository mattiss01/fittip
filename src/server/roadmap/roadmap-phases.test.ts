import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentVersionMock, getReviewedThroughMock } = vi.hoisted(() => ({
  getCurrentVersionMock: vi.fn(),
  getReviewedThroughMock: vi.fn(),
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
      getReviewedThrough: getReviewedThroughMock,
    }),
  };
});

import {
  readCurrentRoadmapPhases,
  readRoadmapAttention,
} from "./roadmap-phases";

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

// ADR-027: the one thing the Plan says about a review, as a dot.
describe("readRoadmapAttention", () => {
  const version = {
    id: "7e190000-0000-4000-8000-000000000001",
    content: {
      phases: [{ endDate: "2026-10-31" }, { endDate: "2026-12-31" }],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentVersionMock.mockResolvedValue(version);
    getReviewedThroughMock.mockResolvedValue(null);
  });

  it("is due from a phase's last day, and not the day before", async () => {
    await expect(readRoadmapAttention("2026-10-30")).resolves.toBe(null);
    await expect(readRoadmapAttention("2026-10-31")).resolves.toBe(
      "review_due",
    );
    expect(getReviewedThroughMock).toHaveBeenCalledWith(version.id);
  });

  it("is not due once that phase is marked reviewed, until the next ends", async () => {
    getReviewedThroughMock.mockResolvedValue(0);

    await expect(readRoadmapAttention("2026-11-15")).resolves.toBe(null);
    await expect(readRoadmapAttention("2026-12-31")).resolves.toBe(
      "review_due",
    );
  });

  it("says a roadmap is missing when there is none, and asks for no mark", async () => {
    getCurrentVersionMock.mockResolvedValue(null);

    await expect(readRoadmapAttention("2026-12-31")).resolves.toBe("missing");
    expect(getReviewedThroughMock).not.toHaveBeenCalled();
  });

  it("leaves the dot off when the roadmap cannot be read, and lets a lost sign-in through", async () => {
    getReviewedThroughMock.mockRejectedValue(new RoadmapPersistenceError());
    await expect(readRoadmapAttention("2026-12-31")).resolves.toBe(null);

    getCurrentVersionMock.mockRejectedValue(new RoadmapAuthenticationError());
    await expect(readRoadmapAttention("2026-12-31")).rejects.toBeInstanceOf(
      RoadmapAuthenticationError,
    );
  });
});
