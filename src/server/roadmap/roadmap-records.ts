import "server-only";

import type { OpenMemorySuggestions } from "@/server/memory/open-memory-suggestions";
import type { OpenGoalSuggestions } from "@/server/repositories/goal-suggestion-repository";

import type { RoadmapReviewDue } from "./roadmap-reviews";

import { COACH_START_MAX_DAYS_AHEAD } from "@/lib/date/local-date";
import { ROADMAP_CONTROL_COPY } from "@/lib/roadmap/roadmap-control-copy";
import { ROADMAP_ROUTE_STATE_COPY } from "@/lib/roadmap/roadmap-route-state-copy";
import type {
  RoadmapMemoryCandidate,
  RoadmapProposal,
  StoredRoadmap,
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
  | "owner_edit"
  /** Written by hand and in force at once (ADR-029). */
  | "owner_written";

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

/**
 * The first day of a roadmap, as the owner chose it (9 Oct 2026).
 *
 * Today when the form sent none. A regeneration is the same question about
 * the same dates, so its start is the earlier proposal's and is not held to
 * today's range here: the database refuses one that differs from it.
 */
export function parseRoadmapStartDate(
  value: unknown,
  today: string,
  isRegeneration: boolean,
): string {
  if (value === null || value === undefined || value === "") return today;
  if (typeof value !== "string" || !isIsoDate(value)) {
    throw new RoadmapValidationError("startDate");
  }
  // The field cannot be set before today, so yesterday is a form left open
  // over midnight with its default untouched. That request meant today.
  if (!isRegeneration && value === addDays(today, -1)) return today;
  if (
    !isRegeneration &&
    (value < today || value > addDays(today, COACH_START_MAX_DAYS_AHEAD))
  ) {
    throw new RoadmapValidationError("startDate");
  }
  return value;
}

/** Four to fifty-two weeks after the roadmap's first day. */
export function parseRoadmapEndDate(value: unknown, startDate: string): string {
  if (typeof value !== "string" || !isIsoDate(value)) {
    throw new RoadmapValidationError("endDate");
  }
  const earliest = addDays(startDate, ROADMAP_MIN_DAYS);
  const latest = addDays(startDate, ROADMAP_MAX_DAYS);
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

/** The accepted version a milestone mark names. */
export function parseRoadmapVersionId(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new RoadmapValidationError("versionId");
  }
  return value;
}

/** A phase's or a milestone's position: a small whole number, from zero. */
export function parseRoadmapPosition(
  value: unknown,
  field: "phaseIndex" | "milestoneIndex",
): number {
  const parsed =
    typeof value === "string" && /^\d{1,2}$/.test(value) ? Number(value) : -1;
  const last = field === "phaseIndex" ? 5 : 2;
  if (parsed < 0 || parsed > last) throw new RoadmapValidationError(field);
  return parsed;
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
 * levels; and review points. Owner id,
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
  /** As stored: a proposal made before v3 keeps the sections v3 dropped. */
  content: StoredRoadmap;
  planningNote: string | null;
  regenerationFeedback: string | null;
  regenerationNumber: number;
  /**
   * Whether the request this proposal answered asked for the roadmap in force
   * to be changed (ADR-028). Stored on the request; asking again after this
   * proposal is declined is then a change request too.
   */
  changesRoadmap: boolean;
  startDate: string;
  endDate: string;
  decision: RoadmapDecision | null;
  createdAt: string;
};

export type RoadmapVersionView = {
  id: string;
  versionNumber: number;
  content: StoredRoadmap;
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

/**
 * A milestone the owner marked reached (ADR-026), by where it sits in the
 * accepted version: a milestone has no id of its own, and the version never
 * changes. `reachedOn` is the owner's local day, set by the database.
 */
export type RoadmapMilestoneMark = {
  phaseIndex: number;
  milestoneIndex: number;
  reachedOn: string;
};

export type { RoadmapReviewDue };

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
 * What a roadmap written by hand reads as (ADR-029). It stores no provider
 * code, because no call made it; the read gives it this one so that the
 * missing code is not taken for an unreadable one, and labelled an example.
 * Never stored: the database holds a null, tied to the origin.
 */
export const OWNER_PROVIDER_CODE = "owner";

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
  /** The milestones of `current` marked reached. Empty with no roadmap. */
  reached: RoadmapMilestoneMark[];
  /** The latest phase of `current` marked reviewed (ADR-027), or null. */
  reviewedThrough: number | null;
  /** The review of `current` that is due today, or null. */
  reviewDue: RoadmapReviewDue | null;
  /** The proposal awaiting a decision, if any. */
  openProposal: RoadmapProposalView | null;
  /**
   * The coach's undecided memory suggestions from roadmap planning notes, and
   * the memory revision a decision must name (decided here since 19 Oct 2026).
   */
  memory: OpenMemorySuggestions;
  /** ADR-034: the coach's goal suggestions from roadmap notes, still open. */
  suggestedGoals: OpenGoalSuggestions;
  goals: RoadmapGoalSummary[];
  /**
   * The owner's goals that are not active (paused, abandoned, achieved), by
   * id, so a proposal naming one can say which (ADR-032).
   */
  otherGoalTitles: Record<string, string>;
  defaultEndDate: string;
  /** True when an eligible completion carries one of the four safety flags. */
  hasSafetySignal: boolean;
  /** How many regenerations remain on the open proposal's horizon. */
  regenerationsRemaining: number;
};

/**
 * The goals a roadmap names, in a phase's attention or a milestone's "Counts
 * toward", that are not active (ADR-032; owner, 16 Oct 2026): by title where
 * the goal is only paused, abandoned or achieved, and those that are gone
 * counted together at the end. Accepting puts the roadmap in force as it
 * is, so the proposal says so before Accept.
 */
export function inactiveNamedGoals(
  content: Pick<RoadmapProposal, "phases">,
  activeTitles: Record<string, string>,
  otherTitles: Record<string, string>,
): { count: number; labels: string[] } {
  const named = new Set<string>();
  for (const phase of content.phases) {
    for (const attention of phase.goalAttention) named.add(attention.goalId);
    for (const milestone of phase.milestones) {
      for (const goalId of milestone.goalIds) named.add(goalId);
    }
  }
  const inactive = [...named].filter(
    (goalId) => !Object.hasOwn(activeTitles, goalId),
  );
  const titled = inactive
    .filter((goalId) => Object.hasOwn(otherTitles, goalId))
    .map((goalId) => otherTitles[goalId]);
  const deleted = inactive.length - titled.length;
  return {
    count: inactive.length,
    labels:
      deleted === 0
        ? titled
        : [
            ...titled,
            deleted === 1
              ? "a goal since deleted"
              : `${deleted} goals since deleted`,
          ],
  };
}

/** The sentence over a proposal that names goals no longer active. */
export function inactiveGoalsNote({
  count,
  labels,
}: {
  count: number;
  labels: readonly string[];
}): string {
  const list =
    labels.length === 1
      ? labels[0]
      : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
  return `This roadmap names ${count === 1 ? "a goal" : "goals"} no longer active: ${list}. Accepting puts it in force as it is; you can edit it afterwards.`;
}

/**
 * The approved copy, in one place.
 *
 * These strings are product decisions from the ticket's decisions 3, 4, 4a and
 * 4b, not suggestions, and several of them are load-bearing: "Aim for by"
 * rather than "Due" because a milestone is observable rather than owed. A
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
  memoryReviewLink: "Edit them in Memory",
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
  /** A review the app asks for as a phase ends (ADR-027), in its three states. */
  reviewDueSince: (date: string) => `Review due since ${date}`,
  reviewDone: "Reviewed",
  reviewAfterPhase: (phase: number) => `End of phase ${phase}`,
  reviewAfterRoadmap: "End of the roadmap",
  /**
   * The route's own frame, moved out of `page.tsx` for the same reason. The
   * title is the name the Plan's chip gives the page (R3); it was M3-02's
   * "Where this is going.".
   */
  routeTitle: "Roadmap",
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
    // Never awaiting a decision, so never shown, and no label in any case:
    // the owner asked for none on a roadmap they wrote (ADR-029).
    owner_written: "Your roadmap",
  } satisfies Record<RoadmapProposalOrigin, string>,
  /** The open proposal, shown in full above the roadmap it would replace. */
  openProposalHeading: "A proposal is waiting",
  openProposalSupport:
    "Read it, change it, or turn it down. Your current roadmap stays exactly as it is until you accept.",
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

/**
 * A stored roadmap as the editor in the owner's browser opens it, copied field
 * by field. Whatever a row written under an earlier version holds beyond v4
 * stays on the server, as it does for every provider call.
 */
export function roadmapForEditor(
  content: StoredRoadmap,
): Omit<RoadmapProposal, "schemaVersion"> {
  return {
    title: content.title,
    ...(content.summary === undefined ? {} : { summary: content.summary }),
    startDate: content.startDate,
    endDate: content.endDate,
    phases: content.phases.map((phase) => ({
      title: phase.title,
      focus: phase.focus,
      startDate: phase.startDate,
      endDate: phase.endDate,
      goalAttention: phase.goalAttention.map((attention) => ({
        goalId: attention.goalId,
        level: attention.level,
      })),
      milestones: phase.milestones.map((milestone) => ({
        title: milestone.title,
        ...(milestone.observableCriterion === undefined
          ? {}
          : { observableCriterion: milestone.observableCriterion }),
        targetDate: milestone.targetDate,
        goalIds: [...milestone.goalIds],
      })),
    })),
  };
}
