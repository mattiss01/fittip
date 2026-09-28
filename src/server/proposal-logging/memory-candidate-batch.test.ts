import { readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";

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

  // The owner approved one log line, not logging. A second call site is a new
  // decision about what leaves the process, so it has to fail here first.
  it("is the only module in src that writes to the console", () => {
    const writing = sourceFiles(join(process.cwd(), "src")).filter((path) =>
      /\bconsole\s*\./.test(readFileSync(path, "utf8")),
    );

    expect(writing).toEqual([
      join(
        process.cwd(),
        "src",
        "server",
        "proposal-logging",
        "memory-candidate-batch.ts",
      ),
    ]);
  });
});

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return [".ts", ".tsx"].includes(extname(entry.name)) &&
      !/\.test\.tsx?$/.test(entry.name)
      ? [path]
      : [];
  });
}
