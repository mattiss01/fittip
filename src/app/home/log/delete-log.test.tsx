import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({ deleteLogAction: vi.fn() }));

import { DeleteLog } from "./delete-log";

const BASE = {
  completionId: "7e15b000-0000-4000-8000-000000000031",
  revision: 2,
  name: "Hill ride",
  day: "Fri 16 Oct",
  returnDate: "2026-10-16",
};

function open(props: Partial<Parameters<typeof DeleteLog>[0]> = {}) {
  render(<DeleteLog {...BASE} planned={null} replaces={[]} {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Delete log" }));
  return screen.getByRole("alertdialog", { name: "Delete this log?" });
}

describe("DeleteLog (ADR-031)", () => {
  afterEach(cleanup);

  it("deletes nothing until asked, and opens on Keep it", () => {
    const dialog = open();

    expect(dialog.textContent).toContain(
      "This deletes the log of Hill ride on Fri 16 Oct. It cannot be undone.",
    );
    expect(document.activeElement).toBe(
      within(dialog).getByRole("button", { name: "Keep it" }),
    );

    fireEvent.click(within(dialog).getByRole("button", { name: "Keep it" }));
    expect(screen.queryByRole("alertdialog")).toBe(null);
  });

  it("says a planned session is freed", () => {
    expect(open({ planned: "Tempo run" }).textContent).toContain(
      "The planned session Tempo run is no longer logged",
    );
  });

  it("names every Replaced log that goes with it", () => {
    const dialog = open({ replaces: ["Tempo run", "Easy run"] });

    expect(
      within(dialog).getByText(/It also deletes the Replaced logs/).textContent,
    ).toBe(
      "It also deletes the Replaced logs of Tempo run and Easy run, which point to it. That frees those sessions too.",
    );
  });

  it("sends the log and the revision read, nothing else", () => {
    const dialog = open();
    const form = dialog.querySelector("form")!;

    expect(Object.fromEntries(new FormData(form))).toEqual({
      completionId: BASE.completionId,
      expectedRevision: "2",
      returnDate: BASE.returnDate,
    });
  });
});
