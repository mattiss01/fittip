import { describe, expect, it } from "vitest";

import {
  parsePersonalActivityChange,
  PersonalActivityValidationError,
} from "./personal-activities";

const ID = "77000000-0000-4000-8000-0000000000B1";
const UPDATED_AT = "2026-09-27T08:55:53.263069+00:00";

describe("parsePersonalActivityChange", () => {
  it("trims, drops a blank instruction, and keeps a valid target", () => {
    expect(
      parsePersonalActivityChange({
        operation: "create",
        activity: {
          name: "  Back squat ",
          sport: "Strength ",
          instructions: "   ",
          measurementMode: "duration_intensity",
          target: { duration_minutes: 20 },
        },
      }),
    ).toEqual({
      operation: "create",
      activity: {
        name: "Back squat",
        sport: "Strength",
        measurementMode: "duration_intensity",
        target: { duration_minutes: 20 },
      },
    });
  });

  it("sends the read timestamp back exactly and lower-cases the id", () => {
    expect(
      parsePersonalActivityChange({
        operation: "archive",
        personalActivityId: ID,
        expectedUpdatedAt: UPDATED_AT,
      }),
    ).toEqual({
      operation: "archive",
      personalActivityId: ID.toLowerCase(),
      expectedUpdatedAt: UPDATED_AT,
    });
  });

  it.each([
    ["an unknown operation", { operation: "delete", personalActivityId: ID }],
    [
      "an edit with no read timestamp",
      {
        operation: "edit",
        personalActivityId: ID,
        activity: { name: "a", sport: "b", measurementMode: "custom" },
      },
    ],
    [
      "an extra key",
      {
        operation: "create",
        activity: {
          name: "a",
          sport: "b",
          measurementMode: "custom",
          archivedAt: null,
        },
      },
    ],
    [
      "a target that is not its mode's shape",
      {
        operation: "create",
        activity: {
          name: "a",
          sport: "b",
          measurementMode: "duration_intensity",
          target: { sets: 3 },
        },
      },
    ],
    [
      "a name longer than the column allows",
      {
        operation: "create",
        activity: {
          name: "x".repeat(121),
          sport: "b",
          measurementMode: "unmeasured",
        },
      },
    ],
  ])("refuses %s", (_label, change) => {
    expect(() => parsePersonalActivityChange(change)).toThrow(
      PersonalActivityValidationError,
    );
  });
});
