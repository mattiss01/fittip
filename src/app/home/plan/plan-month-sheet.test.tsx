import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MonthSheet } from "./plan-month-sheet";

// Friday 2 October 2026; its week began on Monday 28 September.
const TODAY = "2026-10-02";
const FIRST = "2026-09-28";
const LAST = "2027-04-04";

function renderSheet(
  extra: Partial<Parameters<typeof MonthSheet>[0]> = {},
  onPick = vi.fn(),
) {
  render(
    <MonthSheet
      today={TODAY}
      firstDate={FIRST}
      lastDate={LAST}
      shownWeekStart={FIRST}
      sessionCounts={
        new Map([
          ["2026-10-02", 2],
          ["2026-10-14", 1],
        ])
      }
      onPick={onPick}
      onClose={vi.fn()}
      {...extra}
    />,
  );
  return onPick;
}

function pick(date: string) {
  return document.querySelector(`[data-month-date="${date}"]`);
}

describe("MonthSheet", () => {
  afterEach(cleanup);

  it("opens the week holding today on today's month, not on the month the week began in", () => {
    renderSheet();

    expect(screen.getByRole("heading", { name: "October 2026" })).toBeVisible();
    // October 2026 begins on a Thursday: three blanks, then the 1st.
    const grid = document.querySelector("[data-plan-month]")!;
    expect(grid.getAttribute("data-plan-month")).toBe("2026-10");
    const cells = Array.from(grid.children).slice(7);
    expect(cells.slice(0, 3).every((cell) => cell.textContent === "")).toBe(
      true,
    );
    expect(cells[3].textContent).toBe("1");
  });

  it("opens any other week on the month most of it is in", () => {
    // Monday 30 November to Sunday 6 December: five of its days are December.
    renderSheet({ shownWeekStart: "2026-11-30" });
    expect(
      screen.getByRole("heading", { name: "December 2026" }),
    ).toBeVisible();
  });

  it("says for each day whether it holds a session, and which is today", () => {
    renderSheet();

    expect(pick("2026-10-02")).toHaveAccessibleName(
      "Fri 2 Oct, today, 2 sessions",
    );
    expect(pick("2026-10-14")).toHaveAccessibleName("Wed 14 Oct, 1 session");
    expect(pick("2026-10-15")).toHaveAccessibleName("Thu 15 Oct, no sessions");
    // The week the Plan is showing is marked, where it falls in this month.
    expect(document.querySelectorAll("[data-shown-week]")).toHaveLength(4);
  });

  it("hands back the day that was chosen and nothing else", () => {
    const onPick = renderSheet();

    fireEvent.click(pick("2026-10-14")!);

    expect(onPick).toHaveBeenCalledExactlyOnceWith("2026-10-14");
  });

  it("steps between the months the Plan has weeks for, and no further", () => {
    renderSheet();

    // The first week reaches back into September, so September is a month.
    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    expect(
      screen.getByRole("heading", { name: "September 2026" }),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Previous month" })).toBeNull();
    // A day the Plan has no week for is a number, not something to tap.
    expect(pick("2026-09-27")).toBeNull();
    expect(pick("2026-09-28")).not.toBeNull();

    for (let step = 0; step < 7; step += 1) {
      fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    }
    expect(screen.getByRole("heading", { name: "April 2027" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Next month" })).toBeNull();
    expect(pick("2027-04-04")).not.toBeNull();
    expect(pick("2027-04-05")).toBeNull();
  });
});
