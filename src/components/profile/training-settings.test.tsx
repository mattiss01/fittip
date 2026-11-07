import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { saveMock } = vi.hoisted(() => ({ saveMock: vi.fn() }));
vi.mock("@/app/home/you/profile-actions", () => ({
  saveTrainingSetupAction: saveMock,
}));

import { TrainingSettings } from "./training-settings";

const TRAINING = {
  sessionsPerWeek: 4,
  unavailableDays: ["sunday" as const],
  availabilityNote: null,
  trainingPlaces: ["Gym"],
  homeEquipment: ["Mat"],
};

/** What the last save sent, as part and fields. */
function lastSent() {
  const form = saveMock.mock.calls.at(-1)![1] as FormData;
  return Object.fromEntries(
    [...new Set(form.keys())].map((key) => [key, form.getAll(key)]),
  );
}

describe("TrainingSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveMock.mockResolvedValue({ status: "saved", message: "", submission: 1 });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("shows saved equipment even without a place called Home", () => {
    render(
      <TrainingSettings
        training={{ ...TRAINING, trainingPlaces: ["Zuhause"] }}
      />,
    );
    expect(screen.getByText("What you have at home")).toBeVisible();
    expect(screen.getByText("Mat")).toBeVisible();
  });

  it("shows the owner's own places, and equipment only with Home or some saved", () => {
    render(<TrainingSettings training={{ ...TRAINING, homeEquipment: [] }} />);
    expect(screen.getByText("Gym")).toBeVisible();
    expect(screen.queryByRole("checkbox")).toBeNull();
    // The catalogue is not on screen until adding.
    expect(screen.queryByRole("button", { name: "+ Pool" })).toBeNull();
    expect(screen.queryByText("What you have at home")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Save training setup" }),
    ).toBeNull();
  });

  it("saves a tapped day at once, with the note, and only that part", async () => {
    render(<TrainingSettings training={TRAINING} />);
    fireEvent.click(screen.getByRole("button", { name: "Monday" }));
    expect(screen.getByRole("button", { name: "Monday" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    expect(lastSent()).toEqual({
      part: ["days"],
      unavailableDays: ["monday", "sunday"],
      availabilityNote: [""],
    });
    expect(await screen.findByText("Saved")).toBeVisible();
  });

  it("adds a place from the suggestions, and then asks about home", async () => {
    render(<TrainingSettings training={TRAINING} />);
    fireEvent.focus(screen.getByLabelText("Add a place"));
    fireEvent.click(screen.getByRole("button", { name: "+ Home" }));
    await waitFor(() => expect(saveMock).toHaveBeenCalled());
    expect(lastSent()).toEqual({
      part: ["places"],
      trainingPlaces: ["Gym", "Home"],
    });
    expect(screen.getByText("What you have at home")).toBeVisible();
    expect(screen.getByText("Mat")).toBeVisible();
  });

  it("removes a place it is told to", async () => {
    render(<TrainingSettings training={TRAINING} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Gym" }));
    await waitFor(() => expect(saveMock).toHaveBeenCalled());
    expect(lastSent()).toEqual({ part: ["places"] });
    expect(screen.getByText("None yet.")).toBeVisible();
  });

  it("saves a run of steps once, where it stopped", async () => {
    vi.useFakeTimers();
    render(<TrainingSettings training={TRAINING} />);
    const more = screen.getByRole("button", { name: "One session more" });
    fireEvent.click(more);
    fireEvent.click(more);
    expect(screen.getByText("6 a week")).toBeVisible();
    expect(saveMock).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(lastSent()).toEqual({
      part: ["frequency"],
      sessionsPerWeek: ["6"],
    });
  });

  it("says why a save was refused", async () => {
    saveMock.mockResolvedValue({
      status: "validation",
      message: "Check the details and try again.",
      submission: 1,
    });
    render(<TrainingSettings training={TRAINING} />);
    fireEvent.click(screen.getByRole("button", { name: "Monday" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Check the details and try again.",
    );
  });

  it("sends a waiting step when the page is left", () => {
    vi.useFakeTimers();
    const { unmount } = render(<TrainingSettings training={TRAINING} />);
    fireEvent.click(screen.getByRole("button", { name: "One session more" }));
    expect(saveMock).not.toHaveBeenCalled();
    unmount();
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(lastSent()).toEqual({
      part: ["frequency"],
      sessionsPerWeek: ["5"],
    });
  });

  it("saves the note once the owner pauses, with the days", async () => {
    vi.useFakeTimers();
    render(<TrainingSettings training={TRAINING} />);
    fireEvent.change(screen.getByLabelText(/Anything else about your week/), {
      target: { value: "Late on Fridays" },
    });
    expect(saveMock).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(800);
    });
    expect(lastSent()).toEqual({
      part: ["days"],
      unavailableDays: ["sunday"],
      availabilityNote: ["Late on Fridays"],
    });
  });

  it("keeps a refusal in view until that part saves, not another", async () => {
    saveMock.mockResolvedValueOnce({
      status: "validation",
      message: "Check the details and try again.",
      submission: 1,
    });
    render(<TrainingSettings training={TRAINING} />);
    fireEvent.click(screen.getByRole("button", { name: "Monday" }));
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(screen.getByText("Not saved")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Remove Gym" }));
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Check the details and try again.",
    );

    fireEvent.click(screen.getByRole("button", { name: "Tuesday" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("says why a name is not added", () => {
    render(<TrainingSettings training={TRAINING} />);
    const field = screen.getByLabelText("Add a place");
    fireEvent.change(field, { target: { value: "gym" } });
    fireEvent.submit(field.closest("form")!);
    expect(screen.getByText("gym is already in your list.")).toBeVisible();
    expect(saveMock).not.toHaveBeenCalled();
  });
});
