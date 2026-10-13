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
};

export const RoadmapComposeSessionContext =
  createContext<RoadmapComposeSession | null>(null);
