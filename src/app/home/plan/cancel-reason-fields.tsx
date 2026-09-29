import styles from "./plan.module.css";

import { CANCELLATION_REASON_MAX } from "@/lib/training/cancellation-reasons";

/**
 * Why, if the owner wants to say (29 Sep 2026): one optional text in their
 * own words. Uncontrolled; the enclosing form submits `cancelReason`, and a
 * blank one means none.
 */
export function CancelReasonFields({
  idPrefix,
  initial = null,
}: {
  idPrefix: string;
  initial?: string | null;
}) {
  return (
    <div className={styles.field}>
      <label htmlFor={`${idPrefix}-reason`}>Why? (optional)</label>
      <textarea
        id={`${idPrefix}-reason`}
        name="cancelReason"
        maxLength={CANCELLATION_REASON_MAX}
        rows={2}
        placeholder="e.g. work ran late"
        defaultValue={initial ?? ""}
      />
    </div>
  );
}
