"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import styles from "./coach-wait.module.css";
import {
  captionAt,
  type CoachWaitKind,
  formatElapsed,
  frameAt,
  SCENE_SECONDS,
  showsSlowNote,
  SLOW_NOTE,
} from "./coach-wait-model";
import { mountCoachWaitScene, SCENE_COUNT } from "./coach-wait-scene";

const REDUCE = "(prefers-reduced-motion: reduce)";

function subscribeReduced(change: () => void) {
  const query = window.matchMedia?.(REDUCE);
  query?.addEventListener?.("change", change);
  return () => query?.removeEventListener?.("change", change);
}
const readReduced = () => window.matchMedia?.(REDUCE).matches ?? false;

/**
 * What the owner sees while the coach writes, and the only thing (owner,
 * 20 Oct 2026): it covers the whole screen, navigation and sheets included,
 * with an athlete moving from sport to sport, a caption every few seconds,
 * the time waited, and after 30 s that it can take up to a minute. Nothing
 * in it says how far the coach has got, because the app cannot know.
 *
 * It is only the waiting state: the form that shows it keeps the request,
 * its errors and its cancel, and nothing behind it can be used while it
 * shows (every control there is disabled while the request runs anyway).
 * One animation frame loop drives the drawing and stops when this goes.
 * Under reduced motion the athlete stands still in one sport's pose, and
 * the pose changes to the next sport every few seconds.
 */
export function CoachWait({ kind }: { kind: CoachWaitKind }) {
  const screen = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const started = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const reduced = useSyncExternalStore(
    subscribeReduced,
    readReduced,
    () => false,
  );

  // The page behind is out of reach while this shows: not scrolled, not
  // tabbed to, not read out. Each is put back as it was.
  useEffect(() => {
    const layer = screen.current;
    if (layer === null) return;
    const behind = Array.from(document.body.children).filter(
      (child) => child !== layer && !child.hasAttribute("inert"),
    );
    behind.forEach((child) => child.setAttribute("inert", ""));
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    layer.focus();
    return () => {
      behind.forEach((child) => child.removeAttribute("inert"));
      document.body.style.overflow = overflow;
    };
  }, []);

  useEffect(() => {
    const element = svg.current;
    if (element === null) return;
    const draw = mountCoachWaitScene(element);
    // Kept when reduced motion is switched mid-wait, so the time runs on.
    started.current ??= performance.now();
    const start = started.current;
    let frame = 0;
    let shownSecond = -1;
    let shownScene = -1;
    const tick = (now: number) => {
      const t = (now - start) / 1000;
      const second = Math.floor(t);
      if (second !== shownSecond) {
        shownSecond = second;
        setElapsed(second);
      }
      const scene = Math.floor(t / SCENE_SECONDS);
      // A still pose is drawn once per sport, not sixty times a second.
      if (!reduced || scene !== shownScene) {
        shownScene = scene;
        draw(frameAt(t, reduced, SCENE_COUNT));
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      element.replaceChildren();
    };
  }, [reduced]);

  const caption = captionAt(elapsed, kind);
  return createPortal(
    <div
      ref={screen}
      className={styles.screen}
      role="dialog"
      aria-modal="true"
      aria-label="Asking the coach"
      tabIndex={-1}
      data-coach-wait
      data-reduced={reduced || undefined}
    >
      <div className={styles.wait}>
        <svg
          ref={svg}
          className={styles.stage}
          viewBox="0 0 240 190"
          aria-hidden="true"
          focusable="false"
        />
        <p className={styles.caption} aria-live="polite">
          <span key={caption} className={styles.line}>
            {caption}
          </span>
        </p>
        <p className={styles.elapsed} data-coach-wait-elapsed>
          {formatElapsed(elapsed)}
        </p>
        <p className={styles.slow} aria-live="polite">
          {showsSlowNote(elapsed) ? SLOW_NOTE : null}
        </p>
      </div>
    </div>,
    document.body,
  );
}
