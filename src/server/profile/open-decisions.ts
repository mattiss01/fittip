import "server-only";

import { createGoalSuggestions } from "@/server/repositories/goal-suggestion-repository";
import { createMemoryRepository } from "@/server/repositories/memory-repository";

/** Which of the coach's suggestions wait for the owner's decision. */
export type OpenDecisions = { goals: boolean; memory: boolean };

/**
 * Whether a goal or memory suggestion is still undecided, for the dots on
 * You, Goals and Memory (owner, 19 Oct 2026: a suggestion skipped in a
 * review should not be forgotten). Only a mark: a read that fails shows none,
 * and the page itself says what is wrong.
 */
export async function readOpenDecisions(): Promise<OpenDecisions> {
  const [goals, memory] = await Promise.all([
    createGoalSuggestions()
      .then((suggestions) => suggestions.hasOpen())
      .catch(() => false),
    createMemoryRepository()
      .then((memory) => memory.hasProposed())
      .catch(() => false),
  ]);
  return { goals, memory };
}
