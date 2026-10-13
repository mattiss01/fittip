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

  it("offers an empty tick on an open milestone, and says nothing about it", () => {
    const { container } = renderTick(null);

    const tick = screen.getByRole("button", {
      name: ROADMAP_CONTROL_COPY.milestoneReachLabel("Ninety minutes easy"),
    });
    expect(tick).toHaveAttribute("aria-pressed", "false");
    expect(tick.querySelector("svg")).toBeNull();
    expect(container).toHaveTextContent("");
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
    const tick = screen.getByRole("button", {
      name: ROADMAP_CONTROL_COPY.milestoneUndoLabel("Ninety minutes easy"),
    });
    expect(tick).toHaveAttribute("aria-pressed", "true");
    expect(tick.querySelector("svg")).not.toBeNull();
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
