import { describe, expect, it } from "vitest";

import { mondayOf } from "./plan-week";

describe("mondayOf", () => {
  it("finds the Monday a Plan week starts on", () => {
    expect(mondayOf("2026-09-28")).toBe("2026-09-28");
    expect(mondayOf("2026-09-30")).toBe("2026-09-28");
    expect(mondayOf("2026-10-04")).toBe("2026-09-28");
    expect(mondayOf("2026-10-05")).toBe("2026-10-05");
  });
});
