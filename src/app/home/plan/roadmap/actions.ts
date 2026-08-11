"use server";

import { revalidatePath } from "next/cache";

// A "use server" module may export nothing but async functions, so the initial
// state stays in `action-state.ts` and is imported by the client directly.
import type { RoadmapActionState } from "@/app/home/plan/roadmap/action-state";
import { CoachAIError } from "@/server/ai/errors";
import { validateRoadmapCandidate } from "@/server/ai/output-validation";
import { CoachAIContextTooLargeError } from "@/server/ai/context";
import {
  OwnerTextValidationError,
  parsePlanningNote,
  parseRegenerationFeedback,
} from "@/server/ai/owner-text";
import { verifyCoachAIOwner } from "@/server/ai/owner";
import { createAISpendRepository } from "@/server/repositories/ai-spend-repository";
import { createCompletionRepository } from "@/server/repositories/completion-repository";
import { createGoalRepository } from "@/server/repositories/goal-repository";
import { createMemoryRepository } from "@/server/repositories/memory-repository";
import { createTrainingRecordRepository } from "@/server/repositories/training-record-repository";
import {
  createRoadmapRepository,
  RoadmapAuthenticationError,
  RoadmapConflictError,
} from "@/server/repositories/roadmap-repository";
import {
  parseExpectedHeadRevision,
  parseRoadmapEndDate,
  parseRoadmapProposalId,
  RoadmapValidationError,
  ROADMAP_COPY,
} from "@/server/roadmap/roadmap-records";
import { buildEditValidationContext } from "@/server/roadmap/roadmap-edit";
import { generateRoadmapProposal } from "@/server/roadmap/roadmap-service";
import { createServerUserClient } from "@/lib/supabase/server-user-client";

/**
 * The roadmap server actions.
 *
 * Every one of them authenticates first — a Server Action is a public endpoint,
 * not a private function, and the owner is derived from verified Auth claims
 * rather than from anything the form carried. The owner id is never a form
 * field, and could not be: the transaction functions take no owner argument.
 */

/**
 * Compose, for an initial request and for a regeneration alike.
 *
 * Which one it is is decided by whether a predecessor is present, and the
 * database re-derives that independently. Nothing here trusts a hidden field to
 * say "this is a regeneration": a claimed regeneration with no declined,
 * same-horizon predecessor is refused before any provider call.
 */
export async function generateRoadmapAction(
  _previous: RoadmapActionState,
  formData: FormData,
): Promise<RoadmapActionState> {
  const submission = Date.now();
  const draft = {
    endDate: String(formData.get("endDate") ?? ""),
    planningNote: String(formData.get("planningNote") ?? ""),
    regenerationFeedback: String(formData.get("regenerationFeedback") ?? ""),
  };

  try {
    const owner = await verifyCoachAIOwner(await createServerUserClient());

    const today = parseToday(formData.get("today"));
    const endDate = parseRoadmapEndDate(draft.endDate, today);
    const planningNote = parsePlanningNote(draft.planningNote);
    const previousProposalId = optionalProposalId(
      formData.get("previousProposalId"),
    );
    const regenerationFeedback = parseRegenerationFeedback(
      draft.regenerationFeedback,
    );

    // ADR-014 decision 6: feedback is required on a regeneration and starts
    // empty on every round. "Required and starts empty" is trivially checkable,
    // where "must differ from its prefill" is weak and gameable.
    if (previousProposalId !== null && regenerationFeedback === null) {
      return {
        status: "validation",
        message: `${ROADMAP_COPY.feedbackLabel} — this is required.`,
        submission,
        draft,
      };
    }
    if (previousProposalId === null && regenerationFeedback !== null) {
      return {
        status: "validation",
        message: "Feedback belongs to a regeneration, not a first request.",
        submission,
        draft,
      };
    }

    const idempotencyKey = String(formData.get("idempotencyKey") ?? "");
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey)) {
      return {
        status: "validation",
        message: "That request could not be identified. Try again.",
        submission,
        draft,
      };
    }

    const [roadmaps, goals, memory, completions, plans, spendLedger] =
      await Promise.all([
        createRoadmapRepository(),
        createGoalRepository(),
        createMemoryRepository(),
        createCompletionRepository(),
        createTrainingRecordRepository(),
        createAISpendRepository(),
      ]);

    const head = await roadmaps.getHead();

    const result = await generateRoadmapProposal(
      {
        owner,
        startDate: today,
        endDate,
        expectedHeadRevision: head.revision,
        planningNote,
        previousProposalId,
        regenerationFeedback,
        idempotencyKey,
      },
      { roadmaps, goals, memory, completions, plans, spendLedger },
    );

    revalidatePath("/home/plan/roadmap");

    if (result.status === "proposal") {
      return {
        status: "proposal",
        message: "",
        submission,
        proposalId: result.proposalId,
        memoryCandidateCount: result.memoryCandidateCount,
      };
    }
    if (result.status === "pending") {
      return { status: "pending", message: ROADMAP_COPY.pending, submission };
    }
    return {
      status: "error",
      message:
        "That proposal could not be prepared. Nothing was saved; try again.",
      submission,
      draft,
    };
  } catch (error) {
    return toActionState(error, submission, draft);
  }
}

export async function acceptRoadmapAction(
  proposalId: unknown,
  expectedHeadRevision: unknown,
): Promise<RoadmapActionState> {
  const submission = Date.now();
  try {
    const roadmaps = await createRoadmapRepository();
    const acceptance = await roadmaps.acceptProposal(
      parseRoadmapProposalId(proposalId),
      parseExpectedHeadRevision(expectedHeadRevision),
    );
    revalidatePath("/home/plan/roadmap");
    return {
      status: "accepted",
      message: "",
      submission,
      proposalId: acceptance.proposalId,
    };
  } catch (error) {
    return toActionState(error, submission);
  }
}

export async function declineRoadmapAction(
  proposalId: unknown,
): Promise<RoadmapActionState> {
  const submission = Date.now();
  try {
    const roadmaps = await createRoadmapRepository();
    const id = parseRoadmapProposalId(proposalId);
    await roadmaps.declineProposal(id);
    revalidatePath("/home/plan/roadmap");
    return { status: "declined", message: "", submission, proposalId: id };
  } catch (error) {
    return toActionState(error, submission);
  }
}

/**
 * An edit creates a new reviewable proposal linked to its source.
 *
 * The content is revalidated by the same validator the model's own output goes
 * through, and then again inside the database. An owner is not more trusted
 * than the coach here: they are equally capable of leaving a six-day gap
 * between two phases.
 */
export async function editRoadmapAction(
  proposalId: unknown,
  content: unknown,
): Promise<RoadmapActionState> {
  const submission = Date.now();
  try {
    const roadmaps = await createRoadmapRepository();
    const id = parseRoadmapProposalId(proposalId);
    const source = await roadmaps.getProposal(id);
    if (!source) throw new RoadmapConflictError("not-available");

    const validation = validateRoadmapCandidate({
      body: JSON.stringify({ roadmap: content, memoryCandidates: null }),
      context: await buildEditValidationContext(source),
    });

    if (validation.outcome === "rejected") {
      return {
        status: "validation",
        message: editRejectionMessage(validation.reason),
        submission,
      };
    }

    const newId = await roadmaps.editProposal(id, validation.response.roadmap);
    revalidatePath("/home/plan/roadmap");
    return { status: "edited", message: "", submission, proposalId: newId };
  } catch (error) {
    return toActionState(error, submission);
  }
}

function editRejectionMessage(reason: string): string {
  if (reason === "business_rule") {
    return "Phases must run back to back and cover the whole roadmap, with no gap and no overlap.";
  }
  if (reason === "impossible_date") {
    return "Every date must sit inside the roadmap, and each milestone inside its own phase.";
  }
  if (reason === "unowned_goal_reference") {
    return "One of the goals is no longer active. Reload and edit again.";
  }
  if (reason === "unsafe_content") {
    return "That wording cannot be saved. FitTip does not diagnose, prescribe, or call training safe.";
  }
  if (reason === "safety_requirement") {
    return "You recorded a symptom recently, so the roadmap needs at least one note about how it holds load back.";
  }
  return "Check the highlighted details. Nothing has been saved yet.";
}

function parseToday(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new RoadmapValidationError("today");
  }
  // The browser supplies the owner's local date, which is what decision 1 means
  // by "today". It is bounded rather than trusted: the database independently
  // refuses a start more than a day before its own UTC date, so a wrong or
  // hostile value cannot buy a roadmap that begins in the past.
  return value;
}

function optionalProposalId(value: unknown): string | null {
  if (typeof value !== "string" || value === "") return null;
  return parseRoadmapProposalId(value);
}

/**
 * One place that turns a thrown error into a state a screen can render.
 *
 * No branch here surfaces a provider message, a database message, or the
 * owner's own text. `CoachAIError` already carries user-safe copy from a fixed
 * table; everything else collapses to a message that says nothing was saved.
 */
function toActionState(
  error: unknown,
  submission: number,
  draft?: RoadmapActionState["draft"],
): RoadmapActionState {
  if (error instanceof OwnerTextValidationError) {
    return {
      status: "validation",
      message:
        error.field === "planning_note"
          ? "That note is longer than 1,000 characters. Shorten it and try again."
          : "That feedback is longer than 500 characters. Shorten it and try again.",
      submission,
      ...(draft ? { draft } : {}),
    };
  }
  if (error instanceof RoadmapValidationError) {
    return {
      status: "validation",
      message: "Check the highlighted details. Nothing has been saved yet.",
      submission,
      ...(draft ? { draft } : {}),
    };
  }
  if (error instanceof RoadmapConflictError) {
    if (error.reason === "regeneration-cap") {
      return {
        status: "cap-reached",
        message: ROADMAP_COPY.regenerationCapReached,
        submission,
      };
    }
    return {
      status: "conflict",
      message:
        error.reason === "sources-changed"
          ? "Your goals, memory or training changed after this was prepared. Review it again."
          : error.reason === "already-decided"
            ? "That proposal has already been decided. Reload to see where it went."
            : "Your roadmap changed in another tab. Reload before deciding again.",
      submission,
    };
  }
  if (error instanceof CoachAIContextTooLargeError) {
    // Decision 4a: name the source. "There is too much to consider" is a
    // refusal nobody can act on.
    return {
      status: "validation",
      message: contextSourceMessage(error.source),
      submission,
      ...(draft ? { draft } : {}),
    };
  }
  if (error instanceof CoachAIError) {
    return {
      status: "error",
      message: `${error.message} Nothing was saved.`,
      submission,
      ...(draft ? { draft } : {}),
    };
  }
  if (error instanceof RoadmapAuthenticationError) {
    return {
      status: "session",
      message: "Your session ended. Sign in again before continuing.",
      submission,
    };
  }
  return {
    status: "error",
    message: "The roadmap could not be prepared. Nothing was saved.",
    submission,
    ...(draft ? { draft } : {}),
  };
}

function contextSourceMessage(source: string): string {
  switch (source) {
    case "memory":
      return "There is too much active memory to send in one request. Disable or shorten a few items, then try again.";
    case "targetable_goals":
    case "historical_goals":
      return "There are too many active goals to send in one request. Pause or archive a few, then try again.";
    case "planning_note":
      return "That note is longer than the request allows. Shorten it and try again.";
    case "regeneration_feedback":
      return "That feedback is longer than the request allows. Shorten it and try again.";
    case "previous_proposal":
      return "The previous proposal is too large to send back to the coach. Edit it directly instead.";
    default:
      return "There is too much to send in one request. Try a shorter horizon.";
  }
}
