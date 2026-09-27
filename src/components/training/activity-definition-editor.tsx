"use client";

import { useId, useMemo, useState } from "react";

import styles from "./activity-editor.module.css";
import { ActivityFields, type ActivityFieldsValue } from "./activity-editor";

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
} from "@/lib/training/measurement-draft";

/** One library definition as the surface holds it (A5). */
export type ActivityDefinitionValue = {
  name: string;
  sport: string;
  instructions: string | null;
  measurementMode: TrainingMeasurementMode;
  target: TrainingMeasurement | null;
};

/**
 * One reusable activity, edited through the same fields as a session's row.
 *
 * It writes a single hidden JSON field for the same reason `ActivityEditor`
 * does: a measurement is a nested shape, and the server parses one value
 * under the suspicion it gives any other form value. The target here is the
 * one a pick copies into a session, so it is optional in every mode.
 */
export function ActivityDefinitionEditor({
  idPrefix,
  name = "activity",
  initial,
}: {
  idPrefix?: string;
  name?: string;
  initial?: ActivityDefinitionValue;
}) {
  const generatedId = useId();
  const prefix = idPrefix || generatedId;
  const [value, setValue] = useState<ActivityFieldsValue>(() =>
    initial
      ? {
          name: initial.name,
          sport: initial.sport,
          instructions: initial.instructions,
          measurementMode: initial.measurementMode,
          draft: draftFromMeasurement(initial.measurementMode, initial.target),
        }
      : {
          name: "",
          sport: "",
          instructions: null,
          measurementMode: "unmeasured",
          draft: emptyDraft("unmeasured"),
        },
  );

  const build = useMemo(
    () => buildMeasurement(value.measurementMode, value.draft),
    [value.measurementMode, value.draft],
  );

  const serialized = JSON.stringify({
    name: value.name.trim(),
    sport: value.sport.trim(),
    instructions:
      value.instructions === null || value.instructions.trim() === ""
        ? null
        : value.instructions.trim(),
    measurementMode: value.measurementMode,
    target: build.ok ? build.measurement : null,
  });

  return (
    <div className={styles.definition}>
      <input type="hidden" name={name} value={serialized} />
      <ActivityFields
        idPrefix={prefix}
        value={value}
        problem={build.ok ? null : build.message}
        sportHint={null}
        onChange={(change) =>
          setValue((current) => ({ ...current, ...change }))
        }
      />
      <p className={styles.hint}>
        {build.ok
          ? (describeMeasurement(build.measurement) ?? ACTIVITY_COPY.noTarget)
          : null}
      </p>
    </div>
  );
}
