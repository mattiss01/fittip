"use client";

import styles from "./activity-editor.module.css";
import { ReorderHandle } from "./reorder-handle";

import {
  DISTANCE_UNITS,
  INTENSITIES,
  LOAD_UNITS,
  PACE_UNITS,
  TRAINING_MEASUREMENT_MODES,
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
  derivePace,
  emptySetGroup,
  writeClock,
  type MeasurementDraft,
  type SetGroupDraft,
} from "@/lib/training/measurement-draft";

/**
 * The inputs for one measurement, in whichever mode it is taken.
 *
 * Shared by the plan's activity editor, where they hold a target, and the log,
 * where they hold what was actually done. The two are the same shapes —
 * `describeMeasurement` reads either — so the inputs are too. What the draft
 * means is the caller's business; this only binds it.
 */

/** "Measured as", with the mode's own hint beneath it. */
export function MeasurementModeField({
  id,
  mode,
  onChange,
}: {
  id: string;
  mode: TrainingMeasurementMode;
  onChange: (mode: TrainingMeasurementMode) => void;
}) {
  return (
    <div className={styles.field}>
      <label htmlFor={id}>Measured as</label>
      <select
        id={id}
        value={mode}
        onChange={(event) =>
          onChange(event.target.value as TrainingMeasurementMode)
        }
      >
        {TRAINING_MEASUREMENT_MODES.map((option) => (
          <option key={option} value={option}>
            {MEASUREMENT_MODE_COPY[option].label}
          </option>
        ))}
      </select>
      <p className={styles.hint}>{MEASUREMENT_MODE_COPY[mode].hint}</p>
    </div>
  );
}

export function MeasurementFields({
  idPrefix,
  mode,
  draft,
  validityRef,
  onDraftChange,
  onGroupsChange,
}: {
  idPrefix: string;
  mode: TrainingMeasurementMode;
  draft: MeasurementDraft;
  validityRef: React.RefObject<HTMLInputElement | null>;
  onDraftChange: (field: string, value: string) => void;
  onGroupsChange: (groups: SetGroupDraft[]) => void;
}) {
  const bind = (field: string) => ({
    id: `${idPrefix}-${field}`,
    value: draft.fields[field] ?? "",
    onChange: (
      event: React.ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >,
    ) => onDraftChange(field, event.target.value),
  });

  // An activity with nothing to count has nothing to fill in. Saying so in a
  // line is better than an empty box, which reads as something failing to
  // render.
  if (mode === "unmeasured") {
    return (
      <p className={styles.unmeasured}>
        {MEASUREMENT_MODE_COPY.unmeasured.hint}
      </p>
    );
  }

  if (mode === "sets_reps_load") {
    const groups = draft.groups;
    const setGroup = (index: number, change: Partial<SetGroupDraft>) =>
      onGroupsChange(
        groups.map((group, position) =>
          position === index ? { ...group, ...change } : group,
        ),
      );
    // A ramp is read top to bottom, so its order is the owner's to set. The
    // inputs are controlled, so moving a draft moves its values with it.
    const moveGroup = (from: number, to: number) => {
      if (to < 0 || to >= groups.length || from === to) return;
      const next = [...groups];
      const [held] = next.splice(from, 1);
      next.splice(to, 0, held);
      onGroupsChange(next);
    };
    return (
      <div className={styles.groupBox}>
        {/* Outside the list: `ReorderHandle` counts the list's items as rows. */}
        <div className={styles.groupHeadings} aria-hidden="true">
          <span />
          <span>Sets</span>
          <span>Reps</span>
          <span>Load</span>
          <span />
        </div>
        <ol className={styles.groupRows}>
          {groups.map((group, index) => (
            <li className={styles.groupRow} key={index}>
              <ReorderHandle
                className={styles.groupHandle}
                label={`${ACTIVITY_COPY.reorderHint} Set group ${index + 1} of ${groups.length}.`}
                onDragStateChange={() => {}}
                onMove={(delta) => moveGroup(index, index + delta)}
                onMoveTo={(to) => moveGroup(index, to)}
              />
              <input
                aria-label={`Sets, group ${index + 1}`}
                id={`${idPrefix}-group-${index}-sets`}
                ref={index === 0 ? validityRef : undefined}
                value={group.sets}
                inputMode="numeric"
                placeholder="3"
                onChange={(event) =>
                  setGroup(index, { sets: event.target.value })
                }
              />
              <input
                aria-label={`Reps, group ${index + 1}`}
                id={`${idPrefix}-group-${index}-reps`}
                value={group.reps}
                inputMode="numeric"
                placeholder="5"
                onChange={(event) =>
                  setGroup(index, { reps: event.target.value })
                }
              />
              <input
                aria-label={`Load, group ${index + 1}`}
                id={`${idPrefix}-group-${index}-load`}
                value={group.load}
                inputMode="decimal"
                placeholder="60"
                onChange={(event) =>
                  setGroup(index, { load: event.target.value })
                }
              />
              <button
                className={styles.groupRemove}
                type="button"
                aria-label={`${ACTIVITY_COPY.removeGroup} ${index + 1}`}
                // The last row is never removable: the editor always shows one,
                // and an empty one means no target, so there is nothing a
                // removal could express that clearing the fields does not.
                disabled={groups.length === 1}
                onClick={() =>
                  onGroupsChange(groups.filter((_, at) => at !== index))
                }
              >
                <span aria-hidden="true">&times;</span>
              </button>
            </li>
          ))}
        </ol>
        <div className={styles.groupFoot}>
          <button
            className={styles.groupAdd}
            type="button"
            disabled={groups.length >= 20}
            onClick={() => onGroupsChange([...groups, emptySetGroup()])}
          >
            {ACTIVITY_COPY.addGroup}
          </button>
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
      </div>
    );
  }

  if (mode === "time_distance_pace") {
    const built = buildMeasurement(mode, draft);
    const derived =
      built.ok && built.measurement !== null && "distance" in built.measurement
        ? derivePace(
            built.measurement.duration_seconds,
            built.measurement.distance,
            built.measurement.distance_unit,
          )
        : null;
    const derivedPaceText =
      derived === null
        ? null
        : `${writeClock(derived.seconds)} ${PACE_UNIT_COPY[derived.unit]}`;
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
          <input
            {...bind("pace")}
            inputMode="text"
            placeholder="4:45"
            readOnly={derivedPaceText !== null}
            value={derivedPaceText ?? draft.fields.pace ?? ""}
          />
        </div>
        {derivedPaceText === null ? (
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
        ) : (
          <p className={styles.hintWide}>{ACTIVITY_COPY.derivedPace}</p>
        )}
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
