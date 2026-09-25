"use client";

import { useState } from "react";

import type { PlanActionDraft } from "./action-state";
import styles from "./plan.module.css";

import {
  ActivityEditor,
  type ActivityValue,
} from "@/components/training/activity-editor";

export function SessionFields({
  idPrefix,
  draft,
  activities,
  dateField,
}: {
  idPrefix: string;
  draft?: PlanActionDraft;
  /** What the session already holds, on an edit. Absent when creating one. */
  activities?: ActivityValue[];
  /**
   * The date control, when this form owns the session's date. The edit form
   * does; the create form renders its own above, because it drives a
   * recurrence preview that lives beside it.
   */
  dateField?: React.ReactNode;
}) {
  // Held rather than left to `defaultValue` so a new activity row can inherit
  // it as it is now, not as the session was when the form first rendered.
  const [sport, setSport] = useState(draft?.sport ?? "");
  return (
    <>
      {dateField}
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
            value={sport}
            onChange={(event) => setSport(event.target.value)}
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
      <ActivityEditor
        idPrefix={idPrefix}
        initial={activities}
        sessionSport={sport}
      />
    </>
  );
}
