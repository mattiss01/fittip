"use client";

import { formatRoadmapDate } from "./roadmap-dates";
import { RoadmapWatchNotice } from "./roadmap-watch-notice";
import { isRefusal, useRoadmapWrite } from "./use-roadmap-write";

import { setMilestoneReachedAction } from "@/app/home/plan/roadmap/actions";
import styles from "@/app/home/plan/roadmap/roadmap.module.css";
import { ROADMAP_CONTROL_COPY } from "@/lib/roadmap/roadmap-control-copy";

/**
 * Whether a milestone was reached (ADR-026): one answer, and it can be taken
 * back. Not marked, it offers "Mark reached" and says nothing else, whatever
 * its date; nothing here ever says missed.
 *
 * What it shows is the stored mark the page was rendered from, so the write's
 * own refresh is what changes it. Nothing is remembered here about having
 * just written, and the day shown is the one the database set.
 *
 * The form says which milestone and which way. Whether that is allowed is the
 * database's to decide, and a refusal is said here, beside the milestone.
 *
 * The write is watched as every roadmap write is (`use-roadmap-write.ts`): a
 * reply that arrives and never renders reloads the page, and this says so
 * first. After that reload nothing here repeats it; the mark is on screen.
 */
export function MilestoneTick({
  versionId,
  phaseIndex,
  milestoneIndex,
  title,
  reachedOn,
}: {
  versionId: string;
  phaseIndex: number;
  milestoneIndex: number;
  /** The milestone's title, so each button names what it marks. */
  title: string;
  /** The owner's local day it was marked reached, or null while it is not. */
  reachedOn: string | null;
}) {
  const { state, submit, pending, lostRender } = useRoadmapWrite(
    setMilestoneReachedAction,
  );
  const reached = reachedOn !== null;

  return (
    <form
      action={submit}
      className={styles.milestoneTick}
      data-milestone-reached={reached ? "true" : "false"}
    >
      <input type="hidden" name="versionId" value={versionId} />
      <input type="hidden" name="phaseIndex" value={phaseIndex} />
      <input type="hidden" name="milestoneIndex" value={milestoneIndex} />
      <input type="hidden" name="reached" value={reached ? "false" : "true"} />
      {reached ? (
        <p className={styles.milestoneReached}>
          {ROADMAP_CONTROL_COPY.milestoneReached(formatRoadmapDate(reachedOn))}
        </p>
      ) : null}
      <button
        aria-label={
          reached
            ? ROADMAP_CONTROL_COPY.milestoneUndoLabel(title)
            : ROADMAP_CONTROL_COPY.milestoneReachLabel(title)
        }
        className={styles.milestoneTickAction}
        disabled={pending}
        type="submit"
      >
        {reached
          ? ROADMAP_CONTROL_COPY.milestoneUndoAction
          : ROADMAP_CONTROL_COPY.milestoneReachAction}
      </button>
      <RoadmapWatchNotice lostRender={lostRender} recovered={false} />
      {isRefusal(state) ? (
        <p
          className={styles.notice}
          data-roadmap-notice={state.status}
          role="status"
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
