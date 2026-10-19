"use client";

import { useRef, useState, type TouchEvent } from "react";

/** How far a card swiped left sits: room for Cancel and Delete. */
export const SWIPE_OPEN_PX = 152;
/** How far a card swiped right sits: room for Edit. */
export const SWIPE_EDIT_PX = 84;
/** How far a finger moves sideways before it is a swipe and not a tap. */
const START_PX = 10;

/** Which side a card is swiped open to, if any. */
export type SwipeSide = "actions" | "edit";

/**
 * Swiping a Plan card shows what it can be done with there and then (owner,
 * 19 Oct 2026): to the left Cancel and Delete, to the right Edit. A finger
 * that moves more up or down than sideways is a scroll and is left alone;
 * one that holds still is the drag to another day (`plan-drag.tsx`), which
 * lifts only when the finger has not moved. Past half-way the card stays
 * open, otherwise it springs back. Touch only: a mouse has the session's
 * own page.
 */
export function useSwipe({
  enabled,
  canEdit,
  open,
  onOpen,
  onClose,
}: {
  enabled: boolean;
  /** Whether the right-hand side, Edit, is offered. */
  canEdit: boolean;
  open: SwipeSide | null;
  onOpen: (side: SwipeSide) => void;
  onClose: () => void;
}) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const swiping = useRef(false);
  // While a finger moves the card, where it is; otherwise it rests.
  const [dragX, setDragX] = useState<number | null>(null);

  const rest =
    open === "actions" ? -SWIPE_OPEN_PX : open === "edit" ? SWIPE_EDIT_PX : 0;
  const offset = dragX ?? rest;

  if (!enabled) return { offset: 0, moving: false, handlers: {} };

  return {
    offset,
    moving: dragX !== null,
    handlers: {
      onTouchStart(event: TouchEvent<HTMLElement>) {
        const touch = event.touches[0];
        start.current = { x: touch.clientX, y: touch.clientY };
        swiping.current = false;
      },
      onTouchMove(event: TouchEvent<HTMLElement>) {
        const from = start.current;
        if (from === null) return;
        const touch = event.touches[0];
        const dx = touch.clientX - from.x;
        const dy = touch.clientY - from.y;
        if (!swiping.current) {
          if (Math.abs(dx) < START_PX || Math.abs(dx) < Math.abs(dy)) {
            // Mostly up or down: a scroll, and the swipe is over before it
            // began.
            if (Math.abs(dy) > START_PX) start.current = null;
            return;
          }
          swiping.current = true;
        }
        setDragX(
          Math.min(
            canEdit ? SWIPE_EDIT_PX : 0,
            Math.max(-SWIPE_OPEN_PX, rest + dx),
          ),
        );
      },
      onTouchEnd() {
        start.current = null;
        if (!swiping.current) return;
        swiping.current = false;
        const landed = dragX ?? rest;
        setDragX(null);
        if (landed < -SWIPE_OPEN_PX / 2) onOpen("actions");
        else if (landed > SWIPE_EDIT_PX / 2) onOpen("edit");
        else onClose();
      },
    },
  };
}
