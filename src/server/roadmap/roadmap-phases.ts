import "server-only";

import { roadmapReviewDue } from "./roadmap-reviews";

import {
  createRoadmapRepository,
  RoadmapAuthenticationError,
  RoadmapPersistenceError,
} from "@/server/repositories/roadmap-repository";

export { RoadmapAuthenticationError };

/**
 * Whether a review of the roadmap in force is due on the owner's `today`
 * (ADR-027): the one thing the Plan says about it, as a dot on its Roadmap
 * chip. Two small reads. A roadmap that cannot be read leaves the dot off, as
 * it leaves the phase band off; a lost sign-in is not swallowed.
 */
export async function readRoadmapReviewDue(today: string): Promise<boolean> {
  try {
    const roadmaps = await createRoadmapRepository();
    const version = await roadmaps.getCurrentVersion();
    if (version === null) return false;
    return (
      roadmapReviewDue(
        version.content.phases,
        today,
        await roadmaps.getReviewedThrough(version.id),
      ) !== null
    );
  } catch (error) {
    if (error instanceof RoadmapPersistenceError) return false;
    throw error;
  }
}

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
