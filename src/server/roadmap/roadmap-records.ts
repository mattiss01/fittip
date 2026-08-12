import "server-only";

import type {
  RoadmapMemoryCandidate,
  RoadmapProposal,
} from "@/server/ai/contracts";

/**
 * The roadmap domain: the horizon rules, the states a proposal moves through,
 * and the parsing of everything an owner can send.
 *
 * Nothing here reaches a database, a provider, or a React component. The
 * horizon in particular is derived here and nowhere else, because it is the
 * value ADR-014 decision 4 turns on: the model never sees where it came from,
 * and the output validator compares the response against it afterwards.
 */

/** Decision 1: at least four weeks, at most fifty-two. */
export const ROADMAP_MIN_DAYS = 28;
export const ROADMAP_MAX_DAYS = 365;
/** The fallback when no active core goal has a date inside the window. */
export const ROADMAP_DEFAULT_DAYS = 84;
/** Decision 4: the third regeneration ends the chain. */
export const ROADMAP_MAX_REGENERATIONS = 3;

export type RoadmapProposalOrigin =
  | "ai_initial"
  | "ai_regeneration"
  | "owner_edit";

export type RoadmapDecision = "accepted" | "rejected";

export type RoadmapGoalSummary = {
  id: string;
  title: string;
  priorityTier: "core" | "supporting";
  targetDate: string | null;
};

export class RoadmapValidationError extends Error {
  constructor(readonly field: string) {
    // Never echoes the submitted value: a planning note must not travel in an
    // error message any more than it travels in telemetry.
    super("Check the highlighted details.");
    this.name = "RoadmapValidationError";
  }
}

/**
 * The default end date the compose screen opens with.
 *
 * Decision 1: the latest target date among active core goals when that date
 * falls within the next 52 weeks, otherwise twelve weeks. A nearer target never
 * makes the roadmap shorter than four weeks, and a later one is visibly outside
 * this roadmap rather than silently extending it.
 *
 * Supporting-goal dates deliberately do not extend the default. They remain
 * eligible for attention inside whatever horizon the owner chooses; what they
 * do not do is turn a twelve-week roadmap into a year because someone dated a
 * mobility goal.
 */
export function defaultRoadmapEndDate(
  today: string,
  goals: RoadmapGoalSummary[],
): string {
  const earliest = addDays(today, ROADMAP_MIN_DAYS);
  const latest = addDays(today, ROADMAP_MAX_DAYS);

  const coreTargets = goals
    .filter(
      (goal) =>
        goal.priorityTier === "core" &&
        goal.targetDate !== null &&
        goal.targetDate <= latest,
    )
    .map((goal) => goal.targetDate as string)
    .sort();

  const candidate = coreTargets.at(-1) ?? addDays(today, ROADMAP_DEFAULT_DAYS);
  return candidate < earliest ? earliest : candidate;
}

/** Active goals whose target falls after the chosen horizon (decision 1). */
export function goalsOutsideHorizon(
  goals: RoadmapGoalSummary[],
  endDate: string,
): RoadmapGoalSummary[] {
  return goals.filter(
    (goal) => goal.targetDate !== null && goal.targetDate > endDate,
  );
}

export function parseRoadmapEndDate(value: unknown, today: string): string {
  if (typeof value !== "string" || !isIsoDate(value)) {
    throw new RoadmapValidationError("endDate");
  }
  const earliest = addDays(today, ROADMAP_MIN_DAYS);
  const latest = addDays(today, ROADMAP_MAX_DAYS);
  if (value < earliest || value > latest) {
    throw new RoadmapValidationError("endDate");
  }
  return value;
}

export function parseRoadmapProposalId(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new RoadmapValidationError("proposalId");
  }
  return value;
}

export function parseExpectedHeadRevision(value: unknown): number {
  const parsed =
    typeof value === "string" && value !== "" ? Number(value) : value;
  if (
    typeof parsed !== "number" ||
    !Number.isSafeInteger(parsed) ||
    parsed < 0
  ) {
    throw new RoadmapValidationError("expectedHeadRevision");
  }
  return parsed;
}

/**
 * A proposal as the owner edited it.
 *
 * Decision 4 fixes what is editable: the roadmap title and summary; phase
 * titles, focus, dates and order; milestone text and dates; goal-attention
 * levels and reasons; assumptions, uncertainties and review points. Owner id,
 * source ids and versions, schema/prompt/model codes, validation state,
 * idempotency data, and the server-owned safety copy are not, and none of them
 * appears in this shape — an edit that tried to change one would have nowhere
 * to put it.
 *
 * The result is revalidated by the same `validateRoadmapCandidate` the model's
 * own output goes through. An owner is not more trusted than the coach here:
 * they are equally capable of producing a roadmap with a six-day gap in it.
 */
export type RoadmapEditInput = Omit<RoadmapProposal, "schemaVersion">;

export type RoadmapProposalView = {
  id: string;
  origin: RoadmapProposalOrigin;
  sourceProposalId: string | null;
  content: RoadmapProposal;
  planningNote: string | null;
  regenerationFeedback: string | null;
  regenerationNumber: number;
  startDate: string;
  endDate: string;
  decision: RoadmapDecision | null;
  createdAt: string;
};

export type RoadmapVersionView = {
  id: string;
  versionNumber: number;
  content: RoadmapProposal;
  acceptedAt: string;
};

export type RoadmapHeadView = {
  revision: number;
  currentVersionId: string | null;
};

/**
 * Everything the roadmap screen renders from. Assembled server-side so the
 * client component receives one already-authorized snapshot rather than issuing
 * its own reads.
 */
export type RoadmapScreenState = {
  today: string;
  head: RoadmapHeadView;
  current: RoadmapVersionView | null;
  history: RoadmapVersionView[];
  /** The proposal awaiting a decision, if any. */
  openProposal: RoadmapProposalView | null;
  /** Undecided candidates extracted from a planning note. */
  openMemoryCandidateCount: number;
  goals: RoadmapGoalSummary[];
  defaultEndDate: string;
  /** True when an eligible completion carries one of the four safety flags. */
  hasSafetySignal: boolean;
  /** How many regenerations remain on the open proposal's horizon. */
  regenerationsRemaining: number;
};

/**
 * The approved copy, in one place.
 *
 * These strings are product decisions from the ticket's decisions 3, 4, 4a and
 * 4b, not suggestions, and several of them are load-bearing: "Aim for by"
 * rather than "Due" because a milestone is observable rather than owed, and
 * "Direction, not a promise." because the whole surface is a proposal. A
 * component that inlines its own wording can drift from an approved decision
 * without anyone noticing, so the components import from here.
 */
export const ROADMAP_COPY = {
  createAction: "Create roadmap",
  proposeAction: "Propose a new roadmap",
  composeTitle: "Shape your roadmap",
  planningNoteLabel: "Anything the coach should account for? (optional)",
  planningNoteHelper:
    "Add commitments or constraints that your saved information does not show. Maximum 1,000 characters.",
  generateAction: "Generate roadmap proposal",
  generateSupport: "Nothing changes until you accept a proposal.",
  pending:
    "Building your roadmap proposal... Your current roadmap stays unchanged.",
  acceptAction: "Accept roadmap",
  editAction: "Edit proposal",
  declineAction: "Decline proposal",
  declineConfirm:
    "Decline this proposal? It will stay in your roadmap history and will not become current.",
  regenerateAction: "Regenerate proposal",
  feedbackLabel: "What should the coach change?",
  regenerateSupport:
    "The previous proposal will be shared with the coach. Nothing changes until you accept.",
  regenerateConfirm: "Generate another proposal",
  contextSummaryLabel: "What the coach will use",
  contextSummaryHelper:
    "Only active, accepted information and the bounded training window are included.",
  contextEmptyGroup: "None included",
  memoryPanelTitle: "Possible memory updates",
  memoryReviewLink: "Memory updates still need your review",
  reviewHeader: "Direction, not a promise.",
  assumptionsHeading: "What this assumes",
  uncertaintiesHeading: "What could change the direction",
  reviewPointsHeading: "When to reassess",
  milestonePrefix: "Aim for by",
  safetyNotice:
    "FitTip cannot assess or diagnose symptoms. If symptoms are severe, sudden, or getting worse, stop the affected activity and contact a qualified health professional.",
  regenerationCapReached:
    "You have used all three regenerations for these dates. Edit the proposal directly, or change the dates to start a fresh request.",
} as const;

export type RoadmapMemoryCandidateView = RoadmapMemoryCandidate & {
  id: string;
};

export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}
