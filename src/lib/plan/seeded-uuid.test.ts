import { describe, expect, it } from "vitest";

import { uuidFromSeed } from "@/lib/plan/seeded-uuid";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/;

describe("uuidFromSeed", () => {
  it("is the same id for the same seed", () => {
    expect(uuidFromSeed("proposal:1:0")).toBe(uuidFromSeed("proposal:1:0"));
    expect(uuidFromSeed("proposal:1:0")).not.toBe(uuidFromSeed("proposal:2:0"));
  });

  it("is a well-formed UUID for every seed, never one with a stray minus", () => {
    // The seed that failed CI on 17 Oct 2026 had a negative h1 ^ h2; a few
    // thousand seeds of the same shape cover that case many times over.
    for (let revision = 0; revision < 4000; revision += 1) {
      const seed = `b73f6e9a-635f-4685-84e5-19be39104260:${revision}:0`;
      expect(uuidFromSeed(seed)).toMatch(UUID);
    }
  });
});
