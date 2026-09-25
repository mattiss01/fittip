"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import styles from "./log.module.css";

import {
  MeasurementFields,
  MeasurementModeField,
} from "@/components/training/measurement-fields";
import { ReorderHandle } from "@/components/training/reorder-handle";
import { describeMeasurement } from "@/lib/training/describe-measurement";
import {
  type TrainingMeasurement,
  type TrainingMeasurementMode,
} from "@/lib/training/measurement";
import {
  buildMeasurement,
  draftFromMeasurement,
  emptyDraft,
  type MeasurementDraft,
} from "@/lib/training/measurement-draft";

/** One planned activity, as the log offers it to be answered. */
export type LogPlannedActivityView = {
  position: number;
  personalActivityId: string | null;
  name: string;
  sport: string;
  measurementMode: TrainingMeasurementMode;
  target: TrainingMeasurement | null;
};

type Row = {
  /** Stable across reorders, which is what keeps inputs from swapping. */
  key: string;
  /** Null for an activity the owner added while logging. */
  planned: LogPlannedActivityView | null;
  name: string;
  sport: string;
  done: boolean;
  measurementMode: TrainingMeasurementMode;
  draft: MeasurementDraft;
};

/** The contract's own bound, `COMPLETION_ACTIVITY_LIMIT`. */
const ROW_LIMIT = 50;

let nextKey = 0;

/**
 * What was actually done, one activity at a time.
 *
 * Each planned row starts as a copy of its target, which the owner decided on
 * 25 September 2026: the common case is that the plan happened, and the row is
 * there to be adjusted rather than typed from nothing. Every row is recorded
 * unless it is marked as not done — clearing the fields means "did it, did not
 * measure it", which is what an unmeasured planned activity already looks like
 * and must not be read as absence.
 *
 * The actual carries its own mode. "Serve practice" planned with no target and
 * done for twenty minutes is recorded as twenty minutes, and the plan and the
 * snapshot the server captures from it are untouched by that.
 *
 * The owner can also add what the plan did not name and put the list in the
 * order it was done, both asked for on 25 September 2026. So `position` is the
 * order of the log, not of the plan: an actual answers its planned activity by
 * name, and the snapshot keeps the plan's order beside it.
 *
 * Like the plan's editor it writes one hidden JSON field.
 */
export function ActualActivities({
  activities,
  sessionSport,
  inactive = false,
}: {
  activities: LogPlannedActivityView[];
  /** What an added activity starts as; most are the session's own sport. */
  sessionSport: string;
  /**
   * True while the chosen outcome says the planned activities did not happen.
   * The list stays mounted, so choosing Skipped by mistake and then Completed
   * again keeps every adjustment; a disabled fieldset submits nothing and
   * blocks no submit, so an inactive list sends no activities at all.
   */
  inactive?: boolean;
}) {
  // Ids from `useId`, never from `nextKey`: that counter lives as long as the
  // server process, so ids built from it differ between the server render and
  // hydration. `nextKey` is only ever a React key.
  const prefix = useId();
  const [rows, setRows] = useState<Row[]>(() =>
    activities.map((planned) => ({
      key: `planned-${nextKey++}`,
      planned,
      name: planned.name,
      sport: planned.sport,
      done: true,
      measurementMode: planned.measurementMode,
      draft: draftFromMeasurement(planned.measurementMode, planned.target),
    })),
  );

  const built = useMemo(
    () =>
      rows.map((row) => ({
        row,
        build: buildMeasurement(row.measurementMode, row.draft),
      })),
    [rows],
  );

  const serialized = JSON.stringify(
    built
      .filter(({ row }) => row.done)
      .map(({ row, build }, position) => ({
        ...(row.planned?.personalActivityId == null
          ? {}
          : { personalActivityId: row.planned.personalActivityId }),
        position,
        name: row.name.trim(),
        sport: row.sport.trim(),
        measurementMode: row.measurementMode,
        actualMeasurement: build.ok ? build.measurement : null,
      })),
  );

  function update(key: string, change: Partial<Row>) {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...change } : row)),
    );
  }

  const [dragging, setDragging] = useState<string | null>(null);

  function moveTo(key: string, to: number) {
    setRows((current) => {
      const from = current.findIndex((row) => row.key === key);
      if (from < 0 || to < 0 || to >= current.length || from === to)
        return current;
      const next = [...current];
      const [held] = next.splice(from, 1);
      next.splice(to, 0, held);
      return next;
    });
  }

  return (
    <fieldset
      className={styles.activities}
      data-log-activities
      disabled={inactive}
      hidden={inactive}
    >
      <legend>What you did</legend>
      <p className={styles.fieldHint}>
        Each planned activity starts as planned. Change what differed, mark what
        you did not do, and add anything else.
      </p>
      <input type="hidden" name="activities" value={serialized} />
      {rows.length === 0 ? null : (
        <ol className={styles.activityRows}>
          {built.map(({ row, build }, index) => (
            <ActualRow
              key={row.key}
              idPrefix={`${prefix}-activity-${index}`}
              row={row}
              index={index}
              total={rows.length}
              problem={row.done && !build.ok ? build.message : null}
              actual={build.ok ? describeMeasurement(build.measurement) : null}
              onChange={(change) => update(row.key, change)}
              dragging={dragging === row.key}
              onDragStateChange={(active) =>
                setDragging(active ? row.key : null)
              }
              onMove={(delta) => moveTo(row.key, index + delta)}
              onMoveTo={(to) => moveTo(row.key, to)}
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
        className={styles.secondary}
        type="button"
        disabled={rows.length >= ROW_LIMIT}
        onClick={() =>
          setRows((current) => [
            ...current,
            {
              key: `added-${nextKey++}`,
              planned: null,
              name: "",
              sport: sessionSport.trim(),
              done: true,
              measurementMode: "unmeasured",
              draft: emptyDraft("unmeasured"),
            },
          ])
        }
      >
        Add activity
      </button>
    </fieldset>
  );
}

function ActualRow({
  idPrefix,
  row,
  index,
  total,
  problem,
  actual,
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
  actual: string | null;
  dragging: boolean;
  onDragStateChange: (dragging: boolean) => void;
  onChange: (change: Partial<Row>) => void;
  onMove: (delta: number) => void;
  onMoveTo: (index: number) => void;
  onRemove: () => void;
}) {
  const added = row.planned === null;
  const [expanded, setExpanded] = useState(added);
  const validityRef = useRef<HTMLInputElement | null>(null);
  // Forced open while it cannot be built or is missing its name, for the
  // reason the plan's editor gives: the browser is about to point at a
  // control inside this body, and it cannot focus one that is hidden.
  const unnamed = row.name.trim() === "" || row.sport.trim() === "";
  const forced = problem !== null || unnamed;
  const open = row.done && (expanded || forced);
  const planned =
    row.planned === null ? null : describeMeasurement(row.planned.target);
  const label = row.name.trim() === "" ? "New activity" : row.name;

  useEffect(() => {
    validityRef.current?.setCustomValidity(problem ?? "");
  }, [problem]);

  return (
    <li
      className={[
        row.done ? styles.activityRow : styles.activityRowSkipped,
        dragging ? styles.activityRowDragging : "",
      ].join(" ")}
      data-log-activity={index}
    >
      <div className={styles.activityTop}>
        <ReorderHandle
          className={styles.activityHandle}
          label={`Drag to reorder, or use the arrow keys. ${label}, ${index + 1} of ${total}.`}
          onDragStateChange={onDragStateChange}
          onMove={onMove}
          onMoveTo={onMoveTo}
        />
        <div className={styles.activityHead}>
          <p className={styles.activityName}>{label}</p>
          <p className={styles.activityLine}>
            {added ? "Not on the plan" : `Planned: ${planned ?? "no target"}`}
          </p>
          {row.done ? (
            <p className={styles.activityLine} data-log-actual>
              Did: {problem ?? actual ?? "not measured"}
            </p>
          ) : null}
        </div>
      </div>
      <div className={styles.activityControls}>
        {added ? (
          // Something the owner added and did not do is simply not there, so
          // it is removed rather than marked.
          <button className={styles.secondary} type="button" onClick={onRemove}>
            Remove
          </button>
        ) : (
          <label className={styles.checkField}>
            <input
              type="checkbox"
              checked={!row.done}
              onChange={(event) => onChange({ done: !event.target.checked })}
            />
            <span>Didn&apos;t do this</span>
          </label>
        )}
        {row.done ? (
          <button
            className={styles.secondary}
            type="button"
            aria-expanded={open}
            aria-controls={`${idPrefix}-body`}
            // A row held open by a problem cannot be folded, so the button
            // says nothing it cannot do.
            disabled={forced}
            onClick={() => setExpanded((current) => !current)}
          >
            {open ? "Done adjusting" : "Adjust"}
          </button>
        ) : null}
      </div>
      <div
        id={`${idPrefix}-body`}
        hidden={!open}
        className={styles.activityBody}
      >
        {added ? (
          <>
            <div className={styles.field}>
              <label htmlFor={`${idPrefix}-name`}>Activity name</label>
              <input
                id={`${idPrefix}-name`}
                type="text"
                value={row.name}
                maxLength={120}
                required
                autoComplete="off"
                onChange={(event) => onChange({ name: event.target.value })}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor={`${idPrefix}-sport`}>Activity sport</label>
              <input
                id={`${idPrefix}-sport`}
                type="text"
                value={row.sport}
                maxLength={80}
                required
                autoComplete="off"
                onChange={(event) => onChange({ sport: event.target.value })}
              />
            </div>
          </>
        ) : null}
        <MeasurementModeField
          id={`${idPrefix}-mode`}
          mode={row.measurementMode}
          onChange={(mode) =>
            // Back to the plan's own mode restores the target as the starting
            // point; any other mode starts empty, as it does in the editor.
            onChange({
              measurementMode: mode,
              draft:
                row.planned !== null && mode === row.planned.measurementMode
                  ? draftFromMeasurement(mode, row.planned.target)
                  : emptyDraft(mode),
            })
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
      </div>
    </li>
  );
}
