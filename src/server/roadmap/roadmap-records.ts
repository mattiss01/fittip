import "server-only";

import { ROADMAP_CONTROL_COPY } from "@/lib/roadmap/roadmap-control-copy";
import { ROADMAP_ROUTE_STATE_COPY } from "@/lib/roadmap/roadmap-route-state-copy";
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

/**
 * The three terminal states a proposal can carry.
 *
 * `expired` is M3-11's: a proposal whose sources were legacy plan or completion
 * records could no longer be accepted once those records were deleted, so the
 * reset appended the state rather than rewriting or dropping the proposal. The
 * check constraint on `roadmap_proposal_decisions` has allowed all three since
 * that migration; this type had not caught up, so a repository read of an
 * expired proposal produced a value no consumer could name.
 */
export type RoadmapDecision = "accepted" | "rejected" | "expired";

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
  /**
   * The `provider_code` stored on the row, which is the only thing that says
   * who wrote this proposal.
   *
   * Read rather than derived, and `origin` is deliberately not consulted:
   * `origin` says how the proposal came about — a first request, a
   * regeneration, an owner's edit — which is a different fact from which coach
   * produced the words. An owner edit inherits its source's provider code, so
   * an edit of an example is still an example. That is what the database
   * already records, and what the label has to reflect.
   */
  providerCode: string;
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
  /**
   * The provider code of the proposal this version was accepted from.
   *
   * `roadmap_versions` carries no provider column of its own — it is an
   * immutable copy of accepted content — so this is read through
   * `source_proposal_id`, which the table requires and which cannot be null.
   * Still the stored row rather than an inference: an accepted example stays
   * labelled an example for as long as it is anybody's roadmap.
   */
  providerCode: string;
};

export type RoadmapHeadView = {
  revision: number;
  currentVersionId: string | null;
};

/**
 * The provider code a view reports when the stored provenance could not be
 * read.
 *
 * `roadmap_versions.source_proposal_id` is `not null` with a foreign key, so
 * this is not a state the database can be in; it exists because the read has to
 * answer something when the embed comes back in a shape it does not recognize.
 */
export const UNKNOWN_PROVIDER_CODE = "unknown";

/**
 * Whether a record was written by something other than a coaching model, and
 * therefore has to be labelled an example wherever it appears.
 *
 * One predicate rather than an equality test repeated per surface, because it
 * fails closed and that decision has to hold everywhere. `fixture` is the
 * built-in example coach. An unreadable provenance is treated the same way: the
 * unsafe direction is a fixture-authored roadmap rendering as a real one with
 * nothing anywhere to say otherwise, while the cost of the opposite mistake is
 * an example label on a roadmap that has one more reason to be looked at.
 */
export function isExampleAuthored(providerCode: string): boolean {
  return providerCode === "fixture" || providerCode === UNKNOWN_PROVIDER_CODE;
}

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
  /**
   * Recent proposals, newest first, each carrying its own decision state.
   *
   * The open proposal appears here too, but nothing guarantees where: it is the
   * newest undecided proposal that no other proposal names as its source, so a
   * newer decided or edited proposal can precede it. Not every undecided entry
   * is open either — an owner edit supersedes its source without deciding it.
   * A consumer tells the open proposal apart by comparing ids with
   * `openProposal`, never by position or by a missing decision. Everything
   * appears so that a proposal the owner remembers is visibly accounted for
   * rather than silently missing from the screen.
   */
  proposalHistory: RoadmapProposalView[];
  /**
   * The newest proposal when the owner has just declined it.
   *
   * It is the only proposal a regeneration may carry:
   * `begin_roadmap_generation` refuses a predecessor that is not owned,
   * rejected, and on the same horizon. The surface needs it because the
   * regeneration control sends it, and because a regeneration runs against the
   * predecessor's horizon rather than against whatever the compose form shows.
   */
  declinedPredecessor: RoadmapProposalView | null;
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
 *
 * "In one place" is the whole point, so the two spreads at the end matter as
 * much as the entries above them. A Client Component may not import this
 * module, so its strings live in `@/lib/roadmap/*` and are spread in here:
 * every roadmap wording stays reachable from this one constant, and the
 * boundary decides where a string is *defined* rather than whether it is
 * centralized at all.
 *
 * M3-15F moved the M3-02 wordings that were still written inside the four
 * roadmap components into this object unchanged, restored the two uncertainty
 * labels M3-15E dropped, and removed the orphaned `reviewPointsHeading`: the
 * spine interleaves review points where they fall, so the separate "When to
 * reassess" list that heading belonged to no longer exists.
 */
export const ROADMAP_COPY = {
  createAction: "Create roadmap",
  proposeAction: "Propose a new roadmap",
  contextSummaryLabel: "What the coach will use",
  contextSummaryHelper:
    "Only active, accepted information and the bounded training window are included.",
  contextEmptyGroup: "None included",
  memoryPanelTitle: "Possible memory updates",
  memoryReviewLink: "Memory updates still need your review",
  reviewHeader: "Direction, not a promise.",
  assumptionsHeading: "What this assumes",
  uncertaintiesHeading: "What could change the direction",
  /**
   * The two labels M3-02 set on an uncertainty and M3-15E lost.
   *
   * Without them the two lines under a statement are unattributed grey text,
   * and an owner cannot tell "this is why the direction depends on it" from
   * "this is the thing to watch for". They are what make an uncertainty
   * actionable rather than a disclaimer.
   */
  uncertaintyWhyItMatters: "Why it matters:",
  uncertaintyWhatToWatch: "Watch for:",
  /** M3-02's wording for the safety section of a roadmap the coach held back. */
  heldBackHeading: "Held back for now",
  milestonePrefix: "Aim for by",
  safetyNotice:
    "FitTip cannot assess or diagnose symptoms. If symptoms are severe, sudden, or getting worse, stop the affected activity and contact a qualified health professional.",
  /**
   * The spine's own wordings, which were written in `roadmap-spine.tsx` until
   * M3-15F moved them here. All three are M3-02's and unchanged: the phase
   * ordinal, and the two ways a review point states when it happens.
   */
  phaseIndex: (index: number, total: number) => `Phase ${index} of ${total}`,
  reviewOnDate: (date: string) => `Review on ${date}`,
  reviewWhenCondition: (condition: string) => `Review when ${condition}`,
  /**
   * The route's own frame, moved out of `page.tsx` for the same reason.
   * "Where this is going." is M3-02's title; the back link and the kicker are
   * the shell's shape, stated here so no roadmap string is written in a
   * component.
   */
  backLink: "← Plan",
  routeKicker: "FitTip / plan / roadmap",
  routeTitle: "Where this is going.",
  noRoadmapStamp: "No roadmap yet",
  supersededRoadmapsHeading: "Superseded roadmaps",
  /**
   * What an expired proposal says.
   *
   * M3-11 marked proposals built on deleted training records `expired`, and no
   * ticket can make one acceptable again. It is the one state on this surface
   * that still offers nothing, and it says so outright rather than leaving the
   * owner to find the missing control.
   */
  proposalExpired:
    "This proposal can no longer be accepted. It stays here, unchanged, with everything it was built on.",
  /**
   * An undecided proposal that is not the open one.
   *
   * An owner edit supersedes its source without deciding it, so the source
   * carries no decision and is still not what awaits one. Labelling it
   * "Awaiting your decision" would put two waiting records on the screen, one
   * of which nothing will ever decide.
   */
  proposalSuperseded:
    "A later proposal replaced this one before it was decided. It stays here, unchanged.",
  /** The state chip on each proposal record. */
  proposalStateLabels: {
    open: "Awaiting your decision",
    accepted: "Accepted",
    rejected: "Declined",
    expired: "Expired",
    superseded: "Superseded",
  },
  /** Where each proposal record says it came from. */
  proposalOriginLabels: {
    ai_initial: "From the coach",
    ai_regeneration: "Regenerated",
    owner_edit: "Your edit",
  } satisfies Record<RoadmapProposalOrigin, string>,
  routeIntro:
    "Months of direction, not a week of sessions. This is the roadmap you have now, every version before it, and what was proposed along the way.",
  emptyRoadmapTitle: "No roadmap yet.",
  emptyRoadmapBody:
    "A roadmap is months of direction rather than a week of sessions. Once you have one it stays here, with every version before it.",
  supersededRoadmapsSupport: "Earlier versions stay readable and unchanged.",
  proposalsHeading: "Proposals",
  proposalsSupport: "What was proposed, and what became of it.",
  /** The open proposal, shown in full above the roadmap it would replace. */
  openProposalHeading: "A proposal is waiting",
  openProposalSupport:
    "Read it, change it, or turn it down. Your current roadmap stays exactly as it is until you accept.",
  /** M3-02's wording, restored unchanged; it was inlined before M3-11. */
  memoryCandidatesWaiting: (count: number) =>
    `${count} item${count === 1 ? "" : "s"} from a planning note are waiting for you. They are not used for coaching until you accept them.`,
  /**
   * "Version 3": the M3-02 masthead stamp's wording, which M3-15E also uses on
   * the current roadmap's horizon line and on each superseded version.
   */
  versionLabel: (versionNumber: number) => `Version ${versionNumber}`,
  /** Every wording a Client Component renders; see that module for why. */
  ...ROADMAP_CONTROL_COPY,
  /** `error.tsx` and `loading.tsx`; see that module for why it lives apart. */
  ...ROADMAP_ROUTE_STATE_COPY,
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
