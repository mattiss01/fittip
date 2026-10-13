import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/home/plan/roadmap/actions", () => ({
  setMilestoneReachedAction: vi.fn(),
}));

import { MilestoneTick } from "@/components/roadmap/milestone-tick";
import { ROADMAP_CONTROL_COPY } from "@/lib/roadmap/roadmap-control-copy";

const VERSION_ID = "7e180000-0000-4000-8000-000000000001";

/**
 * ADR-026. What the tick shows is the stored mark it was given, and what it
 * sends is which milestone and which way: never an owner, never a day.
 */
describe("MilestoneTick", () => {
  afterEach(cleanup);

  it("offers to mark an open milestone, and says nothing else about it", () => {
    const { container } = renderTick(null);

    expect(
      screen.getByRole("button", {
        name: ROADMAP_CONTROL_COPY.milestoneReachLabel("Ninety minutes easy"),
      }),
    ).toHaveTextContent(ROADMAP_CONTROL_COPY.milestoneReachAction);
    expect(container.querySelector("p")).toBeNull();
    expect(sent(container)).toEqual({
      versionId: VERSION_ID,
      phaseIndex: "1",
      milestoneIndex: "2",
      reached: "true",
    });
  });

  it("shows the day of a mark and offers to take it back", () => {
    const { container } = renderTick("2026-10-18");

    expect(
      screen.getByText(ROADMAP_CONTROL_COPY.milestoneReached("18 Oct 2026")),
    ).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: ROADMAP_CONTROL_COPY.milestoneUndoLabel("Ninety minutes easy"),
      }),
    ).toHaveTextContent(ROADMAP_CONTROL_COPY.milestoneUndoAction);
    expect(sent(container)).toMatchObject({ reached: "false" });
  });
});

function renderTick(reachedOn: string | null) {
  return render(
    <MilestoneTick
      versionId={VERSION_ID}
      phaseIndex={1}
      milestoneIndex={2}
      title="Ninety minutes easy"
      reachedOn={reachedOn}
    />,
  );
}

function sent(container: HTMLElement) {
  return Object.fromEntries(
    new FormData(container.querySelector("form") as HTMLFormElement),
  );
}
