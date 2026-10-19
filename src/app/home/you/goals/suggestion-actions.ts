"use server";

import { revalidatePath } from "next/cache";

import type { GoalSuggestionActionState } from "./suggestion-action-state";

import {
  createGoalSuggestions,
  GoalSuggestionAuthenticationError,
  GoalSuggestionConflictError,
} from "@/server/repositories/goal-suggestion-repository";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Accept a goal the coach suggested, as Core or Supporting, or reject it
 * (ADR-034). Accept creates the goal through the goal rules, so a fourth core
 * goal is refused here with the reason and nothing is created.
 *
 * Called from the reviews and from Goals; a Server Action refreshes the page
 * it was called from, which drops a decided suggestion and hands the next one
 * the new goal revision. Goals is refreshed too, for the list it shows.
 */
export async function decideGoalSuggestionAction(
  previous: GoalSuggestionActionState,
  formData: FormData,
): Promise<GoalSuggestionActionState> {
  const suggestionId = String(formData.get("suggestionId") ?? "");
  const choice = String(formData.get("choice") ?? "");
  const expected = Number(formData.get("expectedGoalRevision"));
  const result = (
    status: GoalSuggestionActionState["status"],
    message: string,
  ): GoalSuggestionActionState => ({
    status,
    message,
    submission: previous.submission + 1,
    suggestionId,
  });

  const decision =
    choice === "core" || choice === "supporting"
      ? ({ decision: "accept", priorityTier: choice } as const)
      : choice === "reject"
        ? ({ decision: "reject", priorityTier: null } as const)
        : null;
  if (
    decision === null ||
    !UUID.test(suggestionId) ||
    !Number.isSafeInteger(expected) ||
    expected < 0
  ) {
    return result("error", "That choice could not be read. Nothing changed.");
  }

  try {
    await (
      await createGoalSuggestions()
    ).decide({ suggestionId, expectedGoalRevision: expected, ...decision });
    revalidatePath("/home/you/goals");
    return result(
      "saved",
      decision.decision === "reject"
        ? "Suggestion rejected."
        : decision.priorityTier === "core"
          ? "Added as a core goal."
          : "Added as a supporting goal.",
    );
  } catch (error) {
    if (error instanceof GoalSuggestionConflictError) {
      return result(
        "conflict",
        error.reason === "core-limit"
          ? "You already have three core goals. Add it as supporting, or change a core goal first."
          : error.reason === "closed"
            ? "That suggestion was already decided."
            : "Your goals changed just now. Try again.",
      );
    }
    if (error instanceof GoalSuggestionAuthenticationError) {
      return result("session", "Your session ended. Sign in again.");
    }
    return result("error", "That could not be saved. Nothing changed.");
  }
}
