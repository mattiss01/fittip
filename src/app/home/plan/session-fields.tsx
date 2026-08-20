import type { PlanActionDraft } from "./action-state";
import styles from "./plan.module.css";

export function SessionFields({
  idPrefix,
  draft,
}: {
  idPrefix: string;
  draft?: PlanActionDraft;
}) {
  return (
    <>
      <div className={styles.field}>
        <label htmlFor={`${idPrefix}-title`}>Title</label>
        <input
          id={`${idPrefix}-title`}
          name="title"
          maxLength={120}
          required
          defaultValue={draft?.title ?? ""}
        />
      </div>
      <div className={styles.fieldPair}>
        <div className={styles.field}>
          <label htmlFor={`${idPrefix}-sport`}>Sport</label>
          <input
            id={`${idPrefix}-sport`}
            name="sport"
            maxLength={80}
            required
            defaultValue={draft?.sport ?? ""}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor={`${idPrefix}-minutes`}>Minutes</label>
          <input
            id={`${idPrefix}-minutes`}
            name="expectedDurationMinutes"
            type="number"
            inputMode="numeric"
            min={1}
            max={10080}
            defaultValue={draft?.expectedDurationMinutes ?? ""}
          />
        </div>
      </div>
      <div className={styles.field}>
        <label htmlFor={`${idPrefix}-intent`}>Intent</label>
        <input
          id={`${idPrefix}-intent`}
          name="intent"
          maxLength={500}
          defaultValue={draft?.intent ?? ""}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor={`${idPrefix}-note`}>Note</label>
        <textarea
          id={`${idPrefix}-note`}
          name="note"
          maxLength={2000}
          defaultValue={draft?.note ?? ""}
        />
      </div>
    </>
  );
}
