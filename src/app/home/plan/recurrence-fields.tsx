"use client";

import { useState } from "react";

import styles from "./plan.module.css";

const WEEKDAYS = [
  [1, "Mon"],
  [2, "Tue"],
  [3, "Wed"],
  [4, "Thu"],
  [5, "Fri"],
  [6, "Sat"],
  [0, "Sun"],
] as const;

export type RecurrenceFieldsValue = {
  frequency: "daily" | "weekly";
  intervalCount: number;
  weekdays?: number[];
  endDate?: string;
};

export function RecurrenceFields({
  idPrefix,
  startDate,
  initial,
  onRuleChange,
}: {
  idPrefix: string;
  startDate: string;
  initial?: RecurrenceFieldsValue;
  onRuleChange?: () => void;
}) {
  const [frequency, setFrequency] = useState(initial?.frequency ?? "weekly");
  const [noEnd, setNoEnd] = useState(initial?.endDate === undefined);
  const defaultWeekdays = initial?.weekdays ?? [weekday(startDate)];
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[] | null>(
    null,
  );
  const weekdays = selectedWeekdays ?? defaultWeekdays;

  return (
    <fieldset className={styles.ruleFields} onInput={onRuleChange}>
      <legend>Recurrence</legend>
      <div className={styles.fieldPair}>
        <div className={styles.field}>
          <label htmlFor={`${idPrefix}-frequency`}>Repeat</label>
          <select
            id={`${idPrefix}-frequency`}
            name="frequency"
            value={frequency}
            onChange={(event) => {
              setFrequency(event.target.value as "daily" | "weekly");
              onRuleChange?.();
            }}
          >
            <option value="daily">Every N days</option>
            <option value="weekly">Every N weeks</option>
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor={`${idPrefix}-interval`}>Every</label>
          <div className={styles.inlineValue}>
            <input
              id={`${idPrefix}-interval`}
              name="intervalCount"
              type="number"
              inputMode="numeric"
              min={1}
              max={frequency === "daily" ? 365 : 52}
              required
              defaultValue={initial?.intervalCount ?? 1}
            />
            <span>{frequency === "daily" ? "days" : "weeks"}</span>
          </div>
        </div>
      </div>

      {frequency === "weekly" ? (
        <fieldset className={styles.weekdays}>
          <legend>On</legend>
          {WEEKDAYS.map(([value, label]) => (
            <label key={value}>
              <input
                type="checkbox"
                name="weekdays"
                value={value}
                checked={weekdays.includes(value)}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setSelectedWeekdays((selected) => {
                    const current = selected ?? defaultWeekdays;
                    return checked
                      ? current.includes(value)
                        ? current
                        : [...current, value]
                      : current.filter((weekday) => weekday !== value);
                  });
                }}
              />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>
      ) : null}

      <input type="hidden" name="noEnd" value={noEnd ? "true" : "false"} />
      <label className={styles.checkField}>
        <input
          type="checkbox"
          checked={noEnd}
          onChange={(event) => {
            setNoEnd(event.target.checked);
            onRuleChange?.();
          }}
        />
        <span>No end date</span>
      </label>
      {noEnd ? (
        <p className={styles.fieldHint}>
          Open-ended means the rule continues. FitTip still creates only the
          current fourteen-day Plan window.
        </p>
      ) : (
        <div className={styles.field}>
          <label htmlFor={`${idPrefix}-end`}>End date</label>
          <input
            id={`${idPrefix}-end`}
            name="endDate"
            type="date"
            min={startDate}
            required
            defaultValue={initial?.endDate ?? startDate}
          />
        </div>
      )}
    </fieldset>
  );
}

function weekday(isoDate: string) {
  return new Date(`${isoDate}T12:00:00.000Z`).getUTCDay();
}
