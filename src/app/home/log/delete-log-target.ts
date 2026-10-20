import {
  replacesLabels,
  type Completion,
} from "@/server/completions/completion-log";

import { dayLabel } from "./day-label";

/**
 * What "Delete log" needs to ask first and then delete (ADR-031): the
 * revision the owner is looking at, and every name its question says.
 */
export type DeleteLogTarget = {
  completionId: string;
  revision: number;
  name: string;
  day: string;
  planned: string | null;
  replaces: string[];
};

export function deleteLogTarget(completion: Completion): DeleteLogTarget {
  return {
    completionId: completion.id,
    revision: completion.revision,
    name:
      completion.title ??
      completion.plannedSnapshot?.title ??
      "unplanned training",
    day: dayLabel(completion.actualLocalDate),
    planned:
      completion.planSessionId === null
        ? null
        : (completion.plannedSnapshot?.title ?? "it answers"),
    replaces: replacesLabels(completion).map((replaced) => replaced.label),
  };
}
