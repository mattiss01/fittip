import { describe, expect, it } from "vitest";

import {
  BLEND_SECONDS,
  captionAt,
  COACH_WAIT_CAPTIONS,
  formatElapsed,
  frameAt,
  SCENE_SECONDS,
  showsSlowNote,
} from "./coach-wait-model";

describe("coach wait captions", () => {
  it("shows one line every 4 seconds, in order, and loops", () => {
    const plan = COACH_WAIT_CAPTIONS.plan;
    expect(captionAt(0, "plan")).toBe(
      "Thinking about what's best for your goals.",
    );
    expect(captionAt(3.99, "plan")).toBe(plan[0]);
    expect(captionAt(4, "plan")).toBe("Fitting sessions around your week.");
    expect(captionAt(19.9, "plan")).toBe(
      "Making sure there's room to recover.",
    );
    expect(captionAt(20, "plan")).toBe(plan[0]);
    expect(captionAt(61, "plan")).toBe(plan[0]);
  });

  it("speaks of what was asked for: a roadmap, or one session", () => {
    expect(captionAt(8, "roadmap")).toBe(
      "Breaking the months ahead into phases.",
    );
    expect(captionAt(12, "fill")).toBe("Working out sets, reps and times.");
    for (const kind of ["roadmap", "fill"] as const) {
      expect(COACH_WAIT_CAPTIONS[kind].join(" ")).not.toMatch(/week/i);
    }
  });

  it("never says the end is near, as the lines loop (owner, 20 Oct 2026)", () => {
    for (const lines of Object.values(COACH_WAIT_CAPTIONS)) {
      expect(lines).toHaveLength(5);
      expect(lines.join(" ")).not.toMatch(/finish|almost|nearly|done/i);
    }
  });
});

describe("the time waited", () => {
  it("adds that it can take up to a minute once 30 seconds have passed", () => {
    expect(showsSlowNote(0)).toBe(false);
    expect(showsSlowNote(29.99)).toBe(false);
    expect(showsSlowNote(30)).toBe(true);
    expect(showsSlowNote(75)).toBe(true);
  });

  it("reads as a stopwatch", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(9.7)).toBe("0:09");
    expect(formatElapsed(61)).toBe("1:01");
  });
});

describe("the sport a moment shows", () => {
  it("holds a sport, then blends into the next with a jump and a full turn", () => {
    const held = frameAt(1, false, 7);
    expect(held).toMatchObject({
      scene: 0,
      next: 1,
      blend: 0,
      lift: 0,
      turn: 0,
    });

    const mid = frameAt(SCENE_SECONDS - BLEND_SECONDS / 2, false, 7);
    expect(mid.blend).toBeCloseTo(0.5);
    expect(mid.lift).toBeCloseTo(-22);
    expect(mid.turn).toBeCloseTo(180);

    expect(frameAt(SCENE_SECONDS, false, 7)).toMatchObject({
      scene: 1,
      next: 2,
      blend: 0,
    });
    expect(frameAt(7 * SCENE_SECONDS + 1, false, 7).scene).toBe(0);
  });

  it("under reduced motion shows a still pose, the next sport every 4 seconds", () => {
    for (const t of [
      0,
      1,
      SCENE_SECONDS - 0.1,
      SCENE_SECONDS - BLEND_SECONDS / 2,
    ]) {
      expect(frameAt(t, true, 7)).toEqual({
        scene: 0,
        next: 1,
        blend: 0,
        poseTime: 0.3,
        lift: 0,
        turn: 0,
      });
    }
    expect(frameAt(SCENE_SECONDS, true, 7).scene).toBe(1);
    expect(frameAt(SCENE_SECONDS * 2.5, true, 7).poseTime).toBe(0.3);
  });
});
