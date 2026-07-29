import { describe, expect, it } from "vitest";

import { COMPLETION_STATUS_LABELS } from "@/features/completions/status-label";

describe("completion status labels", () => {
  it("keeps every factual M1 outcome explicit", () => {
    expect(COMPLETION_STATUS_LABELS).toEqual({
      completed: "Completed",
      partially_completed: "Partially completed",
      skipped: "Skipped",
      replaced: "Replaced",
      rest: "Rest",
      unplanned: "Unplanned",
    });
  });
});
