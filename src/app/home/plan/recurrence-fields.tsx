"use client";

import { useId, useState } from "react";

import styles from "./recurrence-fields.module.css";
import { seriesOccurrenceDates } from "./series-recurrence";

import { DateField } from "@/components/date-field/date-field";
import { shiftIsoDate } from "@/lib/date/local-date";

// Monday first, as the week strip reads; the values are the stored weekday
// numbers, Sunday 0.
const WEEKDAYS = [
  [1, "Monday"],
  [2, "Tuesday"],
  [3, "Wednesday"],
  [4, "Thursday"],
  [5, "Friday"],
  [6, "Saturday"],
  [0, "Sunday"],
] as const;

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** How many coming dates the summary lists under its sentence. */
const PREVIEW_COUNT = 4;

export type RecurrenceFieldsValue = {
  frequency: "daily" | "weekly";
  intervalCount: number;
  weekdays?: number[];
  endDate?: string;
};

type Preset = "none" | "weekly" | "fortnightly" | "daily" | "custom";

/**
 * The repeat rule as a calendar asks it (owner, 5 Nov 2026): a row of ready
 * rules built from the session's own weekday, "Custom" for anything else, and
 * a sentence with the next dates that changes as the rule does, so what will
 * be created is read before it is saved rather than on a separate review.
 *
 * The rule is held here and sent in hidden fields under the names the series
 * actions read (`frequency`, `intervalCount`, `weekdays`, `noEnd`,
 * `endDate`), so the visible controls carry no names of their own.
 *
 * `onRepeatsChange` adds "Doesn't repeat" to the presets, for a form where
 * repeating is optional; without it the rule always repeats.
 */
export function RecurrenceFields({
  idPrefix,
  startDate,
  initial,
  repeats = true,
  onRepeatsChange,
  onRuleChange,
}: {
  idPrefix: string;
  startDate: string;
  initial?: RecurrenceFieldsValue;
  repeats?: boolean;
  onRepeatsChange?: (repeats: boolean) => void;
  onRuleChange?: () => void;
}) {
  const startWeekday = weekday(startDate);
  const [frequency, setFrequency] = useState(initial?.frequency ?? "weekly");
  const [intervalText, setIntervalText] = useState(
    String(initial?.intervalCount ?? 1),
  );
  const [weekdays, setWeekdays] = useState<number[]>(
    initial?.weekdays && initial.weekdays.length > 0
      ? initial.weekdays
      : [startWeekday],
  );
  const [custom, setCustom] = useState(
    initial !== undefined &&
      matchPreset(
        initial.frequency,
        initial.intervalCount,
        initial.weekdays ?? [],
        startWeekday,
      ) === "custom",
  );
  const [noEnd, setNoEnd] = useState(initial?.endDate === undefined);
  const [endDate, setEndDate] = useState(
    initial?.endDate ?? shiftIsoDate(startDate, 55),
  );
  const groupName = useId();

  const intervalCount = Number(intervalText);
  const maxInterval = frequency === "daily" ? 365 : 52;
  const intervalValid =
    Number.isInteger(intervalCount) &&
    intervalCount >= 1 &&
    intervalCount <= maxInterval;
  const selected: Preset = !repeats
    ? "none"
    : custom
      ? "custom"
      : matchPreset(frequency, intervalCount, weekdays, startWeekday);
  const dayName = WEEKDAY_NAMES[startWeekday];
  const presets: [Preset, string][] = [
    ...(onRepeatsChange
      ? [["none", "Doesn't repeat"] as [Preset, string]]
      : []),
    ["weekly", `Every ${dayName}`],
    ["fortnightly", `Every other ${dayName}`],
    ["daily", "Every day"],
    ["custom", "Custom"],
  ];

  function changed() {
    onRuleChange?.();
  }

  function choosePreset(preset: Preset) {
    if (preset === "none") {
      onRepeatsChange?.(false);
      changed();
      return;
    }
    if (!repeats) onRepeatsChange?.(true);
    if (preset === "custom") {
      // Opening the builder changes nothing yet.
      setCustom(true);
      if (repeats) return;
    } else {
      setCustom(false);
      setFrequency(preset === "daily" ? "daily" : "weekly");
      setIntervalText(preset === "fortnightly" ? "2" : "1");
      if (preset !== "daily") setWeekdays([startWeekday]);
    }
    changed();
  }

  const preview =
    intervalValid && (frequency === "daily" || weekdays.length > 0)
      ? seriesOccurrenceDates(
          {
            frequency,
            intervalCount,
            ...(frequency === "weekly" ? { weekdays } : {}),
            startDate,
            ...(noEnd || endDate === "" ? {} : { endDate }),
          },
          startDate,
          noEnd || endDate === "" ? shiftIsoDate(startDate, 3700) : endDate,
          PREVIEW_COUNT + 1,
        )
      : [];

  return (
    <fieldset className={styles.picker}>
      <legend>Repeat</legend>
      <div className={styles.presets}>
        {presets.map(([preset, label]) => (
          <label
            key={preset}
            className={styles.chip}
            data-selected={selected === preset}
          >
            <input
              className={styles.hiddenInput}
              type="radio"
              name={groupName}
              checked={selected === preset}
              onChange={() => choosePreset(preset)}
            />
            <span>{label}</span>
          </label>
        ))}
      </div>

      {!repeats ? null : (
        <>
          <input type="hidden" name="frequency" value={frequency} />
          <input type="hidden" name="intervalCount" value={intervalText} />
          {frequency === "weekly"
            ? weekdays.map((day) => (
                <input key={day} type="hidden" name="weekdays" value={day} />
              ))
            : null}
          <input type="hidden" name="noEnd" value={noEnd ? "true" : "false"} />

          {custom ? (
            <div className={styles.builder}>
              <div className={styles.every}>
                <label htmlFor={`${idPrefix}-interval`}>Every</label>
                <div className={styles.stepper}>
                  <button
                    type="button"
                    aria-label="Fewer"
                    disabled={!intervalValid || intervalCount <= 1}
                    onClick={() => {
                      setIntervalText(String(intervalCount - 1));
                      changed();
                    }}
                  >
                    −
                  </button>
                  <input
                    id={`${idPrefix}-interval`}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={maxInterval}
                    required
                    value={intervalText}
                    onChange={(event) => {
                      setIntervalText(event.target.value);
                      changed();
                    }}
                  />
                  <button
                    type="button"
                    aria-label="More"
                    disabled={intervalValid && intervalCount >= maxInterval}
                    onClick={() => {
                      setIntervalText(
                        String(intervalValid ? intervalCount + 1 : 1),
                      );
                      changed();
                    }}
                  >
                    +
                  </button>
                </div>
                <div
                  className={styles.segmented}
                  role="radiogroup"
                  aria-label="Unit"
                >
                  {(["daily", "weekly"] as const).map((unit) => (
                    <label key={unit} data-selected={frequency === unit}>
                      <input
                        className={styles.hiddenInput}
                        type="radio"
                        name={`${groupName}-unit`}
                        checked={frequency === unit}
                        onChange={() => {
                          setFrequency(unit);
                          changed();
                        }}
                      />
                      <span>
                        {unit === "daily"
                          ? intervalCount === 1
                            ? "day"
                            : "days"
                          : intervalCount === 1
                            ? "week"
                            : "weeks"}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {frequency === "weekly" ? (
                <fieldset className={styles.days}>
                  <legend>On</legend>
                  {WEEKDAYS.map(([value, name]) => (
                    <label
                      key={value}
                      className={styles.day}
                      data-selected={weekdays.includes(value)}
                    >
                      <input
                        className={styles.hiddenInput}
                        type="checkbox"
                        checked={weekdays.includes(value)}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setWeekdays((current) =>
                            checked
                              ? [...current, value]
                              : current.filter((day) => day !== value),
                          );
                          changed();
                        }}
                      />
                      <span className={styles.srOnly}>{name}</span>
                      <span aria-hidden="true">{name[0]}</span>
                    </label>
                  ))}
                </fieldset>
              ) : null}
            </div>
          ) : null}

          <fieldset className={styles.ends}>
            <legend>Ends</legend>
            <div className={styles.segmented}>
              {(
                [
                  [true, "Never"],
                  [false, "On a date"],
                ] as const
              ).map(([value, label]) => (
                <label key={label} data-selected={noEnd === value}>
                  <input
                    className={styles.hiddenInput}
                    type="radio"
                    name={`${groupName}-ends`}
                    checked={noEnd === value}
                    onChange={() => {
                      setNoEnd(value);
                      changed();
                    }}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            {noEnd ? null : (
              <DateField
                initial={endDate}
                label="End date"
                min={startDate}
                name="endDate"
                required
                onChange={(date) => {
                  setEndDate(date);
                  changed();
                }}
              />
            )}
          </fieldset>

          <div className={styles.summary} aria-live="polite">
            <p className={styles.sentence}>
              {summarize(frequency, intervalText, intervalValid, weekdays)}
            </p>
            {preview.length > 0 ? (
              <>
                <ol className={styles.dates} aria-label="Next sessions">
                  {preview.slice(0, PREVIEW_COUNT).map((date) => (
                    <li key={date}>{shortDate(date)}</li>
                  ))}
                  {preview.length > PREVIEW_COUNT ? (
                    <li aria-hidden="true" className={styles.more}>
                      …
                    </li>
                  ) : null}
                </ol>
                <p className={styles.hint}>
                  {noEnd
                    ? "No end date: FitTip writes the next thirteen weeks and extends them on later Plan visits."
                    : `Last one on or before ${shortDate(endDate)}.`}{" "}
                  A day that already holds ten sessions is skipped and named
                  after saving.
                </p>
              </>
            ) : intervalValid &&
              (frequency === "daily" || weekdays.length > 0) ? (
              <p className={styles.problem}>
                No session falls before the end date. Move the end date or
                choose other days.
              </p>
            ) : null}
          </div>
        </>
      )}
    </fieldset>
  );
}

/**
 * What stops the rule these fields sent from being saved, or null when
 * nothing does. A form checks it before its action, which refuses the same
 * rule but empties the form doing so.
 */
export function recurrenceProblem(
  values: FormData,
  startDate: string,
): string | null {
  const frequency = values.get("frequency");
  const intervalCount = Number(values.get("intervalCount"));
  const noEnd = values.get("noEnd") === "true";
  const selectedEnd = noEnd ? undefined : values.get("endDate");
  const weekdays = values
    .getAll("weekdays")
    .map(Number)
    .filter(Number.isInteger);
  if (
    (frequency !== "daily" && frequency !== "weekly") ||
    (selectedEnd !== undefined && typeof selectedEnd !== "string") ||
    !Number.isInteger(intervalCount) ||
    intervalCount < 1
  ) {
    return "Check how often it repeats.";
  }
  if (frequency === "weekly" && weekdays.length === 0) {
    return "Choose at least one day.";
  }
  const first = seriesOccurrenceDates(
    {
      frequency,
      intervalCount,
      ...(frequency === "weekly" ? { weekdays } : {}),
      startDate,
      ...(selectedEnd === undefined ? {} : { endDate: selectedEnd }),
    },
    startDate,
    selectedEnd ?? shiftIsoDate(startDate, 3700),
    1,
  );
  return first.length === 0
    ? "No session falls before the end date. Move the end date or choose other days."
    : null;
}

function matchPreset(
  frequency: "daily" | "weekly",
  intervalCount: number,
  weekdays: number[],
  startWeekday: number,
): Preset {
  if (frequency === "daily") return intervalCount === 1 ? "daily" : "custom";
  if (weekdays.length !== 1 || weekdays[0] !== startWeekday) return "custom";
  if (intervalCount === 1) return "weekly";
  if (intervalCount === 2) return "fortnightly";
  return "custom";
}

function summarize(
  frequency: "daily" | "weekly",
  interval: string,
  intervalValid: boolean,
  weekdays: number[],
) {
  if (!intervalValid) return "Choose how often it repeats.";
  const count = Number(interval);
  if (frequency === "daily") {
    return count === 1 ? "Every day" : `Every ${count} days`;
  }
  if (weekdays.length === 0) return "Choose at least one day.";
  const every =
    count === 1
      ? "Every week"
      : count === 2
        ? "Every other week"
        : `Every ${count} weeks`;
  const names = WEEKDAYS.filter(([value]) => weekdays.includes(value)).map(
    ([, name]) => name,
  );
  const days =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  return `${every} on ${days}`;
}

function shortDate(isoDate: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T12:00:00.000Z`));
}

function weekday(isoDate: string) {
  return new Date(`${isoDate}T12:00:00.000Z`).getUTCDay();
}
