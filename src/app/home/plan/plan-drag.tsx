"use client";

import { useCallback, useRef, useState } from "react";

import w from "./plan-week.module.css";

import { useHoldGesture } from "@/components/hold/use-hold-gesture";

export type PlanDragSession = { id: string; title: string; localDate: string };

type Drag = {
  session: PlanDragSession;
  x: number;
  y: number;
  /** The open day under the pointer, if it is not the session's own. */
  overDate: string | null;
};

/**
 * Moving a session to another day by dragging its card (owner, 19 Oct 2026),
 * with the hold every list shares (`useHoldGesture`).
 *
 * The card follows the pointer as a small label, the open day under it is
 * marked, and letting go there moves the session, through the Plan's own
 * `move`. Letting go anywhere else, or Escape, puts it back. A tap is still
 * a tap: it opens the session.
 *
 * Only an open day takes a session: not one before today and not one past
 * the plan's window, which the server refuses as well.
 */
export function usePlanDrag(onDrop: (sessionId: string, date: string) => void) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);

  const update = useCallback((next: Drag | null) => {
    dragRef.current = next;
    setDrag(next);
  }, []);

  const hold = useHoldGesture<PlanDragSession>({
    onLift(session, x, y) {
      update({ session, x, y, overDate: dayUnder(x, y, session.localDate) });
    },
    onMove(x, y) {
      const current = dragRef.current;
      if (current === null) return;
      update({
        ...current,
        x,
        y,
        overDate: dayUnder(x, y, current.session.localDate),
      });
    },
    onDrop() {
      const current = dragRef.current;
      update(null);
      if (current?.overDate) onDrop(current.session.id, current.overDate);
    },
    onCancel() {
      update(null);
    },
  });

  /** What a draggable card spreads onto itself. */
  const handle = useCallback(
    (session: PlanDragSession) => ({
      ...hold(session),
      "data-draggable": true,
      "data-dragging": drag?.session.id === session.id || undefined,
    }),
    [drag, hold],
  );

  const ghost =
    drag === null ? null : (
      <div
        className={w.dragGhost}
        aria-hidden="true"
        style={{ left: drag.x, top: drag.y }}
      >
        {drag.session.title}
      </div>
    );

  return { handle, overDate: drag?.overDate ?? null, ghost };
}

/** The open day under a point, unless it is the one the session is on. */
function dayUnder(x: number, y: number, from: string): string | null {
  const day = document
    .elementFromPoint?.(x, y)
    ?.closest<HTMLElement>("[data-plan-date]");
  if (!day) return null;
  if (day.dataset.past === "true" || day.dataset.beyond === "true") {
    return null;
  }
  const date = day.dataset.planDate ?? null;
  return date === from ? null : date;
}
