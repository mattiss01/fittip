import { describe, expect, it } from "vitest";

import {
  inactiveGoalsNote,
  inactiveNamedGoals,
} from "@/server/roadmap/roadmap-records";

const phase = (attention: string[], milestones: string[][]) => ({
  title: "Base",
  focus: "Volume.",
  startDate: "2026-10-16",
  endDate: "2026-12-31",
  goalAttention: attention.map((goalId) => ({
    goalId,
    level: "primary" as const,
  })),
  milestones: milestones.map((goalIds) => ({
    title: "Steady",
    targetDate: "2026-12-31",
    goalIds,
  })),
});

describe("inactiveNamedGoals (ADR-032)", () => {
  it("names goals no longer active once each, wherever they are named", () => {
    const content = {
      phases: [phase(["active", "paused"], [["paused", "gone"]])],
    };

    expect(
      inactiveNamedGoals(
        content,
        { active: "Run a 10k" },
        { paused: "Swim a mile" },
      ),
    ).toEqual({ count: 2, labels: ["Swim a mile", "a goal since deleted"] });
  });

  it("counts goals since deleted together", () => {
    const content = { phases: [phase(["a"], [["b"]])] };

    expect(inactiveNamedGoals(content, {}, {})).toEqual({
      count: 2,
      labels: ["2 goals since deleted"],
    });
  });
});

describe("inactiveGoalsNote", () => {
  it("joins several and agrees with how many goals there are", () => {
    expect(
      inactiveGoalsNote({
        count: 3,
        labels: ["Swim a mile", "2 goals since deleted"],
      }),
    ).toBe(
      "This roadmap names goals no longer active: Swim a mile and 2 goals since deleted. Accepting puts it in force as it is; you can edit it afterwards.",
    );
  });
});
