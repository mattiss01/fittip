import { describe, expect, it } from "vitest";

import {
  activeMilliseconds,
  actualMeasurement,
  changeMode,
  formatClock,
  liveActivityFrom,
  toLoggedActivities,
  withRepeats,
  withSets,
} from "./live-workout";

const bench = () =>
  liveActivityFrom({
    key: "bench",
    plannedPosition: 0,
    personalActivityId: null,
    name: "Bench press",
    sport: "Strength",
    measurementMode: "sets_reps_load",
    target: {
      groups: [
        { sets: 3, reps: 8, load: 60 },
        { sets: 1, reps: 5, load: 70 },
      ],
      load_unit: "kg",
    },
  });

describe("a live activity", () => {
  it("expands a sets target into one row per set, none done", () => {
    const activity = bench();
    expect(activity.sets).toEqual([
      { reps: "8", time: "", load: "60", by: "reps", done: false },
      { reps: "8", time: "", load: "60", by: "reps", done: false },
      { reps: "8", time: "", load: "60", by: "reps", done: false },
      { reps: "5", time: "", load: "70", by: "reps", done: false },
    ]);
    expect(activity.done).toBe(false);
  });

  it("records only ticked sets, collapsed into the log's groups", () => {
    const activity = bench();
    const sets = activity.sets.map((set, index) => ({
      ...set,
      done: index !== 2,
      reps: index === 1 ? "9" : set.reps,
    }));
    const done = withSets(activity, sets);
    expect(done.done).toBe(true);
    expect(actualMeasurement(done)).toEqual({
      ok: true,
      measurement: {
        groups: [
          { sets: 1, reps: 8, load: 60 },
          { sets: 1, reps: 9, load: 60 },
          { sets: 1, reps: 5, load: 70 },
        ],
        load_unit: "kg",
      },
    });
  });

  it("records nothing for a sets activity with no set ticked", () => {
    expect(actualMeasurement(bench())).toEqual({ ok: true, measurement: null });
  });

  it("changes how it is measured, and starts from the plan's target in its own mode", () => {
    const asTime = changeMode(withSets(bench(), []), "time_distance_pace");
    expect(asTime.mode).toBe("time_distance_pace");
    expect(asTime.sets).toEqual([]);
    expect(asTime.done).toBe(false);
    expect(asTime.fields.duration).toBe("");

    const back = changeMode(asTime, "sets_reps_load");
    expect(back.sets).toHaveLength(4);
    expect(back.sets[3]).toEqual({
      reps: "5",
      time: "",
      load: "70",
      by: "reps",
      done: false,
    });
  });

  it("starts a sets activity with no target with one empty set", () => {
    const activity = liveActivityFrom({
      plannedPosition: null,
      personalActivityId: null,
      name: "Squat",
      sport: "Strength",
      measurementMode: "sets_reps_load",
      target: null,
    });
    expect(activity.sets).toEqual([
      { reps: "", time: "", load: "", by: "reps", done: false },
    ]);
    expect(activity.targetMode).toBeNull();
  });
});

describe("the hand-over to the log", () => {
  it("passes on only what was done and named, each answering its plan", () => {
    const run = liveActivityFrom({
      key: "run",
      plannedPosition: 1,
      personalActivityId: null,
      name: "Easy run",
      sport: "Running",
      measurementMode: "time_distance_pace",
      target: null,
    });
    const unnamed = { ...run, key: "x", plannedPosition: null, name: " " };
    const logged = toLoggedActivities({
      activities: [
        bench(),
        {
          ...run,
          done: true,
          fields: { ...run.fields, duration: "30:00", distance: "5" },
        },
        { ...unnamed, done: true },
      ],
    });
    expect(logged).toEqual([
      {
        plannedPosition: 1,
        personalActivityId: null,
        name: "Easy run",
        sport: "Running",
        measurementMode: "time_distance_pace",
        actual: {
          duration_seconds: 1800,
          distance: 5,
          distance_unit: "km",
          pace_seconds_per_unit: 360,
          pace_unit: "sec/km",
        },
      },
    ]);
  });
});

describe("the clock", () => {
  const start = "2026-10-21T10:00:00.000Z";
  const at = (iso: string) => new Date(iso).valueOf();

  it("counts from the start, less every pause", () => {
    expect(
      activeMilliseconds(
        { startedAt: start, pausedAt: null, pausedSeconds: 120 },
        at("2026-10-21T10:30:00.000Z"),
      ),
    ).toBe(28 * 60 * 1000);
  });

  it("stands still while paused", () => {
    const paused = {
      startedAt: start,
      pausedAt: "2026-10-21T10:10:00.000Z",
      pausedSeconds: 0,
    };
    expect(activeMilliseconds(paused, at("2026-10-21T11:00:00.000Z"))).toBe(
      10 * 60 * 1000,
    );
  });

  it("reads as minutes and seconds, and hours once there are any", () => {
    expect(formatClock(7_000)).toBe("0:07");
    expect(formatClock(754_000)).toBe("12:34");
    expect(formatClock(3_723_000)).toBe("1:02:03");
  });
});

describe("timed sets and intervals live (ADR-038)", () => {
  it("records held sets as seconds, grouped as they were done", () => {
    const plank = liveActivityFrom({
      plannedPosition: null,
      personalActivityId: null,
      name: "Plank",
      sport: "Strength",
      measurementMode: "sets_reps_load",
      target: { groups: [{ sets: 3, seconds: 45 }] },
    });
    expect(plank.sets[0]).toEqual({
      reps: "",
      time: "0:45",
      load: "",
      by: "time",
      done: false,
    });
    const done = withSets(
      plank,
      plank.sets.map((set, index) => ({
        ...set,
        done: true,
        time: index === 2 ? "1:00" : set.time,
      })),
    );
    expect(actualMeasurement(done)).toEqual({
      ok: true,
      measurement: {
        groups: [
          { sets: 2, seconds: 45 },
          { sets: 1, seconds: 60 },
        ],
      },
    });
  });

  it("expands interval blocks into repeats and folds the done ones back", () => {
    const track = liveActivityFrom({
      plannedPosition: null,
      personalActivityId: null,
      name: "Track",
      sport: "Running",
      measurementMode: "intervals",
      target: {
        blocks: [
          { repeats: 2, distance: 400, rest_seconds: 90 },
          { repeats: 1, distance: 200 },
        ],
        distance_unit: "m",
      },
    });
    expect(track.repeats).toHaveLength(3);
    expect(track.repeats[0]).toEqual({
      distance: "400",
      time: "",
      rest: "1:30",
      done: false,
    });
    const done = withRepeats(
      track,
      track.repeats.map((repeat, index) => ({
        ...repeat,
        done: index < 2,
        time: index === 0 ? "1:28" : repeat.time,
      })),
    );
    expect(done.done).toBe(true);
    expect(actualMeasurement(done)).toEqual({
      ok: true,
      measurement: {
        blocks: [
          { repeats: 1, distance: 400, seconds: 88, rest_seconds: 90 },
          { repeats: 1, distance: 400, rest_seconds: 90 },
        ],
        distance_unit: "m",
      },
    });
  });
});
