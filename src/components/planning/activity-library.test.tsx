import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ActivityLibrary } from "./activity-library";

describe("ActivityLibrary", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("creates a personal definition without offering a global catalog", async () => {
    const onCreate = vi.fn().mockResolvedValue({
      status: "saved",
      activity: {
        id: "20000000-0000-4000-8000-000000000001",
        name: "Hip flow",
        sport: "Mobility",
        description: null,
        measurementMode: "duration_intensity",
      },
    });
    render(
      <ActivityLibrary
        activities={[]}
        onArchive={vi.fn()}
        onCreate={onCreate}
        onUpdate={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("My activities").closest("summary")!);
    expect(screen.getByText(/not a global exercise catalog/i)).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "+ Create personal activity" }),
    );
    fireEvent.change(screen.getByLabelText("Activity name"), {
      target: { value: "Hip flow" },
    });
    fireEvent.change(screen.getByLabelText("Sport or domain"), {
      target: { value: "Mobility" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save activity" }));

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith({
        name: "Hip flow",
        sport: "Mobility",
        measurementMode: "duration_intensity",
      }),
    );
    expect(await screen.findByText("Personal activity created.")).toBeVisible();
  });

  it("edits future reuse and archives with explicit historical copy", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const activity = {
      id: "20000000-0000-4000-8000-000000000001",
      name: "Easy run",
      sport: "Running",
      description: null,
      measurementMode: "time_distance_pace" as const,
    };
    const onUpdate = vi.fn().mockResolvedValue({
      status: "saved",
      activity: { ...activity, name: "Steady run" },
    });
    const onArchive = vi
      .fn()
      .mockResolvedValue({ status: "archived", id: activity.id });
    render(
      <ActivityLibrary
        activities={[activity]}
        onArchive={onArchive}
        onCreate={vi.fn()}
        onUpdate={onUpdate}
      />,
    );

    fireEvent.click(screen.getByText("My activities").closest("summary")!);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Activity name"), {
      target: { value: "Steady run" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save activity" }));
    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith(
        activity.id,
        expect.objectContaining({ name: "Steady run" }),
      ),
    );
    expect(await screen.findByText(/Saved plans are unchanged/i)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    await waitFor(() => expect(onArchive).toHaveBeenCalledWith(activity.id));
    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringMatching(/saved plans remain unchanged/i),
    );
  });
});
