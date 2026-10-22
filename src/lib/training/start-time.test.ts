import { describe, expect, it } from "vitest";

import { byStartTime, isStartTime } from "@/lib/training/start-time";

describe("start times", () => {
  it("are whole minutes on a 24-hour clock, written HH:MM", () => {
    for (const valid of ["00:00", "07:30", "23:59"]) {
      expect(isStartTime(valid)).toBe(true);
    }
    for (const invalid of ["7:30", "24:00", "07:60", "07:30:00", "", 730]) {
      expect(isStartTime(invalid)).toBe(false);
    }
  });

  // Owner, 22 Oct 2026: timed first by time, untimed after in their order.
  it("order a day timed first, by time, then the untimed by position", () => {
    const day = [
      { title: "Stretch", startTime: null, position: 0 },
      { title: "Evening run", startTime: "18:00", position: 1 },
      { title: "Core", startTime: null, position: 2 },
      { title: "Swim", startTime: "06:30", position: 3 },
      { title: "Bike", startTime: "06:30", position: 4 },
    ];
    expect(day.toSorted(byStartTime).map((session) => session.title)).toEqual([
      "Swim",
      "Bike",
      "Evening run",
      "Stretch",
      "Core",
    ]);
  });
});
