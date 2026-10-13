"use client";

import { useState, type ReactNode } from "react";

import { SheetCloseButton, SheetLayer } from "@/app/home/plan/plan-sheet";
import w from "@/app/home/plan/plan-week.module.css";
import styles from "@/app/home/plan/roadmap/roadmap.module.css";
import { CoachSpark } from "@/components/home/coach-spark";
import { ROADMAP_CONTROL_COPY } from "@/lib/roadmap/roadmap-control-copy";

/**
 * Asking for a new roadmap while one is in force (owner, 13 Oct 2026): a
 * button beside the page's title, and the compose form in a sheet. The page
 * itself starts with the roadmap.
 *
 * Whether the sheet is open is held here and nowhere else. The page renders
 * this only while nothing awaits a decision, so a generation that lands
 * unmounts it, sheet and all, and the next one starts closed.
 */
export function RoadmapNew({
  labelledBy,
  children,
}: {
  /** The id of the compose form's heading, which names the sheet. */
  labelledBy: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        className={styles.newAction}
        type="button"
        data-roadmap-new
        onClick={() => setOpen(true)}
      >
        <CoachSpark size={16} />
        {ROADMAP_CONTROL_COPY.newRoadmapAction}
      </button>
      {open ? (
        <SheetLayer
          view="roadmap-new"
          labelledBy={labelledBy}
          onClose={() => setOpen(false)}
        >
          <header className={w.sheetHead}>
            <span />
            <SheetCloseButton className={w.sheetClose}>Close</SheetCloseButton>
          </header>
          {/* The sheet is portalled out of the page, so the roadmap's own
              colours are named again here. */}
          <div className={`${styles.page} ${styles.sheetBody}`}>{children}</div>
        </SheetLayer>
      ) : null}
    </>
  );
}
