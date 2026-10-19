import "server-only";

import { roadmapReviewDue } from "./roadmap-reviews";

import {
  createRoadmapRepository,
  RoadmapAuthenticationError,
  RoadmapPersistenceError,
} from "@/server/repositories/roadmap-repository";

export { RoadmapAuthenticationError };

/**
 * What the Plan's Roadmap chip marks with a dot, if anything: a review of the
 * roadmap in force due on the owner's `today` (ADR-027), or no roadmap at all
 * (owner, 16 Oct 2026), since the coach plans weeks from one, or a roadmap
 * whose last day has passed (owner, 19 Oct 2026), which stays marked until a
 * new one is made: a review marked done does not take this dot away. At most
 * two small reads. A roadmap that cannot be read leaves the dot off, as it
 * leaves the phase band off, rather than claim there is none; a lost sign-in
 * is not swallowed.
 */
export type RoadmapAttention = "review_due" | "ended" | "missing" | null;

export async function readRoadmapAttention(
  today: string,
): Promise<RoadmapAttention> {
  try {
    const roadmaps = await createRoadmapRepository();
    const version = await roadmaps.getCurrentVersion();
    if (version === null) return "missing";
    if (version.content.endDate < today) return "ended";
    return roadmapReviewDue(
      version.content.phases,
      today,
      await roadmaps.getReviewedThrough(version.id),
    ) === null
      ? null
      : "review_due";
  } catch (error) {
    if (error instanceof RoadmapPersistenceError) return null;
    throw error;
  }
}

/**
 * True only when the owner has no roadmap in force, for the prompt that
 * follows setup (owner, 16 Oct 2026). A roadmap that cannot be read says
 * nothing, rather than ask for one the owner may already have.
 */
export async function readRoadmapMissing(): Promise<boolean> {
  try {
    return (
      (await (await createRoadmapRepository()).getCurrentVersion()) === null
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
