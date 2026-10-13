import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { RoadmapEditor } from "@/components/roadmap/roadmap-editor";
import { ROADMAP_CONTROL_COPY } from "@/lib/roadmap/roadmap-control-copy";

const GOAL_ID = "7e170000-0000-4000-8000-000000000001";
const LABELS = ROADMAP_CONTROL_COPY.editFieldLabels;

/**
 * What the editor sends is what gets validated and stored, so these read the
 * one hidden field the form submits and nothing about how the draft is held.
 */
describe("RoadmapEditor", () => {
  afterEach(cleanup);

  it("saves a proposal made before v3 as a v3 roadmap", () => {
    const { container } = renderEditor(legacyContent());

    const sent = submitted(container);
    expect(sent.schemaVersion).toBe("fittip.roadmap.v3");
    expect(Object.keys(sent).sort()).toEqual([
      "endDate",
      "phases",
      "reviewPoints",
      "schemaVersion",
      "startDate",
      "summary",
      "title",
    ]);
    expect(sent.phases[0].goalAttention).toEqual([
      { goalId: GOAL_ID, level: "primary" },
    ]);
    // What the owner did not touch is carried over as it was.
    expect(sent.phases[0].milestones).toHaveLength(1);
    expect(sent.reviewPoints).toEqual([
      {
        title: "Check the base",
        triggerDate: "2026-10-25",
        question: "Is the long run still comfortable?",
      },
    ]);
  });

  it("offers a level for each goal and no reason to write", () => {
    renderEditor(legacyContent());

    expect(
      screen.getByLabelText(`${LABELS.attention} · Half marathon`),
    ).toBeTruthy();
    expect(screen.queryByText("Why")).toBeNull();
    expect(
      screen.queryByDisplayValue("The only dated target in range."),
    ).toBeNull();
  });

  it("lets the last milestone of a phase be removed", () => {
    const { container } = renderEditor(legacyContent());

    fireEvent.click(
      screen.getByRole("button", { name: LABELS.milestoneRemove }),
    );

    expect(submitted(container).phases[0].milestones).toEqual([]);
    expect(
      screen.queryByRole("button", { name: LABELS.milestoneRemove }),
    ).toBeNull();
  });
});

function renderEditor(content: unknown) {
  return render(
    <RoadmapEditor
      proposalId="7e170000-0000-4000-8000-000000000010"
      content={content}
      goalTitles={{ [GOAL_ID]: "Half marathon" }}
      formAction={() => {}}
      message=""
      saving={false}
      lostRender={false}
      onCancel={() => {}}
    />,
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function submitted(container: HTMLElement): any {
  const field = container.querySelector<HTMLInputElement>(
    'input[name="content"]',
  );
  return JSON.parse(field?.value ?? "null");
}

function legacyContent() {
  return {
    schemaVersion: "fittip.roadmap.v2",
    title: "Base and build",
    summary: "Twelve weeks of aerobic work before any sharpening.",
    startDate: "2026-09-14",
    endDate: "2026-12-06",
    phases: [
      {
        title: "Aerobic base",
        focus: "Easy volume, one longer run a week.",
        startDate: "2026-09-14",
        endDate: "2026-12-06",
        goalAttention: [
          {
            goalId: GOAL_ID,
            level: "primary",
            reason: "The only dated target in range.",
          },
        ],
        milestones: [
          {
            title: "Ninety minutes easy",
            observableCriterion:
              "One run of 90 minutes at conversational pace.",
            targetDate: "2026-10-20",
            goalIds: [GOAL_ID],
          },
        ],
      },
    ],
    assumptions: ["Four training days stay available."],
    uncertainties: [
      {
        statement: "The race date is not confirmed.",
        whyItMatters: "The taper hangs off it.",
        whatToWatch: "Confirm the entry before the last phase.",
      },
    ],
    reviewPoints: [
      {
        title: "Check the base",
        triggerDate: "2026-10-25",
        question: "Is the long run still comfortable?",
      },
    ],
    safetyConsiderations: ["Load on the knee stays flat."],
  };
}
