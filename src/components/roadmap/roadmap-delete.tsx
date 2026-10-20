"use client";

import { useContext, useEffect } from "react";

import { RoadmapComposeSessionContext } from "./roadmap-compose-session";
import { isRefusal, useRoadmapWrite } from "./use-roadmap-write";

import { SheetCloseButton } from "@/app/home/plan/plan-sheet";
import w from "@/app/home/plan/plan-week.module.css";
import { deleteRoadmapAction } from "@/app/home/plan/roadmap/actions";
import { ROADMAP_CONTROL_COPY } from "@/lib/roadmap/roadmap-control-copy";

/**
 * The question before the roadmap is deleted (owner, 19 Oct 2026; ADR-036).
 *
 * A delete erases every version and proposal and cannot be undone, so this
 * short question is the only guard, and it says what goes and what stays. On
 * success the page has no roadmap and this, with the ⋯ it was opened from, is
 * gone; the sentence that says so is `roadmap-outcome`'s. A refusal is said
 * here, where the owner can Keep or try again.
 */
export function RoadmapDelete({
  expectedHeadRevision,
  headingId,
}: {
  expectedHeadRevision: number;
  headingId: string;
}) {
  const { state, submit, pending } = useRoadmapWrite(deleteRoadmapAction);
  const reportPending = useContext(RoadmapComposeSessionContext)?.setPending;
  useEffect(() => {
    reportPending?.(pending);
    return () => reportPending?.(false);
  }, [reportPending, pending]);

  return (
    <form action={submit} className={w.confirm} data-roadmap-delete>
      <h2 id={headingId}>{ROADMAP_CONTROL_COPY.deleteTitle}</h2>
      <p>{ROADMAP_CONTROL_COPY.deleteDetail}</p>
      {isRefusal(state) ? (
        <p role="alert" data-roadmap-notice={state.status}>
          {state.message}
        </p>
      ) : null}
      <input
        type="hidden"
        name="expectedHeadRevision"
        value={expectedHeadRevision}
      />
      <button type="submit" className={w.confirmDanger} disabled={pending}>
        {ROADMAP_CONTROL_COPY.deleteConfirm}
      </button>
      <SheetCloseButton className={w.confirmKeep} disabled={pending}>
        {ROADMAP_CONTROL_COPY.deleteKeep}
      </SheetCloseButton>
    </form>
  );
}
