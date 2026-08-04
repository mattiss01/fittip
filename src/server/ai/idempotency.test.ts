import { describe, expect, it } from "vitest";

import { CoachAIError } from "@/server/ai/errors";
import {
  buildCoachAIIdempotencyKey,
  CoachAIIdempotencyStore,
  COACH_AI_IDEMPOTENCY_KEY_MAX_LENGTH,
  isCoachAIIdempotencyKey,
  type CoachAIIdempotencyInput,
} from "@/server/ai/idempotency";

const OWNER = "53000000-0000-4000-8000-000000000001";

const BASE: CoachAIIdempotencyInput = {
  ownerId: OWNER,
  operation: "create_roadmap",
  schemaVersion: "fittip.roadmap.v1",
  goalCollectionRevision: 3,
  memoryCollectionRevision: 5,
};

describe("idempotency keys", () => {
  it("is stable, opaque, and bounded", () => {
    const key = buildCoachAIIdempotencyKey(BASE);

    expect(key).toBe(buildCoachAIIdempotencyKey({ ...BASE }));
    expect(key.length).toBeLessThanOrEqual(COACH_AI_IDEMPOTENCY_KEY_MAX_LENGTH);
    expect(isCoachAIIdempotencyKey(key)).toBe(true);
    // Opaque: none of the scoping values is legible in the key.
    expect(key).not.toContain(OWNER);
    expect(key).not.toContain("create_roadmap");
    expect(key).not.toContain("roadmap.v1");
  });

  it.each<[string, Partial<CoachAIIdempotencyInput>]>([
    ["another owner", { ownerId: "53000000-0000-4000-8000-000000000002" }],
    ["another operation", { operation: "create_seven_day_plan" }],
    ["another schema version", { schemaVersion: "fittip.roadmap.v2" }],
    ["a changed goal collection", { goalCollectionRevision: 4 }],
    ["a changed memory collection", { memoryCollectionRevision: 6 }],
  ])("changes for %s", (_case, overrides) => {
    expect(buildCoachAIIdempotencyKey({ ...BASE, ...overrides })).not.toBe(
      buildCoachAIIdempotencyKey(BASE),
    );
  });

  it.each(["", "short", "has spaces in it!", "a".repeat(129)])(
    "refuses the malformed key %s",
    (key) => {
      expect(isCoachAIIdempotencyKey(key)).toBe(false);
    },
  );
});

describe("idempotency store", () => {
  it("lets exactly one attempt through and replays the result after", async () => {
    const store = new CoachAIIdempotencyStore<string>();
    const key = buildCoachAIIdempotencyKey(BASE);

    const first = store.begin(key, key);
    expect(first.state).toBe("fresh");
    if (first.state !== "fresh") throw new Error("unreachable");
    first.complete("proposal-1");

    const second = store.begin(key, key);
    expect(second).toEqual({ state: "replayed", result: "proposal-1" });
  });

  it("joins a concurrent duplicate onto the single in-flight attempt", async () => {
    const store = new CoachAIIdempotencyStore<string>();
    const key = buildCoachAIIdempotencyKey(BASE);

    const first = store.begin(key, key);
    const second = store.begin(key, key);

    expect(second.state).toBe("joined");
    if (first.state !== "fresh" || second.state !== "joined") {
      throw new Error("unreachable");
    }

    first.complete("proposal-1");
    await expect(second.pending).resolves.toBe("proposal-1");
  });

  it("does not cache a failure, so the owner may try again", async () => {
    const store = new CoachAIIdempotencyStore<string>();
    const key = buildCoachAIIdempotencyKey(BASE);

    const first = store.begin(key, key);
    if (first.state !== "fresh") throw new Error("unreachable");
    first.fail(new CoachAIError("provider_unavailable"));

    expect(store.begin(key, key).state).toBe("fresh");
  });

  it("treats a reused key over changed context as a conflict", () => {
    const store = new CoachAIIdempotencyStore<string>();
    const key = buildCoachAIIdempotencyKey(BASE);
    const changed = buildCoachAIIdempotencyKey({
      ...BASE,
      goalCollectionRevision: 4,
    });

    const first = store.begin(key, key);
    if (first.state !== "fresh") throw new Error("unreachable");
    first.complete("proposal-1");

    expect(() => store.begin(key, changed)).toThrow(
      new CoachAIError("idempotency_conflict"),
    );
  });

  it("refuses a caller key that is not a usable key", () => {
    const store = new CoachAIIdempotencyStore<string>();

    expect(() => store.begin("nope", "fingerprint")).toThrow(
      new CoachAIError("invalid_input"),
    );
  });

  it("stays bounded rather than growing forever", () => {
    const store = new CoachAIIdempotencyStore<string>(2);

    for (let index = 0; index < 3; index += 1) {
      const key = buildCoachAIIdempotencyKey({
        ...BASE,
        goalCollectionRevision: index,
      });
      const begun = store.begin(key, key);
      if (begun.state !== "fresh") throw new Error("unreachable");
      begun.complete(`proposal-${index}`);
    }

    // The oldest entry was evicted, so it starts over rather than replaying.
    const oldest = buildCoachAIIdempotencyKey({
      ...BASE,
      goalCollectionRevision: 0,
    });
    expect(store.begin(oldest, oldest).state).toBe("fresh");
  });
});
