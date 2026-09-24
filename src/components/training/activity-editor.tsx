"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import styles from "./activity-editor.module.css";

import { describeMeasurement } from "@/lib/training/describe-measurement";
import {
  DISTANCE_UNITS,
  INTENSITIES,
  LOAD_UNITS,
  PACE_UNITS,
  TRAINING_MEASUREMENT_MODES,
  type TrainingMeasurement,
  type TrainingMeasurementMode,
} from "@/lib/training/measurement";
import {
  ACTIVITY_COPY,
  DISTANCE_UNIT_COPY,
  INTENSITY_COPY,
  LOAD_UNIT_COPY,
  MEASUREMENT_MODE_COPY,
  PACE_UNIT_COPY,
} from "@/lib/training/measurement-copy";
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
}: {
  idPrefix: string;
  name?: string;
  initial?: ActivityValue[];
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
              sport: "",
              instructions: null,
              measurementMode: "sets_reps_load",
              target: null,
              draft: emptyDraft("sets_reps_load"),
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
  const itemRef = useRef<HTMLLIElement | null>(null);

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

  function handlePointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    onDragStateChange(row.key);

    function moveTo(clientY: number) {
      const list = itemRef.current?.parentElement;
      if (!list) return;
      const items = [...list.children] as HTMLElement[];
      for (const [position, item] of items.entries()) {
        const box = item.getBoundingClientRect();
        if (clientY < box.top + box.height / 2) {
          onMoveTo(position);
          return;
        }
      }
      onMoveTo(items.length - 1);
    }

    function onPointerMove(moveEvent: PointerEvent) {
      moveTo(moveEvent.clientY);
    }
    function onPointerUp() {
      onDragStateChange(null);
      handle.removeEventListener("pointermove", onPointerMove);
      handle.removeEventListener("pointerup", onPointerUp);
      handle.removeEventListener("pointercancel", onPointerUp);
    }
    handle.addEventListener("pointermove", onPointerMove);
    handle.addEventListener("pointerup", onPointerUp);
    handle.addEventListener("pointercancel", onPointerUp);
  }

  return (
    <li
      ref={itemRef}
      className={dragging ? `${styles.row} ${styles.rowDragging}` : styles.row}
      data-activity-row={index}
    >
      <div className={styles.rowHead}>
        <button
          className={styles.handle}
          type="button"
          aria-label={`${ACTIVITY_COPY.reorderHint} Activity ${index + 1} of ${total}.`}
          onPointerDown={handlePointerDown}
          onKeyDown={(event) => {
            if (event.key === "ArrowUp") {
              event.preventDefault();
              onMove(-1);
            }
            if (event.key === "ArrowDown") {
              event.preventDefault();
              onMove(1);
            }
          }}
        >
          <span aria-hidden="true">⠿</span>
        </button>
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
        <div className={styles.field}>
          <label htmlFor={`${idPrefix}-mode`}>Measured as</label>
          <select
            id={`${idPrefix}-mode`}
            value={row.measurementMode}
            onChange={(event) => {
              const mode = event.target.value as TrainingMeasurementMode;
              // The draft is replaced rather than carried across: the modes
              // share no field, so keeping the old one would leave values
              // nothing in the new mode reads.
              onChange({ measurementMode: mode, draft: emptyDraft(mode) });
            }}
          >
            {TRAINING_MEASUREMENT_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {MEASUREMENT_MODE_COPY[mode].label}
              </option>
            ))}
          </select>
          <p className={styles.hint}>
            {MEASUREMENT_MODE_COPY[row.measurementMode].hint}
          </p>
        </div>

        <TargetFields
          idPrefix={idPrefix}
          mode={row.measurementMode}
          draft={row.draft}
          validityRef={validityRef}
          onDraftChange={(field, value) =>
            onChange({ draft: { ...row.draft, [field]: value } })
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

function TargetFields({
  idPrefix,
  mode,
  draft,
  validityRef,
  onDraftChange,
}: {
  idPrefix: string;
  mode: TrainingMeasurementMode;
  draft: MeasurementDraft;
  validityRef: React.RefObject<HTMLInputElement | null>;
  onDraftChange: (field: string, value: string) => void;
}) {
  const bind = (field: string) => ({
    id: `${idPrefix}-${field}`,
    value: draft[field] ?? "",
    onChange: (
      event: React.ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >,
    ) => onDraftChange(field, event.target.value),
  });

  if (mode === "sets_reps_load") {
    return (
      <div className={styles.targetGrid}>
        <div className={styles.field}>
          <label htmlFor={`${idPrefix}-sets`}>Sets</label>
          <input
            {...bind("sets")}
            ref={validityRef}
            inputMode="numeric"
            placeholder="5"
          />
        </div>
        <div className={styles.field}>
          <label htmlFor={`${idPrefix}-reps`}>Reps</label>
          <input {...bind("reps")} inputMode="numeric" placeholder="5" />
        </div>
        <div className={styles.field}>
          <label htmlFor={`${idPrefix}-load`}>Load</label>
          <input {...bind("load")} inputMode="decimal" placeholder="82.5" />
        </div>
        <div className={styles.field}>
          <label htmlFor={`${idPrefix}-load_unit`}>Unit</label>
          <select {...bind("load_unit")}>
            {LOAD_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {LOAD_UNIT_COPY[unit]}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  if (mode === "time_distance_pace") {
    return (
      <div className={styles.targetGrid}>
        <div className={styles.field}>
          <label htmlFor={`${idPrefix}-duration`}>Time</label>
          <input
            {...bind("duration")}
            ref={validityRef}
            inputMode="text"
            placeholder="45:00"
          />
        </div>
        <div className={styles.field}>
          <label htmlFor={`${idPrefix}-distance`}>Distance</label>
          <input {...bind("distance")} inputMode="decimal" placeholder="10" />
        </div>
        <div className={styles.field}>
          <label htmlFor={`${idPrefix}-distance_unit`}>Unit</label>
          <select {...bind("distance_unit")}>
            {DISTANCE_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {DISTANCE_UNIT_COPY[unit]}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor={`${idPrefix}-pace`}>Pace</label>
          <input {...bind("pace")} inputMode="text" placeholder="4:45" />
        </div>
        <div className={styles.fieldWide}>
          <label htmlFor={`${idPrefix}-pace_unit`}>Pace unit</label>
          <select {...bind("pace_unit")}>
            {PACE_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {PACE_UNIT_COPY[unit]}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  if (mode === "duration_intensity") {
    return (
      <div className={styles.targetGrid}>
        <div className={styles.field}>
          <label htmlFor={`${idPrefix}-duration_minutes`}>Minutes</label>
          <input
            {...bind("duration_minutes")}
            ref={validityRef}
            inputMode="numeric"
            placeholder="40"
          />
        </div>
        <div className={styles.field}>
          <label htmlFor={`${idPrefix}-intensity`}>Intensity</label>
          <select {...bind("intensity")}>
            <option value="">—</option>
            {INTENSITIES.map((intensity) => (
              <option key={intensity} value={intensity}>
                {INTENSITY_COPY[intensity]}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.fieldWide}>
          <label htmlFor={`${idPrefix}-perceived_effort`}>
            Effort, 1 to 10
          </label>
          <input
            {...bind("perceived_effort")}
            inputMode="numeric"
            placeholder="7"
          />
        </div>
      </div>
    );
  }

  if (mode === "skill_repetitions") {
    return (
      <div className={styles.targetGrid}>
        <div className={styles.field}>
          <label htmlFor={`${idPrefix}-repetitions`}>Count</label>
          <input
            {...bind("repetitions")}
            ref={validityRef}
            inputMode="numeric"
            placeholder="20"
          />
        </div>
        <div className={styles.field}>
          <label htmlFor={`${idPrefix}-unit`}>Of what</label>
          <input {...bind("unit")} maxLength={32} placeholder="throws" />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.targetGrid}>
      <div className={styles.field}>
        <label htmlFor={`${idPrefix}-label`}>Label</label>
        <input
          {...bind("label")}
          ref={validityRef}
          maxLength={80}
          placeholder="Depth"
        />
      </div>
      <div className={styles.field}>
        <label htmlFor={`${idPrefix}-value`}>Value</label>
        <input {...bind("value")} maxLength={500} placeholder="12" />
      </div>
      <div className={styles.fieldWide}>
        <label htmlFor={`${idPrefix}-unit`}>Unit</label>
        <input {...bind("unit")} maxLength={32} placeholder="m" />
      </div>
    </div>
  );
}
