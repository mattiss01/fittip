"use client";

import { useState, useTransition } from "react";

import type {
  ArchiveActivityActionResult,
  MeasurementMode,
  PersonalActivityActionResult,
  PersonalActivityOption,
} from "@/features/planning/planning-types";

type ActivityInput = {
  name: string;
  sport: string;
  description?: string;
  measurementMode: MeasurementMode;
  defaultMeasurement?: PersonalActivityOption["defaultMeasurement"];
};

export function ActivityLibrary({
  activities,
  onCreate,
  onUpdate,
  onArchive,
}: {
  activities: PersonalActivityOption[];
  onCreate: (input: ActivityInput) => Promise<PersonalActivityActionResult>;
  onUpdate: (
    id: string,
    input: ActivityInput,
  ) => Promise<PersonalActivityActionResult>;
  onArchive: (id: string) => Promise<ArchiveActivityActionResult>;
}) {
  const [editing, setEditing] = useState<PersonalActivityOption | "new" | null>(
    null,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <details className="activity-library">
      <summary>
        <span>
          <span className="step-mark">03 / REUSE</span>
          <strong>My activities</strong>
        </span>
        <span>{activities.length} active</span>
      </summary>
      <div className="library-content">
        <p>
          These are your own reusable definitions—not a global exercise catalog.
          Editing one never changes a saved plan snapshot.
        </p>
        <button
          className="secondary-button"
          onClick={() => {
            setEditing("new");
            setMessage(null);
          }}
          type="button"
        >
          + Create personal activity
        </button>

        {editing ? (
          <ActivityDefinitionForm
            activity={editing === "new" ? null : editing}
            disabled={isPending}
            onCancel={() => setEditing(null)}
            onSubmit={(input) => {
              startTransition(async () => {
                const result =
                  editing === "new"
                    ? await onCreate(input)
                    : await onUpdate(editing.id, input);
                if (result.status === "saved") {
                  setEditing(null);
                  setMessage(
                    editing === "new"
                      ? "Personal activity created."
                      : "Future reuse updated. Saved plans are unchanged.",
                  );
                } else {
                  setMessage(result.message);
                }
              });
            }}
          />
        ) : null}

        {message ? (
          <p className="library-message" role="status">
            {message}
          </p>
        ) : null}

        {activities.length ? (
          <ul className="library-list">
            {activities.map((activity) => (
              <li key={activity.id}>
                <div>
                  <strong>{activity.name}</strong>
                  <span>
                    {activity.sport} · {modeLabel(activity.measurementMode)}
                  </span>
                </div>
                <div>
                  <button
                    onClick={() => {
                      setEditing(activity);
                      setMessage(null);
                    }}
                    type="button"
                  >
                    Edit
                  </button>
                  <button
                    className="danger-text"
                    disabled={isPending}
                    onClick={() => {
                      if (
                        !window.confirm(
                          `Archive ${activity.name}? It will disappear from future reuse, while saved plans remain unchanged.`,
                        )
                      ) {
                        return;
                      }
                      startTransition(async () => {
                        const result = await onArchive(activity.id);
                        setMessage(
                          result.status === "archived"
                            ? "Activity archived. Saved plans are unchanged."
                            : result.message,
                        );
                      });
                    }}
                    type="button"
                  >
                    Archive
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="library-empty">No personal activities yet.</p>
        )}
      </div>
    </details>
  );
}

function ActivityDefinitionForm({
  activity,
  disabled,
  onCancel,
  onSubmit,
}: {
  activity: PersonalActivityOption | null;
  disabled: boolean;
  onCancel: () => void;
  onSubmit: (input: ActivityInput) => void;
}) {
  const [name, setName] = useState(activity?.name ?? "");
  const [sport, setSport] = useState(activity?.sport ?? "");
  const [description, setDescription] = useState(activity?.description ?? "");
  const [measurementMode, setMeasurementMode] = useState<MeasurementMode>(
    activity?.measurementMode ?? "duration_intensity",
  );

  return (
    <form
      className="activity-definition-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({
          name,
          sport,
          ...(description ? { description } : {}),
          measurementMode,
          ...(activity?.measurementMode === measurementMode &&
          activity.defaultMeasurement
            ? { defaultMeasurement: activity.defaultMeasurement }
            : {}),
        });
      }}
    >
      <label>
        Activity name
        <input
          disabled={disabled}
          maxLength={120}
          onChange={(event) => setName(event.currentTarget.value)}
          required
          value={name}
        />
      </label>
      <label>
        Sport or domain
        <input
          disabled={disabled}
          maxLength={80}
          onChange={(event) => setSport(event.currentTarget.value)}
          required
          value={sport}
        />
      </label>
      <label>
        Measurement mode
        <select
          disabled={disabled}
          onChange={(event) =>
            setMeasurementMode(event.currentTarget.value as MeasurementMode)
          }
          value={measurementMode}
        >
          <option value="duration_intensity">Duration & intensity</option>
          <option value="time_distance_pace">Time, distance & pace</option>
          <option value="skill_repetitions">Skill repetitions</option>
          <option value="sets_reps_load">Sets, reps & load</option>
          <option value="custom">Custom target</option>
        </select>
      </label>
      <label>
        Default instructions
        <textarea
          disabled={disabled}
          maxLength={2000}
          onChange={(event) => setDescription(event.currentTarget.value)}
          value={description}
        />
      </label>
      <footer>
        <button
          className="text-action"
          disabled={disabled}
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
        <button disabled={disabled} type="submit">
          {disabled ? "Saving…" : "Save activity"}
        </button>
      </footer>
    </form>
  );
}

function modeLabel(mode: MeasurementMode) {
  return {
    duration_intensity: "duration",
    time_distance_pace: "distance",
    skill_repetitions: "skill reps",
    sets_reps_load: "sets & reps",
    custom: "custom",
  }[mode];
}
