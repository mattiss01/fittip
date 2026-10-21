import "server-only";

import { createGoalRepository } from "@/server/repositories/goal-repository";
import { createGoalSuggestions } from "@/server/repositories/goal-suggestion-repository";
import { createMemoryRepository } from "@/server/repositories/memory-repository";

/**
 * Which of the coach's suggestions wait for the owner's decision, and whether
 * there is no active goal at all.
 */
export type OpenDecisions = {
  goals: boolean;
  memory: boolean;
  noGoal: boolean;
};

/**
 * Whether a goal or memory suggestion is still undecided, for the dots on
 * You, Goals and Memory (owner, 19 Oct 2026: a suggestion skipped in a
 * review should not be forgotten), and whether no goal is active, which marks
 * You and Goals too (owner, 21 Oct 2026: the coach plans toward goals, so an
 * account without one should be told to add one). Only a mark: a read that
 * fails shows none, and the page itself says what is wrong.
 */
export async function readOpenDecisions(): Promise<OpenDecisions> {
  const [goals, memory, hasActiveGoal] = await Promise.all([
    createGoalSuggestions()
      .then((suggestions) => suggestions.hasOpen())
      .catch(() => false),
    createMemoryRepository()
      .then((memory) => memory.hasProposed())
      .catch(() => false),
    createGoalRepository()
      .then((goals) => goals.hasActive())
      .catch(() => true),
  ]);
  return { goals, memory, noGoal: !hasActiveGoal };
}
