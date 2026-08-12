import "server-only";

import type { SevenDayPlanProposal } from "@/server/ai/contracts";

export type PlanProposalDecision = "rejected";

export type PlanProposalView = {
  id: string;
  content: SevenDayPlanProposal;
  planningNote: string | null;
  startDate: string;
  endDate: string;
  dayCount: number;
  decision: PlanProposalDecision | null;
  createdAt: string;
};

export class PlanProposalValidationError extends Error {
  constructor(readonly field: string) {
    super("Check the plan request details.");
    this.name = "PlanProposalValidationError";
  }
}

export function parsePlanDayCount(value: unknown): number {
  const parsed =
    typeof value === "string" && value !== "" ? Number(value) : value;
  if (
    !Number.isSafeInteger(parsed) ||
    Number(parsed) < 1 ||
    Number(parsed) > 7
  ) {
    throw new PlanProposalValidationError("dayCount");
  }
  return Number(parsed);
}

export function parsePlanProposalId(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new PlanProposalValidationError("proposalId");
  }
  return value;
}

export function parseTimezoneName(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 100) {
    throw new PlanProposalValidationError("timezoneName");
  }
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: value }).format();
  } catch {
    throw new PlanProposalValidationError("timezoneName");
  }
  return value;
}
