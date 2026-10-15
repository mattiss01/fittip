"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import {
  noteRoadmapLanding,
  RoadmapComposeSessionContext,
  type RoadmapComposeSession,
} from "./roadmap-compose-session";

import { SheetCloseButton, SheetLayer } from "@/app/home/plan/plan-sheet";
import w from "@/app/home/plan/plan-week.module.css";
import styles from "@/app/home/plan/roadmap/roadmap.module.css";
import { CoachSpark } from "@/components/home/coach-spark";
import { ROADMAP_CONTROL_COPY } from "@/lib/roadmap/roadmap-control-copy";

/**
 * The two ways to a new proposal while a roadmap is in force (ADR-028), and
 * writing one by hand (ADR-029).
 */
type View = "menu" | "change" | "fresh" | "write" | "rewrite";

/**
 * Changing the roadmap in force (owner, 13 Oct 2026): a button, and a sheet
 * that asks which way. "Change with Coach" sends the coach the whole roadmap
 * and what should be different; "New roadmap with Coach" starts over from the
 * owner's goals; "Write it yourself" is a roadmap of the owner's own, in force
 * on save (ADR-029). The page itself starts with the roadmap.
 *
 * It is drawn in three places. In the page's corner it opens on the choice;
 * on a due review it is "Change with Coach" and opens that form directly; and
 * while there is no roadmap, beside the coach's form, it is "Write it
 * yourself" and opens the writer. Under the roadmap in force it is "Edit
 * roadmap" and opens the writer on it (ADR-030).
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
  write = null,
  rewrite = null,
}: {
  /**
   * The corner opens on the choice; a due review opens the change form; with
   * no roadmap yet, the writer; under the roadmap in force, its edit.
   */
  opensOn?: "menu" | "change" | "write" | "rewrite";
  /** The ids of the headings that name the sheet, one for each view. */
  titleIds: Record<View, string>;
  /** The form that asks for the roadmap in force to be changed. */
  change: ReactNode;
  /** The form that asks for a new roadmap, or another after a decline. */
  fresh: ReactNode;
  /** The form that writes one by hand; offered only where it is given. */
  write?: ReactNode;
  /** The form that edits the roadmap in force (ADR-030). */
  rewrite?: ReactNode;
}) {
  const [view, setView] = useState<View | null>(null);
  // Unmounted with a form open is a request that landed: the page has
  // replaced this with what was made, so focus is sent there.
  const openView = useRef<View | null>(null);
  useEffect(() => {
    openView.current = view;
  }, [view]);
  useEffect(
    () => () => {
      if (openView.current !== null && openView.current !== "menu") {
        noteRoadmapLanding();
      }
    },
    [],
  );
  const [pending, setPending] = useState(false);
  const changeKey = useRef<string | null>(null);
  const freshKey = useRef<string | null>(null);
  const writeKey = useRef<string | null>(null);
  const sessions = useMemo<
    Record<"change" | "fresh" | "write" | "rewrite", RoadmapComposeSession>
  >(() => {
    const close = () => setView(null);
    return {
      change: { idempotencyKey: changeKey, setPending, close },
      fresh: { idempotencyKey: freshKey, setPending, close },
      // A hand-written roadmap is replay-safe by its expected head, and uses
      // no key; the session is for the pending lock and the close.
      // The first roadmap written by hand closes the sheet itself, and then
      // this button goes with it.
      write: {
        idempotencyKey: writeKey,
        setPending,
        close: () => {
          noteRoadmapLanding();
          close();
        },
      },
      rewrite: { idempotencyKey: writeKey, setPending, close },
    };
  }, []);

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
      ) : opensOn === "change" ? (
        <button
          className={styles.primaryAction}
          type="button"
          data-roadmap-change
          onClick={() => setView("change")}
        >
          <CoachSpark size={16} />
          {ROADMAP_CONTROL_COPY.changeWithCoachAction}
        </button>
      ) : opensOn === "rewrite" ? (
        <button
          className={styles.quietAction}
          type="button"
          data-roadmap-rewrite-open
          onClick={() => setView("rewrite")}
        >
          {ROADMAP_CONTROL_COPY.rewriteAction}
        </button>
      ) : (
        <button
          className={styles.quietAction}
          type="button"
          data-roadmap-write-open
          onClick={() => setView("write")}
        >
          {ROADMAP_CONTROL_COPY.writeAction}
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
                {write === null ? null : (
                  <button
                    type="button"
                    className={w.sheetChoice}
                    data-roadmap-choice="write"
                    onClick={() => setView("write")}
                  >
                    <strong>{ROADMAP_CONTROL_COPY.writeAction}</strong>
                    <span className={w.sheetChoiceDetail}>
                      {ROADMAP_CONTROL_COPY.writeDetail}
                    </span>
                  </button>
                )}
              </div>
            </>
          ) : (
            // The sheet is portalled out of the page, so the roadmap's own
            // colours are named again here.
            <div className={`${styles.page} ${styles.sheetBody}`}>
              <RoadmapComposeSessionContext.Provider value={sessions[view]}>
                {view === "change"
                  ? change
                  : view === "write"
                    ? write
                    : view === "rewrite"
                      ? rewrite
                      : fresh}
              </RoadmapComposeSessionContext.Provider>
            </div>
          )}
        </SheetLayer>
      )}
    </>
  );
}
