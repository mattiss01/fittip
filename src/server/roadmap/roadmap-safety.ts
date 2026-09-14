import "server-only";

import type { Completion } from "@/server/completions/completion-log";
import {
  selectTrainingHistoryContext,
  type TrainingHistoryCompletion,
} from "@/server/training/training-history-context";

/**
 * Whether the owner's recent training carries one of the four safety flags.
 *
 * M3-02 decision 7: the flag is reported, never classified. Nothing here infers
 * severity, recovery, or clearance, and the notice it drives is the static
 * server-owned copy in `ROADMAP_COPY.safetyNotice` — which states what FitTip
 * cannot do rather than saying anything about the symptom.
 *
 * The predicate itself is M3-15D's. `selectTrainingHistoryContext` already owns
 * the window, the ordering and the session cap, so asking it is the only way
 * this screen and a roadmap generation can agree on what "recent" means; a
 * second `.some()` over completions here would be a second definition that
 * nothing keeps in step with the first.
 *
 * No plan read. The selector takes planned sessions only to derive misses and
 * forward commitments, neither of which touches the safety flag, and reading
 * the plan window would materialize future occurrences as a side effect of
 * looking at a roadmap — the write M3-15C refused for the same reason.
 */
export function hasRecentSafetySignal(
  completions: Completion[],
  today: string,
): boolean {
  return selectTrainingHistoryContext({
    today,
    // Unused by the completion side of the selection, and there is no composed
    // horizon here to supply: this is a read of what already exists.
    horizonEndDate: today,
    completions: completions.map(toWindowEntry),
    plannedSessions: [],
  }).hasSafetySignal;
}

/**
 * A completion in the shape the selector reads.
 *
 * This is not ADR-013's provider allowlist and must not be mistaken for one:
 * nothing this function produces is serialized, transmitted, or shown. It
 * exists only so the selector sees the same records a generation would, and it
 * is written field by field for the same reason the real allowlist is — a
 * spread would make it look correct while carrying whatever the completion
 * schema gains next.
 */
function toWindowEntry(completion: Completion): TrainingHistoryCompletion {
  return {
    localDate: completion.actualLocalDate,
    status: completion.status,
    title: completion.plannedSnapshot?.title ?? null,
    sport: completion.plannedSnapshot?.sport ?? null,
    durationMinutes: completion.durationMinutes ?? null,
    perceivedEffort: completion.perceivedEffort ?? null,
    feeling: completion.feeling ?? null,
    painReported: completion.painReported,
    illnessReported: completion.illnessReported,
    injuryReported: completion.injuryReported,
    severeFatigueReported: completion.severeFatigueReported,
    note: completion.note ?? null,
    replacementDescription: completion.replacementDescription ?? null,
    activityNames: completion.activities.map((activity) => activity.name),
  };
}
