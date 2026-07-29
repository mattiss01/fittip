import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PlanningInitialState } from "@/features/planning/planning-types";

const {
  archivePersonalActivityActionMock,
  createPersonalActivityActionMock,
  refreshMock,
  savePlanActionMock,
  updatePersonalActivityActionMock,
} = vi.hoisted(() => ({
  archivePersonalActivityActionMock: vi.fn(),
  createPersonalActivityActionMock: vi.fn(),
  refreshMock: vi.fn(),
  savePlanActionMock: vi.fn(),
  updatePersonalActivityActionMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

vi.mock("@/app/home/plan/actions", () => ({
  archivePersonalActivityAction: archivePersonalActivityActionMock,
  createPersonalActivityAction: createPersonalActivityActionMock,
  savePlanAction: savePlanActionMock,
  updatePersonalActivityAction: updatePersonalActivityActionMock,
}));

import { PlanEditor, toPersistencePlan } from "./plan-editor";

describe("PlanEditor", () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, "", "/home/plan");
    vi.clearAllMocks();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    savePlanActionMock.mockResolvedValue({
      status: "saved",
      revision: 3,
      versionNumber: 3,
      acceptedAt: "2026-07-28T15:00:00.000Z",
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("builds and explicitly saves a sport-neutral three-day plan", async () => {
    const { container } = render(
      <PlanEditor initialState={existingPlanState()} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "3" }));
    expect(container.querySelectorAll(".plan-day")).toHaveLength(3);

    fireEvent.click(screen.getAllByRole("button", { name: "+ Add" })[0]);
    const dialog = screen.getByRole("dialog", { name: "Add session" });
    fireEvent.change(within(dialog).getByLabelText("Session title"), {
      target: { value: "First-touch practice" },
    });
    fireEvent.change(within(dialog).getAllByLabelText("Sport or domain")[0], {
      target: { value: "Football" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "+ New activity" }),
    );
    fireEvent.change(within(dialog).getByLabelText("Name"), {
      target: { value: "Wall passes" },
    });
    fireEvent.change(within(dialog).getAllByLabelText("Sport or domain")[1], {
      target: { value: "Football" },
    });
    fireEvent.change(within(dialog).getByLabelText("Measurement"), {
      target: { value: "skill_repetitions" },
    });
    fireEvent.change(within(dialog).getByLabelText("Repetitions"), {
      target: { value: "40" },
    });
    fireEvent.change(
      within(dialog).getByLabelText("Unit", { selector: "input" }),
      {
        target: { value: "passes" },
      },
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Keep in draft" }),
    );

    expect(
      screen.getByRole("heading", { name: "First-touch practice" }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Save plan" }));

    await waitFor(() => expect(savePlanActionMock).toHaveBeenCalledOnce());
    expect(savePlanActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        dayCount: 3,
        sessions: [
          expect.objectContaining({
            title: "First-touch practice",
            sport: "Football",
            position: 0,
            activities: [
              expect.objectContaining({
                name: "Wall passes",
                measurementMode: "skill_repetitions",
                target: { repetitions: 40, unit: "passes" },
              }),
            ],
          }),
        ],
      }),
      2,
    );
    expect(await screen.findByText(/Plan version 3 accepted/)).toBeVisible();
    expect(refreshMock).toHaveBeenCalledOnce();
  });

  it("uses the remembered valid horizon for a first plan", async () => {
    localStorage.setItem("fittip.plan.day-count.v1", "3");
    const { container } = render(
      <PlanEditor
        initialState={{
          plan: null,
          expectedRevision: 0,
          versionNumber: null,
          personalActivities: [],
        }}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "3" })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
    expect(container.querySelectorAll(".plan-day")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Save plan" })).toBeDisabled();
  });

  it("keeps the draft and gives an honest stale-version recovery state", async () => {
    savePlanActionMock.mockResolvedValue({
      status: "conflict",
      message:
        "This plan changed in another tab. Reload the current plan before saving again.",
    });
    render(<PlanEditor initialState={existingPlanState()} />);

    fireEvent.click(screen.getByRole("button", { name: "2" }));
    fireEvent.click(screen.getByRole("button", { name: "Save plan" }));

    expect(await screen.findByText(/changed in another tab/i)).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Reload current plan" }),
    ).toBeVisible();
    expect(screen.getByText("Draft changes")).toBeVisible();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("moves, removes, and locks future sessions only in the next saved version", async () => {
    const initialState = existingPlanState();
    initialState.plan = {
      ...initialState.plan!,
      dayCount: 2,
      sessions: [
        sessionDraft("first", "2026-07-28", "Run"),
        sessionDraft("second", "2026-07-29", "Mobility"),
      ],
    };
    render(<PlanEditor initialState={initialState} />);

    fireEvent.change(screen.getByLabelText("Move Run to date"), {
      target: { value: "2026-07-29" },
    });
    fireEvent.click(
      within(screen.getByLabelText("Actions for Run")).getByRole("button", {
        name: "Lock",
      }),
    );
    fireEvent.click(
      within(screen.getByLabelText("Actions for Mobility")).getByRole(
        "button",
        { name: "Remove" },
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save plan" }));

    await waitFor(() => expect(savePlanActionMock).toHaveBeenCalledOnce());
    expect(savePlanActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sessions: [
          expect.objectContaining({
            localDate: "2026-07-29",
            title: "Run",
            isLocked: true,
            position: 0,
          }),
        ],
      }),
      2,
    );
    expect(window.confirm).toHaveBeenCalledWith(
      "Remove this session from the new plan version?",
    );
  });

  it("renders an accepted past session as read-only planning history", () => {
    const initialState = existingPlanState();
    initialState.plan = {
      ...initialState.plan!,
      dayCount: 1,
      startDate: "2020-01-01",
      sessions: [sessionDraft("past", "2020-01-01", "Past run")],
    };
    render(<PlanEditor initialState={initialState} />);

    expect(screen.getByRole("button", { name: "Past" })).toBeDisabled();
    expect(screen.getByText("Past plan · read-only")).toBeVisible();
    expect(
      screen.queryByLabelText("Actions for Past run"),
    ).not.toBeInTheDocument();
  });

  it("contains keyboard focus in the session dialog and restores its opener", async () => {
    const { container } = render(
      <PlanEditor initialState={existingPlanState()} />,
    );
    const opener = screen.getAllByRole("button", { name: "+ Add" })[0];

    fireEvent.click(opener);
    const dialog = screen.getByRole("dialog", { name: "Add session" });
    const background = container.querySelector(".plan-background");
    const title = within(dialog).getByLabelText("Session title");
    const close = within(dialog).getByRole("button", {
      name: "Close session editor",
    });
    const keep = within(dialog).getByRole("button", {
      name: "Keep in draft",
    });

    expect(background).toHaveAttribute("inert");
    expect(background).toHaveAttribute("aria-hidden", "true");
    await waitFor(() => expect(title).toHaveFocus());

    keep.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(close).toHaveFocus();

    close.focus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(keep).toHaveFocus();

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(background).not.toHaveAttribute("inert");
    expect(background).not.toHaveAttribute("aria-hidden");
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("protects a dirty draft from browser Back until leaving is confirmed", () => {
    const back = vi
      .spyOn(window.history, "back")
      .mockImplementation(() => undefined);
    render(<PlanEditor initialState={existingPlanState()} />);
    fireEvent.click(screen.getByRole("button", { name: "3" }));

    vi.mocked(window.confirm).mockReturnValue(false);
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(window.confirm).toHaveBeenCalledWith(
      "Leave this plan? Your unsaved changes will be lost.",
    );
    expect(back).not.toHaveBeenCalled();
    expect(screen.getByText("Draft changes")).toBeVisible();

    vi.mocked(window.confirm).mockReturnValue(true);
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(back).toHaveBeenCalledOnce();
  });

  it("reuses an existing history guard after returning to Plan", () => {
    window.history.replaceState(
      {
        __fittipPlanBase: "existing-plan-guard",
        __fittipPlanGuard: "existing-plan-guard",
      },
      "",
      "/home/plan",
    );
    const pushState = vi.spyOn(window.history, "pushState");

    render(<PlanEditor initialState={existingPlanState()} />);

    expect(pushState).not.toHaveBeenCalled();
  });
});

describe("toPersistencePlan", () => {
  it("strips client ids and preserves ordering, snapshots, and locks", () => {
    expect(
      toPersistencePlan({
        dayCount: 1,
        startDate: "2026-07-28",
        timezoneName: "Europe/Berlin",
        sessions: [
          {
            clientId: "session-local",
            localDate: "2026-07-28",
            title: "Mobility",
            sport: "Mobility",
            intent: "",
            note: "",
            isLocked: true,
            activities: [
              {
                clientId: "activity-local",
                personalActivityId: "20000000-0000-4000-8000-000000000001",
                name: "Hip flow",
                sport: "Mobility",
                instructions: "",
                measurementMode: "duration_intensity",
                target: {
                  duration_minutes: 20,
                  intensity: "easy",
                  ignored: undefined,
                },
                isLocked: true,
              },
            ],
          },
        ],
      }),
    ).toEqual({
      dayCount: 1,
      startDate: "2026-07-28",
      timezoneName: "Europe/Berlin",
      sessions: [
        {
          localDate: "2026-07-28",
          position: 0,
          title: "Mobility",
          sport: "Mobility",
          isLocked: true,
          activities: [
            {
              personalActivityId: "20000000-0000-4000-8000-000000000001",
              position: 0,
              name: "Hip flow",
              sport: "Mobility",
              measurementMode: "duration_intensity",
              target: { duration_minutes: 20, intensity: "easy" },
              isLocked: true,
            },
          ],
        },
      ],
    });
  });
});

function existingPlanState(): PlanningInitialState {
  return {
    plan: {
      dayCount: 7,
      startDate: "2026-07-28",
      timezoneName: "Europe/Berlin",
      sessions: [],
    },
    expectedRevision: 2,
    versionNumber: 2,
    personalActivities: [],
  };
}

function sessionDraft(
  clientId: string,
  localDate: string,
  title: string,
): NonNullable<PlanningInitialState["plan"]>["sessions"][number] {
  return {
    clientId,
    localDate,
    title,
    sport: title === "Run" ? "Running" : "Mobility",
    intent: "",
    note: "",
    isLocked: false,
    activities: [],
  };
}
