import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The action is rendered, not run: what it does is `actions.test.ts`'s.
vi.mock("@/app/home/plan/roadmap/actions", () => ({
  writeRoadmapAction: vi.fn(),
}));

import { phaseStarts, RoadmapWriter } from "./roadmap-writer";

import { ROADMAP_CONTROL_COPY } from "@/lib/roadmap/roadmap-control-copy";

const LABELS = ROADMAP_CONTROL_COPY.writeFieldLabels;
const TODAY = "2026-10-14";
const GOALS = [
  { id: "a1000000-0000-4000-8000-000000000001", title: "Half marathon" },
  { id: "a1000000-0000-4000-8000-000000000002", title: "Ten pull-ups" },
];

function content() {
  return JSON.parse(
    (document.querySelector('input[name="content"]') as HTMLInputElement).value,
  );
}

function renderWriter(goals = GOALS) {
  render(
    <RoadmapWriter
      today={TODAY}
      goals={goals}
      expectedHeadRevision={0}
      replaces={false}
    />,
  );
}

describe("RoadmapWriter", () => {
  afterEach(cleanup);

  it("starts empty: a title, today, no end, and one empty phase", () => {
    renderWriter();

    expect(content()).toEqual({
      schemaVersion: "fittip.roadmap.v4",
      title: "",
      startDate: TODAY,
      endDate: "",
      phases: [
        {
          title: "",
          focus: "",
          startDate: TODAY,
          endDate: "",
          goalAttention: [],
          milestones: [],
        },
      ],
    });
    expect(screen.getByText(ROADMAP_CONTROL_COPY.writeSupport)).toBeTruthy();
  });

  it("starts each phase the day after the one before it ends, and ends the last with the roadmap", () => {
    renderWriter();

    fireEvent.change(
      screen.getAllByLabelText(ROADMAP_CONTROL_COPY.endDateLabel)[0]!,
      {
        target: { value: "2027-01-05" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: LABELS.addPhase }));
    // Only the first phase asks for its end; the second ends with the roadmap.
    // The roadmap's end comes first, then the first phase's.
    fireEvent.change(screen.getAllByLabelText(LABELS.phaseEnd)[1]!, {
      target: { value: "2026-11-10" },
    });

    const phases = content().phases;
    expect(
      phases.map((phase: { startDate: string }) => phase.startDate),
    ).toEqual([TODAY, "2026-11-11"]);
    expect(phases.map((phase: { endDate: string }) => phase.endDate)).toEqual([
      "2026-11-10",
      "2027-01-05",
    ]);
    expect(screen.getByText(LABELS.phaseStarts("11 Nov 2026"))).toBeTruthy();
    expect(
      screen.getByText(LABELS.phaseEndsWithRoadmap("5 Jan 2027")),
    ).toBeTruthy();
  });

  it("keeps what was typed in a phase when the one before it is removed", () => {
    renderWriter();
    fireEvent.click(screen.getByRole("button", { name: LABELS.addPhase }));
    // The roadmap's own title comes first, then each phase's.
    const titles = screen.getAllByLabelText(LABELS.phaseTitle);
    fireEvent.change(titles[2]!, { target: { value: "Build" } });

    fireEvent.click(
      screen.getAllByRole("button", { name: LABELS.removePhase })[0]!,
    );

    expect(content().phases).toHaveLength(1);
    expect(content().phases[0]).toMatchObject({
      title: "Build",
      startDate: TODAY,
    });
  });

  it("adds a goal and a milestone, leaving blank details out", () => {
    renderWriter();
    fireEvent.click(screen.getByRole("button", { name: LABELS.addGoal }));
    fireEvent.click(screen.getByRole("button", { name: LABELS.addMilestone }));

    const phase = content().phases[0];
    expect(phase.goalAttention).toEqual([
      { goalId: GOALS[0]!.id, level: "primary" },
    ]);
    // A phase for one goal gives its milestone that goal.
    expect(phase.milestones).toEqual([
      { title: "", targetDate: "", goalIds: [GOALS[0]!.id] },
    ]);

    fireEvent.change(screen.getByLabelText(LABELS.milestoneDetails), {
      target: { value: "Under 1:50" },
    });
    expect(content().phases[0].milestones[0].observableCriterion).toBe(
      "Under 1:50",
    );
  });

  it("leaves a blank summary out and sends one that is written", () => {
    renderWriter();
    expect("summary" in content()).toBe(false);

    fireEvent.change(screen.getByLabelText(LABELS.summary), {
      target: { value: "Base, then speed." },
    });
    expect(content().summary).toBe("Base, then speed.");
  });

  it("offers no more goals than the owner has", () => {
    renderWriter();
    fireEvent.click(screen.getByRole("button", { name: LABELS.addGoal }));
    fireEvent.click(screen.getByRole("button", { name: LABELS.addGoal }));

    expect(screen.queryByRole("button", { name: LABELS.addGoal })).toBeNull();
    expect(content().phases[0].goalAttention).toHaveLength(2);
  });

  it("says what is missing when there is no goal to write for", () => {
    renderWriter([]);

    expect(screen.getByText(ROADMAP_CONTROL_COPY.writeNoGoals)).toBeTruthy();
    expect(document.querySelector("form")).toBeNull();
  });
});

describe("phaseStarts", () => {
  it("leaves a start unknown while the end before it is not a date", () => {
    expect(
      phaseStarts({
        startDate: TODAY,
        phases: [{ endDate: "" }, { endDate: "" }],
      }),
    ).toEqual([TODAY, ""]);
  });
});
