import { afterEach, describe, expect, it, vi } from "vitest";

import {
  logMemoryCandidateFailure,
  MemoryCandidateBatchError,
  memoryCandidateFailureCode,
} from "@/server/proposal-logging/memory-candidate-batch";

describe("memory candidate batch failures", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps a SQLSTATE and nothing else", () => {
    expect(new MemoryCandidateBatchError("22023").code).toBe("22023");
    expect(new MemoryCandidateBatchError("PT409").code).toBe("PT409");
    expect(new MemoryCandidateBatchError(undefined).code).toBe("unknown");
    expect(
      new MemoryCandidateBatchError("Tuesdays are impossible for me").code,
    ).toBe("unknown");
  });

  it("names a failure by class, never by message", () => {
    expect(
      memoryCandidateFailureCode(new MemoryCandidateBatchError("PT409")),
    ).toBe("PT409");
    expect(
      memoryCandidateFailureCode(new TypeError("I only have 45 minutes")),
    ).toBe("TypeError");
    const odd = new Error("I only have 45 minutes");
    odd.name = "I only have 45 minutes";
    expect(memoryCandidateFailureCode(odd)).toBe("unknown");
    expect(memoryCandidateFailureCode("I only have 45 minutes")).toBe(
      "unknown",
    );
  });

  it("logs the route and the code in one line", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    logMemoryCandidateFailure(
      "roadmap",
      new MemoryCandidateBatchError("22023"),
    );

    expect(warn).toHaveBeenCalledExactlyOnceWith(
      "[fittip] roadmap memory candidates not recorded: 22023",
    );
  });
});
