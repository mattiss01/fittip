import { describe, expect, it } from "vitest";

import {
  CONFIRMATION_BUDGET_MS,
  latestActionResponseAt,
  RENDER_GRACE_MS,
  watchGoalMutation,
} from "./mutation-watchdog";

describe("watchGoalMutation", () => {
  it("waits while a mutation is still in flight", () => {
    expect(
      watchGoalMutation({
        submittedAt: 1_000,
        respondedAt: null,
        consumedAt: null,
        now: 1_400,
      }),
    ).toBe("waiting");
  });

  it("waits while a fresh response is still being rendered", () => {
    expect(
      watchGoalMutation({
        submittedAt: 1_000,
        respondedAt: 1_100,
        consumedAt: null,
        now: 1_100 + RENDER_GRACE_MS - 1,
      }),
    ).toBe("waiting");
  });

  it("reports a lost render once a response has not reached the surface", () => {
    expect(
      watchGoalMutation({
        submittedAt: 1_000,
        respondedAt: 1_100,
        consumedAt: null,
        now: 1_100 + RENDER_GRACE_MS,
      }),
    ).toBe("lost-render");
  });

  it("ignores a response the previous mutation already accounted for", () => {
    expect(
      watchGoalMutation({
        submittedAt: 5_000,
        respondedAt: 1_100,
        consumedAt: 1_100,
        now: 5_000 + RENDER_GRACE_MS,
      }),
    ).toBe("waiting");
  });

  it("claims a response that arrived before the pending render committed", () => {
    // The reply beat the render, so it looks older than `submittedAt`. It is
    // still newer than anything the previous mutation saw, so it counts.
    expect(
      watchGoalMutation({
        submittedAt: 1_050,
        respondedAt: 1_020,
        consumedAt: 900,
        now: 1_020 + RENDER_GRACE_MS,
      }),
    ).toBe("lost-render");
  });

  it("reports an unconfirmed mutation rather than assuming it applied", () => {
    expect(
      watchGoalMutation({
        submittedAt: 1_000,
        respondedAt: null,
        consumedAt: null,
        now: 1_000 + CONFIRMATION_BUDGET_MS,
      }),
    ).toBe("unconfirmed");
  });

  it("reports unconfirmed when the only response is an accounted-for one", () => {
    expect(
      watchGoalMutation({
        submittedAt: 1_000,
        respondedAt: 900,
        consumedAt: 900,
        now: 1_000 + CONFIRMATION_BUDGET_MS,
      }),
    ).toBe("unconfirmed");
  });

  it("prefers the lost render when both budgets have elapsed", () => {
    expect(
      watchGoalMutation({
        submittedAt: 1_000,
        respondedAt: 1_200,
        consumedAt: null,
        now: 1_000 + CONFIRMATION_BUDGET_MS,
      }),
    ).toBe("lost-render");
  });
});

describe("latestActionResponseAt", () => {
  const actionUrl = "https://fittip.test/home/you/goals";

  it("takes the newest response for the action URL", () => {
    expect(
      latestActionResponseAt(
        [
          { name: actionUrl, responseEnd: 120 },
          { name: actionUrl, responseEnd: 940 },
          { name: actionUrl, responseEnd: 400 },
        ],
        actionUrl,
      ),
    ).toBe(940);
  });

  it("ignores router prefetches of the same route", () => {
    expect(
      latestActionResponseAt(
        [
          { name: `${actionUrl}?_rsc=abc`, responseEnd: 900 },
          { name: "https://fittip.test/home/plan?_rsc=abc", responseEnd: 910 },
        ],
        actionUrl,
      ),
    ).toBeNull();
  });

  it("ignores entries with no recorded response", () => {
    expect(
      latestActionResponseAt([{ name: actionUrl, responseEnd: 0 }], actionUrl),
    ).toBeNull();
  });
});
