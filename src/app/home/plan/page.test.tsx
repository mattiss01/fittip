import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  createRepositoryMock,
  getCurrentManualPlanMock,
  listActivePersonalActivitiesMock,
  redirectMock,
  TrainingRecordAuthenticationErrorMock,
} = vi.hoisted(() => {
  class TrainingRecordAuthenticationErrorMock extends Error {
    constructor(readonly accessError?: { reason?: string }) {
      super("Authentication required.");
    }
  }
  return {
    createRepositoryMock: vi.fn(),
    getCurrentManualPlanMock: vi.fn(),
    listActivePersonalActivitiesMock: vi.fn(),
    redirectMock: vi.fn((url: string) => {
      throw new Error(`redirect:${url}`);
    }),
    TrainingRecordAuthenticationErrorMock,
  };
});

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/server/repositories/training-record-repository", () => ({
  createTrainingRecordRepository: createRepositoryMock,
  TrainingRecordAuthenticationError: TrainingRecordAuthenticationErrorMock,
}));
vi.mock("@/components/planning/plan-editor", () => ({
  PlanEditor: ({
    initialState,
  }: {
    initialState: { expectedRevision: number; versionNumber: number | null };
  }) => (
    <div>
      Plan revision {initialState.expectedRevision}, version{" "}
      {initialState.versionNumber}
    </div>
  ),
}));

import PlanPage from "./page";

describe("PlanPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createRepositoryMock.mockResolvedValue({
      getCurrentManualPlan: getCurrentManualPlanMock,
      listActivePersonalActivities: listActivePersonalActivitiesMock,
    });
    listActivePersonalActivitiesMock.mockResolvedValue([]);
  });

  afterEach(cleanup);

  it("loads the accepted plan and personal activities on the server", async () => {
    getCurrentManualPlanMock.mockResolvedValue({
      head: { revision: 2 },
      version: { versionNumber: 2 },
      plan: {
        dayCount: 1,
        startDate: "2026-07-28",
        timezoneName: "Europe/Berlin",
        sessions: [],
      },
    });

    render(await PlanPage());

    expect(screen.getByText("Plan revision 2, version 2")).toBeVisible();
    expect(getCurrentManualPlanMock).toHaveBeenCalledOnce();
    expect(listActivePersonalActivitiesMock).toHaveBeenCalledOnce();
  });

  it("redirects an expired session before rendering owner data", async () => {
    getCurrentManualPlanMock.mockRejectedValue(
      new TrainingRecordAuthenticationErrorMock(),
    );

    await expect(PlanPage()).rejects.toThrow("redirect:/");
  });

  // M2-06. src/app/home/plan/error.tsx only runs if the failure escapes the
  // page. Swallowing one here would leave the route on its loading boundary
  // with nothing to recover from, which is the state the ticket forbids.
  it("lets a persistence failure reach the route error boundary", async () => {
    getCurrentManualPlanMock.mockRejectedValue(
      new Error("The training record operation could not be completed."),
    );

    await expect(PlanPage()).rejects.toThrow(
      "The training record operation could not be completed.",
    );
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redirects a denied founder-staging user to the narrow denial route", async () => {
    getCurrentManualPlanMock.mockRejectedValue(
      new TrainingRecordAuthenticationErrorMock({ reason: "not-owner" }),
    );

    await expect(PlanPage()).rejects.toThrow("redirect:/auth/denied");
  });
});
