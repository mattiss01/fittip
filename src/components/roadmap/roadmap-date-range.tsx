import { formatRoadmapLength, formatRoadmapRange } from "./roadmap-dates";

import styles from "@/app/home/plan/roadmap/roadmap.module.css";

/**
 * When something on the roadmap runs (owner, 13 Oct 2026): its first and last
 * day in a pill, and how long that is beside it. The roadmap's own dates and
 * each phase's are drawn the same way, so the year is written once where both
 * days share it, as everywhere else on this page.
 *
 * No hooks and no state, so a Server Component renders it as is.
 */
export function RoadmapDateRange({
  startDate,
  endDate,
}: {
  startDate: string;
  endDate: string;
}) {
  const [first, last] = formatRoadmapRange(startDate, endDate).split(" → ");
  const length = formatRoadmapLength(startDate, endDate);

  return (
    <>
      <span className={styles.horizonDates}>
        <span>{first}</span>
        <span className={styles.horizonArrow} aria-hidden="true">
          →
        </span>
        <span className={styles.srOnly}> to </span>
        <span>{last}</span>
      </span>
      {length === "" ? null : (
        <span className={styles.horizonLength}>{length}</span>
      )}
    </>
  );
}
