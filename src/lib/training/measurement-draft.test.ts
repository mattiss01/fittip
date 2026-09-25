import { describe, expect, it } from "vitest";

import {
  buildMeasurement,
  draftFromMeasurement,
  emptyDraft,
  type MeasurementDraft,
} from "@/lib/training/measurement-draft";
import { TRAINING_MEASUREMENT_MODES } from "@/lib/training/measurement";
import { parseTrainingMeasurement } from "@/server/training/training-measurements";

function build(
  mode: Parameters<typeof buildMeasurement>[0],
  fields: MeasurementDraft,
) {
  return buildMeasurement(mode, { ...emptyDraft(mode), ...fields });
}

describe("an untouched row", () => {
  it("is no target rather than an error, in every mode", () => {
    for (const mode of TRAINING_MEASUREMENT_MODES) {
      expect(buildMeasurement(mode, emptyDraft(mode))).toEqual({
        ok: true,
        measurement: null,
      });
    }
  });

  it("stays no target when only a defaulted unit is present", () => {
    // `emptyDraft` puts kg and km in the selects. A default nobody acted on
    // must not become a measurement of nothing.
    expect(build("sets_reps_load", {}).ok).toBe(true);
    expect(build("time_distance_pace", {})).toEqual({
      ok: true,
      measurement: null,
    });
  });
});

describe("what the server would refuse, said in words first", () => {
  it("names the missing half of sets and reps", () => {
    expect(build("sets_reps_load", { sets: "4" })).toEqual({
      ok: false,
      message: "Sets and reps are both needed.",
    });
  });

  it("refuses minutes with no intensity", () => {
    // The owner dropped the effort field on 25 Sep 2026, so intensity is the
    // one thing that makes a duration into a prescription.
    expect(build("duration_intensity", { duration_minutes: "40" })).toEqual({
      ok: false,
      message: "Choose an intensity, not minutes alone.",
    });
  });

  it("refuses a count with nothing named", () => {
    expect(build("skill_repetitions", { repetitions: "20" }).ok).toBe(false);
  });
});

describe("clock readings", () => {
  it("reads mm:ss and h:mm:ss", () => {
    expect(build("time_distance_pace", { duration: "7:30" })).toEqual({
      ok: true,
      measurement: { duration_seconds: 450 },
    });
    expect(build("time_distance_pace", { duration: "1:05:00" })).toEqual({
      ok: true,
      measurement: { duration_seconds: 3900 },
    });
  });

  it("refuses a single digit after a colon rather than guessing", () => {
    // 7:5 is ambiguous between 7:05 and 7:50, and picking one silently
    // changes what the owner wrote.
    expect(build("time_distance_pace", { duration: "7:5" }).ok).toBe(false);
  });

  it("refuses more than 59 in a minutes or seconds place", () => {
    expect(build("time_distance_pace", { duration: "7:61" }).ok).toBe(false);
  });

  it("works pace out from time and distance", () => {
    expect(
      build("time_distance_pace", {
        duration: "20:00",
        distance: "5",
        distance_unit: "km",
      }),
    ).toEqual({
      ok: true,
      measurement: {
        duration_seconds: 1200,
        distance: 5,
        distance_unit: "km",
        pace_seconds_per_unit: 240,
        pace_unit: "sec/km",
      },
    });
  });

  it("paces per hundred for metres, which is how swimming reads", () => {
    const built = build("time_distance_pace", {
      duration: "30:00",
      distance: "1500",
      distance_unit: "m",
    });
    if (!built.ok || built.measurement === null) throw new Error("unreachable");
    expect(built.measurement).toMatchObject({
      pace_seconds_per_unit: 120,
      pace_unit: "sec/100m",
    });
  });

  it("keeps a typed pace when there is no distance to work it out from", () => {
    expect(build("time_distance_pace", { pace: "4:45" })).toEqual({
      ok: true,
      measurement: { pace_seconds_per_unit: 285, pace_unit: "sec/km" },
    });
  });

  it("survives a round trip through the draft", () => {
    const built = build("time_distance_pace", { pace: "4:45" });
    expect(built.ok).toBe(true);
    if (!built.ok || built.measurement === null) throw new Error("unreachable");
    const back = draftFromMeasurement("time_distance_pace", built.measurement);
    expect(back.pace).toBe("4:45");
  });
});

describe("the editor and the server agree", () => {
  // The claim `measurement-draft.ts` makes about itself: anything it calls
  // buildable, `parseTrainingMeasurement` accepts. Where these skew, the owner
  // gets a generic "invalid measurement" from a form that said it was fine.
  const cases: [Parameters<typeof buildMeasurement>[0], MeasurementDraft][] = [
    ["sets_reps_load", { sets: "4", reps: "8" }],
    ["sets_reps_load", { sets: "5", reps: "5", load: "82.5", load_unit: "kg" }],
    ["sets_reps_load", { sets: "3", reps: "10", load: "135", load_unit: "lb" }],
    ["time_distance_pace", { duration: "45:00" }],
    ["time_distance_pace", { distance: "10", distance_unit: "km" }],
    ["time_distance_pace", { pace: "4:45", pace_unit: "sec/km" }],
    [
      "time_distance_pace",
      {
        duration: "1:30:00",
        distance: "21.1",
        distance_unit: "km",
        pace: "4:16",
        pace_unit: "sec/km",
      },
    ],
    ["time_distance_pace", { distance: "400", distance_unit: "m" }],
    ["duration_intensity", { duration_minutes: "40", intensity: "easy" }],
    ["duration_intensity", { duration_minutes: "60", intensity: "very_hard" }],
    ["skill_repetitions", { repetitions: "20", unit: "throws" }],
    ["custom", { label: "Grip", value: "closed", unit: "hold" }],
    ["custom", { label: "Depth", value: "12", unit: "m" }],
  ];

  for (const [mode, fields] of cases) {
    it(`${mode}: ${JSON.stringify(fields)}`, () => {
      const built = build(mode, fields);
      expect(built.ok).toBe(true);
      if (!built.ok || built.measurement === null) {
        throw new Error("expected a measurement");
      }
      expect(() =>
        parseTrainingMeasurement(mode, built.measurement),
      ).not.toThrow();
    });
  }

  it("builds a custom numeric value as a number, which the server keeps", () => {
    const built = build("custom", { label: "Depth", value: "12", unit: "m" });
    if (!built.ok) throw new Error("expected a measurement");
    expect(built.measurement).toEqual({ label: "Depth", value: 12, unit: "m" });
  });
});
