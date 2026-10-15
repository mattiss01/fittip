"use client";

import { createContext, type RefObject } from "react";

/**
 * What a compose form in the "New roadmap" sheet keeps outside itself.
 *
 * The sheet unmounts the form when it closes, and two things must outlast
 * that. The idempotency key: a dropped reply followed by Close, the button
 * and a second press has to replay the first attempt, not buy a second
 * coaching call. And the fact that a request is under way, so the sheet stays
 * open, and the form's lost-render watch with it, until the reply is in.
 *
 * Absent for a form on the page itself, which is never unmounted by a close
 * and keeps its own key.
 */
export type RoadmapComposeSession = {
  idempotencyKey: RefObject<string | null>;
  setPending: (pending: boolean) => void;
  /**
   * Closes the sheet. A roadmap written by hand calls it once it is in force:
   * the sheet is still mounted then, where a generation that lands unmounts it.
   */
  close: () => void;
};

export const RoadmapComposeSessionContext =
  createContext<RoadmapComposeSession | null>(null);

/**
 * When a request from the sheet lands, the page swaps the form, the sheet and
 * the button that opened it for what was made, and focus has nowhere to go
 * but the page's start. The sheet notes that it was unmounted while open, and
 * the first `RoadmapLandingFocus` to mount moves focus to its heading. A note
 * nobody takes in a moment is stale: the page was left instead.
 */
let landedAt: number | null = null;
const LANDING_WINDOW_MS = 2_000;

export function noteRoadmapLanding() {
  landedAt = performance.now();
}

export function takeRoadmapLanding(): boolean {
  const fresh =
    landedAt !== null && performance.now() - landedAt < LANDING_WINDOW_MS;
  landedAt = null;
  return fresh;
}
