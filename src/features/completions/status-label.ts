import type { CompletionStatus } from "@/features/completions/completion-types";

export const COMPLETION_STATUS_LABELS: Record<CompletionStatus, string> = {
  completed: "Completed",
  partially_completed: "Partially completed",
  skipped: "Skipped",
  replaced: "Replaced",
  rest: "Rest",
  unplanned: "Unplanned",
};

export function completionStatusLabel(value: string): string {
  return (
    COMPLETION_STATUS_LABELS[value as CompletionStatus] ??
    value.replaceAll("_", " ")
  );
}
