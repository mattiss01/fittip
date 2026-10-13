"use client";

import type { ReactNode } from "react";

import { RoadmapWatchNotice } from "./roadmap-watch-notice";
import { isRefusal, useRoadmapWrite } from "./use-roadmap-write";

import { setRoadmapReviewedAction } from "@/app/home/plan/roadmap/actions";
import styles from "@/app/home/plan/roadmap/roadmap.module.css";
import { ROADMAP_CONTROL_COPY } from "@/lib/roadmap/roadmap-control-copy";

/**
 * A review that is due (ADR-027): a phase of the roadmap in force has ended,
 * or the roadmap itself has. It says so above the roadmap and asks one thing,
 * that the owner looks; "Reviewed" is them saying they did. Nothing replans
 * and no coach is asked.
 *
 * The page renders this only while a review is due, so marking it removes
 * the card with the write's own refresh. A refusal is said here.
 */
export function RoadmapReviewDue({
  versionId,
  phaseIndex,
  roadmapEnded,
  children,
}: {
  /** What the review may lead to, beside "Reviewed": Change with Coach. */
  children?: ReactNode;
  versionId: string;
  /** The phase that ended, from zero. */
  phaseIndex: number;
  roadmapEnded: boolean;
}) {
  const { state, submit, pending, lostRender } = useRoadmapWrite(
    setRoadmapReviewedAction,
  );

  return (
    <section className={styles.reviewDue} data-roadmap-review-due={phaseIndex}>
      <h2 className={styles.reviewDueHeading}>
        {roadmapEnded
          ? ROADMAP_CONTROL_COPY.reviewDueRoadmap
          : ROADMAP_CONTROL_COPY.reviewDuePhase(phaseIndex + 1)}
      </h2>
      <p className={styles.reviewDueBody}>
        {roadmapEnded
          ? ROADMAP_CONTROL_COPY.reviewDueRoadmapBody
          : ROADMAP_CONTROL_COPY.reviewDuePhaseBody}
      </p>
      <div className={styles.reviewDueActions}>
        {children}
        <form action={submit}>
          <input type="hidden" name="versionId" value={versionId} />
          <input type="hidden" name="phaseIndex" value={phaseIndex} />
          <button
            className={styles.secondaryAction}
            disabled={pending}
            type="submit"
          >
            {ROADMAP_CONTROL_COPY.reviewedAction}
          </button>
        </form>
      </div>
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
    </section>
  );
}
