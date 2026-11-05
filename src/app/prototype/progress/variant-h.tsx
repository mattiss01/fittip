"use client";

/**
 * PROTOTYPE — the owner's direction of 5 Nov 2026: Progress split by sport,
 * showing what was done, as today's page does, but easier to read. No goals,
 * no targets: a month of the record, filtered by sport, a week at a time,
 * each log with what its activities measured.
 */

import { useState } from "react";

import {
  activities,
  addDays,
  dayDate,
  logs,
  mondayOf,
  shortDate,
  signalWords,
  SPORT_COLOURS,
  sportsByUse,
  STATUS_LABELS,
  TODAY,
  describeMeasurement,
  type Log,
} from "./model";
import styles from "./progress-prototype.module.css";
import { Frame, StatusMark } from "./shared";
import { hours } from "./variants";

const MONTH = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function shiftMonth(month: string, by: number) {
  const date = new Date(`${month}-01T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + by);
  return date.toISOString().slice(0, 7);
}

function colour(sport: string) {
  return SPORT_COLOURS[sport] ?? "var(--moss)";
}

/** Training is anything logged except a skip. */
const trained = (log: Log) => log.outcome !== "skipped";

export function VariantH() {
  const current = TODAY.slice(0, 7);
  const [month, setMonth] = useState(current);
  const [sport, setSport] = useState<string | null>(null);

  const inMonth = logs.filter((log) => log.date.startsWith(month));
  const shown = inMonth.filter((log) => sport === null || log.sport === sport);
  const done = shown.filter(trained);
  const minutes = done.reduce((sum, log) => sum + (log.minutes ?? 0), 0);
  const withoutMinutes = done.filter((log) => log.minutes === null).length;
  const outcomes = (
    [
      "completed",
      "partially_completed",
      "replaced",
      "unplanned",
      "skipped",
    ] as const
  )
    .map((outcome) => ({
      outcome,
      count: shown.filter((log) => log.outcome === outcome).length,
    }))
    .filter(({ count }) => count > 0);

  // Most recent week first, the logs inside each week most recent first.
  const weeks = new Map<string, Log[]>();
  for (const log of [...shown].reverse()) {
    const start = mondayOf(log.date);
    weeks.set(start, [...(weeks.get(start) ?? []), log]);
  }

  return (
    <Frame>
      <div className={styles.sportChips} role="tablist">
        {[null, ...sportsByUse].map((s) => (
          <button
            key={s ?? "all"}
            type="button"
            role="tab"
            aria-selected={sport === s}
            className={styles.sportChip}
            style={s ? { ["--sport" as string]: colour(s) } : undefined}
            onClick={() => setSport(s)}
          >
            {s ? <i /> : null}
            {s ?? "All"}
          </button>
        ))}
      </div>

      <header className={styles.weekPicker}>
        <button
          type="button"
          onClick={() => setMonth(shiftMonth(month, -1))}
          aria-label="Previous month"
        >
          ‹
        </button>
        <h2>{MONTH.format(Date.parse(`${month}-01T00:00:00.000Z`))}</h2>
        <button
          type="button"
          onClick={() => setMonth(shiftMonth(month, 1))}
          disabled={month >= current}
          aria-label="Next month"
        >
          ›
        </button>
      </header>

      <section
        className={styles.monthSummary}
        style={sport ? { ["--sport" as string]: colour(sport) } : undefined}
        data-sport={sport ?? undefined}
      >
        <p className={styles.monthSummaryLine}>
          <strong>
            {done.length} session{done.length === 1 ? "" : "s"}
          </strong>
          {minutes > 0 ? <span> · {hours(minutes)}</span> : null}
        </p>
        {withoutMinutes > 0 ? (
          <p className={styles.muted}>
            {withoutMinutes} without a duration, not in the time.
          </p>
        ) : null}
        {sport === null && done.length > 0 ? (
          <>
            <div className={styles.split}>
              {sportsByUse.map((s) => {
                const count = done.filter((log) => log.sport === s).length;
                return count === 0 ? null : (
                  <button
                    key={s}
                    type="button"
                    className={styles.splitSegment}
                    style={{ flexGrow: count, background: colour(s) }}
                    onClick={() => setSport(s)}
                    aria-label={`${s}: ${count} sessions`}
                  />
                );
              })}
            </div>
            <ul className={styles.splitLegend}>
              {sportsByUse.map((s) => {
                const count = done.filter((log) => log.sport === s).length;
                return count === 0 ? null : (
                  <li key={s}>
                    <i style={{ background: colour(s) }} />
                    {s} {count}
                  </li>
                );
              })}
            </ul>
          </>
        ) : null}
        {outcomes.length > 0 ? (
          <ul className={styles.outcomeCounts}>
            {outcomes.map(({ outcome, count }) => (
              <li key={outcome}>
                <StatusMark status={outcome} size={12} />
                {count} {STATUS_LABELS[outcome].toLowerCase()}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {weeks.size === 0 ? (
        <section className={styles.section}>
          <p className={styles.muted}>
            {sport
              ? `No ${sport} was logged in ${MONTH.format(Date.parse(`${month}-01T00:00:00.000Z`))}.`
              : "Nothing was logged this month."}
          </p>
        </section>
      ) : (
        [...weeks.entries()].map(([start, weekLogs]) => {
          const weekDone = weekLogs.filter(trained);
          const weekMinutes = weekDone.reduce(
            (sum, log) => sum + (log.minutes ?? 0),
            0,
          );
          return (
            <section key={start} className={styles.recordWeek}>
              <header className={styles.recordWeekHead}>
                <h3>
                  {start === mondayOf(TODAY)
                    ? "This week"
                    : `${shortDate(start)} – ${shortDate(addDays(start, 6))}`}
                </h3>
                <span>
                  {weekDone.length} done
                  {weekMinutes > 0 ? ` · ${hours(weekMinutes)}` : ""}
                </span>
              </header>
              <ol className={styles.recordList}>
                {weekLogs.map((log) => (
                  <RecordCard key={log.date + log.title} log={log} />
                ))}
              </ol>
            </section>
          );
        })
      )}
    </Frame>
  );
}

function RecordCard({ log }: { log: Log }) {
  const [open, setOpen] = useState(false);
  const measured = activities.filter(
    (a) => a.date === log.date && a.sport === log.sport,
  );
  const signals = signalWords(log);
  const facts = [
    log.start ? log.start : null,
    log.minutes ? `${log.minutes} min` : null,
    log.effort ? `effort ${log.effort}/10` : null,
  ].filter(Boolean);

  return (
    <li
      className={styles.recordCard}
      style={{ ["--sport" as string]: colour(log.sport) }}
      data-outcome={log.outcome}
    >
      <button
        type="button"
        className={styles.recordCardButton}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className={styles.recordDay}>
          <strong>{dayDate(log.date).split(" ")[1]}</strong>
          <small>{dayDate(log.date).split(" ")[0]}</small>
        </span>
        <span className={styles.recordMain}>
          <span className={styles.recordTitle}>
            <strong>{log.title}</strong>
            <span className={styles.weekListStatus} data-status={log.outcome}>
              {STATUS_LABELS[log.outcome]}
            </span>
          </span>
          <small className={styles.recordFacts}>
            {log.sport}
            {facts.length > 0 ? ` · ${facts.join(" · ")}` : ""}
          </small>
          {measured.length > 0 && !open ? (
            <small className={styles.recordPeek}>
              {measured
                .filter((a) => !["Einlaufen", "Auslaufen"].includes(a.name))
                .slice(0, 2)
                .map((a) => `${a.name} ${describeMeasurement(a) ?? ""}`)
                .join(" · ")}
              {measured.length > 2 ? " …" : ""}
            </small>
          ) : null}
          {signals.length > 0 ? (
            <small className={styles.recordSignal}>
              You reported: {signals.join(", ")}.
            </small>
          ) : null}
        </span>
      </button>
      {open ? (
        <div className={styles.recordDetail}>
          {measured.length > 0 ? (
            <ul>
              {measured.map((a) => (
                <li key={a.name}>
                  <span>{a.name}</span>
                  <span>{describeMeasurement(a)}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {log.instead ? <p>Instead: {log.instead}</p> : null}
          {log.note ? <p className={styles.recordNote}>“{log.note}”</p> : null}
          <span className={styles.linkButton}>Open the full record ›</span>
        </div>
      ) : null}
    </li>
  );
}
