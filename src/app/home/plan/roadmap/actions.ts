"use server";

import { revalidatePath } from "next/cache";

// A `"use server"` module may export nothing but async functions, so the state
// type and its initial value live in `action-state.ts` and the client imports
// them from there directly.
import type { RoadmapActionDraft, RoadmapActionState } from "./action-state";

import { isoDateInTimezone } from "@/lib/date/local-date";
import { ROADMAP_CONTROL_COPY } from "@/lib/roadmap/roadmap-control-copy";
import { createServerUserClient } from "@/lib/supabase/server-user-client";
import {
  CoachAIContextBelowMinimumError,
  CoachAIContextTooLargeError,
} from "@/server/ai/context";
import { CoachAIError } from "@/server/ai/errors";
import { verifyCoachAIOwner } from "@/server/ai/owner";
import {
  OwnerTextValidationError,
  parsePlanningNote,
  parseRegenerationFeedback,
} from "@/server/ai/owner-text";
import { validateRoadmapCandidate } from "@/server/ai/output-validation";
import {
  createProfileRepository,
  ProfileAuthenticationError,
} from "@/server/repositories/profile-repository";
import {
  createRoadmapRepository,
  RoadmapAuthenticationError,
  RoadmapConflictError,
} from "@/server/repositories/roadmap-repository";
import { buildEditValidationContext } from "@/server/roadmap/roadmap-edit";
import { generateRoadmapProposal } from "@/server/roadmap/roadmap-generation";
import {
  parseExpectedHeadRevision,
  parseRoadmapEndDate,
  parseRoadmapProposalId,
  RoadmapValidationError,
} from "@/server/roadmap/roadmap-records";

/**
 * The roadmap Server Actions.
 *
 * Every one of them authenticates first. A Server Action is a public endpoint,
 * not a private function, so the owner is derived from verified Auth claims and
 * never from anything the form carried — the owner id is not a form field here
 * and could not be, because none of ADR-015's five functions accepts one.
 *
 * Two other things are deliberately not taken from the request. The owner's
 * today is read from their confirmed time zone rather than from a hidden field,
 * so a wrong or hostile value cannot move the horizon every later check is
 * measured against. And the expected head revision, which the accept path does
 * take from the form, is only ever a *stale* value in the owner's own hands:
 * the database compares it against the real head under a lock and refuses a
 * mismatch, so the worst a tampered one can do is refuse the tamperer's own
 * acceptance.
 *
 * Nothing here formats a user-visible string. Every message comes from
 * `ROADMAP_CONTROL_COPY`, which `ROADMAP_COPY` spreads in, so the surface and
 * its actions cannot drift apart in wording.
 */

const OUTCOMES = ROADMAP_CONTROL_COPY.outcomes;

/**
 * Compose, for an initial request and for a regeneration alike.
 *
 * Which one it is is decided by whether a predecessor is present, and the
 * database re-derives that independently. Nothing here trusts a hidden field to
 * say "this is a regeneration": a claimed regeneration with no declined,
 * same-horizon predecessor is refused before the coach is called.
 */
export async function generateRoadmapAction(
  previous: RoadmapActionState,
  formData: FormData,
): Promise<RoadmapActionState> {
  const submission = previous.submission + 1;
  const draft: RoadmapActionDraft = {
    endDate: text(formData, "endDate"),
    planningNote: text(formData, "planningNote"),
    regenerationFeedback: text(formData, "regenerationFeedback"),
  };

  try {
    const [owner, roadmaps, profiles] = await Promise.all([
      createServerUserClient().then(verifyCoachAIOwner),
      createRoadmapRepository(),
      createProfileRepository(),
    ]);

    const today = await ownerToday(profiles);
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
      return invalid(OUTCOMES.feedbackRequired, submission, draft);
    }
    if (previousProposalId === null && regenerationFeedback !== null) {
      return invalid(OUTCOMES.feedbackWithoutRegeneration, submission, draft);
    }

    const idempotencyKey = text(formData, "idempotencyKey");
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey)) {
      return invalid(OUTCOMES.requestUnidentified, submission, draft);
    }

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
      { roadmaps },
    );

    revalidatePath("/home/plan/roadmap");

    if (result.status === "proposal") {
      return {
        status: "proposal",
        message: OUTCOMES.proposalReady,
        submission,
        proposalId: result.proposalId,
        memoryCandidateCount: result.memoryCandidateCount,
      };
    }
    if (result.status === "pending") {
      return {
        status: "pending",
        message: ROADMAP_CONTROL_COPY.pending,
        submission,
      };
    }
    return {
      status: "error",
      message: OUTCOMES.generationFailed,
      submission,
      draft,
    };
  } catch (error) {
    return toActionState(error, submission, draft);
  }
}

export async function acceptRoadmapAction(
  previous: RoadmapActionState,
  formData: FormData,
): Promise<RoadmapActionState> {
  const submission = previous.submission + 1;
  try {
    const roadmaps = await createRoadmapRepository();
    const acceptance = await roadmaps.acceptProposal(
      parseRoadmapProposalId(formData.get("proposalId")),
      parseExpectedHeadRevision(formData.get("expectedHeadRevision")),
    );
    revalidatePath("/home/plan/roadmap");
    return {
      status: "accepted",
      message: OUTCOMES.accepted,
      submission,
      proposalId: acceptance.proposalId,
    };
  } catch (error) {
    return toActionState(error, submission);
  }
}

export async function declineRoadmapAction(
  previous: RoadmapActionState,
  formData: FormData,
): Promise<RoadmapActionState> {
  const submission = previous.submission + 1;
  try {
    const roadmaps = await createRoadmapRepository();
    const proposalId = parseRoadmapProposalId(formData.get("proposalId"));
    await roadmaps.declineProposal(proposalId);
    revalidatePath("/home/plan/roadmap");
    return {
      status: "declined",
      message: OUTCOMES.declined,
      submission,
      proposalId,
    };
  } catch (error) {
    return toActionState(error, submission);
  }
}

/**
 * An edit creates a new reviewable proposal linked to its source.
 *
 * The content is revalidated by the same validator the coach's own output goes
 * through, and then bounded again inside the database. An owner is not more
 * trusted than the coach here: they are equally capable of leaving a six-day
 * gap between two phases.
 *
 * Called directly rather than through a form, because the editor holds a nested
 * draft that no `FormData` encoding would survive intact.
 */
export async function editRoadmapAction(
  proposalId: unknown,
  content: unknown,
  submissionBefore: number,
): Promise<RoadmapActionState> {
  const submission = submissionBefore + 1;
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
      return invalid(editRejectionMessage(validation.reason), submission);
    }

    const newId = await roadmaps.editProposal(id, validation.response.roadmap);
    revalidatePath("/home/plan/roadmap");
    return {
      status: "edited",
      message: OUTCOMES.edited,
      submission,
      proposalId: newId,
    };
  } catch (error) {
    return toActionState(error, submission);
  }
}

/**
 * The owner's own calendar date.
 *
 * Read from the confirmed zone rather than sent by the browser. A roadmap's
 * whole horizon is measured from it, and the same value becomes the proposal's
 * start date, so accepting a client-supplied one would let a request choose the
 * window every later validation is checked against. An unconfirmed zone falls
 * back to UTC here and is refused a few lines later by the context source,
 * which is where the owner gets told what to do about it.
 */
async function ownerToday(
  profiles: Awaited<ReturnType<typeof createProfileRepository>>,
): Promise<string> {
  const profile = await profiles.getCurrentProfile();
  return profile?.timezoneName == null
    ? new Date().toISOString().slice(0, 10)
    : isoDateInTimezone(new Date(), profile.timezoneName);
}

function editRejectionMessage(reason: string): string {
  const rejections: Record<string, string> =
    ROADMAP_CONTROL_COPY.editRejections;
  return rejections[reason] ?? OUTCOMES.checkDetails;
}

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function optionalProposalId(value: unknown): string | null {
  if (typeof value !== "string" || value === "") return null;
  return parseRoadmapProposalId(value);
}

function invalid(
  message: string,
  submission: number,
  draft?: RoadmapActionDraft,
): RoadmapActionState {
  return {
    status: "validation",
    message,
    submission,
    ...(draft ? { draft } : {}),
  };
}

/**
 * One place that turns a thrown error into a state a screen can render.
 *
 * No branch here surfaces a provider message, a database message, or the
 * owner's own text. `CoachAIError` already carries user-safe copy from a fixed
 * table, and even that is not forwarded verbatim: the roadmap's own wording is
 * what the owner reads, so a coaching-layer sentence cannot leak the shape of a
 * configuration problem onto this surface.
 */
function toActionState(
  error: unknown,
  submission: number,
  draft?: RoadmapActionDraft,
): RoadmapActionState {
  if (error instanceof OwnerTextValidationError) {
    return invalid(
      error.field === "planning_note"
        ? OUTCOMES.noteTooLong
        : OUTCOMES.feedbackTooLong,
      submission,
      draft,
    );
  }
  if (error instanceof RoadmapValidationError) {
    return invalid(OUTCOMES.checkDetails, submission, draft);
  }
  if (error instanceof RoadmapConflictError) {
    if (error.reason === "regeneration-cap") {
      return {
        status: "cap-reached",
        message: ROADMAP_CONTROL_COPY.regenerationCapReached,
        submission,
      };
    }
    return {
      status: "conflict",
      message:
        error.reason === "sources-changed"
          ? OUTCOMES.sourcesChanged
          : error.reason === "already-decided"
            ? OUTCOMES.alreadyDecided
            : error.reason === "not-available"
              ? OUTCOMES.notAvailable
              : OUTCOMES.stale,
      submission,
    };
  }
  if (error instanceof CoachAIContextBelowMinimumError) {
    // Decision 5's refusal, named rather than generalized. The one requirement
    // this surface can actually hit is the time zone: the context source reads
    // the owner's window from it and has nothing to read without one.
    return invalid(
      error.missing.includes("resolved_timezone")
        ? OUTCOMES.timezoneRequired
        : OUTCOMES.notEnoughSetUp,
      submission,
      draft,
    );
  }
  if (error instanceof CoachAIContextTooLargeError) {
    // Decision 4a: name the source. "There is too much to consider" is a
    // refusal nobody can act on.
    return invalid(contextSourceMessage(error.source), submission, draft);
  }
  if (error instanceof CoachAIError) {
    return {
      status: "error",
      message: OUTCOMES.generationFailed,
      submission,
      ...(draft ? { draft } : {}),
    };
  }
  if (
    error instanceof RoadmapAuthenticationError ||
    error instanceof ProfileAuthenticationError
  ) {
    return { status: "session", message: OUTCOMES.sessionEnded, submission };
  }
  return {
    status: "error",
    message: draft ? OUTCOMES.generationFailed : OUTCOMES.decisionFailed,
    submission,
    ...(draft ? { draft } : {}),
  };
}

function contextSourceMessage(source: string): string {
  const tooLarge = ROADMAP_CONTROL_COPY.contextTooLarge;
  switch (source) {
    case "memory":
      return tooLarge.memory;
    case "targetable_goals":
    case "historical_goals":
      return tooLarge.goals;
    case "planning_note":
      return tooLarge.planning_note;
    case "regeneration_feedback":
      return tooLarge.regeneration_feedback;
    case "previous_proposal":
      return tooLarge.previous_proposal;
    default:
      return tooLarge.other;
  }
}
