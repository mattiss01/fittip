"use client";

import { useId, useRef, useState, useSyncExternalStore } from "react";

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
 * typed. A date half typed is sent as it stands and refused by the same check
 * as any other date that is not one.
 */
export function DateField({
  name,
  label,
  initial,
  hideLabel = false,
  centred = false,
  calendar = false,
  min,
  max,
}: {
  name: string;
  label: string;
  initial: string | null;
  /** The label is kept for a screen reader only: a heading already asks. */
  hideLabel?: boolean;
  centred?: boolean;
  calendar?: boolean;
  /** Limits of the calendar; what is typed is checked where it is saved. */
  min?: string;
  max?: string;
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
  const empty = !parts.day && !parts.month && !parts.year;
  const date = empty
    ? ""
    : `${parts.year}-${parts.month.padStart(2, "0")}-${parts.day.padStart(2, "0")}`;

  return (
    <div aria-labelledby={labelId} className={styles.group} role="group">
      <span className={hideLabel ? styles.srOnly : styles.label} id={labelId}>
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
              setParts((current) => ({ ...current, [part]: digits }));
              const next = order[position + 1];
              if (next && digits.length === DATE_PARTS[part].length) {
                fields.current[next]?.focus();
              }
            }}
            placeholder={DATE_PARTS[part].hint}
            ref={(field) => {
              fields.current[part] = field;
            }}
            value={parts[part]}
          />
        ))}
        {calendar ? (
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
              onChange={(event) => setParts(splitDate(event.target.value))}
              ref={picker}
              tabIndex={-1}
              type="date"
              value={/^\d{4}-\d{2}-\d{2}$/.test(date) ? date : ""}
            />
          </>
        ) : null}
      </div>
      <input name={name} type="hidden" value={date} />
    </div>
  );
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
