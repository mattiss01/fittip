"use client";

import styles from "@/app/home/plan/roadmap/roadmap.module.css";
import { ROADMAP_CONTROL_COPY } from "@/lib/roadmap/roadmap-control-copy";

/**
 * What the lost-render watchdog is allowed to say, in the one place that says
 * it.
 *
 * Two moments, never both: a reply arrived for the write in flight and never
 * reached the screen, so the page is about to reload; or that reload has
 * happened and this is the document it produced. Neither claims the write was
 * applied, because the watch cannot know — see `use-roadmap-write.ts`.
 *
 * It is a component rather than two inlined paragraphs because the compose form
 * and the decision dock both need it and the wording must not drift between
 * them.
 */
export function RoadmapWatchNotice({
  lostRender,
  recovered,
}: {
  lostRender: boolean;
  recovered: boolean;
}) {
  if (!lostRender && !recovered) return null;
  return (
    <p
      className={styles.notice}
      data-roadmap-notice={lostRender ? "lost-render" : "recovered"}
      role="status"
    >
      {lostRender
        ? ROADMAP_CONTROL_COPY.lostRender
        : ROADMAP_CONTROL_COPY.recoveredReload}
    </p>
  );
}
