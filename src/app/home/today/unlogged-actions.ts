"use server";

import { revalidatePath } from "next/cache";

import type { SkipSessionState } from "./unlogged-state";

import { isoDateInTimezone } from "@/lib/date/local-date";
import {
  CompletionConflictError,
  CompletionDuplicateError,
  CompletionFutureDateError,
  CompletionTimezoneRequiredError,
  CompletionValidationError,
} from "@/server/completions/completion-log";
import {
  CompletionAuthenticationError,
  createCompletionLog,
} from "@/server/repositories/completion-log-repository";
import {
  createProfileRepository,
  ProfileAuthenticationError,
} from "@/server/repositories/profile-repository";
import {
  createRollingPlan,
  RollingPlanAuthenticationError,
} from "@/server/repositories/rolling-plan-repository";

/**
 * "Didn't do it" on the reminder (owner, 5 Nov 2026): a Skipped log for one
 * past session, dated the day it was planned, written by the owner's own tap
 * through the same write as the log form. It is an ordinary log, edited or
 * deleted like any other, and like the form's Skipped it never touches the
 * plan.
 *
 * The session's name comes from the plan row, not from the form, and the
 * session has to be on the day the form names, before owner-local today, and
 * not cancelled. Nothing else is sent.
 */
export async function skipUnloggedSessionAction(
  previous: SkipSessionState,
  formData: FormData,
): Promise<SkipSessionState> {
  const answer = (
    status: SkipSessionState["status"],
    message: string,
    completionId?: string,
  ): SkipSessionState => ({
    status,
    message,
    submission: previous.submission + 1,
    ...(completionId === undefined ? {} : { completionId }),
  });

  const sessionId = formData.get("plannedSessionId");
  const plannedDate = formData.get("plannedDate");
  if (
    typeof sessionId !== "string" ||
    typeof plannedDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(plannedDate)
  ) {
    return answer(
      "error",
      "That session could not be read. Nothing was logged.",
    );
  }

  try {
    const timezoneName = (
      await (await createProfileRepository()).getCurrentProfile()
    )?.timezoneName;
    if (!timezoneName) {
      return answer(
        "error",
        "Confirm your time zone on the Plan before logging training.",
      );
    }
    const today = isoDateInTimezone(new Date(), timezoneName);
    const session =
      plannedDate < today
        ? (
            await (
              await createRollingPlan()
            ).getPlanCards(plannedDate, plannedDate)
          ).sessions.find((candidate) => candidate.id === sessionId)
        : undefined;
    if (session === undefined || session.status !== "active") {
      return answer(
        "error",
        "That session has moved or changed. Reload Today. Nothing was logged.",
      );
    }
    const receipt = await (
      await createCompletionLog()
    ).applyChange({
      operation: "create",
      completion: {
        status: "skipped",
        actualLocalDate: plannedDate,
        planSessionId: session.id,
        title: session.title,
        sport: session.sport,
        activities: [],
        painReported: false,
        illnessReported: false,
        injuryReported: false,
        severeFatigueReported: false,
      },
    });
    // The reminder, the Today dot, and the Plan and Progress that show the
    // log all live under the home layout.
    revalidatePath("/home", "layout");
    return answer("saved", "Logged as skipped.", receipt.completionId);
  } catch (error) {
    if (error instanceof CompletionDuplicateError) {
      return answer(
        "error",
        "That session already has a log. Reload Today to see it.",
      );
    }
    if (error instanceof CompletionTimezoneRequiredError) {
      return answer(
        "error",
        "Confirm your time zone on the Plan before logging training.",
      );
    }
    if (error instanceof CompletionConflictError) {
      return answer(
        "error",
        "That session changed somewhere else. Reload Today. Nothing was logged.",
      );
    }
    if (
      error instanceof CompletionValidationError ||
      error instanceof CompletionFutureDateError
    ) {
      return answer(
        "error",
        "That session could not be logged as skipped. Nothing was logged.",
      );
    }
    if (
      error instanceof CompletionAuthenticationError ||
      error instanceof RollingPlanAuthenticationError ||
      error instanceof ProfileAuthenticationError
    ) {
      return answer(
        "error",
        "Your session ended. Sign in again before logging training.",
      );
    }
    return answer(
      "error",
      "The log could not be confirmed. Reload Today and check before trying again.",
    );
  }
}
