import { describe, expect, it } from "vitest";

import {
  AVAILABILITY_NOTE_MAX_LENGTH,
  HOME_EQUIPMENT_MAX_COUNT,
  TRAINING_NAME_MAX_LENGTH,
  TRAINING_PLACES_MAX_COUNT,
} from "@/lib/training/training-setup";
import {
  emptyCoachProfile,
  selectCoachProfileContext,
  type CoachProfileRecords,
} from "@/server/profile/coach-profile-context";

const TODAY = "2026-10-09";

function records(
  overrides: Partial<CoachProfileRecords> = {},
): CoachProfileRecords {
  return {
    birthDate: "1992-03-14",
    gender: "female",
    heightCm: 171,
    latestWeightKg: 64.5,
    training: {
      sessionsPerWeek: 4,
      unavailableDays: ["sunday", "wednesday"],
      availabilityNote: "  Late on Thursdays.  ",
      trainingPlaces: ["Home", "Gym"],
      homeEquipment: ["Kettlebell", "Pull-up bar"],
    },
    ...overrides,
  };
}

describe("what the coach reads of the profile (ADR-023)", () => {
  it("sends an age, never the birth date", () => {
    const selection = selectCoachProfileContext(records(), TODAY);

    expect(selection.athlete).toEqual({
      age: 34,
      gender: "female",
      heightCm: 171,
      weightKg: 64.5,
    });
    expect(JSON.stringify(selection)).not.toContain("1992");
  });

  it.each([
    // The birthday is still ahead this year, is today, and has passed.
    ["1992-10-10", 33],
    ["1992-10-09", 34],
    ["1992-10-08", 34],
    // A leap-day birthday in a year without one.
    ["2000-02-29", 26],
  ])("counts whole years from %s", (birthDate, age) => {
    expect(
      selectCoachProfileContext(records({ birthDate }), TODAY).athlete.age,
    ).toBe(age);
  });

  it.each([null, "2027-01-01", "1850-01-01", "14 March 1992"])(
    "gives no age for %s rather than a wrong one",
    (birthDate) => {
      expect(
        selectCoachProfileContext(records({ birthDate }), TODAY).athlete.age,
      ).toBeNull();
    },
  );

  it("drops a value the forms would not have stored", () => {
    const selection = selectCoachProfileContext(
      records({
        gender: "robot",
        heightCm: 3,
        latestWeightKg: 9000,
        training: { ...records().training, sessionsPerWeek: 15 },
      }),
      TODAY,
    );

    expect(selection.athlete).toMatchObject({
      gender: null,
      heightCm: null,
      weightKg: null,
    });
    expect(selection.trainingSetup.sessionsPerWeek).toBeNull();
  });

  it("keeps a value at the edge of what the forms accept", () => {
    const selection = selectCoachProfileContext(
      records({
        heightCm: 272,
        latestWeightKg: 400,
        training: { ...records().training, sessionsPerWeek: 14 },
      }),
      TODAY,
    );

    expect(selection.athlete).toMatchObject({ heightCm: 272, weightKg: 400 });
    expect(selection.trainingSetup.sessionsPerWeek).toBe(14);
  });

  it("names the days out as weekdays and tidies the setup's text", () => {
    const { trainingSetup } = selectCoachProfileContext(records(), TODAY);

    expect(trainingSetup).toEqual({
      sessionsPerWeek: 4,
      // In the week's own order, whatever order they were stored in.
      unavailableDays: ["Wednesday", "Sunday"],
      availabilityNote: "Late on Thursdays.",
      trainingPlaces: ["Home", "Gym"],
      homeEquipment: ["Kettlebell", "Pull-up bar"],
    });
  });

  it("is empty for an owner who has entered nothing", () => {
    expect(selectCoachProfileContext(null, TODAY)).toEqual(emptyCoachProfile());
    // A fresh one each time: no caller can change another's lists.
    expect(emptyCoachProfile()).not.toBe(emptyCoachProfile());
  });

  it("stays inside its allocations at every field limit", () => {
    const longest = (count: number) =>
      Array.from({ length: count }, (_, index) =>
        `${index}`.padEnd(TRAINING_NAME_MAX_LENGTH, "n"),
      );
    const selection = selectCoachProfileContext(
      records({
        training: {
          sessionsPerWeek: 21,
          unavailableDays: [
            "monday",
            "tuesday",
            "wednesday",
            "thursday",
            "friday",
            "saturday",
            "sunday",
          ],
          availabilityNote: "a".repeat(AVAILABILITY_NOTE_MAX_LENGTH),
          trainingPlaces: longest(TRAINING_PLACES_MAX_COUNT),
          homeEquipment: longest(HOME_EQUIPMENT_MAX_COUNT),
        },
      }),
      TODAY,
    );

    // Measured, not trusted: `context.ts` allows 4,600 and 200.
    expect(JSON.stringify(selection.trainingSetup).length).toBeLessThanOrEqual(
      4_600,
    );
    expect(JSON.stringify(selection.athlete).length).toBeLessThanOrEqual(200);
  });

  it("cuts nothing: a setup past the forms' limits is assembly's to refuse", () => {
    const tooLong = "n".repeat(TRAINING_NAME_MAX_LENGTH + 20);
    const selection = selectCoachProfileContext(
      records({
        training: {
          ...records().training,
          homeEquipment: Array.from(
            { length: HOME_EQUIPMENT_MAX_COUNT + 1 },
            () => tooLong,
          ),
        },
      }),
      TODAY,
    );

    expect(selection.trainingSetup.homeEquipment).toHaveLength(
      HOME_EQUIPMENT_MAX_COUNT + 1,
    );
    expect(selection.trainingSetup.homeEquipment[0]).toBe(tooLong);
  });
});
