import { RoadmapBody } from "./roadmap-body";

import {
  type RoadmapMilestoneMark,
  type RoadmapVersionView,
} from "@/server/roadmap/roadmap-records";

/**
 * The accepted roadmap, read end to end.
 *
 * All of it is `RoadmapBody`, which the open proposal
 * renders too: the same document at two moments, shown the same way, so that
 * accepting is agreeing to exactly what was on screen.
 *
 * A Server Component. The one interaction the roadmap in force has is marking
 * a milestone reached (ADR-026), and that is a small client island of its own
 * inside the spine; a proposal is given no marks and so shows none.
 */
export function RoadmapDetail({
  version,
  reached,
  goalTitles,
}: {
  version: RoadmapVersionView;
  /** The milestones of this version the owner marked reached. */
  reached: RoadmapMilestoneMark[];
  goalTitles: Record<string, string>;
}) {
  const roadmap = version.content;

  return (
    <article data-roadmap-version={version.versionNumber}>
      <RoadmapBody
        content={roadmap}
        startDate={roadmap.startDate}
        endDate={roadmap.endDate}
        providerCode={version.providerCode}
        goalTitles={goalTitles}
        marks={{ versionId: version.id, reached }}
      />
    </article>
  );
}
