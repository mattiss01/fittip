"use client";

import { useEffect, useId, useRef, useState } from "react";

import styles from "./date-field.module.css";

/**
 * A date in one field (owner, 13 Oct 2026): the browser's own, typed in the
 * order the owner's language writes a date or picked from the calendar it
 * opens. It was three short fields and a calendar button from 5 Oct 2026.
 *
 * It is sent under `name` as one `YYYY-MM-DD` date, or empty when there is
 * none. `required` stops the form for one left empty, the browser stops it
 * for a date half typed, and a date outside `min` and `max` is stopped in the
 * browser too: with the form's own sentence where it gives `rangeMessage`,
 * otherwise with the browser's. A form that gives no range still gets the
 * years 1900 to 9999, since the field would otherwise take the year 2 on the
 * way to 2026, or six digits. Whether the date is allowed is still checked
 * where it is saved.
 *
 * A form that shows something of its own for the date takes `onChange`. It
 * is told at each change, with the date if it is one the form may use and ""
 * if it is not. That includes dates passed through while typing: on the way
 * to 2026 the field reads the year 0002. A form that acts on the date keeps
 * what it is told and acts when the owner moves on, as the log does.
 */
export function DateField({
  name,
  label,
  initial,
  hideLabel = false,
  centred = false,
  required = false,
  unchecked = false,
  readOnly = false,
  min,
  max,
  rangeMessage,
  labelClassName,
  describedBy,
  onChange,
}: {
  /** Left out by a form that sends the date itself, from `onChange`. */
  name?: string;
  label: string;
  initial: string | null;
  /** The label is kept for a screen reader only: a heading already asks. */
  hideLabel?: boolean;
  centred?: boolean;
  required?: boolean;
  /**
   * Held to nothing in the browser, neither `required` nor the range: for a
   * form that must be able to leave with the date as it stands, as setup's
   * "Continue later" does, or that keeps this field out of sight on another
   * question. The browser would still stop the form for a date half typed,
   * so one is emptied when the field is left; a form that leaves without
   * the field losing focus calls `clearUnfinishedDates` first.
   */
  unchecked?: boolean;
  /** Shown and sent, not changed. */
  readOnly?: boolean;
  /** The first and last day that may be given. */
  min?: string;
  max?: string;
  /** What to say of a date outside `min` and `max`, in the form's words. */
  rangeMessage?: string;
  /** The form's own label style, where its labels are not the app's capitals. */
  labelClassName?: string;
  /** The id of a hint under the field. */
  describedBy?: string;
  onChange?: (date: string) => void;
}) {
  const fieldId = useId();
  const field = useRef<HTMLInputElement>(null);
  const [date, setDate] = useState(initial ?? "");
  const bounded = !unchecked && !readOnly;
  const first = min ?? EARLIEST;
  const last = max ?? LATEST;
  const outOfRange = (value: string) =>
    bounded && value !== "" && (value < first || value > last);
  // The form's sentence is about the range the form gave, so a year like
  // 0002 under a form's `max` is left to the browser's own words.
  const outOfGivenRange =
    bounded &&
    date !== "" &&
    ((min !== undefined && date < min) || (max !== undefined && date > max));
  const problem =
    rangeMessage !== undefined && outOfGivenRange ? rangeMessage : "";
  useEffect(() => {
    const input = field.current;
    input?.setCustomValidity(problem);
    return () => input?.setCustomValidity("");
  }, [problem]);

  return (
    <div className={styles.group} data-centred={centred ? "true" : undefined}>
      <label
        className={hideLabel ? styles.srOnly : (labelClassName ?? styles.label)}
        htmlFor={fieldId}
      >
        {label}
      </label>
      <input
        aria-describedby={describedBy}
        className={styles.date}
        id={fieldId}
        max={bounded ? last : undefined}
        min={bounded ? first : undefined}
        name={name}
        onBlur={
          unchecked
            ? (event) => clearIfUnfinished(event.currentTarget)
            : undefined
        }
        onChange={(event) => {
          // Fixed means fixed, in a browser that opens its picker on a
          // read-only field too.
          if (readOnly) return;
          const value = event.target.value;
          setDate(value);
          onChange?.(outOfRange(value) ? "" : value);
        }}
        readOnly={readOnly}
        ref={field}
        required={required && !unchecked}
        type="date"
        value={date}
      />
    </div>
  );
}

/** The years a date may be in where its form names no range. */
const EARLIEST = "1900-01-01";
const LATEST = "9999-12-31";

/**
 * A date half typed has no value, so what is held for it is already empty;
 * this empties what the field shows as well, which is what the browser
 * would otherwise stop the form for.
 */
function clearIfUnfinished(field: HTMLInputElement) {
  if (field.validity.badInput) field.value = "";
}

/**
 * Empties every half-typed date in a form that is about to leave without
 * asking the browser's leave: a tap on a button does not take focus from a
 * field in every browser, so the field may not have been left.
 */
export function clearUnfinishedDates(form: HTMLFormElement) {
  for (const field of form.querySelectorAll<HTMLInputElement>(
    'input[type="date"]',
  )) {
    clearIfUnfinished(field);
  }
}
