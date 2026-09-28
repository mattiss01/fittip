"use server";

import { revalidatePath } from "next/cache";

import type { DismissResult, FillResult } from "./fill-state";
import { toFillProposal } from "./open-proposals";
import { readPlanWindow } from "../plan-window";

import { createServerUserClient } from "@/lib/supabase/server-user-client";
import { CoachAIError } from "@/server/ai/errors";
import { verifyCoachAIOwner } from "@/server/ai/owner";
import {
  OwnerTextValidationError,
  parseSessionFillNote,
} from "@/server/ai/owner-text";
import { ProfileAuthenticationError } from "@/server/repositories/profile-repository";
import {
  createRollingPlan,
  RollingPlanAuthenticationError,
} from "@/server/repositories/rolling-plan-repository";
import {
  createSessionActivityRepository,
  SessionActivityAuthenticationError,
  SessionActivityConflictError,
} from "@/server/repositories/session-activity-repository";
import { RollingPlanTimezoneRequiredError } from "@/server/rolling-plan/rolling-plan";
import { generateSessionActivities } from "@/server/session-detail/session-activity-generation";

/**
 * Fill with coach, from a session's Edit panel (A7-4).
 *
 * The owner is derived from verified Auth claims. The session's date and the
 * plan revision are read here rather than taken from the form: the caller
 * names only which of its own sessions, a note, and the key that makes a
 * retry of an uncertain request a replay instead of a second paid call.
 *
 * Nothing here writes to the plan. The answer opens as a suggestion beside the
 * session's activity list; the owner's Accept loads it into that list, and
 * their own Save is what changes the session — through the plan's write
 * rules, which then record the decision (ADR-020 decision 3).
 *
 * A new proposal revalidates the Plan, so its read of open suggestions knows
 * this one: if the save it is accepted into is refused, the remounted form
 * gets it back from there rather than losing it until a reload.
 */
export async function fillSessionActivitiesAction(input: {
  sessionId: string;
  note: string;
  idempotencyKey: string;
}): Promise<FillResult> {
  try {
    if (
      !UUID_PATTERN.test(input.sessionId) ||
      !KEY_PATTERN.test(input.idempotencyKey)
    ) {
      return refused(COPY.invalid);
    }
    const note = parseSessionFillNote(input.note);

    const [owner, plan, window, requests] = await Promise.all([
      createServerUserClient().then(verifyCoachAIOwner),
      createRollingPlan(),
      readPlanWindow(),
      createSessionActivityRepository(),
    ]);
    const slice = await plan.getPlanSlice(window.today, window.lastDate);
    const session = slice.sessions.find(
      (candidate) =>
        candidate.id === input.sessionId && candidate.status === "active",
    );
    if (!session) return refused(COPY.unavailable);

    const result = await generateSessionActivities(
      {
        owner,
        sessionId: session.id,
        sessionDate: session.localDate,
        expectedPlanRevision: slice.revision,
        note,
        idempotencyKey: input.idempotencyKey,
      },
      { requests },
    );
    if (result.status === "pending") {
      return { status: "pending", message: COPY.pending };
    }
    if (result.status === "failed") return refused(COPY.failed);

    const proposal = await requests.getProposal(result.proposalId);
    if (!proposal || proposal.sessionId !== session.id) {
      return refused(COPY.failed);
    }
    revalidatePath("/home/plan");
    return { status: "proposal", proposal: toFillProposal(proposal) };
  } catch (error) {
    return refused(fillFailureCopy(error));
  }
}

/**
 * Dismiss leaves the owner's activity list as it is; this records that they
 * said no. Final, like accepting: the same answer again replays.
 */
export async function dismissSessionActivitiesAction(
  proposalId: string,
): Promise<DismissResult> {
  if (!UUID_PATTERN.test(proposalId)) {
    return { status: "refused", message: COPY.invalid };
  }
  try {
    const requests = await createSessionActivityRepository();
    await requests.decide(proposalId, "dismissed");
    return { status: "dismissed", message: COPY.dismissed };
  } catch (error) {
    if (
      error instanceof SessionActivityConflictError &&
      error.reason === "already-decided"
    ) {
      return { status: "refused", message: COPY.alreadyAccepted };
    }
    if (error instanceof SessionActivityAuthenticationError) {
      return { status: "refused", message: COPY.session };
    }
    return { status: "refused", message: COPY.dismissFailed };
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The request table's own bound, 16 to 128 characters. */
const KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

const COPY = {
  invalid: "That request could not be understood. Reload and try again.",
  unavailable:
    "This session is no longer on your plan as it was. Reload and try again.",
  past: "This session's day has passed, so the coach cannot fill it.",
  pending:
    "The coach is still working on this request. Try again in a moment to see its answer.",
  failed: "The coach could not suggest activities this time. Nothing changed.",
  noteTooLong: "The note for the coach can be at most 500 characters.",
  session: "Your session ended. Sign in again, then try again.",
  timezone: "Confirm your time zone on the Plan before asking the coach.",
  dismissed: "Suggestion dismissed. Your activity list is unchanged.",
  alreadyAccepted:
    "That suggestion was already saved, so it cannot be dismissed now.",
  dismissFailed:
    "The dismissal could not be recorded, so the suggestion is still open. Try again.",
} as const;

function refused(message: string): FillResult {
  return { status: "refused", message };
}

/**
 * Nothing that reaches the screen is derived from a database or provider
 * message: each branch is a domain error with fixed copy, and a coaching
 * error's own message is already drawn from a fixed table.
 */
function fillFailureCopy(error: unknown): string {
  if (error instanceof OwnerTextValidationError) return COPY.noteTooLong;
  if (
    error instanceof SessionActivityAuthenticationError ||
    error instanceof RollingPlanAuthenticationError ||
    error instanceof ProfileAuthenticationError
  ) {
    return COPY.session;
  }
  if (error instanceof RollingPlanTimezoneRequiredError) return COPY.timezone;
  if (error instanceof SessionActivityConflictError) {
    return error.reason === "session-past" ? COPY.past : COPY.unavailable;
  }
  if (error instanceof CoachAIError) return error.message;
  return COPY.failed;
}
