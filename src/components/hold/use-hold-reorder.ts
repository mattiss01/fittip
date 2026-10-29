"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from "react";

import { useHoldGesture, type HoldProps } from "./use-hold-gesture";

export type { HoldProps };

/** How near the top or bottom of the screen the page starts to scroll. */
const EDGE_PX = 80;
/** How far the page scrolls each frame while it does. */
const SCROLL_PX = 10;

/** What a control spreads onto itself to move its item with the arrow keys. */
export type KeyMoveProps = {
  "data-hold-move": true;
  "aria-keyshortcuts": string;
  onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
};

/**
 * Reordering a list by holding an item and dragging it (owner, 28 Oct 2026):
 * the live workout's activities, a session's activities in the editor, the
 * log's "What you did" and a strength activity's set groups. The lifted item
 * takes the place under the pointer as it moves, the page scrolls when the
 * pointer nears an edge, and letting go leaves it there; Escape puts it back.
 *
 * Each item, a direct child of `list`, carries its stable key as
 * `data-hold-key`. Without a pointer, the arrow keys on any control given
 * `keys(key)` move its item, and focus follows it: moving an element in the
 * page takes the focus off it.
 *
 * `top` is where the screen's own top edge is for scrolling, below anything
 * sticky; the window's top when absent.
 */
export function useHoldReorder(
  list: RefObject<HTMLElement | null>,
  onMoveTo: (key: string, index: number) => void,
  top?: () => number,
) {
  const [dragging, setDragging] = useState<string | null>(null);
  const draggingRef = useRef<string | null>(null);
  const pointerY = useRef(0);
  // Where the lifted item was, for Escape to put it back.
  const origin = useRef(0);
  // The control a keyboard move came from, to focus again once it has moved.
  const refocus = useRef<{ key: string; at: number } | null>(null);
  const moveRef = useRef(onMoveTo);
  const topRef = useRef(top);
  useEffect(() => {
    moveRef.current = onMoveTo;
    topRef.current = top;
  });

  const drag = useCallback((key: string | null) => {
    draggingRef.current = key;
    setDragging(key);
  }, []);

  /**
   * Moves the lifted item to the place under the pointer: after every other
   * item whose middle is above it. The lifted item itself is not counted, or
   * a short item held over a tall one would swap with it on every move.
   */
  const place = useCallback(() => {
    const key = draggingRef.current;
    if (key === null) return;
    let index = 0;
    for (const item of itemsOf(list.current)) {
      if (item.dataset.holdKey === key) continue;
      const box = item.getBoundingClientRect();
      if (pointerY.current > box.top + box.height / 2) index += 1;
    }
    moveRef.current(key, index);
  }, [list]);

  const hold = useHoldGesture<string>({
    onLift(key, _x, y) {
      origin.current = itemsOf(list.current).findIndex(
        (item) => item.dataset.holdKey === key,
      );
      pointerY.current = y;
      drag(key);
    },
    onMove(_x, y) {
      pointerY.current = y;
      place();
    },
    onDrop() {
      drag(null);
    },
    onCancel() {
      const key = draggingRef.current;
      if (key !== null && origin.current >= 0) {
        moveRef.current(key, origin.current);
      }
      drag(null);
    },
  });

  // Scrolls while the pointer rests near an edge, so an item can travel
  // further than the screen shows.
  useEffect(() => {
    if (dragging === null) return;
    let frame = 0;
    const tick = () => {
      const upper = (topRef.current?.() ?? 0) + EDGE_PX;
      const lower = window.innerHeight - EDGE_PX;
      const y = pointerY.current;
      const by = y < upper ? -SCROLL_PX : y > lower ? SCROLL_PX : 0;
      if (by !== 0) {
        window.scrollBy(0, by);
        place();
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [dragging, place]);

  // After a keyboard move has rendered, the control it came from is focused
  // again. Set only when a move was made, so no later render steals focus.
  useEffect(() => {
    const target = refocus.current;
    if (target === null) return;
    refocus.current = null;
    const item = itemsOf(list.current).find(
      (element) => element.dataset.holdKey === target.key,
    );
    item?.querySelectorAll<HTMLElement>("[data-hold-move]")[target.at]?.focus();
  });

  const keys = useCallback(
    (key: string): KeyMoveProps => ({
      "data-hold-move": true,
      "aria-keyshortcuts": "ArrowUp ArrowDown",
      onKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
        event.preventDefault();
        const all = itemsOf(list.current);
        const from = all.findIndex((item) => item.dataset.holdKey === key);
        const to = from + (event.key === "ArrowUp" ? -1 : 1);
        if (from < 0 || to < 0 || to >= all.length) return;
        const controls = [
          ...all[from].querySelectorAll<HTMLElement>("[data-hold-move]"),
        ];
        refocus.current = {
          key,
          at: Math.max(0, controls.indexOf(event.currentTarget)),
        };
        moveRef.current(key, to);
      },
    }),
    [list],
  );

  return { dragging, hold, keys };
}

/** The list's items, each carrying its key as `data-hold-key`. */
function itemsOf(list: HTMLElement | null): HTMLElement[] {
  return [...(list?.children ?? [])] as HTMLElement[];
}
