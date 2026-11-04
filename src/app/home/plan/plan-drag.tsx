"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import w from "./plan-week.module.css";

import { useHoldGesture } from "@/components/hold/use-hold-gesture";

export type PlanDragSession = { id: string; title: string; localDate: string };

/** A week before (-1) or after (1) the one shown. */
export type WeekStep = -1 | 1;

/** How long a session rests at an edge before the week turns, and again. */
const TURN_MS = 600;
/** How near the screen's side counts as its edge. */
const EDGE_PX = 28;

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
 * The card's title follows the pointer, lifted as a held list item is
 * (owner, 4 Nov 2026), the open day under it is marked, and letting go there
 * moves the session, through the Plan's own `move`. Letting go anywhere
 * else, or Escape, puts it back. A tap is still a tap: it opens the session.
 *
 * Another week is reached the way a phone's home screen reaches another
 * page (owner, 4 Nov 2026): rested on a week arrow or the screen's side, the
 * session turns the week after a moment, and on again while it stays there.
 * The arrow it is aimed at is marked meanwhile (`aimed`). `turn` says whether
 * there was a week to turn to.
 *
 * Only an open day takes a session: not one before today and not one past
 * the plan's window, which the server refuses as well.
 */
export function usePlanDrag(
  onDrop: (sessionId: string, date: string) => void,
  turn: (step: WeekStep) => boolean,
) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const [aimed, setAimed] = useState<WeekStep | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const aim = useRef<{ step: WeekStep; timer: number } | null>(null);
  const turnRef = useRef(turn);
  useEffect(() => {
    turnRef.current = turn;
  });

  const update = useCallback((next: Drag | null) => {
    dragRef.current = next;
    setDrag(next);
  }, []);

  /** Starts, keeps or stops the wait before the week turns. */
  const aimAt = useCallback((step: WeekStep | null) => {
    if (aim.current?.step === step) return;
    if (aim.current !== null) window.clearTimeout(aim.current.timer);
    aim.current = null;
    setAimed(step);
    if (step === null) return;
    const toward: WeekStep = step;
    function wait() {
      aim.current = { step: toward, timer: window.setTimeout(go, TURN_MS) };
    }
    function go() {
      if (turnRef.current(toward)) wait();
      else {
        aim.current = null;
        setAimed(null);
      }
    }
    wait();
  }, []);

  useEffect(
    () => () => {
      if (aim.current !== null) window.clearTimeout(aim.current.timer);
    },
    [],
  );

  const hold = useHoldGesture<PlanDragSession>({
    onLift(session, x, y) {
      update({ session, x, y, overDate: dayUnder(x, y, session.localDate) });
    },
    onMove(x, y) {
      const current = dragRef.current;
      if (current === null) return;
      aimAt(edgeUnder(x, y));
      update({
        ...current,
        x,
        y,
        overDate: dayUnder(x, y, current.session.localDate),
      });
    },
    onDrop() {
      const current = dragRef.current;
      aimAt(null);
      update(null);
      if (current?.overDate) onDrop(current.session.id, current.overDate);
    },
    onCancel() {
      aimAt(null);
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

  return {
    handle,
    /** A session is lifted and being carried. */
    holding: drag !== null,
    overDate: drag?.overDate ?? null,
    aimed: drag === null ? null : aimed,
    ghost,
  };
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

/** The week a point aims at: a week arrow under it, or a side of the screen. */
function edgeUnder(x: number, y: number): WeekStep | null {
  const arrow = document
    .elementFromPoint?.(x, y)
    ?.closest<HTMLElement>("[data-week-step]");
  if (arrow) return arrow.dataset.weekStep === "-1" ? -1 : 1;
  if (x < EDGE_PX) return -1;
  if (x > window.innerWidth - EDGE_PX) return 1;
  return null;
}
