/**
 * The completion vocabulary both surfaces speak. Today stamps a logged session
 * with exactly the word the log form wrote it with, so one outcome never has
 * two names anywhere in the flow.
 */
export type CompletionOutcome =
  | "completed"
  | "partially_completed"
  | "skipped"
  | "replaced"
  | "unplanned";

export type CompletionOutcomeChoice = {
  value: CompletionOutcome;
  label: string;
  hint: string;
};

/**
 * The outcomes an owner may choose for a session that was planned. `unplanned`
 * is deliberately absent: the write function refuses a completion that names a
 * planned session and calls itself unplanned, and the reverse, so the choice is
 * decided by which session the log was opened for rather than offered.
 *
 * `skipped` is one of these and nothing more. It records what happened; it
 * never touches the plan.
 */
export const PLANNED_OUTCOMES: readonly CompletionOutcomeChoice[] = [
  {
    value: "completed",
    label: "Completed",
    hint: "You did the session.",
  },
  {
    value: "partially_completed",
    label: "Partly completed",
    hint: "You started it and did some of it.",
  },
  {
    value: "skipped",
    label: "Skipped",
    hint: "You did not do it. The planned session stays on the plan.",
  },
  {
    value: "replaced",
    label: "Replaced",
    hint: "You trained, but did something else instead.",
  },
] as const;

export const UNPLANNED_OUTCOME: CompletionOutcomeChoice = {
  value: "unplanned",
  label: "Unplanned",
  hint: "Training that was not on the plan.",
};

export const COMPLETION_OUTCOME_LABELS: Record<CompletionOutcome, string> = {
  completed: "Completed",
  partially_completed: "Partly completed",
  skipped: "Skipped",
  replaced: "Replaced",
  unplanned: "Unplanned",
};

export type CompletionFeelingValue =
  | "very_bad"
  | "bad"
  | "neutral"
  | "good"
  | "very_good";

export const COMPLETION_FEELING_CHOICES: readonly {
  value: CompletionFeelingValue;
  label: string;
}[] = [
  { value: "very_bad", label: "Very bad" },
  { value: "bad", label: "Bad" },
  { value: "neutral", label: "Neutral" },
  { value: "good", label: "Good" },
  { value: "very_good", label: "Very good" },
] as const;

export const COMPLETION_FEELING_LABELS: Record<CompletionFeelingValue, string> =
  {
    very_bad: "Very bad",
    bad: "Bad",
    neutral: "Neutral",
    good: "Good",
    very_good: "Very good",
  };

/**
 * The FitTip safety notice, word for word as M1-03 approved it and M2-02
 * shipped it on the memory surface (`src/components/memory/memory-manager.tsx`
 * `SAFETY_NOTICE`). F-005:388 leaves that behavior unchanged, and AGENTS.md
 * makes conservative pain, illness, injury, and severe-fatigue handling a
 * product invariant, so the established wording is reused rather than
 * rewritten. This is the first surface in the reset app that collects all four
 * signals in one place. It is copied rather than imported because the memory
 * original lives inside a client component module, and importing from there
 * would pull that whole surface into this bundle.
 */
export const COMPLETION_SAFETY_NOTICE =
  "If a symptom is severe, sudden or getting worse, stop training and speak to a qualified health professional. FitTip stores what you write here; it does not assess symptoms and gives no medical advice.";

/**
 * The four signals F-005 treats conservatively. They are recorded as facts the
 * owner reported, in the owner's own words. Nothing here diagnoses, scores, or
 * advises, and nothing changes the plan because one is ticked.
 */
export const COMPLETION_SIGNALS: readonly {
  name: string;
  label: string;
}[] = [
  { name: "painReported", label: "I felt pain" },
  { name: "illnessReported", label: "I was ill" },
  { name: "injuryReported", label: "I was injured" },
  { name: "severeFatigueReported", label: "I was severely fatigued" },
] as const;

/** The short words Today stamps on a card when a signal was reported. */
export const COMPLETION_SIGNAL_STAMPS: readonly {
  key: "pain" | "illness" | "injury" | "severeFatigue";
  label: string;
}[] = [
  { key: "pain", label: "Pain" },
  { key: "illness", label: "Illness" },
  { key: "injury", label: "Injury" },
  { key: "severeFatigue", label: "Severe fatigue" },
] as const;

export type LogActionState = {
  status: "idle" | "saved" | "validation" | "conflict" | "session" | "error";
  message: string;
  /**
   * Increments once per submission, so two identical replies are still
   * distinguishable. The Plan surface keys a stall watchdog on its own
   * counter; this surface has no watchdog yet, so nothing reads this beyond
   * the tests. It is recorded as a known limitation rather than implied here.
   */
  submission: number;
  result?: "created" | "updated";
  /** The day the owner returns to on Today once the write landed. */
  returnDate?: string;
  conflict?: "stale" | "timezone";
};

export const INITIAL_LOG_ACTION_STATE: LogActionState = {
  status: "idle",
  message: "",
  submission: 0,
};
