import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CoachWait } from "./coach-wait";

let frames: FrameRequestCallback[] = [];
let reduced = false;

beforeEach(() => {
  frames = [];
  reduced = false;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.spyOn(performance, "now").mockReturnValue(0);
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduced && query.includes("reduce"),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Runs the newest frame as if `seconds` had passed since the wait began. */
function runFrameAt(seconds: number) {
  act(() => frames[frames.length - 1](seconds * 1000));
}

describe("CoachWait", () => {
  it("shows the time waited and a caption, and the minute note after 30 s", () => {
    render(<CoachWait kind="plan" />);
    runFrameAt(0);
    expect(screen.getByText("0:00")).toBeTruthy();
    expect(
      screen.getByText("Thinking about what's best for your goals."),
    ).toBeTruthy();
    expect(screen.queryByText("This can take up to a minute.")).toBeNull();

    runFrameAt(31);
    expect(screen.getByText("0:31")).toBeTruthy();
    expect(screen.getByText("This can take up to a minute.")).toBeTruthy();
    // Nothing claims how far the coach has got.
    expect(document.querySelector("progress, [role='progressbar']")).toBeNull();
    expect(document.body.textContent).not.toMatch(/%/);
  });

  it("is the only thing on screen, and gives the page back when it goes", () => {
    const { container, unmount } = render(<CoachWait kind="plan" />);
    const layer = screen.getByRole("dialog", { name: "Asking the coach" });
    // Over everything, not inside the form that asked.
    expect(layer.parentElement).toBe(document.body);
    expect(container.contains(layer)).toBe(false);
    expect(container.hasAttribute("inert")).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.activeElement).toBe(layer);

    unmount();
    expect(container.hasAttribute("inert")).toBe(false);
    expect(document.body.style.overflow).toBe("");
  });

  it("draws the athlete, and stops its loop when it goes", () => {
    const { unmount } = render(<CoachWait kind="plan" />);
    runFrameAt(1);
    expect(
      document.querySelector("[data-coach-wait] svg")?.childElementCount,
    ).toBeGreaterThan(0);
    unmount();
    expect(cancelAnimationFrame).toHaveBeenCalled();
  });

  it("under reduced motion stands still, with no jump or turn", () => {
    reduced = true;
    render(<CoachWait kind="plan" />);
    runFrameAt(3.5);
    const svg = document.querySelector("[data-coach-wait] svg")!;
    expect(svg.closest("[data-reduced]")).not.toBeNull();
    expect(svg.querySelector("g[transform]")).toBeNull();
  });
});
