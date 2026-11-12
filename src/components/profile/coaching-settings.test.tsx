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

import { CoachingSettings } from "./coaching-settings";

function sent(call: number) {
  const form = saveMock.mock.calls[call][1] as FormData;
  return { part: form.get("part"), pushLevel: form.get("pushLevel") };
}

describe("CoachingSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveMock.mockResolvedValue({ status: "saved", message: "", submission: 1 });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("starts at the saved level and saves only where the slider settles", async () => {
    vi.useFakeTimers();
    render(<CoachingSettings initial="steady" />);
    const slider = screen.getByRole("slider", {
      name: "How hard your coach pushes you",
    });
    expect(slider).toHaveValue("2");

    fireEvent.change(slider, { target: { value: "3" } });
    fireEvent.change(slider, { target: { value: "4" } });
    expect(saveMock).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(sent(0)).toEqual({ part: "push", pushLevel: "ambitious" });
    vi.useRealTimers();
    await waitFor(() => expect(screen.getByText("Saved")).toBeVisible());
  });

  it("says when a level was not saved", async () => {
    vi.useFakeTimers();
    saveMock.mockResolvedValue({
      status: "error",
      message: "Your training setup could not be saved. Reload and try again.",
      submission: 1,
    });
    render(<CoachingSettings initial="balanced" />);
    fireEvent.change(screen.getByRole("slider"), { target: { value: "5" } });
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    vi.useRealTimers();

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("could not be saved"),
    );
    expect(screen.getByText("Not saved")).toBeVisible();
  });

  it("sends a change still waiting when the page is left", () => {
    vi.useFakeTimers();
    const { unmount } = render(<CoachingSettings initial="balanced" />);
    fireEvent.change(screen.getByRole("slider"), { target: { value: "1" } });
    unmount();

    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(sent(0)).toEqual({ part: "push", pushLevel: "gentle" });
  });
});
