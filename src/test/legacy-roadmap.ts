import type { StoredRoadmap } from "@/server/ai/contracts";

/**
 * A roadmap row as an earlier version stored it, for tests only.
 *
 * `StoredRoadmap` names what is read from a row today. A row written under v2
 * or v3 holds more: a reason beside each attention level, assumptions,
 * uncertainties, safety sentences, and the review points the coach wrote
 * until v4 (ADR-025, ADR-027). None of that is read any more, and the tests
 * that use this shape are the ones proving it does not travel or render.
 */
export type LegacyRoadmapV2 = Omit<
  StoredRoadmap,
  "schemaVersion" | "phases"
> & {
  schemaVersion: "fittip.roadmap.v2";
  phases: (Omit<StoredRoadmap["phases"][number], "goalAttention"> & {
    goalAttention: (StoredRoadmap["phases"][number]["goalAttention"][number] & {
      reason: string;
    })[];
  })[];
  assumptions?: string[];
  uncertainties?: {
    statement: string;
    whyItMatters: string;
    whatToWatch: string;
  }[];
  reviewPoints: {
    title: string;
    triggerDate?: string;
    triggerCondition?: string;
    question: string;
  }[];
  safetyConsiderations?: string[];
};
