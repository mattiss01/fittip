import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useRoadmapWrite } from "./use-roadmap-write";

import type { RoadmapActionState } from "@/app/home/plan/roadmap/action-state";
import { WATCH_INTERVAL_MS } from "@/lib/app-router/transition-watchdog";

/**
 * What the lost-render watch is allowed to conclude, and from what.
 *
 * The watch reads the resource timeline, which is a property of the document
 * rather than of the control reading it. Every control on this surface is
 * removed by the write it performs, so a fresh one mounts *after* a write has
 * already answered and sees that answer replayed to it by `buffered: true`.
 * Nothing about that entry belongs to the control that is now watching, and
 * reading it as this write's reply arms a reload over a write that is still
 * legitimately running — on the accept immediately after a generation, and on
 * the regeneration immediately after a decline.
 *
 * So the two cases here are one pair: everything the timeline already held when
 * a write was submitted is accounted for, and everything after it is not.
 *
 * The clock is stubbed rather than faked wholesale, because the verdict
 * compares `performance.now()` against a `responseEnd` from the same timeline
 * and the test has to place both by hand.
 */

const watch = vi.hoisted(() => ({
  calls: [] as {
    submittedAt: number;
    respondedAt: number | null;
    consumedAt: number | null;
    now: number;
  }[],
}));

vi.mock("@/lib/app-router/transition-watchdog", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/lib/app-router/transition-watchdog")
    >();
  return {
    ...actual,
    watchTransition: (input: Parameters<typeof actual.watchTransition>[0]) => {
      watch.calls.push({ ...input });
      return actual.watchTransition(input);
    },
  };
});

const RECOVERY_FLAG = "fittip.roadmap.recovered:v1";

type ResourceEntry = { name: string; responseEnd: number };

let clock = 0;
let actionUrl = "";
let buffered: ResourceEntry[] = [];
let live: ((entries: ResourceEntry[]) => void)[] = [];

describe("useRoadmapWrite lost-render recovery", () => {
  beforeEach(() => {
    watch.calls.length = 0;
    buffered = [];
    live = [];
    clock = 20_000;
    window.sessionStorage.clear();
    const { origin, pathname, search } = window.location;
    actionUrl = `${origin}${pathname}${search}`;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"],
    });
    vi.stubGlobal("PerformanceObserver", StubPerformanceObserver);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.sessionStorage.clear();
  });

  // The blocker round two found. Before the fix the first tick — 250 ms after
  // submit — declared this write lost, because the newest entry on the timeline
  // was the *previous* write's reply and nothing had accounted for it.
  it("treats a reply that answered before this control existed as accounted for", async () => {
    buffered = [{ name: actionUrl, responseEnd: clock - 5_000 }];
    render(<Probe />);

    await submitWrite();
    // Well past the render grace, with nothing of this write's own answered.
    for (let index = 0; index < 4; index += 1) await tick(WATCH_INTERVAL_MS);

    expect(screen.getByTestId("watch").textContent).toBe("watching");
    expect(window.sessionStorage.getItem(RECOVERY_FLAG)).toBeNull();
    // And the inputs that produced it, so a future change cannot reach the same
    // verdict by a different route: the write's own submit instant is the
    // baseline, and the inherited reply is older than it.
    expect(watch.calls.length).toBeGreaterThan(0);
    for (const call of watch.calls) {
      expect(call.consumedAt).not.toBeNull();
      expect(call.respondedAt).not.toBeNull();
      expect(call.respondedAt!).toBeLessThanOrEqual(call.consumedAt!);
    }
  });

  // The other half: the fix must not buy its silence by ignoring the reply the
  // watch exists to catch, including one that beats the pending render.
  it("still reports a reply that arrived for this write and never rendered", async () => {
    buffered = [{ name: actionUrl, responseEnd: clock - 5_000 }];
    render(<Probe />);

    await submitWrite();
    clock = 20_100;
    await deliver([{ name: actionUrl, responseEnd: clock }]);
    // One tick, 800 ms after that reply: past the render grace, and the reload
    // it arms is still half a second away.
    await tick(800);

    expect(screen.getByTestId("watch").textContent).toBe("lost");
    expect(window.sessionStorage.getItem(RECOVERY_FLAG)).toBe("1");
  });

  // A control mounts, watches nothing, and is unmounted: an owner who opened
  // the surface and left must not be told on their next visit that a page they
  // never wrote on was reloaded.
  it("arms nothing and marks nothing until a write is submitted", async () => {
    buffered = [{ name: actionUrl, responseEnd: clock - 5_000 }];
    render(<Probe />);

    for (let index = 0; index < 4; index += 1) await tick(WATCH_INTERVAL_MS);

    expect(watch.calls).toHaveLength(0);
    expect(screen.getByTestId("watch").textContent).toBe("watching");
    expect(window.sessionStorage.getItem(RECOVERY_FLAG)).toBeNull();
  });
});

/** A write that never answers, so the watch stays armed and can be examined. */
function neverAnswers(): Promise<RoadmapActionState> {
  return new Promise<RoadmapActionState>(() => {});
}

/** Submitted the way every control on this surface submits: a form action. */
function Probe() {
  const write = useRoadmapWrite(neverAnswers);
  return (
    <form action={write.submit}>
      <button type="submit">Write</button>
      <span data-testid="watch">{write.lostRender ? "lost" : "watching"}</span>
    </form>
  );
}

async function submitWrite() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Write" }));
  });
}

/** One watch interval on the timers, and `elapsed` on the stubbed clock. */
async function tick(elapsed: number) {
  clock += elapsed;
  await act(async () => {
    vi.advanceTimersByTime(WATCH_INTERVAL_MS);
  });
}

async function deliver(entries: ResourceEntry[]) {
  await act(async () => {
    for (const notify of live) notify(entries);
  });
}

class StubPerformanceObserver {
  private readonly notify: (entries: ResourceEntry[]) => void;

  constructor(callback: (list: { getEntries: () => ResourceEntry[] }) => void) {
    this.notify = (entries) => callback({ getEntries: () => entries });
  }

  observe(options: { type: string; buffered?: boolean }) {
    live.push(this.notify);
    // `buffered: true` replays what the timeline already holds, synchronously
    // enough that it is there before anything is submitted — which is the whole
    // shape of the defect.
    if (options.buffered) this.notify(buffered);
  }

  disconnect() {
    live = live.filter((notify) => notify !== this.notify);
  }
}
