import { localTimeInTimezone } from "@/lib/date/local-date";
import type { Completion } from "@/server/completions/completion-log";

/** When a log says it started, read in the zone it was written in. */
export function startTimeOf(
  completion: Pick<Completion, "actualStartedAt" | "timezoneName">,
): string | null {
  return completion.actualStartedAt === undefined
    ? null
    : localTimeInTimezone(
        new Date(completion.actualStartedAt),
        completion.timezoneName,
      );
}
