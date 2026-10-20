"use client";

import { useRoadmapRecovered } from "./use-roadmap-write";
import { RoadmapWatchNotice } from "./roadmap-watch-notice";

/**
 * Why the page reloaded, said once for the roadmap in force. A milestone tick
 * or a review's "done" can be the write whose reply never appeared, and
 * neither can say it itself: there is one tick per milestone, and the
 * explanation would stand beside every one. Shown only where no form with a
 * notice of its own is open; the marker is consumed by the next write.
 */
export function RoadmapRecoveredNotice() {
  const recovered = useRoadmapRecovered(true);
  return <RoadmapWatchNotice lostRender={false} recovered={recovered} />;
}
