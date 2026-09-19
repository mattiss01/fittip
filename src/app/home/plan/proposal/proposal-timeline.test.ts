import { describe, expect, it } from "vitest";

import {
  buildProposalTimeline,
  datesBetween,
  groupPlannedByDate,
  type PlannedSessionSummary,
} from "./proposal-timeline";

import type { PlanProposalItemView } from "@/lib/plan/plan-proposal-view";

/**
 * The merge is what makes the review honest about clashes, so it is tested
 * without a database.
 */

const START = "2026-09-21";

describe("buildProposalTimeline", () => {
  it("covers every date in the horizon, including ones with nothing on them", () => {
    const days = build({ items: [], planned: [] });

    expect(days.map((day) => day.localDate)).toEqual([
      "2026-09-21",
      "2026-09-22",
      "2026-09-23",
    ]);
    expect(days.every((day) => day.planned.length === 0)).toBe(true);
    expect(days.every((day) => day.items.length === 0)).toBe(true);
  });

  it("puts what is already planned beside what is proposed for the same day", () => {
    const days = build({
      items: [item({ ordinal: 0, localDate: START, title: "Easy run" })],
      planned: [planned({ id: "s1", localDate: START, title: "Club track" })],
    });

    expect(days[0].planned.map((session) => session.title)).toEqual([
      "Club track",
    ]);
    expect(days[0].items.map((entry) => entry.title)).toEqual(["Easy run"]);
  });

  /**
   * The rule this pins down: a session the plan already holds is never turned
   * into a proposed item. The coach was given it as context and did not
   * re-propose it, so offering the owner a choice about it would be inventing
   * one.
   */
  it("never turns an already-planned session into a decidable item", () => {
    const days = build({
      items: [],
      planned: [planned({ id: "s1", localDate: START, title: "Club track" })],
    });

    expect(days[0].planned).toHaveLength(1);
    expect(days[0].items).toHaveLength(0);
  });

  it("marks the owner's today and their existing recovery days", () => {
    const days = build({
      items: [],
      planned: [],
      today: "2026-09-22",
      recoveryDates: ["2026-09-23"],
    });

    expect(days.map((day) => day.isToday)).toEqual([false, true, false]);
    expect(days.map((day) => day.isRecoveryDay)).toEqual([false, false, true]);
  });

  it("keeps several proposed items on one date in the order they were given", () => {
    const days = build({
      items: [
        item({ ordinal: 0, localDate: START, title: "Morning" }),
        item({ ordinal: 1, localDate: START, title: "Evening" }),
      ],
      planned: [],
    });

    expect(days[0].items.map((entry) => entry.title)).toEqual([
      "Morning",
      "Evening",
    ]);
  });
});

describe("datesBetween", () => {
  it("is inclusive of both ends", () => {
    expect(datesBetween("2026-09-21", "2026-09-23")).toEqual([
      "2026-09-21",
      "2026-09-22",
      "2026-09-23",
    ]);
  });

  it("treats a single day as a valid horizon", () => {
    expect(datesBetween("2026-09-21", "2026-09-21")).toEqual(["2026-09-21"]);
  });

  it("returns nothing rather than looping when the range is inverted", () => {
    expect(datesBetween("2026-09-23", "2026-09-21")).toEqual([]);
  });

  it("refuses to run past the contract's seven days", () => {
    expect(datesBetween("2026-09-01", "2026-12-01")).toHaveLength(7);
  });

  it("returns nothing for an unparseable date", () => {
    expect(datesBetween("not-a-date", "2026-09-21")).toEqual([]);
  });
});

describe("groupPlannedByDate", () => {
  it("keeps every session on its own date", () => {
    const grouped = groupPlannedByDate([
      planned({ id: "a", localDate: START, title: "One" }),
      planned({ id: "b", localDate: START, title: "Two" }),
      planned({ id: "c", localDate: "2026-09-22", title: "Three" }),
    ]);

    expect(grouped.get(START)?.map((entry) => entry.title)).toEqual([
      "One",
      "Two",
    ]);
    expect(grouped.get("2026-09-22")?.map((entry) => entry.title)).toEqual([
      "Three",
    ]);
  });
});

function build(input: {
  items: PlanProposalItemView[];
  planned: (PlannedSessionSummary & { localDate: string })[];
  today?: string;
  recoveryDates?: string[];
}) {
  return buildProposalTimeline({
    startDate: START,
    endDate: "2026-09-23",
    today: input.today ?? START,
    items: input.items,
    plannedSessions: input.planned,
    plannedByDate: groupPlannedByDate(input.planned),
    recoveryDates: input.recoveryDates ?? [],
  });
}

function item(
  overrides: Partial<PlanProposalItemView> & {
    ordinal: number;
    localDate: string;
  },
): PlanProposalItemView {
  return {
    kind: "session",
    decision: "proposed",
    title: null,
    sport: "Running",
    intent: null,
    expectedDurationMinutes: 45,
    rationale: "Because.",
    contentIndex: overrides.ordinal,
    ...overrides,
  };
}

function planned(
  overrides: Partial<PlannedSessionSummary> & {
    id: string;
    localDate: string;
  },
): PlannedSessionSummary & { localDate: string } {
  return {
    title: "Planned",
    sport: "Running",
    expectedDurationMinutes: 60,
    isLocked: false,
    status: "active",
    ...overrides,
  };
}
