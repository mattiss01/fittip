import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { RevisionHistory } from "@/components/completions/revision-history";
import type {
  CompletionHistory,
  CompletionRevision,
} from "@/features/completions/completion-types";

afterEach(cleanup);

describe("RevisionHistory", () => {
  it("exposes changed duration and activity measurements for every revision", () => {
    const original = revision({
      id: "00000000-0000-4000-8000-000000000041",
      revisionNumber: 1,
      durationMinutes: 36,
      activities: [activity("00000000-0000-4000-8000-000000000051", 5)],
    });
    const corrected = revision({
      id: "00000000-0000-4000-8000-000000000042",
      revisionNumber: 2,
      durationMinutes: 42,
      correctionReason: "Corrected from watch.",
      activities: [activity("00000000-0000-4000-8000-000000000052", 6)],
    });
    const history: CompletionHistory = {
      current: corrected,
      revisions: [corrected, original],
    };

    render(<RevisionHistory history={history} />);

    const revisionOne = screen.getByText("Revision 1").closest("li");
    const revisionTwo = screen.getByText("Revision 2").closest("li");
    expect(revisionOne).not.toBeNull();
    expect(revisionTwo).not.toBeNull();
    expect(within(revisionOne!).getByText("36 min")).toBeVisible();
    expect(
      within(revisionOne!).getByText('{"distance":5,"distance_unit":"km"}'),
    ).toBeVisible();
    expect(within(revisionTwo!).getByText("42 min")).toBeVisible();
    expect(
      within(revisionTwo!).getByText('{"distance":6,"distance_unit":"km"}'),
    ).toBeVisible();
    expect(within(revisionTwo!).getByText("Current fact")).toBeVisible();
    expect(
      within(revisionOne!).getByText("Preserved prior fact"),
    ).toBeVisible();
  });
});

function revision(overrides: Partial<CompletionRevision>): CompletionRevision {
  return {
    id: "00000000-0000-4000-8000-000000000040",
    userId: "00000000-0000-4000-8000-000000000001",
    completionGroupId: "00000000-0000-4000-8000-000000000060",
    revisionNumber: 1,
    previousCompletionId: null,
    actualLocalDate: "2026-07-28",
    timezoneName: "Europe/Berlin",
    status: "completed",
    painReported: false,
    illnessReported: false,
    injuryReported: false,
    severeFatigueReported: false,
    createdAt: "2026-07-28T12:00:00Z",
    activities: [],
    ...overrides,
  };
}

function activity(id: string, distance: number) {
  return {
    id,
    completedSessionId: "00000000-0000-4000-8000-000000000040",
    position: 0,
    name: "Easy run",
    sport: "Running",
    measurementMode: "time_distance_pace" as const,
    actualMeasurement: { distance, distance_unit: "km" } as const,
  };
}
