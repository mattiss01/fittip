"use client";

import { formatRoadmapDate } from "./roadmap-dates";
import { RoadmapWatchNotice } from "./roadmap-watch-notice";
import { isRefusal, useRoadmapWrite } from "./use-roadmap-write";

import { setMilestoneReachedAction } from "@/app/home/plan/roadmap/actions";
import styles from "@/app/home/plan/roadmap/roadmap.module.css";
import { ROADMAP_CONTROL_COPY } from "@/lib/roadmap/roadmap-control-copy";

/**
 * Whether a milestone was reached (ADR-026): one answer, and it can be taken
 * back. It is the milestone's own mark, a circle to tick where its dot was
 * (owner, 13 Oct 2026: not a button with words on it). Empty, it says
 * nothing, whatever the milestone's date; nothing here ever says missed.
 * Ticked, the day is written under the milestone, and a second tap takes the
 * tick back.
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
      {/* Named for a screen reader by what a press does, with the
          milestone's title: the circle itself carries no words. */}
      <button
        aria-label={
          reached
            ? ROADMAP_CONTROL_COPY.milestoneUndoLabel(title)
            : ROADMAP_CONTROL_COPY.milestoneReachLabel(title)
        }
        aria-pressed={reached}
        className={styles.milestoneTickAction}
        disabled={pending}
        type="submit"
      >
        <span className={styles.milestoneTickMark} aria-hidden="true">
          {reached ? (
            <svg
              fill="none"
              height="12"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="3"
              viewBox="0 0 24 24"
              width="12"
            >
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          ) : null}
        </span>
      </button>
      {reached ? (
        <p className={styles.milestoneReached}>
          {ROADMAP_CONTROL_COPY.milestoneReached(formatRoadmapDate(reachedOn))}
        </p>
      ) : null}
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
