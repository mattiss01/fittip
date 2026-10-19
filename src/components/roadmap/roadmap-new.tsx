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
import { MenuItem, MoreMenu } from "@/components/home/more-menu";
import { ROADMAP_CONTROL_COPY } from "@/lib/roadmap/roadmap-control-copy";

/**
 * What the sheet shows: the choice of who writes a new roadmap, the two ways
 * to a coach's proposal (ADR-028), and writing or editing one by hand
 * (ADR-029, ADR-030).
 */
type View = "create" | "change" | "fresh" | "write" | "rewrite";

/**
 * The roadmap's controls and the one sheet they open (owner, 13 and 19 Oct
 * 2026).
 *
 * It is drawn in four places. Beside the title of the roadmap in force it is
 * ⋯, a list of what can be done with it: edit it by hand (ADR-030), edit it
 * with the coach, or create a new one. Once the roadmap has ended it is
 * "Create a new roadmap", above the roadmap and again below it. On a due
 * review it is "Edit with Coach" and opens that form directly; and while there
 * is no roadmap, beside the coach's form, it is "Write it yourself".
 *
 * Creating a new roadmap first asks who writes it: the coach, starting over
 * from the owner's goals, or the owner, in force on save (ADR-029).
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
  opensOn,
  titleIds,
  change = null,
  fresh = null,
  write = null,
  rewrite = null,
}: {
  /**
   * ⋯ beside the roadmap's title; "Create a new roadmap" once it has ended;
   * a due review opens the change form; with no roadmap yet, the writer.
   */
  opensOn: "actions" | "create" | "change" | "write";
  /** The ids of the headings that name the sheet, one for each view. */
  titleIds: Record<View, string>;
  /** The form that asks for the roadmap in force to be changed. */
  change?: ReactNode;
  /** The form that asks the coach for a new roadmap. */
  fresh?: ReactNode;
  /** The form that writes one by hand. */
  write?: ReactNode;
  /** The form that edits the roadmap in force (ADR-030). */
  rewrite?: ReactNode;
}) {
  const [view, setView] = useState<View | null>(null);
  // Reached through the choice of who writes it, so "Back" returns there.
  const [chosen, setChosen] = useState(false);
  // Unmounted with a form open is a request that landed: the page has
  // replaced this with what was made, so focus is sent there.
  const openView = useRef<View | null>(null);
  useEffect(() => {
    openView.current = view;
  }, [view]);
  useEffect(
    () => () => {
      if (openView.current !== null && openView.current !== "create") {
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

  const open = (next: View) => {
    setChosen(false);
    setView(next);
  };
  const choose = (next: "fresh" | "write") => {
    setChosen(true);
    setView(next);
  };
  const canCreate = fresh !== null || write !== null;

  return (
    <>
      {opensOn === "actions" ? (
        <MoreMenu label={ROADMAP_CONTROL_COPY.actionsLabel}>
          {(close) => (
            <>
              {rewrite === null ? null : (
                <MenuItem
                  onSelect={() => {
                    close();
                    open("rewrite");
                  }}
                >
                  {ROADMAP_CONTROL_COPY.rewriteAction}
                </MenuItem>
              )}
              {change === null ? null : (
                <MenuItem
                  onSelect={() => {
                    close();
                    open("change");
                  }}
                >
                  {ROADMAP_CONTROL_COPY.changeWithCoachAction}
                </MenuItem>
              )}
              {canCreate ? (
                <MenuItem
                  onSelect={() => {
                    close();
                    open("create");
                  }}
                >
                  {ROADMAP_CONTROL_COPY.createRoadmapAction}
                </MenuItem>
              ) : null}
            </>
          )}
        </MoreMenu>
      ) : opensOn === "create" ? (
        <button
          className={styles.primaryAction}
          type="button"
          data-roadmap-create
          onClick={() => open("create")}
        >
          {ROADMAP_CONTROL_COPY.createRoadmapAction}
        </button>
      ) : opensOn === "change" ? (
        <button
          className={styles.primaryAction}
          type="button"
          data-roadmap-change
          onClick={() => open("change")}
        >
          <CoachSpark size={16} />
          {ROADMAP_CONTROL_COPY.changeWithCoachAction}
        </button>
      ) : (
        <button
          className={styles.quietAction}
          type="button"
          data-roadmap-write-open
          onClick={() => open("write")}
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
            {chosen && view !== "create" ? (
              <button
                type="button"
                className={w.sheetBack}
                disabled={pending}
                onClick={() => open("create")}
              >
                ‹ Back
              </button>
            ) : (
              <span />
            )}
            <SheetCloseButton className={w.sheetClose} disabled={pending}>
              Close
            </SheetCloseButton>
          </header>
          {view === "create" ? (
            <>
              <h2 id={titleIds.create}>
                {ROADMAP_CONTROL_COPY.createRoadmapAction}
              </h2>
              <div className={w.sheetChoices}>
                {fresh === null ? null : (
                  <button
                    type="button"
                    className={w.sheetChoice}
                    data-roadmap-choice="fresh"
                    onClick={() => choose("fresh")}
                  >
                    <strong>{ROADMAP_CONTROL_COPY.newWithCoachAction}</strong>
                    <span className={w.sheetChoiceDetail}>
                      {ROADMAP_CONTROL_COPY.newWithCoachDetail}
                    </span>
                  </button>
                )}
                {write === null ? null : (
                  <button
                    type="button"
                    className={w.sheetChoice}
                    data-roadmap-choice="write"
                    onClick={() => choose("write")}
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
