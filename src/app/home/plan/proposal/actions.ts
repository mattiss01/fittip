"use server";

import { revalidatePath } from "next/cache";

import type { PlanProposalActionState } from "@/app/home/plan/proposal/action-state";
import {
  CoachAIContextBelowMinimumError,
  CoachAIContextTooLargeError,
} from "@/server/ai/context";
import { CoachAIError } from "@/server/ai/errors";
import {
  parsePlanningNote,
  OwnerTextValidationError,
} from "@/server/ai/owner-text";
import { verifyCoachAIOwner } from "@/server/ai/owner";
import { createAISpendRepository } from "@/server/repositories/ai-spend-repository";
import { createCompletionRepository } from "@/server/repositories/completion-repository";
import { createGoalRepository } from "@/server/repositories/goal-repository";
import { createMemoryRepository } from "@/server/repositories/memory-repository";
import {
  createPlanProposalRepository,
  PlanProposalAuthenticationError,
  PlanProposalConflictError,
} from "@/server/repositories/plan-proposal-repository";
import { createTrainingRecordRepository } from "@/server/repositories/training-record-repository";
import {
  parsePlanDayCount,
  parsePlanProposalId,
  PlanProposalValidationError,
} from "@/server/plan-proposal/plan-proposal-records";
import { generatePlanProposal } from "@/server/plan-proposal/plan-proposal-service";
import { createServerUserClient } from "@/lib/supabase/server-user-client";

export async function generatePlanProposalAction(
  _previous: PlanProposalActionState,
  formData: FormData,
): Promise<PlanProposalActionState> {
  const submission = Date.now();
  const draft = {
    dayCount: String(formData.get("dayCount") ?? ""),
    startDate: String(formData.get("startDate") ?? ""),
    planningNote: String(formData.get("planningNote") ?? ""),
  };

  try {
    const owner = await verifyCoachAIOwner(await createServerUserClient());
    const dayCount = parsePlanDayCount(draft.dayCount);
    const timezoneName = String(formData.get("timezoneName") ?? "");
    const planningNote = parsePlanningNote(draft.planningNote);
    const idempotencyKey = String(formData.get("idempotencyKey") ?? "");
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey)) {
      throw new PlanProposalValidationError("idempotencyKey");
    }

    const [proposals, goals, memory, completions, plans, spendLedger] =
      await Promise.all([
        createPlanProposalRepository(),
        createGoalRepository(),
        createMemoryRepository(),
        createCompletionRepository(),
        createTrainingRecordRepository(),
        createAISpendRepository(),
      ]);

    const result = await generatePlanProposal(
      {
        owner,
        timezoneName,
        startDate: draft.startDate,
        dayCount,
        planningNote,
        idempotencyKey,
      },
      { proposals, goals, memory, completions, plans, spendLedger },
    );

    revalidatePath("/home/plan/proposal");
    if (result.status === "proposal") {
      return {
        status: "proposal",
        message: "",
        submission,
        proposalId: result.proposalId,
        memoryCandidateCount: result.memoryCandidateCount,
      };
    }
    if (result.status === "safety-hold") {
      return { status: "safety-hold", message: "", submission };
    }
    if (result.status === "pending") {
      return {
        status: "pending",
        message: "That request is still being prepared. Reload to check it.",
        submission,
      };
    }
    return {
      status: "error",
      message: "That proposal could not be prepared. Nothing was accepted.",
      submission,
      draft,
    };
  } catch (error) {
    return toActionState(error, submission, draft);
  }
}

export async function rejectPlanProposalAction(
  proposalId: unknown,
): Promise<PlanProposalActionState> {
  const submission = Date.now();
  try {
    const proposals = await createPlanProposalRepository();
    const id = parsePlanProposalId(proposalId);
    await proposals.rejectProposal(id);
    revalidatePath("/home/plan/proposal");
    return { status: "rejected", message: "", submission, proposalId: id };
  } catch (error) {
    return toActionState(error, submission);
  }
}

function toActionState(
  error: unknown,
  submission: number,
  draft?: PlanProposalActionState["draft"],
): PlanProposalActionState {
  if (error instanceof CoachAIContextBelowMinimumError) {
    const missing = error.missing.map((item) =>
      item === "active_goal" ? "an active goal" : "a resolved timezone",
    );
    return {
      status: "validation",
      message: `Set up ${joinRequirements(missing)} before asking the coach to plan. Nothing was generated.`,
      submission,
      ...(draft ? { draft } : {}),
    };
  }
  if (
    error instanceof OwnerTextValidationError ||
    error instanceof PlanProposalValidationError
  ) {
    return {
      status: "validation",
      message:
        error instanceof OwnerTextValidationError
          ? "That note is longer than 1,000 characters. Shorten it and try again."
          : "Check the selected dates and request details. Nothing was generated.",
      submission,
      ...(draft ? { draft } : {}),
    };
  }
  if (error instanceof CoachAIContextTooLargeError) {
    return {
      status: "validation",
      message:
        "There is too much active context for one plan. Review your goals or memory, then try again.",
      submission,
      ...(draft ? { draft } : {}),
    };
  }
  if (error instanceof PlanProposalConflictError) {
    return {
      status: "conflict",
      message:
        "That proposal changed in another tab. Reload before continuing.",
      submission,
    };
  }
  if (error instanceof PlanProposalAuthenticationError) {
    return {
      status: "session",
      message: "Your session ended. Sign in again before continuing.",
      submission,
    };
  }
  if (error instanceof CoachAIError) {
    return {
      status: error.code === "owner_denied" ? "session" : "error",
      message: `${error.message} Nothing was accepted.`,
      submission,
      ...(draft ? { draft } : {}),
    };
  }
  return {
    status: "error",
    message: "The plan proposal could not be prepared. Nothing was accepted.",
    submission,
    ...(draft ? { draft } : {}),
  };
}

function joinRequirements(items: string[]): string {
  if (items.length < 2) return items[0] ?? "the missing coaching context";
  return `${items[0]} and ${items[1]}`;
}
