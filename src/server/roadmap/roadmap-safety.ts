import "server-only";

import {
  describeReplacement,
  type Completion,
} from "@/server/completions/completion-log";
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
 * The predicate and the window are M3-15D's. `selectTrainingHistoryContext`
 * owns what "recent" means, so asking it is the only way this screen and a
 * roadmap generation can agree; a second `.some()` over completions here would
 * be a second definition that nothing keeps in step with the first.
 *
 * Its session cap is the one thing deliberately not shared — see
 * `NO_SESSION_CAP`.
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
  return selectTrainingHistoryContext(
    {
      today,
      // Unused by the completion side of the selection, and there is no
      // composed horizon here to supply: this is a read of what already exists.
      horizonEndDate: today,
      completions: completions.map(toWindowEntry),
      plannedSessions: [],
    },
    { maxSessions: NO_SESSION_CAP },
  ).hasSafetySignal;
}

/**
 * Every completion in the window is considered, with no cap on the count.
 *
 * `TRAINING_HISTORY_MAX_SESSIONS` is right where it was set: it bounds a *paid
 * provider payload*, and ADR-013 decision 1 discloses the trim to the coach so
 * a model that saw a subset does not reason as though it saw everything. None
 * of that applies here. This read transmits nothing, costs nothing, and has no
 * one to disclose a trim to — so inheriting the cap would not bound anything,
 * it would only decide which reported symptoms the owner is allowed to be
 * reminded of.
 *
 * And it decided that badly. The selector sorts newest-first and truncates at
 * the cap before computing the flag, so a symptom reported three weeks ago
 * disappeared from this screen as soon as twenty later sessions were logged —
 * roughly two and a half a week, which is an ordinary trainee rather than an
 * edge case. The notice would have gone quiet with no trace and nothing to
 * read.
 *
 * The window is still bounded: `TRAINING_HISTORY_WINDOW_DAYS` decides what is
 * recent, and nothing outside it is read. This lifts the count cap only.
 */
const NO_SESSION_CAP = Number.MAX_SAFE_INTEGER;

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
    title: completion.title ?? completion.plannedSnapshot?.title ?? null,
    sport: completion.sport ?? completion.plannedSnapshot?.sport ?? null,
    durationMinutes: completion.durationMinutes ?? null,
    perceivedEffort: completion.perceivedEffort ?? null,
    feeling: completion.feeling ?? null,
    painReported: completion.painReported,
    illnessReported: completion.illnessReported,
    injuryReported: completion.injuryReported,
    severeFatigueReported: completion.severeFatigueReported,
    note: completion.note ?? null,
    replacementDescription: describeReplacement(completion),
    activityNames: completion.activities.map((activity) => activity.name),
  };
}
