import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  MeasurementMode,
  MeasurementTarget,
  PlanActivityDraft,
} from "@/features/planning/planning-types";

import { SessionComposer } from "./session-composer";

describe("SessionComposer", () => {
  afterEach(cleanup);

  it("keeps running, football, mobility, strength, and custom targets sport-neutral", () => {
    const onSave = vi.fn();
    const activities = [
      activity("run", "Running", "time_distance_pace", {
        duration_seconds: 1800,
        distance: 5,
        distance_unit: "km",
      }),
      activity("touches", "Football", "skill_repetitions", {
        repetitions: 60,
        unit: "touches",
      }),
      activity("flow", "Mobility", "duration_intensity", {
        duration_minutes: 20,
        intensity: "easy",
      }),
      activity("squat", "Strength", "sets_reps_load", {
        sets: 3,
        reps: 8,
        load: 50,
        load_unit: "kg",
      }),
      activity("breathing", "Recovery", "custom", {
        label: "Pattern",
        value: "4-6",
        unit: "seconds",
      }),
    ];
    render(
      <SessionComposer
        dates={["2026-07-28"]}
        initialSession={{
          clientId: "session",
          localDate: "2026-07-28",
          title: "Mixed training",
          sport: "Multi-sport",
          intent: "",
          note: "",
          isLocked: false,
          activities,
        }}
        onCancel={vi.fn()}
        onSave={onSave}
        personalActivities={[]}
      />,
    );

    expect(screen.getAllByLabelText("Measurement")).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: "Keep in draft" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        activities: activities.map((candidate) =>
          expect.objectContaining({
            name: candidate.name,
            sport: candidate.sport,
            measurementMode: candidate.measurementMode,
          }),
        ),
      }),
    );
  });

  it("keeps an incomplete measurement in the draft instead of attempting persistence", () => {
    const onSave = vi.fn();
    render(
      <SessionComposer
        dates={["2026-07-28"]}
        initialSession={{
          clientId: "session",
          localDate: "2026-07-28",
          title: "Skill work",
          sport: "Football",
          intent: "",
          note: "",
          isLocked: false,
          activities: [
            activity("touches", "Football", "skill_repetitions", {
              repetitions: 10,
              unit: "",
            }),
          ],
        }}
        onCancel={vi.fn()}
        onSave={onSave}
        personalActivities={[]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Keep in draft" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      /Complete each activity target/i,
    );
    expect(onSave).not.toHaveBeenCalled();
  });
});

function activity(
  name: string,
  sport: string,
  measurementMode: MeasurementMode,
  target: MeasurementTarget,
): PlanActivityDraft {
  return {
    clientId: name,
    name,
    sport,
    instructions: "",
    measurementMode,
    target,
    isLocked: false,
  };
}
