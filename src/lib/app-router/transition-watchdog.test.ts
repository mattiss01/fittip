import { describe, expect, it } from "vitest";

import {
  CONFIRMATION_BUDGET_MS,
  actionResponseTimes,
  latestActionResponseAt,
  OWN_REQUEST_SLACK_MS,
  RENDER_GRACE_MS,
  replyForWrite,
  watchTransition,
} from "./transition-watchdog";

describe("watchTransition", () => {
  it("waits while a mutation is still in flight", () => {
    expect(
      watchTransition({
        submittedAt: 1_000,
        respondedAt: null,
        consumedAt: null,
        now: 1_400,
      }),
    ).toBe("waiting");
  });

  it("waits while a fresh response is still being rendered", () => {
    expect(
      watchTransition({
        submittedAt: 1_000,
        respondedAt: 1_100,
        consumedAt: null,
        now: 1_100 + RENDER_GRACE_MS - 1,
      }),
    ).toBe("waiting");
  });

  it("reports a lost render once a response has not reached the surface", () => {
    expect(
      watchTransition({
        submittedAt: 1_000,
        respondedAt: 1_100,
        consumedAt: null,
        now: 1_100 + RENDER_GRACE_MS,
      }),
    ).toBe("lost-render");
  });

  it("ignores a response the previous mutation already accounted for", () => {
    expect(
      watchTransition({
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
      watchTransition({
        submittedAt: 1_050,
        respondedAt: 1_020,
        consumedAt: 900,
        now: 1_020 + RENDER_GRACE_MS,
      }),
    ).toBe("lost-render");
  });

  it("reports an unconfirmed mutation rather than assuming it applied", () => {
    expect(
      watchTransition({
        submittedAt: 1_000,
        respondedAt: null,
        consumedAt: null,
        now: 1_000 + CONFIRMATION_BUDGET_MS,
      }),
    ).toBe("unconfirmed");
  });

  it("reports unconfirmed when the only response is an accounted-for one", () => {
    expect(
      watchTransition({
        submittedAt: 1_000,
        respondedAt: 900,
        consumedAt: 900,
        now: 1_000 + CONFIRMATION_BUDGET_MS,
      }),
    ).toBe("unconfirmed");
  });

  it("prefers the lost render when both budgets have elapsed", () => {
    expect(
      watchTransition({
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
  it("does not take another write's reply for a save's own (owner, 9 Nov 2026)", () => {
    // A coach's answer asked for at 1 s, answered at 60 s; Save at 90 s.
    const entries = [
      { name: actionUrl, startTime: 1_000, responseEnd: 60_000 },
    ];
    const submittedAt = 90_000;
    const own = latestActionResponseAt(
      entries,
      actionUrl,
      submittedAt - OWN_REQUEST_SLACK_MS,
    );
    expect(own).toBeNull();
    expect(
      watchTransition({
        submittedAt,
        respondedAt: own,
        consumedAt: null,
        now: submittedAt + 1_000,
      }),
    ).toBe("waiting");

    // The save's own reply, even one that beat its pending render, counts.
    const fast = [
      ...entries,
      { name: actionUrl, startTime: submittedAt - 40, responseEnd: 89_990 },
    ];
    expect(
      latestActionResponseAt(
        fast,
        actionUrl,
        submittedAt - OWN_REQUEST_SLACK_MS,
      ),
    ).toBe(89_990);
  });
});

describe("the reply to one of several writes to one address", () => {
  it("waits while any write sent has not answered", () => {
    // Two ticks a moment apart: one reply in is as likely either's.
    expect(replyForWrite([100, 300], [900])).toBeNull();
  });

  it("is the newest reply once every write has answered", () => {
    expect(replyForWrite([100, 300], [1_200, 900])).toBe(1_200);
  });

  it("names this page's mutation responses only", () => {
    expect(
      actionResponseTimes(
        [
          { name: "https://app.test/home/plan/roadmap", responseEnd: 10 },
          {
            name: "https://app.test/home/plan/roadmap?_rsc=1",
            responseEnd: 20,
          },
          { name: "https://app.test/home/plan/roadmap", responseEnd: 0 },
        ],
        "https://app.test/home/plan/roadmap",
      ),
    ).toEqual([10]);
  });
});
