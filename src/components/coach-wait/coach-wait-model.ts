/**
 * The parts of the coach wait that are not drawing: which sport and blend a
 * moment shows, which caption, and when the "up to a minute" note appears.
 * The owner chose this design on 20 Oct 2026 (concept W1 in
 * docs/product/design/coach-wait-concepts.html), without the sport's name.
 */

/** Seconds on each sport, and how much of its end blends into the next. */
export const SCENE_SECONDS = 4;
export const BLEND_SECONDS = 1.1;
/** The moment a still pose is drawn at, under reduced motion. */
const STILL_AT = 0.3;

/** What the coach was asked for: a week's plan, a roadmap, or one session. */
export type CoachWaitKind = "plan" | "roadmap" | "fill";

/**
 * The owner accepted these on 20 Oct 2026 over the item's "no invented steps"
 * rule, knowing the app cannot see what the coach is doing: they describe the
 * kind of work, not a step it has reached. Do not "fix" them into facts. They
 * loop, so none of them may say the end is near ("finishing touches" was
 * dropped for that). One set per kind of request (owner, 20 Oct 2026), so a
 * roadmap is not "fitted around your week"; asking again uses its kind's.
 */
export const COACH_WAIT_CAPTIONS: Record<CoachWaitKind, readonly string[]> = {
  plan: [
    "Thinking about what's best for your goals.",
    "Fitting sessions around your week.",
    "Looking at how your last weeks went.",
    "Balancing hard days with easy ones.",
    "Making sure there's room to recover.",
  ],
  roadmap: [
    "Thinking about where you want to get to.",
    "Looking at how your training has gone so far.",
    "Breaking the months ahead into phases.",
    "Setting milestones along the way.",
    "Leaving room to recover between phases.",
  ],
  fill: [
    "Thinking about what this session is for.",
    "Looking at what you usually do.",
    "Choosing activities that fit the session.",
    "Working out sets, reps and times.",
    "Keeping the session within your limits.",
  ],
};

export const CAPTION_SECONDS = 4;
export const SLOW_NOTE_AFTER_SECONDS = 30;
export const SLOW_NOTE = "This can take up to a minute.";

export function captionAt(elapsed: number, kind: CoachWaitKind): string {
  const lines = COACH_WAIT_CAPTIONS[kind];
  const index = Math.floor(Math.max(0, elapsed) / CAPTION_SECONDS);
  return lines[index % lines.length];
}

export function showsSlowNote(elapsed: number): boolean {
  return elapsed >= SLOW_NOTE_AFTER_SECONDS;
}

/** m:ss, as a stopwatch reads. */
export function formatElapsed(elapsed: number): string {
  const seconds = Math.floor(Math.max(0, elapsed));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const smooth = (x: number) => {
  const c = clamp01(x);
  return c * c * (3 - 2 * c);
};

export type WaitFrame = {
  /** The sport shown, and the one it blends into. */
  scene: number;
  next: number;
  /** 0 until the last BLEND_SECONDS of a sport, then up to 1. */
  blend: number;
  /** The time the poses are drawn at: frozen under reduced motion. */
  poseTime: number;
  /** Lift and turn of the jump between sports, in px and degrees. */
  lift: number;
  turn: number;
};

/**
 * What one moment shows. Under reduced motion there is no blend, jump or
 * turn: a still pose, changed to the next sport every SCENE_SECONDS.
 */
export function frameAt(
  elapsed: number,
  reduced: boolean,
  scenes: number,
): WaitFrame {
  const t = Math.max(0, elapsed);
  const scene = Math.floor(t / SCENE_SECONDS) % scenes;
  const next = (scene + 1) % scenes;
  if (reduced) {
    return { scene, next, blend: 0, poseTime: STILL_AT, lift: 0, turn: 0 };
  }
  const blend = smooth(
    ((t % SCENE_SECONDS) - (SCENE_SECONDS - BLEND_SECONDS)) / BLEND_SECONDS,
  );
  const jumping = blend > 0 && blend < 1;
  return {
    scene,
    next,
    blend,
    poseTime: t,
    lift: jumping ? -22 * Math.sin(Math.PI * blend) : 0,
    turn: jumping ? 360 * blend : 0,
  };
}
