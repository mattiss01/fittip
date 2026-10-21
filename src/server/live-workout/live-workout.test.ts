import { describe, expect, it } from "vitest";

import {
  LiveWorkoutValidationError,
  parseLiveWorkoutName,
  parseLiveWorkoutState,
} from "./live-workout";

import { liveActivityFrom } from "@/lib/training/live-workout";

const activity = (overrides: Record<string, unknown> = {}) => ({
  ...liveActivityFrom({
    key: "a1",
    plannedPosition: 0,
    personalActivityId: null,
    name: "Bench press",
    sport: "Strength",
    measurementMode: "sets_reps_load",
    target: { groups: [{ sets: 2, reps: 8, load: 60 }], load_unit: "kg" },
  }),
  ...overrides,
});

describe("parseLiveWorkoutState", () => {
  it("keeps a state the live screen writes", () => {
    const state = { activities: [activity()] };
    expect(parseLiveWorkoutState(JSON.parse(JSON.stringify(state)))).toEqual(
      state,
    );
  });

  it.each([
    ["an unknown key", { activities: [activity({ extra: 1 })] }],
    ["a key on the state", { activities: [], owner: "x" }],
    [
      "a planned activity answered twice",
      { activities: [activity(), activity({ key: "a2" })] },
    ],
    [
      "two rows with one key",
      {
        activities: [activity(), activity({ plannedPosition: null })],
      },
    ],
    [
      "sets on an activity not measured in sets",
      { activities: [activity({ mode: "time_distance_pace" })] },
    ],
    [
      "more sets than a row holds",
      {
        activities: [
          activity({
            sets: Array.from({ length: 31 }, () => ({
              reps: "1",
              load: "",
              done: false,
            })),
          }),
        ],
      },
    ],
    [
      "a field no mode binds",
      { activities: [activity({ fields: { owner: "x" } })] },
    ],
    [
      "a target that is not one",
      { activities: [activity({ target: { groups: "lots" } })] },
    ],
    [
      "a library link that is not an id",
      {
        activities: [activity({ personalActivityId: "lat-pulldown" })],
      },
    ],
    [
      "more activities than a log holds",
      {
        activities: Array.from({ length: 51 }, (_, index) =>
          activity({ key: `a${index}`, plannedPosition: null }),
        ),
      },
    ],
  ])("refuses %s", (_, state) => {
    expect(() => parseLiveWorkoutState(state)).toThrow(
      LiveWorkoutValidationError,
    );
  });
});

describe("parseLiveWorkoutName", () => {
  it("trims a name and a sport", () => {
    expect(parseLiveWorkoutName("  Gym ", " Strength ")).toEqual({
      title: "Gym",
      sport: "Strength",
    });
  });

  it("refuses an empty name or sport", () => {
    expect(() => parseLiveWorkoutName(" ", "Strength")).toThrow(
      LiveWorkoutValidationError,
    );
    expect(() => parseLiveWorkoutName("Gym", "")).toThrow(
      LiveWorkoutValidationError,
    );
  });
});
