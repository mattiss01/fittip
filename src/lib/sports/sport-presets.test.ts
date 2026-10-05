import { describe, expect, it } from "vitest";

import {
  isPresetSport,
  SPORT_NAME_MAX_LENGTH,
  SPORT_PRESET_GROUPS,
  SPORTS_MAX_COUNT,
} from "./sport-presets";

describe("sport presets", () => {
  const names = SPORT_PRESET_GROUPS.flatMap((group) => [...group.sports]);

  it("offers no sport twice, in any capitalisation", () => {
    const lowered = names.map((name) => name.toLocaleLowerCase());
    expect(new Set(lowered).size).toBe(names.length);
  });

  it("offers only names a profile can hold, and leaves room for the owner's own", () => {
    for (const name of names) {
      expect(name).toBe(name.trim());
      expect(name.length).toBeGreaterThan(0);
      expect(name.length).toBeLessThanOrEqual(SPORT_NAME_MAX_LENGTH);
      // A comma separates sports where they are still typed as a list.
      expect(name).not.toContain(",");
    }
    expect(names.length).toBeLessThan(SPORTS_MAX_COUNT);
  });

  it("recognises a preset however it was typed", () => {
    expect(isPresetSport("running")).toBe(true);
    expect(isPresetSport("  Trail Running ")).toBe(true);
    expect(isPresetSport("Latzug")).toBe(false);
  });
});
