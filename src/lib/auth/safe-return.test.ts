import { describe, expect, it } from "vitest";

import { safeAuthReturn } from "@/lib/auth/safe-return";

const ID = "00000000-0000-4000-8000-000000000001";

describe("safeAuthReturn", () => {
  it.each([
    "/home/today",
    "/home/plan",
    "/home/progress",
    `/home/progress/completion-${ID}`,
    `/home/log?plannedSession=${ID}`,
  ])("preserves the allowlisted private path %s", (value) => {
    expect(safeAuthReturn(value)).toBe(value);
  });

  it.each([
    "https://attacker.example/home/today",
    "//attacker.example/home/today",
    "/home/today?secret=1",
    "/home/log?plannedSession=not-an-id",
    `/home/log?plannedSession=${ID}&completion=${ID}`,
    "/home/coach",
    "/home/progress/not-an-id",
    undefined,
  ])("falls back without reflecting unsafe input %#", (value) => {
    expect(safeAuthReturn(value)).toBe("/home/today");
  });
});
