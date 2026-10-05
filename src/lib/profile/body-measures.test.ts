import { describe, expect, it } from "vitest";

import {
  ageOn,
  cmToFeetAndInches,
  feetAndInchesToCm,
  kgToPounds,
  poundsToKg,
  unitsForLocale,
} from "./body-measures";

describe("body measures", () => {
  it("converts a height both ways without drifting", () => {
    expect(feetAndInchesToCm(5, 11)).toBe(180.3);
    expect(cmToFeetAndInches(180.3)).toEqual({ feet: 5, inches: 11 });
    // 182.9 cm is 72.0 inches: six feet, never "5 ft 12".
    expect(cmToFeetAndInches(182.9)).toEqual({ feet: 6, inches: 0 });
  });

  it("converts a weight both ways without drifting", () => {
    expect(poundsToKg(176)).toBe(79.83);
    expect(kgToPounds(79.83)).toBe(176);
    expect(kgToPounds(80)).toBe(176.4);
  });

  it("suggests imperial only where it is used day to day", () => {
    expect(unitsForLocale("en-US")).toBe("imperial");
    expect(unitsForLocale("es-US")).toBe("imperial");
    expect(unitsForLocale("en-GB")).toBe("metric");
    expect(unitsForLocale("de-DE")).toBe("metric");
    expect(unitsForLocale("de")).toBe("metric");
    expect(unitsForLocale(undefined)).toBe("metric");
    expect(unitsForLocale("not a locale")).toBe("metric");
  });

  it("counts an age in whole years up to the birthday", () => {
    expect(ageOn("1990-10-06", "2026-10-05")).toBe(35);
    expect(ageOn("1990-10-05", "2026-10-05")).toBe(36);
    expect(ageOn("1990-01-01", "2026-10-05")).toBe(36);
    // Born on a leap day: the birthday falls on 1 March in other years.
    expect(ageOn("2000-02-29", "2026-02-28")).toBe(25);
    expect(ageOn("2000-02-29", "2026-03-01")).toBe(26);
  });
});
