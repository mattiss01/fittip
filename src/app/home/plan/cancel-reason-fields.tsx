import styles from "./plan.module.css";

import {
  CANCELLATION_NOTE_MAX,
  CANCELLATION_REASON_LABELS,
  CANCELLATION_REASONS,
  type CancellationReason,
} from "@/lib/training/cancellation-reasons";

/**
 * Why, if the owner wants to say (29 Sep 2026): six quick picks and a short
 * note, both optional. "No reason" is a pick of its own, so a chosen reason
 * can be taken back without clearing the form. Uncontrolled: the enclosing
 * form submits `cancelReason` and `cancelNote`.
 */
export function CancelReasonFields({
  idPrefix,
  initial = { reason: null, note: null },
}: {
  idPrefix: string;
  initial?: { reason: CancellationReason | null; note: string | null };
}) {
  return (
    <div className={styles.reasonFields}>
      <fieldset className={styles.reasonChips}>
        <legend>Why? (optional)</legend>
        {[null, ...CANCELLATION_REASONS].map((reason) => {
          const id = `${idPrefix}-reason-${reason ?? "none"}`;
          return (
            <span key={reason ?? "none"} className={styles.reasonChip}>
              <input
                id={id}
                type="radio"
                name="cancelReason"
                value={reason ?? ""}
                defaultChecked={initial.reason === reason}
              />
              <label htmlFor={id}>
                {reason === null
                  ? "No reason"
                  : CANCELLATION_REASON_LABELS[reason]}
              </label>
            </span>
          );
        })}
      </fieldset>
      <div className={styles.field}>
        <label htmlFor={`${idPrefix}-note`}>Note (optional)</label>
        <textarea
          id={`${idPrefix}-note`}
          name="cancelNote"
          maxLength={CANCELLATION_NOTE_MAX}
          rows={2}
          defaultValue={initial.note ?? ""}
        />
      </div>
    </div>
  );
}
