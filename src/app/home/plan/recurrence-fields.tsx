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

/** How many coming dates the summary lists under its sentence. */
const PREVIEW_COUNT = 4;

/** How far an open-ended rule is searched for its first dates. */
const OPEN_SEARCH_DAYS = 3700;

export type RecurrenceFieldsValue = {
  frequency: "daily" | "weekly";
  intervalCount: number;
  weekdays?: number[];
  endDate?: string;
};

/** The rule as the controls hold it: the interval as typed, the end apart. */
type Draft = {
  frequency: "daily" | "weekly";
  intervalText: string;
  weekdays: number[];
  noEnd: boolean;
  endDate: string;
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
 * repeating is optional; without it the rule always repeats. `onRuleChange`
 * is told at each change whether the rule now differs from `initial`.
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
  onRuleChange?: (differsFromInitial: boolean) => void;
}) {
  const startWeekday = weekday(startDate);
  const [opening] = useState<Draft>(() => ({
    frequency: initial?.frequency ?? "weekly",
    intervalText: String(initial?.intervalCount ?? 1),
    weekdays:
      initial?.weekdays && initial.weekdays.length > 0
        ? initial.weekdays
        : [startWeekday],
    noEnd: initial?.endDate === undefined,
    // Eight weeks on, a block's length, when "On a date" is first chosen.
    endDate: initial?.endDate ?? shiftIsoDate(startDate, 55),
  }));
  const [draft, setDraft] = useState(opening);
  const [custom, setCustom] = useState(
    initial !== undefined && matchPreset(opening, startWeekday) === "custom",
  );
  const groupName = useId();

  const { frequency, intervalText, weekdays, noEnd, endDate } = draft;
  const intervalCount = Number(intervalText);
  const maxInterval = frequency === "daily" ? 365 : 52;
  const selected: Preset = !repeats
    ? "none"
    : custom
      ? "custom"
      : matchPreset(draft, startWeekday);
  const dayName = weekdayName(startWeekday);
  const presets: [Preset, string][] = [
    ...(onRepeatsChange
      ? [["none", "Doesn't repeat"] as [Preset, string]]
      : []),
    ["weekly", `Every ${dayName}`],
    ["fortnightly", `Every other ${dayName}`],
    ["daily", "Every day"],
    ["custom", "Custom"],
  ];

  function update(next: Partial<Draft>) {
    const merged = { ...draft, ...next };
    setDraft(merged);
    onRuleChange?.(!sameRule(merged, opening));
  }

  function choosePreset(preset: Preset) {
    if (preset === "none") {
      onRepeatsChange?.(false);
      onRuleChange?.(true);
      return;
    }
    if (!repeats) onRepeatsChange?.(true);
    if (preset === "custom") {
      // Opening the builder changes nothing by itself.
      setCustom(true);
      if (!repeats) onRuleChange?.(true);
      return;
    }
    setCustom(false);
    update({
      frequency: preset === "daily" ? "daily" : "weekly",
      intervalText: preset === "fortnightly" ? "2" : "1",
      ...(preset === "daily" ? {} : { weekdays: [startWeekday] }),
    });
  }

  const checked = checkRule(draft, startDate, PREVIEW_COUNT + 1);

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
                    aria-label="Repeat more often"
                    disabled={
                      !Number.isInteger(intervalCount) || intervalCount <= 1
                    }
                    onClick={() =>
                      update({ intervalText: String(intervalCount - 1) })
                    }
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
                    onChange={(event) =>
                      update({ intervalText: event.target.value })
                    }
                  />
                  <button
                    type="button"
                    aria-label="Repeat less often"
                    disabled={
                      Number.isInteger(intervalCount) &&
                      intervalCount >= maxInterval
                    }
                    onClick={() =>
                      update({
                        intervalText: String(
                          Number.isInteger(intervalCount) && intervalCount >= 1
                            ? intervalCount + 1
                            : 1,
                        ),
                      })
                    }
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
                        onChange={() => update({ frequency: unit })}
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
                        onChange={(event) =>
                          update({
                            weekdays: event.target.checked
                              ? [...weekdays, value]
                              : weekdays.filter((day) => day !== value),
                          })
                        }
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
                    onChange={() => update({ noEnd: value })}
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
                onChange={(date) => update({ endDate: date })}
              />
            )}
          </fieldset>

          <div className={styles.summary}>
            <div aria-live="polite">
              <p className={styles.sentence}>{summarize(draft)}</p>
              {checked.problem !== null ? (
                <p className={styles.problem}>{checked.problem}</p>
              ) : (
                <ol className={styles.dates} aria-label="Next sessions">
                  {checked.dates.slice(0, PREVIEW_COUNT).map((date) => (
                    <li key={date}>{shortDate(date)}</li>
                  ))}
                  {checked.dates.length > PREVIEW_COUNT ? (
                    <li aria-hidden="true" className={styles.more}>
                      …
                    </li>
                  ) : null}
                </ol>
              )}
            </div>
            {checked.problem !== null ? null : (
              <p className={styles.hint}>
                {noEnd
                  ? "No end date: FitTip writes the next thirteen weeks and extends them on later Plan visits."
                  : `Last one on or before ${shortDate(endDate)}.`}{" "}
                A day that already holds ten sessions is skipped and named after
                saving.
              </p>
            )}
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
  const endDate = values.get("endDate");
  if (frequency !== "daily" && frequency !== "weekly") {
    return "Check how often it repeats.";
  }
  return checkRule(
    {
      frequency,
      intervalText: String(values.get("intervalCount") ?? ""),
      weekdays: values.getAll("weekdays").map(Number),
      noEnd: values.get("noEnd") === "true",
      endDate: typeof endDate === "string" ? endDate : "",
    },
    startDate,
    1,
  ).problem;
}

/** A saved rule in one line, as a recurring session's repeat row shows it. */
export function describeRule(value: RecurrenceFieldsValue) {
  const sentence = summarize({
    frequency: value.frequency,
    intervalText: String(value.intervalCount),
    weekdays: value.weekdays ?? [],
    noEnd: value.endDate === undefined,
    endDate: value.endDate ?? "",
  });
  return value.endDate === undefined
    ? sentence
    : `${sentence}, until ${shortDate(value.endDate)}`;
}

/**
 * Adds a saved rule to a submission under the names these fields use, for a
 * save that keeps the repeat as it is.
 */
export function appendRule(formData: FormData, value: RecurrenceFieldsValue) {
  formData.set("frequency", value.frequency);
  formData.set("intervalCount", String(value.intervalCount));
  if (value.frequency === "weekly") {
    for (const day of value.weekdays ?? []) {
      formData.append("weekdays", String(day));
    }
  }
  formData.set("noEnd", value.endDate === undefined ? "true" : "false");
  if (value.endDate !== undefined) formData.set("endDate", value.endDate);
}

/** The rule's first dates, or why it has none, read the same for preview and save. */
function checkRule(
  draft: Draft,
  startDate: string,
  limit: number,
): { dates: string[]; problem: string | null } {
  const intervalCount = Number(draft.intervalText);
  const maxInterval = draft.frequency === "daily" ? 365 : 52;
  if (
    !Number.isInteger(intervalCount) ||
    intervalCount < 1 ||
    intervalCount > maxInterval
  ) {
    return {
      dates: [],
      problem: `Choose every 1 to ${maxInterval} ${draft.frequency === "daily" ? "days" : "weeks"}.`,
    };
  }
  if (draft.frequency === "weekly" && draft.weekdays.length === 0) {
    return { dates: [], problem: "Choose at least one day." };
  }
  if (!draft.noEnd && draft.endDate === "") {
    return { dates: [], problem: "Choose the end date." };
  }
  const dates = seriesOccurrenceDates(
    {
      frequency: draft.frequency,
      intervalCount,
      ...(draft.frequency === "weekly" ? { weekdays: draft.weekdays } : {}),
      startDate,
      ...(draft.noEnd ? {} : { endDate: draft.endDate }),
    },
    startDate,
    draft.noEnd ? shiftIsoDate(startDate, OPEN_SEARCH_DAYS) : draft.endDate,
    limit,
  );
  return dates.length === 0
    ? {
        dates,
        problem:
          "No session falls before the end date. Move the end date or choose other days.",
      }
    : { dates, problem: null };
}

function sameRule(left: Draft, right: Draft) {
  return (
    left.frequency === right.frequency &&
    left.intervalText === right.intervalText &&
    left.noEnd === right.noEnd &&
    (left.noEnd || left.endDate === right.endDate) &&
    (left.frequency === "daily" ||
      left.weekdays.toSorted().join() === right.weekdays.toSorted().join())
  );
}

function matchPreset(draft: Draft, startWeekday: number): Preset {
  const count = Number(draft.intervalText);
  if (draft.frequency === "daily") return count === 1 ? "daily" : "custom";
  if (draft.weekdays.length !== 1 || draft.weekdays[0] !== startWeekday) {
    return "custom";
  }
  if (count === 1) return "weekly";
  if (count === 2) return "fortnightly";
  return "custom";
}

function summarize(draft: Draft) {
  const count = Number(draft.intervalText);
  if (!Number.isInteger(count) || count < 1) {
    return "Choose how often it repeats.";
  }
  if (draft.frequency === "daily") {
    return count === 1 ? "Every day" : `Every ${count} days`;
  }
  const every =
    count === 1
      ? "Every week"
      : count === 2
        ? "Every other week"
        : `Every ${count} weeks`;
  const names = WEEKDAYS.filter(([value]) =>
    draft.weekdays.includes(value),
  ).map(([, name]) => name);
  if (names.length === 0) return every;
  const days =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  return `${every} on ${days}`;
}

/** A date as the repeat picker and its scope choice write it: "Fri 6 Nov". */
export function shortDate(isoDate: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T12:00:00.000Z`));
}

function weekdayName(day: number) {
  return WEEKDAYS.find(([value]) => value === day)![1];
}

function weekday(isoDate: string) {
  return new Date(`${isoDate}T12:00:00.000Z`).getUTCDay();
}
