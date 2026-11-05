import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { skipMock } = vi.hoisted(() => ({ skipMock: vi.fn() }));

vi.mock("./unlogged-actions", () => ({
  skipUnloggedSessionAction: skipMock,
}));

import { UnloggedReminder } from "./unlogged-reminder";
import type { UnloggedSessionView } from "./unlogged-state";

const RUN: UnloggedSessionView = {
  id: "7e15d000-0000-4000-8000-000000000001",
  localDate: "2026-11-09",
  position: 0,
  title: "Easy run",
  sport: "Running",
  expectedDurationMinutes: 45,
  startTime: null,
};
const GYM: UnloggedSessionView = {
  id: "7e15d000-0000-4000-8000-000000000002",
  localDate: "2026-11-10",
  position: 0,
  title: "Strength A",
  sport: "Strength",
  expectedDurationMinutes: null,
  startTime: "18:00",
};
const COMPLETION_ID = "7e15d000-0000-4000-8000-000000000003";

describe("UnloggedReminder", () => {
  beforeEach(() => {
    skipMock.mockReset();
  });

  afterEach(cleanup);

  it("draws nothing when every past session has a log", () => {
    const { container } = render(<UnloggedReminder sessions={[]} />);

    expect(container.innerHTML).toBe("");
  });

  it("lists each session with its day and both answers, in plain words", () => {
    render(<UnloggedReminder sessions={[RUN, GYM]} />);

    expect(
      screen.getByRole("heading", { name: "Not logged yet" }),
    ).toBeTruthy();
    expect(
      screen.getByText("2 planned sessions from past days have no log."),
    ).toBeTruthy();
    const run = within(
      document.querySelector(`[data-unlogged-session="${RUN.id}"]`)!,
    );
    expect(run.getByText("Mon 9 Nov")).toBeTruthy();
    expect(run.getByText("Running · 45 min planned")).toBeTruthy();
    expect(run.getByRole("link", { name: "Log it" }).getAttribute("href")).toBe(
      `/home/log?plannedSession=${RUN.id}&date=2026-11-09`,
    );
    expect(
      run.getByRole("button", { name: "Didn't do it" }),
    ).toHaveAccessibleDescription("Saves a Skipped log for this session");
    expect(screen.queryByText(/missed|failed/i)).toBeNull();
  });

  it("keeps a skipped row as its receipt after the server stops listing it", async () => {
    skipMock.mockResolvedValue({
      status: "saved",
      message: "Logged as skipped.",
      submission: 1,
      completionId: COMPLETION_ID,
    });
    const { rerender } = render(<UnloggedReminder sessions={[RUN, GYM]} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Didn't do it" })[0]);
    const receipt = await screen.findByRole("status");
    // The refresh after the action: the server no longer lists the run.
    rerender(<UnloggedReminder sessions={[GYM]} />);

    expect(skipMock.mock.calls[0][1].get("plannedSessionId")).toBe(RUN.id);
    expect(skipMock.mock.calls[0][1].get("plannedDate")).toBe("2026-11-09");
    expect(within(receipt).getByText("Skipped")).toBeTruthy();
    expect(
      within(receipt)
        .getByRole("link", { name: "Open log" })
        .getAttribute("href"),
    ).toBe(`/home/progress/${COMPLETION_ID}`);
    expect(screen.getByText("Easy run")).toBeTruthy();
    expect(
      screen.getByText("1 planned session from a past day has no log."),
    ).toBeTruthy();
  });

  it("says why a skip was refused and keeps both answers", async () => {
    skipMock.mockResolvedValue({
      status: "error",
      message: "That session already has a log. Reload Today to see it.",
      submission: 1,
    });
    render(<UnloggedReminder sessions={[RUN]} />);

    fireEvent.click(screen.getByRole("button", { name: "Didn't do it" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "That session already has a log. Reload Today to see it.",
    );
    expect(screen.getByRole("link", { name: "Log it" })).toBeTruthy();
  });
});
