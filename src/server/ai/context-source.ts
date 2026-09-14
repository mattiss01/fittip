import "server-only";

import type { CoachAIOwnedRecords } from "@/server/ai/context";
import type { CoachAIOwner } from "@/server/ai/owner";

/**
 * The injected context seam.
 *
 * M3-11 deleted the legacy database adapter, and for a while nothing implemented
 * this but test stubs and fixtures. `OwnedRecordsCoachAIContextSource` is the
 * production implementation, and the composition root falls back to it, so a
 * request that injects nothing reads the owner's real records rather than a
 * stub. The seam stays because a fixture composition and every unit test need to
 * substitute one, not because production has a choice to make.
 */
export interface CoachAIContextSource {
  load(owner: CoachAIOwner): Promise<CoachAIOwnedRecords>;
}

export type { CoachAISourceReference } from "@/server/ai/contracts";
