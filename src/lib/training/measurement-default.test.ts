import { describe, expect, it } from "vitest";

import { latestModeBySport, startingMode } from "./measurement-default";

describe("latestModeBySport", () => {
  it("keeps the newest mode per sport, ignoring case and space", () => {
    expect(
      latestModeBySport([
        { sport: "Running ", measurementMode: "time_distance_pace" },
        { sport: "running", measurementMode: "duration_intensity" },
        { sport: "Strength", measurementMode: "sets_reps_load" },
      ]),
    ).toEqual({
      running: "time_distance_pace",
      strength: "sets_reps_load",
    });
  });

  it("passes over activities that were not measured", () => {
    expect(
      latestModeBySport([
        { sport: "Running", measurementMode: "unmeasured" },
        { sport: "Running", measurementMode: "time_distance_pace" },
        { sport: "Tennis", measurementMode: "unmeasured" },
      ]),
    ).toEqual({ running: "time_distance_pace" });
  });
});

describe("startingMode", () => {
  const history = { running: "time_distance_pace" } as const;

  it("takes how the sport was last measured over the row above", () => {
    expect(startingMode(" RUNNING", history, "sets_reps_load")).toBe(
      "time_distance_pace",
    );
  });

  it("falls back to the row above, then to not measured", () => {
    expect(startingMode("Rowing", history, "duration_intensity")).toBe(
      "duration_intensity",
    );
    expect(startingMode("", history, null)).toBe("unmeasured");
  });
});
