import "server-only";

import type {
  PlanProposalDecision,
  PlanProposalItemView,
} from "@/lib/plan/plan-proposal-view";
import type { SevenDayPlanProposal } from "@/server/ai/contracts";

/**
 * The plan proposal domain's own vocabulary.
 *
 * Nothing here reads the database or calls a coach. It holds the shapes only a
 * server module needs, and the parsers that turn a form field into one of them.
 *
 * The item and decision shapes are not here: they are in
 * `@/lib/plan/plan-proposal-view`, because the review surface is a Client
 * Component and the client import boundary refuses `@/server/**` even for a
 * type. This module re-exports them so a server caller still has one place to
 * import the whole vocabulary from.
 */

export type {
  PlanProposalDecision,
  PlanProposalItemDecision,
  PlanProposalItemKind,
  PlanProposalItemView,
} from "@/lib/plan/plan-proposal-view";
export {
  FIXTURE_PROVIDER_CODE,
  isExampleProposal,
  PLAN_PROPOSAL_ITEM_DECISIONS,
  stagedItemCount,
  unresolvedItemCount,
} from "@/lib/plan/plan-proposal-view";

export type PlanProposalView = {
  id: string;
  /**
   * Read from the stored row, never inferred from `origin`. A proposal the
   * built-in fixture coach authored is labelled an example wherever it appears,
   * and that label has to rest on what actually answered.
   */
  providerCode: string;
  planningNote: string | null;
  content: SevenDayPlanProposal;
  startDate: string;
  endDate: string;
  /** The plan revision the proposal was composed against. */
  composedAtPlanRevision: number;
  items: PlanProposalItemView[];
  decision: PlanProposalDecision | null;
  createdAt: string;
};

export class PlanProposalValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanProposalValidationError";
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parsePlanProposalId(value: FormDataEntryValue | null): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value.trim())) {
    throw new PlanProposalValidationError("That proposal is not available.");
  }
  return value.trim();
}

export function parsePlanProposalItemOrdinal(
  value: FormDataEntryValue | null,
): number {
  const ordinal = integerOrNaN(value);
  if (!Number.isInteger(ordinal) || ordinal < 0 || ordinal > 27) {
    throw new PlanProposalValidationError(
      "That proposed item is not available.",
    );
  }
  return ordinal;
}

export function parsePlanProposalItemDecision(
  value: FormDataEntryValue | null,
): "proposed" | "staged" | "rejected" {
  if (value !== "proposed" && value !== "staged" && value !== "rejected") {
    throw new PlanProposalValidationError("That is not a choice you can make.");
  }
  return value;
}

/**
 * The expected plan revision, as the form carried it.
 *
 * It is only ever a stale value in the owner's own hands: the database compares
 * it against the real revision under a lock and refuses a mismatch, so the worst
 * a tampered one can do is refuse the tamperer's own finish.
 */
export function parseExpectedPlanRevision(
  value: FormDataEntryValue | null,
): number {
  const revision = integerOrNaN(value);
  if (!Number.isInteger(revision) || revision < 0) {
    throw new PlanProposalValidationError("Reload your plan and try again.");
  }
  return revision;
}

/**
 * A number, or `NaN` for anything that is not one.
 *
 * The empty string is the case worth naming: `Number("")` is `0`, so a missing
 * form field would otherwise read as ordinal zero — deciding the first item the
 * owner never chose — or as plan revision zero. An absent value is not a value.
 */
function integerOrNaN(value: FormDataEntryValue | null): number {
  if (typeof value !== "string" || value.trim() === "") return Number.NaN;
  return Number(value);
}

const DAY_COUNT_MIN = 1;
const DAY_COUNT_MAX = 7;

export function parsePlanDayCount(value: FormDataEntryValue | null): number {
  const dayCount = integerOrNaN(value);
  if (
    !Number.isInteger(dayCount) ||
    dayCount < DAY_COUNT_MIN ||
    dayCount > DAY_COUNT_MAX
  ) {
    throw new PlanProposalValidationError(
      "Ask for between one and seven days.",
    );
  }
  return dayCount;
}
