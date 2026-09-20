import { describe, expect, it } from "vitest";

import {
  buildRoadmapPlanContext,
  roadmapPlanContextBytes,
  ROADMAP_PLAN_CONTEXT_MAX_BYTES,
} from "@/server/roadmap/roadmap-plan-context";

import type { RoadmapPhase, RoadmapProposal } from "@/server/ai/contracts";

/**
 * The plan-side roadmap boundary.
 *
 * Two things are being asserted, and they fail differently. The disclosure
 * tests say what may leave — a regression there sends owner data nobody
 * approved, and it would not make any other test fail. The ladder tests say the
 * field fits its budget however large the roadmap is, because `context.ts`
 * refuses rather than trims if this module hands it something too big.
 */

const GOAL_A = "6a000000-0000-4000-8000-000000000001";
const GOAL_B = "6a000000-0000-4000-8000-000000000002";

function phase(overrides: Partial<RoadmapPhase> = {}): RoadmapPhase {
  return {
    title: "Base building",
    focus: "Aerobic volume with one quality session a week.",
    startDate: "2026-09-01",
    endDate: "2026-09-28",
    goalAttention: [
      {
        goalId: GOAL_A,
        level: "primary",
        reason: "Everything serves the 10k.",
      },
    ],
    milestones: [
      {
        title: "Long run at 90 minutes",
        observableCriterion: "One run of 90 minutes completed comfortably.",
        targetDate: "2026-09-21",
        goalIds: [GOAL_A],
      },
    ],
    ...overrides,
  };
}

function roadmap(overrides: Partial<RoadmapProposal> = {}): RoadmapProposal {
  return {
    schemaVersion: "fittip.roadmap.v1",
    title: "Autumn 10k build",
    summary: "Twelve weeks from base to a 10k time trial.",
    startDate: "2026-09-01",
    endDate: "2026-11-23",
    phases: [phase()],
    assumptions: ["Four sessions a week are available."],
    uncertainties: [
      {
        statement: "The hamstring may not tolerate speed work.",
        whyItMatters: "It would change the whole sharpening phase.",
        whatToWatch: "Any tightness in the first two weeks.",
      },
    ],
    reviewPoints: [
      {
        title: "Halfway check",
        triggerDate: "2026-10-12",
        question: "Is the long run progressing?",
      },
    ],
    safetyConsiderations: ["Stop if the hamstring sharpens."],
    ...overrides,
  } as RoadmapProposal;
}

function build(
  input: {
    roadmap?: RoadmapProposal;
    horizonStartDate?: string;
    horizonEndDate?: string;
    targetableGoalIds?: string[];
  } = {},
) {
  return buildRoadmapPlanContext({
    roadmap: input.roadmap ?? roadmap(),
    horizonStartDate: input.horizonStartDate ?? "2026-09-07",
    horizonEndDate: input.horizonEndDate ?? "2026-09-13",
    targetableGoalIds: new Set(input.targetableGoalIds ?? [GOAL_A, GOAL_B]),
  });
}

describe("what an accepted roadmap may tell a plan coach", () => {
  it("sends the covering phase whole", () => {
    const context = build();

    expect(context.coveringPhases).toHaveLength(1);
    expect(context.coveringPhases[0]).toEqual({
      title: "Base building",
      focus: "Aerobic volume with one quality session a week.",
      startDate: "2026-09-01",
      endDate: "2026-09-28",
      goalAttention: [
        {
          goalId: GOAL_A,
          level: "primary",
          reason: "Everything serves the 10k.",
        },
      ],
      milestones: [
        {
          title: "Long run at 90 minutes",
          observableCriterion: "One run of 90 minutes completed comfortably.",
          targetDate: "2026-09-21",
          goalIds: [GOAL_A],
        },
      ],
    });
  });

  it("reduces a phase the week is not in to a title, dates and goals", () => {
    const context = build({
      roadmap: roadmap({
        phases: [
          phase(),
          phase({
            title: "Sharpening",
            focus: "Threshold and race-pace work, volume held steady.",
            startDate: "2026-09-29",
            endDate: "2026-10-26",
            goalAttention: [
              {
                goalId: GOAL_B,
                level: "secondary",
                reason: "Strength maintenance only.",
              },
            ],
          }),
        ],
      }),
    });

    expect(context.otherPhases).toEqual([
      {
        title: "Sharpening",
        startDate: "2026-09-29",
        endDate: "2026-10-26",
        goalAttention: [{ goalId: GOAL_B, level: "secondary" }],
      },
    ]);
  });

  /**
   * The disclosure assertion. It reads the serialized field rather than the
   * object graph, because what matters is what a provider receives, and it
   * names every withheld field so that adding one to `RoadmapPhase` without
   * deciding about it fails here rather than shipping.
   */
  it("never sends prose or milestones for a phase the week is not in", () => {
    const context = build({
      roadmap: roadmap({
        phases: [
          phase(),
          phase({
            title: "Sharpening",
            focus: "SENTINEL_OTHER_FOCUS",
            startDate: "2026-09-29",
            endDate: "2026-10-26",
            goalAttention: [
              {
                goalId: GOAL_B,
                level: "secondary",
                reason: "SENTINEL_OTHER_REASON",
              },
            ],
            milestones: [
              {
                title: "SENTINEL_OTHER_MILESTONE",
                observableCriterion: "SENTINEL_OTHER_CRITERION",
                targetDate: "2026-10-19",
                goalIds: [GOAL_B],
              },
            ],
          }),
        ],
      }),
    });

    const serialized = JSON.stringify(context);
    expect(serialized).not.toContain("SENTINEL_OTHER_FOCUS");
    expect(serialized).not.toContain("SENTINEL_OTHER_REASON");
    expect(serialized).not.toContain("SENTINEL_OTHER_MILESTONE");
    expect(serialized).not.toContain("SENTINEL_OTHER_CRITERION");
  });

  it("never sends the roadmap's assumptions, uncertainties, review points or safety text", () => {
    const serialized = JSON.stringify(build());

    expect(serialized).not.toContain("Four sessions a week are available.");
    expect(serialized).not.toContain("hamstring may not tolerate");
    expect(serialized).not.toContain("Halfway check");
    expect(serialized).not.toContain("Stop if the hamstring sharpens.");
    // The one whole-roadmap prose field the owner approved.
    expect(serialized).toContain("Twelve weeks from base to a 10k time trial.");
  });

  it("carries no field beyond the approved shape", () => {
    expect(Object.keys(build()).sort()).toEqual([
      "coveringPhases",
      "endDate",
      "isStale",
      "otherPhases",
      "otherPhasesWithheld",
      "phaseDetailWithheld",
      "phaseGoalAttentionWithheld",
      "staleReasons",
      "startDate",
      "summary",
      "title",
    ]);
  });

  it("sends both covering phases when the week straddles a boundary", () => {
    const context = build({
      horizonStartDate: "2026-09-26",
      horizonEndDate: "2026-10-02",
      roadmap: roadmap({
        phases: [
          phase(),
          phase({
            title: "Sharpening",
            startDate: "2026-09-29",
            endDate: "2026-10-26",
          }),
        ],
      }),
    });

    expect(context.coveringPhases.map((entry) => entry.title)).toEqual([
      // The phase holding more of the week comes first: 4 days against 3.
      "Sharpening",
      "Base building",
    ]);
    expect(context.otherPhases).toEqual([]);
  });
});

describe("staleness", () => {
  it("is absent for a roadmap that covers the week and holds its goals", () => {
    const context = build();

    expect(context.isStale).toBe(false);
    expect(context.staleReasons).toEqual([]);
  });

  it("names out_of_window when the week reaches past the roadmap", () => {
    const context = build({
      horizonStartDate: "2026-11-20",
      horizonEndDate: "2026-11-26",
    });

    expect(context.staleReasons).toEqual(["out_of_window"]);
  });

  it("names out_of_window when the week starts before the roadmap", () => {
    const context = build({
      horizonStartDate: "2026-08-26",
      horizonEndDate: "2026-09-01",
    });

    expect(context.staleReasons).toContain("out_of_window");
  });

  it("names goal_missing when a phase attends to a goal the owner no longer holds", () => {
    const context = build({ targetableGoalIds: [GOAL_B] });

    expect(context.staleReasons).toEqual(["goal_missing"]);
  });

  /**
   * Two facts, not one flag. A roadmap can be both outside its window and
   * pointed at an abandoned goal, and the review screen names each separately,
   * so collapsing them here would lose a distinction the owner is shown.
   */
  it("names both reasons independently", () => {
    const context = build({
      horizonStartDate: "2026-11-20",
      horizonEndDate: "2026-11-26",
      targetableGoalIds: [],
    });

    expect(context.staleReasons).toEqual(["out_of_window", "goal_missing"]);
    expect(context.isStale).toBe(true);
  });

  it("is marked rather than refused, so a stale roadmap still reaches the coach", () => {
    const context = build({
      horizonStartDate: "2026-11-20",
      horizonEndDate: "2026-11-26",
      targetableGoalIds: [],
    });

    expect(context.title).toBe("Autumn 10k build");
    expect(context.coveringPhases.length + context.otherPhases.length).toBe(1);
  });
});

describe("the reduction ladder", () => {
  const LONG_FOCUS = "f".repeat(300);
  const LONG_REASON = "r".repeat(160);
  const LONG_CRITERION = "c".repeat(200);

  /** One phase with every bounded field at the validator's limit. */
  function maximalPhase(
    index: number,
    startDay: number,
    lengthDays: number,
  ): RoadmapPhase {
    return phase({
      title: `${"t".repeat(78)}${index}`,
      focus: LONG_FOCUS,
      startDate: isoDay(startDay),
      endDate: isoDay(startDay + lengthDays - 1),
      goalAttention: Array.from({ length: 4 }, (_, slot) => ({
        goalId: `6a000000-0000-4000-8000-00000000010${slot}`,
        level: "secondary" as const,
        reason: LONG_REASON,
      })),
      milestones: Array.from({ length: 3 }, (_, slot) => ({
        title: "m".repeat(80),
        observableCriterion: LONG_CRITERION,
        targetDate: isoDay(startDay + slot),
        goalIds: [GOAL_A, GOAL_B],
      })),
    });
  }

  /** Six maximal phases, none of which the week straddles. */
  function maximalRoadmap(): RoadmapProposal {
    return roadmap({
      title: "T".repeat(80),
      summary: "S".repeat(600),
      startDate: isoDay(1),
      endDate: isoDay(84),
      phases: Array.from({ length: 6 }, (_, index) =>
        maximalPhase(index, 1 + index * 14, 14),
      ),
    });
  }

  function isoDay(day: number): string {
    const ms = Date.parse("2026-09-01T00:00:00.000Z") + (day - 1) * 86_400_000;
    return new Date(ms).toISOString().slice(0, 10);
  }

  it("fits the budget for a maximal roadmap", () => {
    const context = buildRoadmapPlanContext({
      roadmap: maximalRoadmap(),
      horizonStartDate: isoDay(2),
      horizonEndDate: isoDay(8),
      targetableGoalIds: new Set([GOAL_A, GOAL_B]),
    });

    expect(roadmapPlanContextBytes(context)).toBeLessThanOrEqual(
      ROADMAP_PLAN_CONTEXT_MAX_BYTES,
    );
  });

  it("keeps the covering phase whole and discloses what it dropped", () => {
    const context = buildRoadmapPlanContext({
      roadmap: maximalRoadmap(),
      horizonStartDate: isoDay(2),
      horizonEndDate: isoDay(8),
      targetableGoalIds: new Set([GOAL_A, GOAL_B]),
    });

    expect(context.coveringPhases).toHaveLength(1);
    expect(context.coveringPhases[0].focus).toBe(LONG_FOCUS);
    expect(context.coveringPhases[0].milestones).toHaveLength(3);
    expect(context.coveringPhases[0].goalAttention).toHaveLength(4);
    // Something was withheld, and it said so rather than trimming quietly.
    expect(
      context.phaseGoalAttentionWithheld +
        context.phaseDetailWithheld +
        context.otherPhasesWithheld,
    ).toBeGreaterThan(0);
  });

  it("drops the other phases' goal attention before anything else", () => {
    const context = buildRoadmapPlanContext({
      roadmap: maximalRoadmap(),
      horizonStartDate: isoDay(2),
      horizonEndDate: isoDay(8),
      targetableGoalIds: new Set([GOAL_A, GOAL_B]),
    });

    for (const entry of context.otherPhases) {
      expect(entry.goalAttention).toEqual([]);
    }
    expect(context.phaseGoalAttentionWithheld).toBe(5);
  });

  /**
   * The case every step of the ladder exists for, and the only one that
   * reaches the last: a week straddling two phases that are both maximal.
   * Without step 3 the field would not fit, so this is what keeps that branch
   * from being dead code nobody notices is wrong.
   */
  it("falls all the way back for a straddling week between maximal phases", () => {
    const phases = [
      maximalPhase(0, 1, 4),
      maximalPhase(1, 5, 14),
      maximalPhase(2, 19, 14),
      maximalPhase(3, 33, 14),
      maximalPhase(4, 47, 14),
      maximalPhase(5, 61, 24),
    ];
    const context = buildRoadmapPlanContext({
      roadmap: roadmap({
        title: "T".repeat(80),
        summary: "S".repeat(600),
        startDate: isoDay(1),
        endDate: isoDay(84),
        phases,
      }),
      horizonStartDate: isoDay(2),
      horizonEndDate: isoDay(8),
      targetableGoalIds: new Set([GOAL_A, GOAL_B]),
    });

    expect(roadmapPlanContextBytes(context)).toBeLessThanOrEqual(
      ROADMAP_PLAN_CONTEXT_MAX_BYTES,
    );
    // Every step fired, and each is counted rather than silent.
    expect(context.phaseGoalAttentionWithheld).toBe(4);
    expect(context.phaseDetailWithheld).toBe(1);
    expect(context.otherPhasesWithheld).toBe(5);
    // What survives is the phase holding most of the week, undiminished.
    expect(context.coveringPhases).toHaveLength(1);
    expect(context.coveringPhases[0].focus).toBe(LONG_FOCUS);
    expect(context.coveringPhases[0].milestones).toHaveLength(3);
  });

  it("leaves an ordinary roadmap untouched and discloses nothing", () => {
    const context = build();

    expect(context.phaseGoalAttentionWithheld).toBe(0);
    expect(context.phaseDetailWithheld).toBe(0);
    expect(context.otherPhasesWithheld).toBe(0);
    expect(roadmapPlanContextBytes(context)).toBeLessThan(
      ROADMAP_PLAN_CONTEXT_MAX_BYTES,
    );
  });
});
