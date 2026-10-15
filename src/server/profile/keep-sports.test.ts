import { beforeEach, describe, expect, it, vi } from "vitest";

import { keepSports, sportOf, submittedSports } from "./keep-sports";

const { keepOwned } = vi.hoisted(() => ({ keepOwned: vi.fn() }));

vi.mock("@/server/repositories/profile-repository", () => ({
  createProfileRepository: async () => ({ keepSports: keepOwned }),
}));

// Which names are new to the owner, and the list's limit, are the database's
// (`keep_sports`, proved in careful_fix_in_passing.test.sql).
describe("keepSports", () => {
  beforeEach(() => {
    keepOwned.mockReset().mockResolvedValue(undefined);
  });

  it("hands the database every name it could keep, trimmed, in one call", async () => {
    await keepSports([" Padel ", "padel", "Yoga", "", null, undefined, 3]);

    expect(keepOwned).toHaveBeenCalledExactlyOnceWith([
      "Padel",
      "padel",
      "Yoga",
    ]);
  });

  it("leaves out a name the list could not hold, and then calls nothing", async () => {
    await keepSports(["Run, bike", "x".repeat(61)]);

    expect(keepOwned).not.toHaveBeenCalled();
  });

  it("never fails the save it follows", async () => {
    keepOwned.mockRejectedValue(new Error("no"));

    await expect(keepSports(["Padel"])).resolves.toBeUndefined();
  });
});

describe("submittedSports", () => {
  it("collects the session's, the replacement's and each activity's", () => {
    const form = new FormData();
    form.set("sport", "Running");
    form.set("replacement.sport", "Cycling");
    form.set("activities", JSON.stringify([{ sport: "Strength" }, {}]));
    form.set("replacement.activities", "not json");
    form.set("activity", JSON.stringify({ sport: "Yoga" }));

    expect(submittedSports(form).filter(Boolean)).toEqual([
      "Running",
      "Cycling",
      "Yoga",
      "Strength",
    ]);
  });

  it("reads an activity's sport only from an object that has one", () => {
    expect(sportOf({ sport: "Yoga" })).toBe("Yoga");
    expect(sportOf(null)).toBeUndefined();
    expect(sportOf("Yoga")).toBeUndefined();
  });
});
