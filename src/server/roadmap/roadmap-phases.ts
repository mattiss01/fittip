import "server-only";

import {
  createRoadmapRepository,
  RoadmapAuthenticationError,
  RoadmapPersistenceError,
} from "@/server/repositories/roadmap-repository";

export { RoadmapAuthenticationError };

/** A phase of the accepted roadmap, as far as the Plan shows one. */
export type RoadmapPhaseSummary = {
  title: string;
  focus: string;
  startDate: string;
  endDate: string;
};

/**
 * The Plan's one read of the roadmap (R3a): the phases of the version the
 * owner accepted last, so each week can say which phase it sits in.
 *
 * A read and nothing else, so the Plan page can hold it without holding the
 * roadmap repository's writes. Only the phase titles, focus and dates cross;
 * milestones, goal attention and the rest of the version stay behind. A
 * roadmap that cannot be read leaves the band off rather than taking the
 * Plan down — the phase is context, not the plan — but a lost sign-in is not
 * swallowed, because the page's own redirect is the honest answer to that.
 */
export async function readCurrentRoadmapPhases(): Promise<
  RoadmapPhaseSummary[]
> {
  try {
    const version = await (await createRoadmapRepository()).getCurrentVersion();
    return (version?.content.phases ?? []).map(
      ({ title, focus, startDate, endDate }) => ({
        title,
        focus,
        startDate,
        endDate,
      }),
    );
  } catch (error) {
    if (error instanceof RoadmapPersistenceError) return [];
    throw error;
  }
}
