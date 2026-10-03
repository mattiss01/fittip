import { describe, expect, it } from "vitest";

import { slideTowards } from "./slide";

describe("slideTowards", () => {
  it("brings a later day in from the right", () => {
    expect(slideTowards("2026-10-03", "2026-10-04")).toEqual(["slide-forward"]);
  });

  it("brings an earlier day in from the left", () => {
    expect(slideTowards("2026-10-03", "2026-09-30")).toEqual(["slide-back"]);
  });

  it("does not slide to the day already shown", () => {
    expect(slideTowards("2026-10-03", "2026-10-03")).toBeUndefined();
  });
});
