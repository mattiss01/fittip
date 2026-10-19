import "server-only";

import type { CoachAIGoalSuggestion } from "@/server/ai/contracts";
import { logGoalSuggestionFailure } from "@/server/proposal-logging/memory-candidate-batch";
import { createGoalSuggestions } from "@/server/repositories/goal-suggestion-repository";

/**
 * ADR-034. Records the coach's goal suggestion after the proposal it came with
 * has committed. Its failure is swallowed on purpose, as the memory batch's
 * is (ADR-015): a suggestion that cannot be stored must not take a valid
 * proposal with it. Logged by code only, never its words. True when one was
 * recorded.
 */
export async function recordGoalSuggestion(
  source: "plan" | "roadmap",
  completionToken: string,
  suggestion: CoachAIGoalSuggestion | null,
): Promise<boolean> {
  if (suggestion === null) return false;
  try {
    await (
      await createGoalSuggestions()
    ).record(source, completionToken, suggestion);
    return true;
  } catch (error) {
    logGoalSuggestionFailure(source, error);
    return false;
  }
}
