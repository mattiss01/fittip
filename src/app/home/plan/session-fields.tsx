"use client";

import { useRef, useState } from "react";

import type { PlanActionDraft } from "./action-state";
import type { FillProposal } from "./fill/fill-state";
import { FillWithCoach } from "./fill/fill-with-coach";
import styles from "./plan.module.css";

import { SportInput } from "@/components/sports/sport-input";
import {
  ActivityEditor,
  type ActivityEditorHandle,
  type ActivityValue,
  type EditorRow,
} from "@/components/training/activity-editor";

export function SessionFields({
  idPrefix,
  draft,
  activities,
  dateField,
  fill,
}: {
  idPrefix: string;
  draft?: PlanActionDraft;
  /** What the session already holds, on an edit. Absent when creating one. */
  activities?: ActivityValue[];
  /**
   * The date control, when this form owns the session's date, placed under
   * the title (owner, 1 Oct 2026). The edit form has one; the create form
   * does not, because the day's sheet it opens in already fixed the date.
   */
  dateField?: React.ReactNode;
  /**
   * The saved session this form edits, when it offers Fill with coach, and
   * its suggestion still waiting for an answer. Absent when creating one:
   * there is nothing yet for the coach to fill.
   */
  fill?: { sessionId: string; open?: FillProposal };
}) {
  // Held rather than left to `defaultValue` so a new activity row can inherit
  // it as it is now, not as the session was when the form first rendered.
  const [sport, setSport] = useState(draft?.sport ?? "");
  const editor = useRef<ActivityEditorHandle>(null);
  const [rows, setRows] = useState<readonly EditorRow[]>([]);
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
      {dateField}
      <div className={styles.fieldPair}>
        <div className={styles.field}>
          <label htmlFor={`${idPrefix}-sport`}>Sport</label>
          <SportInput
            id={`${idPrefix}-sport`}
            name="sport"
            required
            value={sport}
            onChange={setSport}
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
      {fill === undefined ? (
        <ActivityEditor
          idPrefix={idPrefix}
          initial={activities}
          sessionSport={sport}
        />
      ) : (
        <FillWithCoach
          sessionId={fill.sessionId}
          open={fill.open}
          editor={editor}
          rows={rows}
        >
          <ActivityEditor
            idPrefix={idPrefix}
            initial={activities}
            sessionSport={sport}
            ref={editor}
            onRowsChange={setRows}
          />
        </FillWithCoach>
      )}
    </>
  );
}
