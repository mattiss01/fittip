"use client";

import {
  useCallback,
  useEffect,
  useRef,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

/** How long a finger rests on an item before it lifts (touch and pen). */
const HOLD_MS = 350;
/** How far a finger may wander while holding, or a mouse before it drags. */
const SLOP_PX = 8;

/** What a holdable item spreads onto itself. */
export type HoldProps = {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onDragStart: (event: ReactDragEvent<HTMLElement>) => void;
};

/** What a lifted item does; the gesture itself is the same everywhere. */
export type HoldGesture<T> = {
  onLift: (item: T, x: number, y: number) => void;
  onMove: (x: number, y: number) => void;
  /** Let go: what the move means is the caller's. */
  onDrop: () => void;
  /** Escape, or the browser took the pointer away: put it back. */
  onCancel: () => void;
};

/**
 * Holding something and dragging it, as every list and the plan's week do it
 * (owner, 19 and 28 Oct 2026), so a fix found on the phone lands in all of
 * them. A finger rests on the item for a moment to lift it, so a swipe still
 * scrolls; a mouse lifts it on the first few pixels of a drag. A tap is still
 * a tap, and the click that ends a drag is swallowed. While an item is lifted
 * the page does not scroll under the finger. A press on a text field is left
 * to the field, which keeps its own long press.
 */
export function useHoldGesture<T>(gesture: HoldGesture<T>) {
  const lifted = useRef(false);
  const pending = useRef<{
    item: T;
    pointerId: number;
    startX: number;
    startY: number;
    timer: number | null;
  } | null>(null);
  const swallowClick = useRef(false);
  const gestureRef = useRef(gesture);
  useEffect(() => {
    gestureRef.current = gesture;
  });

  const lift = useCallback((x: number, y: number) => {
    const held = pending.current;
    if (held === null) return;
    if (held.timer !== null) window.clearTimeout(held.timer);
    pending.current = null;
    swallowClick.current = true;
    lifted.current = true;
    document.addEventListener("touchmove", holdPage, { passive: false });
    navigator.vibrate?.(10);
    gestureRef.current.onLift(held.item, x, y);
  }, []);

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
      if (lifted.current)
        gestureRef.current.onMove(event.clientX, event.clientY);
    }
    function onUp() {
      cancelPending();
      // A release without a click (a finger that moved) leaves nothing to
      // swallow, so the next tap elsewhere is not eaten.
      window.setTimeout(() => {
        swallowClick.current = false;
      }, 50);
      if (!lifted.current) return;
      settle();
      gestureRef.current.onDrop();
    }
    function onCancel() {
      cancelPending();
      if (!lifted.current) return;
      settle();
      gestureRef.current.onCancel();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    function settle() {
      lifted.current = false;
      document.removeEventListener("touchmove", holdPage);
    }
    function onClick(event: MouseEvent) {
      if (!swallowClick.current) return;
      swallowClick.current = false;
      event.preventDefault();
      event.stopPropagation();
    }
    function onContextMenu(event: Event) {
      if (pending.current !== null || lifted.current) event.preventDefault();
    }
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onCancel);
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick, true);
    document.addEventListener("contextmenu", onContextMenu);
    return () => {
      cancelPending();
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onCancel);
      document.removeEventListener("keydown", onKey);
      if (lifted.current) document.removeEventListener("touchmove", holdPage);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("contextmenu", onContextMenu);
    };
  }, [cancelPending, lift]);

  return useCallback(
    (item: T): HoldProps => ({
      onPointerDown(event: ReactPointerEvent<HTMLElement>) {
        // One finger lifts an item; a second one on the screen is ignored.
        if (!event.isPrimary || event.button !== 0) return;
        if (lifted.current || pending.current !== null) return;
        if ((event.target as Element).closest("input, textarea, select")) {
          return;
        }
        swallowClick.current = false;
        const { clientX, clientY, pointerId, pointerType } = event;
        pending.current = {
          item,
          pointerId,
          startX: clientX,
          startY: clientY,
          timer:
            pointerType === "mouse"
              ? null
              : window.setTimeout(() => lift(clientX, clientY), HOLD_MS),
        };
      },
      // A link or an image would otherwise start the browser's own drag.
      onDragStart(event: ReactDragEvent<HTMLElement>) {
        event.preventDefault();
      },
    }),
    [lift],
  );
}

/**
 * Keeps the page still under a finger carrying an item. Listened for only
 * while one is lifted: a non-passive touchmove on the page makes the browser
 * wait on it before every scroll.
 */
function holdPage(event: TouchEvent) {
  event.preventDefault();
}
