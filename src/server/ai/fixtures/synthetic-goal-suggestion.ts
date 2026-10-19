import "server-only";

import type { CoachAIContext } from "@/server/ai/contracts";
import { normalizeOwnerText } from "@/server/ai/owner-text";

/**
 * ADR-034, for the example coach: a goal suggestion only when the planning
 * note says "goal", so every other flow is as it was and the panel can be seen
 * without a provider. The note's first sentence is both its title (cut to
 * fit) and its outcome; the sport is the first target goal's, or "General
 * training". A real coach decides whether a note states a new objective; the
 * fixture only shows the shape.
 */
export function syntheticGoalSuggestion(context: CoachAIContext): {
  title: string;
  desiredOutcome: string;
  sports: string[];
  targetDate: null;
} | null {
  if (context.planningNote === null) return null;
  const note = normalizeOwnerText(context.planningNote);
  if (!/\bgoal\b/i.test(note)) return null;
  const sentence = (note.split(/(?<=\.)\s+/)[0] ?? note).trim();
  if (sentence.length === 0) return null;
  return {
    title: sentence.length <= 80 ? sentence : `${sentence.slice(0, 79)}…`,
    desiredOutcome: sentence.slice(0, 1000),
    sports: [context.targetableGoals[0]?.sports[0] ?? "General training"],
    targetDate: null,
  };
}
