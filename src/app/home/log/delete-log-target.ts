import {
  replacesLabels,
  type Completion,
} from "@/server/completions/completion-log";

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

const DAY_LABEL = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

export function deleteLogTarget(completion: Completion): DeleteLogTarget {
  const parsed = Date.parse(`${completion.actualLocalDate}T00:00:00.000Z`);
  return {
    completionId: completion.id,
    revision: completion.revision,
    name:
      completion.title ??
      completion.plannedSnapshot?.title ??
      "unplanned training",
    day: Number.isFinite(parsed)
      ? DAY_LABEL.format(new Date(parsed))
      : completion.actualLocalDate,
    planned:
      completion.planSessionId === null
        ? null
        : (completion.plannedSnapshot?.title ?? "it answers"),
    replaces: replacesLabels(completion).map((replaced) => replaced.label),
  };
}
