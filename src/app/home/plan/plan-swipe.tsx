"use client";

import { useRef, useState, type TouchEvent } from "react";

/** How far an open card sits to the left: room for its two buttons. */
export const SWIPE_OPEN_PX = 152;
/** How far a finger moves sideways before it is a swipe and not a tap. */
const START_PX = 10;

/**
 * Swiping a Plan card to the left shows what it can be done with there and
 * then (owner, 19 Oct 2026): Cancel and Delete. A finger that moves more up
 * or down than sideways is a scroll and is left alone; one that holds still
 * is the drag to another day (`plan-drag.tsx`), which lifts only when the
 * finger has not moved. Past half-way the card stays open, otherwise it
 * springs back. Touch only: a mouse has the session's own page.
 */
export function useSwipe({
  enabled,
  open,
  onOpen,
  onClose,
}: {
  enabled: boolean;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const swiping = useRef(false);
  // While a finger moves the card, where it is; otherwise it rests.
  const [dragX, setDragX] = useState<number | null>(null);

  const rest = open ? -SWIPE_OPEN_PX : 0;
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
        setDragX(Math.min(0, Math.max(-SWIPE_OPEN_PX, rest + dx)));
      },
      onTouchEnd() {
        start.current = null;
        if (!swiping.current) return;
        swiping.current = false;
        const landed = dragX ?? rest;
        setDragX(null);
        if (landed < -SWIPE_OPEN_PX / 2) onOpen();
        else onClose();
      },
    },
  };
}
