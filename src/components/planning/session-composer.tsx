"use client";

import { useEffect, useId, useRef, useState } from "react";

import type {
  MeasurementMode,
  MeasurementTarget,
  PersonalActivityOption,
  PlanActivityDraft,
  PlanSessionDraft,
} from "@/features/planning/planning-types";
import { createClientId } from "@/features/planning/planning-utils";

export function SessionComposer({
  dates,
  initialSession,
  personalActivities,
  onCancel,
  onSave,
}: {
  dates: string[];
  initialSession: PlanSessionDraft;
  personalActivities: PersonalActivityOption[];
  onCancel: () => void;
  onSave: (session: PlanSessionDraft) => void;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const [session, setSession] = useState(() => structuredClone(initialSession));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      dialogRef.current
        ?.querySelector<HTMLElement>("[data-dialog-initial-focus]")
        ?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  function handleDialogKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    ).filter(
      (element) =>
        !element.hasAttribute("hidden") &&
        element.getAttribute("aria-hidden") !== "true",
    );
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;

    if (
      event.shiftKey &&
      (document.activeElement === first ||
        !dialogRef.current?.contains(document.activeElement))
    ) {
      event.preventDefault();
      last.focus();
    } else if (
      !event.shiftKey &&
      (document.activeElement === last ||
        !dialogRef.current?.contains(document.activeElement))
    ) {
      event.preventDefault();
      first.focus();
    }
  }

  function updateActivity(
    clientId: string,
    update: (current: PlanActivityDraft) => PlanActivityDraft,
  ) {
    setSession((current) => ({
      ...current,
      activities: current.activities.map((activity) =>
        activity.clientId === clientId ? update(activity) : activity,
      ),
    }));
  }

  function moveActivity(index: number, direction: -1 | 1) {
    setSession((current) => {
      const next = [...current.activities];
      const nextIndex = index + direction;
      if (!next[nextIndex]) return current;
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return { ...current, activities: next };
    });
  }

  function addPersonalActivity(id: string) {
    const activity = personalActivities.find(
      (candidate) => candidate.id === id,
    );
    if (!activity) return;
    setSession((current) => ({
      ...current,
      activities: [
        ...current.activities,
        {
          clientId: createClientId("activity"),
          personalActivityId: activity.id,
          name: activity.name,
          sport: activity.sport,
          instructions: activity.description ?? "",
          measurementMode: activity.measurementMode,
          target:
            activity.defaultMeasurement ??
            defaultTarget(activity.measurementMode),
          isLocked: false,
        },
      ],
    }));
  }

  function submit() {
    if (!session.title.trim() || !session.sport.trim()) {
      setError("Add a session title and sport or training domain.");
      return;
    }
    if (
      session.expectedDurationMinutes !== undefined &&
      (session.expectedDurationMinutes < 1 ||
        session.expectedDurationMinutes > 10080)
    ) {
      setError("Expected duration must be between 1 and 10,080 minutes.");
      return;
    }
    if (
      session.activities.some(
        (activity) => !activity.name.trim() || !activity.sport.trim(),
      )
    ) {
      setError("Every activity needs a name and sport or training domain.");
      return;
    }
    if (
      session.activities.some(
        (activity) =>
          !isCompleteTarget(activity.measurementMode, activity.target),
      )
    ) {
      setError(
        "Complete each activity target with the required value and unit.",
      );
      return;
    }

    setError(null);
    onSave({
      ...session,
      title: session.title.trim(),
      sport: session.sport.trim(),
      intent: session.intent.trim(),
      note: session.note.trim(),
      activities: session.activities.map((activity) => ({
        ...activity,
        name: activity.name.trim(),
        sport: activity.sport.trim(),
        instructions: activity.instructions.trim(),
      })),
    });
  }

  return (
    <div className="composer-backdrop">
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className="session-composer"
        onKeyDown={handleDialogKeyDown}
        ref={dialogRef}
        role="dialog"
      >
        <header className="composer-header">
          <div>
            <p className="step-mark">SESSION DETAILS</p>
            <h2 id={titleId}>
              {initialSession.title ? "Edit session" : "Add session"}
            </h2>
          </div>
          <button
            aria-label="Close session editor"
            className="close-button"
            onClick={onCancel}
            type="button"
          >
            ×
          </button>
        </header>

        <div className="composer-grid">
          <label>
            Date
            <select
              onChange={(event) => {
                const localDate = event.currentTarget.value;
                setSession((current) => ({
                  ...current,
                  localDate,
                }));
              }}
              value={session.localDate}
            >
              {dates.map((date) => (
                <option key={date} value={date}>
                  {date}
                </option>
              ))}
            </select>
          </label>
          <label>
            Expected minutes
            <input
              max={10080}
              min={1}
              onChange={(event) => {
                const expectedDurationMinutes = optionalNumber(
                  event.currentTarget.value,
                );
                setSession((current) => ({
                  ...current,
                  expectedDurationMinutes,
                }));
              }}
              type="number"
              value={session.expectedDurationMinutes ?? ""}
            />
          </label>
        </div>

        <label>
          Session title
          <input
            data-dialog-initial-focus
            maxLength={120}
            onChange={(event) => {
              const title = event.currentTarget.value;
              setSession((current) => ({
                ...current,
                title,
              }));
            }}
            placeholder="Easy trail run"
            value={session.title}
          />
        </label>
        <label>
          Sport or domain
          <input
            maxLength={80}
            onChange={(event) => {
              const sport = event.currentTarget.value;
              setSession((current) => ({
                ...current,
                sport,
              }));
            }}
            placeholder="Running, football, mobility…"
            value={session.sport}
          />
        </label>
        <label>
          Intent
          <input
            maxLength={500}
            onChange={(event) => {
              const intent = event.currentTarget.value;
              setSession((current) => ({
                ...current,
                intent,
              }));
            }}
            placeholder="Keep it conversational"
            value={session.intent}
          />
        </label>
        <label>
          Session note
          <textarea
            maxLength={2000}
            onChange={(event) => {
              const note = event.currentTarget.value;
              setSession((current) => ({
                ...current,
                note,
              }));
            }}
            placeholder="Optional context for this plan"
            value={session.note}
          />
        </label>
        <label className="lock-control">
          <input
            checked={session.isLocked}
            onChange={(event) => {
              const isLocked = event.currentTarget.checked;
              setSession((current) => ({
                ...current,
                isLocked,
              }));
            }}
            type="checkbox"
          />
          <span>
            Lock for future automated replans
            <small>You can still edit or unlock it yourself.</small>
          </span>
        </label>

        <section
          className="activity-builder"
          aria-labelledby="activities-title"
        >
          <div className="activity-builder-heading">
            <div>
              <p className="step-mark">ACTIVITIES</p>
              <h3 id="activities-title">What’s inside?</h3>
            </div>
            <button
              onClick={() =>
                setSession((current) => ({
                  ...current,
                  activities: [
                    ...current.activities,
                    createEmptyActivity(current.sport),
                  ],
                }))
              }
              type="button"
            >
              + New activity
            </button>
          </div>

          {personalActivities.length ? (
            <label className="reuse-field">
              Reuse one of your activities
              <select
                onChange={(event) => {
                  addPersonalActivity(event.currentTarget.value);
                  event.currentTarget.value = "";
                }}
                value=""
              >
                <option value="">Choose activity…</option>
                {personalActivities.map((activity) => (
                  <option key={activity.id} value={activity.id}>
                    {activity.name} · {activity.sport}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="activity-library-hint">
              Create activities here or add reusable definitions in My
              activities.
            </p>
          )}

          {session.activities.length === 0 ? (
            <div className="composer-empty">
              A session can stand alone, or contain ordered activities.
            </div>
          ) : (
            <ol className="activity-edit-list">
              {session.activities.map((activity, index) => (
                <li className="activity-editor" key={activity.clientId}>
                  <header>
                    <strong>Activity {index + 1}</strong>
                    <div>
                      <button
                        aria-label={`Move activity ${index + 1} up`}
                        disabled={index === 0}
                        onClick={() => moveActivity(index, -1)}
                        type="button"
                      >
                        ↑
                      </button>
                      <button
                        aria-label={`Move activity ${index + 1} down`}
                        disabled={index === session.activities.length - 1}
                        onClick={() => moveActivity(index, 1)}
                        type="button"
                      >
                        ↓
                      </button>
                      <button
                        className="danger-text"
                        onClick={() =>
                          setSession((current) => ({
                            ...current,
                            activities: current.activities.filter(
                              (candidate) =>
                                candidate.clientId !== activity.clientId,
                            ),
                          }))
                        }
                        type="button"
                      >
                        Remove
                      </button>
                    </div>
                  </header>
                  <div className="composer-grid">
                    <label>
                      Name
                      <input
                        maxLength={120}
                        onChange={(event) => {
                          const name = event.currentTarget.value;
                          updateActivity(activity.clientId, (current) => ({
                            ...current,
                            name,
                          }));
                        }}
                        value={activity.name}
                      />
                    </label>
                    <label>
                      Sport or domain
                      <input
                        maxLength={80}
                        onChange={(event) => {
                          const sport = event.currentTarget.value;
                          updateActivity(activity.clientId, (current) => ({
                            ...current,
                            sport,
                          }));
                        }}
                        value={activity.sport}
                      />
                    </label>
                  </div>
                  <label>
                    Measurement
                    <select
                      onChange={(event) => {
                        const measurementMode = event.currentTarget
                          .value as MeasurementMode;
                        updateActivity(activity.clientId, (current) => ({
                          ...current,
                          measurementMode,
                          target: defaultTarget(measurementMode),
                        }));
                      }}
                      value={activity.measurementMode}
                    >
                      <option value="duration_intensity">
                        Duration & intensity
                      </option>
                      <option value="time_distance_pace">
                        Time, distance & pace
                      </option>
                      <option value="skill_repetitions">
                        Skill repetitions
                      </option>
                      <option value="sets_reps_load">Sets, reps & load</option>
                      <option value="custom">Custom target</option>
                    </select>
                  </label>
                  <MeasurementFields
                    activity={activity}
                    onChange={(target) =>
                      updateActivity(activity.clientId, (current) => ({
                        ...current,
                        target,
                      }))
                    }
                  />
                  <label>
                    Instructions / alternatives
                    <textarea
                      maxLength={2000}
                      onChange={(event) => {
                        const instructions = event.currentTarget.value;
                        updateActivity(activity.clientId, (current) => ({
                          ...current,
                          instructions,
                        }));
                      }}
                      placeholder="How to do it, plus an optional fallback"
                      value={activity.instructions}
                    />
                  </label>
                  <label className="lock-control compact">
                    <input
                      checked={activity.isLocked}
                      onChange={(event) => {
                        const isLocked = event.currentTarget.checked;
                        updateActivity(activity.clientId, (current) => ({
                          ...current,
                          isLocked,
                        }));
                      }}
                      type="checkbox"
                    />
                    <span>Lock activity for automated replans</span>
                  </label>
                </li>
              ))}
            </ol>
          )}
        </section>

        {error ? (
          <p className="composer-error" role="alert">
            {error}
          </p>
        ) : null}
        <footer className="composer-footer">
          <button className="secondary-button" onClick={onCancel} type="button">
            Cancel
          </button>
          <button onClick={submit} type="button">
            Keep in draft
          </button>
        </footer>
      </section>
    </div>
  );
}

function MeasurementFields({
  activity,
  onChange,
}: {
  activity: PlanActivityDraft;
  onChange: (target: MeasurementTarget) => void;
}) {
  const target = activity.target ?? defaultTarget(activity.measurementMode);
  const update = (key: string, value: string | number | boolean | undefined) =>
    onChange({ ...target, [key]: value });

  switch (activity.measurementMode) {
    case "duration_intensity":
      return (
        <div className="measurement-grid">
          <label>
            Duration (min)
            <input
              min={0.01}
              onChange={(event) =>
                update(
                  "duration_minutes",
                  numberOrUndefined(event.target.value),
                )
              }
              step="any"
              type="number"
              value={target.duration_minutes?.toString() ?? ""}
            />
          </label>
          <label>
            Intensity
            <select
              onChange={(event) => update("intensity", event.target.value)}
              value={target.intensity?.toString() ?? "easy"}
            >
              <option value="easy">Easy</option>
              <option value="moderate">Moderate</option>
              <option value="hard">Hard</option>
              <option value="very_hard">Very hard</option>
            </select>
          </label>
        </div>
      );
    case "time_distance_pace":
      return (
        <div className="measurement-grid">
          <label>
            Duration (min)
            <input
              min={0.01}
              onChange={(event) => {
                const minutes = numberOrUndefined(event.target.value);
                update(
                  "duration_seconds",
                  minutes === undefined ? undefined : minutes * 60,
                );
              }}
              step="any"
              type="number"
              value={
                typeof target.duration_seconds === "number"
                  ? target.duration_seconds / 60
                  : ""
              }
            />
          </label>
          <label>
            Distance
            <input
              min={0.01}
              onChange={(event) => {
                const distance = numberOrUndefined(event.target.value);
                onChange({
                  ...target,
                  distance,
                  distance_unit:
                    distance === undefined
                      ? undefined
                      : (target.distance_unit ?? "km"),
                });
              }}
              step="any"
              type="number"
              value={target.distance?.toString() ?? ""}
            />
          </label>
          <label>
            Unit
            <select
              onChange={(event) => update("distance_unit", event.target.value)}
              value={target.distance_unit?.toString() ?? "km"}
            >
              <option value="km">km</option>
              <option value="m">m</option>
              <option value="mi">mi</option>
              <option value="yd">yd</option>
            </select>
          </label>
          <label>
            Pace (sec)
            <input
              min={0.01}
              onChange={(event) => {
                const pace = numberOrUndefined(event.target.value);
                onChange({
                  ...target,
                  pace_seconds_per_unit: pace,
                  pace_unit:
                    pace === undefined
                      ? undefined
                      : (target.pace_unit ?? "sec/km"),
                });
              }}
              step="any"
              type="number"
              value={target.pace_seconds_per_unit?.toString() ?? ""}
            />
          </label>
          <label>
            Pace unit
            <select
              onChange={(event) => update("pace_unit", event.target.value)}
              value={target.pace_unit?.toString() ?? "sec/km"}
            >
              <option value="sec/km">sec/km</option>
              <option value="sec/mi">sec/mi</option>
              <option value="sec/100m">sec/100m</option>
              <option value="sec/100yd">sec/100yd</option>
            </select>
          </label>
        </div>
      );
    case "skill_repetitions":
      return (
        <div className="measurement-grid">
          <label>
            Repetitions
            <input
              min={1}
              onChange={(event) =>
                update("repetitions", integerOrUndefined(event.target.value))
              }
              type="number"
              value={target.repetitions?.toString() ?? ""}
            />
          </label>
          <label>
            Unit
            <input
              maxLength={32}
              onChange={(event) => update("unit", event.target.value)}
              value={target.unit?.toString() ?? ""}
            />
          </label>
        </div>
      );
    case "sets_reps_load":
      return (
        <div className="measurement-grid three">
          <label>
            Sets
            <input
              min={1}
              onChange={(event) =>
                update("sets", integerOrUndefined(event.target.value))
              }
              type="number"
              value={target.sets?.toString() ?? ""}
            />
          </label>
          <label>
            Reps
            <input
              min={1}
              onChange={(event) =>
                update("reps", integerOrUndefined(event.target.value))
              }
              type="number"
              value={target.reps?.toString() ?? ""}
            />
          </label>
          <label>
            Load
            <span className="compound-input">
              <input
                min={0}
                onChange={(event) => {
                  const load = numberOrUndefined(event.target.value);
                  onChange({
                    ...target,
                    load,
                    load_unit:
                      load === undefined
                        ? undefined
                        : (target.load_unit ?? "kg"),
                  });
                }}
                step="any"
                type="number"
                value={target.load?.toString() ?? ""}
              />
              <select
                aria-label="Load unit"
                onChange={(event) => update("load_unit", event.target.value)}
                value={target.load_unit?.toString() ?? "kg"}
              >
                <option value="kg">kg</option>
                <option value="lb">lb</option>
              </select>
            </span>
          </label>
        </div>
      );
    case "custom":
      return (
        <div className="measurement-grid three">
          <label>
            Label
            <input
              maxLength={80}
              onChange={(event) => update("label", event.target.value)}
              value={target.label?.toString() ?? ""}
            />
          </label>
          <label>
            Target
            <input
              maxLength={500}
              onChange={(event) => update("value", event.target.value)}
              value={target.value?.toString() ?? ""}
            />
          </label>
          <label>
            Unit
            <input
              maxLength={32}
              onChange={(event) => update("unit", event.target.value)}
              value={target.unit?.toString() ?? ""}
            />
          </label>
        </div>
      );
  }
}

function createEmptyActivity(sport: string): PlanActivityDraft {
  return {
    clientId: createClientId("activity"),
    name: "",
    sport,
    instructions: "",
    measurementMode: "duration_intensity",
    target: defaultTarget("duration_intensity"),
    isLocked: false,
  };
}

export function defaultTarget(mode: MeasurementMode): MeasurementTarget {
  switch (mode) {
    case "duration_intensity":
      return { duration_minutes: 30, intensity: "easy" };
    case "time_distance_pace":
      return { duration_seconds: 1800 };
    case "skill_repetitions":
      return { repetitions: 10, unit: "repetitions" };
    case "sets_reps_load":
      return { sets: 3, reps: 8 };
    case "custom":
      return { label: "Target", value: "", unit: "units" };
  }
}

function optionalNumber(value: string) {
  if (!value) return undefined;
  return Number(value);
}

function numberOrUndefined(value: string) {
  if (!value) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function integerOrUndefined(value: string) {
  const number = numberOrUndefined(value);
  return number === undefined ? undefined : Math.trunc(number);
}

function isCompleteTarget(
  mode: MeasurementMode,
  target: MeasurementTarget | undefined,
) {
  if (!target) return false;
  switch (mode) {
    case "duration_intensity":
      return (
        isPositiveNumber(target.duration_minutes) &&
        (typeof target.intensity === "string" ||
          isPositiveNumber(target.perceived_effort))
      );
    case "time_distance_pace":
      return hasCompleteTimeDistanceTarget(target);
    case "skill_repetitions":
      return (
        isPositiveInteger(target.repetitions) && isNonEmptyString(target.unit)
      );
    case "sets_reps_load":
      return (
        isPositiveInteger(target.sets) &&
        isPositiveInteger(target.reps) &&
        (target.load === undefined ||
          (typeof target.load === "number" &&
            target.load >= 0 &&
            typeof target.load_unit === "string"))
      );
    case "custom":
      return (
        isNonEmptyString(target.label) &&
        target.value !== undefined &&
        isNonEmptyString(target.unit)
      );
  }
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function hasCompleteTimeDistanceTarget(target: MeasurementTarget) {
  const hasDuration = isPositiveNumber(target.duration_seconds);
  const hasDistance =
    isPositiveNumber(target.distance) &&
    typeof target.distance_unit === "string";
  const hasPace =
    isPositiveNumber(target.pace_seconds_per_unit) &&
    typeof target.pace_unit === "string";
  const distancePairIsValid =
    (target.distance === undefined && target.distance_unit === undefined) ||
    hasDistance;
  const pacePairIsValid =
    (target.pace_seconds_per_unit === undefined &&
      target.pace_unit === undefined) ||
    hasPace;
  return (
    distancePairIsValid &&
    pacePairIsValid &&
    (hasDuration || hasDistance || hasPace)
  );
}

function isPositiveInteger(value: unknown): value is number {
  return isPositiveNumber(value) && Number.isInteger(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
