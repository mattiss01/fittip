"use client";

import { useState } from "react";

import { SheetCloseButton, SheetLayer } from "./plan-sheet";
import {
  describeRule,
  RecurrenceFields,
  recurrenceProblem,
  shortDate,
  type RecurrenceFieldsValue,
} from "./recurrence-fields";
import type { PlanSeriesView } from "./recurring-session-controls";
import styles from "./plan.module.css";
import w from "./plan-week.module.css";
import repeatStyles from "./repeat-sheet.module.css";

/** A series' rule as the repeat picker holds it. */
export function ruleOf(series: PlanSeriesView): RecurrenceFieldsValue {
  return {
    frequency: series.frequency,
    intervalCount: series.intervalCount,
    weekdays: series.weekdays,
    ...(series.endDate === null ? {} : { endDate: series.endDate }),
  };
}

/**
 * A recurring session's repeat, read in one line (owner, 5 Nov 2026). With
 * `onOpen` it is the way into the repeat sheet; without, the repeat can no
 * longer change from this date and the row only says what it is. A one-off
 * has no rule and reads "Doesn't repeat" (R2).
 */
export function RepeatRow({
  rule,
  onOpen,
  disabled = false,
}: {
  rule: RecurrenceFieldsValue | null;
  onOpen?: () => void;
  disabled?: boolean;
}) {
  const content =
    rule === null ? (
      <span className={repeatStyles.rowValue}>Doesn&apos;t repeat</span>
    ) : (
      <>
        <span className={repeatStyles.rowLabel}>Repeats</span>{" "}
        <span className={repeatStyles.rowValue}>{describeRule(rule)}</span>
      </>
    );
  return onOpen ? (
    <button
      className={repeatStyles.row}
      type="button"
      onClick={onOpen}
      disabled={disabled}
      data-repeat-row
    >
      {content}
      <span className={repeatStyles.chevron} aria-hidden="true">
        ›
      </span>
    </button>
  ) : (
    <p className={repeatStyles.row} data-repeat-row>
      {content}
    </p>
  );
}

/**
 * The repeat on its own, in a sheet over everything else (owner, 5 Nov 2026):
 * a changed repeat only means something from this session on, so it is saved
 * here, with the place it lands on its button, and never asks "only this
 * session?". Unchanged, the sheet only closes.
 *
 * The sheet is portalled out of any form it is opened from, so it keeps a form
 * of its own and hands the rule to `onSave` under the names the series
 * actions read; the caller adds what else the save sends. `withEdits` is the
 * edit form's sheet, whose save carries the form's other changes too.
 *
 * Without `series` it is a one-off's (R2): the session itself becomes the
 * first of a new series from its own date, so the rule must fall on that date
 * and there is always something to save.
 */
export function RepeatSheet({
  idPrefix,
  series,
  occurrenceDate,
  canEditWhole,
  withEdits = false,
  pending,
  checkBefore,
  onSave,
  onClose,
}: {
  idPrefix: string;
  /** Absent for a one-off, which this sheet makes repeat. */
  series?: PlanSeriesView;
  occurrenceDate: string;
  /** From `seriesEditScope`: the save reaches every session of the series. */
  canEditWhole: boolean;
  withEdits?: boolean;
  pending: boolean;
  /** What stops the save before the rule is read, or null. */
  checkBefore?: () => string | null;
  onSave: (rule: FormData) => void;
  onClose: () => void;
}) {
  const [changed, setChanged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = `${idPrefix}-title`;
  const oneOff = series === undefined;
  const startDate =
    canEditWhole && series !== undefined ? series.startDate : occurrenceDate;
  const from = shortDate(occurrenceDate);
  const lead = withEdits ? "Saves your other changes with it, to" : "Changes";
  const scope = oneOff
    ? `This session becomes the first of the repeat, on ${from}, and stays as it is with anything logged on it. The rest are added to your plan.`
    : canEditWhole
      ? `${lead} every session of the series. Logged training stays as it is.`
      : `${lead} ${from} and every session after it. Earlier sessions and logged training stay as they are.`;
  const saveLabel = oneOff
    ? `Repeat from ${from}`
    : `${withEdits ? "Save all changes" : "Save"} ${
        canEditWhole ? "to the whole series" : `from ${from} on`
      }`;

  return (
    <SheetLayer view="repeat" labelledBy={titleId} onClose={onClose}>
      <header className={w.sheetHead}>
        <span />
        {/* Unchanged, the sheet's own Close below is the only way out. */}
        {changed || oneOff ? (
          <SheetCloseButton className={w.sheetClose}>Cancel</SheetCloseButton>
        ) : null}
      </header>
      <h2 id={titleId}>Repeat</h2>
      <p className={repeatStyles.scope}>{scope}</p>
      <form
        className={repeatStyles.form}
        action={onSave}
        onSubmit={(event) => {
          // Rendered inside the edit form's React tree: its submit is this
          // sheet's alone.
          event.stopPropagation();
          const problem =
            checkBefore?.() ??
            recurrenceProblem(
              new FormData(event.currentTarget),
              startDate,
              oneOff,
            );
          setError(problem);
          if (problem !== null) event.preventDefault();
        }}
      >
        <RecurrenceFields
          idPrefix={idPrefix}
          startDate={startDate}
          initial={series === undefined ? undefined : ruleOf(series)}
          onRuleChange={(differs) => {
            setChanged(differs);
            setError(null);
          }}
        />
        {error === null ? null : (
          <p className={styles.inlineError} role="alert">
            {error}
          </p>
        )}
        {changed || oneOff ? (
          <button className={styles.primary} type="submit" disabled={pending}>
            {saveLabel}
          </button>
        ) : (
          <SheetCloseButton className={styles.action}>Close</SheetCloseButton>
        )}
      </form>
    </SheetLayer>
  );
}
