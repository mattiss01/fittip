import { describe, expect, it } from "vitest";

import {
  assertPastPlanContentIsImmutable,
  ownerLocalIsoDate,
  PastPlanContentMutationError,
} from "./past-plan-protection";
import type { ManualPlanInput } from "./training-records";

describe("past accepted plan protection", () => {
  const now = new Date("2026-07-28T00:30:00.000Z");

  it("uses the accepted plan timezone at a local-date boundary", () => {
    expect(ownerLocalIsoDate(now, "Europe/Berlin")).toBe("2026-07-28");
    expect(ownerLocalIsoDate(now, "America/Los_Angeles")).toBe("2026-07-27");
  });

  it("allows future changes and an identical past snapshot", () => {
    const current = plan([
      session("2026-07-27", "Past run"),
      session("2026-07-28", "Today run"),
    ]);
    const proposed = plan([
      session("2026-07-27", "Past run"),
      session("2026-07-28", "Changed today"),
    ]);

    expect(() =>
      assertPastPlanContentIsImmutable(current, proposed, now),
    ).not.toThrow();
  });

  it.each([
    ["changes a past session", [session("2026-07-27", "Forged title")]],
    ["removes a past session", []],
    [
      "changes a past activity snapshot",
      [
        {
          ...session("2026-07-27", "Past run"),
          activities: [
            {
              ...session("2026-07-27", "Past run").activities[0],
              isLocked: true,
            },
          ],
        },
      ],
    ],
    [
      "inserts a new past session",
      [session("2026-07-27", "Past run"), session("2026-07-27", "Extra", 1)],
    ],
  ])("rejects a proposal that %s", (_label, sessions) => {
    const current = plan([session("2026-07-27", "Past run")]);

    expect(() =>
      assertPastPlanContentIsImmutable(current, plan(sessions), now),
    ).toThrow(PastPlanContentMutationError);
  });

  it("rejects past content when there is no accepted source", () => {
    expect(() =>
      assertPastPlanContentIsImmutable(
        null,
        plan([session("2026-07-27", "Backdated")]),
        now,
      ),
    ).toThrow(PastPlanContentMutationError);
  });

  it("uses the accepted timezone even when a proposal changes it", () => {
    const current = plan([session("2026-07-27", "Accepted run")]);
    const proposed = {
      ...plan([session("2026-07-27", "Forged title")]),
      timezoneName: "America/Los_Angeles",
    };

    expect(() =>
      assertPastPlanContentIsImmutable(current, proposed, now),
    ).toThrow(PastPlanContentMutationError);
  });

  it("allows a new future-only horizon to leave past content in its immutable version", () => {
    const current = plan([session("2026-07-27", "Past run")]);
    const proposed = {
      ...plan([session("2026-07-29", "Future run")]),
      startDate: "2026-07-29",
      dayCount: 1,
    };

    expect(() =>
      assertPastPlanContentIsImmutable(current, proposed, now),
    ).not.toThrow();
  });
});

function plan(sessions: ManualPlanInput["sessions"]): ManualPlanInput {
  return {
    dayCount: 2,
    startDate: "2026-07-27",
    timezoneName: "Europe/Berlin",
    sessions,
  };
}

function session(
  localDate: string,
  title: string,
  position = 0,
): ManualPlanInput["sessions"][number] {
  return {
    localDate,
    position,
    title,
    sport: "Running",
    isLocked: false,
    activities: [
      {
        position: 0,
        name: "Aerobic running",
        sport: "Running",
        measurementMode: "duration_intensity",
        target: { duration_minutes: 30, intensity: "easy" },
        isLocked: false,
      },
    ],
  };
}
