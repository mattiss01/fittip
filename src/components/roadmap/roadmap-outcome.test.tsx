import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { reportRoadmapOutcome, RoadmapOutcomeNotice } from "./roadmap-outcome";

import type { RoadmapActionState } from "@/app/home/plan/roadmap/action-state";

/**
 * The one place a landed roadmap write says what it did.
 *
 * It is module-level mutable state in a `"use client"` module, which is what
 * lets a sentence outlive the control that earned it — every control here is
 * removed by its own write. The same property is what could let a sentence
 * outlive the surface, or let a refusal appear somewhere the owner cannot act
 * on it, so both are pinned here.
 */

const LANDED: RoadmapActionState = {
  status: "accepted",
  message: "Accepted. This is your roadmap now.",
  submission: 1,
};

const REFUSED: RoadmapActionState = {
  status: "conflict",
  message: "Your training history changed. Review the proposal again.",
  submission: 2,
};

describe("RoadmapOutcomeNotice", () => {
  afterEach(() => {
    act(() => reportRoadmapOutcome(null));
    cleanup();
  });

  it("says nothing until a write lands", () => {
    render(<RoadmapOutcomeNotice />);
    expect(document.querySelector("[data-roadmap-outcome]")).toBeNull();
  });

  it("shows a landed write's sentence, reported before its control unmounts", () => {
    render(<RoadmapOutcomeNotice />);
    act(() => reportRoadmapOutcome(LANDED));

    const notice = document.querySelector("[data-roadmap-outcome]");
    expect(notice?.getAttribute("data-roadmap-notice")).toBe("accepted");
    expect(notice?.getAttribute("role")).toBe("status");
    expect(screen.getByText(LANDED.message)).toBeTruthy();
  });

  // A refusal belongs beside the control the owner has to act on. Routing it
  // here would put it at the top of the surface, away from the thing it is
  // about — and clearing is what a new write's reply must do to the sentence
  // before it, not leave it standing over a write that did not land.
  it("clears rather than shows a reply that did not land", () => {
    render(<RoadmapOutcomeNotice />);
    act(() => reportRoadmapOutcome(LANDED));
    act(() => reportRoadmapOutcome(REFUSED));

    expect(screen.queryByText(REFUSED.message)).toBeNull();
    expect(screen.queryByText(LANDED.message)).toBeNull();
  });

  // Leaving the roadmap ends the sentence's life. Without this, a client-side
  // return to the route would reopen it over a write made minutes ago.
  it("does not survive the surface it belongs to", () => {
    const { unmount } = render(<RoadmapOutcomeNotice />);
    act(() => reportRoadmapOutcome(LANDED));
    unmount();

    render(<RoadmapOutcomeNotice />);
    expect(screen.queryByText(LANDED.message)).toBeNull();
  });
});
