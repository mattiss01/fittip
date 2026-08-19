import { describe, expect, it } from "vitest";

import { toRollingPlanSessionInput, toSavedSessionDraft } from "./session-copy";

import type { RollingPlanSession } from "@/server/rolling-plan/rolling-plan";
import type { SavedSession } from "@/server/saved-sessions/saved-sessions";

const plannedSession: RollingPlanSession = {
  id: "77000000-0000-4000-8000-000000000001",
  localDate: "2026-08-19",
  position: 3,
  title: "Tempo run",
  sport: "Running",
  intent: "Threshold work",
  expectedDurationMinutes: 60,
  note: "Shoes with the orange laces",
  isLocked: true,
  status: "active",
  cancelledAt: null,
  activities: [
    {
      id: "77000000-0000-4000-8000-0000000000a1",
      personalActivityId: "77000000-0000-4000-8000-0000000000b1",
      position: 0,
      name: "Tempo blocks",
      sport: "Running",
      instructions: "3 x 8 minutes",
      measurementMode: "duration_intensity",
      target: { duration_minutes: 24, intensity: "hard" },
      isLocked: true,
    },
  ],
};

const savedSession: SavedSession = {
  id: "77000000-0000-4000-8000-000000000002",
  revision: 4,
  updatedAt: "2026-08-18T10:00:00.000Z",
  name: "Tuesday tempo",
  title: "Tempo run",
  sport: "Running",
  intent: "Threshold work",
  expectedDurationMinutes: 60,
  activities: [
    {
      personalActivityId: "77000000-0000-4000-8000-0000000000b1",
      position: 0,
      name: "Tempo blocks",
      sport: "Running",
      measurementMode: "duration_intensity",
      target: { duration_minutes: 24, intensity: "hard" },
    },
  ],
};

describe("saving a planned session into the library", () => {
  it("keeps the reusable fields and the activities", () => {
    expect(toSavedSessionDraft("Tuesday tempo", plannedSession)).toEqual({
      name: "Tuesday tempo",
      title: "Tempo run",
      sport: "Running",
      intent: "Threshold work",
      expectedDurationMinutes: 60,
      note: "Shoes with the orange laces",
      activities: [
        {
          personalActivityId: "77000000-0000-4000-8000-0000000000b1",
          position: 0,
          name: "Tempo blocks",
          sport: "Running",
          instructions: "3 x 8 minutes",
          measurementMode: "duration_intensity",
          target: { duration_minutes: 24, intensity: "hard" },
        },
      ],
    });
  });

  it("drops every fact that belongs to the Plan rather than to the content", () => {
    const draft = toSavedSessionDraft("Tuesday tempo", plannedSession);
    for (const key of [
      "id",
      "localDate",
      "position",
      "isLocked",
      "status",
      "cancelledAt",
    ]) {
      expect(draft).not.toHaveProperty(key);
    }
    expect(draft.activities[0]).not.toHaveProperty("id");
    expect(draft.activities[0]).not.toHaveProperty("isLocked");
  });

  it("carries no key for a field the planned session does not have", () => {
    const draft = toSavedSessionDraft("Bare", {
      ...plannedSession,
      intent: undefined,
      expectedDurationMinutes: undefined,
      note: undefined,
      activities: [],
    });
    expect(draft).toEqual({
      name: "Bare",
      title: "Tempo run",
      sport: "Running",
      activities: [],
    });
  });
});

describe("reusing a library entry in the Plan", () => {
  it("becomes a plain addition on the date the owner picked", () => {
    expect(toRollingPlanSessionInput(savedSession, "2026-08-21", 2)).toEqual({
      title: "Tempo run",
      sport: "Running",
      intent: "Threshold work",
      expectedDurationMinutes: 60,
      localDate: "2026-08-21",
      position: 2,
      isLocked: false,
      activities: [
        {
          personalActivityId: "77000000-0000-4000-8000-0000000000b1",
          position: 0,
          name: "Tempo blocks",
          sport: "Running",
          measurementMode: "duration_intensity",
          target: { duration_minutes: 24, intensity: "hard" },
          isLocked: false,
        },
      ],
    });
  });

  it("starts unlocked and carries neither the library identity nor its name", () => {
    const input = toRollingPlanSessionInput(
      { ...savedSession, activities: [] },
      "2026-08-21",
      0,
    );
    expect(input.isLocked).toBe(false);
    expect(input).not.toHaveProperty("id");
    expect(input).not.toHaveProperty("name");
    expect(input).not.toHaveProperty("revision");
    expect(input).not.toHaveProperty("savedSessionId");
  });

  it("survives a round trip without gaining or losing a reusable field", () => {
    const planned = toRollingPlanSessionInput(savedSession, "2026-08-21", 0);
    const returned = toSavedSessionDraft("Tuesday tempo", {
      ...planned,
      id: "77000000-0000-4000-8000-000000000003",
      status: "active",
      cancelledAt: null,
      activities: planned.activities.map((activity, index) => ({
        ...activity,
        id: `77000000-0000-4000-8000-00000000010${index}`,
      })),
    });
    expect(returned).toEqual({
      name: savedSession.name,
      title: savedSession.title,
      sport: savedSession.sport,
      intent: savedSession.intent,
      expectedDurationMinutes: savedSession.expectedDurationMinutes,
      activities: savedSession.activities,
    });
  });
});
