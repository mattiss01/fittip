import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The actions are rendered, not run: what they do is `actions.test.ts`'s.
vi.mock("@/app/home/plan/roadmap/actions", () => ({
  writeRoadmapAction: vi.fn(),
  editRoadmapAction: vi.fn(),
  rewriteRoadmapAction: vi.fn(),
}));

import {
  checkDraft,
  phaseStarts,
  RoadmapWriter,
  type WriterDraft,
} from "./roadmap-writer";

import { ROADMAP_CONTROL_COPY } from "@/lib/roadmap/roadmap-control-copy";

const LABELS = ROADMAP_CONTROL_COPY.writeFieldLabels;
const CHECKS = ROADMAP_CONTROL_COPY.writeChecks;
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

/** The roadmap's own "Ends" comes first, then each phase's. */
function phaseEnd(phase: number) {
  return screen.getAllByLabelText(LABELS.phaseEnd)[phase]!;
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

  it("takes every phase's end, in any order, and starts each after the one before", () => {
    renderWriter();
    fireEvent.click(screen.getByRole("button", { name: LABELS.addPhase }));

    // The second phase's end before the first's.
    fireEvent.change(phaseEnd(2), { target: { value: "2027-01-05" } });
    fireEvent.change(phaseEnd(1), { target: { value: "2026-11-10" } });

    const phases = content().phases;
    expect(
      phases.map((phase: { startDate: string }) => phase.startDate),
    ).toEqual([TODAY, "2026-11-11"]);
    expect(phases.map((phase: { endDate: string }) => phase.endDate)).toEqual([
      "2026-11-10",
      "2027-01-05",
    ]);
  });

  it("keeps what was typed in a phase when the one before it is removed", () => {
    renderWriter();
    fireEvent.click(screen.getByRole("button", { name: LABELS.addPhase }));
    // The roadmap's own title comes first, then each phase's.
    fireEvent.change(screen.getAllByLabelText(LABELS.phaseTitle)[2]!, {
      target: { value: "Build" },
    });

    fireEvent.click(
      screen.getAllByRole("button", { name: LABELS.removePhase })[0]!,
    );

    expect(content().phases).toHaveLength(1);
    expect(content().phases[0]).toMatchObject({
      title: "Build",
      startDate: TODAY,
    });
  });

  it("picks a phase's goals as chips, with no level to choose", () => {
    renderWriter();
    const chip = screen.getByRole("button", { name: "Half marathon" });
    expect(chip.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(chip);

    expect(chip.getAttribute("aria-pressed")).toBe("true");
    expect(content().phases[0].goalAttention).toEqual([
      { goalId: GOALS[0]!.id, level: "primary" },
    ]);
    expect(screen.queryByLabelText("Attention")).toBeNull();
  });

  it("lets a milestone count toward none of its phase's goals, or some", () => {
    renderWriter();
    fireEvent.click(screen.getByRole("button", { name: "Half marathon" }));
    fireEvent.click(screen.getByRole("button", { name: LABELS.addMilestone }));

    expect(content().phases[0].milestones).toEqual([
      { title: "", targetDate: "", goalIds: [] },
    ]);
    // Two "Half marathon" chips now: the phase's, then the milestone's.
    fireEvent.click(
      screen.getAllByRole("button", { name: "Half marathon" })[1]!,
    );
    expect(content().phases[0].milestones[0].goalIds).toEqual([GOALS[0]!.id]);

    // Taking the goal off the phase takes it off its milestones.
    fireEvent.click(
      screen.getAllByRole("button", { name: "Half marathon" })[0]!,
    );
    expect(content().phases[0].milestones[0].goalIds).toEqual([]);
  });

  it("sends a milestone's details only when written", () => {
    renderWriter();
    fireEvent.click(screen.getByRole("button", { name: LABELS.addMilestone }));
    expect("observableCriterion" in content().phases[0].milestones[0]).toBe(
      false,
    );

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

  it("says what does not add up when saved", () => {
    renderWriter();
    fireEvent.change(phaseEnd(0), { target: { value: "2027-01-05" } });
    fireEvent.change(phaseEnd(1), { target: { value: "2026-12-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Half marathon" }));

    fireEvent.submit(document.querySelector("form")!);

    expect(screen.getByRole("alert").textContent).toBe(
      CHECKS.lastPhaseEnd(1, "5 Jan 2027"),
    );
  });

  it("says what is missing when there is no goal to write for", () => {
    renderWriter([]);

    expect(screen.getByText(ROADMAP_CONTROL_COPY.writeNoGoals)).toBeTruthy();
    expect(document.querySelector("form")).toBeNull();
  });
});

describe("RoadmapWriter editing a proposal", () => {
  afterEach(cleanup);

  it("opens on the proposal, its dates fixed and the coach's levels kept", () => {
    render(
      <RoadmapWriter
        today={TODAY}
        goals={GOALS}
        expectedHeadRevision={2}
        replaces={false}
        edit={{
          proposalId: "p1000000-0000-4000-8000-000000000001",
          content: {
            title: "Coach's",
            startDate: TODAY,
            endDate: "2026-12-31",
            phases: [
              {
                title: "Base",
                focus: "Easy.",
                startDate: TODAY,
                endDate: "2026-12-31",
                goalAttention: [
                  { goalId: GOALS[0]!.id, level: "maintenance" },
                  { goalId: GOALS[1]!.id, level: "not-a-level" },
                ],
                milestones: [
                  {
                    title: "M",
                    targetDate: "2026-11-01",
                    goalIds: [GOALS[0]!.id],
                  },
                ],
              },
            ],
          },
          onCancel: vi.fn(),
          onSaved: vi.fn(),
        }}
      />,
    );

    expect(
      (document.querySelector('input[name="proposalId"]') as HTMLInputElement)
        .value,
    ).toBe("p1000000-0000-4000-8000-000000000001");
    expect(
      document.querySelector('input[name="expectedHeadRevision"]'),
    ).toBeNull();
    expect(
      screen.getAllByLabelText<HTMLInputElement>(
        ROADMAP_CONTROL_COPY.endDateLabel,
      )[0]!.readOnly,
    ).toBe(true);
    const phase = content().phases[0];
    // A level the coach gave is kept; one that is not a level becomes primary.
    expect(phase.goalAttention).toEqual([
      { goalId: GOALS[0]!.id, level: "maintenance" },
      { goalId: GOALS[1]!.id, level: "primary" },
    ]);
    // No details stored, none sent; no summary stored, none sent.
    expect("observableCriterion" in phase.milestones[0]).toBe(false);
    expect("summary" in content()).toBe(false);
  });
});

describe("RoadmapWriter editing the roadmap in force", () => {
  afterEach(cleanup);

  // Started in September; its first phase ended before today.
  const IN_FORCE = {
    schemaVersion: "fittip.roadmap.v4",
    title: "Autumn",
    startDate: "2026-09-01",
    endDate: "2026-12-31",
    phases: [
      {
        title: "Base",
        focus: "Easy.",
        startDate: "2026-09-01",
        endDate: "2026-10-01",
        goalAttention: [{ goalId: GOALS[0]!.id, level: "primary" }],
        milestones: [
          { title: "Long run", targetDate: "2026-09-20", goalIds: [] },
        ],
      },
      {
        title: "Build",
        focus: "Harder.",
        startDate: "2026-10-02",
        endDate: "2026-12-31",
        goalAttention: [{ goalId: GOALS[1]!.id, level: "primary" }],
        milestones: [],
      },
    ],
  };

  function renderInForce() {
    render(
      <RoadmapWriter
        today={TODAY}
        goals={GOALS}
        expectedHeadRevision={3}
        replaces
        inForce={{ content: IN_FORCE, lockedPhases: 1 }}
      />,
    );
  }

  it("opens on the roadmap, its start fixed and the phase that ended drawn as text", () => {
    renderInForce();

    expect(
      screen.getByRole("heading", { name: ROADMAP_CONTROL_COPY.rewriteTitle }),
    ).toBeTruthy();
    expect(
      (
        document.querySelector(
          'input[name="expectedHeadRevision"]',
        ) as HTMLInputElement
      ).value,
    ).toBe("3");
    expect(
      screen.getAllByLabelText<HTMLInputElement>(
        ROADMAP_CONTROL_COPY.startDateLabel,
      )[0]!.readOnly,
    ).toBe(true);
    // The ended phase has no field of its own: the roadmap's title and
    // Build's are the only ones.
    const locked = document.querySelector('[data-roadmap-write-locked="1"]')!;
    expect(locked.textContent).toContain("Base");
    expect(locked.textContent).toContain(ROADMAP_CONTROL_COPY.rewriteLocked);
    expect(locked.querySelector("input, textarea")).toBeNull();
    expect(
      screen
        .getAllByLabelText<HTMLInputElement>(LABELS.phaseTitle)
        .map((input) => input.value),
    ).toEqual(["Autumn", "Build"]);
    // Build is the only phase that can go, and it is the last one left.
    expect(
      screen.queryByRole("button", { name: LABELS.removePhase }),
    ).toBeNull();
    expect(content().phases[0]).toEqual(IN_FORCE.phases[0]);
    expect(screen.getByText(ROADMAP_CONTROL_COPY.rewriteSupport)).toBeTruthy();
  });

  it("refuses, on save, a phase not yet over that now ends before today", () => {
    renderInForce();
    fireEvent.click(screen.getByRole("button", { name: LABELS.addPhase }));
    // Build is the first phase with an "Ends" of its own, after the roadmap's.
    fireEvent.change(phaseEnd(1), { target: { value: "2026-10-10" } });
    fireEvent.submit(document.querySelector("form")!);

    expect(screen.getByRole("alert").textContent).toBe(
      CHECKS.phaseEndsBeforeToday(2),
    );
  });
});

describe("checkDraft", () => {
  const goal = { goalId: GOALS[0]!.id, level: "primary" as const };
  const phase = (
    endDate: string,
    extra: Partial<WriterDraft["phases"][number]> = {},
  ): WriterDraft["phases"][number] => ({
    key: endDate,
    title: "P",
    focus: "F",
    endDate,
    goals: [goal],
    milestones: [],
    ...extra,
  });
  const draft = (phases: WriterDraft["phases"]): WriterDraft => ({
    title: "R",
    summary: "",
    startDate: TODAY,
    endDate: "2026-12-31",
    phases,
  });

  it("passes phases that run back to back to the roadmap's end", () => {
    expect(
      checkDraft(draft([phase("2026-11-15"), phase("2026-12-31")])),
    ).toBeNull();
  });

  it.each([
    [
      "a phase with no end",
      [phase(""), phase("2026-12-31")],
      CHECKS.phaseNoEnd(1),
    ],
    [
      "a phase that ends before it starts",
      [phase("2026-11-15"), phase("2026-11-01"), phase("2026-12-31")],
      CHECKS.phaseEndsBeforeStart(2),
    ],
    [
      "a phase past the roadmap",
      [phase("2027-01-10")],
      CHECKS.phaseEndsAfterRoadmap(1),
    ],
    [
      "a phase with no goal",
      [phase("2026-12-31", { goals: [] })],
      CHECKS.phaseNoGoal(1),
    ],
    [
      "a milestone outside its phase",
      [
        phase("2026-12-31", {
          milestones: [
            {
              key: "m",
              title: "M",
              targetDate: "2027-02-01",
              goalIds: [],
              details: "",
            },
          ],
        }),
      ],
      CHECKS.milestoneOutsidePhase(1),
    ],
  ])("names %s", (_name, phases, expected) => {
    expect(checkDraft(draft(phases))).toBe(expected);
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
