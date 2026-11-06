import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  addSportAction: vi.fn(),
  deleteSportAction: vi.fn(),
  renameSportAction: vi.fn(),
  setSportColourAction: vi.fn(),
}));

vi.mock("@/app/home/you/sport-actions", () => actions);

import { SportList } from "./sport-list";

const SPORTS = [
  { id: "running", name: "Running", colour: "sport-1" as const },
  { id: "cycling", name: "Cycling", colour: "sport-2" as const },
];

const list = () => screen.getByRole("list", { name: "Your sports" });

describe("SportList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const action of Object.values(actions)) {
      action.mockResolvedValue({ status: "saved" });
    }
  });
  afterEach(cleanup);

  it("lists only the owner's own sports, each with its colour", () => {
    render(<SportList sports={SPORTS} />);
    expect(
      screen.getByRole("button", { name: "Colour of Running: Pine" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Rename Cycling" }),
    ).toBeVisible();
    expect(list().querySelectorAll("li")).toHaveLength(2);
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("gives a sport another swatch at once and saves it", async () => {
    render(<SportList sports={SPORTS} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Colour of Running: Pine" }),
    );
    expect(screen.getByRole("button", { name: "Pine" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "Sky" }));

    expect(
      await screen.findByRole("button", { name: "Colour of Running: Sky" }),
    ).toBeVisible();
    expect(actions.setSportColourAction).toHaveBeenCalledWith(
      "running",
      "sport-10",
    );
  });

  it("asks before a rename merges two sports, and merges only on yes", async () => {
    render(<SportList sports={SPORTS} />);
    fireEvent.click(screen.getByRole("button", { name: "Rename Running" }));
    const field = screen.getByLabelText("New name for Running");
    fireEvent.change(field, { target: { value: " cycling " } });
    fireEvent.submit(field.closest("form")!);

    expect(screen.getByText(/You already have Cycling\./)).toBeVisible();
    expect(actions.renameSportAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Merge" }));
    await waitFor(() =>
      expect(actions.renameSportAction).toHaveBeenCalledWith(
        "running",
        "cycling",
        true,
      ),
    );
  });

  it("renames without merging when the name is free", async () => {
    render(<SportList sports={SPORTS} />);
    fireEvent.click(screen.getByRole("button", { name: "Rename Running" }));
    const field = screen.getByLabelText("New name for Running");
    fireEvent.change(field, { target: { value: "Trail  running" } });
    fireEvent.submit(field.closest("form")!);

    expect(
      await screen.findByRole("button", { name: "Rename Trail running" }),
    ).toBeVisible();
    expect(actions.renameSportAction).toHaveBeenCalledWith(
      "running",
      "Trail running",
      false,
    );
  });

  it("removes a sport only after asking, and says what stays", async () => {
    render(<SportList sports={SPORTS} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Running" }));
    expect(
      screen.getByText(/Its sessions and logs keep it, shown in grey\./),
    ).toBeVisible();
    expect(actions.deleteSportAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Rename Running" }),
      ).toBeNull(),
    );
    expect(actions.deleteSportAction).toHaveBeenCalledWith("running");
  });

  it("refuses a sport the owner already has without asking the server", () => {
    render(<SportList sports={SPORTS} />);
    const field = screen.getByLabelText("Add a sport");
    fireEvent.change(field, { target: { value: "RUNNING" } });
    fireEvent.submit(field.closest("form")!);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "You already have Running.",
    );
    expect(actions.addSportAction).not.toHaveBeenCalled();
  });

  it("falls back to what is saved and says why when the server refuses", async () => {
    actions.setSportColourAction.mockResolvedValue({
      status: "refused",
      message: "That sport is no longer on your list.",
    });
    render(<SportList sports={SPORTS} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Colour of Running: Pine" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Sky" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That sport is no longer on your list.",
    );
    expect(
      screen.getByRole("button", { name: "Colour of Running: Pine" }),
    ).toBeVisible();
  });
});
