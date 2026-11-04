"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
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
/** How long the other items take to make room, and a dropped one to land. */
const SLIDE_MS = 200;
/** How long an item takes to rise off the list, and to settle back. */
const LIFT_MS = 160;

const SLIDE = `translate ${SLIDE_MS}ms var(--ease-out)`;
const LIFT = `scale ${LIFT_MS}ms var(--ease-out), box-shadow ${LIFT_MS}ms ease, opacity ${LIFT_MS}ms ease`;

/** What a control spreads onto itself to move its item with the arrow keys. */
export type KeyMoveProps = {
  "data-hold-move": true;
  "aria-keyshortcuts": string;
  "aria-describedby": string;
  onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
};

/**
 * Reordering a list by holding an item and dragging it (owner, 28 Oct 2026):
 * the live workout's activities, a session's activities in the editor, the
 * log's "What you did" and a strength activity's set groups.
 *
 * As the usual sortable lists do it (owner, 4 Nov 2026): the lifted item rises
 * (`data-hold-lifted`, styled in globals.css) and follows the finger exactly;
 * it takes the place whose middle is nearest its own, and the others slide out
 * of its way rather than jump; let go, it glides into its place. The page
 * scrolls when the pointer nears an edge, and Escape puts the item back.
 *
 * Each item, a direct child of `list`, carries its stable key as
 * `data-hold-key`. Without a pointer, the arrow keys on any control given
 * `keys(key)` move its item, and focus follows it: moving an element in the
 * page takes the focus off it. A screen reader hears so from `hint`, which
 * the list renders hidden beside itself (not inside: its children are the
 * items).
 *
 * `top` is where the screen's own top edge is for scrolling, below anything
 * sticky; the window's top when absent.
 */
export function useHoldReorder(
  list: RefObject<HTMLElement | null>,
  onMoveTo: (key: string, index: number) => void,
  top?: () => number,
) {
  const hintId = useId();
  const [dragging, setDragging] = useState<string | null>(null);
  const moveRef = useRef(onMoveTo);
  const topRef = useRef(top);
  useEffect(() => {
    moveRef.current = onMoveTo;
    topRef.current = top;
  });
  // Made once the list is on the page; nothing can be held before then.
  const motion = useRef<ReorderMotion | null>(null);
  useLayoutEffect(() => {
    const made = reorderMotion({
      list: () => list.current,
      moveTo: (key, index) => moveRef.current(key, index),
      top: () => topRef.current?.() ?? 0,
      setDragging,
    });
    motion.current = made;
    return () => made.dispose();
  }, [list]);

  const hold = useHoldGesture<string>({
    onLift: (key, _x, y) => motion.current?.lift(key, y),
    onMove: (_x, y) => motion.current?.move(y),
    onDrop: () => motion.current?.drop(),
    onCancel: () => motion.current?.cancel(),
  });

  // A move has rendered: everything slides from where it showed, and a
  // keyboard move's control is focused again.
  useLayoutEffect(() => motion.current?.rendered());

  useEffect(() => {
    if (dragging === null) return;
    return motion.current?.scrollNearEdges();
  }, [dragging]);

  const keys = useCallback(
    (key: string): KeyMoveProps => ({
      "data-hold-move": true,
      "aria-keyshortcuts": "ArrowUp ArrowDown",
      "aria-describedby": hintId,
      onKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
        event.preventDefault();
        motion.current?.step(
          key,
          event.key === "ArrowUp" ? -1 : 1,
          event.currentTarget,
        );
      },
    }),
    [hintId],
  );

  const hint = {
    id: hintId,
    hidden: true,
    children: "Arrow up or down moves this one in the list.",
  };

  return { hold, keys, hint };
}

/**
 * What the list does on the page while an item is held: kept out of React's
 * render, as it draws on the items directly, frame by frame.
 */
function reorderMotion(page: {
  list: () => HTMLElement | null;
  moveTo: (key: string, index: number) => void;
  /** Where the screen's own top edge is, below anything sticky. */
  top: () => number;
  setDragging: (key: string | null) => void;
}) {
  const { moveTo, top, setDragging } = page;
  let lifted: string | null = null;
  let pointerY = 0;
  // Where the lifted item was, for Escape to put it back.
  let origin = 0;
  // Every item's resting place is read from the list's own top, which moves
  // with whatever scrolls it (the page, or a sheet), and the items' places in
  // it: their own boxes are mid-slide while they make room. `base` turns an
  // item's offsetTop into its distance below the list's top.
  let base = 0;
  // From the item's top edge to the finger, so it does not jump to meet it.
  let grab = 0;
  // The middle of each place below the list's top, as it stood at the lift. A place is chosen against these, not the list as it now stands: a
  // short item moved below a tall one would otherwise sit nearer its old
  // place again and swap back on every move.
  let places: number[] = [];
  // How far the lifted item is drawn from its resting place.
  let shift = 0;
  // Each item's top on screen before a move, to slide from once it renders.
  let slide: { tops: Map<string, number>; key: string; to: number } | null =
    null;
  // The control a keyboard move came from, to focus again once it has moved.
  let refocus: { key: string; at: number } | null = null;
  let tidy: number | null = null;

  const items = () => itemsOf(page.list());
  const itemOf = (key: string | null) =>
    key === null
      ? undefined
      : items().find((item) => item.dataset.holdKey === key);

  function listTop() {
    return page.list()?.getBoundingClientRect().top ?? 0;
  }

  function restingTop(item: HTMLElement) {
    return listTop() + item.offsetTop - base;
  }

  /** Draws the lifted item under the finger. */
  function follow() {
    const item = itemOf(lifted);
    if (item === undefined) return;
    shift = pointerY - grab - restingTop(item);
    item.style.translate = `0 ${shift}px`;
  }

  /** Where every item shows now, the lifted one by its own reckoning. */
  function tops() {
    const result = new Map<string, number>();
    for (const item of items()) {
      const key = item.dataset.holdKey ?? "";
      result.set(
        key,
        key === lifted
          ? restingTop(item) + shift
          : item.getBoundingClientRect().top,
      );
    }
    return result;
  }

  /** Moves `key` to `to`; each item slides there once it has rendered. */
  function moveSliding(key: string, to: number) {
    slide = { tops: tops(), key, to };
    moveTo(key, to);
  }

  /**
   * Slides every item but the lifted one from where it showed to where it
   * rests now: drawn back to the old place, then let go (FLIP).
   */
  function play(from: Map<string, number>) {
    const moving = items().filter((item) => item.dataset.holdKey !== lifted);
    if (reducedMotion()) {
      for (const item of moving) item.style.translate = "";
      return;
    }
    for (const item of moving) {
      item.style.transition = "none";
      item.style.translate = "";
    }
    const deltas = moving.map((item) => {
      const first = from.get(item.dataset.holdKey ?? "");
      return first === undefined ? 0 : first - item.getBoundingClientRect().top;
    });
    moving.forEach((item, index) => {
      if (deltas[index] !== 0) item.style.translate = `0 ${deltas[index]}px`;
    });
    // Read once, so the browser starts each slide from its drawn-back place.
    void page.list()?.offsetHeight;
    for (const item of moving) {
      item.style.transition = `${SLIDE}, ${LIFT}`;
      item.style.translate = "0 0";
    }
  }

  /**
   * Moves the lifted item to the place whose middle is nearest its own.
   * Measured from the item rather than the finger, so a card held by its head
   * moves when it covers the next one.
   */
  function place() {
    const item = itemOf(lifted);
    if (lifted === null || item === undefined) return;
    const middle = pointerY - grab + item.offsetHeight / 2 - listTop();
    let nearest = 0;
    places.forEach((place, index) => {
      if (Math.abs(place - middle) < Math.abs(places[nearest] - middle)) {
        nearest = index;
      }
    });
    if (nearest !== items().indexOf(item)) moveSliding(lifted, nearest);
  }

  /** Clears what the slides left on the items, once they have finished. */
  function tidyLater() {
    if (tidy !== null) window.clearTimeout(tidy);
    tidy = window.setTimeout(() => {
      tidy = null;
      for (const element of items()) {
        element.style.transition = "";
        element.style.translate = "";
      }
    }, SLIDE_MS + 50);
  }

  /** Lets the lifted item down where it rests, gliding the last of the way. */
  function settle() {
    const item = itemOf(lifted);
    page.list()?.removeAttribute("data-hold-active");
    lifted = null;
    shift = 0;
    setDragging(null);
    if (item !== undefined) {
      item.removeAttribute("data-hold-lifted");
      item.style.transition = reducedMotion() ? "none" : `${SLIDE}, ${LIFT}`;
      item.style.translate = "0 0";
    }
    tidyLater();
  }

  return {
    lift(key: string, y: number) {
      const item = itemOf(key);
      if (item === undefined) return;
      if (tidy !== null) window.clearTimeout(tidy);
      tidy = null;
      slide = null;
      // One still gliding from the last drop is measured where it rests.
      for (const element of items()) {
        element.style.transition = "none";
        element.style.translate = "";
      }
      const box = item.getBoundingClientRect();
      base = item.offsetTop - (box.top - listTop());
      grab = y - box.top;
      places = items().map(
        (element) => element.offsetTop - base + element.offsetHeight / 2,
      );
      shift = 0;
      pointerY = y;
      origin = items().indexOf(item);
      for (const element of items()) {
        element.style.transition = `${SLIDE}, ${LIFT}`;
      }
      item.style.transition = LIFT;
      item.setAttribute("data-hold-lifted", "");
      page.list()?.setAttribute("data-hold-active", "");
      lifted = key;
      setDragging(key);
    },

    move(y: number) {
      pointerY = y;
      follow();
      place();
    },

    drop() {
      slide = null;
      settle();
    },

    cancel() {
      const key = lifted;
      const at = items().findIndex((item) => item.dataset.holdKey === key);
      if (key === null || origin < 0 || at === origin) {
        settle();
        return;
      }
      const from = tops();
      settle();
      slide = { tops: from, key, to: origin };
      moveTo(key, origin);
    },

    /** Arrow keys: one place up or down, sliding, with focus kept. */
    step(key: string, by: -1 | 1, control: HTMLElement) {
      const all = items();
      const from = all.findIndex((item) => item.dataset.holdKey === key);
      const to = from + by;
      if (from < 0 || to < 0 || to >= all.length) return;
      const controls = [
        ...all[from].querySelectorAll<HTMLElement>("[data-hold-move]"),
      ];
      refocus = { key, at: Math.max(0, controls.indexOf(control)) };
      moveSliding(key, to);
    },

    rendered() {
      if (slide !== null) {
        const pending = slide;
        const at = items().findIndex(
          (item) => item.dataset.holdKey === pending.key,
        );
        if (at === pending.to) {
          slide = null;
          play(pending.tops);
          if (lifted === null) tidyLater();
        }
      }
      // Wherever the lifted item now rests, even if a move was refused.
      follow();
      // Set only when a move was made, so no later render steals focus.
      if (refocus !== null) {
        const target = refocus;
        refocus = null;
        itemOf(target.key)
          ?.querySelectorAll<HTMLElement>("[data-hold-move]")
          [target.at]?.focus();
      }
    },

    /**
     * Scrolls while the pointer rests near an edge, so an item can travel
     * further than the screen shows. Returns the stop.
     */
    scrollNearEdges() {
      let frame = 0;
      const tick = () => {
        const upper = top() + EDGE_PX;
        const lower = window.innerHeight - EDGE_PX;
        const by =
          pointerY < upper ? -SCROLL_PX : pointerY > lower ? SCROLL_PX : 0;
        if (by !== 0) {
          window.scrollBy(0, by);
          follow();
          place();
        }
        frame = window.requestAnimationFrame(tick);
      };
      frame = window.requestAnimationFrame(tick);
      return () => window.cancelAnimationFrame(frame);
    },

    dispose() {
      if (tidy !== null) window.clearTimeout(tidy);
    },
  };
}

type ReorderMotion = ReturnType<typeof reorderMotion>;

/** The list's items, each carrying its key as `data-hold-key`. */
function itemsOf(list: HTMLElement | null): HTMLElement[] {
  return [...(list?.children ?? [])] as HTMLElement[];
}

function reducedMotion(): boolean {
  return (
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
  );
}
