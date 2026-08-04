import "server-only";

import {
  utcIsoDate,
  type MemoryItemView,
} from "@/server/memory/memory-records";
import type {
  CoachAIGoalRecord,
  CoachAIOwnedRecords,
} from "@/server/ai/context";
import { CoachAIError } from "@/server/ai/errors";
import type { CoachAIOwner } from "@/server/ai/owner";

/**
 * The seam between the coaching boundary and the database.
 *
 * Only this module and `owner.ts` may reach the accepted repositories, and an
 * adapter may never reach them at all. The repositories derive their own owner
 * from verified Auth claims and repeat the `user_id` predicate on every read, so
 * what arrives here is already owner-scoped; the verified owner is carried
 * through so the request that follows is stamped with an id no caller supplied.
 */

export interface CoachAIContextSource {
  load(owner: CoachAIOwner): Promise<CoachAIOwnedRecords>;
}

/** The reads this needs, stated structurally so a fake needs no database. */
type GoalReader = {
  list(): Promise<{ revision: number; goals: CoachAIGoalRecord[] }>;
};

type MemoryReader = {
  list(today?: string): Promise<{
    revision: number;
    today: string;
    items: MemoryItemView[];
  }>;
};

export class RepositoryCoachAIContextSource implements CoachAIContextSource {
  constructor(
    private readonly goals: GoalReader,
    private readonly memory: MemoryReader,
    private readonly today: () => string = utcIsoDate,
  ) {}

  async load(owner: CoachAIOwner): Promise<CoachAIOwnedRecords> {
    const today = this.today();

    // Two independent owner-scoped reads, issued together rather than as a
    // waterfall.
    const [goalCollection, memoryCollection] = await Promise.all([
      this.goals.list(),
      this.memory.list(today),
    ]);

    if (memoryCollection.today !== today) {
      // The owner date decides which memory is review-due. If the two reads
      // disagree about it, the context is not reproducible and does not go out.
      throw new CoachAIError("context_invalid");
    }

    return {
      ownerId: owner.id,
      today,
      goalCollectionRevision: goalCollection.revision,
      memoryCollectionRevision: memoryCollection.revision,
      goals: goalCollection.goals,
      memory: memoryCollection.items,
    };
  }
}
