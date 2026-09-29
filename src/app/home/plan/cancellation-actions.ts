"use server";

import { revalidatePath } from "next/cache";

import type { CancellationActionState } from "./cancellation-action-state";

import {
  createSessionCancellations,
  SessionCancellationAuthenticationError,
} from "@/server/repositories/session-cancellation-repository";
import { SessionCancellationValidationError } from "@/server/rolling-plan/session-cancellation";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Edits or clears why a cancelled session was cancelled (owner,
 * 29 Sep 2026). It annotates the plan and changes nothing in it, so there is
 * no revision to check: the database admits only the owner's own cancelled
 * session, on any day, and refuses everything else as one invalid request.
 */
export async function setCancellationReasonAction(
  previous: CancellationActionState,
  formData: FormData,
): Promise<CancellationActionState> {
  const submission = previous.submission + 1;
  const sessionId = formData.get("sessionId");
  try {
    if (typeof sessionId !== "string" || !UUID.test(sessionId)) {
      throw new SessionCancellationValidationError();
    }
    const saved = await (
      await createSessionCancellations()
    ).set(
      sessionId.toLowerCase(),
      formData.get("cancelReason"),
      formData.get("cancelNote"),
    );
    revalidatePath("/home/plan");
    return {
      status: "saved",
      message:
        saved.reason === null && saved.note === null
          ? "Reason cleared."
          : "Reason saved.",
      submission,
    };
  } catch (error) {
    if (error instanceof SessionCancellationValidationError) {
      return {
        status: "validation",
        message:
          "That reason could not be saved. Pick one of the options and keep the note under 500 characters.",
        submission,
      };
    }
    if (error instanceof SessionCancellationAuthenticationError) {
      return {
        status: "session",
        message:
          "Your session ended. Sign in again before changing the reason.",
        submission,
      };
    }
    return {
      status: "error",
      message: "The reason could not be saved. Reload and try again.",
      submission,
    };
  }
}
