"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";

import {
  RoadmapComposeSessionContext,
  type RoadmapComposeSession,
} from "./roadmap-compose-session";

import { SheetCloseButton, SheetLayer } from "@/app/home/plan/plan-sheet";
import w from "@/app/home/plan/plan-week.module.css";
import styles from "@/app/home/plan/roadmap/roadmap.module.css";
import { CoachSpark } from "@/components/home/coach-spark";
import { ROADMAP_CONTROL_COPY } from "@/lib/roadmap/roadmap-control-copy";

/** The two ways to a new proposal while a roadmap is in force (ADR-028). */
type View = "menu" | "change" | "fresh";

/**
 * Changing the roadmap in force (owner, 13 Oct 2026): a button, and a sheet
 * that asks which way. "Change with Coach" sends the coach the whole roadmap
 * and what should be different; "New roadmap with Coach" starts over from the
 * owner's goals. Writing one by hand will be the third choice when it exists.
 * The page itself starts with the roadmap.
 *
 * It is drawn in two places. In the page's corner it opens on the choice; on
 * a due review it is "Change with Coach" and opens that form directly.
 *
 * Whether the sheet is open, and on what, is held here and nowhere else. The
 * page renders this only while nothing awaits a decision, so a generation
 * that lands unmounts it, sheet and all, and the next one starts closed.
 *
 * Closing the sheet, or going back to the choice, unmounts a form. What must
 * outlast that is held here, one of each for each form, so a key minted for
 * one request is never sent with the other: see `roadmap-compose-session.ts`.
 */
export function RoadmapNew({
  opensOn = "menu",
  titleIds,
  change,
  fresh,
}: {
  /** The corner opens on the choice; a due review opens the change form. */
  opensOn?: "menu" | "change";
  /** The ids of the headings that name the sheet, one for each view. */
  titleIds: Record<View, string>;
  /** The form that asks for the roadmap in force to be changed. */
  change: ReactNode;
  /** The form that asks for a new roadmap, or another after a decline. */
  fresh: ReactNode;
}) {
  const [view, setView] = useState<View | null>(null);
  const [pending, setPending] = useState(false);
  const changeKey = useRef<string | null>(null);
  const freshKey = useRef<string | null>(null);
  const sessions = useMemo<Record<"change" | "fresh", RoadmapComposeSession>>(
    () => ({
      change: { idempotencyKey: changeKey, setPending },
      fresh: { idempotencyKey: freshKey, setPending },
    }),
    [],
  );

  return (
    <>
      {opensOn === "menu" ? (
        <button
          className={styles.newAction}
          type="button"
          data-roadmap-new
          onClick={() => setView("menu")}
        >
          {ROADMAP_CONTROL_COPY.changeRoadmapAction}
        </button>
      ) : (
        <button
          className={styles.primaryAction}
          type="button"
          data-roadmap-change
          onClick={() => setView("change")}
        >
          <CoachSpark size={16} />
          {ROADMAP_CONTROL_COPY.changeWithCoachAction}
        </button>
      )}
      {view === null ? null : (
        <SheetLayer
          view={`roadmap-${view}`}
          labelledBy={titleIds[view]}
          locked={pending}
          onClose={() => setView(null)}
        >
          <header className={w.sheetHead}>
            {view === "menu" || opensOn !== "menu" ? (
              <span />
            ) : (
              <button
                type="button"
                className={w.sheetBack}
                disabled={pending}
                onClick={() => setView("menu")}
              >
                ‹ Back
              </button>
            )}
            <SheetCloseButton className={w.sheetClose} disabled={pending}>
              Close
            </SheetCloseButton>
          </header>
          {view === "menu" ? (
            <>
              <h2 id={titleIds.menu}>
                {ROADMAP_CONTROL_COPY.changeRoadmapAction}
              </h2>
              <div className={w.sheetChoices}>
                <button
                  type="button"
                  className={w.sheetChoice}
                  data-roadmap-choice="change"
                  onClick={() => setView("change")}
                >
                  <strong>{ROADMAP_CONTROL_COPY.changeWithCoachAction}</strong>
                  <span className={w.sheetChoiceDetail}>
                    {ROADMAP_CONTROL_COPY.changeWithCoachDetail}
                  </span>
                </button>
                <button
                  type="button"
                  className={w.sheetChoice}
                  data-roadmap-choice="fresh"
                  onClick={() => setView("fresh")}
                >
                  <strong>{ROADMAP_CONTROL_COPY.newWithCoachAction}</strong>
                  <span className={w.sheetChoiceDetail}>
                    {ROADMAP_CONTROL_COPY.newWithCoachDetail}
                  </span>
                </button>
              </div>
            </>
          ) : (
            // The sheet is portalled out of the page, so the roadmap's own
            // colours are named again here.
            <div className={`${styles.page} ${styles.sheetBody}`}>
              <RoadmapComposeSessionContext.Provider value={sessions[view]}>
                {view === "change" ? change : fresh}
              </RoadmapComposeSessionContext.Provider>
            </div>
          )}
        </SheetLayer>
      )}
    </>
  );
}
