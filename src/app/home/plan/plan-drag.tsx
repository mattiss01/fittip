"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import w from "./plan-week.module.css";

/** How long a finger rests on a card before it lifts (touch and pen). */
const HOLD_MS = 350;
/** How far a finger may wander while holding, or a mouse before it drags. */
const SLOP_PX = 8;

export type PlanDragSession = { id: string; title: string; localDate: string };

type Drag = {
  session: PlanDragSession;
  x: number;
  y: number;
  /** The open day under the pointer, if it is not the session's own. */
  overDate: string | null;
};

/**
 * Moving a session to another day by dragging its card (owner, 19 Oct 2026).
 *
 * A finger holds the card for a moment to lift it, so a swipe still scrolls
 * the week; a mouse lifts it on the first few pixels of a drag. The card then
 * follows the pointer as a small label, the open day under it is marked, and
 * letting go there moves the session, through the Plan's own `move`. Letting
 * go anywhere else, or Escape, puts it back. A tap is still a tap: it opens
 * the session.
 *
 * Only an open day takes a session: not one before today and not one past
 * the plan's window, which the server refuses as well.
 */
export function usePlanDrag(onDrop: (sessionId: string, date: string) => void) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const pending = useRef<{
    session: PlanDragSession;
    pointerId: number;
    startX: number;
    startY: number;
    timer: number | null;
  } | null>(null);
  // The click that ends a drag lands on the card's link; it must not open it.
  const swallowClick = useRef(false);
  const dropRef = useRef(onDrop);
  useEffect(() => {
    dropRef.current = onDrop;
  });

  const update = useCallback((next: Drag | null) => {
    dragRef.current = next;
    setDrag(next);
  }, []);

  const lift = useCallback(
    (x: number, y: number) => {
      const held = pending.current;
      if (held === null) return;
      if (held.timer !== null) window.clearTimeout(held.timer);
      pending.current = null;
      swallowClick.current = true;
      navigator.vibrate?.(10);
      update({
        session: held.session,
        x,
        y,
        overDate: dayUnder(x, y, held.session.localDate),
      });
    },
    [update],
  );

  const cancelPending = useCallback(() => {
    const held = pending.current;
    if (held?.timer != null) window.clearTimeout(held.timer);
    pending.current = null;
  }, []);

  useEffect(() => {
    function onMove(event: PointerEvent) {
      const held = pending.current;
      if (held !== null && event.pointerId === held.pointerId) {
        const moved = Math.hypot(
          event.clientX - held.startX,
          event.clientY - held.startY,
        );
        if (moved > SLOP_PX) {
          // A mouse drags; a finger that moves before the hold is a scroll.
          if (event.pointerType === "mouse") lift(event.clientX, event.clientY);
          else cancelPending();
        }
        return;
      }
      const current = dragRef.current;
      if (current === null) return;
      update({
        ...current,
        x: event.clientX,
        y: event.clientY,
        overDate: dayUnder(
          event.clientX,
          event.clientY,
          current.session.localDate,
        ),
      });
    }
    function onUp() {
      cancelPending();
      // A release without a click (a finger that moved) leaves nothing to
      // swallow, so the next tap elsewhere is not eaten.
      window.setTimeout(() => {
        swallowClick.current = false;
      }, 50);
      const current = dragRef.current;
      if (current === null) return;
      update(null);
      if (current.overDate !== null) {
        dropRef.current(current.session.id, current.overDate);
      }
    }
    function onCancel() {
      cancelPending();
      update(null);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    // While a card is lifted the page must not scroll under the finger.
    function onTouchMove(event: TouchEvent) {
      if (dragRef.current !== null) event.preventDefault();
    }
    function onClick(event: MouseEvent) {
      if (!swallowClick.current) return;
      swallowClick.current = false;
      event.preventDefault();
      event.stopPropagation();
    }
    function onContextMenu(event: Event) {
      if (pending.current !== null || dragRef.current !== null) {
        event.preventDefault();
      }
    }
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onCancel);
    document.addEventListener("keydown", onKey);
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("click", onClick, true);
    document.addEventListener("contextmenu", onContextMenu);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onCancel);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("contextmenu", onContextMenu);
    };
  }, [cancelPending, lift, update]);

  /** What a draggable card spreads onto itself. */
  const handle = useCallback(
    (session: PlanDragSession) => ({
      onPointerDown(event: ReactPointerEvent<HTMLElement>) {
        if (event.button !== 0 || dragRef.current !== null) return;
        swallowClick.current = false;
        const { clientX, clientY, pointerId, pointerType } = event;
        pending.current = {
          session,
          pointerId,
          startX: clientX,
          startY: clientY,
          timer:
            pointerType === "mouse"
              ? null
              : window.setTimeout(() => lift(clientX, clientY), HOLD_MS),
        };
      },
      // The card's link would otherwise start the browser's own drag.
      onDragStart(event: ReactDragEvent<HTMLElement>) {
        event.preventDefault();
      },
      "data-draggable": true,
      "data-dragging": drag?.session.id === session.id || undefined,
    }),
    [drag, lift],
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
