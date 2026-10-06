import { describe, expect, it } from "vitest";

import { ProfileDetailsValidationError } from "@/server/profile/profile-records";
import {
  parseSetupNotes,
  parseSetupStepNumber,
  parseTrainingSetup,
} from "@/server/profile/training-setup-records";

function form(entries: [string, string][]) {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
}

describe("parseTrainingSetup", () => {
  it("reads only the parts a form names, so one screen never clears another's answer", () => {
    expect(
      parseTrainingSetup(
        form([
          ["part", "frequency"],
          ["sessionsPerWeek", "4"],
          // Sent, but not named as a part: not this form's to change.
          ["trainingPlaces", "Gym"],
        ]),
      ),
    ).toEqual({ sessionsPerWeek: 4 });
  });

  it("reads all four from Settings", () => {
    expect(
      parseTrainingSetup(
        form([
          ["part", "frequency"],
          ["part", "days"],
          ["part", "places"],
          ["part", "equipment"],
          ["sessionsPerWeek", " 3 "],
          ["unavailableDays", "sunday"],
          ["unavailableDays", "monday"],
          ["availabilityNote", "  Mondays only after 18:00 "],
          ["trainingPlaces", "Gym"],
          ["trainingPlaces", "  Company   gym "],
          ["trainingPlaces", "gym"],
          ["homeEquipment", "Mat"],
        ]),
      ),
    ).toEqual({
      sessionsPerWeek: 3,
      // In the week's own order, whatever order they were sent in.
      unavailableDays: ["monday", "sunday"],
      availabilityNote: "Mondays only after 18:00",
      // A name given twice is kept once; spaces are tidied.
      trainingPlaces: ["Gym", "Company gym"],
      homeEquipment: ["Mat"],
    });
  });

  it("clears an answer left empty", () => {
    expect(
      parseTrainingSetup(
        form([
          ["part", "frequency"],
          ["part", "days"],
          ["part", "places"],
          ["sessionsPerWeek", ""],
          ["availabilityNote", "   "],
        ]),
      ),
    ).toEqual({
      sessionsPerWeek: null,
      unavailableDays: [],
      availabilityNote: null,
      trainingPlaces: [],
    });
  });

  it.each([
    ["no part", [["sessionsPerWeek", "3"]]],
    ["an unknown part", [["part", "everything"]]],
    [
      "no sessions a week",
      [
        ["part", "frequency"],
        ["sessionsPerWeek", "0"],
      ],
    ],
    [
      "too many sessions",
      [
        ["part", "frequency"],
        ["sessionsPerWeek", "15"],
      ],
    ],
    [
      "half a session",
      [
        ["part", "frequency"],
        ["sessionsPerWeek", "3.5"],
      ],
    ],
    [
      "a day that is none",
      [
        ["part", "days"],
        ["unavailableDays", "someday"],
      ],
    ],
    [
      "a note that is too long",
      [
        ["part", "days"],
        ["availabilityNote", "n".repeat(301)],
      ],
    ],
    [
      "a place name that is too long",
      [
        ["part", "places"],
        ["trainingPlaces", "p".repeat(61)],
      ],
    ],
    [
      "too many places",
      [
        ["part", "places"],
        ...Array.from({ length: 21 }, (_, index) => [
          "trainingPlaces",
          `Place ${index}`,
        ]),
      ],
    ],
  ] as [string, [string, string][]][])("refuses %s", (_label, entries) => {
    expect(() => parseTrainingSetup(form(entries))).toThrow(
      ProfileDetailsValidationError,
    );
  });
});

describe("parseSetupNotes", () => {
  it("files each field under the kind its prompt names, with the prompt before the text", () => {
    expect(
      parseSetupNotes(
        form([
          ["noteKind", "injury"],
          ["noteText", " Left   knee,\r\n 2019 "],
          ["noteKind", "dislike"],
          ["noteText", "Treadmills"],
          ["noteKind", "routine"],
          ["noteText", "Shift work"],
          ["noteKind", "other_limitation"],
          ["noteText", "No jumping"],
        ]),
      ),
    ).toEqual([
      // Line breaks are kept; runs of spaces are not.
      { memoryType: "constraint", content: "An old injury: Left knee,\n2019" },
      { memoryType: "preference", content: "What I can't stand: Treadmills" },
      {
        memoryType: "profile_fact",
        content: "My job and daily routine: Shift work",
      },
      { memoryType: "constraint", content: "Other limitation: No jumping" },
    ]);
  });

  it("passes over a prompt tapped and not answered, and the same text given twice", () => {
    expect(
      parseSetupNotes(
        form([
          ["noteKind", "injury"],
          ["noteText", "   "],
          ["noteKind", "enjoy"],
          ["noteText", "Long runs"],
          ["noteKind", "enjoy"],
          ["noteText", "Long runs"],
        ]),
      ),
    ).toEqual([
      { memoryType: "preference", content: "What I enjoy: Long runs" },
    ]);
    expect(parseSetupNotes(form([]))).toEqual([]);
  });

  it.each([
    [
      "a prompt that does not exist",
      [
        ["noteKind", "diagnosis"],
        ["noteText", "Something"],
      ],
    ],
    [
      "a field over 300 characters",
      [
        ["noteKind", "injury"],
        ["noteText", "x".repeat(301)],
      ],
    ],
    ["kinds and texts that do not pair up", [["noteKind", "injury"]]],
    [
      "more fields than the coach has room for",
      Array.from({ length: 13 }, (_, index) => [
        ["noteKind", "enjoy"],
        ["noteText", `Thing ${index}`],
      ]).flat(),
    ],
  ] as [string, [string, string][]][])("refuses %s", (_label, entries) => {
    expect(() => parseSetupNotes(form(entries))).toThrow(
      ProfileDetailsValidationError,
    );
  });
});

describe("parseSetupStepNumber", () => {
  it("takes one of setup's twelve screens and nothing else", () => {
    expect(parseSetupStepNumber(1)).toBe(1);
    expect(parseSetupStepNumber("12")).toBe(12);
    for (const value of [0, 13, 2.5, "x", null, undefined]) {
      expect(() => parseSetupStepNumber(value)).toThrow(
        ProfileDetailsValidationError,
      );
    }
  });
});
