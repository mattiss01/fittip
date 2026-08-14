import "server-only";

import type { CoachAIOwnedRecords } from "@/server/ai/context";
import type { CoachAIOwner } from "@/server/ai/owner";

/** Injected context seam; no legacy database adapter survives M3-11. */
export interface CoachAIContextSource {
  load(owner: CoachAIOwner): Promise<CoachAIOwnedRecords>;
}

export type { CoachAISourceReference } from "@/server/ai/contracts";
