"use client";

import { useState } from "react";

import styles from "./activity-editor.module.css";

import { describeMeasurement } from "@/lib/training/describe-measurement";
import { ACTIVITY_COPY } from "@/lib/training/measurement-copy";

type LibraryOption = {
  id: string;
  name: string;
  sport: string;
  target: Parameters<typeof describeMeasurement>[0];
};

/**
 * "Add activity from library": the owner's activities, with a field that
 * narrows them by name or sport as it is typed (owner, 19 Oct 2026: a
 * library may grow long). The session editor and the log form both open it.
 */
export function LibraryPicker<Option extends LibraryOption>({
  id,
  options,
  onPick,
}: {
  /** The picker's id, which the opening button controls. */
  id: string;
  options: readonly Option[];
  onPick: (option: Option) => void;
}) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLocaleLowerCase();
  const shown =
    needle === ""
      ? options
      : options.filter((option) =>
          `${option.name} ${option.sport}`.toLocaleLowerCase().includes(needle),
        );

  return (
    <div className={styles.pickerWrap} id={id}>
      {/* Not focused on opening: on a phone the keyboard would cover the
          list the owner may only want to scroll. */}
      <input
        className={styles.pickerSearch}
        type="search"
        aria-label={ACTIVITY_COPY.librarySearchLabel}
        placeholder={ACTIVITY_COPY.librarySearchLabel}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {shown.length === 0 ? (
        <p className={styles.empty} role="status">
          {ACTIVITY_COPY.libraryNoMatch}
        </p>
      ) : (
        <ul className={styles.picker} aria-label={ACTIVITY_COPY.libraryLabel}>
          {shown.map((option) => (
            <li key={option.id}>
              <button
                className={styles.pick}
                type="button"
                onClick={() => onPick(option)}
              >
                <span className={styles.summaryName}>{option.name}</span>
                <span className={styles.summaryTarget}>
                  {describeMeasurement(option.target) ?? option.sport}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
