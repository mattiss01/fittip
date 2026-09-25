import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  ActualActivities,
  type LogPlannedActivityView,
} from "./actual-activities";

const SQUAT: LogPlannedActivityView = {
  position: 0,
  personalActivityId: null,
  name: "Back squat",
  sport: "Strength",
  measurementMode: "sets_reps_load",
  target: { groups: [{ sets: 5, reps: 5, load: 82.5 }], load_unit: "kg" },
};

const SERVES: LogPlannedActivityView = {
  position: 1,
  personalActivityId: null,
  name: "Serve practice",
  sport: "Tennis",
  measurementMode: "unmeasured",
  target: null,
};

afterEach(cleanup);

function submitted(): Record<string, unknown>[] {
  const field = document.querySelector<HTMLInputElement>(
    "input[name='activities']",
  );
  return JSON.parse(field!.value) as Record<string, unknown>[];
}

function row(name: string) {
  return screen.getByText(name, { selector: "p" }).closest("li") as HTMLElement;
}

describe("ActualActivities", () => {
  it("records every planned activity as planned until told otherwise", () => {
    render(
      <ActualActivities activities={[SQUAT, SERVES]} sessionSport="Strength" />,
    );

    expect(submitted()).toEqual([
      {
        position: 0,
        name: "Back squat",
        sport: "Strength",
        measurementMode: "sets_reps_load",
        actualMeasurement: SQUAT.target,
      },
      // An unmeasured activity with nothing typed is still something done.
      {
        position: 1,
        name: "Serve practice",
        sport: "Tennis",
        measurementMode: "unmeasured",
        actualMeasurement: null,
      },
    ]);
    expect(within(row("Back squat")).getByText(/^Planned:/).textContent).toBe(
      "Planned: 5 × 5 · 82.5 kg",
    );
  });

  it("leaves out only what is marked as not done", () => {
    render(
      <ActualActivities activities={[SQUAT, SERVES]} sessionSport="Strength" />,
    );

    fireEvent.click(within(row("Back squat")).getByLabelText("Didn't do this"));

    expect(submitted()).toEqual([
      expect.objectContaining({ position: 0, name: "Serve practice" }),
    ]);
  });

  it("records an actual in its own mode without touching the planned one", () => {
    render(<ActualActivities activities={[SERVES]} sessionSport="Tennis" />);
    const serves = row("Serve practice");

    fireEvent.click(within(serves).getByRole("button", { name: "Adjust" }));
    fireEvent.change(within(serves).getByLabelText("Measured as"), {
      target: { value: "duration_intensity" },
    });
    fireEvent.change(within(serves).getByLabelText("Minutes"), {
      target: { value: "20" },
    });

    expect(submitted()).toEqual([
      expect.objectContaining({
        name: "Serve practice",
        measurementMode: "duration_intensity",
        actualMeasurement: { duration_minutes: 20 },
      }),
    ]);
    expect(within(serves).getByText(/^Planned:/).textContent).toBe(
      "Planned: no target",
    );
  });

  it("adds what the plan did not name, in the session's sport", () => {
    render(<ActualActivities activities={[SQUAT]} sessionSport="Strength" />);

    fireEvent.click(screen.getByRole("button", { name: "Add activity" }));
    fireEvent.change(screen.getByLabelText("Activity name"), {
      target: { value: "Farmer carry" },
    });

    expect(submitted()).toEqual([
      expect.objectContaining({ position: 0, name: "Back squat" }),
      expect.objectContaining({
        position: 1,
        name: "Farmer carry",
        sport: "Strength",
        measurementMode: "unmeasured",
      }),
    ]);
    expect(
      within(row("Farmer carry")).getByText("Not on the plan"),
    ).toBeTruthy();
  });

  it("sends nothing while inactive, and keeps every change for when it is not", () => {
    const view = (inactive: boolean) => (
      <form>
        <ActualActivities
          activities={[SQUAT, SERVES]}
          sessionSport="Strength"
          inactive={inactive}
        />
      </form>
    );
    const { rerender } = render(view(false));
    fireEvent.click(within(row("Back squat")).getByLabelText("Didn't do this"));
    const entries = () => new FormData(document.querySelector("form")!);

    rerender(view(true));
    // Inside a disabled fieldset the field is not submitted, so the action
    // reads no list at all.
    expect(entries().get("activities")).toBeNull();

    rerender(view(false));
    expect(submitted()).toEqual([
      expect.objectContaining({ name: "Serve practice" }),
    ]);
    expect(entries().get("activities")).not.toBeNull();
  });

  it("records the order the activities were done in", () => {
    render(
      <ActualActivities activities={[SQUAT, SERVES]} sessionSport="Strength" />,
    );

    fireEvent.keyDown(
      screen.getByRole("button", { name: /Serve practice, 2 of 2/ }),
      { key: "ArrowUp" },
    );

    expect(submitted().map(({ position, name }) => [position, name])).toEqual([
      [0, "Serve practice"],
      [1, "Back squat"],
    ]);
  });
});
