import styles from "./outcome-mark.module.css";

import type { CompletionOutcome } from "@/app/home/log/log-action-state";

/**
 * A logged session's mark says what the record says, never more: a tick only
 * for training that was done, a short one for partly, a dash for a skip and a swap
 * for a replacement. Decorative — the outcome stamp beside it is the fact.
 * Today's receipts and Progress's entries draw the same one, so an outcome
 * never looks like two different facts.
 */
const OUTCOME_MARK_PATHS: Record<CompletionOutcome, string> = {
  completed: "M5 12.5l4.5 4.5L19 7.5",
  unplanned: "M5 12.5l4.5 4.5L19 7.5",
  // A short tick (owner, 3 Oct 2026): done, but not all of it.
  partially_completed: "M8.5 12.5l2.5 2.5 4.5-5",
  skipped: "M6 12h12",
  replaced: "M5 9h12l-3-3 M19 15H7l3 3",
};

export function OutcomeMark({ outcome }: { outcome: CompletionOutcome }) {
  return (
    <span
      className={styles.mark}
      data-outcome-mark={outcome}
      aria-hidden="true"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <path d={OUTCOME_MARK_PATHS[outcome]} />
      </svg>
    </span>
  );
}
