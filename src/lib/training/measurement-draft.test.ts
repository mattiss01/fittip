import { describe, expect, it } from "vitest";

import { TRAINING_MEASUREMENT_MODES } from "@/lib/training/measurement";
import {
  buildMeasurement,
  draftFromMeasurement,
  emptyDraft,
  type SetGroupDraft,
} from "@/lib/training/measurement-draft";
import { parseTrainingMeasurement } from "@/server/training/training-measurements";

type Mode = Parameters<typeof buildMeasurement>[0];

/** A draft as the editor would hold it, with only the named fields touched. */
function build(
  mode: Mode,
  fields: Record<string, string> = {},
  groups?: Partial<SetGroupDraft>[],
) {
  const draft = emptyDraft(mode);
  return buildMeasurement(mode, {
    fields: { ...draft.fields, ...fields },
    groups:
      groups === undefined
        ? draft.groups
        : groups.map((group) => ({ sets: "", reps: "", load: "", ...group })),
  });
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
    expect(build("sets_reps_load")).toEqual({ ok: true, measurement: null });
    expect(build("time_distance_pace")).toEqual({
      ok: true,
      measurement: null,
    });
  });
});

describe("an activity with nothing to count", () => {
  it("has no target whatever was left lying in the draft", () => {
    // The owner can pick a mode, type into it, and change their mind. What the
    // unmeasured mode means is "no target", not "whatever you typed first".
    expect(
      buildMeasurement("unmeasured", {
        fields: { duration_minutes: "40" },
        groups: [{ sets: "5", reps: "5", load: "80" }],
      }),
    ).toEqual({ ok: true, measurement: null });
  });

  it("is refused by the server if a target is somehow attached", () => {
    expect(() => parseTrainingMeasurement("unmeasured", {})).toThrow();
    expect(() =>
      parseTrainingMeasurement("unmeasured", { sets: 5, reps: 5 }),
    ).toThrow();
  });
});

describe("set groups", () => {
  it("makes the uniform case the one-group case", () => {
    expect(
      build("sets_reps_load", { load_unit: "kg" }, [
        { sets: "5", reps: "5", load: "82.5" },
      ]),
    ).toEqual({
      ok: true,
      measurement: {
        groups: [{ sets: 5, reps: 5, load: 82.5 }],
        load_unit: "kg",
      },
    });
  });

  it("holds a squat that ramps as one measurement", () => {
    expect(
      build("sets_reps_load", { load_unit: "kg" }, [
        { sets: "3", reps: "5", load: "60" },
        { sets: "1", reps: "3", load: "100" },
      ]),
    ).toEqual({
      ok: true,
      measurement: {
        groups: [
          { sets: 3, reps: 5, load: 60 },
          { sets: 1, reps: 3, load: 100 },
        ],
        load_unit: "kg",
      },
    });
  });

  it("takes sets with no reps, which the flat shape could not say", () => {
    expect(build("sets_reps_load", {}, [{ sets: "3" }])).toEqual({
      ok: true,
      measurement: { groups: [{ sets: 3 }] },
    });
  });

  it("leaves the unit off when no group carries a load", () => {
    const built = build("sets_reps_load", { load_unit: "kg" }, [
      { sets: "3", reps: "8" },
    ]);
    if (!built.ok || built.measurement === null) throw new Error("unreachable");
    expect(built.measurement).not.toHaveProperty("load_unit");
  });

  it("drops a blank row rather than refusing it", () => {
    // The editor always shows one row, so "no target" and "one blank row" are
    // the same intention.
    expect(build("sets_reps_load", {}, [{ sets: "3", reps: "5" }, {}])).toEqual(
      {
        ok: true,
        measurement: { groups: [{ sets: 3, reps: 5 }] },
      },
    );
  });

  it("names the field that is not a number", () => {
    expect(build("sets_reps_load", {}, [{ sets: "many" }])).toEqual({
      ok: false,
      message: "Sets is a whole number from 1 to 100.",
    });
  });
});

describe("what the server would refuse, said in words first", () => {
  it("refuses minutes that are not a number", () => {
    expect(build("duration_intensity", { duration_minutes: "ages" })).toEqual({
      ok: false,
      message: "Minutes are needed for this mode.",
    });
  });

  it("takes minutes with no intensity", () => {
    // The owner asked on 25 Sep 2026 that intensity not be mandatory.
    expect(build("duration_intensity", { duration_minutes: "40" })).toEqual({
      ok: true,
      measurement: { duration_minutes: 40 },
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
});

describe("pace is arithmetic", () => {
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
});

describe("round trips", () => {
  it("brings a clock reading back as it was typed", () => {
    const built = build("time_distance_pace", { pace: "4:45" });
    if (!built.ok || built.measurement === null) throw new Error("unreachable");
    expect(
      draftFromMeasurement("time_distance_pace", built.measurement).fields.pace,
    ).toBe("4:45");
  });

  it("brings set groups back as rows", () => {
    const built = build("sets_reps_load", { load_unit: "kg" }, [
      { sets: "3", reps: "5", load: "60" },
      { sets: "1", reps: "3", load: "100" },
    ]);
    if (!built.ok || built.measurement === null) throw new Error("unreachable");
    expect(
      draftFromMeasurement("sets_reps_load", built.measurement).groups,
    ).toEqual([
      { sets: "3", reps: "5", load: "60" },
      { sets: "1", reps: "3", load: "100" },
    ]);
  });

  it("brings the flat shape back as a single row", () => {
    // Nothing writes the flat shape any more, but a measurement sealed into
    // history can still be read into a form.
    expect(
      draftFromMeasurement("sets_reps_load", {
        sets: 5,
        reps: 5,
        load: 82.5,
        load_unit: "kg",
      }).groups,
    ).toEqual([{ sets: "5", reps: "5", load: "82.5" }]);
  });
});

describe("the editor and the server agree", () => {
  // The claim `measurement-draft.ts` makes about itself: anything it calls
  // buildable, `parseTrainingMeasurement` accepts — and that function mirrors
  // `is_valid_training_measurement`, which is the authority. Where these skew,
  // the owner gets a generic "invalid measurement" from a form that said it
  // was fine.
  const cases: [Mode, Record<string, string>, Partial<SetGroupDraft>[]?][] = [
    ["sets_reps_load", {}, [{ sets: "4", reps: "8" }]],
    [
      "sets_reps_load",
      { load_unit: "kg" },
      [{ sets: "5", reps: "5", load: "82.5" }],
    ],
    [
      "sets_reps_load",
      { load_unit: "lb" },
      [{ sets: "3", reps: "10", load: "135" }],
    ],
    [
      "sets_reps_load",
      { load_unit: "kg" },
      [
        { sets: "3", reps: "5", load: "60" },
        { sets: "1", reps: "3", load: "100" },
      ],
    ],
    ["sets_reps_load", {}, [{ sets: "3" }]],
    ["sets_reps_load", {}, [{ reps: "8" }]],
    ["sets_reps_load", { load_unit: "kg" }, [{ load: "100" }]],
    ["time_distance_pace", { duration: "45:00" }],
    ["time_distance_pace", { distance: "10", distance_unit: "km" }],
    ["time_distance_pace", { pace: "4:45", pace_unit: "sec/km" }],
    [
      "time_distance_pace",
      { duration: "1:30:00", distance: "21.1", distance_unit: "km" },
    ],
    ["time_distance_pace", { distance: "400", distance_unit: "m" }],
    ["duration_intensity", { duration_minutes: "40" }],
    ["duration_intensity", { duration_minutes: "40", intensity: "easy" }],
    ["duration_intensity", { duration_minutes: "60", intensity: "very_hard" }],
    ["skill_repetitions", { repetitions: "20", unit: "throws" }],
    ["custom", { label: "Grip", value: "closed", unit: "hold" }],
    ["custom", { label: "Depth", value: "12", unit: "m" }],
  ];

  for (const [mode, fields, groups] of cases) {
    it(`${mode}: ${JSON.stringify({ ...fields, ...(groups ? { groups } : {}) })}`, () => {
      const built = build(mode, fields, groups);
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
