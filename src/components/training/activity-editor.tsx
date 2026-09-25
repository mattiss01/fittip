"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import styles from "./activity-editor.module.css";
import { MeasurementFields, MeasurementModeField } from "./measurement-fields";
import { ReorderHandle } from "./reorder-handle";

import { describeMeasurement } from "@/lib/training/describe-measurement";
import {
  type TrainingMeasurement,
  type TrainingMeasurementMode,
} from "@/lib/training/measurement";
import { ACTIVITY_COPY } from "@/lib/training/measurement-copy";
import {
  buildMeasurement,
  draftFromMeasurement,
  emptyDraft,
  type MeasurementDraft,
} from "@/lib/training/measurement-draft";

/** One activity as the surrounding surface already holds it. */
export type ActivityValue = {
  name: string;
  sport: string;
  instructions: string | null;
  measurementMode: TrainingMeasurementMode;
  target: TrainingMeasurement | null;
};

type Row = ActivityValue & {
  /** Stable across reorders, which is what keeps inputs from swapping. */
  key: string;
  draft: MeasurementDraft;
};

let nextKey = 0;

/**
 * The ordered activities of one session.
 *
 * It writes a single hidden field — JSON, not indexed input names — because
 * the list is reorderable. With `activity.3.name` the server would have to
 * cope with gaps and repeats after a drag, and the drag would have to rewrite
 * every field's name to close them. One serialized value has one meaning, and
 * `readActivities` on the server parses it under the same suspicion it gives
 * any other form value.
 *
 * A row whose measurement cannot be built sets a real `setCustomValidity` on
 * its own first field, so the browser refuses the submit and says why. The
 * row is forced open at the same time: a validity message on a control inside
 * a closed `details` is one the owner cannot see and the browser cannot focus.
 */
export function ActivityEditor({
  idPrefix,
  name = "activities",
  initial,
  sessionSport,
}: {
  idPrefix: string;
  name?: string;
  initial?: ActivityValue[];
  /**
   * What the session itself is, live from the form above. A new row takes it
   * rather than asking again — most activities are the sport of the session
   * that holds them. The field stays, because some are not: a bike spin-down
   * inside a strength session is the case that would be lost if the column
   * were simply filled in for you.
   */
  sessionSport?: string;
}) {
  const generatedId = useId();
  const prefix = idPrefix || generatedId;
  const [rows, setRows] = useState<Row[]>(() =>
    (initial ?? []).map((activity) => ({
      ...activity,
      key: `initial-${nextKey++}`,
      draft: draftFromMeasurement(activity.measurementMode, activity.target),
    })),
  );
  const [dragging, setDragging] = useState<string | null>(null);

  const built = useMemo(
    () =>
      rows.map((row) => ({
        row,
        build: buildMeasurement(row.measurementMode, row.draft),
      })),
    [rows],
  );

  // Only the rows that can be built are serialized. A row that cannot is
  // already blocking the submit, so what this field holds while that is true
  // never reaches a server action.
  const serialized = JSON.stringify(
    built.map(({ row, build }) => ({
      // No `position` and no `isLocked`. The array's order is the position,
      // and `parseSubmittedActivities` refuses a payload that names either —
      // a field no surface sets is one no submission should carry.
      name: row.name.trim(),
      sport: row.sport.trim(),
      instructions:
        row.instructions === null || row.instructions.trim() === ""
          ? null
          : row.instructions.trim(),
      measurementMode: row.measurementMode,
      target: build.ok ? build.measurement : null,
    })),
  );

  function update(key: string, change: Partial<Row>) {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...change } : row)),
    );
  }

  function move(key: string, delta: number) {
    setRows((current) => {
      const from = current.findIndex((row) => row.key === key);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= current.length) return current;
      const next = [...current];
      const [held] = next.splice(from, 1);
      next.splice(to, 0, held);
      return next;
    });
  }

  const atLimit = rows.length >= ACTIVITY_COPY.softLimit;

  return (
    <section className={styles.editor} aria-labelledby={`${prefix}-activities`}>
      <div className={styles.head}>
        <h3 id={`${prefix}-activities`}>Activities</h3>
        <p className={styles.count}>
          {rows.length === 0
            ? "None"
            : `${rows.length} of ${ACTIVITY_COPY.softLimit}`}
        </p>
      </div>

      <input type="hidden" name={name} value={serialized} />

      {rows.length === 0 ? (
        <p className={styles.empty}>{ACTIVITY_COPY.empty}</p>
      ) : (
        <ol className={styles.rows}>
          {built.map(({ row, build }, index) => (
            <ActivityRow
              key={row.key}
              idPrefix={`${prefix}-activity-${index}`}
              row={row}
              index={index}
              total={rows.length}
              problem={build.ok ? null : build.message}
              preview={build.ok ? describeMeasurement(build.measurement) : null}
              dragging={dragging === row.key}
              onDragStateChange={setDragging}
              onChange={(change) => update(row.key, change)}
              onMove={(delta) => move(row.key, delta)}
              onMoveTo={(to) =>
                setRows((current) => {
                  const from = current.findIndex(
                    (item) => item.key === row.key,
                  );
                  if (from < 0 || to < 0 || to >= current.length || from === to)
                    return current;
                  const next = [...current];
                  const [held] = next.splice(from, 1);
                  next.splice(to, 0, held);
                  return next;
                })
              }
              onRemove={() =>
                setRows((current) =>
                  current.filter((item) => item.key !== row.key),
                )
              }
            />
          ))}
        </ol>
      )}

      <button
        className={styles.add}
        type="button"
        disabled={atLimit}
        onClick={() =>
          setRows((current) => [
            ...current,
            {
              key: `added-${nextKey++}`,
              name: "",
              sport: (sessionSport ?? "").trim(),
              instructions: null,
              measurementMode: "unmeasured",
              target: null,
              draft: emptyDraft("unmeasured"),
            },
          ])
        }
      >
        {ACTIVITY_COPY.add}
      </button>
      {atLimit ? <p className={styles.limit}>{ACTIVITY_COPY.atLimit}</p> : null}
    </section>
  );
}

function ActivityRow({
  idPrefix,
  row,
  index,
  total,
  problem,
  preview,
  dragging,
  onDragStateChange,
  onChange,
  onMove,
  onMoveTo,
  onRemove,
}: {
  idPrefix: string;
  row: Row;
  index: number;
  total: number;
  problem: string | null;
  preview: string | null;
  dragging: boolean;
  onDragStateChange: (key: string | null) => void;
  onChange: (change: Partial<Row>) => void;
  onMove: (delta: number) => void;
  onMoveTo: (index: number) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(row.name === "");
  const validityRef = useRef<HTMLInputElement | null>(null);

  // A row that cannot be built is open whatever the owner last chose, rather
  // than being forced open by an effect: the browser is about to refuse the
  // submit and point at a control inside this body, and a validity message on
  // something hidden is one nobody can read and nothing can focus. Derived, so
  // collapsing a broken row simply does not take — which is the honest
  // behaviour, and costs no cascading render to express.
  const open = expanded || problem !== null;

  useEffect(() => {
    validityRef.current?.setCustomValidity(problem ?? "");
  }, [problem]);

  return (
    <li
      className={dragging ? `${styles.row} ${styles.rowDragging}` : styles.row}
      data-activity-row={index}
    >
      <div className={styles.rowHead}>
        <ReorderHandle
          label={`${ACTIVITY_COPY.reorderHint} Activity ${index + 1} of ${total}.`}
          onDragStateChange={(active) =>
            onDragStateChange(active ? row.key : null)
          }
          onMove={onMove}
          onMoveTo={onMoveTo}
        />
        <button
          className={styles.summary}
          type="button"
          aria-expanded={open}
          onClick={() => setExpanded((current) => !current)}
        >
          <span className={styles.summaryName}>
            {row.name.trim() === "" ? "New activity" : row.name}
          </span>
          <span className={styles.summaryTarget}>
            {problem ?? preview ?? ACTIVITY_COPY.noTarget}
          </span>
        </button>
        <button className={styles.remove} type="button" onClick={onRemove}>
          {ACTIVITY_COPY.remove}
        </button>
      </div>

      <div hidden={!open} className={styles.rowBody}>
        <div className={styles.field}>
          <label htmlFor={`${idPrefix}-name`}>Name</label>
          <input
            id={`${idPrefix}-name`}
            value={row.name}
            maxLength={120}
            required
            onChange={(event) => onChange({ name: event.target.value })}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor={`${idPrefix}-sport`}>Sport</label>
          <input
            id={`${idPrefix}-sport`}
            value={row.sport}
            maxLength={80}
            required
            onChange={(event) => onChange({ sport: event.target.value })}
          />
          <p className={styles.hint}>{ACTIVITY_COPY.sportHint}</p>
        </div>
        <div className={styles.field}>
          <label htmlFor={`${idPrefix}-instructions`}>Instructions</label>
          <textarea
            id={`${idPrefix}-instructions`}
            value={row.instructions ?? ""}
            maxLength={2000}
            rows={2}
            onChange={(event) => onChange({ instructions: event.target.value })}
          />
        </div>
        <MeasurementModeField
          id={`${idPrefix}-mode`}
          mode={row.measurementMode}
          // The draft is replaced rather than carried across: the modes share
          // no field, so keeping the old one would leave values nothing in the
          // new mode reads.
          onChange={(mode) =>
            onChange({ measurementMode: mode, draft: emptyDraft(mode) })
          }
        />

        <MeasurementFields
          idPrefix={idPrefix}
          mode={row.measurementMode}
          draft={row.draft}
          validityRef={validityRef}
          onDraftChange={(field, value) =>
            onChange({
              draft: {
                ...row.draft,
                fields: { ...row.draft.fields, [field]: value },
              },
            })
          }
          onGroupsChange={(groups) =>
            onChange({ draft: { ...row.draft, groups } })
          }
        />

        {problem === null ? null : (
          <p className={styles.problem} role="alert">
            {problem}
          </p>
        )}
      </div>
    </li>
  );
}
