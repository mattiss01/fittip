"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import styles from "./date-field.module.css";

const DATE_PARTS = {
  day: { label: "Day", hint: "DD", length: 2 },
  month: { label: "Month", hint: "MM", length: 2 },
  year: { label: "Year", hint: "YYYY", length: 4 },
} as const;
type DatePart = keyof typeof DATE_PARTS;
type DateOrder = readonly [DatePart, DatePart, DatePart];

const DAY_FIRST: DateOrder = ["day", "month", "year"];
const MONTH_FIRST: DateOrder = ["month", "day", "year"];
const YEAR_FIRST: DateOrder = ["year", "month", "day"];

/**
 * A date typed on the keyboard (owner, 5 Oct 2026): day, month and year in
 * three short fields, in the order the owner's language writes them, each
 * moving on to the next when it is full. With `calendar` there is a button
 * beside them that opens the device's own date picker as well, so a date can
 * be given either way; a birthday goes without it, since a calendar is a poor
 * way to reach a year decades back.
 *
 * It is sent under `name` as one `YYYY-MM-DD` date, or empty when nothing is
 * typed. A date half typed, or one the calendar does not have, stops the form
 * in the browser with a sentence saying so; `required` does the same for one
 * left empty. Whether the date is allowed is still checked where it is saved,
 * unless the form gives `rangeMessage`: then a date outside `min` and `max`
 * is stopped in the browser too, with that sentence.
 *
 * A form that shows something of its own for the date takes `onChange`, which
 * is handed the date once it is one the form may use, and "" while it is not.
 */
export function DateField({
  name,
  label,
  initial,
  hideLabel = false,
  centred = false,
  calendar = false,
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
  calendar?: boolean;
  required?: boolean;
  /**
   * Sent as typed, with no check in the browser: for a form that must be
   * able to leave with a date half typed, as setup's "Continue later" does,
   * or that keeps this field out of sight on another question.
   */
  unchecked?: boolean;
  /** Shown and sent, not changed: the three fields are fixed, with no calendar. */
  readOnly?: boolean;
  /** Limits of the calendar; what is typed is checked where it is saved. */
  min?: string;
  max?: string;
  /** What to say of a typed date outside `min` and `max`, to stop it here. */
  rangeMessage?: string;
  /** The form's own label style, where its labels are not the app's capitals. */
  labelClassName?: string;
  /** The id of a hint under the field. */
  describedBy?: string;
  onChange?: (date: string) => void;
}) {
  const labelId = useId();
  const order = useSyncExternalStore(
    subscribeNothing,
    readDateOrder,
    () => DAY_FIRST,
  );
  const [parts, setParts] = useState(() => splitDate(initial));
  const fields = useRef<Partial<Record<DatePart, HTMLInputElement | null>>>({});
  const picker = useRef<HTMLInputElement>(null);
  const date = joinDate(parts);
  const outOfRange = (value: string) =>
    rangeMessage !== undefined &&
    ((min !== undefined && value < min) || (max !== undefined && value > max));
  const problem = unchecked
    ? ""
    : date === ""
      ? required
        ? "Enter a date."
        : ""
      : !isCalendarDate(date)
        ? "Enter a full date: day, month and year."
        : outOfRange(date)
          ? (rangeMessage ?? "")
          : "";
  const change = (next: Record<DatePart, string>) => {
    setParts(next);
    const value = joinDate(next);
    onChange?.(isCalendarDate(value) && !outOfRange(value) ? value : "");
  };
  // On the first of the three, which is where the browser then points.
  // Taken off again when the order changes, or it would stay on a field
  // that is no longer first and block the form for good.
  useEffect(() => {
    const first = fields.current[order[0]];
    first?.setCustomValidity(problem);
    return () => first?.setCustomValidity("");
  }, [order, problem]);

  return (
    <div
      aria-describedby={describedBy}
      aria-labelledby={labelId}
      className={styles.group}
      role="group"
    >
      <span
        className={hideLabel ? styles.srOnly : (labelClassName ?? styles.label)}
        id={labelId}
      >
        {label}
      </span>
      <div className={styles.parts} data-centred={centred ? "true" : undefined}>
        {order.map((part, position) => (
          <input
            aria-label={DATE_PARTS[part].label}
            className={styles.part}
            data-part={part}
            inputMode="numeric"
            key={part}
            maxLength={DATE_PARTS[part].length}
            onChange={(event) => {
              const digits = event.target.value.replace(/\D/g, "");
              change({ ...parts, [part]: digits });
              const next = order[position + 1];
              if (next && digits.length === DATE_PARTS[part].length) {
                fields.current[next]?.focus();
              }
            }}
            placeholder={DATE_PARTS[part].hint}
            readOnly={readOnly}
            ref={(field) => {
              fields.current[part] = field;
            }}
            value={parts[part]}
          />
        ))}
        {calendar && !readOnly ? (
          <>
            <button
              aria-label={`Pick ${label.toLowerCase()} from a calendar`}
              className={styles.calendar}
              onClick={() => {
                const field = picker.current;
                if (!field) return;
                // Older browsers open the picker when the field is clicked.
                if (typeof field.showPicker === "function") field.showPicker();
                else field.click();
              }}
              type="button"
            >
              <CalendarIcon />
            </button>
            {/* The device's own picker, opened by the button. It has no name:
                what it picks is written into the three fields. */}
            <input
              aria-hidden="true"
              className={styles.native}
              max={max}
              min={min}
              onChange={(event) => change(splitDate(event.target.value))}
              ref={picker}
              tabIndex={-1}
              type="date"
              value={isCalendarDate(date) ? date : ""}
            />
          </>
        ) : null}
      </div>
      {name === undefined ? null : (
        <input name={name} type="hidden" value={date} />
      )}
    </div>
  );
}

/** A day the calendar has: 2026-02-30 is the right shape and is not one. */
function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const day = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(day.getTime()) && day.toISOString().startsWith(value);
}

/** The three fields as one date, or nothing when all three are empty. */
function joinDate(parts: Record<DatePart, string>): string {
  if (!parts.day && !parts.month && !parts.year) return "";
  return `${parts.year}-${parts.month.padStart(2, "0")}-${parts.day.padStart(2, "0")}`;
}

function splitDate(value: string | null): Record<DatePart, string> {
  const [year = "", month = "", day = ""] = (value ?? "").split("-");
  return { day, month, year };
}

function subscribeNothing() {
  return () => {};
}

/**
 * The order the browser's language writes a date in. One of three fixed
 * arrays, because a store's snapshot must be the same value every time.
 */
function readDateOrder(): DateOrder {
  try {
    const order = new Intl.DateTimeFormat(navigator.language)
      .formatToParts(new Date(2000, 11, 31))
      .map((part) => part.type)
      .filter((type) => type in DATE_PARTS);
    if (order[0] === "month") return MONTH_FIRST;
    if (order[0] === "year") return YEAR_FIRST;
  } catch {
    // Day first, below.
  }
  return DAY_FIRST;
}

function CalendarIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="20"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.9"
      viewBox="0 0 24 24"
      width="20"
    >
      <rect height="16" rx="2.5" width="18" x="3" y="5" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}
