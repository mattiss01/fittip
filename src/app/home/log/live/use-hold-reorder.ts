"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

/** How long a finger rests on a card before it lifts (touch and pen). */
const HOLD_MS = 350;
/** How far a finger may wander while holding, or a mouse before it drags. */
const SLOP_PX = 8;
/** How near the top or bottom of the screen the page starts to scroll. */
const EDGE_PX = 80;
/** How far the page scrolls each frame while it does. */
const SCROLL_PX = 10;

/** What a card's head spreads onto itself to be held. */
export type HoldProps = {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onDragStart: (event: ReactDragEvent<HTMLElement>) => void;
};

/**
 * Reordering the live workout's activities by holding one and dragging it
 * (owner, 28 Oct 2026), as a session is dragged to another day on the plan:
 * a finger rests on a card's head for a moment to lift it, so a swipe still
 * scrolls; a mouse lifts it on the first few pixels of a drag. The lifted
 * card takes the place under the pointer as it moves, the page scrolls when
 * the pointer nears an edge, and letting go leaves it there. A tap is still
 * a tap.
 */
export function useHoldReorder(
  list: RefObject<HTMLOListElement | null>,
  onMoveTo: (key: string, index: number) => void,
) {
  const [dragging, setDragging] = useState<string | null>(null);
  const draggingRef = useRef<string | null>(null);
  const pointerY = useRef(0);
  const pending = useRef<{
    key: string;
    pointerId: number;
    startX: number;
    startY: number;
    timer: number | null;
  } | null>(null);
  // The click that ends a hold lands on the card's head; it must not fold it.
  const swallowClick = useRef(false);
  const moveRef = useRef(onMoveTo);
  useEffect(() => {
    moveRef.current = onMoveTo;
  });

  const drag = useCallback((key: string | null) => {
    draggingRef.current = key;
    setDragging(key);
  }, []);

  /** Moves the lifted card to the place under the pointer. */
  const place = useCallback(() => {
    const key = draggingRef.current;
    const items = list.current?.children;
    if (key === null || !items) return;
    const y = pointerY.current;
    let index = items.length - 1;
    for (const [position, item] of [...items].entries()) {
      const box = item.getBoundingClientRect();
      if (y < box.top + box.height / 2) {
        index = position;
        break;
      }
    }
    moveRef.current(key, index);
  }, [list]);

  const lift = useCallback(
    (y: number) => {
      const held = pending.current;
      if (held === null) return;
      if (held.timer !== null) window.clearTimeout(held.timer);
      pending.current = null;
      swallowClick.current = true;
      pointerY.current = y;
      navigator.vibrate?.(10);
      drag(held.key);
    },
    [drag],
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
          if (event.pointerType === "mouse") lift(event.clientY);
          else cancelPending();
        }
        return;
      }
      if (draggingRef.current === null) return;
      pointerY.current = event.clientY;
      place();
    }
    function onUp() {
      cancelPending();
      // A release without a click (a finger that moved) leaves nothing to
      // swallow, so the next tap elsewhere is not eaten.
      window.setTimeout(() => {
        swallowClick.current = false;
      }, 50);
      drag(null);
    }
    function onCancel() {
      cancelPending();
      drag(null);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    // While a card is lifted the page must not scroll under the finger.
    function onTouchMove(event: TouchEvent) {
      if (draggingRef.current !== null) event.preventDefault();
    }
    function onClick(event: MouseEvent) {
      if (!swallowClick.current) return;
      swallowClick.current = false;
      event.preventDefault();
      event.stopPropagation();
    }
    function onContextMenu(event: Event) {
      if (pending.current !== null || draggingRef.current !== null) {
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
  }, [cancelPending, drag, lift, place]);

  // Scrolls while the pointer rests near an edge, so a card can travel
  // further than the screen shows. The top edge is below the sticky clock.
  useEffect(() => {
    if (dragging === null) return;
    let frame = 0;
    const tick = () => {
      const head = list.current
        ?.closest("[data-live-workout]")
        ?.querySelector("header");
      const top = (head?.getBoundingClientRect().bottom ?? 0) + EDGE_PX;
      const bottom = window.innerHeight - EDGE_PX;
      const y = pointerY.current;
      const by = y < top ? -SCROLL_PX : y > bottom ? SCROLL_PX : 0;
      if (by !== 0) {
        window.scrollBy(0, by);
        place();
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [dragging, list, place]);

  const hold = useCallback(
    (key: string): HoldProps => ({
      onPointerDown(event: ReactPointerEvent<HTMLElement>) {
        if (event.button !== 0 || draggingRef.current !== null) return;
        // The name being typed keeps its own long press.
        if ((event.target as Element).closest("input, textarea")) return;
        swallowClick.current = false;
        const { clientX, clientY, pointerId, pointerType } = event;
        pending.current = {
          key,
          pointerId,
          startX: clientX,
          startY: clientY,
          timer:
            pointerType === "mouse"
              ? null
              : window.setTimeout(() => lift(clientY), HOLD_MS),
        };
      },
      onDragStart(event: ReactDragEvent<HTMLElement>) {
        event.preventDefault();
      },
    }),
    [lift],
  );

  return { dragging, hold };
}
