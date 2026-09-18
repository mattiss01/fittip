import { RoadmapBody } from "./roadmap-body";

import {
  ROADMAP_COPY,
  type RoadmapVersionView,
} from "@/server/roadmap/roadmap-records";

/**
 * The accepted roadmap, read end to end.
 *
 * Everything below the version stamp is `RoadmapBody`, which the open proposal
 * renders too: the same document at two moments, shown the same way, so that
 * accepting is agreeing to exactly what was on screen.
 *
 * A Server Component. It holds no state and takes no interaction; the controls
 * belong to the proposal, not to the roadmap that is already current.
 */
export function RoadmapDetail({
  version,
  goalTitles,
}: {
  version: RoadmapVersionView;
  goalTitles: Record<string, string>;
}) {
  const roadmap = version.content;

  return (
    <article data-roadmap-version={version.versionNumber}>
      <RoadmapBody
        content={roadmap}
        meta={`${ROADMAP_COPY.versionLabel(version.versionNumber)} · ${roadmap.startDate} → ${roadmap.endDate}`}
        providerCode={version.providerCode}
        goalTitles={goalTitles}
      />
    </article>
  );
}
