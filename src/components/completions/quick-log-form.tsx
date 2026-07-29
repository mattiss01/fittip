"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import {
  COMPLETION_FEELINGS,
  COMPLETION_STATUSES,
  type CompletionRevision,
  type CompletionStatus,
  type PlannedSessionSnapshot,
} from "@/features/completions/completion-types";
import { isoDateInTimezone } from "@/features/completions/local-date";
import { saveQuickLog, type QuickLogActionState } from "@/app/home/log/actions";
import styles from "@/app/home/log/log.module.css";

const OUTCOME_LABELS: Record<CompletionStatus, string> = {
  completed: "Completed",
  partially_completed: "Partly done",
  skipped: "Skipped",
  replaced: "Replaced",
  rest: "Rest",
  unplanned: "Unplanned",
};

export function QuickLogForm({
  plannedSession,
  current,
  defaultDate,
  deriveBrowserDate = false,
}: {
  plannedSession: PlannedSessionSnapshot | null;
  current: CompletionRevision | null;
  defaultDate: string;
  deriveBrowserDate?: boolean;
}) {
  const initialStatus =
    current?.status ?? (plannedSession ? "completed" : "unplanned");
  const [outcome, setOutcome] = useState<CompletionStatus>(initialStatus);
  const [startedAtLocal, setStartedAtLocal] = useState<string | null>(null);
  const timezoneRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [state, action, pending] = useActionState<
    QuickLogActionState,
    FormData
  >(saveQuickLog, { status: "idle" });

  useEffect(() => {
    if (timezoneRef.current && !current?.timezoneName) {
      const browserTimezone =
        Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
      timezoneRef.current.value = browserTimezone;
      if (deriveBrowserDate && dateRef.current) {
        dateRef.current.value = isoDateInTimezone(new Date(), browserTimezone);
      }
    }
  }, [current?.timezoneName, deriveBrowserDate]);

  if (state.status === "saved") {
    return (
      <section className={styles.saved} aria-live="polite">
        <p className={styles.kicker}>Actual saved</p>
        <h2>Fact recorded.</h2>
        <p>
          Revision {state.revisionNumber} is preserved. Your plan was not
          changed.
        </p>
        <a
          href={`/home/progress/completion-${encodeURIComponent(
            state.completionGroupId,
          )}`}
        >
          View in Progress
        </a>
        <a
          href={`/home/log?completion=${encodeURIComponent(
            state.completionGroupId,
          )}`}
        >
          Correct this actual
        </a>
      </section>
    );
  }

  const activityInputs = plannedSession
    ? plannedSession.activities.map((plannedActivity) => {
        const actual = current?.activities.find(
          (activity) => activity.plannedActivityId === plannedActivity.id,
        );
        return actual
          ? {
              ...plannedActivity,
              personalActivityId: actual.personalActivityId,
              actualMeasurement: actual.actualMeasurement,
            }
          : plannedActivity;
      })
    : current?.activities.length
      ? current.activities
      : [
          {
            id: "unplanned",
            name: "",
            sport: "",
            instructions: null,
            measurementMode: "custom" as const,
          },
        ];
  const acceptsActivityResults = outcome !== "skipped" && outcome !== "rest";

  return (
    <form action={action} className={styles.form}>
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <input
        name="completionGroupId"
        type="hidden"
        value={current?.completionGroupId ?? ""}
      />
      <input
        name="expectedRevision"
        type="hidden"
        value={current?.revisionNumber ?? 0}
      />
      <input
        name="plannedSessionId"
        type="hidden"
        value={plannedSession?.id ?? current?.plannedSessionId ?? ""}
      />
      <input
        defaultValue={current?.timezoneName ?? "UTC"}
        name="timezoneName"
        ref={timezoneRef}
        type="hidden"
      />
      <input
        name="actualStartedAt"
        type="hidden"
        value={
          startedAtLocal === null
            ? (current?.actualStartedAt ?? "")
            : startedAtLocal
              ? new Date(startedAtLocal).toISOString()
              : ""
        }
      />

      <fieldset className={styles.outcomes}>
        <legend>What happened?</legend>
        <div className={styles.outcomeGrid}>
          {COMPLETION_STATUSES.map((status) => {
            const disabled = plannedSession
              ? status === "unplanned"
              : status !== "unplanned";
            return (
              <label className={styles.outcome} key={status}>
                <input
                  checked={outcome === status}
                  disabled={disabled}
                  name="outcome"
                  onChange={() => setOutcome(status)}
                  type="radio"
                  value={status}
                />
                <span>{OUTCOME_LABELS[status]}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {outcome === "replaced" ? (
        <label className={styles.field}>
          <span>What replaced it? *</span>
          <textarea
            defaultValue={current?.replacementDescription}
            maxLength={500}
            name="replacementDescription"
            required
            rows={3}
          />
        </label>
      ) : null}

      <section className={styles.detailGrid} aria-labelledby="actual-details">
        <h2 id="actual-details">Actual details</h2>
        <label className={styles.field}>
          <span>Local date *</span>
          <input
            defaultValue={current?.actualLocalDate ?? defaultDate}
            name="actualLocalDate"
            ref={dateRef}
            required
            type="date"
          />
        </label>
        <label className={styles.field}>
          <span>Start time (optional)</span>
          <input
            defaultValue={
              current?.actualStartedAt
                ? toDatetimeLocal(current.actualStartedAt)
                : ""
            }
            onChange={(event) => setStartedAtLocal(event.target.value)}
            type="datetime-local"
          />
        </label>
        <label className={styles.field}>
          <span>Duration in minutes</span>
          <input
            defaultValue={current?.durationMinutes}
            inputMode="numeric"
            max={10080}
            min={0}
            name="durationMinutes"
            type="number"
          />
        </label>
        <label className={styles.field}>
          <span>Perceived effort (1–10)</span>
          <input
            defaultValue={current?.perceivedEffort}
            inputMode="numeric"
            max={10}
            min={1}
            name="perceivedEffort"
            type="number"
          />
        </label>
        <label className={styles.field}>
          <span>Compared with expectation</span>
          <select defaultValue={current?.feeling ?? ""} name="feeling">
            <option value="">Not recorded</option>
            {COMPLETION_FEELINGS.map((feeling) => (
              <option key={feeling} value={feeling}>
                {feeling.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
      </section>

      {acceptsActivityResults ? (
        <details className={styles.activityDetails}>
          <summary>Activity results (optional)</summary>
          <p>
            Add JSON using the activity’s measurement mode, for example{" "}
            <code>{`{"distance":5,"distance_unit":"km"}`}</code>.
          </p>
          <input
            name="activityCount"
            type="hidden"
            value={activityInputs.length}
          />
          {activityInputs.map((activity, index) => (
            <div className={styles.activity} key={activity.id}>
              <input
                name={`activity-${index}-planned-id`}
                type="hidden"
                value={
                  activity.id === "unplanned"
                    ? ""
                    : "completedSessionId" in activity
                      ? (activity.plannedActivityId ?? "")
                      : activity.id
                }
              />
              <input
                name={`activity-${index}-personal-id`}
                type="hidden"
                value={
                  "personalActivityId" in activity
                    ? (activity.personalActivityId ?? "")
                    : ""
                }
              />
              <label className={styles.field}>
                <span>Activity</span>
                <input
                  defaultValue={activity.name}
                  name={`activity-${index}-name`}
                  placeholder="e.g. Easy run"
                />
              </label>
              <label className={styles.field}>
                <span>Sport / domain</span>
                <input
                  defaultValue={activity.sport}
                  name={`activity-${index}-sport`}
                  placeholder="e.g. Running"
                />
              </label>
              <input
                name={`activity-${index}-instructions`}
                type="hidden"
                value={activity.instructions ?? ""}
              />
              <label className={styles.field}>
                <span>Measurement mode</span>
                <select
                  defaultValue={activity.measurementMode}
                  name={`activity-${index}-mode`}
                >
                  <option value="sets_reps_load">Sets / reps / load</option>
                  <option value="time_distance_pace">
                    Time / distance / pace
                  </option>
                  <option value="duration_intensity">
                    Duration / intensity
                  </option>
                  <option value="skill_repetitions">Skill repetitions</option>
                  <option value="custom">Custom</option>
                </select>
              </label>
              <label className={styles.field}>
                <span>Actual measurement JSON</span>
                <textarea
                  defaultValue={
                    "actualMeasurement" in activity &&
                    activity.actualMeasurement !== undefined
                      ? JSON.stringify(activity.actualMeasurement)
                      : ""
                  }
                  name={`activity-${index}-measurement`}
                  placeholder='{"duration_minutes":45,"intensity":"easy"}'
                  rows={3}
                />
              </label>
            </div>
          ))}
        </details>
      ) : (
        <p className={styles.noActivityResult} role="note">
          Skipped and rest facts do not contain activity results.
        </p>
      )}

      <label className={styles.field}>
        <span>Private note</span>
        <textarea
          defaultValue={current?.note}
          maxLength={2000}
          name="note"
          rows={4}
        />
        <small>Never sent to analytics or external services.</small>
      </label>

      <fieldset className={styles.signals}>
        <legend>Health-adjacent signals (optional)</legend>
        {[
          ["painReported", "Pain"],
          ["illnessReported", "Illness"],
          ["injuryReported", "Injury"],
          ["severeFatigueReported", "Severe fatigue"],
        ].map(([name, label]) => (
          <label key={name}>
            <input
              defaultChecked={
                current?.[name as keyof CompletionRevision] === true
              }
              name={name}
              type="checkbox"
            />
            <span>{label}</span>
          </label>
        ))}
        <p>
          FitTip does not diagnose or alter your plan. Stop if symptoms are
          severe, acute, or worsening, and seek qualified medical help when
          appropriate.
        </p>
      </fieldset>

      {current ? (
        <label className={styles.field}>
          <span>Reason for correction *</span>
          <textarea maxLength={500} name="correctionReason" required rows={3} />
          <small>The prior revision remains visible and unchanged.</small>
        </label>
      ) : null}

      {state.status === "error" ? (
        <p className={styles.error} role="alert">
          {state.message}
        </p>
      ) : null}

      <button className={styles.save} disabled={pending} type="submit">
        {pending
          ? "Saving actual…"
          : current
            ? "Save correction"
            : "Save actual"}
      </button>
    </form>
  );
}

function toDatetimeLocal(value: string): string {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
