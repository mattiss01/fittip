import { describe, expect, it } from "vitest";

import {
  parseProfileDetails,
  parseProfileSports,
  ProfileDetailsValidationError,
} from "./profile-records";

const TODAY = "2026-10-05";

function details(values: Record<string, string>) {
  const form = new FormData();
  form.set("displayName", "Alex");
  form.set("unitsSystem", "metric");
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

describe("profile details", () => {
  it("needs only a name and leaves the rest unset", () => {
    expect(parseProfileDetails(details({}), TODAY)).toEqual({
      displayName: "Alex",
      birthDate: null,
      gender: null,
      unitsSystem: "metric",
      heightCm: null,
      weightKg: null,
    });
  });

  it("reads metric measures, with a comma or a point", () => {
    expect(
      parseProfileDetails(
        details({
          displayName: "  Alex  ",
          birthDate: "1990-05-17",
          gender: "female",
          heightCm: "181,5",
          weightKg: "80.25",
        }),
        TODAY,
      ),
    ).toEqual({
      displayName: "Alex",
      birthDate: "1990-05-17",
      gender: "female",
      unitsSystem: "metric",
      heightCm: 181.5,
      weightKg: 80.25,
    });
  });

  it("stores imperial measures as metric", () => {
    const parsed = parseProfileDetails(
      details({
        unitsSystem: "imperial",
        heightFeet: "5",
        heightInches: "11",
        weightLb: "176",
        // What a metric form would have sent is ignored.
        heightCm: "999",
        weightKg: "999",
      }),
      TODAY,
    );
    expect(parsed.heightCm).toBe(180.3);
    expect(parsed.weightKg).toBe(79.83);
  });

  it("reads feet alone as a height", () => {
    expect(
      parseProfileDetails(
        details({ unitsSystem: "imperial", heightFeet: "6", heightInches: "" }),
        TODAY,
      ).heightCm,
    ).toBe(182.9);
  });

  it.each([
    ["no name", { displayName: "   " }],
    ["a name over 80 characters", { displayName: "n".repeat(81) }],
    ["a birthday that is not a date", { birthDate: "1990-02-30" }],
    ["a birthday before 1900", { birthDate: "1899-12-31" }],
    ["a birthday after today", { birthDate: "2026-10-06" }],
    ["a gender outside the three", { gender: "unknown" }],
    ["no units", { unitsSystem: "" }],
    ["a height that is not a number", { heightCm: "tall" }],
    ["a height under 50 cm", { heightCm: "49" }],
    ["a height over 272 cm", { heightCm: "273" }],
    ["a weight under 20 kg", { weightKg: "19.9" }],
    ["a weight over 400 kg", { weightKg: "401" }],
    [
      "twelve inches",
      { unitsSystem: "imperial", heightFeet: "5", heightInches: "12" },
    ],
    [
      "a weight over 400 kg in pounds",
      { unitsSystem: "imperial", weightLb: "900" },
    ],
  ])("refuses %s", (_label, values) => {
    expect(() => parseProfileDetails(details(values), TODAY)).toThrow(
      ProfileDetailsValidationError,
    );
  });

  it("accepts a birthday of today, the owner's own day", () => {
    expect(
      parseProfileDetails(details({ birthDate: TODAY }), TODAY).birthDate,
    ).toBe(TODAY);
  });

  it("never repeats what was typed in its error", () => {
    try {
      parseProfileDetails(details({ displayName: "x".repeat(81) }), TODAY);
      throw new Error("expected a refusal");
    } catch (error) {
      expect((error as Error).message).toBe("The profile details are invalid.");
    }
  });
});

describe("profile sports", () => {
  function sports(...names: string[]) {
    const form = new FormData();
    for (const name of names) form.append("sports", name);
    return form;
  }

  it("keeps the names in order, trimmed, and none is required", () => {
    expect(parseProfileSports(sports())).toEqual([]);
    expect(
      parseProfileSports(sports("Running", "  Trail   running ", "", "Latzug")),
    ).toEqual(["Running", "Trail running", "Latzug"]);
  });

  it("keeps a name given twice once, however it was capitalised", () => {
    expect(parseProfileSports(sports("Running", "running", "RUNNING"))).toEqual(
      ["Running"],
    );
  });

  it("refuses a name that is too long, holds a comma, or one too many", () => {
    expect(() => parseProfileSports(sports("n".repeat(61)))).toThrow(
      ProfileDetailsValidationError,
    );
    expect(() => parseProfileSports(sports("Running, cycling"))).toThrow(
      ProfileDetailsValidationError,
    );
    expect(() =>
      parseProfileSports(
        sports(...Array.from({ length: 101 }, (_, index) => `Sport ${index}`)),
      ),
    ).toThrow(ProfileDetailsValidationError);
  });
});
