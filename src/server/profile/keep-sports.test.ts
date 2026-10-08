import { beforeEach, describe, expect, it, vi } from "vitest";

import { keepSports, sportOf, submittedSports } from "./keep-sports";

const { getDetails, saveSports } = vi.hoisted(() => ({
  getDetails: vi.fn(),
  saveSports: vi.fn(),
}));

vi.mock("@/server/repositories/profile-repository", () => ({
  createProfileRepository: async () => ({ getDetails, saveSports }),
}));

describe("keepSports", () => {
  beforeEach(() => {
    getDetails.mockReset().mockResolvedValue({ sports: ["Running"] });
    saveSports.mockReset().mockResolvedValue(undefined);
  });

  it("adds a sport the owner does not have yet, once, after theirs", async () => {
    await keepSports([" Padel ", "padel", "RUNNING", "Yoga"]);

    expect(saveSports).toHaveBeenCalledExactlyOnceWith([
      "Running",
      "Padel",
      "Yoga",
    ]);
  });

  it("writes nothing when every sport is already theirs", async () => {
    await keepSports(["running", "", null, undefined, 3]);

    expect(saveSports).not.toHaveBeenCalled();
  });

  it("leaves out a name the list could not hold", async () => {
    await keepSports(["Run, bike", "x".repeat(61)]);

    expect(getDetails).not.toHaveBeenCalled();
    expect(saveSports).not.toHaveBeenCalled();
  });

  it("stops at the list's limit", async () => {
    getDetails.mockResolvedValue({
      sports: Array.from({ length: 99 }, (_, index) => `Sport ${index}`),
    });

    await keepSports(["Padel", "Yoga"]);

    expect(saveSports.mock.calls[0][0]).toHaveLength(100);
    expect(saveSports.mock.calls[0][0].at(-1)).toBe("Padel");
  });

  it("never fails the save it follows", async () => {
    saveSports.mockRejectedValue(new Error("no"));

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
